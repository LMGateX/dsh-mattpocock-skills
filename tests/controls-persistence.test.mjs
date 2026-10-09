import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { mkdtemp, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'
import { WorkspaceControls, createDomainControlsStorage, parseControlsDocument } from '../lib/controls/index.js'

// Opt-in, source-only host probe. No machine-specific path in the shipped runtime.
// Missing host does NOT silently substitute a mock or count as integration success.
const hostRoot = process.env.DSH_CONTROLS_HOST_ROOT
const options = { skip: hostRoot ? false : 'set DSH_CONTROLS_HOST_ROOT to run the installed-host integration' }
let host
if (hostRoot) {
  assert(isAbsolute(hostRoot), 'host root must be absolute')
  const load = path => import(pathToFileURL(join(hostRoot, 'node_modules', ...path)).href)
  const domain = await load(['@deepseek-ai', 'dsh-storage-domain', 'lib', 'index.js'])
  const json = await load(['@deepseek-ai', 'dsh-storage-json', 'lib', 'index.js'])
  const { z } = await load(['zod', 'index.js'])
  // The inspected storage contract must match whichever installed host is under test;
  // pinning a literal build number would restate the calendar, not the contract.
  const hostVersion = JSON.parse(await readFile(join(hostRoot, 'package.json'), 'utf8')).version
  for (const name of ['dsh-storage-domain', 'dsh-storage-json']) {
    const pkg = JSON.parse(await readFile(join(hostRoot, 'node_modules', '@deepseek-ai', name, 'package.json'), 'utf8'))
    assert.equal(pkg.version, hostVersion, 'storage probe matches the inspected host build')
  }
  host = { ...domain, ...json, z }
}

async function fixture(t) {
  const temporary = await mkdtemp(join(tmpdir(), 'dsh-controls-'))
  const root = join(temporary, 'storage')
  const events = []
  const identities = new Map([
    ['A', { kind: 'owner', controlWorkspaceId: 'W' }], ['B', { kind: 'owner', controlWorkspaceId: 'W' }],
    ['child', { kind: 'managed-child', parentSessionId: 'A' }],
    ['nested', { kind: 'managed-child', parentSessionId: 'child' }],
  ])
  const authority = {
    async authorizePolicy(principal) { assert.equal(principal, 'host') },
    async authorizeSession(principal) { assert.equal(principal, 'host') },
    async resolveSession(session) { return identities.get(session) },
    async verifyWorkspace(workspace) { return workspace === 'W' },
  }
  const spec = host.defineDomain({ name: 'mattpocock_controls', version: 1, layout: 'single',
    tables: { controls: host.domainTable(host.z.unknown().transform(parseControlsDocument)) } })
  let backend, facility, domain
  const open = async () => {
    await facility?.closeAll()
    await backend?.close()
    backend = new host.JsonStorageBackend(root)
    facility = new host.DomainFacility({ storage: { backend: { get(name) { assert.equal(name, 'json'); return backend } } },
      emit(name, value) { events.push({ name, value }) }, logger: { warn() {}, error() {} } }, { backend: 'json' })
    domain = await facility.open(spec)
    const table = domain.table('controls')
    const storage = createDomainControlsStorage(table)
    return { core: new WorkspaceControls(storage, authority), table, storage }
  }
  t.after(async () => {
    try { await facility?.closeAll() }
    finally {
      try { await backend?.close() }
      finally {
        assert(isAbsolute(temporary) && basename(temporary).startsWith('dsh-controls-'))
        await rm(temporary, { recursive: true, force: true })
      }
    }
  })
  return { root, temporary, events, authority, open, async close() { await facility?.closeAll(); await backend?.close() } }
}
const intent = { extensionEnabled: true, defaults: { workspace: { enabled: true }, windows: { enabled: true, ticketWindowSize: 3, runningSubagentLimit: 2 } },
  workspaceOverrides: { W: { display: { header: false } } } }

test('actual DSH domain/JSON storage restores stable owners, nested children and policy after reopen', options, async t => {
  const f = await fixture(t)
  let state = await f.open()
  await state.core.savePolicy('host', intent, 0)
  const [child, b] = await Promise.all([state.core.ensureSession('host', 'nested'), state.core.ensureSession('host', 'B')])
  const before = await state.storage.read()
  assert.equal(before.instances.length, 2)
  assert.equal(before.associations.length, 4)
  assert.notEqual(child.instance.instrumentInstanceId, b.instance.instrumentInstanceId)
  state = await f.open() // new backend, facility and domain; reads the disk, not a cached manager
  assert.deepEqual(await state.storage.read(), before)
  assert.deepEqual((await state.core.ensureSession('host', 'nested')).instance, child.instance)
  assert.deepEqual((await state.core.readSession('host', 'B')).instance, b.instance)
  assert.equal((await state.core.readPolicy('host')).revision, 1)
  assert.equal((await state.core.readSession('host', 'child')).policy.display.header, false)
  assert.deepEqual(await state.storage.read(), before)
})

test('actual new process restores retained child ownership without allocating a new instance', options, async t => {
  const f = await fixture(t)
  const state = await f.open()
  await state.core.savePolicy('host', intent, 0)
  const child = await state.core.ensureSession('host', 'child')
  const before = await state.storage.read()
  await f.close()
  const output = execFileSync(process.execPath, [fileURLToPath(new URL('./fixtures/controls-restart.mjs', import.meta.url)), hostRoot, f.root], { encoding: 'utf8' })
  const restored = JSON.parse(output)
  assert.deepEqual(restored.instance, child.instance)
  assert.equal(restored.documentRevision, before.revision)
  assert.equal(restored.policy.configurationRevision, 1)
  assert.deepEqual(await (await f.open()).storage.read(), before)
})

test('actual domain CAS: simultaneous managers do not duplicate owners or overwrite stale policy saves', options, async t => {
  const f = await fixture(t)
  const state = await f.open()
  const second = new WorkspaceControls(createDomainControlsStorage(state.table), f.authority)
  const views = await Promise.all([state.core.ensureSession('host', 'nested'), second.ensureSession('host', 'nested'), second.ensureSession('host', 'B')])
  assert.deepEqual(views[0].instance, views[1].instance)
  const results = await Promise.allSettled([state.core.savePolicy('host', intent, 0), second.savePolicy('host', { ...intent, extensionEnabled: false }, 0)])
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 1)
  assert.equal(results.find(row => row.status === 'rejected').reason.code, 'revision-conflict')
  const before = await state.storage.read()
  const reopened = await f.open()
  assert.deepEqual(await reopened.storage.read(), before)
  assert.equal(before.instances.length, 2)
})

