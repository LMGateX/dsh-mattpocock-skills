import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registerHooks, createRequire } from 'node:module'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync, readFileSync } from 'node:fs'
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import { openCompatHostView } from './fixtures/compat-host.mjs'

// Approved seams: mounted Host Remote, HostPorts and read-only Node startup adapter.
// Actual public DomainFacility; no live profile, GUI, AgentLoop, or model runs.
const hostRoot = process.env.DSH_CONTROLS_HOST_ROOT
const compatRoot = process.env.DSH_CONTROLS_COMPAT_HOST_ROOT
const options = { skip: !hostRoot && 'set DSH_CONTROLS_HOST_ROOT for native Host startup probes' }
// The bundled initial-cwd recipe patches exactly the released 0.2.1-alpha.1 host,
// so managed-SDK probes read the second explicit compatibility root.
const compatOptions = { skip: !compatRoot && 'set DSH_CONTROLS_COMPAT_HOST_ROOT for 0.2.1-alpha.1 managed-SDK startup probes' }
// Without a canonical root the alpha.1 prefix alone still serves the mechanical
// API imports; the view links its nested peers (zod, chunked-list) read-only.
const apiRoot = hostRoot ?? (compatRoot ? await openCompatHostView(compatRoot) : undefined)
let api, sdk
if (apiRoot) {
  assert(isAbsolute(apiRoot))
  const require = createRequire(pathToFileURL(join(apiRoot, 'package.json')))
  registerHooks({
    resolve(specifier, context, next) {
      if (context.parentURL?.includes('/dsh-mattpocock-skills/src/') && specifier.startsWith('.')) specifier = specifier.endsWith('.js') ? specifier.slice(0, -3) + '.ts' : specifier
      if ((specifier.startsWith('@deepseek-ai/') || specifier === 'zod') && context.parentURL?.includes('/dsh-mattpocock-skills/src/')) return { url: pathToFileURL(require.resolve(specifier)).href, shortCircuit: true }
      return next(specifier, context)
    },
    load(url, context, next) {
      if (url.includes('/dsh-mattpocock-skills/src/') && new URL(url).pathname.endsWith('.ts')) return { format: 'module', source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText, shortCircuit: true }
      return next(url, context)
    },
  })
  api = await import('../src/host.ts')
  const load = name => import(pathToFileURL(require.resolve(name)).href)
  sdk = { ...await load('@deepseek-ai/cordis'), ...await load('@deepseek-ai/dsh-typert-registry'), ...await load('@deepseek-ai/dsh-api-gateway'), ...await load('@deepseek-ai/dsh-storage-domain'), ...await load('@deepseek-ai/dsh-tools'), ...await load('@deepseek-ai/dsh-system-prompt') }
}
const signal = () => new AbortController().signal
async function assembly(t, { units = new Map(), native = true, bootEpoch, sdkRoot, factory } = {}) {
  const ctx = new sdk.Context(), calls = []
  const owner = { id: 'owner', session: { header: { id: 'owner', version: 4, createdAt: 0, cwd: '/fixture', isSeeded: false }, ownEvents: () => [] } }
  const operator = { id: 'operator', ctx, async dispose() {} }
  ctx.provide('connection', { operator, rpc: { intercept() { return async () => {} } } })
  ctx.provide('agents', { get: id => id === owner.id ? owner : undefined, list: () => [owner] })
  const workspace = { id: 'W', path: '/fixture', title: 'Fixture', sessionIds: ['owner'], status: async () => 'ok' }
  ctx.provide('workspaceRegistry', { get: id => id === 'W' ? workspace : undefined, resolveByPath: async path => path === '/fixture' ? workspace : undefined, list: () => [workspace] })
  const nativeManager = { initialCwdSupported: native, resolveMaxDepth: () => 5, async startContinuable(request) { calls.push(request); return { childId: request.childId, messageId: 'accepted' } } }
  ctx.provide('subagents', nativeManager)
  new sdk.TypertRegistry(ctx)
  new sdk.SystemPrompt(ctx, {})
  new sdk.ToolRuntime(ctx, {})
  const backend = { kv: { async open(descriptor) {
    let rows = units.get(descriptor.name); if (!rows) { rows = new Map(); units.set(descriptor.name, rows) }
    return { async loadAll() { return { global: null, tables: { records: Object.fromEntries(rows) } } }, async putRecord(table, key, value) { assert.equal(table, 'records'); rows.set(key, structuredClone(value)) }, async deleteRecord(table, key) { rows.delete(key) }, async close() {} }
  } } }
  ctx.provide('storage', { backend: { get: () => backend } })
  const domainFacility = new sdk.DomainFacility(ctx, { backend: 'fixture' })
  ctx.provide('storageDomain', domainFacility)
  let policy = { revision: 0, extensionEnabled: false, defaults: {}, workspaceOverrides: {} }
  const runtime = {
    async readPolicy() { return policy }, async savePolicy(caller, intent, expected) { assert.equal(expected, policy.revision); policy = { ...intent, revision: expected + 1 }; return policy },
    async readSession() { return {} }, async applyInstrument() { return {} }, async applyTicketWindow() { return {} }, async resourceAction() { return {} },
    async created() {}, async observe() {}, async preStep() { return [] }, async dispose() {},
  }
  const mounted = await api.mountHost(ctx, { ...(sdkRoot === undefined ? {} : { sdkRoot }), ...(bootEpoch === undefined ? {} : { startup: { bootEpoch } }), createRuntime: async ports => { await factory?.(ports, ctx, owner); return runtime } })
  const gateway = new sdk.TypertGatewayService(ctx, {})
  const dispose = async () => { await mounted.dispose(); await domainFacility.closeAll(); await ctx.fiber.dispose() }
  t.after(dispose)
  const invoke = (method, args = {}, peer = operator, control = signal()) => gateway.invoke({ namespace: 'mattpocockControls', method, args, peer, signal: control })
  const exec = () => ({ agent: owner, signal: signal(), callId: 'startup-probe', rootCallId: 'startup-probe' })
  return { ctx, mounted, invoke, owner, units, calls, exec, dispose, nativeManager }
}
function startupUnits(enabled) {
  return new Map([['mattpocock_startup_settings', new Map([['state', { schemaVersion: 1, revision: 0, desired: { startupCwdEnabled: enabled }, bootReceipts: [] }]])]])
}
function filesystemBoundary(ctx, owner) {
  const paths = new WeakMap()
  const fs = {
    async resolve(path, { signal: control } = {}) { control?.throwIfAborted(); const target = { displayPath: path }; paths.set(target, path); return target },
    processPath(target) { assert(paths.has(target)); return paths.get(target) }, processPathFromHostPath(path) { return path },
    contains(parent, child) { const path = relative(fs.processPath(parent), fs.processPath(child)); return path === '' || path !== '..' && !path.startsWith('..' + sep) && !isAbsolute(path) },
    async stat(target, control) { control?.throwIfAborted(); fs.processPath(target); return { type: 'directory', version: 'fixture' } },
  }
  ctx.provide('fs', fs)
  ctx.provide('sandboxPolicy', { resolve(request) { assert.equal(request.session, owner.session); return { mode: 'workspace-write', workspaceRoot: '/fixture' } } })
}

