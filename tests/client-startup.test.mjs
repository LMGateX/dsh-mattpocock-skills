import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { buildClient } from '../scripts/build-client.mjs'

// Renderer adapter mirrors the existing client.test public React hook fixture.
// It exercises exported renderers and DOM event props, never private controller fields.
const react = { createElement: (type, props, ...children) => ({ type, props: { ...(props ?? {}), children } }) }
const built = await buildClient()
let registration
vm.runInThisContext('(function(window){' + built.code + '\n})')({ __ModuleLoader__: { load: value => { registration = value } } })
const client = registration.factory(name => { assert.equal(name, 'react'); return react })
const ok = value => ({ ok: true, value })
const settle = () => new Promise(resolve => setImmediate(resolve))
const hint = '此设置在 DSH 启动时读取。保存只修改下次启动配置，不会立即改变当前进程；刷新网页或热重载不能代替进程重启。兼容支持由同一插件包提供；安装或更新插件后，保存下次启动请求，再正常重启 DSH。是否生效以当前运行状态为准；兼容性尚未验证时，反复重启也不会生效。'
function status(extra = {}) {
  return { revision: 7, desired: { startupCwdEnabled: true }, boot: { epoch: 'boot-one', requested: { startupCwdEnabled: false } },
    enabledNow: false, nativeInitialCwdSupported: false, preparation: { status: 'ready', sdkVersion: '0.1.2-rc.1', diagnostic: null },
    restartNeeded: true, state: 'pending-restart', ...extra }
}
function rows(tree) { return Array.isArray(tree) ? tree.flatMap(rows) : tree && typeof tree === 'object' ? [tree, ...rows(tree.props?.children)] : [] }
function text(tree) { return Array.isArray(tree) ? tree.map(text).join(' ') : tree && typeof tree === 'object' ? text(tree.props?.children) : tree == null ? '' : String(tree) }
function button(tree, label) { const found = rows(tree).find(row => row.type === 'button' && text(row) === label); assert(found, 'missing button: ' + label); return found }
function checkbox(tree) { const found = rows(tree).find(row => row.type === 'input' && row.props.type === 'checkbox'); assert(found, 'missing startup checkbox'); return found }
function renderer() {
  const state = [], effects = [], memos = []
  let cursor = 0, effectCursor = 0, memoCursor = 0
  const changed = (previous, deps) => !previous || deps.some((value, index) => value !== previous.deps[index])
  return {
    render(module, props) {
      cursor = 0; effectCursor = 0; memoCursor = 0
      react.useState = initial => { const index = cursor++; if (!Object.hasOwn(state, index)) state[index] = typeof initial === 'function' ? initial() : initial; return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value }] }
      react.useMemo = (create, deps) => { const index = memoCursor++; if (changed(memos[index], deps)) memos[index] = { value: create(), deps }; return memos[index].value }
      react.useEffect = (callback, deps) => { const index = effectCursor++; if (changed(effects[index], deps)) { effects[index]?.cleanup?.(); effects[index] = { callback, deps, pending: true } } }
      react.useSyncExternalStore = (_subscribe, getSnapshot) => getSnapshot()
      return module(props)
    },
    effects() { for (const effect of effects) if (effect.pending) { effect.pending = false; effect.cleanup = effect.callback() } },
    unmount() { for (const effect of effects) effect.cleanup?.() },
  }
}

