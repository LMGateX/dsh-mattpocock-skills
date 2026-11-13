import assert from 'node:assert/strict'
import { test, after } from 'node:test'
const host = process.env.DSH_NAVIGATION_HOST_ROOT
if (!host && process.env.DSH_NAVIGATION_NATIVE_REQUIRED === '1') throw new Error('Native navigation requires DSH_NAVIGATION_HOST_ROOT')
const native = { skip: !host ? 'Set DSH_NAVIGATION_HOST_ROOT for real native service lifecycle' : false }
const { mount, React, settle } = host ? await import('./fixtures/client-navigation-native.mjs') : {}
if (host) after((await import('./fixtures/client-navigation-host.mjs')).closeHost)

test('missing then late/revoked/re-added sessions publishes stable ports without remount/read or reviving old click closures', native, async t => {
  const f = await mount(t, { late: true }); await f.openS()
  const source = f.face.subagentNavigation; assert(source, 'base face publicly carries source')
  assert.equal(source.getSnapshot(), null)
  assert.equal(f.button('Dispatch label').disabled, true)
  assert.doesNotMatch(f.container.textContent, /宿主缺少/)
  const region = f.container.querySelector('[aria-label="S 在跑详情"]'), focused = f.container.querySelector('[aria-label="切换到S"]'); focused.focus()
  const calls = [f.fullCalls.length, f.summaryCalls.length], published = []
  const unsubscribe = source.subscribe(() => published.push(source.getSnapshot())); t.after(unsubscribe)
  await f.provide()
  const first = source.getSnapshot(); assert(first)
  assert.equal(source.getSnapshot() === first, true, 'same publication is a stable getSnapshot object')
  assert.equal(f.button('Dispatch label').disabled, false)
  const oldClick = () => first.open('child', 'owner', f.view)
  await f.revoke()
  assert.equal(source.getSnapshot(), null)
  assert.equal(first.available('child', 'owner'), false)
  assert.equal(oldClick(), false)
  assert.equal(f.button('Dispatch label').disabled, true)
  await f.provide()
  const second = source.getSnapshot(); assert(second && second !== first)
  assert.equal(oldClick(), false, 'old click cannot borrow a new publication token')
  assert.equal(first.available('child', 'owner'), false)
  assert.equal(f.button('Dispatch label').disabled, false)
  assert.equal(f.container.querySelector('[aria-label="S 在跑详情"]') === region, true)
  assert.equal(window.document.activeElement === focused, true)
  assert.deepEqual([f.fullCalls.length, f.summaryCalls.length], calls, 'capability changes never cause observation churn')
  assert.equal(published.length, 3)
  assert.equal(published[0] === first && published[1] === null && published[2] === second, true)
  assert.equal(f.sessions.retainInfo('child').getSnapshot().referenceCount, 0)
  assert.deepEqual(f.opened, [])
})

for (const kind of ['missing method', 'dependency invocation error']) test('native base keeps reading with ' + kind + ' without inventing unsupported-host diagnosis', native, async t => {
  const f = await mount(t, { late: true }); await f.openS()
  const baseline = [f.fullCalls.length, f.summaryCalls.length]
  await f.provide({ list: f.sessions.list, ...(kind === 'missing method' ? {} : { subagentAddress() { throw new Error('controlled invocation failure') } }) })
  assert.equal(f.button('Dispatch label').disabled, true)
  assert.match(f.container.textContent, /原生子代理导航暂不可用/)
  assert.doesNotMatch(f.container.textContent, /宿主缺少/)
  assert.equal(f.face.subagentNavigation.getSnapshot().open('child', 'owner', f.view), false)
  assert.deepEqual([f.fullCalls.length, f.summaryCalls.length], baseline)
  assert.deepEqual(f.opened, [])
})

for (const change of ['caller', 'grant', 'scope', 'membership', 'mounted']) test('real native open rechecks current ' + change + ' rather than stale rendered authority', native, async t => {
  const f = await mount(t); await f.openS()
  const expected = f.view, port = f.face.subagentNavigation.getSnapshot(); assert(port)
  if (change === 'mounted') await React.act(async () => { f.mounted(undefined); await settle() })
  else {
    const next = structuredClone(expected)
    if (change === 'caller') next.caller.principalId = 'different-operator'
    if (change === 'grant') next.policyGrants.revision++
    if (change === 'scope') next.windows.scope = { kind: 'assigned', workflowId: null, ticketIds: [] }
    if (change === 'membership') next.nativeExecutions = []
    f.view = next; await f.refresh()
  }
  assert.equal(port.open('child', 'owner', expected), false)
  assert.deepEqual(f.opened, [])
  assert.equal(f.sessions.retainInfo('child').getSnapshot().referenceCount, 0)
})

test('actual catalog title rename preserves folds and native grandchild routing uses its direct parent, not owner', native, async t => {
  const f = await mount(t), followBaseline = structuredClone(f.followCalls)
  assert.deepEqual(followBaseline.map(request => request.address), [{ kind: 'session', sessionId: 'owner' }])
  await React.act(async () => {
    f.added('child', 'owner', 'Child prompt prefix', [{ id: 'grandchild', mode: 'continuable', label: 'Grandchild label', activity: 'running' }], { mode: 'continuable', label: 'Dispatch label' })
    f.added('grandchild', 'child', 'Grandchild prompt prefix', undefined, { mode: 'continuable', label: 'Grandchild label' }); await settle()
  })
  f.view = { ...f.view, nativeExecutions: [{ sessionId: 'grandchild', executionId: 'grandchild', parentSessionId: 'child', activity: 'running', state: 'running', observed: 'subagent/start', lane: null }] }
  await f.refresh(); await f.openS()
  const fold = f.container.querySelector('[aria-label="折叠 Dispatch label 的子代理"]'); assert(fold)
  await React.act(async () => fold.click())
  assert.equal(f.button('Grandchild label') === undefined, true)
  const calls = [f.fullCalls.length, f.summaryCalls.length]
  await React.act(async () => { f.added('child', 'owner', 'Renamed host title', [{ id: 'grandchild', mode: 'continuable', label: 'Grandchild label', activity: 'running' }], { mode: 'continuable', label: 'Dispatch label' }); await settle() })
  assert.equal(f.button('Renamed host title'), undefined, 'session title rename never replaces a valid native label')
  assert(f.button('Dispatch label'))
  assert.equal(f.button('Grandchild label') === undefined, true, 'rename does not reset fold state')
  await React.act(async () => f.container.querySelector('[aria-label="展开 Dispatch label 的子代理"]').click())
  const address = 'dsh-resource://subagentchat/session/grandchild?parent=child&mode=continuable'
  assert.equal(f.button('Grandchild label').textContent, f.nativeSidebar.tabs.get('subagentchat').title(address), 'nested mounted name matches native tab with the real direct parent')
  assert.equal(f.sessions.retainInfo('child').getSnapshot().referenceCount, 0, 'structural ancestor is not retained')
  assert.equal(f.sessions.retainInfo('grandchild').getSnapshot().referenceCount, 0, 'nested name is not retained')
  assert.deepEqual(f.followCalls, followBaseline, 'title changes and folds do not read chat logs beyond the selected-owner baseline')
  await React.act(async () => f.button('Grandchild label').click())
  assert.equal(f.opened[0][0], address)
  await settle()
  assert.deepEqual((await f.nativeSidebar.resource(address)).address, { childSessionId: 'grandchild', parentSessionId: 'child', mode: 'continuable' })
  assert.deepEqual([f.fullCalls.length, f.summaryCalls.length], calls)
})
