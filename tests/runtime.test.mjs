import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fixture, mountedFixture, loadSDK, host, sdk, core, caller, operator, actualAgent, signal, deferred, policy, workflow, ticket } from './fixtures/runtime-host.mjs'
const rejectsCode = (promise, code) => assert.rejects(promise, error => error.code === code)

async function ready(t, options = {}) {
  const f = await fixture(t, { initialPolicy: policy(), ...options })
  await f.apply('put-workflow', { value: workflow })
  return f
}
function nativeChild(f, id = 'new-child', parent = 'root') {
  const child = actualAgent(id, { parent, managed: true, cwd: '/native-original-cwd' })
  f.setNative(async () => {
    await f.created(child)
    return { isError: false, value: { childId: child.id, message: 'delivered; released; slot=0' } }
  })
  return child
}

test('runtime default-off is non-destructive; trusted metadata isolates owners/forks and original workspace', async t => {
  const f = await fixture(t)
  assert.deepEqual(await f.runtime.readPolicy(operator, signal()), { revision: 0, extensionEnabled: false, defaults: {}, workspaceOverrides: {} })
  const root = await f.read(), child = await f.read('old-child'), other = await f.read('other'), fork = await f.read('fork')
  assert.equal(child.instance.instrumentInstanceId, root.instance.instrumentInstanceId)
  assert.equal(child.instance.controlWorkspaceId, 'W')
  assert.notEqual(other.instance.instrumentInstanceId, root.instance.instrumentInstanceId)
  assert.notEqual(fork.instance.instrumentInstanceId, root.instance.instrumentInstanceId)
  assert.deepEqual(child.records.scope, { kind: 'assigned', workflowId: null, ticketIds: [] })
  assert.deepEqual(f.guards, [], 'advisory instruments install no native veto')
  await rejectsCode(f.read('other', caller('root')), 'access-denied')
  await rejectsCode(f.read('root', caller('old-child')), 'access-denied')
  f.ctx.workspaceRegistry.resolveByPath = async () => { throw new Error('must retain original WorkspaceId') }
  assert.equal((await f.read()).instance.controlWorkspaceId, 'W')
})

test('actual agent and operator author business updates; old child assignment narrows scope without owner leakage', async t => {
  const f = await ready(t)
  await f.apply('put-ticket', { localTicketId: 'A', value: ticket() })
  await f.apply('put-ticket', { localTicketId: 'B', value: ticket() })
  await f.assign('old-child', 'flow', ['A'])
  await f.apply('put-ticket', { localTicketId: 'A', value: ticket('repair') }, 'old-child')
  const c = await f.read('old-child')
  assert.deepEqual(c.records.scope, { kind: 'assigned', workflowId: 'flow', ticketIds: ['A'] })
  assert.deepEqual(c.records.tickets.map(row => row.localTicketId), ['A'])
  assert.deepEqual(c.records.tickets[0].history.at(-1).author, caller('old-child'))
  await rejectsCode(f.apply('put-ticket', { localTicketId: 'B', value: ticket('repair') }, 'old-child'), 'access-denied')
  await rejectsCode(f.assign('fork', 'flow', ['A']), 'access-denied')
  await f.apply('put-ticket', { localTicketId: 'B', value: ticket('repair', '用户业务判定') }, 'root', operator)
  const root = await f.read()
  assert.deepEqual(root.records.tickets.find(row => row.localTicketId === 'B').history.at(-1).author, operator)
  assert.deepEqual((await f.read('other')).records.tickets, [])
  await rejectsCode(f.runtime.savePolicy(caller('root'), policy(), 1, signal()), 'access-denied')
})

test('future controlled native activity: new child gets actual assignment, null-workflow research shares root S with zero T', async t => {
  const f = await fixture(t, { known: true, initialPolicy: policy({ enabled: true, ticketWindowSize: 2, runningSubagentLimit: 2 }) })
  const first = nativeChild(f, 'research-child')
  const r = await f.managed({ nativeTool: 'subagent_fork' })
  assert.equal(r.outcome, 'success')
  let child = await f.read(first.id)
  assert.deepEqual(child.records.scope, { kind: 'assigned', workflowId: null, ticketIds: [] })
  assert.deepEqual(child.records.workflows, [])
  assert.deepEqual(child.records.tickets, [])
  assert.equal(child.windows.T.used, 0)
  const second = nativeChild(f, 'research-grandchild', first.id)
  await f.managed({ id: first.id })
  const root = await f.read()
  assert.equal(root.windows.S.used, 2)
  assert.equal(root.windows.T.used, 0)
  assert(root.windows.executions.every(e => e.workflowId === null && e.localTicketId === null && e.ticketApplicable === false))
  assert.equal((await f.read(second.id)).instance.instrumentInstanceId, root.instance.instrumentInstanceId)
  nativeChild(f, 'research-over-reference')
  await f.managed()
  assert.equal(f.nativeCalls.length, 3)
  assert.equal((await f.read()).windows.S.overcommitted, true)
})

test('future controlled native activity: managed ticket assignment narrows new child permissions', async t => {
  const f = await ready(t, { known: true })
  await f.apply('put-ticket', { localTicketId: 'A', value: ticket() })
  await f.apply('put-ticket', { localTicketId: 'B', value: ticket() })
  await f.window('reserve', 'A')
  const child = nativeChild(f)
  await f.managed({ workflowId: 'flow', localTicketId: 'A' })
  const childView = await f.read(child.id)
  assert.deepEqual(childView.records.scope, { kind: 'assigned', workflowId: 'flow', ticketIds: ['A'] })
  assert.deepEqual(childView.records.tickets.map(t => t.localTicketId), ['A'])
  await f.apply('put-ticket', { localTicketId: 'A', value: ticket('repair') }, child.id)
  await rejectsCode(f.apply('put-ticket', { localTicketId: 'B', value: ticket('repair') }, child.id), 'access-denied')
})


test('future controlled native activity: only exact disposed object releases S; idle/end/business text do not', async t => {
  const f = await ready(t, { known: true })
  for (const id of ['A', 'B', 'C']) await f.apply('put-ticket', { localTicketId: id, value: ticket() })
  await f.window('reserve', 'A'); await f.window('reserve', 'B')
  const first = nativeChild(f, 'same-session')
  await f.managed({ workflowId: 'flow', localTicketId: 'A' })
  await f.event(first, 'agent-status', { status: 'running' })
  await f.event(first, 'agent-status', { status: 'idle' })
  await f.event(first, 'subagent-end', { runId: 'ended', provider: 'spawn', local: true, stopReason: 'completed' })
  let root = await f.read()
  assert.equal(root.windows.S.used, 1); assert.equal(root.windows.S.byState.running, 1)
  await f.window('release', 'A', { generation: 1 }); await f.window('reserve', 'C')
  root = await f.read()
  assert.equal(root.windows.T.used, 2); assert.equal(root.windows.S.used, 1)
  const replacement = nativeChild(f, first.id)
  await f.managed({ workflowId: 'flow', localTicketId: 'B' })
  assert.notEqual(first, replacement)
  assert.equal((await f.read()).windows.S.used, 2)
  await f.event(first)
  root = await f.read()
  assert.equal(root.windows.S.used, 1)
  assert.equal(root.windows.executions.at(-1).state, 'accepted')
  await f.event(replacement)
  root = await f.read()
  assert.equal(root.windows.S.used, 0); assert.equal(root.windows.T.used, 2)
  nativeChild(f, 'refill')
  await f.managed({ workflowId: 'flow', localTicketId: 'B' })
  assert.equal((await f.read()).windows.S.used, 1)
})

test('future controlled native activity: output/message JSON and absent object proof retain unknown capacity', async t => {
  const f = await fixture(t, { known: true, initialPolicy: policy() })
  f.setNative(async () => ({ isError: false, value: { state: 'released', sessionId: 'old-child', receipt: { S: 0 } } }))
  await f.managed()
  await f.runtime.observe({ kind: 'agent-disposed', sessionId: 'old-child' })
  await f.event(f.agents.get('old-child'), 'subagent-end', { runId: 'json-released', provider: 'spawn', local: true, stopReason: 'released' })
  const snap = await f.read()
  assert.equal(snap.windows.S.used, 1)
  assert.equal(snap.windows.executions[0].state, 'unknown')
  assert.equal(snap.windows.S.available, 1)
  await f.managed()
  assert.equal(f.nativeCalls.length, 2)
})

