import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { createRequire } from 'node:module'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, cp, readdir, readFile, writeFile, symlink, realpath, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, isAbsolute } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { constants as fsConstants } from 'node:fs'
import { open, stat, chmod } from 'node:fs/promises'

// Accepted seam: development tarball + shipped !!js + public Loader/Fiber/native.
// Plain Node resolution only: no hooks, transplanted runtime namespace or SDK writes.
// This bounded public Profile fixture is NOT the complete default Web Profile/GUI.
const hostRoot = process.env.DSH_CONTROLS_HOST_ROOT
const options = { skip: !hostRoot && 'set DSH_CONTROLS_HOST_ROOT for packed canonical public SDK probes' }
const run = promisify(execFile)
const repo = fileURLToPath(new URL('../', import.meta.url))
const origin = Symbol.for('@lmgatex/dsh-mattpocock-skills/compatible-subagent-origin')
const nativeHash = '75b50b1c9452a6aeb10d1c859e3f45b05e062ea1fad6ed3bcd9577f2bc912541'
const pluginName = '@lmgatex/dsh-mattpocock-skills'

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

async function nativeGraph(ctx, load, profile, resumeParent = false) {
  const api = { ...await load('@deepseek-ai/dsh-session'), ...await load('@deepseek-ai/dsh-agent'),
    ...await load('@deepseek-ai/dsh-agent-loop'), ...await load('@deepseek-ai/dsh-session-projection'),
    ...await load('@deepseek-ai/dsh-system-prompt'), ...await load('@deepseek-ai/dsh-tools') }
  const Jsonl = (await load('@deepseek-ai/dsh-session-persistence-jsonl')).default
  const Query = (await load('@deepseek-ai/dsh-session-query-sqlite')).default
  const LocalFs = (await load('@deepseek-ai/dsh-fs-local')).default
  const fsTools = await load('@deepseek-ai/dsh-tool-fs')
  const pathA = join(profile, 'A'), pathB = join(profile, 'B')
  await mkdir(pathA, { recursive: true }); await mkdir(pathB, { recursive: true })
  await writeFile(join(pathA, 'marker.txt'), 'packed A')
  await writeFile(join(pathB, 'marker.txt'), 'packed B')
  new api.SessionStore(ctx); new api.AgentRegistry(ctx); new api.SessionProjectionRegistry(ctx)
  new api.SystemPrompt(ctx, {}); new api.ToolRuntime(ctx, {})
  new Jsonl(ctx, { root: join(profile, 'sessions'), compression: 'none' })
  new Query(ctx, { path: join(profile, 'query.sqlite'), openAt: 'never' })
  new LocalFs(ctx, { cwd: pathA, diffBasisMaxBytes: 10485760 })
  fsTools.apply(ctx, { readLimit: 2000, readMaxLineLength: 10000, readMaxBytes: 100000, readStreamMinSize: 10000000 })
  new api.AgentLoop(ctx, { agents: [], maxParallelToolCalls: { get: () => 10 } })
  let release = Promise.withResolvers()
  const releases = [release]
  ctx.on('agent/pre-step', () => release.promise)
  const handle = resumeParent ? await ctx.agents.resume({ resumeSessionId: 'packed-parent' })
    : await ctx.agents.create({ sessionId: 'packed-parent', meta: { cwd: pathA } })
  const handles = [handle]
  const signal = () => new AbortController().signal
  return { addHandle(item) { handles.push(item) }, pathA, pathB, parent: handle.agent, signal, handle,
    async dispose() { for (const item of releases) item.resolve({ kind: 'reject' }); await ctx.subagents.drainContinuableDescendants(handles.map(item => item.agent)); for (const item of handles) await item.dispose() },
    releaseStep() { release.resolve({ kind: 'reject' }) },
    pauseStep() { release = Promise.withResolvers(); releases.push(release) } }
}

