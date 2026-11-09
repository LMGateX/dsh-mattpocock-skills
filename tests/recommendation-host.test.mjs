import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mountedFixture, loadSDK, signal, actualAgent } from './fixtures/runtime-host.mjs'

// Real Cordis, Typert registry/gateway and mounted Host/Runtime; no profile or model.
test('optional recommendation namespace preserves base Remote and rejects unregistered owner without ensuring it', async t => {
  const f = await mountedFixture(t)
  f.agents.set('later', actualAgent('later'))
  const { TypertGatewayService } = await loadSDK('@deepseek-ai/dsh-api-gateway')
  const gateway = new TypertGatewayService(f.ctx, {})
  const invoke = (namespace, method, args) => gateway.invoke({ namespace, method, args, peer: f.peer, signal: signal() })
  const policy = await invoke('mattpocockControls', 'readPolicy', {})
  assert.equal(policy.revision, 0)
  await assert.rejects(invoke('mattpocockRecommendationSupport', 'readOwnerDecisionPolicy', { sessionId: 'later' }), error => error.code === 'unknown-session')
  const again = await invoke('mattpocockControls', 'readPolicy', {})
  assert.equal(again.revision, 0)
})

async function mountedClient(t, ctx, gateway, peer) {
  const { pathToFileURL } = await import('node:url')
  const { join } = await import('node:path')
  const { sdk } = await import('./fixtures/runtime-host.mjs')
  const clientGateway = await import(pathToFileURL(join(process.env.DSH_CONTROLS_HOST_ROOT, 'node_modules/@deepseek-ai/dsh-api-gateway/lib/types/client/index.js')).href)
  const base = await import('../src/controls/remote-contract.ts')
  const recommendation = await import('../src/controls/recommendation-contract.ts')
  const client = new sdk.Context(); new sdk.TypertRegistry(client)
  const wire = []
  client.provide('connection', { isLoopback: true, generation: { getSnapshot: () => undefined, subscribe: () => () => {} }, registerGenerationSource: () => () => {}, start: () => ({ stop() {} }),
    rpc: { open() { throw new Error('no streams') }, async call(channel, endpoint, payload, control) {
      assert.equal(channel, '/api'); wire.push({ endpoint, args: payload.args })
      const [namespace, method] = endpoint.split('/')
      try { return { ok: true, value: await gateway.invoke({ namespace, method, args: payload.args, peer, signal: control }) } }
      catch (error) { return { ok: false, error: { code: error.code ?? 'unknown', message: error.message } } }
    } } })
  clientGateway.apply(client)
  t.after(await client.remote.$mount(base.REMOTE_CONTRIBUTION))
  t.after(await client.remote.$mount(recommendation.RECOMMENDATION_REMOTE_CONTRIBUTION))
  return { client, wire }
}

test('actual Client mounts both namespaces with independent registry identity, authenticated read/save and cancellation channel', async t => {
  const f = await mountedFixture(t)
  const { TypertGatewayService } = await loadSDK('@deepseek-ai/dsh-api-gateway')
  const gateway = new TypertGatewayService(f.ctx, {})
  const { client, wire } = await mountedClient(t, f.ctx, gateway, f.peer)
  assert.equal((await client.remote.mattpocockControls.readPolicy()).ok, true)
  const result = await client.remote.mattpocockRecommendationSupport.readOwnerDecisionPolicy('root', signal())
  assert.equal(result.ok, true)
  assert.equal(result.value.effective.status, 'feature-disabled')
  assert.deepEqual(Object.keys(wire.at(-1).args), ['sessionId'])
  const disabled = await client.remote.mattpocockRecommendationSupport.saveOwnerDecisionPolicy('root', { operationId: 'disable', expectedRevision: 0, expectedScope: result.value.instance, action: 'disable' })
  assert.equal(disabled.ok, true)
  assert.equal(disabled.value.snapshot.saved.enabled, false)
  assert.equal(disabled.value.snapshot.revision, 1)
  assert.deepEqual(disabled.value.operation.action, 'disable')
  assert.equal((await client.remote.mattpocockControls.readPolicy()).ok, true)
  // Caller/source authority fields are rejected by the strict wire codec.
  const forged = await client.remote.mattpocockRecommendationSupport.saveOwnerDecisionPolicy('root', { operationId: 'forged', expectedRevision: 1, expectedScope: result.value.instance, action: 'disable', author: { kind: 'user' } })
  assert.equal(forged.ok, false)
})

