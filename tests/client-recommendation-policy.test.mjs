import test from 'node:test'
import assert from 'node:assert/strict'
process.env.DSH_CONTROLS_NATIVE_PRIMITIVES = '1'
const enabled = Boolean(process.env.DSH_NAVIGATION_HOST_ROOT)
if (!enabled && process.env.DSH_NAVIGATION_NATIVE_REQUIRED === '1') throw new Error('native host root required')
const native = enabled ? await import('./fixtures/client-navigation-native.mjs') : null
const host = enabled ? await import('./fixtures/client-navigation-host.mjs') : null
if (enabled) test.after(host.closeHost)
const options = { skip: enabled ? false : 'Explicit native policy test requires DSH_NAVIGATION_HOST_ROOT' }
async function click(element) { assert(element, 'expected accessible control'); await host.React.act(async () => { element.click(); await host.settle() }) }
function button(container, text) { return [...container.querySelectorAll('button')].find(node => node.textContent === text) }
const rpc = enabled ? await import('./fixtures/client-policy-remote.mjs') : null

test('zero pending keeps policy configuration reachable without mounting optional support or pretending OFF', options, async t => {
  const view = native.snapshot(); view.records.summary.pendingUserDecisionCount = 0; view.records.summary.pendingDecisionCount = 0
  const f = await native.mount(t, { view })
  assert(f.container.querySelector('[aria-label="查看待你裁决事项"]') === null)
  await click(button(f.container, '裁决设置'))
  assert.match(f.container.textContent, /推荐支持预授权/)
  assert.match(f.container.textContent, /不可用|不支持/)
  assert.equal(f.container.querySelector('[role="switch"]'), null, 'unknown capability is not a confirmed OFF toggle')
  assert.equal(f.opened.length, 0)
})

test('real optional Remote read confirms OFF; explicit switch saves server-scoped 8h epoch with no automatic adopt', options, async t => {
  const remote = rpc.policyRemote(t), view = native.snapshot(); view.policy.features.pendingDecisions = { status: 'configured', requested: true, reason: null }
  const f = await native.mount(t, { view, installRemote: remote.install })
  assert(f.container.querySelector('[aria-label="查看待你裁决事项"]'), JSON.stringify({ text: f.container.textContent, wire: remote.wire }))
  await click(f.container.querySelector('[aria-label="查看待你裁决事项"]'))
  assert.equal(remote.reads.length, 1, 'a mounted proxy is not yet evidence of support')
  const toggle = f.container.querySelector('[role="switch"]'); assert(toggle, 'confirmed operator control')
  assert.equal(toggle.getAttribute('aria-checked'), 'false')
  assert.equal(remote.calls.length, 0, 'reading/default 8h never enables')
  assert.equal(f.container.querySelector('[aria-label="预授权时长"]').value, '8')
  await click(toggle)
  assert.equal(remote.calls.length, 1)
  assert.equal(remote.calls[0].id, 'owner')
  assert.deepEqual(Object.keys(remote.calls[0].request).sort(), ['action', 'durationMs', 'expectedRevision', 'expectedScope', 'operationId'])
  assert.equal(remote.calls[0].request.durationMs, 28800000)
  assert.equal(remote.calls[0].request.expectedRevision, 0)
  assert.equal(remote.calls[0].request.expectedScope.ownerSessionId, 'owner')
  assert.match(f.container.textContent, /服务端.*生效|服务端.*active/)
  assert(remote.mounts.includes('@lmgatex/dsh-mattpocock-skills/recommendation-support'))
})

test('standalone Settings uses explicit default-none target even when management read is unavailable', options, async t => {
  const remote = rpc.policyRemote(t), f = await native.mount(t, { settings: true, installRemote: remote.install, api: { listWorkspaces: async () => ({ ok: true, value: [{ id: 'workspace', title: 'Workspace', status: 'ok', sessionIds: ['owner'] }] }) } })
  const selector = f.container.querySelector('[aria-label="选择预授权会话"]'); assert(selector, 'independent explicit policy selector')
  assert.equal(selector.value, '')
  assert.equal(remote.reads.length, 0); assert.equal(f.fullCalls.length, 0)
  await host.React.act(async () => { selector.value = 'owner'; selector.dispatchEvent(new host.window.Event('change', { bubbles: true })); await host.settle() })
  assert.equal(remote.reads.length, 1); assert.equal(remote.reads[0].id, 'owner')
  assert(f.container.querySelector('[role="switch"]'))
  await host.React.act(async () => { selector.value = ''; selector.dispatchEvent(new host.window.Event('change', { bubbles: true })) })
  assert(f.container.querySelector('[role="switch"]') === null)
  assert.equal(remote.calls.length, 0)
})

