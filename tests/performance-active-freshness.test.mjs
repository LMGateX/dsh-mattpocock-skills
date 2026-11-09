import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fixture, mountedFixture, core, actualAgent, deferred, policy, caller, operator, signal } from './fixtures/runtime-host.mjs'

function fullReads(t) {
  let count = 0
  const read = core.SessionInstruments.prototype.read
  core.SessionInstruments.prototype.read = async function(...args) { count++; return read.apply(this, args) }
  t.after(() => { core.SessionInstruments.prototype.read = read })
  return () => count
}
async function warm(t) {
  const f = await fixture(t, { known: true, initialPolicy: policy() })
  await new Promise(resolve => setImmediate(resolve))
  await f.read()
  await new Promise(resolve => setImmediate(resolve))
  const before = await f.read()
  const reads = fullReads(t)
  assert.deepEqual(await f.read(), before)
  assert.equal(reads(), 0, 'same request reuses a current full projection')
  return { f, before, reads }
}

test('unrelated roots and other-owner descendants do not rebuild an equivalent full projection', async t => {
  const { f, before, reads } = await warm(t)
  f.agents.set('unrelated', actualAgent('unrelated'))
  assert.deepEqual(await f.read(), before)
  assert.equal(reads(), 0, 'unrelated root addition performs zero full reads')
  f.agents.set('unrelated-child', actualAgent('unrelated-child', { parent: 'unrelated', managed: true }))
  assert.deepEqual(await f.read(), before)
  assert.equal(reads(), 0, 'another owner child addition performs zero full reads')
  f.agents.delete('unrelated-child')
  f.agents.delete('unrelated')
  assert.deepEqual(await f.read(), before)
  assert.equal(reads(), 0, 'unrelated removal performs zero full reads')
})

test('silent native count capability loss invalidates the full projection', async t => {
  const { f, reads } = await warm(t)
  f.ports.nativeSubagentCountState = () => ({ revision: 0, known: false, available: false, reason: 'native-subagent-service-unavailable' })
  f.ports.nativeSubagentActivity = async () => ({ known: false, running: 0, total: 0, reason: 'native-subagent-service-unavailable' })
  const next = await f.read()
  assert.equal(next.windows.S.countKnown, false, 'service loss must not return the old known count')
  assert.equal(next.windows.S.countReason, 'native-subagent-service-unavailable')
  assert.equal(reads(), 1)
})

test('an immutable start cut cannot acquire mutated count-state fields across body awaits', async t => {
  const { f } = await warm(t)
  const state = { revision: 0, known: true, available: true, reason: null }
  f.ports.nativeSubagentCountState = () => state
  f.ports.nativeSubagentActivity = async () => ({ known: state.known, running: 0, total: 0, reason: state.reason })
  f.agents.get('old-child').status = 'running' // force a miss, with no lifecycle delivery
  const entered = deferred(), release = deferred(), read = f.resourceStorage.read.bind(f.resourceStorage)
  let blocked = false
  f.resourceStorage.read = async (...args) => { if (!blocked) { blocked = true; entered.resolve(); await release.promise } return read(...args) }
  const pending = f.read()
  await entered.promise
  Object.assign(state, { known: false, available: false, reason: 'native-subagent-service-unavailable' })
  release.resolve()
  assert.equal((await pending).windows.S.countKnown, false, 'one bounded rebuild must use the new count knowledge')
  assert.equal((await f.read()).windows.S.countKnown, false)
})