test('unmanaged exact native object observations make knowledge unknown, never a guessed empty enumeration', async t => {
  const f = await fixture(t, { known: true, initialPolicy: policy() })
  await f.event(f.agents.get('old-child'), 'agent-status', { status: 'running' })
  const snap = await f.read()
  assert.equal(snap.windows.runtimeKnowledge.known, false)
  assert.equal(snap.windows.runtimeKnowledge.reason, 'unmanaged-native-execution-observed')
  await f.managed()
  assert.equal(f.nativeCalls.length, 1)
})

test('actual installed host ports nativeActivity is false with actual objects: unknown S remains advisory while T works', async t => {
  const f = await mountedFixture(t)
  const actual = await f.mounted.ports.nativeActivity('root')
  assert.equal(actual.known, false)
  assert.equal(actual.reason, 'all-native-activity-enumeration-unsupported')
  assert(actual.liveAgents.includes(f.root)); assert(actual.liveAgents.includes(f.child))
  await f.runtime.savePolicy(operator, policy(), 0, signal())
  await f.runtime.applyInstrument(caller('root'), 'root', { operationId: 'installed-wf', expectedRevision: 0, action: 'put-workflow', workflowId: 'flow', value: workflow }, signal())
  await f.runtime.applyInstrument(caller('root'), 'root', { operationId: 'installed-tk-A', expectedRevision: 1, action: 'put-ticket', workflowId: 'flow', localTicketId: 'A', value: ticket() }, signal())
  const T = await f.execute('mattpocock_window', { request: { action: 'reserve', operationId: 'installed-T', workflowId: 'flow', localTicketId: 'A' } })
  assert.equal(T.isError, false)
  let nativeCalls = 0
  f.ctx.tools.register(sdk.defineTool({ name: 'subagent', description: 'mechanical native', parameters: {},
    output: { schema: { type: 'null' }, render: () => [] }, async execute() { nativeCalls++; return null } }))
  const r = await f.execute('mattpocock_execute', { request: { nativeTool: 'subagent', arguments: {}, workflowId: null, localTicketId: null } })
  assert.equal(r.isError, false)
  assert.equal(nativeCalls, 1)
  const snap = await f.runtime.readSession(caller('root'), 'root', signal())
  assert.equal(snap.windows.T.used, 1)
  assert.equal(snap.windows.runtimeKnowledge.known, false)
})

test('fresh preStep/postExecute snapshots retain source authors; disabled/hide does not erase obligations', async t => {
  const f = await ready(t, { known: true })
  await f.apply('put-ticket', { localTicketId: 'A', value: ticket() })
  await f.apply('put-decision', { decisionId: 'D', value: { question: '未解决事项', status: '业务自定义', pending: true, addressee: { kind: 'user', principalId: operator.principalId } } })
  await f.window('reserve', 'A')
  const child = nativeChild(f)
  await f.managed({ workflowId: 'flow', localTicketId: 'A' })
  const before = await f.runtime.preStep(caller('root'), signal())
  await f.apply('put-ticket', { localTicketId: 'A', value: ticket('repair', '最新业务报告-watermark') })
  const sameStep = await f.runtime.postExecute(caller('root'), f.exec(), { isError: false, value: 'ordinary delivery' })
  assert.equal(sameStep.length, 0, 'a later pass of the same admitted step is not installed again')
  // The first delivery of an admitted step may come from a tool result: the host passes that step's name.
  const after = await f.runtime.postExecute(caller('root'), f.exec(), { isError: false, value: 'ordinary delivery' }, 'next:1')
  assert.equal(before[0].source.kind, 'mattpocock-controls')
  assert.equal(after[0].source.form, 'snapshot')
  assert.match(after[0].content[0].text, /最新业务报告-watermark/)
  assert.doesNotMatch(before[0].content[0].text, /最新业务报告-watermark/)
  await f.save({ extensionEnabled: false, defaults: { display: { header: false, inputSummary: false, rightPanel: false, sessionList: false, timeline: false } }, workspaceOverrides: {} })
  const disabled = await f.runtime.preStep(caller('root'), signal())
  assert.match(disabled[0].content[0].text, /Management feature is OFF/)
  assert.match(disabled[0].content[0].text, /未解决事项/)
  const snap = await f.read()
  assert.equal(snap.windows.S.used, 1); assert.equal(snap.windows.T.used, 1)
  assert.equal(snap.records.decisions[0].value.pending, true)
  assert.deepEqual(f.guards, [], 'advisory instruments install no native veto')
  await f.event(child)
  assert.equal((await f.read()).windows.S.used, 0)
})

test('program receipt commit registers its watermark synchronously before parent preStep can read', async t => {
  const f = await fixture(t, { known: true, initialPolicy: policy(), consumptionTimeoutMs: 1000 })
  const child = nativeChild(f)
  await f.managed()
  const entered = deferred(), permit = deferred()
  const realCas = f.windowStorage.compareAndSwap.bind(f.windowStorage)
  f.windowStorage.compareAndSwap = async (...args) => {
    if (args[2].executions.some(row => row.state === 'released')) { entered.resolve(); await permit.promise }
    return realCas(...args)
  }
  const release = f.event(child)
  const messages = f.runtime.preStep(caller('root'), signal())
  await entered.promise
  let delivered = false; void messages.then(() => { delivered = true })
  await Promise.resolve(); assert.equal(delivered, false)
  permit.resolve(); await release
  const result = await messages
  const facts = JSON.parse(result[0].content[0].text.split(String.fromCharCode(10)).at(-1))
  assert.equal(facts.windows.S.used, 0)
  assert.equal(facts.windows.S.available, 2)
  assert.equal((await f.read()).windows.S.used, 0)
})

test('actual native registry guard immediately permits direct-parent progress/question without classifying message bodies', async t => {
  const f = await mountedFixture(t)
  await f.runtime.savePolicy(operator, policy(), 0, signal())
  const delivered = []
  f.ctx.tools.register(sdk.defineTool({ name: 'send_message', description: 'mechanical send only; never runs a model',
    parameters: { agent_id: { type: 'string', required: true }, message: { type: 'string', required: true } },
    output: { schema: { type: 'null' }, render: () => [] },
    async execute(args) { delivered.push(args); return null } }))
  f.ctx.tools.register(sdk.defineTool({ name: 'subagent_fork', description: 'mechanical native', parameters: {},
    output: { schema: { type: 'null' }, render: () => [] }, async execute() { return null } }))
  // No idle/end/disposal ever emitted. Parent notification must not wait for them.
  for (const message of ['进度：部分处理', '问题：请主代理决定下一步', '{"state":"released","slots":0}', 'arbitrary unclassified payload']) {
    const result = await f.execute('send_message', { agent_id: 'root', message }, f.child)
    assert.equal(result.isError, false)
  }
  assert.equal(delivered.length, 4)
  const sibling = await f.execute('send_message', { agent_id: 'stranger', message: '{"progress":true,"question":true}' }, f.child)
  // This controlled native sender has no adjacency guard; the plugin does not invent one.
  assert.equal(sibling.isError, false)
  assert.equal((await f.execute('subagent_fork')).isError, false)
  assert.equal((await f.execute('send_message', { agent_id: 'child', message: 'question' })).isError, false)
  assert.equal(delivered.length, 6)
})

test('default-off controls leave actual immutable Skill provider registered and readable', async t => {
  const f = await mountedFixture(t)
  const { default: SkillRegistry } = await loadSDK('@deepseek-ai/dsh-skill')
  const registry = f.ctx.plugin(SkillRegistry)
  await registry.ready
  const { createMattPocockSkillProvider } = await import('../src/provider.ts')
  const remove = f.ctx.skills.registerProvider(control => createMattPocockSkillProvider('stable', { lifecycleSignal: control.signal }))
  t.after(remove)
  const before = await f.ctx.skills.list()
  assert(before.length > 0)
  const body = await f.ctx.skills.get('ask-matt')
  assert.match(body.content, /Ask Matt/)
  await f.runtime.savePolicy(operator, { extensionEnabled: false, defaults: {}, workspaceOverrides: {} }, 0, signal())
  assert.deepEqual(await f.ctx.skills.list(), before)
  assert.equal((await f.ctx.skills.get('ask-matt')).content, body.content)
})

