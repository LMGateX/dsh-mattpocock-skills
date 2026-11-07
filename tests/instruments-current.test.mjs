import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registerHooks } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

// Exercise this source seam without rebuilding or mutating the checked-in lib artifacts.
const sourceRoot = new URL('../src/controls/', import.meta.url).href
const compiledRoot = new URL('../lib/controls/', import.meta.url).href
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.startsWith(sourceRoot) && specifier.startsWith('.') && specifier.endsWith('.js')) {
      const url = new URL(specifier.slice(0, -3) + '.ts', context.parentURL)
      if (existsSync(url)) return { url: url.href, shortCircuit: true }
    }
    const resolved = nextResolve(specifier, context)
    if (resolved.url.startsWith(compiledRoot) && resolved.url.endsWith('.js')) {
      const url = sourceRoot + resolved.url.slice(compiledRoot.length, -3) + '.ts'
      if (existsSync(fileURLToPath(url))) return { url, shortCircuit: true }
    }
    return resolved
  },
  load(url, context, nextLoad) {
    if (url.startsWith(sourceRoot) && url.endsWith('.ts')) return { format: 'module', shortCircuit: true,
      source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), { compilerOptions: {
        target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, verbatimModuleSyntax: true,
      } }).outputText }
    return nextLoad(url, context)
  },
})

const { instrumentFixture, definition } = await import('./fixtures/instrument-fixture.mjs')
const { SessionInstruments } = await import('../src/controls/instruments.ts')
const { createDomainInstrumentStorage } = await import('../src/controls/instrument-storage.ts')

const ticket = { title: 'Current ticket', statuses: { delivery: ['partial'], qualities: ['review', 'experiment'] }, summary: 'Keep this optional field' }
const decision = { question: 'Current obligation', status: 'task-defined', pending: true, awaitingImplementation: true,
  addressee: { kind: 'user', principalId: 'user' }, context: 'Retained optional body' }
async function ready(options) {
  const f = await instrumentFixture(options)
  await f.apply('put-workflow', { value: definition })
  return f
}
function assertNoHistory(value) {
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    assert(!['history', 'changes', 'events', 'checkpoint', 'dedup'].includes(key), 'current must not contain ' + key)
    assertNoHistory(child)
  }
}

test('readCurrent returns current merged values, provenance and the complete read summary without retained history', async () => {
  const f = await ready()
  await f.apply('put-ticket', { localTicketId: 'T1', value: ticket, references: ['ticket-source'] })
  await f.apply('put-ticket', { localTicketId: 'T1', value: { title: 'Updated ticket', statuses: {} } })
  await f.apply('put-decision', { decisionId: 'D', value: decision }, 'child', 'child')
  await f.apply('put-decision', { decisionId: 'D', value: { question: 'Updated obligation', status: 'still-pending' }, references: ['decision-source'] })
  const full = await f.read(), current = await f.instruments.readCurrent('A', 'A')
  assert.deepEqual(current.instance, full.instance)
  assert.deepEqual(current.scope, { kind: 'coordinator' })
  assert.equal(current.revision, 5)
  assert.equal(current.businessRevision, 5)
  assert.equal(current.viewerRevision, 0)
  assert.equal(current.focusedWorkflowId, null)
  assert.deepEqual(current.summary, full.summary)
  assert.deepEqual(current.workflows.map(row => row.value), full.workflows.map(row => row.value))
  assert.deepEqual(current.tickets[0].value, { ...ticket, title: 'Updated ticket', statuses: {} })
  assert.deepEqual(current.decisions[0].value, { ...decision, addressee: { ...decision.addressee, label: null }, question: 'Updated obligation', status: 'still-pending' })
  assert.deepEqual(current.decisions[0].creator, { kind: 'agent', principalId: 'child', sessionId: 'child' })
  assert.deepEqual(current.decisions[0].provenance, { author: { kind: 'agent', principalId: 'A', sessionId: 'A' }, recordedAt: 12345, references: ['decision-source'] })
  assert.deepEqual(current.decisions[0].view, { read: false, hidden: false })
  assertNoHistory(current)
  assert(Object.isFrozen(current) && Object.isFrozen(current.tickets[0].value) && Object.isFrozen(current.decisions[0].provenance))
})

