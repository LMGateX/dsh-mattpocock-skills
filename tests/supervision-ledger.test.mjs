import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SupervisionLedger } from '../lib/controls/supervision-ledger.js'

const at = Date.parse('2026-10-30T12:00:00Z')
const roots = { deliverableRoots: ['src', 'docs'], supportRoots: ['notes', 'evidence'], excludeGlobs: ['src/generated'] }

test('ledger classifies product/support writes and keeps only bounded memory state', () => {
  const ledger = new SupervisionLedger()
  ledger.record({ ownerSessionId: 'owner', sessionId: 'child', callId: 'c1', tool: 'write', at, arguments: { file_path: 'src/a.ts' } })
  ledger.record({ ownerSessionId: 'owner', sessionId: 'child', callId: 'c2', tool: 'edit', at: at + 1000, arguments: { files: ['notes/a.md', 'notes/b.md'] } })
  ledger.record({ ownerSessionId: 'owner', sessionId: 'child', callId: 'c3', tool: 'read', at: at + 2000, arguments: { path: 'src/a.ts' } })
  ledger.record({ ownerSessionId: 'owner', sessionId: 'child', callId: 'c1', tool: 'write', at, arguments: { file_path: 'src/a.ts' } })
  const summary = ledger.summary('owner', roots, at + 3_600_000)
  assert.equal(summary.events, 4)
  assert.equal(summary.productWrites, 1)
  assert.equal(summary.supportWrites, 2)
  assert.equal(summary.productFiles.includes('src/a.ts'), true)
  assert.equal(summary.supportFiles.length, 2)
  assert.equal(summary.supportOnly, false)
  assert.equal(summary.lastProductAt, new Date(at).toISOString())
  assert.equal(summary.noProductHours, 1)
  assert.equal(summary.recent.length, 4)
})

test('ticket attribution groups writes without hiding unattributed activity', () => {
  const ledger = new SupervisionLedger()
  ledger.record({ ownerSessionId: 'owner', sessionId: 'owner', callId: 't1', tool: 'write', at, arguments: { path: 'src/a.ts' }, tickets: [{ workflowId: 'flow', ticketId: 'T1' }] })
  ledger.record({ ownerSessionId: 'owner', sessionId: 'owner', callId: 't2', tool: 'write', at: at + 1, arguments: { path: 'notes/b.md' } })
  ledger.record({ ownerSessionId: 'owner', sessionId: 'owner', callId: 'u1', tool: 'write', at: at + 2, arguments: { path: 'src/c.ts' } })
  const summary = ledger.summary('owner', roots, at + 60_000)
  assert.deepEqual(summary.tickets.map(row => [row.ticketId, row.productWrites, row.supportWrites]), [['T1', 1, 0]])
  assert.equal(summary.unattributedWrites, 2)
  ledger.tagSession('owner', 'owner', [{ workflowId: 'flow', ticketId: 'T2' }])
  const tagged = ledger.summary('owner', roots, at + 60_000)
  assert.equal(tagged.tickets.some(row => row.ticketId === 'T2' && row.productWrites === 1 && row.supportWrites === 1), true)
})

test('ledger reports support-only, unset roots and excluded paths honestly', () => {
  const ledger = new SupervisionLedger()
  ledger.record({ ownerSessionId: 'owner', sessionId: 'owner', callId: 's1', tool: 'write', at, arguments: { path: 'notes/a.md' } })
  const supportOnly = ledger.summary('owner', roots, at + 60_000)
  assert.equal(supportOnly.supportOnly, true)
  assert.equal(supportOnly.productWrites, 0)
  assert.equal(supportOnly.noProductHours, null)
  const unset = ledger.summary('owner', { deliverableRoots: [], supportRoots: [], excludeGlobs: [] }, at + 60_000)
  assert.equal(unset.rootsConfigured, false)
  assert.equal(unset.otherWrites, 1)
  ledger.record({ ownerSessionId: 'owner', sessionId: 'owner', callId: 'x1', tool: 'write', at, arguments: { path: 'src/generated/x.ts' } })
  const excluded = ledger.summary('owner', roots, at + 60_000)
  assert.equal(excluded.recent.some(row => row.path === 'src/generated/x.ts'), false)
})

test('a bash command is not guessed as a file write', () => {
  const ledger = new SupervisionLedger()
  ledger.record({ ownerSessionId: 'owner', sessionId: 'child', callId: 'b1', tool: 'bash', at, arguments: { command: 'echo x > src/a.ts', cwd: 'src' } })
  const summary = ledger.summary('owner', roots, at + 1000)
  assert.equal(summary.productWrites, 0)
  assert.equal(summary.otherWrites, 0)
  assert.equal(summary.events, 1)
  assert.equal(summary.recent[0].path, 'src')
})
