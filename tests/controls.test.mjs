import assert from 'node:assert/strict'
import { test } from 'node:test'
import { WorkspaceControls, MemoryControlsStorage, ControlsError, INITIAL_POLICY, INITIAL_DOCUMENT,
  parsePolicyIntent, parseControlsDocument, resolvePolicy, createDomainControlsStorage } from '../lib/controls/index.js'

const denied = new Error('existing host access denied')
const code = value => error => error instanceof ControlsError && error.code === value
const enabled = overrides => ({ extensionEnabled: true, defaults: { workspace: { enabled: true },
  binding: { enabled: true }, windows: { enabled: true, ticketWindowSize: 3, runningSubagentLimit: 2 },
}, workspaceOverrides: overrides ?? {} })

function fixture(storage = new MemoryControlsStorage()) {
  const identities = new Map([
    ['A', { kind: 'owner', controlWorkspaceId: 'W' }], ['B', { kind: 'owner', controlWorkspaceId: 'W' }],
    ['C', { kind: 'owner', controlWorkspaceId: 'other' }],
    ['child', { kind: 'managed-child', parentSessionId: 'A' }],
    ['nested', { kind: 'managed-child', parentSessionId: 'child' }],
  ])
  const workspaces = new Set(['W', 'other'])
  const calls = []
  const authority = {
    async authorizePolicy(principal, access) { calls.push(['policy', principal, access]); if (principal !== 'host') throw denied },
    async authorizeSession(principal, session, access) {
      calls.push(['session', principal, session, access])
      if (principal !== 'host' && principal !== session) throw denied
    },
    async resolveSession(session) { return identities.get(session) },
    async verifyWorkspace(workspace) { return workspaces.has(workspace) },
  }
  let counter = 0
  const make = () => new WorkspaceControls(storage, authority, () => 'instance-' + ++counter)
  return { storage, authority, identities, workspaces, calls, make, core: make() }
}

test('safe installation: functionality off, accepted display defaults, no invented capacities', () => {
  const policy = resolvePolicy(INITIAL_POLICY, 'W', true)
  assert.equal(policy.extensionEnabled, false)
  assert(Object.values(policy.features).every(row => row.status === 'disabled' && !row.requested))
  assert.deepEqual(policy.windows, { ticketWindowSize: null, runningSubagentLimit: null })
  assert.deepEqual(policy.display, { header: true, inputSummary: false, rightPanel: true, sessionList: false, timeline: true })
  assert(Object.isFrozen(policy.sources))
})

test('sparse nested overrides resolve per leaf with false and independent display switches', () => {
  const policy = resolvePolicy({ ...enabled({ W: { binding: { enabled: false }, windows: { ticketWindowSize: 1 },
    display: { header: false, inputSummary: true } } }), revision: 4 }, 'W', true)
  assert.equal(policy.features.binding.requested, false)
  assert.equal(policy.features.windows.status, 'configured')
  assert.deepEqual(policy.windows, { ticketWindowSize: 1, runningSubagentLimit: 2 })
  assert.equal(policy.sources['windows.ticketWindowSize'], 'workspace')
  assert.equal(policy.sources['windows.runningSubagentLimit'], 'global')
  assert.equal(policy.sources['display.rightPanel'], 'safe-initial')
  assert.equal(policy.display.inputSummary, true)
  assert.equal(policy.display.header, false)
})

test('unknown workspace cannot activate controls and missing capacities are not unlimited', () => {
  const policy = resolvePolicy({ ...enabled(), revision: 1 }, 'unregistered', false)
  assert.equal(policy.features.binding.status, 'unsupported')
  assert.equal(policy.features.binding.reason, 'workspace-unverified')
  const unset = resolvePolicy({ revision: 1, extensionEnabled: true, defaults: { workspace: { enabled: true }, windows: { enabled: true } }, workspaceOverrides: {} }, 'W', true)
  assert.equal(unset.features.windows.reason, 'window-capacity-unset')
  assert.equal(unset.windows.ticketWindowSize, null)
})

test('strict config rejects invalid capacities, undeclared fields and inherited/class values', () => {
  for (const value of [0, -1, 1.5, NaN, Infinity, '2', null, undefined, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => parsePolicyIntent(enabled({ W: { windows: { ticketWindowSize: value } } })), code('invalid-input'))
  }
  assert.throws(() => parsePolicyIntent({ ...enabled(), defaults: { windows: { enabled: 'yes' } } }), code('invalid-input'))
  assert.throws(() => parsePolicyIntent({ ...enabled(), workspaceId: 'W' }), /unknown key/)
  assert.throws(() => parsePolicyIntent({ ...enabled(), defaults: { windows: { unknown: true } } }), /unknown key/)
  assert.throws(() => parsePolicyIntent({ ...enabled(), defaults: Object.create({ binding: { enabled: true } }) }), /plain object/)
})

