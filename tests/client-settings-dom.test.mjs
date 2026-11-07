import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import * as React from 'react'
import { Window } from 'happy-dom'
import { buildClient } from '../scripts/build-client.mjs'
import { parseInstrumentCommand } from '../lib/controls/instrument-state.js'
import { PRIMITIVES_ID, clientPrimitives } from './fixtures/client-primitives.mjs'

// Real React and DOM integration, not a graphical-browser or live-profile probe.
// Only the public built exports, DOM interactions and controlled Remote contract are observed.
const built = await buildClient()
let registration
vm.runInThisContext('(function(window){' + built.code + '\n})')({ __ModuleLoader__: { load: value => { registration = value } } })
const primitives = clientPrimitives(React)
const client = registration.factory(name => { if (name === 'react') return React; if (name === PRIMITIVES_ID) return primitives; throw new Error('Unexpected request ' + name) })
const ok = value => ({ ok: true, value })
const copy = value => structuredClone(value)
function fixture(extra = {}) {
  const calls = { policy: [], supervision: [], refresh: 0, observe: [] }
  let policy = { revision: 42, extensionEnabled: false, defaults: {}, workspaceOverrides: {} }
  let supervision = { schemaVersion: 1, revision: 0, defaults: {}, workspaceOverrides: {} }
  const remote = {
    readPolicy: async () => ok(copy(policy)),
    listWorkspaces: async () => ok([{ id: 'work-one', title: '审计工作区', status: 'ok', sessionIds: [] }]),
    savePolicy: async (intent, revision) => { calls.policy.push({ intent: copy(intent), revision }); policy = { ...copy(intent), revision: revision + 1 }; return ok(copy(policy)) },
    readSupervisionConfig: async () => ok(copy(supervision)),
    saveSupervisionConfig: async (intent, revision) => { calls.supervision.push({ intent: copy(intent), revision }); supervision = { schemaVersion: 1, revision: revision + 1, ...copy(intent) }; return ok(copy(supervision)) },
    readSupervision: async () => ok(null),
    ...extra,
  }
  return { calls, remote, props: { view: 'page', remote, refreshAll: () => { calls.refresh++ }, observe: id => { calls.observe.push(id); throw new Error('unexpected Session observation') } } }
}
async function mount(t, component, props) {
  const window = new Window({ url: 'http://localhost/', settings: { disableCSSFileLoading: true, disableJavaScriptFileLoading: true } })
  const globals = { window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement,
    HTMLInputElement: window.HTMLInputElement, Node: window.Node, Event: window.Event, MouseEvent: window.MouseEvent,
    IS_REACT_ACT_ENVIRONMENT: true }
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  const errors = [], originalError = console.error, originalWarn = console.warn
  console.error = console.warn = (...args) => { errors.push(args.map(String).join(' ')) }
  const { createRoot } = await import('react-dom/client')
  const container = window.document.createElement('div'); window.document.body.append(container)
  const root = createRoot(container)
  t.after(async () => {
    try { await React.act(async () => root.unmount()); await window.happyDOM.close() }
    finally {
      console.error = originalError; console.warn = originalWarn
      for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] }
    }
    assert.deepEqual(errors, [], 'real React rendering must not warn or error')
  })
  await React.act(async () => root.render(React.createElement(component, props)))
  return { container, window, root }
}
function named(container, label) {
  const found = container.querySelector('[aria-label="' + label + '"]')
  assert(found, 'missing accessible element: ' + label)
  return found
}
function button(container, label) {
  const found = [...container.querySelectorAll('button')].find(row => row.textContent === label)
  assert(found, 'missing button: ' + label)
  return found
}
function normalText(container) {
  const clone = container.cloneNode(true)
  for (const details of clone.querySelectorAll('details:not([open])')) {
    const summary = details.querySelector('summary')?.cloneNode(true)
    details.replaceChildren(...(summary ? [summary] : []))
  }
  return clone.textContent
}
async function click(element) { await React.act(async () => element.click()) }
async function select(element, value) { await React.act(async () => { element.value = value; element.dispatchEvent(new element.ownerDocument.defaultView.Event('change', { bubbles: true })) }) }

async function closeoutFixture(t, apply = async () => ok({}), configure = value => value) {
  const instance = { instrumentInstanceId: 'closeout-i', ownerSessionId: 'closeout-owner', controlWorkspaceId: 'work-one' }
  const author = { kind: 'agent', principalId: 'agent:original', sessionId: 'original-session' }
  let view = { sessionId: 'closeout-session', instance, caller: { kind: 'user', principalId: 'user:operator', sessionId: null }, policyGrants: { schemaVersion: 1, revision: 0, grants: [] },
    policy: { controlWorkspaceId: 'work-one', extensionEnabled: false, features: {}, windows: { ticketWindowSize: null, runningSubagentLimit: null }, display: { header: true, inputSummary: true, rightPanel: true, sessionList: false, timeline: false } },
    records: { instance, scope: { kind: 'coordinator' }, businessRevision: 7, workflows: [], tickets: [], decisions: [{ workflowId: 'wf', decisionId: 'legacy', revision: 3,
      history: [{ revision: 1, recordedAt: 1000, author, references: ['https://example.test/original-answer'], value: {} }, { revision: 3, recordedAt: 3000, author, references: ['https://example.test/task-link'], value: {} }],
      value: { question: '需要保留原答复的旧事项', status: '任务原自定义状态', pending: true, awaitingImplementation: true, addressee: { kind: 'user' }, ticketIds: ['original-ticket'], context: '原背景与任务指针 https://example.test/task/42', result: '原用户明确答复：仅批准甲', recommendation: '旧建议', impact: '旧影响', options: [{ key: 'a', label: '原选项' }] } }],
      summary: { countingScope: 'instance', totalTickets: 0, statusCounts: [], pendingDecisionCount: 1, pendingUserDecisionCount: 1, awaitingImplementationCount: 1 } }, windows: null, resources: [], capabilities: [], health: [] }
  view = configure(view)
  const calls = [], remote = { readSupervision: async () => ok(null), applyInstrument: async (sessionId, command) => { calls.push({ sessionId, command: copy(command) }); return apply(command) } }
  const observer = new client.SessionObserver(view.sessionId, async () => ok(copy(view)), 0); t.after(() => observer.dispose())
  const mounted = await mount(t, client.Details, { sessionId: view.sessionId, observer, remote, useTabInfo: () => ({ tab: { visible: true } }) })
  await click(button(named(mounted.container, '待你裁决'), '阅读 / 编辑：需要保留原答复的旧事项'))
  return { ...mounted, calls, get view() { return view }, refresh: async next => { view = next; await React.act(async () => observer.refresh()) } }
}
async function typeText(window, node, value) {
  await React.act(async () => { Object.getOwnPropertyDescriptor(node.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype, 'value').set.call(node, value); node.dispatchEvent(new window.Event('input', { bubbles: true })) })
}

test('closeout can retain one necessary historical source from a lawful long reference inventory', async t => {
  const refs = Array.from({ length: 100 }, (_, index) => 'https://example.test/old-source-' + index + '/' + 'x'.repeat(1000))
  const f = await closeoutFixture(t, async command => { assert.doesNotThrow(() => parseInstrumentCommand(command), 'actual UI command must satisfy the unchanged wire parser'); return ok({}) }, view => {
    view.records.decisions[0].history[1].references = refs
    assert.doesNotThrow(() => parseInstrumentCommand({ operationId: 'lawful-long-sources', expectedRevision: 6, workflowId: 'wf', decisionId: 'legacy', action: 'put-decision', references: refs, value: view.records.decisions[0].value }), 'the original long-reference decision is lawful under the real existing wire parser')
    return view
  })
  const editor = named(f.container, '裁决阅读与编辑')
  await select(named(editor, '保存意图'), 'closeout')
  const sources = named(editor, '必要旧来源转录（authored，可编辑）')
  assert(sources.value.length > 100000, 'prefill is complete, not silently truncated to the context budget')
  assert(sources.value.includes(refs[99])); assert.match(sources.value, /修订 3.*agent:original/)
  await typeText(f.window, named(editor, '核账说明与任务去向'), '本次需要精简旧来源转录')
  assert.equal(button(editor, '登记核账处置').disabled, true, 'the oversized full prefill must be diagnosed before Remote')
  assert.match(named(editor, '核账背景长度').textContent, /65536.*超过/)
  await click(button(editor, '登记核账处置')); assert.deepEqual(f.calls, [])
  await typeText(f.window, sources, '修订 3 · 原作者 agent / agent:original\n' + refs[0])
  await typeText(f.window, named(editor, '核账说明与任务去向'), '只转录本次核账必须保留的一条答复来源，责任已移交原任务，尚未完成。')
  await typeText(f.window, named(editor, '本次来源引用（每行一条）'), 'https://example.test/current-handoff')
  await click(button(editor, '登记核账处置'))
  assert.equal(f.calls.length, 1)
  const { command } = f.calls[0]
  assert.equal(command.expectedRevision, 7)
  assert(command.value.context.startsWith('原背景与任务指针 https://example.test/task/42\n\n'))
  assert(command.value.context.includes(refs[0])); assert(!command.value.context.includes(refs[99]))
  assert.match(command.value.context, /authored.*转录/); assert.match(command.value.context, /修订 3.*agent:original/)
  assert.deepEqual(command.references, ['https://example.test/current-handoff'])
  assert.deepEqual(Object.keys(command.value).sort(), ['context', 'question', 'status'])
  assert.equal(f.view.records.decisions[0].value.result, '原用户明确答复：仅批准甲')
  assert.match(editor.textContent, /已登记核账处置/)
})

