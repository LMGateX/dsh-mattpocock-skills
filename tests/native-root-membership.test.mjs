import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mountedFixture, caller, signal, actualAgent, deferred } from './fixtures/runtime-host.mjs'

const settle = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)) }
const runner = (id, parent) => Object.assign(actualAgent(id, { parent, managed: true }), { status: 'running' })
const direct = id => ({ id, createdAt: 0, mode: 'continuable', label: id, name: id })

// These providers are controlled public rootOf/catalog seams, not SDK Agents or a copied manager.
test('root owner counts a runner below two cold creators on its first mounted read', async t => {
  let calls = 0, walks = 0
  const f = await mountedFixture(t, { configureBeforeMount({ ctx, agents, root }) {
    agents.delete('child')
    ctx.provide('subagents', {
      rootOf(agent) { assert.equal(agents.get(agent.id), agent); return root },
      async listChildren() { calls++; return [direct('cold-a')] },
      async listDescendants() { walks++; throw new Error('whole tree forbidden') },
    })
  } })
  f.agents.set('leaf', runner('leaf', 'cold-b'))
  const read = () => f.runtime.readSession(caller('root'), 'root', signal())
  const first = await read()
  assert.equal(first.windows.S.used, 1)
  assert.equal(first.windows.S.countKnown, true)
  assert.deepEqual(first.windows.S.depth, { direct: 0, deeper: 0, unknown: 1, levels: {} })
  await settle(); await read()
  const baseline = calls
  for (let i = 0; i < 4; i++) assert.equal((await read()).windows.S.used, 1)
  assert.equal(calls, baseline)
  assert.equal(walks, 0)
  const sourceReads = f.sessionReads.length
  await f.mounted.ports.nativeSubagentActivity('root')
  assert.equal(f.sessionReads.length, sourceReads, 'the public count port never observes cold creators; Runtime ACL remains separate')
})

test('a nonroot owner excludes siblings and marks an unclosed same-tree creator chain unknown', async t => {
  const f = await mountedFixture(t, { configureBeforeMount({ ctx, agents, root }) {
    ctx.provide('subagents', { rootOf(agent) { assert.equal(agents.get(agent.id), agent); return root }, async listChildren() { return [] } })
  } })
  f.agents.set('direct', runner('direct', 'child'))
  f.agents.set('sibling', runner('sibling', 'root'))
  const directOnly = await f.mounted.ports.nativeSubagentActivity('child')
  assert.equal(directOnly.running, 1)
  assert.equal(directOnly.known, true)
  f.agents.set('cold-leaf', runner('cold-leaf', 'missing-creator'))
  const unclosed = await f.mounted.ports.nativeSubagentActivity('child')
  assert.equal(unclosed.running, 1, 'same runtime tree never proves nonroot ancestry')
  assert.equal(unclosed.known, false)
  assert.equal(unclosed.reason, 'native-subagent-membership-unproven')
  assert.deepEqual(unclosed.depth, { direct: 1, deeper: 0, unknown: 0, levels: { '1': 1 } })
})

test('runtime full and model current reads revalidate root ownership without lifecycle events', async t => {
  let childRoot
  const f = await mountedFixture(t, { configureBeforeMount({ ctx, agents, root, child }) {
    const other = actualAgent('other'); agents.set(other.id, other)
    child.status = 'running'; childRoot = root
    ctx.provide('subagents', {
      rootOf(agent) { assert.equal(agents.get(agent.id), agent); return agent === child ? childRoot : agent },
      async listChildren() { return [direct('child')] },
    })
  } })
  const read = () => f.runtime.readSession(caller('root'), 'root', signal())
  await read(); await settle(); assert.equal((await read()).windows.S.used, 1)
  childRoot = f.agents.get('other')
  assert.equal((await read()).windows.S.used, 0, 'same Agent/header/status but another runtime root invalidates a hot projection')
  const current = await f.runtime.readModelCurrent(caller('root'), 'root', signal())
  assert.equal(current.windows.S.used, 0)
  assert.equal(current.windows.S.countKnown, true)
})

test('root proof refusal remains unknown after a late clean catalog and preserves current authorization', async t => {
  const listing = deferred(); let refused = false
  const f = await mountedFixture(t, { configureBeforeMount({ ctx, root, child }) {
    child.status = 'running'
    ctx.provide('subagents', {
      rootOf() { if (refused) throw new Error('root access denied'); return root },
      listChildren() { return listing.promise },
    })
  } })
  const read = () => f.runtime.readSession(caller('root'), 'root', signal())
  assert.equal((await read()).windows.S.used, 1)
  refused = true; listing.resolve([direct('child')]); await settle()
  const denied = await read()
  assert.equal(denied.windows.S.used, 1, 'readable creator evidence remains a lower bound')
  assert.equal(denied.windows.S.countKnown, false)
  assert.equal(denied.windows.S.countReason, 'native-subagent-runtime-root-unavailable')
  assert.deepEqual(denied.nativeStops, [])
  refused = false
  assert.equal((await read()).windows.S.countKnown, true, 'permission recovery is rechecked, never cached')
})

