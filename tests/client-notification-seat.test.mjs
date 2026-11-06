import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import * as React from 'react'
import { Window } from 'happy-dom'
import { buildClient } from '../scripts/build-client.mjs'
import { PRIMITIVES_ID, clientPrimitives } from './fixtures/client-primitives.mjs'

// Accepted seams: built Client apply/native registration and real React rendering.
// No candidate installation, cold-Session scan or real OS/audio effects.
const built = await buildClient()
let registration
vm.runInThisContext('(function(window){' + built.code + '\n})')({ __ModuleLoader__: { load: value => { registration = value } } })
const client = registration.factory(name => {
  if (name === 'react') return React
  if (name === PRIMITIVES_ID) return clientPrimitives(React)
  throw new Error('Unexpected runtime dependency ' + name)
})
async function activation(t, readSession, plugin = client) {
  const entries = [], cleanups = []
  const remote = { readPolicy: async () => ({ ok: true, value: { revision: 1, extensionEnabled: false, defaults: {}, workspaceOverrides: {} } }), readSession }
  const ctx = { remote: { $mount: async () => {}, mattpocockControls: remote },
    inject: (_dependencies, callback) => callback(ctx),
    effect: callback => { const cleanup = callback(); cleanups.push(cleanup); return cleanup },
    slots: { inject: (_name, callback) => callback(), register: (options, component) => { entries.push({ options, component }); return () => {} } },
    sidebarRightTabs: { register: () => () => {} },
    sidebarRight: { mounted: { getSnapshot: () => 'front-session' }, openTab: () => assert.fail('reading must not navigate') } }
  t.after(() => { for (const cleanup of cleanups.reverse()) if (typeof cleanup === 'function') cleanup() })
  await plugin.apply(ctx)
  return entries
}
test('native mounted Sessions get a separate notification seat sharing the existing full observer', async t => {
  const reads = []
  const entries = await activation(t, async id => { reads.push(id); throw new Error('controlled unavailable snapshot') })
  const header = entries.filter(row => row.options.name === 'conversation.session.header.utilities')
  assert.equal(header.length, 2, 'notification observation has its own native lifetime, independent of display flags')
  const seat = header.find(row => row.component === client.DecisionNotificationSeat)
  assert.ok(seat, 'native notification seat uses the public built component')
  const input = entries.find(row => row.component === client.InputSummary)
  const one = seat.options.inject('front-session').observer, two = input.options.inject('front-session').observe()
  assert.deepEqual(reads, [], 'native lazy handles do not poll until retained')
  const releaseOne = one.retain(), releaseTwo = two.retain()
  try {
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(reads, ['front-session'], 'native faces share one full snapshot polling channel')
    assert.equal(one.getSnapshot(), two.getSnapshot(), 'shared current observation, not facade object identity')
  } finally { releaseTwo(); releaseOne() }
  assert.notEqual(one, seat.options.inject('background-session').observer, 'strict per-Session identity')
  assert.deepEqual(reads, ['front-session'], 'background handle lookup does not scan cold Sessions')
  assert.ok(entries.every(row => !row.options.name.startsWith('conversation.input.') || row.options.name === 'conversation.input.dock'), 'no composer/queue/steer interception')
})