test('saved enable survives several distinct simulated startup epochs but unprepared capability is explained beside current state', async t => {
  const { StartupSupport } = await import('../lib/controls/startup-support.js')
  const { MemoryVersionedStorage } = await import('../lib/controls/versioned-storage.js')
  const { parseStartupDocument } = await import('../lib/controls/startup-state.js')
  const storage = new MemoryVersionedStorage(parseStartupDocument, {
    schemaVersion: 1, revision: 1, desired: { startupCwdEnabled: true }, bootReceipts: [],
  })
  for (const epoch of ['restart-one', 'restart-two', 'restart-three']) {
    const core = new StartupSupport(storage, { epoch }, async () => ({ nativeInitialCwdSupported: false,
      preparation: { status: 'not-prepared', sdkVersion: '0.2.1-alpha.1', diagnostic: null } }))
    const actual = await core.readStatus()
    assert.equal(actual.boot.requested.startupCwdEnabled, true)
    assert.equal(actual.enabledNow, false)
    assert.equal(actual.restartNeeded, false)
    const mounted = renderer(); t.after(() => mounted.unmount())
    const remote = { startupStatus: async () => ok(actual), saveStartupSettings: () => assert.fail('no SDK or configuration writes') }
    mounted.render(client.StartupSettingsPanel, { remote }); mounted.effects(); await settle()
    const tree = mounted.render(client.StartupSettingsPanel, { remote })
    const visible = text(rows(tree).filter(row => row.props?.role === 'status'))
    assert.match(visible, /尚未生效：插件兼容性尚未验证/)
    assert.match(visible, /反复重启也不会生效/)
    assert.match(visible, /已保存启用/)
    assert.equal(checkbox(tree).props.checked, true)
  }
})

test('startup heading names subagent creation and specified worktree with grouped Chinese-only normal copy', async t => {
  const mounted = renderer(); t.after(() => mounted.unmount())
  const remote = { startupStatus: async () => ok(status({ preparation: { status: 'not-prepared', sdkVersion: '0.2.1-alpha.1', diagnostic: null }, state: 'needs-preparation' })), saveStartupSettings: () => assert.fail('no write') }
  mounted.render(client.StartupSettingsPanel, { remote }); mounted.effects(); await settle()
  const tree = mounted.render(client.StartupSettingsPanel, { remote })
  assert.match(text(rows(tree).filter(row => row.type === 'h3')), /创建子代理（subagent）时指定工作树（worktree）/)
  for (const label of ['当前运行状态', '下次启动设置']) assert(rows(tree).some(row => row.props?.['aria-label'] === label), label)
  const normalText = node => Array.isArray(node) ? node.map(normalText).join(' ') : node && typeof node === 'object' ? node.type === 'details' ? '' : normalText(node.props?.children) : node == null ? '' : String(node)
  assert.doesNotMatch(normalText(tree), /Profile|epoch|not-prepared|pending-restart/)
  assert.match(text(tree), /插件兼容支持：插件兼容性尚未验证/)
  assert(rows(tree).some(row => row.type === 'details' && text(row).includes('技术诊断')))
})

test('official loaded native support is enabled even without managed preparation and never asks for a patch', async t => {
  for (const preparation of ['not-prepared', 'failed', 'incompatible', 'ready']) {
    const mounted = renderer(); t.after(() => mounted.unmount())
    const remote = { startupStatus: async () => ok(status({ boot: { epoch: 'native', requested: { startupCwdEnabled: true } }, enabledNow: true,
      nativeInitialCwdSupported: true, restartNeeded: false, state: 'enabled', preparation: { status: preparation, sdkVersion: 'native-version', diagnostic: null } })), saveStartupSettings: () => assert.fail('no native patch') }
    mounted.render(client.StartupSettingsPanel, { remote }); mounted.effects(); await settle()
    const tree = mounted.render(client.StartupSettingsPanel, { remote })
    assert.match(text(tree), /启动状态：启用/)
    const visible = text(rows(tree).filter(row => row.props?.role === 'status'))
    assert.match(visible, /已生效/)
    assert.doesNotMatch(visible, /插件兼容性尚未验证|插件兼容验证失败|插件兼容性不匹配/)
    assert.doesNotMatch(text(tree), /此增强功能暂不可用|dsh-mattpocock-skills-cwd|--host-root/)
  }
})

