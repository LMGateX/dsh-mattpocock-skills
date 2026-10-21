import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registerHooks } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

// Exercise this source seam without rebuilding or mutating the checked-in lib artifacts.
const sourceRoot = new URL('../src/controls/', import.meta.url).href
const compiledRoot = new URL('../lib/controls/', import.meta.url).href
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.startsWith(sourceRoot) && specifier.startsWith('.') && specifier.endsWith('.js')) {
      const url = new URL(specifier.slice(0, -3) + '.ts', context.parentURL)
      if (existsSync(url)) return { url: url.href, shortCircuit: true }
    }
    const resolved = nextResolve(specifier, context)
    if (resolved.url.startsWith(compiledRoot) && resolved.url.endsWith('.js')) {
      const url = sourceRoot + resolved.url.slice(compiledRoot.length, -3) + '.ts'
      if (existsSync(fileURLToPath(url))) return { url, shortCircuit: true }
    }
    return resolved
  },
  load(url, context, nextLoad) {
    if (url.startsWith(sourceRoot) && url.endsWith('.ts')) return { format: 'module', shortCircuit: true,
      source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), { compilerOptions: {
        target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, verbatimModuleSyntax: true,
      } }).outputText }
    return nextLoad(url, context)
  },
})

const { instrumentFixture, definition } = await import('./fixtures/instrument-fixture.mjs')
const { SessionInstruments } = await import('../src/controls/instruments.ts')
const { MemoryInstrumentStorage, createDomainInstrumentStorage } = await import('../src/controls/instrument-storage.ts')
const userDecision = (more = {}) => ({ question: 'Need a user decision', status: 'task-defined',
  pending: true, addressee: { kind: 'user', principalId: 'user' }, ...more })
async function ready(options) {
  const f = await instrumentFixture(options)
  await f.apply('put-workflow', { value: definition })
  return f
}

test('summary returns only current authorized user obligations and revisioned identity, not history', async () => {
  const f = await ready()
  await f.apply('put-decision', { decisionId: 'user-pending', value: userDecision() })
  await f.apply('put-decision', { decisionId: 'agent-pending', value: userDecision({ addressee: { kind: 'agent', principalId: 'A' } }) })
  await f.apply('put-decision', { decisionId: 'unaddressed', value: { question: 'Not assigned to the user', status: 'free', pending: true } })
  await f.apply('put-decision', { decisionId: 'resolved', value: userDecision({ pending: false }) })
  const { instance } = await f.controls.readSession('A', 'A')
  const summary = await f.instruments.readSummary('A', 'A')
  assert.deepEqual(summary, { instance, revision: 5, businessRevision: 5, viewerRevision: 0,
    scope: { kind: 'coordinator' }, summary: { countingScope: 'instance', pendingUserDecisionCount: 1 } })
  assert.equal(summary.summary.pendingUserDecisionCount, (await f.read()).summary.pendingUserDecisionCount)
  assert(Object.isFrozen(summary) && Object.isFrozen(summary.summary) && Object.isFrozen(summary.scope))
})

const ticket = { title: 'Registered ticket', statuses: {} }
test('summary scopes every associated ticket and ticketless creator, refreshing assignment and authorization', async () => {
  const f = await ready()
  for (const localTicketId of ['T1', 'T2']) await f.apply('put-ticket', { localTicketId, value: ticket })
  await f.apply('put-decision', { decisionId: 'assigned', value: userDecision({ ticketIds: ['T1'] }) })
  await f.apply('put-decision', { decisionId: 'mixed', value: userDecision({ ticketIds: ['T1', 'T2'] }) })
  await f.apply('put-decision', { decisionId: 'owner-ticketless', value: userDecision() })
  await f.apply('put-decision', { decisionId: 'child-ticketless', value: userDecision() }, 'child', 'child')
  await f.apply('put-workflow', { workflowId: 'other-flow', value: definition })
  await f.apply('put-ticket', { workflowId: 'other-flow', localTicketId: 'T1', value: ticket })
  await f.apply('put-decision', { workflowId: 'other-flow', decisionId: 'assigned', value: userDecision({ ticketIds: ['T1'] }) })
  const owner = await f.instruments.readSummary('A', 'A')
  const child = await f.instruments.readSummary('child', 'child')
  assert.equal(owner.summary.pendingUserDecisionCount, 5)
  assert.deepEqual(child.scope, { kind: 'assigned', workflowId: 'flow', ticketIds: ['T1'] })
  assert.deepEqual(child.summary, { countingScope: 'assignment', pendingUserDecisionCount: 2 })
  assert.equal(child.summary.pendingUserDecisionCount, (await f.read('child', 'child')).summary.pendingUserDecisionCount)
  f.scopes.set('child', { kind: 'assigned', workflowId: 'flow', ticketIds: ['T2'] })
  assert.equal((await f.instruments.readSummary('child', 'child')).summary.pendingUserDecisionCount, 1)
  f.scopes.set('child', { kind: 'assigned', workflowId: null, ticketIds: [] })
  assert.equal((await f.instruments.readSummary('child', 'child')).summary.pendingUserDecisionCount, 0)
  f.revoked.add('child')
  await assert.rejects(f.instruments.readSummary('child', 'child'), /permission denied/)
})

