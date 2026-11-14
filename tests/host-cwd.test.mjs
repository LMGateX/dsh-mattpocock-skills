import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire, registerHooks } from 'node:module'
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, isAbsolute } from 'node:path'
import { executeRegistryTool } from './fixtures/nested-tool.mjs'
import { pathToFileURL } from 'node:url'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { operatorPeer } from './fixtures/peer.mjs'

// Real installed-host native cwd seam: the current SDK's startActivation carries the
// initial directory. This plugin loads no replacement provider, so these probes do not
// stage the retired 0.2.1-alpha.1 artifact or host patches.
const hostRoot = process.env.DSH_CONTROLS_HOST_ROOT
const options = { skip: !hostRoot && 'set DSH_CONTROLS_HOST_ROOT to run real native activation cwd probes' }
const signal = () => new AbortController().signal
let sdk, load, mountHost
if (hostRoot) {
  assert(isAbsolute(hostRoot))
  const require = createRequire(pathToFileURL(join(hostRoot, 'package.json')))
  load = name => import(pathToFileURL(require.resolve(name)).href)
  const sourceRoot = new URL('../src/', import.meta.url).href
  registerHooks({
    resolve(specifier, context, next) {
      if (context.parentURL?.startsWith(sourceRoot) && specifier.startsWith('.')) specifier = specifier.endsWith('.js') ? specifier.slice(0, -3) + '.ts' : specifier
      if ((specifier.startsWith('@deepseek-ai/') || specifier === 'zod') && context.parentURL?.startsWith(sourceRoot)) return { url: pathToFileURL(require.resolve(specifier)).href, shortCircuit: true }
      return next(specifier, context)
    },
    load(url, context, next) {
      if (url.startsWith(sourceRoot) && url.endsWith('.ts')) return { format: 'module', source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText, shortCircuit: true }
      return next(url, context)
    },
  })
  ;({ mountHost } = await import('../src/host.ts'))
  sdk = { ...await load('@deepseek-ai/cordis'), ...await load('@deepseek-ai/dsh-agent'),
    ...await load('@deepseek-ai/dsh-session'), ...await load('@deepseek-ai/dsh-agent-loop'),
    ...await load('@deepseek-ai/dsh-session-projection'), ...await load('@deepseek-ai/dsh-system-prompt'),
    ...await load('@deepseek-ai/dsh-tools'), ...await load('@deepseek-ai/dsh-typert-registry'),
    ...await load('@deepseek-ai/dsh-storage-domain'), ...await load('@deepseek-ai/dsh-sandbox-policy'),
    Subagents: (await load('@deepseek-ai/dsh-subagent')).default,
    jsonl: await load('@deepseek-ai/dsh-session-persistence-jsonl'),
    Query: (await load('@deepseek-ai/dsh-session-query-sqlite')).default,
    LocalFs: (await load('@deepseek-ai/dsh-fs-local')).default,
    fsTools: await load('@deepseek-ai/dsh-tool-fs'),
    WorkingDirectory: (await load('@deepseek-ai/dsh-working-directory')).default }
}