test('closeout diagnoses near-limit original context without truncation Remote writes or losing the source draft', async t => {
  const original = '长'.repeat(65520)
  const f = await closeoutFixture(t, async command => { parseInstrumentCommand(command); return ok({}) }, view => { view.records.decisions[0].value.context = original; return view })
  const editor = named(f.container, '裁决阅读与编辑')
  await select(named(editor, '保存意图'), 'closeout')
  await typeText(f.window, named(editor, '必要旧来源转录（authored，可编辑）'), '修订 1 · 原作者 agent / agent:original\nhttps://example.test/necessary-source')
  await typeText(f.window, named(editor, '核账说明与任务去向'), '不能丢失的核账说明与任务去向')
  const sources = named(editor, '必要旧来源转录（authored，可编辑）'), note = named(editor, '核账说明与任务去向')
  const diagnostic = named(editor, '核账背景长度')
  assert.match(diagnostic.textContent, /拼接后背景.*65536/)
  assert.match(diagnostic.textContent, /原背景 65520.*原样保留/)
  assert.match(diagnostic.textContent, /必要旧来源|精简核账说明/)
  assert.match(diagnostic.textContent, /原有授权编辑.*重新读取/)
  assert.equal(button(editor, '登记核账处置').disabled, true)
  await click(button(editor, '登记核账处置'))
  assert.deepEqual(f.calls, [])
  assert.equal(f.view.records.decisions[0].value.context, original)
  assert.equal(note.value, '不能丢失的核账说明与任务去向')
  assert.match(sources.value, /necessary-source/)
  const refreshed = copy(f.view); refreshed.records.businessRevision++
  await f.refresh(refreshed)
  assert.equal(named(editor, '必要旧来源转录（authored，可编辑）'), sources)
  assert.match(sources.value, /necessary-source/)
  await click(button(editor, '重新读取事项（丢弃草稿）'))
  await select(named(editor, '保存意图'), 'closeout')
  assert(!named(editor, '必要旧来源转录（authored，可编辑）').value.includes('necessary-source'))
  assert.equal(named(editor, '核账说明与任务去向').value, '')
})

test('explicit closeout saves authored context and sources without inventing an answer or clearing old flags', async t => {
  const f = await closeoutFixture(t), editor = named(f.container, '裁决阅读与编辑')
  await select(named(editor, '保存意图'), 'closeout')
  assert(!editor.querySelector('[aria-label="用户答复"]'), 'closeout is not a second answer or chat composer')
  await typeText(f.window, named(editor, '核账说明与任务去向'), '落实责任已移交任务 https://example.test/task/42；尚未完成，不是完成声明。')
  await typeText(f.window, named(editor, '本次来源引用（每行一条）'), 'https://example.test/handoff\nhttps://example.test/handoff')
  await click(button(editor, '登记核账处置'))
  assert.equal(f.calls.length, 1)
  const { sessionId, command } = f.calls[0]
  assert.equal(sessionId, 'closeout-session'); assert.equal(command.action, 'put-decision'); assert.equal(command.expectedRevision, 7)
  assert.equal(command.value.question, '需要保留原答复的旧事项'); assert.equal(command.value.status, '任务原自定义状态')
  assert(command.value.context.startsWith('原背景与任务指针 https://example.test/task/42\n\n'))
  assert.match(command.value.context, /authored.*转录/)
  for (const text of ['落实责任已移交任务', '尚未完成', 'https://example.test/original-answer', 'https://example.test/task-link', 'agent:original', '修订 1', '修订 3']) assert(command.value.context.includes(text), text)
  assert.deepEqual(command.references, ['https://example.test/handoff'])
  assert.deepEqual(Object.keys(command.value).sort(), ['context', 'question', 'status'])
  assert(!Object.hasOwn(command, 'author')); assert(!Object.hasOwn(command, 'caller'))
  assert.equal(f.view.records.decisions[0].value.result, '原用户明确答复：仅批准甲')
  assert.equal(f.view.records.decisions[0].value.awaitingImplementation, true)
})

test('closeout changes only explicit flags and retains original CAS and draft through conflict until explicit reload', async t => {
  let actualRevision = 7
  const f = await closeoutFixture(t, async command => command.expectedRevision === actualRevision ? ok({}) : { ok: false, error: new Error('business-revision-conflict') })
  let editor = named(f.container, '裁决阅读与编辑')
  await select(named(editor, '保存意图'), 'closeout')
  await typeText(f.window, named(editor, '核账说明与任务去向'), '明确移交任务，保留原答复，不宣称完成。')
  await typeText(f.window, named(editor, '本次来源引用（每行一条）'), 'https://example.test/closeout-source')
  await select(named(editor, '核账 pending'), 'keep')
  await select(named(editor, '核账原待落实标记'), 'false')
  const note = named(editor, '核账说明与任务去向'); note.focus()
  const next = copy(f.view); next.records.businessRevision = actualRevision = 8
  next.records.decisions[0].value.status = '并发更新状态'; next.records.decisions[0].value.context = '并发更新背景'; next.records.decisions[0].value.result = '并发更新的真实答复'
  await f.refresh(next)
  assert.equal(named(editor, '核账说明与任务去向'), note); assert.equal(f.window.document.activeElement, note)
  await click(button(editor, '登记核账处置'))
  assert.equal(f.calls[0].command.expectedRevision, 7)
  assert.equal(f.calls[0].command.value.awaitingImplementation, false)
  assert(!Object.hasOwn(f.calls[0].command.value, 'pending')); assert(!Object.hasOwn(f.calls[0].command.value, 'result'))
  assert.equal(f.calls[0].command.value.status, '任务原自定义状态')
  assert.match(editor.textContent, /business-revision-conflict/)
  assert.equal(note.value, '明确移交任务，保留原答复，不宣称完成。')
  assert.equal(named(editor, '核账原待落实标记').value, 'false')
  assert.match(editor.textContent, /草稿业务修订 7/)
  await click(button(editor, '重新读取事项（丢弃草稿）'))
  assert.equal(named(editor, '保存意图').value, 'answer')
  await select(named(editor, '保存意图'), 'closeout')
  assert.equal(named(editor, '核账说明与任务去向').value, '')
  assert.equal(named(editor, '本次来源引用（每行一条）').value, '')
  assert.equal(named(editor, '核账原待落实标记').value, 'keep')
  await typeText(f.window, named(editor, '核账说明与任务去向'), '显式重读后基于现状登记，任务仍未完成。')
  await typeText(f.window, named(editor, '核账状态（留空保留原状态）'), '明确移交状态')
  await select(named(editor, '核账 pending'), 'false')
  await click(button(editor, '登记核账处置'))
  assert.equal(f.calls[1].command.expectedRevision, 8)
  assert.equal(f.calls[1].command.value.pending, false)
  assert(!Object.hasOwn(f.calls[1].command.value, 'awaitingImplementation'))
  assert(!Object.hasOwn(f.calls[1].command.value, 'result'))
  assert.equal(f.calls[1].command.value.status, '明确移交状态')
  assert(f.calls[1].command.value.context.startsWith('并发更新背景'))
})

test('ordinary user answer preserves legacy await and cannot accidentally save a closeout draft', async t => {
  const f = await closeoutFixture(t), editor = named(f.container, '裁决阅读与编辑')
  await select(named(editor, '保存意图'), 'closeout')
  await typeText(f.window, named(editor, '核账说明与任务去向'), '未提交的核账草稿，不应进入用户答复')
  await select(named(editor, '核账原待落实标记'), 'false')
  await select(named(editor, '保存意图'), 'answer')
  await typeText(f.window, named(editor, '用户答复'), '用户本次明确答复：仍采用甲')
  await click(button(editor, '按明确选择记录裁决'))
  assert.equal(f.calls.length, 1)
  assert.equal(f.calls[0].command.expectedRevision, 7)
  assert.equal(f.calls[0].command.value.result, '用户本次明确答复：仍采用甲')
  assert.equal(f.calls[0].command.value.awaitingImplementation, true, 'ordinary answer does not default-clear legacy await')
  assert(!Object.hasOwn(f.calls[0].command.value, 'context'))
  assert(!JSON.stringify(f.calls[0].command).includes('未提交的核账草稿'))
})

