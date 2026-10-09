import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registerHooks } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

// Source-only public seam harness, matching the existing window tests; no lib writes.
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
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, verbatimModuleSyntax: true },
        fileName: fileURLToPath(url),
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
const intent = { operationId: 'create-A', parentSessionId: 'owner-A', plannedChildSessionId: 'child-A', requestedCwd: '/trees/A', task: 'ticket A' }
function fixture() {
  const stores = new Map()
  const storage = key => {
    if (!stores.has(key)) stores.set(key, new MemoryVersionedStorage(parseWorktreeBindingsDocument))
    return stores.get(key)
  }
  return { storage, open: () => createWorktreeBindings(storage) }
}

test('intent survives reopening before native create and repeated operation never authorizes another dispatch', async () => {
  const f = fixture(), bindings = f.open()
  const first = await bindings.registerIntent(owner, author, intent)
  assert.equal(first.dispatch, true)
  assert.equal(first.replayed, false)
  assert.equal(first.row.value.actualCwd, null)
  const reopened = f.open()
  const replay = await reopened.registerIntent(owner, author, intent)
  assert.equal(replay.dispatch, false)
  assert.equal(replay.replayed, true)
  assert.equal(replay.row.bindingId, first.row.bindingId)
  assert.equal((await reopened.query(owner)).rows.length, 1)
  assert.equal((await reopened.query(owner)).revision, 1)
})

test('confirmation requires exact actual child, parent and persisted cwd; never a path suggestion', async () => {
  const bindings = fixture().open()
  const { row } = await bindings.registerIntent(owner, author, intent)
  const header = { sessionId: 'child-A', parentSessionId: 'owner-A', cwd: '/trees/A' }
  for (const wrong of [{ ...header, cwd: '/trees/B' }, { ...header, sessionId: 'child-B' }, { ...header, parentSessionId: 'someone-else' }]) {
    await assert.rejects(bindings.confirm(owner, intent.operationId, wrong, author), error => error.code === 'association-conflict')
  }
  const confirmed = await bindings.confirm(owner, intent.operationId, header, author)
  assert.equal(confirmed.bindingId, row.bindingId)
  assert.equal(confirmed.value.actualChildSessionId, 'child-A')
  assert.equal(confirmed.value.actualCwd, '/trees/A')
  assert.equal(confirmed.value.outcome, 'confirmed')
  assert.equal(confirmed.history[1].source, 'program')
  assert.equal((await bindings.confirm(owner, intent.operationId, header, author)).revision, 2)
  assert.equal((await bindings.query(owner)).revision, 2)
})

test('discarded stays visible, cleaned remains readable but cannot be resurrected by stale business or program updates', async () => {
  const f = fixture(), bindings = f.open()
  const { row } = await bindings.registerIntent(owner, author, intent)
  let latest = await bindings.confirm(owner, intent.operationId, { sessionId: 'child-A', parentSessionId: 'owner-A', cwd: '/trees/A' }, author)
  const discarded = { operationId: 'discard-A', bindingId: row.bindingId, expectedRevision: latest.revision, state: 'discarded', notes: 'obsolete, remove later' }
  latest = await bindings.updateBusiness(owner, author, discarded)
  const discardedProjection = await bindings.query(owner)
  assert.equal(discardedProjection.current.length, 1)
  assert.equal(Object.hasOwn(discardedProjection.current[0], 'history'), false)
  assert.deepEqual(discardedProjection.current[0].author, author)
  assert.equal(discardedProjection.current[0].source, 'agent')
  const stale = { operationId: 'late-active', bindingId: row.bindingId, expectedRevision: latest.revision, state: 'active' }
  latest = await bindings.updateBusiness(owner, author, { operationId: 'clean-A', bindingId: row.bindingId, expectedRevision: latest.revision, state: 'cleaned', notes: 'agent removed tree' })
  await assert.rejects(bindings.updateBusiness(owner, author, stale), error => error.code === 'revision-conflict')
  await assert.rejects(bindings.updateBusiness(owner, author, { ...stale, operationId: 'fresh-active', expectedRevision: latest.revision }), error => error.code === 'invalid-state')
  await bindings.confirm(owner, intent.operationId, { sessionId: 'child-A', parentSessionId: 'owner-A', cwd: '/trees/A' }, author)
  await bindings.updateBusiness(owner, author, discarded) // old duplicate is a receipt, not a new state write
  const snapshot = await f.open().query(owner)
  assert.equal(snapshot.current.length, 0)
  assert.equal(snapshot.rows.length, 1)
  assert.equal(snapshot.rows[0].value.business.state, 'cleaned')
  assert.equal(snapshot.rows[0].value.actualCwd, '/trees/A')
  assert.deepEqual(snapshot.rows[0].history.map(version => version.value.business.state), ['active', 'active', 'discarded', 'cleaned'])
  assert.deepEqual(snapshot.rows[0].history[3].author, author)
  assert.equal(snapshot.rows[0].history[3].source, 'agent')
})