test('opaque reserved workspace keys do not use object prototypes', () => {
  const intent = parsePolicyIntent({ ...enabled(), workspaceOverrides: JSON.parse('{"__proto__":{"binding":{"enabled":false}},"constructor":{"windows":{"ticketWindowSize":1}}}') })
  assert.equal(resolvePolicy({ ...intent, revision: 1 }, '__proto__', true).features.binding.requested, false)
  assert.equal(resolvePolicy({ ...intent, revision: 1 }, 'constructor', true).windows.ticketWindowSize, 1)
  assert.equal(resolvePolicy({ ...intent, revision: 1 }, 'toString', true).windows.ticketWindowSize, 3)
})

test('draft is detached; explicit save and removal restore inheritance; no-op keeps revision', async () => {
  const f = fixture()
  const draft = enabled({ W: { binding: { enabled: false } } })
  parsePolicyIntent(draft)
  assert.deepEqual(await f.core.readPolicy('host'), INITIAL_POLICY)
  const pending = f.core.savePolicy('host', draft, 0)
  draft.defaults.windows.ticketWindowSize = 99
  const saved = await pending
  assert.equal(saved.defaults.windows.ticketWindowSize, 3)
  assert.equal(saved.revision, 1)
  assert.throws(() => { saved.defaults.windows.ticketWindowSize = 100 }, TypeError)
  const inherited = await f.core.savePolicy('host', enabled({ W: { binding: {} } }), 1)
  assert.deepEqual(inherited.workspaceOverrides, {})
  assert.equal(resolvePolicy(inherited, 'W', true).features.binding.requested, true)
  assert.equal((await f.core.savePolicy('host', enabled(), 2)).revision, 2)
  await assert.rejects(f.core.savePolicy('host', enabled(), 1), code('revision-conflict'))
})

test('concurrent saves with the same policy revision have one winner; no automatic overwrite', async () => {
  const f = fixture()
  const results = await Promise.allSettled([
    f.core.savePolicy('host', enabled(), 0),
    f.make().savePolicy('host', enabled({ W: { binding: { enabled: false } } }), 0),
  ])
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 1)
  assert.equal(results.find(row => row.status === 'rejected').reason.code, 'revision-conflict')
  assert.equal((await f.core.readPolicy('host')).revision, 1)
})

test('session bookkeeping does not invalidate a policy draft or lose a concurrent save', async () => {
  const f = fixture()
  await Promise.all([f.core.ensureSession('host', 'A'), f.make().savePolicy('host', enabled(), 0)])
  const doc = await f.storage.read()
  assert.equal(doc.revision, 2)
  assert.equal(doc.policy.revision, 1)
  assert.equal(doc.instances.length, 1)
  await f.core.ensureSession('host', 'B')
  assert.equal((await f.core.readPolicy('host')).revision, 1)
  await f.core.savePolicy('host', enabled({ W: { binding: { enabled: false } } }), 1)
})

test('same-workspace independent owners and new/fork sessions get distinct stable instances', async () => {
  const f = fixture()
  f.identities.set('fork', { kind: 'owner', controlWorkspaceId: 'W' })
  const views = await Promise.all(['A', 'B', 'fork'].map(session => f.make().ensureSession('host', session)))
  assert.equal(new Set(views.map(view => view.instance.instrumentInstanceId)).size, 3)
  assert(views.every(view => view.instance.controlWorkspaceId === 'W'))
  assert.equal((await f.storage.read()).policy.revision, 0)
})

test('nested managed descendants atomically share root instance and original control workspace', async () => {
  const f = fixture()
  const nested = await f.core.ensureSession('host', 'nested')
  const owner = await f.core.readSession('host', 'A')
  const child = await f.core.readSession('host', 'child')
  assert.deepEqual(nested.instance, owner.instance)
  assert.deepEqual(child.instance, owner.instance)
  const doc = await f.storage.read()
  assert.equal(doc.revision, 1)
  assert.equal(doc.instances.length, 1)
  assert.equal(doc.associations.length, 3)
  assert.equal(nested.association.parentSessionId, 'child')
})

