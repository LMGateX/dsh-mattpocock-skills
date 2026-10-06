import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registerHooks, createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, sep } from 'node:path'
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
  sdk = { ...await load('@deepseek-ai/cordis'), ...await load('@deepseek-ai/dsh-typert-registry'), ...await load('@deepseek-ai/dsh-api-gateway'), ...await load('@deepseek-ai/dsh-storage-domain'), ...await load('@deepseek-ai/dsh-tools'), ...await load('@deepseek-ai/dsh-session'), ...await load('@deepseek-ai/dsh-util-values'), ...await load('@deepseek-ai/dsh-system-prompt'), ...await load('@deepseek-ai/dsh-llm'), LocalFs: (await load('@deepseek-ai/dsh-fs-local')).default }
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
  // These probes test cwd authorization after explicit trusted startup enablement.
  // Default-off/restart semantics are covered by the dedicated Host startup suite.
  if (!units.has('mattpocock_startup_settings')) units.set('mattpocock_startup_settings', new Map([['state', { schemaVersion: 1, revision: 0, desired: { startupCwdEnabled: true }, bootReceipts: [] }]]))
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


// Controlled peers implement public FsTarget/process mapping semantics; no native cwd claim.
function filesystemBoundary(ctx, parent, { mode = 'danger-full-access', root = '/fixture', targets = {} } = {}) {
  const paths = new WeakMap(), resolves = [], contains = [], policies = []
  const fs = {
    async resolve(path, { signal: control } = {}) { control?.throwIfAborted(); resolves.push(path); const target = { targetKey: 'opaque-' + resolves.length, displayPath: path }; paths.set(target, targets[path] ?? path); return target },
    processPath(target) { assert(paths.has(target), 'provider-owned target required'); return paths.get(target) },
    processPathFromHostPath(path) { return path },
    contains(parentTarget, childTarget) { contains.push([parentTarget, childTarget]); const path = relative(fs.processPath(parentTarget), fs.processPath(childTarget)); return path === '' || path !== '..' && !path.startsWith('..' + sep) && !isAbsolute(path) },
    async stat(target, control) { control?.throwIfAborted(); fs.processPath(target); return { type: 'directory', version: 'controlled-directory-v1' } },
  }
  const policy = { resolve(request) { assert.equal(request.session, parent.session); policies.push(request); return { mode, workspaceRoot: root } } }
  ctx.provide('fs', fs); ctx.provide('sandboxPolicy', policy)
  return { fs, policy, resolves, contains, policies }
}

test('explicit child cwd outside parent workspace-write boundary is denied before native start', options, async t => {
  let starts = 0, boundary
  const native = { initialCwdSupported: true, resolveMaxDepth: () => 2, async startContinuable() { starts++; return { childId: 'would-escape', messageId: 'would-escape' } } }
  const f = await assembly(t, {}, (_, __, ctx, owner) => { ctx.provide('subagents', native); boundary = filesystemBoundary(ctx, owner, { mode: 'workspace-write' }) })
  await assert.rejects(f.mounted.ports.createContinuable({ agent: f.owner, signal: signal() }, { provider: 'spawn', label: 'Outside', prompt: 'Task', childId: 'outside', cwd: '/outside/tree' }), { code: 'access-denied' })
  assert(boundary.resolves.includes('/fixture'))
  assert(boundary.resolves.includes('/outside/tree'))
  assert.equal(starts, 0)
})

