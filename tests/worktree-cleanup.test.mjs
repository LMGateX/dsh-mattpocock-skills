import assert from 'node:assert/strict'
import { test as nodeTest } from 'node:test'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, isAbsolute, join } from 'node:path'
import { registerHooks } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'

const childRoot = process.env.DSH_WORKTREE_CLEANUP_CHILD_ROOT
const test = childRoot ? () => {} : nodeTest
const sourceRoot = new URL('../src/controls/', import.meta.url).href
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.startsWith(sourceRoot) && specifier.endsWith('.js') && specifier.startsWith('.')) {
      const candidate = new URL(specifier.slice(0, -3) + '.ts', context.parentURL)
      if (existsSync(candidate)) return { url: candidate.href, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
  load(url, context, nextLoad) {
    if (url.startsWith(sourceRoot) && url.endsWith('.ts')) {
      const source = ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, verbatimModuleSyntax: true }, fileName: fileURLToPath(url),
      }).outputText
      return { format: 'module', source, shortCircuit: true }
    }
    return nextLoad(url, context)
  },
})
const { createWorktreeBindings, parseWorktreeBindingsDocument } = await import('../src/controls/worktree-bindings.ts')
const { MemoryVersionedStorage, createDomainVersionedStorage } = await import('../src/controls/versioned-storage.ts')
const owner = { instrumentInstanceId: 'instance-A', ownerSessionId: 'owner-A', controlWorkspaceId: 'workspace' }
const author = { kind: 'agent', principalId: 'agent:owner-A', sessionId: 'owner-A' }
const intent = { operationId: 'create-A', parentSessionId: 'owner-A', plannedChildSessionId: 'child-A', requestedCwd: '/trees/A', task: 'current-task-stays' }
const header = { sessionId: 'child-A', parentSessionId: 'owner-A', cwd: '/trees/A' }
const oldNote = 'UNIQUE-OLD-BINDING-NOTE-735a61'
function fixture() {
  const storage = new MemoryVersionedStorage(parseWorktreeBindingsDocument)
  return { storage, open: () => createWorktreeBindings(() => storage) }
}
async function history(bindings, spec = intent, note = oldNote) {
  await bindings.registerIntent(owner, author, spec)
  let row = await bindings.confirm(owner, spec.operationId, { ...header, sessionId: spec.plannedChildSessionId, cwd: spec.requestedCwd }, author)
  const oldCommand = { operationId: spec.operationId + '-old', bindingId: row.bindingId, expectedRevision: row.revision, state: 'discarded', notes: note }
  row = await bindings.updateBusiness(owner, author, oldCommand)
  row = await bindings.updateBusiness(owner, author, { operationId: spec.operationId + '-new', bindingId: row.bindingId, expectedRevision: row.revision, state: 'discarded', notes: 'current-note-stays' })
  return { row, oldCommand }
}

test('compact losslessly materializes all versions while operation receipts use digests rather than duplicate bodies', async () => {
  const f = fixture(), bindings = f.open(), { row, oldCommand } = await history(bindings)
  const before = await bindings.query(owner)
  const result = await bindings.compact(owner, author, { operationId: 'compact-A', expectedRevision: before.revision })
  assert.equal(result.removedVersions, 0)
  assert.equal(result.checkpointRev, 5)
  assert.equal(result.sourceCoverage.kind, 'history-only')
  assert.equal(result.sourceCoverage.removedVersions, 0)
  const after = await f.open().query(owner)
  assert.deepEqual(after.rows[0].value, row.value)
  assert.deepEqual(after.rows[0].history, before.rows[0].history)
  assert.equal(after.rows[0].history.length, 4)
  assert.equal(after.current.length, 1) // discarded, not cleaned
  const raw = JSON.stringify(await f.storage.read())
  assert.equal(raw.includes(oldNote), true)
  assert.equal(raw.includes('current-note-stays'), true)
  assert.equal(raw.includes('current-task-stays'), true)
  const saved = await f.storage.read()
  assert.equal(saved.schemaVersion, 2)
  assert.equal(JSON.stringify(saved.operations).includes(oldNote), false)
  assert(saved.operations.every(operation => /^[a-f0-9]{64}$/.test(operation.digest)))
  assert.equal((await f.open().registerIntent(owner, author, intent)).dispatch, false)
  assert.equal((await f.open().updateBusiness(owner, author, oldCommand)).revision, 4)
  assert.equal(JSON.stringify(await f.storage.read()).includes(oldNote), true)
  await assert.rejects(f.open().registerIntent(owner, author, { ...intent, task: 'changed original body' }), error => error.code === 'operation-conflict')
  await assert.rejects(f.open().updateBusiness(owner, author, { ...oldCommand, notes: 'changed deleted body' }), error => error.code === 'operation-conflict')
})

