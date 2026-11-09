import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import * as React from 'react'
import { Window } from 'happy-dom'
import { buildClient } from '../scripts/build-client.mjs'
import { PRIMITIVES_ID, clientPrimitives } from './fixtures/client-primitives.mjs'

const built = await buildClient()
let registration
vm.runInThisContext('(function(window){' + built.code + '\n})')({ __ModuleLoader__: { load: value => { registration = value } } })
const client = registration.factory(name => {
  if (name === 'react') return React
  if (name === PRIMITIVES_ID) return clientPrimitives(React)
  throw new Error('Unexpected runtime import ' + name)
})
function snapshot() {
  const instance = { instrumentInstanceId: 'instance', ownerSessionId: 'owner', controlWorkspaceId: 'workspace' }
  return { sessionId: 'owner', instance, caller: { kind: 'user', principalId: 'operator', sessionId: null }, policyGrants: { schemaVersion: 1, revision: 0, grants: [] },
    policy: { controlWorkspaceId: 'workspace', extensionEnabled: true, workspaceEnabled: true, features: {}, windows: { ticketWindowSize: 8, runningSubagentLimit: 80 },
      display: { header: true, inputSummary: true, rightPanel: true, sessionList: true, timeline: true } },
    records: null, windows: { instance, capability: 'cooperative', scope: { kind: 'coordinator' }, T: { used: 0, capacity: 8, overage: 0, gap: 8 },
      S: { used: 70, capacity: 80, overage: 0, gap: 10, countKnown: true, depth: null } },
    nativeExecutions: [row('child', 'owner')], resources: [], capabilities: [], health: [] }
}
function row(sessionId, parentSessionId, activity = 'running') {
  return { sessionId, executionId: sessionId, parentSessionId, activity, state: 'running', observed: 'subagent/start', lane: null, headerCwd: null }
}
async function mount(t, initial = snapshot(), catalog = { child: { title: 'Native readable title', parentId: 'owner' } }, options = {}) {
  const window = new Window()
  const globals = { window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement, Node: window.Node, IS_REACT_ACT_ENVIRONMENT: true }
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  let current = initial, list = { byId: catalog }, mounted = 'owner'
  const listeners = new Set(), effects = [], seats = [], opened = [], calls = []
  const remote = new Proxy({}, { get: (_, method) => async (...args) => {
    calls.push(String(method))
    if (method === 'readSession') return { ok: true, value: structuredClone(current) }
    if (method === 'readPolicy') return { ok: false, error: new Error('fixture policy unavailable') }
    assert.fail('No writes/history/model/extra RPC: ' + String(method))
  } })
  const sessions = { list: { getSnapshot: () => list }, subagentAddress: id => {
    const parent = list.byId[id]?.parentId
    return parent ? { childSessionId: id, parentSessionId: parent, mode: 'continuable' } : undefined
  } }
  const ctx = { remote: { $mount: async () => {}, mattpocockControls: remote }, inject: async (_, fn) => fn(ctx),
    effect: fn => { const cleanup = fn(); if (typeof cleanup === 'function') effects.push(cleanup) },
    sessions, sidebarRight: { mounted: { getSnapshot: () => mounted }, openResource: (...args) => opened.push(args), openTab: () => assert.fail('wrong native navigation') },
    sidebarRightTabs: { register: () => () => {} }, slots: { inject: (_, fn) => fn(), register: (definition, component) => seats.push({ definition, component }) } }
  if (options.legacy) { delete sessions.subagentAddress; delete ctx.sidebarRight.openResource }
  await client.apply(ctx)
  const seat = seats.find(row => row.definition.id?.endsWith(':input'))
  assert(seat, 'actual apply must register the input seat')
  const face = seat.definition.inject('owner')
  const observer = face.observe()
  const useSessions = selector => selector(React.useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn) }, () => list, () => list))
  const container = window.document.createElement('div'); window.document.body.append(container)
  const { createRoot } = await import('react-dom/client')
  const root = createRoot(container)
  await React.act(async () => root.render(React.createElement(client.ObservedInputSummary, { sessionId: 'owner', ...face, observer, useSessions: options.legacy ? undefined : useSessions })))
  t.after(async () => {
    await React.act(async () => root.unmount())
    for (const cleanup of effects.reverse()) cleanup()
    await window.happyDOM.close()
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] }
  })
  await React.act(async () => container.querySelector('[aria-label="查看 S 在跑子代理"]').click())
  return { container, opened, calls, sessions, ctx, observer,
    catalog: async byId => { list = { byId }; await React.act(async () => { for (const fn of listeners) fn() }) },
    refresh: async next => { current = next; await React.act(async () => observer.refresh()) },
    mounted: id => { mounted = id }, current: next => { current = next },
    race: async (next, action) => { current = next; await React.act(async () => { await observer.refresh(); action() }) },
  }
}
const button = (f, title) => [...f.container.querySelectorAll('button')].find(node => node.textContent === title)
const click = async node => { assert(node, 'expected actionable title'); await React.act(async () => node.click()) }

