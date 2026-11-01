import assert from 'node:assert/strict'
import { test } from 'node:test'
import vm from 'node:vm'
import { buildClient } from '../scripts/build-client.mjs'
import { PRIMITIVES_ID, clientPrimitives } from './fixtures/client-primitives.mjs'

const built = await buildClient()
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise(resolve => setImmediate(resolve)) }
const version = 'a'.repeat(64)
const ok = value => ({ ok: true, value })
function summary(sessionId, display = {}) {
  return { sessionId, caller: { kind: 'user', principalId: 'user:operator', sessionId: null },
    instance: { instrumentInstanceId: 'instance-' + sessionId, ownerSessionId: sessionId, controlWorkspaceId: 'W' },
    policy: { configurationRevision: 1, controlWorkspaceId: 'W', workspaceVerified: true, extensionEnabled: false, workspaceEnabled: false,
      display: { header: true, inputSummary: false, rightPanel: true, sessionList: true, timeline: true, ...display } },
    records: { businessRevision: 1, viewerRevision: 0, summary: { countingScope: 'instance', pendingUserDecisionCount: 1 } }, health: [] }
}
const current = sessionId => ({ sessionId, status: 'current', version, summary: summary(sessionId) })
function harness() {
  let now = 1_000, next = 0, registration
  const timers = new Map(), listeners = new Set()
  const document = { visibilityState: 'visible', addEventListener(_name, listener) { listeners.add(listener) }, removeEventListener(_name, listener) { listeners.delete(listener) } }
  const context = vm.createContext({ window: { __ModuleLoader__: { load(value) { registration = value } } }, document, AbortController, TextEncoder,
    Date: class extends Date { static now() { return now } },
    setTimeout(fn, ms) { const id = ++next; timers.set(id, { fn, due: now + ms }); return id }, clearTimeout(id) { timers.delete(id) }, queueMicrotask })
  vm.runInContext(built.code, context)
  const primitives = clientPrimitives({ createElement: () => ({}) })
  const client = registration.factory(name => { if (name === 'react') return {}; if (name === PRIMITIVES_ID) return primitives; throw new Error('Unexpected request ' + name) })
  const wire = value => vm.runInContext('JSON.parse(' + JSON.stringify(JSON.stringify(value)) + ')', context)
  return { client, timers, document, listeners, now: () => now,
    scheduler: (read, ...options) => new client.SummaryScheduler((request, signal) => Promise.resolve(read(request, signal)).then(wire), ...options),
    cache: (read, ...options) => new client.SessionObserverCache((id, signal) => Promise.resolve(read(id, signal)).then(wire), ...options),
    async tick(ms = 0) { const target = now + ms; for (;;) {
      const next = [...timers].filter(([, value]) => value.due <= target).sort((a, b) => a[1].due - b[1].due)[0]
      if (!next) break
      now = next[1].due; timers.delete(next[0]); next[1].fn(); await settle()
    } now = target; await settle() },
    async visibility(value) { document.visibilityState = value; for (const listener of [...listeners]) listener(); await settle() },
  }
}

test('one scheduler batches distinct held sessions at 32 with two flights and same-session sharing', async t => {
  const h = harness(), requests = []
  assert.equal(typeof h.client.SummaryScheduler, 'function')
  const scheduler = h.scheduler((request, signal) => new Promise(resolve => requests.push({ request, signal, resolve })))
  const releases = Array.from({ length: 65 }, (_, i) => scheduler.observe('s' + i).retain())
  releases.push(scheduler.observe('s0').retain())
  t.after(() => { for (const release of releases) release(); scheduler.dispose() })
  await h.tick()
  assert.equal(requests.length, 2, 'no more than two batch RPCs are in flight')
  assert(requests.every(row => row.request.sessions.length === 32))
  const sent = requests.flatMap(row => row.request.sessions.map(row => row.sessionId))
  assert.equal(new Set(sent).size, 64)
  assert.equal(sent.filter(id => id === 's0').length, 1)
  requests[0].resolve(ok({ rows: requests[0].request.sessions.map(row => current(row.sessionId)) }))
  await settle(); await h.tick()
  assert.equal(requests.length, 3)
  assert.equal(requests[2].request.sessions.length, 1)
  for (const row of requests.slice(1)) row.resolve(ok({ rows: row.request.sessions.map(row => current(row.sessionId)) }))
  await settle(); await h.tick()
  assert.equal(scheduler.observe('s0').getSnapshot().status, 'ready', JSON.stringify(scheduler.observe('s0').getSnapshot()))
  assert.equal(h.timers.size, 1, 'all session deadlines share a single timer')
})

