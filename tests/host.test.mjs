import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registerHooks, createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

// Explicit installed-SDK probes: no profile, GUI, server, AgentLoop or model.
const hostRoot = process.env.DSH_CONTROLS_HOST_ROOT
const options = { skip: !hostRoot && 'set DSH_CONTROLS_HOST_ROOT for installed-host mechanical probes' }
let api, sdk
if (hostRoot) {
  assert(isAbsolute(hostRoot))
  const hostRequire = createRequire(pathToFileURL(join(hostRoot, 'package.json')))
  registerHooks({
    resolve(specifier, context, next) {
      if (context.parentURL?.includes('/dsh-mattpocock-skills/src/') && specifier.startsWith('.')) specifier = specifier.endsWith('.js') ? specifier.slice(0, -3) + '.ts' : specifier
      if ((specifier.startsWith('@deepseek-ai/') || specifier === 'zod') && context.parentURL?.includes('/dsh-mattpocock-skills/src/')) return { url: pathToFileURL(hostRequire.resolve(specifier)).href, shortCircuit: true }
      return next(specifier, context)
    },
    load(url, context, next) {
      if (url.includes('/dsh-mattpocock-skills/src/') && url.endsWith('.ts')) return { format: 'module', source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText, shortCircuit: true }
      return next(url, context)
    },
  })
  api = await import('../src/host.ts')
  const load = name => import(pathToFileURL(hostRequire.resolve(name)).href)
  sdk = { ...await load('@deepseek-ai/cordis'), ...await load('@deepseek-ai/dsh-typert-registry'), ...await load('@deepseek-ai/dsh-api-gateway'), ...await load('@deepseek-ai/dsh-storage-domain'), ...await load('@deepseek-ai/dsh-tools'), ...await load('@deepseek-ai/dsh-session'), ...await load('@deepseek-ai/dsh-util-values'), ...await load('@deepseek-ai/dsh-system-prompt'), ...await load('@deepseek-ai/dsh-llm') }
}
const signal = () => new AbortController().signal
function agent(id = 'owner', origin, parentSession) {
  const descriptor = { type: 'subagent/descriptor', data: { version: 3, mode: 'continuable', provider: 'spawn', label: 'fixture' } }
  const header = { id, version: 4, createdAt: 0, cwd: '/fixture', isSeeded: false, ...(origin ? { origin } : {}), ...(parentSession ? { parentSession } : {}) }
  return { id, session: { header, ownEvents: () => origin ? [descriptor] : [] } }
}
function authorityFixture() {
  const owner = agent(), child = agent('child', 'subagent', owner.id), fork = agent('fork', undefined, owner.id)
  const agents = new Map([[owner.id, owner], [child.id, child], [fork.id, fork]])
  const workspace = { id: 'W', path: '/fixture', title: 'fixture', status: async () => 'ok' }
  let saved, grant, observed = 0, released = 0
  const ctx = { agents: { get: id => agents.get(id) }, connection: { operator: { id: 'operator' } }, workspaceRegistry: { get: id => id === 'W' ? workspace : undefined, resolveByPath: async path => path === '/fixture' ? workspace : undefined },
    sessionQuery: { async observeSession(id) { observed++; assert.equal(id, 'cold'); return { header: { ...child.session.header, id: 'cold' }, inheritedEventCount: 1, events: [{ type: 'subagent/descriptor', data: { version: 99 } }, ...child.session.ownEvents()], [Symbol.dispose]() { released++ } } } } }
  const storage = { async read() { return saved } }
  const grants = { async read() { return grant }, async compareAndSwap(expected, next) { if ((grant?.revision ?? 0) !== expected) return false; grant = next; return true } }
  return { ctx, owner, child, fork, agents, storage, grants, setSaved(value) { saved = value }, get observed() { return observed }, get released() { return released } }
}
test('host caller identity requires actual invocation operator or exact live Agent', options, () => {
  const f = authorityFixture()
  assert.throws(() => api.operatorCaller(f.ctx), { code: 'access-denied' })
  f.ctx.invocation = { peer: { id: 'stranger' }, signal: signal() }
  assert.throws(() => api.operatorCaller(f.ctx), { code: 'access-denied' })
  f.ctx.invocation = { peer: f.ctx.connection.operator, signal: signal() }
  assert.deepEqual(api.operatorCaller(f.ctx), { kind: 'user', principalId: 'user:operator', sessionId: null })
  assert.deepEqual(api.agentCaller(f.ctx, f.owner), { kind: 'agent', principalId: 'agent:owner', sessionId: 'owner' })
  assert.throws(() => api.agentCaller(f.ctx, { ...f.owner }), { code: 'access-denied' })
  assert.throws(() => api.agentCaller(f.ctx), { code: 'access-denied' })
})
test('owner classifier keeps ordinary forks independent and cold child own descriptor authoritative', options, async () => {
  const f = authorityFixture(), port = api.createHostAuthority(f.ctx, f.storage, f.grants)
  assert.deepEqual(await port.authority.resolveSession('owner'), { kind: 'owner', controlWorkspaceId: 'W' })
  assert.deepEqual(await port.authority.resolveSession('fork'), { kind: 'owner', controlWorkspaceId: 'W' })
  assert.deepEqual(await port.authority.resolveSession('child'), { kind: 'managed-child', parentSessionId: 'owner' })
  assert.deepEqual(await port.authority.resolveSession('cold'), { kind: 'managed-child', parentSessionId: 'owner' })
  assert.equal(f.observed, f.released)
  assert.equal(api.classifySession({ header: { ...f.child.session.header, parentSession: undefined }, events: f.child.session.ownEvents(), live: true }), undefined)
  assert.equal(api.classifySession({ header: f.child.session.header, events: [], live: true }), undefined)
})
test('original WorkspaceId survives registration removal but unregistered roots never create workspace', options, async () => {
  const f = authorityFixture(), port = api.createHostAuthority(f.ctx, f.storage, f.grants)
  f.setSaved({ schemaVersion: 1, revision: 1, policy: { revision: 0, extensionEnabled: false, defaults: {}, workspaceOverrides: {} }, instances: [{ instrumentInstanceId: 'I', ownerSessionId: 'owner', controlWorkspaceId: 'W' }], associations: [{ sessionId: 'owner', instrumentInstanceId: 'I', parentSessionId: null }] })
  f.ctx.workspaceRegistry.resolveByPath = async () => { throw new Error('must not reselect original workspace') }
  f.ctx.workspaceRegistry.get = () => undefined
  assert.deepEqual(await port.authority.resolveSession('owner'), { kind: 'owner', controlWorkspaceId: 'W' })
  assert.equal(await port.authority.verifyWorkspace('W'), false)
})
test('policy writes default denied for agents, exact operator grants are revisioned and revocable', options, async () => {
  const f = authorityFixture(), port = api.createHostAuthority(f.ctx, f.storage, f.grants)
  await port.authority.authorizePolicy('agent:owner', 'read')
  await assert.rejects(port.authority.authorizePolicy('agent:owner', 'write'), { code: 'access-denied' })
  await f.grants.compareAndSwap(0, { schemaVersion: 1, revision: 1, grants: [{ sessionId: 'owner', enabled: true }] })
  await port.authority.authorizePolicy('agent:owner', 'write')
  await assert.rejects(port.authority.authorizeSession('agent:owner', 'fork', 'read'), { code: 'access-denied' })
  await f.grants.compareAndSwap(1, { schemaVersion: 1, revision: 2, grants: [{ sessionId: 'owner', enabled: false }] })
  await assert.rejects(port.authority.authorizePolicy('agent:owner', 'write'), { code: 'access-denied' })
})
async function assembly(t, runtimeExtras = {}, factorySetup, seedUnits = new Map()) {
  const ctx = new sdk.Context(), f = authorityFixture()
  const operator = { id: 'operator', ctx, async dispose() {} }
  ctx.provide('connection', { operator, rpc: { intercept() { return async () => {} } } })
  ctx.provide('agents', { get: id => f.agents.get(id), list: () => [...f.agents.values()] })
  ctx.provide('workspaceRegistry', { ...f.ctx.workspaceRegistry, list: () => [{ id: 'W', path: '/fixture', title: 'Fixture', status: async () => 'ok', sessionIds: ['owner', 'fork', 'cold'] }] })
  ctx.provide('sessionQuery', f.ctx.sessionQuery)
  new sdk.TypertRegistry(ctx)
  new sdk.SystemPrompt(ctx, {})
  new sdk.ToolRuntime(ctx, {})
  const units = new Map([...seedUnits].map(([name, rows]) => [name, new Map(rows)]))
  const backend = { kv: { async open(descriptor) {
    let rows = units.get(descriptor.name); if (!rows) { rows = new Map(); units.set(descriptor.name, rows) }
    return { async loadAll() { return { global: null, tables: { records: Object.fromEntries(rows) } } }, async putRecord(table, key, value) { assert.equal(table, 'records'); rows.set(key, structuredClone(value)) }, async deleteRecord(table, key) { rows.delete(key) }, async close() {} }
  } } }
  ctx.provide('storage', { backend: { get: () => backend } })
  const domainFacility = new sdk.DomainFacility(ctx, { backend: 'fixture' })
  ctx.provide('storageDomain', domainFacility)
  const calls = [], events = []
  const owned = sdk.createUserMessage({ content: [{ type: 'text', text: 'plugin snapshot' }], source: { kind: 'test-instrument', form: 'instructions' } })
  let permissionTail = Promise.resolve()
  const runtime = {
    serializePolicyPermission(effect) { const result = permissionTail.then(effect); permissionTail = result.catch(() => {}); return result },
    async readPolicy(caller) { calls.push(caller); return { revision: 0, extensionEnabled: false, defaults: {}, workspaceOverrides: {} } },
    async savePolicy(caller, intent, expectedRevision) { calls.push(caller); return { ...intent, revision: expectedRevision + 1 } },
    async readSession(caller, sessionId) { calls.push(caller); return { sessionId, capabilities: api.HOST_CAPABILITIES } },
    async applyInstrument(caller, sessionId, command) { return { sessionId, author: caller, command } },
    async applyTicketWindow(caller, sessionId, command) { return { sessionId, command } },
    async resourceAction(caller, sessionId, request) { return { sessionId, request } },
    async created() {}, async observe(event) { events.push(event) }, async preStep() { return [owned] },
    async postExecute() { return [owned] }, context() { return '' }, async dispose() { events.push({ kind: 'runtime-dispose' }) }, ...runtimeExtras,
  }
  const mounted = await api.mountHost(ctx, { createRuntime: async ports => { factorySetup?.(ports, runtime, ctx, f.owner); return runtime } })
  const gateway = new sdk.TypertGatewayService(ctx, {})
  t.after(async () => { await mounted.dispose(); await domainFacility.closeAll() })
  const invoke = (method, args = {}, peer = operator) => gateway.invoke({ namespace: 'mattpocockControls', method, args, peer, signal: signal() })
  return { ctx, mounted, gateway, invoke, calls, events, owner: f.owner, owned, units, runtime }
}
test('actual Cordis/Typert gateway dispatches strict bound Remote and rejects forged operator/unknown fields', options, async t => {
  const f = await assembly(t)
  assert.equal((await f.invoke('readPolicy')).revision, 0)
  assert.equal(f.calls[0].principalId, 'user:operator')
  await assert.rejects(f.invoke('readPolicy', {}, { id: 'stranger', ctx: f.ctx, async dispose() {} }), { code: 'access-denied' })
  await assert.rejects(f.invoke('readPolicy', { principal: 'user:operator' }))
  await assert.rejects(f.invoke('savePolicy', { intent: { extensionEnabled: true, defaults: { workspace: { enabled: true },}, workspaceOverrides: {}, principal: 'fake' }, expectedRevision: 0 }))
  assert.equal((await f.invoke('readSession', { sessionId: 'owner' })).sessionId, 'owner')
  assert.equal(f.units.size, 6)
  assert.ok([...f.units.keys()].some(name => name.endsWith('_startup_settings')))
  assert.equal(await f.mounted.ports.resourceLifecycle.verifyInitialBinding(), false)
  assert.deepEqual(await f.mounted.ports.resourceLifecycle.closeEntrypoints(), { closed: false, nativeColdResumeClosed: false })
})
test('actual registry native/nested tool execution authenticates caller and cannot self-grant policy', options, async t => {
  const f = await assembly(t)
  const execute = (name, args, agent = f.owner) => f.ctx.tools.execute({ name, arguments: args, callId: 'fixture-call', agent, signal: signal() })
  assert.equal((await execute('mattpocock_controls', { request: { action: 'read' } })).isError, false)
  assert.equal((await execute('mattpocock_controls', { request: { action: 'save', intent: { extensionEnabled: true, defaults: { workspace: { enabled: true },}, workspaceOverrides: {} }, expectedRevision: 0 } })).isError, true)
  assert.equal((await execute('mattpocock_record', { request: { action: 'read', principal: 'user:operator' } })).isError, true)
  const noCaller = await f.ctx.tools.execute({ name: 'mattpocock_controls', arguments: { request: { action: 'read' } }, callId: 'no-caller', signal: signal() })
  assert.equal(noCaller.isError, true)
  await f.invoke('grantPolicy', { sessionId: 'owner', enabled: true, expectedRevision: 0 })
  assert.equal((await execute('mattpocock_controls', { request: { action: 'save', intent: { extensionEnabled: true, defaults: { workspace: { enabled: true },}, workspaceOverrides: {} }, expectedRevision: 0 } })).isError, false)
  await f.invoke('grantPolicy', { sessionId: 'owner', enabled: false, expectedRevision: 1 })
  assert.equal((await execute('mattpocock_controls', { request: { action: 'save', intent: { extensionEnabled: true, defaults: { workspace: { enabled: true },}, workspaceOverrides: {} }, expectedRevision: 0 } })).isError, true)
})
test('native pre-step and post-result preserve original identities and append only separate plugin messages', options, async t => {
  const f = await assembly(t)
  const native = sdk.createUserMessage({ content: [{ type: 'text', text: 'native settled output' }], source: { kind: 'user' } })
  f.ctx.on('agent/pre-step', async () => ({ kind: 'enter', messages: [native], startsRequestSeries: true }))
  const decision = await f.ctx.waterfall('agent/pre-step', { agent: f.owner, messages: [native], turn: 1, step: 1, signal: signal() }, async () => ({ kind: 'enter', messages: [native] }))
  assert.equal(decision.messages[0], native); assert.equal(decision.messages[1], f.owned); assert.equal(decision.startsRequestSeries, true)
  const result = Object.freeze({ isError: false, value: null, content: [] })
  const post = await f.ctx.waterfall('tools/post-execute', { agent: f.owner, signal: signal(), name: 'fixture' }, result, async () => ({ kind: 'accept' }))
  assert.equal(post.additionalContexts[0], f.owned)
  assert.deepEqual(result, { isError: false, value: null, content: [] })
})
test('telemetry forwards real event identities without parsing report text and disposal removes tools', options, async t => {
  const f = await assembly(t)
  f.ctx.emit('subagent/start', { id: 'child', runId: 'epoch-1', provider: 'spawn', local: true })
  f.ctx.emit('agent/status', { agent: f.owner, status: 'running' })
  f.ctx.emit('subagent/end', { id: 'child', runId: 'epoch-1', provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: 'do not infer release from this text' }] })
  await f.mounted.dispose()
  assert(f.events.some(event => event.kind === 'subagent-start' && event.runId === 'epoch-1'))
  assert(f.events.some(event => event.kind === 'subagent-end' && !Object.hasOwn(event, 'lastAssistantMessage')))
  assert.equal(f.ctx.tools.get('mattpocock_controls'), undefined)
  assert.equal(f.events.at(-1).kind, 'runtime-dispose')
})

