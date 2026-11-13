import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fixture, caller, operator, signal, policy, actualAgent } from './fixtures/runtime-host.mjs'

test('owner policy expiry changes full model and admitted consumption before the ordinary TTL, without clock-prefix churn', async t => {
  let clock = 1000
  const f = await fixture(t, { initialPolicy: policy(), now: () => clock })
  await f.runtime.created(caller('root'), signal(), f.agents.get('root'))
  const initial = await f.runtime.readOwnerDecisionPolicy(operator, 'root', signal())
  assert.equal(initial.revision, 0)
  const enabled = await f.runtime.saveOwnerDecisionPolicy(operator, 'root', { operationId: 'open', expectedRevision: 0, expectedScope: initial.instance, action: 'enable', durationMs: 10 }, signal())
  assert.equal(enabled.snapshot.effective.status, 'active')
  const full = await f.read()
  assert.equal(full.ownerDecisionPolicy.status, 'active')
  const model = await f.runtime.readModelCurrent(caller('root'), 'root', signal())
  assert.equal(model.ownerDecisionPolicy.status, 'active')
  const first = await f.runtime.preStep(caller('root'), signal(), [], '1:1')
  assert.match(JSON.stringify(first), /Recommendation support: active/)
  clock = 1001
  const stable = await f.runtime.preStep(caller('root'), signal(), first, '1:2')
  assert.equal(stable.length, 0)
  clock = 1010
  assert.equal((await f.read()).ownerDecisionPolicy.status, 'expired')
  assert.equal((await f.runtime.readModelCurrent(caller('root'), 'root', signal())).ownerDecisionPolicy.status, 'expired')
  const expired = await f.runtime.preStep(caller('root'), signal(), first, '1:3')
  assert.match(JSON.stringify(expired), /Recommendation support: expired/)
  assert.doesNotMatch(JSON.stringify(expired), /Recommendation support: active/)
  const replay = await f.runtime.saveOwnerDecisionPolicy(operator, 'root', { operationId: 'open', expectedRevision: 0, expectedScope: initial.instance, action: 'enable', durationMs: 10 }, signal())
  assert.equal(replay.replayed, true)
  assert.equal(replay.operation.expiresAt, 1010)
  assert.equal(replay.snapshot.effective.status, 'expired')
})