test('closeout draft and selection are cleared on caller scope grants and record revocation without writes', async t => {
  const f = await closeoutFixture(t), authorized = copy(f.view)
  for (const change of ['caller', 'scope', 'grants', 'revoked']) {
    let editor = named(f.container, '裁决阅读与编辑')
    await select(named(editor, '保存意图'), 'closeout')
    await typeText(f.window, named(editor, '核账说明与任务去向'), '只属于原授权范围的核账草稿')
    await typeText(f.window, named(editor, '必要旧来源转录（authored，可编辑）'), '只属于原授权范围的来源转录草稿')
    const next = copy(authorized)
    if (change === 'caller') next.caller.principalId = 'user:other'
    if (change === 'scope') next.records.scope = { kind: 'assigned', workflowId: 'wf', ticketIds: [] }
    if (change === 'grants') next.policyGrants.revision++
    if (change === 'revoked') { next.records = null; next.health = [{ scope: 'records', status: 'restricted', reason: 'revoked' }] }
    await f.refresh(next)
    assert(!f.container.querySelector('[aria-label="核账说明与任务去向"]'), change)
    assert(!f.container.textContent.includes('只属于原授权范围的核账草稿'))
    assert(!f.container.textContent.includes('只属于原授权范围的来源转录草稿'))
    await f.refresh(copy(authorized))
    assert(!f.container.querySelector('[aria-label="裁决阅读与编辑"]'), 'recovery does not revive the old selection')
    await click(button(named(f.container, '待你裁决'), '阅读 / 编辑：需要保留原答复的旧事项'))
    editor = named(f.container, '裁决阅读与编辑')
    assert.equal(named(editor, '保存意图').value, 'answer')
    await select(named(editor, '保存意图'), 'closeout')
    assert.equal(named(editor, '核账说明与任务去向').value, '')
    assert(!named(editor, '必要旧来源转录（authored，可编辑）').value.includes('只属于原授权范围'))
  }
  assert.deepEqual(f.calls, [])
})

test('Settings selected session decisions use structured readonly hierarchy with authorization isolation', async t => {
  const instance = { instrumentInstanceId: 'inspect-i', ownerSessionId: 'inspect-owner', controlWorkspaceId: 'work-one' }
  let view = { sessionId: 'inspect-session', instance, caller: { kind: 'user', principalId: 'user:test', sessionId: null }, policyGrants: { schemaVersion: 1, revision: 0, grants: [] },
    policy: { controlWorkspaceId: 'work-one', extensionEnabled: false, features: {}, windows: { ticketWindowSize: null, runningSubagentLimit: null }, display: { header: false, inputSummary: false, rightPanel: false, sessionList: false, timeline: false } },
    records: { instance, scope: { kind: 'coordinator' }, businessRevision: 7, workflows: [{ workflowId: 'wf', revision: 1, history: [], value: { title: '设置裁决工作流', axes: [] } }], tickets: [],
      decisions: [{ workflowId: 'wf', decisionId: 'd', revision: 1, history: [], value: { question: '设置待答问题'.repeat(40), status: '待确认', pending: true, addressee: { kind: 'user' }, options: [{ key: 'a', label: '设置原选项' }], context: '设置长背景'.repeat(80) } }],
      summary: { countingScope: 'instance', totalTickets: 0, statusCounts: [], pendingDecisionCount: 1, pendingUserDecisionCount: 1, awaitingImplementationCount: 0 } }, windows: null, resources: [], capabilities: [], health: [] }
  const observer = new client.SessionObserver(view.sessionId, async () => ok(copy(view)), 0); t.after(() => observer.dispose())
  const { container, window } = await mount(t, client.SettingsInspection, { sessionId: view.sessionId, observer })
  const section = named(container, '设置页裁决记录'), item = section.querySelector('details[data-decision-item]')
  assert(item); assert.equal(item.open, false)
  assert.match(normalText(section), /设置裁决工作流.*待确认/)
  assert.doesNotMatch(normalText(section), /设置长背景|设置原选项|"decisions"/)
  await React.act(async () => { item.open = true; item.dispatchEvent(new window.Event('toggle')) })
  assert.match(normalText(item), /设置原选项/)
  assert.doesNotMatch(normalText(item), /设置长背景/)
  assert.equal(section.querySelector('input,textarea,button'), null, 'Settings reading never mounts authored editor')
  view = copy(view); view.policyGrants.revision = 1
  await React.act(async () => observer.refresh())
  const fresh = named(container, '设置页裁决记录').querySelector('details[data-decision-item]')
  assert.notEqual(fresh, item, 'authorization revision resets reading without reviving old disclosure')
  assert.equal(fresh.open, false)
})

test('sidebar mixed authorized decisions keep user queue strict and compatibility union deduplicated', async t => {
  const instance = { instrumentInstanceId: 'mixed-i', ownerSessionId: 'mixed-owner', controlWorkspaceId: 'work-one' }
  const make = (id, value) => ({ workflowId: 'wf', decisionId: id, revision: 1, history: [], value: { question: '原问题-' + id, status: '自定义状态', ...value } })
  let view = { sessionId: 'mixed-session', instance, caller: { kind: 'user', principalId: 'user:test', sessionId: null }, policyGrants: { schemaVersion: 1, revision: 0, grants: [] },
    policy: { controlWorkspaceId: 'work-one', extensionEnabled: true, features: {}, windows: { ticketWindowSize: null, runningSubagentLimit: null }, display: { header: true, inputSummary: true, rightPanel: true, sessionList: false, timeline: false } },
    records: { instance, scope: { kind: 'coordinator' }, businessRevision: 4, workflows: [], tickets: [], decisions: [make('user', { pending: true, addressee: { kind: 'user' } }), make('both', { pending: true, awaitingImplementation: true, addressee: { kind: 'user' } }), make('agent', { pending: true, addressee: { kind: 'agent' } }), make('none', { pending: true }), make('unspecified', { pending: true, addressee: { kind: 'unspecified' } }), make('await', { awaitingImplementation: true, addressee: { kind: 'agent' } }), make('resolved-user', { addressee: { kind: 'user' }, result: '原答复' }), make('resolved-agent', { addressee: { kind: 'agent' } })],
      summary: { countingScope: 'instance', totalTickets: 0, statusCounts: [], pendingDecisionCount: 5, pendingUserDecisionCount: 2, awaitingImplementationCount: 2 } }, windows: null, resources: [], capabilities: [], health: [] }
  view.records.decisions.push(copy(view.records.decisions[2]))
  const calls = [], remote = { readSupervision: async () => ok(null), applyInstrument: async (...args) => { calls.push(args); return ok({}) } }
  const observer = new client.SessionObserver(view.sessionId, async () => ok(copy(view)), 0); t.after(() => observer.dispose())
  const { container } = await mount(t, client.Details, { sessionId: view.sessionId, observer, remote, useTabInfo: () => ({ tab: { visible: true } }) })
  const keys = section => [...section.querySelectorAll('[data-decision-key]')].map(row => row.getAttribute('data-decision-key'))
  assert.deepEqual(keys(named(container, '待你裁决')), ['mixed-session:wf:user', 'mixed-session:wf:both'])
  const checks = named(container, '记录核对')
  assert.deepEqual(keys(checks), ['mixed-session:wf:both', 'mixed-session:wf:agent', 'mixed-session:wf:none', 'mixed-session:wf:unspecified', 'mixed-session:wf:await'])
  assert.match(checks.textContent, /原待落实标记 2.*不等于未完成任务/)
  const other = named(container, '其他裁决记录'); assert.equal(other.open, false)
  assert.deepEqual(keys(other), ['mixed-session:wf:resolved-user', 'mixed-session:wf:resolved-agent'])
  const first = checks.querySelector('details[data-decision-item]')
  await React.act(async () => { first.open = true; first.dispatchEvent(new first.ownerDocument.defaultView.Event('toggle')) })
  assert.equal(container.querySelector('textarea'), null)
  await click(button(first, '阅读 / 编辑：原问题-both'))
  assert(named(container, '裁决阅读与编辑').querySelector('textarea'))
  assert.deepEqual(calls, [])
  view = copy(view); view.records.scope = { kind: 'assigned', workflowId: 'wf', ticketIds: [] }; view.records.decisions = []; view.records.summary.pendingUserDecisionCount = 9
  await React.act(async () => observer.refresh())
  assert.equal(container.querySelectorAll('[data-decision-key]').length, 0)
  assert.match(named(container, '待你裁决').textContent, /摘要计数 9.*列表 0.*不一致/)
  assert(!container.querySelector('textarea'))
})

test('DOM saves management policy under revision forty-two and preserves the saved state', async t => {
  const f = fixture(), { container } = await mount(t, client.SettingsPage, f.props)
  await click(named(container, '协作管理总闸（全局）'))
  await click(button(container, '保存并启用协作管理'))
  assert.equal(f.calls.policy.length, 1)
  assert.equal(f.calls.policy[0].revision, 42)
  assert.equal(f.calls.policy[0].intent.extensionEnabled, true)
  assert.equal(f.calls.refresh, 1)
  assert.match(named(container, '保存前预览').textContent, /已保存并应用配置/)
  await click(named(container, '协作管理总闸（全局）'))
  await click(button(container, '保存并关闭协作管理'))
  assert.equal(f.calls.policy[1].revision, 43)
  assert.equal(f.calls.policy[1].intent.extensionEnabled, false)
})