test('shared Client contribution is browser-safe strict schema data and rejects execution/author claims', options, async () => {
  const contract = await import('../src/controls/remote-contract.ts')
  assert.deepEqual(api.hostRemoteContribution().invocations, contract.REMOTE_CONTRIBUTION.descriptors)
  for (const descriptor of contract.REMOTE_CONTRIBUTION.descriptors) {
    assert.equal(descriptor.result.mode, 'strict')
    for (const parameter of descriptor.parameters) assert.equal(parameter.codec.mode, 'strict')
  }
  const ticket = contract.REMOTE_CONTRIBUTION.descriptors.find(d => d.method === 'applyTicketWindow').parameters[1].codec.create()
  assert.throws(() => ticket.parse({ action: 'receipt', operationId: 'O', state: 'released' }))
  assert.throws(() => contract.parseResourceAction({ action: 'request-retire', resourceId: 'R', disposition: { kind: 'discard', branch: 'keep', authorId: 'forged' } }))
  assert.throws(() => contract.parseHostJson({ value: undefined }))
  assert.throws(() => contract.parseHostJson(-0))
  const sparse = []; sparse.length = 1; assert.throws(() => contract.parseHostJson(sparse))
  const msg = api.makeSnapshotMessage('saved revision 4')
  assert.equal(msg.source.kind, 'mattpocock-controls'); assert.equal(msg.source.form, 'snapshot')
  assert.equal(msg.source.sections[0].text, msg.content[0].text)
})
test('rejected native step neither consumes nor injects instrument messages', options, async t => {
  const f = await assembly(t)
  f.ctx.on('agent/pre-step', async () => ({ kind: 'reject' }))
  const decision = await f.ctx.waterfall('agent/pre-step', { agent: f.owner, messages: [], turn: 1, step: 1, signal: signal() }, async () => ({ kind: 'enter', messages: [] }))
  assert.deepEqual(decision, { kind: 'reject' })
  assert.equal((await f.mounted.ports.nativeActivity('owner')).known, false)
  assert.equal(f.mounted.ports.liveAgent('owner'), f.owner)
  assert.equal(f.mounted.ports.liveAgents()[0], f.owner)
})
function runnerFixture(overrides = {}) {
  const f = authorityFixture(), launched = [], confined = []
  let mode = 'workspace-write', exitCode = 0, stdout = 'fixture', stderr = '', lossy = false, enforcement = 'full', quiesced = 0
  const fs = { async resolve(path) { return { displayPath: path, targetKey: path } }, processPath: target => target.displayPath, contains(root, child) { return child.displayPath === root.displayPath || child.displayPath.startsWith(root.displayPath + '/') } }
  const sandbox = { async confine(argv, policy) { confined.push({ argv, policy }); return { argv: ['sandbox-runner', '--', ...argv], enforcement, denialSignatures: ['permission denied'], runnerFailureRules: [{ fatalSignatures: ['runner unavailable'] }] } } }
  const subprocess = {
    async resolveExecutable(name) { assert.equal(name, 'git'); return '/usr/bin/git' },
    spawn(spec) {
      launched.push(spec)
      return { done: Promise.resolve({ exitCode, signal: null }), async waitForExit() { quiesced++; return true },
        collected: { stdout: { readFrom: () => ({ text: stdout, lossy }) }, stderr: { readFrom: () => ({ text: stderr, lossy: false }) } } }
    },
  }
  const services = { fs, sandbox, subprocess, sandboxPolicy: { resolve: () => ({ mode, workspaceRoot: '/fixture', sessionId: 'owner' }) }, ...overrides }
  f.ctx.get = name => services[name]
  return { ...f, services, launched, confined, runner: api.createAuthorizedGitRunner(f.ctx, 'owner', signal()), setMode(value) { mode = value }, setOutput(code, err = '', truncated = false) { exitCode = code; stderr = err; lossy = truncated }, setEnforcement(value) { enforcement = value }, get quiesced() { return quiesced } }
}
const gitArgs = ['git', '--no-optional-locks', '--no-pager', '-c', 'core.hooksPath=/dev/null', 'rev-parse', '--show-toplevel']
test('typed Git runner confines fixed argv, preserves caller root and rejects unknown/partial routes', options, async () => {
  const f = runnerFixture()
  assert.deepEqual(await f.runner.run(gitArgs, '/fixture'), { exitCode: 0, stdout: 'fixture', stderr: '' })
  assert.equal(f.confined[0].policy.workspaceRoot, '/fixture')
  assert.equal(f.launched[0].argv[0], 'sandbox-runner')
  assert.equal(f.launched[0].stdio.stdin, 'ignore')
  assert.equal(f.quiesced, 1)
  await assert.rejects(f.runner.run(['git', '--no-optional-locks', '--no-pager', '-c', 'core.hooksPath=/dev/null', 'config', '--global', 'fake', 'value'], '/fixture'), { code: 'access-denied' })
  await assert.rejects(f.runner.authorize({ operation: 'create', paths: ['/other/worktree'] }), { code: 'access-denied' })
  f.setMode('read-only')
  await assert.rejects(f.runner.authorize({ operation: 'retire', paths: ['/fixture/tree'] }), { code: 'access-denied' })
  f.setMode('workspace-write'); f.setEnforcement('partial')
  await assert.rejects(f.runner.run(gitArgs, '/fixture'), { code: 'unsupported' })
  assert.equal(f.launched.length, 1)
})
test('typed Git output, confinement failure and credential/config redirection fail closed', options, async () => {
  const f = runnerFixture(), prior = process.env.GIT_DIR
  process.env.GIT_DIR = '/malicious/shared-metadata'
  try {
    await f.runner.run(gitArgs, '/fixture')
    assert(Object.hasOwn(f.launched[0].env, 'GIT_DIR')); assert.equal(f.launched[0].env.GIT_DIR, undefined)
    assert.equal(f.launched[0].env.GIT_CONFIG_NOSYSTEM, '1')
    assert(f.confined[0].argv.includes('core.fsmonitor=false'))
  } finally { if (prior === undefined) delete process.env.GIT_DIR; else process.env.GIT_DIR = prior }
  f.setOutput(1, 'permission denied')
  await assert.rejects(f.runner.run(gitArgs, '/fixture'), { code: 'access-denied' })
  f.setOutput(1, 'runner unavailable')
  await assert.rejects(f.runner.run(gitArgs, '/fixture'), { code: 'unsupported' })
  f.setOutput(0, '', true)
  await assert.rejects(f.runner.run(gitArgs, '/fixture'), { code: 'unsupported' })
  const absent = runnerFixture({ sandbox: undefined })
  await assert.rejects(absent.runner.run(gitArgs, '/fixture'), { code: 'unsupported' })
  assert.equal(absent.launched.length, 0)
})

