import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mountedFixture, caller, signal, actualAgent } from './fixtures/runtime-host.mjs'

const settle = async () => { for (let i = 0; i < 4; i += 1) await new Promise(resolve => setImmediate(resolve)) }
const waitFor = async predicate => {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    if (await predicate()) return
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  assert.fail('catalog state did not settle')
}
const direct = (id, mode = 'continuable') => ({ id, createdAt: 0, mode, ...(mode === 'continuable' ? { label: id } : {}) })
const running = (id, parent = 'root') => { const agent = actualAgent(id, { parent, managed: true }); agent.status = 'running'; return agent }
// SubagentRuntime.listChildren returns public SubagentCatalogEntry rows, without kind/activity.
test('mounted readSession accepts ordinary direct-child catalog rows without a kind discriminator', async t => {
  let walks = 0
  const f = await mountedFixture(t, { configureBeforeMount: ({ ctx, child }) => {
    child.status = 'running'
    ctx.provide('subagents', {
      async listChildren() { return [{ id: 'child', createdAt: 0, mode: 'continuable', label: 'public-shape' }] },
      async listDescendants() { walks += 1; throw new Error('whole-subtree listing is forbidden') },
    })
  } })
  const read = () => f.runtime.readSession(caller('root'), 'root', signal())
  await read(); await settle()
  const snapshot = await read()
  assert.equal(snapshot.windows.S.used, 1)
  assert.equal(snapshot.windows.S.countKnown, true)
  assert.equal(snapshot.windows.S.countReason, null)
  assert.deepEqual(snapshot.windows.S.depth, { direct: 1, deeper: 0, unknown: 0, levels: { '1': 1 } })
  assert.equal(snapshot.health.find(row => row.scope === 'execution-admission').status, 'current')
  assert.equal(walks, 0)
})

test('an unknown direct-child mode states an unsupported lower bound beside readable running children', async t => {
  const f = await mountedFixture(t, { configureBeforeMount: ({ ctx, child }) => {
    child.status = 'running'
    ctx.provide('subagents', { async listChildren() { return [
      { id: 'child', createdAt: 0, mode: 'continuable', label: 'readable' },
      { id: 'unknown-child', createdAt: 1, mode: 'unknown' },
    ] } })
  } })
  await f.runtime.readSession(caller('root'), 'root', signal()); await settle()
  const snapshot = await f.runtime.readSession(caller('root'), 'root', signal())
  assert.equal(snapshot.windows.S.used, 1)
  assert.equal(snapshot.windows.S.countKnown, false)
  assert.equal(snapshot.windows.S.countReason, 'native-subagent-diagnostic-unsupported')
  assert.deepEqual(snapshot.nativeStops, [], 'an unsupported catalog row cannot manufacture a terminal outcome')
})

test('malformed direct rows and recursive-shaped rows never certify a known direct catalog', async t => {
  const malformed = [
    null,
    { id: 'bad', createdAt: 0, mode: 'continuable' },
    { id: 'bad', createdAt: 0, mode: 'future' },
    { id: 5, createdAt: 0, mode: 'one-shot' },
    { id: 'bad', mode: 'one-shot' },
    { id: 'bad', createdAt: NaN, mode: 'one-shot' },
    { id: 'bad', createdAt: 0, mode: 'external', label: 3 },
    { kind: 'diagnostic', id: 'bad', reason: 'corrupt' },
    { kind: 'child', id: 'bad', createdAt: 0, mode: 'one-shot', activity: 'running', hasChildren: false },
  ]
  for (const row of malformed) {
    const f = await mountedFixture(t, { configureBeforeMount: ({ ctx, child }) => {
      child.status = 'running'
      ctx.provide('subagents', { async listChildren() { return [
        { id: 'child', createdAt: 0, mode: 'continuable', label: 'readable' }, row,
      ] } })
    } })
    await f.runtime.readSession(caller('root'), 'root', signal()); await settle()
    const snapshot = await f.runtime.readSession(caller('root'), 'root', signal())
    assert.equal(snapshot.windows.S.used, 1, 'a malformed row does not erase the live running lower bound')
    assert.equal(snapshot.windows.S.countKnown, false, 'bad row: ' + JSON.stringify(row))
    assert.equal(snapshot.windows.S.countReason, 'native-subagent-diagnostic-invalid')
    assert.deepEqual(snapshot.nativeStops, [])
  }
})