test('native rejection, accepted cancellation and crash uncertainty remain distinct until actual-header reconciliation', async () => {
  const f = fixture(), bindings = f.open()
  await bindings.registerIntent(owner, author, intent)
  let row = await bindings.recordOutcome(owner, intent.operationId, { acceptance: 'accepted', outcome: 'cancelled', diagnostic: 'cancelled after acceptance' }, author)
  assert.equal(row.value.acceptance, 'accepted')
  assert.equal(row.value.actualCwd, null)
  assert.equal((await f.open().registerIntent(owner, author, intent)).dispatch, false)
  row = await f.open().reconcile(owner, intent.operationId, null, author)
  assert.equal(row.value.acceptance, 'accepted')
  assert.equal(row.value.outcome, 'accepted-unknown')
  assert.equal(row.value.actualChildSessionId, null)
  row = await f.open().reconcile(owner, intent.operationId, { sessionId: 'child-A', parentSessionId: 'owner-A', cwd: '/trees/A' }, author)
  assert.equal(row.value.outcome, 'confirmed')
  assert.equal(row.value.actualCwd, '/trees/A')
  const rejectedIntent = { ...intent, operationId: 'create-B', plannedChildSessionId: 'child-B' }
  await bindings.registerIntent(owner, author, rejectedIntent)
  const rejected = await bindings.recordOutcome(owner, 'create-B', { acceptance: 'rejected', outcome: 'failed', diagnostic: 'native permission denied' }, author)
  assert.equal(rejected.value.acceptance, 'rejected')
  assert.equal(rejected.value.outcome, 'failed')
  assert.equal(rejected.value.actualCwd, null)
  assert.equal((await bindings.query(owner)).rows.length, 2)
})

test('same-value business updates persist author and idempotency rather than silently losing the operation', async () => {
  const bindings = fixture().open()
  const { row } = await bindings.registerIntent(owner, author, intent)
  const command = { operationId: 'note-active', bindingId: row.bindingId, expectedRevision: row.revision, state: 'active' }
  const saved = await bindings.updateBusiness(owner, author, command)
  assert.equal(saved.revision, 2)
  assert.equal(saved.history[1].operationId, 'note-active')
  assert.deepEqual(saved.history[1].author, author)
  assert.equal((await bindings.updateBusiness(owner, author, command)).revision, 2)
  await assert.rejects(bindings.updateBusiness(owner, author, { ...command, notes: 'different' }), error => error.code === 'operation-conflict')
  await assert.rejects(bindings.updateBusiness(owner, { ...author, principalId: 'agent:other' }, command), error => error.code === 'operation-conflict')
})

