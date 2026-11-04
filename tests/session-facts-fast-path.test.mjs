import test from 'node:test'
import assert from 'node:assert/strict'
import { host } from './fixtures/runtime-host.mjs'
const { createHostAuthority } = host

// Public full facts preserve current headers, complete owned suffixes and lease/cancel
// semantics. Compact authority caching is covered through actual Runtime summaries in
// performance-host-identity; public callers do not retain a large event-array cache.
const header = (id, extra = {}) => ({ id, version: 4, createdAt: 0, cwd: '/fixture', isSeeded: false, ...extra })
const descriptor = { type: 'subagent/descriptor', data: { version: 3, mode: 'continuable', provider: 'spawn', label: 'fixture' } }
const observation = (header_, events = [], inheritedEventCount = 0) => ({
  header: header_, inheritedEventCount, events,
  [Symbol.dispose]() { this.disposed = true },
})
const storage = { async read() { return undefined } }
const grants = { async read() { return undefined } }

function harness({ stat, observe, live = new Map() }) {
  const calls = { stat: 0, observe: 0, released: 0 }
  const persistence = stat === undefined ? undefined : {
    async stat(id, options) { calls.stat++; return await stat(id, options) },
  }
  const ctx = {
    connection: { operator: { id: 'operator' } },
    agents: { get: id => live.get(id) },
    workspaceRegistry: { get: () => undefined, resolveByPath: async () => undefined },
    sessionQuery: { async observeSession(id, options) {
      calls.observe++
      const cut = await observe(id, options)
      return { ...cut, [Symbol.dispose]() { cut[Symbol.dispose](); calls.released++ } }
    } },
    get: name => name === 'sessionPersistence' ? persistence : undefined,
  }
  return { calls, ctx, ...createHostAuthority(ctx, storage, grants) }
}

test('cold owner session facts come from the lightweight port without reading the log', async () => {
  const h = harness({
    stat: async id => ({ header: header(id) }),
    observe: async () => { throw new Error('owner sessions must not observe a stored log') },
  })
  const facts = await h.sessionFacts('cold-owner')
  assert.equal(facts.header.id, 'cold-owner')
  assert.equal(facts.live, false)
  assert.deepEqual([...facts.events], [])
  assert.equal(h.calls.observe, 0)
  assert.equal(h.calls.stat, 1)
  await h.authority.authorizeSession('user:operator', 'cold-owner')
  assert.equal(h.calls.observe, 0)
})

test('repeat public header reads check current source instead of relying on a TTL', async () => {
  let createdAt = 0, denied = false
  const h = harness({ stat: async id => {
    if (denied) throw new Error('source-denied')
    return { header: header(id, { createdAt }) }
  } })
  const first = await h.sessionFacts('cold-owner')
  createdAt = 1
  const second = await h.sessionFacts('cold-owner')
  assert.equal(first.header.createdAt, 0)
  assert.equal(second.header.createdAt, 1)
  assert.deepEqual(second.events, [])
  denied = true
  await assert.rejects(h.sessionFacts('cold-owner'), /source-denied/)
  assert.equal(h.calls.observe, 0)
})

test('public cold child facts return the complete current owned suffix and release each lease', async () => {
  const inherited = { type: 'subagent/descriptor', data: { version: 99 } }
  const tail = { type: 'fixture/noop', data: { complete: 'preserved' } }
  let own = [descriptor]
  const h = harness({
    stat: async id => ({ header: header(id, { origin: 'subagent', parentSession: 'parent' }) }),
    observe: async id => observation(header(id, { origin: 'subagent', parentSession: 'parent' }), [inherited, ...own], 1),
  })
  const first = await h.sessionFacts('cold-child')
  assert.deepEqual(first.events, [descriptor])
  own = [descriptor, tail]
  const second = await h.sessionFacts('cold-child')
  assert.deepEqual(first.events, [descriptor], 'an older full cut never grows after a new source read')
  assert.deepEqual(second.events, [descriptor, tail])
  assert.equal(Object.isFrozen(second.events), true)
  assert.equal(Object.isFrozen(second.events[1].data), true)
  assert.equal(h.calls.released, h.calls.observe)
})

test('concurrent full facts readers preserve values and leases without coupling caller cancellation', async () => {
  let release, entered
  const gate = new Promise(resolve => { release = resolve }), started = new Promise(resolve => { entered = resolve })
  const h = harness({
    stat: async id => ({ header: header(id, { origin: 'subagent', parentSession: 'parent' }) }),
    observe: async id => { entered(); await gate; return observation(header(id, { origin: 'subagent', parentSession: 'parent' }), [descriptor]) },
  })
  const controller = new AbortController(), cancelled = h.sessionFacts('cold-child', controller.signal)
  await started
  const pending = [h.sessionFacts('cold-child'), h.sessionFacts('cold-child')]
  controller.abort(); release()
  await assert.rejects(cancelled, { name: 'AbortError' })
  for (const facts of await Promise.all(pending)) assert.deepEqual(facts.events, [descriptor])
  assert.equal(h.calls.released, h.calls.observe)
})

test('a missing stored session keeps the canonical observation failure', async () => {
  const denied = harness({
    stat: async () => undefined,
    observe: async () => { throw new Error('unknown-session') },
  })
  await assert.rejects(denied.sessionFacts('vanished'), /unknown-session/)
  assert.equal(denied.calls.observe, 1)
})

test('compositions without the lightweight port keep observing stored logs and release leases', async () => {
  const h = harness({ observe: async id => observation(header(id), [descriptor]) })
  const facts = await h.sessionFacts('cold-owner')
  assert.equal(facts.header.id, 'cold-owner')
  assert.equal(h.calls.observe, 1)
  assert.equal(h.calls.released, 1)
})

test('live owner sessions resolve facts without materializing the owned suffix', async () => {
  let ownEventsCalls = 0
  const live = new Map([['live-owner', { id: 'live-owner', session: { header: header('live-owner'),
    ownEvents: () => { ownEventsCalls += 1; return [descriptor] } } }]])
  const h = harness({
    stat: async () => { throw new Error('live sessions must not stat the store') },
    observe: async () => { throw new Error('live sessions must not observe stored logs') },
    live,
  })
  const facts = await h.sessionFacts('live-owner')
  assert.equal(facts.live, true)
  assert.deepEqual([...facts.events], [])
  assert.equal(Object.isFrozen(facts.events), true)
  assert.equal(ownEventsCalls, 0)
  assert.equal(h.calls.stat, 0)
  assert.equal(h.calls.observe, 0)
})

test('public live child facts preserve full current events instead of caching an old array', async () => {
  let events = [descriptor]
  const tail = { type: 'fixture/noop', data: { complete: 'live suffix' } }
  const live = new Map([['live-child', { id: 'live-child', session: {
    header: header('live-child', { origin: 'subagent', parentSession: 'parent' }),
    ownEvents: () => [...events],
  } }]])
  const h = harness({ live })
  const first = await h.sessionFacts('live-child')
  events = [descriptor, tail]
  const second = await h.sessionFacts('live-child')
  assert.deepEqual(first.events, [descriptor])
  assert.deepEqual(second.events, [descriptor, tail])
  assert.equal(second.live, true)
  assert.equal(Object.isFrozen(second.events), true)
  assert.equal(h.calls.stat, 0)
  assert.equal(h.calls.observe, 0)
})