async function fixture(t, { prepare = async () => ({}), mounted = false } = {}) {
  const temp = await mkdtemp(join(tmpdir(), 'dsh-native-cwd-'))
  const pathA = await realpath(await mkdir(join(temp, 'A'), { recursive: true }))
  const pathB = await realpath(await mkdir(join(temp, 'B'), { recursive: true }))
  await writeFile(join(pathA, 'marker.txt'), 'A native tool')
  await writeFile(join(pathB, 'marker.txt'), 'B native tool')
  const ctx = new sdk.Context()
  let modelCalls = 0
  const activations = [], prepared = [], starts = [], cleanups = []
  let release = Promise.withResolvers()
  const releases = [release]
  t.after(async () => {
    for (const item of releases) item.resolve({ kind: 'reject' })
    for (const activation of activations.reverse()) { try { await activation.dispose() } catch {} }
    for (const cleanup of cleanups.reverse()) await cleanup()
    await parentHandle.dispose()
    const registry = ctx.agents
    await ctx.fiber.dispose()
    assert.deepEqual(registry.list(), [], 'native teardown must release every fixture Agent')
    assert.equal(modelCalls, 0, 'no model adapter or model request may run')
    await rm(temp, { recursive: true, force: true })
  })
  await ctx.plugin(sdk.TypertRegistry)
  await ctx.plugin(sdk.SessionStore)
  await ctx.plugin(sdk.AgentRegistry)
  await ctx.plugin(sdk.SessionProjectionRegistry)
  await ctx.plugin(sdk.SystemPrompt, {})
  await ctx.plugin(sdk.ToolRuntime, {})
  // Only split-executor registries need this package; older hosts execute directly.
  if (typeof ctx.tools.setExecutor === 'function') await ctx.plugin(await load('@deepseek-ai/dsh-tool-executor-native'))
  await sdk.jsonl.apply(ctx, { root: join(temp, 'sessions'), compression: 'none' })
  await ctx.plugin(sdk.Query, { path: join(temp, 'query.sqlite'), openAt: 'never' })
  ctx.provide('llm', { prepareCall() { modelCalls++; throw new Error('model prohibited') }, stream() { modelCalls++; throw new Error('model prohibited') } })
  await ctx.plugin(sdk.LocalFs, { cwd: pathA, diffBasisMaxBytes: 10485760 })
  await ctx.plugin(sdk.fsTools, { readLimit: 2000, readMaxLineLength: 10000, readMaxBytes: 100000, readStreamMinSize: 10000000 })
  await ctx.plugin(sdk.WorkingDirectory, { defaultDirectory: pathA })
  await ctx.plugin(sdk.AgentLoop, { agents: [], maxParallelToolCalls: 10 })
  await ctx.plugin(sdk.Subagents, { maxDepth: 5, maxActiveSubagents: 20 })
  const provider = {
    capabilities: { agentOptions: false, agentPreset: false, outputSchema: false, depthLimit: true },
    inheritsParentContext: false, async prepareContinuable(request) { prepared.push(request); return prepare(request) } }
  const unregister = ctx.subagents.registerProvider({ ...provider, name: 'controlled' })
  ctx.subagents.registerProvider({ ...provider, name: 'spawn' })
  ctx.subagents.registerProvider({ ...provider, name: 'fork' })
  ctx.on('subagent/start', info => { starts.push(info) })
  await ctx.fiber.await()
  const parentHandle = await ctx.agents.create({ sessionId: 'parent', meta: { cwd: pathA } })
  const parent = parentHandle.agent
  let host
  if (mounted) {
    ctx.provide('connection', { operator: operatorPeer(ctx), rpc: { intercept() { return async () => {} } } })
    const workspace = { id: 'native-workspace', path: temp, title: 'Native fixture', status: async () => 'ok', sessionIds: [parent.id] }
    ctx.provide('workspaceRegistry', { get: id => id === workspace.id ? workspace : undefined, resolveByPath: async () => workspace, list: () => [workspace] })
    await ctx.plugin(sdk.SandboxPolicyService, { mode: 'read-only', workspaceRoot: temp })
    const backend = { kv: { async open() {
      const rows = {}
      return { async loadAll() { return { global: null, tables: { records: rows } } }, async putRecord(_table, key, value) { rows[key] = structuredClone(value) }, async deleteRecord(_table, key) { delete rows[key] }, async close() {} }
    } } }
    ctx.provide('storage', { backend: { get: () => backend } })
    const domains = new sdk.DomainFacility(ctx, { backend: 'native-fixture' })
    ctx.provide('storageDomain', domains)
    host = await mountHost(ctx, { createRuntime: async () => ({ async created() {}, async observe() {}, async preStep() { return [] }, async dispose() {} }) })
    cleanups.push(async () => { await host.dispose(); await domains.closeAll() })
  }
  const start = async (cwd, extra = {}) => {
    const activation = await ctx.subagents.startActivation({ provider: 'controlled', label: 'native cwd probe',
      parent, prompt: [{ type: 'text', text: 'No model. Controlled native inbox.' }], maxDepth: 5, ...(cwd === undefined ? {} : { cwd }),
      signal: signal(), delivery: 'parent', ...extra })
    activations.push(activation)
    return activation
  }
  return { ctx, parent, pathA, pathB, start, temp, unregister, host, prepared, starts,
    releaseStep() { release.resolve({ kind: 'reject' }) },
    pauseStep() { release = Promise.withResolvers(); releases.push(release) } }
}