test('explicit cwd uses canonical provider containment, not lexical roots or opaque keys', options, async t => {
  const calls = [], native = { initialCwdSupported: true, resolveMaxDepth: () => 2, async startContinuable(spec) { calls.push(spec); return { childId: spec.childId, messageId: 'accepted' } } }
  const f = await assembly(t, {}, (_, __, ctx, owner) => { ctx.provide('subagents', native); filesystemBoundary(ctx, owner, { mode: 'workspace-write', targets: { '/fixture/escape': '/outside/tree', '/fixture/alias': '/fixture/inside' } }) })
  const request = { provider: 'spawn', childId: 'inside', label: 'Inside', prompt: 'Task' }, exec = { agent: f.owner, signal: signal() }
  await assert.rejects(f.mounted.ports.createContinuable(exec, { ...request, cwd: '/fixture-sibling' }), { code: 'access-denied' })
  await assert.rejects(f.mounted.ports.createContinuable(exec, { ...request, cwd: '/fixture/escape' }), { code: 'access-denied' })
  await assert.rejects(f.mounted.ports.createContinuable(exec, { ...request, cwd: '/fixture/alias' }), { code: 'unsupported' })
  assert.deepEqual(await f.mounted.ports.createContinuable(exec, { ...request, cwd: '/fixture/inside' }), { childId: 'inside', messageId: 'accepted' })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].cwd, '/fixture/inside')
})

test('initial cwd fails closed without filesystem/policy peers and unmappable host paths; omission adds no gate', options, async t => {
  let starts = 0
  const native = { initialCwdSupported: true, resolveMaxDepth: () => 2, async startContinuable(spec) { starts++; return { childId: spec.childId, messageId: 'accepted' } } }
  const f = await assembly(t, {}, (_, __, ctx) => ctx.provide('subagents', native))
  const request = { provider: 'spawn', childId: 'normal', label: 'Normal', prompt: 'Task' }, exec = { agent: f.owner, signal: signal() }
  await assert.rejects(f.mounted.ports.createContinuable(exec, { ...request, cwd: '/fixture/tree' }), { code: 'unsupported' })
  assert.equal(starts, 0)
  assert.equal((await f.mounted.ports.createContinuable(exec, request)).childId, 'normal')
  const boundary = filesystemBoundary(f.ctx, f.owner, { mode: 'danger-full-access' })
  boundary.fs.processPathFromHostPath = () => undefined
  await assert.rejects(f.mounted.ports.createContinuable(exec, { ...request, cwd: '/outside/tree' }), { code: 'unsupported' })
  assert.equal(starts, 1)
})

test('existing read-only and danger-full policies retain their native permission state for explicit cwd', options, async t => {
  for (const mode of ['read-only', 'danger-full-access']) {
    const calls = [], native = { initialCwdSupported: true, resolveMaxDepth: () => 2, async startContinuable(spec) { calls.push(spec); return { childId: spec.childId, messageId: 'accepted' } } }
    const f = await assembly(t, {}, (_, __, ctx, owner) => { ctx.provide('subagents', native); filesystemBoundary(ctx, owner, { mode }) })
    await f.mounted.ports.createContinuable({ agent: f.owner, signal: signal() }, { provider: 'fork', label: 'Read', prompt: 'Task', childId: 'readonly', cwd: '/outside/existing-tree' })
    assert.equal(f.ctx.sandboxPolicy.resolve({ session: calls[0].request.parent.session }).mode, mode)
    assert.deepEqual(Object.keys(calls[0].request).sort(), ['maxDepth', 'parent', 'prompt'])
    assert.deepEqual(Object.keys(calls[0]).sort(), ['childId', 'cwd', 'label', 'provider', 'request', 'signal'])
  }
})

