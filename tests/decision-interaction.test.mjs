import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fixture, mountedFixture, core, caller, operator, signal, policy, workflow, loadSDK } from './fixtures/runtime-host.mjs'

const factsFrom = text => JSON.parse(text.split('Current runtime facts (null means unavailable/unknown, not zero):\n')[1])
const textFrom = messages => {
  assert.equal(messages.length, 1)
  return messages[0].content[0].text
}
const modePolicy = mode => policy(undefined, { pendingDecisions: { enabled: true, interactionMode: mode } })

// Public Runtime save/read/preStep seams fixed by the accepted interaction contract.
// Source-only integration: no model, Profile installation or GUI is exercised.
test('saved interaction mode enters the next real model-consumption request', async t => {
  const f = await fixture(t, { initialPolicy: policy(), known: true })
  await f.save(policy(undefined, { pendingDecisions: { enabled: true, interactionMode: 'async-decision' } }))
  const messages = await f.runtime.preStep(caller('root'), signal())
  assert.equal(messages.length, 1)
  const text = messages[0].content[0].text
  assert.ok(text.includes('Decision interaction preference: async-decision (active)'))
  assert.match(text, /continue independent work/)
  const facts = factsFrom(text)
  assert.equal(facts.policy.pendingDecisions.interactionMode, 'async-decision')
  assert.equal((await f.read()).policy.sources['pendingDecisions.interactionMode'], 'global')
})

test('mounted model request limits new decisions to genuine unresolved user questions', async t => {
  const f = await mountedFixture(t)
  await f.runtime.savePolicy(operator, policy(), 0, signal())
  const native = Object.freeze({ role: 'user', content: [{ type: 'text', text: 'Implement the already agreed plan' }] })
  const request = await f.ctx.waterfall('agent/pre-step', { agent: f.root, messages: [native], turn: 1, step: 1, signal: signal() }, async () => ({ kind: 'enter', messages: [native], startsRequestSeries: true }))
  assert.equal(request.messages[0], native)
  const text = textFrom(request.messages.slice(1))
  assert.match(text, /New decisions: genuine unresolved user questions only/)
  assert.match(text, /pending=true[/]addressee.kind=user/)
  assert.match(text, /Implementation[/]research[/]completion: existing spec[/]ADR[/]tasks/)
  assert.match(text, /no self-question[/]answer ledger/)
  assert.equal(factsFrom(text).records.summary.pendingDecisionCount, 0, 'guidance never manufactures a question')
})

test('reply guidance keeps the original decision, actual agent author and existing await marker', async t => {
  const f = await fixture(t, { initialPolicy: modePolicy('async-decision'), known: true })
  await f.apply('put-workflow', { value: workflow })
  const question = 'Choose A or B for the user-facing behavior'
  await f.apply('put-decision', { decisionId: 'reply', value: { question, status: 'open', pending: true, awaitingImplementation: true, addressee: { kind: 'user' }, context: 'Original constraints' } })
  const text = textFrom(await f.runtime.preStep(caller('root'), signal()))
  assert.match(text, /Replies: SAME decisionId [+] source; agent author stays agent/)
  assert.match(text, /pending=false only for explicit resolution/)
  assert.match(text, /partial replies stay pending/)
  assert.match(text, /Skip[/]cancel[/]silence is not approval/)
  assert.match(text, /Answers preserve awaitingImplementation=true/)
  await f.apply('put-decision', { decisionId: 'reply', references: ['native-message:partial'], value: { question, status: 'clarifying', result: 'User answered A but has not resolved the constraint' } })
  let records = (await f.read()).records
  assert.equal(records.decisions.length, 1)
  assert.equal(records.decisions[0].value.pending, true)
  assert.equal(records.decisions[0].value.awaitingImplementation, true)
  assert.deepEqual(records.decisions[0].history.at(-1).author, caller('root'))
  assert.equal(factsFrom(textFrom(await f.runtime.preStep(caller('root'), signal()))).records.summary.pendingUserDecisionCount, 1)
  await f.apply('put-decision', { decisionId: 'reply', references: ['native-message:explicit-answer'], value: { question, status: 'answered', pending: false, result: 'User explicitly chose A with the constraint preserved' } })
  records = (await f.read()).records
  assert.equal(records.decisions.length, 1)
  assert.equal(records.decisions[0].decisionId, 'reply')
  assert.equal(records.decisions[0].value.awaitingImplementation, true)
  assert.equal(records.decisions[0].value.context, 'Original constraints')
  assert.deepEqual(records.decisions[0].history.at(-1).author, caller('root'))
  assert.deepEqual(records.decisions[0].history.at(-1).references, ['native-message:explicit-answer'])
  const facts = factsFrom(textFrom(await f.runtime.preStep(caller('root'), signal())))
  assert.equal(facts.records.summary.pendingUserDecisionCount, 0)
  assert.equal(facts.records.summary.awaitingImplementationCount, 1)
  assert.equal(facts.records.decisions.rows[0].decisionId, 'reply', 'await retains actual consumption after the answer')
})

