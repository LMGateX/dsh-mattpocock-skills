import assert from 'node:assert/strict'
import { cordis, loadNode } from './client-navigation-host.mjs'
const { TypertRegistry } = await loadNode('@deepseek-ai/dsh-typert-registry')
const { TypertGatewayService } = await loadNode('@deepseek-ai/dsh-api-gateway')
const clientGateway = await loadNode('@deepseek-ai/dsh-api-gateway/client')
const { TypertRemoteService } = await loadNode('@deepseek-ai/dsh-typert-protocol')
export function policyRemote(t, options = {}) {
  const server = new cordis.Context(); new TypertRegistry(server)
  t.after(() => server.fiber.dispose())
  const instance = { instrumentInstanceId: 'instance', ownerSessionId: 'owner', controlWorkspaceId: 'workspace' }
  let snapshot = options.snapshot ?? { schemaVersion: 1, instance, revision: 0, saved: { enabled: false, epoch: null }, effective: { status: 'disabled', reason: 'policy-disabled' } }
  const calls = [], mounts = [], reads = [], wire = []
  let releaseOptional, restoreOptional
  const service = { async readOwnerDecisionPolicy(id, signal) { reads.push({ id, signal }); return options.read ? options.read(id, signal) : structuredClone(snapshot) },
    async saveOwnerDecisionPolicy(id, request) {
      calls.push({ id, request: structuredClone(request) })
      if (options.save) return options.save(id, request)
      assert.equal(request.expectedRevision, snapshot.revision)
      const epoch = request.action === 'disable' ? snapshot.saved.epoch : { epochId: 'server-epoch', policyRevision: snapshot.revision + 1, scope: 'new-decisions', enabledAt: 1000, expiresAt: request.durationMs === null ? null : 1000 + request.durationMs, authorizedBy: { kind: 'user', principalId: 'operator', sessionId: null } }
      snapshot = { ...snapshot, revision: snapshot.revision + 1, saved: { enabled: request.action === 'enable', epoch }, effective: { status: request.action === 'enable' ? 'active' : 'disabled', reason: request.action === 'enable' ? null : 'policy-disabled' } }
      return { appliedRevision: snapshot.revision, replayed: false, operation: { action: request.action, epochId: epoch?.epochId ?? null, expiresAt: epoch?.expiresAt ?? null }, snapshot: structuredClone(snapshot) }
    } }
  class PolicyService extends TypertRemoteService {
    constructor(ctx) { super(ctx, 'mattpocockRecommendationSupport') }
    readOwnerDecisionPolicy(sessionId, signal) { return service.readOwnerDecisionPolicy(sessionId, signal) }
    saveOwnerDecisionPolicy(sessionId, request) { return service.saveOwnerDecisionPolicy(sessionId, request) }
  }
  new PolicyService(server)
  const gateway = new TypertGatewayService(server, {})
  return { calls, mounts, reads, wire, revoke: () => releaseOptional(), readd: () => restoreOptional(), get snapshot() { return snapshot }, set snapshot(value) { snapshot = value },
    async install(ctx, base) {
      new TypertRegistry(ctx)
      const unwrap = async result => { result = await result; if (!result.ok) throw result.error; return result.value }
      class BaseService extends TypertRemoteService {
        constructor(ctx) { super(ctx, 'mattpocockControls') }
        readPolicy() { return unwrap(base.readPolicy()) }
        listWorkspaces() { return unwrap(base.listWorkspaces()) }
        readSession(sessionId, signal) { return unwrap(base.readSession(sessionId, signal)) }
        readSummaries(request, signal) { return unwrap(base.readSummaries(request, signal)) }
      }
      new BaseService(server)
      ctx.provide('connection', { isLoopback: true, generation: { getSnapshot: () => undefined, subscribe: () => () => {} }, registerGenerationSource: () => () => {}, start: () => ({ stop() {} }), rpc: { open() { throw Error('no streams') }, async call(channel, endpoint, payload, signal) {
        assert.equal(channel, '/api'); wire.push({ endpoint, args: structuredClone(payload.args) }); const [namespace, method] = endpoint.split('/')
        try { return { ok: true, value: await gateway.invoke({ namespace, method, args: payload.args, signal: signal?.signal ?? signal ?? new AbortController().signal, peer: { id: 'operator', ctx: server, principal: { kind: 'owner' }, interactions: 'answer', signal: new AbortController().signal, async dispose() {} } }) } }
        catch (error) { wire.push({ endpoint, code: error.code, message: error.message, stack: error.stack }); return { ok: false, error: { code: error.code ?? 'unknown', message: error.message } } }
      } } })
      clientGateway.apply(ctx)
      const mount = ctx.remote.$mount.bind(ctx.remote)
      ctx.remote.$mount = async contribution => {
        mounts.push(contribution.package)
        if (options.mountFailure && contribution.package.endsWith('/recommendation-support')) throw new Error('controlled optional mount error')
        if (!(options.oldOnly && contribution.package.endsWith('/recommendation-support'))) {
          const release = server.typert.register({ package: contribution.package, face: 'host', schemas: [], model: { services: [], events: [], objects: [] }, invocations: contribution.descriptors }); t.after(release)
        }
        const release = await mount(contribution)
        if (contribution.package.endsWith('/recommendation-support')) { releaseOptional = release; restoreOptional = async () => { const next = await mount(contribution); releaseOptional = next; t.after(next) } }
        return release
      }
    } }
}
