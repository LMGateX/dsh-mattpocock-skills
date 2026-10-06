// Source-only subprocess reader. No profile/plugin/Cordis mounting.
import assert from 'node:assert/strict'
import { join, isAbsolute } from 'node:path'
import { pathToFileURL } from 'node:url'
import { WorkspaceControls, createDomainControlsStorage, parseControlsDocument } from '../../lib/controls/index.js'
const [hostRoot, storageRoot] = process.argv.slice(2)
assert(isAbsolute(hostRoot) && isAbsolute(storageRoot))
const load = path => import(pathToFileURL(join(hostRoot, 'node_modules', ...path)).href)
const { DomainFacility, defineDomain, domainTable } = await load(['@deepseek-ai', 'dsh-storage-domain', 'lib', 'index.js'])
const { JsonStorageBackend } = await load(['@deepseek-ai', 'dsh-storage-json', 'lib', 'index.js'])
const { z } = await load(['zod', 'index.js'])
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
