import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import * as React from 'react'
import { Window } from 'happy-dom'
import { buildClient } from '../scripts/build-client.mjs'
import { PRIMITIVES_ID, clientPrimitives } from './fixtures/client-primitives.mjs'
import { mountedFixture, caller, operator, policy, signal, core } from './fixtures/runtime-host.mjs'

// Agreed seam: closed client bundle, Remote decode and actual React reading; no live Profile.
// No formatter-only proof, private state probes, live Profile or graphical-browser claims.
const built = process.env.DSH_CONTROLS_CLIENT_BUNDLE ? { code: await (await import('node:fs/promises')).readFile(process.env.DSH_CONTROLS_CLIENT_BUNDLE, 'utf8') } : await buildClient()
let registration
vm.runInThisContext('(function(window){' + built.code + '\n})')({ __ModuleLoader__: { load: value => { registration = value } } })
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
async function mount(t, initial = snapshot()) {
  const window = new Window({ url: 'http://localhost/', settings: { disableCSSFileLoading: true, disableJavaScriptFileLoading: true } })
  const globals = { window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement,
    HTMLInputElement: window.HTMLInputElement, Node: window.Node, Event: window.Event, MouseEvent: window.MouseEvent, IS_REACT_ACT_ENVIRONMENT: true }
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  const warnings = [], originalError = console.error, originalWarn = console.warn
  console.error = console.warn = (...args) => warnings.push(args.map(String).join(' '))
  let current = initial, fail = false
  const observers = []
  const observe = sessionId => {
    const observer = new client.SessionObserver(sessionId, async () => {
      if (fail) throw new Error('controlled unreadable snapshot')
      return { ok: true, value: structuredClone(current) }
    }, 0)
    observers.push(observer)
    return observer
  }
  let observer = observe(initial.sessionId)
  const sideEffects = []
  const remote = new Proxy({}, { get: (_target, method) => (...args) => { sideEffects.push({ method, args }); assert.fail('inline viewing must not invoke Remote writes/history/model wake: ' + String(method)) } })
  const openDetails = () => { sideEffects.push('openDetails'); assert.fail('inline viewing must not open the sidebar') }
  const { createRoot } = await import('react-dom/client')
  const container = window.document.createElement('div'); window.document.body.append(container)
  const root = createRoot(container)
  const render = async (sessionId = current.sessionId) => React.act(async () => root.render(React.createElement(client.ObservedInputSummary, { sessionId, observer, openDetails, remote })))
  t.after(async () => {
    try { await React.act(async () => root.unmount()); for (const row of observers) row.dispose(); await window.happyDOM.close() }
    finally {
      console.error = originalError; console.warn = originalWarn
      for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] }
    }
    assert.deepEqual(warnings, [], 'real React must render without warnings/errors')
    assert.deepEqual(sideEffects, [], 'read-only inspection has no writes, history requests, model wake or automatic sidebar effects')
  })
  await render()
  return { container, window, root, render,
    refresh: async next => { current = next; fail = false; await React.act(async () => observer.refresh()) },
    unreadable: async () => { fail = true; await React.act(async () => observer.refresh()) },
    switchSession: async next => { current = next; observer = observe(next.sessionId); await render() },
  }
}

const structured = { answer: 'Wait for maintainer-provided runtime', selectedOptionKey: 'read-only',
  source: { kind: 'user-message', sessionId: 'inline-session', messageId: 'message-42', position: 'paragraph 2', text: 'Owner confirmed waiting' },
  included: ['Isolated fixture work', 'Read-only input'], excluded: ['Install SDK', 'Restart production'] }
function answered(result) {
  const view = snapshot()
  view.records.decisions = [{ workflowId: 'flow', decisionId: 'D', revision: 7,
    value: { question: 'Choose runtime input', status: 'answered', pending: true, awaitingImplementation: true,
      addressee: { kind: 'user', principalId: author.principalId }, result },
    history: [{ revision: 7, recordedAt: 1234, author, references: ['task:source'], value: { result } }], view: { read: true, hidden: false } }]
  view.records.summary.pendingUserDecisionCount = 1
  return view
}
test('structured results survive Remote decode and render answer, source and scope in real React without writes', async t => {
  const host = await mountedFixture(t, { futureNativeActivityKnown: true })
  await host.runtime.savePolicy(operator, policy(undefined, { display: { inputSummary: true } }), 0, signal())
  await host.runtime.applyInstrument(caller('root'), 'root', { operationId: 'flow', expectedRevision: 0, workflowId: 'flow',
    action: 'put-workflow', value: { title: 'Scoped runtime', axes: [] } }, signal())
  const written = await host.execute('mattpocock_record', { request: { action: 'apply', command: {
    operationId: 'structured-answer', expectedRevision: 1, workflowId: 'flow', decisionId: 'D', action: 'put-decision',
    references: ['native:message-42'], value: { question: 'Choose runtime input', status: 'partial reply', pending: true,
      awaitingImplementation: true, addressee: { kind: 'user' }, result: structured } } } })
  assert.notEqual(written.isError, true, written.error?.message)
  const endpoint = core.REMOTE_CONTRIBUTION.descriptors.find(row => row.method === 'readSession')
  const initial = endpoint.result.create().parse(await host.runtime.readSession(operator, 'root', signal()))
  assert.deepEqual(initial.records.decisions[0].value.result, structured, 'object comes from mounted persisted write, not UI fixture injection')
  assert.deepEqual(client.decodeSession(initial, initial.sessionId).records.decisions[0].value.result, structured)
  const f = await mount(t, initial)
  const button = f.container.querySelector('[aria-label="查看待你裁决事项"]')
  assert(button, JSON.stringify({ text: f.container.textContent, display: initial.policy.display, summary: initial.records.summary }))
  await React.act(async () => button.click())
  const text = f.container.textContent
  for (const literal of ['Wait for maintainer-provided runtime', 'message-42', 'Owner confirmed waiting', 'paragraph 2',
    'Isolated fixture work', 'Read-only input', 'Install SDK', 'Restart production']) assert.ok(text.includes(literal), 'missing result field: ' + literal)
  assert.doesNotMatch(text, /\[object Object\]/)
  const legacy = structuredClone(initial)
  legacy.records.decisions[0].value.result = 'Old direct user text'
  await f.refresh(legacy)
  assert.ok(f.container.textContent.includes('Old direct user text'))
  assert.equal(client.decisionAnswerCommand(legacy.records, legacy.records.decisions[0], 'New direct user text', 'answered', false, true).value.result, 'New direct user text')
})
