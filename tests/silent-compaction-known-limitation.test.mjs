import assert from 'node:assert/strict'
import { createRequire, registerHooks } from 'node:module'
import { isAbsolute, join } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'

const root = process.env.DSH_CONTROLS_HOST_ROOT
const options = { skip: !root && 'set DSH_CONTROLS_HOST_ROOT for the exact-host limitation probe' }

// This records a host limitation, not silent-mode acceptance. The actual native
// compactor runs on a disposable, in-memory Session. A fake LLM captures the
// request and stops at the LLM boundary; no Profile, external service or network is used.
test('DSH alpha.2 diagnostic: observe native compactRegion declarations after shadowing the owned body', options, async t => {
  assert(isAbsolute(root))
  const require = createRequire(join(root, 'package.json'))
  const load = name => import(pathToFileURL(require.resolve(name)).href)
  assert.equal(require('./package.json').version, '0.2.3-alpha.2')
  for (const name of ['@deepseek-ai/dsh-compaction-basic', '@deepseek-ai/dsh-session', '@deepseek-ai/dsh-session-projection', '@deepseek-ai/dsh-llm']) {
    assert.equal(require(name + '/package.json').version, '0.2.3-alpha.2')
  }
  const source = new URL('../src/', import.meta.url).href
  const hook = registerHooks({ resolve(specifier, context, next) {
    if (context.parentURL?.startsWith(source)) {
      if (specifier.startsWith('@deepseek-ai/')) return { url: pathToFileURL(require.resolve(specifier)).href, shortCircuit: true }
      if (specifier.startsWith('./') && specifier.endsWith('.js')) specifier = specifier.slice(0, -3) + '.ts'
    }
    return next(specifier, context)
  } })
  let stripOwnedCollaborationReplay
  try {
    ;({ stripOwnedCollaborationReplay } = await import('../src/silent-replay.ts'))
  } finally { hook.deregister() }
  const [{ Context }, { SessionStore, SessionId }, { SessionProjectionRegistry }, { BasicCompactionEngine }, { createUserMessage }] = await Promise.all([
    load('@deepseek-ai/cordis'), load('@deepseek-ai/dsh-session'), load('@deepseek-ai/dsh-session-projection'),
    load('@deepseek-ai/dsh-compaction-basic'), load('@deepseek-ai/dsh-llm'),
  ])

  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  const captured = []
  const stop = new Error('offline capture: do not dispatch the compaction model call')
  ctx.provide('llm', { async *stream(request) { captured.push(request); throw stop } })
  ctx.provide('tokenMeter', { measure(session) {
    return { nodes: session.surface.nodes.map(seq => ({ seq, tokens: 10_000, heuristicTokens: 10_000 })) }
  } })
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(BasicCompactionEngine, { auto: false })
  const session = ctx.sessions.create(SessionId('silent-compaction-limitation'), { meta: { cwd: '/synthetic' } })
  const config = { provider: 'offline-fake', model: 'offline-fake' }
  const schema = { name: 'mattpocock_record', description: 'HISTORICAL_COLLABORATION_TOOL_SCHEMA', parameters: { type: 'object' } }
  session.append('request/header', { reason: 'initial', header: { config, tools: [schema] } })
  const user = (text, source = { kind: 'user' }) => session.append('user/message', createUserMessage({ source, content: [{ type: 'text', text }] }), { surfaceOp: 'append' })
  const first = user('Unrelated user context before.')
  const body = 'HISTORICAL_COLLABORATION_RUNTIME_BODY'
  const owned = user(body, { kind: 'mattpocock-controls', form: 'snapshot', sections: [{ name: 'collaboration-instrument', text: body }] })
  const last = user('Unrelated user context after.')
  session.append('turn/start', { turn: 1 })

  // Match the gap before the normal AgentLoop commits the requested series reset.
  assert.deepEqual(stripOwnedCollaborationReplay(session, { turn: 1, step: 1 }), { startsRequestSeries: true, unsupported: [] })
  assert.deepEqual(session.eventAt(owned.seq), owned, 'original event stays in the raw log')
  await assert.rejects(ctx.compaction.compactRegion(first.seq, last.seq, { session, options: config }), error => error === stop)
  assert.equal(captured.length, 1)
  const [request] = captured
  assert.equal(request.purpose, 'compaction')
  assert.equal(request.sessionId, session.id)
  const actualText = request.messages.flatMap(message => message.content.flatMap(block => block.type === 'text' ? [block.text] : []))
  assert(actualText.every(text => !text.includes(body)), 'already-shadowed owned context is absent in the auxiliary request')
  assert(actualText.includes('Unrelated user context before.'))
  assert(actualText.includes('Unrelated user context after.'))
  const tools = request.tools?.map(tool => tool.name) ?? []
  const history = request.toolHistory?.tools?.map(tool => tool.name) ?? []
  t.diagnostic(`Unfiltered native compaction declarations: ${JSON.stringify({ tools, history })}`)
})
