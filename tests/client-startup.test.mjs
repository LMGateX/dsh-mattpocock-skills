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
const hint = '此项为启动时配置。启用或禁用后，需要重启 DSH 才会生效；当前运行状态不会立即改变。刷新网页不能代替重启。'
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
    ['not-prepared', 'needs-preparation', '需要兼容准备'], ['incompatible', 'incompatible', '版本不兼容'],
    ['failed', 'failed', '兼容准备失败'], ['uncertain', 'uncertain', '状态不确定'],
  ]) {
    const mounted = renderer(); t.after(() => mounted.unmount())
    const remote = { startupStatus: async () => ok(status({ enabledNow: null, nativeInitialCwdSupported: null, state,
      preparation: { status: preparation, sdkVersion: 'other-version', diagnostic: 'manager-only observation; /untrusted/sdk; echo unsafe' } })), saveStartupSettings: async () => { throw new Error('no running SDK mutations') } }
    let tree = mounted.render(client.StartupSettingsPanel, { remote }); mounted.effects(); await settle()
    tree = mounted.render(client.StartupSettingsPanel, { remote })
    assert.match(text(tree), /当前生效：未知（观测不可用）/)
    assert(!text(tree).includes('当前生效：禁用'))
    assert(text(tree).includes(label))
    assert.match(text(tree), /需要先完成兼容准备，普通重启不会自动打补丁/)
    assert(!text(tree).includes('启动状态：待重启'))
    assert(text(tree).includes(hint))
    const commands = rows(tree).filter(row => row.type === 'pre').map(text).join(' ')
    assert(commands.includes('dsh-mattpocock-skills-cwd start --host-root /absolute/sdk --dsh-stopped -- [DSH args...]'))
    for (const action of ['inspect', 'prepare', 'restore']) assert(commands.includes('dsh-mattpocock-skills-cwd ' + action))
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
    assert(!text(tree).includes('启动状态：需要兼容准备'))
    assert(!text(tree).includes('启动状态：兼容准备失败'))
    assert.match(text(tree), /当前生效：禁用/)
    assert.match(text(tree), /下次启动（已保存）：禁用/)
    assert.match(text(tree), /当前已关闭，不要求兼容准备。若以后启用/)
    assert(text(tree).includes('兼容准备：' + preparation))
    assert.match(text(tree), /optional preparation diagnostic/)
    assert.equal(checkbox(tree).props.checked, false)
    assert(text(tree).includes(hint))
  }
})

test('prepared disk and unsupported loaded SDK can legitimately remain pending restart without inventing native support', async t => {
  const mounted = renderer(); t.after(() => mounted.unmount())
  const remote = { startupStatus: async () => ok(status()), saveStartupSettings: async () => { throw new Error('unexpected write') } }
  let tree = mounted.render(client.StartupSettingsPanel, { remote }); mounted.effects(); await settle()
  tree = mounted.render(client.StartupSettingsPanel, { remote })
  assert.match(text(tree), /原生首次目录支持：不支持/)
  assert.match(text(tree), /磁盘兼容准备已就绪，但当前 SDK 已加载且原生能力仍不支持/)
  assert.match(text(tree), /启动状态：待重启/)
  assert.match(text(tree), /宿主重启标记：是/)
  assert(!text(tree).includes('普通重启不会自动打补丁'))
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
    tree = mounted.render(client.StartupSettingsPanel, { remote }); button(tree, '保存下次启动配置').props.onClick(); await settle()
    tree = mounted.render(client.StartupSettingsPanel, { remote })
    assert.match(text(tree), /保存结果未确认/)
    assert.match(text(tree), /以下为上次确认的启动状态/)
    assert.match(text(tree), /配置可能已写入；请重新读取启动状态核对/)
    assert.match(text(tree), /启动配置修订 7/)
    assert.match(text(tree), /草稿：启用（未保存）/)
    assert(!text(tree).includes('已保存下次启动配置修订'))
    assert.equal(checkbox(tree).props.checked, true)
    button(tree, '重新读取启动状态（丢弃草稿）').props.onClick(); await settle()
    tree = mounted.render(client.StartupSettingsPanel, { remote })
    assert(!text(tree).includes('保存结果未确认'))
    assert(!text(tree).includes('已保存下次启动配置修订'))
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
  tree = mounted.render(client.StartupSettingsPanel, { remote: oldRemote }); button(tree, '保存下次启动配置').props.onClick()
  tree = mounted.render(client.StartupSettingsPanel, { remote: newRemote })
  assert(!text(tree).includes('启动配置修订 7'), 'first replacement render must not leak prior Remote state')
  mounted.effects(); assert.equal(oldSaveSignal.aborted, true)
  finishOldSave(ok(status({ revision: 800 }))); await settle()
  tree = mounted.render(client.StartupSettingsPanel, { remote: newRemote }); assert(!text(tree).includes('已保存下次启动配置修订'))
  const firstReadSignal = newReadSignal; const finishFirstRead = finishNewRead
  button(tree, '重新读取启动状态（丢弃草稿）').props.onClick(); assert.equal(firstReadSignal.aborted, true)
  finishNewRead(ok(status({ revision: 43, desired: { startupCwdEnabled: false }, restartNeeded: false, state: 'disabled' }))); await settle()
  finishFirstRead(ok(status({ revision: 999 }))); await settle()
  tree = mounted.render(client.StartupSettingsPanel, { remote: newRemote }); assert.match(text(tree), /启动配置修订 43/)
  assert(!text(tree).includes('999'))
  checkbox(tree).props.onChange({ target: { checked: true } }); tree = mounted.render(client.StartupSettingsPanel, { remote: newRemote })
  button(tree, '保存下次启动配置').props.onClick(); mounted.unmount(); assert.equal(newSaveSignal.aborted, true)
  finishNewSave(ok(status({ revision: 1000 }))); await settle()
  tree = mounted.render(client.StartupSettingsPanel, { remote: newRemote })
  assert(!text(tree).includes('已保存下次启动配置修订')); assert(!text(tree).includes('1000'))
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
    button(startupTree, '保存下次启动配置').props.onClick(); await settle()
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
    button(tree, '保存下次启动配置').props.onClick(); await settle()
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