// All metadata here is synthetic. These tests drive public Runtime/HostPorts and
// domain storage adapters, never the runtime's cache or the host counter's maps.
test('the mounted host copies current lister availability without catalog IO or a revision bump', async t => {
  let ports, walks = 0
  const native = { async listDescendants() { walks++; return [{ kind: 'child', id: 'child', mode: 'continuable', activity: 'running', hasChildren: false }] } }
  const f = await mountedFixture(t, {
    configureBeforeMount({ ctx }) { ctx.provide('subagents', native) },
    runtimeCreated(_runtime, value) { ports = value },
  })
  await f.runtime.savePolicy(operator, policy(), 0, signal())
  await new Promise(resolve => setImmediate(resolve))
  const read = () => f.runtime.readSession(caller('root'), 'root', signal())
  await read()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal((await read()).windows.S.countKnown, true)
  const before = ports.nativeSubagentCountState('root'), calls = walks
  native.listDescendants = undefined // public service capability disappears, with no lifecycle event
  const after = ports.nativeSubagentCountState('root')
  assert.equal(after.revision, before.revision)
  assert.equal(after.available, false)
  assert.equal(after.known, false)
  assert.equal(walks, calls, 'synchronous state probe performs zero catalog operations')
  assert.equal((await read()).windows.S.countKnown, false)
})

test('unrecorded descendants, equal-size swaps and Agent/Session replacements cannot hit an old body', async t => {
  const { f, reads } = await warm(t)
  const running = id => Object.assign(actualAgent(id, { parent: 'root', managed: true }), { status: 'running' })
  // Deliberately no created/observe callback: the next actual read must see the index.
  f.ports.nativeSubagentActivity = async () => ({ known: true, running: [...f.agents.values()].filter(a => a.session.header.origin === 'subagent' && a.status === 'running').length, total: 2, reason: null })
  f.agents.set('fresh', running('fresh'))
  assert.equal((await f.read()).windows.S.used, 1)
  assert.equal(reads(), 1)
  f.agents.delete('fresh'); f.agents.set('replacement', running('replacement'))
  assert.equal((await f.read()).windows.S.used, 1)
  assert.equal(reads(), 2, 'same length and count do not prove same members')
  f.agents.set('replacement', running('replacement'))
  await f.read()
  assert.equal(reads(), 3, 'same id Agent replacement is fenced')
  const a = f.agents.get('replacement')
  a.session = { ...a.session, header: { ...a.session.header } }
  await f.read()
  assert.equal(reads(), 4, 'same Agent but new Session is fenced')
  a.status = 'idle'
  assert.equal((await f.read()).windows.S.used, 0)
  a.status = 'running'
  assert.equal((await f.read()).windows.S.used, 1)
  f.agents.delete('replacement')
  assert.equal((await f.read()).windows.S.used, 0)
  assert.equal(reads(), 7, 'running/idle/gone changes without events cannot reuse a body')
})

test('broken or cyclic native parent chains conservatively disable reuse', async t => {
  const { f, reads } = await warm(t)
  f.agents.set('orphan', actualAgent('orphan', { parent: 'absent', managed: true }))
  await f.read(); await f.read()
  assert.equal(reads(), 2, 'unprovable ancestry must not certify a hot body')
  f.agents.delete('orphan')
  f.agents.set('cycle-a', actualAgent('cycle-a', { parent: 'cycle-b', managed: true }))
  f.agents.set('cycle-b', actualAgent('cycle-b', { parent: 'cycle-a', managed: true }))
  await f.read(); await f.read()
  assert.equal(reads(), 4, 'cycles never become a proof of unrelatedness')
})

test('missing count proof and changed host capabilities cannot reuse a formerly current projection', async t => {
  const { f, reads } = await warm(t)
  delete f.ports.nativeSubagentCountState
  await f.read(); await f.read()
  assert.equal(reads(), 2, 'legacy ports remain readable but cannot certify projection reuse')
  f.ports.capabilities = { ...f.ports.capabilities, nativeLifecycleObservation: 'unsupported' }
  assert.equal((await f.read()).capabilities.find(row => row.key === 'nativeLifecycleObservation').status, 'unsupported')
})

