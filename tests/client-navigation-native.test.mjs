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
  const title = f.button('Actual projected title'); assert(title, f.container.textContent)
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
