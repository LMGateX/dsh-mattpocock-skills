import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, writeFile, readFile, cp, realpath, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, isAbsolute, relative, sep } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { inspectCanonicalPeerBindings, bindCompatibleSubagentSource } from '../lib/compatibility/peer-bindings.js'
import { openCompatHostView } from './fixtures/compat-host.mjs'

// Accepted Loader/CWD seam: actual public Loader + PluginPackages resolution and
// the shipped source binder. No ModuleLoader mocks, global hooks, or native
// child/model launches. All fixture writes are owned scratch; SDK is read-only.
// The shipped artifact is the released 0.2.1-alpha.1 bridge.
const compatRoot = process.env.DSH_CONTROLS_COMPAT_HOST_ROOT
const options = { skip: !compatRoot && 'set DSH_CONTROLS_COMPAT_HOST_ROOT for real 0.2.1-alpha.1 public SDK peer binding probes', timeout: 15000 }
const hostRoot = compatRoot ? await openCompatHostView(compatRoot) : undefined
const pluginName = '@lmgatex/dsh-mattpocock-skills'
const peerName = '@deepseek-ai/dsh-typert-protocol'
const artifactUrl = new URL('../compatibility/native-subagent-0.2.1-alpha.1.js', import.meta.url)
const provenanceUrl = new URL('../compatibility/native-subagent.provenance.json', import.meta.url)
const sha = bytes => createHash('sha256').update(bytes).digest('hex')

