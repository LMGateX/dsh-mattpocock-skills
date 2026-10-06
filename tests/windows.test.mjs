import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registerHooks } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

// Source-only mechanical harness: transpile in memory, never emit/rebuild lib.
// Existing core uses parameter properties, so native strip-types alone is insufficient.
const sourceRoot = new URL('../src/controls/', import.meta.url).href
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.startsWith(sourceRoot) && specifier.endsWith('.js') && specifier.startsWith('.')) {
      const candidate = new URL(specifier.slice(0, -3) + '.ts', context.parentURL)
      if (existsSync(candidate)) return { url: candidate.href, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
  load(url, context, nextLoad) {
    if (url.startsWith(sourceRoot) && url.endsWith('.ts')) {
      const source = ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, verbatimModuleSyntax: true },
        fileName: fileURLToPath(url),
      }).outputText
      return { format: 'module', source, shortCircuit: true }
    }
    return nextLoad(url, context)
  },
})
const { WorkspaceControls, MemoryControlsStorage, SessionInstruments, MemoryInstrumentStorage } = await import('../src/controls/index.ts')
const { SessionWindows, MemoryWindowStorage, createDomainWindowStorage, parseWindowDocument } = await import('../src/controls/windows.ts')
const { ControlsError } = await import('../src/controls/validation.ts')
let fixtureSerial = 0
async function fixture({ T = 3, S = 2, capability = 'cooperative', runtimeId = 'boot-1', storage = new MemoryWindowStorage(), disabled = false, unset = false, requireKnownRuntime = false, childWorkflowId = 'flow' } = {}) {
  const serial = ++fixtureSerial
  const controls = new WorkspaceControls(new MemoryControlsStorage(), {
    async authorizePolicy(p) { if (p !== 'owner') throw new ControlsError('access-denied', 'policy denied') },
    async authorizeSession(p, session) { if (p === 'intruder' || !['root', 'child', 'grandchild', 'other'].includes(session)) throw new ControlsError('access-denied', 'session denied') },
    async resolveSession(session) { return session === 'child' ? { kind: 'managed-child', parentSessionId: 'root' }
      : session === 'grandchild' ? { kind: 'managed-child', parentSessionId: 'child' } : { kind: 'owner', controlWorkspaceId: 'workspace' } },
    async verifyWorkspace() { return true },
  }, (() => { let n = 0; return () => 'instance-' + serial + '-' + ++n })())
  const authority = { async resolveAccess(p, session, _instance, access) {
    if (p === 'denied' || (p === 'reader' && access === 'write')) throw new ControlsError('access-denied', 'instrument denied')
    return { author: { kind: 'agent', principalId: p, sessionId: session }, scope: session === 'root' || session === 'other'
      ? { kind: 'coordinator' } : { kind: 'assigned', workflowId: childWorkflowId, ticketIds: childWorkflowId === null ? [] : ['A'] } }
  } }
  let policyRevision = 0
  async function configure(patch = {}) {
    const saved = await controls.savePolicy('owner', { extensionEnabled: true, defaults: {
      windows: { enabled: !disabled, ...(unset ? {} : { ticketWindowSize: T, runningSubagentLimit: S }), ...patch.windows },
      ...(patch.display ? { display: patch.display } : {}),
    }, workspaceOverrides: {} }, policyRevision)
    policyRevision = saved.revision
  }
  await configure()
  await controls.ensureSession('owner', 'grandchild')
  await controls.ensureSession('owner', 'other')
  let leaseSerial = 0
  function open(runtime = runtimeId, cap = capability) {
    let port
    const windows = new SessionWindows(controls, storage, authority, { runtimeId: runtime, capability: cap, requireKnownRuntime,
      bindProgram(value) { port = value }, newLeaseId: () => 'lease-' + serial + '-' + ++leaseSerial })
    return { windows, port }
  }
  const opened = open()
  let operationSerial = 0
  const op = () => 'op-' + serial + '-' + ++operationSerial
  const reserveTicket = (ticket, session = 'root', workflowId = 'flow') => opened.windows.apply('owner', session, { operationId: op(), workflowId, localTicketId: ticket, action: 'reserve' })
  const reserve = (executionId, localTicketId = null, session = 'root', workflowId = 'flow') => opened.port.reserveExecution('owner', session, { operationId: op(), executionId, workflowId, localTicketId })
  const receipt = (reservation, state, port = opened.port) => port.receipt({ ...reservation.token, operationId: op(), state })
  return { ...opened, controls, authority, storage, op, reserveTicket, reserve, receipt, configure, open }
}
const rejectsCode = (promise, code) => assert.rejects(promise, error => error.code === code)

test('T advisory limit permits overage; explicit release updates T independently of S', async () => {
  const f = await fixture({ T: 3, S: 2 })
  for (const ticket of ['A', 'B', 'C']) await f.reserveTicket(ticket)
  const A = await f.reserve('worker-A', 'A'); await f.reserve('worker-B', 'B')
  const over = await f.reserveTicket('D')
  assert.equal(over.snapshot.T.capacity, 3); assert.equal(over.snapshot.T.used, 4)
  assert.equal(over.snapshot.T.available, 0); assert.equal(over.snapshot.T.overcommitted, true)
  await f.receipt(A, 'released')
  let snap = await f.windows.read('owner', 'root')
  assert.equal(snap.T.used, 4); assert.equal(snap.S.used, 1)
  const merge = await f.reserve('merger-A', 'A')
  await f.windows.apply('owner', 'root', { operationId: f.op(), action: 'release', workflowId: 'flow', localTicketId: 'A', generation: 1 })
  await f.reserveTicket('D')
  snap = await f.windows.read('owner', 'root')
  assert.equal(snap.T.used, 3); assert.equal(snap.S.used, 2)
  assert.deepEqual(snap.tickets.filter(t => t.held).map(t => t.localTicketId).sort(), ['B', 'C', 'D'])
  assert.equal(snap.executions.find(e => e.leaseId === merge.token.leaseId).state, 'reserved')
})

