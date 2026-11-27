import assert from 'node:assert/strict'
import { test } from 'node:test'
import { actualAgent, createRuntime, host, loadSDK, mountedFixture, operator, policy, sdk, signal } from './fixtures/runtime-host.mjs'
import { operatorPeer } from './fixtures/peer.mjs'
import { executeRegistryTool } from './fixtures/nested-tool.mjs'

const installedHost = { skip: !process.env.DSH_CONTROLS_HOST_ROOT && 'set DSH_CONTROLS_HOST_ROOT for installed-host probes' }
const resolve = (ctx, agent) => ctx.tools.resolve({ agent, modelSelection: { provider: 'fixture', model: 'fixture' }, signal: signal() })
const owned = (ctx, agent, toolSet) => ctx.tools.schemas(agent, toolSet).map(t => t.name).filter(name => name.startsWith('mattpocock_'))
const execute = (ctx, agent, toolSet) => executeRegistryTool(ctx, { name: 'mattpocock_controls', arguments: { request: { action: 'read' } }, callId: 'silent-controls', agent, signal: signal(), toolSet }, loadSDK)

test('settings turn off collaboration in existing owner and child tool sets without changing another workspace', installedHost, async t => {
  const wA = { id: 'A', path: '/a', status: async () => 'ok' }
  const wB = { id: 'B', path: '/b', status: async () => 'ok' }
  const f = await mountedFixture(t, { delegate: true, configureBeforeMount({ ctx, agents }) {
    for (const a of [actualAgent('a', { cwd: '/a' }), actualAgent('b', { cwd: '/b' }), actualAgent('a-child', { parent: 'a', managed: true, cwd: '/b' })]) agents.set(a.id, a)
    const workspaces = [wA, wB]
    Object.assign(ctx.workspaceRegistry, { get: id => workspaces.find(w => w.id === id), list: () => workspaces, resolveByPath: async path => workspaces.find(w => w.path === path) })
  } })
  const { ctx, agents, runtime } = f
  const a = agents.get('a'), b = agents.get('b'), child = agents.get('a-child')
  const enabled = policy()
  await runtime.savePolicy(operator, enabled, 0, signal())
  const oldSet = await resolve(ctx, a)
  t.after(() => oldSet.dispose())
  assert(owned(ctx, a, oldSet).includes('mattpocock_controls'))
  assert.equal((await execute(ctx, a, oldSet)).isError, false)
  await runtime.savePolicy(operator, { ...enabled, workspaceOverrides: { A: { workspace: { enabled: false } } } }, 1, signal())
  for (const agent of [a, child]) {
    const set = await resolve(ctx, agent)
    try {
      assert.deepEqual(owned(ctx, agent, set), [])
      assert.equal((await execute(ctx, agent, set)).isError, true)
    } finally { set.dispose() }
  }
  assert.equal((await execute(ctx, a, oldSet)).isError, true, 'stale admitted sets cannot enter plugin effects')
  const other = await resolve(ctx, b)
  try { assert(owned(ctx, b, other).includes('mattpocock_delegate')); assert.equal((await execute(ctx, b, other)).isError, false) }
  finally { other.dispose() }
})

