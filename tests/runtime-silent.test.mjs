import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fixture, createRuntime, core, host, caller, operator, actualAgent, signal, deferred, policy, workflow } from './fixtures/runtime-host.mjs'

const onlyB = () => ({ ...policy(), workspaceOverrides: { A: { workspace: { enabled: false } } } })
const worktree = { created: true, path: '/native-created', branch: 'native-created', baseCommit: 'a'.repeat(40), repositoryRoot: '/fixture' }
const stopItem = (sessionId, itemId) => ({ sessionId, itemId, status: 'unsupported', reason: 'failed', turn: 1 })

async function runtimeWithPolicy(t, settings = onlyB()) {
  const f = await fixture(t)
  f.agents.clear()
  for (const a of [actualAgent('a', { cwd: '/a' }), actualAgent('b', { cwd: '/b' }), actualAgent('a-child', { parent: 'a', managed: true, cwd: '/b' })]) f.agents.set(a.id, a)
  const workspaces = new Map([['A', { id: 'A', path: '/a', status: async () => 'ok' }], ['B', { id: 'B', path: '/b', status: async () => 'ok' }]])
  f.ctx.workspaceRegistry = { get: id => workspaces.get(id), resolveByPath: async path => [...workspaces.values()].find(row => row.path === path) }
  const controlsStorage = new core.MemoryControlsStorage()
  const instrumentStorage = new core.MemoryInstrumentStorage()
  const windowStorage = new core.MemoryWindowStorage()
  const units = new Map()
  const resolved = host.createHostAuthority(f.ctx, controlsStorage, f.grants)
  const controls = new core.WorkspaceControls(controlsStorage, resolved.authority)
  await controls.savePolicy(operator.principalId, settings, 0)
  const unknown = new Set(), faults = new Set(), factReads = [], baselineReads = []
  const ports = { ...f.ports, ...resolved, controlsStorage, instrumentStorage, windowStorage,
    async openUnitStorage(name, parse) { if (!units.has(name)) units.set(name, new core.MemoryVersionedStorage(parse)); return units.get(name) },
    async openRuntimeStorage(parse) { return ports.openUnitStorage('runtime_bindings', parse) },
    async readSessionPolicy(id) {
      if (faults.has(id)) throw new Error('policy source unreadable')
      if (unknown.has(id)) return undefined
      const seen = new Set()
      while (!seen.has(id)) {
        seen.add(id)
        const trusted = await resolved.authority.resolveSession(id)
        if (!trusted) return undefined
        if (trusted.kind === 'owner') return core.resolvePolicy(await controls.readPolicy(operator.principalId), trusted.controlWorkspaceId, await resolved.authority.verifyWorkspace(trusted.controlWorkspaceId))
        id = trusted.parentSessionId
      }
    },
    async nativeActivity(owner) { baselineReads.push(owner); return f.ports.nativeActivity(owner) },
    async sessionFacts(id, control) { factReads.push(id); return resolved.sessionFacts(id, control) },
  }
  let runtime = await createRuntime(ports)
  t.after(() => runtime.dispose())
  return { ...f, units, unknown, faults, baselineReads, factReads, controlsStorage, instrumentStorage, windowStorage, ports,
    get runtime() { return runtime },
    async reopen() { await runtime.dispose(); runtime = await createRuntime(ports); return runtime },
    async save(intent) { return runtime.savePolicy(operator, intent, (await runtime.readPolicy(operator, signal())).revision, signal()) },
    async created(agent) { f.agents.set(agent.id, agent); await runtime.created(caller(agent.id), signal(), agent) },
    async runtimeDoc() { return units.get('runtime_bindings').read() },
    async summary(id) { return (await runtime.readSummaries(operator, { sessions: [{ sessionId: id }] }, signal())).rows[0] },
  }
}

test('silent and uncertain startup, creation, native edges and worktree results leave no collaboration writes while B observes', async t => {
  const f = await runtimeWithPolicy(t)
  assert.deepEqual((await f.controlsStorage.read()).associations.map(row => row.sessionId), ['b'])
  assert.deepEqual(f.baselineReads, ['b'])
  assert.equal((await f.summary('a')).status, 'unavailable')
  const a = actualAgent('a-new', { parent: 'a', managed: true, cwd: '/b' })
  await f.created(a)
  await f.runtime.observe({ kind: 'subagent-start', local: true, sessionId: a.id, runId: 'a-run', provider: 'spawn', actualAgent: a })
  await f.runtime.observe({ kind: 'native-stop', ownerSessionId: 'a', item: stopItem(a.id, 'silent') })
  assert.deepEqual(await f.runtime.postExecute(caller(a.id), { name: 'enter_worktree', callId: 'silent-tree', rootCallId: 'silent-tree', signal: signal() }, { isError: false, value: worktree }), [])
  assert.deepEqual((await f.controlsStorage.read()).associations.map(row => row.sessionId), ['b'])
  assert.equal(await f.runtimeDoc(), undefined)
  assert.deepEqual(f.gitCalls, [])
  const b = actualAgent('b-new', { parent: 'b', managed: true, cwd: '/a' })
  await f.created(b)
  await f.runtime.observe({ kind: 'subagent-start', local: true, sessionId: b.id, runId: 'b-run', provider: 'spawn', actualAgent: b })
  const enabled = await f.runtimeDoc()
  assert.deepEqual(enabled.nativeExecutions.map(row => row.sessionId), [b.id])
  f.faults.add(b.id)
  await f.runtime.observe({ kind: 'subagent-end', local: true, sessionId: b.id, runId: 'b-run', provider: 'spawn', stopReason: 'error' })
  assert.deepEqual(await f.runtimeDoc(), enabled, 'read failure must not use live or retained enabled evidence')
})