test('release cancels a flight when its last generation-matching member leaves after another member refreshes', async t => {
  const h = harness(), requests = []
  const scheduler = h.scheduler((request, signal) => new Promise(resolve => requests.push({ request, signal, resolve })))
  const a = scheduler.observe('A'), b = scheduler.observe('B'), releaseA = a.retain(), releaseB = b.retain()
  t.after(() => { releaseA(); releaseB(); scheduler.dispose() })
  await h.tick(); assert.equal(requests.length, 1)
  a.refresh()
  assert.equal(requests[0].signal.aborted, false, 'B still needs this batch')
  releaseB()
  assert.equal(requests[0].signal.aborted, true, 'superseded A is held but no longer needs the old batch')
  await h.tick(); assert.equal(requests.length, 1, 'ignored cancellation does not settle or detach a physical request')
  requests[0].resolve(ok({ rows: [current('A'), current('B')] }))
  await settle(); await h.tick()
  assert.equal(a.getSnapshot().status, 'unknown', 'the superseded old A result cannot become current')
  assert.equal(requests.length, 2)
  assert.deepEqual(JSON.parse(JSON.stringify(requests[1].request.sessions)), [{ sessionId: 'A' }])
  requests[1].resolve(ok({ rows: [current('A')] })); await settle()
  assert.equal(a.getSnapshot().status, 'ready')
})

for (const outcome of ['transport failure', 'deadline']) test('a reacquired summary lease ignores an old lease ' + outcome + ' without losing its immediate refresh', async t => {
  const h = harness(), requests = []
  const scheduler = h.scheduler((request, signal) => new Promise(resolve => requests.push({ request, signal, resolve })))
  const a = scheduler.observe('A'), releaseOld = a.retain()
  t.after(() => scheduler.dispose())
  await h.tick(); assert.equal(requests.length, 1)
  releaseOld(); assert.equal(requests[0].signal.aborted, true)
  const releaseNew = a.retain(); t.after(releaseNew)
  assert.equal(a.getSnapshot().status, 'unknown'); assert.equal(a.getSnapshot().error, null)
  if (outcome === 'deadline') {
    await h.tick(10_000)
    assert.equal(a.getSnapshot().error, null, 'an obsolete deadline cannot fail a new lease')
    assert.equal(requests.length, 1, 'old uncooperative transport still occupies its physical slot')
    requests[0].resolve(ok({ rows: [current('A')] }))
  } else requests[0].resolve({ ok: false, error: { code: 'gateway/unavailable', message: 'obsolete lease transport error' } })
  await settle()
  assert.equal(a.getSnapshot().error, null, 'an obsolete result cannot publish an error to a new lease')
  await h.tick()
  assert.equal(requests.length, 2, 'the new lease refresh must not inherit old error backoff')
  requests[1].resolve(ok({ rows: [current('A')] })); await settle()
  assert.equal(a.getSnapshot().status, 'ready')
})