test('direct one-shot and continuable membership still counts only live running status at every depth', async t => {
  let calls = 0, walks = 0
  const f = await mountedFixture(t, { configureBeforeMount: ({ ctx, child, agents }) => {
    child.status = 'idle'
    agents.set('worker', running('worker'))
    agents.set('grandchild', running('grandchild', 'worker'))
    ctx.provide('subagents', {
      async listChildren() { calls += 1; return [direct('child'), direct('worker', 'one-shot'), direct('cold', 'one-shot'), direct('outside', 'external')] },
      async listDescendants() { walks += 1; throw new Error('whole-subtree listing is forbidden') },
    })
  } })
  const read = () => f.runtime.readSession(caller('root'), 'root', signal())
  await read(); await settle()
  const before = await read()
  assert.equal(before.windows.S.countKnown, true)
  assert.equal(before.windows.S.used, 2, 'idle, cold and external children are not running local Agents')
  assert.deepEqual(before.windows.S.depth, { direct: 1, deeper: 1, unknown: 0, levels: { '1': 1, '2': 1 } })
  const baseline = calls, grandchild = f.agents.get('grandchild')
  grandchild.status = 'idle'; f.ctx.emit('agent/status', { agent: grandchild, status: 'idle' })
  const after = await read()
  assert.equal(after.windows.S.used, 1)
  assert.deepEqual(after.windows.S.depth, { direct: 1, deeper: 0, unknown: 0, levels: { '1': 1 } })
  assert.equal(calls, baseline, 'status flips never re-read the catalog')
  assert.equal(walks, 0)
})

test('an empty direct catalog is a known zero when no live descendants exist', async t => {
  const f = await mountedFixture(t, { configureBeforeMount: ({ ctx, agents }) => {
    agents.delete('child')
    ctx.provide('subagents', { async listChildren() { return [] } })
  } })
  await f.runtime.readSession(caller('root'), 'root', signal()); await settle()
  const snapshot = await f.runtime.readSession(caller('root'), 'root', signal())
  assert.equal(snapshot.windows.S.used, 0)
  assert.equal(snapshot.windows.S.countKnown, true)
  assert.equal(snapshot.windows.S.countReason, null)
  assert.deepEqual(snapshot.windows.S.depth, { direct: 0, deeper: 0, unknown: 0, levels: {} })
})

test('recursive-only diagnostics retain the existing fallback and published reason vocabulary', async t => {
  for (const reason of ['corrupt', 'unsupported', 'unavailable']) {
    const f = await mountedFixture(t, { configureBeforeMount: ({ ctx, child }) => {
      child.status = 'running'
      ctx.provide('subagents', { async listDescendants() { return [
        { kind: 'child', id: 'child', parentId: 'root', depth: 1, mode: 'continuable', label: 'readable', activity: 'running', hasChildren: false },
        { kind: 'diagnostic', id: 'unreadable', parentId: 'root', depth: 1, reason },
      ] } })
    } })
    await f.runtime.readSession(caller('root'), 'root', signal()); await settle()
    const snapshot = await f.runtime.readSession(caller('root'), 'root', signal())
    assert.equal(snapshot.windows.S.used, 1)
    assert.equal(snapshot.windows.S.countKnown, false)
    assert.equal(snapshot.windows.S.countReason, 'native-subagent-diagnostic-' + reason)
    assert.deepEqual(snapshot.nativeStops, [])
  }
})

test('malformed direct envelopes degrade instead of certifying an empty catalog', async t => {
  for (const value of [null, {}, 'bad-catalog', [undefined]]) {
    const f = await mountedFixture(t, { configureBeforeMount: ({ ctx, child }) => {
      child.status = 'running'
      ctx.provide('subagents', { async listChildren() { return value } })
    } })
    await f.runtime.readSession(caller('root'), 'root', signal()); await settle()
    const snapshot = await f.runtime.readSession(caller('root'), 'root', signal())
    assert.equal(snapshot.windows.S.used, 1)
    assert.equal(snapshot.windows.S.countKnown, false)
    assert.equal(snapshot.windows.S.countReason, 'native-subagent-diagnostic-invalid')
  }
})