test('S=1 remains advisory throughout trusted execution states; ticketless research never occupies T', async () => {
  const f = await fixture({ T: 4, S: 1 })
  const A = await f.reserve('research')
  for (const state of ['accepted', 'scheduled', 'running', 'stopping']) {
    await f.receipt(A, state)
    const snap = await f.windows.read('owner', 'root')
    assert.equal(snap.S.used, 1); assert.equal(snap.S.byState[state], 1); assert.equal(snap.T.used, 0)
    const extra = await f.reserve('next')
    assert.equal(extra.dispatchable, true); assert.equal(extra.snapshot.S.used, 2)
    assert.equal(extra.snapshot.S.available, 0); assert.equal(extra.snapshot.S.overcommitted, true)
    await f.receipt(extra, 'released')
  }
  await f.receipt(A, 'released')
  await f.reserve('next')
  const snap = await f.windows.read('owner', 'root')
  assert.equal(snap.S.used, 1); assert.equal(snap.S.available, 0); assert.equal(snap.T.used, 0)
  assert.equal(snap.executions.find(e => e.executionId === 'next').localTicketId, null)
  assert.equal(snap.executions.find(e => e.executionId === 'next').ticketApplicable, false)
  assert.equal(snap.executions.find(e => e.executionId === 'next').ticketReason, 'no-ticket-assignment')
})

test('same ticket and same live execution are not double counted; operation replay is durable and payload scoped', async () => {
  const f = await fixture({ T: 1, S: 1 })
  const command = { operationId: f.op(), action: 'reserve', workflowId: 'flow', localTicketId: 'A' }
  const first = await f.windows.apply('owner', 'root', command)
  const replay = await f.windows.apply('owner', 'root', command)
  assert.equal(replay.replayed, true); assert.equal(replay.appliedRevision, first.appliedRevision)
  await f.reserveTicket('A', 'grandchild')
  const request = { operationId: f.op(), executionId: 'activation', workflowId: 'flow', localTicketId: 'A' }
  const execution = await f.port.reserveExecution('owner', 'root', request)
  const second = await f.reserve('activation', 'A', 'grandchild')
  assert.deepEqual(second.token, execution.token); assert.equal(second.dispatchable, false)
  const replayExecution = await f.port.reserveExecution('owner', 'root', request)
  assert.equal(replayExecution.replayed, true); assert.equal(replayExecution.dispatchable, false)
  await rejectsCode(f.windows.apply('someone-else', 'root', command), 'operation-conflict')
  await rejectsCode(f.port.reserveExecution('owner', 'root', { ...request, localTicketId: null }), 'operation-conflict')
  const snap = await f.windows.read('owner', 'root')
  assert.equal(snap.T.used, 1); assert.equal(snap.S.used, 1)
})

test('ticket release/reacquire generations fence late release and stale reacquire intents', async () => {
  const f = await fixture({ T: 1 })
  await f.reserveTicket('A')
  const release = { operationId: f.op(), action: 'release', workflowId: 'flow', localTicketId: 'A', generation: 1 }
  await f.windows.apply('owner', 'root', release)
  await rejectsCode(f.reserveTicket('A'), 'operation-conflict')
  const reacquire = { operationId: f.op(), action: 'reacquire', workflowId: 'flow', localTicketId: 'A', generation: 1 }
  const restored = await f.windows.apply('owner', 'root', reacquire)
  assert.equal(restored.generation, 2)
  assert.equal((await f.windows.apply('owner', 'root', release)).replayed, true)
  assert.equal((await f.windows.apply('owner', 'root', { ...release, operationId: f.op() })).ignored, true)
  assert.equal((await f.windows.apply('owner', 'root', { ...reacquire, operationId: f.op() })).ignored, true)
  assert.equal((await f.windows.read('owner', 'root')).T.used, 1)
})

test('late/duplicate old S release never releases cold-wake generation; token four-part matching', async () => {
  const f = await fixture({ S: 1 })
  const old = await f.reserve('reusable-child')
  const oldReceipt = { ...old.token, operationId: f.op(), state: 'released' }
  await f.port.receipt(oldReceipt)
  const live = await f.reserve('reusable-child')
  assert.equal(live.token.generation, 2); assert.notEqual(live.token.leaseId, old.token.leaseId)
  assert.equal((await f.port.receipt(oldReceipt)).replayed, true)
  assert.equal((await f.port.receipt({ ...oldReceipt, operationId: f.op() })).ignored, true)
  assert.equal((await f.windows.read('owner', 'root')).S.used, 1)
  for (const corrupt of [{ instrumentInstanceId: 'wrong' }, { executionId: 'wrong' }, { generation: 9 }, { leaseId: 'wrong' }]) {
    await rejectsCode(f.port.receipt({ ...live.token, ...corrupt, operationId: f.op(), state: 'released' }), 'association-conflict')
  }
})

test('parallel reservations preserve all valid over-reference T and S facts, including managed descendants', async () => {
  const f = await fixture({ T: 1, S: 1 })
  const tickets = await Promise.allSettled([f.reserveTicket('A', 'root'), f.reserveTicket('B', 'root')])
  assert.equal(tickets.filter(r => r.status === 'fulfilled').length, 2)
  const executions = await Promise.allSettled([f.reserve('nested-research', null, 'grandchild'), f.reserve('root-research')])
  assert.equal(executions.filter(r => r.status === 'fulfilled').length, 2)
  assert.equal(executions.every(r => r.value.dispatchable), true)
  const snap = await f.windows.read('owner', 'root')
  assert.equal(snap.T.used, 2); assert.equal(snap.S.used, 2)
  assert.equal(snap.T.overage, 1); assert.equal(snap.S.overage, 1)
})

test('root workflows share advisory usage; independent owners in same workspace do not', async () => {
  const f = await fixture({ T: 1, S: 1 })
  await f.reserveTicket('A')
  await f.reserveTicket('A', 'root', 'another-flow')
  const root = await f.reserve('root-execution')
  await f.reserve('child-execution', null, 'child')
  await f.reserveTicket('A', 'other')
  const independent = await f.reserve('other-execution', null, 'other')
  assert.notEqual(root.token.instrumentInstanceId, independent.token.instrumentInstanceId)
  const child = await f.windows.read('owner', 'grandchild')
  assert.equal(child.instance.instrumentInstanceId, root.token.instrumentInstanceId)
  assert.equal(child.T.used, 2); assert.equal(child.S.used, 2)
  assert.equal(independent.snapshot.T.used, 1); assert.equal(independent.snapshot.S.used, 1)
})