test('startup settings default off but native capability remains truthful and only operator may read/save', options, async t => {
  const f = await assembly(t)
  const status = await f.invoke('startupStatus')
  assert.deepEqual(status.desired, { startupCwdEnabled: false })
  assert.deepEqual(status.boot.requested, { startupCwdEnabled: false })
  assert.equal(status.enabledNow, false)
  assert.equal(status.state, 'disabled')
  assert.equal(status.nativeInitialCwdSupported, true)
  assert.equal(status.preparation.status, 'ready')
  assert.equal(status.preparation.sdkVersion, null)
  assert.equal(f.mounted.ports.capabilities.nativeInitialChildCwd, 'supported')
  await assert.rejects(f.invoke('startupStatus', {}, { id: 'agent:owner' }), /operator/)
  await assert.rejects(f.invoke('saveStartupSettings', { desired: { startupCwdEnabled: true }, expectedRevision: status.revision }, { id: 'agent:owner' }), /operator/)
  assert.throws(() => f.mounted.service.startupStatus(), /operator/)
  await assert.rejects(f.mounted.ports.authorizeInitialChildCwd(f.exec(), '/fixture/tree'), { code: 'feature-disabled' })
  await assert.rejects(f.mounted.ports.createContinuable(f.exec(), { provider: 'spawn', childId: 'blocked', label: 'blocked', prompt: 'no model', cwd: '/fixture/tree' }), { code: 'feature-disabled' })
  const inherited = await f.mounted.ports.createContinuable(f.exec(), { provider: 'spawn', childId: 'inherited', label: 'inherited', prompt: 'no model' })
  assert.equal(inherited.childId, 'inherited')
  assert.equal(f.calls.length, 1)
  assert.equal('cwd' in f.calls[0], false)
})