test('full snapshot handles acquire lazily, share across render gaps and survive idle TTL/LRU eviction', async t => {
  const h = harness(); let reads = 0
  assert.equal(typeof h.client.SessionObserverCache, 'function')
  const cache = h.cache(id => { reads++; const s = summary(id); return ok({ ...s, policyGrants: { schemaVersion: 1, revision: 0, grants: [] }, policy: { ...s.policy, features: {}, windows: { ticketWindowSize: null, runningSubagentLimit: null } }, records: null, windows: null, resources: [], capabilities: [], health: [] }) }, 0, 60_000, 4)
  t.after(() => cache.dispose())
  const handles = Array.from({ length: 150 }, (_, i) => cache.observe('s' + i))
  assert.equal(cache.size, 0, 'render/inject faces retain only lightweight lazy handles')
  const pinned = cache.observe('pinned'), unsubscribe = pinned.subscribe(() => {})
  const releases = handles.map(handle => handle.retain())
  await settle(); assert.equal(reads, 150)
  const shared = cache.observe('s0'), releaseShared = shared.retain()
  await settle(); assert.equal(reads, 150)
  for (const release of releases) release()
  assert.equal(shared.getSnapshot().status, 'ready', 'one remaining holder keeps its shared snapshot')
  releaseShared()
  assert(cache.size <= 5, 'at most four idle entries plus the mounted subscriber')
  await h.tick(60_001)
  const reused = handles[0].retain(), newSameSession = cache.observe('s0').retain()
  await settle(); assert.equal(reads, 151, 'an old native/render handle reacquires the current shared registry entry')
  assert(cache.size <= 2, 'expired idle entries are reclaimed on the next registry access')
  reused(); newSameSession(); unsubscribe()
})

test('root policy observation discovers other-client changes with bounded polling and one foreground refresh', async t => {
  const h = harness(); let reads = 0
  const observer = new h.client.PolicyObserver(() => { reads++; return Promise.resolve(h.wire(ok({ revision: reads, extensionEnabled: false, defaults: {}, workspaceOverrides: {} }))) })
  t.after(() => observer.dispose())
  await observer.refresh(); assert.equal(reads, 1)
  await h.tick(29_999); assert.equal(reads, 1)
  await h.tick(1); assert.equal(reads, 2)
  await h.visibility('hidden'); await h.tick(59_999); assert.equal(reads, 2)
  await h.tick(1); assert.equal(reads, 3)
  await h.visibility('visible'); await h.tick(); assert.equal(reads, 4)
  await h.visibility('visible'); await h.tick(); assert.equal(reads, 4)
  observer.dispose(); assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0)
})

test('partial batch release preserves other holders while last-holder cancellation fences late replies', async t => {
  const h = harness(), requests = [], scheduler = h.scheduler((request, signal) => new Promise(resolve => requests.push({ request, signal, resolve })))
  t.after(() => scheduler.dispose())
  const a = scheduler.observe('A'), b = scheduler.observe('B'), releaseA = a.retain(), releaseAlsoA = a.retain(), releaseB = b.retain()
  await h.tick(); assert.equal(requests.length, 1)
  releaseA(); assert.equal(requests[0].signal.aborted, false)
  releaseAlsoA(); assert.equal(requests[0].signal.aborted, false, 'B still requires this batch')
  const reacquireA = a.retain()
  requests[0].resolve(ok({ rows: [current('A'), current('B')] })); await settle(); await h.tick()
  assert.equal(a.getSnapshot().status, 'unknown', 'old A generation cannot publish into a reacquired lease')
  assert.equal(b.getSnapshot().status, 'ready')
  assert.equal(requests.length, 2); assert.equal(requests[1].request.sessions[0].sessionId, 'A')
  reacquireA(); assert.equal(requests[1].signal.aborted, true)
  requests[1].resolve(ok({ rows: [current('A')] })); await settle(); await h.tick()
  assert.equal(a.getSnapshot().status, 'unknown'); assert.equal(a.getSnapshot().error, null, 'cancellation is not a visible read error')
  releaseB(); assert.equal(h.timers.size, 0)
})

