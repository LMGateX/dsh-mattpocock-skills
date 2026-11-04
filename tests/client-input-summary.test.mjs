import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import * as React from 'react'
import { Window } from 'happy-dom'
import { buildClient } from '../scripts/build-client.mjs'
import { PRIMITIVES_ID, clientPrimitives } from './fixtures/client-primitives.mjs'

// Agreed seam: public built ObservedInputSummary + SessionObserver, real React/Happy DOM.
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
const labels = { T: '查看 T 票窗口', S: '查看 S 在跑子代理', pending: '查看待你裁决事项', awaiting: '查看待落实事项' }
const regions = { T: 'T 票窗口详情', S: 'S 在跑详情', pending: '待你裁决详情', awaiting: '待落实详情' }
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

test('historical regression: actual ObservedInputSummary exposes pendingUser 3 and awaiting 2', async t => {
  const { container } = await mount(t)
  assert.match(container.textContent, /待你裁决\s*3/, 'authorized pendingUserDecisionCount=3 must reach the real input dock')
  assert.match(container.textContent, /待落实\s*2/, 'independent awaitingImplementationCount=2 must reach the real input dock')
  assert.equal(entry(container, 'pending').tagName, 'BUTTON')
  assert.equal(entry(container, 'awaiting').tagName, 'BUTTON')
})

function assertClosed(container) {
  for (const name of Object.values(regions)) assert.equal(container.querySelector('[aria-label="' + name + '"]'), null, 'no stale ' + name)
}
function workflow(view, statuses = [{ statusKey: 'doing', label: '工作进行', count: 1 }]) {
  const definitions = statuses.map(({ count: _count, ...value }) => value)
  view.records.workflows = [{ workflowId: 'flow-inline', revision: 3, value: { title: '可读工作流', axes: [{ axisKey: 'delivery', label: '自定义交付', counting: 'exclusive', statuses: definitions }] }, history: [] }]
  view.records.tickets = [{ workflowId: 'flow-inline', localTicketId: 'held-ticket', revision: 4,
    value: { title: '真实占位票标题', statuses: { delivery: ['doing'] } }, history: [] }]
  view.records.summary.totalTickets = 1
  view.records.summary.statusCounts = [{ workflowId: 'flow-inline', axisKey: 'delivery', label: '自定义交付', counting: 'exclusive', unreported: 0, statuses }]
  return view
}
function decision(id, value = {}, workflowId = 'decision-flow') {
  return { decisionId: id, workflowId, revision: 3, creator: author, view: { read: false, hidden: false }, history: [{ revision: 3, recordedAt: 1234, author, references: ['evidence-ref'], value }],
    value: { question: '事项-' + id, status: '任务自定状态', ...value } }
}
function nativeRow(sessionId, activity, state = 'running') {
  return { executionId: sessionId, sessionId, parentSessionId: 'inline-owner', instrumentInstanceId: 'inline-instance', provider: 'spawn', runId: sessionId + '-run',
    headerCwd: '/source/header-only', state, activity, outcome: null, observed: 'subagent/start', startedAt: 12, endedAt: null, recordedAt: 13,
    lane: { workflowId: 'flow-observed', ticketIds: ['ticket-observed'], task: '可观测任务', source: 'inferred' } }
}

