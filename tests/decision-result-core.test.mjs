import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SessionInstruments, OwnerDecisionPolicyStore, parseOwnerDecisionPolicyDocument, parseInstrumentDocument } from '../lib/controls/index.js'
import { instrumentFixture } from './fixtures/instrument-fixture.mjs'
import { MemoryVersionedStorage } from '../lib/controls/versioned-storage.js'

const answer = { answer: 'Isolated tests only', selectedOptionKey: 'B', source: { kind: 'user-message', sessionId: 'A', messageId: 'reply' }, included: ['temporary fixtures'], excluded: ['SDK changes', 'production data'] }
const question = { question: 'Choose scope', status: 'open', pending: true, awaitingImplementation: true, addressee: { kind: 'user' }, result: 'Original text' }
const code = expected => error => error.code === expected

test('first structured result upgrades on demand to V5 and reopens without altering authored obligations', async () => {
  const f = await instrumentFixture()
  await f.apply('put-workflow', { value: { title: 'Task', axes: [] } })
  await f.apply('put-decision', { decisionId: 'D', value: question })
  const id = (await f.read()).instance.instrumentInstanceId
  assert.equal((await f.storage.read(id)).schemaVersion, 2)
  const command = await f.command('put-decision', { decisionId: 'D', value: { question: question.question, status: 'reported', result: answer } })
  const applied = await f.instruments.apply('A', 'A', command)
  const stored = await f.storage.read(id)
  assert.equal(stored.schemaVersion, 5)
  assert.deepEqual(applied.snapshot.capabilities.storageVersions, [1, 2, 3, 4, 5])
  assert.equal(applied.snapshot.capabilities.structuredDecisionResults, true)
  const coldStorage = { read: async () => JSON.parse(JSON.stringify(stored)), compareAndSwap: async () => assert.fail('replay must not write') }
  const reopened = new SessionInstruments(f.controls, coldStorage, f.authority)
  const row = (await reopened.readCurrent('A', 'A')).decisions[0]
  assert.deepEqual(row.value.result, answer)
  assert.equal(row.value.pending, true)
  assert.equal(row.value.awaitingImplementation, true)
  assert.equal(row.creator.sessionId, 'A')
  assert.equal(row.policySelection, undefined)
  assert.equal(row.provenance.author.kind, 'agent')
  const replay = await reopened.apply('A', 'A', command)
  assert.equal(replay.replayed, true)
  assert.equal(replay.appliedRevision, applied.appliedRevision)
  await assert.rejects(reopened.apply('A', 'A', { ...command, value: { ...command.value, result: { answer: 'Different' } } }), code('operation-conflict'))
  await assert.rejects(reopened.apply('A', 'A', { ...command, operationId: 'stale' }), code('revision-conflict'))
})

function atVersion(document, schemaVersion) {
  const value = structuredClone(document)
  value.schemaVersion = schemaVersion
  if (schemaVersion === 1) { delete value.checkpoint; delete value.dedup; delete value.coverage }
  else if (schemaVersion === 2) delete value.checkpoint.state.taskReferences
  else value.checkpoint.state.taskReferences ??= []
  return value
}

test('V1–V4 keep old text readable but reject object results in event tails and retained checkpoint versions', async () => {
  const f = await instrumentFixture()
  await f.apply('put-workflow', { value: { title: 'Task', axes: [] } })
  await f.apply('put-decision', { decisionId: 'D', value: question })
  const id = (await f.read()).instance.instrumentInstanceId, legacy = await f.storage.read(id)
  for (const version of [1, 2, 3, 4]) {
    const plain = atVersion(legacy, version)
    assert.equal(parseInstrumentDocument(plain).schemaVersion, version)
    const reopened = new SessionInstruments(f.controls, { read: async () => plain }, f.authority)
    assert.equal((await reopened.readCurrent('A', 'A')).decisions[0].value.result, 'Original text')
    plain.events[1].command.value.result = answer
    assert.throws(() => parseInstrumentDocument(plain), error => error.code === 'invalid-state' && /result/.test(error.message))
  }
  await f.apply('put-decision', { decisionId: 'D', value: { question: question.question, status: 'reported', result: answer } })
  await f.apply('put-decision', { decisionId: 'D', value: { question: question.question, status: 'text again', result: 'Still old-compatible text' } })
  await f.instruments.compact('A', 'A', { operationId: 'checkpoint', expectedRevision: (await f.read()).revision })
  const checkpoint = await f.storage.read(id)
  assert.equal(checkpoint.schemaVersion, 5)
  for (const version of [2, 3, 4]) {
    assert.throws(() => parseInstrumentDocument(atVersion(checkpoint, version)), error => error.code === 'invalid-state' && /result/.test(error.message))
  }
})

