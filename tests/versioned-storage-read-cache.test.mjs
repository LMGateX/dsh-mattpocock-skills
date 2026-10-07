import test from 'node:test'
import assert from 'node:assert/strict'
import { createDomainVersionedStorage } from '../lib/controls/versioned-storage.js'

// Instrument polling reads the same document revision many times per second.
// Re-parsing and deep-freezing the whole document on every read was the dominant
// idle CPU cost, so an unchanged revision must reuse the frozen snapshot.
const parse = value => {
  if (typeof value !== 'object' || value === null || typeof value.revision !== 'number') throw new Error('invalid-input')
  return { revision: value.revision, rows: Array.isArray(value.rows) ? [...value.rows] : [] }
}

function table(initial) {
  const state = { value: initial, gets: 0 }
  return {
    state,
    get() { state.gets++; return state.value === undefined ? undefined : structuredClone(state.value) },
    async put(_key, value) { state.value = structuredClone(value) },
    async update(_key, fn) { state.value = structuredClone(fn(structuredClone(state.value))); return state.value },
  }
}

test('an unchanged revision reuses the frozen snapshot instead of re-parsing', async () => {
  let parses = 0
  const counting = value => { parses++; return parse(value) }
  const backing = table({ revision: 3, rows: ['a', 'b'] })
  const storage = createDomainVersionedStorage(backing, 'state', counting)
  const first = await storage.read()
  const second = await storage.read()
  assert.equal(first, second, 'same revision returns the same cached document')
  assert.equal(parses, 1, 'the document was parsed exactly once')
  assert.equal(Object.isFrozen(first), true, 'cached documents stay frozen')
  assert.equal(backing.state.gets, 2, 'the store is still consulted so external revisions are seen')
})

test('a changed revision is re-parsed and never serves stale data', async () => {
  const backing = table({ revision: 1, rows: ['old'] })
  const storage = createDomainVersionedStorage(backing, 'state', parse)
  const before = await storage.read()
  assert.equal(before.rows[0], 'old')
  backing.state.value = { revision: 2, rows: ['new'] }
  const after = await storage.read()
  assert.equal(after.rows[0], 'new')
  assert.notEqual(before, after)
})

test('a successful compare-and-swap is visible to the next read', async () => {
  const backing = table({ revision: 5, rows: [] })
  const storage = createDomainVersionedStorage(backing, 'state', parse)
  await storage.read()
  const committed = await storage.compareAndSwap(5, { revision: 6, rows: ['written'] })
  assert.equal(committed, true)
  const read = await storage.read()
  assert.equal(read.revision, 6)
  assert.equal(read.rows[0], 'written')
})

test('callers cannot alias the cached document through the table', async () => {
  const shared = { revision: 1, rows: ['safe'] }
  const backing = {
    get() { return shared },
    async put() {},
    async update() {},
  }
  const storage = createDomainVersionedStorage(backing, 'state', parse)
  const read = await storage.read()
  shared.rows.push('mutated')
  assert.deepEqual([...read.rows], ['safe'], 'the cached snapshot is detached from the stored value')
  assert.throws(() => { read.rows.push('nope') }, 'cached documents are frozen')
})