test('explicit selected purge removes old source notes and diagnostics, preserving latest value, unselected versions and creator receipts', async () => {
  const f = fixture(), bindings = f.open(), { row, oldCommand } = await history(bindings)
  await bindings.recordOutcome(owner, intent.operationId, { acceptance: 'accepted', outcome: 'failed', diagnostic: 'UNIQUE-OLD-DIAGNOSTIC-8726a' }, author)
  await bindings.confirm(owner, intent.operationId, header, author)
  const other = await history(bindings, { ...intent, operationId: 'create-B', plannedChildSessionId: 'child-B', requestedCwd: '/trees/B' }, 'UNSELECTED-OLD-NOTE-STAYS')
  const before = await bindings.query(owner), command = { operationId: 'purge-A', expectedRevision: before.revision, throughRevision: 5, bindingIds: [row.bindingId] }
  const result = await bindings.purgeHistory(owner, author, command)
  assert.equal(result.removedVersions, 5)
  assert.equal(result.checkpointRev, 11)
  assert.equal(result.sourceCoverage.throughRevision, 5)
  assert.deepEqual(result.sourceCoverage.removed.map(version => version.revision), [1, 2, 3, 4, 5])
  const after = await f.open().query(owner)
  assert.deepEqual(after.rows.find(item => item.bindingId === row.bindingId).value, before.rows.find(item => item.bindingId === row.bindingId).value)
  assert.equal(after.rows.find(item => item.bindingId === row.bindingId).history.length, 1)
  assert.deepEqual(after.rows.find(item => item.bindingId === other.row.bindingId).history, other.row.history)
  const raw = JSON.stringify(await f.storage.read())
  assert.equal(raw.includes(oldNote), false)
  assert.equal(raw.includes('UNIQUE-OLD-DIAGNOSTIC-8726a'), false)
  assert.equal(raw.includes('UNSELECTED-OLD-NOTE-STAYS'), true)
  assert.equal(raw.includes('current-note-stays'), true)
  assert.equal(raw.includes('current-task-stays'), true)
  assert.equal((await f.open().registerIntent(owner, author, intent)).dispatch, false)
  await f.open().updateBusiness(owner, author, oldCommand)
  assert.equal(JSON.stringify(await f.storage.read()).includes(oldNote), false)
  await assert.rejects(f.open().registerIntent(owner, author, { ...intent, task: 'changed original body' }), error => error.code === 'operation-conflict')
  await assert.rejects(f.open().updateBusiness(owner, author, { ...oldCommand, notes: 'changed deleted body' }), error => error.code === 'operation-conflict')
  assert.equal((await f.open().purgeHistory(owner, author, command)).replayed, true)
})

test('source holes require an explicit cleanup receipt; a lossless checkpoint cannot silently drop a body', async () => {
  const f = fixture(), bindings = f.open()
  await history(bindings)
  await bindings.compact(owner, author, { operationId: 'compact-A', expectedRevision: 4 })
  const corrupt = structuredClone(await f.storage.read())
  corrupt.rows[0].history = corrupt.rows[0].history.filter(version => version.revision !== 3)
  corrupt.manifest.find(version => version.revision === 3).retained = false
  corrupt.purgedThroughRevision = 3
  const reopened = createWorktreeBindings(() => ({ async read() { return corrupt }, async compareAndSwap() { assert.fail('query must not mutate source') } }))
  await assert.rejects(reopened.query(owner), error => error.code === 'invalid-input')
})