test('a live change during hot validation cannot publish a cached body', async t => {
  const { f, reads } = await warm(t)
  f.ports.nativeSubagentActivity = async () => ({ known: true, running: f.agents.get('old-child').status === 'running' ? 1 : 0, total: 1, reason: null })
  const entered = deferred(), release = deferred(), authorize = f.ports.authorizeCaller
  let calls = 0
  f.ports.authorizeCaller = async (...args) => { if (++calls === 2) { entered.resolve(); await release.promise } return authorize(...args) }
  const pending = f.read()
  await entered.promise
  f.agents.get('old-child').status = 'running'
  release.resolve()
  assert.equal((await pending).windows.S.used, 1, 'hot validation race rebuilds the body, never re-labels the old count')
  assert.equal(reads(), 1)
  await f.read() // the discarded validation did not poison the next key
})

async function seedAssociations(f, instance, sid = 'outside') {
  const { createWorktreeBindings } = await import('../src/controls/worktree-bindings.ts')
  const { createWorktreeObservations } = await import('../src/controls/worktree-observations.ts')
  const bindingStore = [...f.units].find(([name]) => name.startsWith('worktrees_'))[1]
  const observationStore = [...f.units].find(([name]) => name.startsWith('worktree_observations_'))[1]
  const bindings = createWorktreeBindings(() => bindingStore)
  await bindings.registerIntent(instance, caller('root'), { operationId: 'outside-binding', parentSessionId: 'root', plannedChildSessionId: sid, requestedCwd: null })
  await bindings.confirm(instance, 'outside-binding', { sessionId: sid, parentSessionId: 'root', cwd: '/fixture' }, caller('root'))
  await createWorktreeObservations(() => observationStore).observe(instance, caller(sid), {
    creatorSessionId: sid, callId: 'tree', rootCallId: 'tree', turn: 1, step: 1,
    path: '/trees/freshness', branch: 'freshness', baseCommit: 'a'.repeat(40), repositoryRoot: '/repo',
  }, 'program')
  const runtimeStore = f.units.get('runtime_bindings')
  const document = await runtimeStore.read() ?? { schemaVersion: 1, revision: 0, assignments: [], bindings: [], notifications: [], nativeExecutions: [] }
  assert(await runtimeStore.compareAndSwap(document.revision, { ...document, revision: document.revision + 1, nativeExecutions: [{
    executionId: sid, sessionId: sid, parentSessionId: 'root', instrumentInstanceId: instance.instrumentInstanceId,
    provider: null, runId: null, headerCwd: '/fixture', state: 'created', outcome: null, observed: 'agent/created', startedAt: 1, endedAt: null, recordedAt: 1,
  }] }))
  await f.runtime.serializePolicyPermission(async () => {})
}

test('registry creator, binding child and native execution identities stay relevant outside the live owner chain', async t => {
  const { f, before, reads } = await warm(t)
  await seedAssociations(f, before.instance)
  const absent = await f.read()
  assert.equal(absent.worktreeBindings[0].cleanupDue, true)
  assert.equal(absent.worktreeObservations[0].creatorActivity, 'gone')
  assert.equal(absent.nativeExecutions[0].activity, 'gone')
  f.agents.set('outside', actualAgent('outside')) // independent live root, but a registry dependency
  const resident = await f.read()
  assert.equal(resident.worktreeBindings[0].cleanupDue, false)
  assert.equal(resident.worktreeObservations[0].creatorActivity, 'idle')
  assert.equal(resident.nativeExecutions[0].activity, 'idle')
  f.agents.get('outside').status = 'running'
  const active = await f.read()
  assert.equal(active.worktreeObservations[0].creatorActivity, 'running')
  assert.equal(active.nativeExecutions[0].activity, 'running')
  f.agents.delete('outside')
  const gone = await f.read()
  assert.equal(gone.worktreeBindings[0].cleanupDue, true)
  assert.equal(gone.worktreeObservations[0].creatorActivity, 'gone')
  assert.equal(reads(), 4)
  f.agents.set('unreferenced', actualAgent('unreferenced'))
  assert.deepEqual(await f.read(), gone, 'full JSON including nonempty retained registries stays equivalent')
  assert.equal(reads(), 4, 'an unreferenced root still performs zero extra full reads')
})