test('installed public LocalFs resolves real symlink escapes before native creation and accepts canonical directories', options, async t => {
  const temp = await mkdtemp(join(tmpdir(), 'dsh-host-cwd-auth-'))
  t.after(() => rm(temp, { recursive: true, force: true }))
  const root = await realpath(await mkdir(join(temp, 'root'), { recursive: true })), outside = await realpath(await mkdir(join(temp, 'outside'), { recursive: true }))
  const inside = await realpath(await mkdir(join(root, 'tree'), { recursive: true })), escape = join(root, 'escape'), alias = join(root, 'alias'), file = join(root, 'file')
  await symlink(outside, escape); await symlink(inside, alias); await writeFile(file, 'not a directory')
  const calls = [], native = { initialCwdSupported: true, resolveMaxDepth: () => 2, async startContinuable(spec) { calls.push(spec); return { childId: spec.childId, messageId: 'accepted' } } }
  const f = await assembly(t, {}, (_, __, ctx, owner) => {
    owner.session.header.cwd = root
    ctx.provide('subagents', native)
    new sdk.LocalFs(ctx, { cwd: root, diffBasisMaxBytes: 10485760 })
    ctx.provide('sandboxPolicy', { resolve(request) { assert.equal(request.session, owner.session); assert.deepEqual(Object.keys(request), ['session']); return { mode: 'workspace-write', workspaceRoot: owner.session.header.cwd } } })
  })
  const exec = { agent: f.owner, signal: signal() }, request = { provider: 'spawn', childId: 'realpath', label: 'Actual directory', prompt: 'Task' }
  await assert.rejects(f.mounted.ports.createContinuable(exec, { ...request, cwd: escape }), { code: 'access-denied' })
  await assert.rejects(f.mounted.ports.createContinuable(exec, { ...request, cwd: alias }), { code: 'unsupported' })
  await assert.rejects(f.mounted.ports.createContinuable(exec, { ...request, cwd: file }), { code: 'access-denied' })
  await assert.rejects(f.mounted.ports.createContinuable(exec, { ...request, cwd: join(root, 'missing') }), { code: 'access-denied' })
  assert.equal(calls.length, 0)
  assert.equal((await f.mounted.ports.createContinuable(exec, { ...request, cwd: inside })).childId, 'realpath')
  assert.equal(calls[0].cwd, inside)
  // Native creation is the explicit acceptance double, not a claimed AgentLoop/SDK cwd deployment.
})

test('parent file policy is revalidated at native creation effect boundary, not only before awaits', options, async t => {
  let starts = 0, boundary
  const native = { initialCwdSupported: true, resolveMaxDepth() { boundary.policy.resolve = () => ({ mode: 'read-only', workspaceRoot: '/fixture' }); return 2 }, async startContinuable() { starts++; return { childId: 'stale', messageId: 'stale' } } }
  const f = await assembly(t, {}, (_, __, ctx, owner) => { ctx.provide('subagents', native); boundary = filesystemBoundary(ctx, owner, { mode: 'workspace-write' }) })
  await assert.rejects(f.mounted.ports.createContinuable({ agent: f.owner, signal: signal() }, { provider: 'spawn', label: 'Stale', prompt: 'Task', childId: 'stale', cwd: '/fixture/tree' }), { code: 'access-denied' })
  assert.equal(starts, 0)
})

test('initial cwd authorization never dispatches after cancellation or exact-parent/session races', options, async t => {
  for (const race of ['cancelled', 'parent-replaced', 'session-replaced', 'policy-changed']) {
    let starts = 0, boundary
    const control = new AbortController(), native = { initialCwdSupported: true, resolveMaxDepth: () => 2, async startContinuable() { starts++; return { childId: 'race', messageId: 'race' } } }
    const f = await assembly(t, {}, (_, __, ctx, owner) => { ctx.provide('subagents', native); boundary = filesystemBoundary(ctx, owner, { mode: 'workspace-write' }) })
    const original = boundary.fs.resolve
    boundary.fs.resolve = async (path, options) => {
      const target = await original(path, options)
      if (path === '/fixture/tree') {
        if (race === 'cancelled') control.abort(new Error('cwd authorization cancelled'))
        if (race === 'parent-replaced') f.ctx.agents.get = () => ({ ...f.owner })
        if (race === 'session-replaced') f.owner.session = { ...f.owner.session }
        if (race === 'policy-changed') boundary.policy.resolve = () => ({ mode: 'danger-full-access', workspaceRoot: '/outside' })
      }
      return target
    }
    const action = f.mounted.ports.createContinuable({ agent: f.owner, signal: control.signal }, { provider: 'spawn', label: 'Race', prompt: 'Task', childId: 'race', cwd: '/fixture/tree' })
    await assert.rejects(action, race === 'cancelled' ? /cwd authorization cancelled/ : { code: 'access-denied' })
    assert.equal(starts, 0, race)
  }
})