test('legacy marker review remains in real OFF consumption without becoming an unfinished-task total', async t => {
  const f = await fixture(t, { initialPolicy: policy(), known: true })
  await f.apply('put-workflow', { value: workflow })
  const rows = [
    { decisionId: 'agent', value: { question: 'Legacy agent matter', status: 'legacy', pending: true, awaitingImplementation: false, addressee: { kind: 'agent' } } },
    { decisionId: 'unspecified', value: { question: 'Legacy unspecified matter', status: 'legacy', pending: true, awaitingImplementation: true, addressee: { kind: 'unspecified' } } },
    { decisionId: 'omitted', value: { question: 'Legacy await-only matter', status: 'legacy', pending: false, awaitingImplementation: true, result: 'Original answer', context: 'Original source: native-message:old' } },
  ]
  for (const row of rows) await f.apply('put-decision', row)
  await f.save({ ...policy(), extensionEnabled: false })
  const text = textFrom(await f.runtime.preStep(caller('root'), signal()))
  assert.match(text, /awaitingImplementationCount: raw compatibility markers, not unfinished tasks; review task evidence/)
  assert.match(text, /Handoff is not completion/)
  assert.match(text, /Never infer clearance from status[/]count[/]hidden[/]links/)
  assert.match(text, /Old agent[/]unspecified[/]no-addressee updates legal/)
  assert.doesNotMatch(text, /New decisions:/)
  const facts = factsFrom(text)
  assert.equal(facts.records.summary.pendingDecisionCount, 2)
  assert.equal(facts.records.summary.pendingUserDecisionCount, 0)
  assert.equal(facts.records.summary.awaitingImplementationCount, 2)
  // Pending legacy questions precede await-only compatibility markers, even while OFF; no flags or obligations are cleared.
  assert.deepEqual(facts.records.decisions.rows.map(row => row.decisionId), ['agent', 'unspecified', 'omitted'])
  for (const row of rows) {
    await f.apply('put-decision', { decisionId: row.decisionId, value: { question: row.value.question, status: 'explicitly reviewed' } })
  }
  const records = (await f.read()).records
  assert.deepEqual(records.decisions.map(row => row.value.awaitingImplementation), [false, true, true], 'omitted fields preserve old flags even while OFF')
  assert.equal(records.decisions.find(row => row.decisionId === 'omitted').value.result, 'Original answer')
  await assert.rejects(f.apply('put-decision', { decisionId: 'new', value: { question: 'Not allowed while OFF', status: 'open', pending: true, addressee: { kind: 'user' } } }), { code: 'feature-disabled' })
})