test('actual JSON pre-publication I/O failure publishes nothing; core stays unknown until reopening', options, async t => {
  const f = await fixture(t)
  let state = await f.open()
  const a = await state.core.ensureSession('host', 'A')
  const before = await state.storage.read()
  const bytes = await readFile(join(f.root, 'mattpocock_controls.json'))
  const count = f.events.length
  const saved = join(f.temporary, 'saved')
  await rename(f.root, saved)
  try {
    await writeFile(f.root, 'not a directory')
    await assert.rejects(state.core.savePolicy('host', intent, 0), error => error.code === 'ENOTDIR')
    assert.deepEqual(state.table.get('state'), before)
    assert.equal(f.events.length, count)
    await assert.rejects(state.core.readPolicy('host'), error => error.code === 'storage-uncertain')
    await assert.rejects(state.core.ensureSession('host', 'B'), error => error.code === 'storage-uncertain')
  } finally {
    await unlink(f.root)
    await rename(saved, f.root)
  }
  assert(bytes.equals(await readFile(join(f.root, 'mattpocock_controls.json'))))
  state = await f.open()
  assert.deepEqual(await state.storage.read(), before)
  assert.deepEqual((await state.core.readSession('host', 'A')).instance, a.instance)
  await state.core.savePolicy('host', intent, 0)
  state = await f.open()
  assert.equal((await state.core.readPolicy('host')).revision, 1)
})

test('actual durable write with missing receipt is reconciled on reopen, not blindly retried', options, async t => {
  const f = await fixture(t)
  let state = await f.open()
  await state.core.ensureSession('host', 'A')
  const failure = new Error('simulated caller receipt failure AFTER actual durable table.update')
  const wrapped = { get: key => state.table.get(key), put: (...args) => state.table.put(...args),
    async update(...args) { await state.table.update(...args); throw failure } }
  const core = new WorkspaceControls(createDomainControlsStorage(wrapped), f.authority)
  await assert.rejects(core.savePolicy('host', intent, 0), error => error === failure)
  await assert.rejects(core.savePolicy('host', intent, 0), error => error.code === 'storage-uncertain')
  state = await f.open()
  assert.equal((await state.core.readPolicy('host')).revision, 1)
  await assert.rejects(state.core.savePolicy('host', intent, 0), error => error.code === 'revision-conflict')
  assert.equal((await state.core.savePolicy('host', intent, 1)).revision, 1)
})

test('actual domain reopening rejects invalid persisted schema instead of initializing an empty ledger', options, async t => {
  const f = await fixture(t)
  const state = await f.open()
  await state.core.ensureSession('host', 'A')
  // Deliberate fixture corruption: host tables do not validate schemas at write-time.
  await state.table.put('state', { ...await state.storage.read(), schemaVersion: 99 })
  await assert.rejects(f.open(), error => error.code === 'invalid-record')
})
