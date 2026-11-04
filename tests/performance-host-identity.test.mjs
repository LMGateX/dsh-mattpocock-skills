import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fixture, operator, signal, caller, actualAgent, policy, deferred, loadSDK } from './fixtures/runtime-host.mjs'

// Real authority closure -> real Runtime summary, never a patched ports.sessionFacts.
async function coldFixture(t, count = 4001) {
  const f = await fixture(t)
  await f.read('old-child', operator)
  await new Promise(resolve => setImmediate(resolve))
  const child = f.agents.get('old-child')
  let events = [...child.session.ownEvents(), ...Array.from({ length: count - 1 }, () => ({ type: 'fixture/noop', data: {} }))]
  child.session.ownEvents = () => events
  f.cold.set(child.id, child); f.agents.delete(child.id)
  let revision = 'revision-1', identity = Symbol('persistence'), denied = false, stats = 0
  const persistence = { get identity() { return identity }, async stat(id) {
    stats++
    if (denied) throw new Error('synthetic source denied')
    const a = f.cold.get(id) ?? f.agents.get(id)
    return a && { header: a.session.header, revision }
  } }
  f.ctx.get = name => name === 'sessionPersistence' ? persistence : undefined
  const observe = f.ctx.sessionQuery.observeSession
  f.ctx.sessionQuery.observeSession = async (...args) => ({ ...await observe(...args), source: 'prepared', revision })
  f.observations.length = 0
  return { ...f, child, persistence, get stats() { return stats },
    setEvents(next) { events = next }, setRevision(next) { revision = next },
    replaceSource() { identity = Symbol('replacement') }, deny() { denied = true },
    readSummary(version, control = signal()) { return f.runtime.readSummaries(operator, { sessions: [{ sessionId: child.id, ...(version ? { version } : {}) }] }, control).then(x => x.rows[0]) },
    get observes() { return f.observations.filter(id => !id.startsWith('released:')).length },
    get releases() { return f.observations.filter(id => id.startsWith('released:')).length },
  }
}

test('large cold child summary reuses only verified compact identity across all lineage checks', async t => {
  const realNow = Date.now; let now = realNow(); Date.now = () => now
  t.after(() => { Date.now = realNow })
  const f = await coldFixture(t)
  now += 10000 // expose the old TTL/4000 cutoff rather than its short-lived live cache
  const first = await f.readSummary()
  assert.equal(first.status, 'current')
  assert.equal(f.observes, 1, 'one verified fold, not three full observations for one item')
  assert.equal(f.releases, 1)
  const second = await f.readSummary(first.version)
  assert.equal(second.status, 'unchanged')
  assert.equal(f.observes, 1, 'known-version still authorizes but never retains/replays the large log')
  assert.ok(f.stats >= 6, 'current source health is rechecked, not TTL cached')
})

test('live summary folds once per exact Session, Agent and own-event generation', async t => {
  const f = await fixture(t)
  await f.read('old-child', operator)
  const child = f.agents.get('old-child'), descriptor = child.session.ownEvents()[0]
  let events = [descriptor], reads = 0
  child.session.seq = 1
  child.session.ownEvents = () => { reads++; return events }
  const read = version => f.runtime.readSummaries(operator, { sessions: [{ sessionId: child.id, ...(version ? { version } : {}) }] }, signal()).then(x => x.rows[0])
  const first = await read(), second = await read(first.version)
  assert.equal(first.status, 'current'); assert.equal(second.status, 'unchanged')
  assert.equal(reads, 1, 'three lineages per item share one live compact fold')
  events = [...events, { type: 'fixture/noop', data: {} }]; child.session.seq++
  assert.equal((await read()).status, 'current'); assert.equal(reads, 2)
  f.agents.set(child.id, { ...child }) // same Session, new actual Agent
  await read(); assert.equal(reads, 3)
  const replacement = actualAgent(child.id, { parent: 'root', managed: true })
  replacement.session.seq = 1; replacement.session.ownEvents = () => { reads++; return [descriptor] }
  f.agents.set(child.id, replacement)
  await read(); assert.equal(reads, 4)
})