test('policy controls require real operator despite agent grant, resolve registered child owner, reject OFF enable but permit historical replay and disable', async t => {
  const f = await fixture(t, { initialPolicy: policy(), now: () => 1000 })
  f.agents.set('later', actualAgent('later'))
  const before = await f.controlsStorage.read()
  await assert.rejects(f.runtime.readOwnerDecisionPolicy(operator, 'later', signal()), e => e.code === 'unknown-session')
  assert.deepEqual(await f.controlsStorage.read(), before)
  await f.runtime.created(caller('root'), signal(), f.agents.get('root'))
  await f.assign('old-child', null)
  const initial = await f.runtime.readOwnerDecisionPolicy(operator, 'old-child', signal())
  assert.equal(initial.instance.ownerSessionId, 'root')
  const fork = actualAgent('ordinary-fork', { parent: 'root' })
  f.agents.set(fork.id, fork); await f.runtime.created(caller(fork.id), signal(), fork)
  const independent = await f.runtime.readOwnerDecisionPolicy(operator, fork.id, signal())
  assert.equal(independent.instance.ownerSessionId, fork.id)
  assert.notEqual(independent.instance.instrumentInstanceId, initial.instance.instrumentInstanceId)
  assert.equal(independent.revision, 0); assert.equal(independent.saved.enabled, false)
  const request = { operationId: 'open', expectedRevision: 0, expectedScope: initial.instance, action: 'enable', durationMs: 100 }
  await f.grants.compareAndSwap(0, { schemaVersion: 1, revision: 1, grants: [{ sessionId: 'root', enabled: true }] })
  await assert.rejects(f.runtime.readOwnerDecisionPolicy(caller('root'), 'root', signal()), e => e.code === 'access-denied')
  await assert.rejects(f.runtime.saveOwnerDecisionPolicy(caller('root'), 'root', request, signal()), e => e.code === 'access-denied')
  await assert.rejects(f.runtime.saveOwnerDecisionPolicy({ ...operator, sessionId: 'root' }, 'root', request, signal()), e => e.code === 'access-denied')
  const saved = await f.runtime.saveOwnerDecisionPolicy(operator, 'old-child', request, signal())
  assert.equal(saved.snapshot.effective.status, 'active')
  assert.equal((await f.runtime.readOwnerDecisionPolicy(operator, 'root', signal())).revision, 1)
  await f.save({ ...policy(), extensionEnabled: false })
  const replay = await f.runtime.saveOwnerDecisionPolicy(operator, 'root', request, signal())
  assert.equal(replay.replayed, true)
  assert.equal(replay.appliedRevision, 1)
  assert.equal(replay.snapshot.effective.status, 'feature-disabled')
  await assert.rejects(f.runtime.saveOwnerDecisionPolicy(operator, 'root', { ...request, operationId: 'new-enable', expectedRevision: 1 }, signal()), e => e.code === 'feature-disabled')
  const disabled = await f.runtime.saveOwnerDecisionPolicy(operator, 'old-child', { operationId: 'close', expectedRevision: 1, expectedScope: initial.instance, action: 'disable' }, signal())
  assert.equal(disabled.snapshot.saved.enabled, false)
  await assert.rejects(f.runtime.saveOwnerDecisionPolicy(operator, 'root', { operationId: 'stale', expectedRevision: 1, expectedScope: initial.instance, action: 'disable' }, signal()), e => e.code === 'revision-conflict')
  await assert.rejects(f.runtime.saveOwnerDecisionPolicy(operator, 'root', { operationId: 'wrong-scope', expectedRevision: 2, expectedScope: { ...initial.instance, ownerSessionId: 'other' }, action: 'disable' }, signal()), e => e.code === 'association-conflict')
  await f.reopen()
  const reopened = await f.runtime.readOwnerDecisionPolicy(operator, 'root', signal())
  assert.equal(reopened.revision, 2)
  assert.equal(reopened.saved.enabled, false)
  assert.equal(reopened.saved.epoch.authorizedBy.principalId, operator.principalId)
})

const question = { question: 'Choose delivery path', status: 'open', pending: true, addressee: { kind: 'user', principalId: operator.principalId }, options: [{ key: 'B', label: 'Recommended' }, { key: 'A', label: 'Alternative' }], recommendation: 'B', awaitingImplementation: true, context: 'Preserve constraints' }
async function enabledRuntime(t) {
  const f = await fixture(t, { initialPolicy: policy(), now: () => 1000 })
  const initial = await f.runtime.readOwnerDecisionPolicy(operator, 'root', signal())
  await f.runtime.saveOwnerDecisionPolicy(operator, 'root', { operationId: 'open', expectedRevision: 0, expectedScope: initial.instance, action: 'enable', durationMs: 10000 }, signal())
  await f.runtime.applyInstrument(caller('root'), 'root', { operationId: 'flow', expectedRevision: 0, workflowId: 'flow', action: 'put-workflow', value: { title: 'Delivery', axes: [] } }, signal())
  f.instance = initial.instance
  return f
}

