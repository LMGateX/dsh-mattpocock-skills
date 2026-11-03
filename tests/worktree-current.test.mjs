import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registerHooks } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import ts from 'typescript'

// Public current registry interfaces over the existing immutable domain-storage seam.
// No global freeze changes, private projection/cache probes, host or lib emission.
const root = new URL('../src/controls/', import.meta.url).href
registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.startsWith(root) && specifier.startsWith('.') && specifier.endsWith('.js')) {
      const candidate = new URL(specifier.slice(0, -3) + '.ts', context.parentURL)
      if (existsSync(candidate)) return { url: candidate.href, shortCircuit: true }
    }
    return next(specifier, context)
  },
  load(url, context, next) {
    if (url.startsWith(root) && url.endsWith('.ts')) return { format: 'module', shortCircuit: true, source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText }
    return next(url, context)
  },
})
const { createWorktreeBindings, parseWorktreeBindingsDocument } = await import('../src/controls/worktree-bindings.ts')
const { createWorktreeObservations, parseWorktreeObservationsDocument } = await import('../src/controls/worktree-observations.ts')
const { createDomainVersionedStorage } = await import('../src/controls/versioned-storage.ts')
const owner = { instrumentInstanceId: 'instance', ownerSessionId: 'owner', controlWorkspaceId: 'workspace' }
const agent = { kind: 'agent', principalId: 'agent:owner', sessionId: 'owner' }
const program = { kind: 'user', principalId: 'user:operator', sessionId: null }
function store(parse) {
  const rows = new Map()
  const table = { get: key => rows.get(key), async put(key, value) { rows.set(key, value) }, async update(key, change) { const next = change(rows.get(key)); rows.set(key, next); return next } }
  return createDomainVersionedStorage(table, 'registry', parse)
}

test('binding current keeps cleaned rows and exact latest provenance, reusing immutable current values', async () => {
  const storage = store(parseWorktreeBindingsDocument)
  const registry = createWorktreeBindings(() => storage, () => 7)
  const empty = await registry.readCurrent(owner)
  assert.deepEqual(empty, { revision: 0, rows: [] })
  assert.strictEqual(empty, await registry.readCurrent({ ...owner }))
  const intent = { operationId: 'create', parentSessionId: 'owner', plannedChildSessionId: 'child', requestedCwd: '/trees/A', task: 'task', ticketIds: ['A'] }
  const created = await registry.registerIntent(owner, agent, intent)
  const confirmed = await registry.confirm(owner, 'create', { sessionId: 'child', parentSessionId: 'owner', cwd: '/trees/A' }, program)
  await registry.updateBusiness(owner, agent, { operationId: 'clean', bindingId: created.row.bindingId, expectedRevision: confirmed.revision, state: 'cleaned', notes: 'authored cleanup' })
  const current = await registry.readCurrent(owner)
  assert.equal(current.revision, 3)
  assert.equal(current.rows.length, 1)
  const row = current.rows[0]
  assert.equal(row.value.business.state, 'cleaned')
  assert.deepEqual(row.latest, { revision: 3, recordedAt: 7, operationId: 'clean', source: 'agent', author: agent })
  assert.deepEqual(row.creationAuthor, agent)
  assert.match(row.creationDigest, /^[a-f0-9]{64}$/)
  assert.equal(row.identity.plannedChildSessionId, 'child')
  assert.equal('history' in row, false)
  assert.equal('current' in current, false)
  assert.equal(Object.isFrozen(row), true)
  const legacy = await registry.query(owner)
  assert.equal(legacy.current.length, 0)
  assert.equal(legacy.rows[0].history.length, 3)
  assert.strictEqual(row.value, legacy.rows[0].value)
  for (let index = 0; index < 300; index++) assert.strictEqual(await registry.readCurrent({ ...owner }), current)
  for (const field of ['instrumentInstanceId', 'ownerSessionId', 'controlWorkspaceId']) await assert.rejects(registry.readCurrent({ ...owner, [field]: 'other' }), { code: 'association-conflict' })
  assert.strictEqual(await registry.readCurrent(owner), current)
})

