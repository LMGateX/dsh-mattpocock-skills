import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'
const buildRoot = process.env.STARTUP_TEST_BUILD_ROOT ?? new URL('../lib/', import.meta.url).href
const { StartupSupport } = await import(new URL('controls/startup-support.js', buildRoot))
const { parseStartupDesired, parseStartupDocument, parseStartupStatus, parseStartupObservation } = await import(new URL('controls/startup-state.js', buildRoot))
const { MemoryVersionedStorage, createDomainVersionedStorage } = await import(new URL('controls/versioned-storage.js', buildRoot))

const ready = { status: 'ready', sdkVersion: '0.2.1-alpha.1', diagnostic: null }
const observe = async () => ({ nativeInitialCwdSupported: true, preparation: ready })

// Pre-agreed public seams: StartupSupport + codecs, and actual native DomainFacility.
test('startup cwd support defaults off even on a natively capable process', async () => {
  const storage = new MemoryVersionedStorage(parseStartupDocument)
  const core = new StartupSupport(storage, { epoch: 'process-A' }, observe)
  const status = await core.readStatus()
  assert.deepEqual(status.desired, { startupCwdEnabled: false })
  assert.equal(status.enabledNow, false)
  assert.equal(status.state, 'disabled')
  assert.equal(status.restartNeeded, false)
  assert.equal(status.boot.epoch, 'process-A')
  assert.deepEqual(status.boot.requested, { startupCwdEnabled: false })
})

test('explicit save changes next boot only and another process cannot replace an older epoch latch', async () => {
  const storage = new MemoryVersionedStorage(parseStartupDocument)
  const a = new StartupSupport(storage, { epoch: 'process-A' }, observe)
  const initial = await a.readStatus()
  const saved = await a.save({ startupCwdEnabled: true }, initial.revision)
  assert.equal(saved.enabledNow, false)
  assert.equal(saved.restartNeeded, true)
  assert.equal(saved.state, 'pending-restart')
  const b = new StartupSupport(storage, { epoch: 'process-B' }, observe)
  const restarted = await b.readStatus()
  assert.equal(restarted.enabledNow, true)
  assert.equal(restarted.restartNeeded, false)
  const countersetting = await b.save({ startupCwdEnabled: false }, restarted.revision)
  assert.equal(countersetting.enabledNow, true)
  assert.equal(countersetting.restartNeeded, true)
  const remountedA = new StartupSupport(storage, { epoch: 'process-A' }, observe)
  const retained = await remountedA.readStatus()
  assert.equal(retained.enabledNow, false)
  assert.equal(retained.restartNeeded, false)
  assert.equal(retained.revision, countersetting.revision)
  assert.deepEqual((await storage.read()).bootReceipts, [
    { epoch: 'process-A', requested: { startupCwdEnabled: false } },
    { epoch: 'process-B', requested: { startupCwdEnabled: true } },
  ])
  await assert.rejects(a.save({ startupCwdEnabled: true }, initial.revision), { code: 'revision-conflict' })
})