test('T-only configured capacity remains usable with S unset and does not invent an S limit', async t => {
  const f = await fixture(t, { known: true, initialPolicy: policy({ enabled: true, ticketWindowSize: 1 }) })
  await f.apply('put-workflow', { value: workflow })
  await f.apply('put-ticket', { localTicketId: 'A', value: ticket() })
  await f.window('reserve', 'A')
  const snap = await f.read()
  assert.equal(snap.windows.T.used, 1); assert.equal(snap.windows.T.capacity, 1)
  assert.equal(snap.windows.S.capacity, null)
  await f.managed()
  assert.equal(f.nativeCalls.length, 1)
})

test('S-only configured capacity permits ticketless admission with T unset and does not fabricate a ticket', async t => {
  const f = await fixture(t, { known: true, initialPolicy: policy({ enabled: true, runningSubagentLimit: 1 }) })
  nativeChild(f)
  await f.managed()
  const snap = await f.read()
  assert.equal(snap.windows.S.used, 1); assert.equal(snap.windows.S.capacity, 1)
  assert.equal(snap.windows.T.capacity, null); assert.equal(snap.windows.T.used, 0)
  await f.apply('put-workflow', { value: workflow })
  await f.apply('put-ticket', { localTicketId: 'A', value: ticket() })
  await f.window('reserve', 'A')
  assert.equal((await f.read()).windows.T.capacity, null)
})

test('queued policy save and S observation serialize against fresh advisory policy rather than a stale view', async t => {
  const f = await fixture(t, { known: true, initialPolicy: policy() })
  nativeChild(f, 'held'); await f.managed()
  const entered = deferred(), permit = deferred()
  const realCas = f.controlsStorage.compareAndSwap.bind(f.controlsStorage)
  f.controlsStorage.compareAndSwap = async (revision, next) => {
    if (next.policy.revision === 2) { entered.resolve(); await permit.promise }
    return realCas(revision, next)
  }
  const save = f.save(policy({ enabled: true, ticketWindowSize: 2, runningSubagentLimit: 1 }))
  await entered.promise
  nativeChild(f, 'over-reference')
  const dispatched = f.managed()
  assert.equal(f.nativeCalls.length, 1)
  permit.resolve(); await save; await dispatched
  assert.equal(f.nativeCalls.length, 2)
  await f.save(policy({ enabled: true, ticketWindowSize: 2, runningSubagentLimit: 2 }))
  nativeChild(f, 'after-reference-change')
  await f.managed()
  assert.equal(f.nativeCalls.length, 3)
})

test('assignment grant must recheck the direct parent permission after a queued assignment revocation', async t => {
  const f = await ready(t)
  await f.assign('old-child', 'flow', ['A'])
  const grandchild = actualAgent('old-grandchild', { parent: 'old-child', managed: true })
  await f.created(grandchild)
  const runtimeStorage = f.units.get('runtime_bindings')
  const entered = deferred(), permit = deferred(), preparedTarget = deferred()
  const realCas = runtimeStorage.compareAndSwap.bind(runtimeStorage)
  const realFacts = f.ports.sessionFacts.bind(f.ports)
  t.after(() => permit.resolve())
  runtimeStorage.compareAndSwap = async (revision, next) => {
    if (next.assignments.find(row => row.sessionId === 'old-child')?.ticketIds[0] === 'B') { entered.resolve(); await permit.promise }
    return realCas(revision, next)
  }
  const revoke = f.assign('old-child', 'flow', ['B'])
  await entered.promise
  f.ports.sessionFacts = async (...args) => { const value = await realFacts(...args); if (args[0] === grandchild.id) preparedTarget.resolve(); return value }
  const delegate = f.assign(grandchild.id, 'flow', ['A'], 'old-child')
  const result = delegate.then(value => ({ value }), error => ({ error }))
  await preparedTarget.promise
  // Drain promise-only preparation; no wall-clock sleeps or polling a job.
  await new Promise(setImmediate)
  permit.resolve(); await revoke
  const outcome = await result
  assert.equal(outcome.error?.code, 'access-denied', 'queued revocation must not leave an A grant after parent scope becomes B')
})

test('unknown pre-descriptor observations never install advisory native guards', async t => {
  const f = await fixture(t)
  const pending = actualAgent('pre-descriptor-child', { parent: 'root', managed: true })
  pending.session.ownEvents = () => []
  f.agents.set(pending.id, pending)
  await f.save(policy())
  assert.deepEqual(f.guards, [])
  await f.save({ extensionEnabled: false, defaults: {}, workspaceOverrides: {} })
  assert.deepEqual(f.guards, [])
})

test('late inherited native AsyncLocalStorage cannot bind a new object or reuse the completed admission capability', async t => {
  const f = await fixture(t, { known: true, initialPolicy: policy() })
  const accepted = actualAgent('accepted-child', { parent: 'root', managed: true })
  const late = actualAgent('late-child', { parent: 'root', managed: true })
  const permit = deferred()
  let lateCreated, lateGuard
  f.setNative(async (exec, name, args) => {
    await f.created(accepted)
    lateCreated = permit.promise.then(async () => {
      lateGuard = f.guards.some(guard => guard({ name, arguments: args, agent: exec.agent, parent: exec.token }) !== undefined)
      await f.created(late)
    })
    return { isError: false, value: 'ordinary output cannot extend the dispatch lifetime' }
  })
  await f.managed()
  assert.equal((await f.read()).windows.S.used, 1)
  permit.resolve(); await lateCreated
  assert.equal(lateGuard, false)
  const snap = await f.read(late.id)
  assert.deepEqual(snap.records.scope, { kind: 'assigned', workflowId: null, ticketIds: [] })
  assert.equal(snap.windows.S.used, 1)
  assert.equal(snap.windows.runtimeKnowledge.known, false)
  const bindings = await f.units.get('runtime_bindings').read()
  assert.deepEqual(bindings.bindings.map(row => row.sessionId), [accepted.id])
})

test('future controlled native activity traverses actual ctx.tools native guards with the exact managed parent token', async t => {
  const f = await mountedFixture(t, { futureNativeActivityKnown: true })
  assert.equal((await f.mounted.ports.nativeActivity('root')).known, false)
  await f.runtime.savePolicy(operator, policy(), 0, signal())
  const seen = []
  let wrapperToken
  f.ctx.tools.guard(exec => {
    if (exec.name === 'mattpocock_execute') wrapperToken = exec.token
    if (exec.name === 'subagent') seen.push(exec)
  })
  f.ctx.tools.register(sdk.defineTool({ name: 'subagent', description: 'future program-event simulation only', parameters: {},
    output: { schema: { type: 'null' }, render: () => [] }, async execute(_, exec) {
      assert.equal(exec.agent, f.root); assert.equal(exec.parent, wrapperToken)
      const child = actualAgent('registry-managed-child', { parent: 'root', managed: true })
      f.agents.set(child.id, child)
      await f.runtime.created(caller(child.id), exec.signal, child)
      return null
    } }))
  const result = await f.execute('mattpocock_execute', { request: { nativeTool: 'subagent', arguments: {}, workflowId: null, localTicketId: null } })
  assert.equal(result.isError, false)
  assert.equal(seen.length, 1)
  const snap = await f.runtime.readSession(caller('root'), 'root', signal())
  assert.equal(snap.windows.S.used, 1)
  assert.equal(snap.windows.executions[0].state, 'accepted')
})

const retainedIdentity = { repositoryPath: '/fixture/repo', root: '/fixture', path: '/fixture/tree',
  gitCommonDir: '/fixture/repo/.git', gitCommonDirIdentity: 'fixture-common', gitDir: '/fixture/repo/.git/worktrees/tree',
  gitDirIdentity: 'fixture-private', pathIdentity: 'fixture-tree', rootIdentity: 'fixture-root',
  branchRef: 'refs/heads/tree', branchOwned: true, ownership: 'owned', baseOid: 'a'.repeat(40) }

