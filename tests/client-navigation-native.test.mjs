import assert from 'node:assert/strict'
import { test, after } from 'node:test'
// Explicit capability precondition. Native release gates set this; a default source
// run reports missing native coverage, never substitutes a fake Cordis/controller.
const host = process.env.DSH_NAVIGATION_HOST_ROOT
if (!host && process.env.DSH_NAVIGATION_NATIVE_REQUIRED === '1') throw new Error('Native navigation requires DSH_NAVIGATION_HOST_ROOT')
const native = { skip: !host ? 'Set DSH_NAVIGATION_HOST_ROOT for original Cordis/controller/SlotCore navigation' : false }
const { mount, React, settle } = host ? await import('./fixtures/client-navigation-native.mjs') : {}
if (host) after((await import('./fixtures/client-navigation-host.mjs')).closeHost)
test('original Cordis plugin scope exposes actual Controller navigation through standard native Slot props', native, async t => {
  const f = await mount(t); await f.openS()
  const actualAddress = 'dsh-resource://subagentchat/session/child?parent=owner&mode=continuable'
  const nativeTitle = f.nativeSidebar.tabs.get('subagentchat').title(actualAddress)
  assert.equal(nativeTitle, 'Dispatch label', 'real native tab uses the child descriptor, not the prompt-prefix session title')
  const title = f.container.querySelector('article button'); assert(title, f.container.textContent)
  assert.equal(title.textContent, nativeTitle, 'mounted S name matches the actual native subagentchat tab title')
  assert.equal(title.disabled, false, 'real Controller exists but plugin scope must declare sessions')
  assert.equal(f.sessions.retainInfo('child').getSnapshot().referenceCount, 0, 'title read never retains a Session')
  await React.act(async () => title.click())
  const address = 'dsh-resource://subagentchat/session/child?parent=owner&mode=continuable'
  assert.deepEqual(f.opened, [[address, { preferNewPane: true }]])
  let resource
  await React.act(async () => { await settle(); resource = await f.nativeSidebar.resource(address) })
  assert.deepEqual(resource.address, { childSessionId: 'child', parentSessionId: 'owner', mode: 'continuable' }, 'native codec/provider accepted the exact address')
  const layout = f.nativeSidebar.store.getSnapshot().bySession.owner.layout
  const tab = Object.values(layout.tabs).find(row => row.kind === 'subagentchat'); assert(tab)
  assert.equal(tab.contentId, address)
  assert.equal(layout.nodes[layout.activePaneId].activeTabId, tab.id)
  assert.equal(layout.expanded, true)
  assert.equal(f.sessions.retainInfo('child').getSnapshot().retainedBy.sidebarChat, 1)
  await React.act(async () => f.nativeSidebar.close(tab.id))
  assert.equal(f.sessions.retainInfo('child').getSnapshot().referenceCount, 0)
  assert.equal(f.nativeSidebar.resources.source(address).getSnapshot().status, 'loading')
})

test('mounted naming details distinguish native label from session titles without retaining the child', native, async t => {
  const f = await mount(t); await f.openS()
  const details = f.button('Dispatch label').closest('article').querySelector('details')
  assert.match(details.textContent, /名称来源：catalog[.]projectionValues[.]subagent[.]label/)
  const technical = JSON.parse(details.querySelector('pre').textContent)
  assert.equal(technical.sessionId, 'child')
  assert.equal(technical.nativeLabel, 'Dispatch label')
  assert.equal(technical.sessionTitle, 'Prompt prefix: implement the delegated task')
  assert.equal(technical.sessionDisplayTitle, f.sessions.list.getSnapshot().byId.child.displayTitle)
  assert.equal(f.sessions.retainInfo('child').getSnapshot().referenceCount, 0)
})

