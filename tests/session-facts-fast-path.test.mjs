import test from 'node:test'
import assert from 'node:assert/strict'
import { createHostAuthority } from '../lib/host.js'

// Authorization, association resolution and native-child confirmation only read header
// fields. Reading the stored event log is the expensive path, so the host asks the
// lightweight persistence port first and only observes a stored log when a subagent
// descriptor is actually required.
const header = (id, extra = {}) => ({ id, version: 4, createdAt: 0, cwd: '/fixture', isSeeded: false, ...extra })
const descriptor = { type: 'subagent/descriptor', data: { version: 3, mode: 'continuable', provider: 'spawn', label: 'fixture' } }
const observation = (header_, events = []) => ({
  header: header_, inheritedEventCount: 0, events,
  [Symbol.dispose]() { this.disposed = true },
})
const storage = { async read() { return undefined } }
const grants = { async read() { return undefined } }

function harness({ stat, observe, live = new Map() }) {
  const calls = { stat: 0, observe: 0 }
  const persistence = stat === undefined ? undefined : {
    async stat(id, options) { calls.stat++; return await stat(id, options) },
  }
  const ctx = {
    connection: { operator: { id: 'operator' } },
    agents: { get: id => live.get(id) },
    workspaceRegistry: { get: () => undefined, resolveByPath: async () => undefined },
    sessionQuery: { async observeSession(id) { calls.observe++; return await observe(id) } },
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
  // The authorization seam resolves the same way: header only, no event log.
  await h.authority.authorizeSession('user:operator', 'cold-owner')
  assert.equal(h.calls.observe, 0)
})

test('repeat header lookups within the freshness window reuse the facts', async () => {
  const h = harness({ stat: async id => ({ header: header(id) }) })
  const first = await h.sessionFacts('cold-owner')
  const second = await h.sessionFacts('cold-owner')
  const third = await h.sessionFacts('cold-owner')
  assert.equal(second, first)
  assert.equal(third, first)
  // Authorization asks for the same header dozens of times per second; only the first
  // lookup may pay the stored-session stat.
  assert.equal(h.calls.stat, 1)
})

test('a subagent still observes its stored log for the folded descriptor', async () => {
  const h = harness({
    stat: async id => ({ header: header(id, { origin: 'subagent', parentSession: 'parent' }) }),
    observe: async id => observation(header(id, { origin: 'subagent', parentSession: 'parent' }), [descriptor]),
  })
  const first = await h.sessionFacts('cold-child')
  assert.equal(first.events.length, 1)
  assert.equal(h.calls.observe, 1)
  // Repeat calls inside the freshness window reuse the shared observation.
  const second = await h.sessionFacts('cold-child')
  assert.equal(second.events.length, 1)
  assert.equal(h.calls.observe, 1)
})

test('concurrent identical observations share one stored-log read', async () => {
  let release
  const gate = new Promise(resolve => { release = resolve })
  const h = harness({
    stat: async id => ({ header: header(id, { origin: 'subagent', parentSession: 'parent' }) }),
    observe: async id => { await gate; return observation(header(id, { origin: 'subagent', parentSession: 'parent' }), [descriptor]) },
  })
  const pending = [h.sessionFacts('cold-child'), h.sessionFacts('cold-child'), h.sessionFacts('cold-child')]
  release()
  const results = await Promise.all(pending)
  assert.equal(results.every(facts => facts.events.length === 1), true)
  assert.equal(h.calls.observe, 1)
})

test('a missing stored session keeps the canonical observation failure', async () => {
  const denied = harness({
    stat: async () => undefined,
    observe: async () => { throw new Error('unknown-session') },
  })
  await assert.rejects(denied.sessionFacts('vanished'), /unknown-session/)
  assert.equal(denied.calls.observe, 1)
})

test('compositions without the lightweight port keep observing stored logs', async () => {
  const h = harness({
    observe: async id => observation(header(id), [descriptor]),
  })
  const facts = await h.sessionFacts('cold-owner')
  assert.equal(facts.header.id, 'cold-owner')
  assert.equal(h.calls.observe, 1)
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
  // Deep-freezing a long owner session's whole event array on every tool execution
  // pegged a core; owner headers are classified from the header alone.
  assert.deepEqual([...facts.events], [])
  assert.equal(Object.isFrozen(facts.events), true)
  assert.equal(ownEventsCalls, 0)
  assert.equal(h.calls.stat, 0)
  assert.equal(h.calls.observe, 0)
})

test('live subagent sessions materialize the owned suffix once and reuse it', async () => {
  let ownEventsCalls = 0
  const live = new Map([['live-child', { id: 'live-child', session: {
    header: header('live-child', { origin: 'subagent', parentSession: 'parent' }),
    ownEvents: () => { ownEventsCalls += 1; return [descriptor] },
  } }]])
  const h = harness({ live })
  const first = await h.sessionFacts('live-child')
  const second = await h.sessionFacts('live-child')
  assert.equal(first.events.length, 1)
  assert.equal(second.events, first.events)
  assert.equal(ownEventsCalls, 1, 'repeat reads inside the freshness window reuse the frozen facts')
  assert.equal(h.calls.stat, 0)
  assert.equal(h.calls.observe, 0)
})