test('assigned scopes cannot borrow another ticket or workflow; filtered details retain full instance totals', async () => {
  const f = await fixture()
  await f.reserveTicket('A'); await f.reserveTicket('B'); await f.reserve('B-worker', 'B')
  const child = await f.windows.read('owner', 'child')
  assert.equal(child.T.used, 2); assert.equal(child.S.used, 1)
  assert.equal(child.tickets.length, 1); assert.equal(child.executions.length, 0)
  await rejectsCode(f.reserveTicket('B', 'child'), 'access-denied')
  await rejectsCode(f.reserve('foreign', null, 'child', 'foreign-flow'), 'access-denied')
  await rejectsCode(f.windows.read('intruder', 'root'), 'access-denied')
  await rejectsCode(f.windows.apply('reader', 'root', { operationId: f.op(), action: 'reserve', workflowId: 'flow', localTicketId: 'A' }), 'access-denied')
})

test('restart recovery retains T and all S holds; replay cannot authorize dispatch until reconciliation', async () => {
  const f = await fixture({ S: 3 })
  await f.reserveTicket('A')
  const request = { operationId: f.op(), executionId: 'worker', workflowId: 'flow', localTicketId: 'A' }
  const reservation = await f.port.reserveExecution('owner', 'root', request)
  await f.receipt(reservation, 'running')
  const restarted = f.open('boot-2')
  let snap = await restarted.windows.read('owner', 'root')
  assert.equal(snap.status, 'reconciling'); assert.equal(snap.S.used, 1); assert.equal(snap.S.available, 2); assert.equal(snap.T.used, 1)
  assert.equal(snap.S.countKnown, false)
  const replay = await restarted.port.reserveExecution('owner', 'root', request)
  assert.equal(replay.replayed, true); assert.equal(replay.dispatchable, false)
  const fresh = await restarted.port.reserveExecution('owner', 'root', { operationId: f.op(), executionId: 'new', workflowId: 'flow', localTicketId: null })
  assert.equal(fresh.dispatchable, true)
  await f.receipt(fresh, 'released', restarted.port)
  await f.receipt(reservation, 'running', restarted.port) // trusted runtime inspection, not silence
  snap = await restarted.windows.read('owner', 'root')
  assert.equal(snap.status, 'ready'); assert.equal(snap.S.used, 1); assert.equal(snap.S.available, 2)
  await f.receipt(reservation, 'released', restarted.port)
  assert.equal((await restarted.windows.read('owner', 'root')).S.used, 0)
})

test('unknown retains registered usage including config off; new dispatch stays advisory', async () => {
  const f = await fixture({ S: 3 })
  const held = await f.reserve('uncertain')
  await f.receipt(held, 'unknown')
  let snap = await f.windows.read('owner', 'root')
  assert.equal(snap.S.used, 1); assert.equal(snap.S.available, 2); assert.equal(snap.S.byState.unknown, 1)
  assert.equal(snap.S.countKnown, false)
  await f.configure({ windows: { enabled: false } })
  const fresh = await f.reserve('new-identity-with-unknown')
  assert.equal(fresh.dispatchable, true)
  await f.receipt(fresh, 'released')
  await f.receipt(held, 'running')
  snap = await f.windows.read('owner', 'root')
  assert.equal(snap.status, 'disabled'); assert.equal(snap.S.used, 1)
})

test('hot shrink is overcommitted without killing; display off changes no accounting or capability', async () => {
  const f = await fixture({ T: 3, S: 3 })
  for (const ticket of ['A', 'B', 'C']) await f.reserveTicket(ticket)
  const executions = []
  for (const ticket of ['A', 'B', 'C']) executions.push(await f.reserve('worker-' + ticket, ticket))
  await f.configure({ windows: { ticketWindowSize: 1, runningSubagentLimit: 1 }, display: { header: false, inputSummary: false, rightPanel: false, sessionList: false, timeline: false } })
  let snap = await f.windows.read('owner', 'root')
  assert.equal(snap.status, 'overcommitted'); assert.equal(snap.T.used, 3); assert.equal(snap.S.used, 3)
  assert.equal(snap.T.overcommitted, true); assert.equal(snap.S.overcommitted, true)
  const over = await f.reserve('new')
  assert.equal(over.dispatchable, true); assert.equal(over.snapshot.S.overage, 3)
  await f.receipt(executions[0], 'released')
  snap = await f.windows.read('owner', 'root')
  assert.equal(snap.S.used, 3); assert.equal(snap.S.available, 0); assert.equal(snap.S.overage, 2)
})

test('config off preserves leases, permits trusted release, disables new T and explicitly lifts S cap', async () => {
  const f = await fixture({ T: 1, S: 1 })
  await f.reserveTicket('A'); const held = await f.reserve('existing', 'A')
  await f.configure({ windows: { enabled: false } })
  let snap = await f.windows.read('owner', 'root')
  assert.equal(snap.status, 'disabled'); assert.equal(snap.T.used, 1); assert.equal(snap.S.used, 1); assert.equal(snap.S.available, null)
  await rejectsCode(f.reserveTicket('B'), 'feature-disabled')
  await f.reserve('unlimited-research')
  await f.receipt(held, 'released')
  await f.windows.apply('owner', 'root', { operationId: f.op(), workflowId: 'flow', localTicketId: 'A', action: 'release', generation: 1 })
  snap = await f.windows.read('owner', 'root')
  assert.equal(snap.T.used, 0); assert.equal(snap.S.used, 1)
  await f.configure({ windows: { enabled: true } })
  const reenabled = await f.reserve('re-enabled-full')
  assert.equal(reenabled.dispatchable, true); assert.equal(reenabled.snapshot.S.overage, 1)
})