test('program versions cannot rewrite authored notes across a deleted predecessor body', async () => {
  const f = fixture(), bindings = f.open(), { row } = await history(bindings)
  await bindings.recordOutcome(owner, intent.operationId, { acceptance: 'accepted', outcome: 'failed', diagnostic: 'old program diagnostic' }, author)
  await bindings.confirm(owner, intent.operationId, header, author)
  await bindings.purgeHistory(owner, author, { operationId: 'purge-before-program', expectedRevision: 6, throughRevision: 5, bindingIds: [row.bindingId] })
  const corrupt = structuredClone(await f.storage.read()), target = corrupt.rows[0]
  target.value.business.notes = 'program illegally rewrote agent note'
  target.history[0].value = structuredClone(target.value)
  const meta = corrupt.manifest.find(version => version.revision === target.revision)
  meta.valueDigest = createHash('sha256').update(JSON.stringify(target.value)).digest('hex')
  if (Object.hasOwn(meta, 'notesDigest')) meta.notesDigest = createHash('sha256').update(JSON.stringify(target.value.business.notes)).digest('hex')
  const reopened = createWorktreeBindings(() => ({ async read() { return corrupt }, async compareAndSwap() { assert.fail('query must not write') } }))
  await assert.rejects(reopened.query(owner), error => error.code === 'invalid-input')
})

test('source cleanup requires root owner or direct user, obeys document CAS, and never revives cleaned bindings', async () => {
  const f = fixture(), bindings = f.open(), { row } = await history(bindings)
  const child = { kind: 'agent', principalId: 'agent:child-A', sessionId: 'child-A' }
  const purge = { operationId: 'purge-A', expectedRevision: 4, throughRevision: 3, bindingIds: [row.bindingId] }
  await assert.rejects(bindings.purgeHistory(owner, child, purge), error => error.code === 'access-denied')
  await assert.rejects(bindings.compact(owner, child, { operationId: 'compact-A', expectedRevision: 4 }), error => error.code === 'access-denied')
  await bindings.updateBusiness(owner, author, { operationId: 'clean-A', bindingId: row.bindingId, expectedRevision: row.revision, state: 'cleaned', notes: 'current cleaned note' })
  await assert.rejects(bindings.purgeHistory(owner, author, purge), error => error.code === 'revision-conflict')
  const user = { kind: 'user', principalId: 'user:actual-owner', sessionId: null }
  await bindings.purgeHistory(owner, user, { ...purge, expectedRevision: 5, throughRevision: 5 })
  const after = await f.open().query(owner)
  assert.equal(after.current.length, 0)
  assert.equal(after.rows[0].value.business.state, 'cleaned')
  assert.equal(after.rows[0].value.actualCwd, '/trees/A')
  assert.equal((await f.open().registerIntent(owner, author, intent)).dispatch, false)
  await f.open().confirm(owner, intent.operationId, header, author)
  await f.open().reconcile(owner, intent.operationId, null, author)
  assert.equal((await f.open().query(owner)).current.length, 0)
  await assert.rejects(f.open().updateBusiness(owner, author, { operationId: 'late-reopen', bindingId: row.bindingId, expectedRevision: 5, state: 'active' }), error => error.code === 'invalid-state')
  await assert.rejects(f.open().purgeHistory(owner, user, { ...purge, expectedRevision: 6, operationId: 'foreign', bindingIds: ['foreign-binding'] }), error => error.code === 'association-conflict')
})

test('legacy V1 read is lossless and the first ordinary write upgrades to V2 with checkpoint zero', async () => {
  const f = fixture(), bindings = f.open()
  await history(bindings)
  const created = await f.storage.read()
  let raw = { schemaVersion: 1, revision: created.revision, owner: created.owner, rows: created.rows.map(row => ({ bindingId: row.bindingId, revision: row.revision, value: row.value, history: row.history })) }
  const seam = createWorktreeBindings(() => ({ async read() { return raw }, async compareAndSwap(expectedRevision, next) { if (raw.revision !== expectedRevision) return false; raw = structuredClone(next); return true } }))
  const before = await seam.query(owner)
  assert.equal(raw.schemaVersion, 1) // pure reads do not migrate disk
  assert.deepEqual(before.rows[0].history, created.rows[0].history)
  await seam.updateBusiness(owner, author, { operationId: 'ordinary-new', bindingId: before.rows[0].bindingId, expectedRevision: 4, state: 'discarded', notes: 'new current' })
  assert.equal(raw.schemaVersion, 2)
  assert.equal(raw.checkpointRev, 0)
  assert.equal(raw.rows[0].history.length, 5)
  assert.equal(JSON.stringify(raw).includes(oldNote), true)
  assert.equal((await seam.query(owner)).sourceCoverage.removedVersions, 0)
})