test('cold resource dashboard reads only retained metadata, preserves unknown physical proof, never activates a cold Agent', async t => {
  const f = await fixture(t, { initialPolicy: policy(undefined, { binding: { enabled: true }, lifecycle: { enabled: true } }) })
  const root = await f.read()
  await f.resourceStorage.compareAndSwap(0, core.parseResourceDocument({ schemaVersion: 1, revision: 1, leases: [], resources: [{
    resourceId: 'retained-tree', controlWorkspaceId: 'W', ownerInstanceId: root.instance.instrumentInstanceId,
    identity: retainedIdentity, status: 'retained', business: { status: '待补修；不是物理空闲' }, businessAuthorId: 'agent:root',
    references: [{ bindingId: 'historical-binding', instrumentInstanceId: root.instance.instrumentInstanceId,
      sessionId: 'old-child', state: 'cold', reusable: true, entryOpen: true }],
    retireRequest: null, entrancesClosed: false, nativeColdResumeClosed: false, diagnostic: null,
  }] }))
  f.cold.set('root', f.agents.get('root')); f.agents.delete('root')
  // No subprocess/FS peers or fallback executable exist. Actual host factory must
  // report unsupported for a cold session, not fabricate a child cwd or resume it.
  f.setRunner((sessionId, control) => host.createAuthorizedGitRunner(f.ctx, sessionId, control))
  const cold = await f.read('root', operator)
  assert.equal(cold.resources.length, 1)
  assert.equal(cold.resources[0].business.status, '待补修；不是物理空闲')
  assert.equal(cold.resources[0].references[0].state, 'cold')
  assert.equal(cold.resources[0].actualCanRetire.facts, null)
  assert.equal(cold.resources[0].actualCanRetire.allowed, false)
  assert(cold.resources[0].actualCanRetire.reasons.includes('physical-inspection-unsupported'))
  assert.equal(f.agents.has('root'), false)
  assert.equal(f.nativeCalls.length, 0)
  assert.equal(f.observations.filter(id => id === 'root').length, f.observations.filter(id => id === 'released:root').length)
  assert.deepEqual(await f.ports.resourceLifecycle.closeEntrypoints(), { closed: false, nativeColdResumeClosed: false })
  assert.equal(await f.ports.resourceLifecycle.verifyInitialBinding(), false)
  await rejectsCode(f.runtime.resourceAction(caller('old-child'), 'old-child', { action: 'update-business', resourceId: 'retained-tree', business: { status: 'child cannot mutate whole resource' } }, signal()), 'access-denied')
  await rejectsCode(f.runtime.resourceAction(operator, 'root', { action: 'borrow', path: '/fixture/tree' }, signal()), 'unsupported')
  assert.deepEqual((await f.read('other')).resources, [])
})

test('legacy runtime resource actions remain read-only without Git management or child mutation bypass', async t => {
  const f = await fixture(t, { initialPolicy: policy(undefined, { binding: { enabled: true }, lifecycle: { enabled: true } }) })
  let mode = 'workspace-write', spawned = 0
  const services = {
    fs: { async resolve(path) { return { displayPath: path, targetKey: path } },
      contains(root, target) { return target.displayPath === root.displayPath || target.displayPath.startsWith(root.displayPath + '/') } },
    subprocess: { async resolveExecutable() { throw new Error('authorization must refuse before executable lookup') },
      spawn() { spawned++; throw new Error('must never spawn a process in this test') } },
    sandboxPolicy: { resolve: () => ({ mode, workspaceRoot: '/fixture', sessionId: 'root' }) },
  }
  f.ctx.get = name => services[name]
  f.setRunner((sessionId, control) => host.createAuthorizedGitRunner(f.ctx, sessionId, control))
  const request = { action: 'create', spec: { repositoryPath: '/fixture/repo', root: '/outside-authorized-root', name: 'tree', startPoint: 'HEAD' } }
  await rejectsCode(f.runtime.resourceAction(caller('root'), 'root', request, signal()), 'unsupported')
  assert.equal(f.gitCalls.length, 0)
  const before = f.gitCalls.length
  await rejectsCode(f.runtime.resourceAction(caller('old-child'), 'old-child', request, signal()), 'access-denied')
  assert.equal(f.gitCalls.length, before)
  mode = 'read-only'
  await rejectsCode(f.runtime.resourceAction(operator, 'root', { ...request, spec: { ...request.spec, root: '/fixture/trees' } }, signal()), 'unsupported')
  assert.equal(spawned, 0)
  assert.equal(await f.resourceStorage.read(), undefined)
})

test('public read of never-registered cold root does not silently create an instrument instance', async t => {
  const f = await fixture(t)
  f.cold.set('unseen-owner', actualAgent('unseen-owner'))
  const before = await f.controlsStorage.read()
  await rejectsCode(f.read('unseen-owner', operator), 'unknown-session')
  assert.deepEqual(await f.controlsStorage.read(), before)
  assert.equal(f.agents.has('unseen-owner'), false)
  assert.equal(f.nativeCalls.length, 0)
})

test('bounded snapshot representation degrades to sourced short unknown rather than rejecting accepted business input', async t => {
  const f = await ready(t)
  await f.apply('put-ticket', { localTicketId: 'A', value: ticket('repair', 'fresh business is still retained') })
  const actualMake = f.ports.makeSnapshotMessage
  const attempted = []
  // Small boundary injection exercises the exact actual Host source formatter,
  // without hundreds of large business fixture records or a fabricated renderer.
  f.ports.makeSnapshotMessage = text => {
    attempted.push(text)
    if (text.length > 512) throw new core.ControlsError('invalid-input', 'controlled representation bound')
    return actualMake(text)
  }
  for (const messages of [await f.runtime.preStep(caller('root'), signal())]) {
    assert.equal(messages.length, 1)
    assert.equal(messages[0].source.kind, 'mattpocock-controls')
    assert.match(messages[0].content[0].text, /Current detail is unknown/)
    assert.match(messages[0].content[0].text, /Accepted business input is retained/)
    assert(messages[0].content[0].text.length <= 512)
  }
  const retry = await f.runtime.postExecute(caller('root'), f.exec(), { isError: false, value: 'ordinary native business result' })
  assert.equal(retry.length, 0, 'the fallback already queued in this step is not queued again')
  const nextStep = await f.runtime.preStep(caller('root'), signal())
  assert.equal(nextStep.length, 1, 'formatting failure and unconfirmed delivery never consume the baseline')
  assert.match(nextStep[0].content[0].text, /Current detail is unknown/)
  assert(attempted.some(text => text.length > 512))
  assert.equal((await f.read()).records.tickets[0].value.summary, 'fresh business is still retained')
})

test('public snapshot policy and window configuration reflect the same committed Host policy revision', async t => {
  const f = await fixture(t, { known: true, initialPolicy: policy() })
  await f.save(policy({ enabled: true, ticketWindowSize: 3, runningSubagentLimit: 1 }))
  const snap = await f.read()
  assert.equal(snap.policy.configurationRevision, 2)
  assert.equal(snap.windows.configurationRevision, 2)
  assert.equal(snap.windows.T.capacity, 3)
  assert.equal(snap.windows.S.capacity, 1)
  assert.deepEqual(f.guards, [], 'policy changes do not install native vetoes')
})

test('resident follow-up preserves native child and incomplete S observation without another lease', async t => {
  const f = await fixture(t, { known: true, initialPolicy: policy() })
  const child = nativeChild(f, 'resident-child')
  await f.managed(); await f.event(child, 'agent-status', { status: 'running' })
  f.setNative(async () => ({ isError: false, value: { delivered: true } }))
  const outcome = await f.managed({ nativeTool: 'send_message', args: { agent_id: child.id, message: 'resident continuation' } })
  assert.equal(outcome.outcome, 'success')
  assert.equal(f.nativeCalls.length, 2)
  assert.equal((await f.read()).windows.S.used, 1)
})

test('oversized source snapshot produces bounded locators while preserving full current detail', async t => {
  const f = await ready(t)
  await f.apply('put-decision', { decisionId: 'large-source-detail', value: {
    question: 'q'.repeat(65536), status: '任务自定义', context: 'c'.repeat(65536),
    recommendation: 'r'.repeat(65536), impact: 'i'.repeat(65536), pending: true,
  } })
  const messages = await f.runtime.preStep(caller('root'), signal())
  assert.equal(messages.length, 1)
  assert(messages[0].content[0].text.length < 24000)
  assert.match(messages[0].content[0].text, /mattpocock_history/)
  assert.equal(messages[0].source.kind, 'mattpocock-controls')
  assert(f.runtime.context(caller('root')).length < 512)
  const retained = await f.read()
  assert.equal(retained.records.decisions[0].value.question.length, 65536)
  assert.equal(retained.records.decisions[0].value.pending, true)
})