const author = { kind: 'user', principalId: 'operator', sessionId: null }
function snapshot() {
  const instance = { instrumentInstanceId: 'notice-instance', ownerSessionId: 'notice-owner', controlWorkspaceId: 'notice-workspace' }
  return { sessionId: 'front-session', instance, caller: author, policyGrants: { schemaVersion: 1, revision: 0, grants: [] },
    policy: { controlWorkspaceId: instance.controlWorkspaceId, extensionEnabled: true, workspaceEnabled: true, features: {},
      windows: { ticketWindowSize: null, runningSubagentLimit: null }, display: { header: false, inputSummary: false, rightPanel: false, sessionList: false, timeline: false } },
    records: { instance, scope: { kind: 'coordinator' }, revision: 0, businessRevision: 0, viewerRevision: 0, workflows: [], tickets: [], decisions: [], decisionViews: [], changes: [],
      summary: { countingScope: 'instance', pendingDecisionCount: 0, pendingUserDecisionCount: 0, awaitingImplementationCount: 0 } },
    windows: null, nativeExecutions: [], resources: [], capabilities: [], health: [] }
}
function put(view, id, patch = {}) {
  const next = structuredClone(view), records = next.records, old = records.decisions.find(row => row.decisionId === id)
  const value = { question: 'Question ' + id, status: 'open', pending: true, addressee: { kind: 'user' }, ...old?.value, ...patch }
  const revision = ++records.revision; records.businessRevision++
  const history = [...old?.history ?? [], { revision, value, author, recordedAt: revision, references: [] }]
  records.decisions = [...records.decisions.filter(row => row.decisionId !== id), { workflowId: 'workflow', decisionId: id, value, revision, history, creator: author }]
  records.changes.push({ revision, command: { action: 'put-decision', workflowId: 'workflow', decisionId: id, value } })
  records.summary.pendingUserDecisionCount = records.decisions.filter(row => row.value.pending === true).length
  return next
}
test('notification opens persistent native-dock reading even with every display flag off, without replacing composer focus', async t => {
  const window = new Window({ url: 'http://localhost/' })
  const globals = { window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement, Node: window.Node, Event: window.Event, MouseEvent: window.MouseEvent, IS_REACT_ACT_ENVIRONMENT: true }
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  const warnings = [], originalError = console.error
  console.error = (...args) => warnings.push(args.map(String).join(' '))
  let realRegistration
  window.__ModuleLoader__ = { load: value => { realRegistration = value } }
  vm.runInThisContext('(function(window){' + built.code + '\n})')(window)
  const client = realRegistration.factory(name => { if (name === 'react') return React; if (name === PRIMITIVES_ID) return clientPrimitives(React); throw new Error(name) })
  let root, current = snapshot()
  t.after(async () => {
    try { if (root) await React.act(async () => root.unmount()); await window.happyDOM.close() } finally {
      console.error = originalError
      for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] }
    }
    assert.deepEqual(warnings, [], 'real React integration must not warn')
  })
  const entries = await activation(t, async id => { assert.equal(id, current.sessionId); return { ok: true, value: structuredClone(current) } }, client)
  const seat = entries.find(row => row.component === client.DecisionNotificationSeat), reader = entries.find(row => row.component === client.DecisionNotificationReader)
  assert.ok(seat && reader, 'both contributions use native declared seats')
  const seatProps = { sessionId: current.sessionId, ...seat.options.inject(current.sessionId) }
  const readerProps = { sessionId: current.sessionId, ...reader.options.inject(current.sessionId) }
  const { createRoot } = await import('react-dom/client')
  const container = window.document.createElement('div'); window.document.body.append(container); root = createRoot(container)
  await React.act(async () => { root.render(React.createElement('div', null, React.createElement(seat.component, seatProps), React.createElement(reader.component, readerProps), React.createElement('textarea', { 'aria-label': 'native composer stand-in' }))); await new Promise(resolve => setImmediate(resolve)) })
  const refresh = async next => { current = next; await React.act(async () => { await seatProps.observer.refresh(); await new Promise(resolve => setImmediate(resolve)) }) }
  const click = async text => { const node = [...container.querySelectorAll('button')].find(row => row.textContent === text); assert.ok(node, 'missing button ' + text); await React.act(async () => node.click()) }
  const region = () => container.querySelector('[aria-label="通知裁决阅读"]')
  const composer = container.querySelector('textarea'); composer.focus(); composer.value = 'native answer draft'
  await refresh(put(current, 'A')); await click('打开裁决详情')
  assert.ok(region()); assert.match(region().textContent, /Question A/)
  assert.equal(window.document.activeElement, composer); assert.equal(composer.value, 'native answer draft')
  await click('关闭提醒'); assert.ok(region(), 'transient dismissal never closes deliberate reading')
  await refresh(put(current, 'B')); assert.match(region().textContent, /Question A/); assert(!region().textContent.includes('Question B'))
  await refresh(put(current, 'A', { pending: false, status: 'resolved', result: 'confirmed A' }))
  assert.ok(region()); assert.match(region().textContent, /confirmed A|已解决/)
  assert.equal(container.querySelector('textarea'), composer); assert.equal(window.document.activeElement, composer)
  const revoked = structuredClone(current); revoked.policyGrants.revision++; await refresh(revoked)
  assert.equal(region(), null, 'authorization change synchronously fences old content')
  const restored = structuredClone(current); restored.policyGrants.revision--; await refresh(restored)
  assert.equal(region(), null, 'recovery does not resurrect a discarded old selection')
})