test('startup settings always show restart hint and distinguish saved next startup from current process and draft', async t => {
  const mounted = renderer(); t.after(() => mounted.unmount())
  const remote = { startupStatus: async () => ok(status()), saveStartupSettings: async () => { throw new Error('unexpected save') } }
  let tree = mounted.render(client.StartupSettingsPanel, { remote }); mounted.effects(); await settle()
  tree = mounted.render(client.StartupSettingsPanel, { remote })
  assert(text(tree).includes(hint))
  assert.match(text(tree), /当前生效：禁用/)
  assert.match(text(tree), /本次启动请求：禁用/)
  assert.match(text(tree), /下次启动（已保存）：启用/)
  assert.match(text(tree), /启动配置修订 7/)
  assert.equal(checkbox(tree).props.checked, true)
  checkbox(tree).props.onChange({ target: { checked: false } })
  tree = mounted.render(client.StartupSettingsPanel, { remote })
  assert.equal(checkbox(tree).props.checked, false)
  assert.match(text(tree), /下次启动（已保存）：启用/)
  assert.match(text(tree), /草稿：禁用（未保存）/)
  assert.match(text(tree), /当前生效：禁用/)
  assert(text(tree).includes(hint))
  assert.deepEqual(built.externals, ['react'])
  assert(!built.code.includes('node:'))
})

test('preparation failures are not reboot-only success and unknown current capability is explicitly unavailable', async t => {
  for (const [preparation, state, label] of [
    ['not-prepared', 'needs-preparation', '插件兼容性尚未验证'], ['incompatible', 'incompatible', '插件兼容性不匹配'],
    ['failed', 'failed', '插件兼容验证失败'], ['uncertain', 'uncertain', '状态不确定'],
  ]) {
    const mounted = renderer(); t.after(() => mounted.unmount())
    const remote = { startupStatus: async () => ok(status({ enabledNow: null, nativeInitialCwdSupported: null, state,
      preparation: { status: preparation, sdkVersion: 'other-version', diagnostic: 'manager-only observation; /untrusted/sdk; echo unsafe' } })), saveStartupSettings: async () => { throw new Error('no running SDK mutations') } }
    let tree = mounted.render(client.StartupSettingsPanel, { remote }); mounted.effects(); await settle()
    tree = mounted.render(client.StartupSettingsPanel, { remote })
    assert.match(text(tree), /当前生效：未知（观测不可用）/)
    assert(!text(tree).includes('当前生效：禁用'))
    assert(text(tree).includes(label))
    assert.match(text(tree), /仍可使用普通原生子代理/)
    assert.match(text(tree), /更新兼容的插件版本并查看技术诊断/)
    assert(!text(tree).includes('启动状态：待重启'))
    assert(text(tree).includes(hint))
    const commands = rows(tree).filter(row => row.type === 'pre' && rows(row).some(child => child.type === 'code')).map(text).join(' ')
    assert.equal(commands, '', 'no command block or alternate maintenance workflow')
    assert.doesNotMatch(text(tree), /dsh-mattpocock-skills-cwd|--host-root|--dsh-stopped/)
    assert(!commands.includes('/untrusted/sdk'))
    assert.match(text(tree), /other-version/)
    assert.match(text(tree), /manager-only observation/)
  }
})

test('disabled startup intent stays disabled despite failed or missing optional preparation', async t => {
  for (const preparation of ['not-prepared', 'failed']) {
    const mounted = renderer(); t.after(() => mounted.unmount())
    const remote = { startupStatus: async () => ok(status({ desired: { startupCwdEnabled: false }, enabledNow: false, restartNeeded: false, state: 'disabled',
      preparation: { status: preparation, sdkVersion: '0.1.2-rc.1', diagnostic: 'optional preparation diagnostic' } })),
      saveStartupSettings: async () => { throw new Error('disabled default does not require preparation writes') } }
    let tree = mounted.render(client.StartupSettingsPanel, { remote }); mounted.effects(); await settle()
    tree = mounted.render(client.StartupSettingsPanel, { remote })
    assert.match(text(tree), /启动状态：禁用/)
    assert(!text(tree).includes('启动状态：插件兼容性尚未验证'))
    assert(!text(tree).includes('启动状态：插件兼容验证失败'))
    assert.match(text(tree), /当前生效：禁用/)
    assert.match(text(tree), /下次启动（已保存）：禁用/)
    assert.match(text(tree), /当前已关闭，不要求兼容验证。若以后启用/)
    assert(text(tree).includes('插件兼容支持：' + (preparation === 'not-prepared' ? '插件兼容性尚未验证' : '插件兼容验证失败')) )
    assert.match(text(tree), /optional preparation diagnostic/)
    assert.equal(checkbox(tree).props.checked, false)
    assert(text(tree).includes(hint))
  }
})