test('late identity read from an older policy revision cannot overwrite a newly enabled native guard cache', async t => {
  const f = await fixture(t)
  const captured = deferred(), permit = deferred()
  const realRead = f.controlsStorage.read.bind(f.controlsStorage)
  const realVerify = f.ports.authority.verifyWorkspace.bind(f.ports.authority)
  let nextRead = false, armed = true
  f.ports.authority.verifyWorkspace = async (...args) => {
    const verified = await realVerify(...args)
    if (armed) { armed = false; nextRead = true }
    return verified
  }
  f.controlsStorage.read = async () => {
    const old = await realRead()
    if (nextRead) { nextRead = false; captured.resolve(); await permit.promise }
    return old
  }
  const prepared = f.runtime.created(caller('root'), signal(), f.agents.get('root'))
  await captured.promise
  try { await f.runtime.savePolicy(operator, policy(), 0, signal()) }
  finally { permit.resolve() }
  await prepared
  assert.deepEqual(f.guards, [], 'policy changes do not install native vetoes')
})

test('full advisory S does not refuse native follow-up or alter the child identity and cwd', async t => {
  const f = await fixture(t, { known: true, initialPolicy: policy({ enabled: true, ticketWindowSize: 2, runningSubagentLimit: 1 }) })
  const worker = nativeChild(f, 'full-S-resident')
  await f.managed(); await f.event(worker, 'agent-status', { status: 'running' })
  const before = await f.read(), bindingsBefore = await f.units.get('runtime_bindings').read()
  const originalHeader = worker.session.header
  f.setNative(async () => ({ isError: false, value: { delivered: true } }))
  await f.managed({ nativeTool: 'send_message', args: { agent_id: worker.id, message: 'same active worker follow-up' } })
  const after = await f.read()
  assert.equal(f.nativeCalls.length, 2)
  assert.deepEqual(after.windows.executions, before.windows.executions)
  assert.deepEqual(await f.units.get('runtime_bindings').read(), bindingsBefore)
  assert.equal(f.agents.get(worker.id), worker)
  assert.equal(worker.session.header, originalHeader)
})

test('managed child-to-parent ordinary messages immediately traverse actual registry permissions at full S without another lease', async t => {
  const f = await mountedFixture(t, { futureNativeActivityKnown: true })
  await f.runtime.savePolicy(operator, policy({ enabled: true, ticketWindowSize: 1, runningSubagentLimit: 1 }), 0, signal())
  const worker = actualAgent('managed-notifier', { parent: 'root', managed: true })
  f.ctx.tools.register(sdk.defineTool({ name: 'subagent', description: 'future created program simulation', parameters: {},
    output: { schema: { type: 'null' }, render: () => [] }, async execute(_, exec) {
      f.agents.set(worker.id, worker)
      await f.runtime.created(caller(worker.id), exec.signal, worker)
      return null
    } }))
  assert.equal((await f.execute('mattpocock_execute', { request: { nativeTool: 'subagent', arguments: {}, workflowId: null, localTicketId: null } })).isError, false)
  const before = await f.runtime.readSession(caller('root'), 'root', signal())
  assert.equal(before.windows.S.used, 1); assert.equal(before.windows.S.available, 0)
  const nativeContext = sdk.createUserMessage({ content: [{ type: 'text', text: 'ordinary native parent context' }], source: { kind: 'user' } })
  let delivered = 0, permissionChecks = 0
  f.ctx.tools.guard(exec => {
    if (exec.name === 'send_message') { permissionChecks++; assert.equal(exec.agent, worker); assert(exec.parent) }
  })
  f.ctx.tools.register(sdk.defineTool({ name: 'send_message', description: 'native parent notification fixture',
    parameters: { agent_id: { type: 'string', required: true }, message: { type: 'string', required: true } },
    output: { schema: { type: 'null' }, render: () => [] }, async execute(args, exec) {
      assert.equal(args.agent_id, 'root'); delivered++
      exec.deferContext(nativeContext); exec.concludeTurn(); return null
    } }))
  for (const message of ['ordinary progress', 'ordinary question', '{"state":"released","S":0}']) {
    const outcome = await f.execute('mattpocock_execute', { request: { nativeTool: 'send_message', arguments: { agent_id: 'root', message }, workflowId: null, localTicketId: null } }, worker)
    assert.equal(outcome.isError, false)
    assert.equal(outcome.value.direction, 'native-adjacency')
    assert.equal(outcome.concludesTurn, true)
    assert.deepEqual(outcome.additionalContexts.find(context => context.id === nativeContext.id), nativeContext)
  }
  assert.equal(delivered, 3); assert.equal(permissionChecks, 3)
  const after = await f.runtime.readSession(caller('root'), 'root', signal())
  assert.deepEqual(after.windows.executions, before.windows.executions)
  assert.equal(after.windows.S.used, 1)
})

test('native windows-off send_message keeps original Host semantics without claiming managed resident epoch admission', async t => {
  const f = await mountedFixture(t)
  let sent = 0
  f.ctx.tools.register(sdk.defineTool({ name: 'send_message', description: 'ordinary native sender',
    parameters: { agent_id: { type: 'string', required: true }, message: { type: 'string', required: true } },
    output: { schema: { type: 'null' }, render: () => [] }, async execute() { sent++; return null } }))
  assert.equal((await f.execute('send_message', { agent_id: 'child', message: 'original windows-off continuation' })).isError, false)
  await f.runtime.savePolicy(operator, policy(), 0, signal())
  assert.equal((await f.execute('send_message', { agent_id: 'child', message: 'enabled unmanaged child wake' })).isError, false)
  await f.runtime.savePolicy(operator, { extensionEnabled: false, defaults: {}, workspaceOverrides: {} }, 1, signal())
  assert.equal((await f.execute('send_message', { agent_id: 'child', message: 'off again; native Host owns admission' })).isError, false)
  assert.equal(sent, 3)
})

test('actual mounted SDK storage-uncertain preparation preserves native enter/messages and settled tool context/conclusion', async t => {
  const f = await mountedFixture(t)
  await f.runtime.savePolicy(operator, policy(), 0, signal())
  const native = sdk.createUserMessage({ content: [{ type: 'text', text: 'accepted native business input remains original' }], source: { kind: 'user' } })
  const storage = f.mounted.ports.controlsStorage, realRead = storage.read
  storage.read = async () => { throw new core.ControlsError('storage-uncertain', 'controlled uncertain policy storage') }
  t.after(() => { storage.read = realRead })
  const original = { kind: 'enter', messages: [native], startsRequestSeries: true }
  const decision = await f.ctx.waterfall('agent/pre-step', { agent: f.root, messages: [native], turn: 1, step: 1, signal: signal() }, async () => original)
  assert.equal(decision.kind, 'enter')
  assert.equal(decision.startsRequestSeries, true)
  assert.equal(decision.messages[0], native)
  assert.equal(decision.messages[0].id, native.id)
  assert.equal(decision.messages[0].source, native.source)
  assert.equal(original.messages.length, 1)
  assert.equal(decision.messages.length, 2)
  assert.equal(decision.messages[1].source.kind, 'mattpocock-controls')
  assert.match(decision.messages[1].content[0].text, /Instrument context unavailable/)
  assert.match(decision.messages[1].content[0].text, /Accepted business input is retained/)
  f.ctx.tools.register(sdk.defineTool({ name: 'fault_native', description: 'settled ordinary native result', parameters: {},
    output: { schema: { type: 'json' }, render: () => [{ type: 'text', text: 'unchanged ordinary native output' }] },
    async execute(_, exec) { exec.deferContext(native); exec.concludeTurn(); return { business: 'original settled value' } } }))
  const result = await f.execute('fault_native')
  assert.equal(result.isError, false)
  assert.deepEqual(result.value, { business: 'original settled value' })
  assert.equal(result.concludesTurn, true)
  assert(result.content.some(block => block.text === 'unchanged ordinary native output'))
  assert.deepEqual(result.additionalContexts[0], native)
  assert.equal(result.additionalContexts[0].id, native.id)
  // The same unavailable notice was already queued by this step's pre-step decision, so the tool
  // result adds nothing: an identical notice is installed once per step.
  assert.equal(result.additionalContexts.length, 1)
  assert.equal(result.additionalContexts.some(context => context.source.kind === 'mattpocock-controls'), false)
})