test('current reads require every associated ticket and preserve ticketless creator authority across assignment changes', async () => {
  const f = await ready()
  for (const localTicketId of ['T1', 'T2']) await f.apply('put-ticket', { localTicketId, value: ticket })
  await f.apply('put-decision', { decisionId: 'mixed', value: { ...decision, ticketIds: ['T1', 'T2'] } })
  await f.apply('put-decision', { decisionId: 'owner-ticketless', value: decision })
  await f.apply('put-decision', { decisionId: 'child-ticketless', value: decision }, 'child', 'child')
  await f.apply('put-decision', { decisionId: 'moved', value: { ...decision, ticketIds: ['T2'], context: 'old-private-context' } })
  await f.apply('put-decision', { decisionId: 'moved', value: { ...decision, ticketIds: ['T1'], context: 'current-safe-context' } })
  await f.apply('put-workflow', { workflowId: 'other-flow', value: definition })
  await f.apply('put-ticket', { workflowId: 'other-flow', localTicketId: 'T1', value: ticket })
  await f.apply('put-decision', { workflowId: 'other-flow', decisionId: 'moved', value: { ...decision, ticketIds: ['T1'] } })
  let current = await f.instruments.readCurrent('child', 'child')
  assert.deepEqual(current.scope, { kind: 'assigned', workflowId: 'flow', ticketIds: ['T1'] })
  assert.deepEqual(current.workflows.map(row => row.workflowId), ['flow'])
  assert.deepEqual(current.tickets.map(row => row.localTicketId), ['T1'])
  assert.deepEqual(current.decisions.map(row => row.decisionId), ['child-ticketless', 'moved'])
  assert(!JSON.stringify(current).includes('old-private-context'))
  assert.deepEqual(current.decisions.find(row => row.decisionId === 'child-ticketless').registration, { recordedAt: 12345, revision: 6 })
  assert.equal(current.decisions.find(row => row.decisionId === 'moved').registration, null)
  assert.deepEqual(current.summary, (await f.read('child', 'child')).summary)
  f.scopes.set('child', { kind: 'assigned', workflowId: 'flow', ticketIds: ['T1', 'T2'] })
  current = await f.instruments.readCurrent('child', 'child')
  assert.deepEqual(current.decisions.map(row => row.decisionId), ['mixed', 'child-ticketless', 'moved'])
  assert.deepEqual(current.summary, (await f.read('child', 'child')).summary)
  f.scopes.set('child', { kind: 'assigned', workflowId: null, ticketIds: [] })
  current = await f.instruments.readCurrent('child', 'child')
  assert.equal(current.summary.pendingDecisionCount, 0)
  assert.deepEqual(current.workflows, [])
  f.revoked.add('child')
  await assert.rejects(f.instruments.readCurrent('child', 'child'), /permission denied/)
  const otherOwner = await f.instruments.readCurrent('B', 'B')
  assert.equal(otherOwner.summary.totalTickets, 0)
  assert.equal(otherOwner.summary.pendingDecisionCount, 0)
  assert.notEqual(otherOwner.instance.instrumentInstanceId, current.instance.instrumentInstanceId)
})