test('current stat/header conflict cannot reuse a retained child association', async t => {
  const f = await coldFixture(t)
  const observe = f.ctx.sessionQuery.observeSession
  f.ctx.sessionQuery.observeSession = async (...args) => {
    const observation = await observe(...args)
    return { ...observation, header: { ...observation.header, createdAt: 123 } }
  }
  await assert.rejects(f.ports.authority.resolveSession(f.child.id), { code: 'access-denied' })
  assert.equal(f.observes, f.releases)
})

test('hot identity does not survive persistence replacement during stat', async t => {
  const f = await coldFixture(t)
  assert.equal((await f.readSummary()).status, 'current')
  const stat = f.persistence.stat
  f.persistence.stat = async (...args) => { const row = await stat(...args); f.replaceSource(); return row }
  await assert.rejects(f.ports.authority.resolveSession(f.child.id), { code: 'access-denied' })
})

for (const count of [1, 4000, 4001]) test('cold compact projection has no event-count cliff: ' + count, async t => {
  const f = await coldFixture(t, count)
  const start = performance.now(), first = await f.readSummary(), coldMs = performance.now() - start
  assert.equal(first.status, 'current'); assert.equal(f.observes, 1)
  const samples = []
  for (let i = 0; i < 5; i++) {
    const start = performance.now()
    assert.equal((await f.readSummary(first.version)).status, 'unchanged')
    samples.push(performance.now() - start)
  }
  assert.equal(f.observes, 1); assert.equal(f.releases, 1)
  t.diagnostic(JSON.stringify({ ownEvents: count, coldMs, hotMs: samples, observations: f.observes, stats: f.stats }))
})

test('source revision, persistence identity and exact header fingerprint invalidate cold compact facts', async t => {
  const f = await coldFixture(t)
  const first = await f.readSummary()
  assert.equal(first.status, 'current'); assert.equal(f.observes, 1)
  f.setRevision('revision-2')
  assert.equal((await f.readSummary(first.version)).status, 'unchanged'); assert.equal(f.observes, 2)
  f.replaceSource()
  assert.equal((await f.readSummary(first.version)).status, 'unchanged'); assert.equal(f.observes, 3)
  f.child.session.header = { ...f.child.session.header, createdAt: 10 }
  assert.equal((await f.readSummary(first.version)).status, 'unchanged'); assert.equal(f.observes, 4)
  f.child.session.header = { ...f.child.session.header, parentSession: 'other' }
  assert.equal((await f.readSummary(first.version)).status, 'unavailable')
  f.child.session.header = { ...f.child.session.header, origin: undefined }
  assert.equal((await f.readSummary(first.version)).status, 'unavailable')
  f.child.session.header = { ...f.child.session.header, id: 'different-session' }
  assert.equal((await f.readSummary(first.version)).status, 'unavailable')
  assert.equal(f.observes, f.releases)
})

for (const capability of ['no-stat', 'header-only-stat', 'no-identity', 'no-observation-revision']) test('conservative fallback without source proof: ' + capability, async t => {
  const f = await coldFixture(t)
  if (capability === 'no-stat') f.ctx.get = () => undefined
  if (capability === 'header-only-stat') f.persistence.stat = async () => ({ header: f.child.session.header })
  if (capability === 'no-identity') f.ctx.get = name => name === 'sessionPersistence' ? { stat: f.persistence.stat } : undefined
  if (capability === 'no-observation-revision') {
    const observe = f.ctx.sessionQuery.observeSession
    f.ctx.sessionQuery.observeSession = async (...args) => { const { revision, ...rest } = await observe(...args); return rest }
  }
  const first = await f.readSummary(), count = f.observes
  assert.equal(first.status, 'current')
  assert.equal((await f.readSummary(first.version)).status, 'unchanged')
  assert.ok(f.observes > count, 'missing proof never pretends the log is stable')
  assert.equal(f.observes, f.releases)
})

test('hot known-version summary still fails on source denial and owner policy grants remain revocable', async t => {
  const f = await coldFixture(t), first = await f.readSummary()
  assert.equal(first.status, 'current')
  f.deny()
  const failed = await f.readSummary(first.version)
  assert.equal(failed.status, 'unavailable')
  assert.equal(JSON.stringify(failed).includes('synthetic source denied'), false)
  await f.grants.compareAndSwap(0, { schemaVersion: 1, revision: 1, grants: [{ sessionId: 'root', enabled: true }] })
  await f.ports.authority.authorizePolicy('agent:root', 'write')
  await f.grants.compareAndSwap(1, { schemaVersion: 1, revision: 2, grants: [{ sessionId: 'root', enabled: false }] })
  await assert.rejects(f.ports.authority.authorizePolicy('agent:root', 'write'), { code: 'access-denied' })
})