test('native filesystem denial is not swallowed and mapping changes cannot authorize a child', options, async t => {
  let starts = 0, boundary
  const native = { initialCwdSupported: true, resolveMaxDepth: () => 2, async startContinuable() { starts++; return { childId: 'denied', messageId: 'denied' } } }
  const f = await assembly(t, {}, (_, __, ctx, owner) => { ctx.provide('subagents', native); boundary = filesystemBoundary(ctx, owner, { mode: 'workspace-write' }) })
  const exec = { agent: f.owner, signal: signal() }, request = { provider: 'spawn', label: 'Denied', prompt: 'Task', childId: 'denied', cwd: '/fixture/tree' }, original = boundary.fs.resolve
  boundary.fs.resolve = async () => { throw Object.assign(new Error('DENY_OUTSIDE'), { code: 'FS_SANDBOX_DENIED' }) }
  await assert.rejects(f.mounted.ports.createContinuable(exec, request), { code: 'FS_SANDBOX_DENIED' })
  boundary.fs.resolve = original
  boundary.fs.stat = async () => { boundary.fs.processPathFromHostPath = () => '/different/execution/world'; return { type: 'directory', version: 'changed-map' } }
  await assert.rejects(f.mounted.ports.createContinuable(exec, request), { code: 'unsupported' })
  assert.equal(starts, 0)
})

test('trusted cwd preflight authorizes scope without native creation or durable intent effects', options, async t => {
  let starts = 0
  const native = { initialCwdSupported: true, resolveMaxDepth: () => 2, async startContinuable() { starts++; throw new Error('preflight must not create a child') } }
  const f = await assembly(t, {}, (_, __, ctx, owner) => { ctx.provide('subagents', native); filesystemBoundary(ctx, owner, { mode: 'workspace-write', targets: { '/fixture/escape': '/outside/tree' } }) })
  const exec = { agent: f.owner, signal: signal() }, before = [...f.units].map(([name, rows]) => [name, [...rows]])
  assert.equal(await f.mounted.ports.authorizeInitialChildCwd(exec, '/fixture/tree'), undefined)
  await assert.rejects(f.mounted.ports.authorizeInitialChildCwd(exec, '/outside/tree'), { code: 'access-denied' })
  await assert.rejects(f.mounted.ports.authorizeInitialChildCwd(exec, '/fixture/escape'), { code: 'access-denied' })
  await assert.rejects(f.mounted.ports.authorizeInitialChildCwd(exec, 'relative'), { code: 'invalid-input' })
  await assert.rejects(f.mounted.ports.authorizeInitialChildCwd({ ...exec, agent: { ...f.owner } }, '/fixture/tree'), { code: 'access-denied' })
  assert.equal(starts, 0)
  assert.deepEqual([...f.units].map(([name, rows]) => [name, [...rows]]), before)
  f.ctx.sandboxPolicy.resolve = () => ({ mode: 'workspace-write', workspaceRoot: '/different-root' })
  await assert.rejects(f.mounted.ports.createContinuable(exec, { provider: 'spawn', label: 'Recheck', prompt: 'Task', childId: 'recheck', cwd: '/fixture/tree' }), { code: 'access-denied' })
  assert.equal(starts, 0, 'successful earlier preflight never bypasses native effect reauthorization')
})

test('cwd preflight fails closed on unsupported native capability or absent technical peers', options, async t => {
  const unsupported = await assembly(t)
  await assert.rejects(unsupported.mounted.ports.authorizeInitialChildCwd({ agent: unsupported.owner, signal: signal() }, '/fixture/tree'), { code: 'unsupported' })
  const absentPeers = await assembly(t, {}, (_, __, ctx) => ctx.provide('subagents', { initialCwdSupported: true }))
  await assert.rejects(absentPeers.mounted.ports.authorizeInitialChildCwd({ agent: absentPeers.owner, signal: signal() }, '/fixture/tree'), { code: 'unsupported' })
})

