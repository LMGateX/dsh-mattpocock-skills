import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import * as React from 'react'
import { Window } from 'happy-dom'
import { buildClient } from '../scripts/build-client.mjs'
import { PRIMITIVES_ID, clientPrimitives } from './fixtures/client-primitives.mjs'

// Frozen §11.5 seam: actual exported React views + SessionObserver + controlled Remote.
// No live Profile, provider, SDK writes, source reads or formatter-only substitute.
const built = await buildClient()
let registration
vm.runInThisContext('(function(window){' + built.code + '\n})')({ __ModuleLoader__: { load: value => { registration = value } } })
const primitives = clientPrimitives(React)
const client = registration.factory(name => {
  if (name === 'react') return React
  if (name === PRIMITIVES_ID) return primitives
  throw new Error('Unexpected browser import ' + name)
})
const author = { kind: 'agent', principalId: 'reference-author', sessionId: 'author-session' }
function reference(localTicketId = 'source-ref', source = { kind: 'external', instance: 'tracker.example', project: 'demo', taskId: '42' }) {
  const value = { source, locator: 'https://tracker.example/demo/42', label: 'External task reference' }
  return { workflowId: 'work', localTicketId, revision: 3, value,
    history: [{ revision: 3, author, recordedAt: 1234, references: ['authored source pointer'], value }] }
}
function snapshot() {
  const instance = { instrumentInstanceId: 'reference-instance', ownerSessionId: 'reference-owner', controlWorkspaceId: 'reference-workspace' }
  return { sessionId: 'reference-session', instance, caller: { kind: 'user', principalId: 'operator', sessionId: null },
    policyGrants: { schemaVersion: 1, revision: 0, grants: [] },
    policy: { controlWorkspaceId: instance.controlWorkspaceId, extensionEnabled: true, workspaceEnabled: true, features: {},
      windows: { ticketWindowSize: 4, runningSubagentLimit: 4 }, display: { header: true, inputSummary: true, rightPanel: true, sessionList: true, timeline: true } },
    records: { instance, revision: 3, businessRevision: 3, viewerRevision: 0, scope: { kind: 'coordinator' }, focusedWorkflowId: 'work',
      capabilities: { taskReferences: true, storageVersions: [1, 2, 3] }, taskReferences: [reference()],
      workflows: [{ workflowId: 'work', revision: 1, value: { title: 'Collaboration group', axes: [] }, history: [] }],
      tickets: [], decisions: [], decisionViews: [], changes: [], summary: { countingScope: 'instance', totalTaskReferences: 1, totalTickets: 0, statusCounts: [],
        pendingDecisionCount: 0, pendingUserDecisionCount: 0, pendingForPrincipalCount: 0, awaitingImplementationCount: 0 } },
    windows: { instance, revision: 0, configurationRevision: 1, capability: 'cooperative', scope: { kind: 'coordinator' }, status: 'ready', reason: null,
      runtimeKnowledge: { known: true, reason: null, runtimeId: 'reference-runtime' },
      T: { capacity: 4, used: 1, available: 3, gap: 3, overage: 0, overcommitted: false },
      S: { capacity: 4, used: 0, available: 4, gap: 4, overage: 0, overcommitted: false, countKnown: true, countReason: null,
        byState: { reserved: 0, accepted: 0, scheduled: 0, running: 0, stopping: 0, unknown: 0 }, depth: { direct: 0, deeper: 0, unknown: 0, levels: {} } },
      tickets: [{ workflowId: 'work', localTicketId: 'source-ref', held: true, generation: 1 }], executions: [] },
    resources: [], worktreeBindings: [], worktreeObservations: [], capabilities: [], health: [] }
}
async function mount(t, entry, initial = snapshot()) {
  const window = new Window({ url: 'http://localhost/', settings: { disableCSSFileLoading: true, disableJavaScriptFileLoading: true } })
  const globals = { window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement,
    Node: window.Node, Event: window.Event, MouseEvent: window.MouseEvent, KeyboardEvent: window.KeyboardEvent, IS_REACT_ACT_ENVIRONMENT: true }
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  const warnings = [], originalError = console.error, originalWarn = console.warn
  console.error = console.warn = (...args) => warnings.push(args.map(String).join(' '))
  let current = initial
  const calls = [], observers = []
  const remote = new Proxy({}, { get: (_target, method) => async (...args) => {
    calls.push({ method, args })
    if (method === 'readSession') return { ok: true, value: structuredClone(current) }
    if (method === 'readSupervision') return { ok: true, value: null }
    assert.fail('Read-only reference interaction invoked ' + String(method))
  } })
  const observe = sessionId => { const observer = new client.SessionObserver(sessionId, () => remote.readSession(sessionId), 0); observers.push(observer); return observer }
  let observer = observe(current.sessionId)
  const { createRoot } = await import('react-dom/client')
  const container = window.document.createElement('div'); window.document.body.append(container)
  const root = createRoot(container)
  const render = async () => React.act(async () => root.render(React.createElement(client[entry], { sessionId: current.sessionId, observer, remote,
    openDetails: () => assert.fail('Read-only disclosure must not navigate'), useTabInfo: () => ({ tab: { visible: true } }) })))
  t.after(async () => {
    try { await React.act(async () => root.unmount()); for (const row of observers) row.dispose(); await window.happyDOM.close() }
    finally { console.error = originalError; console.warn = originalWarn; for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] } }
    assert.deepEqual(warnings, [], 'real React rendering is warning-free')
    assert(calls.every(call => ['readSession', 'readSupervision'].includes(call.method)), 'no writes, history requests, source reads or model wake')
  })
  await render()
  return { container, window, calls,
    refresh: async next => { current = next; await React.act(async () => observer.refresh()) },
    switchSession: async next => { current = next; observer = observe(next.sessionId); await render() },
  }
}
const named = (container, label) => { const node = container.querySelector('[aria-label="' + label + '"]'); assert(node, 'Missing ' + label); return node }
async function click(node) { await React.act(async () => node.click()) }
async function expand(node) { await React.act(async () => { node.open = true; node.dispatchEvent(new Event('toggle')) }) }