test('sidebar collapsed decision reading survives classification and never claims awaiting means adjudicated', async t => {
  const instance = { instrumentInstanceId: 'native-i', ownerSessionId: 'native-owner', controlWorkspaceId: 'work-one' }
  let view = { sessionId: 'native-session', instance, caller: { kind: 'user', principalId: 'user:test', sessionId: null }, policyGrants: { schemaVersion: 1, revision: 0, grants: [] },
    policy: { controlWorkspaceId: 'work-one', extensionEnabled: true, features: {}, windows: { ticketWindowSize: null, runningSubagentLimit: null }, display: { header: true, inputSummary: true, rightPanel: true, sessionList: false, timeline: false } },
    records: { instance, scope: { kind: 'coordinator' }, businessRevision: 4, workflows: [], tickets: [], decisions: [{ workflowId: 'wf', decisionId: 'd', revision: 1, history: [], value: { question: '双旗标原生阅读问题', status: '仍需确认', pending: true, awaitingImplementation: true, addressee: { kind: 'user' }, options: [{ key: 'a', label: '选项真实甲' }] } }], summary: { countingScope: 'instance', totalTickets: 0, statusCounts: [], pendingDecisionCount: 1, pendingUserDecisionCount: 1, awaitingImplementationCount: 1 } }, windows: null, resources: [], capabilities: [], health: [] }
  const calls = [], remote = { readSupervision: async () => ok(null), applyInstrument: async (...args) => { calls.push(args); return ok({}) } }
  const observer = new client.SessionObserver(view.sessionId, async () => ok(copy(view)), 0); t.after(() => observer.dispose())
  const { container, window } = await mount(t, client.Details, { sessionId: view.sessionId, observer, remote, useTabInfo: () => ({ tab: { visible: true } }) })
  const pending = named(container, '待你裁决'), item = pending.querySelector('details[data-decision-item]')
  assert(item, 'sidebar uses same native collapsed item hierarchy'); assert.equal(item.open, false)
  assert.doesNotMatch(normalText(pending), /选项真实甲/)
  await React.act(async () => { item.open = true; item.dispatchEvent(new window.Event('toggle')) })
  assert.match(normalText(item), /选项真实甲/)
  await click(button(item, '阅读 / 编辑：双旗标原生阅读问题'))
  assert.doesNotMatch(named(container, '裁决阅读与编辑').textContent, /已裁决待落实|已裁决，仍待落实/)
  view = copy(view); view.records.decisions[0].value.pending = false; view.records.summary.pendingUserDecisionCount = 0
  await React.act(async () => observer.refresh())
  assert.equal(named(container, '待你裁决').querySelector('details[data-decision-item]'), item)
  assert.equal(item.open, true); assert.match(normalText(item), /已更新/)
  assert.deepEqual(calls, [])
  view = copy(view); view.policyGrants.revision = 2
  await React.act(async () => observer.refresh())
  assert.equal(container.contains(item), false)
  assert.equal(container.querySelector('textarea'), null, 'authorization revision clears editor draft')
})

test('sidebar deliberate reading keeps the same editor, draft CAS and focus when an item changes category', async t => {
  const instance = { instrumentInstanceId: 'reading-instance', ownerSessionId: 'reading-owner', controlWorkspaceId: 'work-one' }
  let view = { sessionId: 'reading-session', instance, caller: { kind: 'user', principalId: 'user:test', sessionId: null },
    policyGrants: { schemaVersion: 1, revision: 0, grants: [] }, policy: { controlWorkspaceId: 'work-one', extensionEnabled: true,
      features: {}, windows: { ticketWindowSize: null, runningSubagentLimit: null }, display: { header: true, inputSummary: true, rightPanel: true, sessionList: false, timeline: true } },
    records: { instance, scope: { kind: 'coordinator' }, businessRevision: 7, workflows: [], tickets: [], decisions: [{ workflowId: 'wf', decisionId: 'd', revision: 1, history: [], value: { question: '保持阅读的事项', status: '待确认', pending: true, addressee: { kind: 'user' } } }], summary: { countingScope: 'instance', totalTickets: 0, statusCounts: [], pendingUserDecisionCount: 1, awaitingImplementationCount: 0 } }, windows: null, resources: [], capabilities: [], health: [] }
  const calls = [], remote = { readSupervision: async () => ok(null), applyInstrument: async (...args) => { calls.push(args); return ok({}) } }
  const observer = new client.SessionObserver(view.sessionId, async () => ok(copy(view)), 0); t.after(() => observer.dispose())
  const props = { sessionId: view.sessionId, observer, remote, useTabInfo: () => ({ tab: { visible: true } }) }
  const { container, window, root } = await mount(t, client.Details, props)
  await click(button(container, '阅读 / 编辑：保持阅读的事项'))
  const reading = named(container, '裁决阅读与编辑'), textarea = reading.querySelector('textarea')
  await React.act(async () => { Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(textarea, '还没发送的草稿'); textarea.dispatchEvent(new window.Event('input', { bubbles: true })) })
  textarea.focus()
  view = copy(view); view.records.businessRevision = 8; view.records.decisions[0].value.pending = false; view.records.decisions[0].value.awaitingImplementation = true
  view.records.summary.pendingUserDecisionCount = 0; view.records.summary.awaitingImplementationCount = 1
  await React.act(async () => observer.refresh())
  assert.equal(named(container, '裁决阅读与编辑').querySelector('textarea'), textarea)
  assert.equal(textarea.value, '还没发送的草稿')
  assert.equal(window.document.activeElement, textarea)
  assert.match(reading.textContent, /草稿业务修订 7/)
  assert.match(reading.textContent, /已更新|待落实/)
  assert.doesNotMatch(named(container, '待你裁决').textContent, /保持阅读的事项/)
  await click(button(reading, '按明确选择记录裁决'))
  assert.equal(calls[0][1].expectedRevision, 7, 'background update never upgrades the editor draft CAS')
  await click(button(reading, '关闭阅读'))
  assert.equal(container.querySelector('[aria-label="裁决阅读与编辑"]'), null)
  const authorized = copy(view)
  for (const change of ['instance', 'caller', 'scope', 'grant-revision', 'display', 'revoked', 'unknown', 'session']) {
    await click(button(container, '阅读 / 编辑：保持阅读的事项'))
    assert(named(container, '裁决阅读与编辑').querySelector('textarea'))
    view = copy(authorized)
    if (change === 'instance') view.instance.instrumentInstanceId = 'new-reading-instance'
    if (change === 'caller') view.caller.principalId = 'other-principal'
    if (change === 'scope') view.records.scope = { kind: 'assigned', workflowId: 'other', ticketIds: [] }
    if (change === 'grant-revision') view.policyGrants.revision++
    if (change === 'display') view.policy.display.rightPanel = false
    if (change === 'revoked') { view.records = null; view.health = [{ scope: 'records', status: 'restricted', reason: 'revoked' }] }
    if (change === 'unknown') view = null
    if (change === 'session') await React.act(async () => root.render(React.createElement(client.Details, { ...props, sessionId: 'unrelated' })))
    else await React.act(async () => observer.refresh())
    assert.equal(container.querySelector('[aria-label="裁决阅读与编辑"]'), null, change + ' clears the reader synchronously')
    assert.equal(container.querySelector('textarea'), null, change + ' clears all editor drafts')
    view = copy(authorized)
    await React.act(async () => { await observer.refresh(); root.render(React.createElement(client.Details, props)) })
    assert.equal(container.querySelector('[aria-label="裁决阅读与编辑"]'), null, change + ' recovery never resurrects selection or draft')
  }
})

test('DOM saves supervision route and switch under its own revision, leaving policy untouched', async t => {
  const f = fixture(), { container, window } = await mount(t, client.SettingsPage, f.props)
  await React.act(async () => {})
  await select(named(container, '配置编辑范围'), '')
  await select(named(container, '请求启用交付监督'), 'on')
  await select(named(container, '模型路由'), 'explicit')
  for (const [label, value] of [['显式 provider', 'fixture-provider'], ['显式 model', 'fixture-model']]) {
    const input = named(container, label)
    await React.act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value)
      input.dispatchEvent(new window.Event('input', { bubbles: true }))
    })
  }
  assert.match(named(container, '交付监督配置').textContent, /配置修订 0/)
  await click(button(container, '保存监督配置'))
  assert.equal(f.calls.supervision.length, 1)
  assert.equal(f.calls.supervision[0].revision, 0)
  assert.deepEqual(f.calls.supervision[0].intent, { defaults: { enabled: true, reviewer: { routeMode: 'explicit', provider: 'fixture-provider', model: 'fixture-model' } }, workspaceOverrides: {} })
  assert.equal(f.calls.policy.length, 0)
})

test('supervision route supports unset, explicit main-route inheritance, and explicit provider override independently', async t => {
  const original = { schemaVersion: 1, revision: 9, defaults: { reviewer: { routeMode: 'explicit', provider: 'global-provider', model: 'global-model' } }, workspaceOverrides: {} }
  const f = fixture({ readSupervisionConfig: async () => ok(copy(original)) })
  const { container } = await mount(t, client.SupervisionSettingsPanel, { remote: f.remote, workspace: 'work-one' })
  const route = named(container, '模型路由')
  assert.equal(route.value, '__unset__')
  assert.match(route.closest('label').textContent, /有效值：显式/)
  await select(route, 'inherit')
  assert.equal(route.value, 'inherit', 'wire inherit is a real override, not delete')
  assert.match(route.closest('label').textContent, /有效值：继承主路由/)
  await click(button(container, '保存监督配置'))
  assert.deepEqual(f.calls.supervision.at(-1).intent.workspaceOverrides, { 'work-one': { reviewer: { routeMode: 'inherit' } } })
  await select(route, 'explicit'); await click(button(container, '保存监督配置'))
  assert.deepEqual(f.calls.supervision.at(-1).intent.workspaceOverrides, { 'work-one': { reviewer: { routeMode: 'explicit' } } })
  await select(route, '__unset__'); await click(button(container, '保存监督配置'))
  assert.deepEqual(f.calls.supervision.at(-1).intent.workspaceOverrides, {})
  assert.equal(f.calls.policy.length, 0)
})

