import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registerHooks } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, isAbsolute, join } from 'node:path'
import { createHash } from 'node:crypto'
import ts from 'typescript'

// Production TypeScript only: transpile imports in memory, never read/rebuild lib.
const sourceRoot = new URL('../src/', import.meta.url).href
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.startsWith(sourceRoot) && specifier.startsWith('.') && specifier.endsWith('.js')) {
      const candidate = new URL(specifier.slice(0, -3) + '.ts', context.parentURL)
      if (existsSync(candidate)) return { url: candidate.href, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
  load(url, context, nextLoad) {
    if (url.startsWith(sourceRoot) && url.endsWith('.ts')) {
      const source = ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, verbatimModuleSyntax: true },
        fileName: fileURLToPath(url),
      }).outputText
      return { format: 'module', source, shortCircuit: true }
    }
    return nextLoad(url, context)
  },
})
const { WorkspaceControls, MemoryControlsStorage } = await import('../src/controls/index.ts')
const { SessionWindows, MemoryWindowStorage, createDomainWindowStorage, parseWindowDocument, initialWindowDocument } = await import('../src/controls/windows.ts')
const { ControlsError } = await import('../src/controls/validation.ts')
const childMode = process.argv[2] === '--native-window-cleanup-probe'
const registerTest = childMode ? () => {} : test
const instance = { instrumentInstanceId: 'cleanup-instance', ownerSessionId: 'root', controlWorkspaceId: 'workspace' }
const rejectsCode = (promise, code) => assert.rejects(promise, error => error.code === code)

async function fixture({ storage = new MemoryWindowStorage(), runtimeId = 'cleanup-runtime', beforeResolveAccess } = {}) {
  const controls = new WorkspaceControls(new MemoryControlsStorage(), {
    async authorizePolicy() {},
    async authorizeSession(p, session) { if (p === 'intruder' || !['root', 'child'].includes(session)) throw new ControlsError('access-denied', 'session denied') },
    async resolveSession(session) { return session === 'child' ? { kind: 'managed-child', parentSessionId: 'root' } : { kind: 'owner', controlWorkspaceId: 'workspace' } },
    async verifyWorkspace() { return true },
  }, () => instance.instrumentInstanceId)
  await controls.savePolicy('owner', { extensionEnabled: true, defaults: { workspace: { enabled: true }, windows: { enabled: true, ticketWindowSize: 1, runningSubagentLimit: 1 } }, workspaceOverrides: {} }, 0)
  await controls.ensureSession('owner', 'child')
  const authority = { async resolveAccess(p, session, _instance, access) {
    if (beforeResolveAccess) await beforeResolveAccess(p, session, access)
    if (p === 'reader' && access === 'write') throw new ControlsError('access-denied', 'read only')
    return { author: { kind: 'agent', principalId: p, sessionId: session }, scope: session === 'root' ? { kind: 'coordinator' } : { kind: 'assigned', workflowId: null, ticketIds: [] } }
  } }
  let serial = 0, leaseSerial = 0
  const operationId = () => 'cleanup-op-' + ++serial
  function open(runtime = runtimeId) {
    let port
    const windows = new SessionWindows(controls, storage, authority, { runtimeId: runtime, capability: 'cooperative', bindProgram(value) { port = value }, newLeaseId: () => 'cleanup-lease-' + runtime + '-' + ++leaseSerial })
    return { windows, port }
  }
  return { ...open(), open, storage, operationId }
}

// Test input checksum follows the published schema contract, not an imported helper.
function blankV2() {
  const legacy = initialWindowDocument(instance)
  const materialized = { knowledge: legacy.knowledge, tickets: [], executions: [], reservationOrigins: [] }
  return { ...legacy, schemaVersion: 2, checkpoint: { throughRevision: 0, ...materialized, stateDigest: createHash('sha256').update(JSON.stringify(materialized)).digest('hex') }, dedup: [], retainedOperations: [], historyActions: [] }
}

registerTest('schema 1 remains readable; v2 zero-cut checkpoint accepts current state without fabricated command history', async () => {
  const legacy = initialWindowDocument(instance)
  assert.equal(parseWindowDocument(legacy).schemaVersion, 1)
  const v2 = parseWindowDocument(blankV2())
  assert.equal(v2.schemaVersion, 2); assert.equal(v2.checkpoint.throughRevision, 0)
  assert.deepEqual(v2.operations, []); assert.deepEqual(v2.dedup, [])
  const f = await fixture({ storage: { async read() { return v2 }, async compareAndSwap() { throw new Error('read must not write') } } })
  const snapshot = await f.windows.read('owner', 'root')
  assert.equal(snapshot.T.used, 0); assert.equal(snapshot.S.used, 0)
  assert.equal(snapshot.runtimeKnowledge.known, false)
})