test('abort during the invoked source core second read prevents every source CAS and leaves all binding facts intact', async () => {
  for (const method of ['compact', 'purgeHistory']) {
    const f = fixture(), { row } = await history(f.open())
    const before = await f.storage.read()
    let reads = 0, sourceCAS = 0
    const entered = Promise.withResolvers(), release = Promise.withResolvers()
    const storage = {
      async read() {
        reads += 1
        if (reads === 2) { entered.resolve(); await release.promise }
        return f.storage.read()
      },
      async compareAndSwap(expected, next) { sourceCAS += 1; return f.storage.compareAndSwap(expected, next) },
    }
    const bindings = createWorktreeBindings(() => storage)
    await bindings.query(owner) // derived phase read has completed; source core is invoked next
    const controller = new AbortController(), reason = new Error('cancel while source read is held')
    const command = { operationId: 'cancel-' + method, expectedRevision: 4, ...(method === 'compact' ? {} : { throughRevision: 3, bindingIds: [row.bindingId] }) }
    const pending = bindings[method](owner, author, command, controller.signal)
    const rejected = assert.rejects(pending, error => error === reason)
    await entered.promise
    assert.equal(sourceCAS, 0)
    controller.abort(reason)
    release.resolve()
    await rejected
    assert.equal(sourceCAS, 0)
    assert.deepEqual(await f.storage.read(), before) // current, creator, all digests/fences/history unchanged
    assert.deepEqual((await bindings.query(owner)).rows[0].value, row.value)
    assert.equal((await bindings.registerIntent(owner, author, intent)).dispatch, false)
  }
})

test('worktree cleanup preserves acknowledged success after commit while entry and final-CAS abort still prevent writes', async () => {
  for (const method of ['compact', 'purgeHistory']) for (const phase of ['entry', 'before-cas', 'after-cas']) {
    const f = fixture(), { row } = await history(f.open()), before = await f.storage.read()
    const controller = new AbortController(), reason = new Error('cancel at ' + phase)
    let resolutions = 0, reads = 0, sourceCAS = 0
    const storage = {
      async read() { reads += 1; return f.storage.read() },
      async compareAndSwap(expected, next) {
        sourceCAS += 1
        const committed = await f.storage.compareAndSwap(expected, next)
        if (phase === 'after-cas') controller.abort(reason)
        return committed
      },
    }
    const bindings = createWorktreeBindings(() => {
      resolutions += 1
      if (phase === 'before-cas' && resolutions === 2) controller.abort(reason)
      return storage
    })
    if (phase === 'entry') controller.abort(reason)
    const command = { operationId: 'abort-' + method + '-' + phase, expectedRevision: 4, ...(method === 'compact' ? {} : { throughRevision: 3, bindingIds: [row.bindingId] }) }
    const outcome = await bindings[method](owner, author, command, controller.signal).then(value => ({ value }), error => ({ error }))
    if (phase === 'after-cas') {
      assert.equal(outcome.error, undefined); assert.equal(outcome.value.revision, 5)
      assert.equal(outcome.value.replayed, false)
    } else assert.equal(outcome.error, reason)
    assert.equal(sourceCAS, phase === 'after-cas' ? 1 : 0)
    if (phase === 'entry') assert.equal(reads, 0)
    const source = await f.storage.read()
    if (phase === 'after-cas') {
      assert.equal(source.revision, 5)
      assert.equal(JSON.stringify(source).includes(oldNote), method === 'compact') // acknowledged source commit is never rolled back
      assert.deepEqual(source.rows[0].value, row.value)
      assert.equal((await f.open().query(owner)).sourceCoverage.removedVersions, method === 'compact' ? 0 : 3)
    } else assert.deepEqual(source, before)
    assert.equal((await f.open().registerIntent(owner, author, intent)).dispatch, false)
  }
})