test('decision interaction enum preserves sparse inheritance, scope drafts, sources, and original save revision', async t => {
  const policy = { revision: 42, extensionEnabled: true, defaults: { workspace: { enabled: true }, pendingDecisions: { enabled: true, interactionMode: 'async-decision' } }, workspaceOverrides: {} }
  const f = fixture({ readPolicy: async () => ok(copy(policy)) })
  const { container } = await mount(t, client.SettingsPage, f.props)
  const mode = () => named(container, '裁决交互偏好')
  assert.equal(mode().value, '__unset__')
  assert.match(mode().closest('label').textContent, /草稿有效值：异步裁决优先.*来源：全局默认/)
  await select(mode(), 'native-question')
  assert.match(mode().closest('label').textContent, /来源：工作区覆盖/)
  await select(named(container, '配置编辑范围'), '')
  assert.equal(mode().value, 'async-decision')
  await select(mode(), 'native-question')
  await select(named(container, '配置编辑范围'), 'work-one')
  assert.equal(mode().value, 'native-question', 'scope change retains unsaved workspace draft')
  await click(button(container, '保存并应用配置'))
  assert.equal(f.calls.policy[0].revision, 42)
  assert.deepEqual(f.calls.policy[0].intent.workspaceOverrides, { 'work-one': { pendingDecisions: { interactionMode: 'native-question' } } })
  assert.equal(f.calls.policy[0].intent.defaults.pendingDecisions.interactionMode, 'native-question')
  await select(mode(), '__unset__')
  await click(button(container, '保存并应用配置'))
  assert.equal(f.calls.policy[1].revision, 43)
  assert.deepEqual(f.calls.policy[1].intent.workspaceOverrides, {})
  assert.equal(f.calls.supervision.length, 0)
})

test('Chinese field controls preserve raw wire names, explicit false and sparse inheritance', async t => {
  const policy = { revision: 42, extensionEnabled: true, defaults: { workspace: { enabled: true }, binding: { enabled: true } }, workspaceOverrides: { 'work-one': { binding: { enabled: false } } } }
  const f = fixture({ readPolicy: async () => ok(copy(policy)) }), { container, window } = await mount(t, client.SettingsPage, f.props)
  const binding = named(container, '工作树绑定')
  assert.equal(binding.value, 'off')
  assert.match(binding.closest('label').textContent, /工作区覆盖/)
  await select(binding, 'inherit')
  assert.match(binding.closest('label').textContent, /全局默认/)
  await select(named(container, '子代理生命周期观测'), 'off')
  await select(named(container, '输入区摘要'), 'on')
  const capacity = [...container.querySelectorAll('input[type="number"]')].find(row => row.getAttribute('aria-label').includes('任务票'))
  assert(capacity, 'task reference input has Chinese accessible label')
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(capacity, '3')
    capacity.dispatchEvent(new window.Event('input', { bubbles: true }))
  })
  assert.equal(capacity.value, '3')
  await click(button(container, '保存并应用配置'))
  assert.equal(f.calls.policy[0].revision, 42)
  assert.deepEqual(f.calls.policy[0].intent, { extensionEnabled: true, defaults: { workspace: { enabled: true }, binding: { enabled: true } }, workspaceOverrides: {
    'work-one': { lifecycle: { enabled: false }, windows: { ticketWindowSize: 3 }, display: { inputSummary: true } },
  } })
})

test('input summary DOM centers its bounded box and column text without turning unknown usage into zero', async t => {
  const instance = { instrumentInstanceId: 'dom-instance', ownerSessionId: 'dom-owner', controlWorkspaceId: 'work-one' }
  const view = { sessionId: 'dom-session', instance, caller: { kind: 'user', principalId: 'user:test', sessionId: null },
    policyGrants: { schemaVersion: 1, revision: 0, grants: [] }, policy: { controlWorkspaceId: 'work-one', extensionEnabled: true,
      features: {}, windows: { ticketWindowSize: null, runningSubagentLimit: null },
      display: { header: true, inputSummary: true, rightPanel: true, sessionList: false, timeline: true } },
    records: null, windows: null, resources: [], capabilities: [], health: [] }
  const observer = new client.SessionObserver('dom-session', async () => ok(view), 0)
  t.after(() => observer.dispose())
  const { container } = await mount(t, client.ObservedInputSummary, { sessionId: 'dom-session', observer, openDetails: () => { throw new Error('automatic panel opening') } })
  const summary = named(container, '协作进度摘要')
  assert.equal(summary.style.display, 'flex')
  assert.equal(summary.style.flexDirection, 'column')
  assert.equal(summary.style.alignItems, 'center')
  assert.equal(summary.style.textAlign, 'center')
  assert.equal(summary.style.boxSizing, 'border-box')
  assert.equal(summary.style.width, 'calc(100% - 2 * var(--dsh-composer-side-clearance, 16px))')
  assert.equal(summary.style.maxWidth, 'var(--dsh-composer-card-max-width, 952px)')
  assert.equal(summary.style.marginInline, 'auto')
  assert.equal(Number.parseFloat(summary.style.minWidth), 0)
  assert.equal(summary.style.overflowWrap, 'anywhere')
  // Only progress scrolls at 96px; reminder text and inline disclosures remain outside it.
  const progress = named(container, '工作流进度')
  const reminders = named(container, '常驻协作提醒')
  assert.notEqual(summary.style.maxHeight, '96px')
  assert.equal(progress.style.maxHeight, '96px')
  assert.equal(progress.style.overflowY, 'auto')
  assert.equal(progress.contains(reminders), false)
  assert.match(reminders.textContent, /T 未知/)
  assert.match(reminders.textContent, /S 未知/)
  assert.match(summary.textContent, /T 未知/)
  assert.match(summary.textContent, /S 未知/)
  assert.doesNotMatch(summary.textContent, /S 0|T 0/)
})

test('management rejected save retains DOM draft without claiming it is applied', async t => {
  const f = fixture({ savePolicy: async (_intent, revision) => { assert.equal(revision, 42); throw new Error('controlled revision conflict') } })
  const { container } = await mount(t, client.SettingsPage, f.props)
  await click(named(container, '协作管理总闸（全局）'))
  await click(button(container, '保存并启用协作管理'))
  assert.equal(named(container, '协作管理总闸（全局）').checked, true)
  const preview = named(container, '保存前预览')
  assert.match(preview.textContent, /保存结果未确认/)
  assert.match(preview.textContent, /有未保存更改/)
  assert.doesNotMatch(preview.textContent, /已保存并应用配置/)
  assert.equal(f.calls.refresh, 0)
  await click(button(container, '放弃未保存更改'))
  assert.equal(named(container, '协作管理总闸（全局）').checked, false)
  assert.equal(button(container, '保存并应用配置').disabled, true)
})

test('DOM session selection cancels old reads and does not upgrade policy draft revision', async t => {
  const reads = [], observers = new Map()
  let finishA
  const instance = { instrumentInstanceId: 'dom-instance', ownerSessionId: 'dom-owner', controlWorkspaceId: 'work-one' }
  const view = sessionId => ({ sessionId, instance, caller: { kind: 'user', principalId: 'user:test', sessionId: null },
    policyGrants: { schemaVersion: 1, revision: 0, grants: [] }, policy: { controlWorkspaceId: 'work-one', configurationRevision: 99, extensionEnabled: true,
      features: {}, windows: { ticketWindowSize: null, runningSubagentLimit: null },
      display: { header: true, inputSummary: false, rightPanel: true, sessionList: false, timeline: true } },
    records: null, windows: null, resources: [], capabilities: [], health: [] })
  const f = fixture({ listWorkspaces: async () => ok([{ id: 'work-one', title: '审计工作区', status: 'ok', sessionIds: ['A', 'B'] }]),
    readSession: (id, signal) => { reads.push({ id, signal }); return id === 'A' ? new Promise(resolve => { finishA = resolve }) : Promise.resolve(ok(view(id))) } })
  f.props.observe = id => {
    if (!observers.has(id)) observers.set(id, new client.SessionObserver(id, f.remote.readSession, 0))
    return observers.get(id)
  }
  const { container } = await mount(t, client.SettingsPage, f.props)
  t.after(() => { for (const observer of observers.values()) observer.dispose() })
  assert.deepEqual(reads, [], 'mount alone does not observe sessions')
  await select(named(container, '选择查看会话'), 'A')
  assert.equal(reads[0].id, 'A')
  await select(named(container, '选择查看会话'), 'B')
  assert.equal(reads[0].signal.aborted, true)
  await React.act(async () => finishA(ok(view('A'))))
  const inspection = named(container, '会话状态查看')
  assert.match(inspection.textContent, /所选会话 B/)
  assert.doesNotMatch(inspection.textContent, /所选会话 A/)
  assert.deepEqual(reads.map(row => row.id), ['A', 'B'])
  await click(named(container, '协作管理总闸（全局）'))
  await click(button(container, '保存并启用协作管理'))
  assert.equal(f.calls.policy[0].revision, 42, 'inspection revision ninety-nine never upgrades opening policy CAS')
  await select(named(container, '配置编辑范围'), '')
  assert.equal(named(container, '选择查看会话').value, '')
})