// Public host seams only: service, registered tool, native creation port. No model.
// Explicit SDK service fixture; no model, Profile or GUI.
test('continuable creation port uses only public native start, exact parent and host depth', options, async t => {
  const calls = []
  const native = { initialCwdSupported: true, resolveMaxDepth: () => 7, async startContinuable(spec) { calls.push(spec); return { childId: spec.childId, messageId: 'native-accepted' } } }
  const f = await assembly(t, {}, (_, __, ctx, owner) => { ctx.provide('subagents', native); filesystemBoundary(ctx, owner) })
  assert.equal(f.mounted.ports.capabilities.nativeInitialChildCwd, 'supported')
  const control = signal(), exec = { agent: f.owner, signal: control }
  const accepted = await f.mounted.ports.createContinuable(exec, { provider: 'spawn', childId: 'planned-child', label: 'Worker', prompt: 'Implement the task', cwd: '/prepared/tree-A' })
  assert.deepEqual(accepted, { childId: 'planned-child', messageId: 'native-accepted' })
  assert.equal(calls[0].request.parent, f.owner)
  assert.deepEqual(calls[0].request.prompt, [{ type: 'text', text: 'Implement the task' }])
  assert.equal(calls[0].request.maxDepth, 7)
  assert.equal(calls[0].cwd, '/prepared/tree-A')
  assert.equal(calls[0].signal, control)
  assert.deepEqual(Object.keys(calls[0].request).sort(), ['maxDepth', 'parent', 'prompt'])
  assert.equal(f.owner.session.header.cwd, '/fixture')
})
test('worktree registered tool routes the actual session and cannot fabricate program attribution', options, async t => {
  const calls = []
  const f = await assembly(t, { async worktreeAction(caller, sessionId, request) { calls.push({ caller, sessionId, request }); return { sessionId, request } } })
  const result = await execute(f, 'mattpocock_worktree', { action: 'read' })
  assert.equal(result.isError, false)
  assert.equal(calls[0].caller.principalId, 'agent:owner')
  assert.equal(calls[0].sessionId, 'owner')
  assert.equal((await execute(f, 'mattpocock_worktree', { action: 'read' }, { ...f.owner })).isError, true)
  assert.equal((await execute(f, 'mattpocock_worktree', { action: 'read', actualCwd: '/forged' })).isError, true)
  assert.equal((await execute(f, 'mattpocock_worktree', { action: 'program-receipt' })).isError, true)
  assert.equal(calls.length, 1)
})

test('legacy native SDK rejects explicit cwd before creating anything while omission inherits', options, async t => {
  let starts = 0, last
  const native = { resolveMaxDepth: () => undefined, async startContinuable(spec) { starts++; last = spec; return { childId: spec.childId, messageId: 'accepted' } } }
  const f = await assembly(t, {}, (_, __, ctx) => ctx.provide('subagents', native))
  assert.equal(f.mounted.ports.capabilities.nativeInitialChildCwd, 'unsupported')
  const exec = { agent: f.owner, signal: signal() }, request = { provider: 'fork', label: 'Legacy', prompt: 'Research', childId: 'legacy-child' }
  await assert.rejects(f.mounted.ports.createContinuable(exec, { ...request, cwd: '/prepared/tree' }), { code: 'unsupported' })
  assert.equal(starts, 0)
  assert.deepEqual(await f.mounted.ports.createContinuable(exec, request), { childId: 'legacy-child', messageId: 'accepted' })
  assert.equal(Object.hasOwn(last, 'cwd'), false)
  assert.equal(Object.hasOwn(last.request, 'agentOptions'), false)
  assert.equal(Object.hasOwn(last.request, 'maxDepth'), false)
  assert.equal(starts, 1)
})

test('deprecated resource tool and old UI service are read-only before reaching runtime', options, async t => {
  const requests = []
  const f = await assembly(t, { async resourceAction(_, __, request) { requests.push(request); return { request } } })
  assert.equal((await execute(f, 'mattpocock_resource', { action: 'read', resourceId: 'R' })).isError, false)
  assert.equal((await execute(f, 'mattpocock_resource', { action: 'borrow', path: '/prepared/tree' })).isError, true)
  await assert.rejects(f.invoke('resourceAction', { sessionId: 'owner', request: { action: 'retain', resourceId: 'R' } }), { code: 'feature-disabled' })
  assert.equal(requests.length, 1)
  assert.match(f.ctx.tools.get('mattpocock_resource').description, /deprecated|read.only/i)
})

