import assert from 'node:assert/strict'
import { test } from 'node:test'
import { verifyExactHost } from '../scripts/verify-silent-request-readiness.mjs'

const hostRoot = process.env.DSH_CONTROLS_HOST_ROOT
const options = { skip: !hostRoot && 'set DSH_CONTROLS_HOST_ROOT for the exact-host limitation probe', timeout: 10000 }

// A passing diagnostic reproduces the alpha.2 gap; it is not release acceptance.
test('alpha.2 diagnostic: an auxiliary request admitted ON still reaches the adapter after verified OFF', options, async t => {
  assert.equal(verifyExactHost(hostRoot).version, '0.2.3-alpha.2')
  const { mountedFixture, operator, policy, sdk, signal } = await import('./fixtures/runtime-host.mjs')
  const entered = Promise.withResolvers(), release = Promise.withResolvers()
  t.after(() => { release.resolve() })
  const f = await mountedFixture(t, { configureBeforeMount({ ctx }) { new sdk.LlmRuntime(ctx, {}) } })
  const calls = []
  const stop = { type: 'finish', reason: { kind: 'stop' } }
  f.ctx.llm.registerAdapter(['offline'], new class extends sdk.LlmAdapter {
    async resolveModel(provider, id) { return { provider, id, name: id, toolUpdate: 'in-history' } }
    async *stream(request) { calls.push(request); yield stop }
  }())

  const names = tools => tools.map(tool => tool.name)
  const onTools = ['bash', 'mattpocock_record'], offTools = ['bash']
  const ordinary = sdk.createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'ordinary compaction input' }] })
  const owned = sdk.createUserMessage({ source: { kind: 'mattpocock-controls', form: 'snapshot', sections: [] },
    content: [{ type: 'text', text: 'old owned snapshot' }] })
  const makeRequest = () => {
    const tools = onTools.map(name => ({ name, description: name, parameters: { type: 'object' } }))
    return { provider: 'offline', model: 'offline', purpose: 'compaction', sessionId: f.root.id,
      messages: [ordinary, owned], tools, toolHistory: { tools, updates: [] } }
  }
  const inputOf = request => ({ tools: names(request.tools), history: names(request.toolHistory.tools), messages: request.messages })
  const onInput = { tools: onTools, history: onTools, messages: [ordinary, owned] }
  const offInput = { tools: offTools, history: offTools, messages: [ordinary] }

  const enabled = policy()
  const savedOn = await f.runtime.savePolicy(operator, enabled, 0, signal())
  const effective = () => f.mounted.ports.readSessionPolicy(f.root.id, signal())
  assert.equal((await effective()).collaborationEnabled, true)

  const held = makeRequest()
  // Registered after mount; the prepended Host hook runs before this middleware.
  f.ctx.on('llm/stream', async function* (request, next) {
    if (request === held) {
      entered.resolve(inputOf(request))
      await release.promise
    }
    yield* next()
  })
  const pending = Array.fromAsync(f.ctx.llm.stream(held))
  try {
    const assembled = await Promise.race([entered.promise, pending.then(() => assert.fail('stream never entered the handoff barrier'))])
    assert.deepEqual(assembled, onInput)
    assert.equal(calls.length, 0, 'no adapter call while held')
    const savedOff = await f.runtime.savePolicy(operator, { ...enabled, workspaceOverrides: { W: { workspace: { enabled: false } } } }, savedOn.revision, signal())
    const current = await effective()
    assert.equal(current.configurationRevision, savedOff.revision)
    assert.equal(current.workspaceVerified, true)
    assert.equal(current.collaborationEnabled, false)
    assert.equal(calls.length, 0, 'OFF was verified before adapter handoff')
  } finally {
    release.resolve()
  }
  assert.deepEqual(await pending, [stop])
  assert.equal(calls.length, 1)
  assert.deepEqual(inputOf(calls[0]), onInput, 'known gap: held declarations and snapshot survive verified OFF')

  // Same scope and payload, but entering the real Host hook after OFF: prove that
  // the fixture is eligible for projection and the gap is the downstream wait.
  assert.deepEqual(await Array.fromAsync(f.ctx.llm.stream(makeRequest())), [stop])
  assert.deepEqual(calls.map(inputOf), [onInput, offInput])
})