for (const [countingScope, label, otherLabel] of [
  ['instance', '当前实例统计', '当前分配范围统计'],
  ['assignment', '当前分配范围统计', '当前实例统计'],
]) {
  test('input summary DOM preserves actual ' + countingScope + ' counting scope and business counts', async t => {
    const instance = { instrumentInstanceId: 'dom-instance', ownerSessionId: 'dom-owner', controlWorkspaceId: 'work-one' }
    const view = { sessionId: 'dom-session', instance, caller: { kind: 'user', principalId: 'user:test', sessionId: null },
      policyGrants: { schemaVersion: 1, revision: 0, grants: [] }, policy: { controlWorkspaceId: 'work-one', extensionEnabled: true,
        features: {}, windows: { ticketWindowSize: null, runningSubagentLimit: null },
        display: { header: true, inputSummary: true, rightPanel: true, sessionList: false, timeline: true } },
      records: { instance, summary: { countingScope, totalTickets: 7, statusCounts: [{ workflowId: 'workflow-test', axisKey: 'review', label: '任务自定义验收', counting: 'exclusive',
        statuses: [{ statusKey: 'custom-ready', label: '部分接口可评审', count: 3 }] }] } },
      windows: null, resources: [], capabilities: [], health: [] }
    const observer = new client.SessionObserver('dom-session', async () => ok(view), 0)
    t.after(() => observer.dispose())
    const { container } = await mount(t, client.ObservedInputSummary, { sessionId: 'dom-session', observer, openDetails: () => { throw new Error('automatic panel opening') } })
    const summary = named(container, '协作进度摘要')
    assert(summary.textContent.includes(label))
    assert(!summary.textContent.includes(otherLabel), 'scope is translated from actual facts, not hardcoded')
    assert.match(summary.textContent, /票 7/)
    assert.match(summary.textContent, /部分接口可评审 3/)
    assert.match(summary.textContent, /任务自定义验收/)
    assert.match(summary.textContent, /T 未知/)
    assert.match(summary.textContent, /S 未知/)
  })
}

test('input summary orders workflows by latest activity and collapses older work behind explicit details', async t => {
  const instance = { instrumentInstanceId: 'dom-instance', ownerSessionId: 'dom-owner', controlWorkspaceId: 'work-one' }
  const axis = (workflowId, label, statuses) => ({ workflowId, axisKey: 'state', label, counting: 'exclusive', unreported: 0, statuses })
  const workflows = [
    { workflowId: 'old-flow', revision: 1 },
    { workflowId: 'empty-flow', revision: 20 },
    { workflowId: 'mid-flow', revision: 5 },
    { workflowId: 'new-flow', revision: 6 },
  ]
  const tickets = [
    { workflowId: 'old-flow', localTicketId: 'T1', revision: 1 },
    { workflowId: 'old-flow', localTicketId: 'T2', revision: 2 },
    { workflowId: 'old-flow', localTicketId: 'T3', revision: 3 },
    { workflowId: 'old-flow', localTicketId: 'T4', revision: 4 },
    { workflowId: 'mid-flow', localTicketId: 'T5', revision: 30 },
    { workflowId: 'new-flow', localTicketId: 'T6', revision: 40 },
  ]
  const statusCounts = [
    axis('old-flow', '交付', [{ statusKey: 'done', label: '已交付', count: 4 }]),
    axis('empty-flow', '设计阶段', [{ statusKey: 'research', label: '研究中', count: 0 }, { statusKey: 'discussion', label: '待讨论', count: 0 }]),
    axis('mid-flow', '交付', [{ statusKey: 'todo', label: '未开始', count: 7 }, { statusKey: 'doing', label: '实施中', count: 1 }]),
    axis('new-flow', '交付', [{ statusKey: 'todo', label: '未开始', count: 8 }, { statusKey: 'doing', label: '实施中', count: 1 }]),
  ]
  const view = { sessionId: 'dom-session', instance, caller: { kind: 'user', principalId: 'user:test', sessionId: null },
    policyGrants: { schemaVersion: 1, revision: 0, grants: [] },
    policy: { controlWorkspaceId: 'work-one', extensionEnabled: true, workspaceEnabled: true,
      features: {}, windows: { ticketWindowSize: null, runningSubagentLimit: null },
      display: { header: true, inputSummary: true, rightPanel: true, sessionList: false, timeline: true } },
    records: { instance, workflows, tickets, summary: { countingScope: 'instance', totalTickets: 6, statusCounts } },
    windows: null, resources: [], capabilities: [], health: [] }
  const observer = new client.SessionObserver('dom-session', async () => ok(view), 0)
  t.after(() => observer.dispose())
  let details = 0
  const { container } = await mount(t, client.ObservedInputSummary, { sessionId: 'dom-session', observer, openDetails: () => { details += 1 } })
  const summary = named(container, '协作进度摘要')
  const text = summary.textContent
  assert(text.indexOf('T 未知') < text.indexOf('new-flow'), 'global T/S stays above the current workflow')
  assert(text.indexOf('new-flow') < text.indexOf('mid-flow'), 'a newer ticket lifts its older workflow above mere definition order')
  assert(!text.includes('old-flow') && !text.includes('empty-flow'), 'only the two most recently active workflows are expanded')
  assert.match(text, /其余 2 个工作流 · 查看详情/)
  assert.equal(details, 0, 'rendering never opens the details panel by itself')
  await click(button(container, '其余 2 个工作流 · 查看详情'))
  assert.equal(details, 1, 'the folded workflows have an explicit details entrance')
})

test('input summary shows a ticketless workflow compactly and never hides rows without a details entrance', async t => {
  const instance = { instrumentInstanceId: 'dom-instance', ownerSessionId: 'dom-owner', controlWorkspaceId: 'work-one' }
  const axis = (workflowId, label, statuses) => ({ workflowId, axisKey: 'state', label, counting: 'exclusive', unreported: 0, statuses })
  const workflows = [
    { workflowId: 'old-flow', revision: 1 },
    { workflowId: 'active-flow', revision: 8 },
    { workflowId: 'design-flow', revision: 7 },
  ]
  const tickets = [
    { workflowId: 'old-flow', localTicketId: 'T1', revision: 2 },
    { workflowId: 'active-flow', localTicketId: 'T2', revision: 10 },
  ]
  const statusCounts = [
    axis('old-flow', '交付', [{ statusKey: 'done', label: '已交付', count: 1 }]),
    axis('active-flow', '交付', [{ statusKey: 'doing', label: '实施中', count: 1 }]),
    axis('design-flow', '设计阶段', [{ statusKey: 'research', label: '研究中', count: 0 }, { statusKey: 'discussion', label: '待讨论', count: 0 }]),
  ]
  const view = { sessionId: 'dom-session', instance, caller: { kind: 'user', principalId: 'user:test', sessionId: null },
    policyGrants: { schemaVersion: 1, revision: 0, grants: [] },
    policy: { controlWorkspaceId: 'work-one', extensionEnabled: true, workspaceEnabled: true,
      features: {}, windows: { ticketWindowSize: null, runningSubagentLimit: null },
      display: { header: true, inputSummary: true, rightPanel: false, sessionList: false, timeline: true } },
    records: { instance, workflows, tickets, summary: { countingScope: 'instance', totalTickets: 2, statusCounts } },
    windows: null, resources: [], capabilities: [], health: [] }
  const observer = new client.SessionObserver('dom-session', async () => ok(view), 0)
  t.after(() => observer.dispose())
  const { container } = await mount(t, client.ObservedInputSummary, { sessionId: 'dom-session', observer, openDetails: () => assert.fail('disabled details entrance must not be advertised') })
  const summary = named(container, '协作进度摘要')
  const text = summary.textContent
  assert.match(text, /design-flow \/ 设计阶段 · 暂无票/)
  assert.doesNotMatch(text, /研究中 0|待讨论 0/)
  assert.match(text, /old-flow/)
  assert.match(text, /active-flow/)
  assert.doesNotMatch(text, /其余 \d+ 个工作流|查看详情/)
})

test('settings use native primitives with reachable collapsed advanced sections and truthful runtime wording', async t => {
  const f = fixture(), { container } = await mount(t, client.SettingsPage, f.props)
  const advanced = named(container, '进阶交付监督'), inspection = named(container, '会话状态查看')
  assert.equal(advanced.tagName, 'DETAILS'); assert.equal(advanced.open, false)
  assert.equal(inspection.tagName, 'DETAILS'); assert.equal(inspection.open, false)
  for (const node of [advanced, inspection]) { assert.equal(node.querySelector('summary').tabIndex, 0); await click(node.querySelector('summary')) }
  assert.equal(advanced.open, true); assert.equal(inspection.open, true)
  assert(container.querySelector('[data-native-primitive="Checkbox"]'))
  assert(container.querySelector('[data-native-primitive="Input"]'))
  assert(container.querySelector('[data-native-primitive="Button"]'))
  assert.doesNotMatch(container.textContent, /运行时尚需后续阶段接入|本阶段只保存配置|不启动审计、不注册工具、不产生模型调用/)
  assert.match(container.textContent, /保存不代表.*模型|不保证.*模型/)
  assert.equal(named(container, '协作管理总闸（全局）').closest('label').style.background, '')
})