registerTest('explicit source compaction checkpoints current state, keeps full historical bodies and reservation origin fencing', async () => {
  const f = await fixture()
  const ticket = { operationId: 'ticket-first', action: 'reserve', workflowId: 'flow', localTicketId: 'A' }
  await f.windows.apply('owner', 'root', ticket)
  const request = { operationId: 'execution-first', executionId: 'worker', workflowId: 'flow', localTicketId: 'A' }
  const held = await f.port.reserveExecution('owner', 'root', request)
  const oldKnowledge = { operationId: 'knowledge-old', state: 'unknown', reason: 'keep-history-old-reason' }
  await f.port.reconcileKnowledge('owner', 'root', oldKnowledge)
  await f.port.reconcileKnowledge('owner', 'root', { operationId: 'knowledge-latest', state: 'known', reason: null })
  const before = await f.windows.read('owner', 'root')
  const original = parseWindowDocument(await f.storage.read(instance.instrumentInstanceId))
  const command = { operationId: 'compact-first', expectedRevision: before.revision }
  const compact = await f.port.compactHistory('owner', 'root', command)
  assert.equal(compact.replayed, false); assert.equal(compact.appliedRevision, 5)
  assert.equal(compact.compactedThroughRevision, 4)
  const stored = parseWindowDocument(await f.storage.read(instance.instrumentInstanceId))
  assert.equal(stored.schemaVersion, 2); assert.deepEqual(stored.operations, [])
  assert.deepEqual(stored.retainedOperations, original.operations)
  assert.equal(stored.checkpoint.reservationOrigins[0].revision, held.appliedRevision)
  assert.equal(stored.dedup.some(op => Object.hasOwn(op, 'fingerprint')), false)
  const after = await f.windows.read('owner', 'root')
  assert.deepEqual(after, { ...before, revision: compact.appliedRevision })
  assert.equal((await f.port.compactHistory('owner', 'root', command)).replayed, true)
  assert.equal((await f.port.reconcileKnowledge('owner', 'root', oldKnowledge)).replayed, true)
  assert.equal((await f.windows.apply('owner', 'root', ticket)).appliedRevision, 1)
  const replay = await f.port.reserveExecution('owner', 'root', request)
  assert.deepEqual(replay.token, held.token); assert.equal(replay.dispatchable, false)
  const fresh = await f.port.reserveExecution('owner', 'root', { ...request, operationId: 'execution-second', executionId: 'new-worker' })
  assert.equal(fresh.dispatchable, true); assert.equal(fresh.snapshot.S.used, 2)
  assert.equal(fresh.snapshot.S.overage, 1)
})

registerTest('purge removes one selected old source body, retains latest and unselected history, and replay cannot resurrect it', async () => {
  const f = await fixture()
  const old = { operationId: 'source-old-knowledge', state: 'unknown', reason: 'unique-source-only-old-reason-marker' }
  await f.port.reconcileKnowledge('owner', 'root', old)
  await f.port.reconcileKnowledge('owner', 'root', { operationId: 'source-current-knowledge', state: 'unknown', reason: 'latest-required-reason-marker' })
  await f.windows.apply('owner', 'root', { operationId: 'unselected-ticket-reserve', action: 'reserve', workflowId: 'flow', localTicketId: 'A' })
  await f.windows.apply('owner', 'root', { operationId: 'unselected-ticket-release', action: 'release', workflowId: 'flow', localTicketId: 'A', generation: 1 })
  const compact = await f.port.compactHistory('owner', 'root', { operationId: 'compact-before-purge', expectedRevision: 4 })
  const before = await f.windows.read('owner', 'root')
  const request = { operationId: 'purge-one-target', expectedRevision: compact.appliedRevision, throughRevision: 4, targets: [{ kind: 'knowledge' }] }
  const result = await f.port.purgeHistory('owner', 'root', request)
  assert.deepEqual(result.purgedOperationIds, ['source-old-knowledge'])
  const stored = parseWindowDocument(await f.storage.read(instance.instrumentInstanceId))
  assert.equal(JSON.stringify(stored).includes('unique-source-only-old-reason-marker'), false)
  assert.equal(JSON.stringify(stored).includes('latest-required-reason-marker'), true)
  assert.deepEqual(stored.retainedOperations.map(op => op.operationId), ['source-current-knowledge', 'unselected-ticket-reserve', 'unselected-ticket-release'])
  assert.equal(stored.dedup.length, 4)
  assert.deepEqual(await f.windows.read('owner', 'root'), { ...before, revision: result.appliedRevision })
  assert.equal((await f.port.purgeHistory('owner', 'root', request)).replayed, true)
  const replay = await f.port.reconcileKnowledge('owner', 'root', old)
  assert.equal(replay.replayed, true); assert.equal(replay.appliedRevision, 1)
  assert.equal(JSON.stringify(await f.storage.read(instance.instrumentInstanceId)).includes('unique-source-only-old-reason-marker'), false)
  await rejectsCode(f.port.reconcileKnowledge('owner', 'root', { ...old, reason: 'different-reason' }), 'operation-conflict')
  await rejectsCode(f.port.reconcileKnowledge('different-author', 'root', old), 'operation-conflict')
  const fresh = await f.port.reserveExecution('owner', 'root', { operationId: 'fresh-during-unknown-after-purge', executionId: 'new-work', workflowId: null, localTicketId: null })
  assert.equal(fresh.dispatchable, true); assert.equal(fresh.snapshot.runtimeKnowledge.known, false)
  assert.equal(fresh.snapshot.runtimeKnowledge.reason, 'latest-required-reason-marker')
})

