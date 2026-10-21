import assert from 'node:assert/strict'
import { test } from 'node:test'
import './fixtures/runtime-host.mjs'
const { RefreshGate } = await import('../src/controls/refresh-gate.ts')

test('owner freshness invalidates every caller in that instance, not unrelated instances', () => {
  const gate = new RefreshGate(2000, () => 0)
  gate.record('root', undefined, 'I'); gate.record('child', undefined, 'I'); gate.record('other', undefined, 'J')
  gate.touch('I')
  assert.equal(gate.shouldRefresh('root', 'I'), true)
  assert.equal(gate.shouldRefresh('child', 'I'), true)
  assert.equal(gate.shouldRefresh('other', 'J'), false)
  const cut = gate.epoch('I'); gate.touch('I'); gate.record('root', cut, 'I')
  assert.equal(gate.shouldRefresh('root', 'I'), true, 'a pre-commit read cannot certify post-commit facts')
})
test('global policy and grant invalidation supersedes every scoped stamp', () => {
  const gate = new RefreshGate(2000, () => 0)
  gate.touch('I'); gate.record('root', undefined, 'I'); gate.record('other', undefined, 'J')
  gate.touch()
  assert.equal(gate.shouldRefresh('root', 'I'), true)
  assert.equal(gate.shouldRefresh('other', 'J'), true)
  gate.record('root', undefined, 'I'); gate.record('other', undefined, 'J')
  gate.touch('J')
  assert.equal(gate.shouldRefresh('root', 'I'), false)
  assert.equal(gate.shouldRefresh('other', 'J'), true)
})
test('bounded scope eviction invalidates old reads instead of forgetting mutations', () => {
  const gate = new RefreshGate(2000, () => 0, 2), old = gate.epoch('I')
  gate.record('other', undefined, 'J')
  gate.touch('I'); gate.touch('J'); gate.touch('K')
  gate.record('late', old, 'I')
  assert.equal(gate.shouldRefresh('late', 'I'), true)
  assert.equal(gate.shouldRefresh('other', 'J'), true)
  gate.record('new', undefined, 'I')
  assert.equal(gate.shouldRefresh('new', 'I'), false)
})