test('real Runtime wires V4 creation binding and explicit same-ID adoption to one clock and owner policy reader', async t => {
  const f = await enabledRuntime(t)
  const put = await f.runtime.applyInstrument(caller('root'), 'root', { operationId: 'question', expectedRevision: 1, workflowId: 'flow', decisionId: 'D', action: 'put-decision', references: ['task:source'], value: question }, signal())
  assert.equal(put.snapshot.capabilities.decisionRecommendationAdoption, true)
  assert.deepEqual(put.snapshot.capabilities.storageVersions, [1, 2, 3, 4])
  assert.equal(put.recommendation.status, 'candidate')
  const candidate = put.recommendation.candidate
  assert.equal(candidate.optionKey, 'B')
  assert.equal(put.snapshot.decisions[0].policyBinding.createdRevision, 2)
  const command = { operationId: 'adopt', expectedRevision: 2, workflowId: 'flow', decisionId: 'D', action: 'adopt-decision-recommendation', references: ['adopt:source'], value: { optionKey: candidate.optionKey, decisionRevision: candidate.decisionRevision, policyEpochId: candidate.policyEpochId, policyRevision: candidate.policyRevision } }
  const adopted = await f.runtime.applyInstrument(caller('root'), 'root', command, signal())
  assert.equal(adopted.recommendation.status, 'adopted')
  const row = adopted.snapshot.decisions[0]
  assert.equal(row.value.pending, false)
  assert.equal(row.value.awaitingImplementation, true)
  assert.equal(row.value.result, undefined)
  assert.equal(row.history.at(-1).author.kind, 'agent')
  assert.deepEqual(row.history.at(-1).references, ['task:source', 'adopt:source'])
  assert.equal(row.policySelection.authorizedAt, 1000)
  assert.equal(row.policySelection.policy.authorizedBy.principalId, operator.principalId)
  await f.runtime.saveOwnerDecisionPolicy(operator, 'root', { operationId: 'disable', expectedRevision: 1, expectedScope: f.instance, action: 'disable' }, signal())
  await f.save({ ...policy(), extensionEnabled: false })
  const replay = await f.runtime.applyInstrument(caller('root'), 'root', command, signal())
  assert.equal(replay.replayed, true)
  assert.equal(replay.appliedRevision, adopted.appliedRevision)
  assert.deepEqual(replay.recommendation, adopted.recommendation)
  await f.reopen()
  assert.equal((await f.runtime.applyInstrument(caller('root'), 'root', command, signal())).replayed, true)
})

const snapshotFacts = messages => JSON.parse(messages[0].content[0].text.split('Current runtime facts (null means unavailable/unknown, not zero):\n')[1])
test('retained adoption history keeps exact version references and provenance, nullable included conclusions, legacy hashes and purge suppression', async t => {
  const f = await enabledRuntime(t)
  const put = await f.runtime.applyInstrument(caller('root'), 'root', { operationId: 'question', expectedRevision: 1, workflowId: 'flow', decisionId: 'D', action: 'put-decision', references: ['task:source'], value: { ...question, awaitingImplementation: false } }, signal())
  const query = () => f.runtime.historyAction(caller('root'), 'root', { action: 'query', query: { kind: 'decision', recordId: JSON.stringify(['flow', 'D']) } }, signal())
  const details = async () => { const page = await query(); return f.runtime.historyAction(caller('root'), 'root', { action: 'detail', historyIds: page.rows.map(row => row.historyId) }, signal()) }
  const legacy = (await details()).rows[0]
  assert.deepEqual(legacy.snapshot, put.snapshot.decisions[0].history[0].value)
  const legacyHash = JSON.stringify(legacy)
  await f.reopen(); await f.read()
  assert.equal(JSON.stringify((await details()).rows[0]), legacyHash)
  const c = put.recommendation.candidate
  await f.runtime.applyInstrument(caller('root'), 'root', { operationId: 'adopt', expectedRevision: 2, workflowId: 'flow', decisionId: 'D', action: 'adopt-decision-recommendation', references: ['adopt:source'], value: { optionKey: c.optionKey, decisionRevision: c.decisionRevision, policyEpochId: c.policyEpochId, policyRevision: c.policyRevision } }, signal())
  const rows = (await details()).rows, adopted = rows.find(row => row.version === 3)
  assert.equal(adopted.snapshot.policySelection.selectedOptionKey, 'B')
  assert.deepEqual(adopted.snapshot.references, ['task:source', 'adopt:source'])
  assert.equal(adopted.source.author.kind, 'agent')
  assert.equal(adopted.source.recordedAt, 1000)
  const ordinary = snapshotFacts(await f.runtime.preStep(caller('root'), signal(), [], '1:1'))
  assert.equal(ordinary.contextConclusions.rows.length, 0)
  await f.runtime.historyAction(caller('root'), 'root', { action: 'set-context', kind: 'decision', recordId: JSON.stringify(['flow', 'D']), included: true }, signal())
  const included = snapshotFacts(await f.runtime.preStep(caller('root'), signal(), [], '1:2'))
  assert.equal(included.contextConclusions.rows[0].result, null)
  assert.equal(included.contextConclusions.rows[0].policySelection.selectedOptionKey, 'B')
  assert.deepEqual(included.contextConclusions.rows[0].references, ['task:source', 'adopt:source'])
  assert.equal(included.contextConclusions.rows[0].source.author.kind, 'agent')
  await f.assign('old-child', null)
  await assert.rejects(f.runtime.historyAction(caller('old-child'), 'old-child', { action: 'query', query: { kind: 'decision' } }, signal()), e => e.code === 'access-denied')
  await f.runtime.historyAction(caller('root'), 'root', { action: 'purge', historyIds: [adopted.historyId] }, signal())
  await f.reopen(); await f.read()
  const purged = (await details()).rows.find(row => row.historyId === adopted.historyId)
  assert.equal(purged.purged, true); assert.equal(purged.snapshot, null); assert.equal(purged.source, null)
  assert.equal((await f.read()).records.decisions[0].policySelection.selectedOptionKey, 'B')
  assert.equal(JSON.stringify((await details()).rows[0]), legacyHash)
})

