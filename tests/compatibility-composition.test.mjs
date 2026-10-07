import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire, registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'
import { mkdtemp, mkdir, writeFile, rm, symlink, readdir, cp, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join, isAbsolute } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'

// Accepted seam: actual public applyEntryPatches -> Loader.root.update -> Fiber.
// No SDK writes, profile boot, network, AgentLoop, or model requests.
const hostRoot = process.env.DSH_CONTROLS_HOST_ROOT
const options = { skip: !hostRoot && 'set DSH_CONTROLS_HOST_ROOT for public Loader regression' }
let api, bindings, sdk, lifecycleStubSource
const observation = { mounts: [], disposals: [] }
if (hostRoot) {
  assert(isAbsolute(hostRoot))
  const require = createRequire(pathToFileURL(join(hostRoot, 'package.json')))
  const load = name => import(pathToFileURL(require.resolve(name)).href)
  sdk = { ...await load('@deepseek-ai/cordis'), ...await load('@deepseek-ai/cordis-plugin-loader'),
    ...await load('@deepseek-ai/cordis-plugin-include'), ...await load('@deepseek-ai/dsh-typert-registry'),
    ...await load('@deepseek-ai/dsh-subagent') }
  // A clearly marked compatibility stub: selection/lifecycle only, NOT cwd support.
  const stubSource =     'import { Service } from ' + JSON.stringify(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href) + ';' +
    'export default class CompatibilityStub extends Service {' +
    'constructor(ctx) { super(ctx, "subagents"); this.fixtureOnly = true;' +
    'const o = globalThis[Symbol.for("dsh.composition.fixture")]; o.mounts.push(this);' +
    'ctx.on("dispose", () => o.disposals.push(this)); }}'
  globalThis[Symbol.for('dsh.composition.fixture')] = observation
  lifecycleStubSource = stubSource
  const stubUrl = 'data:text/javascript,' + encodeURIComponent(stubSource)
  const stockUrl = pathToFileURL(require.resolve('@deepseek-ai/dsh-subagent')).href
  registerHooks({
    resolve(specifier, context, next) {
      if (specifier === '@lmgatex/dsh-mattpocock-skills/native-subagent' && context.conditions.includes('import')) {
        observation.compatImports = (observation.compatImports ?? 0) + 1
        return { url: stubUrl, shortCircuit: true }
      }
      // Only the explicitly marked pending-native lifecycle fixture substitutes
      // an import. Ordinary canonical proof uses the real ESM resolver unchanged.
      if (observation.stockModuleUrl && specifier === '@deepseek-ai/dsh-subagent' && context.conditions.includes('import')) return { url: observation.stockModuleUrl, shortCircuit: true }
      if (context.parentURL?.includes('/dsh-mattpocock-skills/src/compatibility/') && specifier === './peer-bindings.js') return { url: new URL('./peer-bindings.ts', context.parentURL).href, shortCircuit: true }
      return next(specifier, context)
    },
    load(url, context, next) {
      if (['composition.ts', 'peer-bindings.ts'].some(name => new URL(url).pathname.endsWith('/dsh-mattpocock-skills/src/compatibility/' + name))) return { format: 'module', shortCircuit: true,
        source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText }
      return next(url, context)
    },
  })
  observation.stockUrl = stockUrl
  observation.cordisUrl = pathToFileURL(require.resolve('@deepseek-ai/cordis')).href
  api = await import('../src/compatibility/composition.ts')
  bindings = await import('../src/compatibility/peer-bindings.ts')
}
function base() { return [{ id: 'subagent', name: '@deepseek-ai/dsh-subagent', config: { maxDepth: 3, maxActiveSubagents: 2 } }] }
function compose(data = base(), overlays = []) {
  const warnings = []
  const rows = sdk.applyEntryPatches(data, [...api.createCompatibilityCompositionPatches(), ...overlays], (...args) => warnings.push(args))
  return { rows, warnings }
}
async function publicProfile(t, { duplicatePeer = false, duplicateShared = false, pluginName = '@lmgatex/dsh-mattpocock-skills', exportPath = './lib/compatibility/native-subagent.js' } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-composition-profile-'))
  assert(isAbsolute(root) && root.startsWith(join(tmpdir(), 'dsh-composition-profile-')))
  t.after(() => rm(root, { recursive: true, force: true }))
  const pluginRoot = join(root, 'node_modules/@lmgatex/dsh-mattpocock-skills')
  await mkdir(join(pluginRoot, 'lib/compatibility'), { recursive: true })
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'public-composition-fixture', type: 'module' }))
  for (const name of await readdir(join(hostRoot, 'node_modules'))) {
    if (name !== '@lmgatex') await symlink(join(hostRoot, 'node_modules', name), join(root, 'node_modules', name))
  }
  await writeFile(join(pluginRoot, 'package.json'), JSON.stringify({ name: pluginName, version: 'fixture-only', type: 'module', exports: {
    './native-subagent': exportPath, './package.json': './package.json',
  } }))
  // Real package/export/Node resolver evidence; executable entry is lifecycle-only.
  await writeFile(join(pluginRoot, 'lib/compatibility/native-subagent.js'), lifecycleStubSource)
  await mkdir(join(pluginRoot, 'compatibility'))
  await writeFile(join(pluginRoot, 'compatibility/native-subagent-0.2.1-alpha.1.js'), '// lifecycle-only fixture artifact resolver anchor')
  if (duplicatePeer || duplicateShared) {
    await mkdir(join(pluginRoot, 'node_modules/@deepseek-ai'), { recursive: true })
    const name = duplicatePeer ? 'dsh-subagent' : 'dsh-scope'
    await cp(join(hostRoot, 'node_modules/@deepseek-ai', name), join(pluginRoot, 'node_modules/@deepseek-ai', name), { recursive: true, dereference: true })
  }
  return { root, pluginRoot, profile: { dir: root, installAnchor: join(hostRoot, 'package.json') }, baseUrl: pathToFileURL(root + '/').href }
}