test('old-only server may mount both codecs but actual read is unsupported and base stays readable', options, async t => {
  const remote = rpc.policyRemote(t, { oldOnly: true }), f = await native.mount(t, { installRemote: remote.install })
  await click(f.container.querySelector('[aria-label="查看待你裁决事项"]'))
  assert.equal(remote.mounts.length, 2)
  assert.match(f.container.textContent, /gateway.invocation-unavailable/)
  assert(f.container.querySelector('[role="switch"]') === null)
  assert(f.container.querySelector('[aria-label="查看 T 票窗口"]'))
  assert.equal(remote.calls.length, 0)
})

test('feature OFF preserves stored enable intent and permits only closing the existing epoch', options, async t => {
  const epoch = { epochId: 'old-epoch', policyRevision: 1, scope: 'new-decisions', enabledAt: 1000, expiresAt: 3601000, authorizedBy: { kind: 'user', principalId: 'operator', sessionId: null } }
  const remote = rpc.policyRemote(t, { snapshot: { schemaVersion: 1, instance: native.snapshot().instance, revision: 1, saved: { enabled: true, epoch }, effective: { status: 'feature-disabled', reason: 'feature-disabled' } } })
  const f = await native.mount(t, { installRemote: remote.install })
  await click(f.container.querySelector('[aria-label="查看待你裁决事项"]'))
  const toggle = f.container.querySelector('[role="switch"]'); assert(toggle); assert.equal(toggle.disabled, false)
  assert.match(f.container.textContent, /开启意图/); assert.match(f.container.textContent, /未生效/)
  await click(toggle)
  assert.equal(remote.calls[0].request.action, 'disable'); assert.equal(remote.calls[0].request.expectedRevision, 1)
  assert.equal(f.container.querySelector('[role="switch"]').disabled, true, 'OFF cannot open a new epoch')
})

test('fresh policy source facts update effective display without upgrading CAS or duration draft', options, async t => {
  const remote = rpc.policyRemote(t), view = native.snapshot(); view.policy.features.pendingDecisions = { status: 'configured', requested: true, reason: null }
  const f = await native.mount(t, { view, installRemote: remote.install })
  await click(f.container.querySelector('[aria-label="查看待你裁决事项"]'))
  const duration = f.container.querySelector('[aria-label="预授权时长"]')
  await host.React.act(async () => { duration.value = '4'; duration.dispatchEvent(new host.window.Event('change', { bubbles: true })) })
  remote.snapshot = { ...remote.snapshot, revision: 7 }
  f.view = { ...f.view, ownerDecisionPolicy: { revision: 7, status: 'disabled', epochId: null, expiresAt: null, scope: 'new-decisions', reason: 'policy-disabled' } }
  await f.refresh(); await host.React.act(host.settle)
  assert.equal(remote.reads.length, 2, 'refreshes the true new policy source, never infers from old cached active')
  assert.equal(f.container.querySelector('[aria-label="预授权时长"]').value, '4')
  await click(f.container.querySelector('[role="switch"]'))
  assert.equal(remote.calls[0].request.expectedRevision, 0, 'new policy facts do not silently rebase the edited draft')
  assert.equal(remote.calls[0].request.durationMs, 14400000)
  assert.match(f.container.textContent, /保存未确认/)
})

test('a newer source while save is pending fences late acknowledgement and releases obsolete saving state', options, async t => {
  let resolveSave
  const remote = rpc.policyRemote(t, { save: () => new Promise(resolve => { resolveSave = resolve }) })
  const view = native.snapshot(); view.policy.features.pendingDecisions = { status: 'configured', requested: true, reason: null }
  const f = await native.mount(t, { view, installRemote: remote.install })
  await click(f.container.querySelector('[aria-label="查看待你裁决事项"]'))
  await click(f.container.querySelector('[role="switch"]')); assert(resolveSave)
  assert.equal(f.container.querySelector('[role="switch"]').disabled, true)
  remote.snapshot = { ...remote.snapshot, revision: 9 }
  f.view = { ...f.view, ownerDecisionPolicy: { revision: 9, status: 'disabled', epochId: null, expiresAt: null, scope: 'new-decisions', reason: 'policy-disabled' } }
  await f.refresh(); await host.React.act(host.settle)
  assert.equal(f.container.querySelector('[role="switch"]').disabled, false, 'obsolete pending save cannot pin a fresh source indefinitely')
  await host.React.act(async () => { resolveSave({ appliedRevision: 1, replayed: false, operation: { action: 'disable', epochId: null, expiresAt: null }, snapshot: { ...remote.snapshot, revision: 1 } }); await host.settle() })
  assert.doesNotMatch(f.container.textContent, /已保存历史操作|appliedRevision 1/)
  assert.match(f.container.textContent, /策略修订 9/)
})