test('structured results inherit by omission, replace as a whole, clear with null and never auto-change attention', async () => {
  const f = await instrumentFixture()
  await f.apply('put-workflow', { value: { title: 'Task', axes: [] } })
  await f.apply('put-decision', { decisionId: 'D', value: { ...question, result: answer } })
  await f.apply('put-decision', { decisionId: 'D', value: { question: question.question, status: 'edit only' } })
  assert.deepEqual((await f.read()).decisions[0].value.result, answer)
  await f.apply('put-decision', { decisionId: 'D', value: { question: question.question, status: 'replace', result: { answer: 'Replacement' } } })
  assert.deepEqual((await f.read()).decisions[0].value.result, { answer: 'Replacement' })
  await f.apply('put-decision', { decisionId: 'D', value: { question: question.question, status: 'clear', result: null } })
  const snapshot = await f.read(), row = snapshot.decisions[0]
  assert.equal(row.value.result, null)
  assert.equal(row.value.pending, true)
  assert.equal(row.value.awaitingImplementation, true)
  assert.equal((await f.storage.read(snapshot.instance.instrumentInstanceId)).schemaVersion, 5)
})

test('V5 structured replies retain assigned ACL, original creator and current authorization on replay and cleanup', async () => {
  const f = await instrumentFixture()
  await f.apply('put-workflow', { value: { title: 'Task', axes: [] } })
  for (const localTicketId of ['T1', 'T2']) await f.apply('put-task-reference', { localTicketId, value: { source: { kind: 'unverified' }, locator: 'task:' + localTicketId } })
  await f.apply('put-decision', { decisionId: 'private', value: { ...question, result: answer } })
  const command = await f.command('put-decision', { decisionId: 'child-owned', value: { ...question, result: answer, ticketIds: ['T1'] } }, 'child', 'child')
  await f.instruments.apply('child', 'child', command)
  assert.deepEqual((await f.read('child', 'child')).decisions.map(row => row.decisionId), ['child-owned'])
  await assert.rejects(f.apply('put-decision', { decisionId: 'child-owned', value: { ...question, result: answer, ticketIds: ['T2'] } }, 'child', 'child'), code('access-denied'))
  await assert.rejects(f.apply('put-decision', { decisionId: 'private', value: { ...question, result: answer } }, 'child', 'child'), code('access-denied'))
  await assert.rejects(f.instruments.compact('child', 'child', { operationId: 'child-cleanup', expectedRevision: (await f.read()).revision }), code('access-denied'))
  f.scopes.set('child', { kind: 'assigned', workflowId: 'flow', ticketIds: [] })
  assert.equal((await f.read('child', 'child')).decisions.length, 0)
  await assert.rejects(f.instruments.apply('child', 'child', command), code('access-denied'))
  const snapshot = await f.read()
  await f.instruments.compact('A', 'A', { operationId: 'owner-cleanup', expectedRevision: snapshot.revision })
  assert.equal((await f.read()).decisions.find(row => row.decisionId === 'child-owned').creator.sessionId, 'child')
})

const user = { kind: 'user', principalId: 'user', sessionId: null }
async function policyFixture() {
  const f = await instrumentFixture(), instance = (await f.read()).instance
  const storage = new MemoryVersionedStorage(parseOwnerDecisionPolicyDocument)
  const policy = new OwnerDecisionPolicyStore({ storageFor: () => storage, now: () => 12345, newEpochId: () => 'epoch', authorizeOperator: async () => {}, authorizeEnable: async () => {} })
  await policy.save(instance, { operationId: 'enable', expectedRevision: 0, expectedScope: instance, action: 'enable', durationMs: null }, user)
  const instruments = new SessionInstruments(f.controls, f.storage, f.authority, () => 12345, policy)
  const apply = async (action, fields) => instruments.apply('A', 'A', { operationId: crypto.randomUUID(), expectedRevision: (await instruments.read('A', 'A')).businessRevision, workflowId: 'flow', action, ...fields })
  await apply('put-workflow', { value: { title: 'Task', axes: [] } })
  return { ...f, instance, policy, instruments, apply }
}
const qualified = { ...question, addressee: { kind: 'user', principalId: 'user' }, options: [{ key: 'B', label: 'Recommended' }], recommendation: 'B' }
const adopt = async (f, decisionId) => {
  const snapshot = await f.instruments.read('A', 'A'), row = snapshot.decisions.find(row => row.decisionId === decisionId), candidate = row.recommendationSupport.candidate
  return { operationId: 'adopt-' + decisionId, expectedRevision: snapshot.businessRevision, workflowId: 'flow', action: 'adopt-decision-recommendation', decisionId, value: { optionKey: candidate.optionKey, decisionRevision: candidate.decisionRevision, policyEpochId: candidate.policyEpochId, policyRevision: candidate.policyRevision } }
}

