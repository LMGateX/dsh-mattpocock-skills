import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ts from 'typescript'
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.endsWith('.js') && context.parentURL?.includes('/src/controls/')) return next(specifier.slice(0, -3) + '.ts', context)
    return next(specifier, context)
  },
  load(url, context, next) {
    if (url.endsWith('.ts')) return { format: 'module', source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText, shortCircuit: true }
    return next(url, context)
  },
})
const { createResourceModule, MemoryResourceStorage, createDomainResourceStorage, parseResourceDocument } = await import('../src/controls/resources.ts')
const identity = (path = '/fixture/tree', ownership = 'owned') => ({ repositoryPath: '/fixture/repo', rootIdentity: 'fixture-root', pathIdentity: 'fixture-tree', path, gitCommonDirIdentity: 'fixture-common', gitDirIdentity: 'fixture-private', gitCommonDir: '/fixture/repo/.git', gitDir: '/fixture/repo/.git/worktrees/tree', branchRef: 'refs/heads/tree', branchOwned: ownership === 'owned', ownership, baseOid: 'a'.repeat(40), root: '/fixture' })
function fixture(options = {}) {
  const storage = options.storage ?? new MemoryResourceStorage()
  const removed = []
  const authority = options.authority ?? { async authorize(principal) { return { controlWorkspaceId: 'W', instrumentInstanceId: principal, authorId: principal } } }
  const git = { async planCreate(spec) { return { ...identity('/fixture/' + spec.name), branchRef: 'refs/heads/' + spec.name, gitDir: '/fixture/repo/.git/worktrees/' + spec.name } }, async create(value) { return value }, async borrow(path) { return identity(path, 'borrowed') }, async inspect(value) { return { identityVerified: true, exists: true, tracked: [], untracked: [], ignored: [], headOid: value.baseOid, branchOid: value.baseOid, digest: 'fixture-facts' } }, async retire(value) { removed.push(value.path) }, ...options.git }
  const lifecycle = { async closeEntrypoints() { return { closed: true, nativeColdResumeClosed: true } }, async verifyInitialBinding() { return true }, ...options.lifecycle }
  return { ...createResourceModule({ storage, authority, git, lifecycle, newId: options.newId ?? (() => { let n = 0; return () => 'id-' + ++n })() }), storage, removed }
}
test('owned resource retains original binding across idle followups; business status cannot release cold reference', async () => {
  const f = fixture()
  const r = await f.resources.create('A', { repositoryPath: '/fixture/repo', root: '/fixture', name: 'tree', startPoint: 'HEAD' })
  await f.program.setReference(r.resourceId, { bindingId: 'child', instrumentInstanceId: 'A', sessionId: 'child', state: 'idle', reusable: true, entryOpen: true })
  await f.resources.updateBusiness('A', r.resourceId, { status: '已经完成，无需再集成' })
  assert.equal((await f.resources.read('A', r.resourceId)).actualCanRetire.allowed, false)
  await f.resources.requestRetire('A', r.resourceId, { kind: 'remove-clean', branch: 'keep' })
  const result = await f.resources.actualRetire('A', r.resourceId)
  assert.equal(result.actualCanRetire.allowed, false)
  assert.equal(f.removed.length, 0)
  assert(result.actualCanRetire.reasons.includes('reusable-reference'))
})
test('resource list resolves actual instance and never leaks another owner business via shared refs', async () => {
  const f = fixture(), a = await f.resources.create('A', { repositoryPath: '/fixture/repo', root: '/fixture', name: 'owner-A', startPoint: 'HEAD' }), b = await f.resources.create('B', { repositoryPath: '/fixture/repo', root: '/fixture', name: 'owner-B', startPoint: 'HEAD' })
  await f.resources.updateBusiness('A', a.resourceId, { status: 'A private task' })
  await f.resources.updateBusiness('B', b.resourceId, { status: 'B private task' })
  await f.program.setReference(a.resourceId, { bindingId: 'B-on-A', instrumentInstanceId: 'B', sessionId: 'B-on-A', state: 'cold', reusable: true, entryOpen: true })
  const borrowed = await f.resources.borrow('B', a.identity.path)
  await f.resources.updateBusiness('B', borrowed.resourceId, { status: 'B borrowed task' })
  const listA = await f.resources.list('A'), listB = await f.resources.list('B')
  assert.deepEqual(listA.map(v => v.resourceId), [a.resourceId])
  assert.deepEqual(listB.map(v => v.resourceId), [b.resourceId, borrowed.resourceId])
  assert.equal(listA[0].references[0].instrumentInstanceId, 'B')
  assert.equal(JSON.stringify(listB).includes('A private task'), false)
  assert.equal(listB[1].business.status, 'B borrowed task')
  assert(Object.isFrozen(listB)); assert(Object.isFrozen(listB[0].actualCanRetire))
  assert.deepEqual(await f.resources.list('unknown-instance'), [])
})
test('cold denied unsupported or missing inspectors preserve per-row authorized metadata without physical proof', async () => {
  const f = fixture({ git: { async inspect(value) {
    const name = value.path.split('/').at(-1)
    if (name === 'unsupported' || name === 'denied' || name === 'missing-error') throw Object.assign(new Error('physical inspection unavailable'), { code: { unsupported: 'unsupported', denied: 'access-denied', 'missing-error': 'ENOENT' }[name] })
    if (name === 'missing-facts') return { identityVerified: false, exists: false, tracked: [], untracked: [], ignored: [], headOid: null, branchOid: null, digest: 'absent' }
    return { identityVerified: true, exists: true, tracked: [], untracked: [], ignored: [], headOid: value.baseOid, branchOid: value.baseOid, digest: 'healthy' }
  } } })
  const names = ['unsupported', 'denied', 'missing-error', 'missing-facts', 'healthy']
  const rows = []
  for (const name of names) { const r = await f.resources.create('A', spec(name)); await f.resources.updateBusiness('A', r.resourceId, { status: name + ' task metadata' }); await f.program.setReference(r.resourceId, ref(name + '-child', 'A', 'cold')); rows.push(r) }
  const listed = await f.resources.list('A')
  assert.equal(listed.length, 5)
  const reasons = ['physical-inspection-unsupported', 'physical-inspection-access-denied', 'physical-inspection-missing', 'physical-inspection-missing']
  for (let n = 0; n < 4; n++) {
    for (const v of [listed[n], await f.resources.read('A', rows[n].resourceId)]) {
      assert.equal(v.business.status, names[n] + ' task metadata')
      assert.equal(v.references[0].state, 'cold')
      assert.equal(v.actualCanRetire.facts, null)
      assert.equal(v.actualCanRetire.allowed, false)
      assert(v.actualCanRetire.reasons.includes(reasons[n]))
    }
  }
  assert.equal(listed[4].actualCanRetire.facts.digest, 'healthy')
  assert.equal(new Set(listed.map(v => v.actualCanRetire.ledgerRevision)).size, 1)
  assert.equal(f.removed.length, 0)
})
test('physical inspection unavailable does not soften actual mutation failure or delete retained tree', async () => {
  const failure = Object.assign(new Error('cold session has no live authorized Git runner'), { code: 'unsupported' })
  const f = fixture({ git: { async inspect() { throw failure } } }), r = await f.resources.create('A', spec('cold-mutation'))
  await f.resources.requestRetire('A', r.resourceId, clean)
  await assert.rejects(f.resources.actualRetire('A', r.resourceId), failure)
  assert.equal((await f.resources.read('A', r.resourceId)).status, 'quarantined')
  assert.equal(f.removed.length, 0)
})
test('readonly inspector degradation never hides denied or corrupt metadata authority and storage', async () => {
  const f = fixture(), r = await f.resources.create('A', spec('auth'))
  const malformedAuthority = fixture({ storage: f.storage, authority: { async authorize() { return { controlWorkspaceId: 'W' } } } })
  await assert.rejects(malformedAuthority.resources.list('A'), e => e.code === 'invalid-input')
  const denied = Object.assign(new Error('metadata permission denied'), { code: 'access-denied' }), deniedAuthority = fixture({ storage: f.storage, authority: { async authorize() { throw denied } } })
  await assert.rejects(deniedAuthority.resources.list('A'), denied)
  await assert.rejects(deniedAuthority.resources.read('A', r.resourceId), denied)
  const bad = structuredClone(await f.storage.read()); bad.schemaVersion = 99
  const corrupt = fixture({ storage: { async read() { return bad }, async compareAndSwap() { throw new Error('must not write') } } })
  await assert.rejects(corrupt.resources.list('A'), e => e.code === 'invalid-state')
  await assert.rejects(corrupt.resources.read('A', r.resourceId), e => e.code === 'invalid-state')
})
test('resource business statements cannot forge program facts or author identities', async () => {
  const f = fixture(), r = await f.resources.create('A', { repositoryPath: '/fixture/repo', root: '/fixture', name: 'business', startPoint: 'HEAD' })
  await assert.rejects(f.resources.updateBusiness('A', r.resourceId, { status: 'done', references: [] }), e => e.code === 'invalid-input')
  await assert.rejects(f.resources.requestRetire('A', r.resourceId, { kind: 'remove-clean', branch: 'keep', authorId: 'user' }), e => e.code === 'invalid-input')
  const updated = await f.resources.updateBusiness('A', r.resourceId, { status: '任意业务标签', disposition: '还需再复查', followup: '同票补修' })
  assert.equal(updated.businessAuthorId, 'A')
  assert.equal(updated.status, 'retained')
})
const spec = name => ({ repositoryPath: '/fixture/repo', root: '/fixture', name, startPoint: 'HEAD' })
const ref = (bindingId, instance = 'A', state = 'active', reusable = true) => ({ bindingId, instrumentInstanceId: instance, sessionId: bindingId, state, reusable, entryOpen: true })
const clean = { kind: 'remove-clean', branch: 'keep' }
function deferred() { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
test('borrowed cross-instance claims protect owner deletion and detach never deletes content', async () => {
  const f = fixture(), owned = await f.resources.create('A', spec('shared'))
  const borrowed = await f.resources.borrow('B', owned.identity.path)
  await f.resources.requestRetire('A', owned.resourceId, clean)
  assert((await f.resources.actualRetire('A', owned.resourceId)).actualCanRetire.reasons.includes('cross-instance-resource-claim'))
  await assert.rejects(f.resources.read('B', owned.resourceId), e => e.code === 'access-denied')
  await f.resources.requestRetire('B', borrowed.resourceId, clean)
  assert.equal((await f.resources.actualRetire('B', borrowed.resourceId)).status, 'retired')
  assert.equal(f.removed.length, 0)
  assert.equal((await f.resources.actualRetire('A', owned.resourceId)).status, 'retired')
  assert.deepEqual(f.removed, [owned.identity.path])
})
test('binding identity cannot migrate cwd or reopen after an explicit durable release', async () => {
  const f = fixture(), one = await f.resources.create('A', spec('one')), two = await f.resources.create('A', spec('two'))
  await f.program.setReference(one.resourceId, ref('child', 'A', 'idle'))
  await assert.rejects(f.program.setReference(two.resourceId, ref('child', 'A', 'idle')), e => e.code === 'identity-conflict')
  await assert.rejects(f.program.setReference(two.resourceId, { ...ref('new-binding', 'A', 'idle'), sessionId: 'child' }), e => e.code === 'identity-conflict')
  await f.program.releaseReference(one.resourceId, 'child')
  await assert.rejects(f.program.setReference(one.resourceId, ref('child', 'A', 'active')), e => e.code === 'resource-busy')
  await f.resources.retain('A', one.resourceId)
  assert.equal((await f.resources.read('A', one.resourceId)).identity.path, '/fixture/one')
})
test('queued, accepted-message, cold and unknown references are not idle release', async () => {
  for (const state of ['queued', 'accepted-message', 'cold', 'unknown']) {
    const f = fixture(), r = await f.resources.create('A', spec('pending'))
    await f.program.setReference(r.resourceId, ref('child', 'B', state, false))
    await f.resources.requestRetire('A', r.resourceId, clean)
    assert.equal((await f.resources.actualRetire('A', r.resourceId)).status, 'retire-requested')
    assert.equal(f.removed.length, 0)
    await f.program.releaseReference(r.resourceId, 'child')
    assert.equal((await f.resources.actualRetire('A', r.resourceId)).status, 'retired')
  }
})
test('native cold closure unsupported retains cwd; initial binding seam absence is explicit unsupported', async () => {
  const f = fixture({ lifecycle: { async closeEntrypoints() { return { closed: true, nativeColdResumeClosed: false } }, async verifyInitialBinding() { return false } } })
  const r = await f.resources.create('A', spec('cold'))
  await assert.rejects(f.program.setReference(r.resourceId, ref('child')), e => e.code === 'unsupported')
  await f.resources.requestRetire('A', r.resourceId, clean)
  const result = await f.resources.actualRetire('A', r.resourceId)
  assert(result.actualCanRetire.reasons.includes('native-cold-resume-unsupported'))
  assert.equal(result.status, 'retire-requested'); assert.equal(f.removed.length, 0)
})
test('multi-resource writer and integration exclusion is one atomic cross-instance CAS', async () => {
  const storage = new MemoryResourceStorage(), f = fixture({ storage }), g = fixture({ storage, newId: () => 'B-resource' })
  const a = await f.resources.create('A', spec('one')), b = await g.resources.create('B', spec('two'))
  const writer = { leaseId: 'writer', instrumentInstanceId: 'A', kind: 'writer', resourceIds: [a.resourceId] }
  const integration = { leaseId: 'integration', instrumentInstanceId: 'B', kind: 'integration', resourceIds: [b.resourceId] }
  const attempts = await Promise.allSettled([f.program.acquireLease(writer), g.program.acquireLease(integration)])
  assert.equal(attempts.filter(v => v.status === 'fulfilled').length, 1)
  assert.equal((await storage.read()).leases.length, 1)
  await f.program.releaseLease('writer', 'A'); await g.program.releaseLease('integration', 'B')
  await f.program.setReference(b.resourceId, ref('A-on-B', 'A', 'idle', false))
  await f.program.acquireLease({ ...writer, resourceIds: [a.resourceId, b.resourceId] })
  await assert.rejects(g.program.acquireLease({ leaseId: 'other', instrumentInstanceId: 'B', kind: 'writer', resourceIds: [b.resourceId] }), e => e.code === 'resource-busy')
  assert.equal((await storage.read()).leases[0].resourceIds.length, 2)
  await assert.rejects(g.program.releaseLease('writer', 'B'), e => e.code === 'access-denied')
})
test('foreign checkout borrowing owned branch blocks branch deletion across resource identities', async () => {
  const f = fixture({ git: { async borrow(path) { return { ...identity(path, 'borrowed'), gitDir: '/fixture/repo/.git/worktrees/foreign', branchRef: 'refs/heads/shared' } } } })
  const r = await f.resources.create('A', spec('shared')), foreign = await f.resources.borrow('B', '/fixture/foreign')
  await f.resources.requestRetire('A', r.resourceId, { kind: 'remove-clean', branch: 'delete-owned', expectedBranchOid: r.identity.baseOid })
  const result = await f.resources.actualRetire('A', r.resourceId)
  assert(result.actualCanRetire.reasons.includes('cross-instance-branch-claim'))
  assert.equal(f.removed.length, 0)
  await f.program.acquireLease({ leaseId: 'foreign-writer', instrumentInstanceId: 'B', kind: 'writer', resourceIds: [foreign.resourceId] })
  await assert.rejects(f.resources.actualRetire('A', r.resourceId), e => e.code === 'resource-busy')
})
test('writer against borrowed alias blocks owner retirement globally', async () => {
  const f = fixture(), a = await f.resources.create('A', spec('one')), b = await f.resources.borrow('B', a.identity.path)
  await f.program.acquireLease({ leaseId: 'B-writer', instrumentInstanceId: 'B', kind: 'writer', resourceIds: [b.resourceId] })
  await f.resources.requestRetire('A', a.resourceId, clean)
  await assert.rejects(f.resources.actualRetire('A', a.resourceId), e => e.code === 'resource-busy')
  assert.equal(f.removed.length, 0)
})
test('retirement reservation excludes late references and writers before closing native entrances', async () => {
  const gate = deferred(), entered = deferred(), f = fixture({ lifecycle: { async closeEntrypoints() { entered.resolve(); await gate.promise; return { closed: true, nativeColdResumeClosed: true } } } })
  const r = await f.resources.create('A', spec('race'))
  await f.resources.requestRetire('A', r.resourceId, clean)
  const retiring = f.resources.actualRetire('A', r.resourceId)
  await entered.promise
  await assert.rejects(f.program.setReference(r.resourceId, ref('late', 'B')), e => e.code === 'resource-busy')
  await assert.rejects(f.program.acquireLease({ leaseId: 'late-writer', instrumentInstanceId: 'A', kind: 'writer', resourceIds: [r.resourceId] }), e => e.code === 'resource-busy')
  gate.resolve(); assert.equal((await retiring).status, 'retired')
})
test('unknown observation cannot enter through an existing idle reference during retirement inspection', async () => {
  const gate = deferred(), entered = deferred(); let inspecting = false
  const f = fixture({ git: { async inspect(value) { if (inspecting) { entered.resolve(); await gate.promise }; return { identityVerified: true, exists: true, tracked: [], untracked: [], ignored: [], headOid: value.baseOid, branchOid: value.baseOid, digest: 'facts' } } } })
  const r = await f.resources.create('A', spec('unknown-race'))
  await f.program.setReference(r.resourceId, ref('old', 'A', 'idle', false))
  await f.resources.requestRetire('A', r.resourceId, clean)
  inspecting = true; const retiring = f.resources.actualRetire('A', r.resourceId); await entered.promise
  await assert.rejects(f.program.setReference(r.resourceId, { ...ref('old', 'A', 'unknown', false), entryOpen: false }), e => e.code === 'resource-busy')
  gate.resolve(); assert.equal((await retiring).status, 'retired')
})
test('host late initial-message/catalog failure explicitly quarantines existing tree and durable references', async () => {
  const f = fixture(), r = await f.resources.create('A', spec('catalog'))
  await f.program.setReference(r.resourceId, ref('child', 'A', 'accepted-message'))
  await f.program.quarantine(r.resourceId, 'native initial receive/catalog receipt lost; durable header may remain')
  const restored = fixture({ storage: new MemoryResourceStorage(await f.storage.read()) })
  assert.equal((await restored.program.recover()).resources[0].status, 'quarantined')
  assert.equal((await restored.resources.read('A', r.resourceId)).references[0].state, 'accepted-message')
  await assert.rejects(restored.resources.requestRetire('A', r.resourceId, clean), e => e.code === 'resource-busy')
  assert.equal(restored.removed.length, 0)
})
test('late creation failure quarantines reservation and never auto-rolls back filesystem', async () => {
  const failure = new Error('catalog publication failed after durable header'), f = fixture({ git: { async create() { throw failure } } })
  await assert.rejects(f.resources.create('A', spec('late')), failure)
  const restored = fixture({ storage: new MemoryResourceStorage(await f.storage.read()) })
  const document = await restored.program.recover()
  assert.equal(document.resources[0].status, 'quarantined')
  assert.equal(document.resources[0].identity.ownership, 'owned'); assert.equal(f.removed.length, 0)
  await assert.rejects(restored.resources.requestRetire('A', document.resources[0].resourceId, clean), e => e.code === 'resource-busy')
})
test('retire failure before removal preserves identity and is retryable after fresh restore', async () => {
  let attempts = 0
  const f = fixture({ git: { async retire() { if (++attempts === 1) throw new Error('authorized runner denied before effect') } } })
  const r = await f.resources.create('A', spec('retry'))
  await f.resources.requestRetire('A', r.resourceId, clean)
  await assert.rejects(f.resources.actualRetire('A', r.resourceId), /denied/)
  assert.equal((await f.resources.read('A', r.resourceId)).status, 'cleanup-failed')
  const restored = fixture({ storage: new MemoryResourceStorage(await f.storage.read()) })
  assert.equal((await restored.resources.actualRetire('A', r.resourceId)).status, 'retired')
})
test('partial retirement with absent original cwd is quarantined, never retried against a replacement path', async () => {
  let removed = false
  const f = fixture({ git: {
    async inspect(value) { return { identityVerified: !removed, exists: !removed, tracked: [], untracked: [], ignored: [], headOid: value.baseOid, branchOid: value.baseOid, digest: 'facts' } },
    async retire() { removed = true; throw new Error('branch deletion failed after worktree removal') },
  } })
  const r = await f.resources.create('A', spec('partial'))
  await f.resources.requestRetire('A', r.resourceId, clean)
  await assert.rejects(f.resources.actualRetire('A', r.resourceId), /after worktree removal/)
  assert.equal((await f.resources.read('A', r.resourceId)).status, 'quarantined')
  const restored = fixture({ storage: new MemoryResourceStorage(await f.storage.read()) })
  await assert.rejects(restored.resources.requestRetire('A', r.resourceId, clean), e => e.code === 'resource-busy')
  assert.equal(restored.removed.length, 0)
})
test('fresh restore preserves binding and leases; interrupted effects quarantine without deletion', async () => {
  const f = fixture(), r = await f.resources.create('A', spec('restore'))
  await f.program.setReference(r.resourceId, ref('child', 'A', 'cold'))
  await f.program.acquireLease({ leaseId: 'lease', instrumentInstanceId: 'A', kind: 'writer', resourceIds: [r.resourceId] })
  const seeded = await f.storage.read(), g = fixture({ storage: new MemoryResourceStorage(seeded) })
  assert.equal((await g.program.recover()).leases.length, 1)
  assert.equal((await g.resources.read('A', r.resourceId)).references[0].bindingId, 'child')
  const uncertain = structuredClone(seeded); uncertain.resources[0].status = 'retiring'; uncertain.resources[0].retireRequest = { ...clean, authorId: 'A' }
  const h = fixture({ storage: new MemoryResourceStorage(uncertain) })
  assert.equal((await h.program.recover()).resources[0].status, 'quarantined')
  assert.equal(h.removed.length, 0)
})
test('dedicated JSON resource-domain reopen preserves actual bindings and lease exclusion', async t => {
  const root = await fs.mkdtemp(join(tmpdir(), 'resource-storage-fixture-')), file = join(root, 'resources.json')
  t.after(async () => { assert(root.startsWith(join(tmpdir(), 'resource-storage-fixture-'))); await fs.rm(root, { recursive: true, force: true }) })
  async function open() {
    let value
    try { value = JSON.parse(await fs.readFile(file, 'utf8')) } catch (e) { if (e.code !== 'ENOENT') throw e }
    const publish = async next => { const temporary = join(root, 'write.tmp'); await fs.writeFile(temporary, JSON.stringify(next)); await fs.rename(temporary, file); value = next }
    const table = { get() { return value }, async put(_k, v) { await publish(v) }, async update(_k, fn) { const v = fn(value); await publish(v); return v } }
    return fixture({ storage: createDomainResourceStorage(table) })
  }
  const f = await open(), r = await f.resources.create('A', spec('durable'))
  await f.program.setReference(r.resourceId, ref('child', 'B', 'cold'))
  await f.program.acquireLease({ leaseId: 'writer', instrumentInstanceId: 'A', kind: 'writer', resourceIds: [r.resourceId] })
  const reopened = await open(), recovered = await reopened.program.recover()
  assert.equal(recovered.resources[0].identity.path, '/fixture/durable')
  assert.equal(recovered.resources[0].references[0].instrumentInstanceId, 'B')
  assert.equal(recovered.leases[0].leaseId, 'writer')
  await reopened.resources.requestRetire('A', r.resourceId, clean)
  await assert.rejects(reopened.resources.actualRetire('A', r.resourceId), e => e.code === 'resource-busy')
  assert.equal(reopened.removed.length, 0)
})
test('domain storage lost durable receipt latches all wrappers; reopening observes reservation', async () => {
  const values = new Map(), failure = new Error('durable commit receipt lost')
  const handle = { get(k) { return values.get(k) }, async put(k, v) { values.set(k, v); throw failure }, async update(k, fn) { const v = fn(values.get(k)); values.set(k, v); return v } }
  const storage = createDomainResourceStorage(handle), f = fixture({ storage })
  await assert.rejects(f.resources.create('A', spec('uncertain')), failure)
  await assert.rejects(createDomainResourceStorage(handle).read(), e => e.code === 'storage-uncertain')
  const fresh = createDomainResourceStorage({ ...handle, async put(k, v) { values.set(k, v) } }), g = fixture({ storage: fresh })
  assert.equal((await g.program.recover()).resources[0].status, 'quarantined')
  assert.equal(g.removed.length, 0)
  assert.equal(parseResourceDocument(await fresh.read()).revision, 2)
})
