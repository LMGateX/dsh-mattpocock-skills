import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as controls from '../lib/controls/index.js'

const command = result => ({ operationId: 'answer', expectedRevision: 0, action: 'put-decision', workflowId: 'flow', decisionId: 'D', value: { question: 'Scope?', status: 'answered', result } })

test('public decision command accepts closed structured answers and preserves their authored scope', () => {
  const result = { answer: 'Use the isolated runtime', selectedOptionKey: 'isolated', source: { kind: 'user-message', sessionId: 'owner', messageId: 'reply', text: 'Yes, isolated only', position: 'line 4' }, included: ['isolated tests'], excluded: 'No production changes' }
  assert.deepEqual(controls.parseInstrumentCommand(command(result)).value.result, result)
  assert.deepEqual(controls.parseDecisionResult(result), result)
  assert.equal(controls.decisionResultText(result), 'Use the isolated runtime\nSelected option: isolated\nSource (user-message): session=owner; message=reply; position=line 4; Yes, isolated only\nIncluded: isolated tests\nExcluded: No production changes')
  assert.equal(controls.decisionResultText('old text'), 'old text')
  assert.equal(controls.decisionResultText(null), '')
  assert.equal(controls.decisionResultText(undefined), '')
})

test('strict result parsing rejects unknown fields, non-JSON graphs, empty text and oversized scope', () => {
  const rejected = [
    {}, [], true, 'text', null, { answer: '' }, { answer: '  ' }, { answer: 'bad\0text' },
    { answer: 'ok', unknown: true }, { answer: 'ok', selectedOptionKey: ' padded ' },
    { answer: 'ok', selectedOptionKey: 'x'.repeat(257) }, { answer: 'ok', source: null },
    { answer: 'ok', source: { kind: 'chat', authenticated: true } }, { answer: 'ok', source: { kind: '' } },
    { answer: 'ok', source: { kind: 'chat', sessionId: '' } }, { answer: 'ok', source: { kind: 'chat', messageId: 'bad\nID' } },
    { answer: 'ok', source: { kind: 'chat', text: '' } }, { answer: 'ok', source: { kind: 'chat', position: 'bad\0position' } },
    { answer: 'ok', included: null }, { answer: 'ok', excluded: [''] }, { answer: 'ok', included: new Array(2) },
    { answer: 'ok', included: Array(65).fill('scope') }, { answer: 'ok', excluded: [1] },
    { answer: 'ok', included: undefined }, { answer: 'x'.repeat(65524) }, { answer: '\n'.repeat(32768) },
    Object.assign(Object.create({ inherited: true }), { answer: 'ok' }),
    Object.defineProperty({}, 'answer', { get() { assert.fail('must not execute getters') }, enumerable: true }),
    Object.defineProperty({ answer: 'ok' }, 'hidden', { value: true }),
    { answer: 'ok', [Symbol('hidden')]: true },
  ]
  for (const value of rejected) assert.throws(() => controls.parseDecisionResult(value), error => error.code === 'invalid-input')
  for (const value of rejected.filter(value => value !== null && typeof value !== 'string')) assert.throws(() => controls.parseInstrumentCommand(command(value)), error => error.code === 'invalid-input')
  const boundary = { answer: 'x'.repeat(65523) }
  assert.equal(JSON.stringify(boundary).length, 65536)
  assert.deepEqual(controls.parseDecisionResult(boundary), boundary)
  const sixtyFour = { answer: 'ok', included: Array(64).fill('scope'), excluded: [] }
  const parsed = controls.parseDecisionResult(sixtyFour)
  assert.deepEqual(parsed, sixtyFour)
  assert(Object.isFrozen(parsed.included))
  sixtyFour.included[0] = 'mutated caller'
  assert.equal(parsed.included[0], 'scope')
})

test('legacy strings and null remain valid; omission does not fabricate a result', () => {
  assert.equal(controls.parseInstrumentCommand(command('old answer')).value.result, 'old answer')
  assert.equal(controls.parseInstrumentCommand(command(null)).value.result, null)
  const omitted = command(null)
  delete omitted.value.result
  assert.equal(Object.hasOwn(controls.parseInstrumentCommand(omitted).value, 'result'), false)
  for (const invalid of ['', '  ', 'bad\0text', 123, false]) assert.throws(() => controls.parseInstrumentCommand(command(invalid)), error => error.code === 'invalid-input')
})
