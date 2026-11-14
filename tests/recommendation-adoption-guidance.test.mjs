import assert from 'node:assert/strict'
import { test } from 'node:test'
import { caller, mountedFixture, operator, policy, signal, sdk, loadSDK } from './fixtures/runtime-host.mjs'
import { executeRegistryTool } from './fixtures/nested-tool.mjs'

const value = result => {
  assert.notEqual(result.isError, true, result.error?.message)
  const text = result.content.find(row => row.type === 'text').text
  assert.deepEqual(JSON.parse(text), result.value, 'typed and rendered output carry the same facts')
  assert.equal(text, JSON.stringify(result.value))
  assert.ok(Buffer.byteLength(text) <= (result.value.kind === 'receipt' ? 8192 : 65536))
  return result.value
}
const constraints = 'Wait for the maintainer to supply a qualified read-only runtime; no installation, download or SDK modification by this session.'
const question = {
  question: 'Who supplies the read-only runtime?', status: 'open', pending: true,
  addressee: { kind: 'user', principalId: operator.principalId },
  options: [{ key: 'maintainer-runtime', label: 'Maintainer supplies a read-only runtime' }, { key: 'defer', label: 'Defer this path' }],
  recommendation: 'maintainer-runtime', context: constraints, awaitingImplementation: true,
}