test('persistent adoption preserves reading and displays exact policy source with actual agent author, not a user answer', options, async t => {
  const view = native.snapshot(), author = { kind: 'agent', principalId: 'agent:worker', sessionId: 'worker' }
  const value = { question: '选择实现路线', status: '既有任务状态', pending: true, awaitingImplementation: true, addressee: { kind: 'user' }, options: [{ key: 'route-b', label: '路线乙' }], recommendation: 'route-b', result: null }
  view.records.decisions = [{ workflowId: 'wf', decisionId: 'decision', revision: 2, value, history: [{ revision: 2, recordedAt: 1000, author, references: ['task://constraints'], value }] }]
  let writes = 0
  const f = await native.mount(t, { view, api: { applyInstrument: () => { writes++; throw Error('UI must not adopt') } } })
  await click(f.container.querySelector('[aria-label="查看待你裁决事项"]'))
  const selection = { kind: 'owner-policy', selectedOptionKey: 'route-b', decisionSourceRevision: 2, policy: { epochId: 'epoch-explicit', policyRevision: 5, scope: 'new-decisions', enabledAt: 1000, expiresAt: 3601000, authorizedBy: { kind: 'user', principalId: 'operator', sessionId: null } }, authorizedAt: 2000 }
  const row = f.view.records.decisions[0], adopted = { ...row.value, pending: false }
  f.view = { ...f.view, records: { ...f.view.records, decisions: [{ ...row, revision: 3, value: adopted, policySelection: selection, history: [...row.history, { revision: 3, recordedAt: 2000, author, references: ['task://constraints'], value: adopted, policySelection: selection }] }], summary: { ...f.view.records.summary, pendingUserDecisionCount: 0, pendingDecisionCount: 0 } } }
  await f.refresh()
  const source = f.container.querySelector('[aria-label="预授权采用来源"]'); assert(source, 'durable provenance visible in the still-authorized reader')
  assert.match(source.textContent, /按预授权策略选择/); assert.match(source.textContent, /route-b/)
  assert.match(source.textContent, /agent.*agent:worker/); assert.match(source.textContent, /epoch-explicit/)
  assert.match(source.textContent, /源事项修订 2/); assert.match(source.textContent, /策略修订 5/)
  assert.match(source.textContent, /不是用户逐项答复/); assert.equal(writes, 0)
  assert.equal(f.view.records.decisions[0].value.awaitingImplementation, true)
})

test('an old switch click rechecks actual feature state before React commits', options, async t => {
  const view = native.snapshot(); view.policy.features.pendingDecisions = { status: 'configured', requested: true, reason: null }
  const remote = rpc.policyRemote(t), f = await native.mount(t, { view, installRemote: remote.install })
  await click(f.container.querySelector('[aria-label="查看待你裁决事项"]'))
  const old = f.container.querySelector('[role="switch"]'), observer = f.face.observe()
  let exercised = false
  const release = observer.subscribe(() => { const latest = observer.getSnapshot(); if (!exercised && latest.status === 'ready' && latest.value.policy.features.pendingDecisions.status === 'disabled') { exercised = true; old.click() } })
  t.after(release)
  f.view = structuredClone(f.view); f.view.policy.features.pendingDecisions = { status: 'disabled', requested: false, reason: 'feature-disabled' }
  await f.refresh(); await host.React.act(host.settle)
  assert(exercised, 'race actually fires against committed observer before old render retires')
  assert.equal(remote.calls.length, 0, 'UI must not use the old configured closure to open an epoch')
})