test('startup settings use independent CAS and reject wire-supplied identity or SDK paths', options, async t => {
  const f = await assembly(t)
  const initial = await f.invoke('startupStatus')
  const policy = await f.invoke('readPolicy')
  const savedPolicy = await f.invoke('savePolicy', { intent: { extensionEnabled: true, defaults: { workspace: { enabled: true },}, workspaceOverrides: {} }, expectedRevision: policy.revision })
  assert.equal(savedPolicy.revision, 1)
  assert.equal((await f.invoke('startupStatus')).revision, initial.revision)
  const saved = await f.invoke('saveStartupSettings', { desired: { startupCwdEnabled: true }, expectedRevision: initial.revision })
  assert.equal(saved.revision, initial.revision + 1)
  assert.equal(saved.enabledNow, false)
  assert.equal(saved.restartNeeded, true)
  assert.equal(saved.state, 'pending-restart')
  assert.equal((await f.invoke('readPolicy')).revision, 1)
  await assert.rejects(f.invoke('saveStartupSettings', { desired: { startupCwdEnabled: false }, expectedRevision: initial.revision }), { code: 'revision-conflict' })
  for (const field of ['epoch', 'bootEpoch', 'sdkRoot', 'principalId']) {
    await assert.rejects(f.invoke('saveStartupSettings', { desired: { startupCwdEnabled: true, [field]: '/untrusted' }, expectedRevision: saved.revision }))
  }
  const control = new AbortController(); control.abort()
  await assert.rejects(f.invoke('startupStatus', {}, undefined, control.signal))
  assert.equal((await f.invoke('startupStatus')).revision, saved.revision)
})