test('V4 upgrade and V5 new bindings, adoption, checkpoint and purge keep policy/creator metadata and durable dedup', async () => {
  const f = await policyFixture()
  await f.apply('put-task-reference', { localTicketId: 'T1', value: { source: { kind: 'unverified' }, locator: 'task:1' } })
  await f.apply('put-decision', { decisionId: 'old', value: { ...qualified, ticketIds: ['T1'] }, references: ['task:commitments'] })
  const oldAdoption = await adopt(f, 'old')
  await f.instruments.apply('A', 'A', oldAdoption)
  assert.equal((await f.storage.read(f.instance.instrumentInstanceId)).schemaVersion, 4)
  await f.apply('put-decision', { decisionId: 'structured', value: { ...qualified, result: answer }, references: ['message:reply'] })
  const structuredAdoption = await adopt(f, 'structured')
  await f.instruments.apply('A', 'A', structuredAdoption)
  const before = await f.instruments.read('A', 'A')
  assert.equal(before.decisions[1].policySelection.selectedOptionKey, 'B')
  assert.deepEqual(before.decisions[1].value.result, answer)
  assert.equal(before.decisions[1].value.awaitingImplementation, true)
  await f.instruments.compact('A', 'A', { operationId: 'compact-v5', expectedRevision: before.revision })
  let snapshot = await f.instruments.readCurrent('A', 'A')
  assert.equal(snapshot.taskReferences[0].localTicketId, 'T1')
  for (const row of snapshot.decisions) { assert.equal(row.policySelection.selectedOptionKey, 'B'); assert.equal(row.creator.sessionId, 'A') }
  const saved = await f.storage.read(f.instance.instrumentInstanceId)
  assert.equal(saved.schemaVersion, 5)
  assert.doesNotThrow(() => parseInstrumentDocument(JSON.parse(JSON.stringify(saved))))
  await f.instruments.purgeHistory('A', 'A', { operationId: 'purge-v5', expectedRevision: saved.revision, throughRevision: before.revision, targets: [{ kind: 'decision', workflowId: 'flow', decisionId: 'old' }, { kind: 'decision', workflowId: 'flow', decisionId: 'structured' }] })
  snapshot = await f.instruments.read('A', 'A')
  assert.deepEqual(snapshot.decisions[1].value.result, answer)
  assert.equal(snapshot.decisions[1].history.length, 1)
  assert.equal(snapshot.decisions[1].policyBinding.createdRevision, 5)
  assert.equal(snapshot.decisions[1].history[0].policySelection.selectedOptionKey, 'B')
  assert.equal((await f.instruments.apply('A', 'A', oldAdoption)).replayed, true)
  assert.equal((await f.instruments.apply('A', 'A', structuredAdoption)).replayed, true)
  const corrupted = JSON.parse(JSON.stringify(await f.storage.read(f.instance.instrumentInstanceId)))
  corrupted.checkpoint.state.decisions[1].creator = user
  assert.throws(() => parseInstrumentDocument(corrupted), code('invalid-state'))
})

test('final policy expiry fallback still writes the ordinary structured question as V5 without a binding', async () => {
  const f = await policyFixture()
  await f.policy.save(f.instance, { operationId: 'short', expectedRevision: 1, expectedScope: f.instance, action: 'enable', durationMs: 1 }, user)
  const times = [12345, 12346]
  const instruments = new SessionInstruments(f.controls, f.storage, f.authority, () => times.shift() ?? 12346, f.policy)
  const saved = await instruments.apply('A', 'A', { operationId: 'expiring-structured', expectedRevision: 1, workflowId: 'flow', action: 'put-decision', decisionId: 'D', value: { ...qualified, result: answer } })
  assert.deepEqual(saved.snapshot.decisions[0].value.result, answer)
  assert.equal(saved.snapshot.decisions[0].value.pending, true)
  assert.equal(saved.snapshot.decisions[0].policyBinding, undefined)
  assert.equal((await f.storage.read(f.instance.instrumentInstanceId)).schemaVersion, 5)
})

test('competing structured updates still require one business CAS and identical concurrent operations replay', async () => {
  const f = await instrumentFixture()
  await f.apply('put-workflow', { value: { title: 'Task', axes: [] } })
  const command = await f.command('put-decision', { decisionId: 'D', value: { ...question, result: answer } })
  const duplicate = await Promise.all([f.instruments.apply('A', 'A', command), f.instruments.apply('A', 'A', command)])
  assert.equal(duplicate.filter(result => result.replayed).length, 1)
  assert.deepEqual(duplicate.map(result => result.appliedRevision), [2, 2])
  const update = await f.command('put-decision', { decisionId: 'D', value: { question: question.question, status: 'edit', result: { answer: 'First' } } })
  const results = await Promise.allSettled([f.instruments.apply('A', 'A', update), f.instruments.apply('A', 'A', { ...update, operationId: 'competing', value: { ...update.value, result: { answer: 'Second' } } })])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'revision-conflict')
  assert.equal((await f.read()).decisions[0].history.length, 2)
})


