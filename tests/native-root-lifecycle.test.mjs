import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { host, createRuntime, loadSDK, caller, signal, sdk as baseSDK } from './fixtures/runtime-host.mjs'
import { operatorPeer } from './fixtures/peer.mjs'

const options = { skip: !process.env.DSH_CONTROLS_HOST_ROOT && 'set DSH_CONTROLS_HOST_ROOT for native subagent lifecycle probes' }
const until = async predicate => {
  for (let i = 0; i < 400; i++) {
    if (await predicate()) return
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  assert.fail('native lifecycle did not settle')
}

// Native AgentRegistry/AgentLoop/Session/SubagentRuntime/JSONL/Query, public creation and
// cold wake. The only execution gate is public agent/pre-step; no model adapter is run.
test('native cold creators, cold wake and Host remount keep the exact runtime-root runner', options, async t => {
  const sdk = { ...baseSDK, ...await loadSDK('@deepseek-ai/dsh-agent'),
    ...await loadSDK('@deepseek-ai/dsh-session'), ...await loadSDK('@deepseek-ai/dsh-agent-loop'),
    Subagents: (await loadSDK('@deepseek-ai/dsh-subagent')).default,
    jsonl: await loadSDK('@deepseek-ai/dsh-session-persistence-jsonl'),
    Query: (await loadSDK('@deepseek-ai/dsh-session-query-sqlite')).default,
    LocalFs: (await loadSDK('@deepseek-ai/dsh-fs-local')).default,
    WorkingDirectory: (await loadSDK('@deepseek-ai/dsh-working-directory')).default }
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'dsh-native-root-')))
  const ctx = new sdk.Context(), gates = new Map(), handles = [], mounts = []
  let modelCalls = 0
  t.after(async () => {
    for (const gate of gates.values()) gate.resolve()
    for (const mount of mounts.reverse()) await mount.dispose()
    for (const handle of handles.reverse()) await handle.dispose()
    await ctx.fiber.dispose()
    assert.equal(modelCalls, 0, 'the native probe cannot invoke a model')
    assert.equal(ctx.agents?.list().length ?? 0, 0)
    assert(temp.startsWith(tmpdir() + '/dsh-native-root-'))
    await rm(temp, { recursive: true, force: true })
  })
  await ctx.plugin(sdk.TypertRegistry); await ctx.plugin(sdk.SessionStore)
  await ctx.plugin(sdk.AgentRegistry); await ctx.plugin(sdk.SessionProjectionRegistry)
  await ctx.plugin(sdk.SystemPrompt, {}); await ctx.plugin(sdk.ToolRuntime, {})
  if (typeof ctx.tools.setExecutor === 'function') await ctx.plugin(await loadSDK('@deepseek-ai/dsh-tool-executor-native'))
  await sdk.jsonl.apply(ctx, { root: join(temp, 'sessions'), compression: 'none' })
  await ctx.plugin(sdk.Query, { path: join(temp, 'query.sqlite'), openAt: 'never' })
  ctx.provide('llm', { prepareCall() { modelCalls++; throw new Error('model prohibited') }, stream() { modelCalls++; throw new Error('model prohibited') } })
  await ctx.plugin(sdk.LocalFs, { cwd: temp, diffBasisMaxBytes: 10485760 })
  await ctx.plugin(sdk.WorkingDirectory, { defaultDirectory: temp })
  await ctx.plugin(sdk.AgentLoop, { agents: [], maxParallelToolCalls: 10 })
  await ctx.plugin(sdk.Subagents, { maxDepth: 6, maxActiveSubagents: 20 })
  ctx.subagents.registerProvider({ name: 'count-probe', inheritsParentContext: false,
    capabilities: { agentOptions: true, agentPreset: false, outputSchema: false, depthLimit: true },
    async prepareContinuable() { return {} } })
  ctx.on('agent/pre-step', async ({ agent, signal: control }) => {
    const gate = gates.get(agent.id)
    if (gate) await new Promise((resolve, reject) => {
      const abort = () => reject(control.reason)
      control.addEventListener('abort', abort, { once: true })
      gate.promise.then(() => { control.removeEventListener('abort', abort); resolve() }, reject)
      if (control.aborted) abort()
    })
    return { kind: 'reject' }
  })
  await ctx.fiber.await()
  const parent = await ctx.agents.create({ sessionId: 'root', meta: { cwd: temp }, agentOptions: { provider: 'none', model: 'none' } }); handles.push(parent)
  const start = async (owner, id) => {
    gates.set(id, Promise.withResolvers())
    const activation = await ctx.subagents.startActivation({ parent: owner, childId: id, provider: 'count-probe', label: id, name: id,
      prompt: [{ type: 'text', text: 'No model. Public pre-step gate.' }], maxDepth: 6,
      agentOptions: { provider: 'none', model: 'none' }, delivery: 'parent', signal: signal() })
    await until(() => ctx.agents.get(activation.childId)?.status === 'running')
    return ctx.agents.get(activation.childId)
  }
  const a = await start(parent.agent, 'a'), b = await start(a, 'b'), c = await start(b, 'c')
  const ordinary = await ctx.agents.create({ sessionId: 'fork', meta: { cwd: temp, parentSession: 'root' }, agentOptions: { provider: 'none', model: 'none' } }); handles.push(ordinary)
  const outside = await start(ordinary.agent, 'fork-child')
  assert.equal(ctx.subagents.rootOf(outside), ordinary.agent)
  gates.get('a').resolve(); gates.get('b').resolve()
  await until(() => ctx.agents.get('a') === undefined && ctx.agents.get('b') === undefined)
  assert.equal(ctx.subagents.rootOf(c), parent.agent)
  assert.equal(c.session.header.parentSession, 'b')
  assert.equal(ctx.sessions.get('a'), undefined); assert.equal(ctx.sessions.get('b'), undefined)
  const catalogObservation = await ctx.sessionQuery.observeSession(parent.agent.id, { signal: signal() })
  try { assert.equal(catalogObservation.projections.values.subagentCatalog.find(row => row.id === 'a').name, 'a') }
  finally { catalogObservation[Symbol.dispose]() }

  let walks = 0, observations = 0, leases = 0
  const listDescendants = ctx.subagents.listDescendants.bind(ctx.subagents)
  ctx.subagents.listDescendants = (...args) => { walks++; return listDescendants(...args) }
  const observeSession = ctx.sessionQuery.observeSession.bind(ctx.sessionQuery)
  ctx.sessionQuery.observeSession = async (...args) => {
    observations++; const observation = await observeSession(...args); leases++
    let disposed = false
    return new Proxy(observation, { get(target, key) {
      if (key === Symbol.dispose) return () => { assert.equal(disposed, false); disposed = true; leases--; target[Symbol.dispose]() }
      return Reflect.get(target, key, target)
    } })
  }

  // Plugin-owned storage stays isolated in memory; native session persistence is actual JSONL.
  const units = new Map()
  const backend = { kv: { async open(descriptor) {
    let rows = units.get(descriptor.name); if (!rows) { rows = new Map(); units.set(descriptor.name, rows) }
    return { async loadAll() { return { global: null, tables: { records: Object.fromEntries(rows) } } },
      async putRecord(_table, key, value) { rows.set(key, structuredClone(value)) }, async deleteRecord(_table, key) { rows.delete(key) }, async close() {} }
  } } }
  ctx.provide('storage', { backend: { get: () => backend } })
  const domain = new sdk.DomainFacility(ctx, { backend: 'fixture' }); ctx.provide('storageDomain', domain)
  t.after(() => domain.closeAll())
  const peer = operatorPeer(ctx)
  ctx.provide('connection', { operator: peer, rpc: { intercept() { return async () => {} } } })
  const workspace = { id: 'W', path: temp, title: 'Native count probe', status: async () => 'ok' }
  ctx.provide('workspaceRegistry', { get: id => id === 'W' ? workspace : undefined, list: () => [workspace], resolveByPath: async path => path === temp ? workspace : undefined })
  let runtime
  const mount = async () => {
    let value, fiber
    await ctx.plugin({ inject: ['storageDomain', 'tools', 'agents', 'workspaceRegistry', 'sessionQuery', 'systemPrompt', 'typert', 'connection'], async apply(child) {
      fiber = child.fiber
      value = await host.mountHost(child, { async createRuntime(ports) { runtime = await createRuntime(ports); return runtime } })
    } })
    const owned = { ...value, async dispose() { await value.dispose(); await fiber.dispose() } }
    mounts.push(owned); return owned
  }
  let mounted = await mount()
  const read = () => runtime.readSession(caller('root'), 'root', signal())
  const first = await read()
  assert.equal(first.windows.S.used, 1, 'fork child is excluded and the two cold creator edges cannot lose c')
  assert.equal(first.windows.S.countKnown, true)
  assert.deepEqual(first.windows.S.depth, { direct: 0, deeper: 0, unknown: 1, levels: {} })
  await until(() => leases === 0)
  assert.equal(walks, 0, 'native catalog enrichment reads one public parent projection, never listDescendants')
  const baseline = observations
  for (let i = 0; i < 3; i++) await mounted.ports.nativeSubagentActivity('root')
  assert.equal(observations, baseline, 'ordinary native count reads perform no catalog or SessionQuery I/O')
  await mounted.dispose(); mounts.pop(); mounted = await mount()
  assert.equal((await read()).windows.S.used, 1, 'hot remount has no old counter membership to help')
  assert.equal((await runtime.readModelCurrent(caller('root'), 'root', signal())).windows.S.used, 1)
  gates.get('c').resolve(); await until(() => ctx.agents.get('c') === undefined)
  await until(() => mounted.ports.nativeSubagentStops('root').some(row => row.sessionId === 'c'))
  const stopped = await read()
  assert.equal(stopped.windows.S.used, 0)
  assert.equal(stopped.nativeStops.filter(row => row.sessionId === 'c').length, 1)
  assert.equal(stopped.nativeStops.find(row => row.sessionId === 'c').outcome, 'refusal')
  gates.set('c', Promise.withResolvers())
  await ctx.subagents.sendMessage(parent.agent, 'c', [{ type: 'text', text: 'Cold wake without a model' }], { signal: signal() })
  await until(() => ctx.agents.get('c')?.status === 'running')
  const recovered = ctx.agents.get('c')
  assert.notEqual(recovered, c)
  assert.equal(ctx.subagents.rootOf(recovered), parent.agent)
  assert.equal(recovered.session.header.parentSession, 'b')
  const awake = await read()
  assert.equal(awake.windows.S.used, 1)
  assert.equal(awake.windows.S.countKnown, true)
  assert.equal(awake.nativeStops.filter(row => row.sessionId === 'c').length, 0, 'the actual cold wake clears the prior turn stop')
  await mounted.dispose(); mounts.pop(); await mount()
  assert.equal((await read()).windows.S.used, 1, 'a second remount sees the recovered exact Agent')
  assert.equal(modelCalls, 0)
  assert.equal(walks, 0)
  await until(() => leases === 0)
})
