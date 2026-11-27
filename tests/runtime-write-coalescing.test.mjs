import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mountedFixture, caller, policy, signal, actualAgent } from './fixtures/runtime-host.mjs'

test('a burst of unmanaged subagent status edges writes knowledge once and does not stall the next snapshot', async t => {
  let writes = 0
  const f = await mountedFixture(t, { configureBeforeMount: ({ ctx, agents }) => {
    for (let i = 0; i < 150; i += 1) {
      const agent = actualAgent('n' + i, { parent: 'root', managed: true })
      agent.status = 'idle'
      agents.set(agent.id, agent)
    }
    ctx.provide('subagents', { async listChildren() { return [] } })
    const backend = ctx.get('storage').backend.get()
    const open = backend.kv.open.bind(backend.kv)
    backend.kv.open = async descriptor => {
      const handle = await open(descriptor)
      const put = handle.putRecord.bind(handle)
      handle.putRecord = async (...args) => { writes += 1; return put(...args) }
      return handle
    }
  } })
  await f.saveEnabledFixturePolicy(policy())
  const c = caller('root'), s = signal()
  await f.runtime.readSession(c, 'root', s)
  const initial = await f.runtime.preStep(c, s, [], '1:1')
  assert.equal(initial.length, 1, 'the authorized session starts with a real model projection')
  assert.doesNotMatch(initial[0].content[0].text, /unmanaged-native-execution-observed/)
  const before = writes
  for (let i = 0; i < 150; i += 1) {
    const agent = f.agents.get('n' + i)
    agent.status = 'running'
    f.ctx.emit('agent/status', { agent, status: 'running' })
  }
  const started = Date.now()
  const next = await f.runtime.preStep(c, s, [], '1:2')
  const elapsed = Date.now() - started
  assert.equal(next.length, 1, 'the status burst does not suppress a valid model projection')
  assert.match(next[0].content[0].text, /unmanaged-native-execution-observed/, 'the status events reach the window knowledge path')
  assert.ok(writes > before, 'a new knowledge fact reaches storage')
  assert.ok(writes - before <= 3, 'the 150 same-fact observations must not each append a window write, wrote ' + (writes - before))
  assert.ok(elapsed < 300, 'the next injected snapshot must not wait for 150 serialized knowledge writes, took ' + elapsed + ' ms')
})