test('settings reads task reference source identity, locator and authored provenance without business status', async t => {
  const { container } = await mount(t, 'SettingsInspection')
  const references = named(container, '任务引用')
  assert.match(references.textContent, /任务引用 1/)
  assert.match(references.textContent, /旧票 0/)
  assert.match(references.textContent, /External task reference/)
  const item = references.querySelector('details')
  assert(item && !item.open, 'reference body uses native collapsed details')
  await expand(item)
  assert.match(item.textContent, /tracker.example.*demo.*42/)
  assert(item.textContent.includes('https://tracker.example/demo/42'))
  assert.match(item.textContent, /作者报告.*未核验/)
  assert.match(item.textContent, /未观察源状态/)
  assert.match(item.textContent, /reference-author/)
  assert.doesNotMatch(item.textContent, /未报告状态|disposition|statuses|源当前/)
  assert.equal(references.querySelectorAll('input,textarea,select,a').length, 0, 'source locator is text, not an automatic navigation/fetch or editing form')
})

test('input summary separates reference counts and legacy reports while T and decisions resolve both handle kinds', async t => {
  const view = snapshot()
  view.records.summary.totalTickets = 1
  view.records.summary.pendingDecisionCount = view.records.summary.pendingUserDecisionCount = 1
  view.records.tickets = [{ workflowId: 'work', localTicketId: 'legacy', revision: 2, value: { title: 'Legacy delivery report', statuses: { phase: ['review'] }, disposition: 'authored delivery' }, history: [] }]
  view.records.workflows[0].value.axes = [{ axisKey: 'phase', label: 'Legacy phase', counting: 'exclusive', statuses: [{ statusKey: 'review', label: 'Under review' }] }]
  view.records.summary.statusCounts = [{ workflowId: 'work', axisKey: 'phase', label: 'Legacy phase', counting: 'exclusive', unreported: 0, statuses: [{ statusKey: 'review', label: 'Under review', count: 1 }] }]
  view.records.decisions = [{ workflowId: 'work', decisionId: 'choice', revision: 3, value: { question: 'Choose next scope', status: 'question', pending: true, addressee: { kind: 'user' }, ticketIds: ['source-ref', 'legacy'] }, history: [] }]
  view.windows.T.used = 2
  view.windows.tickets.push({ workflowId: 'work', localTicketId: 'legacy', held: true, generation: 1 })
  const { container } = await mount(t, 'ObservedInputSummary', view)
  const summary = named(container, '常驻协作提醒')
  assert.match(summary.textContent, /任务引用 1.*旧票 1/)
  await click(named(container, '查看 T 票窗口'))
  const T = named(container, 'T 票窗口详情')
  const rows = [...T.querySelectorAll('article')]
  const ref = rows.find(row => row.textContent.includes('work/source-ref'))
  const legacy = rows.find(row => row.textContent.includes('work/legacy'))
  assert(ref && legacy)
  assert.match(ref.textContent, /External task reference/)
  assert.match(ref.textContent, /作者报告.*未核验.*未观察源状态/)
  assert.doesNotMatch(ref.textContent, /未报告|票标题\/状态|Under review|authored delivery/)
  assert.match(legacy.textContent, /Legacy delivery report/)
  assert.match(legacy.textContent, /Legacy phase：Under review/)
  await click(named(container, '查看待你裁决事项'))
  const pending = named(container, '待你裁决详情')
  await expand(pending.querySelector('[data-decision-item]'))
  assert.match(pending.textContent, /关联任务.*work\/source-ref.*External task reference.*work\/legacy.*Legacy delivery report/)
})

