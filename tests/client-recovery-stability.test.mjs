import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFile } from 'node:fs/promises'
import * as React from 'react'
import { Window } from 'happy-dom'
import { buildClient } from '../scripts/build-client.mjs'
import { PRIMITIVES_ID, clientPrimitives } from './fixtures/client-primitives.mjs'

// Accepted recovery seam: unchanged closed browser bundle, real mounted React and public observation ports.
// No formatter-only proof, private state probes, live Profile or graphical-browser claims.
const code = process.env.DSH_CONTROLS_CLIENT_BUNDLE
  ? await readFile(process.env.DSH_CONTROLS_CLIENT_BUNDLE, 'utf8')
  : (await buildClient()).code
let registration
vm.runInThisContext('(function(window){' + code + '\n})')({ __ModuleLoader__: { load: value => { registration = value } } })
const primitives = clientPrimitives(React)
const client = registration.factory(name => {
  if (name === 'react') return React
  if (name === PRIMITIVES_ID) return primitives
  throw new Error('Unexpected runtime dependency ' + name)
})
const labels = { T: '查看 T 票窗口', S: '查看 S 在跑子代理', pending: '查看待你裁决事项', awaiting: '查看记录核对' }
const regions = { T: 'T 票窗口详情', S: 'S 在跑详情', pending: '待你裁决详情', awaiting: '记录核对详情' }
const author = { kind: 'user', principalId: 'user:test', sessionId: null }
function snapshot() {
  const instance = { instrumentInstanceId: 'inline-instance', ownerSessionId: 'inline-owner', controlWorkspaceId: 'inline-workspace' }
  return { sessionId: 'inline-session', instance, caller: author, policyGrants: { schemaVersion: 1, revision: 0, grants: [] },
    policy: { controlWorkspaceId: instance.controlWorkspaceId, extensionEnabled: true, workspaceEnabled: true, features: {},
      windows: { ticketWindowSize: 8, runningSubagentLimit: 100 },
      display: { header: true, inputSummary: true, rightPanel: true, sessionList: false, timeline: true } },
    records: { instance, scope: { kind: 'coordinator' }, businessRevision: 7, viewerRevision: 0, workflows: [], tickets: [], decisions: [], decisionViews: [],
      summary: { countingScope: 'instance', totalTickets: 0, statusCounts: [], pendingDecisionCount: 5,
        pendingUserDecisionCount: 3, pendingForPrincipalCount: 3, awaitingImplementationCount: 2 } },
    windows: { instance, revision: 3, configurationRevision: 1, capability: 'cooperative', scope: { kind: 'coordinator' }, status: 'ready', reason: null,
      runtimeKnowledge: { known: true, reason: null, runtimeId: 'inline-runtime' },
      T: { capacity: 8, used: 2, available: 6, gap: 6, overage: 0, overcommitted: false },
      S: { capacity: 100, used: 70, available: 30, gap: 30, overage: 0, overcommitted: false, countKnown: true, countReason: null,
        byState: { reserved: 0, accepted: 0, scheduled: 0, running: 1, stopping: 0, unknown: 0 },
        depth: { direct: 2, deeper: 68, unknown: 0, levels: { '1': 2, '2': 68 } } }, tickets: [], executions: [] },
    nativeExecutions: [], resources: [], capabilities: [], health: [] }
}

async function mount(t, { multipleSeats = false, stableHolder = false } = {}) {
  const window = new Window({ url: 'http://localhost/' })
  const globals = { window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement,
    Node: window.Node, Event: window.Event, MouseEvent: window.MouseEvent, IS_REACT_ACT_ENVIRONMENT: true }
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  let current = snapshot(), calls = 0, version = 0, pending = false
  const requests = [], caches = [], readings = [], warmHolders = []
  const makeCache = () => {
    const cache = new client.SessionObserverCache((sessionId, signal) => {
      calls++
      if (pending) return new Promise(resolve => requests.push({ sessionId, signal, resolve }))
      return Promise.resolve({ ok: true, value: structuredClone(current) })
    }, 0)
    caches.push(cache); return cache
  }
  let cache = makeCache()
  const scheduler = new client.SummaryScheduler(async request => ({ ok: true, value: { rows: request.sessions.map(({sessionId}) => ({
    sessionId, status: 'current', version: (++version).toString(16).padStart(64, '0'), summary: {
      sessionId, instance: current.instance, caller: current.caller,
      policy: { configurationRevision: version, controlWorkspaceId: current.instance.controlWorkspaceId, workspaceVerified: true,
        extensionEnabled: true, workspaceEnabled: true, display: current.policy.display },
      records: { businessRevision: 7, viewerRevision: 0, summary: { countingScope: 'instance', pendingUserDecisionCount: 3 } }, health: [],
    }
  })) } }), 600000)
  const summary = scheduler.observe(current.sessionId)
  const reading = { getSnapshot: () => reading.value, subscribe: listener => { readings.push(listener); return () => readings.splice(readings.indexOf(listener), 1) },
    select: () => {}, value: { sessionId: null, scope: null, key: null, identity: null } }
  const { createRoot } = await import('react-dom/client')
  const container = window.document.createElement('div'); window.document.body.append(container)
  const root = createRoot(container)
  let held = stableHolder ? cache.observe(current.sessionId).retain() : null
  const render = async (mounted = true) => React.act(async () => {
    // A fresh real lazy handle and callback on every render, like native slot injection.
    root.render(mounted ? React.createElement(React.Fragment, null,
      React.createElement(client.InputSummary, { sessionId: current.sessionId, summary, observe: () => cache.observe(current.sessionId), openDetails: () => assert.fail('no navigation') }),
      multipleSeats ? React.createElement(client.DecisionNotificationReader, { sessionId: current.sessionId, observer: cache.observe(current.sessionId), reading }) : null) : null)
  })
  const settle = () => React.act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
  t.after(async () => {
    try { await React.act(async () => root.unmount()); held?.(); for (const release of warmHolders) release(); scheduler.dispose(); for (const row of caches) row.dispose(); await window.happyDOM.close() }
    finally { for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] } }
  })
  await render(); await settle()
  return { container, window, render, settle, requests,
    get calls() { return calls },
    setPending(value = true) { pending = value },
    async full(next = current) { current = next; await React.act(async () => cache.observe(current.sessionId).refresh()) },
    async beginFull() { await React.act(async () => { void cache.observe(current.sessionId).refresh() }) },
    async summary(next = current) { current = next; await React.act(async () => summary.refresh()); await settle() },
    async replaceCache(warm = false) { cache = makeCache(); if (warm) { warmHolders.push(cache.observe(current.sessionId).retain()); await settle() } await render() },
    async finishRequests() { await React.act(async () => { for (const request of requests.splice(0)) request.resolve({ok: true, value: structuredClone(current)}) }) },
  }
}
function named(container, name) {
  const found = container.querySelector('[aria-label="' + name + '"]')
  assert(found, 'missing accessible element: ' + name)
  return found
}
function entry(container, kind) { return named(container, labels[kind]) }
function region(container, kind) { return named(container, regions[kind]) }
async function click(node) { await React.act(async () => node.click()) }

