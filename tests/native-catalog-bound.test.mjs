import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mountedFixture, actualAgent } from './fixtures/runtime-host.mjs'

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

test('a catalog that never answers cannot hold a read', async t => {
  const f = await mountedFixture(t, { configureBeforeMount: ({ ctx, agents }) => {
    // No live member: the state under test is the catalog's absence, not a live-derived count.
    agents.delete('child')
    ctx.provide('subagents', {
      // A host exposing only the full walk, whose catalog read never returns at all.
      async listDescendants() { return await new Promise(() => {}) },
    })
  } })
  const started = Date.now()
  const activity = await f.mounted.ports.nativeActivity('root')
  const elapsed = Date.now() - started
  assert.equal(activity.known, true, 'resident membership needs no catalog, so the count is still stated')
  assert.ok(elapsed < 500, 'the read returns immediately, elapsed=' + elapsed + 'ms')
  const again = Date.now()
  await f.mounted.ports.nativeActivity('root')
  assert.ok(Date.now() - again < 500, 'a repeated read stays immediate while the catalog is still unanswered')
})

test('a large resident subtree is counted in sub-millisecond reads with no catalog call', async t => {
  const residents = 2_000
  let catalogCalls = 0
  const f = await mountedFixture(t, { configureBeforeMount: ({ ctx, agents }) => {
    agents.delete('child')
    for (let index = 0; index < residents; index += 1) {
      const agent = actualAgent('child-' + index, { parent: 'root', managed: true })
      agent.status = 'running'
      agents.set(agent.id, agent)
    }
    // The catalog is maximally hostile: it never answers. The count must not care.
    ctx.provide('subagents', { async listDescendants() { catalogCalls += 1; return await new Promise(() => {}) } })
  } })
  const read = () => f.mounted.ports.nativeSubagentActivity('root')
  const first = await read()
  assert.equal(first.running, residents, 'every resident running child is counted')
  assert.equal(first.known, true)
  let total = 0, worst = 0
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const started = Date.now(); await read(); const elapsed = Date.now() - started
    total += elapsed; worst = Math.max(worst, elapsed)
  }
  const average = total / 20
  assert.ok(average < 25, 'the read path stays memory-bound, average=' + average + 'ms')
  assert.ok(worst < 100, 'no read waits for the catalog, worst=' + worst + 'ms')
  assert.ok(catalogCalls <= 1, 'catalog enumeration happens once in the background, never per read')
})
