import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fixture, policy, workflow, ticket, caller, signal } from './fixtures/runtime-host.mjs'

// Agreed seam: RuntimeFacade.historyAction, real production source cores, and
// controlled VersionedStorage transport barriers. No live SDK/Profile/model.
async function ready(t) {
  const f = await fixture(t, { initialPolicy: policy() })
  await f.apply('put-workflow', { value: workflow })
  await f.apply('put-ticket', { localTicketId: 'A', value: ticket('partial', 'cancel-old-source-secret') })
  await f.apply('put-ticket', { localTicketId: 'A', value: ticket('repair', 'current-report') })
  const before = await f.read()
  const request = { action: 'purge-source', domain: 'records', request: {
    operationId: 'cancelled-source-cleanup', expectedRevision: before.records.revision,
    throughRevision: before.records.revision, targets: [{ kind: 'ticket', workflowId: 'flow', localTicketId: 'A' }],
  } }
  return { f, before, request }
}

test('abort before cleanup planning rejects without changing source, history or durable cleanup plan', async t => {
  const { f, before, request } = await ready(t)
  const read = f.instrumentStorage.read.bind(f.instrumentStorage)
  const sourceBefore = await read(before.instance.instrumentInstanceId)
  const unitBefore = new Map(await Promise.all([...f.units].map(async ([key, store]) => [key, await store.read()])))
  const entered = Promise.withResolvers(), resume = Promise.withResolvers()
  let pause = true
  f.instrumentStorage.read = async (...args) => {
    if (pause) { pause = false; entered.resolve(); await resume.promise }
    return read(...args)
  }
  const control = new AbortController(), reason = new Error('User cancelled before cleanup planning')
  const pending = f.runtime.historyAction(caller('root'), 'root', request, control.signal)
  // Attach rejection observation before releasing the transport barrier.
  const outcome = pending.then(value => ({ value }), error => ({ error }))
  await entered.promise
  control.abort(reason)
  resume.resolve()
  const result = await outcome
  assert.equal(result.error, reason, 'cancellation before any cleanup side effect must reject with the actual caller reason')
  assert.deepEqual(await read(before.instance.instrumentInstanceId), sourceBefore)
  assert.deepEqual([...f.units.keys()].sort(), [...unitBefore.keys()].sort(), 'must not open/write a cleanup plan after cancellation')
  for (const [key, saved] of unitBefore) assert.deepEqual(await f.units.get(key).read(), saved, key + ' changed after cancellation')
})

test('abort after durable derived suppression reports partial, preserves source and resumes the same cleanup identity', async t => {
  const { f, before, request } = await ready(t)
  const sourceBefore = await f.instrumentStorage.read(before.instance.instrumentInstanceId)
  const history = [...f.units].find(([key]) => key.startsWith('history_'))?.[1]
  assert(history, 'the authorized owner history is already opened by normal reads')
  const swap = history.compareAndSwap.bind(history)
  const entered = Promise.withResolvers(), resume = Promise.withResolvers()
  t.after(() => resume.resolve())
  let pause = true
  history.compareAndSwap = async (expected, next) => {
    const committed = await swap(expected, next)
    if (committed && pause && next.actions.at(-1)?.action.action === 'purge') {
      pause = false
      // The real production History CAS already committed. Only its transport
      // receipt is held; this is NOT a fake pre-commit failure or rollback.
      entered.resolve()
      await resume.promise
    }
    return committed
  }
  const control = new AbortController()
  const pending = f.runtime.historyAction(caller('root'), 'root', request, control.signal)
  const outcome = pending.then(value => ({ value }), error => ({ error }))
  await Promise.race([entered.promise, outcome.then(() => { throw new Error('cleanup settled before reaching the committed suppression barrier') })])
  control.abort(new Error('User cancelled after derived history commit'))
  resume.resolve()
  const result = await outcome
  assert.equal(result.error, undefined, 'committed derived changes require a truthful partial receipt, not a claim that nothing happened')
  assert.equal(result.value.phase, 'partial')
  assert.equal(result.value.operationId, request.request.operationId)
  assert.equal(result.value.derivedHistoryDeleted, true)
  assert.equal(result.value.sourceRecordsDeleted, false)
  assert.equal(result.value.nativeConversationDeleted, false)
  assert.deepEqual(await f.instrumentStorage.read(before.instance.instrumentInstanceId), sourceBefore, 'source CAS must not start after cancellation')
  const retained = await history.read()
  assert(retained.rows.some(row => row.kind === 'ticket' && row.purged))
  assert(!JSON.stringify(retained).includes('cancel-old-source-secret'), 'suppression must not be rolled back or its body resurrected')
  assert(retained.suppression.length > 0)
  const page = await f.runtime.historyAction(caller('root'), 'root', { action: 'query', query: { kind: 'ticket' } }, signal())
  const detail = await f.runtime.historyAction(caller('root'), 'root', { action: 'detail', historyIds: page.rows.map(row => row.historyId) }, signal())
  assert(!JSON.stringify(detail).includes('cancel-old-source-secret'), 'a later source refresh must honor the committed suppression')
  const finished = await f.runtime.historyAction(caller('root'), 'root', request, signal())
  assert.equal(finished.sourceRecordsDeleted, true, 'a fresh authorized signal must recover the same durable plan, not replay terminal partial forever')
  const sourceAfter = await f.instrumentStorage.read(before.instance.instrumentInstanceId)
  assert(!JSON.stringify(sourceAfter).includes('cancel-old-source-secret'))
  assert(JSON.stringify(sourceAfter).includes('current-report'))
  const replay = await f.runtime.historyAction(caller('root'), 'root', request, signal())
  assert.equal(replay.replayed, true)
  assert.deepEqual(await f.instrumentStorage.read(before.instance.instrumentInstanceId), sourceAfter)
})

