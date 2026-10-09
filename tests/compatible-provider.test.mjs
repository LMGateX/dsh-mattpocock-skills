import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { createHash } from 'node:crypto'
import { createRequire, registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'
import { mkdtemp, mkdir, writeFile, readFile, cp, rm, symlink, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, isAbsolute } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import { openCompatHostView } from './fixtures/compat-host.mjs'

// Accepted seams: real public Loader/Fiber and native startContinuable/sendMessage.
// Only disposable packages are written; canonical SDK peers are read-only.
// The generated bridge is released 0.2.1-alpha.1 evidence.
const compatRoot = process.env.DSH_CONTROLS_COMPAT_HOST_ROOT
const options = { skip: !compatRoot && 'set DSH_CONTROLS_COMPAT_HOST_ROOT for canonical 0.2.1-alpha.1 public SDK probes' }
const hostRoot = compatRoot ? await openCompatHostView(compatRoot) : undefined
let sdk, composition, hostLoad
let wrapperUrl
const importedAssets = new Set()
if (hostRoot) {
  assert(isAbsolute(hostRoot))
  const require = createRequire(join(hostRoot, 'package.json'))
  const load = hostLoad = name => import(pathToFileURL(require.resolve(name)).href)
  registerHooks({
    resolve(specifier, context, next) {
      if (context.parentURL?.includes('/src/compatibility/') && specifier === './peer-bindings.js') specifier = './peer-bindings.ts'
      return next(specifier, context)
    },
    load(url, context, next) {
      if (url.endsWith('/compatibility/native-subagent-0.2.1-alpha.1.js')) importedAssets.add(url)
      if (url.endsWith('/src/compatibility/composition.ts') || url.endsWith('/src/compatibility/peer-bindings.ts')) return { format: 'module', shortCircuit: true,
        source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText }
      return next(url, context)
    },
  })
  sdk = { ...await load('@deepseek-ai/cordis'), ...await load('@deepseek-ai/cordis-plugin-loader'),
    ...await load('@deepseek-ai/cordis-plugin-include'), ...await load('@deepseek-ai/dsh-typert-registry'),
    native: await load('@deepseek-ai/dsh-subagent') }
  composition = await import('../src/compatibility/composition.ts')
  const nativeFile = require.resolve('@deepseek-ai/dsh-subagent')
  const sdkHash = () => createHash('sha256').update(readFileSync(nativeFile)).digest('hex')
  assert.equal(sdkHash(), '75b50b1c9452a6aeb10d1c859e3f45b05e062ea1fad6ed3bcd9577f2bc912541')
  after(() => assert.equal(sdkHash(), '75b50b1c9452a6aeb10d1c859e3f45b05e062ea1fad6ed3bcd9577f2bc912541', 'canonical SDK entry remains pristine'))
}
const origin = Symbol.for('@lmgatex/dsh-mattpocock-skills/compatible-subagent-origin')
const token = service => service[sdk.symbols.original] ?? service
// ReflectService.store and Impl.fiber/value are explicit public pinned SDK API.
// Do not cross the protected Service.ctx boundary to infer provider ownership.
const providerOwner = ctx => {
  const service = token(ctx.get('subagents'))
  const owner = Reflect.ownKeys(ctx.reflect.store).map(key => ctx.reflect.store[key])
    .find(impl => impl.name === 'subagents' && token(impl.value) === service)
  assert(owner, 'public implementation record identifies actual native provider owner')
  return owner.fiber
}
const base = config => [{ id: 'subagent', name: '@deepseek-ai/dsh-subagent', config }]
const compose = (config = { maxDepth: 3, maxActiveSubagents: 2 }) => sdk.applyEntryPatches(base(config), composition.createCompatibilityCompositionPatches(), assert.fail)

async function fixture(t, { damage } = {}) {
  const temp = await mkdtemp(join(tmpdir(), 'dsh-compatible-provider-'))
  const cleanups = []
  await mkdir(join(temp, 'lib/compatibility'), { recursive: true })
  await mkdir(join(temp, 'compatibility'))
  await writeFile(join(temp, 'package.json'), JSON.stringify({ type: 'module', name: '@lmgatex/dsh-mattpocock-skills',
    exports: { './native-subagent': { default: './lib/compatibility/native-subagent.js' }, './package.json': './package.json' } }))
  // Real Node self-package exports and canonical read-only peer links satisfy
  // public CJS admission. No import hook invents this package identity/proof.
  await symlink(join(hostRoot, 'node_modules'), join(temp, 'node_modules'))
  const source = await readFile(new URL('../src/compatibility/native-subagent.ts', import.meta.url), 'utf8')
  await writeFile(join(temp, 'lib/compatibility/native-subagent.js'), ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText)
  const bindings = await readFile(new URL('../src/compatibility/peer-bindings.ts', import.meta.url), 'utf8')
  await writeFile(join(temp, 'lib/compatibility/peer-bindings.js'), ts.transpileModule(bindings, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText)
  for (const name of ['native-subagent-0.2.1-alpha.1.js', 'native-subagent.provenance.json']) await cp(new URL('../compatibility/' + name, import.meta.url), join(temp, 'compatibility', name))
  if (damage) await damage(temp)
  wrapperUrl = pathToFileURL(join(temp, 'lib/compatibility/native-subagent.js')).href
  const ctx = new sdk.Context()
  const logs = []
  ctx.logger.exporter({ export(message) { logs.push(message) } })
  new sdk.TypertRegistry(ctx)
  ctx.provide('profileContext', { dir: temp, installAnchor: join(hostRoot, 'package.json') })
  const loader = new sdk.Loader(ctx, { baseUrl: pathToFileURL(temp + '/').href })
  await ctx.fiber.await()
  const nativeRequire = createRequire(join(hostRoot, 'package.json')), ownRequire = createRequire(join(temp, 'package.json'))
  const artifactRequire = createRequire(join(temp, 'compatibility/native-subagent-0.2.1-alpha.1.js'))
  assert.equal(await realpath(ownRequire.resolve('@lmgatex/dsh-mattpocock-skills/native-subagent')), await realpath(join(temp, 'lib/compatibility/native-subagent.js')))
  for (const peer of ['@deepseek-ai/dsh-subagent', '@deepseek-ai/schemastery', '@deepseek-ai/dsh-scope',
    '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-util-time', '@deepseek-ai/dsh-typert-protocol',
    '@deepseek-ai/dsh-attachment', 'zod', '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-agent',
    '@deepseek-ai/dsh-session', '@deepseek-ai/dsh-brand', '@deepseek-ai/dsh-util-values', '@deepseek-ai/dsh-chunked-list',
    '@deepseek-ai/cordis', '@deepseek-ai/cordis-plugin-loader']) {
    assert.equal(await realpath(ownRequire.resolve(peer)), await realpath(nativeRequire.resolve(peer)))
    assert.equal(await realpath(ownRequire.resolve(peer + '/package.json')), await realpath(nativeRequire.resolve(peer + '/package.json')))
    assert.equal(await realpath(artifactRequire.resolve(peer)), await realpath(nativeRequire.resolve(peer)))
    assert.equal(await realpath(artifactRequire.resolve(peer + '/package.json')), await realpath(nativeRequire.resolve(peer + '/package.json')))
  }
  let modelCalls = 0
  ctx.provide('llm', { prepareCall() { modelCalls++; throw new Error('model forbidden') }, stream() { modelCalls++; throw new Error('model forbidden') } })
  t.after(async () => { for (const cleanup of cleanups.reverse()) await cleanup(); if (ctx.fiber.state !== 4) { await loader.root.update([]); await loader.await(); await ctx.fiber.dispose() } assert.equal(modelCalls, 0); await rm(temp, { recursive: true, force: true }) })
  return { ctx, loader, logs, temp, cleanups, async update(rows) { await loader.root.update(rows); await loader.await() } }
}

async function nativeFixture(t, fixtureOptions) {
  const f = await fixture(t, fixtureOptions)
  const api = { ...await hostLoad('@deepseek-ai/dsh-session'), ...await hostLoad('@deepseek-ai/dsh-agent'),
    ...await hostLoad('@deepseek-ai/dsh-agent-loop'), ...await hostLoad('@deepseek-ai/dsh-session-projection'),
    ...await hostLoad('@deepseek-ai/dsh-system-prompt'), ...await hostLoad('@deepseek-ai/dsh-tools') }
  const Jsonl = (await hostLoad('@deepseek-ai/dsh-session-persistence-jsonl')).default
  const Query = (await hostLoad('@deepseek-ai/dsh-session-query-sqlite')).default
  const LocalFs = (await hostLoad('@deepseek-ai/dsh-fs-local')).default
  const fsTools = await hostLoad('@deepseek-ai/dsh-tool-fs')
  const pathA = await mkdir(join(f.temp, 'A'), { recursive: true })
  const pathB = await mkdir(join(f.temp, 'B'), { recursive: true })
  await writeFile(join(pathA, 'marker.txt'), 'A through actual wrapper')
  await writeFile(join(pathB, 'marker.txt'), 'B through actual wrapper')
  new api.SessionStore(f.ctx)
  new api.AgentRegistry(f.ctx)
  new api.SessionProjectionRegistry(f.ctx)
  new api.SystemPrompt(f.ctx, {})
  new api.ToolRuntime(f.ctx, {})
  new Jsonl(f.ctx, { root: join(f.temp, 'sessions'), compression: 'none' })
  new Query(f.ctx, { path: join(f.temp, 'query.sqlite'), openAt: 'never' })
  new LocalFs(f.ctx, { cwd: pathA, diffBasisMaxBytes: 10485760 })
  fsTools.apply(f.ctx, { readLimit: 2000, readMaxLineLength: 10000, readMaxBytes: 100000, readStreamMinSize: 10000000 })
  new api.AgentLoop(f.ctx, { agents: [], maxParallelToolCalls: { get: () => 10 } })
  const release = Promise.withResolvers()
  f.ctx.on('agent/pre-step', () => release.promise)
  let preparations = 0
  f.ctx.provide('capacityCandidate', 2)
  await f.update(compose({ maxDepth: 5, maxActiveSubagents: { __jsExpr: 'ctx.capacityCandidate' } }))
  f.ctx.subagents.registerProvider({ name: 'controlled', capabilities: { continuable: true }, async prepareContinuable() { preparations++; return {} } })
  const handle = await f.ctx.agents.create({ sessionId: 'parent', meta: { cwd: pathA } })
  f.cleanups.push(async () => { release.resolve({ kind: 'reject' }); if (f.ctx.get('subagents')) await f.ctx.subagents.drainContinuableDescendants([handle.agent]); await handle.dispose() })
  const signal = () => new AbortController().signal
  const start = cwd => f.ctx.subagents.startContinuable({ provider: 'controlled', cwd,
    label: 'wrapper integration', request: { parent: handle.agent, prompt: [{ type: 'text', text: 'No model' }], maxDepth: f.ctx.subagents.resolveMaxDepth() }, signal: signal() })
  return { ...f, parent: handle.agent, pathA, pathB, start, signal, releaseStep() { release.resolve({ kind: 'reject' }) }, preparations: () => preparations }
}

test('actual generatedCtor mode integration preserves A/B header and send identity while enforcing original capacity and last-valid updates', options, async t => {
  const f = await nativeFixture(t)
  const service = token(f.ctx.subagents)
  assert.equal(f.ctx.subagents.initialCwdSupported, true)
  const a = await f.start(f.pathA), b = await f.start(f.pathB)
  await assert.rejects(f.start(f.pathB), error => error instanceof sdk.native.SubagentError && /active child limit: 2/i.test(error.message))
  const child = f.ctx.agents.get(b.childId)
  const header = structuredClone(child.session.header)
  assert.equal(header.cwd, f.pathB)
  const result = await f.ctx.tools.execute({ callId: 'wrapper-read', name: 'read', arguments: { file_path: 'marker.txt' }, agent: child, signal: f.signal() })
  assert.equal(result.value.lines[0].text, 'B through actual wrapper')
  const beforeSend = f.preparations()
  await f.ctx.subagents.sendMessage(f.parent, b.childId, [{ type: 'text', text: 'same child' }], { signal: f.signal() })
  assert.equal(f.ctx.agents.get(b.childId), child)
  assert.deepEqual(child.session.header, header)
  assert.equal(f.preparations(), beforeSend)
  await f.update(compose({ maxDepth: 7, maxActiveSubagents: 0 }))
  assert.equal(f.ctx.subagents.resolveMaxDepth(), 5, 'invalid capacity cannot partially update depth')
  await assert.rejects(f.start(f.pathB), /active child limit: 2/i)
  await f.update(compose({ maxDepth: 7, maxActiveSubagents: { __jsExpr: '1 + 2' } }))
  const c = await f.start(f.pathB)
  assert(c.childId)
  assert.equal(f.ctx.subagents.resolveMaxDepth(), 7)
  assert.equal(token(f.ctx.subagents), service)
  assert.equal(f.ctx.agents.get(a.childId).session.header.cwd, f.pathA)
})

test('public root provider lifetime survives repeated whole-layer removal with native children and dynamic whole-schema limits', options, async t => {
  const f = await nativeFixture(t)
  const service = token(f.ctx.subagents), providerFiber = providerOwner(f.ctx), providerUid = providerFiber.uid
  const stockActivations = []
  f.ctx.on('internal/status', fiber => {
    if (fiber.runtime?.callback === sdk.native.default && (fiber.state === 1 || fiber.state === 2)) stockActivations.push(fiber.state)
  }, { global: true })
  const started = await f.start(f.pathB), child = f.ctx.agents.get(started.childId)
  const header = structuredClone(child.session.header)
  for (let n = 0; n < 3; n++) {
    const valid = { maxDepth: { __jsExpr: 'ctx[Symbol.for("cordis.entry")].options.id === "subagent" ? 3 + 3 : -1' }, maxActiveSubagents: 2 }
    await f.update(base(valid))
    assert.equal(token(f.ctx.subagents) === service, true, 'whole unpatch retains actual provider token')
    assert.equal(providerOwner(f.ctx).uid, providerUid, 'provider lifetime is not the disappearing carrier Entry')
    assert.equal(providerFiber.state, 2)
    assert.equal(f.ctx.subagents.resolveMaxDepth(), 6)
    assert.deepEqual(f.loader.resolve('subagent').options.config, valid)
    await f.update(base({ maxDepth: 9, maxActiveSubagents: 0 }))
    assert.equal(f.ctx.subagents.resolveMaxDepth(), 6, 'invalid whole candidate cannot partially change root-owned limits')
    await f.ctx.subagents.sendMessage(f.parent, started.childId, [{ type: 'text', text: 'while whole layer is absent' }], { signal: f.signal() })
    assert.equal(f.ctx.agents.get(started.childId) === child, true)
    assert.deepEqual(child.session.header, header)
    assert.equal(Object.isFrozen(child.session.header), true)
    await f.update(compose(valid))
    assert.equal(token(f.ctx.subagents) === service, true)
    assert.equal(providerOwner(f.ctx).uid, providerUid)
  }
  assert.deepEqual(stockActivations, [], 'suppressed canonical stock never enters its loading callback')
  f.cleanups.unshift(async () => {
    await f.ctx.fiber.dispose()
    assert.equal(providerFiber.state, 4, 'actual root shutdown disposes persistent native provider')
    assert.equal(f.ctx.get('subagents'), undefined)
    assert.equal(f.ctx.get('agents'), undefined)
  })
})

test('already-owned native provider survives oversized public root labels without starting duplicate canonical stock', options, async t => {
  const f = await nativeFixture(t), service = token(f.ctx.subagents), owner = providerOwner(f.ctx), uid = owner.uid
  const started = await f.start(f.pathB), child = f.ctx.agents.get(started.childId), header = structuredClone(child.session.header)
  const labels = f.ctx[sdk.symbols.isolate], names = []
  for (let n = 0; n < 513; n++) {
    const name = 'readonly-fixture-service-map-' + n
    Object.defineProperty(labels, name, { value: Symbol(name), writable: false, enumerable: true, configurable: true })
    names.push(name)
  }
  t.after(() => { for (const name of names) delete labels[name] })
  const stockActivations = []
  f.ctx.on('internal/status', fiber => {
    if (fiber.runtime?.callback === sdk.native.default && (fiber.state === 1 || fiber.state === 2)) stockActivations.push(fiber.state)
  }, { global: true })
  for (let n = 0; n < 2; n++) {
    await f.update(base({ maxDepth: 5, maxActiveSubagents: 2 }))
    assert.equal(token(f.ctx.subagents) === service, true)
    assert.equal(providerOwner(f.ctx).uid, uid)
    await f.ctx.subagents.sendMessage(f.parent, started.childId, [{ type: 'text', text: 'same warmed B under large map' }], { signal: f.signal() })
    assert.equal(f.ctx.agents.get(started.childId) === child, true)
    assert.deepEqual(child.session.header, header)
    assert.equal(Object.isFrozen(child.session.header), true)
    await f.update(compose({ maxDepth: 5, maxActiveSubagents: 2 }))
    assert.equal(token(f.ctx.subagents) === service, true)
    assert.equal(providerOwner(f.ctx).uid, uid)
  }
  assert.deepEqual(stockActivations, [], 'cold admission budget cannot permit a duplicate stock constructor against an existing exact native owner')
  const agents = token(f.ctx.agents)
  f.releaseStep()
  await f.ctx.fiber.dispose()
  assert.equal(owner.state, 4)
  assert.deepEqual(agents.list(), [])
  assert.equal(f.ctx.get('subagents'), undefined)
})

test('original raw !!js config validates in same scope and volatile edits keep the last valid depth without remount', options, async t => {
  const f = await fixture(t)
  f.ctx.provide('depthCandidate', 4)
  const raw = { maxDepth: { __jsExpr: 'ctx[Symbol.for("cordis.entry")].options.id === "subagent" ? ctx.depthCandidate : -1' }, maxActiveSubagents: 2 }
  await f.update(compose(raw))
  const service = token(f.ctx.subagents)
  const uid = f.loader.resolve('mattpocock-native-subagent').fiber.uid
  assert.equal(f.ctx.subagents.resolveMaxDepth(), 4)
  assert.deepEqual(f.loader.resolve('subagent').options.config, raw)
  await f.update(compose({ maxDepth: 6, maxActiveSubagents: 2 }))
  assert.equal(f.ctx.subagents.resolveMaxDepth(), 6)
  await f.update(compose({ maxDepth: -1, maxActiveSubagents: 0 }))
  assert.equal(f.ctx.subagents.resolveMaxDepth(), 6)
  assert.deepEqual(f.loader.resolve('subagent').options.config, { maxDepth: -1, maxActiveSubagents: 0 })
  await f.update(compose({ maxDepth: { __jsExpr: '(() => { throw new Error("invalid operator") })()' }, maxActiveSubagents: 2 }))
  assert.equal(f.ctx.subagents.resolveMaxDepth(), 6)
  await f.update(compose({ maxDepth: 0, maxActiveSubagents: 3 }))
  assert.equal(f.ctx.subagents.resolveMaxDepth(), 0)
  assert.equal(token(f.ctx.subagents), service)
  assert.equal(f.loader.resolve('mattpocock-native-subagent').fiber.uid, uid)
})

test('first-install and repeated same-profile HMR preserve the exact stock service token; fresh boot alone chooses generatedCtor', options, async t => {
  const f = await fixture(t)
  await f.update(base({ maxDepth: 4, maxActiveSubagents: 3 }))
  const service = token(f.ctx.subagents)
  const uid = f.loader.resolve('subagent').fiber.uid
  for (let i = 0; i < 3; i++) {
    await f.update(compose({ maxDepth: 4, maxActiveSubagents: 3 }))
    assert.equal(token(f.ctx.subagents), service)
    assert.equal(f.loader.resolve('subagent').fiber.uid, uid)
    assert.equal(f.loader.resolve('mattpocock-native-subagent').fiber, undefined)
  }
  assert.equal(service[origin], undefined)
})

test('repeated generated-provider HMR and public duplicate apply safeguard never replace its exact service token', options, async t => {
  const f = await fixture(t)
  await f.update(compose())
  const service = token(f.ctx.subagents)
  const uid = f.loader.resolve('mattpocock-native-subagent').fiber.uid
  for (let i = 0; i < 3; i++) {
    await f.update(compose())
    assert.equal(token(f.ctx.subagents), service)
    assert.equal(f.loader.resolve('mattpocock-native-subagent').fiber.uid, uid)
  }
  const wrapper = await import(wrapperUrl)
  wrapper.apply(f.ctx)
  assert.equal(token(f.ctx.subagents), service)
})

test('own provenance trailing whitespace refuses generated import and falls back to actual ordinary native', options, async t => {
  const f = await fixture(t, { damage: async temp => {
    const metadata = join(temp, 'compatibility/native-subagent.provenance.json')
    const original = await readFile(metadata, 'utf8')
    await writeFile(metadata, original + ' \n')
    assert.deepEqual(JSON.parse(await readFile(metadata, 'utf8')), JSON.parse(original), 'semantic metadata remains identical')
  } })
  await f.update(compose({ maxDepth: 6, maxActiveSubagents: 2 }))
  assert(token(f.ctx.subagents) instanceof sdk.native.default, 'complete provenance bytes, not selected parsed fields, are bounded evidence')
  assert.equal(f.ctx.subagents[origin], undefined)
  assert.equal(importedAssets.has(pathToFileURL(join(f.temp, 'compatibility/native-subagent-0.2.1-alpha.1.js')).href), false, 'invalid provenance prevents importing unchanged generated asset')
  assert.equal(f.ctx.subagents.resolveMaxDepth(), 6)
})

for (const kind of ['hash', 'metadata', 'source-hash', 'missing']) {
  test(kind === 'missing' ? 'missing own asset stays on canonical stock before wrapper import with original config retained'
    : 'own asset ' + kind + ' failure falls back before import to actual ordinary native runtime with original config', options, async t => {
    const marker = Symbol.for('dsh.compatibility.forbidden-import')
    delete globalThis[marker]
    const f = await fixture(t, { damage: async temp => {
      const asset = join(temp, 'compatibility/native-subagent-0.2.1-alpha.1.js')
      if (kind === 'hash') await writeFile(asset, 'globalThis[Symbol.for("dsh.compatibility.forbidden-import")] = true; export default class Bad {}')
      else if (kind === 'missing') await rm(asset)
      else {
        const filename = join(temp, 'compatibility/native-subagent.provenance.json')
        const metadata = JSON.parse(await readFile(filename, 'utf8'))
        if (kind === 'source-hash') metadata.source.originalSha256 = 'f'.repeat(64)
        else metadata.sdk.version = '0.0.0'
        await writeFile(filename, JSON.stringify(metadata))
      }
    } })
    await f.update(compose({ maxDepth: 9, maxActiveSubagents: 2 }))
    if (kind === 'missing') {
      // Admission cannot prove an absent artifact's own module graph. Preserve
      // canonical stock before wrapper import, rather than claiming fallback mounted.
      assert.equal(f.loader.resolve('mattpocock-native-subagent').fiber, undefined)
      assert.equal(f.loader.resolve('subagent').fiber.state, 2, JSON.stringify(f.logs))
    } else {
      assert.equal(f.loader.resolve('subagent').fiber, undefined)
      assert.equal(f.loader.resolve('mattpocock-native-subagent').fiber.state, 2, JSON.stringify(f.logs))
    }
    assert(token(f.ctx.subagents) instanceof sdk.native.default)
    assert.equal(f.ctx.subagents.resolveMaxDepth(), 9)
    assert.equal(token(f.ctx.subagents)[origin], undefined)
    assert.equal(f.ctx.subagents.initialCwdSupported, undefined, 'fallback does not forge any capability getter')
    assert.equal(globalThis[marker], undefined, 'invalid owned image must not execute')
    await assert.rejects(f.ctx.subagents.start('missing', { prompt: [], signal: new AbortController().signal }), error => error instanceof sdk.native.SubagentError)
  })
}

test('own asset failure retains ordinary native creation and send without pretending initial cwd capability', options, async t => {
  const f = await nativeFixture(t, { damage: temp => writeFile(join(temp, 'compatibility/native-subagent-0.2.1-alpha.1.js'), 'invalid owned image') })
  assert(token(f.ctx.subagents) instanceof sdk.native.default)
  const started = await f.start(undefined)
  const child = f.ctx.agents.get(started.childId)
  assert.equal(child.session.header.cwd, f.pathA)
  await f.ctx.subagents.sendMessage(f.parent, started.childId, [{ type: 'text', text: 'ordinary native retained' }], { signal: f.signal() })
  assert.equal(f.ctx.agents.get(started.childId), child)
  assert.equal(token(f.ctx.subagents)[origin], undefined)
})

test('zero depth retained through native schema rejects creation with exact shared public depth error identity', options, async t => {
  const f = await nativeFixture(t)
  await f.update(compose({ maxDepth: 0, maxActiveSubagents: 2 }))
  await assert.rejects(f.start(f.pathB), error => error instanceof sdk.native.SubagentDepthError && error.maxDepth === 0)
  assert.equal(f.ctx.subagents.resolveMaxDepth(), 0)
})

test('explicit user stock disable stays no service and explicit stock enable keeps canonical native implementation', options, async t => {
  for (const disabled of [true, false]) {
    const f = await fixture(t)
    const rows = sdk.applyEntryPatches(compose(), [{ id: 'subagent', name: '@deepseek-ai/dsh-subagent', disabled }], assert.fail)
    await f.update(rows)
    assert.equal(f.loader.resolve('mattpocock-native-subagent').fiber, undefined)
    if (disabled) assert.equal(f.ctx.get('subagents'), undefined)
    else assert(token(f.ctx.subagents) instanceof sdk.native.default)
  }
})

test('invalid initial native config fails its real public schema without a fictional default service', options, async t => {
  const f = await fixture(t)
  await f.update(compose({ maxDepth: -1, maxActiveSubagents: 0 }))
  assert.equal(f.loader.resolve('mattpocock-native-subagent').fiber.state, 3)
  assert.equal(f.ctx.get('subagents'), undefined)
})

test('fresh public Loader constructs exactly one actual generated native runtime with canonical error identities', options, async t => {
  const f = await fixture(t)
  await f.update(compose())
  const entry = f.loader.resolve('mattpocock-native-subagent')
  assert.equal(entry.fiber.state, 2, JSON.stringify(f.logs))
  assert.equal(f.loader.resolve('subagent').fiber, undefined)
  const service = token(f.ctx.subagents)
  const bindings = await import(pathToFileURL(join(f.temp, 'lib/compatibility/peer-bindings.js')).href)
  const artifact = join(f.temp, 'compatibility/native-subagent-0.2.1-alpha.1.js')
  const provenance = JSON.parse(await readFile(join(f.temp, 'compatibility/native-subagent.provenance.json'), 'utf8'))
  const native = createRequire(join(hostRoot, 'package.json')).resolve('@deepseek-ai/dsh-subagent')
  const plan = bindings.inspectCanonicalPeerBindings(f.ctx, native, join(f.temp, 'lib/compatibility/native-subagent.js'), artifact, join(hostRoot, 'package.json'))
  const generated = await import(bindings.bindCompatibleSubagentSource(await readFile(artifact, 'utf8'), provenance.transformation.importBindings, plan))
  assert(service instanceof generated.default, 'not a lifecycle-only stub or second host graph')
  assert.equal(generated.SubagentError, sdk.native.SubagentError)
  assert.equal(generated.SubagentDepthError, sdk.native.SubagentDepthError)
  assert.equal(service[origin], 'native-subagent-0.2.1-alpha.1')
  assert.equal(f.ctx.subagents.initialCwdSupported, false, 'no manager without agents')
  assert.equal(f.ctx.subagents.resolveMaxDepth(), 3)
  await assert.rejects(f.ctx.subagents.start('missing', { prompt: [], signal: new AbortController().signal }), error => error instanceof sdk.native.SubagentError)
  assert.throws(() => { service[origin] = 'forged' }, TypeError)
})