async function fixture(t, { profile = true, baseUrl, ancestorScope } = {}) {
  if (profile === true) {
    const layout = await publicProfile(t)
    profile = layout.profile
    baseUrl ??= layout.baseUrl
  }
  baseUrl ??= pathToFileURL(hostRoot + '/').href
  const root = new sdk.Context()
  const ctx = ancestorScope === 'isolate' ? root.isolate('subagents')
    : ancestorScope === 'intercept' ? root.intercept('subagents', { fixtureScope: true }) : root
  const logs = []
  ctx.logger.exporter({ export(message) { logs.push(message) } })
  new sdk.TypertRegistry(ctx)
  if (profile) ctx.provide('profileContext', typeof profile === 'object' ? profile : { dir: hostRoot, installAnchor: join(hostRoot, 'package.json') })
  const loader = new sdk.Loader(ctx, { baseUrl })
  const disposals = []
  ctx.on('internal/plugin', fiber => { if (fiber.entry && fiber.uid === null) disposals.push(fiber) })
  ctx.provide('llm', { prepareCall() { throw new Error('model forbidden') }, stream() { throw new Error('model forbidden') } })
  t.after(async () => { await loader.root.update([]); await loader.await(); await ctx.fiber.dispose() })
  await root.fiber.await()
  return { ctx, root, loader, disposals, logs, async update(rows) { await loader.root.update(rows); await loader.await() } }
}
function assertActive(entry) { assert.equal(entry.fiber.state, 2 /* public FiberState.ACTIVE const enum */); assert.notEqual(entry.fiber.uid, null) }

test('fresh public composition mounts exactly one compatibility service and retains original raw native config', options, async t => {
  const f = await fixture(t)
  const { rows, warnings } = compose()
  assert.deepEqual(warnings, [])
  await f.update(rows)
  const stock = f.loader.resolve('subagent'), compat = f.loader.resolve('mattpocock-native-subagent')
  assert.equal(stock.options.name, '@deepseek-ai/dsh-subagent')
  assert.deepEqual(stock.options.config, { maxDepth: 3, maxActiveSubagents: 2 })
  assert.equal(stock.disabled, true)
  assert.equal(stock.fiber, undefined)
  assertActive(compat)
  assert.equal(f.ctx.subagents.fixtureOnly, true)
  assert.equal(observation.mounts.length, 1)
})

test('serialized public patches decide before any composition or compatibility module import', options, async t => {
  const layout = await publicProfile(t)
  const rows = compose().rows
  const script =     'import assert from "node:assert/strict"; import { createRequire, registerHooks } from "node:module";' +
    'import { pathToFileURL } from "node:url"; import { join } from "node:path";' +
    'const root = process.env.DSH_CONTROLS_HOST_ROOT, require = createRequire(pathToFileURL(join(root,"package.json")));' +
    'const load = name => import(pathToFileURL(require.resolve(name)).href);' +
    'const {Context} = await load("@deepseek-ai/cordis"), {Loader} = await load("@deepseek-ai/cordis-plugin-loader");' +
    'const {applyEntryPatches} = await load("@deepseek-ai/cordis-plugin-include");' +
    'const profile = process.env.DSH_COMPOSITION_PROFILE; const ctx = new Context(); ctx.provide("profileContext", {dir:profile,installAnchor:join(root,"package.json")});' +
    'const loader = new Loader(ctx,{baseUrl:pathToFileURL(profile+"/").href}); let imports=0, mounts=0;' +
    'globalThis[Symbol.for("fixture.mount")] = () => mounts++;' +
    'const cordisUrl = pathToFileURL(require.resolve("@deepseek-ai/cordis")).href;' +
    'const stub = ' + JSON.stringify('import {Service} from ' + JSON.stringify(observation.cordisUrl) + '; export default class Stub extends Service {constructor(ctx){super(ctx,"subagents"); globalThis[Symbol.for("fixture.mount")]();}}') + ';' +
    'registerHooks({resolve(specifier,context,next){if(specifier==="@lmgatex/dsh-mattpocock-skills/native-subagent" && context.conditions.includes("import")){' +
    'imports++; assert.equal(loader.resolve("subagent").disabled,true); assert.equal(globalThis.F,undefined);' +
    'return {url:"data:text/javascript,"+encodeURIComponent(stub),shortCircuit:true};} return next(specifier,context);}});' +
    'const rows = applyEntryPatches([], [{insert:JSON.parse(process.env.DSH_COMPOSITION_ROWS)}], () => assert.fail());' +
    'await ctx.fiber.await(); await loader.root.update(rows); await loader.await();' +
    'assert.equal(imports,1); assert.equal(mounts,1); assert.equal(loader.resolve("subagent").fiber,undefined);' +
    'await loader.root.update([]); await loader.await(); await ctx.fiber.dispose(); console.log("self-contained public boot verified");'
  const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, DSH_COMPOSITION_ROWS: JSON.stringify(rows), DSH_COMPOSITION_PROFILE: layout.root }, timeout: 10000,
  })
  assert.match(stdout, /self-contained public boot verified/)
})