for (const fields of [['instance'], ['caller'], ['instance', 'caller']]) {
  for (const category of ['T', 'S', 'pending']) test('semantic identity field order keeps open ' + category + ': ' + fields.join('+'), async t => {
    const ui = await mount(t)
    await click(entry(ui.container, category))
    const button = entry(ui.container, category), details = region(ui.container, category)
    button.focus()
    const next = snapshot()
    for (const field of fields) next[field] = Object.fromEntries(Object.entries(next[field]).reverse())
    await ui.full(next)
    assert.strictEqual(entry(ui.container, category), button, 'healthy identity-preserving refresh keeps button DOM')
    assert.strictEqual(region(ui.container, category), details, 'opened reading survives key reordering')
    assert.strictEqual(ui.window.document.activeElement, button, 'refresh does not lose focus')
    assert.doesNotMatch(ui.container.textContent, /正在恢复/)
    await ui.summary(next)
    assert.strictEqual(region(ui.container, category), details)
  })
}

for (const multipleSeats of [false, true]) for (const stableHolder of [false, true]) for (const pending of [false, true]) {
  test('same cache reinjection keeps reading without extra RPC: ' + JSON.stringify({multipleSeats, stableHolder, pending}), async t => {
    const ui = await mount(t, {multipleSeats, stableHolder})
    await click(entry(ui.container, 'T'))
    const button = entry(ui.container, 'T'), details = region(ui.container, 'T'), before = ui.calls
    button.focus(); ui.setPending(pending)
    await ui.render()
    assert.equal(ui.calls, before, 'callback/handle reinjection must not restart a healthy full read')
    assert.strictEqual(region(ui.container, 'T'), details)
    assert.strictEqual(ui.window.document.activeElement, button)
    assert.doesNotMatch(ui.container.textContent, /正在恢复/)
  })
}

test('a different cache with the same Session revalidates and clears old reading', async t => {
  const ui = await mount(t, {multipleSeats: true})
  await click(entry(ui.container, 'T'))
  const before = ui.calls
  ui.setPending()
  await ui.replaceCache()
  assert.equal(ui.calls, before + 1, 'new registry is a genuine read boundary')
  assert.equal(ui.container.querySelector('[aria-label="T 票窗口详情"]'), null)
  assert.doesNotMatch(ui.container.textContent, /T 2[/]8|宿主在跑数：70/)
  await ui.finishRequests()
  assert.equal(entry(ui.container, 'T').getAttribute('aria-expanded'), 'false')
})

test('last real unmount aborts in-flight work and a remount is cold', async t => {
  const ui = await mount(t, {multipleSeats: true})
  ui.setPending()
  await ui.beginFull()
  assert.equal(ui.requests.length, 1)
  const request = ui.requests[0], before = ui.calls
  await ui.render(false)
  assert.equal(request.signal.aborted, true, 'last release cancels immediately')
  await ui.render()
  assert.equal(ui.calls, before + 1, 'remount cannot use the previous current snapshot')
  assert.doesNotMatch(ui.container.textContent, /T 2[/]8/)
  await ui.finishRequests(); await ui.settle()
  assert.equal(entry(ui.container, 'T').getAttribute('aria-expanded'), 'false')
})

test('a prewarmed replacement registry cannot inherit an open reading', async t => {
  const ui = await mount(t)
  await click(entry(ui.container, 'T'))
  const before = ui.calls
  await ui.replaceCache(true)
  assert.equal(ui.calls, before + 1, 'new registry has independently read its current value')
  assert.equal(entry(ui.container, 'T').getAttribute('aria-expanded'), 'false', 'equal ready identity is not equal observer authority')
})
