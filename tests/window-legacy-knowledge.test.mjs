import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseWindowDocument } from '../lib/controls/windows.js'

// A document written before the optional baseline field existed: two runtime replacements leave
// the journal reconstructing a baseline the stored state never carried.
const RUNTIME_A = '662a5729-44ed-439d-a26c-1ed7ba830e29'
const RUNTIME_B = '11111111-2222-4333-8444-555555555555'
const RUNTIME_C = '640a799c-e211-43ef-80bc-58127839f79c'
const opId = revision => '00000000-0000-4000-8000-00000000000' + revision
function legacyDocument(extra = {}) {
  const instance = { instrumentInstanceId: 'inst', ownerSessionId: 'session-owner', controlWorkspaceId: 'ws' }
  const operation = (revision, runtimeId, reason) => ({
    operationId: opId(revision), kind: 'knowledge', caller: '["user:operator","session-owner"]',
    fingerprint: JSON.stringify({ operationId: opId(revision), state: reason === null ? 'known' : 'unknown', reason }),
    runtimeId, revision, generation: 0, leaseId: null, ignored: false,
  })
  return {
    schemaVersion: 1, ...instance, revision: 3,
    knowledge: { runtimeId: RUNTIME_C, known: false, reason: 'unmanaged-native-execution-observed', ...extra },
    tickets: [], executions: [],
    operations: [
      operation(1, RUNTIME_A, null),
      operation(2, RUNTIME_B, 'native-subagent-silent-stop'),
      operation(3, RUNTIME_C, 'unmanaged-native-execution-observed'),
    ],
  }
}

test('a document written before the optional baseline field parses unchanged', () => {
  const parsed = parseWindowDocument(legacyDocument())
  assert.equal(parsed.knowledge.runtimeId, RUNTIME_C)
  assert.equal('previousRuntimeId' in parsed.knowledge, false, 'the legacy shape is preserved, not invented')
})

test('a document that records the baseline field is still compared in full', () => {
  const accepted = parseWindowDocument(legacyDocument({ previousRuntimeId: RUNTIME_B }))
  assert.equal(accepted.knowledge.previousRuntimeId, RUNTIME_B)
  assert.throws(() => parseWindowDocument(legacyDocument({ previousRuntimeId: RUNTIME_A })),
    /window state differs from typed operation history/,
    'a recorded baseline that contradicts the journal stays invalid')
})