test('loaded capability is the current truth and preparation errors never masquerade as restart alone', async () => {
  const cases = [
    [true, true, false, 'not-prepared', false, false, 'needs-preparation'],
    [true, true, false, 'ready', false, true, 'pending-restart'],
    [true, true, null, 'ready', null, false, 'uncertain'],
    [true, true, true, 'not-prepared', true, false, 'enabled'],
    [true, true, true, 'failed', true, false, 'enabled'],
    [false, true, false, 'failed', false, true, 'failed'],
    [false, true, false, 'incompatible', false, true, 'incompatible'],
    [false, true, false, 'uncertain', false, true, 'uncertain'],
    [false, false, false, 'failed', false, false, 'disabled'],
    [false, true, false, 'not-prepared', false, true, 'needs-preparation'],
  ]
  for (const [bootOn, desiredOn, native, preparationStatus, enabled, restart, state] of cases) {
    const storage = new MemoryVersionedStorage(parseStartupDocument, {
      schemaVersion: 1, revision: 3, desired: { startupCwdEnabled: desiredOn },
      bootReceipts: [{ epoch: 'process-A', requested: { startupCwdEnabled: bootOn } }],
    })
    const core = new StartupSupport(storage, { epoch: 'process-A' }, async () => ({
      nativeInitialCwdSupported: native, preparation: { ...ready, status: preparationStatus, diagnostic: 'inspection detail' },
    }))
    const actual = await core.readStatus()
    assert.equal(actual.enabledNow, enabled, JSON.stringify(cases))
    assert.equal(actual.restartNeeded, restart)
    assert.equal(actual.state, state)
    assert.deepEqual(parseStartupStatus(JSON.parse(JSON.stringify(actual))), actual)
    assert.throws(() => parseStartupStatus({ ...actual, unexpected: true }), { code: 'invalid-input' })
  }
})

test('an unavailable SDK root is unsupported rather than preparation or restart alone', async () => {
  const storage = new MemoryVersionedStorage(parseStartupDocument)
  const core = new StartupSupport(storage, { epoch: 'process-A' }, async () => ({
    nativeInitialCwdSupported: false,
    preparation: { status: 'not-prepared', sdkVersion: null, diagnostic: 'SDK root unavailable' },
  }))
  const saved = await core.save({ startupCwdEnabled: true }, 0)
  assert.equal(saved.state, 'unsupported')
  assert.equal(saved.restartNeeded, true)
  const restarted = await new StartupSupport(storage, { epoch: 'process-B' }, async () => ({
    nativeInitialCwdSupported: false,
    preparation: { status: 'not-prepared', sdkVersion: null, diagnostic: 'SDK root unavailable' },
  })).readStatus()
  assert.equal(restarted.state, 'unsupported')
  assert.equal(restarted.restartNeeded, false)
})

test('save before first read latches the old request and concurrent stale saves conflict', async () => {
  const storage = new MemoryVersionedStorage(parseStartupDocument)
  const core = new StartupSupport(storage, { epoch: 'process-A' }, observe)
  const saved = await core.save({ startupCwdEnabled: true }, 0)
  assert.equal(saved.enabledNow, false)
  assert.equal(saved.revision, 1)
  const unchanged = await core.save({ startupCwdEnabled: true }, saved.revision)
  assert.equal(unchanged.revision, 1)
  const results = await Promise.allSettled([
    core.save({ startupCwdEnabled: false }, 1), core.save({ startupCwdEnabled: false }, 1),
  ])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'revision-conflict')
})

test('read refreshes getter and preparation but does not refresh the boot request', async () => {
  const storage = new MemoryVersionedStorage(parseStartupDocument, {
    schemaVersion: 1, revision: 1, desired: { startupCwdEnabled: true }, bootReceipts: [],
  })
  let native = false
  let preparation = { ...ready, status: 'not-prepared' }
  const core = new StartupSupport(storage, { epoch: 'process-A' }, async () => ({ nativeInitialCwdSupported: native, preparation }))
  assert.equal((await core.readStatus()).state, 'needs-preparation')
  preparation = ready
  const prepared = await core.readStatus()
  assert.equal(prepared.state, 'pending-restart')
  assert.equal(prepared.enabledNow, false)
  native = true
  assert.equal((await core.readStatus()).enabledNow, true)
})