test('saving off preserves current boot and remount, while a new process boot rejects explicit cwd', options, async t => {
  const units = startupUnits(true)
  let factoryStatus
  const first = await assembly(t, { units, bootEpoch: 'trusted-process-A', factory: async (ports, ctx, owner) => { factoryStatus = await ports.startupStatus(); filesystemBoundary(ctx, owner) } })
  assert.equal(factoryStatus.enabledNow, true, 'trusted startup is captured before the runtime factory')
  const initial = await first.invoke('startupStatus')
  const off = await first.invoke('saveStartupSettings', { desired: { startupCwdEnabled: false }, expectedRevision: initial.revision })
  assert.equal(off.enabledNow, true)
  assert.equal(off.restartNeeded, true)
  assert.equal(off.state, 'pending-restart')
  await first.mounted.ports.authorizeInitialChildCwd(first.exec(), '/fixture/tree')
  await first.mounted.ports.createContinuable(first.exec(), { provider: 'spawn', childId: 'still-on', label: 'on until restart', prompt: 'no model', cwd: '/fixture/tree' })
  await first.dispose()
  const remounted = await assembly(t, { units, bootEpoch: 'trusted-process-A', factory: (ports, ctx, owner) => filesystemBoundary(ctx, owner) })
  const retained = await remounted.invoke('startupStatus')
  assert.equal(retained.boot.epoch, initial.boot.epoch)
  assert.equal(retained.enabledNow, true)
  assert.equal(retained.revision, off.revision)
  await remounted.mounted.ports.createContinuable(remounted.exec(), { provider: 'fork', childId: 'remounted-on', label: 'same process', prompt: 'no model', cwd: '/fixture/tree' })
  await remounted.dispose()
  const next = await assembly(t, { units, bootEpoch: 'trusted-process-B' })
  const restarted = await next.invoke('startupStatus')
  assert.equal(restarted.enabledNow, false)
  assert.equal(restarted.restartNeeded, false)
  assert.equal(restarted.state, 'disabled')
  assert.equal(next.mounted.ports.capabilities.nativeInitialChildCwd, 'supported')
  await assert.rejects(next.mounted.ports.authorizeInitialChildCwd(next.exec(), '/fixture/tree'), { code: 'feature-disabled' })
  await assert.rejects(next.mounted.ports.createContinuable(next.exec(), { provider: 'spawn', childId: 'next-off', label: 'off', prompt: 'no model', cwd: '/fixture/tree' }), { code: 'feature-disabled' })
})

test('production process epoch survives module reload and repeated Host mounts in this actual pid', options, async t => {
  const original = await import('../src/compatibility/host-startup.ts')
  const reloaded = await import('../src/compatibility/host-startup.ts?hmr-startup-probe')
  const epoch = original.processStartupEpoch()
  assert.match(epoch, /^[0-9a-f-]{36}$/)
  assert.equal(reloaded.processStartupEpoch(), epoch)
  const units = startupUnits(true)
  const first = await assembly(t, { units })
  const initial = await first.invoke('startupStatus')
  assert.equal(initial.boot.epoch, epoch)
  const off = await first.invoke('saveStartupSettings', { desired: { startupCwdEnabled: false }, expectedRevision: initial.revision })
  await first.dispose()
  const sameProcess = await assembly(t, { units })
  const current = await sameProcess.invoke('startupStatus')
  assert.equal(current.boot.epoch, epoch)
  assert.equal(current.revision, off.revision)
  assert.equal(current.enabledNow, true)
  assert.deepEqual(current.boot.requested, { startupCwdEnabled: true })
})

async function sdkFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-host-startup-sdk-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const recipe = JSON.parse(await readFile(new URL('../compatibility/initial-cwd.recipe.json', import.meta.url), 'utf8'))
  for (const path of ['package.json', 'lib/bin.js', ...recipe.files.map(file => file.path)]) {
    // The compatibility recipe names the host build it patches; a prefix that removed one of
    // those files still yields a usable mechanical image from the files it does keep.
    if (!existsSync(join(compatRoot, path))) continue
    await mkdir(dirname(join(root, path)), { recursive: true })
    await cp(join(compatRoot, path), join(root, path))
  }
  return root
}
async function sdkImage(root) {
  const result = []
  const visit = async (directory, prefix = '') => {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = prefix + entry.name
      if (entry.isDirectory()) { result.push([path + '/']); await visit(join(directory, entry.name), path + '/') }
      else result.push([path, (await readFile(join(directory, entry.name))).toString('hex')])
    }
  }
  await visit(root)
  return result
}

