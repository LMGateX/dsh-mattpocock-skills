import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registerHooks } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { basename, isAbsolute, join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
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
const { createDomainInstrumentStorage } = await import('../src/controls/instrument-storage.ts')
const source = { kind: 'external', instance: 'https://tracker.example', project: 'project-A', taskId: '42' }
const reference = { source, locator: 'https://tracker.example/project-A/42', label: 'Last reported name' }
async function ready() {
  const f = await instrumentFixture()
  await f.apply('put-workflow', { value: { title: 'Collaboration only', axes: [] } })
  return f
}
const reopen = f => new SessionInstruments(f.controls, f.storage, f.authority, () => 23456)
const question = { question: 'User approval needed?', status: 'open', pending: true, addressee: { kind: 'user' } }

async function nativeOpen(storageRoot) {
  const hostRoot = process.env.DSH_CONTROLS_HOST_ROOT
  assert(isAbsolute(hostRoot) && isAbsolute(storageRoot))
  const load = parts => import(pathToFileURL(join(hostRoot, 'node_modules', ...parts)).href)
  const { DomainFacility, defineDomain, domainTable } = await load(['@deepseek-ai', 'dsh-storage-domain', 'lib', 'index.js'])
  const { JsonStorageBackend } = await load(['@deepseek-ai', 'dsh-storage-json', 'lib', 'index.js'])
  const { z } = await load(['zod', 'index.js'])
  const backend = new JsonStorageBackend(storageRoot)
  const facility = new DomainFacility({ storage: { backend: { get() { return backend } } }, emit() {}, logger: { warn() {}, error() {} } }, { backend: 'json' })
  const close = async () => { try { await facility.closeAll() } finally { await backend.close() } }
  try {
    const domain = await facility.open(defineDomain({ name: 'task_reference_probe', version: 1, layout: 'single', tables: { instruments: domainTable(z.unknown().transform(parseInstrumentDocument)) } }))
    return { table: domain.table('instruments'), close }
  } catch (error) { await close(); throw error }
}
function nativeFixture(storage) {
  const instance = { instrumentInstanceId: 'reference-instance', ownerSessionId: 'A', controlWorkspaceId: 'W' }
  const controls = { async readSession() { return { instance, policy: { features: { ticketProgress: { status: 'configured' }, pendingDecisions: { status: 'configured' } } } } } }
  const authority = { async resolveAccess(principal, sessionId) { return { author: { kind: principal === 'user' ? 'user' : 'agent', principalId: principal, sessionId: principal === 'user' ? null : sessionId }, scope: principal === 'child' ? { kind: 'assigned', workflowId: 'flow', ticketIds: ['R1'] } : { kind: 'coordinator' } } } }
  const instruments = new SessionInstruments(controls, storage, authority, () => 67890)
  let serial = 0
  const read = () => instruments.read('A', 'A')
  const command = async (action, fields) => ({ action, operationId: 'native-' + ++serial, workflowId: 'flow', expectedRevision: (await read()).businessRevision, ...fields })
  const apply = async (action, fields) => instruments.apply('A', 'A', await command(action, fields))
  return { instruments, read, command, apply }
}
if (process.env.TASK_REFERENCE_CORE_CHILD === 'read') {
  const handle = await nativeOpen(process.argv[2])
  try {
    const f = nativeFixture(createDomainInstrumentStorage(handle.table))
    const current = await f.instruments.readCurrent('A', 'A')
    const assigned = await f.instruments.readCurrent('child', 'child')
    const retry = await f.instruments.apply('A', 'A', JSON.parse(process.env.TASK_REFERENCE_CORE_RETRY))
    console.log(JSON.stringify({ current, assigned, replayed: retry.replayed, appliedRevision: retry.appliedRevision }))
  } finally { await handle.close() }
  process.exit(0)
}
const nativeOptions = { skip: process.env.DSH_CONTROLS_HOST_ROOT ? false : 'set DSH_CONTROLS_HOST_ROOT for isolated native JSON reference probe' }
test('native JSON persists V3 references and purge evidence through an independent process reopen', nativeOptions, async t => {
  const temporary = await mkdtemp(join(tmpdir(), 'dsh-reference-core-')), root = join(temporary, 'storage')
  let handle = await nativeOpen(root)
  t.after(async () => { try { await handle?.close() } finally { assert(isAbsolute(temporary) && basename(temporary).startsWith('dsh-reference-core-')); await rm(temporary, { recursive: true, force: true }) } })
  const f = nativeFixture(createDomainInstrumentStorage(handle.table))
  await f.apply('put-workflow', { value: { title: 'References only', axes: [] } })
  const first = await f.command('put-task-reference', { localTicketId: 'R1', value: { ...reference, locator: 'unique-purged-reference-navigation' }, references: ['unique-purged-reference-evidence'] })
  await f.instruments.apply('A', 'A', first)
  await f.apply('put-task-reference', { localTicketId: 'R1', value: { ...reference, label: 'Native current reference' } })
  await f.apply('put-decision', { decisionId: 'D', value: { ...question, ticketIds: ['R1'] } })
  await f.instruments.compact('A', 'A', { operationId: 'native-compact', expectedRevision: 4 })
  await f.instruments.purgeHistory('A', 'A', { operationId: 'native-purge', expectedRevision: 5, throughRevision: 2, targets: [{ kind: 'task-reference', workflowId: 'flow', localTicketId: 'R1' }] })
  const before = await f.instruments.readCurrent('A', 'A')
  await handle.close(); handle = null
  const text = await readFile(join(root, 'task_reference_probe.json'), 'utf8')
  assert(!text.includes('unique-purged-reference-navigation'))
  assert(!text.includes('unique-purged-reference-evidence'))
  const output = execFileSync(process.execPath, [fileURLToPath(import.meta.url), root], { encoding: 'utf8', env: { ...process.env, TASK_REFERENCE_CORE_CHILD: 'read', TASK_REFERENCE_CORE_RETRY: JSON.stringify(first) } })
  const proof = JSON.parse(output)
  assert.deepEqual(proof.current, before)
  assert.equal(proof.assigned.taskReferences[0].value.label, 'Native current reference')
  assert.equal(proof.assigned.decisions[0].registration.revision, 4)
  assert.equal(proof.replayed, true)
  assert.equal(proof.appliedRevision, 2)
})

test('a lost native receipt on the first reference write latches uncertainty until fresh V3 reopen', nativeOptions, async t => {
  const temporary = await mkdtemp(join(tmpdir(), 'dsh-reference-core-')), root = join(temporary, 'storage')
  let handle = await nativeOpen(root)
  t.after(async () => { try { await handle?.close() } finally { assert(isAbsolute(temporary) && basename(temporary).startsWith('dsh-reference-core-')); await rm(temporary, { recursive: true, force: true }) } })
  const f = nativeFixture(createDomainInstrumentStorage(handle.table))
  await f.apply('put-workflow', { value: { title: 'Before first reference', axes: [] } })
  const command = await f.command('put-task-reference', { localTicketId: 'R1', value: reference })
  const table = { get: key => handle.table.get(key), put: (key, next) => handle.table.put(key, next), async update(key, fn) { await handle.table.update(key, fn); throw new Error('reference durable receipt lost') } }
  const uncertain = nativeFixture(createDomainInstrumentStorage(table))
  await assert.rejects(uncertain.instruments.apply('A', 'A', command), /reference durable receipt lost/)
  await assert.rejects(uncertain.read(), error => error.code === 'storage-uncertain')
  await handle.close(); handle = await nativeOpen(root)
  const recovered = nativeFixture(createDomainInstrumentStorage(handle.table))
  assert.equal((await recovered.read()).taskReferences.length, 1)
  const retry = await recovered.instruments.apply('A', 'A', command)
  assert.equal(retry.replayed, true)
  assert.equal(retry.appliedRevision, 2)
  assert.equal(retry.snapshot.businessRevision, 2)
})

test('reference association changes authorize each retained decision version and keep viewer and commitment state independent', async () => {
  const f = await ready()
  await f.apply('put-task-reference', { localTicketId: 'R1', value: reference })
  await f.apply('put-task-reference', { localTicketId: 'R2', value: { ...reference, source: { ...source, project: 'project-B' }, label: 'Private second reference' } })
  await f.apply('put-decision', { decisionId: 'moved', value: { ...question, awaitingImplementation: true, ticketIds: ['R2'], context: 'private-initial-decision-context' } })
  await f.apply('put-decision', { decisionId: 'moved', value: { ...question, ticketIds: ['R1'], context: 'authorized-later-context', result: 'Preserved real answer and source' } })
  f.scopes.set('child', { kind: 'assigned', workflowId: 'flow', ticketIds: ['R1'] })
  let child = await f.read('child', 'child')
  assert.deepEqual(child.taskReferences.map(row => row.localTicketId), ['R1'])
  assert.equal(child.decisions[0].history.length, 1)
  assert.equal(child.decisions[0].registration, null)
  assert(!JSON.stringify(child).includes('private-initial-decision-context'))
  assert(!JSON.stringify(child).includes('Private second reference'))
  assert.equal(child.decisions[0].value.awaitingImplementation, true)
  const before = (await f.read()).businessRevision
  await f.apply('set-decision-view', { decisionId: 'moved', value: { read: true, hidden: true } }, 'child', 'child')
  child = await f.instruments.readCurrent('child', 'child')
  assert.equal(child.businessRevision, before)
  assert.equal(child.viewerRevision, 1)
  assert.deepEqual(child.decisions[0].view, { read: true, hidden: true })
  assert.equal(child.summary.pendingUserDecisionCount, 1)
  assert.equal(child.summary.awaitingImplementationCount, 1)
  assert.equal((await f.read()).decisions[0].view.hidden, false)
  await f.instruments.compact('A', 'A', { operationId: 'history-compact', expectedRevision: (await f.read()).revision })
  child = await reopen(f).read('child', 'child')
  assert.equal(child.decisions[0].history.length, 1)
  assert.equal(child.decisions[0].registration, null)
  assert.equal(child.decisions[0].value.result, 'Preserved real answer and source')
  await f.apply('put-decision', { decisionId: 'moved', value: { ...question, ticketIds: ['R1', 'R2'] } })
  child = await reopen(f).read('child', 'child')
  assert.deepEqual(child.decisions, [])
  assert.equal(child.summary.pendingDecisionCount, 0)
  assert.equal((await f.read()).summary.pendingDecisionCount, 1)
})

test('reference CAS keeps a single declared source and exact retries commit only once', async () => {
  const f = await ready()
  const first = await f.command('put-task-reference', { localTicketId: 'R1', value: reference })
  const second = await f.command('put-task-reference', { localTicketId: 'R2', value: reference })
  const outcomes = await Promise.allSettled([f.instruments.apply('A', 'A', first), f.instruments.apply('A', 'A', second)])
  assert.equal(outcomes.filter(row => row.status === 'fulfilled').length, 1)
  assert.equal(outcomes.filter(row => row.status === 'rejected').length, 1)
  const rejected = outcomes.find(row => row.status === 'rejected')
  assert(['revision-conflict', 'invalid-input'].includes(rejected.reason.code))
  const current = await f.read()
  assert.equal(current.summary.totalTaskReferences, 1)
  assert.equal(current.businessRevision, 2)
  const retry = outcomes[0].status === 'fulfilled' ? first : second
  const repeats = await Promise.all([f.instruments.apply('A', 'A', retry), f.instruments.apply('A', 'A', retry)])
  assert(repeats.every(result => result.replayed && result.appliedRevision === 2))
  const target = current.taskReferences[0].localTicketId
  const update = await f.command('put-task-reference', { localTicketId: target, value: { ...reference, label: 'Concurrent exact retry' } })
  const writes = await Promise.all([f.instruments.apply('A', 'A', update), f.instruments.apply('A', 'A', update)])
  assert.equal(writes.filter(result => result.replayed).length, 1)
  assert.equal((await f.read()).businessRevision, 3)
  assert.equal((await f.read()).taskReferences[0].history.length, 2)
  await assert.rejects(f.instruments.apply('A', 'A', { ...update, value: { ...reference, label: 'Different payload same operation' } }), error => error.code === 'operation-conflict')
})

test('legacy V1 and V2 remain untouched on reads and upgrade only for the first real reference write', async () => {
  for (const schemaVersion of [1, 2]) {
    const f = await instrumentFixture(), instance = (await f.read()).instance
    const legacy = { ...instance, schemaVersion, revision: 1, events: [{ revision: 1, recordedAt: 7, author: { kind: 'agent', principalId: 'A', sessionId: 'A' }, command: { operationId: 'legacy-workflow', expectedRevision: 0, workflowId: 'flow', action: 'put-workflow', value: { title: 'Original legacy group', axes: [] }, references: [] } }], ...(schemaVersion === 2 ? { checkpoint: { throughRevision: 0, state: { businessRevision: 0, viewerRevisions: {}, workflows: [], tickets: [], decisions: [], decisionViews: [] } }, dedup: [], coverage: [] } : {}) }
    await f.storage.compareAndSwap(instance.instrumentInstanceId, 0, legacy)
    const before = await f.storage.read(instance.instrumentInstanceId)
    assert.equal((await f.read()).summary.totalTaskReferences, 0)
    assert.deepEqual((await reopen(f).readCurrent('A', 'A')).taskReferences, [])
    assert.equal((await reopen(f).readSummary('A', 'A')).businessRevision, 1)
    assert.deepEqual(await f.storage.read(instance.instrumentInstanceId), before)
    await f.apply('put-task-reference', { localTicketId: 'R1', value: reference })
    const after = await f.storage.read(instance.instrumentInstanceId)
    assert.equal(after.schemaVersion, 3)
    assert.deepEqual(after.events[0], before.events[0])
    assert.equal(after.events[1].revision, 2)
    assert.equal((await f.read()).workflows[0].value.title, 'Original legacy group')
    assert.equal((await f.read()).businessRevision, 2)
  }
})

test('strict reference input rejects business payloads and unsafe repository paths without reading destinations', async () => {
  const f = await ready()
  for (const value of [
    { ...reference, statuses: {} }, { ...reference, summary: 'Mirror' }, { ...reference, disposition: 'done' },
    { ...reference, recordedAt: 12 }, { ...reference, author: 'user' }, { ...reference, locator: '' }, { ...reference, label: '' },
    { ...reference, source: { ...source, project: '' } }, { ...reference, source: { kind: 'unverified', taskId: '42' } },
    ...["/etc/private","../private","nested/../../private","C:/private","C:private","\\server\\private","dir\\..\\private"].map(relativePath => ({ source: { kind: 'repository', repositoryAnchor: 'authored-anchor', relativePath }, locator: 'inert navigation' })),
  ]) await assert.rejects(f.apply('put-task-reference', { localTicketId: 'R1', value }), error => error.code === 'invalid-input')
  const repository = { kind: 'repository', repositoryAnchor: 'authored-anchor', relativePath: 'docs/tasks.md', anchor: 'task-42' }
  await f.apply('put-task-reference', { localTicketId: 'R1', value: { source: repository, locator: 'docs/tasks.md#task-42' } })
  assert.deepEqual((await f.read()).taskReferences[0].value.source, repository)
  assert.equal((await f.read()).taskReferences[0].history[0].author.kind, 'agent')
})

test('V3 is explicit and every compacted reference version retains exact source receipt and inventory proof', async t => {
  const f = await ready()
  await f.apply('put-task-reference', { localTicketId: 'R1', value: reference })
  let raw = await f.storage.read((await f.read()).instance.instrumentInstanceId)
  for (const schemaVersion of [1, 2]) {
    const old = structuredClone(raw)
    old.schemaVersion = schemaVersion
    if (schemaVersion === 1) { delete old.checkpoint; delete old.dedup; delete old.coverage }
    else delete old.checkpoint.state.taskReferences
    assert.throws(() => parseInstrumentDocument(old), error => error.code === 'invalid-state')
  }
  await f.apply('put-task-reference', { localTicketId: 'R1', value: { ...reference, label: 'Latest' } })
  await f.apply('put-task-reference', { localTicketId: 'R2', value: { ...reference, source: { ...source, project: 'project-B' } } })
  await f.apply('put-decision', { decisionId: 'D', value: { ...question, ticketIds: ['R1', 'R2'] } })
  await f.instruments.compact('A', 'A', { operationId: 'proof-compact', expectedRevision: (await f.read()).revision })
  raw = await f.storage.read((await f.read()).instance.instrumentInstanceId)
  for (const [label, mutate] of [
    ['required collection', doc => { delete doc.checkpoint.state.taskReferences }],
    ['unknown business field', doc => { doc.checkpoint.state.taskReferences[0].value.statuses = {} }],
    ['missing reference', doc => { doc.checkpoint.state.taskReferences.shift() }],
    ['unexplained history hole', doc => { doc.checkpoint.state.taskReferences[0].history.shift() }],
    ['source mutation', doc => { doc.checkpoint.state.taskReferences[0].history[0].value.source.project = 'another-project' }],
    ['same tuple across handles', doc => { const row = doc.checkpoint.state.taskReferences[1]; row.value.source = source; row.history[0].value.source = source }],
    ['forged author', doc => { doc.checkpoint.state.taskReferences[0].history[0].author = { kind: 'user', principalId: 'forged', sessionId: null } }],
    ['borrowed source revision', doc => { doc.checkpoint.state.taskReferences[0].history[0].revision = 1 }],
    ['false receipt target kind', doc => { doc.dedup[1].command.target = { kind: 'decision', workflowId: 'flow', decisionId: 'R1' } }],
    ['false receipt action', doc => { doc.dedup[1].command.action = 'put-decision' }],
    ['schema downgrade with receipts', doc => { doc.schemaVersion = 2; delete doc.checkpoint.state.taskReferences }],
  ]) {
    const forged = structuredClone(raw)
    mutate(forged)
    assert.throws(() => parseInstrumentDocument(forged), error => error.code === 'invalid-state', label)
    t.diagnostic(label + ': rejected')
  }
  const view = await reopen(f).readCurrent('A', 'A')
  assert.equal(view.summary.totalTaskReferences, 2)
  assert.equal(view.decisions[0].registration.revision, 5)
})

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
