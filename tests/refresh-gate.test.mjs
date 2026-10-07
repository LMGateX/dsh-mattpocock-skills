import test from 'node:test'
import assert from 'node:assert/strict'
import { RefreshGate } from '../lib/controls/refresh-gate.js'

test('an unchanged state inside the window is not rebuilt', () => {
  let now = 1_000
  const gate = new RefreshGate(2_000, () => now)
  assert.equal(gate.shouldRefresh('a'), true)
  gate.record('a')
  assert.equal(gate.shouldRefresh('a'), false)
  now += 1_999
  assert.equal(gate.shouldRefresh('a'), false)
})

test('a mutation forces the next rebuild', () => {
  const gate = new RefreshGate(2_000, () => 0)
  gate.record('a')
  assert.equal(gate.shouldRefresh('a'), false)
  gate.touch()
  assert.equal(gate.shouldRefresh('a'), true)
test('a mutation that lands during a read keeps the gate open', () => {
  // record() must stamp the epoch observed before the read: stamping the post-mutation epoch
  // certified a pre-mutation projection as current.
  const gate = new RefreshGate(2_000, () => 0)
  const epoch = gate.epoch()
  gate.touch()
  gate.record('a', epoch)
  assert.equal(gate.shouldRefresh('a'), true)
})

test('stamping the observed epoch still honors the window while nothing mutates', () => {
  let now = 0
  const gate = new RefreshGate(2_000, () => now)
  const epoch = gate.epoch()
  gate.touch()
  gate.record('a', epoch)
  assert.equal(gate.shouldRefresh('a'), true, 'the concurrent mutation is still pending')
  const next = gate.epoch()
  gate.record('a', next)
  assert.equal(gate.shouldRefresh('a'), false)
  now += 2_000
  assert.equal(gate.shouldRefresh('a'), true)
})
})

test('the window bounds staleness even without a mutation', () => {
  let now = 0
  const gate = new RefreshGate(2_000, () => now)
  gate.record('a')
  now = 2_000
  assert.equal(gate.shouldRefresh('a'), true)
})

test('each caller keeps its own freshness', () => {
  const gate = new RefreshGate(2_000, () => 0)
  gate.record('a')
  assert.equal(gate.shouldRefresh('b'), true)
  assert.equal(gate.shouldRefresh('a'), false)
})

test('recorded keys stay bounded', () => {
  const gate = new RefreshGate(2_000, () => 0, 2)
  gate.record('a'); gate.record('b'); gate.record('c')
  assert.equal(gate.shouldRefresh('c'), false)
  assert.equal(gate.shouldRefresh('a'), true)
})