registerTest('ticket and execution history GC keeps every generation token, first-reservation revision and late receipt fence', async () => {
  const f = await fixture()
  const ticket = { operationId: 'T-reserve', action: 'reserve', workflowId: 'flow', localTicketId: 'A' }
  await f.windows.apply('owner', 'root', ticket)
  await f.windows.apply('owner', 'root', { ...ticket, operationId: 'T-release', action: 'release', generation: 1 })
  await f.windows.apply('owner', 'root', { ...ticket, operationId: 'T-reacquire', action: 'reacquire', generation: 1 })
  const oldRequest = { operationId: 'S-old-reserve', executionId: 'reusable', workflowId: 'flow', localTicketId: 'A' }
  const old = await f.port.reserveExecution('owner', 'root', oldRequest)
  const oldRelease = { ...old.token, operationId: 'S-old-release', state: 'released' }
  await f.port.receipt(oldRelease)
  const currentRequest = { ...oldRequest, operationId: 'S-current-reserve' }
  const current = await f.port.reserveExecution('owner', 'root', currentRequest)
  await f.port.receipt({ ...current.token, operationId: 'S-current-running', state: 'running' })
  const before = await f.windows.read('owner', 'root')
  const compact = await f.port.compactHistory('owner', 'root', { operationId: 'compact-token-history', expectedRevision: before.revision })
  const purge = await f.port.purgeHistory('owner', 'root', { operationId: 'purge-token-history', expectedRevision: compact.appliedRevision, throughRevision: before.revision,
    targets: [{ kind: 'execution', executionId: 'reusable' }, { kind: 'ticket', workflowId: 'flow', localTicketId: 'A' }] })
  assert.deepEqual(purge.purgedOperationIds, ['T-reserve', 'T-release', 'S-old-reserve', 'S-old-release', 'S-current-reserve'])
  const stored = parseWindowDocument(await f.storage.read(instance.instrumentInstanceId))
  assert.deepEqual(stored.checkpoint.reservationOrigins, [{ leaseId: old.token.leaseId, revision: 4 }, { leaseId: current.token.leaseId, revision: 6 }])
  assert.equal(stored.executions[0].state, 'released'); assert.equal(stored.executions[1].state, 'running')
  assert.equal((await f.windows.apply('owner', 'root', ticket)).replayed, true)
  assert.equal((await f.port.receipt(oldRelease)).replayed, true)
  assert.equal((await f.port.receipt({ ...oldRelease, operationId: 'late-old-release' })).ignored, true)
  const replay = await f.port.reserveExecution('owner', 'root', oldRequest)
  assert.deepEqual(replay.token, old.token); assert.equal(replay.dispatchable, false)
  const currentReplay = await f.port.reserveExecution('owner', 'root', currentRequest)
  assert.deepEqual(currentReplay.token, current.token); assert.equal(currentReplay.dispatchable, false)
  assert.equal((await f.windows.apply('owner', 'root', { ...ticket, operationId: 'late-T-release', action: 'release', generation: 1 })).ignored, true)
  const after = await f.windows.read('owner', 'root')
  assert.equal(after.T.used, 1); assert.equal(after.tickets[0].generation, 2)
  assert.equal(after.S.used, 1); assert.equal(after.executions[1].generation, 2)
  await rejectsCode(f.port.receipt({ ...current.token, leaseId: 'forged-lease', operationId: 'forged-release', state: 'released' }), 'association-conflict')
  await f.port.receipt({ ...current.token, operationId: 'current-real-release', state: 'released' })
  const next = await f.port.reserveExecution('owner', 'root', { ...oldRequest, operationId: 'S-third-reserve' })
  assert.equal(next.token.generation, 3); assert.equal(next.dispatchable, true)
  const compactAgain = await f.port.compactHistory('owner', 'root', { operationId: 'compact-after-GC', expectedRevision: next.snapshot.revision })
  assert.equal(compactAgain.replayed, false)
  assert.equal(parseWindowDocument(await f.storage.read(instance.instrumentInstanceId)).retainedOperations.some(op => op.operationId === 'S-old-reserve'), false)
})

registerTest('cleanup reuses actual owner write authority, closed commands, revision CAS and scoped operation identities', async () => {
  const f = await fixture()
  const request = { operationId: 'cleanup-auth', expectedRevision: 0 }
  await rejectsCode(f.port.compactHistory('intruder', 'root', request), 'access-denied')
  await rejectsCode(f.port.compactHistory('reader', 'root', request), 'access-denied')
  await rejectsCode(f.port.compactHistory('owner', 'child', request), 'access-denied')
  await rejectsCode(f.port.compactHistory('owner', 'root', { ...request, principal: 'owner' }), 'invalid-input')
  await rejectsCode(f.port.compactHistory('owner', 'root', { ...request, expectedRevision: 99 }), 'revision-conflict')
  assert.equal(await f.storage.read(instance.instrumentInstanceId), undefined)
  const result = await f.port.compactHistory('owner', 'root', request)
  assert.equal(result.appliedRevision, 1)
  await rejectsCode(f.port.compactHistory('other-actor', 'root', request), 'operation-conflict')
  await rejectsCode(f.port.compactHistory('owner', 'root', { ...request, expectedRevision: 1 }), 'operation-conflict')
  await rejectsCode(f.port.reconcileKnowledge('owner', 'root', { operationId: request.operationId, state: 'known', reason: null }), 'operation-conflict')
  const purge = { operationId: 'purge-auth', expectedRevision: 1, throughRevision: 0, targets: [{ kind: 'knowledge' }] }
  await rejectsCode(f.port.purgeHistory('owner', 'child', purge), 'access-denied')
  await rejectsCode(f.port.purgeHistory('owner', 'root', { ...purge, throughRevision: 1 }), 'invalid-input')
  await rejectsCode(f.port.purgeHistory('owner', 'root', { ...purge, targets: [] }), 'invalid-input')
  await rejectsCode(f.port.purgeHistory('owner', 'root', { ...purge, targets: [{ kind: 'execution', executionId: 'worker', forgedState: 'released' }] }), 'invalid-input')
  assert.deepEqual(Object.getOwnPropertyNames(SessionWindows.prototype).sort(), ['apply', 'constructor', 'read'])
  assert.equal(Object.isFrozen(f.port), true)
  const applied = await f.port.purgeHistory('owner', 'root', purge)
  assert.deepEqual(applied.purgedOperationIds, [])
  assert.equal((await f.port.purgeHistory('owner', 'root', purge)).replayed, true)
})

