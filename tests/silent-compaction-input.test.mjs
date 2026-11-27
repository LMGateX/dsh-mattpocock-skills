import assert from 'node:assert/strict'
import { createRequire, registerHooks } from 'node:module'
import { isAbsolute, join } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'

const root = process.env.DSH_CONTROLS_HOST_ROOT
const options = { skip: !root && 'set DSH_CONTROLS_HOST_ROOT for exact-host compaction tests' }
let load, projectSilentCompactionInput
if (root) {
  assert(isAbsolute(root))
  const require = createRequire(join(root, 'package.json'))
  load = name => import(pathToFileURL(require.resolve(name)).href)
  assert.equal(require('./package.json').version, '0.2.3-alpha.2')
  for (const name of ['dsh-compaction-basic', 'dsh-session', 'dsh-session-projection', 'dsh-llm', 'dsh-tool-executor-ptc']) {
    assert.equal(require(`@deepseek-ai/${name}/package.json`).version, '0.2.3-alpha.2')
  }
  const source = new URL('../src/', import.meta.url).href
  const hook = registerHooks({ resolve(specifier, context, next) {
    if (context.parentURL?.startsWith(source)) {
      if (specifier.startsWith('@deepseek-ai/')) return { url: pathToFileURL(require.resolve(specifier)).href, shortCircuit: true }
      if (specifier.startsWith('./') && specifier.endsWith('.js')) specifier = specifier.slice(0, -3) + '.ts'
    }
    return next(specifier, context)
  } })
  try {
    ;({ projectSilentCompactionInput } = await import('../src/silent-compaction.ts'))
  } finally { hook.deregister() }
}

const sessionId = 'native-silent-compaction-input'
const config = { provider: 'offline', model: 'offline' }
const usage = { inputTokens: 100, outputTokens: 2 }
const schema = name => ({ name, description: `Definition for ${name}`, parameters: { type: 'object' } })
const toolNames = options => options.tools.map(x => x.name).sort()
const update = (type, toolName) => ({ type, toolName })
const developerBlocks = options => options.messages.filter(message => message.role === 'developer').flatMap(message => message.content)

async function startNativeCompactor(t, { send } = {}) {
  const [{ Context }, { SessionStore, SessionId }, { SessionProjectionRegistry }, { BasicCompactionEngine }, sdk] = await Promise.all([
    'cordis', 'dsh-session', 'dsh-session-projection', 'dsh-compaction-basic', 'dsh-llm',
  ].map(name => load(`@deepseek-ai/${name}`)))
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  await ctx.plugin(sdk.LlmRuntime)
  const adapter = [], downstream = [], inputs = []
  ctx.llm.registerAdapter([config.provider], new class extends sdk.LlmAdapter {
    async resolveModel(provider, id) { return { provider, id, name: id, toolUpdate: 'in-history' } }
    async *stream(request) {
      adapter.push(request)
      if (send) yield* send(request)
      else {
        yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Summary' } }
        yield { type: 'usage', usage }
        yield { type: 'finish', reason: { kind: 'stop' } }
      }
    }
  }())
  ctx.on('llm/stream', (request, next) => {
    downstream.push(request)
    return next()
  })
  // Exercise the exact native continuation; this is not a replacement stream.
  ctx.on('llm/stream', (request, next) => {
    if (request.purpose === 'compaction' && request.sessionId === sessionId) {
      assert.equal(Object.isFrozen(request), false)
      const before = structuredClone({ tools: request.tools, toolHistory: request.toolHistory, messages: request.messages })
      const projection = projectSilentCompactionInput(request)
      assert.deepEqual({ tools: request.tools, toolHistory: request.toolHistory, messages: request.messages }, before, 'the projector is pure')
      inputs.push(before)
      if (projection !== null) Object.assign(request, projection)
    }
    return next()
  }, true)
  ctx.provide('tokenMeter', {
    measure(session) { return { nodes: session.surface.nodes.map(seq => ({ seq, tokens: 10000, heuristicTokens: 10000 })) } },
    estimateMessage() { return 100 },
  })
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(BasicCompactionEngine, { auto: false })
  const session = ctx.sessions.create(SessionId(sessionId), { meta: { cwd: '/synthetic' } })
  const header = (reason, ...names) => session.append('request/header', { reason, header: { config, tools: names.map(schema) } })
  const user = (text, source = { kind: 'user' }) => session.append('user/message', sdk.createUserMessage({ source, content: [{ type: 'text', text }] }), { surfaceOp: 'append' })
  const developer = (content, headerSeq) => session.append('developer/message', {
    turn: 1, step: 1, message: sdk.createDeveloperMessage({ source: { kind: 'tool-registry' }, content }),
    ...(headerSeq === undefined ? {} : { headerSeq }),
  }, { surfaceOp: 'append' })
  const compact = (first, last, signal) => ctx.compaction.compactRegion(first.seq, last.seq, { session, options: config }, signal)
  return { ctx, session, sdk, header, user, developer, compact, inputs, downstream, adapter }
}