test('sidebar preserves all declared source kinds and separates legacy business reports from references', async t => {
  const view = snapshot()
  const repository = reference('repository-ref', { kind: 'repository', repositoryAnchor: 'authored-repository', relativePath: 'tasks/plan.md', anchor: 'scope' })
  repository.value.label = 'Repository scope'
  repository.value.locator = 'tasks/plan.md#scope'
  const unverified = reference('unverified-ref', { kind: 'unverified' })
  delete unverified.value.label
  unverified.value.locator = 'javascript:never-execute()'
  view.records.taskReferences.push(repository, unverified)
  view.records.summary.totalTaskReferences = 3
  view.records.summary.totalTickets = 1
  view.records.tickets.push({ workflowId: 'work', localTicketId: 'old', revision: 2, value: { title: 'Preserved legacy', statuses: {}, summary: 'Historical authored body', disposition: 'delivered' }, history: [] })
  const { container } = await mount(t, 'Details', view)
  const references = named(container, '任务引用')
  assert.match(references.textContent, /任务引用 3.*旧票 1/)
  assert.match(references.textContent, /Repository scope/)
  assert.match(references.textContent, /authored-repository.*tasks\/plan.md.*scope/)
  assert.match(references.textContent, /未核验来源（unverified）/)
  assert(references.textContent.includes('javascript:never-execute()'))
  assert.doesNotMatch(references.textContent, /Historical authored body|delivered|未报告状态/)
  assert.match(container.textContent, /Preserved legacy/)
  assert.match(container.textContent, /Historical authored body/)
  assert.equal(references.querySelectorAll('a,input,textarea,select').length, 0)
})

test('header shows separately counted task references without inventing a reference business status', async t => {
  const { container } = await mount(t, 'ObservedHeaderEntry')
  assert.match(container.textContent, /任务引用 1.*旧票 0/)
  assert.doesNotMatch(container.textContent, /未报告状态|完成率/)
})

test('old endpoint lacking explicit capability is unknown, still reads legacy T, and never guesses a reference as a business ticket', async t => {
  const view = snapshot()
  delete view.records.capabilities
  view.records.summary.totalTaskReferences = 0 // An unnegotiated zero is not authoritative.
  view.records.tickets = [{ workflowId: 'work', localTicketId: 'old', revision: 2, value: { title: 'Old endpoint report', statuses: {} }, history: [] }]
  view.records.summary.totalTickets = 1
  view.windows.tickets.push({ workflowId: 'work', localTicketId: 'old', held: true, generation: 1 })
  const { container } = await mount(t, 'ObservedInputSummary', view)
  assert.match(named(container, '常驻协作提醒').textContent, /任务引用 未知.*旧票 1/)
  await click(named(container, '查看 T 票窗口'))
  const T = named(container, 'T 票窗口详情')
  assert.match(T.textContent, /任务引用读取能力未知或不支持/)
  assert.match(T.textContent, /Old endpoint report/)
  assert.match(T.textContent, /work\/source-ref/)
  assert.doesNotMatch(T.textContent, /External task reference|任务引用 0/)
})

test('reference-only group with empty axes appears without demanding legacy status definitions', async t => {
  const { container } = await mount(t, 'ObservedInputSummary')
  const workflows = named(container, '工作流进度')
  assert.match(workflows.textContent, /work · 任务引用 1 · 旧票 0/)
  assert.doesNotMatch(workflows.textContent, /未报告|暂无票|状态/)
})