test('malformed current descriptor never falls back to a retained association and all leases close', async t => {
  const f = await coldFixture(t), first = await f.readSummary()
  f.setEvents([{ type: 'subagent/descriptor', data: { version: 3, mode: 'not-supported' } }]); f.setRevision('malformed')
  assert.equal((await f.readSummary(first.version)).status, 'unavailable')
  await assert.rejects(f.ports.authority.resolveSession(f.child.id))
  assert.equal(f.observes, f.releases)
  // A genuinely absent/unsupported descriptor retains the original conservative association
  // semantics; it is not upgraded to a new owner or a grant for any new ticket scope.
  f.setEvents([]); f.setRevision('absent')
  assert.equal((await f.readSummary(first.version)).status, 'unchanged')
})

test('inherited-only descriptors never classify an unregistered child, and negative fold is reusable', async t => {
  const f = await coldFixture(t)
  const missing = actualAgent('unregistered', { parent: 'root', managed: true })
  missing.session.ownEvents = () => []
  f.cold.set(missing.id, missing)
  assert.equal(await f.ports.authority.resolveSession(missing.id), undefined)
  const count = f.observes
  assert.equal(await f.ports.authority.resolveSession(missing.id), undefined)
  assert.equal(f.observes, count, 'verified absence is compactly cached, inherited invalid descriptor is excluded')
  assert.equal(f.observes, f.releases)
})

test('live/cold transitions do not reuse the old classification, while public facts remain full', async t => {
  const f = await coldFixture(t), first = await f.readSummary()
  const full = await f.ports.sessionFacts(f.child.id, signal())
  assert.equal(full.events.length, 4001); assert.equal(full.live, false)
  f.agents.set(f.child.id, f.child)
  f.child.session.seq = 4001
  assert.equal((await f.readSummary(first.version)).status, 'unchanged')
  f.agents.delete(f.child.id)
  const before = f.observes
  assert.equal((await f.readSummary(first.version)).status, 'unchanged')
  assert.equal(f.observes, before + 1, 'cold transition requires a new verified fold')
  assert.equal(f.observes, f.releases)
})

test('concurrent cancelled facts read never cancels another reader or leaks an observation lease', async t => {
  const f = await coldFixture(t), entered = deferred(), permit = deferred()
  const observe = f.ctx.sessionQuery.observeSession
  f.ctx.sessionQuery.observeSession = async (...args) => { const cut = await observe(...args); entered.resolve(); await permit.promise; return cut }
  const cancelled = new AbortController(), pending = f.ports.sessionFacts(f.child.id, cancelled.signal)
  await entered.promise
  const other = f.ports.sessionFacts(f.child.id, signal())
  cancelled.abort(); permit.resolve()
  await assert.rejects(pending, { name: 'AbortError' })
  assert.equal((await other).events.length, 4001)
  assert.equal(f.observes, f.releases)
  assert.equal((await f.readSummary()).status, 'current')
})

test('live Session without Agent uses exact public Session generation, never a cold persistence shortcut', async t => {
  const f = await fixture(t), child = f.agents.get('old-child')
  await f.read(child.id, operator)
  f.agents.delete(child.id)
  let reads = 0
  const events = child.session.ownEvents(); child.session.seq = events.length
  child.session.ownEvents = () => { reads++; return events }
  f.ctx.get = name => name === 'sessions' ? { get: id => id === child.id ? child.session : undefined } : undefined
  const one = await f.runtime.readSummaries(operator, { sessions: [{ sessionId: child.id }] }, signal())
  const two = await f.runtime.readSummaries(operator, { sessions: [{ sessionId: child.id, version: one.rows[0].version }] }, signal())
  assert.equal(one.rows[0].status, 'current'); assert.equal(two.rows[0].status, 'unchanged')
  assert.equal(reads, 1); assert.deepEqual(f.observations, [])
  await assert.rejects(f.ports.authority.authorizeSession('agent:' + child.id, child.id, 'read'), { code: 'access-denied' })
})