test('query rejects a persisted late program version that loses actual header identity or resurrects cleaned state', async () => {
  const f = fixture(), bindings = f.open()
  await bindings.registerIntent(owner, author, intent)
  let row = await bindings.confirm(owner, intent.operationId, { sessionId: 'child-A', parentSessionId: 'owner-A', cwd: '/trees/A' }, author)
  await bindings.updateBusiness(owner, author, { operationId: 'clean-A', bindingId: row.bindingId, expectedRevision: row.revision, state: 'cleaned' })
  const saved = await f.storage(owner.ownerSessionId).read()
  for (const changes of [{ actualCwd: null, actualChildSessionId: null, outcome: 'accepted-unknown' }, { business: { state: 'active' } }]) {
    const corrupt = structuredClone(saved), target = corrupt.rows[0]
    const value = { ...target.value, ...changes }
    corrupt.revision = 4
    target.revision = 4
    target.value = value
    target.history.push({ revision: 4, recordedAt: 1, operationId: intent.operationId, source: 'program', author, value })
    const reopened = createWorktreeBindings(() => ({ async read() { return corrupt }, async compareAndSwap() { assert.fail('query must not write') } }))
    await assert.rejects(reopened.query(owner), error => error.code === 'invalid-input')
  }
})

test('intent rejects mismatched actual agent parent and reusing the owner as a planned child', async () => {
  const bindings = fixture().open()
  await assert.rejects(bindings.registerIntent(owner, { ...author, sessionId: 'other-parent' }, intent), error => error.code === 'access-denied')
  await assert.rejects(bindings.registerIntent(owner, author, { ...intent, parentSessionId: 'nested-parent', plannedChildSessionId: 'owner-A' }), error => error.code === 'association-conflict')
  await assert.rejects(bindings.registerIntent(owner, author, { ...intent, requestedCwd: 'trees/A' }), error => error.code === 'invalid-input')
  await assert.rejects(bindings.registerIntent(owner, author, { ...intent, author }), error => error.code === 'invalid-input')
  assert.equal((await bindings.query(owner)).revision, 0)
})

test('owners are independent, one concurrent intent wins dispatch, and row CAS ignores unrelated row writes', async () => {
  const f = fixture(), firstHandle = f.open(), secondHandle = f.open()
  const replies = await Promise.all([firstHandle.registerIntent(owner, author, intent), secondHandle.registerIntent(owner, author, intent)])
  assert.deepEqual(replies.map(reply => reply.dispatch).sort(), [false, true])
  assert.equal(replies[0].row.bindingId, replies[1].row.bindingId)
  const other = { ...owner, ownerSessionId: 'owner-B', instrumentInstanceId: 'instance-B' }
  const otherAuthor = { ...author, principalId: 'agent:owner-B', sessionId: 'owner-B' }
  const independent = await firstHandle.registerIntent(other, otherAuthor, { ...intent, parentSessionId: 'owner-B' })
  assert.notEqual(independent.row.bindingId, replies[0].row.bindingId)
  assert.equal((await firstHandle.query(other)).revision, 1)
  const nextChild = await firstHandle.registerIntent(owner, author, { ...intent, operationId: 'create-next', plannedChildSessionId: 'child-next' })
  assert.notEqual(nextChild.row.bindingId, replies[0].row.bindingId) // same pathname is not the binding ID
  const saved = await firstHandle.updateBusiness(owner, author, { operationId: 'discard-original', bindingId: replies[0].row.bindingId, expectedRevision: 1, state: 'discarded' })
  assert.equal(saved.revision, 3)
  const concurrent = await Promise.allSettled([
    firstHandle.updateBusiness(owner, author, { operationId: 'one', bindingId: saved.bindingId, expectedRevision: 3, state: 'active' }),
    secondHandle.updateBusiness(owner, author, { operationId: 'two', bindingId: saved.bindingId, expectedRevision: 3, state: 'cleaned' }),
  ])
  assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(concurrent.find(result => result.status === 'rejected').reason.code, 'revision-conflict')
  await assert.rejects(firstHandle.query({ ...owner, instrumentInstanceId: 'forged-instance' }), error => error.code === 'association-conflict')
  await assert.rejects(firstHandle.confirm(other, 'create-next', { sessionId: 'child-next', parentSessionId: 'owner-A', cwd: '/trees/A' }, otherAuthor), error => error.code === 'association-conflict')
})

