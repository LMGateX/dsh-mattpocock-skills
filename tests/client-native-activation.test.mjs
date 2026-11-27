import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import vm from 'node:vm'
import React from 'react'
import { Window } from 'happy-dom'
import { PRIMITIVES_ID, clientPrimitives } from './fixtures/client-primitives.mjs'
import { clientSdk, clientRegistration, readShellModules, staticModules } from './fixtures/client-sdk.mjs'
import { buildClient } from '../scripts/build-client.mjs'

const hostRoot = process.env.DSH_CONTROLS_HOST_ROOT
const hostRequire = hostRoot ? clientSdk(hostRoot) : undefined
const native = { timeout: 5000, skip: !hostRoot ? 'Set DSH_CONTROLS_HOST_ROOT for native Client activation' : false }
const local = createRequire(import.meta.url)
let sdkBaseline

async function shellBaseline() {
  if (sdkBaseline) return sdkBaseline
  const shell = new Window({ url: 'http://activation-fixture.test/' })
  shell.document.write('<!doctype html><html><head></head><body><div id="root"></div></body></html>')
  const globals = new Map()
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event', 'MutationObserver', 'ResizeObserver', 'CSSStyleSheet', 'CustomEvent']) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === 'window' ? shell : shell[key] })
  }
  try { return sdkBaseline = await readShellModules(hostRequire) }
  finally {
    await shell.happyDOM.close()
    for (const [key, value] of globals) {
      if (value) Object.defineProperty(globalThis, key, value)
      else delete globalThis[key]
    }
  }
}

function assertUnmounted(f) {
  for (const namespace of ['remote.mattpocockControls', 'remote.mattpocockRecommendationSupport'])
    assert.equal(f.ctx.get(namespace), undefined, namespace)
  for (const seat of ['plugins.bundle.config', 'plugins.row.config', 'conversation.session.header.utilities',
    'conversation.input.dock', 'sidebar.right.pane.tab', 'sidebar.right.pane.tab.title', 'sidebar.session.row.leading', 'tool.call.toolview'])
    assert.equal(f.ctx.slots.entriesOfSlot(seat).length, 0, seat)
  assert.equal(f.tabs.length, 0)
}

async function assembly(t) {
  const load = name => import(pathToFileURL(hostRequire.resolve(name)))
  const cordis = await load('@deepseek-ai/cordis')
  const { TypertRegistry } = await load('@deepseek-ai/dsh-typert-registry')
  const gateway = await load('@deepseek-ai/dsh-api-gateway/client')
  const ctx = new cordis.Context()
  t.after(() => ctx.fiber.dispose(), { timeout: 5000 })
  new TypertRegistry(ctx)
  const calls = [], tabs = []
  const baseline = await shellBaseline()
  const modules = staticModules(baseline, {
    react: React, 'react/jsx-runtime': local('react/jsx-runtime'), '@deepseek-ai/cordis': cordis,
    'react-dom': local('react-dom'), 'react-dom/client': local('react-dom/client'),
  })
  const rendererPath = hostRequire.resolve('@deepseek-ai/dsh-client-ui-renderer/client')
  const renderer = clientRegistration(await readFile(rendererPath, 'utf8'), rendererPath).factory(modules.get)
  new renderer.SlotRegistry(ctx)
  const kinds = {
    'plugins.bundle.config': { kind: 'keyed', scope: 'root' }, 'plugins.row.config': { kind: 'keyed', scope: 'root' },
    'conversation.session.header.utilities': { kind: 'list', scope: 'session' }, 'conversation.input.dock': { kind: 'list', scope: 'session' },
    'sidebar.right.pane.tab': { kind: 'keyed', scope: 'session' }, 'sidebar.right.pane.tab.title': { kind: 'keyed', scope: 'session' }, 'sidebar.session.row.leading': { kind: 'list', scope: 'root' },
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
  const source = process.env.DSH_CONTROLS_CLIENT_BUNDLE ? await readFile(process.env.DSH_CONTROLS_CLIENT_BUNDLE, 'utf8') : (await buildClient()).code
  const registration = clientRegistration(source, 'native-client.bundle.js')
  const primitives = clientPrimitives(React)
  const plugin = registration.factory(name => { if (name === 'react') return React; if (name === PRIMITIVES_ID) return primitives; throw new Error('Unexpected request ' + name) })
  return { ctx, plugin, calls, tabs, load, source, primitives, baseline, modules }
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
    'conversation.input.dock', 'sidebar.right.pane.tab', 'sidebar.right.pane.tab.title', 'sidebar.session.row.leading', 'tool.call.toolview']
  for (let turn = 0; turn < 3; turn++) {
    const fiber = f.ctx.plugin(f.plugin); await fiber
    assert.equal(fiber.state, 2)
    for (const seat of seats) assert.equal(f.ctx.slots.entriesOfSlot(seat).length, seat === 'tool.call.toolview' ? 9 : ['conversation.session.header.utilities', 'conversation.input.dock'].includes(seat) ? 2 : 1, seat)
    assert.equal(f.tabs.length, 1)
    assert.ok(f.ctx.get('remote.mattpocockControls'))
    assert.ok(f.ctx.get('remote.mattpocockRecommendationSupport'))
    await fiber.dispose()
    assert.equal(fiber.state, 4) // Actual unload must settle, not only UI disappearance.
    for (const seat of seats) assert.equal(f.ctx.slots.entriesOfSlot(seat).length, 0, seat)
    assert.equal(f.tabs.length, 0)
    assert.equal(f.ctx.get('remote.mattpocockControls'), undefined)
    assert.equal(f.ctx.get('remote.mattpocockRecommendationSupport'), undefined)
  }
})