test('first-install HMR retains actual mounted stock service and ACTIVE fiber through repeated reloads', options, async t => {
  const f = await fixture(t)
  await f.update(base())
  const stock = f.loader.resolve('subagent'), fiber = stock.fiber, service = f.ctx.subagents[sdk.symbols.original]
  assertActive(stock)
  assert(service instanceof stock.moduleNamespace.SubagentRuntime)
  const mounts = observation.mounts.length
  for (let round = 0; round < 3; round++) {
    await f.update(compose().rows)
    assert.equal(f.ctx.subagents[sdk.symbols.original] === service, true)
    assert.strictEqual(stock.fiber, fiber)
    assertActive(stock)
    assert.equal(f.loader.resolve('mattpocock-native-subagent').fiber, undefined)
    assert.equal(observation.mounts.length, mounts)
    assert(!f.disposals.includes(fiber))
  }
})

test('compat-first existing public update order retains the actual mounted stock service', options, async t => {
  const f = await fixture(t)
  await f.update([{ id: 'mattpocock-native-subagent', name: '@lmgatex/dsh-mattpocock-skills/native-subagent', disabled: true }, ...base()])
  const stock = f.loader.resolve('subagent'), fiber = stock.fiber
  const service = f.ctx.subagents[sdk.symbols.original]
  for (let round = 0; round < 3; round++) {
    await f.update(compose().rows.reverse())
    assert.strictEqual(stock.fiber, fiber)
    assert.equal(f.ctx.subagents[sdk.symbols.original] === service, true)
    assertActive(stock)
    assert.equal(f.loader.resolve('mattpocock-native-subagent').fiber === undefined, true)
  }
})

for (const ancestorScope of [undefined, 'isolate', 'intercept']) test('first-install HMR retains a pending native Fiber before fresh root scope gates: ' + (ancestorScope ?? 'root'), options, async t => {
  const gate = Promise.withResolvers()
  observation.pendingGate = gate.promise
  const source = 'import { SubagentRuntime } from ' + JSON.stringify(observation.stockUrl) + ';' +
    'import { Service } from ' + JSON.stringify(observation.cordisUrl) + ';' +
    'export default class PendingNativeFixture extends SubagentRuntime {' +
    'async *[Service.init]() { await globalThis[Symbol.for("dsh.composition.fixture")].pendingGate; }}'
  observation.stockModuleUrl = 'data:text/javascript,' + encodeURIComponent(source)
  t.after(() => { gate.resolve(); delete observation.stockModuleUrl; delete observation.pendingGate })
  const f = await fixture(t, { ancestorScope })
  await f.loader.root.update(base())
  const stock = f.loader.resolve('subagent'), fiber = stock.fiber
  assert.equal(fiber.state, 1 /* FiberState.PENDING */)
  assert.equal(f.ctx.get('subagents'), undefined)
  await f.loader.root.update(compose().rows)
  assert.strictEqual(stock.fiber, fiber)
  assert.notEqual(fiber.uid, null)
  assert.equal(f.loader.resolve('mattpocock-native-subagent').fiber === undefined, true)
  gate.resolve()
  await f.loader.await()
  assertActive(stock)
  assert(f.ctx.subagents instanceof sdk.SubagentRuntime)
})

for (const reversed of [false, true]) test('fresh selection and sticky compat reload work in ' + (reversed ? 'compat-first' : 'stock-first') + ' order', options, async t => {
  const f = await fixture(t), mounts = observation.mounts.length
  const order = rows => reversed ? rows.reverse() : rows
  await f.update(order(compose().rows))
  const compat = f.loader.resolve('mattpocock-native-subagent'), fiber = compat.fiber
  const service = f.ctx.subagents[sdk.symbols.original]
  for (let round = 0; round < 3; round++) {
    // Re-import the composition module, like a new plugin generation in HMR.
    const generation = await import('../src/compatibility/composition.ts?generation=' + reversed + '-' + round)
    const rows = sdk.applyEntryPatches(base(), generation.createCompatibilityCompositionPatches(), () => assert.fail('unexpected patch warning'))
    await f.update(order(rows))
    assertActive(compat)
    assert.strictEqual(compat.fiber, fiber)
    assert.equal(f.ctx.subagents[sdk.symbols.original] === service, true)
    assert.equal(f.loader.resolve('subagent').fiber, undefined)
    assert.equal(observation.mounts.length, mounts + 1)
  }
  await f.update([])
  assert(f.disposals.includes(fiber), 'public internal/plugin disposal event observed')
  assert.equal(f.ctx.get('subagents'), undefined)
  assert.equal(fiber.uid, null)
})

