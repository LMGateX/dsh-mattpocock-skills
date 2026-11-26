import assert from 'node:assert/strict'
import { isAbsolute } from 'node:path'
import { parseControlsDocument, parseInstrumentDocument, createDomainControlsStorage, createDomainInstrumentStorage } from '../../lib/controls/index.js'
import { instrumentFixture } from './instrument-fixture.mjs'
import { loadStorageSdk } from './storage-sdk.mjs'

export async function openInstrumentDomain(storageRoot) {
  const hostRoot = process.env.DSH_CONTROLS_HOST_ROOT
  assert(isAbsolute(hostRoot) && isAbsolute(storageRoot))
  const { DomainFacility, defineDomain, domainTable, JsonStorageBackend, z } = await loadStorageSdk(hostRoot)
  const backend = new JsonStorageBackend(storageRoot)
  const events = []
  const facility = new DomainFacility({ storage: { backend: { get() { return backend } } }, emit(name, value) { events.push({ name, value }) }, logger: { warn() {}, error() {} } }, { backend: 'json' })
  const close = async () => { try { await facility.closeAll() } finally { await backend.close() } }
  try {
    // Dedicated single-table units: no uncoordinated sibling table can write a
    // possibly committed single-file backend image after an uncertain failure.
    const registry = await facility.open(defineDomain({ name: 'mattpocock_controls', version: 1, layout: 'single', tables: { controls: domainTable(z.unknown().transform(parseControlsDocument)) } }))
    const domain = await facility.open(defineDomain({ name: 'mattpocock_instruments', version: 1, layout: 'single', tables: { instruments: domainTable(z.unknown().transform(parseInstrumentDocument)) } }))
    const table = domain.table('instruments')
    const fixture = await instrumentFixture({ controlStorage: createDomainControlsStorage(registry.table('controls')), storage: createDomainInstrumentStorage(table) })
    return { ...fixture, table, events, close }
  } catch (error) { await close(); throw error }
}