test('refresh cancels a wholly superseded batch immediately but preserves a partially valid batch', async t => {
  const h = harness(), requests = []
  const scheduler = h.scheduler((request, signal) => new Promise((resolve, reject) => {
    requests.push({ request, signal, resolve })
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  }))
  t.after(() => scheduler.dispose())
  const a = scheduler.observe('A'), b = scheduler.observe('B'), releaseA = a.retain(), releaseB = b.retain()
  t.after(() => { releaseA(); releaseB() })
  await h.tick(); assert.equal(requests.length, 1)
  scheduler.refresh('A')
  assert.equal(requests[0].signal.aborted, false, 'B still has a live matching generation in this batch')
  scheduler.refresh()
  assert.equal(requests[0].signal.aborted, true, 'an entirely superseded batch must cancel its actual transport, not wait for its deadline')
  await settle(); await h.tick()
  assert.equal(h.now(), 1000, 'cooperative replacement does not wait for the ten-second deadline')
  assert.equal(requests.length, 2)
  assert.equal(a.getSnapshot().error, null); assert.equal(b.getSnapshot().error, null, 'supersession cancellation is not a visible read error')
  requests[1].resolve(ok({ rows: [current('A'), current('B')] })); await settle(); await h.tick()
  assert.equal(a.getSnapshot().status, 'ready'); assert.equal(b.getSnapshot().status, 'ready')
})

test('foreground restoration promptly cancels a pending batch through the Remote cancellation result', async t => {
  const h = harness(), requests = []
  const scheduler = h.scheduler((request, signal) => new Promise(resolve => {
    requests.push({ request, signal, resolve })
    signal.addEventListener('abort', () => resolve({ ok: false, error: { code: 'gateway/cancelled', message: 'cancelled' } }), { once: true })
  }))
  t.after(() => scheduler.dispose())
  const a = scheduler.observe('A'), release = a.retain(); t.after(release)
  await h.tick(); await h.visibility('hidden'); await h.visibility('visible')
  assert.equal(requests[0].signal.aborted, true)
  await h.tick(); assert.equal(requests.length, 2); assert.equal(h.now(), 1000)
  assert.equal(a.getSnapshot().error, null, 'native gateway cancellation is not presented as a read failure')
  requests[1].resolve(ok({ rows: [current('A')] })); await settle(); await h.tick()
  assert.equal(a.getSnapshot().status, 'ready')
})

test('whole-batch supersession preserves both physical slots until abort-ignoring transports settle', async t => {
  const h = harness(), requests = [], scheduler = h.scheduler((request, signal) => new Promise(resolve => requests.push({ request, signal, resolve })))
  t.after(() => scheduler.dispose())
  for (let i = 0; i < 65; i++) scheduler.observe('s' + i).retain()
  await h.tick(); assert.equal(requests.length, 2)
  scheduler.refresh(); assert(requests.every(row => row.signal.aborted))
  await h.tick(5000); assert.equal(requests.length, 2, 'abort must not prematurely release a physical concurrency slot')
  requests[0].resolve(ok({ rows: requests[0].request.sessions.map(row => current(row.sessionId)) })); await settle(); await h.tick()
  assert.equal(requests.length, 3, 'settlement releases exactly one of the two occupied slots')
  assert.equal(scheduler.observe('s0').getSnapshot().status, 'unknown', 'the settled superseded reply remains generation-fenced')
  assert.equal(scheduler.observe('s0').getSnapshot().error, null)
  assert.equal(requests[2].signal.aborted, false)
})

test('unchanged reuses only its requested matching current version without publishing a cloned snapshot', async t => {
  const h = harness(), requests = []; let mode = 'current'
  const scheduler = h.scheduler(request => { requests.push(request); return ok({ rows: mode === 'current' ? [current('A')] : [{ sessionId: 'A', status: 'unchanged', version: mode === 'wrong' ? 'b'.repeat(64) : version }] }) })
  t.after(() => scheduler.dispose())
  const a = scheduler.observe('A'), release = a.retain(); t.after(release)
  await h.tick(); const ready = a.getSnapshot()
  assert.equal(ready.status, 'ready')
  mode = 'unchanged'; await h.tick(5000)
  assert.equal(requests[1].sessions[0].version, version)
  assert.equal(a.getSnapshot(), ready, 'unchanged retains the exact validated state object')
  mode = 'wrong'; await h.tick(5000)
  assert.equal(a.getSnapshot().status, 'unknown'); assert.match(a.getSnapshot().error, /matching current base/)
  mode = 'unchanged'; await h.tick(5000)
  assert.equal(Object.hasOwn(requests[3].sessions[0], 'version'), false, 'no validated base is sent after invalidation')
  assert.equal(a.getSnapshot().status, 'unknown')
})