test('summary folds partial decision updates without losing pending, addressee, ticket scope or creator', async () => {
  const f = await ready()
  for (const localTicketId of ['T1', 'T2']) await f.apply('put-ticket', { localTicketId, value: ticket })
  await f.apply('put-decision', { decisionId: 'D', value: userDecision({ ticketIds: ['T1'] }) }, 'child', 'child')
  const assertCount = async expected => {
    const summary = await f.instruments.readSummary('child', 'child')
    assert.equal(summary.summary.pendingUserDecisionCount, expected)
    const detailed = await f.read('child', 'child')
    assert.equal(summary.summary.pendingUserDecisionCount, detailed.summary.pendingUserDecisionCount)
    assert.equal(summary.businessRevision, detailed.businessRevision)
  }
  await f.apply('put-decision', { decisionId: 'D', value: { question: 'Only business text changed', status: 'free' } })
  await assertCount(1)
  await f.apply('put-decision', { decisionId: 'D', value: userDecision({ pending: false }) })
  await assertCount(0)
  await f.apply('put-decision', { decisionId: 'D', value: userDecision({ addressee: { kind: 'agent', principalId: 'A' } }) })
  await f.apply('put-decision', { decisionId: 'D', value: { question: 'Still not user addressed', status: 'free' } })
  await assertCount(0)
  await f.apply('put-decision', { decisionId: 'D', value: userDecision() })
  await assertCount(1)
  await f.apply('put-decision', { decisionId: 'D', value: userDecision({ ticketIds: ['T2'] }) })
  await assertCount(0)
  await f.apply('put-decision', { decisionId: 'D', value: userDecision({ ticketIds: [] }) })
  await assertCount(1)
})

test('summaries isolate identical workflow and decision IDs across owners and reject unregistered sessions', async () => {
  const f = await ready()
  await f.apply('put-decision', { decisionId: 'same-id', value: userDecision() })
  await f.apply('put-workflow', { value: definition }, 'B', 'B')
  await f.apply('put-decision', { decisionId: 'same-id', value: userDecision({ pending: false }) }, 'B', 'B')
  const a = await f.instruments.readSummary('user', 'A'), b = await f.instruments.readSummary('user', 'B')
  assert.equal(a.summary.pendingUserDecisionCount, 1)
  assert.equal(b.summary.pendingUserDecisionCount, 0)
  assert.notEqual(a.instance.instrumentInstanceId, b.instance.instrumentInstanceId)
  assert.equal(a.instance.ownerSessionId, 'A')
  assert.equal(b.instance.ownerSessionId, 'B')
  await assert.rejects(f.instruments.readSummary('child', 'B'), /permission denied/)
  f.identities.set('cold-owner', { kind: 'owner', controlWorkspaceId: 'W' })
  const prior = await f.controlStorage.read()
  await assert.rejects(f.instruments.readSummary('admin', 'cold-owner'), { code: 'unknown-session' })
  assert.deepEqual(await f.controlStorage.read(), prior, 'readSummary must not register a cold owner')
  const empty = await instrumentFixture()
  const zero = await empty.instruments.readSummary('A', 'A')
  assert.equal(zero.revision, 0)
  assert.equal(zero.summary.pendingUserDecisionCount, 0)
  assert.equal(await empty.storage.read(zero.instance.instrumentInstanceId), undefined, 'empty reads remain side-effect-free')
})