test('native Client dependent setup errors fail startup instead of reporting a false active entry', native, async t => {
  const f = await assembly(t)
  f.ctx.sidebarRightTabs.register = () => { throw new Error('synthetic-native-ui-registration-failure') }
  const fiber = f.ctx.plugin(f.plugin)
  await assert.rejects(async () => { await fiber }, /synthetic-native-ui-registration-failure/)
  assert.equal(fiber.state, 3) // Public Cordis FiberState.FAILED.
  assert.equal(f.ctx.slots.entriesOfSlot('plugins.bundle.config').length, 0)
  await fiber.dispose()
  assert.equal(fiber.state, 4)
  assertUnmounted(f)
})

async function browserBoot(f) {
  const { default: Loader } = await f.load('@deepseek-ai/cordis-plugin-loader')
  await f.ctx.plugin(Loader, { baseUrl: import.meta.url })
  const target = { mode: 'queue', pendingQueue: [], load(registration) { this.pendingQueue.push(registration) } }
  const bootstrapPath = hostRequire.resolve('@deepseek-ai/dsh-client-modules/client')
  const bootstrap = clientRegistration(await readFile(bootstrapPath, 'utf8'), bootstrapPath)
  const moduleExports = bootstrap.factory(f.modules.get)
  const id = '@lmgatex/dsh-mattpocock-skills'
  const graph = { rev: 'synthetic-boot', entries: [{ id, url: '/synthetic-client.js', rev: 'synthetic-client' }],
    batches: [{ phase: 'application', url: '/synthetic-client.js', rev: 'synthetic-client', entries: [id] }] }
  const modules = moduleExports.createClientModuleSystem(target, { id: bootstrap.id, exports: moduleExports }, {
    boot: graph, staticModules: Array.isArray(f.baseline)
      ? f.baseline.map(row => row.id === 'react' ? { id: row.id, factory: () => React } : row.id === PRIMITIVES_ID ? { id: row.id, factory: () => f.primitives } : row)
      : { react: React, [PRIMITIVES_ID]: f.primitives }, loadBundle: async url => {
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
  await entry.fiber.dispose()
  assert.equal(entry.fiber.state, 4)
  assertUnmounted(f)
})


test('native browser graph removal and re-add replace the fiber without leaked or duplicate UI', native, async t => {
  const f = await assembly(t)
  const { entry, modules, id } = await browserBoot(f)
  const originalFiber = entry.fiber
  const seats = ['plugins.bundle.config', 'plugins.row.config', 'conversation.session.header.utilities',
    'conversation.input.dock', 'sidebar.right.pane.tab', 'sidebar.right.pane.tab.title', 'sidebar.session.row.leading', 'tool.call.toolview']
  const registered = () => {
    for (const seat of seats) assert.equal(f.ctx.slots.entriesOfSlot(seat).length, seat === 'tool.call.toolview' ? 9 : ['conversation.session.header.utilities', 'conversation.input.dock'].includes(seat) ? 2 : 1, seat)
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
  assert.equal(originalFiber.state, 4)
  assertUnmounted(f)
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
  await next.fiber.dispose()
  assert.equal(next.fiber.state, 4)
  assertUnmounted(f)
})