test('mounted guidance adopts the same path explicitly without re-confirmation or external operation permission', async t => {
  const f = await mountedFixture(t)
  await f.runtime.savePolicy(operator, policy(), 0, signal())
  const initial = await f.runtime.readOwnerDecisionPolicy(operator, 'root', signal())
  await f.runtime.saveOwnerDecisionPolicy(operator, 'root', { operationId: 'enable', expectedRevision: 0, expectedScope: initial.instance, action: 'enable', durationMs: null }, signal())
  const apply = async command => value(await f.execute('mattpocock_record', { request: { action: 'apply', command } }))
  const read = async () => value(await f.execute('mattpocock_record', { request: { action: 'read', query: { kind: 'decision' } } }))
  await apply({ operationId: 'flow', expectedRevision: 0, workflowId: 'flow', action: 'put-workflow', value: { title: 'Read-only runtime path', axes: [] } })
  const put = await apply({ operationId: 'question', expectedRevision: 1, workflowId: 'flow', decisionId: 'runtime-path', action: 'put-decision', references: ['task:runtime-input'], value: question })
  assert.equal(put.recommendation.status, 'candidate')
  const candidate = put.recommendation.candidate
  const pending = (await read()).rows[0]
  assert.equal(pending.pending, true)
  assert.equal(pending.policySelection, undefined, 'support and current reads never select automatically')
  assert.deepEqual(pending.recommendationSupport.candidate, candidate)

  // This is the G regression: the mounted model-facing instruction must positively direct
  // adoption, rather than let missing follow-through inputs imply another human choice.
  const description = f.ctx.tools.get('mattpocock_record').description
  assert.match(description, /do not reconfirm the same authorized path/)
  assert.match(description, /SAME decisionId/)
  assert.match(description, /current businessRevision \(not decisionRevision\) as expectedRevision/)
  assert.match(description, /Only successful adopted receipt records selection/)
  assert.match(description, /Path selection grants no operation permissions or external inputs/)
  assert.match(description, /still requires qualified input, not installation\/download\/SDK changes/)
  assert.match(description, /Higher-priority personal-confirmation requirements prevail/)

  // A native permission boundary, not a plugin business-risk classifier. The simulator's
  // bodies would only count dispatches; they never install, download or change any files.
  let effects = 0
  const denied = ['fixture_install', 'fixture_download', 'fixture_modify_sdk']
  for (const name of denied) f.ctx.tools.register(sdk.defineTool({ name, description: 'mechanical forbidden external effect', parameters: {}, output: { schema: { type: 'null' }, render: () => [] }, async execute() { effects++; return null } }))
  t.after(f.ctx.tools.guard(exec => denied.includes(exec.name) ? constraints : undefined))
  const checkPermissions = async () => {
    for (const name of denied) {
      const result = await f.execute(name)
      assert.equal(result.isError, true)
      assert.match(JSON.stringify(result), /Wait for the maintainer/)
    }
  }
  await checkPermissions()
  // Unrelated business progress separates global CAS from the candidate's source revision.
  const progressed = await apply({ operationId: 'progress', expectedRevision: put.businessRevision, workflowId: 'other', action: 'put-workflow', value: { title: 'Independent progress', axes: [] } })
  const command = { operationId: 'adopt', expectedRevision: candidate.decisionRevision, workflowId: 'flow', decisionId: 'runtime-path', action: 'adopt-decision-recommendation', references: ['decision:path-selection-only'], value: { optionKey: candidate.optionKey, decisionRevision: candidate.decisionRevision, policyEpochId: candidate.policyEpochId, policyRevision: candidate.policyRevision } }
  const stale = await f.execute('mattpocock_record', { request: { action: 'apply', command } })
  assert.equal(stale.isError, true)
  assert.match(stale.error.message, /revision/i)
  const current = await read()
  assert.equal(current.revisions.business, progressed.businessRevision)
  assert.notEqual(current.revisions.business, candidate.decisionRevision)
  assert.deepEqual(current.rows[0].recommendationSupport.candidate, candidate)
  command.expectedRevision = current.revisions.business

  // PTC uses this same typed nested dispatch boundary. This is an explicit test invocation,
  // not an automatic adopter, scanner, or a claim that a full PTC program/model ran.
  let nestedParent
  f.ctx.on('tools/post-execute', async (exec, result, next) => {
    if (exec.name === 'mattpocock_record' && exec.parent !== undefined) nestedParent = exec.parent
    return next()
  })
  f.ctx.tools.register(sdk.defineTool({ name: 'fixture_adopt_path', description: 'explicit nested adoption probe', parameters: {}, output: { schema: { type: 'json' }, render: (_, result) => [{ type: 'text', text: JSON.stringify(result) }] }, async execute(_, exec) {
    return value(await executeRegistryTool(f.ctx, { name: 'mattpocock_record', arguments: { request: { action: 'apply', command } }, callId: 'nested-path-adopt', rootCallId: exec.rootCallId, parent: exec.token, agent: exec.agent, signal: exec.signal }, loadSDK))
  } }))
  const adopted = value(await f.execute('fixture_adopt_path'))
  assert.ok(nestedParent)
  assert.equal(adopted.kind, 'receipt')
  assert.equal(adopted.appliedRevision, progressed.businessRevision + 1)
  assert.equal(adopted.replayed, false)
  assert.equal(adopted.recommendation.status, 'adopted')
  assert.equal(adopted.recommendation.selection.selectedOptionKey, 'maintainer-runtime')
  assert.equal(adopted.recommendation.selection.decisionSourceRevision, candidate.decisionRevision)
  const selected = (await read()).rows[0]
  assert.equal(selected.pending, false)
  assert.equal(selected.awaitingImplementation, true, 'path selection is not task completion')
  assert.equal(selected.recommendationSupport.status, 'adopted')
  assert.equal(selected.policySelection.selectedOptionKey, 'maintainer-runtime')
  const full = await f.runtime.readSession(caller('root'), 'root', signal())
  const row = full.records.decisions[0]
  assert.equal(row.value.context, constraints)
  assert.equal(row.value.result, undefined, 'do not invent a human reply or completed runtime input')
  assert.equal(row.history.at(-1).author.kind, 'agent')
  assert.deepEqual(row.history.at(-1).references, ['task:runtime-input', 'decision:path-selection-only'])
  await checkPermissions()
  assert.equal(effects, 0, 'adopting a path neither executes nor authorizes external effects')
  const forbiddenPolicy = await f.execute('mattpocock_controls', { request: { action: 'save', intent: policy(), expectedRevision: 1 } })
  assert.equal(forbiddenPolicy.isError, true, 'adoption does not grant agent policy-write authority')
})