test('a rejected direct query preserves the running lower bound and never falls back to a whole-tree walk', async t => {
  let walks = 0
  const f = await mountedFixture(t, { configureBeforeMount: ({ ctx, child }) => {
    child.status = 'running'
    ctx.provide('subagents', {
      async listChildren() { throw new Error('query rejected') },
      async listDescendants() { walks += 1; return [] },
    })
  } })
  await f.runtime.readSession(caller('root'), 'root', signal()); await settle()
  const snapshot = await f.runtime.readSession(caller('root'), 'root', signal())
  assert.equal(snapshot.windows.S.used, 1)
  assert.equal(snapshot.windows.S.countKnown, false)
  assert.equal(snapshot.windows.S.countReason, 'native-subagent-listing-rejected')
  assert.deepEqual(snapshot.nativeStops, [])
  assert.equal(walks, 0)
})


test('a timed-out direct query stays off the read path and its late public rows restore coverage', async t => {
  let finish, querySignal, calls = 0, walks = 0
  const f = await mountedFixture(t, { configureBeforeMount: ({ ctx, child }) => {
    child.status = 'running'
    ctx.provide('subagents', {
      listChildren(_owner, signal) { calls += 1; querySignal = signal; return new Promise(resolve => { finish = resolve }) },
      async listDescendants() { walks += 1; throw new Error('whole-subtree listing is forbidden') },
    })
  } })
  const started = performance.now()
  const first = await f.runtime.readSession(caller('root'), 'root', signal())
  assert.equal(first.windows.S.used, 1)
  assert.ok(performance.now() - started < 500, 'the initial read never waits for the 1500ms catalog budget')
  await waitFor(async () => (await f.mounted.ports.nativeSubagentActivity('root')).reason === 'native-subagent-listing-timeout')
  const degraded = await f.runtime.readSession(caller('root'), 'root', signal())
  assert.equal(degraded.windows.S.used, 1)
  assert.equal(degraded.windows.S.countKnown, false)
  assert.equal(degraded.windows.S.countReason, 'native-subagent-listing-timeout')
  assert.equal(querySignal.aborted, false, 'the wait budget must not abort the host projection build')
  for (let i = 0; i < 20; i += 1) f.ctx.emit('session/event', { id: 'root' }, { type: 'subagent/catalog', data: {} })
  await settle()
  assert.equal(calls, 1, 'membership nodes during cooldown do not repeat the in-flight build')
  finish([direct('child'), direct('cold', 'one-shot')])
  await waitFor(async () => (await f.mounted.ports.nativeSubagentActivity('root')).known)
  const restored = await f.runtime.readSession(caller('root'), 'root', signal())
  assert.equal(restored.windows.S.countKnown, true)
  assert.equal(restored.windows.S.countReason, null)
  assert.equal(restored.windows.S.used, 1)
  assert.deepEqual(restored.nativeStops, [], 'late membership publication is not a terminal outcome')
  assert.equal(calls, 1)
  assert.equal(walks, 0)
})

test('an older late direct result cannot replace a newer published diagnostic', async t => {
  let finish, calls = 0
  const f = await mountedFixture(t, { configureBeforeMount: ({ ctx, child }) => {
    child.status = 'running'
    ctx.provide('subagents', { listChildren() {
      calls += 1
      return calls === 1 ? new Promise(resolve => { finish = resolve }) : Promise.resolve([direct('child'), direct('unknown', 'unknown')])
    } })
  } })
  await f.runtime.readSession(caller('root'), 'root', signal())
  await waitFor(async () => (await f.mounted.ports.nativeSubagentActivity('root')).reason === 'native-subagent-listing-timeout')
  // Advance the retry clock only; AbortSignal.timeout keeps its real 1500ms budget.
  const now = Date.now.bind(Date)
  t.mock.method(Date, 'now', () => now() + 31_000)
  f.ctx.emit('session/event', { id: 'root' }, { type: 'subagent/catalog', data: {} })
  await waitFor(async () => (await f.mounted.ports.nativeSubagentActivity('root')).reason === 'native-subagent-diagnostic-unsupported')
  assert.equal(calls, 2)
  finish([direct('child')]); await settle()
  const snapshot = await f.runtime.readSession(caller('root'), 'root', signal())
  assert.equal(snapshot.windows.S.used, 1)
  assert.equal(snapshot.windows.S.countKnown, false)
  assert.equal(snapshot.windows.S.countReason, 'native-subagent-diagnostic-unsupported')
  assert.deepEqual(snapshot.nativeStops, [])
})