test('managed native nesting traverses original registry guards, token parent and actual caller', options, async t => {
  const f = await assembly(t)
  let authorizedParent, executed = 0
  f.mounted.ports.installManagedGuard(exec => exec.name === 'subagent' && (authorizedParent === undefined || exec.parent !== authorizedParent) ? 'native requires managed private capability' : undefined)
  f.ctx.tools.register(sdk.defineTool({ name: 'subagent', description: 'mechanical native seam, no agent or model', parameters: { prompt: { type: 'string', required: true } },
    output: { schema: { type: 'null' }, render: () => [] }, async execute(_, exec) { assert.equal(exec.agent, f.owner); assert.equal(exec.parent, authorizedParent); executed++; return null } }))
  f.ctx.tools.register(sdk.defineTool({ name: 'fixture_managed', description: 'mechanical wrapper', parameters: {}, output: { schema: { type: 'null' }, render: () => [] },
    async execute(_, exec) { authorizedParent = exec.token; try { const result = await f.mounted.ports.executeNative(exec, 'subagent', { prompt: 'fixture' }); assert.equal(result.isError, false); return null } finally { authorizedParent = undefined } } }))
  const execute = name => f.ctx.tools.execute({ name, arguments: name === 'subagent' ? { prompt: 'fixture' } : {}, callId: 'nested-test:' + name, agent: f.owner, signal: signal() })
  assert.equal((await execute('subagent')).isError, true)
  assert.equal((await execute('fixture_managed')).isError, false)
  assert.equal(executed, 1)
})
test('Remote in-flight work observes teardown cancellation, drains before disposal and cannot call afterward', options, async t => {
  const f = await assembly(t)
  let enteredResolve; const entered = new Promise(resolve => { enteredResolve = resolve })
  f.runtime.readPolicy = async (_, control) => { enteredResolve(); await new Promise((resolve, reject) => { if (control.aborted) reject(control.reason); else control.addEventListener('abort', () => reject(control.reason), { once: true }) }); throw new Error('unreachable') }
  const call = f.invoke('readPolicy'); const outcome = assert.rejects(call)
  await entered
  await f.mounted.dispose(); await outcome
  assert.equal(f.events.at(-1).kind, 'runtime-dispose')
  await assert.rejects(f.invoke('readPolicy'))
})