async function openNativeDomain(storageRoot) {
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
    const domain = await facility.open(defineDomain({ name: 'worktree_source_gc', version: 1, layout: 'single', tables: { bindings: domainTable(z.unknown().transform(parseWorktreeBindingsDocument)) } }))
    const table = domain.table('bindings')
    const open = handle => createWorktreeBindings(key => createDomainVersionedStorage(handle, key, parseWorktreeBindingsDocument))
    return { table, bindings: open(table), open, close, file: join(storageRoot, 'worktree_source_gc.json') }
  } catch (error) { await close(); throw error }
}

test('native JSON lost purge receipt, fresh handle and independent process cannot restore deleted source bodies or redispatch',
  { skip: process.env.DSH_CONTROLS_HOST_ROOT ? false : 'set DSH_CONTROLS_HOST_ROOT for real native JSON integration' }, async t => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-worktree-source-gc-'))
    let state = await openNativeDomain(root)
    t.after(async () => {
      try { await state?.close() } finally { assert(isAbsolute(root) && basename(root).startsWith('dsh-worktree-source-gc-')); await rm(root, { recursive: true, force: true }) }
    })
    const { row, oldCommand } = await history(state.bindings)
    await history(state.bindings, { ...intent, operationId: 'create-B', plannedChildSessionId: 'child-B', requestedCwd: '/trees/B' }, 'UNSELECTED-NATIVE-JSON-NOTE')
    const before = await state.bindings.query(owner)
    assert.equal((await readFile(state.file, 'utf8')).includes(oldNote), true)
    const failure = new Error('source purge committed but native JSON receipt lost')
    const table = state.table
    const fault = { get: key => table.get(key), put: (...args) => table.put(...args), async update(...args) { await table.update(...args); throw failure } }
    const failed = state.open(fault), command = { operationId: 'native-purge', expectedRevision: before.revision, throughRevision: 3, bindingIds: [row.bindingId] }
    await assert.rejects(failed.purgeHistory(owner, author, command), error => error === failure)
    await assert.rejects(failed.query(owner), error => error.code === 'storage-uncertain')
    const raw = await readFile(state.file, 'utf8')
    assert.equal(raw.includes(oldNote), false)
    assert.equal(raw.includes('UNSELECTED-NATIVE-JSON-NOTE'), true)
    assert.equal(raw.includes('current-note-stays'), true)
    await state.close()
    state = await openNativeDomain(root)
    const restored = await state.bindings.query(owner)
    assert.deepEqual(restored.rows.map(item => item.value), before.rows.map(item => item.value))
    const result = await state.bindings.purgeHistory(owner, author, command)
    assert.equal(result.replayed, true)
    assert.equal(result.removedVersions, 3)
    assert.equal((await state.bindings.registerIntent(owner, author, intent)).dispatch, false)
    await state.bindings.updateBusiness(owner, author, oldCommand)
    await assert.rejects(state.bindings.updateBusiness(owner, author, { ...oldCommand, notes: 'mutated deleted command' }), error => error.code === 'operation-conflict')
    await state.close()
    state = null
    const output = execFileSync(process.execPath, [fileURLToPath(import.meta.url)], { encoding: 'utf8', env: { ...process.env, DSH_WORKTREE_CLEANUP_CHILD_ROOT: root } })
    const child = JSON.parse(output)
    assert.deepEqual(child.snapshot, restored)
    assert.equal(child.dispatch, false)
    assert.equal(child.oldMarkerPresent, false)
    assert.equal(child.currentMarkerPresent, true)
  })

if (childRoot) {
  const state = await openNativeDomain(childRoot)
  try {
    const snapshot = await state.bindings.query(owner)
    const replay = await state.bindings.registerIntent(owner, author, intent)
    const raw = await readFile(state.file, 'utf8')
    console.log(JSON.stringify({ snapshot, dispatch: replay.dispatch, oldMarkerPresent: raw.includes(oldNote), currentMarkerPresent: raw.includes('current-note-stays') }))
  } finally { await state.close() }
}