test('ready plugin implementation and unavailable loaded capability can remain pending restart without inventing support', async t => {
  const mounted = renderer(); t.after(() => mounted.unmount())
  const remote = { startupStatus: async () => ok(status()), saveStartupSettings: async () => { throw new Error('unexpected write') } }
  let tree = mounted.render(client.StartupSettingsPanel, { remote }); mounted.effects(); await settle()
  tree = mounted.render(client.StartupSettingsPanel, { remote })
  assert.match(text(tree), /当前运行时能力：不支持/)
  assert.match(text(tree), /插件实现已就绪，但当前运行时能力尚未启用/)
  assert.match(text(tree), /启动状态：待重启/)
  assert.match(text(tree), /宿主重启标记：是/)
  assert.doesNotMatch(text(tree), /磁盘兼容准备|dsh-mattpocock-skills-cwd|--host-root/)
  assert.match(text(tree), /当前生效：禁用/)
})

test('uncertain or rejected saves preserve the draft and Startup revision without optimistic success, then reread committed intent', async t => {
  for (const failure of ['transport-disconnected', 'revision-conflict', 'unsupported-schema-version', 'malformed-receipt']) {
    const mounted = renderer(); t.after(() => mounted.unmount())
    let persisted = status({ desired: { startupCwdEnabled: false }, restartNeeded: false, state: 'disabled' })
    const remote = { startupStatus: async () => ok(persisted), saveStartupSettings: async (desired, revision) => {
      assert.equal(revision, 7)
      if (failure === 'transport-disconnected') persisted = { ...persisted, desired, revision: 8, restartNeeded: true, state: 'pending-restart' }
      if (failure === 'malformed-receipt') return ok({ revision: 8, desired })
      throw new Error(failure)
    } }
    let tree = mounted.render(client.StartupSettingsPanel, { remote }); mounted.effects(); await settle()
    tree = mounted.render(client.StartupSettingsPanel, { remote }); checkbox(tree).props.onChange({ target: { checked: true } })
    tree = mounted.render(client.StartupSettingsPanel, { remote }); button(tree, '保存下次启动请求').props.onClick(); await settle()
    tree = mounted.render(client.StartupSettingsPanel, { remote })
    assert.match(text(tree), /保存结果未确认/)
    assert.match(text(tree), /以下为上次确认的启动状态/)
    assert.match(text(tree), /配置可能已写入；请重新读取启动状态核对/)
    assert.match(text(tree), /启动配置修订 7/)
    assert.match(text(tree), /草稿：启用（未保存）/)
    assert(!text(tree).includes('已保存下次启动请求修订'))
    assert.equal(checkbox(tree).props.checked, true)
    button(tree, '重新读取启动状态（丢弃草稿）').props.onClick(); await settle()
    tree = mounted.render(client.StartupSettingsPanel, { remote })
    assert(!text(tree).includes('保存结果未确认'))
    assert(!text(tree).includes('已保存下次启动请求修订'))
    assert.equal(checkbox(tree).props.checked, failure === 'transport-disconnected')
    assert.match(text(tree), /当前生效：禁用/)
  }
})

test('public startup controller aborts superseded requests and disposed state cannot acquire late save success', async () => {
  const reads = [], writes = []
  const remote = { startupStatus: signal => new Promise(resolve => reads.push({ signal, resolve })),
    saveStartupSettings: (desired, revision, signal) => new Promise(resolve => writes.push({ desired, revision, signal, resolve })) }
  const controller = new client.StartupSettingsController(remote)
  const release = controller.retain()
  void controller.refresh()
  assert.equal(reads[0].signal.aborted, true)
  assert.equal(reads[1].signal.aborted, false)
  reads[1].resolve(ok(status({ revision: 11, desired: { startupCwdEnabled: false }, restartNeeded: false, state: 'disabled' }))); await settle()
  reads[0].resolve(ok(status({ revision: 1 }))); await settle()
  assert.equal(controller.getSnapshot().saved.revision, 11)
  for (const invalid of ['true', 1, null, undefined, {}]) assert.throws(() => controller.setDesired(invalid))
  assert.deepEqual(controller.getSnapshot().draft, { startupCwdEnabled: false })
  controller.setDesired(true); void controller.save()
  assert.equal(writes[0].revision, 11)
  void controller.refresh()
  assert.equal(writes[0].signal.aborted, true)
  reads[2].resolve(ok(status({ revision: 12 }))); await settle()
  writes[0].resolve(ok(status({ revision: 999 }))); await settle()
  assert.equal(controller.getSnapshot().saved.revision, 12)
  assert.equal(controller.getSnapshot().notice, null)
  controller.setDesired(false); void controller.save()
  controller.dispose()
  assert.equal(writes[1].signal.aborted, true)
  assert.equal(controller.getSnapshot().saved, null)
  assert.equal(controller.getSnapshot().busy, null)
  writes[1].resolve(ok(status({ revision: 1000, desired: { startupCwdEnabled: false } }))); await settle()
  assert.equal(controller.getSnapshot().saved, null)
  assert.equal(controller.getSnapshot().notice, null)
  release()
})