for (const boundary of ['caller', 'grant', 'scope', 'instance', 'display']) test('old switch cannot cross current ' + boundary + ' before React commits', options, async t => {
  const view = native.snapshot(); view.policy.features.pendingDecisions = { status: 'configured', requested: true, reason: null }
  const remote = rpc.policyRemote(t), f = await native.mount(t, { view, installRemote: remote.install })
  await click(f.container.querySelector('[aria-label="查看待你裁决事项"]'))
  const old = f.container.querySelector('[role="switch"]'), observer = f.face.observe(), previous = observer.getSnapshot().value
  let exercised = false
  const release = observer.subscribe(() => { const latest = observer.getSnapshot(); if (!exercised && latest.status === 'ready' && latest.value !== previous) { exercised = true; old.click() } }); t.after(release)
  const next = structuredClone(f.view)
  if (boundary === 'caller') next.caller.principalId = 'different-operator'
  if (boundary === 'grant') next.policyGrants.revision++
  if (boundary === 'scope') next.records.scope = { kind: 'assigned', workflowId: 'wf', ticketIds: ['task'] }
  if (boundary === 'instance') { next.instance.instrumentInstanceId = 'new-instance'; next.records.instance = next.instance; next.windows.instance = next.instance }
  if (boundary === 'display') next.policy.display.inputSummary = false
  f.view = next; await f.refresh(); await host.React.act(host.settle)
  assert(exercised, 'actual ready observer boundary was exercised'); assert.equal(remote.calls.length, 0)
})

test('native namespace revoke and re-add never resurrect old switch clicks and do not disturb base reading', options, async t => {
  const view = native.snapshot(); view.policy.features.pendingDecisions = { status: 'configured', requested: true, reason: null }
  const remote = rpc.policyRemote(t), f = await native.mount(t, { view, installRemote: remote.install })
  await click(f.container.querySelector('[aria-label="查看待你裁决事项"]'))
  const old = f.container.querySelector('[role="switch"]'), baseReads = f.fullCalls.length
  await host.React.act(async () => { await remote.revoke(); old.click(); await host.settle() })
  assert(f.container.querySelector('[role="switch"]') === null); assert.equal(remote.calls.length, 0)
  await host.React.act(async () => { await remote.readd(); await host.settle() })
  assert(f.container.querySelector('[role="switch"]')); assert.equal(remote.reads.length, 2)
  await click(old); assert.equal(remote.calls.length, 0)
  assert.equal(f.fullCalls.length, baseReads, 'optional capability changes do not restart full reading')
  await click(f.container.querySelector('[role="switch"]')); assert.equal(remote.calls.length, 1)
})

test('optional mount errors leave the existing base input and zero configuration shell active', options, async t => {
  const remote = rpc.policyRemote(t, { mountFailure: true }), f = await native.mount(t, { installRemote: remote.install })
  await click(f.container.querySelector('[aria-label="查看待你裁决事项"]'))
  assert.match(f.container.textContent, /不可用或不支持/); assert(f.container.querySelector('[aria-label="查看 T 票窗口"]'))
  assert.equal(remote.calls.length, 0)
})

test('deselecting Settings aborts a real read outside JSON and fences its late successful result', options, async t => {
  let resolveRead
  const remote = rpc.policyRemote(t, { read: () => new Promise(resolve => { resolveRead = resolve }) })
  const f = await native.mount(t, { settings: true, installRemote: remote.install, api: { listWorkspaces: async () => ({ ok: true, value: [{ id: 'workspace', title: 'Workspace', status: 'ok', sessionIds: ['owner'] }] }) } })
  const selector = f.container.querySelector('[aria-label="选择预授权会话"]')
  await host.React.act(async () => { selector.value = 'owner'; selector.dispatchEvent(new host.window.Event('change', { bubbles: true })); await host.settle() })
  assert(resolveRead); assert.equal(remote.reads[0].signal.aborted, false)
  const read = remote.wire.find(row => row.endpoint === 'mattpocockRecommendationSupport/readOwnerDecisionPolicy')
  assert.deepEqual(Object.keys(read.args), ['sessionId'])
  await host.React.act(async () => { selector.value = ''; selector.dispatchEvent(new host.window.Event('change', { bubbles: true })); await host.settle() })
  assert.equal(remote.reads[0].signal.aborted, true)
  await host.React.act(async () => { resolveRead(remote.snapshot); await host.settle() })
  assert(f.container.querySelector('[role="switch"]') === null); assert.equal(remote.calls.length, 0)
  assert.match(f.container.textContent, /未选择会话/)
})