test('delegate tool preserves native permission pipeline and accepts only safe creation fields', options, async t => {
  const calls = []
  const f = await assembly(t, { async delegate(caller, request, exec) { calls.push({ caller, request, exec }); return { accepted: true } } })
  const request = { description: 'Worker', prompt: 'Implement', provider: 'fork', worktree: '/prepared/tree-A', operationId: 'OP', workflowId: 'WF', ticketIds: ['T'] }
  const result = await execute(f, 'mattpocock_delegate', request)
  assert.equal(result.isError, false)
  assert.equal(calls[0].caller.principalId, 'agent:owner')
  assert.equal(calls[0].exec.agent, f.owner)
  assert.deepEqual(calls[0].request, request)
  for (const field of ['childId', 'agentOptions', 'cwd', 'maxDepth', 'actualCwd', 'author', 'model', 'reasoning_effort']) {
    assert.equal((await execute(f, 'mattpocock_delegate', { ...request, [field]: 'forged' })).isError, true, field)
  }
  const remove = f.ctx.tools.guard({ name: 'deny-collaboration', preflight({ execution }) { return execution.name === 'mattpocock_delegate' ? { kind: 'reject', error: 'native policy denied' } : { kind: 'allow' } } })
  t.after(remove)
  assert.equal((await execute(f, 'mattpocock_delegate', request)).isError, true)
  assert.equal(calls.length, 1)
  assert.match(f.ctx.tools.get('mattpocock_delegate').description, /send_message/)
})

test('worktree service routes strict operator input and rejects unavailable old runtimes explicitly', options, async t => {
  const f = await assembly(t, { async worktreeAction(caller, sessionId, request) { return { principalId: caller.principalId, sessionId, request } } })
  assert.deepEqual(await f.invoke('worktreeAction', { sessionId: 'owner', request: { action: 'read' } }), { principalId: 'user:operator', sessionId: 'owner', request: { action: 'read' } })
  await assert.rejects(f.invoke('worktreeAction', { sessionId: 'owner', request: { action: 'read', illegal: undefined } }))
  const legacy = await assembly(t)
  await assert.rejects(legacy.invoke('historyAction', { sessionId: 'owner', request: { action: 'query' } }), { code: 'feature-disabled' })
  await assert.rejects(legacy.invoke('worktreeAction', { sessionId: 'owner', request: { action: 'read' } }), { code: 'feature-disabled' })
})

test('history registered tool exposes all retained-history actions without caller or receipt forgery', options, async t => {
  const calls = []
  const f = await assembly(t, { async historyAction(caller, sessionId, request) { calls.push({ caller, sessionId, request }); return { action: request.action } } })
  const requests = [
    { action: 'query', query: { kind: 'worktree', recordId: 'R', limit: 2 } },
    { action: 'detail', historyIds: ['H'] },
    { action: 'set-context', kind: 'ticket', recordId: 'T', included: false },
    { action: 'purge', range: { fromSequence: 1, toSequence: 2 }, archivedOnly: true },
    { action: 'compact' },
  ]
  for (const request of requests) assert.equal((await execute(f, 'mattpocock_history', request)).isError, false)
  assert.equal(calls.length, 5)
  for (const call of calls) { assert.equal(call.caller.principalId, 'agent:owner'); assert.equal(call.sessionId, 'owner') }
  assert.equal((await execute(f, 'mattpocock_history', { action: 'query', query: {}, principalId: 'user:operator' })).isError, true)
  assert.equal((await execute(f, 'mattpocock_history', { action: 'receipt' })).isError, true)
  assert.equal(calls.length, 5)
})