test('miss dependencies discovered after await are still tokenized from A including absence', async t => {
  const { f, before } = await warm(t)
  await seedAssociations(f, before.instance)
  const entered = deferred(), release = deferred(), read = f.resourceStorage.read.bind(f.resourceStorage)
  let blocked = false
  f.resourceStorage.read = async (...args) => { if (!blocked) { blocked = true; entered.resolve(); await release.promise } return read(...args) }
  const pending = f.read()
  await entered.promise
  f.agents.set('outside', actualAgent('outside'))
  release.resolve()
  assert.equal((await pending).worktreeObservations[0].creatorActivity, 'idle', 'the bounded retry constructs from a new A')
  assert.equal((await f.read()).worktreeObservations[0].creatorActivity, 'idle')
})

test('continuously changing live sources exhaust the bounded retry as a conflict', async t => {
  const { f } = await warm(t)
  f.agents.get('old-child').status = 'running' // start on a miss
  const read = f.ports.readPolicyGrants.bind(f.ports)
  f.ports.readPolicyGrants = async () => {
    const grants = await read(), child = f.agents.get('old-child')
    child.status = child.status === 'running' ? 'idle' : 'running'
    return grants
  }
  await assert.rejects(f.read(), error => error.code === 'revision-conflict')
})

test('a current-consumption owner cache also ignores proven unrelated live changes', async t => {
  const { f } = await warm(t)
  const original = core.SessionInstruments.prototype.readCurrent
  let count = 0
  core.SessionInstruments.prototype.readCurrent = async function(...args) { count++; return original.apply(this, args) }
  t.after(() => { core.SessionInstruments.prototype.readCurrent = original })
  await f.runtime.preStep(caller('root'), signal(), [], 'before-unrelated')
  const baseline = count
  f.agents.set('unrelated-current', actualAgent('unrelated-current'))
  await f.runtime.preStep(caller('root'), signal(), [], 'after-unrelated')
  f.agents.delete('unrelated-current')
  await f.runtime.preStep(caller('root'), signal(), [], 'after-removal')
  assert.equal(count, baseline, 'current consumption performs no extra current projection work')
})

test('hot projection reuse still checks current caller and source authorization', async t => {
  const { f } = await warm(t)
  const authorize = f.ports.authorizeCaller
  f.ports.authorizeCaller = async () => { throw new core.ControlsError('access-denied', 'current caller revoked') }
  await assert.rejects(f.read(), error => error.code === 'access-denied')
  f.ports.authorizeCaller = authorize
  f.ports.authority.resolveSession = async () => { throw new Error('current identity source denied') }
  await assert.rejects(f.read(), /current identity source denied/)
})