test('checkpoint, purge and tail events preserve creator, personal views, merged values and hidden/OFF/focus obligations', async () => {
  const f = await ready()
  await f.apply('put-ticket', { localTicketId: 'T1', value: ticket })
  await f.apply('put-decision', { decisionId: 'D', value: { ...decision, context: 'purge-original-context' } }, 'child', 'child')
  await f.apply('put-decision', { decisionId: 'D', value: { question: 'Latest context', status: 'pending', context: 'latest-context' }, references: ['current-evidence'] })
  await f.apply('set-decision-view', { decisionId: 'D', value: { read: true, hidden: true } }, 'user', 'A')
  await f.apply('set-decision-view', { decisionId: 'D', value: { read: true, hidden: false } }, 'child', 'child')
  await f.apply('put-workflow', { workflowId: 'fresh-flow', value: definition })
  const before = await f.instruments.readCurrent('user', 'A')
  assert.equal(before.revision, 7)
  assert.equal(before.businessRevision, 5)
  assert.equal(before.viewerRevision, 1)
  assert.deepEqual(before.decisions[0].view, { read: true, hidden: true })
  assert.equal(before.summary.pendingDecisionCount, 1)
  assert.equal(before.summary.pendingUserDecisionCount, 1)
  assert.equal(before.summary.pendingForPrincipalCount, 1)
  assert.equal(before.summary.awaitingImplementationCount, 1)
  assert.deepEqual(before.summary, (await f.read('user', 'A', { workflowId: 'fresh-flow' })).summary)
  await f.instruments.compact('A', 'A', { operationId: 'current-compact', expectedRevision: before.revision })
  let current = await f.instruments.readCurrent('user', 'A')
  assert.deepEqual(current, { ...before, revision: 8 })
  await f.instruments.purgeHistory('A', 'A', { operationId: 'current-purge', expectedRevision: 8, throughRevision: 3,
    targets: [{ kind: 'decision', workflowId: 'flow', decisionId: 'D' }] })
  current = await f.instruments.readCurrent('user', 'A')
  assert.deepEqual(current, { ...before, revision: 9 })
  const child = await f.instruments.readCurrent('child', 'child')
  assert.equal(child.decisions[0].creator.principalId, 'child')
  assert.deepEqual(child.decisions[0].view, { read: true, hidden: false })
  assert.deepEqual((await f.instruments.readCurrent('user2', 'A')).decisions[0].view, { read: false, hidden: false })
  await f.apply('put-decision', { decisionId: 'D', value: { question: 'After checkpoint tail', status: 'awaiting', pending: false, context: null, result: 'Tail result' } })
  await f.apply('set-decision-view', { decisionId: 'D', value: { read: false, hidden: true } }, 'user', 'A')
  const policy = await f.controls.readPolicy('admin')
  await f.controls.savePolicy('admin', { extensionEnabled: false, defaults: {}, workspaceOverrides: {} }, policy.revision)
  current = await f.instruments.readCurrent('user', 'A')
  assert.equal(current.revision, 11)
  assert.equal(current.businessRevision, 6)
  assert.equal(current.viewerRevision, 2)
  assert.equal(current.decisions[0].revision, 10)
  assert.equal(current.decisions[0].value.context, null)
  assert.equal(current.decisions[0].value.pending, false)
  assert.equal(current.decisions[0].value.awaitingImplementation, true)
  assert.equal(current.decisions[0].value.result, 'Tail result')
  assert.equal(current.decisions[0].creator.principalId, 'child')
  assert.deepEqual(current.summary, (await f.read('user', 'A')).summary)
  assert.equal(current.summary.awaitingImplementationCount, 1)
  assertNoHistory(current)
})

test('decision times distinguish first registration from business updates and ignore views and replay', async () => {
  const f = await ready()
  let now = 100
  const instruments = new SessionInstruments(f.controls, f.storage, f.authority, () => now)
  const create = await f.command('put-decision', { decisionId: 'timed', value: decision })
  await instruments.apply('A', 'A', create)
  now = 200
  await instruments.apply('user', 'A', await f.command('put-decision', { decisionId: 'timed', value: { question: 'Answered', status: 'answered', pending: false } }, 'user', 'A'))
  now = 300
  await instruments.apply('user', 'A', await f.command('set-decision-view', { decisionId: 'timed', value: { read: true, hidden: true } }, 'user', 'A'))
  assert.equal((await instruments.apply('A', 'A', create)).replayed, true)
  for (const snapshot of [await instruments.read('user', 'A'), await instruments.readCurrent('user', 'A')]) {
    const row = snapshot.decisions[0]
    assert.deepEqual(row.registration, { recordedAt: 100, revision: 2 })
    assert.equal(row.updatedAt, 200)
    assert.equal(row.value.pending, false)
    assert.deepEqual(row.view, { read: true, hidden: true })
    assert.equal(snapshot.businessRevision, 3)
    assert.equal(snapshot.viewerRevision, 1)
  }
  assert.equal((await f.storage.read((await f.read()).instance.instrumentInstanceId)).revision, 4)
  const savedPolicy = await f.controls.readPolicy('admin')
  await f.controls.savePolicy('admin', { extensionEnabled: false, defaults: {}, workspaceOverrides: {} }, savedPolicy.revision)
  now = 400
  const close = await f.command('put-decision', { decisionId: 'timed', value: { question: 'Answered', status: 'closed', awaitingImplementation: false } }, 'user', 'A')
  const closed = await instruments.apply('user', 'A', close)
  assert.deepEqual(closed.snapshot.decisions[0].registration, { recordedAt: 100, revision: 2 })
  assert.equal(closed.snapshot.decisions[0].updatedAt, 400)
  assert.deepEqual(closed.snapshot.decisions[0].history.at(-1).author, { kind: 'user', principalId: 'user', sessionId: null })
  assert.equal(closed.snapshot.businessRevision, 4)
  assert.equal(closed.snapshot.viewerRevision, 1)
  now = 500
  await assert.rejects(instruments.apply('user', 'A', { ...close, operationId: 'stale-draft' }), { code: 'revision-conflict' })
  await assert.rejects(instruments.apply('user', 'A', { ...close, expectedRevision: 4, operationId: 'off-new-decision', decisionId: 'new' }), { code: 'feature-disabled' })
  const unchanged = await instruments.readCurrent('user', 'A')
  assert.equal(unchanged.decisions[0].updatedAt, 400)
  assert.equal(unchanged.summary.pendingUserDecisionCount, 0)
  assert.equal(unchanged.summary.awaitingImplementationCount, 0)
  assert.deepEqual((await instruments.readSummary('user', 'A')).summary, { countingScope: 'instance', pendingUserDecisionCount: 0 })
})