test('a public isolated Loader ancestor retains scoped stock before any compatibility import', options, async t => {
  const f = await fixture(t, { ancestorScope: 'isolate' })
  assert.notEqual(f.ctx[sdk.Context.isolate].subagents, f.root[sdk.Context.isolate].subagents)
  const imports = observation.compatImports ?? 0, mounts = observation.mounts.length
  await f.update(compose().rows)
  assertActive(f.loader.resolve('subagent'))
  assert.equal(f.loader.resolve('mattpocock-native-subagent').fiber, undefined)
  assert.equal(observation.compatImports ?? 0, imports)
  assert.equal(observation.mounts.length, mounts)
  assert(f.ctx.subagents instanceof sdk.SubagentRuntime)
  assert.equal(f.root.get('subagents'), undefined, 'ordinary scoped native never widens into root')
})

test('matching public maps from two genuine roots retain stock before compatibility import', options, async t => {
  const f = await fixture(t)
  const otherRoot = new sdk.Context()
  otherRoot[sdk.Context.isolate] = f.root[sdk.Context.isolate]
  otherRoot[sdk.Context.intercept] = f.root[sdk.Context.intercept]
  t.after(() => otherRoot.fiber.dispose())
  f.ctx.on('loader/entry-init', entry => { entry.ctx = entry.ctx.extend({ root: otherRoot }) })
  const imports = observation.compatImports ?? 0, mounts = observation.mounts.length
  await f.update(compose().rows)
  const stock = f.loader.resolve('subagent')
  assert.notEqual(stock.ctx.root, f.loader.context.root)
  for (const symbol of [sdk.Context.isolate, sdk.Context.intercept]) {
    for (const key in stock.ctx[symbol]) assert.equal(stock.ctx[symbol][key], f.loader.context[symbol][key])
  }
  assertActive(stock)
  assert.equal(f.loader.resolve('mattpocock-native-subagent').fiber, undefined)
  assert.equal(observation.compatImports ?? 0, imports)
  assert.equal(observation.mounts.length, mounts)
  assert(f.ctx.subagents instanceof sdk.SubagentRuntime)
})

test('more than 512 inherited public root labels retain stock before compatibility import', options, async t => {
  const f = await fixture(t)
  const inherited = Object.create(f.root[sdk.Context.isolate])
  for (let index = 0; index < 521; index++) inherited['fixture-scope-' + index] = Symbol('fixture-scope-' + index)
  f.root[sdk.Context.isolate] = Object.create(inherited)
  assert.equal(Object.keys(f.root[sdk.Context.isolate]).length, 0, 'labels are inherited, not merely own keys')
  const imports = observation.compatImports ?? 0, mounts = observation.mounts.length
  await f.update(compose().rows)
  assertActive(f.loader.resolve('subagent'))
  assert.equal(f.loader.resolve('mattpocock-native-subagent').fiber, undefined)
  assert.equal(observation.compatImports ?? 0, imports)
  assert.equal(observation.mounts.length, mounts)
  assert(f.ctx.subagents instanceof sdk.SubagentRuntime)
})

test('an array-valued public root scope map retains ordinary stock before compatibility import', options, async t => {
  const f = await fixture(t)
  f.root[sdk.Context.intercept] = []
  const imports = observation.compatImports ?? 0
  await f.update(compose().rows)
  assertActive(f.loader.resolve('subagent'))
  assert.equal(f.loader.resolve('mattpocock-native-subagent').fiber, undefined)
  assert.equal(observation.compatImports ?? 0, imports)
  assert(f.ctx.subagents instanceof sdk.SubagentRuntime)
})

test('exactly 512 public root labels remain eligible for fresh compatibility selection', options, async t => {
  const f = await fixture(t)
  const map = f.root[sdk.Context.isolate]
  const existing = Object.keys(map).length
  for (let index = existing; index < 512; index++) map['fixture-scope-' + index] = Symbol('fixture-scope-' + index)
  assert.equal(Object.keys(map).length, 512)
  await f.update(compose().rows)
  assert.equal(f.loader.resolve('subagent').fiber, undefined)
  assertActive(f.loader.resolve('mattpocock-native-subagent'))
  assert.equal(f.ctx.subagents.fixtureOnly, true)
})

test('warm canonical stock remains the exact provider after public root labels grow beyond admission budget', options, async t => {
  const f = await fixture(t)
  await f.update(base())
  const stock = f.loader.resolve('subagent'), fiber = stock.fiber, service = f.ctx.subagents[sdk.symbols.original]
  for (let index = 0; index < 521; index++) f.root[sdk.Context.isolate]['fixture-scope-' + index] = Symbol('fixture-scope-' + index)
  const imports = observation.compatImports ?? 0
  await f.update(compose().rows)
  assert.strictEqual(stock.fiber, fiber)
  assert.equal(f.ctx.subagents[sdk.symbols.original] === service, true)
  assert.equal(observation.compatImports ?? 0, imports)
  assertActive(stock)
})

test('a public intercepted Loader ancestor retains its original native config realm before compatibility import', options, async t => {
  const f = await fixture(t, { ancestorScope: 'intercept' })
  assert.notEqual(f.ctx[sdk.Context.intercept].subagents, f.root[sdk.Context.intercept].subagents)
  const imports = observation.compatImports ?? 0, mounts = observation.mounts.length
  await f.update(compose().rows)
  const stock = f.loader.resolve('subagent')
  assertActive(stock)
  assert.equal(f.loader.resolve('mattpocock-native-subagent').fiber, undefined)
  assert.equal(observation.compatImports ?? 0, imports)
  assert.equal(observation.mounts.length, mounts)
  assert(f.ctx.subagents instanceof sdk.SubagentRuntime)
  assert.deepEqual(stock.options.config, base()[0].config)
})