for (const kind of ['malformed', 'different-instance', 'access-denied']) test('policy ' + kind + ' stays unknown instead of a false OFF control', options, async t => {
  const remote = rpc.policyRemote(t, { read: async () => {
    if (kind === 'malformed') return { schemaVersion: 1 }
    if (kind === 'access-denied') throw Object.assign(new Error('not the authenticated operator'), { code: 'access-denied' })
    return { ...remote.snapshot, instance: { ...remote.snapshot.instance, instrumentInstanceId: 'unrelated' } }
  } })
  const f = await native.mount(t, { installRemote: remote.install })
  await click(f.container.querySelector('[aria-label="查看待你裁决事项"]'))
  assert.match(f.container.textContent, /未知/); assert(f.container.querySelector('[role="switch"]') === null)
  assert.equal(remote.calls.length, 0)
})

test('unknown server clock with finite but unrenderable epoch cannot crash the base reader or impersonate OFF', options, async t => {
  const epoch = { epochId: 'clock-unknown', policyRevision: 1, scope: 'new-decisions', enabledAt: 8800000000000000, expiresAt: 8800000003600000, authorizedBy: { kind: 'user', principalId: 'operator', sessionId: null } }
  const remote = rpc.policyRemote(t, { snapshot: { schemaVersion: 1, instance: native.snapshot().instance, revision: 1, saved: { enabled: true, epoch }, effective: { status: 'unknown', reason: 'clock-unavailable' } } })
  const f = await native.mount(t, { installRemote: remote.install })
  await click(f.container.querySelector('[aria-label="查看待你裁决事项"]'))
  assert.match(f.container.textContent, /未知/); assert(f.container.querySelector('[role="switch"]') === null)
  assert(f.container.querySelector('[aria-label="查看 T 票窗口"]')); assert.equal(remote.calls.length, 0)
})

test('historical save replay displays its original epoch separately from the current disabled snapshot', options, async t => {
  const epoch = { epochId: 'current-epoch', policyRevision: 8, scope: 'new-decisions', enabledAt: 1000, expiresAt: 7201000, authorizedBy: { kind: 'user', principalId: 'operator', sessionId: null } }
  const remote = rpc.policyRemote(t, { save: async () => ({ appliedRevision: 1, replayed: true, operation: { action: 'enable', epochId: 'historical-epoch', expiresAt: 3601000 }, snapshot: { schemaVersion: 1, instance: native.snapshot().instance, revision: 9, saved: { enabled: false, epoch }, effective: { status: 'disabled', reason: 'policy-disabled' } } }) })
  const view = native.snapshot(); view.policy.features.pendingDecisions = { status: 'configured', requested: true, reason: null }
  const f = await native.mount(t, { view, installRemote: remote.install })
  await click(f.container.querySelector('[aria-label="查看待你裁决事项"]')); await click(f.container.querySelector('[role="switch"]'))
  assert.match(f.container.textContent, /历史epoch historical-epoch/)
  assert.match(f.container.textContent, /current-epoch/); assert.match(f.container.textContent, /重放（不续期）/)
  assert.equal(f.container.querySelector('[role="switch"]').getAttribute('aria-checked'), 'false')
  assert.equal(remote.calls.length, 1)
})

test('supported candidate remains pending and an ephemeral adopted outcome cannot replace durable selection source', options, async t => {
  const view = native.snapshot(), value = { question: '候选不是采用', status: 'pending', pending: true, addressee: { kind: 'user' }, options: [{ key: 'exact-key', label: '明确选项' }], recommendation: 'exact-key' }
  view.records.decisions = [{ workflowId: 'wf', decisionId: 'candidate', revision: 2, value, history: [], recommendationSupport: { status: 'candidate', candidate: { optionKey: 'exact-key', decisionRevision: 2, policyEpochId: 'candidate-epoch', policyRevision: 4, expiresAt: 3601000 } } }]
  let writes = 0
  const f = await native.mount(t, { view, api: { applyInstrument: () => { writes++; throw Error('cannot auto-adopt') } } })
  await click(f.container.querySelector('[aria-label="查看待你裁决事项"]'))
  assert.match(f.container.textContent, /支持候选（尚未采用）/); assert.match(f.container.textContent, /candidate-epoch/)
  assert.equal(f.view.records.decisions[0].value.pending, true); assert.equal(writes, 0)
  f.view = structuredClone(f.view); f.view.records.decisions[0].recommendationSupport = { status: 'adopted', selection: {} }
  await f.refresh()
  assert.match(f.container.textContent, /持久采用来源未知/); assert(f.container.querySelector('[aria-label="预授权采用来源"]') === null)
  f.view = structuredClone(f.view); f.view.records.decisions[0].recommendationSupport = { status: 'candidate' }
  await f.refresh(); assert.match(f.container.textContent, /候选未知/)
  assert.equal(writes, 0)
})
