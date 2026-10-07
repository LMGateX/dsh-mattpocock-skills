import test from 'node:test'
import assert from 'node:assert/strict'
import { parseHistoryDocument } from '../lib/controls/history.js'

// History is re-parsed on every capture and the store grows with the workspace, so a row
// that was already validated must not be validated and frozen again.
const instance = Object.freeze({ instrumentInstanceId: 'i1', ownerSessionId: 'owner', controlWorkspaceId: 'w1' })
const row = Object.freeze({ historyId: 'h:1', sequence: 1, capturedAt: 1, kind: 'ticket', recordId: 'T1', recordKey: 'T1',
  version: 1, snapshot: Object.freeze({ title: 'x' }),
  source: Object.freeze({ kind: 'authored', domain: 'records', author: Object.freeze({ id: 'a' }), recordedAt: 1, coverage: 'recorded-history' }),
  flags: Object.freeze({}), sourceDomain: 'records', purged: false })
const document = (revision, rows) => ({ ...instance, schemaVersion: 1, revision, rows, contexts: [], actions: [], suppression: [] })

test('a re-parsed document reuses already validated rows', () => {
  const first = parseHistoryDocument(document(1, [row]))
  const second = parseHistoryDocument(document(2, [row]))
  assert.equal(second.revision, 2)
  assert.equal(second.rows[0], first.rows[0])
  assert.equal(Object.isFrozen(second.rows[0]), true)
})

test('a changed row is validated again rather than trusted', () => {
  const first = parseHistoryDocument(document(1, [row]))
  const changed = parseHistoryDocument(document(2, [{ ...row, version: 2 }]))
  assert.notEqual(changed.rows[0], first.rows[0])
  assert.equal(changed.rows[0].version, 2)
})