test('summary retains obligations while viewer metadata stays private and management is OFF', async () => {
  const f = await ready()
  await f.apply('put-decision', { decisionId: 'D', value: userDecision() })
  await f.apply('set-decision-view', { decisionId: 'D', value: { read: true, hidden: true } }, 'user', 'A')
  let user = await f.instruments.readSummary('user', 'A'), other = await f.instruments.readSummary('user2', 'A')
  assert.equal(user.revision, 3)
  assert.equal(user.businessRevision, 2)
  assert.equal(user.viewerRevision, 1)
  assert.equal(other.viewerRevision, 0)
  assert.equal(user.summary.pendingUserDecisionCount, 1)
  assert.equal(other.summary.pendingUserDecisionCount, 1)
  await f.apply('set-decision-view', { decisionId: 'D', value: { read: false, hidden: true } }, 'user2', 'A')
  await f.apply('set-decision-view', { decisionId: 'D', value: { read: false, hidden: false } }, 'user', 'A')
  const policy = await f.controls.readPolicy('admin')
  await f.controls.savePolicy('admin', { extensionEnabled: false, defaults: {}, workspaceOverrides: {} }, policy.revision)
  user = await f.instruments.readSummary('user', 'A'); other = await f.instruments.readSummary('user2', 'A')
  assert.equal(user.revision, 5)
  assert.equal(user.businessRevision, 2)
  assert.equal(user.viewerRevision, 2)
  assert.equal(other.viewerRevision, 1)
  assert.equal(user.summary.pendingUserDecisionCount, 1)
  assert.equal(other.summary.pendingUserDecisionCount, 1)
  assert.equal(user.summary.pendingUserDecisionCount, (await f.read('user', 'A')).summary.pendingUserDecisionCount)
})

test('checkpoint summaries retain merged current decisions, purged creators and checkpoint plus tail revisions', async () => {
  const f = await ready()
  await f.apply('put-decision', { decisionId: 'D', value: userDecision() }, 'child', 'child')
  await f.apply('put-decision', { decisionId: 'D', value: { question: 'Owner updated the body', status: 'still-pending' } })
  await f.apply('set-decision-view', { decisionId: 'D', value: { read: true, hidden: true } }, 'user', 'A')
  await f.instruments.compact('A', 'A', { operationId: 'summary-compact', expectedRevision: 4 })
  let child = await f.instruments.readSummary('child', 'child')
  assert.equal(child.revision, 5)
  assert.equal(child.businessRevision, 3)
  assert.equal(child.summary.pendingUserDecisionCount, 1)
  assert.equal((await f.instruments.readSummary('user', 'A')).viewerRevision, 1)
  await f.instruments.purgeHistory('A', 'A', { operationId: 'summary-purge', expectedRevision: 5,
    throughRevision: 2, targets: [{ kind: 'decision', workflowId: 'flow', decisionId: 'D' }] })
  child = await f.instruments.readSummary('child', 'child')
  assert.equal(child.revision, 6)
  assert.equal(child.businessRevision, 3)
  assert.equal(child.summary.pendingUserDecisionCount, 1, 'purging the original body must not transfer creator authority')
  assert.equal(child.summary.pendingUserDecisionCount, (await f.read('child', 'child')).summary.pendingUserDecisionCount)
  await f.apply('put-decision', { decisionId: 'D', value: userDecision({ pending: false }) })
  assert.equal((await f.instruments.readSummary('child', 'child')).summary.pendingUserDecisionCount, 0)
  await f.apply('put-decision', { decisionId: 'D', value: userDecision() }, 'child', 'child')
  await f.apply('set-decision-view', { decisionId: 'D', value: { read: false, hidden: true } }, 'user', 'A')
  const user = await f.instruments.readSummary('user', 'A')
  assert.equal(user.revision, 9)
  assert.equal(user.businessRevision, 5)
  assert.equal(user.viewerRevision, 2)
  assert.equal(user.summary.pendingUserDecisionCount, 1)
})