test('observation current separates replayed creation evidence from latest program verification and authored cleanup', async () => {
  const storage = store(parseWorktreeObservationsDocument)
  const registry = createWorktreeObservations(() => storage, () => 11)
  const empty = await registry.readCurrent(owner)
  assert.strictEqual(empty, await registry.readCurrent({ ...owner }))
  const creation = { creatorSessionId: 'owner', callId: 'call-1', rootCallId: 'root-call', turn: 2, step: 3, path: '/trees/A', branch: 'tree-A', baseCommit: 'a'.repeat(40), repositoryRoot: '/repo' }
  const created = await registry.observe(owner, program, creation, 'replay')
  const checked = await registry.check(owner, program, { observationId: created.row.observationId, kind: 'failed', diagnostic: 'not checked' })
  await registry.updateBusiness(owner, agent, { operationId: 'clean-observation', observationId: created.row.observationId, expectedRevision: checked.revision, state: 'cleaned', notes: 'author says removed' })
  const current = await registry.readCurrent(owner)
  assert.equal(current.revision, 3)
  assert.equal(current.rows.length, 1)
  const row = current.rows[0]
  assert.equal(row.value.business.state, 'cleaned')
  assert.equal(row.value.check.state, 'failed')
  assert.equal(row.source, 'replay')
  assert.equal(row.recordedAt, 11)
  assert.deepEqual(row.creation, { revision: 1, recordedAt: 11, event: 'observed', source: 'replay', author: program })
  assert.deepEqual(row.latest, { revision: 3, recordedAt: 11, event: 'cleaned', source: 'agent', author: agent })
  assert.equal('history' in row, false)
  assert.equal('value' in row.creation, false)
  assert.equal('value' in row.latest, false)
  const legacy = await registry.query(owner)
  assert.equal(legacy.current.length, 0)
  assert.equal(legacy.rows[0].history.length, 3)
  assert.strictEqual(row.value, legacy.rows[0].value)
  for (let index = 0; index < 300; index++) assert.strictEqual(await registry.readCurrent({ ...owner }), current)
  for (const field of ['instrumentInstanceId', 'ownerSessionId', 'controlWorkspaceId']) await assert.rejects(registry.readCurrent({ ...owner, [field]: 'other' }), { code: 'association-conflict' })
  await registry.observe(owner, agent, { ...creation, callId: 'call-2' }, 'program')
  const next = await registry.readCurrent(owner)
  assert.notStrictEqual(next, current)
  assert.equal(next.rows[0].source, 'program')
  assert.equal(next.rows[0].creation.revision, 4)
  assert.equal(next.rows[0].value.callId, 'call-2')
  assert.equal(next.rows[0].value.business.state, 'cleaned')
  assert.equal(current.rows[0].source, 'replay')
})

test('large retained worktree histories do not enter current bodies or regenerate hot current projections', async t => {
  const bindingStorage = store(parseWorktreeBindingsDocument)
  const bindings = createWorktreeBindings(() => bindingStorage, () => 19)
  const first = await bindings.registerIntent(owner, agent, { operationId: 'long-create', parentSessionId: 'owner', plannedChildSessionId: 'long-child', requestedCwd: '/trees/long' })
  let binding = first.row
  for (let index = 0; index < 20; index++) binding = await bindings.updateBusiness(owner, agent, { operationId: 'long-binding-' + index, bindingId: binding.bindingId, expectedRevision: binding.revision, state: 'active', notes: String(index) + 'B'.repeat(60_000) })
  await bindings.updateBusiness(owner, agent, { operationId: 'short-current', bindingId: binding.bindingId, expectedRevision: binding.revision, state: 'cleaned', notes: 'short current note' })
  const observationsStorage = store(parseWorktreeObservationsDocument)
  const observations = createWorktreeObservations(() => observationsStorage, () => 23)
  const observed = await observations.observe(owner, program, { creatorSessionId: 'owner', callId: 'long-call', rootCallId: 'long-root', turn: null, step: null, path: '/trees/long', branch: 'tree-long', baseCommit: 'b'.repeat(40), repositoryRoot: '/repo' }, 'replay')
  for (let index = 0; index < 60; index++) await observations.check(owner, program, { observationId: observed.row.observationId, kind: 'failed', diagnostic: String(index) + 'O'.repeat(4000) })
  await observations.check(owner, program, { observationId: observed.row.observationId, kind: 'failed', diagnostic: 'short current diagnostic' })
  const size = value => Buffer.byteLength(JSON.stringify(value), 'utf8')
  const metrics = []
  for (const [kind, registry] of [['binding', bindings], ['observation', observations]]) {
    const current = await registry.readCurrent(owner)
    const legacy = await registry.query(owner)
    assert.ok(size(current) < 4096)
    assert.ok(size(legacy) > size(current) * 100)
    assert.equal(JSON.stringify(current).includes('BBBBBBBBBBBBBBBB'), false)
    assert.equal(JSON.stringify(current).includes('OOOOOOOOOOOOOOOO'), false)
    assert.strictEqual(current.rows[0].value, legacy.rows[0].value)
    for (let index = 0; index < 300; index++) assert.strictEqual(await registry.readCurrent(owner), current)
    metrics.push({ kind, retainedVersions: legacy.rows[0].history.length, fullBytes: size(legacy), currentBytes: size(current) })
  }
  t.diagnostic(JSON.stringify({ source: 'controlled immutable domain table', hotReadsPerRegistry: 300, metrics }))
})

test('cached current views cannot bypass unreadable storage or shallow-frozen malformed source validation', async () => {
  for (const [parse, create] of [[parseWorktreeBindingsDocument, createWorktreeBindings], [parseWorktreeObservationsDocument, createWorktreeObservations]]) {
    const base = store(parse)
    let mode = 'current', reads = 0
    const failure = new Error('source unavailable')
    const storage = { async read() { reads++; if (mode === 'denied') throw failure; if (mode === 'malformed') return Object.freeze({ schemaVersion: 1, revision: 1, owner, rows: [] }); return base.read() }, compareAndSwap: base.compareAndSwap.bind(base) }
    const registry = create(() => storage)
    const current = await registry.readCurrent(owner)
    const before = reads
    assert.strictEqual(await registry.readCurrent(owner), current)
    assert.equal(reads, before + 1)
    mode = 'denied'
    await assert.rejects(registry.readCurrent(owner), error => error === failure)
    mode = 'malformed'
    await assert.rejects(registry.readCurrent(owner), error => ['invalid-input', 'invalid-state'].includes(error.code))
    mode = 'current'
    assert.strictEqual(await registry.readCurrent(owner), current)
  }
})