test('settings DOM separates Chinese configuration groups and collapsed technical diagnostics', async t => {
  const f = fixture(), { container } = await mount(t, client.SettingsPage, f.props)
  const management = named(container, '工作区协作管理')
  const preview = named(container, '保存前预览')
  const inspection = named(container, '会话状态查看')
  assert(management.compareDocumentPosition(preview) & 4)
  assert(preview.compareDocumentPosition(inspection) & 4)
  for (const label of ['工作树绑定', '子代理生命周期观测', '任务与子代理参考窗口', '任务票进度', '待裁决事项', '会话标题栏', '输入区摘要', '右侧协作面板', '会话列表提醒', '工具记录标注']) {
    assert([...container.querySelectorAll('label')].some(row => row.textContent.includes(label)), 'missing Chinese field: ' + label)
  }
  assert.match(normalText(container), /安全初始值/)
  assert.doesNotMatch(normalText(container), /Profile|epoch|Session|ticketWindowSize|runningSubagentLimit|safe-initial|unsupported|pending-restart/)
  const raw = [...container.querySelectorAll('pre')]
  assert(raw.length > 0, 'technical originals remain accessible')
  for (const node of raw) { const details = node.closest('details'); assert(details, 'technical data must be in details'); assert.equal(details.open, false) }
  assert.deepEqual(f.calls.observe, [])
})

test('real DOM exposes the workspace gate and skill switch as explicit per-workspace leaves', async t => {
  const f = fixture()
  const { container } = await mount(t, client.SettingsPage, f.props)
  const gate = named(container, '本工作区总闸')
  const skills = named(container, '本工作区技能分发')
  assert.equal(gate.value, 'inherit')
  assert.equal(skills.value, 'inherit')
  assert.match(normalText(container), /本工作区总闸继承全局启用禁用未启用/)
  assert.match(normalText(container), /本工作区总闸：未开/)
  assert.match(normalText(container), /本工作区技能分发继承全局启用禁用启用/)
  await select(named(container, '配置编辑范围'), 'work-one')
  await select(gate, 'on')
  await select(skills, 'off')
  await click(button(container, '保存并应用配置'))
  const saved = f.calls.policy.at(-1)
  assert.deepEqual(saved.intent.workspaceOverrides['work-one'], { workspace: { enabled: true }, skills: { enabled: false } })
  assert.deepEqual(saved.intent.defaults, {})
})

test('input summary reports the closed global gate instead of live-looking numbers', async t => {
  const instance = { instrumentInstanceId: 'dom-instance', ownerSessionId: 'dom-owner', controlWorkspaceId: 'work-one' }
  const view = { sessionId: 'dom-session', instance, caller: { kind: 'user', principalId: 'user:test', sessionId: null },
    policyGrants: { schemaVersion: 1, revision: 0, grants: [] },
    policy: { controlWorkspaceId: 'work-one', extensionEnabled: false, workspaceEnabled: true,
      features: {}, windows: { ticketWindowSize: null, runningSubagentLimit: null },
      display: { header: true, inputSummary: true, rightPanel: true, sessionList: false, timeline: true } },
    records: { instance, summary: { countingScope: 'instance', totalTickets: 7, statusCounts: [] } },
    windows: null, resources: [], capabilities: [], health: [] }
  const observer = new client.SessionObserver('dom-session', async () => ok(view), 0)
  t.after(() => observer.dispose())
  const { container } = await mount(t, client.ObservedInputSummary, { sessionId: 'dom-session', observer, openDetails: () => { throw new Error('automatic panel opening') } })
  const summary = named(container, '协作进度摘要')
  assert.match(summary.textContent, /协作管理未生效：全局总闸已关闭/)
  assert.doesNotMatch(summary.textContent, /本工作区总闸已关闭/)
})

test('input summary reports the closed workspace gate distinctly from the global gate', async t => {
  const instance = { instrumentInstanceId: 'dom-instance', ownerSessionId: 'dom-owner', controlWorkspaceId: 'work-one' }
  const view = { sessionId: 'dom-session', instance, caller: { kind: 'user', principalId: 'user:test', sessionId: null },
    policyGrants: { schemaVersion: 1, revision: 0, grants: [] },
    policy: { controlWorkspaceId: 'work-one', extensionEnabled: true, workspaceEnabled: false,
      features: {}, windows: { ticketWindowSize: null, runningSubagentLimit: null },
      display: { header: true, inputSummary: true, rightPanel: true, sessionList: false, timeline: true } },
    records: { instance, summary: { countingScope: 'instance', totalTickets: 7, statusCounts: [] } },
    windows: null, resources: [], capabilities: [], health: [] }
  const observer = new client.SessionObserver('dom-session', async () => ok(view), 0)
  t.after(() => observer.dispose())
  const { container } = await mount(t, client.ObservedInputSummary, { sessionId: 'dom-session', observer, openDetails: () => { throw new Error('automatic panel opening') } })
  const summary = named(container, '协作进度摘要')
  assert.match(summary.textContent, /协作管理未生效：本工作区总闸已关闭/)
  assert.doesNotMatch(summary.textContent, /全局总闸已关闭/)
})

test('input summary stays silent while both gates are open', async t => {
  const instance = { instrumentInstanceId: 'dom-instance', ownerSessionId: 'dom-owner', controlWorkspaceId: 'work-one' }
  const view = { sessionId: 'dom-session', instance, caller: { kind: 'user', principalId: 'user:test', sessionId: null },
    policyGrants: { schemaVersion: 1, revision: 0, grants: [] },
    policy: { controlWorkspaceId: 'work-one', extensionEnabled: true, workspaceEnabled: true,
      features: {}, windows: { ticketWindowSize: null, runningSubagentLimit: null },
      display: { header: true, inputSummary: true, rightPanel: true, sessionList: false, timeline: true } },
    records: { instance, summary: { countingScope: 'instance', totalTickets: 7, statusCounts: [] } },
    windows: null, resources: [], capabilities: [], health: [] }
  const observer = new client.SessionObserver('dom-session', async () => ok(view), 0)
  t.after(() => observer.dispose())
  const { container } = await mount(t, client.ObservedInputSummary, { sessionId: 'dom-session', observer, openDetails: () => { throw new Error('automatic panel opening') } })
  const summary = named(container, '协作进度摘要')
  assert.match(summary.textContent, /票 7/)
  assert.doesNotMatch(summary.textContent, /协作管理未生效/)
})

test('hidden header input and source cards use summary policy without retaining a full snapshot', async t => {
  const display = { header: false, inputSummary: false, rightPanel: true, sessionList: false, timeline: false }
  const instance = { instrumentInstanceId: 'gate-instance', ownerSessionId: 'gate', controlWorkspaceId: 'work-one' }
  let fullReads = 0
  const scheduler = new client.SummaryScheduler(async request => ok({ rows: request.sessions.map(({ sessionId }) => ({ sessionId, status: 'current', version: 'a'.repeat(64),
    summary: { sessionId, caller: { kind: 'user', principalId: 'user:test', sessionId: null }, instance,
      policy: { configurationRevision: 1, controlWorkspaceId: 'work-one', workspaceVerified: true, extensionEnabled: false, workspaceEnabled: false, display: { ...display } },
      records: { businessRevision: 0, viewerRevision: 0, summary: { countingScope: 'instance', pendingUserDecisionCount: 0 } }, health: [] } })) }))
  const cache = new client.SessionObserverCache(async sessionId => { fullReads++; return ok({ sessionId, instance, caller: { kind: 'user', principalId: 'user:test', sessionId: null }, policyGrants: { schemaVersion: 1, revision: 0, grants: [] },
    policy: { controlWorkspaceId: 'work-one', configurationRevision: 1, display: { ...display }, features: {}, windows: { ticketWindowSize: null, runningSubagentLimit: null } }, records: null, windows: null, resources: [], capabilities: [], health: [] }) }, 0)
  t.after(() => { scheduler.dispose(); cache.dispose() })
  const face = { summary: scheduler.observe('gate'), observe: () => cache.observe('gate'), openDetails: () => assert.fail('must never auto-open') }
  const block = { kind: 'tool-result', time: 1, seq: 2, call: null, content: [{ type: 'text', text: 'historical source survives display hiding' }], isError: false }
  function useDisclosureStub() {
    const [expanded, setExpanded] = React.useState(false)
    return { expanded, toggle: () => setExpanded(value => !value) }
  }
  function Gates() { return React.createElement(React.Fragment, null,
    React.createElement(client.HeaderEntry, { sessionId: 'gate', ...face }), React.createElement(client.InputSummary, { sessionId: 'gate', ...face }),
    React.createElement(client.SourceCard, { phase: 'result', callId: 'c', toolName: 'mattpocock_record', block, useDisclosure: useDisclosureStub, ...face })) }
  const { container } = await mount(t, Gates, {})
  const flush = async () => React.act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
  await flush()
  assert.equal(fullReads, 0); assert.equal(cache.size, 0)
  assert.doesNotMatch(container.textContent, /historical source survives/, 'the source card starts collapsed')
  await click(container.querySelector('[data-disclosure-row]'))
  assert.match(container.textContent, /historical source survives/)
  display.header = true; display.inputSummary = true; scheduler.refresh(); await flush()
  assert.equal(fullReads, 1, 'visible header and input share one full observer')
  assert.equal(cache.size, 1)
  display.header = false; display.inputSummary = false; scheduler.refresh(); await flush()
  assert.equal(cache.observe('gate').getSnapshot().status, 'unknown', 'hiding both surfaces releases the last full holder')
  assert.equal(fullReads, 1); assert.match(container.textContent, /historical source survives/)
})

