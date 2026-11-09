import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import vm from 'node:vm'
import * as React from 'react'
import { Window } from 'happy-dom'
import { buildClient } from '../../scripts/build-client.mjs'
import { PRIMITIVES_ID, clientPrimitives } from './client-primitives.mjs'

// Explicit native-host precondition: never silently substitute a fake SlotCore or skip.
// The RC1 shell seeds ui-slots instead of installing a standalone package. Import the
// ENTIRE ORIGINAL shell through its normal loader.create port. A fixture-only sentinel
// stops boot before any runtime/plugin dispatch. No source slicing/replacement is used.
export const hostRoot = process.env.DSH_RECOVERY_HOST_ROOT ?? process.env.DSH_CONTROLS_HOST_ROOT
if (!hostRoot) throw new Error('Set DSH_RECOVERY_HOST_ROOT to an isolated native DSH host (RC1 supported); no native slot fallback')
const metadata = JSON.parse(await readFile(join(hostRoot, 'package.json'), 'utf8'))
assert.match(metadata.version, /^0[.]2[.]/, 'explicit supported native fixture version')
export const window = new Window({ url: 'http://recovery-fixture.test/' })
window.document.write('<!doctype html><html><head></head><body><div id="root"></div></body></html>')
const previous = new Map()
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'Element', 'Node', 'Event', 'MouseEvent', 'MutationObserver', 'ResizeObserver', 'CSSStyleSheet', 'CustomEvent', 'IS_REACT_ACT_ENVIRONMENT']) {
  previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === 'window' ? window : key === 'IS_REACT_ACT_ENVIRONMENT' ? true : window[key] })
}
const assets = join(hostRoot, 'node_modules/@deepseek-ai/dsh-web-frontend/dist/assets')
const shellName = (await readdir(assets)).find(name => /^index-.*[.]js$/.test(name))
assert.ok(shellName, 'isolated host supplies its original frontend shell')
let baseline
const stop = new Error('fixture stops original shell after loader baseline handoff')
const originalError = console.error
let stopped = false
console.error = (...args) => { if (args[0] === stop) stopped = true; else originalError(...args) }
globalThis.__ModuleLoader__ = { create(options) { baseline = options.staticModules; throw stop } }
try { await import(pathToFileURL(join(assets, shellName))); await new Promise(resolve => setImmediate(resolve)) }
finally { console.error = originalError; delete globalThis.__ModuleLoader__ }
assert.equal(stopped, true, 'unmodified shell stopped before runtime boot')
assert.equal(typeof baseline?.['@deepseek-ai/dsh-client-ui-slots']?.SlotCore, 'function')
const requireHost = createRequire(pathToFileURL(join(hostRoot, 'package.json')))
const cordis = await import(pathToFileURL(requireHost.resolve('@deepseek-ai/cordis')))
let rendererRegistration
vm.runInThisContext('(function(window){' + await readFile(join(hostRoot, 'node_modules/@deepseek-ai/dsh-client-ui-renderer/lib/client.js'), 'utf8') + '\n})')({ __ModuleLoader__: { load: value => { rendererRegistration = value } } })
const renderer = rendererRegistration.factory(name => {
  if (name === 'react') return React
  if (name === 'react/jsx-runtime') return createRequire(import.meta.url)(name)
  if (name === 'react-dom' || name === 'react-dom/client') return createRequire(import.meta.url)(name)
  if (name === '@deepseek-ai/cordis') return cordis
  if (name === '@deepseek-ai/dsh-client-ui-slots') return baseline[name]
  throw new Error('Unexpected native renderer dependency ' + name)
})
const code = process.env.DSH_CONTROLS_CLIENT_BUNDLE ? await readFile(process.env.DSH_CONTROLS_CLIENT_BUNDLE, 'utf8') : (await buildClient()).code
let registration
vm.runInThisContext('(function(window){' + code + '\n})')( { __ModuleLoader__: { load: value => { registration = value } } })
export const client = registration.factory(name => {
  if (name === 'react') return React
  if (name === PRIMITIVES_ID) return clientPrimitives(React)
  throw new Error('Unexpected client dependency ' + name)
})
export { React }
export const settle = () => new Promise(resolve => setTimeout(resolve, 12))
export const ok = value => ({ ok: true, value })
export function snapshot(sessionId = 'native-session') {
  const instance = { instrumentInstanceId: 'native-instance', ownerSessionId: 'native-owner', controlWorkspaceId: 'native-workspace' }
  const author = { kind: 'user', principalId: 'native-operator', sessionId: null }
  const value = { question: 'Native fixture decision', status: 'open', pending: true, addressee: { kind: 'user' } }
  return { sessionId, instance, caller: author, policyGrants: { schemaVersion: 1, revision: 0, grants: [] },
    policy: { configurationRevision: 1, controlWorkspaceId: instance.controlWorkspaceId, workspaceVerified: true, extensionEnabled: true, workspaceEnabled: true, features: {}, windows: { ticketWindowSize: null, runningSubagentLimit: null },
      display: { header: true, inputSummary: true, rightPanel: true, sessionList: false, timeline: true } },
    records: { instance, scope: { kind: 'coordinator' }, revision: 1, businessRevision: 1, viewerRevision: 0, workflows: [], tickets: [], decisions: [{ workflowId: 'fixture', decisionId: 'decision', value, revision: 1, creator: author, history: [] }], decisionViews: [], changes: [],
      summary: { countingScope: 'instance', totalTickets: 0, statusCounts: [], pendingDecisionCount: 1, pendingUserDecisionCount: 1, pendingForPrincipalCount: 1, awaitingImplementationCount: 0 } }, windows: null, nativeExecutions: [], resources: [], capabilities: [], health: [] }
}
export function summary(view) {
  return { sessionId: view.sessionId, instance: view.instance, caller: view.caller, policy: { configurationRevision: view.policy.configurationRevision, controlWorkspaceId: view.policy.controlWorkspaceId, workspaceVerified: view.policy.workspaceVerified, extensionEnabled: view.policy.extensionEnabled, workspaceEnabled: view.policy.workspaceEnabled, display: view.policy.display },
    records: { businessRevision: view.records.businessRevision, viewerRevision: view.records.viewerRevision, summary: { countingScope: view.records.summary.countingScope, pendingUserDecisionCount: view.records.summary.pendingUserDecisionCount } }, health: [] }
}
export async function activation(initial = snapshot()) {
  const nativeContext = new cordis.Context()
  new renderer.SlotRegistry(nativeContext)
  nativeContext.slots.register({ name: 'root', children: {
    'plugins.bundle.config': { kind: 'keyed', scope: 'root' }, 'plugins.row.config': { kind: 'keyed', scope: 'root' },
    'conversation.session.header.utilities': { kind: 'list', scope: 'session' }, 'conversation.input.dock': { kind: 'list', scope: 'session' },
    'sidebar.right.pane.tab': { kind: 'keyed', scope: 'session' }, 'sidebar.session.row.leading': { kind: 'list', scope: 'root' }, 'tool.call.toolview': { kind: 'keyed', scope: 'session' }
  } }, () => null)
  const fullCalls = [], summaryCalls = [], pending = [], pendingSummaries = [], cleanups = []
  let view = initial, mode = 'success', summaryMode = 'success', summaryFailure = false
  const remote = {
    readPolicy: async () => ok({ revision: 1, extensionEnabled: false, defaults: {}, workspaceOverrides: {} }),
    readSession: (id, signal) => {
      fullCalls.push({ id, signal })
      if (mode === 'pending') return new Promise(resolve => pending.push({ id, signal, resolve }))
      if (mode === 'error') return Promise.reject(new Error('controlled native full failure'))
      return Promise.resolve(ok(structuredClone(view)))
    },
    readSummaries: async (request, signal) => {
      summaryCalls.push({ request, signal })
      if (summaryFailure) throw new Error('controlled native summary failure')
      if (summaryMode === 'pending') return new Promise(resolve => pendingSummaries.push({ request, signal, resolve }))
      return ok({ rows: request.sessions.map(row => ({ sessionId: row.sessionId, status: 'current', version: 'b'.repeat(64), summary: summary(view) })) })
    }
  }
  // Only transport/lifecycle are controlled; slot declaration/injection/registration
  // go through the actual native SlotRegistry and its original SlotCore.
  const ctx = { slots: nativeContext.slots, remote: { $mount: async () => {}, mattpocockControls: remote },
    inject: (_deps, callback) => callback(ctx),
    effect: callback => { const cleanup = callback(); cleanups.push(cleanup); return cleanup },
    sidebarRightTabs: { register: () => () => {} },
    sidebarRight: { mounted: { getSnapshot: () => view.sessionId }, openTab: () => assert.fail('read fixture must not navigate') }
  }
  await client.apply(ctx)
  const entries = [...nativeContext.slots.entriesOfSlot('conversation.input.dock'), ...nativeContext.slots.entriesOfSlot('conversation.session.header.utilities')]
  const components = [client.InputSummary, client.DecisionNotificationReader, client.DecisionNotificationSeat, client.HeaderEntry]
  const seats = components.map(component => { const entry = entries.find(row => row.component === component); assert.ok(entry, 'actual apply registered ' + component.name); return entry })
  return { seats, fullCalls, summaryCalls, pending, pendingSummaries, set summaryMode(value) { summaryMode = value }, get view() { return view }, set view(value) { view = value }, set mode(value) { mode = value }, set summaryFailure(value) { summaryFailure = value },
    async dispose() { for (const cleanup of cleanups.reverse()) if (typeof cleanup === 'function') cleanup(); await nativeContext.fiber.dispose() } }
}
export async function mount(t, options = {}) {
  const activationList = [], initial = await activation(options.view); activationList.push(initial)
  const container = window.document.createElement('div'); window.document.body.append(container)
  const { createRoot } = await import('react-dom/client')
  const root = createRoot(container)
  let active = initial, sessionId = initial.view.sessionId, mounted = true, latestProps
  async function render(next = active, id = sessionId, selected = options.components ?? [0, 1, 2, 3]) {
    active = next; sessionId = id
    latestProps = active.seats.map(entry => ({ sessionId, ...entry.inject(sessionId) }))
    await React.act(async () => { root.render(React.createElement(React.Fragment, null, ...selected.map(index => React.createElement(active.seats[index].component, { ...latestProps[index], key: index })), React.createElement('textarea', { 'aria-label': 'composer fixture' }))); await settle() })
  }
  t.after(async () => { if (mounted) await React.act(async () => root.unmount()); for (const item of activationList) await item.dispose(); container.remove() })
  await render()
  await React.act(settle)
  return { initial, container, root, render, props: () => latestProps,
    async switchRegistry(view = snapshot()) { const next = await activation(view); activationList.push(next); await render(next); return next },
    async unmount() { await React.act(async () => root.unmount()); mounted = false },
    async refresh() { await React.act(async () => { await latestProps[1].observer.refresh(); await settle() }) },
    async refreshSummary() { await React.act(async () => { latestProps[0].summary.refresh(); await settle() }) }
  }
}
export async function closeFixture() { await window.happyDOM.close(); for (const [key, value] of previous) { if (value) Object.defineProperty(globalThis, key, value); else delete globalThis[key] } }