test('stored native members remain live dependencies after their parent moves outside the owner chain', async t => {
  let ports
  const f = await mountedFixture(t, {
    configureBeforeMount({ ctx }) { ctx.provide('subagents', { async listDescendants() { return [{ kind: 'child', id: 'child', mode: 'continuable', activity: 'running', hasChildren: false }] } }) },
    runtimeCreated(_runtime, value) { ports = value },
  })
  await f.runtime.savePolicy(operator, policy(), 0, signal())
  const read = () => f.runtime.readSession(caller('root'), 'root', signal())
  await read(); await new Promise(resolve => setImmediate(resolve)); await read()
  assert.deepEqual((await f.runtimeStorage.read())?.nativeExecutions ?? [], [], 'no persisted native execution may accidentally supply this dependency')
  f.agents.set('other', actualAgent('other'))
  f.agents.set('child', Object.assign(actualAgent('child', { parent: 'other', managed: true }), { status: 'idle' }))
  await read(); await new Promise(resolve => setImmediate(resolve))
  const before = await read()
  assert.equal(before.windows.S.used, 0)
  const memberProof = ports.nativeSubagentCountState('root')
  assert.deepEqual(memberProof.memberSessionIds, ['child'])
  memberProof.memberSessionIds.length = 0
  assert.deepEqual(ports.nativeSubagentCountState('root').memberSessionIds, ['child'], 'public compact proof is copied, not the counter-owned Set')
  const reads = fullReads(t)
  f.agents.get('child').status = 'running' // no lifecycle event and no counter revision bump
  const after = await read(), activity = await ports.nativeSubagentActivity('root', signal())
  assert.equal(activity.running, 1, 'native stored membership remains the actual count authority')
  assert.equal(after.windows.S.used, 1, 'hot projection must not exclude a stored member using only its new parent')
  assert.notEqual(after, before)
  assert.equal(after.windows.S.depth.unknown, 1)
  f.agents.get('other').session.header.parentSession = 'root'
  const reconnected = await read()
  assert.equal(reconnected.windows.S.depth.levels['2'], 1, 'native depth uses the member parent even when it is an external fork/root identity')
  f.agents.set('child', Object.assign(actualAgent('child', { parent: 'other', managed: true }), { status: 'idle' }))
  assert.equal((await read()).windows.S.used, 0, 'same-id Agent replacement is relevant without an execution record')
  const child = f.agents.get('child')
  child.session = { ...child.session, header: { ...child.session.header } }
  await read()
  assert.equal(reads(), 4, 'same Agent with a replaced Session is also a new native-member cut')
  f.agents.delete('child')
  assert.equal((await read()).windows.S.used, 0)
  f.agents.set('child', Object.assign(actualAgent('child', { parent: 'other', managed: true }), { status: 'running' }))
  assert.equal((await read()).windows.S.used, 1, 'retained membership sees the same id return after absence')
  f.agents.set('other', actualAgent('other'))
  assert.equal((await read()).windows.S.depth.unknown, 1, 'external ancestor same-id replacement cannot reuse measured depth')
  assert.equal(reads(), 7)
  const stable = await read()
  f.agents.set('unrelated-native-cut', actualAgent('unrelated-native-cut'))
  assert.deepEqual(await read(), stable)
  f.agents.delete('unrelated-native-cut')
  assert.deepEqual(await read(), stable)
  assert.equal(reads(), 7, 'unrelated roots still cause zero extra full reads with native membership proof')
})

test('a legacy count-state seam without membership proof remains readable but cannot certify reuse', async t => {
  const { f, reads } = await warm(t), state = f.ports.nativeSubagentCountState
  f.ports.nativeSubagentCountState = (...args) => {
    const { memberSessionIds, ...legacy } = state(...args)
    return legacy
  }
  await f.read(); await f.read()
  assert.equal(reads(), 2, 'known/revision/live-parent-only evidence is insufficient without native membership coverage')
})

