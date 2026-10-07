import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fixture, mountedFixture, loadSDK, caller, operator, signal, policy, workflow, ticket } from './fixtures/runtime-host.mjs'

const { Session } = await loadSDK('@deepseek-ai/dsh-session')
const { createUserMessage } = await loadSDK('@deepseek-ai/dsh-llm')
async function ready(t, configure = () => {}) {
  const f = await mountedFixture(t, { futureNativeActivityKnown: true,
    configureBeforeMount(state) {
      state.root.session = Session.create(state.root.id, [], state.root.session.header)
      configure(state)
    },
  })
  await f.runtime.savePolicy(operator, policy(), 0, signal())
  return f
}
const propose = (f, control = signal(), messages = [], step = 1) => f.ctx.waterfall('agent/pre-step', {
  agent: f.root, messages, turn: 1, step, signal: control,
}, async () => ({ kind: 'enter', messages }))
const snapshots = decision => decision.messages.filter(message => message.source.kind === 'mattpocock-controls')
const body = message => message.content[0].text

// Public Cordis Host/Runtime seam plus the actual installed native Session surface.
// No private loop calls, native reflection, SDK writes, provider/model requests, or profile boot.
test('an outer pre-step rejection does not consume unchanged instrument state on retry', async t => {
  let reject = true, prepared
  const f = await ready(t, ({ ctx }) => ctx.on('agent/pre-step', async (_payload, next) => {
    const decision = await next()
    if (!reject) return decision
    prepared = snapshots(decision)[0]
    return { kind: 'reject' }
  }))
  assert.equal((await propose(f)).kind, 'reject')
  assert.ok(prepared, 'the inner Host prepared a real snapshot before outer rejection')
  assert.deepEqual(f.root.session.deriveMessages(), [])
  reject = false
  assert.equal(snapshots(await propose(f)).length, 0, 'one admitted step installs one identical snapshot')
  const retry = snapshots(await propose(f, signal(), [], 2))
  assert.equal(retry.length, 1, 'unchanged state must retry at the next admitted step until it reaches the effective input')
  assert.equal(body(retry[0]), body(prepared))
  assert.notEqual(retry[0].id, prepared.id, 'a retry is a newly attributed native message')
})

test('confirmed append deduplicates unchanged state only on the actual native model surface', async t => {
  const f = await ready(t)
  const first = snapshots(await propose(f))
  assert.equal(first.length, 1)
  f.root.session.append('user/message', first[0], { surfaceOp: 'append' })
  assert.equal(f.root.session.deriveMessages()[0].id, first[0].id)
  assert.equal(snapshots(await propose(f)).length, 0, 'visible unchanged state is not appended every step')
})

test('a tool snapshot entering the accepted batch retains its identity without a second same-step snapshot', async t => {
  const f = await ready(t)
  const result = await f.execute('mattpocock_controls', { action: 'read' })
  const contexts = result.additionalContexts.filter(message => message.source.kind === 'mattpocock-controls')
  assert.equal(contexts.length, 1)
  assert.deepEqual(f.root.session.deriveMessages(), [], 'tool result context is not append confirmation')
  const accepted = await propose(f, signal(), contexts)
  assert.equal(snapshots(accepted).length, 1, 'the original tool context already carries this fresh state')
  assert.equal(snapshots(accepted)[0], contexts[0], 'never rewrite the native accepted message identity')
  f.root.session.append('user/message', contexts[0], { surfaceOp: 'append' })
  assert.equal(snapshots(await propose(f)).length, 0)
})

test('a rejected accepted tool batch does not become delivered state on the next unchanged attempt', async t => {
  let reject = true, prepared
  const f = await ready(t, ({ ctx }) => ctx.on('agent/pre-step', async (_payload, next) => {
    const decision = await next()
    if (!reject) return decision
    prepared = snapshots(decision)
    return { kind: 'reject' }
  }))
  const result = await f.execute('mattpocock_controls', { action: 'read' })
  const contexts = result.additionalContexts.filter(message => message.source.kind === 'mattpocock-controls')
  assert.equal((await propose(f, signal(), contexts)).kind, 'reject')
  assert.equal(prepared.length, 1)
  assert.equal(prepared[0], contexts[0])
  assert.deepEqual(f.root.session.deriveMessages(), [])
  reject = false
  const retry = snapshots(await propose(f, signal(), [], 2))
  assert.equal(retry.length, 1)
  assert.equal(body(retry[0]), body(contexts[0]))
  f.root.session.append('user/message', retry[0], { surfaceOp: 'append' })
  assert.equal(snapshots(await propose(f, signal(), [], 2)).length, 0)
})