test('actual input seat reads changing native titles and opens native direct-parent chat without RPC dispatch', async t => {
  const f = await mount(t)
  assert(button(f, 'Native readable title'), 'S uses the host title rather than an execution id')
  const baseline = [...f.calls]
  await f.catalog({ child: { title: 'Renamed by host', parentId: 'owner' } })
  await click(button(f, 'Renamed by host'))
  assert.deepEqual(f.opened, [['dsh-resource://subagentchat/session/child?parent=owner&mode=continuable', { preferNewPane: true }]])
  assert.deepEqual(f.calls, baseline)
  assert.match(f.container.textContent, /宿主在跑数：70/)
  assert.match(f.container.textContent, /64 行/)
})

test('grandchildren retain non-running catalog ancestors, fold by real parent and navigate to that parent', async t => {
  const view = snapshot(); view.nativeExecutions = [row('grandchild', 'parent')]
  const f = await mount(t, view, { parent: { displayTitle: 'Idle parent', parentId: 'owner' }, grandchild: { projectionValues: { subagent: { label: 'Grandchild label' } }, parentId: 'parent' } })
  const fold = f.container.querySelector('[aria-label="折叠 Idle parent 的子代理"]')
  assert(fold, 'catalog-only non-running parent remains a structural node')
  assert.equal(button(f, 'Grandchild label').closest('article').parentElement.closest('article').querySelector('button').textContent, 'Idle parent')
  await click(button(f, 'Grandchild label'))
  assert.equal(f.opened[0][0], 'dsh-resource://subagentchat/session/grandchild?parent=parent&mode=continuable')
  await click(fold)
  assert.equal(button(f, 'Grandchild label'), undefined, 'fold actually removes descendant actions')
  await f.catalog({ parent: { displayTitle: 'Idle parent renamed', parentId: 'owner' }, grandchild: { title: 'Updated grandchild', parentId: 'parent' } })
  assert.equal(button(f, 'Updated grandchild'), undefined, 'host title refresh does not reset fold')
  await click(f.container.querySelector('[aria-label="展开 Idle parent renamed 的子代理"]'))
  assert(button(f, 'Updated grandchild'))
  assert.match(f.container.textContent, /结构节点（不计入在跑）/)
  assert.match(f.container.textContent, /宿主在跑数：70/)
})

test('an old rendered action cannot open an observation removed before React commits', async t => {
  const view = snapshot(), f = await mount(t, view)
  const stale = button(f, 'Native readable title')
  const next = structuredClone(view); next.nativeExecutions = []
  await f.race(next, () => stale.click())
  assert.deepEqual(f.opened, [], 'current authorized observation membership is rechecked at click time')
})

test('unknown, missing, conflicting and cyclic parent chains preserve running rows without inventing owner links', async t => {
  const view = snapshot()
  view.nativeExecutions = [row('orphan', 'missing'), row('cycle-a', 'cycle-b'), row('cycle-b', 'cycle-a'), row('conflict', 'owner'), row('valid', 'owner')]
  const f = await mount(t, view, { conflict: { title: 'Conflicting child', parentId: 'different' }, valid: { title: 'Valid child', parentId: 'owner' } })
  const unknown = f.container.querySelector('[aria-label="父链未知的子代理"]')
  assert(unknown)
  assert.equal(unknown.querySelectorAll('article').length, 4)
  for (const name of ['orphan', 'cycle-a', 'cycle-b', 'Conflicting child']) {
    const node = button(f, name)
    assert.equal(node.disabled, true)
    assert(unknown.contains(node))
  }
  assert.equal(button(f, 'Valid child').disabled, false)
  assert(!unknown.contains(button(f, 'Valid child')))
  assert.equal(button(f, 'missing'), undefined, 'unknown ancestors are not invented as owner children')
  assert.deepEqual(f.opened, [])
})

test('native address and mounted-session changes are rechecked when the user clicks', async t => {
  const f = await mount(t)
  f.mounted('another-session')
  await click(button(f, 'Native readable title'))
  assert.deepEqual(f.opened, [])
  f.mounted('owner')
  f.sessions.subagentAddress = () => ({ childSessionId: 'child', parentSessionId: 'wrong-parent', mode: 'continuable' })
  await click(button(f, 'Native readable title'))
  assert.deepEqual(f.opened, [])
  assert.match(f.container.textContent, /会话、显示权限或地址已变化/)
})