test('expanded source card uses readable code blocks, preserves raw details, and gates its action', async t => {
  const summary = { sessionId: 'source', caller: { kind: 'user', principalId: 'user:test', sessionId: null },
    instance: { instrumentInstanceId: 'source-instance', ownerSessionId: 'source', controlWorkspaceId: 'work-one' },
    policy: { configurationRevision: 1, controlWorkspaceId: 'work-one', workspaceVerified: true, extensionEnabled: true, workspaceEnabled: true,
      display: { header: false, inputSummary: false, rightPanel: true, sessionList: false, timeline: true } },
    records: { businessRevision: 0, viewerRevision: 0, summary: { countingScope: 'instance', pendingUserDecisionCount: 0 } }, health: [] }
  const observation = { status: 'ready', value: summary, error: null }
  const summaryObserver = { getSnapshot: () => observation, subscribe: () => () => {}, retain: () => () => {}, refresh: () => {} }
  let opened = 0
  const block = { kind: 'tool-result', time: 1, seq: 2, call: { argsRaw: JSON.stringify({ request: { action: 'read', workflowId: 'W' } }) },
    content: [{ type: 'text', text: JSON.stringify({ ok: true, rows: [1, 2] }) }], isError: false }
  function Card() { return React.createElement(client.SourceCard, { phase: 'result', callId: 'c', toolName: 'mattpocock_record', block,
    summary: summaryObserver, observe: () => {}, openDetails: () => { opened++ }, useDisclosure: () => ({ expanded: true, toggle: () => {} }) }) }
  const { container, root } = await mount(t, Card, {})
  assert.equal(container.querySelectorAll('pre[data-code-block="json"]').length, 2)
  assert.match(container.textContent, /"ok": true/)
  assert.match(container.textContent, /历史快照/)
  const raw = container.querySelector('details[data-json-block]')
  assert(raw, 'raw source disclosure must exist'); assert.equal(raw.open, false)
  await click(raw.querySelector('summary')); assert.equal(raw.open, true)
  assert.match(container.textContent, /original historical source|mattpocock_record/)
  await click(button(container, '打开当前实例')); assert.equal(opened, 1)
  summary.policy.display.timeline = false
  await React.act(async () => root.render(React.createElement(Card)))
  assert.doesNotMatch(container.textContent, /历史快照/)
  assert.equal([...container.querySelectorAll('button')].some(row => row.textContent === '打开当前实例'), false)
  summary.policy.display.timeline = true; summary.policy.display.rightPanel = false
  await React.act(async () => root.render(React.createElement(Card)))
  assert.match(container.textContent, /历史快照/)
  assert.equal([...container.querySelectorAll('button')].some(row => row.textContent === '打开当前实例'), false)
})

test('expanded source card distinguishes unknown input, empty output, plain text, and JSON', async t => {
  const summary = { sessionId: 'source', caller: { kind: 'user', principalId: 'user:test', sessionId: null },
    instance: { instrumentInstanceId: 'source-instance', ownerSessionId: 'source', controlWorkspaceId: 'work-one' },
    policy: { configurationRevision: 1, controlWorkspaceId: 'work-one', workspaceVerified: true, extensionEnabled: true, workspaceEnabled: true,
      display: { header: false, inputSummary: false, rightPanel: true, sessionList: false, timeline: false } },
    records: { businessRevision: 0, viewerRevision: 0, summary: { countingScope: 'instance', pendingUserDecisionCount: 0 } }, health: [] }
  const observation = { status: 'ready', value: summary, error: null }
  const summaryObserver = { getSnapshot: () => observation, subscribe: () => () => {}, retain: () => () => {}, refresh: () => {} }
  const empty = { kind: 'tool-result', time: 1, seq: 2, call: null, content: [], isError: false }
  function Card({ value }) { return React.createElement(client.SourceCard, { phase: 'result', callId: 'c', toolName: 'mattpocock_record', block: value,
    summary: summaryObserver, observe: () => {}, openDetails: () => assert.fail('timeline is closed'), useDisclosure: () => ({ expanded: true, toggle: () => {} }) }) }
  const { container, root } = await mount(t, Card, { value: empty })
  assert.match(container.textContent, /输入未知（调用头不在当前窗口）/)
  assert.match(container.textContent, /无输出/)
  await React.act(async () => root.render(React.createElement(Card, { value: { ...empty, content: [{ type: 'text', text: 'line one\nline two' }] } })))
  assert.match(container.textContent, /line one/)
  assert.match(container.textContent, /line two/)
  assert.equal(container.querySelectorAll('pre[data-code-block="json"]').length, 0)
  await React.act(async () => root.render(React.createElement(Card, { value: { ...empty, content: [{ type: 'text', text: '{"ok":true}' }] } })))
  assert.equal(container.querySelectorAll('pre[data-code-block="json"]').length, 1)
  assert.match(container.textContent, /"ok": true/)
})

test('badge policy gate stays idle at the same committed revision and resumes on root policy revision', async t => {
  let revision = 1, reads = 0, fullReads = 0, enabled = false, unknown = false
  const visibility = new client.PolicyObserver(async () => ok({ revision, extensionEnabled: false, defaults: { display: { sessionList: true } }, workspaceOverrides: {} }))
  const scheduler = new client.SummaryScheduler(async request => { reads++; return ok({ rows: request.sessions.map(({ sessionId }) => ({ sessionId, status: 'current', version: 'b'.repeat(64),
    summary: { sessionId, caller: { kind: 'user', principalId: 'user:test', sessionId: null }, instance: { instrumentInstanceId: 'i', ownerSessionId: sessionId, controlWorkspaceId: 'W' },
      policy: { configurationRevision: revision, controlWorkspaceId: 'W', workspaceVerified: true, extensionEnabled: false, workspaceEnabled: false,
        display: { header: false, inputSummary: false, rightPanel: false, sessionList: enabled, timeline: false } },
      records: unknown ? null : { businessRevision: 1, viewerRevision: 0, summary: { countingScope: 'instance', pendingUserDecisionCount: 1 } },
      health: unknown ? [{ scope: 'records', status: 'unknown', reason: 'read failed' }] : [] } })) }) })
  t.after(() => { scheduler.dispose(); visibility.dispose() })
  await visibility.refresh()
  const props = { sessionId: 'badge', visibility, observeSummary: id => scheduler.observe(id), observe: () => { fullReads++; throw new Error('badge must not use full read') } }
  const { container } = await mount(t, client.WorkspaceBadge, props)
  const flush = async () => React.act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
  await flush(); assert.equal(reads, 1); assert.equal(container.textContent, '')
  await React.act(async () => visibility.refresh()); await flush()
  assert.equal(reads, 1, 'false per-session display does not resume merely because root policy rerendered')
  revision = 2; enabled = true
  await React.act(async () => visibility.refresh()); await flush()
  assert.equal(reads, 2); assert.equal(container.textContent, '1')
  unknown = true; scheduler.refresh(); await flush()
  assert.equal(container.textContent, '?', 'missing records are unknown, never a fabricated zero')
  assert.equal(fullReads, 0)
})

test('settings visual hierarchy distinguishes scope, draft, grouped controls and primary policy save', async t => {
  const f = fixture(), { container } = await mount(t, client.SettingsPage, f.props)
  assert.equal(container.querySelector('h2')?.textContent, '协作与提醒')
  const scope = named(container, '范围与总闸')
  assert(scope.contains(named(container, '配置编辑范围')))
  assert(scope.contains(named(container, '协作管理总闸（全局）')))
  assert.match(scope.textContent, /切换范围保留草稿，保存会提交全部策略更改/)
  for (const title of ['协作功能', '参考上限', '界面显示位置']) {
    const legend = [...container.querySelectorAll('legend')].find(node => node.textContent === title)
    assert(legend, title)
    assert.equal(legend.parentElement.tagName, 'FIELDSET')
    assert(legend.style.fontWeight >= '600')
  }
  const preview = named(container, '保存前预览')
  assert.match(preview.textContent, /与已保存配置一致/)
  await click(named(container, '协作管理总闸（全局）'))
  assert.match(preview.textContent, /待保存草稿/)
  const save = button(container, '保存并启用协作管理')
  assert.equal(save.dataset.nativeVariant, 'primary')
  assert.equal(button(preview, '放弃未保存更改').dataset.nativeVariant, 'ghost')
  assert.match(named(container, '工作区协作管理').textContent, /草稿有效值/)
  assert.equal(f.calls.policy.length, 0, 'visual changes never auto-save')
  await click(save)
  assert.match(preview.textContent, /与已保存配置一致/)
  assert.equal(f.calls.policy[0].revision, 42)
})


test('browser reminders group native controls by channel and retain a separate primary save area', async t => {
  const f = fixture(), { container } = await mount(t, client.SettingsPage, f.props)
  const reminders = named(container, '本浏览器提醒')
  for (const [legendText, checkbox] of [['声音提醒', '声音通知'], ['页面内提醒', '页面内通知'], ['桌面提醒', '桌面通知']]) {
    const legend = [...reminders.querySelectorAll('legend')].find(node => node.textContent === legendText)
    assert(legend, legendText)
    assert(legend.closest('fieldset').contains(named(reminders, checkbox)))
  }
  assert.equal(button(reminders, '保存本浏览器提醒').dataset.nativeVariant, 'primary')
  assert.equal(button(reminders, '恢复当前提醒设置').dataset.nativeVariant, 'outline')
  assert(button(reminders, '保存本浏览器提醒').closest('footer'))
  assert.equal(reminders.querySelectorAll('[role="status"]').length, 2)
  assert.match(reminders.textContent, /开启开关不代表已获权限或通知已送达/)
  assert.equal(f.calls.policy.length, 0)
  assert.equal(f.calls.supervision.length, 0)
})
