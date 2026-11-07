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

const { instrumentFixture } = await import('./fixtures/instrument-fixture.mjs')
const { SessionInstruments } = await import('../src/controls/instruments.ts')
const { parseInstrumentDocument } = await import('../src/controls/instrument-state.ts')
const source = { kind: 'external', instance: 'https://tracker.example', project: 'project-A', taskId: '42' }
const reference = { source, locator: 'https://tracker.example/project-A/42', label: 'Last reported name' }
async function ready() {
  const f = await instrumentFixture()
  await f.apply('put-workflow', { value: { title: 'Collaboration only', axes: [] } })
  return f
}
const reopen = f => new SessionInstruments(f.controls, f.storage, f.authority, () => 23456)
const question = { question: 'User approval needed?', status: 'open', pending: true, addressee: { kind: 'user' } }

test('reference and decision histories survive compact, explicit purge and reopen without losing metadata or idempotency', async () => {
  const f = await ready()
  const first = await f.command('put-task-reference', { localTicketId: 'R1', value: { ...reference, locator: 'old-unique-reference-locator' }, references: ['old-reference-pointer'] })
  await f.instruments.apply('A', 'A', first)
  await f.apply('put-task-reference', { localTicketId: 'R1', value: { ...reference, label: 'New label' }, references: ['current-reference-pointer'] })
  await f.apply('put-decision', { decisionId: 'D', value: { ...question, ticketIds: ['R1'] } })
  const compact = await f.instruments.compact('A', 'A', { operationId: 'compact-ref', expectedRevision: (await f.read()).revision })
  assert.equal(compact.snapshot.taskReferences[0].history.length, 2)
  assert.equal(compact.snapshot.decisions[0].registration.revision, 4)
  assert.deepEqual(compact.snapshot.changes, [])
  const raw = await f.storage.read(compact.snapshot.instance.instrumentInstanceId)
  assert.equal(raw.schemaVersion, 3)
  assert.deepEqual(raw.dedup[1].command.target, { kind: 'task-reference', workflowId: 'flow', localTicketId: 'R1' })
  assert.equal(raw.dedup[1].command.action, 'put-task-reference')
  assert.deepEqual(parseInstrumentDocument(structuredClone(raw)), raw)
  let current = await reopen(f).readCurrent('A', 'A')
  assert.equal(current.taskReferences[0].value.label, 'New label')
  assert.equal(current.decisions[0].decisionId, 'D')
  const purge = await f.instruments.purgeHistory('A', 'A', { operationId: 'purge-ref', expectedRevision: compact.appliedRevision, throughRevision: 3, targets: [{ kind: 'task-reference', workflowId: 'flow', localTicketId: 'R1' }] })
  assert.equal(purge.removedVersions, 1)
  assert.equal(purge.snapshot.taskReferences[0].history.length, 1)
  assert(!JSON.stringify(await f.storage.read(purge.snapshot.instance.instrumentInstanceId)).includes('old-unique-reference-locator'))
  const replay = await reopen(f).apply('A', 'A', first)
  assert.equal(replay.replayed, true)
  assert.equal(replay.appliedRevision, 2)
  assert.equal(replay.snapshot.taskReferences[0].history.length, 1)
  assert.equal(replay.snapshot.businessRevision, 4)
  assert.equal(replay.snapshot.historyCoverage.purged, true)
  f.scopes.set('child', { kind: 'assigned', workflowId: 'flow', ticketIds: ['R1'] })
  current = await reopen(f).readCurrent('child', 'child')
  assert.equal(current.taskReferences.length, 1)
  assert.equal(current.decisions[0].registration.revision, 4)
  assert.equal((await reopen(f).readSummary('child', 'child')).summary.pendingUserDecisionCount, 1)
  f.scopes.set('child', { kind: 'assigned', workflowId: 'flow', ticketIds: [] })
  await assert.rejects(reopen(f).apply('child', 'child', first), error => error.code === 'access-denied')
})

