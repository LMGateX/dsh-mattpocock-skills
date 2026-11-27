import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { createRequire } from 'node:module'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, readdir, readFile, writeFile, chmod, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, isAbsolute } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { constants as fsConstants } from 'node:fs'
import { open, stat } from 'node:fs/promises'

// Accepted seam: actual public pinned PluginManager + pnpm-owned Profile +
// actual app-boot Include/Hmr/PluginPackages, not hand-assembled package links.
// The shipped default base/Web layers are composed intact; a final bounded
// no-listen overlay disables unrelated plugins for boot. This is not complete
// Web/GUI activation, a replacement server, or a release. The retired
// compatibility provider no longer exists, so only the stock native subagent
// and the Skills provider may activate.
const hostRoot = process.env.DSH_CONTROLS_HOST_ROOT
const options = { skip: !hostRoot && 'set DSH_CONTROLS_HOST_ROOT for genuine PluginManager probes' }
const repo = fileURLToPath(new URL('../', import.meta.url))
const run = promisify(execFile)
const pluginName = '@lmgatex/dsh-mattpocock-skills'
const nativeEntrySha256 = async root => {
  const require = createRequire(join(root, 'package.json'))
  return createHash('sha256').update(await readFile(require.resolve('@deepseek-ai/dsh-subagent'))).digest('hex')
}

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
  await assertUnchanged()
  return { path, assertUnchanged }
}

const operatorArchive = operatorArchiveInput(process.env)

async function packageMetadata(ctx, expectInstalled) {
  const bundles = await ctx.pluginManager.listBundles()
  const rows = await ctx.pluginManager.listPlugins()
  const bundle = bundles.find(row => row.name === pluginName)
  const root = rows.find(row => row.moduleName === pluginName)
  if (!expectInstalled) {
    assert.equal(bundle, undefined)
    assert.equal(root, undefined)
    return
  }
  assert(bundle, 'actual public manager must list the installed bundle')
  assert(root, 'actual public manager must list the inserted Skills provider row')
  for (const row of [bundle, root]) {
    assert.equal(row.meta?.error, undefined)
    assert.equal(row.meta?.title?.en, 'Matt Pocock Skills and Optional Collaboration Controls')
    assert.equal(row.meta?.title?.zh, 'Matt Pocock 技能与可选协作管理')
    assert.match(row.meta?.description?.en ?? '', /native activation seam/)
    assert.match(row.meta?.description?.zh ?? '', /原生 activation seam/)
  }
  assert.equal(rows.some(row => row.moduleName === pluginName + '/native-subagent'), false, 'retired compatibility provider row must not be composed')
  assert.equal(rows.some(row => row.moduleName === pluginName + '/compatibility'), false, 'retired compatibility export must not be composed')
}