test('persistent policy keeps a null candidate expiry and supports V4 adoption at an arbitrarily later server time', async t => {
  let clock = 1000
  const f = await fixture(t, { initialPolicy: policy(), now: () => clock })
  const initial = await f.runtime.readOwnerDecisionPolicy(operator, 'root', signal())
  const enabled = await f.runtime.saveOwnerDecisionPolicy(operator, 'root', { operationId: 'open', expectedRevision: 0, expectedScope: initial.instance, action: 'enable', durationMs: null }, signal())
  assert.equal(enabled.snapshot.effective.status, 'active')
  assert.equal(enabled.snapshot.saved.epoch.expiresAt, null)
  await f.runtime.applyInstrument(caller('root'), 'root', { operationId: 'flow', expectedRevision: 0, workflowId: 'flow', action: 'put-workflow', value: { title: 'Delivery', axes: [] } }, signal())
  f.instance = initial.instance
  const put = await f.runtime.applyInstrument(caller('root'), 'root', { operationId: 'question', expectedRevision: 1, workflowId: 'flow', decisionId: 'D', action: 'put-decision', references: ['task:source'], value: question }, signal())
  assert.equal(put.recommendation.status, 'candidate')
  const candidate = put.recommendation.candidate
  assert.equal(candidate.expiresAt, null)
  clock = Number.MAX_SAFE_INTEGER
  const adopted = await f.runtime.applyInstrument(caller('root'), 'root', { operationId: 'adopt', expectedRevision: 2, workflowId: 'flow', decisionId: 'D', action: 'adopt-decision-recommendation', references: ['adopt:source'], value: { optionKey: candidate.optionKey, decisionRevision: candidate.decisionRevision, policyEpochId: candidate.policyEpochId, policyRevision: candidate.policyRevision } }, signal())
  assert.equal(adopted.recommendation.status, 'adopted')
  assert.equal(adopted.snapshot.decisions[0].policySelection.policy.expiresAt, null)
  assert.equal(adopted.snapshot.decisions[0].policySelection.authorizedAt, Number.MAX_SAFE_INTEGER)
  assert.equal((await f.read()).ownerDecisionPolicy.status, 'active')
})

