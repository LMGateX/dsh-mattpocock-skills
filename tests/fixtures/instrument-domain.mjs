import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseControlsDocument, parseInstrumentDocument, createDomainControlsStorage, createDomainInstrumentStorage } from '../../lib/controls/index.js'
import { instrumentFixture } from './instrument-fixture.mjs'

export async function openInstrumentDomain(storageRoot) {
  const hostRoot = process.env.DSH_CONTROLS_HOST_ROOT
  assert(isAbsolute(hostRoot) && isAbsolute(storageRoot))
  const load = path => import(pathToFileURL(join(hostRoot, 'node_modules', ...path)).href)
  const { DomainFacility, defineDomain, domainTable } = await load(['@deepseek-ai', 'dsh-storage-domain', 'lib', 'index.js'])
  const { JsonStorageBackend } = await load(['@deepseek-ai', 'dsh-storage-json', 'lib', 'index.js'])
  const { z } = await load(['zod', 'index.js'])
  for (const name of ['dsh-storage-domain', 'dsh-storage-json']) assert.equal(JSON.parse(await readFile(join(hostRoot, 'node_modules', '@deepseek-ai', name, 'package.json'), 'utf8')).version, '0.2.1-alpha.1')
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
