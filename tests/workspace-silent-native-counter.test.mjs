import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers/promises'
import { test } from 'node:test'
import { actualAgent, deferred, mountedFixture, operator, policy, signal } from './fixtures/runtime-host.mjs'

const installedHost = { skip: !process.env.DSH_CONTROLS_HOST_ROOT && 'set DSH_CONTROLS_HOST_ROOT for installed-host probes' }
const until = async (predicate, what) => {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return
    await setImmediate()
  }
  assert.fail('condition was not reached: ' + what)
}
const row = id => ({ id, mode: 'continuable', createdAt: 0, label: id })

test('a committed workspace OFF revokes an existing native observer without disturbing another workspace', installedHost, async t => {
  let aVerifications = 0
  const a = { id: 'A', path: '/fixture', status: async () => { aVerifications++; return 'ok' } }
  const b = { id: 'B', path: '/other', status: async () => 'ok' }
  const walks = [], blocked = deferred()
  let holdA = false
  t.after(() => blocked.resolve([row('retired-catalog-row')]))
  const f = await mountedFixture(t, { configureBeforeMount({ ctx, agents, child }) {
    child.status = 'running'
    const previous = actualAgent('previous-child', { managed: true, parent: 'root' })
    previous.status = 'running'; agents.set(previous.id, previous)
    const beta = actualAgent('beta', { cwd: b.path }), betaChild = actualAgent('beta-child', { cwd: b.path, managed: true, parent: beta.id })
    betaChild.status = 'running'
    agents.set(beta.id, beta); agents.set(betaChild.id, betaChild)
    Object.assign(ctx.workspaceRegistry, { get: id => [a, b].find(w => w.id === id), resolveByPath: async path => [a, b].find(w => w.path === path) })
    ctx.provide('subagents', { async listChildren(owner) {
      walks.push(owner)
      if (owner === 'root' && holdA) return blocked.promise
      return owner === 'root' ? [row('child')] : [row('beta-child')]
    } })
  } })
  const { ctx, runtime, mounted: { ports } } = f
  const enabled = policy()
  await f.saveEnabledFixturePolicy(enabled)
  const read = owner => ports.nativeSubagentActivity(owner)
  assert.equal((await read('root')).running, 2)
  assert.equal((await read('beta')).running, 1)
  await until(() => walks.length === 2, 'both initial catalogs')
  await setImmediate()
  const verifications = aVerifications
  assert.equal((await read('root')).running, 2)
  assert.equal(aVerifications, verifications, 'ordinary live count is a memory-only projection')
  const countWalks = owner => walks.filter(value => value === owner).length
  const catalog = (owner, child) => ctx.emit('session/event', { id: owner }, { type: 'subagent/catalog', data: { childId: child } })
  const end = (id, runId) => ctx.emit('subagent/end', { id, runId, provider: 'spawn', local: true, stopReason: 'error' })
  f.agents.get('previous-child').status = 'idle'
  end('previous-child', 'published-before-off')
  await until(() => ports.nativeSubagentStops('root').some(item => item.itemId.includes('published-before-off')), 'pre-OFF stop published')
  const retained = ports.nativeSubagentStops('root')
  holdA = true
  catalog('root', 'child')
  await until(() => countWalks('root') === 2, 'A walk in flight before save')
  end('child', 'queued-before-off')

  await runtime.savePolicy(operator, { ...enabled, workspaceOverrides: { A: { workspace: { enabled: false } } } }, 1, signal())
  const off = await read('root')
  const aWalks = countWalks('root')
  catalog('root', 'child')
  ctx.emit('subagent/start', { id: 'child', runId: 'entirely-off', provider: 'spawn', local: true })
  f.child.status = 'idle'
  ctx.emit('agent/status', { agent: f.child, status: 'idle' })
  end('child', 'entirely-off')
  catalog('beta', 'beta-child')
  end('beta-child', 'beta-still-on')
  await until(() => ports.nativeSubagentStops('beta').some(item => item.itemId.includes('beta-still-on')), 'B still observes native ends')
  assert.equal(countWalks('beta'), 2)
  assert.equal(countWalks('root'), aWalks, 'OFF does not start another catalog walk')
  assert.deepEqual(ports.nativeSubagentStops('root'), [])
  assert.equal(off.known, false, 'a suppressed observation is not a known zero')
  assert.equal(off.depth, null, 'an unavailable observation did not measure a depth')

  holdA = false
  await runtime.savePolicy(operator, enabled, 2, signal())
  // Native can wake again before this plugin re-establishes its observation baseline.
  ctx.emit('subagent/start', { id: 'child', runId: 'before-rebase', provider: 'spawn', local: true })
  f.child.status = 'running'
  assert.equal((await read('root')).running, 1, 're-enabled count rebases from live state')
  await until(() => countWalks('root') === aWalks + 1, 'new baseline is not held by the pre-OFF uncooperative catalog')
  blocked.resolve([row('retired-catalog-row')])
  await setImmediate()
  assert(!ports.nativeSubagentCountState('root').memberSessionIds.includes('retired-catalog-row'), 'old catalog completion cannot publish across OFF/ON')
  end('child', 'entirely-off') // a delayed terminal cannot borrow this later count-only baseline
  await setImmediate()
  assert.deepEqual(ports.nativeSubagentStops('root'), retained, 'only the pre-OFF published stop survives re-enable')
  assert(ports.nativeSubagentStops('beta').some(item => item.itemId.includes('beta-still-on')), 'another workspace keeps its existing observations')
  f.child.status = 'running'
  ctx.emit('subagent/start', { id: 'child', runId: 'after-on', provider: 'spawn', local: true })
  ctx.emit('agent/status', { agent: f.child, status: 'running' })
  end('child', 'after-on')
  await until(() => ports.nativeSubagentStops('root').some(item => item.itemId.includes('after-on')), 'A observes newly admitted native execution')
})