registerTest('v2 parser rejects checkpoint state drift, lost origin fencing, altered retained bodies and journal gaps', async () => {
  const f = await fixture()
  await f.windows.apply('owner', 'root', { operationId: 'corrupt-ticket', workflowId: 'flow', localTicketId: 'A', action: 'reserve' })
  await f.port.reserveExecution('owner', 'root', { operationId: 'corrupt-execution', executionId: 'worker', workflowId: 'flow', localTicketId: 'A' })
  await f.port.compactHistory('owner', 'root', { operationId: 'corrupt-compact', expectedRevision: 2 })
  const valid = parseWindowDocument(await f.storage.read(instance.instrumentInstanceId))
  const changes = [
    doc => { doc.checkpoint.tickets[0].held = false },
    doc => { doc.tickets[0].held = false },
    doc => { doc.checkpoint.reservationOrigins = [] },
    doc => { doc.checkpoint.reservationOrigins[0].revision = 1; const { throughRevision, stateDigest, ...state } = doc.checkpoint; doc.checkpoint.stateDigest = createHash('sha256').update(JSON.stringify(state)).digest('hex') },
    doc => { doc.dedup.pop() },
    doc => { doc.dedup[0].target.workflowId = 'foreign-flow' },
    doc => { doc.retainedOperations[0].fingerprint = doc.retainedOperations[0].fingerprint.replace('corrupt-ticket', 'other-operation') },
    doc => { doc.retainedOperations = [] },
    doc => { doc.historyActions[0].compactedThroughRevision = 3 },
    doc => { doc.historyActions[0].purgedOperationIds = ['nonexistent-operation'] },
    doc => { doc.extra = 'unknown' },
  ]
  for (const mutate of changes) {
    const corrupt = structuredClone(valid); mutate(corrupt)
    assert.throws(() => parseWindowDocument(corrupt), error => error.code === 'invalid-state')
  }
  assert.equal(Object.isFrozen(parseWindowDocument(valid).checkpoint), true)
})

registerTest('v2 codec rejects silent loss of an old historical body without an explicit purge receipt', async () => {
  const f = await fixture()
  await f.windows.apply('owner', 'root', { operationId: 'gap-ticket-reserve', workflowId: 'flow', localTicketId: 'A', action: 'reserve' })
  await f.windows.apply('owner', 'root', { operationId: 'gap-ticket-release', workflowId: 'flow', localTicketId: 'A', action: 'release', generation: 1 })
  await f.port.compactHistory('owner', 'root', { operationId: 'gap-compact', expectedRevision: 2 })
  const valid = parseWindowDocument(await f.storage.read(instance.instrumentInstanceId))
  assert.equal(valid.dedup.length, 2); assert.equal(valid.retainedOperations.length, 2)
  assert.equal(valid.historyActions.some(action => action.kind === 'purge'), false)
  const corrupt = structuredClone(valid)
  corrupt.retainedOperations = corrupt.retainedOperations.filter(op => op.operationId !== 'gap-ticket-reserve')
  assert.throws(() => parseWindowDocument(corrupt), error => error.code === 'invalid-state')
  const reader = await fixture({ storage: { async read() { return corrupt }, async compareAndSwap() { throw new Error('read must not write') } } })
  await rejectsCode(reader.windows.read('owner', 'root'), 'invalid-state')
})

registerTest('v2 codec rejects a purge receipt that claims a body beyond its recorded checkpoint cut', async () => {
  const f = await fixture()
  await f.windows.apply('owner', 'root', { operationId: 'cut-reserve', workflowId: 'flow', localTicketId: 'A', action: 'reserve' })
  await f.windows.apply('owner', 'root', { operationId: 'cut-release', workflowId: 'flow', localTicketId: 'A', action: 'release', generation: 1 })
  const compact = await f.port.compactHistory('owner', 'root', { operationId: 'cut-compact', expectedRevision: 2 })
  await f.port.purgeHistory('owner', 'root', { operationId: 'cut-purge', expectedRevision: compact.appliedRevision, throughRevision: 2, targets: [{ kind: 'ticket', workflowId: 'flow', localTicketId: 'A' }] })
  const valid = parseWindowDocument(await f.storage.read(instance.instrumentInstanceId))
  assert.deepEqual(valid.historyActions.at(-1).purgedOperationIds, ['cut-reserve'])
  const corrupt = structuredClone(valid)
  corrupt.historyActions.at(-1).compactedThroughRevision = 0
  assert.throws(() => parseWindowDocument(corrupt), error => error.code === 'invalid-state')
})

registerTest('v2 codec protects a target latest body at the historical purge cut even after later state updates', async () => {
  const f = await fixture()
  await f.windows.apply('owner', 'root', { operationId: 'historical-latest-reserve', workflowId: 'flow', localTicketId: 'A', action: 'reserve' })
  const compact = await f.port.compactHistory('owner', 'root', { operationId: 'historical-first-compact', expectedRevision: 1 })
  const purge = await f.port.purgeHistory('owner', 'root', { operationId: 'historical-noop-purge', expectedRevision: compact.appliedRevision, throughRevision: 1, targets: [{ kind: 'ticket', workflowId: 'flow', localTicketId: 'A' }] })
  assert.deepEqual(purge.purgedOperationIds, [])
  const released = await f.windows.apply('owner', 'root', { operationId: 'historical-newer-release', workflowId: 'flow', localTicketId: 'A', action: 'release', generation: 1 })
  await f.port.compactHistory('owner', 'root', { operationId: 'historical-later-compact', expectedRevision: released.snapshot.revision })
  const valid = parseWindowDocument(await f.storage.read(instance.instrumentInstanceId))
  const corrupt = structuredClone(valid)
  corrupt.historyActions.find(action => action.operationId === 'historical-noop-purge').purgedOperationIds = ['historical-latest-reserve']
  corrupt.retainedOperations = corrupt.retainedOperations.filter(op => op.operationId !== 'historical-latest-reserve')
  assert.throws(() => parseWindowDocument(corrupt), error => error.code === 'invalid-state')
})