test('current reference provenance is read directly without guessing from a missing retained history', async t => {
  const view = snapshot(), row = view.records.taskReferences[0]
  delete row.history
  row.provenance = { author: { ...author, principalId: 'current-reference-author' }, recordedAt: 1234, references: ['current proof'] }
  const { container } = await mount(t, 'SettingsInspection', view)
  const item = named(container, '任务引用').querySelector('details')
  await expand(item)
  assert.match(item.textContent, /current-reference-author/)
  assert.equal(item.querySelector('time').dateTime, '1970-01-01T00:00:01.234Z')
  assert.doesNotMatch(item.textContent, /作者与报告时间未知|首次登记|创建时间/)
})

test('long authored label and locator remain complete selectable text in native keyboard disclosures', async t => {
  const view = snapshot(), row = view.records.taskReferences[0]
  row.value.label = '长任务标签'.repeat(220)
  row.value.locator = 'data:text/html,<img src=https://do-not-fetch.invalid onerror=alert(1)>' + '很长位置'.repeat(220)
  const f = await mount(t, 'ObservedInputSummary', view)
  const button = named(f.container, '查看 T 票窗口')
  assert.equal(button.tagName, 'BUTTON')
  assert.equal(button.tabIndex, 0, 'native Tab/Enter/Space semantics, not a simulated clickable div')
  button.focus()
  assert.equal(f.window.document.activeElement, button)
  await click(button)
  const T = named(f.container, 'T 票窗口详情')
  assert.equal(T.id, button.getAttribute('aria-controls'))
  const item = T.querySelector('article details'), summary = item.querySelector('summary')
  assert.equal(summary.textContent, row.value.label, 'no loss in long labels')
  await expand(item)
  assert(item.textContent.includes(row.value.locator), 'complete locator remains selectable')
  assert.equal(item.style.overflowWrap, 'anywhere')
  assert.equal(Number.parseFloat(item.style.minWidth), 0)
  assert.equal(item.querySelectorAll('img,iframe,script,a,input,textarea').length, 0, 'untrusted HTML and schemes remain inert text')
  const next = structuredClone(view); next.records.businessRevision++
  await f.refresh(next)
  assert.equal(f.window.document.activeElement, button, 'refresh never steals native keyboard focus')
  assert.equal(button.getAttribute('aria-expanded'), 'true')
  assert.equal(T.querySelector('article details').open, true)
  await click(named(f.container, '关闭详情'))
  assert.equal(button.getAttribute('aria-expanded'), 'false')
})

test('known zero and recovery refresh retain local selection without using list length as an authoritative count', async t => {
  const f = await mount(t, 'ObservedInputSummary')
  await click(named(f.container, '查看 T 票窗口'))
  const zero = snapshot()
  zero.records.taskReferences = []
  zero.records.summary.totalTaskReferences = 0
  zero.windows.tickets = []; zero.windows.T.used = 0
  await f.refresh(zero)
  assert.match(named(f.container, '常驻协作提醒').textContent, /任务引用 0/)
  assert.doesNotMatch(f.container.textContent, /External task reference/)
  assert.equal(named(f.container, '查看 T 票窗口').getAttribute('aria-expanded'), 'true')
  const recovered = snapshot()
  recovered.records.summary.totalTaskReferences = 9 // Counts come from summary, not the one returned row.
  await f.refresh(recovered)
  assert.match(named(f.container, '常驻协作提醒').textContent, /任务引用 9/)
  assert.match(named(f.container, 'T 票窗口详情').textContent, /External task reference/)
  const unavailable = snapshot(); unavailable.records = null; unavailable.health = [{ scope: 'records', status: 'unknown', reason: 'controlled read gap' }]
  await f.refresh(unavailable)
  assert.match(f.container.textContent, /任务引用与旧票报告未知/)
  assert.doesNotMatch(f.container.textContent, /External task reference/)
  await f.refresh(snapshot())
  assert.match(named(f.container, '常驻协作提醒').textContent, /任务引用 1/)
  assert.equal(named(f.container, '查看 T 票窗口').getAttribute('aria-expanded'), 'false', 'read recovery does not resurrect an invalidated selection')
})

test('header treats reference totals as unknown when records coverage is restricted despite a stale body', async t => {
  const view = snapshot()
  view.records.summary.totalTaskReferences = 99
  view.health.push({ scope: 'records', status: 'restricted', reason: 'scope revoked' })
  const { container } = await mount(t, 'ObservedHeaderEntry', view)
  assert.match(container.textContent, /任务引用 未知/)
  assert.doesNotMatch(container.textContent, /任务引用 99/)
})