async function fixture(t, { shadowDirectPeer } = {}) {
  assert(isAbsolute(hostRoot))
  const sdkRequire = createRequire(join(hostRoot, 'package.json'))
  const load = name => import(pathToFileURL(sdkRequire.resolve(name)).href)
  const { Context } = await load('@deepseek-ai/cordis')
  const { Loader } = await load('@deepseek-ai/cordis-plugin-loader')
  const { PluginPackages, createRuntimeResolution } = await load('@deepseek-ai/dsh-app-boot')
  const root = await mkdtemp(join(tmpdir(), 'dsh-canonical-peer-binding-'))
  assert(isAbsolute(root) && root.startsWith(join(tmpdir(), 'dsh-canonical-peer-binding-')))
  assert.equal(await realpath(root), root)
  let ctx, verifyUnchanged
  t.after(async () => {
    try { if (verifyUnchanged) await verifyUnchanged() }
    finally {
      try { if (ctx) await ctx.fiber.dispose() }
      finally {
        assert.equal(await realpath(root), root, 'cleanup removes only the canonical owned scratch root')
        await rm(root, { recursive: true, force: true })
      }
    }
  })
  const profile = join(root, 'profile'), home = join(root, 'home')
  const plugin = join(profile, 'node_modules', pluginName)
  const wrapper = join(plugin, 'lib/compatibility/native-subagent.js')
  const artifact = join(plugin, 'compatibility/native-subagent-0.2.1-alpha.1.js')
  await mkdir(dirname(wrapper), { recursive: true })
  await mkdir(dirname(artifact), { recursive: true })
  await mkdir(home)
  await writeFile(join(profile, 'package.json'), JSON.stringify({ name: 'canonical-peer-fixture', private: true, type: 'module' }))
  await writeFile(join(plugin, 'package.json'), JSON.stringify({ name: pluginName, version: '0.0.0-test', type: 'module',
    exports: { './native-subagent': './lib/compatibility/native-subagent.js', './package.json': './package.json' } }))
  await writeFile(wrapper, 'export default function fixtureCarrier() {}')
  await cp(artifactUrl, artifact)
  const shadows = []
  for (const owner of [profile, plugin]) {
    const shadow = join(owner, 'node_modules', peerName)
    await mkdir(dirname(shadow), { recursive: true })
    const oldRoot = process.env.DSH_CONTROLS_OLD_TYPERT_ROOT
    if (oldRoot) {
      assert(isAbsolute(oldRoot))
      const oldManifest = JSON.parse(await readFile(join(oldRoot, 'package.json'), 'utf8'))
      assert.equal(oldManifest.name, peerName)
      assert.equal(oldManifest.version, '0.1.0-rc.6')
      await symlink(await realpath(oldRoot), shadow, 'dir')
    } else {
      // Resolve-only old-version sentinel, not a receipt for historical SDK code.
      await mkdir(join(shadow, 'lib'), { recursive: true })
      await writeFile(join(shadow, 'package.json'), JSON.stringify({ name: peerName, version: '0.1.0-rc.6', type: 'module',
        exports: { '.': { default: './lib/index.js' }, './package.json': './package.json' } }))
      await writeFile(join(shadow, 'lib/index.js'), 'export const profileOldPeer = true;')
    }
    const manifest = join(shadow, 'package.json')
    shadows.push({ shadow, manifest, before: sha(await readFile(manifest)), entry: join(shadow, 'lib/index.js'), entryBefore: sha(await readFile(join(shadow, 'lib/index.js'))) })
  }
  if (shadowDirectPeer) {
    const shadow = join(plugin, 'lib/node_modules', shadowDirectPeer)
    const originalManifest = JSON.parse(await readFile(sdkRequire.resolve(shadowDirectPeer + '/package.json'), 'utf8'))
    await mkdir(join(shadow, 'lib'), { recursive: true })
    await writeFile(join(shadow, 'package.json'), JSON.stringify({ name: shadowDirectPeer, version: originalManifest.version, type: 'module',
      exports: { '.': { default: './lib/index.js' }, './package.json': './package.json' } }))
    await writeFile(join(shadow, 'lib/index.js'), 'export const sameVersionDifferentIdentity = true;')
  }
  const native = await realpath(sdkRequire.resolve('@deepseek-ai/dsh-subagent'))
  const nativeBefore = sha(await readFile(native))
  const installationAnchor = join(hostRoot, 'package.json')
  ctx = new Context()
  const resolution = await createRuntimeResolution({ installAnchor: installationAnchor, home,
    profile: { dir: profile, layers: [{ packageName: pluginName, packageDir: plugin }], skippedBundles: [] } })
  await ctx.plugin(PluginPackages, { resolution })
  ctx.provide('profileContext', { installAnchor: installationAnchor, dir: profile })
  const loader = new Loader(ctx, { baseUrl: pathToFileURL(profile + sep).href })
  await ctx.fiber.await()
  assert(loader.internal, 'actual public Loader supplies its supported ESM resolver')
  const resolve = (specifier, importer) => loader.internal.version === 'v2'
    ? loader.internal.resolveSync(pathToFileURL(importer).href, { specifier, attributes: {} })
    : loader.internal.resolveSync(specifier, pathToFileURL(importer).href, {})
  const inspect = () => inspectCanonicalPeerBindings(ctx, native, wrapper, artifact, installationAnchor)
  const unchanged = async () => {
    assert.equal(sha(await readFile(native)), nativeBefore, 'actual SDK native entry stays untouched')
    for (const shadow of shadows) {
      assert.equal(sha(await readFile(shadow.manifest)), shadow.before, 'old peer manifest stays untouched')
      assert.equal(sha(await readFile(shadow.entry)), shadow.entryBefore, 'old peer implementation stays untouched')
    }
  }
  verifyUnchanged = unchanged
  return { ctx, loader, profile, plugin, native, wrapper, artifact, inspect, resolve, unchanged, sdkRequire }
}