test('mounted creation port starts exactly one real RC3 child per reserved id in A, B, and inherited cwd', options, async t => {
  const f = await fixture(t, { mounted: true })
  const ids = ['mounted-A', 'mounted-B', 'mounted-inherited']
  for (const [index, cwd] of [f.pathA, f.pathB, undefined].entries()) {
    const childId = ids[index]
    const provider = index === 1 ? 'fork' : 'spawn'
    const receipt = await f.host.ports.createContinuable({ agent: f.parent, signal: signal() }, { provider, childId, label: 'Mounted native cwd', prompt: 'No model', ...(cwd === undefined ? {} : { cwd }) })
    assert.equal(f.prepared[index].parent, f.parent)
    assert.equal(f.prepared[index].sessionId, childId)
    assert.equal(f.prepared[index].cwd, cwd ?? f.pathA)
    assert.equal(f.starts[index].provider, provider)
    assert.equal(receipt.childId, childId)
    assert.equal(typeof receipt.messageId, 'string')
    assert(receipt.messageId.length > 0, 'real native inbox acceptance required')
    const child = f.ctx.agents.get(childId)
    assert(child, 'real registry must contain the reserved child')
    assert.equal(f.ctx.workingDirectory.get(child.session), cwd ?? f.pathA)
    assert.equal(f.ctx.sandboxPolicy.resolve({ session: child.session }).mode, 'read-only', 'directory selection never widens inherited file policy')
    assert.equal(child.session.header.cwd, f.pathA, 'header is the inherited source, not effective cwd')
    const read = await executeRegistryTool(f.ctx, { callId: 'mounted-read-' + childId, name: 'read', arguments: { file_path: 'marker.txt' }, agent: child, signal: signal() }, load)
    assert.equal(read.isError, false, JSON.stringify(read))
    assert.equal(read.value.lines[0].text, cwd === f.pathB ? 'B native tool' : 'A native tool')
    assert.equal(read.value.path, join(cwd ?? f.pathA, 'marker.txt'))
  }
  assert.equal(f.prepared.length, 3, 'one native preparation for each requested child; no probe or retry')
  assert.deepEqual(f.starts.map(info => String(info.id)).sort(), [...ids].sort())
  assert.equal(new Set(f.starts.map(info => String(info.id))).size, 3)
  assert.equal(f.parent.session.header.cwd, f.pathA)
  await f.host.dispose()
  await assert.rejects(f.host.ports.createContinuable({ agent: f.parent, signal: signal() }, { provider: 'spawn', childId: 'after-dispose', label: 'Stopped', prompt: 'No model' }))
  assert.equal(f.prepared.length, 3)
})

test('mounted native creation rejects invalid cwd, impostor and pre-cancel without publishing a child', options, async t => {
  const f = await fixture(t, { mounted: true })
  const request = { provider: 'spawn', childId: 'denied-mounted', label: 'Denied', prompt: 'No model' }
  for (const cwd of [join(f.temp, 'missing'), join(f.pathA, 'marker.txt')]) {
    await assert.rejects(f.host.ports.createContinuable({ agent: f.parent, signal: signal() }, { ...request, cwd }), { code: 'access-denied' })
  }
  await assert.rejects(f.host.ports.createContinuable({ agent: { ...f.parent }, signal: signal() }, request), { code: 'access-denied' })
  const control = new AbortController(); control.abort(new Error('cancelled before native activation'))
  await assert.rejects(f.host.ports.createContinuable({ agent: f.parent, signal: control.signal }, request), /cancelled before native activation/)
  assert.equal(f.prepared.length, 0)
  assert.equal(f.starts.length, 0)
  assert.equal(f.ctx.agents.get(request.childId), undefined)
})