test('accepted native create plus lost persistence receipt throws separately; fresh handle reads actual commit without redispatch', async () => {
  const values = new Map(), failure = new Error('binding save receipt lost')
  let failUpdate = true
  function table() {
    return {
      get(key) { return values.get(key) },
      async put(key, value) { values.set(key, value) },
      async update(key, transform) {
        const next = transform(values.get(key))
        values.set(key, next)
        if (failUpdate) { failUpdate = false; throw failure }
        return next
      },
    }
  }
  const failedHandle = table()
  const bindings = createWorktreeBindings(key => createDomainVersionedStorage(failedHandle, key, parseWorktreeBindingsDocument))
  await bindings.registerIntent(owner, author, intent)
  const nativeResult = { accepted: true, childId: 'child-A' } // native side effect belongs to caller, not the instrument
  const header = { sessionId: nativeResult.childId, parentSessionId: 'owner-A', cwd: '/trees/A' }
  await assert.rejects(bindings.confirm(owner, intent.operationId, header, author), error => error === failure)
  assert.equal(nativeResult.accepted, true)
  await assert.rejects(bindings.query(owner), error => error.code === 'storage-uncertain')
  const freshHandle = table()
  const reopened = createWorktreeBindings(key => createDomainVersionedStorage(freshHandle, key, parseWorktreeBindingsDocument))
  const replay = await reopened.registerIntent(owner, author, intent)
  assert.equal(replay.dispatch, false)
  assert.equal(replay.row.value.outcome, 'confirmed')
  assert.equal((await reopened.reconcile(owner, intent.operationId, header, author)).revision, 2)
  assert.equal((await reopened.query(owner)).rows[0].history.length, 2)
})

test('creation and business operations share durable identity protection; changed creation payload or author cannot redispatch', async () => {
  const bindings = fixture().open()
  const { row } = await bindings.registerIntent(owner, author, intent)
  await bindings.updateBusiness(owner, author, { operationId: 'business-op', bindingId: row.bindingId, expectedRevision: 1, state: 'active' })
  await assert.rejects(bindings.registerIntent(owner, author, { ...intent, operationId: 'business-op', plannedChildSessionId: 'another-child' }), error => error.code === 'operation-conflict')
  await assert.rejects(bindings.registerIntent(owner, author, { ...intent, requestedCwd: '/trees/B' }), error => error.code === 'operation-conflict')
  await assert.rejects(bindings.registerIntent(owner, { ...author, principalId: 'agent:other' }, intent), error => error.code === 'operation-conflict')
  await assert.rejects(bindings.registerIntent(owner, author, { ...intent, operationId: 'new-op-same-child' }), error => error.code === 'association-conflict')
  assert.equal((await bindings.query(owner)).revision, 2)
})

test('a lane binding records the tickets it works and legacy rows without tickets still parse', async () => {
  const f = fixture(), bindings = f.open()
  const registered = await bindings.registerIntent(owner, author, { ...intent, operationId: 'ticketed-op', plannedChildSessionId: 'child-T', requestedCwd: '/trees/T', ticketIds: ['T7', 'T8'] })
  assert.deepEqual(registered.row.value.ticketIds, ['T7', 'T8'])
  const reopened = f.open()
  const row = (await reopened.query(owner)).rows.find(candidate => candidate.value.operationId === 'ticketed-op')
  assert.deepEqual(row.value.ticketIds, ['T7', 'T8'], 'the tickets survive a reopen')
  await assert.rejects(bindings.registerIntent(owner, author, { ...intent, operationId: 'ticketed-dup', plannedChildSessionId: 'child-D', requestedCwd: '/trees/D', ticketIds: ['T7', 'T7'] }),
    error => error.code === 'invalid-input')
  const unticketed = await bindings.registerIntent(owner, author, { ...intent, operationId: 'plain-op', plannedChildSessionId: 'child-P', requestedCwd: '/trees/P' })
  assert.equal('ticketIds' in unticketed.row.value, false, 'a ticketless lane records no ticket field')
})
