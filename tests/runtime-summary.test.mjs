import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fixture, caller, policy, signal, operator, actualAgent } from './fixtures/runtime-host.mjs'

const settle = () => new Promise(resolve => setImmediate(resolve))

test('summary reads count authorized pending-user matters without building full runtime detail', async t => {
  const f = await fixture(t, { initialPolicy: policy() })
  await f.apply('put-workflow', { value: { title: 'Summary task', axes: [] } })
  await f.apply('put-decision', { decisionId: 'D', value: { question: 'Do not transfer the decision body', status: 'waiting', pending: true, addressee: { kind: 'user', principalId: 'user:operator' } } })
  await settle()
  assert.equal(typeof f.runtime.readSummaries, 'function')
  f.runtime.readSession = async () => assert.fail('summary must not call the full facade')
  f.windowStorage.read = async () => assert.fail('summary must not read windows')
  f.resourceStorage.read = async () => assert.fail('summary must not read resources')
  f.ports.sessionFacts = async () => assert.fail('summary must not replay session logs')
  f.ports.gitRunnerForSession = () => assert.fail('summary must not run Git')
  for (const [name, store] of f.units) {
    if (/^(history_|worktree)/u.test(name)) store.read = async () => assert.fail('summary must not read ' + name)
  }
  const response = await f.runtime.readSummaries(caller('root'), { sessions: [{ sessionId: 'root' }] }, signal())
  const row = response.rows[0]
  assert.equal(row.status, 'current')
  assert.equal(row.summary.records.summary.pendingUserDecisionCount, 1)
  assert.equal(row.summary.records.summary.countingScope, 'instance')
  assert.deepEqual(row.summary.health, [])
  assert.equal(row.summary.instance.ownerSessionId, 'root')
  assert.match(row.version, /^[a-f0-9]{64}$/u)
  assert.equal(JSON.stringify(response).includes('Do not transfer'), false)
  assert.ok(Buffer.byteLength(JSON.stringify(response)) < 2_048)
  const unchanged = await f.runtime.readSummaries(caller('root'), { sessions: [{ sessionId: 'root', version: row.version }] }, signal())
  assert.deepEqual(unchanged.rows, [{ sessionId: 'root', status: 'unchanged', version: row.version }])
})

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const request = (sessionId, version) => ({ sessions: [{ sessionId, ...(version === undefined ? {} : { version }) }] })
const read = (f, sessionId = 'root', version) => f.runtime.readSummaries(caller(sessionId), request(sessionId, version), signal())
async function pendingMatter(f, ticketIds = []) {
  await f.apply('put-workflow', { value: { title: 'Task', axes: [] } })
  for (const localTicketId of ticketIds) await f.apply('put-ticket', { localTicketId, value: { title: localTicketId, statuses: {} } })
  await f.apply('put-decision', { decisionId: 'D', value: { question: 'Private matter body', status: 'pending', pending: true,
    ticketIds: ticketIds.slice(0, 1), addressee: { kind: 'user', principalId: 'user:operator' } } })
}

test('summary batches use actual callers and do not ensure unknown cold identities or wake registered cold sessions', async t => {
  const f = await fixture(t)
  const cold = f.agents.get('other'); f.agents.delete('other'); f.cold.set('other', cold)
  f.cold.set('unregistered', actualAgent('unregistered'))
  const before = await f.controlsStorage.read(), unitCount = f.units.size
  const result = await f.runtime.readSummaries(operator, { sessions: [{ sessionId: 'root' }, { sessionId: 'other' }, { sessionId: 'unregistered' }] }, signal())
  assert.deepEqual(result.rows.map(row => row.status), ['current', 'current', 'unavailable'])
  assert.equal(result.rows[1].summary.records.summary.pendingUserDecisionCount, 0)
  assert.equal(result.rows[2].reason, 'unknown-session')
  assert.equal((await f.controlsStorage.read()).revision, before.revision)
  assert.equal(f.units.size, unitCount)
  assert.equal(f.agents.has('other'), false)
  assert.equal(f.agents.has('unregistered'), false)
  assert.equal(f.observations.filter(id => id.startsWith('released:')).length, f.observations.filter(id => !id.startsWith('released:')).length)
  const restricted = await f.runtime.readSummaries(caller('root'), { sessions: [{ sessionId: 'root' }, { sessionId: 'other' }] }, signal())
  assert.equal(restricted.rows[0].status, 'current')
  assert.deepEqual(restricted.rows[1], { sessionId: 'other', status: 'unavailable', reason: 'access-denied' })
  await assert.rejects(f.runtime.readSummaries({ ...caller('root'), principalId: 'agent:old-child' }, request('root'), signal()), { code: 'access-denied' })
})