test('concurrent repeated ensure and a reconstructed manager do not allocate another instance', async () => {
  const f = fixture()
  const views = await Promise.all(Array.from({ length: 12 }, () => f.make().ensureSession('host', 'nested')))
  assert.equal(new Set(views.map(view => view.instance.instrumentInstanceId)).size, 1)
  const before = await f.storage.read()
  assert.deepEqual((await f.make().ensureSession('host', 'nested')).instance, views[0].instance)
  assert.deepEqual(await f.storage.read(), before)
})

test('different owner concurrent registration retains all associations', async () => {
  const f = fixture()
  for (let i = 0; i < 16; i++) f.identities.set('owner' + i, { kind: 'owner', controlWorkspaceId: 'W' })
  await Promise.all(Array.from({ length: 16 }, (_, i) => f.make().ensureSession('host', 'owner' + i)))
  const doc = await f.storage.read()
  assert.equal(doc.instances.length, 16)
  assert.equal(doc.associations.length, 16)
  assert.equal(doc.revision, 16)
})

test('policy hot changes update projections without changing instance identities or merging sessions', async () => {
  const f = fixture()
  const a = await f.core.ensureSession('host', 'A')
  const b = await f.core.ensureSession('host', 'B')
  await f.core.ensureSession('host', 'C')
  await f.core.savePolicy('host', enabled({ other: { windows: { ticketWindowSize: 1 } } }), 0)
  assert.deepEqual((await f.core.readSession('host', 'A')).instance, a.instance)
  assert.deepEqual((await f.core.readSession('host', 'B')).instance, b.instance)
  assert.equal((await f.core.readSession('host', 'A')).policy.windows.ticketWindowSize, 3)
  assert.equal((await f.core.readSession('host', 'C')).policy.windows.ticketWindowSize, 1)
  await f.core.savePolicy('host', { ...enabled(), extensionEnabled: false, defaults: { display: { header: false } } }, 1)
  assert.equal((await f.core.readSession('host', 'A')).policy.display.header, false)
  assert.equal((await f.storage.read()).instances.length, 3)
})

test('authority is mandatory; unauthorized configuration and foreign session selection fail without writes', async () => {
  const f = fixture()
  await assert.rejects(f.core.savePolicy('A', enabled(), 0), error => error === denied)
  await assert.rejects(f.core.readPolicy('A'), error => error === denied)
  await assert.rejects(f.core.ensureSession('B', 'A'), error => error === denied)
  await assert.rejects(f.core.readSession('B', 'A'), error => error === denied)
  assert.equal(await f.storage.read(), undefined)
})

test('missing caller/identity/parent and unregistered reads cannot create implicit owners', async () => {
  const f = fixture()
  await assert.rejects(f.core.ensureSession('', 'A'), code('invalid-input'))
  await assert.rejects(f.core.ensureSession('host', 'unknown'), code('unknown-session'))
  f.identities.delete('A')
  await assert.rejects(f.core.ensureSession('host', 'child'), code('unknown-session'))
  assert.equal(await f.storage.read(), undefined)
  await assert.rejects(f.core.readSession('host', 'B'), code('unknown-session'))
})

test('cycles, role changes, reparenting and workspace identity drift are rejected, not rebound', async () => {
  const f = fixture()
  const before = await f.core.ensureSession('host', 'child')
  f.identities.set('child', { kind: 'managed-child', parentSessionId: 'B' })
  await assert.rejects(f.core.ensureSession('host', 'child'), code('association-conflict'))
  f.identities.set('child', { kind: 'owner', controlWorkspaceId: 'W' })
  await assert.rejects(f.core.readSession('host', 'child'), code('association-conflict'))
  f.identities.set('child', { kind: 'managed-child', parentSessionId: 'A' })
  f.identities.set('A', { kind: 'owner', controlWorkspaceId: 'other' })
  await assert.rejects(f.core.ensureSession('host', 'child'), code('association-conflict'))
  f.identities.set('A', { kind: 'managed-child', parentSessionId: 'child' })
  await assert.rejects(f.core.ensureSession('host', 'child'), code('association-conflict'))
  assert.equal((await f.storage.read()).revision, before.documentRevision)
})