test('mounted native cancellation during awaited preparation cleans partial resources without another child', options, async t => {
  const entered = Promise.withResolvers(), proceed = Promise.withResolvers()
  t.after(() => proceed.resolve())
  const f = await fixture(t, { mounted: true, prepare: async () => { entered.resolve(); await proceed.promise; return {} } })
  const control = new AbortController()
  const operation = f.host.ports.createContinuable({ agent: f.parent, signal: control.signal }, { provider: 'spawn', childId: 'cancelled-mounted', label: 'Cancel native', prompt: 'No model', cwd: f.pathB })
  const rejected = assert.rejects(operation, /cancelled during native preparation/)
  await entered.promise
  control.abort(new Error('cancelled during native preparation'))
  proceed.resolve()
  await rejected
  assert.equal(f.prepared.length, 1, 'native failure is not retried')
  assert.equal(f.starts.length, 0)
  assert.equal(f.ctx.agents.get('cancelled-mounted'), undefined)
  assert.deepEqual(f.ctx.agents.list().map(agent => String(agent.id)), [String(f.parent.id)])
})

test('native activation relative read resolves independently for two real child Agents in A and B', options, async t => {
  const f = await fixture(t)
  const [a, b] = await Promise.all([f.start(f.pathA), f.start(f.pathB)])
  const read = childId => executeRegistryTool(f.ctx, { callId: 'read-' + childId, name: 'read', arguments: { file_path: 'marker.txt' }, agent: f.ctx.agents.get(childId), signal: signal() }, load)
  const [resultA, resultB] = await Promise.all([read(a.childId), read(b.childId)])
  assert.equal(resultA.isError, false, JSON.stringify(resultA))
  assert.equal(resultB.isError, false, JSON.stringify(resultB))
  assert.equal(resultA.value.lines[0].text, 'A native tool')
  assert.equal(resultB.value.lines[0].text, 'B native tool')
  assert.equal(resultA.value.path, join(f.pathA, 'marker.txt'))
  assert.equal(resultB.value.path, join(f.pathB, 'marker.txt'))
  assert.equal(f.parent.session.header.cwd, f.pathA)
})

test('native activation records B as the effective child working directory and preserves the inherited header source value', options, async t => {
  const f = await fixture(t)
  const started = await f.start(f.pathB)
  const child = f.ctx.agents.get(started.childId)
  assert(child, 'real AgentRegistry must publish a child')
  assert.equal(child.constructor.name, 'ReactLoopAgent')
  // The current host records the chosen initial directory in the session's
  // working-directory projection; the child header cwd remains the source
  // value inherited from the parent, matching the plugin's headerCwd contract.
  assert.equal(f.ctx.workingDirectory.get(child.session), f.pathB)
  assert.equal(child.session.header.cwd, f.pathA)
  assert(Object.isFrozen(child.session.header))
  assert(child.session.ownEvents().some(event => event.type === 'working-directory/change' && event.data.cwd === f.pathB))
  assert.equal((await f.ctx.sessionPersistence.stat(started.childId)).header.cwd, f.pathA)
})

test('first activation cwd is captured before awaited prepare while omitted cwd retains A inheritance', options, async t => {
  const ready = Promise.withResolvers(), proceed = Promise.withResolvers()
  const f = await fixture(t, { prepare: async () => { ready.resolve(); await proceed.promise; return {} } })
  const spec = { provider: 'controlled', label: 'capture', childId: 'captured', parent: f.parent, prompt: [{ type: 'text', text: 'captured B' }], maxDepth: 5, cwd: f.pathB, signal: signal(), delivery: 'parent' }
  const operation = f.ctx.subagents.startActivation(spec)
  await ready.promise
  spec.cwd = f.pathA
  proceed.resolve()
  const created = await operation
  assert.equal(f.ctx.workingDirectory.get(f.ctx.agents.get(created.childId).session), f.pathB)
  await created.dispose()
  const inherited = await f.start(undefined)
  assert.equal(f.ctx.workingDirectory.get(f.ctx.agents.get(inherited.childId).session), f.pathA)
  assert.equal(f.parent.session.header.cwd, f.pathA)
})

test('invalid absolute first cwd rejects without publishing a live child', options, async t => {
  const f = await fixture(t)
  let index = 0
  for (const cwd of [join(f.temp, 'missing'), join(f.pathA, 'marker.txt')]) {
    index += 1
    await assert.rejects(f.start(cwd, { childId: 'invalid-child-' + index }), /directory does not exist|does not exist|not a directory/)
    assert.equal(f.ctx.agents.get('invalid-child-' + index), undefined)
  }
})