test('unset capacity and unsupported host capabilities never guess a default or claim enforcement', async () => {
  const unset = await fixture({ unset: true })
  const snap = await unset.windows.read('owner', 'root')
  assert.equal(snap.status, 'unsupported'); assert.equal(snap.T.capacity, null); assert.equal(snap.S.capacity, null)
  const unconfigured = await unset.reserve('research')
  assert.equal(unconfigured.dispatchable, true); assert.equal(unconfigured.snapshot.S.used, 1)
  assert.equal(unconfigured.snapshot.S.capacity, null); assert.equal(unconfigured.snapshot.S.available, null)
  const ticket = await unset.reserveTicket('A')
  assert.equal(ticket.snapshot.T.used, 1); assert.equal(ticket.snapshot.T.available, null)
  const unsupported = await fixture({ capability: 'unsupported' })
  const noCoverage = await unsupported.windows.read('owner', 'root')
  assert.equal(noCoverage.capability, 'unsupported')
  assert.equal(noCoverage.runtimeKnowledge.known, false)
  assert.equal(noCoverage.runtimeKnowledge.reason, 'host-observation-unsupported')
  const unobserved = await unsupported.reserve('research')
  assert.equal(unobserved.dispatchable, true); assert.equal(unobserved.snapshot.S.used, 1)
  const cooperative = await fixture()
  assert.equal((await cooperative.windows.read('owner', 'root')).capability, 'cooperative')
})

test('business interface is closed: no receipt tool, text, labels, model release or forged caller fields', async () => {
  const f = await fixture()
  assert.deepEqual(Object.getOwnPropertyNames(SessionWindows.prototype).sort(), ['apply', 'constructor', 'read'])
  assert.deepEqual(Object.keys(f.windows), [])
  assert.equal(Object.isFrozen(f.port), true)
  const reservation = await f.reserve('worker')
  for (const extra of [{ receipt: { ...reservation.token, state: 'released' } }, { state: 'released' }, { label: 'done' }, { principal: 'owner' }, { silenceMs: 1000000 }, { message: 'I finished' }]) {
    await rejectsCode(f.windows.apply('owner', 'root', { operationId: f.op(), action: 'reserve', workflowId: 'flow', localTicketId: 'A', ...extra }), 'invalid-input')
  }
  await rejectsCode(f.windows.apply('owner', 'root', { ...reservation.token, operationId: f.op(), action: 'released' }), 'invalid-input')
  assert.equal((await f.windows.read('owner', 'root')).S.used, 1)
})

test('ticket-linked execution does not require T occupancy; execution assignment remains fenced on reuse', async () => {
  const f = await fixture()
  const linked = await f.reserve('linked', 'A')
  assert.equal(linked.dispatchable, true)
  assert.equal(linked.snapshot.T.used, 0); assert.equal(linked.snapshot.S.used, 1)
  assert.equal(linked.snapshot.executions[0].ticketApplicable, true)
  await f.reserveTicket('A')
  await rejectsCode(f.reserve('linked', null), 'association-conflict')
  await f.receipt(linked, 'released')
  await rejectsCode(f.reserve('linked', null), 'association-conflict')
})

test('strict persisted parsing rejects corruption rather than resetting accounting', async () => {
  const f = await fixture()
  await f.reserveTicket('A'); await f.reserve('worker', 'A')
  const instanceId = (await f.windows.read('owner', 'root')).instance.instrumentInstanceId
  const valid = await f.storage.read(instanceId)
  const changes = [
    doc => { doc.schemaVersion = 2 },
    doc => { doc.tickets[0].held = false },
    doc => { doc.executions[0].state = 'released' },
    doc => { doc.executions = [] },
    doc => { doc.operations = [] },
    doc => { doc.executions[0].generation = 7 },
    doc => { doc.extra = 'unknown' },
    doc => { doc.tickets = new Array(1) },
    doc => { Object.defineProperty(doc, 'revision', { get() { throw new Error('getter must not execute') }, enumerable: true }) },
  ]
  for (const mutate of changes) {
    const corrupt = structuredClone(valid); mutate(corrupt)
    assert.throws(() => parseWindowDocument(corrupt), error => error.code === 'invalid-state')
  }
  assert.equal(Object.isFrozen(parseWindowDocument(valid)), true)
  await rejectsCode(f.storage.compareAndSwap('foreign-instance', valid.revision - 1, valid), 'association-conflict')
})

function mechanicalTable({ failAfterCommit = false, seed } = {}) {
  const rows = new Map(seed ?? [])
  let writes = 0
  return { rows, get writes() { return writes }, get(key) { return rows.get(key) },
    async put(key, value) { rows.set(key, structuredClone(value)); writes++; if (failAfterCommit) throw new Error('lost durable acknowledgement') },
    async update(key, fn) { const value = fn(rows.get(key)); rows.set(key, structuredClone(value)); writes++; if (failAfterCommit) throw new Error('lost durable acknowledgement'); return value },
  }
}

test('single-table adapter shares first-write serialization and indeterminate failure across instances', async () => {
  const table = mechanicalTable()
  const storage = createDomainWindowStorage(table)
  assert.equal(storage, createDomainWindowStorage(table))
  const f = await fixture({ T: 1, S: 1, storage })
  const race = await Promise.allSettled([f.reserve('one'), f.reserve('two')])
  assert.equal(race.filter(r => r.status === 'fulfilled').length, 2)
  assert.equal(table.writes, 2)
  assert.equal((await f.windows.read('owner', 'root')).S.used, 2)
  const failingTable = mechanicalTable({ failAfterCommit: true })
  const uncertain = await fixture({ storage: createDomainWindowStorage(failingTable) })
  await assert.rejects(uncertain.reserve('committed-but-unacknowledged'), /lost durable acknowledgement/)
  await rejectsCode(uncertain.windows.read('owner', 'root'), 'storage-uncertain')
  await rejectsCode(uncertain.windows.read('owner', 'other'), 'storage-uncertain')
  const freshHandle = mechanicalTable({ seed: failingTable.rows })
  let port
  const reopened = new SessionWindows(uncertain.controls, createDomainWindowStorage(freshHandle), uncertain.authority,
    { runtimeId: 'fresh-boot', capability: 'cooperative', bindProgram(value) { port = value } })
  const recovered = await reopened.read('owner', 'root')
  assert.equal(recovered.S.used, 1); assert.equal(recovered.S.byState.unknown, 1); assert.equal(recovered.S.available, 1)
  assert.equal(recovered.S.countKnown, false)
  await rejectsCode(port.receipt({ ...recovered.executions[0], operationId: uncertain.op(), state: 'released', workflowId: undefined }), 'invalid-input')
  const held = recovered.executions[0]
  await port.receipt({ instrumentInstanceId: held.instrumentInstanceId, executionId: held.executionId, generation: held.generation, leaseId: held.leaseId, operationId: uncertain.op(), state: 'released' })
  assert.equal((await reopened.read('owner', 'root')).S.used, 0)
})

