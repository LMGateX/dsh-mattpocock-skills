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