test('save off and native-supported observations never prepare or reverse-write the SDK', compatOptions, async t => {
  const root = await sdkFixture(t)
  const { prepareManagedSdk } = await import('../src/compatibility/managed-sdk.ts')
  assert.equal((await prepareManagedSdk(root)).status, 'ready', 'offline preparation touches only this temporary copy')
  const before = await sdkImage(root)
  const f = await assembly(t, { units: startupUnits(true), sdkRoot: root, bootEpoch: 'read-only-native' })
  const enabled = await f.invoke('startupStatus')
  assert.equal(enabled.state, 'enabled')
  const off = await f.invoke('saveStartupSettings', { desired: { startupCwdEnabled: false }, expectedRevision: enabled.revision })
  assert.equal(off.enabledNow, true)
  await f.invoke('startupStatus')
  assert.deepEqual(await sdkImage(root), before)
})

test('unlocated, pristine, prepared-but-not-loaded and broken SDKs return honest UI state without SDK effects', compatOptions, async t => {
  const unknown = await assembly(t, { native: false, units: startupUnits(true), bootEpoch: 'unlocated' })
  const unsupported = await unknown.invoke('startupStatus')
  assert.equal(unsupported.nativeInitialCwdSupported, false)
  assert.equal(unsupported.enabledNow, false)
  assert.equal(unsupported.preparation.sdkVersion, null)
  assert.equal(unsupported.state, 'unsupported')
  assert.equal(unsupported.restartNeeded, false)
  assert.match(unsupported.preparation.diagnostic, /could not be verified/)

  const root = await sdkFixture(t), before = await sdkImage(root)
  const pristine = await assembly(t, { native: false, units: startupUnits(true), sdkRoot: root, bootEpoch: 'pristine' })
  const needs = await pristine.invoke('startupStatus')
  assert.equal(needs.preparation.status, 'not-prepared')
  assert.equal(needs.state, 'needs-preparation')
  assert.equal(needs.restartNeeded, false)
  assert.deepEqual(await sdkImage(root), before)
  await pristine.dispose()
  const { prepareManagedSdk } = await import('../src/compatibility/managed-sdk.ts')
  assert.equal((await prepareManagedSdk(root)).status, 'ready')
  const preparedImage = await sdkImage(root)
  const stale = await assembly(t, { native: false, units: startupUnits(true), sdkRoot: root, bootEpoch: 'prepared-not-loaded' })
  const pending = await stale.invoke('startupStatus')
  assert.equal(pending.preparation.status, 'ready')
  assert.equal(pending.preparation.sdkVersion, '0.2.1-alpha.1')
  assert.equal(pending.enabledNow, false)
  assert.equal(pending.state, 'pending-restart')
  assert.equal(pending.restartNeeded, true)
  assert.equal(stale.mounted.ports.capabilities.nativeInitialChildCwd, 'unsupported')
  await assert.rejects(stale.mounted.ports.authorizeInitialChildCwd(stale.exec(), '/fixture/tree'), { code: 'unsupported' })
  assert.deepEqual(await sdkImage(root), preparedImage)

  const failed = await assembly(t, { native: false, units: startupUnits(true), sdkRoot: join(root, 'missing'), bootEpoch: 'failed-root' })
  const failure = await failed.invoke('startupStatus')
  assert.equal(failure.state, 'failed')
  assert.match(failure.preparation.diagnostic, /ENOENT/)
  const incompatibleRoot = await sdkFixture(t)
  const pkg = JSON.parse(await readFile(join(incompatibleRoot, 'package.json'), 'utf8')); pkg.version = '9.9.9'
  await writeFile(join(incompatibleRoot, 'package.json'), JSON.stringify(pkg))
  const incompatible = await assembly(t, { native: false, units: startupUnits(true), sdkRoot: incompatibleRoot, bootEpoch: 'incompatible-root' })
  const mismatch = await incompatible.invoke('startupStatus')
  assert.equal(mismatch.state, 'incompatible')
  assert.equal(mismatch.preparation.sdkVersion, '9.9.9')
  assert.match(mismatch.preparation.diagnostic, /identity or version/)

  const uncertainRoot = await sdkFixture(t)
  await writeFile(join(uncertainRoot, '.dsh-mattpocock-initial-cwd.lock'), 'foreign incomplete transaction')
  const uncertain = await assembly(t, { native: false, units: startupUnits(true), sdkRoot: uncertainRoot, bootEpoch: 'uncertain-root' })
  const ambiguity = await uncertain.invoke('startupStatus')
  assert.equal(ambiguity.state, 'uncertain')
  assert.match(ambiguity.preparation.diagnostic, /lock/)
  assert.equal(await readFile(join(uncertainRoot, '.dsh-mattpocock-initial-cwd.lock'), 'utf8'), 'foreign incomplete transaction')
})