test('different roots, ordinary forks and external catalog rows stay outside local S', async t => {
  const roots = new Map()
  const f = await mountedFixture(t, { configureBeforeMount({ ctx, agents, root, child }) {
    child.status = 'running'; roots.set(child, root)
    ctx.provide('subagents', {
      rootOf(agent) { assert.equal(agents.get(agent.id), agent); return roots.get(agent) ?? agent },
      async listChildren() { return [direct('child'), { id: 'external', createdAt: 1, mode: 'external', name: 'external' }] },
    })
  } })
  const fork = actualAgent('fork', { parent: 'root' }); fork.status = 'running'
  const other = actualAgent('other'), forkChild = runner('fork-child', 'fork'), outside = runner('outside', 'cold-outside')
  roots.set(forkChild, fork); roots.set(outside, other)
  for (const a of [fork, other, forkChild, outside]) f.agents.set(a.id, a)
  const read = () => f.runtime.readSession(caller('root'), 'root', signal())
  assert.equal((await read()).windows.S.used, 1)
  await settle(); assert.equal((await read()).windows.S.countKnown, true)
  const baseline = f.mounted.ports.nativeSubagentCountState('root').liveMembershipToken
  f.child.status = 'idle'
  assert.equal((await read()).windows.S.used, 0)
  f.child.status = 'running'
  assert.equal((await read()).windows.S.used, 1)
  const replacement = runner('child', 'root'); f.agents.set('child', replacement)
  roots.set(replacement, other)
  assert.equal((await read()).windows.S.used, 0, 'same-id replacement cannot reuse old root ownership')
  assert.notEqual(f.mounted.ports.nativeSubagentCountState('root').liveMembershipToken, baseline)
})

test('same-id root and service replacement cannot certify stale runtime membership', async t => {
  let oldRoot, provider
  const f = await mountedFixture(t, { configureBeforeMount({ ctx, root, child }) {
    oldRoot = root; child.status = 'running'
    provider = { rootOf() { return root }, async listChildren() { return [direct('child')] } }
    ctx.provide('subagents', provider)
  } })
  const read = () => f.runtime.readSession(caller('root'), 'root', signal())
  await read(); await settle(); assert.equal((await read()).windows.S.countKnown, true)
  f.agents.set('root', actualAgent('root'))
  assert.equal((await read()).windows.S.countKnown, false, 'returned old root is no longer the exact registry root')
  f.agents.set('root', oldRoot)
  assert.equal((await read()).windows.S.countKnown, true)
  const before = f.mounted.ports.nativeSubagentCountState('root').liveMembershipToken
  f.ctx.set('subagents', { rootOf() { return oldRoot }, async listChildren() { return [] } })
  assert.notEqual(f.mounted.ports.nativeSubagentCountState('root').liveMembershipToken, before)
  assert.equal((await read()).windows.S.used, 1)
  f.ctx.set('subagents', { rootOf() { throw new Error('new service denies old Agents') }, async listChildren() { return [] } })
  assert.equal((await read()).windows.S.countKnown, false)
})

test('legacy service cannot turn an unclosed cold chain into known zero', async t => {
  const f = await mountedFixture(t, { configureBeforeMount({ ctx, agents }) {
    agents.delete('child'); ctx.provide('subagents', { async listChildren() { return [direct('cold-a')] } })
  } })
  f.agents.set('leaf', runner('leaf', 'cold-b'))
  const read = () => f.runtime.readSession(caller('root'), 'root', signal())
  for (let i = 0; i < 2; i++) {
    const snapshot = await read()
    assert.equal(snapshot.windows.S.used, 0)
    assert.equal(snapshot.windows.S.countKnown, false)
    assert.equal(snapshot.windows.S.countReason, 'native-subagent-membership-unproven')
    await settle()
  }
})

test('cancellation raised during synchronous root verification preserves the exact reason', async t => {
  const control = new AbortController(), reason = new Error('caller cancelled root check')
  let cancel = false
  const f = await mountedFixture(t, { configureBeforeMount({ ctx, root }) {
    ctx.provide('subagents', { rootOf() { if (cancel) control.abort(reason); return root }, async listChildren() { return [] } })
  } })
  cancel = true
  await assert.rejects(f.mounted.ports.nativeSubagentActivity('root', control.signal), error => error === reason)
})