registerTest('v2 codec rejects multiple purge receipts claiming the same already removed historical body', async () => {
  const f = await fixture()
  await f.windows.apply('owner', 'root', { operationId: 'repeat-reserve', workflowId: 'flow', localTicketId: 'A', action: 'reserve' })
  await f.windows.apply('owner', 'root', { operationId: 'repeat-release', workflowId: 'flow', localTicketId: 'A', action: 'release', generation: 1 })
  const compact = await f.port.compactHistory('owner', 'root', { operationId: 'repeat-compact', expectedRevision: 2 })
  const first = await f.port.purgeHistory('owner', 'root', { operationId: 'repeat-first-purge', expectedRevision: compact.appliedRevision, throughRevision: 2, targets: [{ kind: 'ticket', workflowId: 'flow', localTicketId: 'A' }] })
  const second = await f.port.purgeHistory('owner', 'root', { operationId: 'repeat-second-purge', expectedRevision: first.appliedRevision, throughRevision: 2, targets: [{ kind: 'ticket', workflowId: 'flow', localTicketId: 'A' }] })
  assert.deepEqual(first.purgedOperationIds, ['repeat-reserve']); assert.deepEqual(second.purgedOperationIds, [])
  const corrupt = structuredClone(parseWindowDocument(await f.storage.read(instance.instrumentInstanceId)))
  corrupt.historyActions.at(-1).purgedOperationIds = ['repeat-reserve']
  assert.throws(() => parseWindowDocument(corrupt), error => error.code === 'invalid-state')
})

registerTest('trusted cancellation during the core second storage read prevents every source purge CAS and preserves current fencing', async () => {
  const base = new MemoryWindowStorage()
  const entered = Promise.withResolvers(), release = Promise.withResolvers()
  let armed = false, reads = 0, sourceCAS = 0
  const storage = { async read(id) {
    const raw = await base.read(id)
    if (armed && ++reads === 2) { entered.resolve(); await release.promise }
    return raw
  }, async compareAndSwap(id, revision, next) { sourceCAS++; return base.compareAndSwap(id, revision, next) } }
  const f = await fixture({ storage })
  await f.port.reconcileKnowledge('owner', 'root', { operationId: 'cancel-old-knowledge', state: 'unknown', reason: 'cancel-source-old-marker' })
  await f.port.reconcileKnowledge('owner', 'root', { operationId: 'cancel-current-knowledge', state: 'unknown', reason: 'cancel-source-current-marker' })
  await f.windows.apply('owner', 'root', { operationId: 'cancel-held-ticket', workflowId: 'flow', localTicketId: 'A', action: 'reserve' })
  const request = { operationId: 'cancel-held-execution', executionId: 'worker', workflowId: 'flow', localTicketId: 'A' }
  const held = await f.port.reserveExecution('owner', 'root', request)
  await f.port.receipt({ ...held.token, operationId: 'cancel-unknown-execution', state: 'unknown' })
  const before = await f.windows.read('owner', 'root')
  const compact = await f.port.compactHistory('owner', 'root', { operationId: 'cancel-initial-compact', expectedRevision: before.revision })
  const original = await base.read(instance.instrumentInstanceId)
  const beforeCAS = sourceCAS
  armed = true
  await f.windows.read('owner', 'root') // First read is a completed preflight projection.
  const controller = new AbortController(), reason = new Error('cancel while source core read is pending')
  const pending = f.port.purgeHistory('owner', 'root', { operationId: 'cancel-pending-purge', expectedRevision: compact.appliedRevision, throughRevision: before.revision, targets: [{ kind: 'knowledge' }] }, controller.signal)
  const rejection = assert.rejects(pending, error => error === reason)
  await entered.promise
  controller.abort(reason)
  release.resolve()
  await rejection
  assert.equal(sourceCAS, beforeCAS)
  assert.deepEqual(await base.read(instance.instrumentInstanceId), original)
  const after = await f.windows.read('owner', 'root')
  assert.deepEqual(after, { ...before, revision: compact.appliedRevision })
  const replay = await f.port.reserveExecution('owner', 'root', request)
  assert.deepEqual(replay.token, held.token); assert.equal(replay.dispatchable, false)
  const fresh = await f.port.reserveExecution('owner', 'root', { ...request, operationId: 'uncancelled-next-reserve', executionId: 'next-work' })
  assert.equal(fresh.dispatchable, true); assert.equal(fresh.snapshot.T.used, 1)
})

registerTest('trusted compact cancellation after owner authority await prevents source reads and CAS', async () => {
  const base = new MemoryWindowStorage()
  const entered = Promise.withResolvers(), release = Promise.withResolvers()
  let armed = false, reads = 0, writes = 0
  const f = await fixture({ storage: { async read(id) { reads++; return base.read(id) }, async compareAndSwap(id, revision, next) { writes++; return base.compareAndSwap(id, revision, next) } },
    async beforeResolveAccess() { if (armed) { entered.resolve(); await release.promise } },
  })
  await f.windows.apply('owner', 'root', { operationId: 'compact-cancel-current-ticket', workflowId: 'flow', localTicketId: 'A', action: 'reserve' })
  const original = await base.read(instance.instrumentInstanceId)
  const beforeReads = reads, beforeWrites = writes
  const controller = new AbortController(), reason = new Error('cancel owner-authority wait')
  armed = true
  const rejection = assert.rejects(f.port.compactHistory('owner', 'root', { operationId: 'cancel-authorized-compact', expectedRevision: 1 }, controller.signal), error => error === reason)
  await entered.promise
  controller.abort(reason); release.resolve()
  await rejection
  assert.equal(reads, beforeReads); assert.equal(writes, beforeWrites)
  assert.deepEqual(await base.read(instance.instrumentInstanceId), original)
  const alreadyAborted = assert.rejects(f.port.compactHistory('owner', 'root', { operationId: 'cancel-before-start', expectedRevision: 1 }, controller.signal), error => error === reason)
  await alreadyAborted
  assert.equal(reads, beforeReads); assert.equal(writes, beforeWrites)
  armed = false
  await rejectsCode(f.port.compactHistory('owner', 'root', { operationId: 'forged-json-signal', expectedRevision: 1, signal: controller.signal }), 'invalid-input')
  const normal = await f.port.compactHistory('owner', 'root', { operationId: 'normal-after-cancel', expectedRevision: 1 })
  assert.equal(normal.replayed, false); assert.equal(normal.appliedRevision, 2)
})

