import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, isAbsolute } from 'node:path'
import { executeRegistryTool } from './fixtures/nested-tool.mjs'
import { pathToFileURL } from 'node:url'

// Real installed-host native cwd seam: the current SDK's startActivation carries the
// initial directory. This plugin loads no replacement provider, so these probes do not
// stage the retired 0.2.1-alpha.1 artifact or host patches.
const hostRoot = process.env.DSH_CONTROLS_HOST_ROOT
const options = { skip: !hostRoot && 'set DSH_CONTROLS_HOST_ROOT to run real native activation cwd probes' }
const signal = () => new AbortController().signal
let sdk, load
if (hostRoot) {
  assert(isAbsolute(hostRoot))
  const require = createRequire(pathToFileURL(join(hostRoot, 'package.json')))
  load = name => import(pathToFileURL(require.resolve(name)).href)
  sdk = { ...await load('@deepseek-ai/cordis'), ...await load('@deepseek-ai/dsh-agent'),
    ...await load('@deepseek-ai/dsh-session'), ...await load('@deepseek-ai/dsh-agent-loop'),
    ...await load('@deepseek-ai/dsh-session-projection'), ...await load('@deepseek-ai/dsh-system-prompt'),
    ...await load('@deepseek-ai/dsh-tools'), ...await load('@deepseek-ai/dsh-typert-registry'),
    Subagents: (await load('@deepseek-ai/dsh-subagent')).default,
    jsonl: await load('@deepseek-ai/dsh-session-persistence-jsonl'),
    Query: (await load('@deepseek-ai/dsh-session-query-sqlite')).default,
    LocalFs: (await load('@deepseek-ai/dsh-fs-local')).default,
    fsTools: await load('@deepseek-ai/dsh-tool-fs'),
    ToolExecutor: await load('@deepseek-ai/dsh-tool-executor-native'),
    WorkingDirectory: (await load('@deepseek-ai/dsh-working-directory')).default }
}

async function fixture(t, { prepare = async () => ({}) } = {}) {
  const temp = await mkdtemp(join(tmpdir(), 'dsh-native-cwd-'))
  const pathA = await realpath(await mkdir(join(temp, 'A'), { recursive: true }))
  const pathB = await realpath(await mkdir(join(temp, 'B'), { recursive: true }))
  await writeFile(join(pathA, 'marker.txt'), 'A native tool')
  await writeFile(join(pathB, 'marker.txt'), 'B native tool')
  const ctx = new sdk.Context()
  let modelCalls = 0
  const activations = []
  let release = Promise.withResolvers()
  const releases = [release]
  t.after(async () => {
    for (const item of releases) item.resolve({ kind: 'reject' })
    for (const activation of activations.reverse()) { try { await activation.dispose() } catch {} }
    await parentHandle.dispose()
    await ctx.fiber.dispose()
    assert.equal(modelCalls, 0, 'no model adapter or model request may run')
    await rm(temp, { recursive: true, force: true })
  })
  await ctx.plugin(sdk.TypertRegistry)
  await ctx.plugin(sdk.SessionStore)
  await ctx.plugin(sdk.AgentRegistry)
  await ctx.plugin(sdk.SessionProjectionRegistry)
  await ctx.plugin(sdk.SystemPrompt, {})
  await ctx.plugin(sdk.ToolRuntime, {})
  await ctx.plugin(sdk.ToolExecutor)
  await sdk.jsonl.apply(ctx, { root: join(temp, 'sessions'), compression: 'none' })
  await ctx.plugin(sdk.Query, { path: join(temp, 'query.sqlite'), openAt: 'never' })
  ctx.provide('llm', { prepareCall() { modelCalls++; throw new Error('model prohibited') }, stream() { modelCalls++; throw new Error('model prohibited') } })
  await ctx.plugin(sdk.LocalFs, { cwd: pathA, diffBasisMaxBytes: 10485760 })
  await ctx.plugin(sdk.fsTools, { readLimit: 2000, readMaxLineLength: 10000, readMaxBytes: 100000, readStreamMinSize: 10000000 })
  await ctx.plugin(sdk.WorkingDirectory, { defaultDirectory: pathA })
  await ctx.plugin(sdk.AgentLoop, { agents: [], maxParallelToolCalls: 10 })
  await ctx.plugin(sdk.Subagents, { maxDepth: 5, maxActiveSubagents: 20 })
  const unregister = ctx.subagents.registerProvider({ name: 'controlled',
    capabilities: { agentOptions: false, agentPreset: false, outputSchema: false, depthLimit: true },
    inheritsParentContext: false, async prepareContinuable(request) { return prepare(request) } })
  await ctx.fiber.await()
  const parentHandle = await ctx.agents.create({ sessionId: 'parent', meta: { cwd: pathA } })
  const parent = parentHandle.agent
  const start = async (cwd, extra = {}) => {
    const activation = await ctx.subagents.startActivation({ provider: 'controlled', label: 'native cwd probe',
      request: { parent, prompt: [{ type: 'text', text: 'No model. Controlled native inbox.' }], maxDepth: 5, ...(cwd === undefined ? {} : { cwd }) },
      signal: signal(), delivery: 'parent', ...extra })
    activations.push(activation)
    return activation
  }
  return { ctx, parent, pathA, pathB, start, temp, unregister,
    releaseStep() { release.resolve({ kind: 'reject' }) },
    pauseStep() { release = Promise.withResolvers(); releases.push(release) } }
}

