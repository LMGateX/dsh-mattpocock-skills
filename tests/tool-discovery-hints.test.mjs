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
    /explicit reserve\/release\/reacquire required/)
})

test('instrument command errors list the accepted command keys', () => {
  assert.throws(() => parseInstrumentCommand({ operationId: 'op-1', expectedRevision: 1, action: 'put-workflow', workflowId: 'wf-1', references: [], localTicketId: 'T1' }),
    /unknown key .*accepted keys: operationId, expectedRevision, action, workflowId, references, value/)
})