test('summary errors back off exponentially at sixty seconds, hidden at thirty seconds, and restore once', async t => {
  const h = harness(), calls = []; let failing = true
  const scheduler = h.scheduler(() => { calls.push(h.now()); return failing ? { ok: false, error: { code: 'gateway/unavailable', message: 'offline' } } : ok({ rows: [current('A')] }) })
  t.after(() => scheduler.dispose())
  const a = scheduler.observe('A'), release = a.retain(); t.after(release)
  await h.tick(); assert.equal(a.getSnapshot().status, 'unknown')
  await h.tick(4999); assert.equal(calls.length, 1)
  for (const delay of [1, 10_000, 20_000, 40_000, 60_000]) await h.tick(delay)
  assert.deepEqual(calls, [1000, 6000, 16000, 36000, 76000, 136000])
  failing = false; await h.tick(60_000); assert.equal(a.getSnapshot().status, 'ready')
  await h.visibility('hidden'); await h.tick(29_999); assert.equal(calls.length, 7)
  await h.tick(1); assert.equal(calls.length, 8)
  await h.visibility('visible'); await h.tick(); assert.equal(calls.length, 9)
  await h.visibility('visible'); await h.tick(); assert.equal(calls.length, 9)
  await h.tick(5000); assert.equal(calls.length, 10, 'successful recovery resets the normal cadence')
})

for (const [name, reply] of [
  ['missing row', () => ({ rows: [] })],
  ['duplicate row', () => ({ rows: [current('A'), current('A')] })],
  ['unrequested row', () => ({ rows: [current('B')] })],
  ['cross-session summary', () => ({ rows: [{ ...current('A'), summary: summary('B') }] })],
  ['unchanged without base', () => ({ rows: [{ sessionId: 'A', status: 'unchanged', version }] })],
  ['oversize batch', () => ({ rows: [{ ...current('A'), summary: { ...summary('A'), caller: { kind: 'user', principalId: 'x'.repeat(300_000), sessionId: null } } }] })],
]) test('untrusted summary stays unknown: ' + name, async t => {
  const h = harness(), scheduler = h.scheduler(() => ok(reply()))
  t.after(() => scheduler.dispose())
  const a = scheduler.observe('A'), release = a.retain(); t.after(release)
  await h.tick(); assert.equal(a.getSnapshot().status, 'unknown'); assert.equal(a.getSnapshot().value, null); assert(a.getSnapshot().error)
})

test('a superseded pending poll clears stale ready data and its known version at the attached flight deadline', async t => {
  const h = harness(), requests = []
  const scheduler = h.scheduler((request, signal) => {
    if (requests.length === 0) { requests.push({ request, signal }); return ok({ rows: [current('A')] }) }
    return new Promise(resolve => requests.push({ request, signal, resolve }))
  })
  t.after(() => scheduler.dispose())
  const a = scheduler.observe('A'), release = a.retain(); t.after(release)
  await h.tick(); assert.equal(a.getSnapshot().status, 'ready')
  await h.tick(5000); assert.equal(requests[1].request.sessions[0].version, version)
  scheduler.refresh('A'); assert.equal(requests[1].signal.aborted, true)
  assert.equal(a.getSnapshot().status, 'ready', 'last confirmation may remain while a real read is still pending')
  await h.tick(10_000)
  assert.equal(a.getSnapshot().status, 'unknown', 'deadline invalidates the attached holder even though refresh changed its generation')
  assert.equal(a.getSnapshot().value, null); assert.match(a.getSnapshot().error, /timed out/)
  assert.equal(requests.length, 2, 'an ignored abort still occupies its physical slot until settlement')
  requests[1].resolve(ok({ rows: [current('A')] })); await settle(); await h.tick()
  assert.equal(a.getSnapshot().status, 'unknown', 'a late expired reply cannot restore stale ready data')
  await h.tick(5000); assert.equal(requests.length, 3)
  assert.equal(Object.hasOwn(requests[2].request.sessions[0], 'version'), false, 'the timeout removed the old conditional baseline')
  requests[2].resolve(ok({ rows: [current('A')] })); await settle(); await h.tick()
  assert.equal(a.getSnapshot().status, 'ready')
})