test('unrecorded live descendants of an external stored member enter the next snapshot', async t => {
  let ports
  const f = await mountedFixture(t, {
    configureBeforeMount({ ctx }) { ctx.provide('subagents', { async listDescendants() { return [{ kind: 'child', id: 'child', mode: 'continuable', activity: 'running', hasChildren: false }] } }) },
    runtimeCreated(_runtime, value) { ports = value },
  })
  await f.runtime.savePolicy(operator, policy(), 0, signal())
  const read = () => f.runtime.readSession(caller('root'), 'root', signal())
  await read(); await new Promise(resolve => setImmediate(resolve)); await read()
  f.agents.set('other', actualAgent('other'))
  f.agents.set('child', Object.assign(actualAgent('child', { parent: 'other', managed: true }), { status: 'running' }))
  await read(); await new Promise(resolve => setImmediate(resolve))
  const before = await read()
  assert.equal(before.windows.S.used, 1)
  assert.deepEqual((await f.runtimeStorage.read())?.nativeExecutions ?? [], [])
  const reads = fullReads(t)
  f.agents.set('new-grandchild', Object.assign(actualAgent('new-grandchild', { parent: 'child', managed: true }), { status: 'running' }))
  const after = await read(), actual = await ports.nativeSubagentActivity('root', signal())
  assert.equal(actual.running, 2)
  assert.equal(after.windows.S.used, 2, 'prospective native descendants cannot remain behind a hot body')
  assert.notEqual(after, before)
  assert.equal(reads(), 2, 'membership self-absorption reconstructs at most once under the same permit')
  // Reverse insertion order forces more than one in-memory closure pass.
  const native = (sid, parent, status = 'running') => Object.assign(actualAgent(sid, { parent, managed: true }), { status })
  f.agents.set('deepest', native('deepest', 'deeper'))
  f.agents.set('deeper', native('deeper', 'new-grandchild'))
  assert.equal((await read()).windows.S.used, 4, 'all prospective native depths enter without lifecycle events')
  f.agents.delete('deepest'); f.agents.set('same-count-replacement', native('same-count-replacement', 'deeper'))
  const beforeSwap = reads(), swapped = await read()
  assert.equal(swapped.windows.S.used, 4)
  assert.equal(reads(), beforeSwap + 2, 'equal-size/count swap still sees a new prospective identity and membership cut')
  const replacement = f.agents.get('same-count-replacement')
  replacement.session.header.parentSession = 'other'
  replacement.status = 'idle'
  assert.equal((await read()).windows.S.used, 3, 'absorbed child stays relevant after reparenting away from the member')
  replacement.status = 'running'
  assert.equal((await read()).windows.S.used, 4)
  f.agents.set('same-count-replacement', native('same-count-replacement', 'other', 'idle'))
  assert.equal((await read()).windows.S.used, 3, 'same-id replacement outside the owner chain remains relevant')
  f.agents.delete('deeper')
  assert.equal((await read()).windows.S.used, 2, 'absence of a prospective descendant cannot keep its old running count')
  const stable = await read(), hot = reads()
  f.agents.set('other-owner-root', actualAgent('other-owner-root'))
  assert.deepEqual(await read(), stable)
  f.agents.delete('other-owner-root')
  assert.deepEqual(await read(), stable)
  assert.equal(reads(), hot, 'unrelated root changes still perform zero full rebuilds')
  assert.deepEqual((await f.runtimeStorage.read())?.nativeExecutions ?? [], [], 'closure must not manufacture execution records')
})

test('prospective native closure does not turn ordinary forks into membership bridges', async t => {
  let ports
  const f = await mountedFixture(t, {
    configureBeforeMount({ ctx }) { ctx.provide('subagents', { async listDescendants() { return [{ kind: 'child', id: 'child', mode: 'continuable', activity: 'running', hasChildren: false }] } }) },
    runtimeCreated(_runtime, value) { ports = value },
  })
  await f.runtime.savePolicy(operator, policy(), 0, signal())
  const read = () => f.runtime.readSession(caller('root'), 'root', signal())
  await read(); await new Promise(resolve => setImmediate(resolve)); await read()
  f.agents.set('other', actualAgent('other'))
  f.agents.set('child', Object.assign(actualAgent('child', { parent: 'other', managed: true }), { status: 'running' }))
  await read(); await new Promise(resolve => setImmediate(resolve)); await read()
  f.agents.set('ordinary-fork', Object.assign(actualAgent('ordinary-fork', { parent: 'child' }), { status: 'running' }))
  f.agents.set('fork-native-child', Object.assign(actualAgent('fork-native-child', { parent: 'ordinary-fork', managed: true }), { status: 'running' }))
  const after = await read(), actual = await ports.nativeSubagentActivity('root', signal())
  assert.equal(actual.running, 1, 'native authority does not absorb a newly observed ordinary-fork bridge')
  assert.equal(after.windows.S.used, 1, 'projection cannot reclassify independent fork descendants')
  assert.deepEqual(ports.nativeSubagentCountState('root').memberSessionIds, ['child'])
  // A real native child at the same parent, unlike the fork, is prospective membership.
  f.agents.set('direct-native-child', Object.assign(actualAgent('direct-native-child', { parent: 'child', managed: true }), { status: 'running' }))
  assert.equal((await read()).windows.S.used, 2)
})