test('Node adapter discovers the actual symlink-resolved dsh bin independently of recipe version', compatOptions, async t => {
  const { HostStartupNode } = await import('../src/compatibility/host-startup.ts')
  const root = await sdkFixture(t)
  const launch = join(root, 'launch-dsh')
  await symlink(join(root, 'lib/bin.js'), launch)
  const original = process.argv[1]
  try {
    process.argv[1] = launch
    const actual = await new HostStartupNode({}, () => false).observe()
    assert.equal(actual.preparation.status, 'not-prepared')
    assert.equal(actual.preparation.sdkVersion, '0.2.1-alpha.1')
    const nearbyEntry = join(root, 'lib/other.js')
    await writeFile(nearbyEntry, '// Not the SDK launch bin')
    process.argv[1] = nearbyEntry
    const nearby = await new HostStartupNode({}, () => false).observe()
    assert.equal(nearby.preparation.sdkVersion, null)
    assert.match(nearby.preparation.diagnostic, /could not be verified/)
    process.argv[1] = launch
    const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')); pkg.version = '99.0.0'
    await writeFile(join(root, 'package.json'), JSON.stringify(pkg))
    const wrongVersion = await new HostStartupNode({}, () => false).observe()
    assert.equal(wrongVersion.preparation.status, 'incompatible')
    assert.equal(wrongVersion.preparation.sdkVersion, '99.0.0')
    assert.match(wrongVersion.preparation.diagnostic, /identity or version/)
    const official = await new HostStartupNode({}, () => true).observe()
    assert.equal(official.preparation.status, 'ready')
    assert.equal(official.preparation.sdkVersion, null, 'native support must not fabricate a package version')
    const unavailable = await new HostStartupNode({}, () => { throw new Error('native manager unavailable') }).observe()
    assert.equal(unavailable.nativeInitialCwdSupported, null)
    assert.equal(unavailable.preparation.status, 'uncertain')
    assert.match(unavailable.preparation.diagnostic, /native.*unavailable/i)
  } finally { process.argv[1] = original }
})