for (const entry of ['SettingsInspection', 'Details', 'ObservedHeaderEntry']) {
  test(entry + ' distinguishes unsupported/absent read capability from a definite zero reference inventory', async t => {
    const old = snapshot(); delete old.records.capabilities; old.records.summary.totalTaskReferences = 0
    const f = await mount(t, entry, old)
    assert.match(f.container.textContent, /任务引用 未知/)
    assert.doesNotMatch(f.container.textContent, /External task reference|任务引用 0/)
    const unsupported = snapshot(); unsupported.records.capabilities.taskReferences = false
    await f.refresh(unsupported)
    assert.match(f.container.textContent, /任务引用 未知/)
    assert.doesNotMatch(f.container.textContent, /External task reference/)
    const zero = snapshot(); zero.records.taskReferences = []; zero.records.summary.totalTaskReferences = 0
    await f.refresh(zero)
    assert.match(f.container.textContent, /任务引用 0/)
    assert.doesNotMatch(f.container.textContent, /任务引用 未知|External task reference/)
  })
}

test('inline reference disclosure and body are dropped on live task authorization narrowing', async t => {
  const f = await mount(t, 'ObservedInputSummary')
  await click(named(f.container, '查看 T 票窗口'))
  await expand(named(f.container, 'T 票窗口详情').querySelector('article details'))
  const restricted = snapshot()
  restricted.records.scope = { kind: 'assigned', workflowId: 'work', ticketIds: [] }
  restricted.records.taskReferences = []; restricted.records.summary.totalTaskReferences = 0
  restricted.windows.tickets = []
  await f.refresh(restricted)
  assert.doesNotMatch(f.container.textContent, /External task reference|tracker.example/)
  assert.equal(named(f.container, '查看 T 票窗口').getAttribute('aria-expanded'), 'false')
  await click(named(f.container, '查看 T 票窗口'))
  assert.doesNotMatch(named(f.container, 'T 票窗口详情').textContent, /External task reference|tracker.example/)
})

for (const entry of ['SettingsInspection', 'Details']) {
  test(entry + ' window T region resolves held reference and legacy handles without borrowing labels elsewhere on the page', async t => {
    const view = snapshot()
    view.records.tickets = [{ workflowId: 'work', localTicketId: 'legacy-window', revision: 2,
      value: { title: 'Legacy window report', statuses: { phase: ['review'] } }, history: [] }]
    view.records.summary.totalTickets = 1
    view.records.workflows[0].value.axes = [{ axisKey: 'phase', label: 'Legacy phase', counting: 'exclusive', statuses: [{ statusKey: 'review', label: 'Under review' }] }]
    const released = reference('released-ref'); released.value.label = 'Released reference label'
    view.records.taskReferences.push(released); view.records.summary.totalTaskReferences = 2
    view.windows.T.used = 2
    view.windows.scope = { kind: 'assigned', workflowId: 'work', ticketIds: ['source-ref', 'legacy-window'] }
    view.windows.tickets.push({ workflowId: 'work', localTicketId: 'legacy-window', held: true, generation: 1 },
      { workflowId: 'work', localTicketId: 'released-ref', held: false, generation: 1 })
    const f = await mount(t, entry, view)
    const windowRegion = named(f.container, '窗口观测')
    const T = named(windowRegion, 'T 占位明细')
    assert.match(T.textContent, /实例总占用 T 2/)
    assert.match(T.textContent, /明细只是子集，不能从子集重算实例总数/)
    assert(T.textContent.includes('work/source-ref'))
    assert.match(T.textContent, /任务引用.*External task reference/)
    assert(T.textContent.includes('work/legacy-window'))
    assert.match(T.textContent, /旧票报告.*Legacy window report/)
    assert.doesNotMatch(T.textContent, /Released reference label|released-ref/)
    const ref = [...T.querySelectorAll('article')].find(row => row.textContent.includes('work/source-ref'))
    const legacy = [...T.querySelectorAll('article')].find(row => row.textContent.includes('work/legacy-window'))
    assert.match(ref.textContent, /作者报告.*未核验.*未观察源状态/)
    assert.doesNotMatch(ref.textContent, /未报告状态|Under review/)
    assert.match(legacy.textContent, /Legacy phase：Under review/)
    assert.match(windowRegion.textContent, /S 0.*直接 0.*更深 0/)
    assert([...windowRegion.querySelectorAll('pre')].some(node => node.textContent.includes('"runtimeKnowledge"')), 'original technical window facts remain available')
    const old = structuredClone(view); delete old.records.capabilities
    await f.refresh(old)
    const oldT = named(named(f.container, '窗口观测'), 'T 占位明细')
    assert.match(oldT.textContent, /任务引用读取能力未知或不支持/)
    assert.match(oldT.textContent, /Legacy window report/)
    assert.doesNotMatch(oldT.textContent, /External task reference/)
    const revoked = structuredClone(view)
    revoked.health.push({ scope: 'records', status: 'restricted', reason: 'controlled authorization narrowing' })
    await f.refresh(revoked)
    const restrictedT = named(named(f.container, '窗口观测'), 'T 占位明细')
    assert(restrictedT.textContent.includes('work/source-ref'))
    assert.doesNotMatch(restrictedT.textContent, /External task reference|Legacy window report|Under review/)
  })
}