test('decision model source and collection tokens include policy revision and expiry bucket, not the moving clock', async t => {
  let clock = 1000
  const f = await fixture(t, { initialPolicy: policy(), now: () => clock })
  await f.runtime.applyInstrument(caller('root'), 'root', { operationId: 'flow', expectedRevision: 0, workflowId: 'flow', action: 'put-workflow', value: { title: 'Delivery', axes: [] } }, signal())
  await f.runtime.applyInstrument(caller('root'), 'root', { operationId: 'legacy', expectedRevision: 1, workflowId: 'flow', decisionId: 'D', action: 'put-decision', value: question }, signal())
  const read = () => f.runtime.readModelCurrent(caller('root'), 'root', signal())
  const disabled = await read(), initial = await f.runtime.readOwnerDecisionPolicy(operator, 'root', signal())
  await f.runtime.saveOwnerDecisionPolicy(operator, 'root', { operationId: 'enable', expectedRevision: 0, expectedScope: initial.instance, action: 'enable', durationMs: 10 }, signal())
  const active = await read()
  assert.notEqual(active.collections.decision.version, disabled.collections.decision.version)
  assert.notEqual(active.collections.decision.rows[0].sourceVersion, disabled.collections.decision.rows[0].sourceVersion)
  clock = 1001
  const stable = await read()
  assert.equal(stable.collections.decision.version, active.collections.decision.version)
  assert.equal(stable.collections.decision.rows[0].sourceVersion, active.collections.decision.rows[0].sourceVersion)
  clock = 1010
  const expired = await read()
  assert.notEqual(expired.collections.decision.version, active.collections.decision.version)
  assert.notEqual(expired.collections.decision.rows[0].sourceVersion, active.collections.decision.rows[0].sourceVersion)
  assert.equal(expired.collections.decision.rows[0].preview.revision, 2)
})

test('expiry crossing during awaited model projection cannot return an expired policy with a still-adoptable candidate', async t => {
  let clock = 1000, ticking = false
  const f = await fixture(t, { initialPolicy: policy(), now: () => ticking ? (clock += 6) : clock })
  const initial = await f.runtime.readOwnerDecisionPolicy(operator, 'root', signal())
  await f.runtime.saveOwnerDecisionPolicy(operator, 'root', { operationId: 'enable', expectedRevision: 0, expectedScope: initial.instance, action: 'enable', durationMs: 10 }, signal())
  await f.runtime.applyInstrument(caller('root'), 'root', { operationId: 'flow', expectedRevision: 0, workflowId: 'flow', action: 'put-workflow', value: { title: 'Delivery', axes: [] } }, signal())
  await f.runtime.applyInstrument(caller('root'), 'root', { operationId: 'question', expectedRevision: 1, workflowId: 'flow', decisionId: 'D', action: 'put-decision', value: question }, signal())
  ticking = true
  await assert.rejects(f.runtime.readModelCurrent(caller('root'), 'root', signal()), e => e.code === 'revision-conflict')
  ticking = false
  const expired = await f.runtime.readModelCurrent(caller('root'), 'root', signal())
  assert.equal(expired.ownerDecisionPolicy.status, 'expired')
  assert.equal(expired.collections.decision.rows[0].preview.recommendationSupport.status, 'not-eligible')
})

async function candidateQuestion(f, decisionId = 'D', value = question, expectedRevision = 1) {
  const put = await f.runtime.applyInstrument(caller('root'), 'root', { operationId: 'put-' + decisionId, expectedRevision, workflowId: 'flow', decisionId, action: 'put-decision', value }, signal())
  const c = put.recommendation.candidate
  return { operationId: 'adopt-' + decisionId, expectedRevision: put.snapshot.businessRevision, workflowId: 'flow', decisionId, action: 'adopt-decision-recommendation', value: { optionKey: c.optionKey, decisionRevision: c.decisionRevision, policyEpochId: c.policyEpochId, policyRevision: c.policyRevision } }
}