test('hot compact identity still rechecks assignment and policy before a known-version response', async t => {
  const f = await coldFixture(t)
  // Assigned scopes require the exact live caller; an operator is deliberately coordinator.
  f.agents.set(f.child.id, f.child); f.child.session.seq = 4001
  const readAssigned = version => f.runtime.readSummaries(caller(f.child.id), { sessions: [{ sessionId: f.child.id, ...(version ? { version } : {}) }] }, signal()).then(x => x.rows[0])
  await f.save(policy())
  await f.apply('put-workflow', { value: { title: 'Task', axes: [] } })
  for (const localTicketId of ['A', 'B']) await f.apply('put-ticket', { localTicketId, value: { title: localTicketId, statuses: {} } })
  await f.apply('put-decision', { decisionId: 'D', value: { question: 'Private question', status: 'pending', pending: true, ticketIds: ['A'], addressee: { kind: 'user', principalId: 'user:operator' } } })
  await f.assign(f.child.id, 'flow', ['A'])
  const before = await readAssigned(), observations = f.observes
  assert.equal(before.summary.records.summary.pendingUserDecisionCount, 1)
  await f.assign(f.child.id, 'flow', ['B'])
  const after = await readAssigned(before.version)
  assert.equal(after.status, 'current'); assert.notEqual(after.version, before.version)
  assert.equal(after.summary.records.summary.pendingUserDecisionCount, 0)
  const reads = f.observes
  assert.equal((await readAssigned(after.version)).status, 'unchanged')
  assert.equal(f.observes, reads, 'authorization is fresh without refolding stable source')
  assert.ok(reads >= observations, 'public assignment facts remain available separately')
  await f.save({ extensionEnabled: false, defaults: {}, workspaceOverrides: {} })
  const off = await readAssigned(after.version)
  assert.equal(off.status, 'current'); assert.equal(off.summary.policy.extensionEnabled, false)
})

test('deep cold lineage reuses facts but never removes the cycle/excessive-depth guard', async t => {
  const f = await coldFixture(t, 1)
  let parent = 'root'
  for (let i = 0; i < 12; i++) {
    const a = actualAgent('deep-' + i, { parent, managed: true }); await f.created(a); parent = a.id
  }
  await f.read(parent, operator)
  for (let i = 0; i < 12; i++) { const id = 'deep-' + i; f.cold.set(id, f.agents.get(id)); f.agents.delete(id) }
  f.observations.length = 0
  const request = version => ({ sessions: [{ sessionId: parent, ...(version ? { version } : {}) }] })
  const first = (await f.runtime.readSummaries(operator, request(), signal())).rows[0]
  assert.equal(first.status, 'current'); assert.equal(f.observes, 12)
  const second = (await f.runtime.readSummaries(operator, request(first.version), signal())).rows[0]
  assert.equal(second.status, 'unchanged'); assert.equal(f.observes, 12)
  for (const [id, parent] of [['cycle-a', 'cycle-b'], ['cycle-b', 'cycle-a']]) f.cold.set(id, actualAgent(id, { parent, managed: true }))
  const cyclic = (await f.runtime.readSummaries(operator, { sessions: [{ sessionId: 'cycle-a' }] }, signal())).rows[0]
  assert.equal(cyclic.status, 'unavailable'); assert.equal(cyclic.reason, 'association-conflict')
  parent = 'root'
  for (let i = 0; i < 129; i++) { const a = actualAgent('excessive-' + i, { parent, managed: true }); f.cold.set(a.id, a); parent = a.id }
  const excessive = (await f.runtime.readSummaries(operator, request(), signal())).rows[0]
  assert.equal(excessive.status, 'unavailable'); assert.equal(excessive.reason, 'association-conflict')
  assert.equal(f.observes, f.releases)
})