test('a wrapper with its own pristine duplicate native peer keeps the canonical stock provider', options, async t => {
  const layout = await publicProfile(t, { duplicatePeer: true })
  const nativeRequire = createRequire(join(layout.root, 'package.json'))
  const wrapperRequire = createRequire(join(layout.pluginRoot, 'lib/compatibility/native-subagent.js'))
  assert.notEqual(await realpath(nativeRequire.resolve('@deepseek-ai/dsh-subagent')), await realpath(wrapperRequire.resolve('@deepseek-ai/dsh-subagent')))
  const f = await fixture(t, layout), mounts = observation.mounts.length
  await f.update(compose().rows)
  assertActive(f.loader.resolve('subagent'))
  assert.equal(f.loader.resolve('mattpocock-native-subagent').fiber === undefined, true)
  assert.equal(observation.mounts.length, mounts)
})

test('a wrapper-local scope shadow is unused: selection binds the artifact to the native-owned scope URL', options, async t => {
  const layout = await publicProfile(t, { duplicateShared: true }), mounts = observation.mounts.length
  const nativeRequire = createRequire(new URL(observation.stockUrl))
  const own = createRequire(join(layout.pluginRoot, 'lib/compatibility/native-subagent.js'))
  assert.notEqual(await realpath(nativeRequire.resolve('@deepseek-ai/dsh-scope')), await realpath(own.resolve('@deepseek-ai/dsh-scope')))
  const f = await fixture(t, layout)
  const selected = bindings.inspectCanonicalPeerBindings(f.ctx, fileURLToPath(observation.stockUrl),
    join(layout.pluginRoot, 'lib/compatibility/native-subagent.js'), join(layout.pluginRoot, 'compatibility/native-subagent-0.2.1-alpha.1.js'), layout.profile.installAnchor)
  assert.equal(selected['@deepseek-ai/dsh-scope'], pathToFileURL(nativeRequire.resolve('@deepseek-ai/dsh-scope')).href, 'bound native URL excludes the unused wrapper shadow')
  await f.update(compose().rows)
  assert.equal(f.loader.resolve('subagent').fiber, undefined)
  assertActive(f.loader.resolve('mattpocock-native-subagent'))
  assert.equal(f.ctx.subagents.fixtureOnly, true, 'lifecycle-only fixture is not evidence of cwd support')
  assert.equal(observation.mounts.length, mounts + 1)
})

test('a non-direct shadow with different import conditions is ignored because no artifact bare import uses it', options, async t => {
  const layout = await publicProfile(t, { duplicateShared: true })
  const shared = join(layout.pluginRoot, 'node_modules/@deepseek-ai/dsh-scope')
  const manifest = JSON.parse(readFileSync(join(shared, 'package.json'), 'utf8'))
  await symlink(join(hostRoot, 'node_modules/@deepseek-ai/dsh-scope/lib/index.js'), join(shared, 'shared-native.js'))
  manifest.exports['.'] = { import: './lib/index.js', default: './shared-native.js' }
  await writeFile(join(shared, 'package.json'), JSON.stringify(manifest))
  const native = createRequire(new URL(observation.stockUrl)), own = createRequire(join(layout.pluginRoot, 'lib/compatibility/native-subagent.js'))
  assert.equal(await realpath(native.resolve('@deepseek-ai/dsh-scope')), await realpath(own.resolve('@deepseek-ai/dsh-scope')))
  assert.notEqual(await realpath(native.resolve('@deepseek-ai/dsh-scope/package.json')), await realpath(own.resolve('@deepseek-ai/dsh-scope/package.json')))
  const f = await fixture(t, layout)
  const selected = bindings.inspectCanonicalPeerBindings(f.ctx, fileURLToPath(observation.stockUrl),
    join(layout.pluginRoot, 'lib/compatibility/native-subagent.js'), join(layout.pluginRoot, 'compatibility/native-subagent-0.2.1-alpha.1.js'), layout.profile.installAnchor)
  assert.equal(selected['@deepseek-ai/dsh-scope'], pathToFileURL(native.resolve('@deepseek-ai/dsh-scope')).href)
  assert.notEqual(selected['@deepseek-ai/dsh-scope'], pathToFileURL(join(shared, 'lib/index.js')).href)
  await f.update(compose().rows)
  assert.equal(f.loader.resolve('subagent').fiber, undefined)
  assertActive(f.loader.resolve('mattpocock-native-subagent'))
  assert.equal(f.ctx.subagents.fixtureOnly, true)
})

for (const name of ['@deepseek-ai/cordis', '@deepseek-ai/cordis-plugin-loader', '@deepseek-ai/dsh-util-values']) test('real wrapper bare import ' + name + ' shadow retains stock before compatibility import', options, async t => {
  const layout = await publicProfile(t), own = join(layout.pluginRoot, 'lib/node_modules', name)
  await mkdir(join(layout.pluginRoot, 'lib/node_modules/@deepseek-ai'), { recursive: true })
  await cp(join(hostRoot, 'node_modules', name), own, { recursive: true, dereference: true })
  const native = createRequire(new URL(observation.stockUrl)), wrapper = createRequire(join(layout.pluginRoot, 'lib/compatibility/native-subagent.js'))
  assert.notEqual(await realpath(native.resolve(name)), await realpath(wrapper.resolve(name)))
  const f = await fixture(t, layout), mounts = observation.mounts.length, imports = observation.compatImports ?? 0
  await f.update(compose().rows)
  assertActive(f.loader.resolve('subagent'))
  assert.equal(f.loader.resolve('mattpocock-native-subagent').fiber, undefined)
  assert.equal(observation.compatImports ?? 0, imports)
  assert.equal(observation.mounts.length, mounts)
})

