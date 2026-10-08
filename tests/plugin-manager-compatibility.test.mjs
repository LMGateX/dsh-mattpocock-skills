import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { createRequire } from 'node:module'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, readdir, readFile, writeFile, realpath, rm, symlink, lstat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, isAbsolute } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { constants as fsConstants } from 'node:fs'
import { open, stat, chmod } from 'node:fs/promises'

// Accepted seam: actual public pinned PluginManager + pnpm-owned Profile +
// actual app-boot Include/Hmr/PluginPackages, not hand-assembled package links.
// The shipped default base/Web layers are composed intact; a final bounded
// no-listen overlay disables surfaces and other unrelated plugins for boot.
// This is not complete Web/GUI activation, a replacement server, or a release.
const hostRoot = process.env.DSH_CONTROLS_HOST_ROOT
const options = { skip: !hostRoot && 'set DSH_CONTROLS_HOST_ROOT for genuine PluginManager probes' }
const repo = fileURLToPath(new URL('../', import.meta.url))
const run = promisify(execFile)
const pluginName = '@lmgatex/dsh-mattpocock-skills'
const origin = Symbol.for('@lmgatex/dsh-mattpocock-skills/compatible-subagent-origin')
const nativeHash = '75b50b1c9452a6aeb10d1c859e3f45b05e062ea1fad6ed3bcd9577f2bc912541'

// Trusted operator test input only; never a runtime/user-path authorization API.
function operatorArchiveInput(env) {
  const path = env.DSH_CONTROLS_TARBALL, checksum = env.DSH_CONTROLS_TARBALL_SHA256
  if (path === undefined && checksum === undefined) return undefined
  assert(path !== undefined && checksum !== undefined, 'DSH_CONTROLS_TARBALL and DSH_CONTROLS_TARBALL_SHA256 must both be supplied')
  assert(isAbsolute(path), 'DSH_CONTROLS_TARBALL must be absolute')
  assert(/^[0-9a-f]{64}$/i.test(checksum), 'DSH_CONTROLS_TARBALL_SHA256 must be a complete SHA-256')
  return { path, checksum: checksum.toLowerCase() }
}