test('actual mounted SDK caller abort during uncertain policy preparation preserves the exact reason, not an unknown fallback', async t => {
  const f = await mountedFixture(t)
  const storage = f.mounted.ports.controlsStorage, realRead = storage.read
  storage.read = async () => { throw new core.ControlsError('storage-uncertain', 'controlled uncertain policy storage') }
  t.after(() => { storage.read = realRead })
  const native = sdk.createUserMessage({ content: [{ type: 'text', text: 'accepted ordinary input' }], source: { kind: 'user' } })
  const controller = new AbortController(), reason = new Error('exact caller cancellation reason')
  controller.abort(reason)
  await assert.rejects(f.ctx.waterfall('agent/pre-step', { agent: f.root, messages: [native], turn: 1, step: 1, signal: controller.signal },
    async () => ({ kind: 'enter', messages: [native], startsRequestSeries: true })), error => error === reason)
  const settled = Object.freeze({ isError: false, value: null, content: [], concludesTurn: true })
  await assert.rejects(f.ctx.waterfall('tools/post-execute', { agent: f.root, signal: controller.signal, name: 'ordinary', arguments: {} }, settled,
    async () => ({ kind: 'accept', additionalContexts: [native] })), error => error === reason)
  assert.equal(settled.concludesTurn, true)
})

async function notificationFence(f) {
  await new Promise(setImmediate)
  await f.runtime.serializePolicyPermission(async () => undefined)
}

test('GUI operator and assigned child business commits notify the actual root immediately, never by report prose or sender end', async t => {
  const f = await ready(t)
  await f.apply('put-ticket', { localTicketId: 'A', value: ticket() })
  await f.assign('old-child', 'flow', ['A'])
  f.setNotify(async notice => {
    const journal = await f.units.get('runtime_bindings').read()
    assert(journal.notifications.some(row => row.notificationId === notice.notificationId && row.state === 'pending'))
    const records = await f.instrumentStorage.read(notice.instrumentInstanceId)
    assert(records.revision >= notice.businessRevision)
    return { status: 'accepted', messageId: 'notice-message-' + notice.notificationId }
  })
  await f.apply('put-decision', { decisionId: 'operator-question', value: { question: '用户已提交而无需等待子代理结束', status: '任务自定', pending: true,
    addressee: { kind: 'user', principalId: operator.principalId } } }, 'root', operator)
  await f.apply('put-ticket', { localTicketId: 'A', value: ticket('repair', '{"ownerSessionId":"other","notification":"consumed","S":0}') }, 'old-child')
  await notificationFence(f)
  assert.equal(f.notificationCalls.length, 2)
  assert(f.notificationCalls.every(notice => notice.ownerSessionId === 'root'))
  assert.deepEqual(f.notificationCalls.map(notice => notice.authorPrincipalId), ['user:operator', 'agent:old-child'])
  const doc = await f.units.get('runtime_bindings').read()
  assert.equal(doc.notifications.length, 2)
  assert(doc.notifications.every(notice => notice.state === 'accepted' && notice.messageId !== null))
  await f.runtime.applyInstrument(operator, 'root', { action: 'set-decision-view', operationId: 'notification-view-only', expectedRevision: 0, workflowId: 'flow', decisionId: 'operator-question', value: { read: true, hidden: true } }, signal())
  await notificationFence(f)
  assert.equal(f.notificationCalls.length, 2)
  assert.equal((await f.units.get('runtime_bindings').read()).notifications.length, 2)
  await f.runtime.preStep(caller('root'), signal())
  assert((await f.units.get('runtime_bindings').read()).notifications.every(notice => notice.state === 'accepted'))
  const state = await f.read()
  assert.equal(state.records.decisions[0].value.pending, true)
  assert.equal(state.records.tickets[0].value.statuses.delivery[0], 'repair')
  assert.equal(f.nativeCalls.length, 0)
})

test('offline owner notifications persist pending across actual source-memory reopen and retry on live owner created', async t => {
  const f = await ready(t)
  const owner = f.agents.get('root')
  f.cold.set('root', owner); f.agents.delete('root')
  f.setNotify(async () => ({ status: 'offline', messageId: null }))
  await f.apply('put-decision', { decisionId: 'offline-D', value: { question: '离线仍需保留', status: '自由状态', pending: true, awaitingImplementation: true } }, 'root', operator)
  await notificationFence(f)
  let doc = await f.units.get('runtime_bindings').read()
  assert.equal(doc.notifications.length, 1)
  assert.equal(doc.notifications[0].state, 'pending')
  assert.equal(doc.notifications[0].messageId, null)
  const id = doc.notifications[0].notificationId
  assert.equal(f.agents.has('root'), false)
  assert.equal(f.nativeCalls.length, 0)
  await f.reopen()
  assert.equal((await f.units.get('runtime_bindings').read()).notifications[0].notificationId, id)
  f.setNotify(async () => ({ status: 'accepted', messageId: 'program-message-offline-D' }))
  await f.created(owner)
  await notificationFence(f)
  doc = await f.units.get('runtime_bindings').read()
  assert.equal(doc.notifications[0].notificationId, id)
  assert.equal(doc.notifications[0].state, 'accepted')
  assert.equal(doc.notifications[0].messageId, 'program-message-offline-D')
  const state = await f.read()
  assert.equal(state.records.decisions[0].value.pending, true)
  assert.equal(state.records.decisions[0].value.awaitingImplementation, true)
  assert.equal(f.nativeCalls.length, 0)
})

test('notification consumption requires exact owner/message program receipt, never preStep or model business claims', async t => {
  const f = await ready(t)
  f.setNotify(async () => ({ status: 'accepted', messageId: 'exact-program-message' }))
  await f.apply('put-decision', { decisionId: 'D', value: { question: '待裁决', status: '任务自定', pending: true, awaitingImplementation: true } }, 'root', operator)
  await notificationFence(f)
  const notice = (await f.units.get('runtime_bindings').read()).notifications[0]
  assert.equal(notice.state, 'accepted')
  await f.runtime.preStep(caller('root'), signal())
  assert.equal((await f.units.get('runtime_bindings').read()).notifications[0].state, 'accepted')
  // This is the trusted native program facade, not a model/wire command.
  // Mismatching metadata must not consume another owner's accepted notice.
  await Promise.allSettled([f.runtime.notificationCommitted('other', notice.notificationId, notice.messageId),
    f.runtime.notificationCommitted('root', notice.notificationId, 'wrong-message')])
  assert.equal((await f.units.get('runtime_bindings').read()).notifications[0].state, 'accepted')
  await f.runtime.notificationCommitted('root', notice.notificationId, notice.messageId)
  assert.equal((await f.units.get('runtime_bindings').read()).notifications[0].state, 'consumed')
  const state = await f.read()
  assert.equal(state.records.decisions[0].value.pending, true)
  assert.equal(state.records.decisions[0].value.awaitingImplementation, true)
})

