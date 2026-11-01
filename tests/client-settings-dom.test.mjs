import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import * as React from 'react'
import { Window } from 'happy-dom'
import { buildClient } from '../scripts/build-client.mjs'
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
function startup(extra = {}) {
  return { revision: 7, desired: { startupCwdEnabled: false }, boot: { epoch: 'boot-dom', requested: { startupCwdEnabled: false } },
    enabledNow: false, nativeInitialCwdSupported: false, preparation: { status: 'ready', sdkVersion: 'test-sdk', diagnostic: null },
    restartNeeded: false, state: 'disabled', ...extra }
}
function fixture(extra = {}) {
  const calls = { policy: [], supervision: [], startup: [], refresh: 0, observe: [] }
  let policy = { revision: 42, extensionEnabled: false, defaults: {}, workspaceOverrides: {} }
  let supervision = { schemaVersion: 1, revision: 0, defaults: {}, workspaceOverrides: {} }
  let status = startup()
  const remote = {
    readPolicy: async () => ok(copy(policy)),
    listWorkspaces: async () => ok([{ id: 'work-one', title: '审计工作区', status: 'ok', sessionIds: [] }]),
    startupStatus: async () => ok(copy(status)),
    savePolicy: async (intent, revision) => { calls.policy.push({ intent: copy(intent), revision }); policy = { ...copy(intent), revision: revision + 1 }; return ok(copy(policy)) },
    readSupervisionConfig: async () => ok(copy(supervision)),
    saveSupervisionConfig: async (intent, revision) => { calls.supervision.push({ intent: copy(intent), revision }); supervision = { schemaVersion: 1, revision: revision + 1, ...copy(intent) }; return ok(copy(supervision)) },
    readSupervision: async () => ok(null),
    saveStartupSettings: async (desired, revision, signal) => { calls.startup.push({ desired: copy(desired), revision, signal }); status = { ...status, desired: copy(desired), revision: revision + 1, restartNeeded: true, state: 'pending-restart' }; return ok(copy(status)) },
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

test('real DOM distinguishes disabled dependency from version mismatch and retains loaded capability precedence', async t => {
  let actual = startup({ state: 'incompatible', desired: { startupCwdEnabled: true }, boot: { epoch: 'bridge-dom', requested: { startupCwdEnabled: true } }, preparation: { status: 'incompatible', sdkVersion: '0.2.1-alpha.1', diagnostic: 'Clear disabled override', reason: 'compatibility-component-disabled' } })
  const remote = { startupStatus: async () => ok(copy(actual)), saveStartupSettings: () => assert.fail('read-only conflict diagnosis') }
  const { container } = await mount(t, client.StartupSettingsPanel, { remote })
  const visible = named(container, '当前运行状态')
  assert.match(visible.textContent, /兼容桥被配置禁用/)
  assert.match(visible.textContent, /撤销.*关闭覆盖.*恢复自动选择/)
  assert.doesNotMatch(visible.textContent, /插件兼容性不匹配|请更新|安装或更新/)
  assert.equal(container.querySelectorAll('input[type=checkbox]').length, 1)
  assert.match(normalText(container), /不是 DSH 官方组件/)
  actual = { ...actual, state: 'enabled', enabledNow: true, nativeInitialCwdSupported: true }
  await click(button(container, '重新读取启动状态（丢弃草稿）'))
  assert.match(visible.textContent, /已生效/)
  assert.doesNotMatch(visible.textContent, /尚未生效|当前生效：禁用/)
  assert.doesNotMatch(normalText(container), /当前阻断是/)
})

test('real DOM forced-enable recovery is clear-only and never downgrades loaded capability or unknown status', async t => {
  let actual = startup({ state: 'incompatible', desired: { startupCwdEnabled: true },
    boot: { epoch: 'forced-dom', requested: { startupCwdEnabled: true } }, preparation: { status: 'incompatible',
      sdkVersion: '0.2.1-alpha.1', diagnostic: 'Clear only forced-enable override', reason: 'compatibility-component-forced-enabled' } })
  const remote = { startupStatus: async () => ok(copy(actual)), saveStartupSettings: () => assert.fail('diagnosis must not write or reset configuration') }
  const { container } = await mount(t, client.StartupSettingsPanel, { remote })
  const visible = named(container, '当前运行状态')
  assert.match(visible.textContent, /兼容桥被强制开启/)
  assert.match(visible.textContent, /自动选择.*被.*替换/)
  assert.match(visible.textContent, /仅撤销.*强制开启覆盖.*恢复自动选择/)
  assert.match(visible.textContent, /功能请求已保留/)
  assert.doesNotMatch(visible.textContent, /兼容桥被配置禁用|插件兼容性不匹配|请更新|安装或更新|已生效/)
  assert.match(normalText(container), /其他.*兼容.*冲突.*仍.*存在/)
  assert.equal(named(container, '允许本插件创建子代理时指定工作树').checked, true)
  assert.equal(container.querySelectorAll('input[type=checkbox]').length, 1)
  assert.equal(container.querySelectorAll('button').length, 2, 'no reset button or second enable control')
  actual = { ...actual, enabledNow: null, nativeInitialCwdSupported: null }
  await click(button(container, '重新读取启动状态（丢弃草稿）'))
  assert.match(visible.textContent, /运行状态未知：兼容桥被强制开启/)
  assert.match(visible.textContent, /当前生效：未知（观测不可用）/)
  assert.doesNotMatch(visible.textContent, /当前生效：禁用/)
  actual = { ...actual, state: 'enabled', enabledNow: true, nativeInitialCwdSupported: true }
  await click(button(container, '重新读取启动状态（丢弃草稿）'))
  assert.match(visible.textContent, /已生效/)
  assert.doesNotMatch(visible.textContent, /尚未生效|当前生效：禁用|插件兼容性不匹配/)
  assert.match(normalText(container), /当前运行时能力已支持.*不会抹除当前能力/)
  assert.doesNotMatch(normalText(container), /当前阻断是/)
  actual = { ...actual, state: 'pending-restart', desired: { startupCwdEnabled: false }, restartNeeded: true }
  await click(button(container, '重新读取启动状态（丢弃草稿）'))
  assert.match(visible.textContent, /当前仍生效：关闭请求待重启/)
  assert.match(visible.textContent, /当前生效：启用/)
  assert.equal(named(container, '允许本插件创建子代理时指定工作树').checked, false)
  assert.match(visible.textContent, /本次启动请求：启用/)
  assert.match(container.textContent, /启动标识 forced-dom/)
})

test('startup DOM never offers SDK paths or manual maintenance commands, including collapsed details', async t => {
  let actual = startup()
  const remote = { startupStatus: async () => ok(copy(actual)), saveStartupSettings: () => assert.fail('read-only rendering') }
  const { container } = await mount(t, client.StartupSettingsPanel, { remote })
  for (const [state, preparation, native] of [
    ['disabled', 'ready', false], ['pending-restart', 'ready', false], ['needs-preparation', 'not-prepared', false],
    ['unsupported', 'not-prepared', false], ['incompatible', 'incompatible', false], ['failed', 'failed', false],
    ['uncertain', 'uncertain', null], ['enabled', 'not-prepared', true],
  ]) {
    actual = startup({ state, desired: { startupCwdEnabled: state !== 'disabled' },
      boot: { epoch: 'public-dom-epoch', requested: { startupCwdEnabled: state === 'enabled' } },
      enabledNow: state === 'enabled' ? true : state === 'uncertain' ? null : false,
      nativeInitialCwdSupported: native, restartNeeded: state === 'pending-restart',
      preparation: { status: preparation, sdkVersion: state === 'unsupported' ? null : 'fixture-version', diagnostic: null } })
    await click(button(container, '重新读取启动状态（丢弃草稿）'))
    assert.doesNotMatch(container.textContent, /dsh-mattpocock-skills-cwd|--host-root|--dsh-stopped|\/absolute\/sdk|\[DSH args|SDK.*(?:目录|路径)|离线.*(?:步骤|命令|准备)|磁盘兼容准备|当前 SDK 原生支持/, state)
    assert.match(named(container, '当前运行状态').textContent, /当前运行时能力：/, state)
    assert.match(normalText(container), /兼容支持由同一插件包提供/, state)
    assert.match(normalText(container), /刷新网页或热重载不能代替进程重启/, state)
    assert(container.querySelector('details'), 'raw technical status remains available')
  }
})

test('plugin readiness and real DOM saves stay pending in the same Host epoch, enable next boot and disable only after another boot with management off', async t => {
  const { StartupSupport } = await import('../lib/controls/startup-support.js')
  const { MemoryVersionedStorage } = await import('../lib/controls/versioned-storage.js')
  const { parseStartupDocument } = await import('../lib/controls/startup-state.js')
  const storage = new MemoryVersionedStorage(parseStartupDocument, {
    schemaVersion: 1, revision: 6, desired: { startupCwdEnabled: false }, bootReceipts: [],
  })
  const observation = native => async signal => {
    assert(signal instanceof AbortSignal)
    return { nativeInitialCwdSupported: native, preparation: { status: 'ready', sdkVersion: 'pinned-fixture', diagnostic: null } }
  }
  let core = new StartupSupport(storage, { epoch: 'host-before-restart' }, observation(false))
  const f = fixture({ startupStatus: async signal => ok(await core.readStatus(signal)),
    saveStartupSettings: async (desired, revision, signal) => {
      f.calls.startup.push({ desired: copy(desired), revision, signal })
      return ok(await core.save(desired, revision, signal))
    } })
  const { container, root } = await mount(t, client.SettingsPage, f.props)
  const currentText = () => named(container, '当前运行状态').textContent
  const checkManagement = () => {
    assert.equal(named(container, '协作管理总闸（全局）').checked, false)
    assert.equal(f.calls.policy.length, 0)
    assert.equal(f.calls.refresh, 0)
    assert.deepEqual(f.calls.observe, [])
  }
  assert.match(currentText(), /当前生效：禁用/)
  assert.match(currentText(), /插件兼容支持：插件实现已就绪（不代表当前已启用）/)
  assert.match(currentText(), /当前运行时能力：不支持/)
  checkManagement()
  await click(named(container, '允许本插件创建子代理时指定工作树'))
  await click(button(container, '保存下次启动请求'))
  assert.equal(f.calls.startup[0].revision, 7)
  assert.deepEqual(f.calls.startup[0].desired, { startupCwdEnabled: true })
  assert.match(currentText(), /尚未生效：待重启/)
  assert.match(currentText(), /当前生效：禁用/)
  assert.match(currentText(), /本次启动请求：禁用/)
  assert.match(container.textContent, /host-before-restart/)
  assert.match(named(container, '下次启动设置').textContent, /下次启动（已保存）：启用/)
  assert.doesNotMatch(currentText(), /SDK.*已|已生效/)
  // Reconstruct the public Host seam and remount the browser controller: neither is a process restart.
  core = new StartupSupport(storage, { epoch: 'host-before-restart' }, observation(false))
  await React.act(async () => root.render(React.createElement(client.SettingsPage, { ...f.props, remote: { ...f.remote } })))
  await click(button(container, '重新读取启动状态（丢弃草稿）'))
  assert.match(currentText(), /尚未生效：待重启/)
  assert.match(currentText(), /当前生效：禁用/)
  assert.match(container.textContent, /host-before-restart/)
  checkManagement()
  // Only the trusted fixture supplies a new process epoch and a loaded true capability.
  core = new StartupSupport(storage, { epoch: 'host-after-restart' }, observation(true))
  await click(button(container, '重新读取启动状态（丢弃草稿）'))
  assert.match(currentText(), /已生效/)
  assert.match(currentText(), /当前生效：启用/)
  assert.match(currentText(), /当前运行时能力：支持/)
  assert.match(container.textContent, /host-after-restart/)
  checkManagement()
  await click(named(container, '允许本插件创建子代理时指定工作树'))
  await click(button(container, '保存下次启动请求'))
  assert.equal(f.calls.startup[1].revision, 9)
  assert.deepEqual(f.calls.startup[1].desired, { startupCwdEnabled: false })
  assert.match(currentText(), /当前仍生效：关闭请求待重启/)
  assert.match(currentText(), /当前生效：启用/)
  assert.match(named(container, '下次启动设置').textContent, /下次启动（已保存）：禁用/)
  await click(button(container, '重新读取启动状态（丢弃草稿）'))
  assert.match(currentText(), /当前生效：启用/)
  core = new StartupSupport(storage, { epoch: 'host-after-disable' }, observation(true))
  await click(button(container, '重新读取启动状态（丢弃草稿）'))
  assert.match(currentText(), /已关闭/)
  assert.match(currentText(), /当前生效：禁用/)
  assert.match(currentText(), /当前运行时能力：支持/)
  assert.match(normalText(container), /不改变已有子代理的工作目录/)
  assert.equal(f.calls.startup.length, 2)
  for (const call of f.calls.startup) assert(call.signal instanceof AbortSignal)
  checkManagement()
})

test('startup DOM translates authoritative unavailable states as plugin compatibility limits, not a broken ordinary runtime or a reboot remedy', async t => {
  let actual = startup()
  const remote = { startupStatus: async () => ok(copy(actual)), saveStartupSettings: () => assert.fail('no configuration or SDK writes') }
  const { container } = await mount(t, client.StartupSettingsPanel, { remote })
  for (const [state, preparation, label] of [
    ['needs-preparation', 'not-prepared', '插件兼容性尚未验证'], ['unsupported', 'not-prepared', '增强功能不可用'],
    ['incompatible', 'incompatible', '插件兼容性不匹配'], ['failed', 'failed', '插件兼容验证失败'],
    ['uncertain', 'uncertain', '状态不确定'],
  ]) {
    actual = startup({ state, desired: { startupCwdEnabled: true }, boot: { epoch: 'unavailable-epoch', requested: { startupCwdEnabled: true } },
      enabledNow: state === 'uncertain' ? null : false, nativeInitialCwdSupported: state === 'uncertain' ? null : false,
      restartNeeded: false, preparation: { status: preparation, sdkVersion: state === 'unsupported' ? null : 'incompatible-fixture', diagnostic: 'public diagnostic' } })
    await click(button(container, '重新读取启动状态（丢弃草稿）'))
    assert(named(container, '当前运行状态').textContent.includes(label), state)
    assert.match(normalText(container), /仍可使用普通原生子代理/, state)
    assert.match(normalText(container), /(?:安装或)?更新兼容的插件版本/, state)
    assert.match(normalText(container), /查看技术诊断/, state)
    assert.doesNotMatch(named(container, '当前运行状态').querySelector('strong').textContent, /待重启|已生效|已关闭/, state)
    assert.doesNotMatch(named(container, '当前运行状态').textContent, /SDK.*(?:损坏|不兼容)/, state)
    assert.match(container.textContent, /public diagnostic/, 'original technical observation remains readable')
    if (state === 'needs-preparation') assert.match(normalText(container), /反复重启也不会生效/)
  }
  // Readiness alone must not replace a Host failure/unknown status with pending-restart.
  actual = { ...actual, state: 'failed', preparation: { status: 'ready', sdkVersion: 'fixture-version', diagnostic: 'state is authoritative' } }
  await click(button(container, '重新读取启动状态（丢弃草稿）'))
  assert.match(named(container, '当前运行状态').textContent, /插件兼容验证失败/)
  assert.doesNotMatch(named(container, '当前运行状态').textContent, /待重启/)
})

test('DOM clicks save startup revision seven independently from management revision forty-two', async t => {
  const f = fixture(), { container } = await mount(t, client.SettingsPage, f.props)
  const current = named(container, '当前运行状态')
  assert.match(current.textContent, /当前生效：禁用/)
  await click(named(container, '允许本插件创建子代理时指定工作树'))
  assert.match(named(container, '下次启动设置').textContent, /草稿：启用（未保存）/)
  await click(button(container, '保存下次启动请求'))
  assert.equal(f.calls.startup.length, 1)
  assert.deepEqual(f.calls.startup[0].desired, { startupCwdEnabled: true })
  assert.equal(f.calls.startup[0].revision, 7)
  assert(f.calls.startup[0].signal instanceof AbortSignal)
  assert.equal(f.calls.policy.length, 0)
  assert.equal(f.calls.refresh, 0)
  assert.match(current.textContent, /当前生效：禁用/)
  assert.match(current.textContent, /待重启/)
  await click(named(container, '协作管理总闸（全局）'))
  await click(button(container, '保存并启用协作管理'))
  assert.equal(f.calls.policy.length, 1)
  assert.equal(f.calls.policy[0].revision, 42)
  assert.equal(f.calls.policy[0].intent.extensionEnabled, true)
  assert.equal(f.calls.startup.length, 1)
  assert.equal(f.calls.refresh, 1)
  assert.match(named(container, '保存前预览').textContent, /已保存并应用配置/)
  await click(named(container, '协作管理总闸（全局）'))
  await click(button(container, '保存并关闭协作管理'))
  assert.equal(f.calls.policy[1].revision, 43)
  assert.equal(f.calls.policy[1].intent.extensionEnabled, false)
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

test('policy failure leaves the independently mounted startup DOM editable and saves only startup', async t => {
  const f = fixture({ readPolicy: async () => { throw new Error('controlled policy unavailable') } })
  const { container } = await mount(t, client.SettingsPage, f.props)
  assert.match(named(container, '工作区协作管理').textContent, /协作配置不可用/)
  const startupToggle = named(container, '允许本插件创建子代理时指定工作树')
  assert.equal(startupToggle.disabled, false)
  await click(startupToggle)
  await click(button(container, '保存下次启动请求'))
  assert.equal(f.calls.startup[0].revision, 7)
  assert.equal(f.calls.policy.length, 0)
  assert.equal(f.calls.refresh, 0)
  assert.deepEqual(f.calls.observe, [])
  assert.match(normalText(container), /当前生效：禁用/)
  assert.match(normalText(container), /待重启/)
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
  assert.equal(summary.style.maxHeight, '96px')
  assert.equal(summary.style.overflowY, 'auto')
  assert.match(summary.textContent, /T 未知/)
  assert.match(summary.textContent, /S 未知/)
  assert.doesNotMatch(summary.textContent, /S 0|T 0/)
})

test('startup DOM keeps loading and unknown facts distinct from disabled or restart success', async t => {
  let finishRead
  const remote = { startupStatus: () => new Promise(resolve => { finishRead = resolve }), saveStartupSettings: () => { throw new Error('unexpected startup save') } }
  const { container } = await mount(t, client.StartupSettingsPanel, { remote })
  const toggle = named(container, '允许本插件创建子代理时指定工作树')
  assert.equal(toggle.disabled, true)
  assert.equal(button(container, '保存下次启动请求').disabled, true)
  assert.match(named(container, '当前运行状态').textContent, /未知/)
  assert.doesNotMatch(named(container, '当前运行状态').textContent, /当前生效：禁用/)
  await React.act(async () => finishRead(ok(startup({ enabledNow: null, nativeInitialCwdSupported: null, state: 'failed', restartNeeded: true,
    preparation: { status: 'failed', sdkVersion: null, diagnostic: 'controlled diagnostic' } }))))
  assert.equal(toggle.disabled, false)
  assert.match(normalText(container), /当前生效：未知（观测不可用）/)
  assert.match(normalText(container), /插件兼容验证失败/)
  assert.doesNotMatch(normalText(container), /当前生效：禁用|尚未生效：待重启/)
  assert.match(normalText(container), /刷新网页或热重载不能代替进程重启/)
})

test('startup rejected save keeps the DOM draft and marks last confirmation instead of success', async t => {
  let rejectSave, signal
  const remote = { startupStatus: async () => ok(startup()), saveStartupSettings: (_desired, revision, requestSignal) => {
    assert.equal(revision, 7); signal = requestSignal
    return new Promise((_resolve, reject) => { rejectSave = reject })
  } }
  const { container } = await mount(t, client.StartupSettingsPanel, { remote })
  const toggle = named(container, '允许本插件创建子代理时指定工作树')
  await click(toggle)
  await click(button(container, '保存下次启动请求'))
  assert.equal(toggle.disabled, true)
  assert.equal(button(container, '正在保存…').disabled, true)
  assert(signal instanceof AbortSignal)
  assert.doesNotMatch(normalText(container), /已保存下次启动请求修订/)
  await React.act(async () => rejectSave(new Error('controlled disconnect')))
  assert.equal(toggle.checked, true)
  assert.equal(toggle.disabled, false)
  assert.match(normalText(container), /草稿：启用（未保存）/)
  assert.match(normalText(container), /保存结果未确认/)
  assert.match(normalText(container), /上次确认的启动状态/)
  assert.doesNotMatch(normalText(container), /已保存下次启动请求修订/)
  assert.match(named(container, '当前运行状态').textContent, /当前生效：禁用/)
  await click(button(container, '重新读取启动状态（丢弃草稿）'))
  assert.equal(toggle.checked, false)
  assert.doesNotMatch(normalText(container), /保存结果未确认/)
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
  assert.equal(f.calls.startup.length, 0)
  await click(button(container, '放弃未保存更改'))
  assert.equal(named(container, '协作管理总闸（全局）').checked, false)
  assert.equal(button(container, '保存并应用配置').disabled, true)
})

for (const preparation of ['not-prepared', 'failed', 'ready']) {
  test('startup native support stays enabled in DOM despite optional preparation ' + preparation, async t => {
    const remote = { startupStatus: async () => ok(startup({ desired: { startupCwdEnabled: true },
      boot: { epoch: 'native-boot', requested: { startupCwdEnabled: true } }, enabledNow: true, nativeInitialCwdSupported: true, state: 'enabled',
      preparation: { status: preparation, sdkVersion: 'official-native', diagnostic: 'optional preparation observation' } })),
      saveStartupSettings: () => { throw new Error('unexpected native mutation') } }
    const { container } = await mount(t, client.StartupSettingsPanel, { remote })
    assert.match(named(container, '当前运行状态').textContent, /当前生效：启用/)
    assert.match(normalText(container), /已生效/)
    assert.match(normalText(container), /当前运行时能力已支持，无需额外兼容准备/)
    assert.doesNotMatch(normalText(container), /此增强功能暂不可用|尚未生效|插件兼容验证失败|不代表当前已启用|安装或更新兼容的插件版本/)
    assert.match(named(container, '当前运行状态').textContent, /当前运行时能力：支持/)
  })
}

test('unknown startup wire enum fails closed in DOM rather than becoming false or successful', async t => {
  const remote = { startupStatus: async () => ok(startup({ state: 'future-state' })), saveStartupSettings: () => { throw new Error('must not save malformed facts') } }
  const { container } = await mount(t, client.StartupSettingsPanel, { remote })
  assert.equal(named(container, '允许本插件创建子代理时指定工作树').disabled, true)
  assert.equal(button(container, '保存下次启动请求').disabled, true)
  assert.match(named(container, '当前运行状态').textContent, /未知|不可用/)
  assert.doesNotMatch(named(container, '当前运行状态').textContent, /当前生效：禁用|当前生效：启用|已生效|已关闭/)
  assert.match(named(container, '下次启动设置').textContent, /尚未确认/)
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
  assert.equal(f.calls.startup.length, 0)
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

test('native support with a newly saved request shows pending restart without unconditional patch instructions', async t => {
  const remote = { startupStatus: async () => ok(startup({ desired: { startupCwdEnabled: true },
    enabledNow: false, nativeInitialCwdSupported: true, restartNeeded: true, state: 'pending-restart',
    preparation: { status: 'not-prepared', sdkVersion: 'official-native', diagnostic: null } })),
    saveStartupSettings: () => { throw new Error('unexpected save') } }
  const { container } = await mount(t, client.StartupSettingsPanel, { remote })
  const current = named(container, '当前运行状态')
  assert.match(current.textContent, /当前生效：禁用/)
  assert.match(current.textContent, /本次启动请求：禁用/)
  assert.match(current.textContent, /待重启/)
  assert.match(current.textContent, /当前运行时能力已支持，无需额外兼容准备/)
  assert.match(named(container, '下次启动设置').textContent, /下次启动（已保存）：启用/)
  assert(normalText(container).includes('兼容性尚未验证时，反复重启也不会生效。'))
  assert.match(normalText(container), /刷新网页或热重载不能代替进程重启/)
  assert.doesNotMatch(normalText(container), /此增强功能暂不可用|更新兼容的插件版本并查看技术诊断/)
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
