import assert from 'node:assert/strict'
import { load, settle } from './client-navigation-host.mjs'
await load('@deepseek-ai/dsh-client-ui-dockkit')
const resourceModule = await load('@deepseek-ai/dsh-client-resources')
const sidebarModule = await load('@deepseek-ai/dsh-client-ui-sidebar-right')
const subagentModule = await load('@deepseek-ai/dsh-client-ui-subagent')
export function source(value) { const listeners = new Set(); return { getSnapshot: () => value, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn) }, set(next) { value = next; for (const fn of listeners) fn() } } }
const noop = () => () => {}
export async function installSidebar(ctx) {
  const current = source({ key: undefined }), panelInfo = source({ activePanelId: null }), definitions = []
  await ctx.plugin({ name: 'navigation-native-sidebar-ports', apply(c) {
    c.provide('slots', { provideRoot: noop, inject(_name, fn) { const effect = fn(); if (effect && typeof effect.next === 'function') { const disposers = [...effect]; return () => { for (const dispose of disposers.reverse()) dispose() } } return effect },
      register(definition, component) { definitions.push({ definition, component }); return () => {} }, entriesOfSlot: () => [], subscribe: noop })
    c.provide('locale', { bind: () => key => key, register: noop }); c.provide('uiSession', { adapter: { current } })
    c.provide('layout', { panelInfo, openRightbar() {}, closeRightbar() {} }); c.provide('contextMenus', { register: noop, active: source(undefined) })
    c.provide('shortcuts', { register: noop, catalog: source([]), runtime: 'web', closeWindow: async () => {} })
    c.provide('uiWorkspace', { openSession: () => assert.fail('must not main-navigate') })
  } })
  await ctx.plugin(resourceModule); await ctx.plugin(sidebarModule); await ctx.plugin(subagentModule)
  const seat = definitions.find(row => row.definition.name === 'rightbar.session'); assert(seat, 'native apply registered real sidebar store')
  const store = seat.definition.store.create('owner')
  current.set({ key: 'owner' }); await settle()
  const sidebar = ctx.get('sidebarRight'), sessions = ctx.get('sessions'), resources = ctx.get('resources'), tabs = ctx.get('sidebarRightTabs')
  assert.equal(sidebar.mounted.getSnapshot(), 'owner')
  return { sidebar, store, resources, tabs, definitions,
    mounted(id) { current.set({ key: id }) },
    async close(tabId) { sidebar.close(tabId); await settle() },
    async dispose() { current.set({ key: undefined }); await settle() },
    async resource(address) { const live = resources.source(address).getSnapshot(); assert.equal(live.status, 'live'); await live.value.reference.ready; return live.value },
    retained(id) { return sessions.retainInfo(id).getSnapshot() }
  }
}