test('actual Host steering notice is accepted immediately but consumed only by owned native user-message commit and flush', async t => {
  const f = await mountedFixture(t)
  await f.runtime.savePolicy(operator, policy(), 0, signal())
  const notices = [], ownedEvents = []
  const flushEntered = deferred(), flushPermit = deferred()
  let flushCalls = 0
  f.ctx.provide('sessions', { async flush(session) { assert.equal(session, f.root.session); flushCalls++; flushEntered.resolve(); await flushPermit.promise; return true } })
  t.after(() => flushPermit.resolve())
  f.root.steer = message => { notices.push(message) }
  f.root.session.ownEvents = () => [...ownedEvents]
  await f.runtime.applyInstrument(caller('root'), 'root', { action: 'put-workflow', operationId: 'host-notification-flow', expectedRevision: 0, workflowId: 'flow', value: workflow }, signal())
  await f.runtime.applyInstrument(operator, 'root', { action: 'put-decision', operationId: 'host-notification-D', expectedRevision: 1, workflowId: 'flow', decisionId: 'D',
    value: { question: 'GUI 所属 root 通知', status: '任务自定义', pending: true } }, signal())
  await notificationFence(f)
  assert.equal(notices.length, 1)
  const unit = f.runtimeStorage
  let notice = (await unit.read()).notifications[0]
  assert.equal(notice.ownerSessionId, 'root')
  assert.equal(notice.authorPrincipalId, 'user:operator')
  assert.equal(notice.state, 'accepted')
  assert.equal(notice.messageId, notices[0].id)
  const wireAck = await f.execute('mattpocock_record', { request: { action: 'notificationCommitted', notificationId: notice.notificationId, messageId: notice.messageId } })
  assert.equal(wireAck.isError, true)
  assert.equal((await unit.read()).notifications[0].state, 'accepted')
  // Identical prose/id with ordinary user provenance is NOT program notice proof.
  const ordinary = sdk.createUserMessage({ content: notices[0].content, source: { kind: 'user' } })
  const forged = { ...ordinary, id: notices[0].id }
  const fakeEvent = { type: 'user/message', seq: 1, time: 1, data: forged }
  ownedEvents.push(fakeEvent)
  f.ctx.emit('session/event', f.root.session, fakeEvent)
  await notificationFence(f)
  assert.equal(flushCalls, 0)
  assert.equal((await unit.read()).notifications[0].state, 'accepted')
  const nativeEvent = { type: 'user/message', seq: 2, time: 2, data: notices[0] }
  ownedEvents.push(nativeEvent)
  f.ctx.emit('session/event', f.root.session, nativeEvent)
  await flushEntered.promise
  try {
    assert.equal((await unit.read()).notifications[0].state, 'accepted')
    assert.equal(flushCalls, 1)
  } finally { flushPermit.resolve() }
  await notificationFence(f)
  notice = (await unit.read()).notifications[0]
  assert.equal(notice.state, 'consumed')
  assert.equal(notice.messageId, notices[0].id)
  const state = await f.runtime.readSession(caller('root'), 'root', signal())
  assert.equal(state.records.decisions[0].value.pending, true)
})

test('actual runtime notification journal accepts legacy absence but refuses accepted rows without program message identity', () => {
  const legacy = { schemaVersion: 1, revision: 0, assignments: [], bindings: [] }
  assert.deepEqual(core.parseRuntimeDocument(legacy).notifications, [])
  const notice = { notificationId: 'N', instrumentInstanceId: 'I', ownerSessionId: 'root', businessRevision: 2,
    authorPrincipalId: 'user:operator', state: 'pending', messageId: null }
  assert.equal(core.parseRuntimeDocument({ ...legacy, notifications: [notice] }).notifications[0].state, 'pending')
  assert.throws(() => core.parseRuntimeDocument({ ...legacy, notifications: [{ ...notice, state: 'accepted' }] }), error => error.code === 'invalid-state')
  assert.throws(() => core.parseRuntimeDocument({ ...legacy, notifications: [notice, notice] }), error => error.code === 'invalid-state')
})

test('trusted notification receipt arriving before notifyOwner returns cannot be lost behind later accepted-state persistence', async t => {
  const f = await ready(t)
  f.setNotify(async notice => {
    // Controlled native program callback: the receiver has committed/flushed
    // this exact message before its steer acceptance callback returns.
    await f.runtime.notificationCommitted(notice.ownerSessionId, notice.notificationId, 'early-program-message')
    return { status: 'accepted', messageId: 'early-program-message' }
  })
  await f.apply('put-decision', { decisionId: 'early-D', value: { question: '不能丢接收端已提交通知', status: '任务自定', pending: true } }, 'root', operator)
  await notificationFence(f)
  const doc = await f.units.get('runtime_bindings').read()
  assert.equal(f.notificationCalls.length, 1)
  assert.equal(doc.notifications[0].state, 'consumed')
  assert.equal(doc.notifications[0].messageId, 'early-program-message')
  assert.equal((await f.read()).records.decisions[0].value.pending, true)
})

test('already-live root constructor retries persisted outbox without another created event or cold activation', async t => {
  const f = await ready(t)
  f.setNotify(async () => ({ status: 'offline', messageId: null }))
  await f.apply('put-decision', { decisionId: 'startup-D', value: { question: '重启前保留的通知', status: '自由状态', pending: true, awaitingImplementation: true } }, 'root', operator)
  await notificationFence(f)
  const before = (await f.units.get('runtime_bindings').read()).notifications[0]
  assert.equal(before.state, 'pending')
  const root = f.agents.get('root'), count = f.notificationCalls.length
  f.setNotify(async () => ({ status: 'accepted', messageId: 'startup-already-live-message' }))
  await f.reopen()
  await notificationFence(f)
  const after = (await f.units.get('runtime_bindings').read()).notifications[0]
  assert.equal(f.notificationCalls.length, count + 1)
  assert.equal(after.notificationId, before.notificationId)
  assert.equal(after.state, 'accepted')
  assert.equal(after.messageId, 'startup-already-live-message')
  assert.equal(f.agents.get('root'), root)
  const business = (await f.read()).records.decisions[0].value
  assert.equal(business.pending, true); assert.equal(business.awaitingImplementation, true)
  assert.equal(f.nativeCalls.length, 0)
})

test('actual Host startup outbox waits for factory receipt observers before steering an already-live owner', async t => {
  const seed = await ready(t)
  seed.setNotify(async () => ({ status: 'offline', messageId: null }))
  await seed.apply('put-decision', { decisionId: 'factory-ready-D', value: { question: '启动通知必须可核验消费', status: '自由状态', pending: true } }, 'root', operator)
  await notificationFence(seed)
  const instanceId = (await seed.read()).instance.instrumentInstanceId
  const persisted = await seed.units.get('runtime_bindings').read()
  assert.equal(persisted.notifications[0].state, 'pending')
  const seedUnits = new Map([
    ['mattpocock_controls', new Map([['state', await seed.controlsStorage.read()]])],
    ['mattpocock_instruments', new Map([[instanceId, await seed.instrumentStorage.read(instanceId)]])],
    ['mattpocock_runtime_bindings', new Map([['state', persisted]])],
  ])
  let factoryReturned = false, flushCalls = 0
  const steered = []
  const f = await mountedFixture(t, { seedUnits,
    runtimeCreated() { factoryReturned = true },
    configureBeforeMount({ ctx, root }) {
      const ownedEvents = []
      root.session.ownEvents = () => [...ownedEvents]
      ctx.provide('sessions', { async flush(session) { assert.equal(session, root.session); flushCalls++; return true } })
      root.steer = message => {
        assert.equal(factoryReturned, true, 'startup delivery must wait until Runtime factory has returned so Host can attach receipt observers')
        steered.push(message)
        const event = { type: 'user/message', seq: ownedEvents.length + 1, time: 1, data: message }
        ownedEvents.push(event)
        ctx.emit('session/event', root.session, event)
      }
    },
  })
  await notificationFence(f)
  assert.equal(steered.length, 1)
  assert.equal(flushCalls, 1)
  const notice = (await f.runtimeStorage.read()).notifications[0]
  assert.equal(notice.notificationId, persisted.notifications[0].notificationId)
  assert.equal(notice.state, 'consumed')
  assert.equal(notice.messageId, steered[0].id)
  assert.equal((await f.runtime.readSession(caller('root'), 'root', signal())).records.decisions[0].value.pending, true)
})

test('exact native ACK after accepted return but before blocked accepted CAS persists must still consume the notification', async t => {
  const f = await ready(t)
  await notificationFence(f)
  const entered = deferred(), permit = deferred(), portReturned = deferred()
  let intent, blocker
  f.setNotify(async notice => {
    intent = notice
    blocker = f.runtime.serializePolicyPermission(async () => { entered.resolve(); await permit.promise })
    await entered.promise
    portReturned.resolve()
    return { status: 'accepted', messageId: 'queued-program-message' }
  })
  await f.apply('put-decision', { decisionId: 'queued-receipt-D', value: { question: '真实回执不能卡在accepted落盘窗口中丢失', status: '任务自定', pending: true } }, 'root', operator)
  await portReturned.promise
  try {
    // One event-loop handoff lets the accepted receipt return and enqueue its
    // journal write behind the already-running permission-effect blocker.
    await new Promise(setImmediate)
    assert.equal((await f.units.get('runtime_bindings').read()).notifications[0].state, 'pending')
    const committed = f.runtime.notificationCommitted(intent.ownerSessionId, intent.notificationId, 'queued-program-message')
    permit.resolve()
    await blocker; await committed; await notificationFence(f)
    const notice = (await f.units.get('runtime_bindings').read()).notifications[0]
    assert.equal(notice.state, 'consumed')
    assert.equal(notice.messageId, 'queued-program-message')
    assert.equal((await f.read()).records.decisions[0].value.pending, true)
  } finally { permit.resolve() }
})