test('import-conditioned wrapper export cannot substitute another module behind a matching default', options, async t => {
  const layout = await publicProfile(t, { exportPath: { import: './other-wrapper.js', default: './lib/compatibility/native-subagent.js' } })
  const f = await fixture(t, layout), mounts = observation.mounts.length
  await f.update(compose().rows)
  assertActive(f.loader.resolve('subagent'))
  assert.equal(f.loader.resolve('mattpocock-native-subagent').fiber === undefined, true)
  assert.equal(observation.mounts.length, mounts)
})

test('missing publicly resolvable wrapper keeps stock, not a fake capability or late wrapper failure', options, async t => {
  const f = await fixture(t, { profile: { dir: hostRoot, installAnchor: join(hostRoot, 'package.json') }, baseUrl: pathToFileURL(hostRoot + '/').href })
  await f.update(compose().rows)
  assertActive(f.loader.resolve('subagent'))
  assert.equal(f.loader.resolve('mattpocock-native-subagent').fiber === undefined, true)
})

for (const [label, changes] of [['wrong owner identity', { pluginName: 'unrelated-plugin' }], ['unknown wrapper target', { exportPath: './other-wrapper.js' }]]) test(label + ' keeps original stock', options, async t => {
  const layout = await publicProfile(t, changes)
  if (changes.exportPath) await writeFile(join(layout.pluginRoot, 'other-wrapper.js'), lifecycleStubSource)
  const f = await fixture(t, layout)
  await f.update(compose().rows)
  assertActive(f.loader.resolve('subagent'))
  assert.equal(f.loader.resolve('mattpocock-native-subagent').fiber === undefined, true)
})

test('a noncanonical native alias is not permission to insert another provider', options, async t => {
  const f = await fixture(t), mounts = observation.mounts.length
  const data = [...base(), { id: 'custom-subagent', name: '@deepseek-ai/dsh-subagent', disabled: true }]
  await f.update(compose(data).rows)
  assert.equal(f.loader.resolve('mattpocock-native-subagent').fiber, undefined)
  assertActive(f.loader.resolve('subagent'))
  assert.equal(observation.mounts.length, mounts)
})

for (const disabled of [false, true]) test('later stock boolean ' + disabled + ' override is authoritative at fresh composition', options, async t => {
  const f = await fixture(t), mounts = observation.mounts.length
  const { rows } = compose(base(), [{ id: 'subagent', name: '@deepseek-ai/dsh-subagent', disabled }])
  await f.update(rows)
  const stock = f.loader.resolve('subagent'), compat = f.loader.resolve('mattpocock-native-subagent')
  assert.equal(stock.disabled, disabled)
  assert.equal(compat.disabled, true)
  assert.equal(compat.fiber, undefined)
  assert.equal(observation.mounts.length, mounts)
  if (disabled) assert.equal(f.ctx.get('subagents'), undefined)
  else { assertActive(stock); assert(f.ctx.subagents instanceof sdk.SubagentRuntime) }
})

test('missing trusted installation metadata keeps native provider instead of disabling it', options, async t => {
  const f = await fixture(t, { profile: false })
  await f.update(compose().rows)
  assertActive(f.loader.resolve('subagent'))
  assert.equal(f.loader.resolve('mattpocock-native-subagent').fiber === undefined, true)
  assert(f.ctx.subagents instanceof sdk.SubagentRuntime)
})