test('four native text entries toggle, switch one local region and expose stable ARIA relations without extra buttons', async t => {
  const { container, window } = await mount(t)
  assertClosed(container)
  assert.equal(container.querySelectorAll('button').length, 4, 'no extra view icon, pill or giant summary button')
  for (const kind of Object.keys(labels)) {
    const node = entry(container, kind)
    assert.equal(node.tagName, 'BUTTON')
    assert.equal(node.type, 'button')
    assert.equal(node.disabled, false)
    assert.equal(node.tabIndex, 0, 'native button participates in Tab order and browser Enter/Space activation')
    assert.equal(node.getAttribute('role'), null, 'native semantics, not a simulated clickable div')
    assert.equal(node.getAttribute('aria-expanded'), 'false')
    assert(node.getAttribute('aria-controls'), 'stable region relation is present while collapsed')
    const css = window.getComputedStyle(node)
    assert.equal(Number.parseFloat(css.padding), 0)
    assert.equal(Number.parseFloat(css.borderWidth), 0)
    assert(['none', ''].includes(css.backgroundImage))
    assert(!node.style.outline.includes('none'), 'visible native focus must not be disabled')
  }
  for (const kind of ['T', 'S', 'pending', 'awaiting']) {
    await click(entry(container, kind))
    const detail = region(container, kind)
    assert.equal(detail.id, entry(container, kind).getAttribute('aria-controls'))
    assert.equal(entry(container, kind).getAttribute('aria-expanded'), 'true')
    assert.equal(Object.values(regions).filter(name => container.querySelector('[aria-label="' + name + '"]')).length, 1)
    for (const other of Object.keys(labels).filter(other => other !== kind)) assert.equal(entry(container, other).getAttribute('aria-expanded'), 'false')
  }
  await click(entry(container, 'awaiting'))
  assertClosed(container)
})

test('sticky reminders, 96px workflow progress and independently scrolling details occupy separate regions', async t => {
  const { container } = await mount(t, workflow(snapshot()))
  await click(entry(container, 'T'))
  const root = named(container, '协作进度摘要'), reminders = named(container, '常驻协作提醒'), progress = named(container, '工作流进度'), detail = region(container, 'T')
  assert.notEqual(root.style.maxHeight, '96px')
  assert.equal(progress.style.maxHeight, '96px')
  assert.equal(progress.style.overflowY, 'auto')
  assert(!progress.contains(reminders) && !progress.contains(detail), '96px scrolling never swallows obligations/details')
  assert(!detail.contains(reminders) && !reminders.contains(progress))
  assert(root.contains(reminders) && root.contains(progress) && root.contains(detail))
  assert(detail.style.maxHeight && detail.style.maxHeight !== '96px', 'details have their own bounded height')
  assert.equal(detail.style.overflowY, 'auto')
  assert.match(reminders.textContent, /待你裁决\s*3/)
  assert.match(reminders.textContent, /待落实\s*2/)
  assert.match(progress.textContent, /工作进行\s*1/)
})