test('an outer rewrite with the prepared id but a different body cannot consume the exact baseline', async t => {
  let rewrite = true, prepared
  const f = await ready(t, ({ ctx }) => ctx.on('agent/pre-step', async (_payload, next) => {
    const decision = await next()
    if (!rewrite) return decision
    prepared = snapshots(decision)[0]
    return { ...decision, messages: decision.messages.map(message => message === prepared
      ? { ...message, content: [{ type: 'text', text: 'synthetic rewritten unrelated body' }] } : message) }
  }))
  const altered = await propose(f)
  for (const message of altered.messages) f.root.session.append('user/message', message, { surfaceOp: 'append' })
  assert.equal(f.root.session.deriveMessages()[0].id, prepared.id)
  assert.notEqual(body(f.root.session.deriveMessages()[0]), body(prepared))
  rewrite = false
  const retry = snapshots(await propose(f, signal(), [], 2))
  assert.equal(retry.length, 1)
  assert.equal(body(retry[0]), body(prepared))
})

test('a source-spoofed message with the prepared id and body is not the owned baseline', async t => {
  const f = await ready(t)
  const first = snapshots(await propose(f))[0]
  f.root.session.append('user/message', { ...first, source: { kind: 'user' } }, { surfaceOp: 'append' })
  assert.equal(f.root.session.deriveMessages()[0].id, first.id)
  assert.equal(body(f.root.session.deriveMessages()[0]), body(first))
  const retry = snapshots(await propose(f, signal(), [], 2))
  assert.equal(retry.length, 1)
  assert.equal(retry[0].source.kind, 'mattpocock-controls')
})

test('Agent replacement and native Session replacement reinstall even when copied old input remains visible', async t => {
  const f = await ready(t)
  const first = snapshots(await propose(f))[0]
  f.root.session.append('user/message', first, { surfaceOp: 'append' })
  assert.equal(snapshots(await propose(f)).length, 0)
  const formerAgent = f.root
  f.root = { ...formerAgent }
  f.agents.set(f.root.id, f.root)
  const replacement = snapshots(await propose(f, signal(), [], 2))
  assert.equal(replacement.length, 1, 'another live Agent does not inherit preparation identity')
  f.root.session.append('user/message', replacement[0], { surfaceOp: 'append' })
  assert.equal(snapshots(await propose(f, signal(), [], 2)).length, 0)
  const formerSession = f.root.session
  f.root.session = Session.create(f.root.id, formerSession.ownEvents(), formerSession.header)
  assert.ok(f.root.session.deriveMessages().some(message => message.id === replacement[0].id))
  const restored = snapshots(await propose(f, signal(), [], 3))
  assert.equal(restored.length, 1, 'a replacement Session cannot reuse the old live-session proof')
  assert.equal(body(restored[0]), body(replacement[0]))
  assert.equal(f.mounted.ports.snapshotVisible(caller('child'), f.root, restored[0]), false)
})

test('a successfully acquired degraded snapshot retries honest unknown facts after preparation is discarded', async t => {
  let reject = true, prepared
  const f = await ready(t, ({ ctx }) => ctx.on('agent/pre-step', async (_payload, next) => {
    const decision = await next()
    if (!reject) return decision
    prepared = snapshots(decision)[0]
    return { kind: 'reject' }
  }))
  f.mounted.ports.instrumentStorage.read = async () => { throw new Error('synthetic records temporarily unavailable') }
  assert.equal((await propose(f)).kind, 'reject')
  assert.match(body(prepared), /"records":null/)
  assert.match(body(prepared), /"status":"unknown"/)
  reject = false
  const retry = snapshots(await propose(f, signal(), [], 2))
  assert.equal(retry.length, 1)
  assert.equal(body(retry[0]), body(prepared))
  assert.match(body(retry[0]), /synthetic records temporarily unavailable/)
  assert.ok(body(retry[0]).length <= 24000)
})

test('missing or failing trustworthy visibility conservatively reinstalls freshly consumed state', async t => {
  const f = await fixture(t, { initialPolicy: policy(), known: true })
  const agent = f.agents.get('root')
  agent.session = Session.create(agent.id, [], agent.session.header)
  const first = await f.runtime.preStep(caller('root'), signal())
  agent.session.append('user/message', first[0], { surfaceOp: 'append' })
  assert.equal(f.ports.snapshotVisible, undefined)
  const retry = await f.runtime.preStep(caller('root'), signal())
  assert.equal(retry.length, 1)
  assert.equal(body(retry[0]), body(first[0]))
  f.ports.snapshotVisible = () => { throw new Error('synthetic unavailable projection') }
  const again = await f.runtime.preStep(caller('root'), signal())
  assert.equal(again.length, 1)
  assert.equal(body(again[0]), body(first[0]))
})