test('actual Client Remote accepts final readSession AbortSignal and never sends it as JSON', options, async t => {
  const f = await assembly(t)
  const contract = await import('../src/controls/remote-contract.ts')
  const hostRequire = createRequire(pathToFileURL(join(hostRoot, 'package.json')))
  // Load the shipped unbundled Client implementation: its public browser bundle
  // expects window.__ModuleLoader__, while this fixture has no browser/DOM/server.
  const clientGateway = await import(pathToFileURL(join(hostRoot, 'node_modules/@deepseek-ai/dsh-api-gateway/lib/types/client/index.js')).href)
  const client = new sdk.Context(); new sdk.TypertRegistry(client)
  const wire = []
  client.provide('connection', { isLoopback: true, generation: { getSnapshot: () => undefined, subscribe: () => () => {} }, registerGenerationSource: () => () => {}, start: () => ({ stop() {} }),
    rpc: { open() { throw new Error('no streams in unary fixture') }, async call(channel, endpoint, payload, control) {
      wire.push(payload)
      assert.equal(channel, '/api')
      const [namespace, method] = endpoint.split('/')
      return { ok: true, value: await f.gateway.invoke({ namespace, method, args: payload.args, peer: f.ctx.connection.operator, signal: control }) }
    } } })
  clientGateway.apply(client)
  const remove = await client.remote.$mount(contract.REMOTE_CONTRIBUTION)
  t.after(remove)
  const remote = client.remote.mattpocockControls
  assert.equal((await remote.readSession('owner', signal())).ok, true)
  assert.deepEqual(Object.keys(wire[0].args), ['sessionId'])
  let enteredResolve; const entered = new Promise(resolve => { enteredResolve = resolve })
  f.runtime.readSession = async (_, sid, control) => { enteredResolve(); await new Promise((resolve, reject) => { if (control.aborted) reject(control.reason); else control.addEventListener('abort', () => reject(control.reason), { once: true }) }); return { sessionId: sid } }
  const controller = new AbortController(), pending = remote.readSession('owner', controller.signal)
  await entered; controller.abort()
  const cancelled = await pending
  assert.equal(cancelled.ok, false); assert.equal(cancelled.error.code, 'gateway/cancelled')
  assert.deepEqual(Object.keys(wire.at(-1).args), ['sessionId'])
})