async function worker(scenario) {
  const profile = process.cwd(), pluginRoot = join(profile, 'node_modules', pluginName)
  const anchor = join(dirname(profile), 'install/package.json')
  const sdkRequire = createRequire(anchor), profileRequire = createRequire(join(profile, 'package.json'))
  const load = name => import(pathToFileURL(sdkRequire.resolve(name)).href)
  const sdk = { ...await load('@deepseek-ai/cordis'), ...await load('@deepseek-ai/cordis-plugin-loader'),
    ...await load('@deepseek-ai/cordis-plugin-include'), ...await load('@deepseek-ai/dsh-typert-registry'),
    ...await load('@deepseek-ai/dsh-skill'), native: await load('@deepseek-ai/dsh-subagent') }
  const yaml = await load('js-yaml')
  const patch = yaml.load(await readFile(join(pluginRoot, 'cordis.patch.yml'), 'utf8'), { schema: sdk.entryListSchema })
  const compiled = await import(pathToFileURL(join(pluginRoot, 'lib/compatibility/composition.js')).href)
  assert.deepEqual(patch.slice(0, 2), compiled.createCompatibilityCompositionPatches(), 'compiled and serialized F guards must have exact parity')
  const raw = { maxDepth: { __jsExpr: '2 + 3' }, maxActiveSubagents: 8 }
  const stock = [{ id: 'subagent', name: '@deepseek-ai/dsh-subagent', config: raw, ...(scenario === 'pending-hmr' ? { inject: ['late-provider'] } : {}) }]
  const warnings = []
  const rows = sdk.applyEntryPatches(stock, patch, (...args) => warnings.push(args))
  assert.deepEqual(warnings, [])
  assert.equal(rows.length, 3)
  const actualNative = await realpath(profileRequire.resolve('@deepseek-ai/dsh-subagent'))
  const ownNative = await realpath(createRequire(join(pluginRoot, 'package.json')).resolve('@deepseek-ai/dsh-subagent'))
  const wrapperRequire = createRequire(join(pluginRoot, 'package.json'))
  assert.equal(await realpath(profileRequire.resolve(pluginName + '/native-subagent')),
    await realpath(join(pluginRoot, 'lib/compatibility/native-subagent.js')))
  for (const peer of ['@deepseek-ai/cordis', '@deepseek-ai/cordis-plugin-loader', '@deepseek-ai/dsh-agent',
    '@deepseek-ai/dsh-session', '@deepseek-ai/dsh-agent-loop', '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-typert-protocol', '@deepseek-ai/dsh-scope']) {
    if (scenario === 'shadowed-protocol' && peer === '@deepseek-ai/dsh-typert-protocol' || scenario === 'duplicate-scope-peer' && peer === '@deepseek-ai/dsh-scope') {
      assert.notEqual(await realpath(wrapperRequire.resolve(peer)), await realpath(sdkRequire.resolve(peer)))
      continue
    }
    assert.equal(await realpath(wrapperRequire.resolve(peer)), await realpath(sdkRequire.resolve(peer)), 'packed wrapper host identity ' + peer)
  }
  if (scenario !== 'duplicate-peer') assert.equal(ownNative, actualNative)
  const ctx = new sdk.Context(), logs = []
  ctx.logger.exporter({ export(message) { logs.push({ ...message, args: message.args.map(value => value instanceof Error ? value.stack : value) }) } })
  new sdk.TypertRegistry(ctx)
  new sdk.SkillRegistry(ctx)
  ctx.provide('profileContext', { dir: profile, installAnchor: anchor })
  const loader = new sdk.Loader(ctx, { baseUrl: pathToFileURL(profile + '/').href })
  // Loader installs its scope infrastructure as a public child Fiber. Wait for
  // that startup boundary before constructing Entries, as app boot does.
  await ctx.fiber.await()
  let modelCalls = 0
  ctx.provide('llm', { prepareCall() { modelCalls++; throw new Error('model forbidden') }, stream() { modelCalls++; throw new Error('model forbidden') } })
  const update = async data => { await loader.root.update(data); await loader.await() }
  let graph
  if (scenario === 'native' || scenario === 'cold-process' || scenario === 'asset-fallback' || scenario === 'root-lifetime' || scenario === 'shadowed-protocol' || scenario.startsWith('startup')) graph = await nativeGraph(ctx, load, profile, scenario === 'cold-process')
  try {
    if (scenario === 'active-hmr' || scenario === 'pending-hmr') {
      await update(stock)
      const entry = loader.resolve('subagent'), uid = entry.fiber.uid
      const token = ctx.get('subagents')?.[sdk.symbols.original] ?? ctx.get('subagents')
      assert.equal(entry.fiber.state, scenario === 'pending-hmr' ? 0 : 2)
      for (let n = 0; n < 3; n++) {
        await update(rows)
        assert.equal(loader.resolve('subagent').fiber.uid, uid)
        assert.equal(loader.resolve('mattpocock-native-subagent').fiber, undefined)
        assert.equal(ctx.get('subagents')?.[sdk.symbols.original] ?? ctx.get('subagents'), token)
      }
      if (scenario === 'pending-hmr') {
        ctx.provide('late-provider', {})
        await ctx.fiber.await(); await loader.await()
        assert.equal(loader.resolve('subagent').fiber.state, 2)
        assert.equal(loader.resolve('subagent').fiber.uid, uid)
      }
      assert((ctx.subagents[sdk.symbols.original] ?? ctx.subagents) instanceof sdk.native.default)
      return { retainedStockIdentity: true, pendingPreserved: scenario === 'pending-hmr' }
    }
    await update(rows)
    const service = ctx.get('subagents')
    if (scenario === 'conditional-export') {
      assert.equal(loader.resolve('subagent').disabled, false)
      assert.equal(loader.resolve('subagent').fiber.state, 2)
      assert.equal(loader.resolve('mattpocock-native-subagent').fiber, undefined)
      assert((service[sdk.symbols.original] ?? service) instanceof sdk.native.default)
      return { refusedConditionalMismatch: true }
    }
    if (scenario === 'duplicate-peer') {
      if (scenario === 'duplicate-peer') assert.notEqual(ownNative, actualNative)
      assert.notEqual(service?.[origin], 'native-subagent-0.2.1-alpha.1', 'different wrapper native peer must not permit enhanced wrong-identity graph')
      if (service) assert((service[sdk.symbols.original] ?? service) instanceof sdk.native.default)
      return { refusedWrongPeer: true, ownNative, actualNative }
    }
    assert(service, JSON.stringify(logs))
    if (scenario === 'asset-fallback') {
      assert((service[sdk.symbols.original] ?? service) instanceof sdk.native.default)
      assert.equal(service[origin], undefined)
      assert.equal(service.initialCwdSupported, undefined)
      assert.equal(globalThis[Symbol.for('dsh.packed.forbidden-import')], undefined)
      service.registerProvider({ name: 'ordinary', capabilities: { continuable: true }, async prepareContinuable() { return {} } })
      const started = await service.startContinuable({ provider: 'ordinary', label: 'retained native fallback',
        request: { parent: graph.parent, prompt: [{ type: 'text', text: 'No model' }], maxDepth: 5 }, signal: graph.signal() })
      const child = ctx.agents.get(started.childId)
      assert.equal(child.session.header.cwd, graph.pathA)
      await service.sendMessage(graph.parent, started.childId, [{ type: 'text', text: 'ordinary native send' }], { signal: graph.signal() })
      assert.equal(ctx.agents.get(started.childId), child)
      return { ordinaryRetained: true, refusedInvalidImport: true }
    }
    if (scenario === 'shadowed-protocol') assert.equal(service.initialCwdSupported, true, 'old Profile protocol must not block canonical initial cwd support')
    assert.equal(loader.resolve('subagent').fiber, undefined)
    assert.equal(loader.resolve('mattpocock-native-subagent').fiber.state, 2, JSON.stringify(logs))
    assert.equal(service[origin], 'native-subagent-0.2.1-alpha.1')
    assert.equal(service.resolveMaxDepth(), 5)
    assert.deepEqual(loader.resolve('subagent').options.config, raw)
    assert.equal((await ctx.skills.list()).some(item => item.name === 'tdd'), true)
    const artifactPath = join(pluginRoot, 'compatibility/native-subagent-0.2.1-alpha.1.js')
    const binding = await import(pathToFileURL(join(pluginRoot, 'lib/compatibility/peer-bindings.js')).href)
    const provenance = JSON.parse(await readFile(join(pluginRoot, 'compatibility/native-subagent.provenance.json'), 'utf8'))
    const plan = binding.inspectCanonicalPeerBindings(ctx, actualNative, join(pluginRoot, 'lib/compatibility/native-subagent.js'), artifactPath, anchor)
    const generated = await import(binding.bindCompatibleSubagentSource(await readFile(artifactPath, 'utf8'), provenance.transformation.importBindings, plan))
    assert((service[sdk.symbols.original] ?? service) instanceof generated.default)
    assert.equal(generated.SubagentError, sdk.native.SubagentError)
    assert.equal(generated.SubagentDepthError, sdk.native.SubagentDepthError)
    if (scenario === 'shadowed-protocol') {
      assert.equal(globalThis[Symbol.for('dsh.packed.old-protocol-evaluated')], undefined, 'the bridge must not evaluate the Profile shadow peer')
      const { inspectCompatibilityPreparation } = await import(pathToFileURL(join(pluginRoot, 'lib/compatibility/readiness.js')).href)
      assert.equal((await inspectCompatibilityPreparation(ctx)).status, 'ready')
    }
    if (scenario === 'root-lifetime') {
      const token = value => value?.[sdk.symbols.original] ?? value
      const owner = () => {
        const current = token(ctx.get('subagents'))
        const impl = Reflect.ownKeys(ctx.reflect.store).map(key => ctx.reflect.store[key])
          .find(impl => impl.name === 'subagents' && token(impl.value) === current)
        assert(impl, 'public provider ownership record')
        return impl.fiber
      }
      const initial = token(ctx.subagents), providerFiber = owner(), providerUid = providerFiber.uid
      const stockActivations = []
      ctx.on('internal/status', fiber => {
        if (fiber.runtime?.callback === sdk.native.default && (fiber.state === 1 || fiber.state === 2)) stockActivations.push(fiber.state)
      }, { global: true })
      ctx.subagents.registerProvider({ name: 'root-lifetime', capabilities: { continuable: true }, async prepareContinuable() { return {} } })
      const started = await ctx.subagents.startContinuable({ provider: 'root-lifetime', cwd: graph.pathB,
        label: 'packed root lifetime', request: { parent: graph.parent, prompt: [{ type: 'text', text: 'no model' }], maxDepth: 5 }, signal: graph.signal() })
      const child = ctx.agents.get(started.childId), header = structuredClone(child.session.header)
      for (let n = 0; n < 3; n++) {
        const valid = { maxDepth: { __jsExpr: '3 + 4' }, maxActiveSubagents: 2 }
        await update([{ ...stock[0], config: valid }])
        assert.equal(token(ctx.subagents) === initial, true, 'ordinary Node whole unpatch retains native token')
        assert.equal(owner().uid, providerUid)
        assert.equal(providerFiber.state, 2)
        assert.equal(ctx.subagents.resolveMaxDepth(), 7)
        await update([{ ...stock[0], config: { maxDepth: 9, maxActiveSubagents: 0 } }])
        assert.equal(ctx.subagents.resolveMaxDepth(), 7)
        await ctx.subagents.sendMessage(graph.parent, started.childId, [{ type: 'text', text: 'still same packed native child' }], { signal: graph.signal() })
        assert.equal(ctx.agents.get(started.childId) === child, true)
        assert.deepEqual(child.session.header, header)
        assert.equal(Object.isFrozen(child.session.header), true)
        await update(sdk.applyEntryPatches([{ ...stock[0], config: valid }], patch, assert.fail))
        assert.equal(token(ctx.subagents) === initial, true)
        assert.equal(owner().uid, providerUid)
      }
      assert.deepEqual(stockActivations, [])
      const agents = token(ctx.agents)
      graph.releaseStep()
      await ctx.fiber.dispose(); graph = undefined
      assert.deepEqual(agents.list(), [], 'actual root shutdown drains still-live native parent and child')
      assert.equal(providerFiber.state, 4)
      assert.equal(ctx.get('subagents'), undefined)
      assert.equal(ctx.get('agents'), undefined)
      return { rootLifetimeRetained: true, childPreservedB: true, rootDisposed: true, lastValidRetained: true }
    }
    if (scenario === 'volatile-config') {
      const exactService = service[sdk.symbols.original] ?? service, uid = loader.resolve('mattpocock-native-subagent').fiber.uid
      const setConfig = async config => update(sdk.applyEntryPatches([{ ...stock[0], config }], patch, assert.fail))
      await setConfig({ maxDepth: 7, maxActiveSubagents: { __jsExpr: '1 + 2' } })
      assert.equal(ctx.subagents.resolveMaxDepth(), 7)
      await setConfig({ maxDepth: 9, maxActiveSubagents: 0 })
      assert.equal(ctx.subagents.resolveMaxDepth(), 7)
      assert.deepEqual(loader.resolve('subagent').options.config, { maxDepth: 9, maxActiveSubagents: 0 })
      await setConfig({ maxDepth: { __jsExpr: '(() => { throw new Error("bad operator") })()' }, maxActiveSubagents: 3 })
      assert.equal(ctx.subagents.resolveMaxDepth(), 7)
      await setConfig({ maxDepth: 0, maxActiveSubagents: 3 })
      assert.equal(ctx.subagents.resolveMaxDepth(), 0)
      assert.equal(ctx.subagents[sdk.symbols.original] ?? ctx.subagents, exactService)
      assert.equal(loader.resolve('mattpocock-native-subagent').fiber.uid, uid)
      return { retainedVolatileIdentity: true, lastValidRetained: true }
    }
    if (scenario.startsWith('startup')) {
      const fromPack = relative => import(pathToFileURL(join(pluginRoot, 'lib', relative)).href)
      const { StartupSupport } = await fromPack('controls/startup-support.js')
      const { parseStartupDocument } = await fromPack('controls/startup-state.js')
      const { MemoryVersionedStorage } = await fromPack('controls/versioned-storage.js')
      const { INITIAL_POLICY } = await fromPack('controls/policy.js')
      const { inspectCompatibilityPreparation } = await fromPack('compatibility/readiness.js')
      assert.equal(INITIAL_POLICY.extensionEnabled, false, 'management remains off')
      const persisted = scenario === 'startup-next' ? JSON.parse(await readFile(join(profile, 'startup-request.json'), 'utf8')) : undefined
      const storage = new MemoryVersionedStorage(parseStartupDocument, persisted)
      const beforeToken = ctx.subagents[sdk.symbols.original] ?? ctx.subagents
      const observe = async () => ({ nativeInitialCwdSupported: ctx.subagents.initialCwdSupported, preparation: await inspectCompatibilityPreparation(ctx) })
      const startup = new StartupSupport(storage, { epoch: scenario }, observe)
      const status = await startup.readStatus()
      assert.equal(status.preparation.status, 'ready')
      if (scenario === 'startup-next') {
        assert.equal(status.boot.requested.startupCwdEnabled, true)
        assert.equal(status.enabledNow, true)
        assert.equal(status.restartNeeded, false)
      } else {
        assert.equal(status.desired.startupCwdEnabled, false)
        assert.equal(status.enabledNow, false)
        const saved = await startup.save({ startupCwdEnabled: true }, status.revision)
        assert.equal(saved.boot.requested.startupCwdEnabled, false)
        assert.equal(saved.desired.startupCwdEnabled, true)
        assert.equal(saved.enabledNow, false)
        assert.equal(saved.restartNeeded, true)
        await writeFile(join(profile, 'startup-request.json'), JSON.stringify(await storage.read()))
      }
      assert.equal(INITIAL_POLICY.extensionEnabled, false)
      assert.equal(ctx.subagents[sdk.symbols.original] ?? ctx.subagents, beforeToken)
      assert.deepEqual(loader.resolve('subagent').options.config, raw)
      return { enhanced: true, startupIndependent: true, managementOff: true, nextBoot: scenario === 'startup-next' }
    }
    if (graph) {
      assert.equal(ctx.subagents.initialCwdSupported, true)
      const { pathA, pathB, parent, signal } = graph
      if (scenario === 'cold-process') {
        const persisted = JSON.parse(await readFile(join(profile, 'expected-child.json'), 'utf8'))
        assert.equal(ctx.agents.get(persisted.childId), undefined)
        await ctx.subagents.sendMessage(parent, persisted.childId, [{ type: 'text', text: 'cold process resume' }], { signal: signal() })
        const resumed = ctx.agents.get(persisted.childId)
        assert(resumed)
        assert.deepEqual(resumed.session.header, persisted.header)
        assert.equal(resumed.session.header.cwd, pathB)
        assert.equal(Object.isFrozen(resumed.session.header), true)
        return { enhanced: true, coldProcessResumed: true, frozenB: true }
      }
      let preparations = 0
      const unregister = ctx.subagents.registerProvider({ name: 'controlled', capabilities: { continuable: true },
        async prepareContinuable() { preparations++; return {} } })
      const start = (cwd, extra = {}) => ctx.subagents.startContinuable({ provider: 'controlled', label: 'packed native public probe',
        ...(cwd === undefined ? {} : { cwd }), request: { parent, prompt: [{ type: 'text', text: 'No model' }], maxDepth: 5 }, signal: signal(), ...extra })
      const a = await start(pathA), b = await start(pathB, { childId: 'packed-cold-child' }), inherited = await start(undefined)
      const read = id => ctx.tools.execute({ callId: 'read-' + id, name: 'read', arguments: { file_path: 'marker.txt' }, agent: ctx.agents.get(id), signal: signal() })
      assert.equal((await read(a.childId)).value.lines[0].text, 'packed A')
      assert.equal((await read(b.childId)).value.lines[0].text, 'packed B')
      const child = ctx.agents.get(b.childId), header = structuredClone(child.session.header)
      assert.equal(header.cwd, pathB); assert(Object.isFrozen(child.session.header))
      assert.equal((await ctx.sessionPersistence.stat(b.childId)).header.cwd, pathB)
      assert.equal(ctx.agents.get(inherited.childId).session.header.cwd, pathA)
      await ctx.subagents.sendMessage(parent, b.childId, [{ type: 'text', text: 'same child' }], { signal: signal() })
      assert.equal(ctx.agents.get(b.childId), child)
      assert.equal(preparations, 3)
      await assert.rejects(start('relative'), /start cwd must be an absolute path/)
      await assert.rejects(ctx.subagents.start('missing', { prompt: [], signal: signal() }), error => error instanceof sdk.native.SubagentError)
      const spawn = await load('@deepseek-ai/dsh-subagent-spawn-in-process'), fork = await load('@deepseek-ai/dsh-subagent-fork-in-process')
      spawn.apply(ctx, { providerName: 'native-spawn' }); fork.apply(ctx, { providerName: 'native-fork' })
      // Isolate the seeded-history fixture from the primary parent's native
      // notification/inbox turns. This new root has no active turn or children.
      const forkHandle = await ctx.agents.create({ sessionId: 'packed-fork-parent', meta: { cwd: pathA } })
      graph.addHandle(forkHandle)
      forkHandle.agent.session.append('turn/start', { turn: 1 })
      forkHandle.agent.session.append('turn/end', { turn: 1, kind: 'completed' })
      const seed = forkHandle.agent.session.snapshotEvents()
      const spawned = await start(pathB, { provider: 'native-spawn' })
      const forked = await start(pathB, { provider: 'native-fork', request: { parent: forkHandle.agent,
        prompt: [{ type: 'text', text: 'seeded public fixture' }], maxDepth: 5 } })
      const fresh = ctx.agents.get(spawned.childId).session, seeded = ctx.agents.get(forked.childId).session
      assert.equal(fresh.header.cwd, pathB); assert.equal(fresh.header.isSeeded, false); assert.equal(fresh.inheritedEventCount, 0)
      assert.equal(seeded.header.cwd, pathB); assert.equal(seeded.header.isSeeded, true); assert.equal(seeded.inheritedEventCount, seed.length)
      assert.deepEqual(seeded.snapshotEvents().slice(0, seed.length), seed)
      graph.releaseStep()
      await ctx.subagents.drainContinuableChildren(parent, [b.childId])
      assert.equal(ctx.agents.get(b.childId), undefined)
      unregister(); graph.pauseStep()
      await ctx.subagents.sendMessage(parent, b.childId, [{ type: 'text', text: 'cold same process' }], { signal: signal() })
      const resumed = ctx.agents.get(b.childId)
      assert.notEqual(resumed, child); assert.deepEqual(resumed.session.header, header); assert.equal(preparations, 3)
      await writeFile(join(profile, 'expected-child.json'), JSON.stringify({ childId: b.childId, header }))
      return { enhanced: true, frozenB: true, sameSendIdentity: true, spawnFork: true, coldResume: true, preparations, zeroModel: true }
    }
    return { enhanced: true, rawConfigRetained: true, singleCanonicalNative: true, skillsMounted: true }
  } finally {
    if (graph) await graph.dispose()
    if (ctx.fiber.state !== 4) { await update([]); await ctx.fiber.dispose() }
    assert.equal(modelCalls, 0)
    assert.equal(createHash('sha256').update(await readFile(actualNative)).digest('hex'), nativeHash)
  }
}