test('a rejected authored command never turns the next snapshot into unknown durability', async t => {
  const f = await ready(t)
  assert.equal((await f.runtime.preStep(caller('root'), signal())).length, 1)
  await rejectsCode(f.runtime.applyInstrument(caller('root'), 'root', { operationId: 'stale-authored-command',
    expectedRevision: 99, action: 'put-ticket', workflowId: 'flow', localTicketId: 'A', value: ticket() }, signal()), 'revision-conflict')
  const messages = await f.runtime.preStep(caller('root'), signal())
  assert.equal(messages.length, 1)
  const text = messages[0].content.map(part => part.text).join('')
  assert.doesNotMatch(text, /durability-commit-failed/)
  assert.doesNotMatch(text, /state unknown/)
  assert.match(text, /Instrument state/)
})

test('a real storage write rejection still reports unknown durability', async t => {
  const f = await ready(t)
  const realCas = f.instrumentStorage.compareAndSwap.bind(f.instrumentStorage)
  f.instrumentStorage.compareAndSwap = async () => { throw new Error('backend write rejected after rename') }
  const revision = (await f.read()).records.businessRevision
  await assert.rejects(f.runtime.applyInstrument(caller('root'), 'root', { operationId: 'uncertain-write',
    expectedRevision: revision, action: 'put-ticket', workflowId: 'flow', localTicketId: 'A', value: ticket() }, signal()))
  f.instrumentStorage.compareAndSwap = realCas
  const messages = await f.runtime.preStep(caller('root'), signal())
  assert.equal(messages.length, 1)
  assert.match(messages[0].content.map(part => part.text).join(''), /durability-commit-failed/)
})
test('a failing refresh installs the stale notice once while it stays visible', async t => {
  const f = await ready(t)
  assert.equal((await f.runtime.preStep(caller('root'), signal())).length, 1)
  await f.apply('put-ticket', { localTicketId: 'A', value: ticket() })
  f.ports.snapshotVisible = () => true
  f.ports.readPolicyGrants = async () => { throw new Error('synthetic ledger outage') }
  const first = await f.runtime.preStep(caller('root'), signal())
  assert.equal(first.length, 1)
  assert.match(first[0].content.map(part => part.text).join(''), /Instrument state stale:/)
  const repeated = await f.runtime.preStep(caller('root'), signal())
  assert.equal(repeated.length, 0, 'an identical stale notice already in context is not repeated')
})
test('a rejected resource read never turns the next snapshot into unknown durability', async t => {
  const f = await ready(t)
  assert.equal((await f.runtime.preStep(caller('root'), signal())).length, 1)
  await assert.rejects(f.runtime.resourceAction(caller('root'), 'root', { action: 'read', resourceId: 'no-such-resource' }, signal()))
  const messages = await f.runtime.preStep(caller('root'), signal())
  assert.equal(messages.length, 1)
  const text = messages[0].content.map(part => part.text).join('')
  assert.doesNotMatch(text, /durability-commit-failed/)
  assert.match(text, /Instrument state/)
})

test('a persistent context failure installs one notice with a stable reason', async t => {
  const f = await ready(t)
  assert.equal((await f.runtime.preStep(caller('root'), signal())).length, 1)
  f.ports.snapshotVisible = () => true
  f.controlsStorage.read = async () => { throw new Error('backend /srv/secret/controls.json exploded') }
  const first = await f.runtime.preStep(caller('root'), signal())
  assert.equal(first.length, 1)
  const text = first[0].content.map(part => part.text).join('')
  assert.doesNotMatch(text, /srv\/secret/, 'internal exception text is not injected')
  assert.match(text, /Instrument state stale: .*failed with internal-error/)
  const second = await f.runtime.preStep(caller('root'), signal())
  assert.equal(second.length, 0, 'an identical notice already in context is not repeated')
})

test('an unretained session reports one stable unavailable notice', async t => {
  const f = await fixture(t, { initialPolicy: policy() })
  f.controlsStorage.read = async () => { throw new Error('backend /srv/secret/controls.json exploded') }
  const first = await f.runtime.preStep(caller('root'), signal())
  assert.equal(first.length, 1)
  const text = first[0].content.map(part => part.text).join('')
  assert.doesNotMatch(text, /srv\/secret/)
  assert.match(text, /Instrument context unavailable: internal-error/)
})
test('one admitted step installs an identical snapshot once even while the host cannot see it yet', async t => {
  const f = await ready(t)
  // The host may assemble one admitted request several times and a PTC step may complete several
  // nested dispatches; every pass shares the same turn:step identity, and a message queued during
  // that step is not yet visible to the host visibility oracle.
  f.ports.snapshotVisible = () => false
  const opened = await f.runtime.preStep(caller('root'), signal(), [], '93:4')
  assert.equal(opened.length, 1)
  const reassembled = await f.runtime.preStep(caller('root'), signal(), [], '93:4')
  assert.equal(reassembled.length, 0, 'the identical snapshot is not queued again for the same admitted step')
  const first = await f.runtime.postExecute(caller('root'), f.exec(), { isError: false, value: 'nested dispatch A' }, '93:4')
  const second = await f.runtime.postExecute(caller('root'), f.exec(), { isError: false, value: 'nested dispatch B' }, '93:4')
  assert.equal(first.length, 0)
  assert.equal(second.length, 0)
  const nextStep = await f.runtime.preStep(caller('root'), signal(), [], '94:1')
  assert.equal(nextStep.length, 1, 'a later admitted step may re-offer it while the host still reports it as not visible')
})

test('one bounded current view per admitted step, newest facts at the next step', async t => {
  const f = await ready(t)
  f.ports.snapshotVisible = () => false
  assert.equal((await f.runtime.preStep(caller('root'), signal(), [], '95:1')).length, 1)
  await f.apply('put-ticket', { localTicketId: 'T9', value: ticket() })
  const sameStep = await f.runtime.postExecute(caller('root'), f.exec(), { isError: false, value: 'write' }, '95:1')
  assert.equal(sameStep.length, 0, 'a later pass of the same admitted step is not installed again')
  const changed = await f.runtime.preStep(caller('root'), signal(), [], '96:1')
  assert.equal(changed.length, 1)
  assert.match(changed[0].content[0].text, /T9/)
  const repeat = await f.runtime.postExecute(caller('root'), f.exec(), { isError: false, value: 'write again' }, '96:1')
  assert.equal(repeat.length, 0)
})

test('a delivered terminal ticket is reported as pending release and only the agent frees the slot', async t => {
  const f = await fixture(t, { known: true, initialPolicy: policy({ enabled: true, ticketWindowSize: 2 }) })
  const terminalWorkflow = { title: '任务自定义', axes: [{ axisKey: 'delivery', label: '业务交付', counting: 'exclusive',
    statuses: [{ statusKey: 'partial', label: '部分交付' }, { statusKey: 'delivered', label: '已交付', terminal: true }] }] }
  const terminalTicket = status => ({ title: '任务票', statuses: { delivery: [status] }, summary: '原样业务报告' })
  await f.apply('put-workflow', { value: terminalWorkflow })
  await f.apply('put-ticket', { localTicketId: 'A', value: terminalTicket('partial') })
  await f.window('reserve', 'A')
  assert.equal((await f.read()).windows.T.used, 1)
  await f.apply('put-ticket', { localTicketId: 'A', value: terminalTicket('delivered') })
  const snap = await f.read()
  assert.equal(snap.windows.T.used, 1, 'the program never frees a slot for the agent; release stays authored')
  assert.deepEqual(snap.pendingRelease, [{ workflowId: 'flow', localTicketId: 'A', generation: 1, label: '已交付' }], 'the held slot is reported for authored release')
  await f.window('release', 'A', { generation: 1 })
  const released = await f.read()
  assert.equal(released.windows.T.used, 0)
  assert.deepEqual(released.pendingRelease, [], 'nothing is pending once the agent released the slot')
})
