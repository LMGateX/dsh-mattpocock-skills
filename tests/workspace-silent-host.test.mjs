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
  // Production starts the instrument in the first admitted step; drive that
  // public boundary before this fixture dispatches a tool directly.
  await runtime.preStep({ kind: 'agent', principalId: 'agent:a', sessionId: 'a' }, signal())
  await runtime.preStep({ kind: 'agent', principalId: 'agent:b', sessionId: 'b' }, signal())
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

// Capture the real AgentLoop and LlmRuntime output at an inert adapter; no Profile or network.
const requestProbes = ['native', 'ptc'].flatMap(executor => [false, true].map(held => ({ executor, held })))
for (const { executor, held } of requestProbes) test(
  `${executor}: ${held
    ? 'next step admitted after OFF is silent even when an ON step was in flight'
    : 'existing session drops owned replay on its next model request without erasing history'}`,
  { ...installedHost, timeout: 10000 }, async t => {
  const [{ AgentRegistry }, { AgentLoop }, { SessionStore }] = await Promise.all([
    loadSDK('@deepseek-ai/dsh-agent'), loadSDK('@deepseek-ai/dsh-agent-loop'), loadSDK('@deepseek-ai/dsh-session'),
  ])
  const ctx = new sdk.Context(), requests = []
  const handoffEntered = Promise.withResolvers(), handoffReleased = Promise.withResolvers()
  let heldHandoff = false
  await ctx.plugin(sdk.TypertRegistry)
  await ctx.plugin(SessionStore)
  await ctx.plugin(sdk.SessionProjectionRegistry)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(sdk.SystemPrompt, {})
  await ctx.plugin(sdk.ToolRuntime, {})
  if (executor === 'ptc') ctx.provide('ptcRuntime', { language: 'typescript', programFormat: 'function-body' })
  await ctx.plugin(await loadSDK('@deepseek-ai/dsh-tool-executor-' + executor))
  ctx.tools.register(sdk.defineTool({ name: 'unrelated_host_tool', description: 'Other tool remains available.', parameters: {}, output: { schema: { type: 'string' }, render: (_, text) => [{ type: 'text', text }] }, execute() { throw new Error('not exercised') } }))
  await ctx.plugin(sdk.LlmRuntime)
  ctx.llm.registerAdapter(['fixture'], new class extends sdk.LlmAdapter {
    async resolveModel(provider, id) { return { provider, id, name: id, toolUpdate: 'in-history' } }
    async *stream(request) {
      requests.push(request)
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }())
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
  t.after(async () => { handoffReleased.resolve(); await mounted.dispose(); await agentHandle.dispose(); await domain.closeAll(); await ctx.fiber.dispose() })
  ctx.on('llm/stream', async function* (request, next) {
    // The second real AgentLoop request is already assembled, but the native
    // continuation has not handed it to the adapter. Suspend without changing it.
    if (held && requests.length === 1 && !heldHandoff) {
      heldHandoff = true
      handoffEntered.resolve(request)
      await handoffReleased.promise
    }
    yield* next()
  })
  ctx.systemPrompt.context({ name: 'other-plugin-fixture', order: 126, text: 'unrelated context stays' })
  const follow = async text => {
    agent.followup(sdk.createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
    await agent.whenIdle()
  }
  const enabled = policy()
  const disable = () => runtime.savePolicy(operator, { ...enabled, workspaceOverrides: { W: { workspace: { enabled: false } } } }, 1, signal())
  await runtime.savePolicy(operator, enabled, 0, signal())
  const ownedNames = tools => [...new Set((tools ?? []).map(tool => tool.name).filter(name => name.startsWith('mattpocock_')))].sort()
  const ownedContent = request => ({
    nativeTools: ownedNames(request.tools),
    historyTools: ownedNames([...(request.toolHistory?.tools ?? []), ...(request.toolHistory?.updates ?? []).flatMap(update => update.additions)]),
    ptcDeclaration: request.messages.some(message => message.role === 'system' && /mattpocock_\w+:/.test(JSON.stringify(message.content))),
    snapshot: request.messages.some(message => message.source?.kind === 'mattpocock-controls'),
  })
  const assertEnabled = request => {
    const { nativeTools, ptcDeclaration, snapshot } = ownedContent(request)
    assert(executor === 'native' ? nativeTools.includes('mattpocock_controls') : ptcDeclaration, 'ON must expose owned tool declarations')
    assert(snapshot, 'ON must expose the owned snapshot')
  }
  const assertUnrelated = (request, text) => {
    const serialized = JSON.stringify(request.messages)
    if (executor === 'native') assert(request.tools?.some(tool => tool.name === 'unrelated_host_tool'))
    else {
      assert(request.tools?.some(tool => tool.name === 'run_code'), 'PTC transport remains available')
      assert(serialized.includes('unrelated_host_tool:'))
    }
    for (const expected of ['ordinary first input', text, 'unrelated context stays']) assert(serialized.includes(expected), expected)
  }
  const silent = { nativeTools: [], historyTools: [], ptcDeclaration: false, snapshot: false }
  await follow('ordinary first input')
  assert.equal(requests.length, 1)
  assertEnabled(requests[0])
  const original = structuredClone(agent.session.ownEvents())
  assert(original.some(event => event.type === 'user/message' && event.data.source.kind === 'mattpocock-controls'))
  if (held) {
    const pending = follow('ordinary held input')
    try {
      const assembled = await Promise.race([handoffEntered.promise, pending.then(() => { throw new Error('AgentLoop never entered the handoff barrier') })])
      assertEnabled(assembled)
      assert.equal(requests.length, 1, 'only the earlier ON request has reached the adapter')
      const savedOff = await disable()
      const current = await mounted.ports.readSessionPolicy(agent.id)
      assert.equal(current.configurationRevision, savedOff.revision)
      assert.equal(current.workspaceVerified, true)
      assert.equal(current.collaborationEnabled, false, 'OFF already saved and effective before release')
    } finally { handoffReleased.resolve() }
    await pending
    assert.equal(requests.length, 2, 'the held turn must complete through the normal adapter')
    assertUnrelated(requests[1], 'ordinary held input')
    // This step was already admitted ON; its eventual payload is not the gate.
    t.diagnostic(`In-flight diagnostic: ${executor} held adapter payload ${JSON.stringify(ownedContent(requests[1]))}`)
  } else await disable()
  agent.inject(host.makeSnapshotMessage('fixture-not-yet-admitted-plugin-snapshot'))
  await follow('ordinary second input')
  assert.equal(requests.length, held ? 3 : 2)
  const request = requests.at(-1)
  assert.deepEqual(ownedContent(request), silent, 'fresh OFF request contains no owned material')
  const serialized = JSON.stringify(request.messages)
  assert(!serialized.includes('mattpocock_controls'))
  assert(!serialized.includes('fixture-not-yet-admitted-plugin-snapshot'))
  assertUnrelated(request, 'ordinary second input')
  assert.deepEqual(agent.session.ownEvents().slice(0, original.length), original, 'earlier raw transcript and request records are unchanged')
})