test('mounted startup panel aborts old Remote save and read replies on replacement, reload and unmount', async t => {
  const mounted = renderer(); t.after(() => mounted.unmount())
  let finishOldSave, oldSaveSignal, finishNewRead, newReadSignal, finishNewSave, newSaveSignal
  const oldRemote = { startupStatus: async () => ok(status({ desired: { startupCwdEnabled: false }, state: 'disabled', restartNeeded: false })),
    saveStartupSettings: (_desired, _revision, signal) => { oldSaveSignal = signal; return new Promise(resolve => { finishOldSave = resolve }) } }
  const newRemote = { startupStatus: signal => { newReadSignal = signal; return new Promise(resolve => { finishNewRead = resolve }) },
    saveStartupSettings: (_desired, _revision, signal) => { newSaveSignal = signal; return new Promise(resolve => { finishNewSave = resolve }) } }
  let tree = mounted.render(client.StartupSettingsPanel, { remote: oldRemote }); mounted.effects(); await settle()
  tree = mounted.render(client.StartupSettingsPanel, { remote: oldRemote }); checkbox(tree).props.onChange({ target: { checked: true } })
  tree = mounted.render(client.StartupSettingsPanel, { remote: oldRemote }); button(tree, '保存下次启动请求').props.onClick()
  tree = mounted.render(client.StartupSettingsPanel, { remote: newRemote })
  assert(!text(tree).includes('启动配置修订 7'), 'first replacement render must not leak prior Remote state')
  mounted.effects(); assert.equal(oldSaveSignal.aborted, true)
  finishOldSave(ok(status({ revision: 800 }))); await settle()
  tree = mounted.render(client.StartupSettingsPanel, { remote: newRemote }); assert(!text(tree).includes('已保存下次启动请求修订'))
  const firstReadSignal = newReadSignal; const finishFirstRead = finishNewRead
  button(tree, '重新读取启动状态（丢弃草稿）').props.onClick(); assert.equal(firstReadSignal.aborted, true)
  finishNewRead(ok(status({ revision: 43, desired: { startupCwdEnabled: false }, restartNeeded: false, state: 'disabled' }))); await settle()
  finishFirstRead(ok(status({ revision: 999 }))); await settle()
  tree = mounted.render(client.StartupSettingsPanel, { remote: newRemote }); assert.match(text(tree), /启动配置修订 43/)
  assert(!text(tree).includes('999'))
  checkbox(tree).props.onChange({ target: { checked: true } }); tree = mounted.render(client.StartupSettingsPanel, { remote: newRemote })
  button(tree, '保存下次启动请求').props.onClick(); mounted.unmount(); assert.equal(newSaveSignal.aborted, true)
  finishNewSave(ok(status({ revision: 1000 }))); await settle()
  tree = mounted.render(client.StartupSettingsPanel, { remote: newRemote })
  assert(!text(tree).includes('已保存下次启动请求修订')); assert(!text(tree).includes('1000'))
})