test('public SessionQuery and JSONL handle provide a real cold source proof, not a claimed host version', { skip: !process.env.DSH_CONTROLS_HOST_ROOT && 'set DSH_CONTROLS_HOST_ROOT for isolated installed-host JSONL probe' }, async t => {
  const { mkdtemp } = await import('node:fs/promises'), { tmpdir } = await import('node:os'), { join } = await import('node:path')
  const { Context } = await loadSDK('@deepseek-ai/cordis')
  const { Session, SessionStore } = await loadSDK('@deepseek-ai/dsh-session')
  const { SessionQueryEngine } = await loadSDK('@deepseek-ai/dsh-session-query')
  const jsonl = await loadSDK('@deepseek-ai/dsh-session-persistence-jsonl')
  const ctx = new Context(), store = new SessionStore(ctx)
  const directory = await mkdtemp(join(tmpdir(), 'performance-host-identity-jsonl-'))
  const backend = ctx.plugin(typeof jsonl.apply === 'function' ? jsonl : jsonl.default, { root: directory, compression: 'none' }); await backend
  t.after(() => backend.dispose())
  const query = new SessionQueryEngine(ctx)
  const source = Session.create('old-child', [], { id: 'old-child', version: 4, createdAt: 0, cwd: '/fixture', isSeeded: false, origin: 'subagent', parentSession: 'root', delegationDepth: 1 })
  source.append('subagent/descriptor', { version: 3, mode: 'continuable', provider: 'spawn', label: 'fixture' })
  for (let turn = 1; turn <= 2000; turn++) { source.append('turn/start', { turn }); source.append('turn/end', { turn, reason: 'completed' }) }
  const persistence = ctx.sessionPersistence, writer = await persistence.create(source.header)
  t.after(() => writer.close())
  await writer.append(source.ownEvents()); await writer.flush()
  const stat = await persistence.stat('old-child')
  assert.equal(typeof persistence.identity, 'symbol'); assert.equal(typeof stat.revision, 'string')
  const cut = await query.observeSession('old-child', { projectionMode: 'none' })
  let supportsProof
  try {
    assert.equal(cut.header.id, 'old-child'); assert.ok(cut.events.length >= 4001)
    supportsProof = cut.source === 'prepared' && cut.revision === stat.revision
  } finally { cut[Symbol.dispose]() }
  assert.equal(store.get('old-child'), undefined, 'query never activates the cold child')
  const f = await coldFixture(t, 1)
  let observed = 0, released = 0
  f.ctx.get = name => name === 'sessionPersistence' ? persistence : name === 'sessions' ? store : undefined
  f.ctx.sessionQuery.observeSession = async (...args) => {
    const cut = await query.observeSession(...args); observed++
    return { header: cut.header, get events() { return cut.events }, inheritedEventCount: cut.inheritedEventCount, source: cut.source, revision: cut.revision,
      [Symbol.dispose]() { cut[Symbol.dispose](); released++ } }
  }
  const first = await f.readSummary(), firstReads = observed
  assert.equal(first.status, 'current')
  assert.equal((await f.readSummary(first.version)).status, 'unchanged')
  if (supportsProof) { assert.equal(firstReads, 1); assert.equal(observed, 1) }
  else assert.ok(observed > firstReads, 'a real host without an observation revision stays conservative')
  await writer.append([source.append('turn/start', { turn: 2001 }), source.append('turn/end', { turn: 2001, reason: 'completed' })]); await writer.flush()
  assert.notEqual((await persistence.stat('old-child')).revision, stat.revision)
  assert.equal((await f.readSummary(first.version)).status, 'unchanged')
  assert.ok(observed > firstReads); assert.equal(observed, released)
  t.diagnostic(JSON.stringify({ publicQuerySourceProof: supportsProof, firstItemObservations: firstReads, afterAppendObservations: observed }))
})

test('missing parent remains unknown before descriptor folding, including malformed events', async t => {
  const f = await coldFixture(t)
  f.child.session.header = { ...f.child.session.header, parentSession: undefined }
  f.setEvents([{ type: 'subagent/descriptor', data: { version: 3, mode: 'invalid' } }])
  assert.equal(await f.ports.authority.resolveSession(f.child.id), undefined)
  assert.equal(f.observes, f.releases)
})

test('explicit stale observation revision is rejected rather than treated as a proofless fallback', async t => {
  const f = await coldFixture(t), observe = f.ctx.sessionQuery.observeSession
  f.ctx.sessionQuery.observeSession = async (...args) => ({ ...await observe(...args), revision: 'stale-source' })
  await assert.rejects(f.ports.authority.resolveSession(f.child.id), { code: 'access-denied' })
  assert.equal(f.observes, f.releases)
})