test('native event program callback registers its receipt fence synchronously before another step can inspect', options, async t => {
  const f = await assembly(t)
  let registered = false, release; const fence = new Promise(resolve => { release = resolve })
  f.runtime.observe = event => { registered = true; assert.equal(event.runId, 'epoch-fence'); return fence }
  f.ctx.emit('subagent/end', { id: 'child', runId: 'epoch-fence', provider: 'spawn', local: true, stopReason: 'completed' })
  assert.equal(registered, true, 'not deferred into a later Promise.then')
  release()
})
test('instrument tool rejects forged principal fields at both outer and business argument envelopes', options, async t => {
  const f = await assembly(t)
  for (const args of [{ request: { action: 'read' }, principal: 'user:operator' }, { request: { action: 'read', sessionId: 'another-root' } }]) {
    const outcome = await f.ctx.tools.execute({ name: 'mattpocock_controls', arguments: args, callId: 'forged-envelope', agent: f.owner, signal: signal() })
    assert.equal(outcome.isError, true)
  }
})

test('operator revocation and agent policy commits share one permission-effect queue, never stale authorization', options, async t => {
  const f = await assembly(t)
  const core = await import('../src/controls/index.ts')
  const controls = new core.WorkspaceControls(f.mounted.ports.controlsStorage, f.mounted.ports.authority)
  await f.invoke('grantPolicy', { sessionId: 'owner', enabled: true, expectedRevision: 0 })
  let release, revokeQueuedResolve, policyQueuedResolve
  const pause = new Promise(resolve => { release = resolve }), revokeQueued = new Promise(resolve => { revokeQueuedResolve = resolve }), policyQueued = new Promise(resolve => { policyQueuedResolve = resolve })
  const original = f.runtime.serializePolicyPermission; let count = 0
  f.runtime.serializePolicyPermission = effect => { count++; if(count === 2) revokeQueuedResolve(); if(count === 3) policyQueuedResolve(); return original(effect) }
  const blocker = f.runtime.serializePolicyPermission(() => pause)
  const revocation = f.invoke('grantPolicy', { sessionId: 'owner', enabled: false, expectedRevision: 1 })
  await revokeQueued
  f.runtime.savePolicy = (caller, intent, expected) => f.runtime.serializePolicyPermission(() => controls.savePolicy(caller.principalId, intent, expected))
  const policy = f.ctx.tools.execute({ name: 'mattpocock_controls', arguments: { request: { action: 'save', intent: { extensionEnabled: false, defaults: {}, workspaceOverrides: {} }, expectedRevision: 0 } }, callId: 'revoked-save', agent: f.owner, signal: signal() })
  await policyQueued; release(); await blocker; await revocation
  assert.equal((await policy).isError, true)
  assert.equal((await controls.readPolicy(f.mounted.ports.operatorPrincipal)).revision, 0)
  assert.equal((await f.mounted.ports.readPolicyGrants()).grants[0].enabled, false)
})

