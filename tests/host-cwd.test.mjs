import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import ts from 'typescript'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const hostRoot = process.env.DSH_CONTROLS_HOST_ROOT
const options = { skip: !hostRoot && 'set DSH_CONTROLS_HOST_ROOT to run real native factory probes' }
const signal = () => new AbortController().signal
let sdk
if (hostRoot) {
  assert(isAbsolute(hostRoot))
  const require = createRequire(pathToFileURL(join(hostRoot, 'package.json')))
  const load = name => import(pathToFileURL(require.resolve(name)).href)
  sdk = { ...await load('@deepseek-ai/cordis'), ...await load('@deepseek-ai/dsh-agent'),
    ...await load('@deepseek-ai/dsh-session'), ...await load('@deepseek-ai/dsh-agent-loop'),
    ...await load('@deepseek-ai/dsh-session-projection'), ...await load('@deepseek-ai/dsh-system-prompt'),
    ...await load('@deepseek-ai/dsh-tools'), ...await load('@deepseek-ai/dsh-typert-registry'),
    Jsonl: (await load('@deepseek-ai/dsh-session-persistence-jsonl')).default,
    Query: (await load('@deepseek-ai/dsh-session-query-sqlite')).default,
    LocalFs: (await load('@deepseek-ai/dsh-fs-local')).default,
    fsTools: await load('@deepseek-ai/dsh-tool-fs'),
    spawn: await load('@deepseek-ai/dsh-subagent-spawn-in-process'),
    fork: await load('@deepseek-ai/dsh-subagent-fork-in-process') }
}