test('settings shared T owns long handle text wrapping instead of relying on sidebar or input ancestors', async t => {
  // The independent real browser measured T.scrollWidth=3120 at both 1440px and 390px.
  // Happy DOM does not measure layout: this regression checks the missing local CSS
  // inheritance and lossless text, not a counterfeit scrollWidth/viewport assertion.
  const view = snapshot(), row = view.records.taskReferences[0]
  const handle = 'unbroken-task-handle-'.repeat(6)
  row.localTicketId = handle
  row.value.label = 'UnbrokenReferenceLabel'.repeat(24)
  row.value.locator = 'https://tracker.invalid/' + 'longnavigation'.repeat(80)
  view.windows.tickets[0].localTicketId = handle
  view.records.tickets = [{ workflowId: 'work', localTicketId: 'legacy-' + handle, revision: 2,
    value: { title: 'UnbrokenLegacyTitle'.repeat(24), statuses: {} }, history: [] }]
  view.windows.tickets.push({ workflowId: 'work', localTicketId: 'legacy-' + handle, held: true, generation: 1 })
  const f = await mount(t, 'SettingsInspection', view)
  const T = named(named(f.container, '窗口观测'), 'T 占位明细')
  const body = T.querySelector(':scope > div')
  assert(body, 'shared T text body is mounted under its native heading')
  assert.equal(body.style.overflowWrap, 'anywhere', 'shared module itself owns wrapping without parent layout assumptions')
  assert.equal(Number.parseFloat(body.style.minWidth), 0)
  const articles = [...body.querySelectorAll('article')]
  assert.equal(articles.length, 2)
  assert(articles[0].querySelector('p').textContent.includes(handle))
  assert(articles[0].querySelector('p').textContent.includes(row.value.label))
  assert(articles[1].querySelector('p').textContent.includes(view.records.tickets[0].value.title))
  await expand(articles[0].querySelector('details'))
  assert(articles[0].textContent.includes(row.value.locator), 'full navigation is still readable, never truncated')
  for (const node of [body, ...body.querySelectorAll('article, p')]) {
    assert.notEqual(node.style.overflow, 'hidden')
    assert.notEqual(node.style.overflowX, 'auto')
    assert.notEqual(node.style.overflowX, 'scroll')
    assert.notEqual(node.style.textOverflow, 'ellipsis')
    assert.notEqual(node.style.whiteSpace, 'nowrap')
  }
})

for (const change of ['instance', 'caller', 'scope', 'grant', 'session']) {
  test('settings reference reading fences old bodies and disclosure state after ' + change, async t => {
    const f = await mount(t, 'SettingsInspection')
    await expand(named(f.container, '任务引用').querySelector('details'))
    const next = snapshot()
    next.records.taskReferences[0].value.label = 'New authorized body'
    if (change === 'instance') { next.instance.instrumentInstanceId = 'next-instance'; next.records.instance = next.windows.instance = next.instance }
    if (change === 'caller') next.caller.principalId = 'new-operator'
    if (change === 'scope') next.records.scope = { kind: 'assigned', workflowId: 'work', ticketIds: ['source-ref'] }
    if (change === 'grant') next.policyGrants.revision++
    if (change === 'session') { next.sessionId = 'new-session'; await f.switchSession(next) } else await f.refresh(next)
    const references = named(f.container, '任务引用')
    assert.doesNotMatch(references.textContent, /External task reference/)
    assert.match(references.textContent, /New authorized body/)
    assert.equal(references.querySelector('details').open, false, 'identity change resets prior disclosure')
  })
}
