import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fixture, caller, policy, signal, workflow } from './fixtures/runtime-host.mjs'

const textFrom = messages => { assert.equal(messages.length, 1); return messages[0].content[0].text }
const factsFrom = text => JSON.parse(text.split('Current runtime facts (null means unavailable/unknown, not zero):\n')[1])
const result = { answer: 'Wait for read-only input', source: { kind: 'user-message', messageId: 'original-answer' },
  included: ['Isolated fixtures'], excluded: ['SDK installation', 'Production restart'] }

test('reply guidance names nested result fields and partial structured replies retain pending and existing await obligations', async t => {
  const f = await fixture(t, { initialPolicy: policy(), known: true })
  await f.apply('put-workflow', { value: workflow })
  await f.apply('put-decision', { decisionId: 'partial', value: { question: 'Need qualified input', status: 'partial reply',
    pending: true, awaitingImplementation: true, result } })
  const text = textFrom(await f.runtime.preStep(caller('root'), signal()))
  for (const field of ['result.answer', 'result.source', 'result.included', 'result.excluded']) assert.ok(text.includes(field), 'missing supported result position ' + field)
  const current = factsFrom(text)
  assert.equal(current.records.decisions.rows[0].value.pending, true)
  assert.equal(current.records.decisions.rows[0].value.awaitingImplementation, true)
  assert.deepEqual(current.records.decisions.rows[0].value.result, result)
  await f.apply('put-decision', { decisionId: 'partial', value: { question: 'Need qualified input', status: 'legacy answer', result: 'Old direct user text' } })
  const legacy = (await f.read()).records.decisions[0].value
  assert.equal(legacy.result, 'Old direct user text')
  assert.equal(legacy.pending, true)
  assert.equal(legacy.awaitingImplementation, true)
})

// Public Runtime apply/read/preStep/history selection, never private storage inspection or production data.
test('retained structured conclusions preserve answer/source/scope and explicit inclusion choices after reopen', async t => {
  const f = await fixture(t, { initialPolicy: policy(), known: true })
  await f.apply('put-workflow', { value: workflow })
  for (const decisionId of ['included', 'excluded']) {
    await f.apply('put-decision', { decisionId, references: ['native:original-answer'], value: {
      question: 'Original ' + decisionId, status: 'answered', pending: false, awaitingImplementation: false, result } })
    await f.runtime.historyAction(caller('root'), 'root', { action: 'set-context', kind: 'decision', recordId: JSON.stringify(['flow', decisionId]), included: decisionId === 'included' }, signal())
  }
  const snapshot = await f.read()
  assert.deepEqual(snapshot.records.decisions.map(row => row.value.result), [result, result])
  let current = factsFrom(textFrom(await f.runtime.preStep(caller('root'), signal())))
  assert.equal(current.contextConclusions.total, 1)
  assert.equal(current.contextConclusions.rows[0].decisionId, 'included')
  assert.deepEqual(current.contextConclusions.rows[0].result, result)
  assert.deepEqual(current.contextConclusions.rows[0].references, ['native:original-answer'])
  await f.reopen()
  current = factsFrom(textFrom(await f.runtime.preStep(caller('root'), signal())))
  assert.deepEqual(current.contextConclusions.rows.map(row => row.decisionId), ['included'])
  assert.deepEqual(current.contextConclusions.rows[0].result, result)
})