async function fixture(t, { prepare = async () => ({}) } = {}) {
  const temp = await mkdtemp(join(tmpdir(), 'dsh-native-cwd-'))
  const source = join(hostRoot, 'node_modules/@deepseek-ai/dsh-subagent')
  const target = join(temp, 'node_modules/@deepseek-ai/dsh-subagent')
  const pluginOwned = process.env.DSH_CWD_IMPLEMENTATION === 'plugin-owned' && process.env.DSH_CWD_BASELINE !== '1'
  if (pluginOwned) {
    await mkdir(dirname(target), { recursive: true })
    // The plugin artifact imports the canonical host's public errors and peers.
    await symlink(source, target)
  } else await cp(source, target, { recursive: true })
  await writeFile(join(temp, '.dsh-cwd-patch-target'), 'isolated-cwd-patch-target' + String.fromCharCode(10))
  for (const name of await readdir(join(hostRoot, 'node_modules'))) {
    if (name === '@deepseek-ai') {
      for (const child of await readdir(join(hostRoot, 'node_modules', name))) {
        if (child !== 'dsh-subagent') await symlink(join(hostRoot, 'node_modules', name, child), join(temp, 'node_modules', name, child))
      }
    } else await symlink(join(hostRoot, 'node_modules', name), join(temp, 'node_modules', name))
  }
  if (process.env.DSH_CWD_BASELINE !== '1') {
    const { applyInitialCwdPatch } = await import('../host-patches/apply-initial-cwd.ts')
    if (process.env.DSH_CWD_IMPLEMENTATION === 'source') {
      const manifest = JSON.parse(await readFile(new URL('../host-patches/manifest.json', import.meta.url), 'utf8'))
      const sourceRoot = join(temp, 'source')
      await mkdir(join(sourceRoot, 'packages/subagent/subagent/src'), { recursive: true })
      await writeFile(join(sourceRoot, '.dsh-cwd-patch-target'), 'isolated-cwd-patch-target' + String.fromCharCode(10))
      for (const file of manifest.source) {
        // Reconstruct the pinned pristine baseline; the hash-bound script validates it.
        let original = await readFile(new URL('../host-patches/source/' + file.path, import.meta.url), 'utf8')
        for (const replacement of [...file.replacements].reverse()) original = original.replace(replacement.after, replacement.before)
        await writeFile(join(sourceRoot, file.path), original)
      }
      await applyInitialCwdPatch({ targetRoot: sourceRoot, mode: 'source' })
      for (const file of manifest.source) {
        const text = await readFile(join(sourceRoot, file.path), 'utf8')
        assert.equal(text, await readFile(new URL('../host-patches/source/' + file.path, import.meta.url), 'utf8'))
        const output = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
          .replace(/\.ts(['"])/g, '.js$1')
        await writeFile(join(target, 'lib/types', file.path.split('/').at(-1).replace('.ts', '.js')), output)
      }
    } else if (pluginOwned) {
      // No SDK recipe/manager writes: only the plugin-owned provider is staged.
      await writeFile(join(temp, 'package.json'), JSON.stringify({ name: '@lmgatex/dsh-mattpocock-skills', type: 'module' }))
      await mkdir(join(temp, 'compatibility'))
      await cp(new URL('../compatibility/native-subagent-0.2.1-alpha.1.js', import.meta.url), join(temp, 'compatibility/native-subagent.js'))
    } else if (process.env.DSH_CWD_IMPLEMENTATION === 'managed') {
      // The packaged manager prepares this independent SDK root; all other
      // dependencies remain read-only links to the exact native installation.
      await cp(join(hostRoot, 'package.json'), join(temp, 'package.json'))
      const { prepareManagedSdk, inspectManagedSdk } = await import('../lib/compatibility/managed-sdk.js')
      assert.equal((await prepareManagedSdk(temp)).status, 'ready')
      assert.equal((await inspectManagedSdk(temp)).managed, true)
    } else await applyInitialCwdPatch({ targetRoot: temp, mode: 'compiled' })
  }
  const entry = process.env.DSH_CWD_IMPLEMENTATION === 'source' ? 'lib/types/index.js' : 'lib/index.js'
  const { default: Subagents } = await import(pathToFileURL(pluginOwned ? join(temp, 'compatibility/native-subagent.js') : join(target, entry)).href)
  const pathA = await realpath(await mkdir(join(temp, 'A'), { recursive: true }))
  const pathB = await realpath(await mkdir(join(temp, 'B'), { recursive: true }))
  await writeFile(join(pathA, 'marker.txt'), 'A native tool')
  await writeFile(join(pathB, 'marker.txt'), 'B native tool')
  const ctx = new sdk.Context()
  let modelCalls = 0
  const requests = []
  let release = Promise.withResolvers()
  const releases = [release]
  t.after(async () => {
    for (const item of releases) item.resolve({ kind: 'reject' })
    await ctx.subagents.drainContinuableDescendants([parent])
    await parentHandle.dispose()
    await ctx.fiber.dispose()
    assert.equal(modelCalls, 0, 'no model adapter or model request may run')
    await rm(temp, { recursive: true, force: true })
  })
  new sdk.TypertRegistry(ctx)
  new sdk.SessionStore(ctx)
  new sdk.AgentRegistry(ctx)
  new sdk.SessionProjectionRegistry(ctx)
  new sdk.SystemPrompt(ctx, {})
  new sdk.ToolRuntime(ctx, {})
  new sdk.Jsonl(ctx, { root: join(temp, 'sessions'), compression: 'none' })
  new sdk.Query(ctx, { path: join(temp, 'query.sqlite'), openAt: 'never' })
  ctx.provide('llm', { prepareCall() { modelCalls++; throw new Error('model prohibited') }, stream() { modelCalls++; throw new Error('model prohibited') } })
  new sdk.LocalFs(ctx, { cwd: pathA, diffBasisMaxBytes: 10485760 })
  sdk.fsTools.apply(ctx, { readLimit: 2000, readMaxLineLength: 10000, readMaxBytes: 100000, readStreamMinSize: 10000000 })
  new sdk.AgentLoop(ctx, { agents: [], maxParallelToolCalls: { get: () => 10 } })
  new Subagents(ctx, { maxDepth: { get: () => 5 }, maxActiveSubagents: { get: () => 20 } })
  ctx.on('agent/pre-step', async (agent, event, next) => {
    requests.push({ agent, event })
    return release.promise
  })
  const unregister = ctx.subagents.registerProvider({ name: 'controlled', capabilities: { continuable: true }, async prepareContinuable(request) { return prepare(request) } })
  const parentHandle = await ctx.agents.create({ sessionId: 'parent', meta: { cwd: pathA } })
  const parent = parentHandle.agent
  const start = (cwd, extra = {}) => ctx.subagents.startContinuable({ provider: 'controlled', label: 'native cwd probe', ...(cwd === undefined ? {} : { cwd }), request: { parent, prompt: [{ type: 'text', text: 'No model. Controlled native inbox.' }], maxDepth: 5 }, signal: signal(), ...extra })
  return { ctx, parent, pathA, pathB, start, temp, requests, Subagents, unregister,
    releaseStep() { release.resolve({ kind: 'reject' }) },
    pauseStep() { release = Promise.withResolvers(); releases.push(release) } }
}

test('public initialCwdSupported truthfully requires the native manager to be mounted', options, async t => {
  const f = await fixture(t)
  assert.equal(f.ctx.subagents.initialCwdSupported, true)
  const noAgents = new sdk.Context()
  new sdk.TypertRegistry(noAgents)
  new f.Subagents(noAgents, { maxDepth: { get: () => 5 }, maxActiveSubagents: { get: () => 20 } })
  assert.equal(noAgents.subagents.initialCwdSupported, false)
  await noAgents.fiber.dispose()
})

test('initial cwd disappearing during prepare is rejected before native publication', options, async t => {
  const ready = Promise.withResolvers(), proceed = Promise.withResolvers()
  const f = await fixture(t, { prepare: async () => { ready.resolve(); await proceed.promise; return {} } })
  const operation = f.start(f.pathB, { childId: 'vanishing-child' })
  await ready.promise
  await rm(f.pathB, { recursive: true })
  proceed.resolve()
  await assert.rejects(operation, /start cwd is not an accessible directory/)
  assert.equal(f.ctx.agents.get('vanishing-child'), undefined)
  assert.equal(await f.ctx.sessionPersistence.stat('vanishing-child'), undefined)
})

test('native relative read resolves independently for two real child Agents in A and B', options, async t => {
  const f = await fixture(t)
  const [a, b] = await Promise.all([f.start(f.pathA), f.start(f.pathB)])
  const read = childId => f.ctx.tools.execute({ callId: 'read-' + childId, name: 'read', arguments: { file_path: 'marker.txt' }, agent: f.ctx.agents.get(childId), signal: signal() })
  const [resultA, resultB] = await Promise.all([read(a.childId), read(b.childId)])
  assert.equal(resultA.isError, false, JSON.stringify(resultA))
  assert.equal(resultB.isError, false, JSON.stringify(resultB))
  assert.equal(resultA.value.lines[0].text, 'A native tool')
  assert.equal(resultB.value.lines[0].text, 'B native tool')
  assert.equal(resultA.value.path, join(f.pathA, 'marker.txt'))
  assert.equal(resultB.value.path, join(f.pathB, 'marker.txt'))
  assert.equal(f.parent.session.header.cwd, f.pathA)
})

test('native cold sendMessage resumes the same persisted B header without preparing again', options, async t => {
  let preparations = 0
  const f = await fixture(t, { prepare: async () => { preparations++; return {} } })
  const started = await f.start(f.pathB)
  const first = f.ctx.agents.get(started.childId)
  const header = structuredClone(first.session.header)
  const disposed = Promise.withResolvers()
  const off = f.ctx.on('agent/disposed', ({ agent }) => { if (agent.id === started.childId) disposed.resolve() })
  f.releaseStep()
  await disposed.promise
  off()
  assert.equal(f.ctx.agents.get(started.childId), undefined)
  const reader = new sdk.Context()
  new sdk.Jsonl(reader, { root: join(f.temp, 'sessions'), compression: 'none' })
  assert.deepEqual((await reader.sessionPersistence.stat(started.childId)).header, header)
  await reader.fiber.dispose()
  // Creation-only validation is not a new cold-resume closure gate.
  await rm(f.pathB, { recursive: true })
  f.unregister()
  f.pauseStep()
  await f.ctx.subagents.sendMessage(f.parent, started.childId, [{ type: 'text', text: 'cold followup' }], { signal: signal() })
  const resumed = f.ctx.agents.get(started.childId)
  assert(resumed)
  assert.notEqual(resumed, first)
  assert.equal(resumed.constructor.name, 'ReactLoopAgent')
  assert.deepEqual(resumed.session.header, header)
  assert.equal(resumed.session.header.cwd, f.pathB)
  assert.equal(preparations, 1)
  assert(resumed.session.ownEvents().some(event => event.type === 'subagent/descriptor'))
})

test('first cwd is captured before awaited prepare while omitted cwd retains A inheritance', options, async t => {
  const ready = Promise.withResolvers(), proceed = Promise.withResolvers()
  const f = await fixture(t, { prepare: async () => { ready.resolve(); await proceed.promise; return {} } })
  const spec = { provider: 'controlled', label: 'capture', cwd: f.pathB, childId: 'captured', request: { parent: f.parent, prompt: [{ type: 'text', text: 'captured B' }], maxDepth: 5 }, signal: signal() }
  const operation = f.ctx.subagents.startContinuable(spec)
  await ready.promise
  spec.cwd = f.pathA
  proceed.resolve()
  const created = await operation
  assert.equal(f.ctx.agents.get(created.childId).session.header.cwd, f.pathB)
  const inherited = await f.start(undefined)
  assert.equal(f.ctx.agents.get(inherited.childId).session.header.cwd, f.pathA)
  assert.equal(f.parent.session.header.cwd, f.pathA)
})

test('invalid first cwd rejects before provider prepare and native session creation', options, async t => {
  let preparations = 0
  const f = await fixture(t, { prepare: async () => { preparations++; return {} } })
  for (const cwd of ['relative', '', join(f.temp, 'missing'), join(f.pathA, 'marker.txt')]) {
    await assert.rejects(f.start(cwd, { childId: 'invalid-child' }), /absolute path|accessible directory/)
  }
  assert.equal(preparations, 0)
  assert.equal(f.ctx.agents.get('invalid-child'), undefined)
  assert.equal(await f.ctx.sessionPersistence.stat('invalid-child'), undefined)
})

test('original native spawn and fork providers preserve fresh and seeded histories with B cwd', options, async t => {
  const f = await fixture(t)
  sdk.spawn.apply(f.ctx, { providerName: 'native-spawn' })
  sdk.fork.apply(f.ctx, { providerName: 'native-fork' })
  f.parent.session.append('turn/start', { turn: 1 })
  f.parent.session.append('turn/end', { turn: 1, kind: 'completed' })
  const seed = f.parent.session.snapshotEvents()
  const spawned = await f.start(f.pathB, { provider: 'native-spawn' })
  const forked = await f.start(f.pathB, { provider: 'native-fork' })
  const fresh = f.ctx.agents.get(spawned.childId).session
  const inherited = f.ctx.agents.get(forked.childId).session
  assert.equal(fresh.header.cwd, f.pathB)
  assert.equal(fresh.header.isSeeded, false)
  assert.equal(fresh.inheritedEventCount, 0)
  assert.equal(inherited.header.cwd, f.pathB)
  assert.equal(inherited.header.isSeeded, true)
  assert.equal(inherited.inheritedEventCount, seed.length)
  assert.deepEqual(inherited.snapshotEvents().slice(0, seed.length), seed)
  assert.equal(inherited.header.parentSession, f.parent.id)
})

test('offline compiled patch rejects hash drift before changing any target file', options, async t => {
  const { applyInitialCwdPatch } = await import('../host-patches/apply-initial-cwd.ts')
  const manifest = JSON.parse(await readFile(new URL('../host-patches/manifest.json', import.meta.url), 'utf8'))
  const root = await mkdtemp(join(tmpdir(), 'dsh-cwd-hash-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(join(root, '.dsh-cwd-patch-target'), 'isolated-cwd-patch-target' + String.fromCharCode(10))
  for (const file of manifest.compiled) {
    await mkdir(dirname(join(root, file.path)), { recursive: true })
    await cp(join(hostRoot, file.path), join(root, file.path))
  }
  const first = join(root, manifest.compiled[0].path)
  const before = await readFile(first, 'utf8')
  await applyInitialCwdPatch({ targetRoot: root, mode: 'compiled', check: true })
  assert.equal(await readFile(first, 'utf8'), before)
  const last = join(root, manifest.compiled.at(-1).path)
  await writeFile(last, (await readFile(last, 'utf8')) + 'drift')
  await assert.rejects(applyInitialCwdPatch({ targetRoot: root, mode: 'compiled' }), /baseline SHA-256 mismatch/)
  assert.equal(await readFile(first, 'utf8'), before)
})

test('offline patch refuses a dependency symlink escaping the marked isolated target', options, async t => {
  const { applyInitialCwdPatch } = await import('../host-patches/apply-initial-cwd.ts')
  const root = await mkdtemp(join(tmpdir(), 'dsh-cwd-link-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(join(root, '.dsh-cwd-patch-target'), 'isolated-cwd-patch-target' + String.fromCharCode(10))
  await symlink(join(hostRoot, 'node_modules'), join(root, 'node_modules'))
  await assert.rejects(applyInitialCwdPatch({ targetRoot: root, mode: 'compiled' }), /file outside independent target/)
})

test('native first continuable cwd becomes actual frozen Agent session header and JSONL header', options, async t => {
  const f = await fixture(t)
  const started = await f.start(f.pathB)
  const child = f.ctx.agents.get(started.childId)
  assert(child, 'real AgentRegistry must publish a child')
  assert.equal(child.constructor.name, 'ReactLoopAgent')
  assert.equal(child.session.header.cwd, f.pathB)
  assert(Object.isFrozen(child.session.header))
  assert.equal((await f.ctx.sessionPersistence.stat(started.childId)).header.cwd, f.pathB)
})