test('concrete resource Git adapter composes with actual host runner prefix, authorization, lookup and confined spawn', options, async () => {
  const { concreteGitAdapter } = await import('../src/controls/git-worktrees.ts')
  const f = runnerFixture(), oid = 'a'.repeat(40), common = '/fixture/repo/.git'
  const branches = new Map([['/fixture/repo', 'refs/heads/main'], ['/fixture/borrowed', 'refs/heads/borrowed']])
  const gitDirs = new Map([['/fixture/repo', common], ['/fixture/borrowed', common + '/worktrees/borrowed']])
  const directories = new Set(['/fixture', '/fixture/repo', common, '/fixture/worktrees', '/fixture/borrowed', common + '/worktrees/borrowed'])
  const authorizations = [], lookups = []; let drained = 0
  f.services.subprocess.resolveExecutable = async (name, _env, control) => { control.throwIfAborted(); lookups.push(name); return '/usr/bin/git' }
  f.services.subprocess.spawn = spec => {
    f.launched.push(spec)
    const hook = spec.argv.indexOf('core.hooksPath=/dev/null'), verb = spec.argv[hook + 1], args = spec.argv.slice(hook + 2)
    assert.deepEqual(spec.argv.slice(hook - 3, hook + 1), ['--no-optional-locks', '--no-pager', '-c', 'core.hooksPath=/dev/null'])
    let stdout = '', exitCode = 0
    if (verb === 'rev-parse') {
      if (args.includes('--show-toplevel')) stdout = spec.cwd
      else if (args.includes('--git-common-dir')) stdout = common
      else if (args.includes('--absolute-git-dir')) stdout = gitDirs.get(spec.cwd)
      else if (args.includes('--verify')) stdout = oid
      else throw new Error('unexpected rev-parse fixture query')
    } else if (verb === 'symbolic-ref') stdout = branches.get(spec.cwd)
    else if (verb === 'show-ref') exitCode = [...branches.values()].includes(args.at(-1)) ? 0 : 1
    else if (verb === 'worktree' && args[0] === 'list') stdout = [...branches].map(([path, branch]) => 'worktree ' + path + '\0HEAD ' + oid + '\0branch ' + branch + '\0\0').join('')
    else if (verb === 'worktree' && args[0] === 'add') {
      const path = args[args.indexOf('--') + 1], gitDir = common + '/worktrees/' + args[2]
      directories.add(path); directories.add(gitDir); branches.set(path, 'refs/heads/' + args[2]); gitDirs.set(path, gitDir)
    } else if (!['check-ref-format', 'status', 'ls-files', 'diff'].includes(verb)) throw new Error('unexpected fixture verb: ' + verb)
    assert.equal(typeof stdout, 'string')
    return { done: Promise.resolve({ exitCode, signal: null }), async waitForExit() { drained++; return true }, collected: {
      stdout: { readFrom: () => ({ text: stdout, lossy: false }) }, stderr: { readFrom: () => ({ text: '', lossy: false }) } } }
  }
  // Only metadata is fake. Actual Host run/authorize/signal/argv/lookup/confinement
  // execute beneath the real concrete adapter; no process, shell or grant is widened.
  const runner = { ...f.runner,
    async authorize(request, control) { authorizations.push(request); return f.runner.authorize(request, control) },
    async lstat(path, control) { control?.throwIfAborted(); if (!directories.has(path)) throw Object.assign(new Error('absent'), { code: 'ENOENT' }); return { kind: 'directory', identity: 'inode:' + path } },
    async realpath(path, control) { control?.throwIfAborted(); return path },
    async readFile() { throw new Error('clean fixture has no content reads') }, async readlink() { throw new Error('no symlinks') }, async readDirectory() { return [] },
  }
  const git = concreteGitAdapter(runner)
  const borrowed = await git.borrow('/fixture/borrowed', signal())
  assert.equal(borrowed.ownership, 'borrowed'); assert.equal(borrowed.branchOwned, false)
  assert.equal((await git.inspect(borrowed, signal())).identityVerified, true)
  const planned = await git.planCreate({ repositoryPath: '/fixture/repo', root: '/fixture/worktrees', name: 'feature', startPoint: 'HEAD' }, signal())
  assert.equal(planned.pathIdentity, null)
  const created = await git.create(planned, signal()), facts = await git.inspect(created, signal())
  assert.equal(created.branchRef, 'refs/heads/feature'); assert.equal(created.ownership, 'owned')
  assert.equal(facts.identityVerified, true); assert.equal(facts.exists, true); assert.deepEqual(facts.tracked, [])
  assert(authorizations.some(request => request.operation === 'borrow'))
  assert(authorizations.some(request => request.operation === 'create' && request.paths.includes(common)))
  assert.equal(lookups.length, f.launched.length); assert.equal(f.confined.length, f.launched.length); assert.equal(drained, f.launched.length)
  assert(f.launched.every(spec => spec.argv[0] === 'sandbox-runner'))
  assert(f.confined.every(wrap => wrap.policy.mode === 'workspace-write' && wrap.policy.workspaceRoot === '/fixture'))
  const before = f.launched.length; f.setMode('read-only')
  await assert.rejects(git.planCreate({ repositoryPath: '/fixture/repo', root: '/fixture/worktrees', name: 'another', startPoint: 'HEAD' }, signal()), { code: 'access-denied' })
  assert.equal(f.launched.length, before)
  for (const argv of [ ['git', '-c', 'core.hooksPath=/dev/null', 'status'], ['git', '--no-optional-locks', '--no-pager', '-c', 'core.hooksPath=/tmp/untrusted', 'status'], ['git', '--no-optional-locks', '--no-pager', '-c', 'core.hooksPath=/dev/null', 'config', '--global', 'fake', 'value'] ]) await assert.rejects(f.runner.run(argv, '/fixture'), { code: 'access-denied' })
  assert.equal(f.launched.length, before)
})
test('operator workspace navigation exposes actual sessionIds without loading cold sessions or creating instruments', options, async t => {
  const f = await assembly(t), beforeRows = [...f.units.get('mattpocock_controls')]
  const beforeAgents = f.mounted.ports.liveAgents()
  f.ctx.sessionQuery.observeSession = async () => { throw new Error('navigation must not observe/resume Sessions') }
  const rows = await f.invoke('listWorkspaces')
  assert.deepEqual(rows[0].sessionIds, ['owner', 'fork', 'cold'])
  assert.deepEqual([...f.units.get('mattpocock_controls')], beforeRows)
  assert.deepEqual(f.mounted.ports.liveAgents(), beforeAgents)
  await assert.rejects(f.invoke('listWorkspaces', {}, { id: 'unrelated-peer', ctx: f.ctx }))
})