test('a human answer committed before explicit adoption wins under both business CAS and source revision fences', async t => {
  const f = await enabledRuntime(t), command = await candidateQuestion(f)
  const candidate = await f.runtime.readModelCurrent(caller('root'), 'root', signal())
  assert.equal(candidate.collections.decision.rows[0].preview.recommendationSupport.status, 'candidate')
  const answered = await f.runtime.applyInstrument(operator, 'root', {
    operationId: 'human-answer', expectedRevision: command.expectedRevision, workflowId: 'flow', decisionId: 'D', action: 'put-decision',
    references: ['human:answer-source'], value: { ...question, pending: false, result: 'Choose A; wait for maintainer input, do not install or modify the SDK.' },
  }, signal())
  await assert.rejects(f.runtime.applyInstrument(caller('root'), 'root', command, signal()), e => e.code === 'revision-conflict')
  const current = await f.runtime.readModelCurrent(caller('root'), 'root', signal())
  assert.equal(current.collections.decision.rows[0].preview.recommendationSupport.status, 'not-eligible')
  // Refreshing the global CAS is not permission to overwrite a changed source decision.
  await assert.rejects(f.runtime.applyInstrument(caller('root'), 'root', { ...command, operationId: 'fresh-cas-old-candidate', expectedRevision: current.revisions.business }, signal()), e => e.code === 'revision-conflict')
  const after = await f.read(), row = after.records.decisions[0]
  assert.equal(after.records.businessRevision, answered.snapshot.businessRevision)
  assert.equal(row.value.result, 'Choose A; wait for maintainer input, do not install or modify the SDK.')
  assert.equal(row.value.pending, false)
  assert.equal(row.value.awaitingImplementation, true)
  assert.equal(row.policySelection, undefined)
  assert.equal(row.history.at(-1).author.kind, 'user')
  assert.deepEqual(row.history.at(-1).references, ['human:answer-source'])
})

test('policy read failure preserves ordinary question writes but never lends cached active authorization or permits adoption', async t => {
  const f = await enabledRuntime(t), command = await candidateQuestion(f)
  const first = await f.runtime.preStep(caller('root'), signal(), [], '1:1')
  assert.match(first[0].content[0].text, /Recommendation support: active/)
  const policyModule = await import('../src/controls/owner-decision-policy.ts')
  const store = await f.ports.openUnitStorage(policyModule.ownerDecisionPolicyTableName(f.instance.instrumentInstanceId), policyModule.parseOwnerDecisionPolicyDocument)
  const read = store.read.bind(store)
  store.read = async () => { throw new Error('injected optional policy source failure') }
  const ordinary = await f.runtime.applyInstrument(caller('root'), 'root', { operationId: 'ordinary', expectedRevision: 2, workflowId: 'flow', decisionId: 'ordinary', action: 'put-decision', value: question }, signal())
  assert.equal(ordinary.appliedRevision, 3)
  assert.equal(ordinary.snapshot.decisions.find(row => row.decisionId === 'ordinary').policyBinding, undefined)
  assert.equal(ordinary.recommendation.status, 'unknown')
  await assert.rejects(f.runtime.applyInstrument(caller('root'), 'root', { ...command, expectedRevision: 3 }, signal()), e => e.code === 'invalid-state')
  const failed = await f.runtime.preStep(caller('root'), signal(), first, '1:2')
  assert.doesNotMatch(JSON.stringify(failed), /Recommendation support: active/)
  assert.equal((await f.read()).ownerDecisionPolicy.status, 'unknown')
  store.read = read
  const recovered = await f.read()
  assert.equal(recovered.records.businessRevision, 3)
  assert.equal(recovered.records.decisions.find(row => row.decisionId === 'D').value.pending, true)
  assert.equal(recovered.records.decisions.find(row => row.decisionId === 'ordinary').policyBinding, undefined)
})