registerTest('acknowledged window purge stays successful when caller aborts after the source CAS commits', async () => {
  const base = new MemoryWindowStorage()
  const committed = Promise.withResolvers(), release = Promise.withResolvers()
  let armed = false, writes = 0
  const f = await fixture({ storage: { read: id => base.read(id), async compareAndSwap(id, revision, next) {
    writes++
    const result = await base.compareAndSwap(id, revision, next)
    if (armed) { committed.resolve(result); await release.promise }
    return result
  } } })
  await f.port.reconcileKnowledge('owner', 'root', { operationId: 'committed-cancel-old', state: 'unknown', reason: 'committed-cancel-old-marker' })
  await f.port.reconcileKnowledge('owner', 'root', { operationId: 'committed-cancel-current', state: 'known', reason: null })
  const compact = await f.port.compactHistory('owner', 'root', { operationId: 'committed-cancel-compact', expectedRevision: 2 })
  const request = { operationId: 'committed-cancel-purge', expectedRevision: compact.appliedRevision, throughRevision: 2, targets: [{ kind: 'knowledge' }] }
  const controller = new AbortController(), reason = new Error('cancel after source CAS started')
  const beforeWrites = writes
  armed = true
  const outcome = f.port.purgeHistory('owner', 'root', request, controller.signal).then(value => ({ value }), error => ({ error }))
  assert.equal(await committed.promise, true)
  controller.abort(reason); release.resolve()
  const acknowledged = await outcome
  assert.equal(acknowledged.error, undefined)
  assert.equal(acknowledged.value.appliedRevision, 4)
  assert.equal(acknowledged.value.replayed, false)
  assert.equal(writes, beforeWrites + 1)
  const stored = parseWindowDocument(await base.read(instance.instrumentInstanceId))
  assert.equal(stored.revision, 4); assert.equal(stored.knowledge.known, true)
  assert.equal(JSON.stringify(stored).includes('committed-cancel-old-marker'), false)
  assert.deepEqual(stored.historyActions.at(-1).purgedOperationIds, ['committed-cancel-old'])
  const retry = await f.port.purgeHistory('owner', 'root', request)
  assert.equal(retry.replayed, true); assert.equal(retry.appliedRevision, 4)
  assert.equal(writes, beforeWrites + 1)
})

registerTest('acknowledged window compact stays successful when cancellation follows its actual CAS', async () => {
  const base = new MemoryWindowStorage(), control = new AbortController()
  let armed = false, writes = 0
  const f = await fixture({ storage: { read: id => base.read(id), async compareAndSwap(id, revision, next) {
    writes++; const committed = await base.compareAndSwap(id, revision, next)
    if (armed && committed) control.abort(new Error('synthetic cancellation after compact commit'))
    return committed
  } } })
  await f.port.reconcileKnowledge('owner', 'root', { operationId: 'compact-ack-current', state: 'known', reason: null })
  const beforeWrites = writes; armed = true
  const outcome = await f.port.compactHistory('owner', 'root', { operationId: 'compact-ack-success', expectedRevision: 1 }, control.signal).then(value => ({ value }), error => ({ error }))
  assert.equal(outcome.error, undefined); assert.equal(outcome.value.appliedRevision, 2)
  assert.equal(outcome.value.replayed, false); assert.equal(writes, beforeWrites + 1)
  assert.equal((await base.read(instance.instrumentInstanceId)).revision, 2)
})

registerTest('source acknowledgement loss during abort preserves the original storage error and uncertainty latch', async () => {
  const rows = new Map(), committed = Promise.withResolvers(), release = Promise.withResolvers()
  const storageError = new Error('lost source acknowledgement during abort')
  let armed = false
  const table = { get(key) { return rows.get(key) }, async put(key, value) { rows.set(key, structuredClone(value)) }, async update(key, fn) {
    const value = fn(rows.get(key)); rows.set(key, structuredClone(value))
    if (armed) { committed.resolve(); await release.promise; throw storageError }
    return value
  } }
  const f = await fixture({ storage: createDomainWindowStorage(table) })
  await f.port.reconcileKnowledge('owner', 'root', { operationId: 'abort-ack-old', state: 'unknown', reason: 'abort-ack-old-marker' })
  await f.port.reconcileKnowledge('owner', 'root', { operationId: 'abort-ack-current', state: 'known', reason: null })
  const compact = await f.port.compactHistory('owner', 'root', { operationId: 'abort-ack-compact', expectedRevision: 2 })
  const controller = new AbortController()
  armed = true
  const rejection = assert.rejects(f.port.purgeHistory('owner', 'root', { operationId: 'abort-ack-purge', expectedRevision: compact.appliedRevision, throughRevision: 2, targets: [{ kind: 'knowledge' }] }, controller.signal), error => error === storageError)
  await committed.promise
  controller.abort(new Error('user cancelled while source commit acknowledgement pending'))
  release.resolve()
  await rejection
  await rejectsCode(f.windows.read('owner', 'root'), 'storage-uncertain')
  const persisted = parseWindowDocument(table.get(instance.instrumentInstanceId))
  assert.equal(persisted.revision, 4); assert.equal(persisted.knowledge.known, true)
  assert.equal(JSON.stringify(persisted).includes('abort-ack-old-marker'), false)
  assert.deepEqual(persisted.historyActions.at(-1).purgedOperationIds, ['abort-ack-old'])
})