test('fresh child snapshots never reuse owner payload and assignment changes replace the child baseline', async t => {
  const f = await ready(t)
  const descriptor = f.child.session.ownEvents()[0]
  f.child.session = Session.create(f.child.id, [], f.child.session.header)
  f.child.session.append(descriptor.type, descriptor.data)
  let operation = 0
  const apply = async fields => {
    const view = await f.runtime.readSession(caller('root'), 'root', signal())
    return f.runtime.applyInstrument(caller('root'), 'root', { operationId: 'synthetic-business-' + ++operation,
      expectedRevision: view.records.businessRevision, workflowId: 'flow', ...fields }, signal())
  }
  await apply({ action: 'put-workflow', value: workflow })
  await apply({ action: 'put-ticket', localTicketId: 'A', value: ticket('partial', 'synthetic-alpha-details') })
  await apply({ action: 'put-ticket', localTicketId: 'B', value: ticket('repair', 'synthetic-beta-owner-details') })
  await f.runtime.assign(caller('root'), { sessionId: 'child', workflowId: 'flow', ticketIds: ['A'] }, signal())
  const owner = snapshots(await propose(f))[0]
  f.root.session.append('user/message', owner, { surfaceOp: 'append' })
  const child = snapshots(await propose({ ...f, root: f.child }))
  assert.equal(child.length, 1)
  assert.match(body(child[0]), /synthetic-alpha-details/)
  assert.doesNotMatch(body(child[0]), /synthetic-beta-owner-details/)
  assert.notEqual(child[0].id, owner.id)
  assert.equal(f.mounted.ports.snapshotVisible(caller('child'), f.child, owner), false)
  f.child.session.append('user/message', child[0], { surfaceOp: 'append' })
  assert.equal(snapshots(await propose({ ...f, root: f.child })).length, 0)
  await f.runtime.assign(caller('root'), { sessionId: 'child', workflowId: 'flow', ticketIds: ['B'] }, signal())
  const changed = snapshots(await propose({ ...f, root: f.child }))
  assert.equal(changed.length, 1)
  assert.match(body(changed[0]), /synthetic-beta-owner-details/)
  assert.doesNotMatch(body(changed[0]), /synthetic-alpha-details/)
  assert.ok(body(changed[0]).length <= 24000)
})

test('a committed native message projection keeping the id but changing content invalidates the baseline', async t => {
  const projection = { type: 'synthetic/baseline-projection', project(event, context) {
    const original = context.events.find(item => item.seq === event.data.seq).data
    return new Map([[event.data.seq, { ...original, content: [{ type: 'text', text: 'synthetic projected body' }] }]])
  } }
  const f = await ready(t, ({ root }) => { root.session = Session.create(root.id, [], root.session.header, 0, [projection]) })
  const first = snapshots(await propose(f))[0]
  const event = f.root.session.append('user/message', first, { surfaceOp: 'append' })
  assert.equal(snapshots(await propose(f)).length, 0)
  f.root.session.append(projection.type, { seq: event.seq })
  assert.equal(f.root.session.deriveMessages()[0].id, first.id)
  assert.equal(body(f.root.session.deriveMessages()[0]), 'synthetic projected body')
  assert.equal(body(f.root.session.ownEvents()[event.seq].data), body(first), 'event log content itself remains unchanged')
  const retry = snapshots(await propose(f, signal(), [], 2))
  assert.equal(retry.length, 1)
  assert.equal(body(retry[0]), body(first))
})

test('late Host abort after snapshot preparation retains unchanged state for a new attempt', async t => {
  const stop = new AbortController(), reason = new Error('synthetic late cancellation')
  let abort = true, prepared
  const f = await ready(t, ({ ctx }) => ctx.on('agent/pre-step', async (_payload, next) => {
    const decision = await next()
    if (abort) { prepared = snapshots(decision)[0]; stop.abort(reason); _payload.signal.throwIfAborted() }
    return decision
  }))
  await assert.rejects(propose(f, stop.signal), error => error === reason)
  assert.ok(prepared)
  assert.deepEqual(f.root.session.deriveMessages(), [])
  abort = false
  const retry = snapshots(await propose(f, signal(), [], 2))
  assert.equal(retry.length, 1)
  assert.equal(body(retry[0]), body(prepared))
})

test('native compaction replacing a visible snapshot reinstalls fresh bounded state despite retained event history', async t => {
  const f = await ready(t)
  const first = snapshots(await propose(f))[0]
  const appended = f.root.session.append('user/message', first, { surfaceOp: 'append' })
  assert.equal(snapshots(await propose(f)).length, 0)
  const summary = createUserMessage({ content: [{ type: 'text', text: 'Compacted unrelated conversation.' }], source: { kind: 'user' } })
  f.root.session.append('user/message', summary, { surfaceOp: { op: 'replace', startSeq: appended.seq, endSeq: appended.seq }, sourceEventSeqs: [appended.seq] })
  assert.ok(f.root.session.ownEvents().some(event => event.type === 'user/message' && event.data.id === first.id))
  assert.ok(!f.root.session.deriveMessages().some(message => message.id === first.id))
  const retry = snapshots(await propose(f, signal(), [], 2))
  assert.equal(retry.length, 1)
  assert.equal(body(retry[0]), body(first))
  assert.ok(body(retry[0]).length <= 24000)
  f.root.session.append('user/message', retry[0], { surfaceOp: 'append' })
  assert.equal(snapshots(await propose(f, signal(), [], 2)).length, 0)
})