test('accepted public Loader/CWD peer seam selects actual native entry and manifest identities while old Profile and plugin imports stay untouched', options, async t => {
  const f = await fixture(t)
  const wrapperOld = f.resolve(peerName, f.wrapper).url
  const profileOld = f.resolve(peerName, join(f.profile, 'package.json')).url
  const peers = f.inspect()
  assert(Object.isFrozen(peers))
  assert.equal(Object.keys(peers).length, 14)
  const nativeRequire = createRequire(f.native)
  for (const [name, selected] of Object.entries(peers)) {
    assert.equal(selected, pathToFileURL(await realpath(fileURLToPath(f.resolve(name, f.native).url))).href)
    const canonicalPackage = f.ctx.pluginPackages.packageOf(name, pathToFileURL(f.native).href)
    assert.equal(await realpath(canonicalPackage.manifestPath), await realpath(nativeRequire.resolve(name + '/package.json')))
    assert.equal(canonicalPackage.name, name)
    const inPackage = relative(await realpath(canonicalPackage.dir), fileURLToPath(selected))
    assert(inPackage && !inPackage.startsWith('..' + sep) && !isAbsolute(inPackage))
  }
  assert.equal(peers['@deepseek-ai/dsh-subagent'], pathToFileURL(f.native).href)
  assert.notEqual(peers[peerName], wrapperOld)
  assert.notEqual(peers[peerName], profileOld)
  assert.equal(f.resolve(peerName, f.wrapper).url, wrapperOld)
  assert.equal(f.resolve(peerName, join(f.profile, 'package.json')).url, profileOld)
  await f.unchanged()
})

function decodedSource(dataUrl) {
  assert(dataUrl.startsWith('data:text/javascript;base64,'))
  return Buffer.from(dataUrl.slice('data:text/javascript;base64,'.length), 'base64').toString('utf8')
}

async function artifactInput() {
  const bytes = await readFile(artifactUrl), source = bytes.toString('utf8')
  assert.equal(sha(bytes), 'f6197aa3eb84c4f803e2b6517e70b1b62a804bb4e763abec94ebe961dabd77ba')
  return { source, inventory: JSON.parse(await readFile(provenanceUrl, 'utf8')).transformation.importBindings }
}

test('accepted public Loader/CWD bound asset keeps exact SDK error and Remote identities with deterministic repeated module import', options, async t => {
  const f = await fixture(t), { source, inventory } = await artifactInput()
  const peers = f.inspect()
  const dataUrl = bindCompatibleSubagentSource(source, inventory, peers)
  assert.equal(bindCompatibleSubagentSource(source, structuredClone(inventory), { ...peers }), dataUrl)
  const first = await import(dataUrl), second = await import(dataUrl)
  const native = await import(peers['@deepseek-ai/dsh-subagent'])
  const typert = await import(peers[peerName])
  assert.equal(first, second, 'same bound graph imports the exact same ESM namespace')
  assert.equal(first.default, second.default)
  assert.equal(first.default, first.SubagentRuntime)
  assert.equal(first.SubagentError, native.SubagentError)
  assert.equal(first.SubagentDepthError, native.SubagentDepthError)
  assert.equal(Object.getPrototypeOf(first.default.prototype), typert.TypertRemoteService.prototype)
  assert.equal(first.default.prototype[Symbol.for('@lmgatex/dsh-mattpocock-skills/compatible-subagent-origin')], 'native-subagent-0.2.1-alpha.1')
  assert.equal(f.ctx.get('subagents'), undefined, 'module import does not instantiate an alternate native manager')
  await f.unchanged()
})