// Preservation regressions exercise existing public behavior; no business-judgment gate is added.
test('explicit task handoff preserves original replies, inclusion choices and owner notification without claiming completion', async t => {
  const f = await fixture(t, { initialPolicy: policy(), known: true })
  await f.apply('put-workflow', { value: workflow })
  await f.apply('put-ticket', { localTicketId: 'follow-through', value: { title: 'Implement the remaining commitment from both decisions', statuses: { delivery: ['partial'] }, summary: 'Remaining acceptance constraint and source: native-message:original; decisions flow/included and flow/excluded' } })
  for (const decisionId of ['included', 'excluded']) {
    await f.apply('put-decision', { decisionId, value: { question: 'Original ' + decisionId + ' question', status: 'answered', pending: false, awaitingImplementation: true, result: 'Original ' + decisionId + ' reply', context: 'Original source: native-message:original' } })
    await f.runtime.historyAction(caller('root'), 'root', { action: 'set-context', kind: 'decision', recordId: JSON.stringify(['flow', decisionId]), included: decisionId === 'included' }, signal())
  }
  await f.runtime.applyInstrument(caller('root'), 'root', { action: 'set-decision-view', operationId: 'hide-legacy-await', expectedRevision: 0, workflowId: 'flow', decisionId: 'excluded', value: { read: true, hidden: true } }, signal())
  const before = factsFrom(textFrom(await f.runtime.preStep(caller('root'), signal())))
  assert.equal(before.records.decisions.total, 2, 'excluded and hidden cannot erase await obligations')
  f.setNotify(async notice => ({ status: 'accepted', messageId: 'review-notice-' + notice.notificationId }))
  for (const decisionId of ['included', 'excluded']) {
    await f.apply('put-decision', { decisionId, references: ['task:flow/follow-through'], value: { question: 'Original ' + decisionId + ' question', status: 'answered', awaitingImplementation: false, ticketIds: ['follow-through'], context: 'Original source: native-message:original; authored review: remaining responsibility handed to flow/follow-through, not a completion declaration' } }, 'root', decisionId === 'included' ? operator : caller('root'))
  }
  await new Promise(setImmediate)
  await f.runtime.serializePolicyPermission(async () => undefined)
  assert.equal(f.notificationCalls.length, 1, 'explicit user review still uses the existing owner-notification channel')
  assert.equal(f.notificationCalls[0].authorPrincipalId, operator.principalId)
  const records = (await f.read()).records
  assert.equal(records.tickets[0].value.statuses.delivery[0], 'partial', 'handoff did not complete execution')
  assert.deepEqual(records.decisions.map(row => row.value.result), ['Original included reply', 'Original excluded reply'])
  assert.equal(records.summary.pendingUserDecisionCount, 0)
  assert.equal(records.summary.awaitingImplementationCount, 0)
  let facts = factsFrom(textFrom(await f.runtime.preStep(caller('root'), signal())))
  assert.deepEqual(facts.records.decisions, [])
  assert.equal(facts.contextConclusions.total, 1)
  assert.equal(facts.contextConclusions.rows[0].result, 'Original included reply')
  assert.deepEqual(facts.contextConclusions.rows[0].source.author, operator)
  await f.reopen()
  facts = factsFrom(textFrom(await f.runtime.preStep(caller('root'), signal())))
  assert.deepEqual(facts.contextConclusions.rows.map(row => row.decisionId), ['included'], 'reopen preserves included/excluded rather than manufacturing general memory')
})

test('old missing mode stays sparse and resolves native with safe-initial source', () => {
  const old = core.parsePolicySnapshot({ revision: 1, ...policy() })
  assert.deepEqual(old.defaults.pendingDecisions, { enabled: true })
  const effective = core.resolvePolicy(old, 'W', true)
  assert.deepEqual(effective.pendingDecisions, { interactionMode: 'native-question' })
  assert.equal(effective.sources['pendingDecisions.interactionMode'], 'safe-initial')
  assert.equal(effective.features.pendingDecisions.status, 'configured')
  assert.ok(Object.isFrozen(effective.pendingDecisions))
  const modeOnly = core.parsePolicyIntent({ extensionEnabled: true, defaults: { pendingDecisions: { interactionMode: 'async-decision' } }, workspaceOverrides: {} })
  assert.deepEqual(modeOnly.defaults.pendingDecisions, { interactionMode: 'async-decision' })
  assert.equal(core.resolvePolicy({ revision: 2, ...modeOnly }, 'W', true).features.pendingDecisions.status, 'disabled')
})

test('mode validates strict enums without relaxing enabled or other feature shapes', () => {
  for (const interactionMode of ['native', 'async', '', null, false, 1, {}, []]) {
    assert.throws(() => core.parsePolicyIntent(modePolicy(interactionMode)), { code: 'invalid-input' })
  }
  for (const patch of [{ interactionMode: undefined }, { interactionMode: 'async-decision', enabled: 'yes' }, { mode: 'async-decision' }]) {
    assert.throws(() => core.parsePolicyIntent(policy(undefined, { pendingDecisions: patch })), { code: 'invalid-input' })
  }
  assert.throws(() => core.parsePolicyIntent(policy(undefined, { ticketProgress: { interactionMode: 'async-decision' } })), { code: 'invalid-input' })
})