test('actual Controller label updates match native tab while session title renames cannot replace it', native, async t => {
  const f = await mount(t); await f.openS()
  const address = 'dsh-resource://subagentchat/session/child?parent=owner&mode=continuable'
  const baseline = [f.fullCalls.length, f.summaryCalls.length], followBaseline = structuredClone(f.followCalls)
  assert.deepEqual(followBaseline.map(request => request.address), [{ kind: 'session', sessionId: 'owner' }], 'only the native selected-owner baseline is active')
  const labels = ['Dispatch label', '  Native label keeps whitespace  ', '长原生显示名称 ' + '完整保留'.repeat(40), 'child']
  for (const label of labels) {
    await React.act(async () => {
      f.added('owner', undefined, 'Owner', [{ id: 'child', mode: 'continuable', label, activity: 'running' }])
      f.added('child', 'owner', 'Renamed prompt-prefix session title', undefined, { mode: 'continuable', label })
      await settle()
    })
    const nativeTitle = f.nativeSidebar.tabs.get('subagentchat').title(address)
    assert.equal(nativeTitle, label)
    assert.equal(f.container.querySelector('article button').textContent, nativeTitle)
    assert.equal(f.button('Renamed prompt-prefix session title'), undefined)
    assert.equal(f.sessions.retainInfo('child').getSnapshot().referenceCount, 0)
    const technical = JSON.parse(f.container.querySelector('article details pre').textContent)
    assert.equal(technical.sessionTitle, 'Renamed prompt-prefix session title')
    assert.equal(technical.nativeLabel, label)
  }
  await React.act(async () => { f.added('child', 'owner', 'Title-only rename without descriptor'); await settle() })
  assert.equal(f.nativeSidebar.tabs.get('subagentchat').title(address), 'child', 'RC1 partial projection preserves the current native label')
  assert.equal(f.container.querySelector('article button').textContent, f.nativeSidebar.tabs.get('subagentchat').title(address))
  assert.equal(f.button('Title-only rename without descriptor'), undefined)
  assert.deepEqual([f.fullCalls.length, f.summaryCalls.length], baseline, 'name updates add no instrument read or write')
  assert.deepEqual(f.followCalls, followBaseline, 'label subscriptions never activate, retain or read child chat logs')
  assert.deepEqual(f.opened, [])
})

for (const [kind, descriptor] of [
  ['missing descriptor', undefined], ['null descriptor', null], ['missing label', { mode: 'continuable' }],
  ['null label', { mode: 'continuable', label: null }], ['empty label', { mode: 'continuable', label: '' }],
  ['blank label', { mode: 'continuable', label: '  \n\t' }],
]) test('actual Controller uses short ID for ' + kind + ' without borrowing session titles or retaining a Session', native, async t => {
  const id = 'child-12345678901234567890', f = await mount(t)
  const baseline = [f.fullCalls.length, f.summaryCalls.length], followBaseline = structuredClone(f.followCalls)
  assert.deepEqual(followBaseline.map(request => request.address), [{ kind: 'session', sessionId: 'owner' }], 'only the native selected-owner baseline is active')
  await React.act(async () => {
    // A missing projection in api-session/added is a partial update in RC1, not a deletion.
    // Exercise initial absence here; explicit null/empty descriptors below clear an existing label.
    f.added('owner', undefined, 'Owner', [{ id, mode: 'continuable', ...(descriptor === undefined ? {} : { label: 'Prior native label' }), activity: 'running' }])
    f.added(id, 'owner', 'Prompt prefix must stay technical', undefined, descriptor === undefined ? undefined : { mode: 'continuable', label: 'Prior native label' })
    await settle()
  })
  f.view = { ...f.view, nativeExecutions: [{ ...f.view.nativeExecutions[0], sessionId: id, executionId: id }] }
  await f.refresh(); await f.openS()
  if (descriptor !== undefined) assert(f.button('Prior native label'))
  await React.act(async () => {
    f.added('owner', undefined, 'Owner', [{ id, mode: 'continuable', activity: 'running' }])
    f.added(id, 'owner', 'Prompt prefix must stay technical', undefined, descriptor)
    await settle()
  })
  assert.equal(f.button('Prior native label') === undefined, true, 'descriptor loss clears the old label immediately')
  const action = f.button('child-123456…'); assert(action, f.container.textContent)
  assert.equal(action.disabled, false, 'fallback naming does not revoke a real address')
  assert.equal(f.button('Prompt prefix must stay technical'), undefined)
  assert.match(action.closest('article').querySelector('details').textContent, /名称来源：short-id/)
  const technical = JSON.parse(action.closest('article').querySelector('details pre').textContent)
  assert.equal(technical.sessionId, id)
  assert.equal(technical.sessionTitle, 'Prompt prefix must stay technical')
  await React.act(async () => {
    f.added('owner', undefined, 'Owner', [{ id, mode: 'continuable', label: 'Restored native label', activity: 'running' }])
    f.added(id, 'owner', 'Prompt prefix must stay technical', undefined, { mode: 'continuable', label: 'Restored native label' })
    await settle()
  })
  const address = 'dsh-resource://subagentchat/session/' + id + '?parent=owner&mode=continuable'
  assert.equal(f.button('Restored native label').textContent, f.nativeSidebar.tabs.get('subagentchat').title(address), 'valid label restoration immediately replaces fallback')
  assert.equal(f.button('child-123456…'), undefined)
  assert.equal(f.sessions.retainInfo(id).getSnapshot().referenceCount, 0)
  assert.equal(f.fullCalls.length, baseline[0] + 1, 'only the explicit fixture refresh reads instruments')
  assert.equal(f.summaryCalls.length, baseline[1])
  assert.deepEqual(f.followCalls, followBaseline, 'fallback names never fetch logs or retain cold sessions')
  assert.deepEqual(f.opened, [])
})