test('native compaction filters declarations and replayed updates before downstream middleware and the adapter', options, async t => {
  const { session, header, user, developer, compact, inputs, downstream, adapter } = await startNativeCompactor(t)
  header('initial', 'bash', 'mattpocock_record', 'mattpocock_other_extension')
  const first = user('Ordinary user context mentions mattpocock_record.')
  session.append('turn/start', { turn: 1 })
  const mixed = header('change', 'bash', 'mattpocock_record', 'mattpocock_other_extension', 'mattpocock_delegate', 'read')
  developer([update('tool-addition', 'mattpocock_delegate'), update('tool-addition', 'read')], mixed.seq)
  const ownedOnly = header('change', 'bash', 'mattpocock_record', 'mattpocock_other_extension', 'mattpocock_delegate', 'read', 'mattpocock_audit')
  developer([update('tool-addition', 'mattpocock_audit')], ownedOnly.seq)
  header('change', 'bash', 'mattpocock_other_extension', 'mattpocock_delegate', 'mattpocock_audit')
  developer([update('tool-removal', 'mattpocock_record'), update('tool-removal', 'read')])
  const last = user('Unrelated final turn material.')
  const original = session.snapshotEvents()

  await compact(first, last)

  assert.equal(inputs.length, 1)
  assert.deepEqual(toolNames(inputs[0]), ['bash', 'mattpocock_audit', 'mattpocock_delegate', 'mattpocock_other_extension'])
  assert.equal(downstream.length, 1)
  assert.deepEqual(toolNames(downstream[0]), ['bash', 'mattpocock_other_extension'])
  assert.equal(adapter.length, 1)
  assert.deepEqual(toolNames(adapter[0]), ['bash', 'mattpocock_other_extension', 'read'], 'in-history route still sees unrelated historical definition')
  for (const request of [downstream[0], adapter[0]]) {
    assert.deepEqual(developerBlocks(request), [update('tool-addition', 'read'), update('tool-removal', 'read')])
    assert.equal(request.sessionId, session.id)
    assert.equal(request.purpose, 'compaction')
    assert.equal(request.provider, config.provider)
    assert.equal(request.model, config.model)
    assert.match(request.messages[0].content[0].text, /mentions mattpocock_record/)
  }
  const events = session.snapshotEvents()
  assert.deepEqual(events.slice(0, original.length), original, 'no original record or header was mutated')
  assert.deepEqual(toolNames(session.requestHeader()), toolNames(inputs[0]))
  const summary = events.find(event => event.type === 'compaction/summary')
  assert.equal(summary.data.llmStreamCall, true)
  assert.deepEqual(summary.data.usage, usage)
  assert.equal(events.at(-1).type, 'compaction/end')
})

test('compaction removes only attributed collaboration content and keeps unrelated prompt sections, chat and source identities', options, async t => {
  const { session, sdk, header, user, compact, downstream, adapter } = await startNativeCompactor(t)
  const { renderToolsSdk } = await load('@deepseek-ai/dsh-tool-executor-ptc')
  const nativeTool = { ...schema('read'), output: { type: 'string' } }
  const ownedTool = { ...schema('mattpocock_record'), output: { type: 'string' } }
  const oldSdk = renderToolsSdk([nativeTool, ownedTool], 'function-body')
  const nativeSdk = renderToolsSdk([nativeTool], 'function-body')
  const systemMessage = sdk.createMessage({
    role: 'system',
    content: ['Native instructions mention mattpocock_record.', oldSdk].map(text => ({ type: 'text', text })),
    source: { kind: 'system-prompt', reset: true, sections: [
      { state: 'active', name: 'native-context', order: 1, contentIndex: 0 },
      { state: 'active', name: 'tools:sdk', order: 2, contentIndex: 1 },
    ] },
  })
  session.append('system/message', { turn: 1, step: 1, message: systemMessage }, { surfaceOp: 'append' })
  header('initial', 'run_code')
  session.append('turn/start', { turn: 1 })
  const first = user('An ordinary user quotes OWNED_SNAPSHOT verbatim.')
  user('OWNED_SNAPSHOT', { kind: 'mattpocock-controls', form: 'snapshot', sections: [{ name: 'collaboration-instrument', text: 'OWNED_SNAPSHOT' }] })
  user('OWNED_NOTICE', { kind: 'mattpocock-controls-notification', form: 'notice', summary: 'Fixture', notificationId: 'N', ownerSessionId: session.id, instrumentInstanceId: 'I', authorPrincipalId: 'p', businessRevision: 1 })
  const keptSection = { name: 'workspace', text: 'Unrelated workspace context.' }
  const ownedSection = { name: 'mattpocock-controls', text: 'OWNED_POINTER' }
  const source = { kind: 'runtime-context', form: 'snapshot', sections: [ownedSection, keptSection] }
  const reminder = inner => `<system-reminder>\nThe following information describes your current session:\n\n${inner}\n</system-reminder>`
  const mixed = user(reminder('OWNED_POINTER\n\nUnrelated workspace context.'), source)
  const formatUnknown = user('NONCANONICAL WRAPPER - OWNED_POINTER', source)
  const last = user('Unrelated final turn material.')
  const original = session.snapshotEvents()

  await compact(first, last)

  for (const request of [downstream[0], adapter[0]]) {
    const [system, quote, projected, unknown, retained, prompt] = request.messages
    assert.equal(request.messages.length, 6)
    assert.equal(system.id, systemMessage.id)
    assert.deepEqual(system.source, systemMessage.source)
    assert.deepEqual(system.content.map(block => block.text), ['Native instructions mention mattpocock_record.', nativeSdk])
    assert.deepEqual(quote, first.data)
    assert.equal(projected.id, mixed.data.id)
    assert.deepEqual(projected.source, { ...source, sections: [keptSection] })
    assert.equal(projected.content[0].text, reminder('Unrelated workspace context.'))
    assert.deepEqual(unknown, formatUnknown.data, 'unverified formats are not rewritten')
    assert.deepEqual(retained, last.data)
    assert.equal(prompt.source, undefined, 'identity-free compaction instruction is not rewritten')
  }
  assert.deepEqual(session.snapshotEvents().slice(0, original.length), original)
})