test('settings mount startup controls while Workspace Policy is unavailable and never borrow its revision', async t => {
  for (const unavailable of [true, false]) {
    const page = renderer(), startup = renderer(); t.after(() => { startup.unmount(); page.unmount() })
    let startupSave
    const remote = { readPolicy: async () => { if (unavailable) throw new Error('Workspace Policy unavailable'); return ok({ revision: 42, extensionEnabled: true, defaults: {}, workspaceOverrides: {} }) },
      listWorkspaces: async () => ok([]), startupStatus: async () => ok(status({ desired: { startupCwdEnabled: false }, state: 'disabled', restartNeeded: false })),
      saveStartupSettings: async (desired, revision, signal) => { startupSave = { desired, revision, signal }; return ok(status({ desired, revision: 8 })) },
      savePolicy: () => { throw new Error('startup cannot save Workspace Policy') } }
    const props = { view: 'page', remote, refreshAll: () => { throw new Error('startup does not refresh Policy/session observers') }, observe: () => { throw new Error('startup does not observe Sessions') } }
    let tree = page.render(client.SettingsPage, props); page.effects()
    const initialPanel = rows(tree).find(row => row.type === client.StartupSettingsPanel); assert(initialPanel)
    let startupTree = startup.render(initialPanel.type, initialPanel.props); startup.effects(); await settle()
    tree = page.render(client.SettingsPage, props)
    assert(rows(tree).some(row => row.type === client.StartupSettingsPanel))
    assert(text(tree).includes(unavailable ? 'Workspace Policy unavailable' : '配置修订 42'))
    startupTree = startup.render(initialPanel.type, initialPanel.props); assert(text(startupTree).includes(hint))
    checkbox(startupTree).props.onChange({ target: { checked: true } }); startupTree = startup.render(initialPanel.type, initialPanel.props)
    button(startupTree, '保存下次启动请求').props.onClick(); await settle()
    assert.equal(startupSave.revision, 7)
    assert.deepEqual(startupSave.desired, { startupCwdEnabled: true })
    assert(startupSave.signal instanceof AbortSignal)
  }
})

test('enable and disable save only next-startup intent with Startup CAS, never apply the current process on save or reload', async t => {
  for (const initial of [false, true]) {
    const mounted = renderer(); t.after(() => mounted.unmount())
    const calls = []; let persisted = status({ desired: { startupCwdEnabled: initial }, boot: { epoch: 'stable-boot', requested: { startupCwdEnabled: initial } },
      enabledNow: initial, nativeInitialCwdSupported: true, restartNeeded: false, state: initial ? 'enabled' : 'disabled' })
    const remote = { readPolicy: async () => ok({ revision: 99 }),
      startupStatus: async signal => { assert(signal instanceof AbortSignal); return ok(persisted) },
      saveStartupSettings: async (desired, revision, signal) => {
        calls.push({ desired, revision, signal }); persisted = { ...persisted, revision: 8, desired, restartNeeded: true, state: 'pending-restart' }; return ok(persisted)
      }, savePolicy: () => { throw new Error('Startup save must not write Workspace Policy') } }
    let tree = mounted.render(client.StartupSettingsPanel, { remote }); mounted.effects(); await settle()
    tree = mounted.render(client.StartupSettingsPanel, { remote })
    checkbox(tree).props.onChange({ target: { checked: !initial } })
    tree = mounted.render(client.StartupSettingsPanel, { remote })
    button(tree, '保存下次启动请求').props.onClick(); await settle()
    tree = mounted.render(client.StartupSettingsPanel, { remote })
    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0].desired, { startupCwdEnabled: !initial })
    assert.equal(calls[0].revision, 7, 'Startup opening revision, not Workspace Policy revision')
    assert(calls[0].signal instanceof AbortSignal)
    assert.match(text(tree), /待重启/)
    assert(text(tree).includes('当前生效：' + (initial ? '启用' : '禁用')))
    assert(text(tree).includes('本次启动请求：' + (initial ? '启用' : '禁用')))
    assert(text(tree).includes('下次启动（已保存）：' + (initial ? '禁用' : '启用')))
    assert(text(tree).includes(hint))
    button(tree, '重新读取启动状态（丢弃草稿）').props.onClick(); await settle()
    tree = mounted.render(client.StartupSettingsPanel, { remote })
    assert.match(text(tree), /待重启/)
    assert(text(tree).includes('当前生效：' + (initial ? '启用' : '禁用')))
  }
})