test('compaction preserves first registration using durable proof rather than the earliest retained version', async () => {
  const f = await ready()
  await f.apply('put-ticket', { localTicketId: 'T1', value: ticket })
  let now = 111
  const instruments = new SessionInstruments(f.controls, f.storage, f.authority, () => now)
  const put = value => f.command('put-decision', { decisionId: 'timed', value }).then(command => instruments.apply('A', 'A', command))
  await put({ ...decision, ticketIds: ['T1'] })
  now = 222
  await put({ question: 'Updated', status: 'pending' })
  await instruments.compact('A', 'A', { operationId: 'time-compact', expectedRevision: 4 })
  for (const principal of ['A', 'child']) {
    for (const snapshot of [await instruments.read(principal, principal), await instruments.readCurrent(principal, principal)]) {
      assert.deepEqual(snapshot.decisions[0].registration, { recordedAt: 111, revision: 3 })
      assert.equal(snapshot.decisions[0].updatedAt, 222)
    }
  }
  now = 333
  await instruments.apply('A', 'A', await f.command('put-decision', { decisionId: 'tail-new', value: decision }))
  now = 444
  await put({ question: 'Tail business update', status: 'still-open' })
  for (const snapshot of [await instruments.read('A', 'A'), await instruments.readCurrent('A', 'A')]) {
    assert.deepEqual(snapshot.decisions[0].registration, { recordedAt: 111, revision: 3 })
    assert.equal(snapshot.decisions[0].updatedAt, 444)
    assert.deepEqual(snapshot.decisions[1].registration, { recordedAt: 333, revision: 6 })
    assert.equal(snapshot.decisions[1].updatedAt, 333)
  }
})

test('assigned registration remains unknown for an unauthorized first version and after purge, including cold reopen', async () => {
  const f = await ready()
  for (const localTicketId of ['T1', 'T2']) await f.apply('put-ticket', { localTicketId, value: ticket })
  let now = 1000
  const instruments = new SessionInstruments(f.controls, f.storage, f.authority, () => now)
  const put = value => f.command('put-decision', { decisionId: 'moved-time', value }).then(command => instruments.apply('A', 'A', command))
  await put({ ...decision, ticketIds: ['T1', 'T2'], context: 'private-first-body' })
  now = 900 // A clock rollback must not change which source revision was first.
  await put({ question: 'Current authorized body', status: 'pending', ticketIds: ['T1'], context: 'safe-current-body' })
  const check = async (reader, principal, registration) => {
    for (const snapshot of [await reader.read(principal, principal), await reader.readCurrent(principal, principal)]) {
      assert.deepEqual(snapshot.decisions[0].registration, registration)
      assert.equal(snapshot.decisions[0].updatedAt, 900)
      assert.equal(snapshot.decisions[0].revision, 5)
      assert.equal(snapshot.summary.pendingUserDecisionCount, 1)
      if (principal === 'child' && registration === null) {
        assert.equal(snapshot.decisions[0].history?.length ?? 1, 1)
        assert(!JSON.stringify(snapshot).includes('private-first-body'))
      }
    }
  }
  await check(instruments, 'A', { recordedAt: 1000, revision: 4 })
  await check(instruments, 'child', null)
  f.scopes.set('child', { kind: 'assigned', workflowId: 'flow', ticketIds: ['T1', 'T2'] })
  await check(instruments, 'child', { recordedAt: 1000, revision: 4 })
  await instruments.compact('A', 'A', { operationId: 'moved-time-compact', expectedRevision: 5 })
  await check(instruments, 'child', { recordedAt: 1000, revision: 4 })
  f.scopes.set('child', { kind: 'assigned', workflowId: 'flow', ticketIds: ['T1'] })
  await check(instruments, 'child', null)
  await instruments.purgeHistory('A', 'A', { operationId: 'moved-time-purge', expectedRevision: 6, throughRevision: 4,
    targets: [{ kind: 'decision', workflowId: 'flow', decisionId: 'moved-time' }] })
  const full = await instruments.read('A', 'A')
  assert.equal(full.decisions[0].history[0].recordedAt, 900)
  assert.deepEqual(full.decisions[0].registration, { recordedAt: 1000, revision: 4 })
  f.scopes.set('child', { kind: 'assigned', workflowId: 'flow', ticketIds: ['T1', 'T2'] })
  await check(instruments, 'child', null)
  // New storage handle + JSON round trip: no in-memory registration cache is proof.
  const saved = JSON.stringify(await f.storage.read(full.instance.instrumentInstanceId))
  assert(!saved.includes('private-first-body'))
  assert(!saved.includes('registration') && !saved.includes('updatedAt'))
  const reopened = new SessionInstruments(f.controls, createDomainInstrumentStorage({
    get() { return JSON.parse(saved) }, async put() { assert.fail('reads must not write') },
  }), f.authority)
  await check(reopened, 'A', { recordedAt: 1000, revision: 4 })
  await check(reopened, 'child', null)
  f.revoked.add('child')
  await assert.rejects(reopened.readCurrent('child', 'child'), /permission denied/)
})