async function sourceFixture(t, { version = '0.2.1-alpha.1', drift = false, appVersion = '0.2.1-alpha.1' } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-composition-source-'))
  assert(isAbsolute(root) && root.startsWith(join(tmpdir(), 'dsh-composition-source-')))
  t.after(() => rm(root, { recursive: true, force: true }))
  const peer = join(root, 'node_modules/@deepseek-ai/dsh-subagent')
  await mkdir(join(peer, 'lib'), { recursive: true })
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version: appVersion }))
  await writeFile(join(peer, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-subagent', version, type: 'module', exports: { '.': './lib/index.js', './package.json': './package.json' } }))
  const native = readFileSync(join(hostRoot, 'node_modules/@deepseek-ai/dsh-subagent/lib/index.js'), 'utf8')
  await writeFile(join(peer, 'lib/index.js'), native + (drift ? '\n// unknown drift' : ''))
  // Keep wrapper/public peers valid so unknown-byte tests reach the source digest
  // gate instead of accidentally passing merely because a wrapper is missing.
  for (const name of await readdir(join(hostRoot, 'node_modules/@deepseek-ai'))) {
    if (name !== 'dsh-subagent') await symlink(join(hostRoot, 'node_modules/@deepseek-ai', name), join(root, 'node_modules/@deepseek-ai', name))
  }
  for (const name of await readdir(join(hostRoot, 'node_modules'))) {
    if (name !== '@deepseek-ai' && name !== '@lmgatex') await symlink(join(hostRoot, 'node_modules', name), join(root, 'node_modules', name))
  }
  const pluginRoot = join(root, 'node_modules/@lmgatex/dsh-mattpocock-skills')
  await mkdir(join(pluginRoot, 'lib/compatibility'), { recursive: true })
  await mkdir(join(pluginRoot, 'compatibility'))
  await writeFile(join(pluginRoot, 'package.json'), JSON.stringify({ name: '@lmgatex/dsh-mattpocock-skills', type: 'module', exports: {
    './native-subagent': './lib/compatibility/native-subagent.js', './package.json': './package.json',
  } }))
  await writeFile(join(pluginRoot, 'lib/compatibility/native-subagent.js'), lifecycleStubSource)
  await writeFile(join(pluginRoot, 'compatibility/native-subagent-0.2.1-alpha.1.js'), '// fixture artifact resolver anchor')
  return root
}

for (const escape of ['ancestor', 'sibling']) test('serialized composition refuses native-owned peer manifest ' + escape + ' escape before compatibility import', options, async t => {
  const root = await sourceFixture(t), peer = join(root, 'node_modules/@deepseek-ai/dsh-subagent')
  const scope = join(peer, 'lib/node_modules/@deepseek-ai/dsh-scope')
  await mkdir(join(peer, 'lib/node_modules/@deepseek-ai'), { recursive: true })
  await cp(join(hostRoot, 'node_modules/@deepseek-ai/dsh-scope'), scope, { recursive: true, dereference: true })
  const pkg = JSON.parse(readFileSync(join(scope, 'package.json'), 'utf8'))
  const outside = escape === 'ancestor' ? join(root, 'escaped-scope-package.json') : join(root, 'sibling-manifest/package.json')
  if (escape === 'sibling') await mkdir(join(root, 'sibling-manifest'))
  await writeFile(outside, JSON.stringify(pkg))
  await symlink(outside, join(scope, 'escaped-package.json'))
  pkg.exports['./package.json'] = './escaped-package.json'
  await writeFile(join(scope, 'package.json'), JSON.stringify(pkg))
  const before = readFileSync(join(scope, 'package.json')), outsideBefore = readFileSync(outside)
  const f = await fixture(t, { profile: { dir: root, installAnchor: join(root, 'package.json') }, baseUrl: pathToFileURL(root + '/').href })
  const imports = observation.compatImports ?? 0, mounts = observation.mounts.length
  await f.update(compose().rows)
  assertActive(f.loader.resolve('subagent'))
  assert.equal(f.loader.resolve('mattpocock-native-subagent').fiber, undefined)
  assert.equal(observation.compatImports ?? 0, imports)
  assert.equal(observation.mounts.length, mounts)
  assert.deepEqual(readFileSync(join(scope, 'package.json')), before)
  assert.deepEqual(readFileSync(outside), outsideBefore)
})

test('source digest control has valid public wrapper and shared peer evidence before drift', options, async t => {
  const root = await sourceFixture(t)
  const f = await fixture(t, { profile: { dir: root, installAnchor: join(root, 'package.json') }, baseUrl: pathToFileURL(root + '/').href })
  await f.update(compose().rows)
  assert.equal(f.loader.resolve('subagent').fiber === undefined, true)
  assertActive(f.loader.resolve('mattpocock-native-subagent'))
  assert.equal(f.ctx.subagents.fixtureOnly, true)
})

for (const [label, change] of [['unknown SDK version', { appVersion: '99.0.0' }], ['unknown native version', { version: '99.0.0' }], ['unknown native bytes', { drift: true }]]) test(label + ' retains stock before compatibility import', options, async t => {
  const root = await sourceFixture(t, change), mounts = observation.mounts.length
  const f = await fixture(t, { profile: { dir: root, installAnchor: join(root, 'package.json') }, baseUrl: pathToFileURL(root + '/').href })
  await f.update(compose().rows)
  assertActive(f.loader.resolve('subagent'))
  assert.equal(f.loader.resolve('mattpocock-native-subagent').fiber === undefined, true)
  assert.equal(observation.mounts.length, mounts)
})

test('profile-local peer ambiguity is not ignored in favor of a trusted installation', options, async t => {
  const root = await sourceFixture(t), mounts = observation.mounts.length
  const f = await fixture(t, { profile: { dir: root, installAnchor: join(hostRoot, 'package.json') } })
  await f.update(compose().rows)
  assertActive(f.loader.resolve('subagent'))
  assert.equal(f.loader.resolve('mattpocock-native-subagent').fiber === undefined, true)
  assert.equal(observation.mounts.length, mounts)
})

test('first-install HMR preserves actual stock even without installation metadata', options, async t => {
  const f = await fixture(t, { profile: false })
  await f.update(base())
  const stock = f.loader.resolve('subagent'), fiber = stock.fiber
  const service = f.ctx.subagents[sdk.symbols.original]
  await f.update(compose().rows)
  assert.strictEqual(stock.fiber, fiber)
  assert.equal(f.ctx.subagents[sdk.symbols.original] === service, true)
  assertActive(stock)
})

test('a missing stock row leaves compat unmounted and reports public patch warning', options, async t => {
  const f = await fixture(t), { rows, warnings } = compose([])
  assert.equal(warnings.length, 1)
  await f.update(rows)
  assert.equal(f.loader.resolve('mattpocock-native-subagent').disabled, true)
  assert.equal(f.ctx.get('subagents'), undefined)
})

test('name is a public patch guard, not a module rename', options, async t => {
  const f = await fixture(t)
  f.loader.builtins.noop = { apply() {} }
  const { rows, warnings } = compose([{ id: 'subagent', name: 'cordis:noop' }])
  assert.equal(warnings.length, 1)
  await f.update(rows)
  assert.equal(f.loader.resolve('subagent').options.name, 'cordis:noop')
  assert.equal(f.loader.resolve('mattpocock-native-subagent').disabled, true)
  assert.equal(f.ctx.get('subagents'), undefined)
})

for (const target of ['subagent', 'mattpocock-native-subagent']) test('isolation on ' + target + ' never mounts compat competitor', options, async t => {
  const f = await fixture(t), mounts = observation.mounts.length
  await f.update(compose(base(), [{ id: target, isolate: { subagents: true } }]).rows)
  assert.equal(f.loader.resolve('mattpocock-native-subagent').disabled, true)
  assert.equal(f.loader.resolve('mattpocock-native-subagent').fiber, undefined)
  assert.equal(observation.mounts.length, mounts)
})

test('grouped native row does not authorize an unrelated root competitor', options, async t => {
  const f = await fixture(t), mounts = observation.mounts.length
  f.loader.builtins.noop = { apply() {} }
  const data = [{ id: 'custom-group', name: 'cordis:noop', group: true, config: base() }]
  await f.update(compose(data).rows)
  assert.equal(f.loader.resolve('mattpocock-native-subagent').fiber, undefined)
  assert.equal(observation.mounts.length, mounts)
})

test('only the exact stock expression is recognized, never a marker prefix', options, async t => {
  const f = await fixture(t)
  const expected = api.createCompatibilityCompositionPatches()[0].disabled.__jsExpr
  const custom = { __jsExpr: expected + ' || true' }
  await f.update(compose(base(), [{ id: 'subagent', disabled: custom }]).rows)
  assert.equal(f.loader.resolve('subagent').options.disabled.__jsExpr, custom.__jsExpr)
  assert.equal(f.loader.resolve('mattpocock-native-subagent').disabled, true)
  assert.equal(f.ctx.get('subagents'), undefined)
})

test('existing service not owned by these root rows blocks insertion instead of silently competing', options, async t => {
  const f = await fixture(t)
  const outside = f.ctx.plugin(sdk.SubagentRuntime, { maxDepth: 1, maxActiveSubagents: 1 })
  await outside.await()
  const service = f.ctx.subagents[sdk.symbols.original]
  await f.update(compose().rows)
  assert.equal(f.ctx.subagents[sdk.symbols.original] === service, true)
  assert.equal(f.loader.resolve('subagent').fiber, undefined)
  assert.equal(f.loader.resolve('mattpocock-native-subagent').fiber, undefined)
  await outside.dispose()
})

test('public EntryTree boolean overrides disable and re-enable stock without inserting a competitor', options, async t => {
  const f = await fixture(t)
  await f.update(base())
  await f.update(compose().rows)
  const fiber = f.loader.resolve('subagent').fiber
  await f.loader.update('subagent', { disabled: true })
  await f.loader.await()
  assert.equal(f.ctx.get('subagents'), undefined)
  assert.equal(fiber.uid, null)
  assert(f.disposals.includes(fiber))
  assert.equal(f.loader.resolve('mattpocock-native-subagent').disabled, true)
  await f.loader.update('subagent', { disabled: false })
  await f.loader.await()
  assertActive(f.loader.resolve('subagent'))
  assert(f.ctx.subagents instanceof sdk.SubagentRuntime)
  assert.equal(f.loader.resolve('mattpocock-native-subagent').fiber === undefined, true)
})

test('public EntryTree config update retains stock service and updates native volatile config', options, async t => {
  const f = await fixture(t)
  await f.update(base())
  await f.update(compose().rows)
  const stock = f.loader.resolve('subagent'), fiber = stock.fiber
  const service = f.ctx.subagents[sdk.symbols.original]
  await f.loader.update('subagent', { config: { maxDepth: 7, maxActiveSubagents: 4 } })
  await f.loader.await()
  assert.strictEqual(stock.fiber, fiber)
  assert.equal(f.ctx.subagents[sdk.symbols.original] === service, true)
  assert.equal(service.resolveMaxDepth(), 7)
  assert.deepEqual(stock.options.config, { maxDepth: 7, maxActiveSubagents: 4 })
  assertActive(stock)
})

for (const reversed of [false, true]) test('public reload honors stock disable and re-enable without mounting competitor: ' + reversed, options, async t => {
  const f = await fixture(t)
  await f.update(base())
  await f.update(compose().rows)
  const native = f.ctx.subagents[sdk.symbols.original]
  const order = rows => reversed ? rows.reverse() : rows
  await f.update(order(compose(base(), [{ id: 'subagent', disabled: true }]).rows))
  assert.equal(f.ctx.get('subagents'), undefined)
  assert.equal(f.loader.resolve('mattpocock-native-subagent').fiber, undefined)
  await f.update(order(compose(base(), [{ id: 'subagent', disabled: false }]).rows))
  assertActive(f.loader.resolve('subagent'))
  assert(f.ctx.subagents instanceof sdk.SubagentRuntime)
  assert.equal(f.loader.resolve('mattpocock-native-subagent').fiber, undefined)
  assert.notEqual(f.ctx.subagents[sdk.symbols.original], native)
})
