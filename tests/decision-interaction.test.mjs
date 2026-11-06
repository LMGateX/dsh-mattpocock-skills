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
  assert.match(text, /continue work that does not depend on that decision/)
  const facts = factsFrom(text)
  assert.equal(facts.policy.pendingDecisions.interactionMode, 'async-decision')
  assert.equal(facts.policy.sources['pendingDecisions.interactionMode'], 'global')
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
  assert.equal(factsFrom(text).policy.sources['pendingDecisions.interactionMode'], 'safe-initial')
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
  assert.match(asyncText, /user to answer through DSH native session messages/)
  assert.match(asyncText, /without calling a blocking question tool to wait for the reply/)
  assert.equal(factsFrom(asyncText).policy.configRevision, 2)
  assert.equal(factsFrom(asyncText).policy.pendingDecisions.interactionMode, 'async-decision')
  const commonTail = text => text.slice(text.indexOf('An unanswered, skipped or dismissed question'), text.indexOf('Only prepare a tree'))
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
    assert.doesNotMatch(text, /When a user decision is needed|Register pending decisions|prefer presenting it through|prefer an available native user-question tool|continue work that does not depend/)
    assert.match(text, /Keep unresolved obligation/)
    assert.equal(factsFrom(text).records.summary.pendingUserDecisionCount, 1)
  }
  await f.save(modePolicy('async-decision'))
  assert.ok(textFrom(await f.runtime.preStep(caller('root'), signal())).includes('Decision interaction preference: async-decision (active)'))
})

test('owned child receives the shared template without being directed to a forbidden user-question tool', async t => {
  const f = await fixture(t, { initialPolicy: policy(), known: true })
  const text = textFrom(await f.runtime.preStep(caller('old-child'), signal()))
  assert.match(text, /register or update the corresponding decision; hand the user question back to the main agent/)
  assert.match(text, /do not call a user-question tool forbidden to an owned child/)
  assert.doesNotMatch(text, /prefer an available native user-question tool/)
  await f.save(modePolicy('async-decision'))
  const asyncText = textFrom(await f.runtime.preStep(caller('old-child'), signal()))
  assert.match(asyncText, /Owned children hand user questions back to the main agent under host restrictions/)
  assert.match(asyncText, /without calling a blocking question tool/)
})

test('actual model tool description, controls save and bounded current DTO expose the mode and source', async t => {
  const f = await mountedFixture(t)
  const description = f.ctx.tools.get('mattpocock_controls').description
  assert.ok(description.includes('{pendingDecisions?} as {enabled?, interactionMode?: "native-question"|"async-decision"}'))
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