async function historicalFixture(versions) {
  const values = new Map()
  const storage = createDomainInstrumentStorage({ get(key) { return values.get(key) }, async put(key, value) { values.set(key, value) } })
  const f = await instrumentFixture({ storage })
  const { instance } = await f.controls.readSession('A', 'A')
  const author = { kind: 'agent', principalId: 'A', sessionId: 'A' }
  const events = []
  const add = (action, fields) => events.push({ revision: events.length + 1, recordedAt: 12345, author,
    command: { operationId: 'history-' + (events.length + 1), expectedRevision: events.length, workflowId: 'flow', action, ...fields } })
  add('put-workflow', { value: definition })
  for (let i = 0; i < versions; i++) add('put-decision', { decisionId: 'D', value: { ...decision, result: 'old-private-large-marker-' + 'x'.repeat(65500) } })
  add('put-decision', { decisionId: 'D', value: { ...decision, result: 'Latest compact result' } })
  values.set(instance.instrumentInstanceId, { ...instance, schemaVersion: 1, revision: events.length, events })
  return f
}

test('the same current remains small with a 42 MB legacy projection and 300 unchanged public reads', async t => {
  const small = await historicalFixture(1), large = await historicalFixture(320)
  const smallCurrent = await small.instruments.readCurrent('A', 'A')
  const full = await large.read()
  assert.equal((await large.storage.read(full.instance.instrumentInstanceId)).schemaVersion, 1)
  assert.deepEqual(full.decisions[0].registration, { recordedAt: 12345, revision: 2 })
  assert.equal(full.decisions[0].updatedAt, 12345)
  const legacyBytes = Buffer.byteLength(JSON.stringify(full))
  assert(legacyBytes > 42_000_000 && legacyBytes < 43_000_000, 'fixture must reproduce the original amplification, not only a large source')
  const current = await large.instruments.readCurrent('A', 'A')
  assert.deepEqual(current.decisions.map(row => row.value), smallCurrent.decisions.map(row => row.value))
  assert.deepEqual(current.summary, smallCurrent.summary)
  assert.deepEqual(current.summary, full.summary)
  const currentBytes = Buffer.byteLength(JSON.stringify(current))
  assert(currentBytes < 8192)
  assert(Math.abs(currentBytes - Buffer.byteLength(JSON.stringify(smallCurrent))) < 32)
  assert(!JSON.stringify(current).includes('old-private-large-marker-'))
  assertNoHistory(current)
  let totalBytes = 0
  for (let i = 0; i < 300; i++) {
    const repeated = await large.instruments.readCurrent('A', 'A')
    assert.equal(repeated.decisions[0].value, current.decisions[0].value, 'reuse the immutable current value, not a history-derived deep copy')
    assert.equal(repeated.decisions[0].registration, current.decisions[0].registration, 'reuse first-put proof for the same trusted source instead of rescanning history')
    const size = Buffer.byteLength(JSON.stringify(repeated))
    assert.equal(size, currentBytes)
    totalBytes += size
  }
  assert.equal(totalBytes, 300 * currentBytes)
  assert(totalBytes < 300 * 8192)
  t.diagnostic(JSON.stringify({ legacyBytes, currentBytes, repeatedReads: 300, totalBytes }))
})