test('existing silent summary omits records and health, preserves prior facts, and a cold reopen does not resume its outbox', async t => {
  const f = await runtimeWithPolicy(t, policy())
  const a = actualAgent('a-new', { parent: 'a', managed: true, cwd: '/b' })
  await f.created(a)
  await f.runtime.applyInstrument(operator, 'a', { action: 'put-workflow', operationId: 'business', expectedRevision: 0, workflowId: 'flow', value: workflow }, signal())
  const before = await f.summary('a')
  assert.equal(before.summary.policy.collaborationEnabled, true)
  assert.equal(before.summary.records.businessRevision, 1)
  await f.save(onlyB())
  const retained = await f.runtimeDoc()
  const factReads = f.factReads.length
  const read = f.instrumentStorage.read.bind(f.instrumentStorage)
  f.instrumentStorage.read = () => { throw new Error('silent summary must not read instruments') }
  const after = await f.summary('a')
  assert.equal(after.status, 'current')
  assert.equal(after.summary.policy.collaborationEnabled, false)
  assert.equal(after.summary.records, null)
  assert.deepEqual(after.summary.health, [])
  assert.equal(f.factReads.length, factReads)
  const notifications = f.notificationCalls.length
  await f.reopen()
  await f.runtime.observe({ kind: 'subagent-end', local: true, sessionId: a.id, runId: 'a-run', provider: 'spawn', stopReason: 'error' })
  await f.runtime.observe({ kind: 'native-stop', ownerSessionId: 'a', item: stopItem(a.id, 'stayed-silent') })
  assert.deepEqual(await f.runtimeDoc(), retained)
  assert.equal(f.notificationCalls.length, notifications)
  f.instrumentStorage.read = read
  await f.save(policy())
  const reenabled = await f.summary('a')
  assert.equal(reenabled.summary.instance.instrumentInstanceId, before.summary.instance.instrumentInstanceId)
  assert.deepEqual(reenabled.summary.records, before.summary.records)
})

test('queued native-stop behind a policy save cannot wake or journal a silent workspace', async t => {
  const f = await runtimeWithPolicy(t, policy())
  const saved = deferred(), release = deferred()
  const cas = f.controlsStorage.compareAndSwap.bind(f.controlsStorage)
  f.controlsStorage.compareAndSwap = async (revision, next) => {
    if (next.policy.revision === 2) { saved.resolve(); await release.promise }
    return cas(revision, next)
  }
  const switching = f.save(onlyB())
  await saved.promise
  const stop = f.runtime.observe({ kind: 'native-stop', ownerSessionId: 'a', item: stopItem('a-child', 'queued') })
  release.resolve()
  await Promise.all([switching, stop])
  assert.equal(await f.runtimeDoc(), undefined)
  assert.deepEqual(f.notificationCalls, [])
})

test('detached worktree replay rechecks after reading native events and does not write after disable', async t => {
  const f = await runtimeWithPolicy(t, policy())
  const factsStarted = deferred(), releaseFacts = deferred()
  const sessionFacts = f.ports.sessionFacts
  f.ports.sessionFacts = async (id, control) => {
    const facts = await sessionFacts(id, control)
    if (id !== 'a-child') return facts
    factsStarted.resolve()
    await releaseFacts.promise
    return { ...facts, events: [
      { type: 'tool/call', data: { name: 'enter_worktree', callId: 'retained-call' } },
      { type: 'tool/result', data: { message: { toolCallId: 'retained-call', content: [{ type: 'text', text: JSON.stringify(worktree) }] } } },
    ] }
  }
  const snapshot = await f.runtime.readSession(caller('a'), 'a', signal())
  assert.deepEqual(snapshot.worktreeObservations, [])
  await factsStarted.promise
  await f.save(onlyB())
  releaseFacts.resolve()
  await new Promise(resolve => setImmediate(resolve))
  await f.runtime.serializePolicyPermission(async () => {})
  for (const [name, unit] of f.units) if (name.startsWith('worktree_observations_')) assert.equal(await unit.read(), undefined)
  assert.deepEqual(f.gitCalls, [])
})

test('a native runtime CAS already in flight settles before disable; later edges do not change it', async t => {
  const f = await runtimeWithPolicy(t, policy())
  const child = actualAgent('a-new', { parent: 'a', managed: true })
  await f.created(child)
  const started = deferred(), release = deferred()
  const runtimeStorage = f.units.get('runtime_bindings'), cas = runtimeStorage.compareAndSwap.bind(runtimeStorage)
  runtimeStorage.compareAndSwap = async (revision, next) => { started.resolve(); await release.promise; return cas(revision, next) }
  const start = f.runtime.observe({ kind: 'subagent-start', local: true, sessionId: child.id, runId: 'a-run', provider: 'spawn', actualAgent: child })
  await started.promise
  const switching = f.save(onlyB())
  release.resolve()
  await Promise.all([start, switching])
  const committed = await f.runtimeDoc()
  assert.equal(committed.nativeExecutions.find(row => row.sessionId === child.id).runId, 'a-run')
  await f.runtime.observe({ kind: 'subagent-end', local: true, sessionId: child.id, runId: 'a-run', provider: 'spawn', stopReason: 'error', actualAgent: child })
  assert.deepEqual(await f.runtimeDoc(), committed)
})
