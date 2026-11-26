// Source-only subprocess reader. No profile/plugin/Cordis mounting.
import assert from 'node:assert/strict'
import { isAbsolute } from 'node:path'
import { WorkspaceControls, createDomainControlsStorage, parseControlsDocument } from '../../lib/controls/index.js'
import { loadStorageSdk } from './storage-sdk.mjs'
const [hostRoot, storageRoot] = process.argv.slice(2)
assert(isAbsolute(hostRoot) && isAbsolute(storageRoot))
const { DomainFacility, defineDomain, domainTable, JsonStorageBackend, z } = await loadStorageSdk(hostRoot)
const backend = new JsonStorageBackend(storageRoot)
const facility = new DomainFacility({ storage: { backend: { get() { return backend } } }, emit() {}, logger: { warn() {}, error() {} } }, { backend: 'json' })
try {
  const domain = await facility.open(defineDomain({ name: 'mattpocock_controls', version: 1, layout: 'single',
    tables: { controls: domainTable(z.unknown().transform(parseControlsDocument)) } }))
  const core = new WorkspaceControls(createDomainControlsStorage(domain.table('controls')), {
    async authorizePolicy(principal) { assert.equal(principal, 'host') },
    async authorizeSession(principal) { assert.equal(principal, 'host') },
    async resolveSession(session) {
      if (session === 'child') return { kind: 'managed-child', parentSessionId: 'A' }
      if (session === 'A') return { kind: 'owner', controlWorkspaceId: 'W' }
    },
    async verifyWorkspace(workspace) { return workspace === 'W' },
  })
  console.log(JSON.stringify(await core.ensureSession('host', 'child')))
} finally { try { await facility.closeAll() } finally { await backend.close() } }