test('a real child launched at an incompatible SDK bin retains its version but rejects incorrect bin identity', compatOptions, async t => {
  const root = await sdkFixture(t)
  const entry = join(root, 'lib/bin.js')
  const tsUrl = pathToFileURL(createRequire(import.meta.url).resolve('typescript')).href
  const sourceUrl = new URL('../src/compatibility/host-startup.ts', import.meta.url).href
  // Replace only the temporary copy's entry with a no-model/public-adapter probe.
  // The child's actual process.argv[1] is the declared SDK entry, not an injected option.
  await writeFile(entry,     "import { registerHooks } from 'node:module'\n" +
    "import { readFileSync } from 'node:fs'\n" +
    "import ts from " + JSON.stringify(tsUrl) + "\n" +
    "registerHooks({\n" +
    "  resolve(specifier, context, next) {\n" +
    "    if (context.parentURL?.includes('/dsh-mattpocock-skills/src/') && specifier.startsWith('.') && specifier.endsWith('.js')) specifier = specifier.slice(0, -3) + '.ts'\n" +
    "    return next(specifier, context)\n" +
    "  },\n" +
    "  load(url, context, next) {\n" +
    "    if (url.includes('/dsh-mattpocock-skills/src/') && new URL(url).pathname.endsWith('.ts')) return { format: 'module', source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText, shortCircuit: true }\n" +
    "    return next(url, context)\n" +
    "  },\n" +
    "})\n" +
    "const { HostStartupNode } = await import(" + JSON.stringify(sourceUrl) + ")\n" +
    "process.stdout.write(JSON.stringify({ entry: process.argv[1], observation: await new HostStartupNode({}, () => false).observe() }))\n")
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  pkg.version = '99.0.0'
  await writeFile(join(root, 'package.json'), JSON.stringify(pkg))
  const run = async () => {
    const { stdout } = await promisify(execFile)(process.execPath, [entry], { timeout: 10000, maxBuffer: 1048576 })
    return JSON.parse(stdout)
  }
  const launched = await run()
  assert.equal(launched.entry, entry)
  assert.equal(launched.observation.nativeInitialCwdSupported, false)
  assert.equal(launched.observation.preparation.status, 'incompatible')
  assert.equal(launched.observation.preparation.sdkVersion, '99.0.0')
  assert.match(launched.observation.preparation.diagnostic, /identity or version/)
  pkg.bin = { dsh: 'lib/not-the-launched-bin.js' }
  await writeFile(join(root, 'package.json'), JSON.stringify(pkg))
  const unrelated = await run()
  assert.equal(unrelated.observation.preparation.status, 'not-prepared')
  assert.equal(unrelated.observation.preparation.sdkVersion, null)
  assert.match(unrelated.observation.preparation.diagnostic, /could not be verified/)
})

test('optional plugin preparation never overrides current native true or unknown capability', options, async () => {
  const { HostStartupNode } = await import('../src/compatibility/host-startup.ts')
  let calls = 0
  const preparation = async () => { calls++; throw new Error('broken optional asset') }
  const supported = await new HostStartupNode({ observeCompatibilityPreparation: preparation,
    nativeSource: () => '@lmgatex/dsh-mattpocock-skills/native-subagent-0.2.1-alpha.1' }, () => true).observe()
  assert.equal(supported.nativeInitialCwdSupported, true)
  assert.equal(supported.preparation.status, 'ready')
  assert.match(supported.preparation.diagnostic, /loaded provider origin/)
  assert.match(supported.preparation.diagnostic, /does not claim the official shared SDK was patched/)
  const unknown = await new HostStartupNode({ observeCompatibilityPreparation: preparation }, () => null).observe()
  assert.equal(unknown.nativeInitialCwdSupported, null)
  assert.equal(unknown.preparation.status, 'uncertain')
  assert.equal(calls, 0, 'optional inspection must not run before native capability precedence')
})

test('trusted ready callback reports pending restart through real StartupSupport without changing same-process boot', options, async () => {
  const { HostStartupNode } = await import('../src/compatibility/host-startup.ts')
  const { StartupSupport } = await import('../src/controls/startup-support.ts')
  let document = { schemaVersion: 1, revision: 0, desired: { startupCwdEnabled: true }, bootReceipts: [] }
  const storage = { async read() { return structuredClone(document) }, async compareAndSwap(expected, next) {
    if (document.revision !== expected) return false
    document = structuredClone(next); return true
  } }
  const control = signal(), seen = []
  const node = new HostStartupNode({ bootEpoch: 'trusted-plugin-pending', observeCompatibilityPreparation: async received => {
    seen.push(received); return { status: 'ready', sdkVersion: '0.2.1-alpha.1', diagnostic: 'Same plugin provider ready for next boot only.' }
  } }, () => false)
  const support = new StartupSupport(storage, { epoch: node.epoch }, received => node.observe(received))
  const first = await support.readStatus(control)
  assert.equal(first.nativeInitialCwdSupported, false)
  assert.equal(first.enabledNow, false)
  assert.equal(first.state, 'pending-restart')
  assert.equal(first.restartNeeded, true)
  const remounted = new StartupSupport(storage, { epoch: node.epoch }, received => node.observe(received))
  const again = await remounted.readStatus(control)
  assert.deepEqual(again.boot, first.boot)
  assert.equal(again.revision, first.revision)
  assert(seen.every(received => received === control), 'exact public observer signal is forwarded')
})