for (const target of ['A', undefined]) test('a real transport failure clears attached ready data after ' + (target === undefined ? 'whole-batch' : 'partial') + ' supersession', async t => {
  const h = harness(), requests = []
  const scheduler = h.scheduler((request, signal) => {
    if (requests.length === 0) { requests.push({ request, signal }); return ok({ rows: [current('A'), current('B')] }) }
    return new Promise(resolve => requests.push({ request, signal, resolve }))
  })
  t.after(() => scheduler.dispose())
  const a = scheduler.observe('A'), b = scheduler.observe('B'), releaseA = a.retain(), releaseB = b.retain()
  t.after(() => { releaseA(); releaseB() })
  await h.tick(); assert.equal(a.getSnapshot().status, 'ready'); assert.equal(b.getSnapshot().status, 'ready')
  await h.tick(5000); scheduler.refresh(target)
  requests[1].resolve({ ok: false, error: { code: 'gateway/unavailable', message: 'wire is unavailable' } }); await settle()
  assert.equal(a.getSnapshot().status, 'unknown', 'a superseded generation must not keep a ready state after its attached transport really fails')
  assert.equal(b.getSnapshot().status, 'unknown')
  assert(a.getSnapshot().error); assert(b.getSnapshot().error)
  await h.tick(5000)
  assert.equal(requests.length, 3)
  assert(requests[2].request.sessions.every(row => !Object.hasOwn(row, 'version')), 'real failure clears every attached conditional baseline')
  requests[2].resolve(ok({ rows: [current('A'), current('B')] })); await settle(); await h.tick()
  assert.equal(a.getSnapshot().status, 'ready'); assert.equal(b.getSnapshot().status, 'ready')
})

test('noncooperative timed-out transports cannot exceed two outstanding requests or publish late', async t => {
  const h = harness(), requests = [], scheduler = h.scheduler((request, signal) => new Promise(resolve => requests.push({ request, signal, resolve })))
  t.after(() => scheduler.dispose())
  for (let i = 0; i < 65; i++) scheduler.observe('s' + i).retain()
  await h.tick(); await h.tick(10_000)
  assert.equal(requests.length, 2); assert(requests.every(row => row.signal.aborted))
  await h.tick(60_000); assert.equal(requests.length, 2, 'timed-out promises still occupy the physical concurrency budget until settled')
  requests[0].resolve(ok({ rows: requests[0].request.sessions.map(row => current(row.sessionId)) })); await settle(); await h.tick()
  assert.equal(scheduler.observe('s0').getSnapshot().status, 'unknown')
  assert.equal(requests.length, 3)
})

test('summary injection handles allocate no entries and idle eviction never breaks later same-session sharing', async t => {
  const h = harness(), calls = [], scheduler = h.scheduler(request => { calls.push(request); return ok({ rows: request.sessions.map(row => current(row.sessionId)) }) })
  t.after(() => scheduler.dispose())
  const handles = Array.from({ length: 150 }, (_, i) => scheduler.observe('s' + i))
  assert.equal(scheduler.size, 0, 'unmounted native injected faces are only identity handles')
  const releases = handles.map(handle => handle.retain())
  await h.tick(); assert.equal(calls.length, 5)
  for (const release of releases) release()
  assert(scheduler.size <= 64); assert.equal(h.timers.size, 0)
  await h.tick(60_001)
  const releaseOld = handles[0].retain(), releaseNew = scheduler.observe('s0').retain()
  await h.tick(); assert.equal(calls.length, 6); assert.equal(calls[5].sessions.length, 1)
  assert.equal(handles[0].getSnapshot(), scheduler.observe('s0').getSnapshot())
  assert.equal(scheduler.size, 1, 'lazy TTL reclaims expired inactive metadata')
  releaseOld(); releaseNew()
})