async function operatorArchiveSnapshot(input, ownedRoot) {
  assert.equal((await stat(ownedRoot)).mode & 0o777, 0o700, 'archive snapshot root must be private mode 0700')
  const readOriginal = async () => {
    const handle = await open(input.path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW)
    try {
      const before = await handle.stat({ bigint: true })
      assert(before.isFile(), 'operator archive must be a regular file')
      assert.equal(before.mode & 0o222n, 0n, 'operator archive must already be read-only')
      const bytes = await handle.readFile(), after = await handle.stat({ bigint: true })
      for (const key of ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs']) assert.equal(after[key], before[key], 'operator archive changed while being read')
      assert.equal(createHash('sha256').update(bytes).digest('hex'), input.checksum, 'operator archive checksum mismatch')
      return { bytes, identity: before }
    } finally { await handle.close() }
  }
  const original = await readOriginal(), path = join(ownedRoot, 'accepted-package.tgz')
  await writeFile(path, original.bytes, { mode: 0o400, flag: 'wx' })
  assert.equal(createHash('sha256').update(await readFile(path)).digest('hex'), input.checksum, 'private snapshot checksum mismatch')
  const assertUnchanged = async () => {
    const current = await readOriginal()
    for (const key of ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs']) assert.equal(current.identity[key], original.identity[key], 'caller-owned archive identity changed')
    assert.equal(createHash('sha256').update(await readFile(path)).digest('hex'), input.checksum, 'consumed snapshot changed')
  }
  await assertUnchanged() // Caller hash/identity and copied bytes checked after snapshot creation.
  return { path, assertUnchanged }
}

const operatorArchive = operatorArchiveInput(process.env)

async function nativeGraph(ctx, load, dir, resume, parentId = 'manager-parent') {
  const api = { ...await load('@deepseek-ai/dsh-session'), ...await load('@deepseek-ai/dsh-agent'),
    ...await load('@deepseek-ai/dsh-session-projection'), ...await load('@deepseek-ai/dsh-agent-loop'),
    ...await load('@deepseek-ai/dsh-system-prompt'), ...await load('@deepseek-ai/dsh-tools') }
  const Jsonl = (await load('@deepseek-ai/dsh-session-persistence-jsonl')).default
  const Query = (await load('@deepseek-ai/dsh-session-query-sqlite')).default
  const LocalFs = (await load('@deepseek-ai/dsh-fs-local')).default
  const fsTools = await load('@deepseek-ai/dsh-tool-fs')
  const pathA = join(dir, 'A'), pathB = join(dir, 'B')
  await mkdir(pathA, { recursive: true }); await mkdir(pathB, { recursive: true })
  await writeFile(join(pathA, 'marker.txt'), 'manager A')
  await writeFile(join(pathB, 'marker.txt'), 'manager B')
  new api.SessionStore(ctx); new api.AgentRegistry(ctx); new api.SessionProjectionRegistry(ctx)
  new api.SystemPrompt(ctx, {}); new api.ToolRuntime(ctx, {})
  new Jsonl(ctx, { root: join(dir, 'sessions'), compression: 'none' })
  new Query(ctx, { path: join(dir, 'query.sqlite'), openAt: 'never' })
  new LocalFs(ctx, { cwd: pathA, diffBasisMaxBytes: 10485760 })
  fsTools.apply(ctx, { readLimit: 2000, readMaxLineLength: 10000, readMaxBytes: 100000, readStreamMinSize: 10000000 })
  new api.AgentLoop(ctx, { agents: [], maxParallelToolCalls: { get: () => 10 } })
  const release = Promise.withResolvers()
  ctx.on('agent/pre-step', () => release.promise)
  const handle = resume ? await ctx.agents.resume({ resumeSessionId: parentId })
    : await ctx.agents.create({ sessionId: parentId, meta: { cwd: pathA } })
  return { pathA, pathB, parent: handle.agent, signal: () => new AbortController().signal, releaseStep() { release.resolve({ kind: 'reject' }) },
    async dispose() { release.resolve({ kind: 'reject' }); await ctx.subagents.drainContinuableDescendants([handle.agent]); await handle.dispose() } }
}

async function assertPackageMetadata(ctx, carrierDisabled = false) {
  const expected = {
  "root": {
    "title": {
      "en": "Matt Pocock Skills and Optional Collaboration Controls",
      "zh": "Matt Pocock 技能与可选协作管理"
    },
    "description": {
      "en": "Distributes immutable Matt Pocock Skills with optional collaboration controls and subagent working-directory support configured in this plugin’s settings.",
      "zh": "分发不可变的 Matt Pocock 技能，并提供可选协作管理与子代理工作目录增强；功能开关位于本插件设置页。"
    }
  },
  "bridge": {
    "title": {
      "en": "Subagent Working-Directory Compatibility Bridge (Provided by This Plugin)",
      "zh": "子代理工作目录兼容桥（本插件提供）"
    },
    "description": {
      "en": "An internal compatibility dependency provided by this plugin that adds initial subagent working-directory support to supported DSH versions; not an official DSH component. The feature switch is on this plugin’s settings page; it does not create, merge, or clean up worktrees.",
      "zh": "由本插件提供的内部兼容依赖，为受支持的 DSH 补充子代理初始工作目录能力；不是 DSH 官方组件。功能开关在本插件设置页；不创建、合并或清理工作树。"
    }
  }
}
  const bundle = (await ctx.pluginManager.listBundles()).find(row => row.name === pluginName)
  const rows = await ctx.pluginManager.listPlugins()
  const root = rows.find(row => row.moduleName === pluginName)
  const bridge = rows.find(row => row.moduleName === pluginName + '/native-subagent')
  for (const [row, metadata] of [[bundle, expected.root], [root, expected.root], [bridge, expected.bridge]]) {
    assert(row, 'actual public manager must list installed package and carrier metadata')
    assert.deepEqual(row.meta?.title, metadata.title)
    assert.deepEqual(row.meta?.description, metadata.description)
    assert.equal(row.meta?.error, undefined)
  }
  if (carrierDisabled) assert.equal(bridge.enabled, false, 'disabled carrier row still exposes display metadata without activation')
}

async function prepareOldProtocolShadow(dir) {
  const peer = '@deepseek-ai/dsh-typert-protocol', target = join(dir, 'node_modules', peer)
  assert(isAbsolute(dir) && dir.includes('dsh-manager-public-proof-'), 'old peer fixture belongs only to owned scratch Profile')
  try { await lstat(target); assert.fail('old protocol fixture must not overwrite a pnpm-managed peer') }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  await mkdir(dirname(target), { recursive: true })
  const oldRoot = process.env.DSH_CONTROLS_OLD_TYPERT_ROOT
  if (oldRoot) {
    assert(isAbsolute(oldRoot))
    const manifest = JSON.parse(await readFile(join(oldRoot, 'package.json'), 'utf8'))
    assert.equal(manifest.name, peer)
    assert.equal(manifest.version, '0.1.0-rc.6')
    await symlink(await realpath(oldRoot), target, 'dir')
  } else {
    // Resolve-only old-version sentinel, not historical SDK behavior or a release.
    await mkdir(join(target, 'lib'), { recursive: true })
    await writeFile(join(target, 'package.json'), JSON.stringify({ name: peer, version: '0.1.0-rc.6', type: 'module',
      exports: { '.': { default: './lib/index.js' }, './package.json': './package.json' } }))
    await writeFile(join(target, 'lib/index.js'), 'export const profileOldPeer = true;')
  }
  const manifestPath = join(target, 'package.json'), entryPath = join(target, 'lib/index.js')
  const digest = bytes => createHash('sha256').update(bytes).digest('hex')
  const beforeManifest = digest(await readFile(manifestPath)), beforeEntry = digest(await readFile(entryPath))
  return { peer, entryPath, manifestPath, realOld: Boolean(oldRoot),
    async unchanged() {
      assert.equal(digest(await readFile(manifestPath)), beforeManifest, 'old Profile peer manifest remains unchanged')
      assert.equal(digest(await readFile(entryPath)), beforeEntry, 'old Profile peer entry remains unchanged')
    } }
}

async function worker(scenario, tarball) {
  const dir = process.cwd(), home = dirname(dirname(dir)), anchor = join(hostRoot, 'package.json')
  const sdkRequire = createRequire(anchor), profileRequire = createRequire(join(dir, 'package.json'))
  const load = name => import(pathToFileURL(sdkRequire.resolve(name)).href)
  const app = await load('@deepseek-ai/dsh-app-boot')
  const cordis = await load('@deepseek-ai/cordis')
  const { TypertRegistry } = await load('@deepseek-ai/dsh-typert-registry')
  const { SkillRegistry } = await load('@deepseek-ai/dsh-skill')
  const { PluginManager } = await load('@deepseek-ai/dsh-plugin-manager')
  const Hmr = (await load('@deepseek-ai/dsh-hmr')).default
  const Timer = (await load('@deepseek-ai/cordis-plugin-timer')).default
  const native = await load('@deepseek-ai/dsh-subagent')
  const { provideCmdline } = await load('@deepseek-ai/dsh-cmdline')
  const readyListeners = new Set()
  const oldShadow = scenario === 'old-profile' ? await prepareOldProtocolShadow(dir) : undefined
  app.initProfile(dir, app.PROFILE_TEMPLATES.web.bundles)
  const profile = app.loadProfileDirectory('manager-proof', dir, anchor)
  assert.deepEqual(profile.skippedBundles, [])
  assert.deepEqual(profile.layers.slice(0, 2).map(layer => layer.packageName),
    ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'])
  const defaultRows = app.composeEntries(profile.layers.map(layer => layer.patches))
  assert(defaultRows.some(row => row.id === 'subagent' && row.name === '@deepseek-ai/dsh-subagent'))
  assert(defaultRows.some(row => row.id === 'webserver'), 'actual default Web layer participates')
  // Only root-sibling provider rows and the installed Skills row can activate.
  // Do not replace canonical stock raw config or alter the shipped bundle layer.
  const overlays = defaultRows.filter(row => !['subagent', 'mattpocock-native-subagent', 'dsh-mattpocock-skills'].includes(row.id))
    .map(row => ({ id: row.id, disabled: true }))
  const facts = { name: 'web', dir, patchPath: profile.patchPath, installAnchor: anchor,
    cwd: dir, home, startedBundles: profile.layers.map(layer => layer.packageName), overlays,
    telemetryDisabledEnv: '1' }
  const resolution = await app.createRuntimeResolution({ installAnchor: anchor, profile, home })
  const config = join(dir, 'bounded-root.yml')
  await writeFile(config, '[]\n')
  let modelCalls = 0, ctx, graph
  const logs = []
  try {
    ctx = await app.boot('manager-proof', config, app.readProfilePatches('manager-proof', facts, profile), async ctx => {
      ctx.logger.exporter({ export(message) { if (message.type === 'error') logs.push(message.args.map(String)) } })
      ctx.provide('profileContext', facts)
      // AppReady is launcher-owned public input; commit it only after real boot.
      provideCmdline(ctx, { args: [], exit() { assert.fail('bounded boot must not request process exit') },
        ready: { onReady(listener) { readyListeners.add(listener); return () => readyListeners.delete(listener) } } })
      new app.PluginPackages(ctx, { resolution })
      new TypertRegistry(ctx); new SkillRegistry(ctx)
      ctx.provide('llm', { prepareCall() { modelCalls++; throw new Error('model forbidden') }, stream() { modelCalls++; throw new Error('model forbidden') } })
      if (scenario === 'native' || scenario === 'cold-native' || scenario === 'disable-compatible' || scenario === 'remove-compatible' || scenario === 'bridge-toggle' || scenario === 'old-profile') graph = await nativeGraph(ctx, load, dir, scenario === 'cold-native', scenario === 'disable-compatible' ? 'bundle-parent' : scenario === 'remove-compatible' ? 'remove-parent' : 'manager-parent')
      await ctx.plugin(Timer)
      await ctx.plugin(Hmr, { root: [], base: dir, ignored: [], debounce: 1 })
      await ctx.plugin(PluginManager, { fallbackRegistries: [], idleTimeoutMs: 30000 })
      await ctx.fiber.await()
    })
    for (const listener of readyListeners) listener()
    assert(ctx.get('hmr'), 'actual public Hmr must activate, not a fake runExclusive adapter')
    const entry = id => ctx.loader.resolve('include:' + id)
    const token = value => value?.[cordis.symbols.original] ?? value
    const providerOwner = () => {
      const service = token(ctx.get('subagents'))
      const owner = Reflect.ownKeys(ctx.reflect.store).map(key => ctx.reflect.store[key])
        .find(impl => impl.name === 'subagents' && token(impl.value) === service)
      assert(owner, 'public Impl record exposes actual provider-owning Fiber')
      return owner.fiber
    }
    if (scenario === 'fresh' || scenario === 'disable-compatible' || scenario === 'remove-compatible' || scenario === 'off-next' || scenario === 'skills-enable' || scenario === 'native' || scenario === 'cold-native' || scenario === 'bridge-toggle' || scenario === 'old-profile' || scenario.startsWith('upgrade-')) {
      await assertPackageMetadata(ctx)
      const stock = entry('subagent'), compatible = entry('mattpocock-native-subagent')
      assert.equal(ctx.subagents[origin], 'native-subagent-0.2.1-alpha.1', JSON.stringify({ logs, stockState: stock.fiber?.state, compatibleState: compatible.fiber?.state, sameTree: stock.parent === compatible.parent, treeRoot: stock.parent?.root }))
      assert.equal(stock.fiber, undefined)
      assert.equal(compatible.fiber.state, 2)
      assert.equal(stock.parent, compatible.parent, 'actual Include provider rows are root siblings')
      const wrapper = profileRequire.resolve(pluginName + '/native-subagent')
      const wrapperRequire = createRequire(wrapper)
      for (const peer of ['@deepseek-ai/cordis', '@deepseek-ai/cordis-plugin-loader', '@deepseek-ai/dsh-subagent',
        '@deepseek-ai/dsh-agent', '@deepseek-ai/dsh-session', '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-typert-protocol', '@deepseek-ai/dsh-scope']) {
        if (oldShadow && peer === oldShadow.peer) {
          assert.equal(await realpath(wrapperRequire.resolve(peer)), await realpath(oldShadow.entryPath))
          assert.notEqual(await realpath(wrapperRequire.resolve(peer)), await realpath(sdkRequire.resolve(peer)))
        } else assert.equal(await realpath(wrapperRequire.resolve(peer)), await realpath(sdkRequire.resolve(peer)), 'fresh installed peer identity: ' + peer)
      }
      const pluginRoot = join(dir, 'node_modules', pluginName)
      const artifactPath = join(pluginRoot, 'compatibility/native-subagent-0.2.1-alpha.1.js')
      const assetBytes = await readFile(artifactPath)
      const provenanceBytes = await readFile(join(pluginRoot, 'compatibility/native-subagent.provenance.json'))
      const provenance = JSON.parse(provenanceBytes.toString('utf8'))
      const { COMPATIBLE_SUBAGENT_METADATA } = await import(pathToFileURL(join(pluginRoot, 'lib/compatibility/readiness.js')).href)
      assert.equal(createHash('sha256').update(assetBytes).digest('hex'), COMPATIBLE_SUBAGENT_METADATA.artifactSha256)
      assert.equal(createHash('sha256').update(provenanceBytes).digest('hex'), COMPATIBLE_SUBAGENT_METADATA.provenanceSha256)
      assert.equal(provenance.artifact.bytes, assetBytes.length)
      const binding = await import(pathToFileURL(join(pluginRoot, 'lib/compatibility/peer-bindings.js')).href)
      const peers = binding.inspectCanonicalPeerBindings(ctx, sdkRequire.resolve('@deepseek-ai/dsh-subagent'), wrapper, artifactPath, anchor)
      const boundUrl = binding.bindCompatibleSubagentSource(assetBytes.toString('utf8'), provenance.transformation.importBindings, peers)
      const generated = await import(boundUrl)
      assert.equal(await import(boundUrl), generated, 'exact installed bytes and canonical vector give one emitted implementation')
      assert(token(ctx.subagents) instanceof generated.default)
      assert.equal(generated.SubagentError, native.SubagentError)
      assert.equal(generated.SubagentDepthError, native.SubagentDepthError)
      assert.equal(Object.getPrototypeOf(generated.default.prototype), (await import(peers['@deepseek-ai/dsh-typert-protocol'])).TypertRemoteService.prototype)
      if (oldShadow) {
        assert.equal(JSON.parse(await readFile(oldShadow.manifestPath, 'utf8')).version, '0.1.0-rc.6')
        assert.equal(peers[oldShadow.peer], pathToFileURL(await realpath(createRequire(sdkRequire.resolve('@deepseek-ai/dsh-subagent')).resolve(oldShadow.peer))).href)
        assert.notEqual(peers[oldShadow.peer], pathToFileURL(await realpath(oldShadow.entryPath)).href)
        const readiness = await import(pathToFileURL(join(pluginRoot, 'lib/compatibility/readiness.js')).href)
        const prepared = await readiness.inspectCompatibilityPreparation(ctx)
        assert.equal(prepared.status, 'ready', JSON.stringify(prepared))
      }
      assert.equal((await ctx.skills.list()).some(skill => skill.name === 'tdd'), true)
      if (scenario === 'off-next') {
        const retained = token(ctx.subagents), owner = providerOwner(), ownerUid = owner.uid
        const disabled = await ctx.pluginManager.setBundleEnabled(pluginName, false)
        assert.equal(disabled.application, 'applied', JSON.stringify(disabled))
        assert.equal(token(ctx.get('subagents')) === retained, true)
        assert.equal(providerOwner().uid, ownerUid)
        return { nextBootDeselected: true, retainedThisProcess: true }
      }
      if (scenario === 'bridge-toggle') {
        const readiness = await import(pathToFileURL(join(pluginRoot, 'lib/compatibility/readiness.js')).href)
        const bridge = (await ctx.pluginManager.listPlugins()).find(row => row.moduleName === pluginName + '/native-subagent')
        assert.equal(bridge.patchId, 'mattpocock-native-subagent')
        const retained = token(ctx.subagents), owner = providerOwner(), ownerUid = owner.uid
        const rawStock = structuredClone(stock.options.config)
        assert.equal(ctx.subagents.initialCwdSupported, true)
        ctx.subagents.registerProvider({ name: 'component-continuity', capabilities: { continuable: true }, async prepareContinuable() { return {} } })
        const started = await ctx.subagents.startContinuable({ provider: 'component-continuity', cwd: graph.pathB,
          label: 'bridge toggle continuity', request: { parent: graph.parent, prompt: [{ type: 'text', text: 'no model' }], maxDepth: 4 }, signal: graph.signal() })
        const child = ctx.agents.get(started.childId), header = structuredClone(child.session.header)
        assert.equal(Object.isFrozen(child.session.header), true)
        const observe = async () => {
          assert.equal(token(ctx.subagents), retained)
          assert.equal(providerOwner(), owner)
          assert.equal(owner.uid, ownerUid)
          assert.equal(owner.state, 2)
          assert.deepEqual(stock.options.config, rawStock)
          assert.equal(ctx.subagents.initialCwdSupported, true, 'component disabled state does not rewrite current capability')
          await ctx.subagents.sendMessage(graph.parent, started.childId, [{ type: 'text', text: 'same B child through bridge toggle' }], { signal: graph.signal() })
          assert.equal(ctx.agents.get(started.childId), child)
          assert.deepEqual(child.session.header, header)
          assert.equal(child.session.header.cwd, graph.pathB)
          assert.equal(Object.isFrozen(child.session.header), true)
          assert.equal((await ctx.sessionPersistence.stat(started.childId)).header.cwd, graph.pathB)
          const read = await ctx.tools.execute({ callId: 'toggle-read', name: 'read', arguments: { file_path: 'marker.txt' }, agent: child, signal: graph.signal() })
          assert.equal(read.value.lines[0].text, 'manager B')
        }
        const disabled = await ctx.pluginManager.setPluginEnabled(bridge.entryId, false)
        assert.equal(disabled.application, 'applied', JSON.stringify(disabled))
        assert.equal(entry('mattpocock-native-subagent').options.disabled, true)
        const disabledPreparation = await readiness.inspectCompatibilityPreparation(ctx)
        assert.equal(disabledPreparation.status, 'incompatible')
        assert.equal(disabledPreparation.reason, 'compatibility-component-disabled')
        assert.equal(app.loadProfileDirectory('manager-proof', dir, anchor).patches.findLast(row => row.id === bridge.patchId).disabled, true)
        await observe()
        const enabled = await ctx.pluginManager.setPluginEnabled(bridge.entryId, true)
        assert.equal(enabled.application, 'applied', JSON.stringify(enabled))
        assert.equal(entry('mattpocock-native-subagent').options.disabled, false)
        const forcedPreparation = await readiness.inspectCompatibilityPreparation(ctx)
        assert.equal(forcedPreparation.status, 'incompatible')
        assert.equal(forcedPreparation.reason, 'compatibility-component-forced-enabled')
        assert.match(forcedPreparation.diagnostic, /automatic selection|force-enabled/)
        assert.equal(app.loadProfileDirectory('manager-proof', dir, anchor).patches.findLast(row => row.id === bridge.patchId).disabled, false,
          'actual Manager enabling persists a boolean override, not the packaged automatic guard')
        await observe()
        return { componentToggleRetainsNative: true, sameProviderFiber: true, liveFrozenB: true, disabledAndForcedReasonsDistinct: true, persistedForcedEnable: true }
      }
      if (graph && scenario !== 'disable-compatible' && scenario !== 'remove-compatible') {
        assert.equal(ctx.subagents.initialCwdSupported, true)
        if (scenario === 'cold-native') {
          const expected = JSON.parse(await readFile(join(dir, 'expected-child.json'), 'utf8'))
          assert.equal(ctx.agents.get(expected.childId), undefined)
          await ctx.subagents.sendMessage(graph.parent, expected.childId, [{ type: 'text', text: 'actual profile cold resume' }], { signal: graph.signal() })
          const child = ctx.agents.get(expected.childId)
          assert.deepEqual(child.session.header, expected.header)
          assert.equal(child.session.header.cwd, graph.pathB)
          assert.equal(Object.isFrozen(child.session.header), true)
          return { actualProfileColdResume: true, frozenB: true }
        }
        ctx.subagents.registerProvider({ name: 'bounded-native', capabilities: { continuable: true }, async prepareContinuable() { return {} } })
        const start = cwd => ctx.subagents.startContinuable({ provider: 'bounded-native', label: 'real manager installed native',
          ...(cwd === undefined ? {} : { cwd }), request: { parent: graph.parent, prompt: [{ type: 'text', text: 'no model' }], maxDepth: 4 }, signal: graph.signal() })
        const a = await start(graph.pathA), b = await start(graph.pathB), inherited = await start(undefined)
        const read = id => ctx.tools.execute({ callId: 'read-' + id, name: 'read', arguments: { file_path: 'marker.txt' }, agent: ctx.agents.get(id), signal: graph.signal() })
        assert.equal((await read(a.childId)).value.lines[0].text, 'manager A')
        assert.equal((await read(b.childId)).value.lines[0].text, 'manager B')
        const child = ctx.agents.get(b.childId), header = structuredClone(child.session.header)
        assert.equal(Object.isFrozen(child.session.header), true)
        assert.equal((await ctx.sessionPersistence.stat(b.childId)).header.cwd, graph.pathB)
        assert.equal(ctx.agents.get(inherited.childId).session.header.cwd, graph.pathA)
        await ctx.subagents.sendMessage(graph.parent, b.childId, [{ type: 'text', text: 'same process send' }], { signal: graph.signal() })
        assert.equal(ctx.agents.get(b.childId), child)
        assert.deepEqual(child.session.header, header)
        await writeFile(join(dir, 'expected-child.json'), JSON.stringify({ childId: b.childId, header }))
        if (oldShadow) {
          const importer = pathToFileURL(join(dir, 'independent-old-consumer.mjs')).href
          const independent = ctx.loader.internal.version === 'v2'
            ? ctx.loader.internal.resolveSync(importer, { specifier: oldShadow.peer, attributes: {} })
            : ctx.loader.internal.resolveSync(oldShadow.peer, importer, {})
          assert.equal(await realpath(fileURLToPath(independent.url)), await realpath(oldShadow.entryPath))
          assert.notEqual(independent.url, peers[oldShadow.peer])
          const oldNamespace = await ctx.loader.internal.import(oldShadow.peer, importer, {})
          if (oldShadow.realOld) assert.notEqual(oldNamespace.Remote, (await import(peers[oldShadow.peer])).Remote)
          else assert.equal(oldNamespace.profileOldPeer, true)
          await oldShadow.unchanged()
          return { oldProfilePeerPreserved: true, canonicalBoundProvider: true, actualProfileAB: true, nativeHotSend: true, nativePersistedB: true }
        }
        return { actualProfileAB: true, nativeHotSend: true, nativePersistedB: true }
      }
      if (scenario === 'skills-enable') {
        const row = (await ctx.pluginManager.listPlugins()).find(row => row.moduleName === pluginName)
        assert.equal(row.patchId, 'dsh-mattpocock-skills')
        const retained = token(ctx.subagents), retainedUid = compatible.fiber.uid
        const raw = structuredClone(stock.options.config)
        try {
          const disabled = await ctx.pluginManager.setPluginEnabled(row.entryId, false)
          assert.equal(disabled.application, 'applied', JSON.stringify(disabled))
          assert.equal((await ctx.skills.list()).some(skill => skill.name === 'tdd'), false)
          assert.equal(token(ctx.subagents) === retained, true)
          assert.equal(compatible.fiber.uid, retainedUid)
          assert.deepEqual(stock.options.config, raw)
          const enabled = await ctx.pluginManager.setPluginEnabled(row.entryId, true)
          assert.equal(enabled.application, 'applied', JSON.stringify(enabled))
          assert.equal((await ctx.skills.list()).some(skill => skill.name === 'tdd'), true)
          assert.equal(token(ctx.subagents) === retained, true)
          assert.equal(compatible.fiber.uid, retainedUid)
          assert.deepEqual(stock.options.config, raw)
          return { skillsIndependent: true, retainedCompatible: true, unchangedRawStock: true }
        } finally {
          await ctx.pluginManager.setPluginEnabled(row.entryId, true)
        }
      }
      if (scenario.startsWith('upgrade-')) {
        const expectedVersion = scenario.slice('upgrade-'.length)
        const retained = token(ctx.subagents), retainedUid = compatible.fiber.uid
        const update = await ctx.pluginManager.installBundle(tarball, { requestId: 'normal-update-' + expectedVersion })
        assert.equal(update.packageResult?.exitCode, 0, JSON.stringify(update))
        assert.equal(update.version, expectedVersion)
        assert.equal(update.application, 'restart-required', 'existing dependency update truthfully requires a process restart')
        assert.equal(token(ctx.subagents) === retained, true, 'package update does not secretly replace loaded provider')
        assert.equal(compatible.fiber.uid, retainedUid)
        assert.equal(ctx.subagents[origin], 'native-subagent-0.2.1-alpha.1')
        assert.equal((await ctx.pluginManager.listBundles()).find(bundle => bundle.name === pluginName).version, expectedVersion)
        return { syntheticFixtureVersion: expectedVersion, restartRequired: true, retainedCompatible: true }
      }
      if (scenario === 'disable-compatible' || scenario === 'remove-compatible') {
        const removing = scenario === 'remove-compatible'
        const retained = token(ctx.subagents), providerFiber = providerOwner(), retainedUid = providerFiber.uid
        const stockActivations = []
        ctx.on('internal/status', fiber => {
          if (fiber.runtime?.callback === native.default && (fiber.state === 1 || fiber.state === 2)) stockActivations.push(fiber.state)
        }, { global: true })
        ctx.subagents.registerProvider({ name: 'bundle-continuity', capabilities: { continuable: true }, async prepareContinuable() { return {} } })
        const started = await ctx.subagents.startContinuable({ provider: 'bundle-continuity', cwd: graph.pathB,
          label: 'survive bundle removal', request: { parent: graph.parent, prompt: [{ type: 'text', text: 'no model' }], maxDepth: 4 }, signal: graph.signal() })
        const child = ctx.agents.get(started.childId), header = structuredClone(child.session.header)
        try {
          for (let n = 0; n < (removing ? 1 : 3); n++) {
            const carrier = entry('mattpocock-native-subagent').fiber
            const disabled = removing ? await ctx.pluginManager.removeBundle(pluginName) : await ctx.pluginManager.setBundleEnabled(pluginName, false)
            assert.equal(disabled.application, 'applied', JSON.stringify(disabled))
            if (removing) {
              assert.equal(disabled.packageResult?.exitCode, 0, JSON.stringify(disabled))
              assert.equal((await ctx.pluginManager.listBundles()).some(bundle => bundle.name === pluginName), false)
              await assert.rejects(readFile(join(dir, 'node_modules', pluginName, 'package.json')), error => error.code === 'ENOENT')
            } else assert.equal((await ctx.pluginManager.listBundles()).find(bundle => bundle.name === pluginName).enabled, false)
            assert.equal(token(ctx.get('subagents')) === retained, true, 'bundle removal must preserve actual provider token; ' + JSON.stringify({ result: disabled, beforeProviderUid: retainedUid, afterStockUid: stock.fiber?.uid, afterOrigin: ctx.get('subagents')?.[origin] }))
            assert.equal(providerFiber.uid, retainedUid, 'actual provider fiber, not removed carrier fiber')
            assert.equal(providerFiber.state, 2)
            assert.equal(carrier.state, 4, 'bundle removal still disposes the compatibility carrier')
            assert.notEqual(stock.fiber?.state, 2)
            await ctx.subagents.sendMessage(graph.parent, started.childId, [{ type: 'text', text: 'hot send with bundle absent' }], { signal: graph.signal() })
            assert.equal(ctx.agents.get(started.childId) === child, true)
            assert.deepEqual(child.session.header, header)
            assert.equal(Object.isFrozen(child.session.header), true)
            if (!removing) {
              const enabled = await ctx.pluginManager.setBundleEnabled(pluginName, true)
              assert.equal(enabled.application, 'applied', JSON.stringify(enabled))
              assert.equal(token(ctx.get('subagents')) === retained, true)
              assert.equal(providerFiber.uid, retainedUid)
            }
          }
          assert.deepEqual(stockActivations, [], 'canonical stock constructor must never enter loading/active during unpatch')
          const agents = token(ctx.agents)
          graph.releaseStep()
          await ctx.fiber.dispose(); graph = undefined
          assert.equal(providerFiber.state, 4, 'persistent native owner disposes at actual root shutdown')
          assert.deepEqual(agents.list(), [], 'actual root shutdown drains all native children and parent')
          assert.equal(ctx.get('subagents'), undefined)
          return { compatibleRetainedOnBundleDisable: true, nativeChildSurvives: true, providerLifetimeRetained: true, rootDrained: true, ...(removing ? { removedByManager: true } : {}) }
        } finally {
          const manager = ctx.get('pluginManager')
          if (!removing && manager) await manager.setBundleEnabled(pluginName, true)
        }
      }
      return { enhancedFreshBoot: true, publicIncludeSiblings: true, installedPeerIdentity: true }
    }
    const initial = token(ctx.subagents), uid = entry('subagent').fiber.uid
    assert(initial instanceof native.default)
    if (scenario === 'stock-removed') {
      assert.equal(ctx.subagents[origin], undefined)
      assert.equal((await ctx.pluginManager.listBundles()).some(bundle => bundle.name === pluginName), false)
      assert.equal((await ctx.skills.list()).some(skill => skill.name === 'tdd'), false)
      return { stockAfterRemoval: true }
    }
    if (scenario === 'stock-next') {
      assert.equal(ctx.subagents[origin], undefined, 'no enhanced provider is booted while whole bundle is absent')
      assert.equal((await ctx.pluginManager.listBundles()).find(bundle => bundle.name === pluginName).enabled, false)
      assert.equal((await ctx.skills.list()).some(skill => skill.name === 'tdd'), false)
      const enabled = await ctx.pluginManager.setBundleEnabled(pluginName, true)
      assert.equal(enabled.application, 'applied', JSON.stringify(enabled))
      assert.equal(token(ctx.subagents) === initial, true, 'live reenable cannot replace already active stock')
      assert.equal(entry('subagent').fiber.uid, uid)
      assert.equal(entry('mattpocock-native-subagent').fiber, undefined)
      return { nextBootStock: true, liveReenableRetainsStock: true }
    }
    assert.equal(entry('subagent').fiber.state, 2, JSON.stringify(logs))
    const result = await ctx.pluginManager.installBundle(tarball, { requestId: 'normal-install' })
    assert.equal(result.packageResult?.exitCode, 0, JSON.stringify(result))
    assert.equal(result.application, 'applied', JSON.stringify(result))
    assert.equal(result.bundle, pluginName)
    assert.equal(result.changed, true)
    assert.equal(result.version, '0.4.20')
    const installed = (await ctx.pluginManager.listBundles()).find(bundle => bundle.name === pluginName)
    assert.equal(installed.installed, true)
    assert.equal(installed.enabled, true)
    await assertPackageMetadata(ctx, true)
    assert.equal(token(ctx.subagents), initial, 'actual manager live install retains canonical service')
    assert.equal(entry('subagent').fiber.uid, uid, 'actual manager live HMR retains Fiber')
    assert.equal(entry('mattpocock-native-subagent').fiber, undefined)
    assert.equal((await ctx.skills.list()).some(skill => skill.name === 'tdd'), true)
    const deselected = await ctx.pluginManager.setBundleEnabled(pluginName, false)
    assert.equal(deselected.application, 'applied', JSON.stringify(deselected))
    assert.equal(token(ctx.subagents) === initial, true, 'real bundle disable retains existing stock provider')
    assert.equal(entry('subagent').fiber.uid, uid)
    assert.equal((await ctx.skills.list()).some(skill => skill.name === 'tdd'), false)
    const reselected = await ctx.pluginManager.setBundleEnabled(pluginName, true)
    assert.equal(reselected.application, 'applied', JSON.stringify(reselected))
    assert.equal(token(ctx.subagents) === initial, true, 'real bundle enable retains existing stock provider')
    assert.equal(entry('subagent').fiber.uid, uid)
    assert.equal(entry('mattpocock-native-subagent').fiber, undefined)
    assert.equal((await ctx.skills.list()).some(skill => skill.name === 'tdd'), true)
    const wrapper = profileRequire.resolve(pluginName + '/native-subagent')
    assert.equal(await realpath(wrapper), await realpath(join(dir, 'node_modules', pluginName, 'lib/compatibility/native-subagent.js')))
    const wrapperRequire = createRequire(wrapper)
    for (const peer of ['@deepseek-ai/cordis', '@deepseek-ai/cordis-plugin-loader', '@deepseek-ai/dsh-subagent',
      '@deepseek-ai/dsh-agent', '@deepseek-ai/dsh-session', '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-typert-protocol', '@deepseek-ai/dsh-scope']) {
      assert.equal(await realpath(wrapperRequire.resolve(peer)), await realpath(sdkRequire.resolve(peer)), 'pnpm installed peer identity: ' + peer)
    }
    return { installedByManager: true, retainedStock: true, realDefaultWebComposition: true, skillsMounted: true }
  } finally {
    if (graph && ctx?.get('subagents')) await graph.dispose()
    if (ctx?.get('loader')) await ctx.fiber.dispose()
    assert.equal(modelCalls, 0)
    assert.equal(createHash('sha256').update(await readFile(sdkRequire.resolve('@deepseek-ai/dsh-subagent'))).digest('hex'), nativeHash)
  }
}

let scratch, tarball, profile, archiveBinding
const upgrades = new Map()
before(async () => {
  if (!hostRoot) { assert(!operatorArchive, 'accepted archive proof requires DSH_CONTROLS_HOST_ROOT'); return }
  scratch = await mkdtemp(join(tmpdir(), 'dsh-manager-public-proof-'))
  await mkdir(join(scratch, 'pack'))
  await chmod(scratch, 0o700)
  if (operatorArchive) {
    archiveBinding = await operatorArchiveSnapshot(operatorArchive, scratch)
    tarball = archiveBinding.path
  } else {
    await run('pnpm', ['pack', '--pack-destination', join(scratch, 'pack')], { cwd: repo, timeout: 60000, maxBuffer: 8 * 1024 * 1024 })
    tarball = join(scratch, 'pack', (await readdir(join(scratch, 'pack'))).find(name => name.endsWith('.tgz')))
  }
  // Upgrade manifests are synthetic fixtures, never repository releases.
  const fixtureRoot = join(scratch, 'version-fixture')
  await mkdir(fixtureRoot)
  await run('tar', ['-xzf', tarball, '-C', fixtureRoot], { timeout: 60000 })
  const fixture = join(fixtureRoot, 'package'), manifestPath = join(fixture, 'package.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  assert.equal(manifest.version, '0.4.20')
  for (const version of ['0.4.5', '0.4.6']) {
    await writeFile(manifestPath, JSON.stringify({ ...manifest, version }, null, 2) + '\n')
    await run('pnpm', ['pack', '--pack-destination', join(scratch, 'pack')], { cwd: fixture, timeout: 60000, maxBuffer: 8 * 1024 * 1024 })
    upgrades.set(version, join(scratch, 'pack', 'lmgatex-dsh-mattpocock-skills-' + version + '.tgz'))
  }
  assert.equal(JSON.parse(await readFile(join(repo, 'package.json'), 'utf8')).version, '0.4.20')
  profile = join(scratch, 'home/profiles/web')
  await mkdir(profile, { recursive: true })
})
after(async () => {
  if (!scratch) return
  assert.equal(dirname(scratch), tmpdir())
  assert(scratch.startsWith(join(tmpdir(), 'dsh-manager-public-proof-')))
  try { await archiveBinding?.assertUnchanged() } finally { await rm(scratch, { recursive: true, force: true }) }
})

async function child(scenario, tar = tarball, targetProfile = profile) {
  const source = [
    "import assert from 'node:assert/strict'", "import { createRequire } from 'node:module'",
    "import { mkdir, readFile, writeFile, realpath, symlink, lstat } from 'node:fs/promises'",
    "import { join, dirname, isAbsolute } from 'node:path'", "import { pathToFileURL, fileURLToPath } from 'node:url'",
    "import { createHash } from 'node:crypto'",
    'const hostRoot = ' + JSON.stringify(hostRoot), 'const pluginName = ' + JSON.stringify(pluginName),
    "const origin = Symbol.for('@lmgatex/dsh-mattpocock-skills/compatible-subagent-origin')",
    'const nativeHash = ' + JSON.stringify(nativeHash), nativeGraph.toString(), assertPackageMetadata.toString(), prepareOldProtocolShadow.toString(), worker.toString(),
    'console.log("MANAGER_RESULT:" + JSON.stringify(await worker(' + JSON.stringify(scenario) + ', ' + JSON.stringify(tar) + ')))',
  ].join('\n')
  const workerPath = join(scratch, 'worker-' + scenario + '.mjs')
  await writeFile(workerPath, source)
  const { stdout } = await run(process.execPath, [workerPath], {
    cwd: targetProfile, env: { ...process.env, NODE_OPTIONS: '', DSH_TELEMETRY_DISABLED: '1' },
    timeout: 120000, maxBuffer: 8 * 1024 * 1024,
  })
  const line = stdout.split('\n').find(line => line.startsWith('MANAGER_RESULT:'))
  assert(line, stdout)
  return JSON.parse(line.slice('MANAGER_RESULT:'.length))
}

test('ordinary PluginManager pnpm install over actual default base/Web composition retains live native service', options, async () => {
  assert.deepEqual(await child('install'), { installedByManager: true, retainedStock: true, realDefaultWebComposition: true, skillsMounted: true })
})

test('fresh actual app-boot selects compatible installed provider in canonical runtime resolution', options, async () => {
  assert.deepEqual(await child('fresh'), { enhancedFreshBoot: true, publicIncludeSiblings: true, installedPeerIdentity: true })
})

test('actual PluginManager whole-bundle disable cannot silently replace loaded compatible native service', options, async () => {
  assert.deepEqual(await child('disable-compatible'), { compatibleRetainedOnBundleDisable: true, nativeChildSurvives: true, providerLifetimeRetained: true, rootDrained: true })
})

test('whole bundle off persists stock-only next boot and reenable takes effect on subsequent fresh boot', options, async () => {
  assert.deepEqual(await child('off-next'), { nextBootDeselected: true, retainedThisProcess: true })
  assert.deepEqual(await child('stock-next'), { nextBootStock: true, liveReenableRetainsStock: true })
  assert.deepEqual(await child('fresh'), { enhancedFreshBoot: true, publicIncludeSiblings: true, installedPeerIdentity: true })
})

test('manager-installed true boot native children keep A/B initial cwd and persisted frozen headers across processes', options, async () => {
  assert.deepEqual(await child('native'), { actualProfileAB: true, nativeHotSend: true, nativePersistedB: true })
  assert.deepEqual(await child('cold-native'), { actualProfileColdResume: true, frozenB: true })
})

test('actual manager Skills plugin enablement is independent of loaded compatible provider', options, async () => {
  assert.deepEqual(await child('skills-enable'), { skillsIndependent: true, retainedCompatible: true, unchangedRawStock: true })
})

for (const version of ['0.4.5', '0.4.6']) {
  test('actual manager installs synthetic upgrade fixture ' + version + ' without swapping loaded compatible service', options, async () => {
    assert.deepEqual(await child('upgrade-' + version, upgrades.get(version)), { syntheticFixtureVersion: version, restartRequired: true, retainedCompatible: true })
    assert.deepEqual(await child('fresh'), { enhancedFreshBoot: true, publicIncludeSiblings: true, installedPeerIdentity: true })
  })
}

test('actual manager package removal preserves live native child until root shutdown and next boot is stock-only', options, async () => {
  assert.deepEqual(await child('remove-compatible'), { compatibleRetainedOnBundleDisable: true, nativeChildSurvives: true, providerLifetimeRetained: true, rootDrained: true, removedByManager: true })
  assert.deepEqual(await child('stock-removed'), { stockAfterRemoval: true })
})


test('actual PluginManager bridge component off then on preserves native Fiber and frozen B child but persists a distinct force-enabled guard conflict', options, async () => {
  const isolated = join(scratch, 'toggle-home/profiles/web')
  await mkdir(isolated, { recursive: true })
  assert.deepEqual(await child('install', tarball, isolated), { installedByManager: true, retainedStock: true, realDefaultWebComposition: true, skillsMounted: true })
  assert.deepEqual(await child('bridge-toggle', tarball, isolated), { componentToggleRetainsNative: true, sameProviderFiber: true, liveFrozenB: true,
    disabledAndForcedReasonsDistinct: true, persistedForcedEnable: true })
})


test('actual PluginManager installed archive fresh boot binds canonical native peers while isolated old Profile protocol and independent importer remain untouched', options, async () => {
  const isolated = join(scratch, 'old-peer-home/profiles/web')
  await mkdir(isolated, { recursive: true })
  assert.deepEqual(await child('install', tarball, isolated), { installedByManager: true, retainedStock: true, realDefaultWebComposition: true, skillsMounted: true })
  assert.deepEqual(await child('old-profile', tarball, isolated), { oldProfilePeerPreserved: true, canonicalBoundProvider: true,
    actualProfileAB: true, nativeHotSend: true, nativePersistedB: true })
})