test('missing optional evidence uses legacy readonly inspection but directs ordinary users to updated plugin', compatOptions, async t => {
  const { HostStartupNode } = await import('../src/compatibility/host-startup.ts')
  const root = await sdkFixture(t), before = await sdkImage(root)
  const result = await new HostStartupNode({ sdkRoot: root, observeCompatibilityPreparation: async () => null }, () => false).observe()
  assert.equal(result.preparation.status, 'not-prepared')
  assert.match(result.preparation.diagnostic, /legacy read-only SDK evidence/)
  assert.match(result.preparation.diagnostic, /updated compatible plugin package/)
  assert.deepEqual(await sdkImage(root), before)
})

test('failed or invalid trusted optional observer is not forged into prepared state', options, async () => {
  const { HostStartupNode } = await import('../src/compatibility/host-startup.ts')
  const failed = await new HostStartupNode({ observeCompatibilityPreparation: async () => { throw new Error('asset missing') } }, () => false).observe()
  assert.equal(failed.nativeInitialCwdSupported, false)
  assert.equal(failed.preparation.status, 'failed')
  assert.match(failed.preparation.diagnostic, /asset missing/)
  const invalid = await new HostStartupNode({ observeCompatibilityPreparation: async () => ({ status: 'ready', sdkVersion: null, diagnostic: null, userAuthority: true }) }, () => false).observe()
  assert.equal(invalid.preparation.status, 'failed')
  assert.match(invalid.preparation.diagnostic, /unexpected|unknown/i)
})

test('optional preparation cancellation forwards exact signal and rejects instead of returning invented failure', options, async () => {
  const { HostStartupNode } = await import('../src/compatibility/host-startup.ts')
  const controller = new AbortController()
  let seen
  const node = new HostStartupNode({ observeCompatibilityPreparation: async received => {
    seen = received
    await new Promise(resolve => received.addEventListener('abort', resolve, { once: true }))
    return { status: 'ready', sdkVersion: '0.2.1-alpha.1', diagnostic: 'must not return' }
  } }, () => false)
  const pending = node.observe(controller.signal)
  controller.abort(new Error('cancel optional preparation'))
  await assert.rejects(pending, /cancel optional preparation/)
  assert.strictEqual(seen, controller.signal)
})

test('startup request never falsifies changing native health and cwd checks native truth at the final effect', options, async t => {
  const f = await assembly(t, { units: startupUnits(true), bootEpoch: 'native-health', factory: (ports, ctx, owner) => filesystemBoundary(ctx, owner) })
  await f.mounted.ports.authorizeInitialChildCwd(f.exec(), '/fixture/tree')
  f.nativeManager.resolveMaxDepth = () => { f.nativeManager.initialCwdSupported = false; return 5 }
  await assert.rejects(f.mounted.ports.createContinuable(f.exec(), { provider: 'spawn', childId: 'health-changed', label: 'no stale support', prompt: 'no model', cwd: '/fixture/tree' }), { code: 'unsupported' })
  assert.equal(f.calls.length, 0)
  assert.equal(f.mounted.ports.capabilities.nativeInitialChildCwd, 'unsupported')
  const unavailable = await f.invoke('startupStatus')
  assert.equal(unavailable.nativeInitialCwdSupported, false)
  assert.equal(unavailable.enabledNow, false)
  f.nativeManager.initialCwdSupported = true
  const available = await f.invoke('startupStatus')
  assert.equal(available.nativeInitialCwdSupported, true)
  assert.equal(available.enabledNow, true)
  assert.deepEqual(available.boot, unavailable.boot)
  await f.dispose()
  await assert.rejects(f.mounted.ports.startupStatus(), { code: 'access-denied' })
})