test('concurrent same execution reservations converge on one slot; ticketless assignment preserves other T', async () => {
  const f = await fixture({ T: 1, S: 1 })
  await f.reserveTicket('A')
  const results = await Promise.all([f.reserve('shared'), f.reserve('shared', null, 'child')])
  assert.deepEqual(results[0].token, results[1].token)
  const snapshot = await f.windows.read('owner', 'root')
  assert.equal(snapshot.T.used, 1); assert.equal(snapshot.S.used, 1)
})

test('CAS retry refreshes saved controls policy rather than using an old capacity snapshot', async () => {
  const base = new MemoryWindowStorage()
  let intercept
  const storage = { read: id => base.read(id), async compareAndSwap(id, expected, next) {
    if (intercept) { const action = intercept; intercept = undefined; await action(); return false }
    return base.compareAndSwap(id, expected, next)
  } }
  const f = await fixture({ T: 2, S: 2, storage })
  await f.reserve('already-held')
  intercept = () => f.configure({ windows: { runningSubagentLimit: 1 } })
  const result = await f.reserve('uses-current-reference')
  assert.equal(result.dispatchable, true); assert.equal(result.snapshot.S.capacity, 1)
  assert.equal(result.snapshot.S.overage, 1)
  const snapshot = await f.windows.read('owner', 'root')
  assert.equal(snapshot.S.used, 2); assert.equal(snapshot.S.capacity, 1)
})

test('all nonterminal restart states hold S; terminal tombstones remain released', async () => {
  for (const initialState of ['reserved', 'accepted', 'scheduled', 'running', 'stopping', 'unknown', 'released']) {
    const f = await fixture()
    const reservation = await f.reserve('execution')
    if (initialState !== 'reserved') await f.receipt(reservation, initialState)
    const restarted = f.open('new-boot')
    const snapshot = await restarted.windows.read('owner', 'root')
    assert.equal(snapshot.S.used, initialState === 'released' ? 0 : 1)
    assert.equal(snapshot.S.byState.unknown, initialState === 'released' ? 0 : 1)
    assert.equal(snapshot.S.available, initialState === 'released' ? 2 : 1)
    if (initialState !== 'released') assert.equal(snapshot.S.countKnown, false)
  }
})

test('command detachment and actual-author checks prevent mutable intent and identity spoofing', async () => {
  const f = await fixture()
  const command = { operationId: f.op(), action: 'reserve', workflowId: 'flow', localTicketId: 'A' }
  const applying = f.windows.apply('owner', 'root', command)
  command.localTicketId = 'B'
  const committed = await applying
  assert.equal(committed.snapshot.tickets[0].localTicketId, 'A')
  assert.throws(() => { committed.snapshot.tickets[0].held = false }, TypeError)
  let port
  const forged = new SessionWindows(f.controls, f.storage, {
    async resolveAccess() { return { author: { kind: 'agent', principalId: 'someone-else', sessionId: 'root' }, scope: { kind: 'coordinator' } } },
  }, { runtimeId: 'boot-1', capability: 'cooperative', bindProgram(value) { port = value } })
  await rejectsCode(forged.read('owner', 'root'), 'access-denied')
  await rejectsCode(port.reserveExecution('owner', 'root', { operationId: f.op(), executionId: 'bad-author', workflowId: 'flow', localTicketId: null }), 'access-denied')
})

test('capability downgrade marks unknown coverage without blocking a valid live reservation', async () => {
  const f = await fixture()
  const request = { operationId: f.op(), executionId: 'existing', workflowId: 'flow', localTicketId: null }
  await f.port.reserveExecution('owner', 'root', request)
  const unsupported = f.open('boot-1', 'unsupported')
  const replay = await unsupported.port.reserveExecution('owner', 'root', request)
  assert.equal(replay.dispatchable, false); assert.equal(replay.snapshot.S.used, 1)
  assert.equal(replay.replayed, true); assert.equal(replay.snapshot.S.countKnown, false)
  assert.equal(replay.snapshot.status, 'unsupported')
  const fresh = await unsupported.port.reserveExecution('owner', 'root', { ...request, operationId: f.op(), executionId: 'new-without-native-coverage' })
  assert.equal(fresh.dispatchable, true); assert.equal(fresh.snapshot.S.countKnown, false)
})

test('bounded repeated CAS contention gives a mechanical diagnostic and never publishes phantom usage', async () => {
  const base = new MemoryWindowStorage()
  let attempts = 0
  const f = await fixture({ storage: { read: id => base.read(id), async compareAndSwap() { attempts++; return false } } })
  await rejectsCode(f.reserve('cannot-commit'), 'concurrent-update')
  assert.equal(attempts, 32)
  assert.equal((await f.windows.read('owner', 'root')).S.used, 0)
})