test('accepted public Loader/CWD binder changes only inventoried literals while builtin imports, MIT and native manager regions stay byte-identical', options, async t => {
  const f = await fixture(t), { source, inventory } = await artifactInput()
  const peers = f.inspect(), rebound = decodedSource(bindCompatibleSubagentSource(source, inventory, peers))
  let originalCursor = 0, boundCursor = 0, builtinCount = 0
  for (const site of inventory.sites) {
    const unchanged = source.slice(originalCursor, site.offset)
    assert.equal(rebound.slice(boundCursor, boundCursor + unchanged.length), unchanged, 'nonliteral source span unchanged')
    boundCursor += unchanged.length
    const literal = site.specifier.startsWith('node:') ? site.literal : JSON.stringify(peers[site.specifier])
    assert.equal(rebound.slice(boundCursor, boundCursor + literal.length), literal)
    if (site.specifier.startsWith('node:')) builtinCount++
    boundCursor += literal.length
    originalCursor = site.offset + site.length
  }
  assert.equal(rebound.slice(boundCursor), source.slice(originalCursor), 'entire post-import implementation is unchanged')
  assert.equal(builtinCount, 3)
  const licenseEnd = source.indexOf('// Generated by')
  assert(licenseEnd > 0)
  assert.equal(rebound.slice(0, licenseEnd), source.slice(0, licenseEnd))
  assert(rebound.startsWith('/*!\nMIT License\n'))
  for (const name of ['continuation-activation', 'continuation']) {
    const marker = '//#region lib/types/' + name + '.js'
    const region = value => {
      const start = value.indexOf(marker)
      assert(start >= 0)
      const end = value.indexOf('//#endregion', start)
      assert(end > start)
      return value.slice(start, end)
    }
    assert.equal(region(rebound), region(source), name + ' implementation stays unchanged')
  }
  assert.equal(sha(await readFile(f.artifact)), sha(Buffer.from(source)), 'owned on-disk artifact remains original bytes')
})

test('accepted public Loader/CWD binder refuses malformed inventories and nonexact URLs before executing source', options, async t => {
  const f = await fixture(t), { source, inventory } = await artifactInput(), peers = f.inspect()
  const invalid = mutate => { const value = structuredClone(inventory); mutate(value); return value }
  for (const value of [
    undefined, { id: 'unknown', sites: inventory.sites }, { id: inventory.id, sites: [] },
    invalid(value => value.sites.pop()), invalid(value => value.sites.push(value.sites[0])),
    invalid(value => value.sites[0].offset = -1), invalid(value => value.sites[0].offset = 0.5),
    invalid(value => value.sites[0].length = 0), invalid(value => value.sites[0].length = source.length + 1),
    invalid(value => value.sites[0].literal = '"zod"'), invalid(value => value.sites[0].specifier = 'zod'),
    invalid(value => value.sites[1] = value.sites[0]), invalid(value => value.sites.reverse()),
  ]) assert.throws(() => bindCompatibleSubagentSource(source, value, peers), /inventory|site mismatch/)
  assert.throws(() => bindCompatibleSubagentSource(source, inventory, {}), /missing canonical peer/)
  for (const bad of ['https://example.invalid/peer.js', 'data:text/javascript,export default 1',
    peers[peerName] + '?cache=bust', peers[peerName] + '#alternate', 'relative.js']) {
    assert.throws(() => bindCompatibleSubagentSource(source, inventory, { ...peers, [peerName]: bad }), /exact canonical file URL|Invalid URL/)
  }
  assert.throws(() => bindCompatibleSubagentSource(source.replace('"@deepseek-ai/dsh-subagent"', '"@deepseek-ai/dsh-subagent-other"'), inventory, peers), /site mismatch/)
  assert.equal(f.ctx.get('subagents'), undefined)
})

test('accepted public Loader/CWD seam refuses a same-version different-realpath wrapper Cordis peer without changing global resolution', options, async t => {
  const f = await fixture(t, { shadowDirectPeer: '@deepseek-ai/cordis' })
  assert.notEqual(f.resolve('@deepseek-ai/cordis', f.wrapper).url, f.resolve('@deepseek-ai/cordis', f.native).url)
  assert.throws(f.inspect, /different canonical public peer: @deepseek-ai[/]cordis/)
  assert.equal(f.resolve('@deepseek-ai/cordis', f.native).url, pathToFileURL(await realpath(f.sdkRequire.resolve('@deepseek-ai/cordis'))).href)
  await f.unchanged()
})
