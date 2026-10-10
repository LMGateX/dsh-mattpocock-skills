import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mountedFixture } from './fixtures/runtime-host.mjs'

// The installed SDK's full-subtree walk issues one session-log read per descendant. A live
// profile with 2048 descendant logs (2.1 GB) made that walk effectively unbounded, and because
// it sat on the admission and snapshot read paths the message never started. Membership now
// comes from one direct-children read plus the live Agent index, and the read carries a budget.

test('activity resolves through direct children and never walks the whole subtree', async t => {
  let children = 0, walks = 0
  const f = await mountedFixture(t, { configureBeforeMount: ({ ctx }) => {
    ctx.provide('subagents', {
      async listChildren() { children += 1; return [{ kind: 'child', id: 'child', mode: 'continuable', activity: 'running', hasChildren: false }] },
      async listDescendants() { walks += 1; return [] },
    })
  } })
  const activity = await f.mounted.ports.nativeActivity('root')
  assert.equal(walks, 0, 'the per-descendant subtree walk is never used when direct children are available')
  assert.ok(children >= 1, 'membership comes from the direct-children catalog read')
  assert.equal(activity.known, true)
  await f.mounted.ports.nativeActivity('root')
  assert.equal(walks, 0, 'a second read still never walks the subtree')
})

test('a catalog that never answers degrades the lower bound instead of holding the caller', async t => {
  const f = await mountedFixture(t, { configureBeforeMount: ({ ctx }) => {
    ctx.provide('subagents', {
      // A host exposing only the full walk, whose catalog read never returns at all: the budget
      // must end the wait even though the callee ignores its own signal.
      async listDescendants() { return await new Promise(() => {}) },
    })
  } })
  const started = Date.now()
  const activity = await f.mounted.ports.nativeActivity('root')
  const elapsed = Date.now() - started
  assert.equal(activity.known, false, 'an unanswered catalog is stated as an unknown lower bound')
  assert.equal(activity.reason, 'native-subagent-listing-timeout')
  assert.ok(elapsed < 4_000, 'the read states the lower bound within its budget, elapsed=' + elapsed + 'ms')
})