test('native activation relative read resolves independently for two real child Agents in A and B', options, async t => {
  const f = await fixture(t)
  const [a, b] = await Promise.all([f.start(f.pathA), f.start(f.pathB)])
  const read = childId => executeRegistryTool(f.ctx, { callId: 'read-' + childId, name: 'read', arguments: { file_path: 'marker.txt' }, agent: f.ctx.agents.get(childId), signal: signal() }, load)
  const [resultA, resultB] = await Promise.all([read(a.childId), read(b.childId)])
  assert.equal(resultA.isError, false, JSON.stringify(resultA))
  assert.equal(resultB.isError, false, JSON.stringify(resultB))
  assert.equal(resultA.value.lines[0].text, 'A native tool')
  assert.equal(resultB.value.lines[0].text, 'B native tool')
  assert.equal(resultA.value.path, join(f.pathA, 'marker.txt'))
  assert.equal(resultB.value.path, join(f.pathB, 'marker.txt'))
  assert.equal(f.parent.session.header.cwd, f.pathA)
})

test('native activation records B as the effective child working directory and preserves the inherited header source value', options, async t => {
  const f = await fixture(t)
  const started = await f.start(f.pathB)
  const child = f.ctx.agents.get(started.childId)
  assert(child, 'real AgentRegistry must publish a child')
  assert.equal(child.constructor.name, 'ReactLoopAgent')
  // The current host records the chosen initial directory in the session's
  // working-directory projection; the child header cwd remains the source
  // value inherited from the parent, matching the plugin's headerCwd contract.
  assert.equal(f.ctx.workingDirectory.get(child.session), f.pathB)
  assert.equal(child.session.header.cwd, f.pathA)
  assert(Object.isFrozen(child.session.header))
  assert(child.session.ownEvents().some(event => event.type === 'working-directory/change' && event.data.cwd === f.pathB))
  assert.equal((await f.ctx.sessionPersistence.stat(started.childId)).header.cwd, f.pathA)
})

test('first activation cwd is captured before awaited prepare while omitted cwd retains A inheritance', options, async t => {
  const ready = Promise.withResolvers(), proceed = Promise.withResolvers()
  const f = await fixture(t, { prepare: async () => { ready.resolve(); await proceed.promise; return {} } })
  const spec = { provider: 'controlled', label: 'capture', childId: 'captured', request: { parent: f.parent, prompt: [{ type: 'text', text: 'captured B' }], maxDepth: 5, cwd: f.pathB }, signal: signal(), delivery: 'parent' }
  const operation = f.ctx.subagents.startActivation(spec)
  await ready.promise
  spec.request.cwd = f.pathA
  proceed.resolve()
  const created = await operation
  assert.equal(f.ctx.workingDirectory.get(f.ctx.agents.get(created.childId).session), f.pathB)
  await created.dispose()
  const inherited = await f.start(undefined)
  assert.equal(f.ctx.workingDirectory.get(f.ctx.agents.get(inherited.childId).session), f.pathA)
  assert.equal(f.parent.session.header.cwd, f.pathA)
})

test('invalid absolute first cwd rejects without publishing a live child', options, async t => {
  const f = await fixture(t)
  let index = 0
  for (const cwd of [join(f.temp, 'missing'), join(f.pathA, 'marker.txt')]) {
    index += 1
    await assert.rejects(f.start(cwd, { childId: 'invalid-child-' + index }), /directory does not exist|does not exist|not a directory/)
    assert.equal(f.ctx.agents.get('invalid-child-' + index), undefined)
  }
})