test('T S pending awaiting remain distinguishable in both themes while every signed gap inherits neutral body color', async t => {
  const view = snapshot(); view.windows.T.gap = -2; view.windows.S.gap = 0
  const { container, window } = await mount(t, view)
  // Resolve author CSS in the DOM, rather than accepting four unequal helper strings.
  for (const neutral of ['rgb(23, 24, 25)', 'rgb(230, 231, 232)']) {
    container.style.color = neutral
    const colors = Object.keys(labels).map(kind => {
      const node = entry(container, kind)
      const colored = [node, ...node.querySelectorAll('*')].filter(row => row.style.color && row.style.color !== 'inherit')
      assert(colored.length > 0, kind + ' has a theme-aware emphasis element')
      assert(colored.some(row => /var\(/.test(row.getAttribute('style'))), kind + ' prefers theme variables with fallback')
      return window.getComputedStyle(colored[0]).color
    })
    assert.equal(new Set(colors).size, 4, 'T blue, S cyan/purple, pending red and awaiting amber cannot share a color')
    for (const text of ['差额 -2', '差额 0']) {
      const gap = [...container.querySelectorAll('*')].find(row => row.textContent.includes(text) && ![...row.children].some(child => child.textContent.includes(text)))
      assert(gap, 'missing signed neutral ' + text)
      assert.equal(gap.style.color, 'inherit')
      assert.equal(window.getComputedStyle(gap).color, neutral, 'gap must not inherit a colored T/S parent')
      assert(!['bold', '600', '700'].includes(window.getComputedStyle(gap).fontWeight))
    }
  }
})

test('only definite zero overage disappears; positive advisory and unknown overage survive', async t => {
  const view = snapshot(), f = await mount(t, view)
  assert.doesNotMatch(named(f.container, '常驻协作提醒').textContent, /超出\s*0/)
  const positive = structuredClone(view); positive.windows.T.overage = 2; positive.windows.T.gap = -2
  await f.refresh(positive)
  assert.match(named(f.container, '常驻协作提醒').textContent, /超出\s*2/)
  const unknown = structuredClone(view); unknown.windows.T.overage = null; unknown.windows.S.overage = null
  await f.refresh(unknown)
  assert.match(named(f.container, '常驻协作提醒').textContent, /超出\s*未知/)
  assert.doesNotMatch(f.container.textContent, /超出\s*0|禁止派发|必须批准/)
})

test('arbitrary custom zero states are hidden in progress, unknown/nonzero retained, and full zero definitions survive in T detail', async t => {
  const view = workflow(snapshot(), [
    { statusKey: 'arbitrary', label: '自定义零状态', count: 0 }, { statusKey: 'partial', label: '部分交付', count: 0 },
    { statusKey: 'blocked', label: '被阻塞', count: 0 }, { statusKey: 'doing', label: '工作进行', count: 1 },
    { statusKey: 'unknown', label: '未来计数', count: null },
  ])
  view.windows.tickets = [{ workflowId: 'flow-inline', localTicketId: 'held-ticket', generation: 3, held: true }]
  const { container } = await mount(t, view)
  const progress = named(container, '工作流进度')
  assert.doesNotMatch(progress.textContent, /自定义零状态|部分交付|被阻塞/)
  assert.match(progress.textContent, /工作进行\s*1/)
  assert.match(progress.textContent, /未来计数.*未知/)
  await click(entry(container, 'T'))
  assert.match(region(container, 'T').textContent, /自定义零状态/)
  assert.match(region(container, 'T').textContent, /部分交付/)
  assert.match(region(container, 'T').textContent, /被阻塞/)
})

test('ticketless and all-zero-with-tickets workflows have honest readable empty states', async t => {
  const view = workflow(snapshot(), [{ statusKey: 'unclassified', label: '尚未分类', count: 0 }])
  const f = await mount(t, view)
  assert.match(named(f.container, '工作流进度').textContent, /暂无.*状态|无.*状态|尚无.*状态|状态.*(?:未|零|0)/)
  assert.doesNotMatch(named(f.container, '工作流进度').textContent, /尚未分类\s*0|实施中\s*1/)
  const empty = structuredClone(view); empty.records.tickets = []; empty.records.summary.totalTickets = 0
  await f.refresh(empty)
  assert.match(named(f.container, '工作流进度').textContent, /暂无票/)
})

test('known zero decision entries disappear but unreadable ledgers and malformed counts remain explicitly unknown', async t => {
  const view = snapshot(); view.records.summary.pendingUserDecisionCount = 0; view.records.summary.awaitingImplementationCount = 0
  const f = await mount(t, view)
  assert.equal(f.container.querySelector('[aria-label="' + labels.pending + '"]'), null)
  assert.equal(f.container.querySelector('[aria-label="' + labels.awaiting + '"]'), null)
  assert.equal(f.container.querySelectorAll('button').length, 2)
  const unreadable = structuredClone(view); unreadable.records = null; unreadable.health = [{ scope: 'records', status: 'unknown', reason: 'ledger-read-denied' }]
  await f.refresh(unreadable)
  assert.match(f.container.textContent, /裁决.*未知/)
  assert.match(f.container.textContent, /待落实.*未知/)
  await click(entry(f.container, 'pending'))
  assert.match(region(f.container, 'pending').textContent, /未知|不可读|不可用/)
  const malformed = structuredClone(view); malformed.records.summary.pendingUserDecisionCount = null; malformed.records.summary.awaitingImplementationCount = 'bad-count'
  await f.refresh(malformed)
  assert.match(entry(f.container, 'pending').textContent, /未知/)
  assert.match(entry(f.container, 'awaiting').textContent, /未知/)
  assert.doesNotMatch(entry(f.container, 'pending').textContent, /裁决\s*0/)
})

test('pending is strictly user-addressed, awaiting independent, and inline decision facts are readable and write-free', async t => {
  const view = snapshot()
  view.records.focusedWorkflowId = 'different-focused-workflow'
  view.records.decisions = [
    decision('both', { pending: true, awaitingImplementation: true, addressee: { kind: 'user' }, ticketIds: ['linked-ticket'],
      context: '背景事实', options: [{ key: 'a', label: '选项甲' }], recommendation: '建议甲', impact: '影响说明', result: '已有结果不清旗标' }),
    decision('user-only', { pending: true, awaitingImplementation: false, addressee: { kind: 'user' } }),
    decision('agent-pending', { pending: true, awaitingImplementation: false, addressee: { kind: 'agent' } }),
    decision('unspecified', { pending: true, addressee: { kind: 'unspecified' } }),
    decision('no-addressee', { pending: true }),
    decision('await-only', { pending: false, awaitingImplementation: true, addressee: { kind: 'agent' } }),
    decision('status-is-not-flag', { status: 'pending', result: 'please implement' }),
  ]
  view.records.decisions[0].view = { read: true, hidden: true }
  const { container } = await mount(t, view)
  await click(entry(container, 'pending'))
  const pending = region(container, 'pending')
  assert.match(visibleText(pending), /事项-both|事项-user-only/, 'first screen is readable, not raw JSON')
  for (const expected of ['事项-both', '事项-user-only', 'decision-flow', 'linked-ticket', '任务自定状态', '背景事实', '选项甲', '建议甲', '影响说明', '已有结果不清旗标']) assert(pending.textContent.includes(expected), expected)
  assert.doesNotMatch(pending.textContent, /事项-agent-pending|事项-unspecified|事项-no-addressee|事项-await-only|事项-status-is-not-flag/)
  assert.equal(pending.querySelectorAll('input,textarea,select,button').length, 0, 'no editor, save, mark-read or hidden writes')
  for (const details of pending.querySelectorAll('details')) await React.act(async () => { details.open = true; details.dispatchEvent(new details.ownerDocument.defaultView.Event('toggle')) })
  await click(entry(container, 'awaiting'))
  const awaiting = region(container, 'awaiting')
  assert.match(awaiting.textContent, /事项-both/)
  assert.match(awaiting.textContent, /事项-await-only/)
  assert.doesNotMatch(awaiting.textContent, /事项-user-only|事项-agent-pending|事项-status-is-not-flag/)
  assert.equal(awaiting.querySelectorAll('input,textarea,select,button').length, 0)
})

test('T uses only held leases, keeps unmatched identity and instance total while assigned details remain a subset', async t => {
  const view = workflow(snapshot())
  view.records.summary.countingScope = 'assignment'
  const scope = { kind: 'assigned', workflowId: 'flow-inline', ticketIds: ['held-ticket', 'unmatched-ticket'] }
  view.records.scope = scope; view.windows.scope = scope
  view.windows.T.used = 7
  view.windows.tickets = [
    { workflowId: 'flow-inline', localTicketId: 'held-ticket', generation: 3, held: true },
    { workflowId: 'flow-inline', localTicketId: 'unmatched-ticket', generation: 9, held: true },
    { workflowId: 'flow-inline', localTicketId: 'not-held', generation: 4, held: false },
  ]
  view.records.tickets.push({ workflowId: 'flow-inline', localTicketId: 'not-held', revision: 5, value: { title: '实施中但未占位', statuses: { delivery: ['doing'] } }, history: [] })
  const { container } = await mount(t, view)
  assert.match(container.textContent, /当前分配范围统计/)
  await click(entry(container, 'T'))
  const detail = region(container, 'T')
  assert.match(detail.textContent, /真实占位票标题/)
  assert.match(detail.textContent, /flow-inline/)
  assert.match(detail.textContent, /unmatched-ticket/, 'a held lease does not disappear if its ticket body is unavailable')
  assert.doesNotMatch(detail.textContent, /实施中但未占位|not-held/)
  assert.match(detail.textContent, /分配|assigned/)
  assert.match(detail.textContent, /子集|不完整|非完整/)
  assert.match(entry(container, 'T').textContent, /T\s*7/)
  assert.match(detail.textContent, /(?:总占用|实例|T).*7/)
  assert.doesNotMatch(visibleText(detail), /"generation"\s*:/, 'technical JSON is secondary, not the first screen')
})

test('S uses activity rather than durable state or lease byState, preserves host >64 total and labels bounded observations incomplete', async t => {
  const view = snapshot()
  view.nativeExecutions = [nativeRow('active-created', 'running', 'created'), nativeRow('active-running', 'running'),
    ...Array.from({ length: 62 }, (_, i) => nativeRow('idle-or-gone-' + i, i % 2 ? 'idle' : 'gone'))]
  view.windows.executions = [{ executionId: 'audit-only-running', state: 'running' }]
  view.windows.S.byState.running = 999
  const { container } = await mount(t, view)
  await click(entry(container, 'S'))
  const detail = region(container, 'S')
  assert.match(entry(container, 'S').textContent, /S\s*(?:在跑\s*)?70/)
  assert.match(detail.textContent, /70/)
  assert.match(detail.textContent, /(?:可展示|可观测|本次|明细).*2|2.*(?:可展示|可观测|明细)/)
  assert.match(detail.textContent, /可能不完整|不保证完整|不完整/)
  assert.match(detail.textContent, /active-created/)
  assert.match(detail.textContent, /active-running/)
  assert.match(detail.textContent, /running/)
  assert.match(detail.textContent, /inferred/)
  assert.match(detail.textContent, /subagent\/start|native-observed/)
  assert.match(detail.textContent, /\/source\/header-only/)
  assert.match(detail.textContent, /来源值|不证明|不是.*目录证明/)
  assert.doesNotMatch(detail.textContent, /idle-or-gone-|audit-only-running|999|全部在跑|完整名册|业务失败/)
})

for (const status of ['restricted', 'unknown', 'absent']) {
  test('S sparse/absent native facts stay honest under ' + status + ' coverage and lower-bound host count', async t => {
    const view = snapshot(); view.windows.S.used = 5; view.windows.S.countKnown = false; view.windows.S.countReason = 'native-listing-incomplete'
    view.windows.S.depth = null
    if (status === 'absent') delete view.nativeExecutions
    else { view.nativeExecutions = []; view.health = [{ scope: 'native-executions', status, reason: 'coordinator-only-read' }] }
    const { container } = await mount(t, view)
    await click(entry(container, 'S'))
    const detail = region(container, 'S')
    assert.match(detail.textContent, /下界/)
    assert.match(detail.textContent, /总数未知/)
    assert.match(detail.textContent, /5/)
    assert.match(detail.textContent, /可能不完整|不完整|不保证完整/)
    assert.match(detail.textContent, status === 'restricted' ? /受限|restricted/ : /未知|不可用|未返回/)
    assert.doesNotMatch(detail.textContent, /没有在跑|无在跑|全部在跑|完整清单/)
    assert.match(entry(container, 'S').textContent, /5/)
  })
}

test('equal observed and host S counts still never certify a complete roster', async t => {
  const view = snapshot(); view.windows.S.used = 1; view.nativeExecutions = [nativeRow('one-returned-run', 'running')]
  const { container } = await mount(t, view)
  await click(entry(container, 'S'))
  assert.match(region(container, 'S').textContent, /可能不完整|不完整|不保证完整/)
  assert.doesNotMatch(region(container, 'S').textContent, /明细完整|完整名册|全部在跑/)
})

test('same-instance refresh preserves selected category and focused entry without auto-opening anything', async t => {
  const view = snapshot(); view.records.decisions = [decision('before', { pending: true, addressee: { kind: 'user' } })]
  const f = await mount(t, view)
  entry(f.container, 'pending').focus()
  await click(entry(f.container, 'pending'))
  const focused = f.window.document.activeElement
  const next = structuredClone(view); next.records.businessRevision++; next.records.summary.pendingUserDecisionCount = 4
  next.records.decisions = [decision('after', { pending: true, addressee: { kind: 'user' } })]
  await f.refresh(next)
  assert.equal(f.window.document.activeElement, focused)
  assert.equal(focused, entry(f.container, 'pending'))
  assert.match(region(f.container, 'pending').textContent, /事项-after/)
  assert.doesNotMatch(region(f.container, 'pending').textContent, /事项-before/)
  assert.equal(entry(f.container, 'pending').getAttribute('aria-expanded'), 'true')
  await click(entry(f.container, 'pending'))
  await f.refresh(view)
  assertClosed(f.container)
})

for (const change of ['session', 'instance', 'unreadable', 'display-off', 'zero', 'records-unknown', 'windows-unknown']) {
  test('local selection is immediately fenced and never restored after ' + change, async t => {
    const view = snapshot(); view.records.decisions = [decision('old-private-body', { pending: true, addressee: { kind: 'user' } })]
    const f = await mount(t, view)
    await click(entry(f.container, 'pending'))
    assert.match(region(f.container, 'pending').textContent, /old-private-body/)
    const next = structuredClone(view)
    if (change === 'session') { next.sessionId = 'other-session'; next.records.decisions = []; await f.switchSession(next) }
    if (change === 'instance') { next.instance.instrumentInstanceId = 'other-instance'; next.records.decisions = []; await f.refresh(next) }
    if (change === 'unreadable') await f.unreadable()
    if (change === 'display-off') { next.policy.display.inputSummary = false; await f.refresh(next) }
    if (change === 'zero') { next.records.summary.pendingUserDecisionCount = 0; await f.refresh(next) }
    if (change === 'records-unknown') { next.records = null; next.health.push({ scope: 'records', status: 'unknown', reason: 'revoked' }); await f.refresh(next) }
    if (change === 'windows-unknown') { next.windows = null; next.health.push({ scope: 'windows', status: 'unknown', reason: 'unavailable' }); await f.refresh(next) }
    assertClosed(f.container)
    assert.doesNotMatch(f.container.textContent, /old-private-body/)
    if (change === 'session') await f.switchSession(view)
    else await f.refresh(view)
    assertClosed(f.container)
    assert.equal(entry(f.container, 'pending').getAttribute('aria-expanded'), 'false', 'recovery never resurrects an old selection')
  })
}

test('session prop and observer mismatch cannot expose the old selected snapshot', async t => {
  const view = snapshot(); view.records.decisions = [decision('sensitive-old-session', { pending: true, addressee: { kind: 'user' } })]
  const f = await mount(t, view)
  await click(entry(f.container, 'pending'))
  await f.render('different-session-with-old-observer')
  assertClosed(f.container)
  assert.doesNotMatch(f.container.textContent, /sensitive-old-session/)
})

test('rightPanel=false still permits all four local disclosures while closed management explicitly labels saved non-live records', async t => {
  const view = snapshot(); view.policy.display.rightPanel = false; view.policy.extensionEnabled = false
  const { container } = await mount(t, view)
  assert.match(container.textContent, /已保存记录/)
  assert.match(container.textContent, /不会随工作更新|非实时|不是实时/)
  for (const kind of Object.keys(labels)) {
    await click(entry(container, kind))
    assert(region(container, kind))
  }
})