test('runtime-root-only members retain stop event routing across cold creators and deduplicate run edges', async t => {
  const f = await mountedFixture(t, { configureBeforeMount({ ctx, agents, root }) {
    agents.delete('child')
    ctx.provide('subagents', { rootOf() { return root }, async listChildren() { return [direct('cold-a')] } })
  } })
  const leaf = runner('leaf', 'cold-b'); f.agents.set(leaf.id, leaf)
  const read = () => f.runtime.readSession(caller('root'), 'root', signal())
  assert.equal((await read()).windows.S.used, 1)
  const end = { id: 'leaf', provider: 'controlled', local: true, stopReason: 'refusal', runId: 'run-c' }
  leaf.status = 'idle'
  f.ctx.emit('subagent/end', end); f.ctx.emit('subagent/end', end)
  await settle()
  const snapshot = await read()
  assert.equal(snapshot.nativeStops.filter(row => row.sessionId === 'leaf').length, 1)
  assert.equal(snapshot.nativeStops.find(row => row.sessionId === 'leaf').outcome, 'refusal')
})

test('public catalog projection validates named rows and releases every observation on failure', async t => {
  for (const variant of ['named', 'absent', 'throws', 'denied']) {
    let reads = 0, releases = 0, walks = 0
    const f = await mountedFixture(t, { configureBeforeMount({ ctx, root, child }) {
      child.status = 'running'
      ctx.provide('subagents', { rootOf() { return root }, async listDescendants() { walks++; throw new Error('whole-tree forbidden') } })
      ctx.set('sessionQuery', { async observeSession(_id, options) {
        reads++; assert(options.signal instanceof AbortSignal)
        if (variant === 'denied') throw new Error('catalog denied')
        return { get projections() {
          if (variant === 'throws') throw new Error('projection rejected')
          return variant === 'absent' ? undefined : { values: { subagentCatalog: [direct('child')] } }
        }, [Symbol.dispose]() { releases++ } }
      } })
    } })
    const read = () => f.runtime.readSession(caller('root'), 'root', signal())
    await read(); await settle()
    const snapshot = await read()
    assert.equal(snapshot.windows.S.used, 1)
    assert.equal(snapshot.windows.S.countKnown, variant === 'named')
    if (variant !== 'named') assert.equal(snapshot.windows.S.countReason,
      variant === 'absent' ? 'native-subagent-diagnostic-invalid' : 'native-subagent-listing-rejected')
    assert.equal(walks, 0)
    assert.equal(releases, variant === 'denied' ? 0 : reads)
    const baseline = reads
    for (let i = 0; i < 3; i++) await f.mounted.ports.nativeSubagentActivity('root')
    assert.equal(reads, baseline)
  }
})

test('disposing a Host cancels a pending public catalog and releases its late lease', async t => {
  const pending = deferred(); let querySignal, reads = 0, releases = 0
  const f = await mountedFixture(t, { configureBeforeMount({ ctx, root }) {
    ctx.provide('subagents', { rootOf() { return root }, async listDescendants() { assert.fail('whole-tree forbidden') } })
    ctx.set('sessionQuery', { async observeSession(_id, options) {
      reads++; querySignal = options.signal; return pending.promise
    } })
  } })
  await f.mounted.ports.nativeSubagentActivity('root'); await settle()
  assert(reads > 0)
  await f.mounted.dispose()
  assert.equal(querySignal.aborted, true)
  pending.resolve({ projections: { values: { subagentCatalog: [] } }, [Symbol.dispose]() { releases++ } })
  await settle()
  assert.equal(releases, reads)
  await assert.rejects(f.mounted.ports.nativeSubagentActivity('root'))
})

test('the A to B live cut rebuilds when runtime ownership changes after the count body', async t => {
  let selectedRoot, otherRoot, change = false, ports
  const f = await mountedFixture(t, { configureBeforeMount({ ctx, agents, root, child }) {
    otherRoot = actualAgent('other'); agents.set(otherRoot.id, otherRoot)
    selectedRoot = root; child.status = 'running'
    ctx.provide('subagents', { rootOf(agent) { return agent === child ? selectedRoot : agent }, async listChildren() { return [direct('child')] } })
  }, runtimeCreated(_runtime, value) { ports = value } })
  const activity = ports.nativeSubagentActivity.bind(ports)
  ports.nativeSubagentActivity = async (...args) => {
    const value = await activity(...args)
    if (change) { change = false; selectedRoot = otherRoot }
    return value
  }
  change = true
  const snapshot = await f.runtime.readSession(caller('root'), 'root', signal())
  assert.equal(snapshot.windows.S.used, 0, 'the old body cannot be stamped with a new ownership token')
  assert.equal(snapshot.windows.S.countKnown, true)
})