test('workspace mode overrides one leaf, deletion restores global inheritance, and stale CAS cannot overwrite it', async t => {
  const initial = modePolicy('async-decision')
  initial.workspaceOverrides.W = { pendingDecisions: { interactionMode: 'native-question' } }
  const f = await fixture(t, { initialPolicy: initial, known: true })
  let effective = (await f.read()).policy
  assert.equal(effective.pendingDecisions.interactionMode, 'native-question')
  assert.equal(effective.sources['pendingDecisions.interactionMode'], 'workspace')
  assert.equal(effective.sources['pendingDecisions.enabled'], 'global')
  const inherited = modePolicy('async-decision')
  inherited.workspaceOverrides.W = { pendingDecisions: {} }
  await f.save(inherited)
  effective = (await f.read()).policy
  assert.equal(effective.pendingDecisions.interactionMode, 'async-decision')
  assert.equal(effective.sources['pendingDecisions.interactionMode'], 'global')
  assert.equal((await f.runtime.readPolicy(operator, signal())).workspaceOverrides.W, undefined)
  await assert.rejects(f.runtime.savePolicy(operator, initial, 1, signal()), { code: 'revision-conflict' })
  assert.equal((await f.read()).policy.pendingDecisions.interactionMode, 'async-decision')
  const revision = (await f.runtime.readPolicy(operator, signal())).revision
  await assert.rejects(f.save(modePolicy('unknown')), { code: 'invalid-input' })
  assert.equal((await f.runtime.readPolicy(operator, signal())).revision, revision)
  await f.save(policy())
  const text = textFrom(await f.runtime.preStep(caller('root'), signal()))
  assert.equal(factsFrom(text).policy.pendingDecisions.interactionMode, 'native-question')
  assert.equal((await f.read()).policy.sources['pendingDecisions.interactionMode'], 'safe-initial')
})

test('hot native-to-async preference reaches the admitted Host request without restart or rewriting native input', async t => {
  const f = await mountedFixture(t)
  await f.runtime.savePolicy(operator, policy(), 0, signal())
  const native = Object.freeze({ role: 'user', content: [{ type: 'text', text: 'ordinary user input' }] })
  const assemble = step => f.ctx.waterfall('agent/pre-step', { agent: f.root, messages: [native], turn: 1, step, signal: signal() }, async () => ({ kind: 'enter', messages: [native], startsRequestSeries: true }))
  const first = await assemble(1)
  assert.equal(first.messages[0], native)
  const nativeText = first.messages[1].content[0].text
  assert.ok(nativeText.includes('Decision interaction preference: native-question (active)'))
  assert.match(nativeText, /prefer an available native user-question tool; receive the answer through the native question flow/)
  await f.runtime.savePolicy(operator, modePolicy('async-decision'), 1, signal())
  const second = await assemble(2)
  assert.equal(second.messages[0], native)
  assert.equal(second.messages.length, 2)
  const asyncText = second.messages[1].content[0].text
  assert.ok(asyncText.includes('Decision interaction preference: async-decision (active)'))
  assert.match(asyncText, /user replies through DSH native session messages/)
  assert.match(asyncText, /without calling a blocking question tool to wait for the reply/)
  assert.equal(factsFrom(asyncText).policy.configRevision, 2)
  assert.equal(factsFrom(asyncText).policy.pendingDecisions.interactionMode, 'async-decision')
  const commonTail = text => {
    const start = text.indexOf('Skip/cancel/silence is not approval')
    assert.ok(start >= 0, 'shared non-approval guidance is present')
    return text.slice(start, text.indexOf('Only prepare a tree'))
  }
  assert.equal(commonTail(nativeText), commonTail(asyncText), 'only mode-specific channel/wait fragments differ')
  assert.match(asyncText, /Block only actions that actually depend on the decision/)
  assert.match(asyncText, /end the current turn normally/)
  assert.match(asyncText, /do not claim overall completion/)
  assert.match(asyncText, /Never claim registration after a failed write/)
})