test('native creation port rejects opaque options, invalid paths, impostors and cancellation before dispatch', options, async t => {
  let starts = 0
  const native = { initialCwdSupported: true, resolveMaxDepth: () => 2, async startContinuable(spec) { starts++; return { childId: spec.childId, messageId: 'accepted' } } }
  const f = await assembly(t, {}, (_, __, ctx) => ctx.provide('subagents', native))
  const request = { provider: 'spawn', label: 'Worker', prompt: 'Task', childId: 'reserved' }, exec = { agent: f.owner, signal: signal() }
  for (const extra of [{ agentOptions: { model: 'forged' } }, { maxDepth: 999 }, { cwd: 'relative' }, { cwd: '/tree/../other' }, { prompt: () => 'opaque' }, { provider: 'external' }, { parent: f.owner }]) {
    await assert.rejects(f.mounted.ports.createContinuable(exec, { ...request, ...extra }), { code: 'invalid-input' })
  }
  await assert.rejects(f.mounted.ports.createContinuable({ ...exec, agent: { ...f.owner } }, request), { code: 'access-denied' })
  const cancelled = new AbortController(); cancelled.abort(new Error('cancelled before native request'))
  await assert.rejects(f.mounted.ports.createContinuable({ ...exec, signal: cancelled.signal }, request), /cancelled before native request/)
  native.initialCwdSupported = 'true'
  assert.equal(f.mounted.ports.capabilities.nativeInitialChildCwd, 'unsupported')
  await assert.rejects(f.mounted.ports.createContinuable(exec, { ...request, cwd: '/tree' }), { code: 'unsupported' })
  assert.equal(starts, 0)
})

test('native inbox acceptance is not converted into a metadata checkpoint or post-acceptance failure', options, async t => {
  const controller = new AbortController()
  const native = { initialCwdSupported: true, resolveMaxDepth: () => 2, async startContinuable(spec) { controller.abort(); return { childId: spec.childId, messageId: 'inbox-only' } } }
  const f = await assembly(t, {}, (_, __, ctx) => {
    ctx.provide('subagents', native)
    ctx.provide('sessions', { async flush() { throw new Error('creation port must not claim durability') } })
  })
  const accepted = await f.mounted.ports.createContinuable({ agent: f.owner, signal: controller.signal }, { provider: 'fork', label: 'Accepted', prompt: 'Follow task', childId: 'accepted-native' })
  assert.deepEqual(accepted, { childId: 'accepted-native', messageId: 'inbox-only' })
  assert.equal(f.mounted.ports.liveAgent('accepted-native'), undefined)
})

test('session durability port checkpoints only actual live sessions and preserves false persistence receipts', options, async t => {
  const checkpoints = []
  const f = await assembly(t, {}, (_, __, ctx) => ctx.provide('sessions', { async flush(session) { checkpoints.push(session); return false } }))
  assert.equal(await f.mounted.ports.flushSession('owner', signal()), false)
  assert.equal(checkpoints[0], f.owner.session)
  assert.equal(await f.mounted.ports.flushSession('no-live-child', signal()), false)
  assert.equal(checkpoints.length, 1)
  f.ctx.sessions.flush = async session => { checkpoints.push(session); return true }
  assert.equal(await f.mounted.ports.flushSession('owner', signal()), true)
  f.ctx.sessions.flush = async () => { throw new Error('checkpoint rejected after native acceptance') }
  await assert.rejects(f.mounted.ports.flushSession('owner', signal()), /checkpoint rejected after native acceptance/)
})

const execute = (f, name, request, agent = f.owner) => f.ctx.tools.execute({ name, arguments: { request }, callId: 'collaboration-call', agent, signal: signal() })

test('history service authenticates the operator and crosses only strict JSON to the runtime', options, async t => {
  const calls = []
  const f = await assembly(t, { async historyAction(caller, sessionId, request, control) { calls.push({ caller, sessionId, request, control }); return { action: request.action, sessionId } } })
  assert.deepEqual(await f.invoke('historyAction', { sessionId: 'owner', request: { action: 'query', limit: 5 } }), { action: 'query', sessionId: 'owner' })
  assert.equal(calls[0].caller.principalId, 'user:operator')
  assert.equal(calls[0].control.aborted, false)
  await assert.rejects(f.invoke('historyAction', { sessionId: 'owner', request: { action: 'query' } }, { id: 'stranger', ctx: f.ctx, async dispose() {} }))
  await assert.rejects(f.invoke('historyAction', { sessionId: 'owner', request: { action: 'query', forged: undefined } }))
  assert.equal(calls.length, 1)
})