test('coalesced refresh does not starve an unsent session behind a just-completed batch', async t => {
  const h = harness(), requests = [], scheduler = h.scheduler((request, signal) => new Promise(resolve => requests.push({ request, signal, resolve })))
  t.after(() => scheduler.dispose())
  for (let i = 0; i < 65; i++) scheduler.observe('s' + i).retain()
  await h.tick(); assert.equal(requests.length, 2)
  requests[0].resolve(ok({ rows: requests[0].request.sessions.map(row => current(row.sessionId)) })); await settle()
  scheduler.refresh(); scheduler.refresh(); await h.tick()
  assert.equal(requests.length, 3)
  assert(requests[2].request.sessions.some(row => row.sessionId === 's64'), 'an unsent holder takes precedence over the recently served sessions at an equal refresh deadline')
})

for (const appCount of [1, 2]) for (const holderCount of [0, 20, 150, 300]) {
  test('closed bundle scale: ' + appCount + ' independent app(s), ' + holderCount + ' mounted summary holders each', async t => {
    const apps = []
    for (let app = 0; app < appCount; app++) {
      const h = harness(), calls = []; let inFlight = 0, peak = 0
      const scheduler = h.scheduler(request => {
        inFlight++; peak = Math.max(peak, inFlight)
        const rows = request.sessions.map(row => row.version === version ? { sessionId: row.sessionId, status: 'unchanged', version } : current(row.sessionId))
        const response = ok({ rows })
        calls.push({ request: JSON.parse(JSON.stringify(request)), requestBytes: Buffer.byteLength(JSON.stringify(request)), responseBytes: Buffer.byteLength(JSON.stringify(response)) })
        return Promise.resolve(response).finally(() => { inFlight-- })
      })
      t.after(() => scheduler.dispose())
      const handles = Array.from({ length: holderCount }, (_, index) => scheduler.observe('s' + index))
      const releases = handles.map(handle => handle.retain())
      // A second UI contribution in the same app shares the same requested Session.
      if (holderCount > 0) releases.push(scheduler.observe('s0').retain())
      await h.tick()
      const snapshots = handles.map(handle => handle.getSnapshot())
      assert(snapshots.every(value => value.status === 'ready'))
      const startupCalls = calls.length, startup = calls.slice()
      assert.equal(startupCalls, Math.ceil(holderCount / 32))
      assert.equal(h.timers.size, holderCount === 0 ? 0 : 1)
      await h.tick(5000)
      assert.equal(calls.length - startupCalls, Math.ceil(holderCount / 32))
      assert(handles.every((handle, index) => handle.getSnapshot() === snapshots[index]), 'every unchanged response reuses its exact validated snapshot')
      assert(calls.slice(startupCalls).every(call => call.request.sessions.every(row => row.version === version)))
      assert(calls.every(call => call.request.sessions.length <= 32 && call.requestBytes <= 256 * 1024 && call.responseBytes <= 256 * 1024))
      assert(peak <= 2)
      const totals = rows => ({ rpc: rows.length, requestBytes: rows.reduce((sum, row) => sum + row.requestBytes, 0), responseBytes: rows.reduce((sum, row) => sum + row.responseBytes, 0) })
      apps.push({ app: app + 1, startup: totals(startup), steadyFiveSeconds: totals(calls.slice(startupCalls)), peakInFlight: peak, timers: h.timers.size })
      for (const release of releases) release()
      assert.equal(h.timers.size, 0)
    }
    assert.equal(apps.reduce((sum, app) => sum + app.startup.rpc, 0), appCount * Math.ceil(holderCount / 32), 'sharing is local to one app, never falsely global across browser clients')
    console.log('summary-scale-matrix', JSON.stringify({ appCount, mountedSummaryHoldersPerApp: holderCount, apps }))
  })
}