test('OFF supersedes both interaction protocols while retaining old pending obligations, and re-enable restores preference', async t => {
  const f = await fixture(t, { initialPolicy: modePolicy('async-decision'), known: true })
  await f.apply('put-workflow', { value: workflow })
  await f.apply('put-decision', { decisionId: 'old', value: { question: 'Keep unresolved obligation', status: 'open', pending: true, addressee: { kind: 'user', principalId: operator.principalId } } })
  for (const intent of [
    { ...modePolicy('async-decision'), extensionEnabled: false },
    policy(undefined, { pendingDecisions: { enabled: false, interactionMode: 'async-decision' } }),
    policy(undefined, { workspace: { enabled: false }, pendingDecisions: { enabled: true, interactionMode: 'async-decision' } }),
  ]) {
    await f.save(intent)
    const text = textFrom(await f.runtime.preStep(caller('root'), signal()))
    assert.ok(text.includes('Decision interaction preference: async-decision (inactive)'))
    assert.match(text, /Preserve existing records, unresolved obligations and necessary closeout/)
    assert.doesNotMatch(text, /When a user decision is needed|Register pending decisions|prefer the decision instrument|prefer an available native user-question tool|continue independent work/)
    assert.match(text, /Keep unresolved obligation/)
    assert.equal(factsFrom(text).records.summary.pendingUserDecisionCount, 1)
  }
  await f.save(modePolicy('async-decision'))
  assert.ok(textFrom(await f.runtime.preStep(caller('root'), signal())).includes('Decision interaction preference: async-decision (active)'))
})

test('owned child receives the shared template without being directed to a forbidden user-question tool', async t => {
  const f = await fixture(t, { initialPolicy: policy(), known: true })
  const text = textFrom(await f.runtime.preStep(caller('old-child'), signal()))
  assert.match(text, /hand the user question back to the main agent/)
  assert.match(text, /do not call a user-question tool forbidden to an owned child/)
  assert.doesNotMatch(text, /prefer an available native user-question tool/)
  await f.save(modePolicy('async-decision'))
  const asyncText = textFrom(await f.runtime.preStep(caller('old-child'), signal()))
  assert.match(asyncText, /Owned children hand questions to the main agent/)
  assert.match(asyncText, /without calling a blocking question tool/)
})

test('actual model tool description, controls save and bounded current DTO expose the mode and source', async t => {
  const f = await mountedFixture(t)
  const description = f.ctx.tools.get('mattpocock_controls').description
  assert.ok(description.includes('pendingDecisions {enabled?: boolean, interactionMode?: "native-question" | "async-decision"}'))
  const decode = result => {
    assert.notEqual(result.isError, true, result.error?.message)
    const parsed = JSON.parse(result.content.find(row => row.type === 'text').text)
    assert.deepEqual(result.value, parsed)
    assert.ok(Buffer.byteLength(JSON.stringify(parsed)) <= (parsed.kind === 'receipt' ? 8192 : 65536))
    return parsed
  }
  await f.runtime.savePolicy(operator, policy(), 0, signal())
  const grant = await f.mounted.ports.readPolicyGrants()
  const { TypertGatewayService } = await loadSDK('@deepseek-ai/dsh-api-gateway')
  const gateway = new TypertGatewayService(f.ctx, {})
  await gateway.invoke({ namespace: 'mattpocockControls', method: 'grantPolicy', args: { sessionId: 'root', enabled: true, expectedRevision: grant.revision }, peer: f.peer, signal: signal() })
  const request = { action: 'save', intent: modePolicy('async-decision'), expectedRevision: 1 }
  const receipt = decode(await f.execute('mattpocock_controls', { request }))
  assert.equal(receipt.configurationRevision, 2)
  const current = decode(await f.execute('mattpocock_record', { request: { action: 'read' } }))
  assert.equal(current.policy.pendingDecisions.interactionMode, 'async-decision')
  assert.equal(current.policy.sources['pendingDecisions.interactionMode'], 'global')
  const detail = decode(await f.execute('mattpocock_record', { request: { action: 'detail', locator: current.policy.detail.locator } }))
  assert.equal(detail.done, true)
  assert.equal(JSON.parse(detail.data).pendingDecisions.interactionMode, 'async-decision')
  const stale = await f.execute('mattpocock_controls', { request: { ...request, expectedRevision: 1 } })
  assert.equal(stale.isError, true)
  const text = textFrom(await f.runtime.preStep(caller('root'), signal(), [], 'next:1'))
  assert.equal(factsFrom(text).policy.pendingDecisions.interactionMode, 'async-decision')
})