// Capture the actual AgentLoop request at a local inert model adapter; no service, profile, or network.
for (const executor of ['native', 'ptc']) test(`${executor}: existing session drops owned replay on its next model request without erasing history`, installedHost, async t => {
  const [{ AgentRegistry }, { AgentLoop }, { SessionStore }] = await Promise.all([
    loadSDK('@deepseek-ai/dsh-agent'), loadSDK('@deepseek-ai/dsh-agent-loop'), loadSDK('@deepseek-ai/dsh-session'),
  ])
  const ctx = new sdk.Context(), requests = []
  await ctx.plugin(sdk.TypertRegistry)
  await ctx.plugin(SessionStore)
  await ctx.plugin(sdk.SessionProjectionRegistry)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(sdk.SystemPrompt, {})
  await ctx.plugin(sdk.ToolRuntime, {})
  if (executor === 'ptc') ctx.provide('ptcRuntime', { language: 'typescript', programFormat: 'function-body' })
  await ctx.plugin(await loadSDK('@deepseek-ai/dsh-tool-executor-' + executor))
  ctx.tools.register(sdk.defineTool({ name: 'unrelated_host_tool', description: 'Other tool remains available.', parameters: {}, output: { schema: { type: 'string' }, render: (_, text) => [{ type: 'text', text }] }, execute() { throw new Error('not exercised') } }))
  ctx.provide('llm', { async prepareCall(config) { return { config, async *stream(request) {
    requests.push(request)
    yield { type: 'finish', reason: { kind: 'stop' } }
  } } } })
  await ctx.plugin(AgentLoop, { agents: [], maxParallelToolCalls: 10 })
  const peer = operatorPeer(ctx)
  ctx.provide('connection', { operator: peer, rpc: { intercept() { return async () => {} } } })
  const ws = { id: 'W', path: '/fixture', status: async () => 'ok' }
  ctx.provide('workspaceRegistry', { get: id => id === ws.id ? ws : undefined, list: () => [ws], resolveByPath: async path => path === ws.path ? ws : undefined })
  ctx.provide('sessionQuery', { async observeSession() { throw new Error('Unexpected cold lookup in live-owner test') } })
  const units = new Map()
  const backend = { kv: { async open(descriptor) {
    let rows = units.get(descriptor.name)
    if (rows === undefined) { rows = new Map(); units.set(descriptor.name, rows) }
    return { async loadAll() { return { global: null, tables: { records: Object.fromEntries(rows) } } },
      async putRecord(_table, key, value) { rows.set(key, structuredClone(value)) }, async deleteRecord(_table, key) { rows.delete(key) }, async close() {} }
  } } }
  ctx.provide('storage', { backend: { get: () => backend } })
  const domain = new sdk.DomainFacility(ctx, { backend: 'fixture' })
  ctx.provide('storageDomain', domain)
  await ctx.fiber.await()
  const agentHandle = await ctx.agents.create({ sessionId: 'existing-silent-owner', meta: { cwd: '/fixture' }, agentOptions: { provider: 'fixture', model: 'fixture' } })
  const { agent } = agentHandle
  let runtime
  const mounted = await host.mountHost(ctx, { async createRuntime(ports) { runtime = await createRuntime(ports); return runtime } })
  t.after(async () => { await mounted.dispose(); await agentHandle.dispose(); await domain.closeAll(); await ctx.fiber.dispose() })
  ctx.systemPrompt.context({ name: 'other-plugin-fixture', order: 126, text: 'unrelated context stays' })
  const follow = async text => {
    agent.followup(sdk.createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
    await agent.whenIdle()
  }
  const enabled = policy()
  await runtime.savePolicy(operator, enabled, 0, signal())
  await follow('ordinary first input')
  assert.equal(requests.length, 1)
  if (executor === 'native') assert(requests[0].tools.some(tool => tool.name === 'mattpocock_controls'))
  else assert(requests[0].messages.some(message => message.role === 'system' && JSON.stringify(message.content).includes('mattpocock_controls:')))
  assert(requests[0].messages.some(message => message.source?.kind === 'mattpocock-controls'))
  agent.inject(host.makeSnapshotMessage('fixture-not-yet-admitted-plugin-snapshot'))
  await runtime.savePolicy(operator, { ...enabled, workspaceOverrides: { W: { workspace: { enabled: false } } } }, 1, signal())
  await follow('ordinary second input')
  assert.equal(requests.length, 2)
  const request = requests[1], projected = sdk.projectToolUpdates(request.messages, request.tools, 'in-history', request.toolHistory)
  const serialized = JSON.stringify(projected.messages)
  assert(!request.tools?.some(tool => tool.name.startsWith('mattpocock_')))
  assert(!request.toolHistory.tools.some(tool => tool.name.startsWith('mattpocock_')))
  assert(!projected.tools?.some(tool => tool.name.startsWith('mattpocock_')))
  assert(!serialized.includes('mattpocock_controls'))
  if (executor === 'native') assert(projected.tools?.some(tool => tool.name === 'unrelated_host_tool'))
  else assert(serialized.includes('unrelated_host_tool:'))
  assert(!request.messages.some(message => message.source?.kind === 'mattpocock-controls'))
  assert(!serialized.includes('fixture-not-yet-admitted-plugin-snapshot'))
  for (const expected of ['ordinary first input', 'ordinary second input', 'unrelated context stays']) assert(serialized.includes(expected), expected)
  assert(agent.session.ownEvents().some(event => event.type === 'user/message' && event.data.source.kind === 'mattpocock-controls'), 'raw transcript log preserved')
})
