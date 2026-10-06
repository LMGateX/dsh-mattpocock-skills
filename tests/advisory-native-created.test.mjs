import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fixture, policy, caller, signal, loadSDK } from './fixtures/runtime-host.mjs'

// Agreed seams: RuntimeFacade.created through the actual SDK serial agent/created
// lifecycle and public AgentRegistry factory. Instrument failure is controlled;
// Agents/factory/rollback are native. No profile, model, build or disk changes.
const native = process.env.DSH_CONTROLS_HOST_ROOT
const options = { skip: !native && 'set DSH_CONTROLS_HOST_ROOT for real native creation probes' }

test('unknown S storage cannot make serial observation reject an ordinary native child creation', options, async t => {
  const sdk = {
    ...await loadSDK('@deepseek-ai/cordis'), ...await loadSDK('@deepseek-ai/dsh-agent'),
    ...await loadSDK('@deepseek-ai/dsh-session'), ...await loadSDK('@deepseek-ai/dsh-agent-loop'),
    ...await loadSDK('@deepseek-ai/dsh-session-projection'), ...await loadSDK('@deepseek-ai/dsh-system-prompt'),
    ...await loadSDK('@deepseek-ai/dsh-tools'), ...await loadSDK('@deepseek-ai/dsh-typert-registry'),
  }
  const ctx = new sdk.Context()
  let modelCalls = 0
  t.after(async () => { await ctx.fiber.dispose(); assert.equal(modelCalls, 0, 'the probe must never call a model') })
  new sdk.TypertRegistry(ctx)
  new sdk.SessionStore(ctx)
  new sdk.AgentRegistry(ctx)
  new sdk.SessionProjectionRegistry(ctx)
  new sdk.SystemPrompt(ctx, {})
  new sdk.ToolRuntime(ctx, {})
  ctx.provide('llm', {
    prepareCall() { modelCalls++; throw new Error('model prohibited') },
    stream() { modelCalls++; throw new Error('model prohibited') },
  })
  new sdk.AgentLoop(ctx, { agents: [], maxParallelToolCalls: { get: () => 10 } })
  const parent = await ctx.agents.create({ sessionId: 'root', meta: { cwd: '/fixture' } })
  t.after(() => parent.dispose())
  const f = await fixture(t, { initialPolicy: policy() })
  f.agents.set('root', parent.agent)
  await f.read() // Existing owner identity/current facts precede the outage.
  f.windowStorage.read = async () => { throw new Error('S measurement storage unavailable') }
  ctx.on('agent/created', async ({ agent, signal: control }) => {
    f.agents.set(agent.id, agent)
    // Same public serial lifecycle contract awaited by mountHost.
    await f.runtime.created(caller(agent.id), control ?? signal(), agent)
  })
  const child = await ctx.agents.create({
    sessionId: 'native-ordinary-child',
    meta: { cwd: '/fixture', origin: 'subagent', parentSession: parent.agent.id },
  })
  t.after(() => child.dispose())
  assert.equal(ctx.agents.get(child.agent.id), child.agent, 'measurement failure must not roll the native child back')
  assert.equal(child.agent.session.header.parentSession, parent.agent.id)
  assert.equal(modelCalls, 0)
  const current = await f.read()
  assert.equal(current.windows, null)
  assert(current.health.some(row => row.scope === 'windows' && row.status === 'unknown'))
})