test('runtime knowledge remains factual and advisory; unknown never blocks new execution identities', async () => {
  const f = await fixture({ requireKnownRuntime: true })
  let snapshot = await f.windows.read('owner', 'root')
  assert.equal(snapshot.status, 'reconciling'); assert.equal(snapshot.runtimeKnowledge.known, false)
  assert.equal(snapshot.S.used, 0); assert.equal(snapshot.S.available, 2); assert.equal(snapshot.S.countKnown, false)
  const initial = await f.reserve('before-enumeration')
  assert.equal(initial.dispatchable, true)
  await f.receipt(initial, 'released')
  const known = { operationId: f.op(), state: 'known', reason: null }
  await f.port.reconcileKnowledge('owner', 'root', known)
  const held = await f.reserve('managed')
  await f.port.reconcileKnowledge('owner', 'root', { operationId: f.op(), state: 'unknown', reason: 'unmanaged-native-active' })
  snapshot = await f.windows.read('owner', 'root')
  assert.equal(snapshot.status, 'reconciling'); assert.equal(snapshot.runtimeKnowledge.reason, 'unmanaged-native-active')
  assert.equal(snapshot.S.used, 1); assert.equal(snapshot.S.available, 1); assert.equal(snapshot.S.countKnown, false)
  const duringGap = await f.reserve('native-observation-gap')
  assert.equal(duringGap.dispatchable, true)
  assert.equal(duringGap.snapshot.runtimeKnowledge.known, false)
  await f.receipt(duringGap, 'released')
  assert.equal((await f.reserveTicket('A')).snapshot.T.used, 1) // T intent never needs S/native program proof
  await rejectsCode(f.port.reconcileKnowledge('owner', 'child', { operationId: f.op(), state: 'known', reason: null }), 'access-denied')
  await rejectsCode(f.windows.apply('owner', 'root', { operationId: f.op(), action: 'reserve', workflowId: 'flow', localTicketId: 'A', knowledge: 'known' }), 'invalid-input')
  await f.port.reconcileKnowledge('owner', 'root', { operationId: f.op(), state: 'known', reason: null })
  await f.receipt(held, 'unknown')
  await f.port.reconcileKnowledge('owner', 'root', { operationId: f.op(), state: 'known', reason: null })
  snapshot = await f.windows.read('owner', 'root')
  assert.equal(snapshot.runtimeKnowledge.known, true); assert.equal(snapshot.S.byState.unknown, 1); assert.equal(snapshot.S.available, 1)
  assert.equal(snapshot.S.countKnown, false)
  await f.receipt(held, 'released')
  await f.reserve('after-program-proof')
})

test('restart invalidates runtime knowledge even with no execution leases; old known replay is not new proof', async () => {
  const f = await fixture({ requireKnownRuntime: true })
  const known = { operationId: f.op(), state: 'known', reason: null }
  await f.port.reconcileKnowledge('owner', 'root', known)
  assert.equal((await f.windows.read('owner', 'root')).status, 'ready')
  const restarted = f.open('boot-2')
  assert.equal((await restarted.windows.read('owner', 'root')).status, 'reconciling')
  assert.equal((await restarted.port.reconcileKnowledge('owner', 'root', known)).replayed, true)
  assert.equal((await restarted.windows.read('owner', 'root')).status, 'reconciling')
  await restarted.port.reconcileKnowledge('owner', 'root', { ...known, operationId: f.op() })
  assert.equal((await restarted.windows.read('owner', 'root')).status, 'ready')
})

test('trusted unknown observation survives config off without blocking valid dispatch', async () => {
  const f = await fixture()
  await f.port.reconcileKnowledge('owner', 'root', { operationId: f.op(), state: 'unknown', reason: 'missing-program-proof' })
  await f.configure({ windows: { enabled: false } })
  assert.equal((await f.windows.read('owner', 'root')).S.available, null)
  const dispatch = await f.reserve('off-cannot-clear-unknown')
  assert.equal(dispatch.dispatchable, true); assert.equal(dispatch.snapshot.runtimeKnowledge.known, false)
  assert.equal(dispatch.snapshot.runtimeKnowledge.reason, 'missing-program-proof')
  await rejectsCode(f.port.reconcileKnowledge('owner', 'root', { operationId: f.op(), state: 'known', reason: 'not-a-proof' }), 'invalid-input')
})

test('pre-workflow research reserves only S; null-scoped descendants inherit no business permissions', async () => {
  const f = await fixture({ T: 1, S: 3, childWorkflowId: null })
  const rootResearch = await f.reserve('pre-workflow-root', null, 'root', null)
  const childResearch = await f.reserve('pre-workflow-child', null, 'grandchild', null)
  await f.reserveTicket('A')
  await f.reserve('real-ticket-worker', 'A')
  const childSnapshot = await f.windows.read('owner', 'grandchild')
  assert.equal(childSnapshot.scope.workflowId, null)
  assert.equal(childSnapshot.T.used, 1); assert.equal(childSnapshot.S.used, 3)
  assert.deepEqual(childSnapshot.tickets, [])
  assert.deepEqual(childSnapshot.executions.map(row => row.executionId).sort(), ['pre-workflow-child', 'pre-workflow-root'])
  assert.equal(childSnapshot.executions.every(row => row.workflowId === null && row.localTicketId === null && !row.ticketApplicable), true)
  await rejectsCode(f.reserveTicket('A', 'grandchild'), 'access-denied')
  await rejectsCode(f.reserve('other-workflow', null, 'grandchild', 'flow'), 'access-denied')
  await rejectsCode(f.reserve('invalid-null-workflow-ticket', 'A', 'root', null), 'invalid-input')
  await rejectsCode(f.windows.apply('owner', 'root', { operationId: f.op(), workflowId: null, localTicketId: 'A', action: 'reserve' }), 'invalid-input')
  await rejectsCode(f.reserve('pre-workflow-child', null, 'grandchild', 'flow'), 'access-denied')
  await f.receipt(rootResearch, 'released')
  const cold = await f.reserve('pre-workflow-root', null, 'root', null)
  assert.equal(cold.token.generation, 2)
  await f.receipt(childResearch, 'released')
  assert.equal((await f.windows.read('owner', 'root')).T.used, 1)
  const persisted = await f.storage.read(cold.token.instrumentInstanceId)
  assert.equal(parseWindowDocument(persisted).executions.find(row => row.leaseId === cold.token.leaseId).workflowId, null)
})