test('auxiliary request projection leaves conversation, other purposes, and immutable envelopes untouched', options, async () => {
  const { markAgentLoopRequest } = await load('@deepseek-ai/dsh-llm')
  const input = { ...config, messages: [], tools: [schema('mattpocock_record')] }
  for (const request of [input, { ...input, purpose: 'title' }, Object.freeze({ ...input, purpose: 'compaction' }),
    markAgentLoopRequest({ ...input, purpose: 'compaction' })]) {
    assert.equal(projectSilentCompactionInput(request), null)
    assert.deepEqual(toolNames(request), ['mattpocock_record'])
  }
  assert.equal(projectSilentCompactionInput({ ...input, purpose: 'compaction', tools: [schema('read')] }), null)
})

test('cancellation crosses the native continuation without replacing the stream or committing a summary', options, async t => {
  const abort = new AbortController()
  const entered = Promise.withResolvers()
  const { session, header, user, compact, downstream, adapter } = await startNativeCompactor(t, { async *send(request) {
    const wait = new Promise((_, reject) => {
      request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true })
    })
    entered.resolve()
    await wait
  } })
  header('initial', 'mattpocock_record', 'read')
  session.append('turn/start', { turn: 1 })
  const first = user('First retained input.')
  const last = user('Last retained input.')
  const original = session.snapshotEvents()
  const pending = compact(first, last, abort.signal)
  await Promise.race([entered.promise, pending])
  abort.abort(new DOMException('Stopped by test', 'AbortError'))
  await assert.rejects(pending, /Stopped by test/)
  assert.equal(downstream.length, 1)
  assert.equal(adapter.length, 1)
  for (const request of [downstream[0], adapter[0]]) {
    assert.equal(request.signal, abort.signal)
    assert.deepEqual(toolNames(request), ['read'])
  }
  const events = session.snapshotEvents()
  assert.deepEqual(events.slice(0, original.length), original)
  assert.deepEqual(events.slice(original.length).map(event => event.type), ['compaction/start', 'compaction/end'])
  assert.match(events.at(-1).data.error, /Stopped by test/)
})

test('native compaction retries a recovered request through the same projected continuation', options, async t => {
  let calls = 0
  const { ctx, session, sdk, header, user, compact, downstream, adapter } = await startNativeCompactor(t, { async *send() {
    if (++calls === 1) throw new Error('Offline first attempt')
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Recovered summary' } }
    yield { type: 'usage', usage }
    yield { type: 'finish', reason: { kind: 'stop' } }
  } })
  header('initial', 'read', 'mattpocock_record')
  session.append('turn/start', { turn: 1 })
  const first = user('Unchanged first input.')
  const middle = user('Original middle input.')
  const last = user('Unchanged last input.')
  let recoveries = 0
  ctx.on('compaction/summary-error', ({ session: caller, error }, next) => {
    if (caller !== session || !String(error).includes('Offline first attempt')) return next()
    recoveries++
    const message = sdk.createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Native recovery replaced middle input.' }] })
    session.append('user/message', message, {
      surfaceOp: { op: 'replace', startSeq: middle.seq, endSeq: middle.seq }, sourceEventSeqs: [middle.seq],
    })
    return true
  })

  await compact(first, last)

  assert.equal(recoveries, 1)
  assert.deepEqual(downstream.map(toolNames), [['read'], ['read']])
  assert.deepEqual(adapter.map(toolNames), [['read'], ['read']])
  assert.equal(adapter[0].messages[1].content[0].text, 'Original middle input.')
  assert.equal(adapter[1].messages[1].content[0].text, 'Native recovery replaced middle input.')
  assert.deepEqual(session.eventAt(middle.seq), middle)
  const events = session.snapshotEvents()
  assert.equal(events.filter(event => event.type === 'compaction/start').length, 1)
  assert.equal(events.filter(event => event.type === 'compaction/end').length, 1)
  assert.deepEqual(events.filter(event => event.type === 'compaction/summary').map(event => event.data.usage), [usage])
})