test('workspace loss preserves retained ownership but disables new-work eligibility; no path fallback', async () => {
  const f = fixture()
  await f.core.savePolicy('host', enabled(), 0)
  const before = await f.core.ensureSession('host', 'A')
  f.workspaces.delete('W')
  const restored = await f.make().ensureSession('host', 'A')
  assert.deepEqual(restored.instance, before.instance)
  assert.equal(restored.policy.features.binding.reason, 'workspace-unverified')
  await assert.rejects(f.core.ensureSession('host', 'B'), code('unknown-workspace'))
})

test('malformed/unknown version state and inconsistent indexes never reset to empty', async () => {
  const f = fixture()
  await f.core.ensureSession('host', 'nested')
  const good = await f.storage.read()
  const mutations = [doc => { doc.schemaVersion = 2 }, doc => { doc.revision = -1 },
    doc => { doc.policy.revision = doc.revision + 1 }, doc => { doc.instances.push(doc.instances[0]) },
    doc => { doc.associations = doc.associations.filter(row => row.sessionId !== 'child') }, doc => { doc.associations[0].instrumentInstanceId = 'foreign' },
    doc => { doc.associations.find(row => row.sessionId === 'child').parentSessionId = 'nested' },
    doc => { doc.associations.find(row => row.sessionId === 'A').parentSessionId = 'child' }]
  for (const mutate of mutations) {
    const broken = structuredClone(good)
    mutate(broken)
    assert.throws(() => parseControlsDocument(broken), code('invalid-state'))
    const core = new WorkspaceControls({ async read() { return broken }, async compareAndSwap() { assert.fail('must not write corrupt state') } }, f.authority)
    await assert.rejects(core.readPolicy('host'), code('invalid-state'))
  }
})

test('memory storage snapshots cannot be mutated through caller-owned seeds or returned values', async () => {
  const seed = structuredClone(INITIAL_DOCUMENT)
  const storage = new MemoryControlsStorage(seed)
  seed.revision = 5
  assert.equal((await storage.read()).revision, 0)
  assert.throws(() => { (INITIAL_DOCUMENT.instances).push({}) }, TypeError)
  assert.equal(await storage.compareAndSwap(0, { ...INITIAL_DOCUMENT, revision: 1 }), true)
  assert.equal(await storage.compareAndSwap(0, { ...INITIAL_DOCUMENT, revision: 1 }), false)
  await assert.rejects(storage.compareAndSwap(1, { ...INITIAL_DOCUMENT, revision: 3 }), code('invalid-input'))
})

test('revision overflow and instance-id collision fail without overwriting retained state', async () => {
  const storage = new MemoryControlsStorage({ ...INITIAL_DOCUMENT, revision: Number.MAX_SAFE_INTEGER })
  const f = fixture(storage)
  await assert.rejects(f.core.savePolicy('host', enabled(), 0), code('invalid-input'))
  const g = fixture()
  const first = await g.core.ensureSession('host', 'A')
  const collision = new WorkspaceControls(g.storage, g.authority, () => first.instance.instrumentInstanceId)
  await assert.rejects(collision.ensureSession('host', 'B'), code('association-conflict'))
  assert.equal((await g.storage.read()).instances.length, 1)
})

test('bounded CAS contention returns a mechanical retry diagnosis instead of claiming a save', async () => {
  let attempts = 0
  const f = fixture({ async read() { return undefined }, async compareAndSwap() { attempts++; return false } })
  await assert.rejects(f.core.savePolicy('host', enabled(), 0), code('concurrent-update'))
  assert.equal(attempts, 32)
})

test('domain adapter latches indeterminate write failure, including first creation', async () => {
  let value
  const failure = new Error('durability receipt unavailable after write')
  const table = {
    get() { return value },
    async put(_key, next) { value = next; throw failure },
    async update(_key, transform) { value = transform(value); throw failure },
  }
  const storage = createDomainControlsStorage(table)
  assert.equal(createDomainControlsStorage(table), storage)
  const f = fixture(storage)
  await assert.rejects(f.core.ensureSession('host', 'child'), error => error === failure)
  await assert.rejects(f.core.readPolicy('host'), code('storage-uncertain'))
  await assert.rejects(f.core.ensureSession('host', 'B'), code('storage-uncertain'))
  assert.equal(value.instances.length, 1)
  assert.equal(value.associations.length, 2)
  // A new host domain handle reconciles the actually committed record.
  const reopened = fixture(new MemoryControlsStorage(value))
  assert.equal((await reopened.core.ensureSession('host', 'child')).instance.ownerSessionId, 'A')
  assert.equal((await reopened.storage.read()).revision, 1)
})