for (const change of ['display', 'caller', 'grant', 'instance', 'assigned', 'health']) test('click race fences changed ' + change + ' before React commits', async t => {
  const view = snapshot(), f = await mount(t, view), stale = button(f, 'Native readable title'), next = structuredClone(view)
  if (change === 'display') next.policy.display.inputSummary = false
  if (change === 'caller') next.caller.principalId = 'different-operator'
  if (change === 'grant') next.policyGrants.revision++
  if (change === 'instance') { next.instance.instrumentInstanceId = 'new-instance'; next.windows.instance.instrumentInstanceId = 'new-instance' }
  if (change === 'assigned') next.windows.scope = { kind: 'assigned', ticketIds: [], workflowId: null }
  if (change === 'health') next.health = [{ scope: 'native-executions', status: 'restricted', reason: 'denied' }]
  await f.race(next, () => stale.click())
  assert.deepEqual(f.opened, [])
  assert.equal(button(f, 'Native readable title'), undefined, 'old title and actionable content disappear')
})

test('assigned and agent callers never consume catalog sibling titles', async t => {
  const view = snapshot(); view.windows.scope = { kind: 'assigned', ticketIds: [], workflowId: null }
  const f = await mount(t, view)
  assert.equal(button(f, 'Native readable title'), undefined)
  assert.match(f.container.textContent, /受限/)
  const next = snapshot(); next.caller = { kind: 'agent', principalId: 'child-agent', sessionId: 'owner' }
  await f.refresh(next)
  await click(f.container.querySelector('[aria-label="查看 S 在跑子代理"]'))
  assert.equal(button(f, 'Native readable title'), undefined)
  assert.deepEqual(f.opened, [])
})

test('legacy hosts keep shortened ID, full technical identity and capability explanation', async t => {
  const view = snapshot(); view.nativeExecutions = [row('child-12345678901234567890', 'owner')]
  const f = await mount(t, view, {}, { legacy: true })
  assert.equal(button(f, 'child-123456…').disabled, true)
  assert.match(f.container.textContent, /child-12345678901234567890/)
  assert.match(f.container.textContent, /宿主缺少可用原生子代理导航能力或真实地址/)
  assert.deepEqual(f.opened, [])
})

test('a real unreadable snapshot removes native titles and cancels stale click actions', async t => {
  const f = await mount(t), stale = button(f, 'Native readable title')
  await f.race(null, () => stale.click())
  assert.deepEqual(f.opened, [])
  assert.equal(button(f, 'Native readable title'), undefined)
})

test('real ancestors can span multiple idle catalog generations without borrowing unrelated catalog rows', async t => {
  const view = snapshot(); view.nativeExecutions = [row('leaf', 'middle')]
  const f = await mount(t, view, { top: { title: 'Top parent', parentId: 'owner' }, middle: { title: 'Middle parent', parentId: 'top' },
    leaf: { title: 'Leaf', parentId: 'middle' }, unrelated: { title: 'Must not appear', parentId: 'owner', running: true } })
  assert(button(f, 'Top parent').closest('article').contains(button(f, 'Middle parent')))
  assert(button(f, 'Middle parent').closest('article').contains(button(f, 'Leaf')))
  assert.equal(button(f, 'Must not appear'), undefined)
  await click(button(f, 'Middle parent'))
  assert.equal(f.opened[0][0], 'dsh-resource://subagentchat/session/middle?parent=top&mode=continuable')
})

test('folds remain local and reset across instance/authorization changes', async t => {
  const view = snapshot(); view.nativeExecutions = [row('grandchild', 'parent'), row('parent', 'owner', 'idle')]
  const f = await mount(t, view, { parent: { title: 'Parent', parentId: 'owner' }, grandchild: { title: 'Grandchild', parentId: 'parent' } })
  await click(f.container.querySelector('[aria-label="折叠 Parent 的子代理"]'))
  assert.equal(button(f, 'Grandchild'), undefined)
  const next = structuredClone(view); next.policyGrants.revision++
  await f.refresh(next)
  await click(f.container.querySelector('[aria-label="查看 S 在跑子代理"]'))
  assert(button(f, 'Grandchild'), 'a new authorization scope does not reuse a collapsed tree')
  assert.equal(button(f, 'Parent').closest('article').querySelectorAll('article').length, 1)
})