test('current bodies preserve long multilingual and escaped text exactly for the bounded model adapter', async () => {
  const f = await ready()
  const body = "汉🙂\n\t\"\\".repeat(6000)
  assert(body.length <= 65536)
  await f.apply('put-decision', { decisionId: 'long', value: { ...decision, context: body, result: body } })
  const current = await f.instruments.readCurrent('A', 'A')
  assert.equal(current.decisions[0].value.context, body)
  assert.equal(current.decisions[0].value.result, body)
  assert(Buffer.byteLength(JSON.stringify(current)) > 65536, 'this internal interface preserves legal current bodies; only the model DTO is budgeted')
  assert.deepEqual(current.summary, (await f.read()).summary)
  assertNoHistory(current)
})

test('hot current index does not bypass source checks, uncertain storage or a fresh handle recovery', async () => {
  const values = new Map()
  let loseReceipt = false, gets = 0
  const table = { get(key) { gets++; return values.get(key) }, async put(key, next) { values.set(key, next) },
    async update(key, transform) {
      const next = transform(values.get(key)); values.set(key, next)
      if (loseReceipt) throw new Error('committed but receipt lost')
      return next
    } }
  const storage = createDomainInstrumentStorage(table)
  const f = await ready({ storage })
  await f.apply('put-decision', { decisionId: 'D', value: decision })
  const first = await f.instruments.readCurrent('A', 'A')
  assert.equal(first.summary.pendingDecisionCount, 1)
  const before = gets
  for (let i = 0; i < 3; i++) assert.equal((await f.instruments.readCurrent('A', 'A')).summary.pendingDecisionCount, 1)
  assert.equal(gets - before, 3)
  loseReceipt = true
  await assert.rejects(f.apply('put-decision', { decisionId: 'D', value: { ...decision, pending: false } }), /receipt lost/)
  await assert.rejects(f.instruments.readCurrent('A', 'A'), { code: 'storage-uncertain' })
  const reopened = new SessionInstruments(f.controls, createDomainInstrumentStorage({ ...table }), f.authority)
  const committed = await reopened.readCurrent('A', 'A')
  assert.equal(committed.revision, 3)
  assert.equal(committed.summary.pendingDecisionCount, 0)
})

test('current reads reject corruption, association mismatch, forged authors and aborted reads rather than returning empty facts', async () => {
  const { MemoryInstrumentStorage } = await import('../src/controls/instrument-storage.ts')
  const backing = new MemoryInstrumentStorage()
  let failure, replacement, onRead
  const storage = { async read(instanceId) {
    onRead?.()
    if (failure) throw failure
    return replacement ?? backing.read(instanceId)
  }, compareAndSwap: (...args) => backing.compareAndSwap(...args) }
  const f = await ready({ storage })
  await f.apply('put-decision', { decisionId: 'D', value: decision })
  const valid = await f.instruments.readCurrent('A', 'A')
  failure = new Error('source unavailable')
  await assert.rejects(f.instruments.readCurrent('A', 'A'), error => error === failure)
  failure = undefined
  const source = await backing.read(valid.instance.instrumentInstanceId)
  replacement = structuredClone(source)
  replacement.events[1].command.expectedRevision = 0
  await assert.rejects(f.instruments.readCurrent('A', 'A'), { code: 'invalid-state' })
  replacement = { ...source, ownerSessionId: 'B' }
  await assert.rejects(f.instruments.readCurrent('A', 'A'), { code: 'association-conflict' })
  replacement = undefined
  const forged = new SessionInstruments(f.controls, storage, { async resolveAccess() {
    return { author: { kind: 'agent', principalId: 'B', sessionId: 'B' }, scope: { kind: 'coordinator' } }
  } })
  await assert.rejects(forged.readCurrent('A', 'A'), { code: 'access-denied' })
  const pre = new AbortController()
  pre.abort(new Error('pre-aborted'))
  let reads = 0
  onRead = () => reads++
  await assert.rejects(f.instruments.readCurrent('A', 'A', pre.signal), /pre-aborted/)
  assert.equal(reads, 0)
  const during = new AbortController()
  onRead = () => during.abort(new Error('aborted during source read'))
  await assert.rejects(f.instruments.readCurrent('A', 'A', during.signal), /aborted during source read/)
  onRead = undefined
  assert.deepEqual(await f.instruments.readCurrent('A', 'A'), valid)
})