registerTest('source purge rejects a raced revision rather than deleting from a stale checkpoint', async () => {
  const base = new MemoryWindowStorage()
  let intercept
  const storage = { read: id => base.read(id), async compareAndSwap(id, expected, next) {
    if (intercept) { const action = intercept; intercept = undefined; await action(); return false }
    return base.compareAndSwap(id, expected, next)
  } }
  const f = await fixture({ storage })
  await f.port.reconcileKnowledge('owner', 'root', { operationId: 'race-old', state: 'unknown', reason: 'race-preserve-old-marker' })
  await f.port.reconcileKnowledge('owner', 'root', { operationId: 'race-current', state: 'known', reason: null })
  const compact = await f.port.compactHistory('owner', 'root', { operationId: 'race-compact', expectedRevision: 2 })
  intercept = () => f.port.reserveExecution('owner', 'root', { operationId: 'racing-native-reserve', executionId: 'race-worker', workflowId: null, localTicketId: null })
  await rejectsCode(f.port.purgeHistory('owner', 'root', { operationId: 'raced-purge', expectedRevision: compact.appliedRevision, throughRevision: 2, targets: [{ kind: 'knowledge' }] }), 'revision-conflict')
  const snapshot = await f.windows.read('owner', 'root')
  assert.equal(snapshot.S.used, 1); assert.equal(snapshot.revision, 4)
  assert.equal(JSON.stringify(await storage.read(instance.instrumentInstanceId)).includes('race-preserve-old-marker'), true)
})

registerTest('lost durable source purge acknowledgement latches the shared handle and fresh recovery does not resurrect plaintext', async () => {
  function table(seed = []) {
    const rows = new Map(seed)
    let loseAcknowledgement = false
    return { rows, failNext() { loseAcknowledgement = true }, get(key) { return rows.get(key) },
      async put(key, value) { rows.set(key, structuredClone(value)); if (loseAcknowledgement) { loseAcknowledgement = false; throw new Error('source purge acknowledgement lost') } },
      async update(key, fn) { const value = fn(rows.get(key)); rows.set(key, structuredClone(value)); if (loseAcknowledgement) { loseAcknowledgement = false; throw new Error('source purge acknowledgement lost') }; return value },
    }
  }
  const original = table()
  const f = await fixture({ storage: createDomainWindowStorage(original) })
  const old = { operationId: 'lost-old', state: 'unknown', reason: 'source-committed-purge-old-marker' }
  await f.port.reconcileKnowledge('owner', 'root', old)
  await f.port.reconcileKnowledge('owner', 'root', { operationId: 'lost-current', state: 'known', reason: null })
  const compact = await f.port.compactHistory('owner', 'root', { operationId: 'lost-compact', expectedRevision: 2 })
  const request = { operationId: 'lost-purge', expectedRevision: compact.appliedRevision, throughRevision: 2, targets: [{ kind: 'knowledge' }] }
  original.failNext()
  await assert.rejects(f.port.purgeHistory('owner', 'root', request), /source purge acknowledgement lost/)
  await rejectsCode(f.windows.read('owner', 'root'), 'storage-uncertain')
  await rejectsCode(f.port.purgeHistory('owner', 'root', request), 'storage-uncertain')
  assert.equal(JSON.stringify(original.get(instance.instrumentInstanceId)).includes('source-committed-purge-old-marker'), false)
  const reopened = await fixture({ storage: createDomainWindowStorage(table(original.rows)), runtimeId: 'fresh-after-lost-ack' })
  const retry = await reopened.port.purgeHistory('owner', 'root', request)
  assert.equal(retry.replayed, true); assert.deepEqual(retry.purgedOperationIds, ['lost-old'])
  assert.equal((await reopened.port.reconcileKnowledge('owner', 'root', old)).replayed, true)
  assert.equal(JSON.stringify(await reopened.storage.read(instance.instrumentInstanceId)).includes('source-committed-purge-old-marker'), false)
})

async function openNativeWindowDomain(storageRoot) {
  const hostRoot = process.env.DSH_CONTROLS_HOST_ROOT
  assert(isAbsolute(hostRoot) && isAbsolute(storageRoot))
  const load = path => import(pathToFileURL(join(hostRoot, 'node_modules', ...path)).href)
  const { DomainFacility, defineDomain, domainTable } = await load(['@deepseek-ai', 'dsh-storage-domain', 'lib', 'index.js'])
  const { JsonStorageBackend } = await load(['@deepseek-ai', 'dsh-storage-json', 'lib', 'index.js'])
  const { z } = await load(['zod', 'index.js'])
  const backend = new JsonStorageBackend(storageRoot)
  const facility = new DomainFacility({ storage: { backend: { get() { return backend } } }, emit() {}, logger: { warn() {}, error() {} } }, { backend: 'json' })
  const close = async () => { try { await facility.closeAll() } finally { await backend.close() } }
  try {
    const domain = await facility.open(defineDomain({ name: 'window_source_cleanup', version: 1, layout: 'single', tables: { windows: domainTable(z.unknown().transform(parseWindowDocument)) } }))
    return { ...await fixture({ storage: createDomainWindowStorage(domain.table('windows')), runtimeId: childMode ? 'native-restarted-runtime' : 'native-original-runtime' }), close }
  } catch (error) { await close(); throw error }
}