test('null assignment reads actual business module empty and cannot write real workflow records', async () => {
  const f = await fixture({ childWorkflowId: null })
  const instruments = new SessionInstruments(f.controls, new MemoryInstrumentStorage(), f.authority)
  await f.controls.savePolicy('owner', { extensionEnabled: true, defaults: { windows: { enabled: true, ticketWindowSize: 3, runningSubagentLimit: 2 }, ticketProgress: { enabled: true }, pendingDecisions: { enabled: true } }, workspaceOverrides: {} }, 1)
  await instruments.apply('owner', 'root', { operationId: f.op(), expectedRevision: 0, workflowId: 'real-flow', action: 'put-workflow', value: { title: 'Real task', axes: [] } })
  await instruments.apply('owner', 'root', { operationId: f.op(), expectedRevision: 1, workflowId: 'real-flow', action: 'put-ticket', localTicketId: 'A', value: { title: 'Real ticket', statuses: {} } })
  const childBusiness = await instruments.read('owner', 'child')
  assert.deepEqual(childBusiness.workflows, []); assert.deepEqual(childBusiness.tickets, []); assert.deepEqual(childBusiness.decisions, [])
  await rejectsCode(instruments.apply('owner', 'child', { operationId: f.op(), expectedRevision: 2, workflowId: 'real-flow', action: 'put-ticket', localTicketId: 'A', value: { title: 'Not assigned', statuses: {} } }), 'access-denied')
  const research = await f.reserve('no-business-workflow-needed', null, 'child', null)
  assert.equal(research.dispatchable, true)
  assert.equal(research.snapshot.T.used, 0)
})

test('nullable execution workflow remains strict in persisted leases and trusted assignment parsing', async () => {
  const f = await fixture()
  await f.reserveTicket('A')
  const linked = await f.reserve('linked', 'A')
  const document = structuredClone(await f.storage.read(linked.token.instrumentInstanceId))
  document.executions[0].workflowId = null
  assert.throws(() => parseWindowDocument(document), error => error.code === 'invalid-state')
  let port
  const contradictoryScope = new SessionWindows(f.controls, f.storage, {
    async resolveAccess(p, session) { return { author: { kind: 'agent', principalId: p, sessionId: session }, scope: { kind: 'assigned', workflowId: null, ticketIds: ['A'] } } },
  }, { runtimeId: 'boot-1', capability: 'cooperative', bindProgram(value) { port = value } })
  await rejectsCode(contradictoryScope.read('owner', 'child'), 'invalid-input')
  await rejectsCode(port.reserveExecution('owner', 'child', { operationId: f.op(), executionId: 'contradiction', workflowId: null, localTicketId: null }), 'invalid-input')
})

test('unknown execution facts remain counted; T and new S reservations stay independent', async () => {
  const f = await fixture({ T: 1, S: 2 })
  const unknown = await f.reserve('uncertain-native-proof', null, 'root', null)
  await f.receipt(unknown, 'unknown')
  let snapshot = await f.windows.read('owner', 'root')
  assert.equal(snapshot.S.available, 1); assert.equal(snapshot.T.available, 1)
  assert.equal(snapshot.S.countKnown, false)
  await f.reserveTicket('A')
  await f.windows.apply('owner', 'root', { operationId: f.op(), action: 'release', workflowId: 'flow', localTicketId: 'A', generation: 1 })
  await f.reserveTicket('B')
  snapshot = await f.windows.read('owner', 'root')
  assert.equal(snapshot.T.used, 1); assert.equal(snapshot.S.used, 1); assert.equal(snapshot.S.byState.unknown, 1)
  await f.windows.apply('owner', 'root', { operationId: f.op(), action: 'release', workflowId: 'flow', localTicketId: 'B', generation: 1 })
  const reacquired = await f.windows.apply('owner', 'root', { operationId: f.op(), action: 'reacquire', workflowId: 'flow', localTicketId: 'A', generation: 1 })
  assert.equal(reacquired.generation, 2); assert.equal(reacquired.snapshot.T.used, 1)
  const fresh = await f.reserve('new-independent-execution')
  assert.equal(fresh.dispatchable, true); assert.equal(fresh.snapshot.S.used, 2)
  assert.equal(fresh.snapshot.S.byState.unknown, 1)
})

test('S hot-shrink overcommit never consumes or blocks T availability/refill', async () => {
  const f = await fixture({ T: 1, S: 3 })
  for (const id of ['one', 'two', 'three']) await f.reserve(id, null, 'root', null)
  await f.configure({ windows: { runningSubagentLimit: 1 } })
  let snapshot = await f.windows.read('owner', 'root')
  assert.equal(snapshot.S.overcommitted, true); assert.equal(snapshot.S.available, 0); assert.equal(snapshot.T.available, 1)
  await f.reserveTicket('A')
  await f.windows.apply('owner', 'root', { operationId: f.op(), action: 'release', workflowId: 'flow', localTicketId: 'A', generation: 1 })
  await f.reserveTicket('B')
  snapshot = await f.windows.read('owner', 'root')
  assert.equal(snapshot.T.used, 1); assert.equal(snapshot.S.used, 3)
})

test('T full and hot-shrink overcommit never block ticketless S reserve-run-receipt-refill', async () => {
  const f = await fixture({ T: 2, S: 1 })
  await f.reserveTicket('A'); await f.reserveTicket('B')
  let snapshot = await f.windows.read('owner', 'root')
  assert.equal(snapshot.T.available, 0); assert.equal(snapshot.S.available, 1)
  const first = await f.reserve('research-while-T-full', null, 'root', null)
  await f.receipt(first, 'running'); await f.receipt(first, 'released')
  assert.equal((await f.windows.read('owner', 'root')).T.used, 2)
  await f.configure({ windows: { ticketWindowSize: 1 } })
  snapshot = await f.windows.read('owner', 'root')
  assert.equal(snapshot.T.overcommitted, true); assert.equal(snapshot.S.available, 1)
  const next = await f.reserve('research-while-T-overcommitted', null, 'root', null)
  await f.receipt(next, 'running'); await f.receipt(next, 'released')
  assert.equal((await f.windows.read('owner', 'root')).T.used, 2)
})

