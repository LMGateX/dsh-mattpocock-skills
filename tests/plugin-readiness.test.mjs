import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire, registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

// Public Loader.entries/Entry.parent.tree.root.data and real StartupSupport only.
// Fixture writes and symlink targets belong to scratch; SDK remains read-only.
const hostRoot = process.env.DSH_CONTROLS_HOST_ROOT
const options = { skip: !hostRoot && 'set DSH_CONTROLS_HOST_ROOT for readonly plugin readiness probes' }
let sdk, api, composition, HostStartupNode, StartupSupport
if (hostRoot) {
  assert(isAbsolute(hostRoot))
  const require = createRequire(pathToFileURL(join(hostRoot, 'package.json')))
  const load = name => import(pathToFileURL(require.resolve(name)).href)
  sdk = { ...await load('@deepseek-ai/cordis'), ...await load('@deepseek-ai/cordis-plugin-loader'),
    ...await load('@deepseek-ai/cordis-plugin-include'), ...await load('@deepseek-ai/dsh-typert-registry'), ...await load('@deepseek-ai/dsh-subagent') }
  registerHooks({
    resolve(specifier, context, next) {
      if (context.parentURL?.includes('/dsh-mattpocock-skills/src/') && specifier.startsWith('.') && specifier.endsWith('.js')) specifier = specifier.slice(0, -3) + '.ts'
      if (context.conditions.includes('import') && (specifier === '@deepseek-ai/dsh-subagent' || specifier.includes('/dsh-plugin-readiness-') && specifier.endsWith('/node_modules/@deepseek-ai/dsh-subagent/lib/index.js'))) return { url: pathToFileURL(require.resolve('@deepseek-ai/dsh-subagent')).href, shortCircuit: true }
      return next(specifier, context)
    },
    load(url, context, next) {
      if (url.includes('/dsh-mattpocock-skills/src/') && new URL(url).pathname.endsWith('.ts')) return { format: 'module', shortCircuit: true,
        source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText }
      return next(url, context)
    },
  })
  api = await import('../src/compatibility/readiness.ts')
  composition = await import('../src/compatibility/composition.ts')
  ;({ HostStartupNode } = await import('../src/compatibility/host-startup.ts'))
  ;({ StartupSupport } = await import('../src/controls/startup-support.ts'))
}
const base = () => [{ id: 'subagent', name: '@deepseek-ai/dsh-subagent', config: { maxDepth: 3, maxActiveSubagents: 2 } }]
async function image(root) {
  const rows = []
  const visit = async dir => {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (!entry.isSymbolicLink()) rows.push([path, (await readFile(path)).toString('hex')])
    }
  }
  await visit(root); return rows
}
async function fixture(t, { metadata = true, appVersion = '0.2.1-alpha.1', nativeVersion = '0.2.1-alpha.1', appName = '@deepseek-ai/dsh', overlay = [], scopeContext = context => context } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-plugin-readiness-'))
  assert(isAbsolute(root) && root.startsWith(join(tmpdir(), 'dsh-plugin-readiness-')))
  const peer = join(root, 'node_modules/@deepseek-ai/dsh-subagent'), pluginRoot = join(root, 'plugin')
  await mkdir(join(peer, 'lib'), { recursive: true })
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: appName, version: appVersion, type: 'module' }))
  await writeFile(join(peer, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-subagent', version: nativeVersion, type: 'module', exports: { '.': './lib/index.js', './package.json': './package.json' } }))
  await cp(join(hostRoot, 'node_modules/@deepseek-ai/dsh-subagent/lib/index.js'), join(peer, 'lib/index.js'))
  // Resolve-only realm fixtures: every package and file copied below belongs to
  // this scratch tree. No symlink targets point back into the readonly SDK.
  const nativeResolver = createRequire(join(hostRoot, 'node_modules/@deepseek-ai/dsh-subagent/lib/index.js'))
  const provenance = JSON.parse(await readFile(new URL('../compatibility/native-subagent.provenance.json', import.meta.url), 'utf8'))
  for (const name of [...provenance.externalImports.filter(name => !name.startsWith('node:') && name !== '@deepseek-ai/dsh-subagent'), '@deepseek-ai/cordis', '@deepseek-ai/cordis-plugin-loader']) {
    const manifestPath = nativeResolver.resolve(name + '/package.json'), entry = nativeResolver.resolve(name)
    const destination = join(root, 'node_modules', name)
    await mkdir(dirname(join(destination, 'package.json')), { recursive: true })
    await cp(manifestPath, join(destination, 'package.json'))
    const entryPath = entry.slice(dirname(manifestPath).length + 1)
    await mkdir(dirname(join(destination, entryPath)), { recursive: true })
    await cp(entry, join(destination, entryPath))
  }
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  pkg.exports['./native-subagent'] = { default: './lib/compatibility/native-subagent.js' }
  await mkdir(join(pluginRoot, 'lib/compatibility'), { recursive: true })
  await writeFile(join(pluginRoot, 'package.json'), JSON.stringify(pkg))
  const wrapper = ts.transpileModule(await readFile(new URL('../src/compatibility/native-subagent.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
  await writeFile(join(pluginRoot, 'lib/compatibility/native-subagent.js'), wrapper)
  for (const file of [api.COMPATIBLE_SUBAGENT_METADATA.artifactPath, api.COMPATIBLE_SUBAGENT_METADATA.provenancePath]) {
    await mkdir(dirname(join(pluginRoot, file)), { recursive: true })
    await cp(new URL('../' + file, import.meta.url), join(pluginRoot, file))
  }
  await mkdir(join(root, 'node_modules/@lmgatex'), { recursive: true })
  await symlink(pluginRoot, join(root, 'node_modules/@lmgatex/dsh-mattpocock-skills'))
  const ctx = new sdk.Context(), logs = []
  ctx.logger.exporter({ export(message) { logs.push(message) } })
  new sdk.TypertRegistry(ctx)
  if (metadata) ctx.provide('profileContext', { installAnchor: join(root, 'package.json'), dir: root })
  ctx.provide('llm', { prepareCall() { throw new Error('model forbidden') }, stream() { throw new Error('model forbidden') } })
  const loader = new sdk.Loader(scopeContext(ctx), { baseUrl: pathToFileURL(root + '/').href })
  loader.builtins.noop = { apply() {} }
  await ctx.fiber.await()
  await loader.root.update(base()); await loader.await()
  const stock = loader.resolve('subagent'), originalFiber = stock.fiber, service = ctx.get('subagents')?.[sdk.symbols.original]
  assert(originalFiber, logs.flatMap(log => log.args ?? []).map(value => value?.stack ?? String(value)).join('\n'))
  const rows = sdk.applyEntryPatches(base(), [...composition.createCompatibilityCompositionPatches(), ...overlay], () => {})
  await loader.root.update(rows); await loader.await()
  t.after(async () => { await loader.root.update([]); await loader.await(); await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }) })
  return { root, pluginRoot, peer, ctx, loader, stock, originalFiber, service,
    inspect: signal => api.inspectCompatibilityPreparation(ctx, signal, { pluginRoot }) }
}
function store() {
  let value = { schemaVersion: 1, revision: 0, desired: { startupCwdEnabled: true }, bootReceipts: [] }
  return { async read() { return structuredClone(value) }, async compareAndSwap(expected, next) {
    if (value.revision !== expected) return false
    value = structuredClone(next); return true
  } }
}

test('first-install public Loader inspection reports next-boot ready without evaluating guards or changing native ACTIVE fiber', options, async t => {
  const f = await fixture(t), before = await image(f.root)
  const expected = composition.createCompatibilityCompositionExpressions()
  assert.equal(f.stock.options.disabled.__jsExpr, expected.stock.__jsExpr)
  assert.strictEqual(f.stock.fiber, f.originalFiber)
  assert.equal(f.stock.fiber.state, 2)
  const compat = f.loader.resolve('mattpocock-native-subagent')
  Object.defineProperty(f.stock, 'disabled', { configurable: true, get() { assert.fail('readonly inspector executed stock guard') } })
  Object.defineProperty(compat, 'disabled', { configurable: true, get() { assert.fail('readonly inspector executed compat guard') } })
  try {
    const control = new AbortController().signal
    const prepared = await f.inspect(control)
    assert.equal(prepared.status, 'ready')
    assert.match(prepared.diagnostic, /next genuine.*boot/)
    let seen
    const node = new HostStartupNode({ bootEpoch: 'same-readiness-process', observeCompatibilityPreparation: async signal => { seen = signal; return f.inspect(signal) } }, () => false)
    const storage = store(), support = new StartupSupport(storage, { epoch: node.epoch }, signal => node.observe(signal))
    const first = await support.readStatus(control)
    assert.strictEqual(seen, control)
    assert.equal(first.state, 'pending-restart')
    assert.equal(first.enabledNow, false)
    assert.equal(first.restartNeeded, true)
    const reconstructed = new StartupSupport(storage, { epoch: node.epoch }, signal => node.observe(signal))
    assert.deepEqual((await reconstructed.readStatus(control)).boot, first.boot)
    assert.strictEqual(f.stock.fiber, f.originalFiber)
    assert.strictEqual(f.ctx.get('subagents')[sdk.symbols.original], f.service)
    assert.equal(compat.fiber, undefined)
    assert.deepEqual(await image(f.root), before)
  } finally { delete f.stock.disabled; delete compat.disabled }
})

for (const [label, path, drift] of [
  ['owned asset hash drift', 'compatibility/native-subagent-0.2.1-alpha.1.js', true],
  ['owned provenance hash drift', 'compatibility/native-subagent.provenance.json', true],
  ['missing owned asset', 'compatibility/native-subagent-0.2.1-alpha.1.js', false],
  ['missing packaged wrapper', 'lib/compatibility/native-subagent.js', false],
]) test(label + ' never becomes prepared or enabled', options, async t => {
  const f = await fixture(t), target = join(f.pluginRoot, path)
  if (drift) await writeFile(target, (await readFile(target)).toString('utf8') + '\n// drift')
  else await rm(target)
  const prepared = await f.inspect()
  assert.notEqual(prepared.status, 'ready')
  assert.match(prepared.diagnostic, /hash|ENOENT/)
  assert.strictEqual(f.stock.fiber, f.originalFiber)
})

test('missing package export is not same-plugin preparation', options, async t => {
  const f = await fixture(t)
  const pkgPath = join(f.pluginRoot, 'package.json'), pkg = JSON.parse(await readFile(pkgPath, 'utf8'))
  delete pkg.exports['./native-subagent']; await writeFile(pkgPath, JSON.stringify(pkg))
  assert.equal((await f.inspect()).status, 'incompatible')
  assert.match((await f.inspect()).diagnostic, /wrapper export/)
})

test('clearing only the carrier disable overlay restores the exact automatic guards without forcing current capability', options, async t => {
  const f = await fixture(t, { overlay: [{ id: 'mattpocock-native-subagent', disabled: true }] }), before = await image(f.root)
  assert.equal((await f.inspect()).reason, 'compatibility-component-disabled')
  const restored = sdk.applyEntryPatches(base(), composition.createCompatibilityCompositionPatches(), () => {})
  await f.loader.root.update(restored); await f.loader.await()
  const expressions = composition.createCompatibilityCompositionExpressions()
  assert.deepEqual(f.stock.options.disabled, expressions.stock)
  assert.deepEqual(f.loader.resolve('mattpocock-native-subagent').options.disabled, expressions.compat)
  const prepared = await f.inspect()
  assert.equal(prepared.status, 'ready'); assert.equal(prepared.reason, undefined)
  assert.strictEqual(f.stock.fiber, f.originalFiber)
  assert.strictEqual(f.ctx.get('subagents')[sdk.symbols.original], f.service)
  assert.deepEqual(await image(f.root), before)
})

test('explicit compatibility component disabled overlay explains how to restore automatic provider selection', options, async t => {
  const f = await fixture(t, { overlay: [{ id: 'mattpocock-native-subagent', disabled: true }] })
  const compat = f.loader.resolve('mattpocock-native-subagent'), before = await image(f.root)
  assert.equal(compat.options.disabled, true)
  const prepared = await f.inspect()
  assert.equal(prepared.status, 'incompatible')
  assert.equal(prepared.reason, 'compatibility-component-disabled')
  assert.match(prepared.diagnostic, /mattpocock-native-subagent/)
  assert.match(prepared.diagnostic, /(?:remove|clear|撤销|移除)[\s\S]*disabled/i)
  assert.match(prepared.diagnostic, /(?:automatic[\s\S]*selection|自动选择)/i)
  assert.doesNotMatch(prepared.diagnostic, /(?:updat\w*|upgrad\w*|更新|升级)[\s\S]*(?:SDK|plugin|插件)|disabled\s*:\s*false/i)
  assert.equal(compat.options.disabled, true, 'inspection must not force-enable the component')
  assert.strictEqual(f.stock.fiber, f.originalFiber)
  assert.strictEqual(f.ctx.get('subagents')[sdk.symbols.original], f.service)
  assert.deepEqual(await image(f.root), before)
})

for (const [label, overlay] of [
  ['stock boolean false', [{ id: 'subagent', disabled: false }]],
  ['stock boolean true', [{ id: 'subagent', disabled: true }]],
  ['compat boolean true', [{ id: 'mattpocock-native-subagent', disabled: true }]],
  ['isolated stock', [{ id: 'subagent', isolate: { subagents: true } }]],
  ['isolated compat', [{ id: 'mattpocock-native-subagent', isolate: { subagents: true } }]],
  ['custom stock guard', [{ id: 'subagent', disabled: { __jsExpr: 'false' } }]],
  ['custom compat guard', [{ id: 'mattpocock-native-subagent', disabled: { __jsExpr: 'true' } }]],
  ['native alias', [{ insert: [{ id: 'native-alias', name: '@deepseek-ai/dsh-subagent', disabled: true }] }]],
  ['compat alias', [{ insert: [{ id: 'compat-alias', name: '@lmgatex/dsh-mattpocock-skills/native-subagent', disabled: true }] }]],
  ['grouped native alias', [{ insert: [{ id: 'custom-group', name: 'cordis:noop', group: true, config: [{ id: 'grouped-native', name: '@deepseek-ai/dsh-subagent', disabled: true }] }] }]],
]) test(label + ' cannot advertise next-boot pending-restart guarantee', options, async t => {
  const f = await fixture(t, { overlay })
  assert.equal((await f.inspect()).status, 'incompatible')
})

for (const [label, changes, status] of [
  ['missing launch metadata', { metadata: false }, 'uncertain'],
  ['non-DSH launch anchor', { appName: 'not-dsh' }, 'uncertain'],
  ['unsupported SDK version', { appVersion: '99.0.0' }, 'incompatible'],
  ['unsupported native version', { nativeVersion: '99.0.0' }, 'incompatible'],
]) test(label + ' remains honest unknown/incompatible evidence', options, async t => {
  const f = await fixture(t, changes), prepared = await f.inspect()
  assert.equal(prepared.status, status)
  assert.strictEqual(f.stock.fiber, f.originalFiber)
})

test('native source drift and ambiguous local resolution are unknown, never false preparation', options, async t => {
  const f = await fixture(t)
  await writeFile(join(f.peer, 'lib/index.js'), (await readFile(join(f.peer, 'lib/index.js'), 'utf8')) + '\n// unknown native bytes')
  assert.equal((await f.inspect()).status, 'uncertain')
  const local = join(f.root, 'other-profile')
  await mkdir(join(local, 'node_modules/@deepseek-ai'), { recursive: true })
  const other = join(f.root, 'other-native')
  await cp(f.peer, other, { recursive: true })
  await symlink(other, join(local, 'node_modules/@deepseek-ai/dsh-subagent'))
  f.ctx.get('profileContext').dir = local
  const result = await f.inspect()
  assert.equal(result.status, 'uncertain')
  assert.match(result.diagnostic, /Ambiguous/)
})

test('a different resolved plugin package is unknown rather than this package prepared', options, async t => {
  const f = await fixture(t), alternate = join(f.root, 'alternate'), otherPlugin = join(f.root, 'other-plugin')
  await cp(f.pluginRoot, otherPlugin, { recursive: true })
  await mkdir(join(alternate, 'node_modules/@lmgatex'), { recursive: true })
  await mkdir(join(alternate, 'node_modules/@deepseek-ai'), { recursive: true })
  await symlink(otherPlugin, join(alternate, 'node_modules/@lmgatex/dsh-mattpocock-skills'))
  await symlink(f.peer, join(alternate, 'node_modules/@deepseek-ai/dsh-subagent'))
  f.loader.ctx.baseUrl = pathToFileURL(alternate + '/').href
  const result = await f.inspect()
  assert.equal(result.status, 'uncertain')
  assert.match(result.diagnostic, /different plugin wrapper/)
})

test('plugin-own native peer ambiguity is unknown even when both copies have pristine bytes', options, async t => {
  const f = await fixture(t), otherPeer = join(f.root, 'plugin-native-peer')
  await cp(f.peer, otherPeer, { recursive: true })
  await mkdir(join(f.pluginRoot, 'node_modules/@deepseek-ai'), { recursive: true })
  await symlink(otherPeer, join(f.pluginRoot, 'node_modules/@deepseek-ai/dsh-subagent'))
  const result = await f.inspect()
  assert.equal(result.status, 'uncertain')
  assert.match(result.diagnostic, /different native peers/)
})

test('a pristine wrapper-lib scope copy cannot advertise ready for the next true boot', options, async t => {
  const f = await fixture(t)
  assert.equal((await f.inspect()).status, 'ready')
  const target = join(f.pluginRoot, 'lib/node_modules/@deepseek-ai/dsh-scope')
  await mkdir(dirname(target), { recursive: true })
  await cp(join(f.root, 'node_modules/@deepseek-ai/dsh-scope'), target, { recursive: true })
  const before = await image(f.root), result = await f.inspect()
  assert.equal(result.status, 'uncertain')
  assert.match(result.diagnostic, /dsh-scope|shared native peer/)
  assert.strictEqual(f.stock.fiber, f.originalFiber)
  assert.deepEqual(await image(f.root), before)
})

test('a pristine artifact-local scope copy cannot advertise ready for next true boot', options, async t => {
  const f = await fixture(t)
  assert.equal((await f.inspect()).status, 'ready')
  const target = join(f.pluginRoot, 'compatibility/node_modules/@deepseek-ai/dsh-scope')
  await mkdir(dirname(target), { recursive: true })
  await cp(join(f.root, 'node_modules/@deepseek-ai/dsh-scope'), target, { recursive: true })
  const result = await f.inspect()
  assert.equal(result.status, 'uncertain')
  assert.match(result.diagnostic, /dsh-scope|shared native peer/)
  assert.strictEqual(f.stock.fiber, f.originalFiber)
})

test('native index local peer realm is the proof anchor, not the parent Loader resolver', options, async t => {
  const f = await fixture(t)
  assert.equal((await f.inspect()).status, 'ready')
  const target = join(f.peer, 'lib/node_modules/@deepseek-ai/dsh-scope')
  await mkdir(dirname(target), { recursive: true })
  await cp(join(f.root, 'node_modules/@deepseek-ai/dsh-scope'), target, { recursive: true })
  const result = await f.inspect()
  assert.equal(result.status, 'uncertain')
  assert.match(result.diagnostic, /dsh-scope|shared native peer/)
  assert.strictEqual(f.stock.fiber, f.originalFiber)
})

for (const name of ['@deepseek-ai/cordis', '@deepseek-ai/cordis-plugin-loader']) test('wrapper-local ' + name + ' copy cannot claim public runtime identity', options, async t => {
  const f = await fixture(t)
  assert.equal((await f.inspect()).status, 'ready')
  const target = join(f.pluginRoot, 'lib/node_modules', name)
  await mkdir(dirname(target), { recursive: true })
  await cp(join(f.root, 'node_modules', name), target, { recursive: true })
  const result = await f.inspect()
  assert.equal(result.status, 'uncertain')
  assert.match(result.diagnostic, /cordis|loader/)
  assert.strictEqual(f.stock.fiber, f.originalFiber)
})

test('profile-local wrapper ambiguity remains unknown even when the native peer agrees', options, async t => {
  const f = await fixture(t), profile = join(f.root, 'local-profile'), otherPlugin = join(f.root, 'profile-plugin')
  await cp(f.pluginRoot, otherPlugin, { recursive: true })
  await mkdir(join(profile, 'node_modules/@lmgatex'), { recursive: true })
  await mkdir(join(profile, 'node_modules/@deepseek-ai'), { recursive: true })
  await symlink(otherPlugin, join(profile, 'node_modules/@lmgatex/dsh-mattpocock-skills'))
  await symlink(f.peer, join(profile, 'node_modules/@deepseek-ai/dsh-subagent'))
  f.ctx.get('profileContext').dir = profile
  const result = await f.inspect()
  assert.equal(result.status, 'uncertain')
  assert.match(result.diagnostic, /profile.*wrapper|wrapper.*profile/i)
})

test('wrapper import-only export override cannot use require/default evidence to advertise ready', options, async t => {
  const f = await fixture(t)
  assert.equal((await f.inspect()).status, 'ready')
  const manifestPath = join(f.pluginRoot, 'package.json'), pkg = JSON.parse(await readFile(manifestPath, 'utf8'))
  pkg.exports['./native-subagent'] = { import: './lib/compatibility/different.js', require: './lib/compatibility/native-subagent.js', default: './lib/compatibility/native-subagent.js' }
  await cp(join(f.pluginRoot, 'lib/compatibility/native-subagent.js'), join(f.pluginRoot, 'lib/compatibility/different.js'))
  await writeFile(manifestPath, JSON.stringify(pkg))
  const result = await f.inspect()
  assert.equal(result.status, 'uncertain')
  assert.match(result.diagnostic, /export conditions|ESM/)
  assert.strictEqual(f.stock.fiber, f.originalFiber)
})

test('native import-only export override cannot use pristine require image to advertise ready', options, async t => {
  const f = await fixture(t)
  assert.equal((await f.inspect()).status, 'ready')
  const manifestPath = join(f.peer, 'package.json'), pkg = JSON.parse(await readFile(manifestPath, 'utf8'))
  pkg.exports['.'] = { import: './lib/different.js', require: './lib/index.js', default: './lib/index.js' }
  await cp(join(f.peer, 'lib/index.js'), join(f.peer, 'lib/different.js'))
  await writeFile(manifestPath, JSON.stringify(pkg))
  const result = await f.inspect()
  assert.equal(result.status, 'uncertain')
  assert.match(result.diagnostic, /export conditions|ESM/)
  assert.strictEqual(f.stock.fiber, f.originalFiber)
})

for (const location of ['lib', 'compatibility']) test(location + '-local peer manifest is unknown even if its require entry realpath is canonical', options, async t => {
  const f = await fixture(t), canonicalPeer = join(f.root, 'node_modules/@deepseek-ai/dsh-scope')
  const target = join(f.pluginRoot, location, 'node_modules/@deepseek-ai/dsh-scope')
  const pkg = JSON.parse(await readFile(join(canonicalPeer, 'package.json'), 'utf8'))
  pkg.exports['.'] = { import: './lib/different.js', default: './lib/index.js' }
  await mkdir(join(target, 'lib'), { recursive: true })
  await writeFile(join(target, 'package.json'), JSON.stringify(pkg))
  await symlink(join(canonicalPeer, 'lib/index.js'), join(target, 'lib/index.js'))
  await cp(join(canonicalPeer, 'lib/index.js'), join(target, 'lib/different.js'))
  const anchor = location === 'lib' ? join(f.pluginRoot, 'lib/compatibility/native-subagent.js') : join(f.pluginRoot, 'compatibility/native-subagent-0.2.1-alpha.1.js')
  const importer = createRequire(anchor), canonical = createRequire(join(f.peer, 'lib/index.js'))
  assert.equal(importer.resolve('@deepseek-ai/dsh-scope'), canonical.resolve('@deepseek-ai/dsh-scope'), 'canonical CJS entry alone is insufficient ESM identity evidence')
  assert.notEqual(importer.resolve('@deepseek-ai/dsh-scope/package.json'), canonical.resolve('@deepseek-ai/dsh-scope/package.json'))
  const result = await f.inspect()
  assert.equal(result.status, 'uncertain')
  assert.match(result.diagnostic, /dsh-scope|shared native peer/)
})

for (const target of ['native', 'wrapper']) for (const condition of ['require', 'module', 'browser', 'node', 'custom']) test(target + ' unknown ' + condition + ' export condition does not prove next-boot readiness', options, async t => {
  const f = await fixture(t), root = target === 'native' ? f.peer : f.pluginRoot
  const manifestPath = join(root, 'package.json'), pkg = JSON.parse(await readFile(manifestPath, 'utf8'))
  const entry = target === 'native' ? './lib/index.js' : './lib/compatibility/native-subagent.js'
  // Default comes first so CJS still resolves the known image, independently of
  // whether this custom condition is active. Unproven ESM condition maps reject.
  pkg.exports[target === 'native' ? '.' : './native-subagent'] = { default: entry, [condition]: entry }
  await writeFile(manifestPath, JSON.stringify(pkg))
  const result = await f.inspect()
  assert.equal(result.status, 'uncertain')
  assert.match(result.diagnostic, /export conditions|ESM/)
})

test('pinned string or types/default public exports support ordinary ESM readiness', options, async t => {
  const f = await fixture(t)
  for (const [root, subpath, entry] of [[f.peer, '.', './lib/index.js'], [f.pluginRoot, './native-subagent', './lib/compatibility/native-subagent.js']]) {
    const path = join(root, 'package.json'), pkg = JSON.parse(await readFile(path, 'utf8'))
    pkg.exports[subpath] = { types: './lib/types/index.d.ts', default: entry }
    await writeFile(path, JSON.stringify(pkg))
  }
  assert.equal((await f.inspect()).status, 'ready')
})

const directPeers = hostRoot ? JSON.parse(readFileSync(new URL('../compatibility/native-subagent.provenance.json', import.meta.url), 'utf8')).externalImports.filter(name => !name.startsWith('node:') && name !== '@deepseek-ai/dsh-scope') : []
for (const location of ['lib', 'compatibility']) for (const name of directPeers) test(location + '-local pristine ' + name + ' copy cannot share canonical native identity', options, async t => {
  const f = await fixture(t), target = join(f.pluginRoot, location, 'node_modules', name)
  await mkdir(dirname(target), { recursive: true })
  await cp(join(f.root, 'node_modules', name), target, { recursive: true })
  const result = await f.inspect()
  assert.equal(result.status, 'uncertain')
  assert(result.diagnostic.includes(name))
  assert.strictEqual(f.stock.fiber, f.originalFiber)
})

test('shared wrapper and artifact native-index realm remains eligible when module and manifest identities agree', options, async t => {
  const f = await fixture(t), nativeScope = join(f.peer, 'lib/node_modules/@deepseek-ai/dsh-scope')
  await mkdir(dirname(nativeScope), { recursive: true })
  await cp(join(f.root, 'node_modules/@deepseek-ai/dsh-scope'), nativeScope, { recursive: true })
  for (const location of ['lib', 'compatibility']) {
    const target = join(f.pluginRoot, location, 'node_modules/@deepseek-ai/dsh-scope')
    await mkdir(dirname(target), { recursive: true })
    await symlink(nativeScope, target)
  }
  assert.equal((await f.inspect()).status, 'ready')
  assert.strictEqual(f.stock.fiber, f.originalFiber)
})

test('inherited Loader filesystem isolation cannot advertise application-root preparation', options, async t => {
  const f = await fixture(t, { scopeContext: context => context.isolate('fs').extend() })
  const compat = f.loader.resolve('mattpocock-native-subagent'), before = await image(f.root)
  const isolate = sdk.Context.isolate
  assert.equal(Object.keys(compat.ctx[isolate]).length, 0, 'the differing service label is inherited, not an own key')
  assert.notEqual(compat.ctx[isolate].fs, f.ctx.root[isolate].fs)
  Object.defineProperty(compat, 'disabled', { configurable: true, get() { assert.fail('readonly scope inspection evaluated carrier guard') } })
  try {
    const result = await f.inspect()
    assert.equal(result.status, 'uncertain')
    assert.match(result.diagnostic, /root.*scope|scope.*root|isolation/i)
    assert.strictEqual(f.stock.fiber, f.originalFiber)
    assert.strictEqual(f.ctx.get('subagents')[sdk.symbols.original], f.service)
    assert.deepEqual(await image(f.root), before)
  } finally { delete compat.disabled }
})

test('inherited Loader intercept difference cannot advertise root-owned provider readiness', options, async t => {
  const f = await fixture(t, { scopeContext: context => context.intercept('observer-only-peer', { maxDepth: 2 }).extend() })
  const compat = f.loader.resolve('mattpocock-native-subagent'), symbol = sdk.Context.intercept
  assert.equal(Object.keys(compat.ctx[symbol]).length, 0)
  assert.notEqual(compat.ctx[symbol]['observer-only-peer'], f.ctx.root[symbol]['observer-only-peer'])
  const result = await f.inspect()
  assert.equal(result.status, 'uncertain')
  assert.match(result.diagnostic, /root.*scope|scope.*root|intercept/i)
  assert.strictEqual(f.stock.fiber, f.originalFiber)
  assert.equal(f.ctx.root[symbol]['observer-only-peer'], undefined)
})

for (const role of ['carrier', 'tree']) test(role + '-only public scope divergence refuses readiness without root promotion', options, async t => {
  const f = await fixture(t), carrier = f.loader.resolve('mattpocock-native-subagent')
  const original = role === 'carrier' ? carrier.ctx : f.loader.ctx
  if (role === 'carrier') carrier.ctx = original.isolate('sandboxPolicy').extend()
  else f.loader.ctx = original.isolate('sandboxPolicy').extend()
  try {
    const result = await f.inspect()
    assert.equal(result.status, 'uncertain')
    assert.match(result.diagnostic, /root.*scope|scope.*root|isolation/i)
    assert.strictEqual(f.stock.fiber, f.originalFiber)
    assert.equal(f.ctx.root[sdk.Context.isolate].sandboxPolicy, undefined)
  } finally { if (role === 'carrier') carrier.ctx = original; else f.loader.ctx = original }
})

test('matching empty maps from a different application root are not trusted shared scope', options, async t => {
  const f = await fixture(t), carrier = f.loader.resolve('mattpocock-native-subagent'), original = carrier.ctx
  const unrelated = new sdk.Context()
  carrier.ctx = original.extend({ root: unrelated })
  try {
    const result = await f.inspect()
    assert.equal(result.status, 'uncertain')
    assert.match(result.diagnostic, /matching.*root.*scope/)
  } finally { carrier.ctx = original; await unrelated.fiber.dispose() }
})

test('missing public carrier scope map is unknown, not permission for root promotion', options, async t => {
  const f = await fixture(t), carrier = f.loader.resolve('mattpocock-native-subagent'), original = carrier.ctx
  carrier.ctx = original.extend({ [sdk.Context.isolate]: undefined })
  try {
    const result = await f.inspect()
    assert.equal(result.status, 'uncertain')
    assert.match(result.diagnostic, /scope metadata is unavailable/)
  } finally { carrier.ctx = original }
})

test('inherited application-root map identity remains eligible without changing context scopes', options, async t => {
  const f = await fixture(t), root = f.ctx.root
  const sharedIntercept = { readonlyFixture: true }, sharedLabel = Symbol('same application scope')
  root[sdk.Context.intercept]['observer-only-peer'] = sharedIntercept
  root[sdk.Context.isolate]['observer-only-peer'] = sharedLabel
  const carrier = f.loader.resolve('mattpocock-native-subagent')
  assert.strictEqual(carrier.ctx[sdk.Context.intercept]['observer-only-peer'], sharedIntercept)
  assert.strictEqual(carrier.ctx[sdk.Context.isolate]['observer-only-peer'], sharedLabel)
  const result = await f.inspect()
  assert.equal(result.status, 'ready')
  assert.strictEqual(root[sdk.Context.intercept]['observer-only-peer'], sharedIntercept)
  assert.strictEqual(root[sdk.Context.isolate]['observer-only-peer'], sharedLabel)
  assert.strictEqual(f.stock.fiber, f.originalFiber)
})

test('Node without public getBuiltinModule cannot promise the serialized boot gate', options, async t => {
  const f = await fixture(t), builtin = process.getBuiltinModule
  try { process.getBuiltinModule = undefined; assert.equal((await f.inspect()).status, 'uncertain') }
  finally { process.getBuiltinModule = builtin }
})

test('aborted inspection propagates cancellation rather than invented preparation', options, async t => {
  const f = await fixture(t), before = await image(f.root), control = new AbortController()
  control.abort(new Error('cancel readiness'))
  await assert.rejects(f.inspect(control.signal), /cancel readiness/)
  const ongoing = new AbortController(), pending = f.inspect(ongoing.signal)
  ongoing.abort(new Error('cancel in flight'))
  await assert.rejects(pending, /cancel in flight/)
  assert.deepEqual(await image(f.root), before)
})

test('no public Loader returns no optional evidence and does not infer user authority', options, async () => {
  assert.equal(await api.inspectCompatibilityPreparation({ get() { return undefined } }), null)
  const { parseStartupDesired } = await import('../src/controls/startup-state.ts')
  assert.throws(() => parseStartupDesired({ startupCwdEnabled: true, observeCompatibilityPreparation: 'ready' }), /unknown|unexpected/i)
})
