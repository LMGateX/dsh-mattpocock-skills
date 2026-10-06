import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import vm from 'node:vm'
import React from 'react'

const hostRoot = process.env.DSH_CONTROLS_HOST_ROOT
const native = { skip: !hostRoot && 'Set DSH_CONTROLS_HOST_ROOT for native Client activation' }

async function assembly(t) {
  const require = createRequire(pathToFileURL(join(hostRoot, 'package.json')))
  const load = name => import(pathToFileURL(require.resolve(name)))
  const { Context } = await load('@deepseek-ai/cordis')
  const { TypertRegistry } = await load('@deepseek-ai/dsh-typert-registry')
  const gateway = await import(pathToFileURL(join(hostRoot, 'node_modules/@deepseek-ai/dsh-api-gateway/lib/types/client/index.js')))
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  new TypertRegistry(ctx)
  const calls = [], tabs = []
  const nativeSlots = await load('@deepseek-ai/dsh-client-ui-slots')
  let rendererRegistration
  const rendererSource = await readFile(join(hostRoot, 'node_modules/@deepseek-ai/dsh-client-ui-renderer/lib/client.js'), 'utf8')
  vm.runInThisContext('(function(window){' + rendererSource + '\n})', { filename: 'native-slot-registry.js' })({ __ModuleLoader__: { load: value => { rendererRegistration = value } } })
  const renderer = rendererRegistration.factory(name => {
    if (name === '@deepseek-ai/cordis') return { Context, Service: require('@deepseek-ai/cordis').Service }
    if (name === '@deepseek-ai/dsh-client-ui-slots') return nativeSlots
    if (name === 'react') return React
    if (name === 'react/jsx-runtime') return createRequire(import.meta.url)('react/jsx-runtime')
    // DOM mounting is outside this no-server activation/registration test.
    if (name === 'react-dom' || name === 'react-dom/client') return Object.freeze({})
    throw new Error('Unexpected renderer external ' + name)
  })
  new renderer.SlotRegistry(ctx)
  const kinds = {
    'plugins.bundle.config': { kind: 'keyed', scope: 'root' }, 'plugins.row.config': { kind: 'keyed', scope: 'root' },
    'conversation.session.header.utilities': { kind: 'list', scope: 'session' }, 'conversation.input.dock': { kind: 'list', scope: 'session' },
    'sidebar.right.pane.tab': { kind: 'keyed', scope: 'session' }, 'sidebar.session.row.leading': { kind: 'list', scope: 'root' },
    'tool.call.toolview': { kind: 'keyed', scope: 'session' },
  }
  ctx.slots.register({ name: 'root', children: kinds }, () => null)
  ctx.provide('connection', { isLoopback: true, generation: { getSnapshot: () => undefined, subscribe: () => () => {} }, registerGenerationSource: () => () => {}, start: () => ({ stop() {} }),
    rpc: { open() { throw new Error('No stream carrier in unary fixture') }, async call(channel, endpoint, payload) {
      calls.push({ channel, endpoint, payload })
      return { ok: true, value: { revision: 0, extensionEnabled: false, defaults: {}, workspaceOverrides: {} } }
    } } })
  ctx.provide('sidebarRight', { mounted: { getSnapshot: () => null }, openTab() { throw new Error('Activation must not open a tab') } })
  ctx.provide('sidebarRightTabs', { register: definition => { tabs.push(definition); return () => { tabs.splice(tabs.indexOf(definition), 1) } } })
  await ctx.plugin(gateway)
  let registration
  const source = await readFile(process.env.DSH_CONTROLS_CLIENT_BUNDLE ?? new URL('../lib/client.js', import.meta.url), 'utf8')
  vm.runInThisContext('(function(window){' + source + '\n})', { filename: 'native-client.bundle.js' })({ __ModuleLoader__: { load: value => { registration = value } } })
  const plugin = registration.factory(name => { assert.equal(name, 'react'); return React })
  return { ctx, plugin, calls, tabs, load, source }
}

test('native Client plugin fiber activates after self-mounting its declared Remote namespace', native, async t => {
  const f = await assembly(t)
  const fiber = f.ctx.plugin(f.plugin)
  await fiber
  assert.equal(fiber.state, 2) // Public Cordis FiberState.ACTIVE.
  assert.equal(f.ctx.slots.entriesOfSlot('plugins.bundle.config').length, 1)
  assert.equal(f.tabs.length, 1)
  assert.ok(f.calls.some(call => call.endpoint === 'mattpocockControls/readPolicy'))
})

test('native Client teardown removes all namespace-owned UI and permits a clean remount', native, async t => {
  const f = await assembly(t)
  const seats = ['plugins.bundle.config', 'plugins.row.config', 'conversation.session.header.utilities',
    'conversation.input.dock', 'sidebar.right.pane.tab', 'sidebar.session.row.leading', 'tool.call.toolview']
  for (let turn = 0; turn < 2; turn++) {
    const fiber = f.ctx.plugin(f.plugin); await fiber
    assert.equal(fiber.state, 2)
    for (const seat of seats) assert.equal(f.ctx.slots.entriesOfSlot(seat).length, seat === 'tool.call.toolview' ? 9 : 1, seat)
    assert.equal(f.tabs.length, 1)
    await fiber.dispose()
    for (const seat of seats) assert.equal(f.ctx.slots.entriesOfSlot(seat).length, 0, seat)
    assert.equal(f.tabs.length, 0)
    assert.equal(f.ctx.get('remote.mattpocockControls'), undefined)
  }
})