test('windows-only collaboration can create empty groups and references while OFF permits retained closeout only', async () => {
  const f = await instrumentFixture()
  let policy = await f.controls.readPolicy('admin')
  await f.controls.savePolicy('admin', { extensionEnabled: true, defaults: { workspace: { enabled: true }, windows: { enabled: true, ticketWindowSize: 2, runningSubagentLimit: 2 }, ticketProgress: { enabled: false }, pendingDecisions: { enabled: false } }, workspaceOverrides: {} }, policy.revision)
  await assert.rejects(f.apply('put-workflow', { workflowId: 'new-business-flow', value: { title: 'No new business lifecycle', axes: [{ axisKey: 'progress', label: 'Progress', counting: 'exclusive', statuses: [] }] } }), error => error.code === 'feature-disabled')
  await f.apply('put-workflow', { value: { title: 'No business progress dictionary', axes: [] } })
  await f.apply('put-task-reference', { localTicketId: 'R1', value: reference })
  await assert.rejects(f.apply('put-ticket', { localTicketId: 'T1', value: { title: 'Do not create a mirror', statuses: {} } }), error => error.code === 'feature-disabled')
  policy = await f.controls.readPolicy('admin')
  await f.controls.savePolicy('admin', { extensionEnabled: false, defaults: {}, workspaceOverrides: {} }, policy.revision)
  await assert.rejects(f.apply('put-task-reference', { localTicketId: 'R2', value: { ...reference, source: { kind: 'unverified' } } }), error => error.code === 'feature-disabled')
  await assert.rejects(f.apply('put-workflow', { workflowId: 'new-flow', value: { title: 'Not enabled', axes: [] } }), error => error.code === 'feature-disabled')
  await f.apply('put-task-reference', { localTicketId: 'R1', value: { ...reference, label: 'Retained explicit update' } })
  const current = await reopen(f).readCurrent('A', 'A')
  assert.equal(current.taskReferences[0].value.label, 'Retained explicit update')
  assert.equal(current.summary.totalTaskReferences, 1)
})

test('reference source identity is immutable and declared source tuples and legacy handles cannot collide or leak', async () => {
  const f = await ready()
  await f.apply('put-task-reference', { localTicketId: 'PRIVATE-HANDLE', value: { ...reference, label: 'Private title' } })
  await assert.rejects(f.apply('put-task-reference', { localTicketId: 'PRIVATE-HANDLE', value: { ...reference, source: { ...source, project: 'other-project' } } }), error => error.code === 'invalid-input')
  f.scopes.set('child', { kind: 'assigned', workflowId: 'flow', ticketIds: ['R2'] })
  await assert.rejects(f.apply('put-task-reference', { localTicketId: 'R2', value: reference }, 'child', 'child'), error => {
    assert.equal(error.code, 'invalid-input')
    assert(!error.message.includes('PRIVATE-HANDLE') && !error.message.includes('Private title'))
    return true
  })
  await f.apply('put-task-reference', { localTicketId: 'R2', value: { ...reference, source: { ...source, project: 'other-project' } } }, 'child', 'child')
  await f.apply('put-task-reference', { localTicketId: 'PRIVATE-HANDLE', value: { source, locator: 'https://tracker.example/moved/42' } })
  assert.equal((await f.read()).taskReferences[0].value.label, 'Private title')
  await assert.rejects(f.apply('put-ticket', { localTicketId: 'R2', value: { title: 'No shadow business record', statuses: {} } }), error => error.code === 'invalid-input')
  await f.apply('put-ticket', { localTicketId: 'T1', value: { title: 'Legacy record', statuses: {} } })
  await assert.rejects(f.apply('put-task-reference', { localTicketId: 'T1', value: { source: { kind: 'unverified' }, locator: 'task note' } }), error => error.code === 'invalid-input')
  for (const localTicketId of ['U1', 'U2']) await f.apply('put-task-reference', { localTicketId, value: { source: { kind: 'unverified' }, locator: 'same unverified pointer' } })
  await assert.rejects(f.apply('put-task-reference', { localTicketId: 'U1', value: reference }), error => error.code === 'invalid-input')
  await f.apply('put-workflow', { workflowId: 'other-flow', value: { title: 'Another collaboration unit', axes: [] } })
  await f.apply('put-task-reference', { workflowId: 'other-flow', localTicketId: 'PRIVATE-HANDLE', value: reference })
  assert.equal((await f.read()).summary.totalTaskReferences, 5)
})