test('new Client on a real old-only base server preserves base mount and honestly reports optional endpoint unavailable', async t => {
  const f = await mountedFixture(t)
  const { sdk } = await import('./fixtures/runtime-host.mjs')
  const host = await import('../src/host.ts')
  const { TypertGatewayService } = await loadSDK('@deepseek-ai/dsh-api-gateway')
  const old = new sdk.Context(); new sdk.TypertRegistry(old)
  old.provide('connection', { operator: f.peer })
  new host.MattPocockControlsService(old, f.runtime, f.mounted.ports, undefined, undefined, { signal: signal(), track: work => work() })
  t.after(old.typert.register(host.hostRemoteContribution()))
  const gateway = new TypertGatewayService(old, {})
  const { client } = await mountedClient(t, old, gateway, f.peer)
  const baseRead = await client.remote.mattpocockControls.readPolicy()
  assert.equal(baseRead.ok, true, baseRead.error?.message)
  const unsupported = await client.remote.mattpocockRecommendationSupport.readOwnerDecisionPolicy('root', signal())
  assert.equal(unsupported.ok, false)
  assert.equal(unsupported.error.code, 'gateway/invocation-unavailable')
  assert.equal((await client.remote.mattpocockControls.readPolicy()).ok, true)
})

test('optional namespace registration failure does not abort base services tools or genuine stored record reads', async t => {
  const f = await mountedFixture(t, { async configureBeforeMount({ ctx }) {
    const { recommendationHostRemoteContribution } = await import('../src/host.ts')
    ctx.typert.register(recommendationHostRemoteContribution())
  } })
  const { TypertGatewayService } = await loadSDK('@deepseek-ai/dsh-api-gateway')
  const gateway = new TypertGatewayService(f.ctx, {})
  const { client } = await mountedClient(t, f.ctx, gateway, f.peer)
  assert.equal((await client.remote.mattpocockControls.readPolicy()).ok, true)
  const unavailable = await client.remote.mattpocockRecommendationSupport.readOwnerDecisionPolicy('root', signal())
  assert.equal(unavailable.ok, false)
  assert.equal(unavailable.error.code, 'gateway/service-unavailable')
  const record = await f.execute('mattpocock_record', { request: { action: 'read' } })
  assert.notEqual(record.isError, true)
  assert.equal(record.value.schemaVersion, 2)
})

test('new namespace on an old runtime explicitly reports unsupported and never trusts a forged operator peer or request authority', async t => {
  const f = await mountedFixture(t, { runtimeCreated(runtime) {
    delete runtime.readOwnerDecisionPolicy; delete runtime.saveOwnerDecisionPolicy
  } })
  const { TypertGatewayService } = await loadSDK('@deepseek-ai/dsh-api-gateway')
  const gateway = new TypertGatewayService(f.ctx, {})
  const invoke = (peer, args) => gateway.invoke({ namespace: 'mattpocockRecommendationSupport', method: 'readOwnerDecisionPolicy', args, peer, signal: signal() })
  await assert.rejects(invoke(f.peer, { sessionId: 'root' }), e => e.code === 'feature-disabled' && /unsupported/.test(e.message))
  await assert.rejects(invoke({ ...f.peer, id: 'impostor' }, { sessionId: 'root' }), e => e.code === 'access-denied')
  await assert.rejects(invoke(f.peer, { sessionId: 'root', principalId: 'user:operator' }))
  const policy = await gateway.invoke({ namespace: 'mattpocockControls', method: 'readPolicy', args: {}, peer: f.peer, signal: signal() })
  assert.equal(policy.revision, 0)
})