if (process.argv[2] === '--packed-worker') {
  console.log(JSON.stringify(await worker(process.argv[3])))
} else {
  let packRoot, tarball, archiveBinding
  before(async () => {
    if (!hostRoot) { assert(!operatorArchive, 'accepted archive proof requires DSH_CONTROLS_HOST_ROOT'); return }
    assert(isAbsolute(hostRoot))
    packRoot = await mkdtemp(join(tmpdir(), 'dsh-packed-native-'))
    await chmod(packRoot, 0o700)
    if (operatorArchive) {
      archiveBinding = await operatorArchiveSnapshot(operatorArchive, packRoot)
      tarball = archiveBinding.path
    } else {
      await run('pnpm', ['pack', '--pack-destination', packRoot], { cwd: repo, timeout: 60000, maxBuffer: 4 * 1024 * 1024 })
      const packed = (await readdir(packRoot)).filter(name => name.endsWith('.tgz'))
      assert.equal(packed.length, 1)
      tarball = join(packRoot, packed[0])
    }
  })
  after(async () => {
    try { await archiveBinding?.assertUnchanged() } finally {
      if (packRoot) { assert.equal(dirname(packRoot), tmpdir()); assert(packRoot.startsWith(join(tmpdir(), 'dsh-packed-native-'))); await rm(packRoot, { recursive: true, force: true }) }
    }
  })
  async function fixture(t, { duplicatePeer = false, duplicateScopePeer = false, shadowedProtocol = false, corruptAsset = false, conditionalExport = false } = {}) {
    const temp = await mkdtemp(join(tmpdir(), 'dsh-plain-profile-'))
    t.after(() => rm(temp, { recursive: true, force: true }))
    const profile = join(temp, 'profile'), install = join(temp, 'install')
    const pluginRoot = join(profile, 'node_modules', pluginName)
    await mkdir(join(profile, 'node_modules/@lmgatex'), { recursive: true })
    await mkdir(install)
    await writeFile(join(profile, 'package.json'), JSON.stringify({ name: 'bounded-public-profile', type: 'module' }))
    await cp(join(hostRoot, 'package.json'), join(install, 'package.json'))
    await symlink(join(hostRoot, 'node_modules'), join(install, 'node_modules'))
    for (const name of await readdir(join(hostRoot, 'node_modules'))) {
      if (name !== '@lmgatex') await symlink(join(hostRoot, 'node_modules', name), join(profile, 'node_modules', name))
    }
    await run('tar', ['-xzf', tarball, '-C', join(profile, 'node_modules/@lmgatex')])
    assert.equal(dirname(pluginRoot), join(profile, 'node_modules/@lmgatex'))
    await rename(join(profile, 'node_modules/@lmgatex/package'), pluginRoot)
    if (duplicatePeer) {
      await mkdir(join(pluginRoot, 'node_modules/@deepseek-ai'), { recursive: true })
      await cp(join(hostRoot, 'node_modules/@deepseek-ai/dsh-subagent'), join(pluginRoot, 'node_modules/@deepseek-ai/dsh-subagent'), { recursive: true, dereference: true })
    }
    if (duplicateScopePeer) {
      await mkdir(join(pluginRoot, 'node_modules/@deepseek-ai'), { recursive: true })
      await cp(join(hostRoot, 'node_modules/@deepseek-ai/dsh-scope'), join(pluginRoot, 'node_modules/@deepseek-ai/dsh-scope'), { recursive: true, dereference: true })
    }
    if (shadowedProtocol) {
      const peerRoot = join(pluginRoot, 'node_modules/@deepseek-ai/dsh-typert-protocol')
      await mkdir(join(peerRoot, 'lib'), { recursive: true })
      await writeFile(join(peerRoot, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-typert-protocol', version: '0.1.0-rc.6', type: 'module', exports: { '.': './lib/index.js', './package.json': './package.json' } }))
      await writeFile(join(peerRoot, 'lib/index.js'), 'globalThis[Symbol.for("dsh.packed.old-protocol-evaluated")] = true; throw new Error("fixture-only old Profile protocol must not be evaluated by the bridge");')
    }
    if (conditionalExport) {
      const filename = join(pluginRoot, 'package.json')
      const manifest = JSON.parse(await readFile(filename, 'utf8'))
      manifest.exports['./native-subagent'] = {
        import: './lib/compatibility/readiness.js', require: './lib/compatibility/native-subagent.js',
        default: './lib/compatibility/native-subagent.js',
      }
      await writeFile(filename, JSON.stringify(manifest))
    }
    if (corruptAsset) await writeFile(join(pluginRoot, 'compatibility/native-subagent-0.2.1-alpha.1.js'),
      'globalThis[Symbol.for("dsh.packed.forbidden-import")] = true; export default class Bad {}')
    return { profile, pluginRoot, async probe(scenario) {
      const result = await run(process.execPath, [fileURLToPath(import.meta.url), '--packed-worker', scenario], {
        cwd: profile, env: { ...process.env, DSH_CONTROLS_HOST_ROOT: hostRoot, NODE_OPTIONS: '' }, timeout: 20000, maxBuffer: 4 * 1024 * 1024 })
      return JSON.parse(result.stdout.trim().split(String.fromCharCode(10)).at(-1))
    } }
  }
  test('operator archive input fails closed unless absolute path and complete SHA-256 are paired', () => {
    assert.equal(operatorArchiveInput({}), undefined)
    assert.throws(() => operatorArchiveInput({ DSH_CONTROLS_TARBALL: '/artifact.tgz' }), /both be supplied/)
    assert.throws(() => operatorArchiveInput({ DSH_CONTROLS_TARBALL_SHA256: 'a'.repeat(64) }), /both be supplied/)
    assert.throws(() => operatorArchiveInput({ DSH_CONTROLS_TARBALL: 'relative.tgz', DSH_CONTROLS_TARBALL_SHA256: 'a'.repeat(64) }), /absolute/)
    assert.throws(() => operatorArchiveInput({ DSH_CONTROLS_TARBALL: '/artifact.tgz', DSH_CONTROLS_TARBALL_SHA256: 'not-a-checksum' }), /complete SHA-256/)
  })
  test('operator archive snapshot verifies read-only original and copied bytes without touching caller ownership', async t => {
    const owned = await mkdtemp(join(tmpdir(), 'dsh-archive-input-test-'))
    t.after(() => rm(owned, { recursive: true, force: true }))
    await chmod(owned, 0o700)
    const source = join(owned, 'caller.tgz'), snapshotRoot = join(owned, 'snapshot')
    await mkdir(snapshotRoot, { mode: 0o700 })
    const bytes = Buffer.from('operator-only snapshot fixture, not an installable artifact')
    await writeFile(source, bytes, { mode: 0o400 })
    const input = { path: source, checksum: createHash('sha256').update(bytes).digest('hex') }
    const snapshot = await operatorArchiveSnapshot(input, snapshotRoot)
    assert.deepEqual(await readFile(snapshot.path), bytes)
    assert.notEqual(snapshot.path, source)
    assert.equal((await stat(snapshot.path)).mode & 0o777, 0o400)
    await snapshot.assertUnchanged()
    assert.deepEqual(await readFile(source), bytes)
    await chmod(source, 0o600)
    await assert.rejects(operatorArchiveSnapshot(input, snapshotRoot), /already be read-only/)
    await chmod(source, 0o400)
    await assert.rejects(operatorArchiveSnapshot({ ...input, checksum: '0'.repeat(64) }, snapshotRoot), /checksum mismatch/)
    await assert.rejects(operatorArchiveSnapshot({ ...input, path: join(owned, 'missing.tgz') }, snapshotRoot), error => error.code === 'ENOENT')
  })
  for (const scenario of ['active-hmr', 'pending-hmr']) test('packed public Profile first install and repeated ' + scenario + ' retain native Fiber identity', options, async t => {
    const f = await fixture(t)
    assert.equal((await f.probe(scenario)).retainedStockIdentity, true)
  })
  test('fresh ordinary Node process packed native create read frozen JSONL spawn/fork hot/cold send matrix then next process cold resumes B', options, async t => {
    const f = await fixture(t)
    const first = await f.probe('native')
    assert.equal(first.frozenB, true); assert.equal(first.spawnFork, true); assert.equal(first.coldResume, true); assert.equal(first.zeroModel, true)
    const cold = await f.probe('cold-process')
    assert.equal(cold.coldProcessResumed, true); assert.equal(cold.frozenB, true)
  })
  test('packed StartupSupport save affects next process request without management activation or native remount', options, async t => {
    const f = await fixture(t)
    assert.equal((await f.probe('startup')).startupIndependent, true)
    const next = await f.probe('startup-next')
    assert.equal(next.nextBoot, true); assert.equal(next.managementOff, true)
  })
  test('packed original numeric and !!js volatile edits retain raw rows and last valid limits without native remount', options, async t => {
    const f = await fixture(t)
    const result = await f.probe('volatile-config')
    assert.equal(result.retainedVolatileIdentity, true); assert.equal(result.lastValidRetained, true)
  })
  test('packed public root lifetime survives whole unpatch and disposes with actual root', options, async t => {
    const f = await fixture(t)
    assert.deepEqual(await f.probe('root-lifetime'), { rootLifetimeRetained: true, childPreservedB: true, rootDisposed: true, lastValidRetained: true })
  })
  test('packed own asset integrity failure does not execute invalid image and retains real ordinary native create/send', options, async t => {
    const f = await fixture(t, { corruptAsset: true })
    const result = await f.probe('asset-fallback')
    assert.equal(result.ordinaryRetained, true); assert.equal(result.refusedInvalidImport, true)
  })
  test('packed old Profile protocol shadow preserves native identity and supports actual first cwd and continuation', options, async t => {
    const f = await fixture(t, { shadowedProtocol: true })
    const result = await f.probe('shadowed-protocol')
    assert.equal(result.enhanced, true)
    assert.equal(result.frozenB, true)
    assert.equal(result.sameSendIdentity, true)
    assert.equal(result.spawnFork, true)
    assert.equal(result.coldResume, true)
    assert.equal(result.zeroModel, true)
  })
  test('packed serialized selector refuses enhanced graph when wrapper resolves a duplicate pristine native peer', options, async t => {
    const f = await fixture(t, { duplicatePeer: true })
    assert.equal((await f.probe('duplicate-peer')).refusedWrongPeer, true)
  })
  test('packed scope shadow is bypassed only by binding actual canonical native scope identity', options, async t => {
    const f = await fixture(t, { duplicateScopePeer: true })
    const result = await f.probe('duplicate-scope-peer')
    assert.equal(result.enhanced, true)
    assert.equal(result.singleCanonicalNative, true)
  })
  test('packed public conditional export mismatch stays on stock before ordinary Node imports its alternate ESM target', options, async t => {
    const f = await fixture(t, { conditionalExport: true })
    assert.equal((await f.probe('conditional-export')).refusedConditionalMismatch, true)
  })
  test('development pnpm pack resolves genuine exported wrapper and shipped YAML in fresh ordinary Node public Profile', options, async t => {
    const f = await fixture(t)
    const result = await f.probe('fresh')
    assert.equal(result.enhanced, true)
    assert.equal(result.singleCanonicalNative, true)
    assert.equal(result.rawConfigRetained, true)
    assert.equal(result.skillsMounted, true)
  })
}
