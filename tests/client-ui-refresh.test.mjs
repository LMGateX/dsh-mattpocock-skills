import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import * as React from 'react'
import { Window } from 'happy-dom'
import { buildClient } from '../scripts/build-client.mjs'
import { PRIMITIVES_ID, clientPrimitives } from './fixtures/client-primitives.mjs'

// Frozen §6 seam: actual InputSummary → InputSnapshot → ObservedInputSummary and public input facade.
// No formatter-only proof, private state probes, live Profile or graphical-browser claims.
const built = await buildClient()
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
async function mount(t, initial = snapshot(), actions, component = 'InputSummary', initialFailure = null) {
  const window = new Window({ url: 'http://localhost/', settings: { disableCSSFileLoading: true, disableJavaScriptFileLoading: true } })
  const globals = { window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement,
    HTMLInputElement: window.HTMLInputElement, Node: window.Node, Event: window.Event, MouseEvent: window.MouseEvent, IS_REACT_ACT_ENVIRONMENT: true }
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  const warnings = [], originalError = console.error, originalWarn = console.warn
  console.error = console.warn = (...args) => warnings.push(args.map(String).join(' '))
  let current = initial, fail = initialFailure === 'full', failSummary = initialFailure === 'summary', version = 0
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
  const scheduler = new client.SummaryScheduler(async request => {
    if (failSummary === 'deadline') return new Promise(() => {})
    if (failSummary) throw new Error('controlled summary transport failure')
    return { ok: true, value: { rows: request.sessions.map(({sessionId}) => ({ sessionId, status: 'current', version: (++version).toString(16).padStart(64, '0'), summary: {
      sessionId, instance: current.instance, caller: current.caller,
      policy: { configurationRevision: version, controlWorkspaceId: current.instance.controlWorkspaceId, workspaceVerified: true,
        extensionEnabled: true, workspaceEnabled: true, display: current.policy.display },
      records: { businessRevision: 7, viewerRevision: 0, summary: { countingScope: 'instance', pendingUserDecisionCount: current.records.summary.pendingUserDecisionCount } }, health: [],
    } })) } }
  }, 600000)
  const summary = scheduler.observe(initial.sessionId)
  const settle = async () => React.act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
  const sideEffects = []
  const remote = new Proxy({}, { get: (_target, method) => (...args) => { if (method === 'readSupervision') return Promise.resolve({ok: true, value: null}); sideEffects.push({ method, args }); assert.fail('inline viewing must not invoke Remote writes/history/model wake: ' + String(method)) } })
  const openDetails = () => { sideEffects.push('openDetails'); assert.fail('inline viewing must not open the sidebar') }
  const { createRoot } = await import('react-dom/client')
  const container = window.document.createElement('div'); window.document.body.append(container)
  const root = createRoot(container)
  const render = async (sessionId = current.sessionId) => React.act(async () => root.render(React.createElement(client[component], { sessionId, summary, observer, observe: () => observer, openDetails, remote, inputActions: actions, useTabInfo: () => ({tab: {visible: true}}) })))
  t.after(async () => {
    try { await React.act(async () => root.unmount()); for (const row of observers) row.dispose(); scheduler.dispose(); await window.happyDOM.close() }
    finally {
      console.error = originalError; console.warn = originalWarn
      for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] }
    }
    assert.deepEqual(warnings, [], 'real React must render without warnings/errors')
    assert.deepEqual(sideEffects, [], 'read-only inspection has no writes, history requests, model wake or automatic sidebar effects')
  })
  await render(); await settle()
  return { container, window, root, render,
    refresh: async next => { current = next; fail = false; await React.act(async () => observer.refresh()) },
    summaryDeadline: async advance => { failSummary = 'deadline'; await React.act(async () => { summary.refresh(); advance(0); await Promise.resolve(); advance(10000) }) },
    summaryFailure: async () => { failSummary = true; await React.act(async () => summary.refresh()); await settle() },
    summaryRefresh: async next => { current = next; failSummary = false; await React.act(async () => summary.refresh()); await settle() },
    unreadable: async () => { fail = true; await React.act(async () => observer.refresh()) },
    switchSession: async next => { current = next; observer = observe(next.sessionId); await render() },
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
function visibleText(container) {
  const clone = container.cloneNode(true)
  for (const details of clone.querySelectorAll('details:not([open])')) {
    const summary = details.querySelector('summary')?.cloneNode(true)
    details.replaceChildren(...(summary ? [summary] : []))
  }
  return clone.textContent
}


function decisionView(recommendation = 'B') {
  const view = snapshot()
  view.records.decisions = [{ workflowId: 'work', decisionId: 'choice-1', revision: 7, history: [],
    value: { question: '选择发布方向', status: 'open', pending: true, addressee: {kind: 'user'},
      options: [{key: 'A', label: '保持现状\n完整的第二行'}, {key: 'B', label: '隔离发布'}, {key: 'C', label: '稍后决定'}], recommendation } }]
  return view
}
test('decision options uniquely recommend first and insert exactly two plain-text lines without submitting', async t => {
  const calls = [], span = { start: 4, end: 4, draftRev: 8 }
  const actions = { captureInsertion: () => span, insertText: (text, captured) => { calls.push({text, captured}); return true },
    setDraft: () => assert.fail('must not replace the whole draft'), submit: () => assert.fail('must not submit') }
  const ui = await mount(t, decisionView(), actions)
  await click(entry(ui.container, 'pending'))
  const options = [...region(ui.container, 'pending').querySelectorAll('[data-decision-option]')]
  assert.deepEqual(options.map(node => node.dataset.decisionOption), ['B', 'A', 'C'])
  assert.match(options[0].textContent, /推荐/)
  assert.match(options[1].textContent, /保持现状\n完整的第二行/)
  await click(named(ui.container, '插入选项：隔离发布'))
  assert.deepEqual(calls, [{text: '关于待裁决项: ”选择发布方向”\n我认可 “隔离发布”', captured: span}])
  await click(named(ui.container, '我有自己的看法……'))
  assert.equal(calls[1].text, '关于待裁决项: ”选择发布方向”\n我认为：')
  assert.match(ui.container.textContent, /仅插入|尚未发送/)
})

for (const seat of ['InputSummary', 'Details']) test('multiline dynamic text stays exactly two template lines without changing reading text: ' + seat, async t => {
  const view = decisionView()
  const question = '发布方向\r\n保留原文\r下一段\u2028段落\u2029末段\u0085结尾'
  view.records.decisions[0].value.question = question
  const calls = []
  const span = {start: 0, end: 0, draftRev: 1}
  const actions = {captureInsertion: () => span, insertText: (text, captured) => {calls.push({text, captured}); return true},
    setDraft: () => assert.fail('must not replace draft'), submit: () => assert.fail('must not send')}
  const ui = await mount(t, view, actions, seat)
  if (seat === 'InputSummary') await click(entry(ui.container, 'pending'))
  const option = ui.container.querySelector('[data-decision-option="A"]')
  assert.match(option.textContent, /保持现状\n完整的第二行/)
  assert(ui.container.textContent.includes(question), 'reading keeps the original authored question')
  await click(option.querySelector('button'))
  assert.deepEqual(calls[0], {text: '关于待裁决项: ”发布方向 保留原文 下一段 段落 末段 结尾”\n我认可 “保持现状 完整的第二行”', captured: span})
  await click(named(ui.container, '我有自己的看法……'))
  assert.equal(calls[1].text, '关于待裁决项: ”发布方向 保留原文 下一段 段落 末段 结尾”\n我认为：')
  for (const {text} of calls) { assert.equal(text.split('\n').length, 2); assert.doesNotMatch(text, /[\r\u0085\u2028\u2029]/) }
})

test('native session details reading connects the same safe input template actions', async t => {
  const calls = []
  const actions = {captureInsertion: () => ({start: 0, end: 0, draftRev: 1}), insertText: text => {calls.push(text); return true}}
  const ui = await mount(t, decisionView(), actions, 'Details')
  await click(named(ui.container, '插入选项：隔离发布'))
  assert.deepEqual(calls, ['关于待裁决项: ”选择发布方向”\n我认可 “隔离发布”'])
})

test('nonempty selections are not replaced and insertText false reports failure without retries', async t => {
  let span = {start: 2, end: 7, draftRev: 3}, calls = 0
  const actions = {captureInsertion: () => span, insertText: () => {calls++; return false}, setDraft: () => assert.fail('no full draft overwrite')}
  const ui = await mount(t, decisionView(), actions)
  await click(entry(ui.container, 'pending'))
  await click(named(ui.container, '插入选项：隔离发布'))
  assert.equal(calls, 0)
  assert.match(ui.container.textContent, /取消.*非空选区/)
  span = {start: 7, end: 7, draftRev: 4}
  await click(named(ui.container, '插入选项：隔离发布'))
  assert.equal(calls, 1)
  assert.match(ui.container.textContent, /未插入：草稿已变更或输入框已锁定/)
})

test('old hosts retain complete decision reading but disable templates without the public capability', async t => {
  const ui = await mount(t, decisionView(), {setDraft: () => assert.fail('old host must not use destructive fallback')})
  await click(entry(ui.container, 'pending'))
  assert.equal(named(ui.container, '插入选项：隔离发布').disabled, true)
  assert.equal(named(ui.container, '我有自己的看法……').disabled, true)
  assert.match(ui.container.textContent, /宿主缺少公开输入 API/)
})

for (const recommendation of ['建议选择 B，因为更安全', 'duplicate', 'A']) test('ambiguous/free-text recommendation preserves original option order: ' + recommendation, async t => {
  const view = decisionView(recommendation)
  view.records.decisions[0].value.options = [{key: 'A', label: 'duplicate'}, {key: 'B', label: recommendation === 'A' ? 'A' : 'duplicate'}, {key: 'C', label: 'last'}]
  const ui = await mount(t, view)
  await click(entry(ui.container, 'pending'))
  assert.deepEqual([...region(ui.container, 'pending').querySelectorAll('[data-decision-option]')].map(node => node.dataset.decisionOption), ['A', 'B', 'C'])
  assert.match(ui.container.textContent, new RegExp('建议：' + recommendation))
  assert.doesNotMatch([...ui.container.querySelectorAll('[data-decision-option]')].map(node => node.textContent).join(''), /推荐 ·/)
})

test('summary deadline leaves only a neutral section through the actual mounted chain', async t => {
  const ui = await mount(t)
  const section = named(ui.container, '协作进度摘要')
  // Preserve cancellation of pre-existing real scheduler timers while advancing only new deadlines.
  const realSetTimeout = globalThis.setTimeout, realClearTimeout = globalThis.clearTimeout, realNow = Date.now
  let now = realNow()
  Date.now = () => now
  const timers = new Map()
  globalThis.setTimeout = (fn, ms) => { const token = {}; timers.set(token, {fn, due: now + ms}); return token }
  globalThis.clearTimeout = token => { if (!timers.delete(token)) realClearTimeout(token) }
  try { await ui.summaryDeadline(ms => { now += ms; for (const [token, timer] of [...timers]) if (timer.due <= now) { timers.delete(token); timer.fn() } }) }
  finally { globalThis.setTimeout = realSetTimeout; globalThis.clearTimeout = realClearTimeout; Date.now = realNow }
  assert.equal(named(ui.container, '协作进度摘要'), section)
  assert.match(section.textContent, /暂不可用|恢复/)
  assert.equal(section.querySelectorAll('button,a').length, 0)
  assert.doesNotMatch(section.textContent, /T 2|S 70|待你裁决 3/)
})

for (const failure of ['full', 'summary']) test('initial ' + failure + ' read failure cannot invent a display shell', async t => {
  const ui = await mount(t, snapshot(), undefined, 'InputSummary', failure)
  assert.equal(ui.container.querySelector('[aria-label="协作进度摘要"]') === null, true)
})

test('actual input chain clears selected body and actions on summary caller identity changes', async t => {
  const ui = await mount(t, decisionView(), {captureInsertion: () => ({start: 0, end: 0, draftRev: 1}), insertText: () => assert.fail('identity changes cannot insert')})
  await click(entry(ui.container, 'pending'))
  assert.match(region(ui.container, 'pending').textContent, /选择发布方向/)
  const next = snapshot(); next.caller.principalId = 'another-user'
  await ui.summaryRefresh(next)
  assert.doesNotMatch(ui.container.textContent, /选择发布方向/)
  assert.equal(ui.container.querySelector('[aria-label="待你裁决详情"]') === null, true)
  await ui.summaryFailure()
  assert.equal(named(ui.container, '协作进度摘要').querySelectorAll('button,a').length, 0)
})

test('T foregrounds the genuine external id and bold label without deriving ids or totals from locators', async t => {
  const view = snapshot()
  view.records.capabilities = {taskReferences: true}; view.records.summary.totalTaskReferences = 1
  view.records.taskReferences = [{ workflowId: 'work', localTicketId: 'local-handle', revision: 1,
    value: { label: 'Ship readable controls', source: {kind: 'external', instance: 'tracker', project: 'UI', taskId: 'UI-42'}, locator: 'https://tracker/99999' }, history: [] }]
  view.windows.tickets = [{ workflowId: 'work', localTicketId: 'local-handle', held: true, generation: 1 }, { workflowId: 'work', localTicketId: 'unresolved', held: true, generation: 2 }]
  view.windows.T.used = 9
  const ui = await mount(t, view)
  await click(entry(ui.container, 'T'))
  const articles = region(ui.container, 'T').querySelectorAll('article')
  assert.equal(articles[0].querySelector('strong').textContent, 'UI-42 · Ship readable controls')
  assert.equal(articles[1].querySelector('strong').textContent, '本地 handle：unresolved')
  assert.match(region(ui.container, 'T').textContent, /实例总占用 T 9/)
  assert.doesNotMatch(articles[0].firstElementChild.textContent, /99999|local-handle/)
})

test('detail title uses the same decision T S navigation and a secondary record-check action', async t => {
  const ui = await mount(t)
  const reminders = named(ui.container, '常驻协作提醒')
  const topButtons = [...reminders.querySelectorAll('button')]
  assert.deepEqual(topButtons.map(node => node.getAttribute('aria-label')), [labels.pending, labels.T, labels.S])
  await click(entry(ui.container, 'T'))
  const navigation = named(ui.container, '协作详情导航')
  assert.deepEqual([...navigation.querySelectorAll('button')].map(node => node.textContent), ['裁决', '✓ T', 'S'])
  await click(named(navigation, '切换到裁决'))
  const decision = region(ui.container, 'pending')
  assert.equal(named(decision, '查看记录核对').parentElement, navigation.parentElement, 'record check shares title row, not a fourth main category')
  await click(named(decision, '查看记录核对'))
  assert.match(region(ui.container, 'awaiting').textContent, /原待落实标记 2/)
  assert.equal(named(ui.container, '切换到裁决').getAttribute('aria-pressed'), 'true')
  await click(named(ui.container, '切换到S'))
  assert(region(ui.container, 'S'))
  await click(named(ui.container, '关闭详情'))
  assert.equal(named(ui.container, '查看 S 在跑子代理').getAttribute('aria-expanded'), 'false')
})

test('actual input chain keeps a neutral section on full and summary transport errors without stale facts or actions', async t => {
  const ui = await mount(t)
  const section = named(ui.container, '协作进度摘要')
  await click(entry(ui.container, 'T'))
  assert.match(ui.container.textContent, /实例总占用 T 2/)
  await ui.unreadable()
  assert.equal(named(ui.container, '协作进度摘要'), section, 'section survives the full observer failure')
  assert.match(section.textContent, /暂不可用|恢复/)
  assert.doesNotMatch(section.textContent, /T 2|S 70|待你裁决 3|实例总占用/)
  assert.equal(section.querySelectorAll('button,a').length, 0)
  await ui.refresh(snapshot())
  assert.match(section.textContent, /T 2/)
  await ui.summaryFailure()
  assert.equal(named(ui.container, '协作进度摘要'), section, 'summary failure must not unmount the actual full chain')
  assert.doesNotMatch(section.textContent, /T 2|S 70|待你裁决 3/)
  assert.equal(section.querySelectorAll('button,a').length, 0)
  await ui.summaryRefresh(snapshot())
  assert.match(section.textContent, /T 2/)
  const disabled = snapshot(); disabled.policy.display.inputSummary = false
  await ui.summaryRefresh(disabled)
  assert.equal(ui.container.querySelector('[aria-label="协作进度摘要"]'), null)
  await ui.summaryFailure()
  assert.equal(ui.container.querySelector('[aria-label="协作进度摘要"]'), null, 'an unknown read cannot restore explicitly withdrawn display')
})