test('controlled wrapper binds this-based native SDK conclusion and deferred contexts to original exec', options, async t => {
  const borrowed = sdk.createUserMessage({ content: [{ type: 'text', text: 'native borrowed context' }], source: { kind: 'test-instrument', form: 'instructions' } })
  const f = await assembly(t, { async executeManaged(_caller, _request, exec) { exec.deferContext(borrowed); exec.concludeTurn(); return { accepted: true } } })
  const result = await f.ctx.tools.execute({ name: 'mattpocock_execute', arguments: { request: {} }, callId: 'bound-conclude', agent: f.owner, signal: signal() })
  assert.equal(result.isError, false); assert.equal(result.concludesTurn, true)
  assert.deepEqual(result.additionalContexts.find(context => context.id === borrowed.id), borrowed)
})
const notificationInput = { notificationId: 'notification-1', ownerSessionId: 'owner', instrumentInstanceId: 'instance-1', businessRevision: 7, authorPrincipalId: 'agent:child' }
test('owned notifications never activate cold owners and accepted attempts have fresh native IDs', options, async t => {
  const f = await assembly(t), inbox = []
  f.ctx.sessionQuery.observeSession = async () => { throw new Error('must not observe or resume a cold owner') }
  assert.deepEqual(await f.mounted.ports.notifyOwner({ ...notificationInput, ownerSessionId: 'cold' }, signal()), { status: 'offline', messageId: null })
  f.owner.status = 'idle'; f.owner.steer = message => { inbox.push(message) }
  const one = await f.mounted.ports.notifyOwner(notificationInput, signal()), two = await f.mounted.ports.notifyOwner(notificationInput, signal())
  assert.equal(one.status, 'accepted'); assert.equal(two.status, 'accepted'); assert.notEqual(one.messageId, two.messageId)
  assert.equal(inbox.length, 2); assert.equal(f.owner.status, 'idle')
  for (const message of inbox) {
    assert.equal(message.source.kind, 'mattpocock-controls-notification'); assert.equal(message.source.form, 'notice')
    assert.equal(message.source.notificationId, notificationInput.notificationId)
    assert.equal(message.source.businessRevision, 7); assert.equal(message.source.authorPrincipalId, 'agent:child')
    assert(message.source.summary.length <= 120); assert.equal(message.content[0].text, message.source.summary)
  }
  assert.equal(f.mounted.ports.liveAgent('cold'), undefined)
})
test('notification acknowledgement waits for real native SessionStore durable checkpoint after user/message append', options, async t => {
  const f = await assembly(t), inbox = [], acknowledgements = [], buffered = [], persisted = []
  const store = new sdk.SessionStore(f.ctx), session = store.create('owner', { meta: { cwd: '/fixture' } })
  f.owner.session = session; f.owner.steer = message => inbox.push(message)
  f.runtime.notificationCommitted = async (...args) => { assert.equal(persisted.length, 1); acknowledgements.push(args) }
  let startedResolve, release, ackResolve
  const started = new Promise(resolve => { startedResolve = resolve }), gate = new Promise(resolve => { release = resolve }), ack = new Promise(resolve => { ackResolve = resolve })
  f.ctx.on('session/event', (actual, event) => { if (actual === session) buffered.push(event) })
  f.ctx.on('session/flush', async actual => { if (actual !== session) return; startedResolve(); await gate; persisted.push(...buffered); buffered.length = 0 })
  f.runtime.notificationCommitted = async (...args) => { assert.equal(persisted[0].data.id, args[2]); acknowledgements.push(args); ackResolve() }
  const accepted = await f.mounted.ports.notifyOwner(notificationInput, signal())
  assert.equal(accepted.status, 'accepted'); assert.deepEqual(acknowledgements, [])
  // Preparation and arbitrary source text never acknowledge delivery.
  await f.ctx.waterfall('agent/pre-step', { agent: f.owner, messages: [], turn: 1, step: 1, signal: signal() }, async () => ({ kind: 'enter', messages: [] }))
  assert.deepEqual(acknowledgements, [])
  try {
    session.append('user/message', inbox[0], { surfaceOp: 'append' })
    await started; assert.equal(buffered.length, 1); assert.deepEqual(acknowledgements, [])
    release(); await ack
    assert.deepEqual(acknowledgements, [['owner', 'notification-1', accepted.messageId]])
  } finally { release() }
})
test('append without a persistence participant is not a notification acknowledgement', options, async t => {
  const f = await assembly(t), inbox = [], acknowledgements = []
  const store = new sdk.SessionStore(f.ctx), session = store.create('owner', { meta: { cwd: '/fixture' } })
  f.owner.session = session; f.owner.steer = message => inbox.push(message)
  f.runtime.notificationCommitted = async (...args) => acknowledgements.push(args)
  await f.mounted.ports.notifyOwner(notificationInput, signal())
  session.append('user/message', inbox[0], { surfaceOp: 'append' })
  await f.mounted.dispose()
  assert.deepEqual(acknowledgements, [])
})