test('read and save forward the exact signal to an active SDK inspection and abort without desired CAS', async () => {
  for (const operation of ['readStatus', 'save']) {
    const storage = new MemoryVersionedStorage(parseStartupDocument, {
      schemaVersion: 1, revision: 1, desired: { startupCwdEnabled: false },
      bootReceipts: [{ epoch: 'process-A', requested: { startupCwdEnabled: false } }],
    })
    const controller = new AbortController()
    const entered = Promise.withResolvers()
    const observedSignals = []
    const core = new StartupSupport({
      read: () => storage.read(),
      async compareAndSwap() { assert.fail('aborted inspection must not submit desired CAS') },
    }, { epoch: 'process-A' }, async signal => {
      observedSignals.push(signal)
      entered.resolve()
      assert.equal(signal, controller.signal, 'the actual SDK inspection must receive the caller signal')
      await new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      })
      assert.fail('inspection cannot complete after abort')
    })
    const pending = operation === 'readStatus' ? core.readStatus(controller.signal)
      : core.save({ startupCwdEnabled: true }, 1, controller.signal)
    const rejected = assert.rejects(pending, { name: 'AbortError' })
    await entered.promise
    controller.abort()
    await rejected
    assert.equal(observedSignals[0], controller.signal)
    assert.equal((await storage.read()).desired.startupCwdEnabled, false)
    assert.equal((await storage.read()).revision, 1)
  }
})

test('abort before CAS leaves desired untouched but abort after CAS starts preserves the actual acknowledgement', async () => {
  const storage = new MemoryVersionedStorage(parseStartupDocument)
  const before = new AbortController()
  const aborted = new StartupSupport(storage, { epoch: 'process-A' }, async () => { before.abort(); return observe() })
  await assert.rejects(aborted.save({ startupCwdEnabled: true }, 0, before.signal), { name: 'AbortError' })
  assert.equal(await storage.read(), undefined)
  const after = new AbortController()
  const core = new StartupSupport({
    read: () => storage.read(),
    async compareAndSwap(rev, doc) { after.abort(); return storage.compareAndSwap(rev, doc) },
  }, { epoch: 'process-A' }, observe)
  const acknowledged = await core.save({ startupCwdEnabled: true }, 0, after.signal)
  assert.equal(acknowledged.desired.startupCwdEnabled, true)
  assert.equal(acknowledged.boot.requested.startupCwdEnabled, false)
  const error = new Error('durable acknowledgement was lost')
  const failure = new StartupSupport({ read: () => storage.read(), async compareAndSwap() { throw error } }, { epoch: 'process-A' }, observe)
  await assert.rejects(failure.save({ startupCwdEnabled: false }, 1), actual => actual === error)
})

test('malformed durable documents fail closed and operator payloads cannot author boot receipts or other settings', async () => {
  for (const bad of [null, {}, { schemaVersion: 7 }, { schemaVersion: 1, revision: 0, desired: { startupCwdEnabled: false }, bootReceipts: [null] }]) {
    const core = new StartupSupport({ read: async () => bad, async compareAndSwap() { assert.fail('must not write corrupted state') } }, { epoch: 'process-A' }, observe)
    await assert.rejects(core.readStatus(), { code: 'invalid-state' })
  }
  for (const bad of [{ startupCwdEnabled: true, epoch: 'fake' }, { startupCwdEnabled: true, bootReceipts: [] }, { startupCwdEnabled: 1 }, { startupCwdEnabled: false, extensionEnabled: true }]) {
    assert.throws(() => parseStartupDesired(bad), { code: 'invalid-input' })
  }
  assert.throws(() => parseStartupObservation({ nativeInitialCwdSupported: undefined, preparation: ready }), { code: 'invalid-input' })
})