test('uncertain owner policy commit stays unknown until reopen and replays committed disable without duplicate effects', async t => {
  const f = await enabledRuntime(t)
  const policyModule = await import('../src/controls/owner-decision-policy.ts')
  const store = await f.ports.openUnitStorage(policyModule.ownerDecisionPolicyTableName(f.instance.instrumentInstanceId), policyModule.parseOwnerDecisionPolicyDocument)
  const write = store.compareAndSwap.bind(store); let effects = 0
  store.compareAndSwap = async (...args) => { effects++; await write(...args); throw new Error('simulated lost policy commit acknowledgement') }
  const command = { operationId: 'disable', expectedRevision: 1, expectedScope: f.instance, action: 'disable' }
  await assert.rejects(f.runtime.saveOwnerDecisionPolicy(operator, 'root', command, signal()), /lost policy commit acknowledgement/)
  await assert.rejects(f.runtime.readOwnerDecisionPolicy(operator, 'root', signal()), e => e.code === 'storage-uncertain')
  assert.equal((await f.read()).ownerDecisionPolicy.status, 'unknown')
  // Explicit fresh public storage handle over the same persisted fixture backing, not a reset of the uncertain handle.
  f.units.set(policyModule.ownerDecisionPolicyTableName(f.instance.instrumentInstanceId), { read: store.read.bind(store), compareAndSwap: write })
  await f.reopen()
  const replay = await f.runtime.saveOwnerDecisionPolicy(operator, 'root', command, signal())
  assert.equal(replay.replayed, true); assert.equal(replay.appliedRevision, 2)
  assert.equal(replay.snapshot.saved.enabled, false); assert.equal(effects, 1)
})

test('policy revoke and adoption share one Runtime FIFO: earlier disable cannot be overtaken by an already-built candidate', async t => {
  const f = await enabledRuntime(t), command = await candidateQuestion(f)
  const policyModule = await import('../src/controls/owner-decision-policy.ts')
  const store = await f.ports.openUnitStorage(policyModule.ownerDecisionPolicyTableName(f.instance.instrumentInstanceId), policyModule.parseOwnerDecisionPolicyDocument)
  const write = store.compareAndSwap.bind(store)
  let enteredResolve, release
  const entered = new Promise(resolve => { enteredResolve = resolve }), held = new Promise(resolve => { release = resolve })
  store.compareAndSwap = async (...args) => { enteredResolve(); await held; return write(...args) }
  const disable = f.runtime.saveOwnerDecisionPolicy(operator, 'root', { operationId: 'disable', expectedRevision: 1, expectedScope: f.instance, action: 'disable' }, signal())
  await entered
  const adoption = f.runtime.applyInstrument(caller('root'), 'root', command, signal())
  const rejected = assert.rejects(adoption, e => e.code === 'feature-disabled')
  release(); await disable; await rejected
  assert.equal((await f.read()).records.businessRevision, 2)
  assert.equal((await f.read()).records.decisions[0].value.pending, true)
})

test('authorized child uses owner policy but a revoked assignment cannot adopt an earlier candidate or leak current source', async t => {
  const f = await enabledRuntime(t)
  await f.runtime.applyInstrument(caller('root'), 'root', { operationId: 'reference', expectedRevision: 1, workflowId: 'flow', localTicketId: 'A', action: 'put-task-reference', value: { source: { kind: 'unverified' }, locator: 'task:A' } }, signal())
  await f.assign('old-child', 'flow', ['A'])
  const put = await f.runtime.applyInstrument(caller('old-child'), 'old-child', { operationId: 'question', expectedRevision: 2, workflowId: 'flow', decisionId: 'D', action: 'put-decision', value: { ...question, ticketIds: ['A'] } }, signal())
  assert.equal(put.recommendation.status, 'candidate')
  const c = put.recommendation.candidate
  await f.assign('old-child', 'flow', [])
  await assert.rejects(f.runtime.applyInstrument(caller('old-child'), 'old-child', { operationId: 'adopt', expectedRevision: 3, workflowId: 'flow', decisionId: 'D', action: 'adopt-decision-recommendation', value: { optionKey: c.optionKey, decisionRevision: c.decisionRevision, policyEpochId: c.policyEpochId, policyRevision: c.policyRevision } }, signal()), e => e.code === 'access-denied')
  const child = await f.runtime.readModelCurrent(caller('old-child'), 'old-child', signal())
  assert.equal(child.collections.decision.rows.length, 0)
  assert.equal((await f.read()).records.decisions[0].value.pending, true)
})
