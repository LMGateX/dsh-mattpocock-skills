import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { lstat, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'
import { FIXED_PACKED_FILES, EXPECTED_PACKED_FILES, repositoryRoot, requirePnpmVersion,
  compareCommittedBuild, expectedTarMembers, expectedPackedFileBytes, parseGnuTarListing,
  validatePackagePolicy, validateTarMembers } from '../scripts/verify-package.mjs'
import { verifyCommittedArtifacts } from '../scripts/lib/source-ingestion.mjs'

// Development regression for a dirty working tree. This does NOT run/replace
// runPrepack/runTarball or claim a release-ready source commit/artifact.
test('scratch TypeScript build matches all current runtime code and declarations', async () => {
  const result = await compareCommittedBuild(repositoryRoot)
  assert.equal(result.files, 66)
  assert(result.paths.includes('compatibility/composition.js'))
  assert(result.paths.includes('types/compatibility/composition.d.ts'))
  for (const path of ['host.js', 'runtime.js', 'client.js', 'types/host.d.ts', 'types/runtime.d.ts', 'types/client.d.ts']) assert(result.paths.includes(path))
  assert(result.paths.includes('controls/index.js'))
  assert(result.paths.includes('types/controls/index.d.ts'))
})

test('development pack has exact closed inventory and a dependency-free controls entry', async () => {
  requirePnpmVersion()
  const temporary = await mkdtemp(join(tmpdir(), 'dsh-controls-pack-'))
  try {
    const tarball = join(temporary, 'development.tgz')
    execFileSync('pnpm', ['pack', '--json', '--skip-manifest-obfuscation', '--out', tarball], {
      cwd: repositoryRoot, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024,
    })
    const inventory = JSON.parse(await readFile(join(repositoryRoot, 'vendor-files.json'), 'utf8'))
    const expected = await expectedTarMembers(repositoryRoot, inventory)
    const listing = execFileSync('tar', ['--list', '--verbose', '--numeric-owner', '--full-time', '--quoting-style=c', '--file', tarball], { encoding: 'utf8' })
    const summary = validateTarMembers(parseGnuTarListing(listing), expected)
    assert.equal(summary.expectedFiles, EXPECTED_PACKED_FILES)
    assert.equal(summary.files, FIXED_PACKED_FILES.length + inventory.entries.filter(entry => entry.kind === 'file').length)
    assert.equal(summary.symlinks, 0)
    execFileSync('tar', ['--extract', '--file', tarball, '--directory', temporary, '--no-same-owner', '--no-same-permissions'])
    const packed = join(temporary, 'package')
    for (const path of FIXED_PACKED_FILES) {
      const source = await readFile(join(repositoryRoot, path))
      assert(expectedPackedFileBytes(path, source).equals(await readFile(join(packed, path))), path + ' differs')
    }
    validatePackagePolicy(JSON.parse(await readFile(join(packed, 'package.json'), 'utf8')))
    await verifyCommittedArtifacts(packed)
    // Extraction has no node_modules: this must work without Cordis/DSH imports.
    await assert.rejects(lstat(join(packed, 'node_modules')), { code: 'ENOENT' })
    const entry = pathToFileURL(join(packed, 'lib/controls/index.js')).href
    const controls = await import(entry)
    assert.equal(controls.resolvePolicy(controls.INITIAL_POLICY, 'W', true).extensionEnabled, false)
    assert.equal(typeof controls.WorkspaceControls, 'function')
    assert.equal(typeof controls.SessionInstruments, 'function')
    const core = new controls.WorkspaceControls(new controls.MemoryControlsStorage(), {
      async authorizePolicy() {}, async authorizeSession() {},
      async resolveSession() { return { kind: 'owner', controlWorkspaceId: 'W' } }, async verifyWorkspace() { return true },
    })
    await core.savePolicy('user', { extensionEnabled: true, defaults: { workspace: { enabled: true }, ticketProgress: { enabled: true }, pendingDecisions: { enabled: true } }, workspaceOverrides: {} }, 0)
    await core.ensureSession('user', 'S')
    const authority = { async resolveAccess() {
      return { author: { kind: 'user', principalId: 'user', sessionId: null }, scope: { kind: 'coordinator' } }
    } }
    const instruments = new controls.SessionInstruments(core, new controls.MemoryInstrumentStorage(), authority)
    await instruments.apply('user', 'S', { operationId: 'pack-1', expectedRevision: 0, workflowId: 'task', action: 'put-workflow', value: { title: 'Packed task', axes: [] } })
    await instruments.apply('user', 'S', { operationId: 'pack-2', expectedRevision: 1, workflowId: 'task', action: 'put-decision', decisionId: 'D', value: { question: 'Persist this matter', status: 'Task-defined', pending: true } })
    const records = await instruments.read('user', 'S')
    assert.equal(records.summary.pendingDecisionCount, 1)
    const windows = new controls.SessionWindows(core, new controls.MemoryWindowStorage(), authority, {
      runtimeId: 'packed-runtime', capability: 'unsupported', bindProgram() {},
    })
    const windowSnapshot = await windows.read('user', 'S')
    // No native capability is implied just because the packed core can be constructed.
    assert.equal(windowSnapshot.capability, 'unsupported')
    const session = await core.readSession('user', 'S')
    const noPhysicalEffect = async () => { throw new Error('packed smoke must not perform physical resource effects') }
    const resource = controls.createResourceModule({
      storage: new controls.MemoryResourceStorage(),
      authority: { async authorize() { return { controlWorkspaceId: 'W', instrumentInstanceId: session.instance.instrumentInstanceId, authorId: 'user' } } },
      git: { planCreate: noPhysicalEffect, create: noPhysicalEffect, borrow: noPhysicalEffect, inspect: noPhysicalEffect, retire: noPhysicalEffect },
      lifecycle: { closeEntrypoints: noPhysicalEffect, verifyInitialBinding: noPhysicalEffect },
    })
    const resources = await resource.resources.list('user')
    assert.deepEqual(resources, [])
    const consumption = new controls.InstrumentConsumption({ async readSnapshot() {
      return { sessionId: 'S', instance: session.instance, policy: session.policy, records, windows: windowSnapshot,
        resources, capabilities: [{ key: 'native-admission', status: 'unsupported', reason: 'standalone-core' }], health: [] }
    } })
    const consumed = await consumption.readForConsumption({ principalId: 'user', sessionId: 'S',
      instrumentInstanceId: session.instance.instrumentInstanceId, ownerSessionId: 'S' })
    assert.equal(consumed.freshness, 'current')
    assert.match(consumed.text, /native-admission/)
    assert.equal(typeof controls.parseHostJson, 'function')
    assert.equal(typeof controls.parseRuntimeDocument, 'function')
    const output = execFileSync(process.execPath, ['--input-type=module', '-e',
      'import { WorkspaceControls, MemoryControlsStorage, SessionInstruments, SessionWindows, createResourceModule, InstrumentConsumption } from "@lmgatex/dsh-mattpocock-skills/controls"; console.log(typeof WorkspaceControls, typeof MemoryControlsStorage, typeof SessionInstruments, typeof SessionWindows, typeof createResourceModule, typeof InstrumentConsumption)'],
      { cwd: packed, encoding: 'utf8' })
    assert.equal(output.trim(), 'function function function function function function')
  } finally {
    assert(isAbsolute(temporary) && basename(temporary).startsWith('dsh-controls-pack-'))
    await rm(temporary, { recursive: true, force: true })
  }
})