test('known versions never mask records failure, leak error bodies, or guess a successful zero', async t => {
  const f = await fixture(t, { initialPolicy: policy() }); await pendingMatter(f)
  const healthy = (await read(f)).rows[0], source = f.instrumentStorage.read.bind(f.instrumentStorage)
  f.instrumentStorage.read = async (...args) => { if (args[0] === healthy.summary.instance.instrumentInstanceId) throw new Error('private /storage/path contents'); return source(...args) }
  const failed = await f.runtime.readSummaries(operator, { sessions: [{ sessionId: 'root', version: healthy.version }, { sessionId: 'other' }] }, signal())
  assert.equal(failed.rows[0].status, 'current')
  assert.equal(failed.rows[0].summary.records, null)
  assert.deepEqual(failed.rows[0].summary.health, [{ scope: 'records', status: 'unknown', reason: 'records-unavailable' }])
  assert.equal(failed.rows[1].summary.records.summary.pendingUserDecisionCount, 0)
  assert.equal(JSON.stringify(failed).includes('/storage/path'), false)
  assert.notEqual(failed.rows[0].version, healthy.version)
  f.instrumentStorage.read = source
  const recovered = (await read(f, 'root', failed.rows[0].version)).rows[0]
  assert.equal(recovered.status, 'current'); assert.equal(recovered.version, healthy.version)
  assert.equal(recovered.summary.records.summary.pendingUserDecisionCount, 1)
})

test('summary known-version lookup waits for queued assignment revocation and hashes scope even when counts match', async t => {
  const f = await fixture(t, { initialPolicy: policy() }); await pendingMatter(f, ['A', 'B'])
  await f.assign('old-child', 'flow', ['A'])
  const before = (await read(f, 'old-child')).rows[0]
  assert.equal(before.summary.records.summary.pendingUserDecisionCount, 1)
  const storage = f.units.get('runtime_bindings'), cas = storage.compareAndSwap.bind(storage), entered = deferred(), permit = deferred()
  storage.compareAndSwap = async (revision, next) => { if (next.assignments.some(row => row.sessionId === 'old-child' && row.ticketIds[0] === 'B')) { entered.resolve(); await permit.promise } return cas(revision, next) }
  const revoke = f.assign('old-child', 'flow', ['B']); await entered.promise
  let completed = false
  const pending = read(f, 'old-child', before.version); pending.then(() => { completed = true }, () => { completed = true })
  try { await settle(); assert.equal(completed, false) } finally { permit.resolve() }
  await revoke
  const after = (await pending).rows[0]
  assert.equal(after.status, 'current'); assert.equal(after.summary.records.summary.pendingUserDecisionCount, 0)
  assert.notEqual(after.version, before.version)
  await f.assign('old-child', 'flow', [])
  const sameCountNewScope = (await read(f, 'old-child', after.version)).rows[0]
  assert.equal(sameCountNewScope.status, 'current')
  assert.equal(sameCountNewScope.summary.records.summary.pendingUserDecisionCount, 0)
  assert.notEqual(sameCountNewScope.version, after.version, 'different permissions are not an unchanged count-only cache hit')
})

test('each summary item reauthorizes after a queued permission-effect and yields to already queued writers', async t => {
  const f = await fixture(t), { ControlsError } = await import('../src/controls/validation.ts')
  const before = (await read(f)).rows[0], authorize = f.ports.authorizeCaller.bind(f.ports), entered = deferred(), permit = deferred()
  let revoked = false
  f.ports.authorizeCaller = async (...args) => { if (revoked) throw new ControlsError('access-denied', 'private revocation reason'); return authorize(...args) }
  const revoke = f.runtime.serializePolicyPermission(async () => { entered.resolve(); await permit.promise; revoked = true })
  await entered.promise
  const pending = read(f, 'root', before.version)
  try { await settle() } finally { permit.resolve() }
  await revoke
  assert.deepEqual((await pending).rows, [{ sessionId: 'root', status: 'unavailable', reason: 'access-denied' }])
  revoked = false
  const source = f.instrumentStorage.read.bind(f.instrumentStorage), first = deferred(), release = deferred()
  let marker = false, calls = 0
  f.instrumentStorage.read = async (...args) => { if (++calls === 1) { first.resolve(); await release.promise } else assert.equal(marker, true, 'the next item must not leapfrog an already queued writer'); return source(...args) }
  const batch = f.runtime.readSummaries(operator, { sessions: [{ sessionId: 'root' }, { sessionId: 'other' }] }, signal())
  await first.promise
  const writer = f.runtime.serializePolicyPermission(async () => { marker = true })
  release.resolve(); await writer
  assert.deepEqual((await batch).rows.map(row => row.status), ['current', 'current'])
})

test('summary abort propagates instead of turning cancelled source work into a successful unknown row', async t => {
  const f = await fixture(t), entered = deferred(), permit = deferred(), source = f.instrumentStorage.read.bind(f.instrumentStorage)
  const controller = new AbortController()
  f.instrumentStorage.read = async (...args) => { entered.resolve(); await permit.promise; return source(...args) }
  const pending = f.runtime.readSummaries(caller('root'), request('root'), controller.signal)
  await entered.promise; controller.abort(); permit.resolve()
  await assert.rejects(pending, { name: 'AbortError' })
  await assert.rejects(f.runtime.readSummaries(caller('root'), request('root'), controller.signal), { name: 'AbortError' })
})

test('summary versions include effective OFF/display policy while preserved obligations remain counted', async t => {
  const f = await fixture(t, { initialPolicy: policy() }); await pendingMatter(f)
  const before = (await read(f)).rows[0]
  await f.save({ extensionEnabled: false, defaults: {}, workspaceOverrides: {} })
  const after = (await read(f, 'root', before.version)).rows[0]
  assert.equal(after.status, 'current'); assert.notEqual(after.version, before.version)
  assert.equal(after.summary.policy.extensionEnabled, false)
  assert.equal(after.summary.records.summary.pendingUserDecisionCount, 1)
  assert.equal(after.summary.records.businessRevision, before.summary.records.businessRevision)
})