test('mixed legacy/reference decisions require every handle before and after changes and keep ticketless creator authority', async () => {
  const f = await ready()
  await f.apply('put-ticket', { localTicketId: 'T1', value: { title: 'Legacy-only report', statuses: {} } })
  await f.apply('put-task-reference', { localTicketId: 'R1', value: reference })
  f.scopes.set('child', { kind: 'assigned', workflowId: 'flow', ticketIds: ['R1'] })
  await f.apply('put-decision', { decisionId: 'mixed', value: { ...question, ticketIds: ['R1', 'T1'] } })
  await f.apply('put-decision', { decisionId: 'reference-only', value: { ...question, ticketIds: ['R1'] } }, 'child', 'child')
  await f.apply('put-decision', { decisionId: 'own-ticketless', value: question }, 'child', 'child')
  await f.apply('put-decision', { decisionId: 'owner-ticketless', value: question })
  let current = await f.instruments.readCurrent('child', 'child')
  assert.deepEqual(current.taskReferences.map(row => row.localTicketId), ['R1'])
  assert.equal(current.tickets.length, 0)
  assert.equal(current.summary.totalTaskReferences, 1)
  assert.deepEqual(current.decisions.map(row => row.decisionId), ['reference-only', 'own-ticketless'])
  assert.equal((await f.instruments.readSummary('child', 'child')).summary.pendingUserDecisionCount, 2)
  await assert.rejects(f.apply('put-decision', { decisionId: 'mixed', value: { ...question, ticketIds: ['R1'] } }, 'child', 'child'), error => error.code === 'access-denied')
  await assert.rejects(f.apply('put-decision', { decisionId: 'reference-only', value: { ...question, ticketIds: ['T1'] } }, 'child', 'child'), error => error.code === 'access-denied')
  await f.apply('put-task-reference', { localTicketId: 'R1', value: { ...reference, label: 'Child report' } }, 'child', 'child')
  f.scopes.set('child', { kind: 'assigned', workflowId: 'flow', ticketIds: [] })
  current = await reopen(f).readCurrent('child', 'child')
  assert.deepEqual(current.taskReferences, [])
  assert.deepEqual(current.decisions.map(row => row.decisionId), ['own-ticketless'])
  const full = await f.read('child', 'child')
  assert(!JSON.stringify(full).includes('Child report'))
  assert(!full.changes.some(event => event.command.action === 'put-task-reference'))
  await assert.rejects(f.apply('put-decision', { decisionId: 'unknown', value: { ...question, ticketIds: ['missing'] } }), error => error.code === 'invalid-input')
})

test('reference-only collaboration registers a V3 handle and exposes authored current facts without business tickets', async () => {
  const f = await ready(), before = await f.storage.read((await f.read()).instance.instrumentInstanceId)
  assert.equal(before.schemaVersion, 2)
  const submitted = await f.command('put-task-reference', { localTicketId: 'R1', value: reference, references: ['native-user-message:42'] })
  const result = await f.instruments.apply('A', 'A', submitted)
  assert.equal(result.appliedRevision, 2)
  assert.equal((await f.storage.read(result.snapshot.instance.instrumentInstanceId)).schemaVersion, 3)
  const full = await f.read(), current = await reopen(f).readCurrent('A', 'A')
  assert.deepEqual(full.capabilities, { taskReferences: true, storageVersions: [1, 2, 3] })
  assert.deepEqual(current.capabilities, full.capabilities)
  assert.deepEqual(full.tickets, [])
  assert.equal(full.summary.totalTickets, 0)
  assert.equal(full.summary.totalTaskReferences, 1)
  assert.deepEqual(full.summary.statusCounts, [])
  assert.deepEqual(current.summary, full.summary)
  assert.equal(current.taskReferences[0].localTicketId, 'R1')
  assert.deepEqual(current.taskReferences[0].value, reference)
  assert.deepEqual(current.taskReferences[0].provenance, { author: { kind: 'agent', principalId: 'A', sessionId: 'A' }, recordedAt: 12345, references: ['native-user-message:42'] })
  assert(!('history' in current.taskReferences[0]))
  assert.equal(current.decisions.length, 0)
  assert.equal(full.taskReferences[0].history.length, 1)
  assert(Object.isFrozen(current.taskReferences[0].value.source))
  const retry = await f.instruments.apply('A', 'A', submitted)
  assert.equal(retry.replayed, true)
  assert.equal(retry.appliedRevision, 2)
})