test('summary revalidates source and caller identity instead of hiding storage failure or corruption as zero', async () => {
  const backing = new MemoryInstrumentStorage()
  let failure, replacement
  const storage = { async read(instanceId) {
    if (failure) throw failure
    return replacement ?? backing.read(instanceId)
  }, compareAndSwap: (...args) => backing.compareAndSwap(...args) }
  const f = await ready({ storage })
  await f.apply('put-decision', { decisionId: 'D', value: userDecision() })
  assert.equal((await f.instruments.readSummary('A', 'A')).summary.pendingUserDecisionCount, 1)
  failure = new Error('source read unavailable')
  await assert.rejects(f.instruments.readSummary('A', 'A'), error => error === failure)
  failure = undefined
  const { instance } = await f.controls.readSession('A', 'A')
  const source = await backing.read(instance.instrumentInstanceId)
  replacement = structuredClone(source)
  replacement.events[1].command.expectedRevision = 0
  await assert.rejects(f.instruments.readSummary('A', 'A'), { code: 'invalid-state' })
  replacement = { ...source, ownerSessionId: 'B' }
  await assert.rejects(f.instruments.readSummary('A', 'A'), { code: 'association-conflict' })
  replacement = undefined
  assert.equal((await f.instruments.readSummary('A', 'A')).summary.pendingUserDecisionCount, 1)
  const forged = new SessionInstruments(f.controls, storage, { async resolveAccess() {
    return { author: { kind: 'agent', principalId: 'B', sessionId: 'B' }, scope: { kind: 'coordinator' } }
  } })
  await assert.rejects(forged.readSummary('A', 'A'), { code: 'access-denied' })
})

test('stable immutable source reuse never bypasses the table-wide uncertain latch, and fresh reopen sees committed state', async () => {
  const values = new Map()
  let loseReceipt = false, gets = 0
  const table = { get(key) { gets++; return values.get(key) }, async put(key, next) { values.set(key, next) },
    async update(key, transform) {
      const next = transform(values.get(key)); values.set(key, next)
      if (loseReceipt) throw new Error('committed but receipt lost')
      return next
    } }
  const storage = createDomainInstrumentStorage(table)
  const f = await ready({ storage })
  await f.apply('put-decision', { decisionId: 'D', value: userDecision() })
  const first = await f.instruments.readSummary('A', 'A'), instanceId = first.instance.instrumentInstanceId
  const source = await storage.read(instanceId)
  assert.equal(await storage.read(instanceId), source, 'public domain storage returns a stable immutable current document')
  assert(Object.isFrozen(source))
  const before = gets
  for (let read = 0; read < 3; read++) assert.equal((await f.instruments.readSummary('A', 'A')).summary.pendingUserDecisionCount, 1)
  assert.equal(gets - before, 3, 'every hot summary still checks the current source instead of trusting its index alone')
  loseReceipt = true
  await assert.rejects(f.apply('put-decision', { decisionId: 'D', value: userDecision({ pending: false }) }), /receipt lost/)
  await assert.rejects(f.instruments.readSummary('A', 'A'), { code: 'storage-uncertain' })
  const freshHandle = { ...table }
  const reopened = new SessionInstruments(f.controls, createDomainInstrumentStorage(freshHandle), f.authority)
  const committed = await reopened.readSummary('A', 'A')
  assert.equal(committed.revision, 3)
  assert.equal(committed.businessRevision, 3)
  assert.equal(committed.summary.pendingUserDecisionCount, 0)
})

test('summary cancellation rejects before a source read and after an in-flight source read', async () => {
  const backing = new MemoryInstrumentStorage()
  let calls = 0, gate, entered
  const storage = { async read(instanceId) {
    calls++
    if (gate) { entered(); await gate }
    return backing.read(instanceId)
  }, compareAndSwap: (...args) => backing.compareAndSwap(...args) }
  const f = await ready({ storage })
  await f.apply('put-decision', { decisionId: 'D', value: userDecision() })
  const reason = new Error('summary cancelled'), preAborted = new AbortController()
  preAborted.abort(reason)
  const before = calls
  await assert.rejects(f.instruments.readSummary('A', 'A', preAborted.signal), error => error === reason)
  assert.equal(calls, before)
  let release, markEntered
  gate = new Promise(resolve => { release = resolve })
  const reading = new Promise(resolve => { markEntered = resolve })
  entered = markEntered
  const active = new AbortController(), pending = f.instruments.readSummary('A', 'A', active.signal)
  await reading
  active.abort(reason); release()
  await assert.rejects(pending, error => error === reason)
  gate = undefined
  assert.equal((await f.instruments.readSummary('A', 'A')).summary.pendingUserDecisionCount, 1)
})