// Sequential reopen/new-process verification only: the native JSON adapter does
// not claim cross-process concurrent CAS safety.
async function openNativeStartup(hostRoot, storageRoot, compiledRoot) {
  const { pathToFileURL } = await import('node:url')
  const { join } = await import('node:path')
  const load = path => import(pathToFileURL(join(hostRoot, 'node_modules', ...path)).href)
  const { DomainFacility, defineDomain, domainTable } = await load(['@deepseek-ai', 'dsh-storage-domain', 'lib', 'index.js'])
  const { JsonStorageBackend } = await load(['@deepseek-ai', 'dsh-storage-json', 'lib', 'index.js'])
  const { z } = await load(['zod', 'index.js'])
  const { StartupSupport } = await import(new URL('controls/startup-support.js', compiledRoot))
  const { parseStartupDocument } = await import(new URL('controls/startup-state.js', compiledRoot))
  const { createDomainVersionedStorage } = await import(new URL('controls/versioned-storage.js', compiledRoot))
  const backend = new JsonStorageBackend(storageRoot)
  const facility = new DomainFacility({ storage: { backend: { get() { return backend } } },
    emit() {}, logger: { warn() {}, error() {} } }, { backend: 'json' })
  const spec = defineDomain({ name: 'mattpocock_startupcwd', version: 1, layout: 'single',
    tables: { startup: domainTable(z.unknown().transform(parseStartupDocument)) } })
  const domain = await facility.open(spec)
  const storage = createDomainVersionedStorage(domain.table('startup'), 'state', parseStartupDocument)
  return { storage,
    core(epoch) { return new StartupSupport(storage, { epoch }, async () => ({ nativeInitialCwdSupported: true,
      preparation: { status: 'ready', sdkVersion: '0.2.1-alpha.1', diagnostic: null } })) },
    async close() { try { await facility.closeAll() } finally { await backend.close() } },
  }
}

test('actual native DomainFacility preserves same-epoch receipts across reopen and a second Node epoch', {
  skip: process.env.DSH_CONTROLS_HOST_ROOT ? false : 'set DSH_CONTROLS_HOST_ROOT for actual native storage integration',
}, async t => {
  const hostRoot = process.env.DSH_CONTROLS_HOST_ROOT
  assert(isAbsolute(hostRoot))
  const temporary = await mkdtemp(join(tmpdir(), 'dsh-startup-support-'))
  const root = join(temporary, 'storage')
  let domain
  t.after(async () => {
    await domain?.close()
    assert(isAbsolute(temporary) && basename(temporary).startsWith('dsh-startup-support-'))
    await rm(temporary, { recursive: true, force: true })
  })
  domain = await openNativeStartup(hostRoot, root, buildRoot)
  const a = domain.core('process-A')
  const initial = await a.readStatus()
  const on = await a.save({ startupCwdEnabled: true }, initial.revision)
  await domain.close()
  domain = await openNativeStartup(hostRoot, root, buildRoot)
  const remounted = await domain.core('process-A').readStatus()
  assert.equal(remounted.enabledNow, false)
  assert.equal(remounted.revision, on.revision)
  await assert.rejects(domain.core('process-A').save({ startupCwdEnabled: false }, initial.revision), { code: 'revision-conflict' })
  await domain.close()
  domain = undefined
  const script = openNativeStartup.toString() + '\nconst f = await openNativeStartup(' + JSON.stringify(hostRoot) + ',' + JSON.stringify(root) + ',' + JSON.stringify(buildRoot) + '); const core=f.core("process-B"); const boot=await core.readStatus(); const saved=await core.save({startupCwdEnabled:false},boot.revision); await f.close(); console.log(JSON.stringify({boot,saved}));'
  const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' }))
  assert.equal(result.boot.enabledNow, true)
  assert.equal(result.boot.restartNeeded, false)
  assert.equal(result.saved.enabledNow, true)
  assert.equal(result.saved.restartNeeded, true)
  domain = await openNativeStartup(hostRoot, root, buildRoot)
  const retainedA = await domain.core('process-A').readStatus()
  assert.equal(retainedA.enabledNow, false)
  assert.equal(retainedA.restartNeeded, false)
  assert.equal(retainedA.revision, result.saved.revision)
  const newEpoch = await domain.core('process-C').readStatus()
  assert.equal(newEpoch.enabledNow, false)
  assert.deepEqual((await domain.storage.read()).bootReceipts.map(receipt => receipt.epoch), ['process-A', 'process-B', 'process-C'])
})