test('unsupported S/native knowledge does not require fake known proof for T bookkeeping', async () => {
  const f = await fixture({ T: 1, capability: 'unsupported', requireKnownRuntime: true })
  const initial = await f.windows.read('owner', 'root')
  assert.equal(initial.runtimeKnowledge.known, false); assert.equal(initial.S.available, 2); assert.equal(initial.T.available, 1)
  assert.equal(initial.S.countKnown, false)
  await f.reserveTicket('A')
  await f.windows.apply('owner', 'root', { operationId: f.op(), action: 'release', workflowId: 'flow', localTicketId: 'A', generation: 1 })
  await f.reserveTicket('B')
  const snapshot = await f.windows.read('owner', 'root')
  assert.equal(snapshot.T.used, 1); assert.equal(snapshot.runtimeKnowledge.known, false)
  const unobserved = await f.reserve('unsupported-S', null, 'root', null)
  assert.equal(unobserved.dispatchable, true); assert.equal(unobserved.snapshot.S.used, 1)
  assert.equal(unobserved.snapshot.S.countKnown, false)
})

test('each configured axis is usable without guessing the other unset capacity', async () => {
  const onlyT = await fixture({ unset: true })
  await onlyT.configure({ windows: { ticketWindowSize: 1 } })
  let snapshot = await onlyT.windows.read('owner', 'root')
  assert.equal(snapshot.T.available, 1); assert.equal(snapshot.S.capacity, null); assert.equal(snapshot.S.available, null)
  await onlyT.reserveTicket('A')
  const unconfiguredS = await onlyT.reserve('unset-S', null, 'root', null)
  assert.equal(unconfiguredS.dispatchable, true); assert.equal(unconfiguredS.snapshot.S.capacity, null)
  const onlyS = await fixture({ unset: true })
  await onlyS.configure({ windows: { runningSubagentLimit: 1 } })
  snapshot = await onlyS.windows.read('owner', 'root')
  assert.equal(snapshot.T.capacity, null); assert.equal(snapshot.T.available, null); assert.equal(snapshot.S.available, 1)
  const research = await onlyS.reserve('configured-S-no-T-needed', null, 'root', null)
  assert.equal(research.dispatchable, true)
  await onlyS.receipt(research, 'released')
  const unconfiguredT = await onlyS.reserveTicket('A')
  assert.equal(unconfiguredT.snapshot.T.used, 1); assert.equal(unconfiguredT.snapshot.T.capacity, null)
})

test('advisory snapshot reports reference gap and overage independently of unknown tracked execution counts', async () => {
  const f = await fixture({ T: 2, S: 2, requireKnownRuntime: true })
  let snap = await f.windows.read('owner', 'root')
  assert.deepEqual(snap.T, { capacity: 2, used: 0, available: 2, overcommitted: false, overage: 0, gap: 2 })
  assert.equal(snap.S.used, 0); assert.equal(snap.S.countKnown, false)
  assert.equal(snap.S.available, 2); assert.equal(snap.S.gap, 2); assert.equal(snap.S.overage, 0)
  await f.reserveTicket('A'); await f.reserveTicket('B')
  await f.reserve('one'); await f.reserve('two')
  snap = await f.windows.read('owner', 'root')
  assert.equal(snap.T.available, 0); assert.equal(snap.T.gap, 0); assert.equal(snap.T.overage, 0); assert.equal(snap.T.overcommitted, false)
  assert.equal(snap.S.available, 0); assert.equal(snap.S.gap, 0); assert.equal(snap.S.overage, 0); assert.equal(snap.S.overcommitted, false)
  await f.reserveTicket('C'); const third = await f.reserve('three')
  snap = third.snapshot
  assert.equal(third.dispatchable, true)
  assert.equal(snap.T.gap, -1); assert.equal(snap.T.overage, 1); assert.equal(snap.T.available, 0)
  assert.equal(snap.S.gap, -1); assert.equal(snap.S.overage, 1); assert.equal(snap.S.available, 0)
  assert.equal(snap.T.overcommitted, true); assert.equal(snap.S.overcommitted, true); assert.equal(snap.S.countKnown, false)
  await f.port.reconcileKnowledge('owner', 'root', { operationId: f.op(), state: 'known', reason: null })
  assert.equal((await f.windows.read('owner', 'root')).S.countKnown, true)
  await f.receipt(third, 'unknown')
  snap = await f.windows.read('owner', 'root')
  assert.equal(snap.S.used, 3); assert.equal(snap.S.byState.unknown, 1); assert.equal(snap.S.countKnown, false)
  const unset = await fixture({ unset: true })
  snap = await unset.windows.read('owner', 'root')
  assert.equal(snap.T.gap, null); assert.equal(snap.T.overage, null)
  assert.equal(snap.S.gap, null); assert.equal(snap.S.overage, null)
})

test('accepted execution reservation replay reconnects its token without redispatch permission', async () => {
  const f = await fixture({ S: 1 })
  const request = { operationId: f.op(), executionId: 'single-activation', workflowId: null, localTicketId: null }
  const initial = await f.port.reserveExecution('owner', 'root', request)
  assert.equal(initial.dispatchable, true)
  const reservedReplay = await f.port.reserveExecution('owner', 'root', request)
  assert.equal(reservedReplay.replayed, true); assert.equal(reservedReplay.dispatchable, false)
  for (const state of ['accepted', 'scheduled', 'running', 'stopping', 'unknown', 'released']) {
    await f.receipt(initial, state)
    const replay = await f.port.reserveExecution('owner', 'root', request)
    assert.equal(replay.replayed, true); assert.deepEqual(replay.token, initial.token)
    assert.equal(replay.dispatchable, false, state + ' does not authorize duplicate native activation')
  }
  const fresh = await f.reserve('different-activation', null, 'root', null)
  assert.equal(fresh.dispatchable, true)
})

test('receipt dedup cannot substitute a different state, and execution state cannot silently regress', async () => {
  const f = await fixture()
  const held = await f.reserve('worker')
  const running = { ...held.token, operationId: f.op(), state: 'running' }
  await f.port.receipt(running)
  assert.equal((await f.port.receipt(running)).replayed, true)
  await rejectsCode(f.port.receipt({ ...running, state: 'released' }), 'operation-conflict')
  await rejectsCode(f.receipt(held, 'scheduled'), 'operation-conflict')
  assert.equal((await f.windows.read('owner', 'root')).S.byState.running, 1)
})