registerTest('native JSON source GC removes old plaintext across an independent process while current knowledge and late-token fencing survive',
  { skip: process.env.DSH_CONTROLS_HOST_ROOT ? false : 'set DSH_CONTROLS_HOST_ROOT for native JSON integration' }, async t => {
    const temporary = await mkdtemp(join(tmpdir(), 'dsh-window-source-cleanup-'))
    const root = join(temporary, 'storage')
    let f
    t.after(async () => {
      try { await f?.close() } finally {
        assert(isAbsolute(temporary) && basename(temporary).startsWith('dsh-window-source-cleanup-'))
        await rm(temporary, { recursive: true, force: true })
      }
    })
    f = await openNativeWindowDomain(root)
    await f.port.reconcileKnowledge('owner', 'root', { operationId: 'native-old-knowledge', state: 'unknown', reason: 'native-unique-old-reason-marker' })
    await f.port.reconcileKnowledge('owner', 'root', { operationId: 'native-current-knowledge', state: 'unknown', reason: 'native-current-required-marker' })
    const ticket = { operationId: 'native-ticket-first', workflowId: 'flow', localTicketId: 'A', action: 'reserve' }
    await f.windows.apply('owner', 'root', ticket)
    await f.windows.apply('owner', 'root', { ...ticket, operationId: 'native-ticket-release', action: 'release', generation: 1 })
    await f.windows.apply('owner', 'root', { ...ticket, operationId: 'native-ticket-current', action: 'reacquire', generation: 1 })
    const request = { operationId: 'native-execution-first', executionId: 'native-worker', workflowId: 'flow', localTicketId: 'A' }
    const old = await f.port.reserveExecution('owner', 'root', request)
    await f.port.receipt({ ...old.token, operationId: 'native-released-first', state: 'released' })
    const current = await f.port.reserveExecution('owner', 'root', { ...request, operationId: 'native-execution-current' })
    await f.port.receipt({ ...current.token, operationId: 'native-current-unknown', state: 'unknown' })
    const before = await f.windows.read('owner', 'root')
    const compact = await f.port.compactHistory('owner', 'root', { operationId: 'native-compact', expectedRevision: before.revision })
    await f.port.purgeHistory('owner', 'root', { operationId: 'native-purge', expectedRevision: compact.appliedRevision, throughRevision: before.revision,
      targets: [{ kind: 'knowledge' }, { kind: 'ticket', workflowId: 'flow', localTicketId: 'A' }, { kind: 'execution', executionId: 'native-worker' }] })
    await f.close()
    let raw = await readFile(join(root, 'window_source_cleanup.json'), 'utf8')
    assert.equal(raw.includes('native-unique-old-reason-marker'), false)
    assert.equal(raw.includes('native-current-required-marker'), true)
    const child = execFileSync(process.execPath, [fileURLToPath(import.meta.url), '--native-window-cleanup-probe', root], { encoding: 'utf8' })
    const restored = JSON.parse(child)
    assert.equal(restored.oldKnowledgeReplay.replayed, true); assert.equal(restored.oldKnowledgeReplay.appliedRevision, 1)
    assert.equal(restored.oldReceiptReplay.replayed, true); assert.equal(restored.lateOldReceipt.ignored, true)
    assert.equal(restored.currentReplay.dispatchable, false); assert.deepEqual(restored.currentReplay.token, current.token)
    assert.equal(restored.before.T.used, 1); assert.equal(restored.before.S.used, 1)
    assert.equal(restored.before.executions[0].state, 'released'); assert.equal(restored.before.executions[1].generation, 2)
    assert.equal(restored.afterLate.S.used, 1); assert.equal(restored.afterLate.executions[1].state, 'unknown')
    assert.equal(restored.fresh.dispatchable, true); assert.equal(restored.fresh.snapshot.S.used, 2)
    assert.equal(restored.fresh.snapshot.S.countKnown, false)
    assert.equal(restored.rawSource.includes('native-unique-old-reason-marker'), false)
    raw = await readFile(join(root, 'window_source_cleanup.json'), 'utf8')
    assert.equal(raw.includes('native-unique-old-reason-marker'), false)
    assert.equal(raw.includes('native-current-required-marker'), true)
  })

if (childMode) {
  const f = await openNativeWindowDomain(process.argv[3])
  try {
    const before = await f.windows.read('owner', 'root')
    const oldKnowledgeReplay = await f.port.reconcileKnowledge('owner', 'root', { operationId: 'native-old-knowledge', state: 'unknown', reason: 'native-unique-old-reason-marker' })
    const document = parseWindowDocument(await f.storage.read(instance.instrumentInstanceId))
    const oldToken = document.executions.find(row => row.executionId === 'native-worker' && row.generation === 1)
    const token = { instrumentInstanceId: oldToken.instrumentInstanceId, executionId: oldToken.executionId, generation: oldToken.generation, leaseId: oldToken.leaseId }
    const oldReceiptReplay = await f.port.receipt({ ...token, operationId: 'native-released-first', state: 'released' })
    const lateOldReceipt = await f.port.receipt({ ...token, operationId: 'native-late-old-release', state: 'released' })
    const afterLate = await f.windows.read('owner', 'root')
    const currentReplay = await f.port.reserveExecution('owner', 'root', { operationId: 'native-execution-current', executionId: 'native-worker', workflowId: 'flow', localTicketId: 'A' })
    const fresh = await f.port.reserveExecution('owner', 'root', { operationId: 'native-new-after-restart', executionId: 'new-native-work', workflowId: null, localTicketId: null })
    const rawSource = JSON.stringify(await f.storage.read(instance.instrumentInstanceId))
    console.log(JSON.stringify({ before, afterLate, oldKnowledgeReplay, oldReceiptReplay, lateOldReceipt, currentReplay, fresh, rawSource }))
  } finally { await f.close() }
}
