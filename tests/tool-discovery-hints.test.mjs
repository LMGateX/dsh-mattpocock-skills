import assert from 'node:assert/strict'
import test from 'node:test'
import { parseTicketWindowCommand } from '../lib/controls/windows.js'
import { parseInstrumentCommand } from '../lib/controls/instrument-state.js'

test('window command rejects a guessed ticket key and names the accepted keys', () => {
  const base = { operationId: 'op-1', workflowId: 'wf-1', localTicketId: 'T183', action: 'reserve' }
  assert.doesNotThrow(() => parseTicketWindowCommand(base))
  for (const wrong of ['ticket', 'ticketId', 'ticket_ids', 'id', 'tickets', 'key']) {
    assert.throws(() => parseTicketWindowCommand({ ...base, [wrong]: 'T183' }),
      /unknown key .*accepted keys: operationId, workflowId, localTicketId, action/)
  }
})

test('window command without an action states the required explicit action', () => {
  assert.throws(() => parseTicketWindowCommand({ operationId: 'op-1', workflowId: 'wf-1', localTicketId: 'T183' }),
    /must declare action "reserve", "release" or "reacquire"; there is no read action/)
})

test('instrument command errors list the accepted command keys', () => {
  assert.throws(() => parseInstrumentCommand({ operationId: 'op-1', expectedRevision: 1, action: 'put-workflow', workflowId: 'wf-1', references: [], localTicketId: 'T1' }),
    /unknown key .*accepted keys: operationId, expectedRevision, action, workflowId, references, value/)
})
test('authored value arrays carry an element budget', () => {
  const base = { operationId: 'op-1', expectedRevision: 0, action: 'put-workflow', workflowId: 'wf-1', references: [] }
  const axes = Array.from({ length: 65 }, (_value, index) => ({ axisKey: 'a' + index, label: 'A', counting: 'exclusive', statuses: [] }))
  assert.throws(() => parseInstrumentCommand({ ...base, value: { title: 'x', axes } }), /axes accepts at most 64 entries/)
  assert.throws(() => parseInstrumentCommand({ ...base, references: Array.from({ length: 257 }, () => 'r'), value: { title: 'x', axes: [] } }),
    /references accepts at most 256 entries/)
})

test('rejected authored values name the expected shape and enum literals', () => {
  const base = { operationId: 'op-1', expectedRevision: 0, workflowId: 'wf-1', references: [] }
  assert.throws(() => parseInstrumentCommand({ ...base, action: 'put-workflow',
    value: { title: 'x', axes: [{ axisKey: 's', label: 'S', statuses: [] }] } }),
    /axis\.counting must be "exclusive" or "overlapping"; workflow value shape: \{title, axes:\[\{axisKey, label, counting:/)
  assert.throws(() => parseInstrumentCommand({ ...base, action: 'put-ticket', localTicketId: 'T1', value: { title: 'x' } }),
    /ticket statuses must be a plain object; ticket value shape: \{title, statuses:\{<axisKey>:\[<statusKey>, \.\.\.\]\}/)
  assert.throws(() => parseInstrumentCommand({ ...base, action: 'put-ticket', localTicketId: 'T1',
    value: { title: 'x', statuses: { s: 'open' } } }),
    /status selections must be an array; ticket value shape:/)
  assert.throws(() => parseInstrumentCommand({ ...base, action: 'put-decision', decisionId: 'D1', value: { question: 'q' } }),
    /decision status must be non-empty text.*; decision value shape: \{question, status, pending\?/)
})