test('native Client dependent setup errors fail startup instead of reporting a false active entry', native, async t => {
  const f = await assembly(t)
  f.ctx.sidebarRightTabs.register = () => { throw new Error('synthetic-native-ui-registration-failure') }
  const fiber = f.ctx.plugin(f.plugin)
  await assert.rejects(async () => { await fiber }, /synthetic-native-ui-registration-failure/)
  assert.equal(fiber.state, 3) // Public Cordis FiberState.FAILED.
  assert.equal(f.ctx.slots.entriesOfSlot('plugins.bundle.config').length, 0)
})

async function browserBoot(f) {
  const { default: Loader } = await f.load('@deepseek-ai/cordis-plugin-loader')
  await f.ctx.plugin(Loader, { baseUrl: import.meta.url })
  const target = { mode: 'queue', pendingQueue: [], load(registration) { this.pendingQueue.push(registration) } }
  let bootstrap
  const moduleSource = await readFile(join(hostRoot, 'node_modules/@deepseek-ai/dsh-client-modules/lib/client.js'), 'utf8')
  vm.runInThisContext('(function(window){' + moduleSource + '\n})')({ __ModuleLoader__: { load: registration => { bootstrap = registration } } })
  const moduleExports = bootstrap.factory(name => { throw new Error('Unexpected module bootstrap external ' + name) })
  const id = '@lmgatex/dsh-mattpocock-skills'
  const graph = { rev: 'synthetic-boot', entries: [{ id, url: '/synthetic-client.js', rev: 'synthetic-client' }],
    batches: [{ phase: 'application', url: '/synthetic-client.js', rev: 'synthetic-client', entries: [id] }] }
  const modules = moduleExports.createClientModuleSystem(target, { id: bootstrap.id, exports: moduleExports }, {
    boot: graph, staticModules: { react: React }, loadBundle: async url => {
      assert.equal(url, '/synthetic-client.js')
      vm.runInThisContext('(function(window){' + f.source + '\n})')({ __ModuleLoader__: target })
    },
  })
  f.ctx.loader.internal = modules
  await modules.entries.start(f.ctx.loader, modules.manifest)
  await f.ctx.loader.await()
  const entry = [...f.ctx.loader.entries()].find(row => row.options.name === id)
  assert.ok(entry?.fiber, 'native browser loader must create a real entry fiber')
  return { entry, modules, id }
}

test('native browser module factory and Loader explicitly audit the plugin ACTIVE after boot settles', native, async t => {
  const f = await assembly(t)
  const { entry, modules } = await browserBoot(f)
  await entry.fiber.await()
  assert.equal(entry.fiber.state, 2)
  assert.deepEqual(modules.entries.state.getSnapshot().failures, [])
  assert.equal(f.ctx.slots.entriesOfSlot('plugins.bundle.config').length, 1)
})

test('native browser loader settling is not a false success when the dependent UI scope fails', native, async t => {
  const f = await assembly(t)
  f.ctx.sidebarRightTabs.register = () => { throw new Error('synthetic-browser-ui-registration-failure') }
  const { entry, id } = await browserBoot(f)
  // Loader.await can settle despite a failed entry. The Web boot caller must
  // still audit every entry's actual lifecycle state, not promise fulfillment.
  assert.equal(entry.fiber.state, 3)
  await assert.rejects(() => entry.fiber.await(), /synthetic-browser-ui-registration-failure/)
  const failed = [...f.ctx.loader.entries()].filter(row => row.fiber?.state !== 2).map(row => row.options.name)
  assert.deepEqual(failed, [id])
  assert.equal(f.ctx.slots.entriesOfSlot('plugins.bundle.config').length, 0)
})


test('native browser graph removal and re-add replace the fiber without leaked or duplicate UI', native, async t => {
  const f = await assembly(t)
  const { entry, modules, id } = await browserBoot(f)
  const originalFiber = entry.fiber
  const seats = ['plugins.bundle.config', 'plugins.row.config', 'conversation.session.header.utilities',
    'conversation.input.dock', 'sidebar.right.pane.tab', 'sidebar.session.row.leading', 'tool.call.toolview']
  const registered = () => {
    for (const seat of seats) assert.equal(f.ctx.slots.entriesOfSlot(seat).length, seat === 'tool.call.toolview' ? 9 : 1, seat)
    assert.equal(f.tabs.length, 1)
  }
  registered()
  await modules.entries.sync({ rev: 'synthetic-without-target', entries: [], batches: [] })
  await f.ctx.loader.await()
  assert.equal([...f.ctx.loader.entries()].some(row => row.options.name === id), false)
  assert.deepEqual(modules.entries.state.getSnapshot().failures, [])
  for (const seat of seats) assert.equal(f.ctx.slots.entriesOfSlot(seat).length, 0, seat)
  assert.equal(f.tabs.length, 0)
  assert.equal(f.ctx.get('remote.mattpocockControls'), undefined)
  await modules.entries.sync({ rev: 'synthetic-readded', entries: [{ id, url: '/synthetic-client.js', rev: 'synthetic-client' }],
    batches: [{ phase: 'application', url: '/synthetic-client.js', rev: 'synthetic-client', entries: [id] }] })
  await f.ctx.loader.await()
  const next = [...f.ctx.loader.entries()].find(row => row.options.name === id)
  assert.ok(next?.fiber)
  await next.fiber.await()
  assert.equal(next.fiber.state, 2)
  assert.notStrictEqual(next.fiber, originalFiber)
  assert.deepEqual(modules.entries.state.getSnapshot().failures, [])
  registered()
})