async function worker(scenario, tarball) {
  const dir = process.cwd(), home = dirname(dirname(dir)), anchor = join(hostRoot, 'package.json')
  const sdkRequire = createRequire(anchor), profileRequire = createRequire(join(dir, 'package.json'))
  const load = name => import(pathToFileURL(sdkRequire.resolve(name)).href)
  const app = await load('@deepseek-ai/dsh-app-boot')
  const { PROFILE_TEMPLATES } = await load('@deepseek-ai/dsh-official-bundles')
  const cordis = await load('@deepseek-ai/cordis')
  const { TypertRegistry } = await load('@deepseek-ai/dsh-typert-registry')
  const { SkillRegistry } = await load('@deepseek-ai/dsh-skill')
  const { PluginManager } = await load('@deepseek-ai/dsh-plugin-manager')
  const Hmr = (await load('@deepseek-ai/dsh-hmr')).default
  const Timer = (await load('@deepseek-ai/cordis-plugin-timer')).default
  const native = await load('@deepseek-ai/dsh-subagent')
  const { provideCmdline } = await load('@deepseek-ai/dsh-cmdline')
  const connection = await load('@deepseek-ai/dsh-client-connection')
  const readyListeners = new Set()
  app.initProfile(dir, PROFILE_TEMPLATES.web.bundles)
  const profile = app.loadProfileDirectory('manager-proof', dir, anchor)
  assert.deepEqual(profile.skippedBundles, [])
  assert.deepEqual(profile.layers.slice(0, 2).map(layer => layer.packageName), ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'])
  const defaultRows = app.composeEntries(profile.layers.map(layer => layer.patches))
  assert(defaultRows.some(row => row.id === 'subagent' && row.name === '@deepseek-ai/dsh-subagent'))
  assert(defaultRows.some(row => row.id === 'webserver'), 'actual default Web layer participates')
  const retainedRows = new Set([
    'subagent', 'dsh-mattpocock-skills', 'workspace', 'storage', 'storage-json', 'storage-domain',
    'session', 'session-persistence-jsonl', 'session-query-sqlite', 'agent', 'agent-loop',
    'session-projection', 'system-prompt', 'tools',
  ])
  const overlays = defaultRows.filter(row => !retainedRows.has(row.id))
    .map(row => ({ id: row.id, disabled: true }))
  // Alpha.2 reloads the official --patch input from disk each time the
  // manager recomposes the profile. Keep the bounded overlay in fixture home.
  const overlayPath = join(home, 'bounded-manager.patch.yml')
  await writeFile(overlayPath, JSON.stringify(overlays))
  const facts = { name: 'web', dir, patchPath: profile.patchPath, installAnchor: anchor,
    cwd: dir, home, startedBundles: profile.layers.map(layer => layer.packageName), overlayPaths: [overlayPath],
    telemetryDisabledEnv: '1' }
  const resolution = await app.createRuntimeResolution({ installAnchor: anchor, profile, home })
  const config = join(dir, 'bounded-root.yml')
  await writeFile(config, '[]\n')
  let modelCalls = 0, ctx
  try {
    ctx = await app.boot('manager-proof', config, app.readProfilePatches('manager-proof', facts, profile), async ctx => {
      ctx.provide('profileContext', facts)
      provideCmdline(ctx, { args: [], exit() { assert.fail('bounded boot must not request process exit') },
        ready: { onReady(listener) { readyListeners.add(listener); return () => readyListeners.delete(listener) } } })
      new app.PluginPackages(ctx, { resolution })
      new TypertRegistry(ctx); new SkillRegistry(ctx)
      // Stock Connection can supply its local owner Peer without an HTTP listener.
      await ctx.plugin(connection)
      ctx.provide('llm', { prepareCall() { modelCalls++; throw new Error('model forbidden') }, stream() { modelCalls++; throw new Error('model forbidden') } })
      if (native.default.inject?.includes('workingDirectory') && ctx.get('workingDirectory') === undefined)
        ctx.provide('workingDirectory', { async ensure() { return dir }, async set() {} })
      await ctx.plugin(Timer)
      await ctx.plugin(Hmr, { root: [], base: dir, ignored: [], debounce: 1 })
      await ctx.plugin(PluginManager, { fallbackRegistries: [], idleTimeoutMs: 30000 })
      await ctx.fiber.await()
    })
    for (const listener of readyListeners) listener()
    assert(ctx.get('hmr'), 'actual public Hmr must activate, not a fake runExclusive adapter')
    const entry = id => { try { return ctx.loader.resolve('include:' + id) } catch { return undefined } }
    assert.equal(entry('webserver')?.disabled, true, 'bounded fixture must not mount the Web server')
    const token = value => value?.[cordis.symbols.original] ?? value
    const initial = token(ctx.subagents), uid = entry('subagent').fiber.uid
    assert(initial instanceof native.default, 'the stock native subagent must be the selected provider')
    assert.equal(entry('mattpocock-native-subagent'), undefined, 'retired compatibility row must not exist')
    const pluginRow = () => ctx.pluginManager.listPlugins().then(rows => rows.find(row => row.moduleName === pluginName))
    const workspaceDir = join(home, 'manager-proof-workspace')
    await mkdir(workspaceDir, { recursive: true })
    assert.equal(ctx.get('webServer'), undefined, 'bounded smoke is not an HTTP/GUI launch')
    await ctx.workspaceRegistry.create(workspaceDir, 'Manager proof')
    const { agent } = await ctx.agents.create({ sessionId: 'manager-proof-' + scenario, meta: { cwd: workspaceDir }, agentOptions: {} })
    assert.equal(ctx.agents.get(agent.id), agent, 'lookup is an actual factory-registered Agent')
    const unrelated = { name: 'manager-unrelated', provider: 'manager-unrelated', source: 'runtime', description: 'Unrelated host skill', content: 'Unrelated body' }
    ctx.skills.register(unrelated)
    const skillMounted = async () => {
      const lookup = { cwd: workspaceDir, scope: agent }
      const listed = await ctx.skills.list(lookup)
      assert(listed.some(skill => skill.name === unrelated.name), 'independent Skills remain available')
      const bundled = listed.find(skill => skill.name === 'tdd' && skill.provider === 'dsh-mattpocock-skills')
      if (!bundled) return false
      assert.equal((await ctx.skills.get('tdd', lookup))?.provider, bundled.provider)
      for (const otherScope of [{ cwd: workspaceDir }, { cwd: workspaceDir, scope: { id: agent.id } }]) {
        const otherSkills = await ctx.skills.list(otherScope)
        assert(otherSkills.some(skill => skill.name === unrelated.name))
        assert.equal(otherSkills.some(skill => skill.provider === bundled.provider), false,
          'neither caller cwd nor a copied Agent id grants bundled Skills')
        assert.equal(await ctx.skills.get('tdd', otherScope), undefined)
      }
      return true
    }
    const watchStartupLookup = () => {
      let observation, hostWasReady
      const stop = ctx.on('skills/change', () => {
        if (observation !== undefined) return
        hostWasReady = ctx.get('mattpocockControls') !== undefined
        const global = ctx.skills.list({ cwd: workspaceDir })
        // Run after provider registration to exercise cancellation during the nested Host startup.
        const aborted = Promise.resolve().then(async () => {
          const controller = new AbortController(), reason = new Error('cancel startup skill lookup')
          const pending = ctx.skills.list({ cwd: workspaceDir, scope: agent, signal: controller.signal })
          controller.abort(reason)
          await assert.rejects(pending, error => error === reason)
        })
        observation = Promise.allSettled([global, aborted])
      })
      return async () => {
        stop()
        assert.equal(hostWasReady, false, 'first catalog change occurs before the policy Host is ready')
        const [global, aborted] = await observation
        if (global.status === 'rejected') throw global.reason
        if (aborted.status === 'rejected') throw aborted.reason
        assert.deepEqual(global.value.map(skill => skill.name), [unrelated.name], 'startup lookup without an Agent preserves only unrelated Skills')
      }
    }
    if (scenario === 'install') {
      assert.equal((await pluginRow()), undefined)
      assert.equal(await skillMounted(), false)
      const startupLookup = watchStartupLookup()
      const result = await ctx.pluginManager.installBundle(tarball, { requestId: 'normal-install' })
      assert.equal(result.packageResult?.exitCode, 0, JSON.stringify(result))
      assert.equal(result.application, 'applied', JSON.stringify(result))
      assert.equal(result.bundle, pluginName)
      assert.equal(result.version, expectedVersion, 'manager must install the exact package version under test')
      const installed = (await ctx.pluginManager.listBundles()).find(bundle => bundle.name === pluginName)
      assert.equal(installed.installed, true)
      assert.equal(installed.enabled, true)
      assert.equal(profileRequire(pluginName + '/package.json').version, expectedVersion)
      await packageMetadata(ctx, true)
      assert.equal((await pluginRow()).patchId, 'dsh-mattpocock-skills')
      assert.equal(await skillMounted(), true)
      await startupLookup()
      assert.equal(entry('webserver')?.disabled, true, 'manager recomposition must retain the no-listen overlay')
      assert.equal(token(ctx.subagents), initial, 'manager install must not replace the stock provider')
      assert.equal(entry('subagent').fiber.uid, uid)
      assert.throws(() => profileRequire.resolve(pluginName + '/native-subagent'), /Package subpath|ERR_PACKAGE_PATH_NOT_EXPORTED/)
      return { installedByManager: true, stockRetained: true, realDefaultWebComposition: true, skillsMounted: true, noCompatRow: true }
    }
    assert.equal((await ctx.pluginManager.listBundles()).find(bundle => bundle.name === pluginName)?.enabled, scenario !== 'stock-next')
    if (scenario === 'disable-bundle') {
      const disabled = await ctx.pluginManager.setBundleEnabled(pluginName, false)
      assert.equal(disabled.application, 'applied', JSON.stringify(disabled))
      assert.equal((await ctx.pluginManager.listBundles()).find(bundle => bundle.name === pluginName).enabled, false)
      await ctx.fiber.await()
      for (let attempt = 0; attempt < 100 && await skillMounted(); attempt++) await new Promise(resolve => setTimeout(resolve, 20))
      assert.equal(await skillMounted(), false)
      assert.equal(token(ctx.subagents), initial, 'bundle disable keeps the live stock provider')
      assert.equal(entry('subagent').fiber.uid, uid)
      return { persistedDisabled: true }
    }
    if (scenario === 'stock-next') {
      assert.equal(await skillMounted(), false)
      const startupLookup = watchStartupLookup()
      const enabled = await ctx.pluginManager.setBundleEnabled(pluginName, true)
      assert.equal(enabled.application, 'applied', JSON.stringify(enabled))
      assert.equal(await skillMounted(), true)
      await startupLookup()
      assert.equal(token(ctx.subagents), initial, 'live reenable must not replace the already active stock provider')
      assert.equal(entry('subagent').fiber.uid, uid)
      await packageMetadata(ctx, true)
      return { nextBootSkillsOff: true, liveReenableSkillsOn: true, stockRetained: true }
    }
    throw new Error('unknown manager scenario ' + scenario)
  } finally {
    if (ctx?.get('loader')) await ctx.fiber.dispose()
    assert.equal(modelCalls, 0)
    assert.match(String(nativeHash), /^[0-9a-f]{64}$/, 'manager worker needs the pinned native entry hash')
    assert.equal(createHash('sha256').update(await readFile(sdkRequire.resolve('@deepseek-ai/dsh-subagent'))).digest('hex'), nativeHash)
  }
}

let scratch, tarball, archiveBinding, profile, expectedVersion
const nativeHash = hostRoot ? await nativeEntrySha256(hostRoot) : undefined
before(async () => {
  if (!hostRoot) { assert(!operatorArchive, 'accepted archive proof requires DSH_CONTROLS_HOST_ROOT'); return }
  assert(isAbsolute(hostRoot))
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
  const manifest = JSON.parse(await readFile(join(repo, 'package.json'), 'utf8'))
  assert.equal(manifest.name, pluginName)
  assert(typeof manifest.version === 'string' && manifest.version, 'package under test must declare its version')
  expectedVersion = manifest.version
  profile = join(scratch, 'canonical-home/profiles/web')
  await mkdir(profile, { recursive: true })
})
after(async () => {
  if (!scratch) return
  assert.equal(dirname(scratch), tmpdir())
  assert(scratch.startsWith(join(tmpdir(), 'dsh-manager-public-proof-')))
  try { await archiveBinding?.assertUnchanged() } finally { await rm(scratch, { recursive: true, force: true }) }
})

async function child(scenario, tar = tarball) {
  assert(isAbsolute(hostRoot), 'manager worker needs an absolute host root')
  const source = [
    "import assert from 'node:assert/strict'", "import { createRequire } from 'node:module'",
    "import { mkdir, readFile, writeFile } from 'node:fs/promises'",
    "import { join, dirname } from 'node:path'", "import { pathToFileURL } from 'node:url'",
    "import { createHash } from 'node:crypto'",
    'const hostRoot = ' + JSON.stringify(hostRoot), 'const pluginName = ' + JSON.stringify(pluginName),
    'const nativeHash = ' + JSON.stringify(nativeHash), 'const expectedVersion = ' + JSON.stringify(expectedVersion),
    packageMetadata.toString(), worker.toString(),
    'console.log("MANAGER_RESULT:" + JSON.stringify(await worker(' + JSON.stringify(scenario) + ', ' + JSON.stringify(tar) + ')))',
  ].join('\n')
  const workerPath = join(scratch, 'worker-' + scenario + '.mjs')
  await writeFile(workerPath, source)
  const { stdout } = await run(process.execPath, [workerPath], {
    cwd: profile, env: { ...process.env, NODE_OPTIONS: '', DSH_HOME: dirname(dirname(profile)), DSH_TELEMETRY_DISABLED: '1' },
    timeout: 120000, maxBuffer: 8 * 1024 * 1024,
  })
  const line = stdout.split('\n').find(line => line.startsWith('MANAGER_RESULT:'))
  assert(line, stdout)
  return JSON.parse(line.slice('MANAGER_RESULT:'.length))
}

test('ordinary PluginManager pnpm install over actual default base/Web composition mounts Skills and keeps the stock subagent', options, async () => {
  assert.deepEqual(await child('install'), { installedByManager: true, stockRetained: true, realDefaultWebComposition: true, skillsMounted: true, noCompatRow: true })
})

test('whole bundle disable persists Skills-off next boot and live reenable keeps stock', options, async () => {
  assert.deepEqual(await child('disable-bundle'), { persistedDisabled: true })
  assert.deepEqual(await child('stock-next'), { nextBootSkillsOff: true, liveReenableSkillsOn: true, stockRetained: true })
})