test('abort during source core load still fences the not-yet-started source CAS and preserves recoverable suppression', async t => {
  const { f, before, request } = await ready(t)
  const history = [...f.units].find(([key]) => key.startsWith('history_'))?.[1]
  assert(history)
  const read = f.instrumentStorage.read.bind(f.instrumentStorage)
  const sourceBefore = await read(before.instance.instrumentInstanceId)
  const swap = f.instrumentStorage.compareAndSwap.bind(f.instrumentStorage)
  const entered = Promise.withResolvers(), resume = Promise.withResolvers()
  t.after(() => resume.resolve())
  let pause = true, sourceCAS = 0
  f.instrumentStorage.read = async (...args) => {
    const derived = await history.read()
    // Initial refresh reads have no suppression; the mutation's own source
    // load occurs only after the derived domain has actually committed.
    if (pause && derived.rows.some(row => row.kind === 'ticket' && row.purged)) {
      pause = false; entered.resolve(); await resume.promise
    }
    return read(...args)
  }
  f.instrumentStorage.compareAndSwap = async (...args) => { sourceCAS++; return swap(...args) }
  const control = new AbortController()
  const pending = f.runtime.historyAction(caller('root'), 'root', request, control.signal)
  const outcome = pending.then(value => ({ value }), error => ({ error }))
  await Promise.race([entered.promise, outcome.then(() => { throw new Error('cleanup settled before the source core load barrier') })])
  assert.equal(sourceCAS, 0, 'source API entry is not a source CAS acceptance receipt')
  control.abort(new Error('User cancelled during source load before its CAS'))
  resume.resolve()
  const result = await outcome
  assert.equal(result.error, undefined)
  assert.equal(result.value.phase, 'partial')
  assert.equal(result.value.derivedHistoryDeleted, true)
  // Runtime has no no-write acknowledgment after source invocation started;
  // the transport probe can separately prove the core's cancellation fence.
  assert.equal(result.value.sourceRecordsDeleted, null)
  assert.equal(result.value.sourceOutcome, 'failed-or-uncertain')
  assert.equal(sourceCAS, 0, 'the trusted cancellation signal must reach the core pre-CAS boundary')
  assert.deepEqual(await read(before.instance.instrumentInstanceId), sourceBefore)
  const suppressed = await history.read()
  assert(suppressed.suppression.length > 0)
  assert(!JSON.stringify(suppressed).includes('cancel-old-source-secret'))
  const finished = await f.runtime.historyAction(caller('root'), 'root', request, signal())
  assert.equal(finished.sourceRecordsDeleted, true)
  assert.equal(sourceCAS, 1)
  const after = await read(before.instance.instrumentInstanceId)
  assert(!JSON.stringify(after).includes('cancel-old-source-secret'))
  assert(JSON.stringify(after).includes('current-report'))
})

test('window checkpoint acknowledgment survives cancellation without starting the source purge', async t => {
  const f = await fixture(t, { initialPolicy: policy() })
  f.ports.nativeActivity = async () => ({ known: false, reason: 'synthetic-window-old-marker', liveAgents: [...f.agents.values()] })
  await f.reopen(); await f.read()
  f.ports.nativeActivity = async () => ({ known: false, reason: 'synthetic-window-current-marker', liveAgents: [...f.agents.values()] })
  await f.reopen(); const before = await f.read()
  const request = { action: 'purge-source', domain: 'windows', request: { operationId: 'checkpoint-ack-cancel', expectedRevision: before.windows.revision, throughRevision: before.windows.revision, targets: [{ kind: 'knowledge' }] } }
  const control = new AbortController(), swap = f.windowStorage.compareAndSwap.bind(f.windowStorage)
  let checkpoints = 0, purges = 0
  f.windowStorage.compareAndSwap = async (...args) => {
    const next = args[2], kind = next.historyActions?.at(-1)?.kind
    if (kind === 'compact') checkpoints++; if (kind === 'purge') purges++
    const committed = await swap(...args)
    if (committed && kind === 'compact') control.abort(new Error('synthetic cancellation after checkpoint acknowledgment'))
    return committed
  }
  const partial = await f.runtime.historyAction(caller('root'), 'root', request, control.signal)
  assert.equal(partial.phase, 'partial'); assert.equal(partial.sourceRecordsDeleted, false)
  assert.equal(partial.sourceOutcome, 'checkpoint-committed-purge-not-started')
  assert.equal(partial.checkpointAppliedRevision, before.windows.revision + 1)
  assert.equal(checkpoints, 1); assert.equal(purges, 0)
  assert.equal(Object.hasOwn(partial, 'snapshot'), false)
  const durable = await f.windowStorage.read(before.instance.instrumentInstanceId)
  assert.equal(durable.revision, before.windows.revision + 1)
  assert(JSON.stringify(durable).includes('synthetic-window-old-marker'))
  const finished = await f.runtime.historyAction(caller('root'), 'root', request, signal())
  assert.equal(finished.sourceRecordsDeleted, true); assert.equal(purges, 1)
  assert(!JSON.stringify(await f.windowStorage.read(before.instance.instrumentInstanceId)).includes('synthetic-window-old-marker'))
})