test('durability rejection or a model-owned receipt claim never acknowledges an owned notice', options, async t => {
  const f = await assembly(t), inbox = [], acknowledgements = []
  const store = new sdk.SessionStore(f.ctx), session = store.create('owner', { meta: { cwd: '/fixture' } })
  f.owner.session = session; f.owner.steer = message => inbox.push(message)
  f.runtime.notificationCommitted = async (...args) => acknowledgements.push(args)
  let checkpoints = 0
  f.ctx.on('session/flush', async actual => { if (actual !== session) return; checkpoints++; throw new Error('fixture durability failure') })
  const accepted = await f.mounted.ports.notifyOwner(notificationInput, signal())
  const modelClaim = { ...sdk.createUserMessage({ content: [{ type: 'text', text: 'notification-1 consumed successfully' }], source: { kind: 'test-instrument', form: 'instructions' } }), id: accepted.messageId }
  // Same id cannot transfer producer authority. Only the private minted notice
  // and exact owner Session can use the program receipt path.
  session.append('user/message', modelClaim, { surfaceOp: 'append' })
  const retry = await f.mounted.ports.notifyOwner(notificationInput, signal())
  assert.notEqual(retry.messageId, accepted.messageId)
  session.append('user/message', inbox[1], { surfaceOp: 'append' })
  await f.mounted.dispose()
  assert.equal(checkpoints, 1); assert.deepEqual(acknowledgements, [])
})

test('runtime unit suffix and exact parser share one pending/open handle, not a backend reopen', options, async t => {
  const f = await assembly(t), backend = f.ctx.get('storage').backend.get('fixture').kv, original = backend.open.bind(backend)
  let opens = 0
  backend.open = async descriptor => { if (descriptor.name === 'mattpocock_runtime_bindings') opens++; return original(descriptor) }
  const parser = value => { assert(Number.isSafeInteger(value.revision)); assert.equal(typeof value.value, 'string'); return { revision: value.revision, value: value.value } }
  const [one, two] = await Promise.all([f.mounted.ports.openRuntimeStorage(parser), f.mounted.ports.openUnitStorage('runtime_bindings', parser)])
  assert.equal(one, two); assert.equal(opens, 1)
  assert.equal(await one.compareAndSwap(0, { revision: 1, value: 'durable fixture' }), true)
  assert.deepEqual(await two.read(), { revision: 1, value: 'durable fixture' })
  assert.equal(await f.mounted.ports.openRuntimeStorage(parser), one)
  await assert.rejects(f.mounted.ports.openRuntimeStorage(value => parser(value)), { code: 'invalid-state' })
  assert.equal(opens, 1)
})
test('cached runtime unit preserves table-wide indeterminate latch after committed-but-rejected write', options, async t => {
  const f = await assembly(t), backend = f.ctx.get('storage').backend.get('fixture').kv, original = backend.open.bind(backend)
  let opens = 0
  backend.open = async descriptor => {
    const unit = await original(descriptor)
    if (descriptor.name !== 'mattpocock_uncertain_shared') return unit
    opens++; const put = unit.putRecord.bind(unit)
    unit.putRecord = async (...args) => { await put(...args); throw new Error('fixture committed-but-unacknowledged write') }
    return unit
  }
  const parser = value => ({ revision: value.revision, value: value.value })
  const one = await f.mounted.ports.openUnitStorage('uncertain_shared', parser)
  await assert.rejects(one.compareAndSwap(0, { revision: 1, value: 'maybe committed' }))
  const two = await f.mounted.ports.openUnitStorage('uncertain_shared', parser)
  assert.equal(one, two); assert.equal(opens, 1)
  await assert.rejects(two.read(), { code: 'storage-uncertain' })
  assert.throws(() => two.compareAndSwap(0, { revision: 1, value: 'cannot overwrite uncertainty' }), { code: 'storage-uncertain' })
})

test('startup background notification waits for real receipt registration before synchronous steer append', options, async t => {
  let pending, ready = false, accept, ackResolve
  const acknowledgements = [], ack = new Promise(resolve => { ackResolve = resolve })
  const f = await assembly(t, {
    async notificationCommitted(...args) { acknowledgements.push(args); ackResolve() },
  }, (ports, _runtime, ctx, owner) => {
    const store = new sdk.SessionStore(ctx), session = store.create('owner', { meta: { cwd: '/fixture' } })
    owner.session = session
    ctx.on('session/flush', async actual => { assert.equal(actual, session) })
    owner.steer = message => { assert.equal(ready, true); session.append('user/message', message, { surfaceOp: 'append' }) }
    assert(ports.notificationObserverReady instanceof Promise)
    pending = ports.notificationObserverReady.then(async () => { ready = true; accept = await ports.notifyOwner(notificationInput, signal()) })
    // Never await the background job from this factory: Host still needs to
    // register the actual session/event observer against its returned Facade.
    assert.equal(ready, false)
  })
  await pending; await ack
  assert.equal(accept.status, 'accepted')
  assert.deepEqual(acknowledgements, [['owner', 'notification-1', accept.messageId]])
  assert.equal(f.mounted.ports.notificationObserverReady instanceof Promise, true)
})

test('actual DomainFacility restores the fixture raw KV Record shape across fresh mount without empty fallback', options, async t => {
  const one = await assembly(t)
  const parser = value => ({ revision: value.revision, value: value.value })
  const storage = await one.mounted.ports.openUnitStorage('restore_probe', parser)
  assert.equal(await storage.compareAndSwap(0, { revision: 1, value: 'retained across mount' }), true)
  await one.mounted.dispose()
  const two = await assembly(t, {}, undefined, one.units)
  const restored = await two.mounted.ports.openUnitStorage('restore_probe', parser)
  assert.notEqual(restored, storage)
  assert.deepEqual(await restored.read(), { revision: 1, value: 'retained across mount' })
  assert.equal(await restored.compareAndSwap(0, { revision: 1, value: 'must not silently reset' }), false)
})
