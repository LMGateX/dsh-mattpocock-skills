import assert from 'node:assert/strict'
import { createRequire, registerHooks } from 'node:module'
import { isAbsolute, join } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'

const root = process.env.DSH_CONTROLS_HOST_ROOT
const options = { skip: !root && 'set DSH_CONTROLS_HOST_ROOT for installed-host replay tests' }
let replay, Session, SessionId, sdk, renderToolsSdk, load
if (root) {
  assert(isAbsolute(root))
  const require = createRequire(join(root, 'package.json'))
  load = name => import(pathToFileURL(require.resolve(name)).href)
  assert.equal(require('./package.json').version, '0.2.3-alpha.2')
  for (const name of ['@deepseek-ai/dsh-session', '@deepseek-ai/dsh-llm']) {
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
  try {
    replay = await import('../src/silent-replay.ts')
    ;({ Session, SessionId } = await load('@deepseek-ai/dsh-session'))
    sdk = await load('@deepseek-ai/dsh-llm')
    assert.equal(require('@deepseek-ai/dsh-tool-executor-ptc/package.json').version, '0.2.3-alpha.2')
    ;({ renderToolsSdk } = await load('@deepseek-ai/dsh-tool-executor-ptc'))
  } finally { hook.deregister() }
}

const blocks = text => [{ type: 'text', text }]
const user = (session, text, source = { kind: 'user' }) =>
  session.append('user/message', sdk.createUserMessage({ content: blocks(text), source }), { surfaceOp: 'append' })
const visible = session => session.deriveMessages().map(message => message.content[0]?.text)

test('shadow exact standalone collaboration context without deleting or rewriting the raw chat, including cold replay', options, () => {
  const session = Session.create(SessionId('owner'))
  user(session, 'A human discusses mattpocock-controls.')
  const owned = [
    user(session, 'OWNED_SNAPSHOT', { kind: 'mattpocock-controls', form: 'snapshot', sections: [{ name: 'collaboration-instrument', text: 'OWNED_SNAPSHOT' }] }),
    user(session, 'OWNED_NOTICE', { kind: 'mattpocock-controls-notification', form: 'notice', summary: 'Update', notificationId: 'N', ownerSessionId: 'owner', instrumentInstanceId: 'I', authorPrincipalId: 'p', businessRevision: 1 }),
    user(session, 'OWNED_SUPERVISION', { kind: 'mattpocock-controls-supervision', form: 'notice', summary: 'Alert', episodeId: 'A', ownerSessionId: 'owner', severity: 'alert' }),
  ]
  user(session, 'unknown source form', { kind: 'mattpocock-controls', form: 'future' })
  user(session, 'ordinary other source', { kind: 'unrelated-mattpocock-controls' })
  const raw = session.snapshotEvents()
  for (const event of owned) assert.equal(replay.isOwnedCollaborationReplayMessage(event.data), true)
  assert.equal(replay.isOwnedCollaborationReplayMessage(raw[0].data), false)
  assert.equal(replay.stripOwnedCollaborationReplay(session).startsRequestSeries, true)
  assert.deepEqual(visible(session), ['A human discusses mattpocock-controls.', 'unknown source form', 'ordinary other source'])
  assert.deepEqual(session.snapshotEvents().slice(0, raw.length), raw, 'old raw events retained byte for byte')
  const cold = Session.create(SessionId('cold'), session.snapshotEvents())
  assert.deepEqual(visible(cold), visible(session))
  const position = cold.seq
  assert.equal(replay.stripOwnedCollaborationReplay(cold).startsRequestSeries, false)
  assert.equal(cold.seq, position, 'already silent history must not grow')
})

test('a structured runtime-context node keeps its unrelated sections and unknown formats remain untouched', options, () => {
  const session = Session.create(SessionId('mixed'))
  const retained = { name: 'workspace', text: 'Root: /example; says mattpocock_record is a historical subject.' }
  const owned = { name: 'mattpocock-controls', text: 'OWNED_POINTER' }
  const next = { name: 'other', text: 'OTHER FACT' }
  const source = { kind: 'runtime-context', form: 'snapshot', sections: [retained, owned, next] }
  const mixed = user(session, '<system-reminder>\nThe following information describes your current session:\n\nRoot: /example; says mattpocock_record is a historical subject.\n\nOWNED_POINTER\n\nOTHER FACT\n</system-reminder>', source)
  user(session, 'I, the user, quote OWNED_POINTER verbatim.')
  const unknown = user(session, 'NONCANONICAL WRAPPER - OWNED_POINTER', source)
  const raw = session.snapshotEvents()
  const result = replay.stripOwnedCollaborationReplay(session, { turn: 1, step: 1 })
  assert.deepEqual(result, { startsRequestSeries: true, unsupported: ['runtime-context-format'] })
  assert.deepEqual(visible(session), ['<system-reminder>\nThe following information describes your current session:\n\nRoot: /example; says mattpocock_record is a historical subject.\n\nOTHER FACT\n</system-reminder>', 'I, the user, quote OWNED_POINTER verbatim.', 'NONCANONICAL WRAPPER - OWNED_POINTER'])
  assert.deepEqual(session.deriveMessages()[0].source.sections, [retained, next])
  assert.deepEqual(session.eventAt(mixed.seq), mixed)
  assert.deepEqual(session.eventAt(unknown.seq), unknown)
  assert.deepEqual(session.snapshotEvents().slice(0, raw.length), raw)
  const cold = Session.create(SessionId('cold-mixed'), session.snapshotEvents())
  assert.deepEqual(visible(cold), visible(session))
  assert.deepEqual(replay.stripOwnedCollaborationReplay(cold), { startsRequestSeries: false, unsupported: ['runtime-context-format'] })
})

test('detect historical native declarations in a cold addition series, then stop asking for a reset', options, () => {
  const session = Session.create(SessionId('history'))
  const schema = name => ({ name, description: `definition for ${name}`, parameters: { type: 'object', properties: {} } })
  const config = { provider: 'fake', model: 'fake' }
  const unrelated = [schema('bash'), schema('mattpocock_other_extension')]
  session.append('request/header', { reason: 'initial', header: { config, tools: unrelated } })
  const addition = session.append('request/header', { reason: 'change', header: { config, tools: [...unrelated, schema('mattpocock_delegate')] } })
  const update = (content, headerSeq) => session.append('developer/message', { turn: 1, step: 1, message: sdk.createDeveloperMessage({ source: { kind: 'tool-registry' }, content }), ...(headerSeq === undefined ? {} : { headerSeq }) }, { surfaceOp: 'append' })
  update([{ type: 'tool-addition', toolName: 'mattpocock_delegate' }], addition.seq)
  session.append('request/header', { reason: 'change', header: { config, tools: unrelated } })
  update([{ type: 'tool-removal', toolName: 'mattpocock_delegate' }])
  const cold = Session.create(SessionId('cold-tools'), session.snapshotEvents())
  const visibleTools = () => sdk.projectToolUpdates(cold.deriveMessages(), unrelated, 'in-history', cold.toolHistory()).tools.map(tool => tool.name)
  assert.deepEqual(visibleTools(), ['bash', 'mattpocock_other_extension', 'mattpocock_delegate'], 'a normal removal still exposes its historical schema to this route')
  const seq = cold.seq
  assert.deepEqual(replay.stripOwnedCollaborationReplay(cold), { startsRequestSeries: true, unsupported: [] })
  assert.equal(cold.seq, seq, 'the helper requests a series reset; only the native loop writes its header')
  cold.append('request/header', { reason: 'series', header: { config, tools: unrelated } })
  assert.deepEqual(visibleTools(), ['bash', 'mattpocock_other_extension'])
  assert.deepEqual(replay.stripOwnedCollaborationReplay(cold), { startsRequestSeries: false, unsupported: [] })
})

test('a mixed historical system prompt shadows only supported collaboration bindings in its attributed PTC SDK block', options, () => {
  const session = Session.create(SessionId('ptc'))
  const params = { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }
  const native = { name: 'read', description: 'Read a selected path; a human could mention mattpocock_record here.', parameters: params, output: { type: 'string' } }
  const owned = { name: 'mattpocock_record', description: 'OWNED PTC DOC', parameters: params, output: { type: 'string' } }
  const oldSdk = renderToolsSdk([native, owned], 'function-body')
  const nativeSdk = renderToolsSdk([native], 'function-body')
  const userNote = 'A native system instruction mentions mattpocock_record and must remain.'
  const old = session.append('system/message', { turn: 1, step: 1, message: sdk.createMessage({
    role: 'system', content: [...blocks(userNote), ...blocks('Native notice.'), ...blocks(oldSdk)],
    source: { kind: 'system-prompt', reset: true, sections: [
      { state: 'active', name: 'unrelated', order: 1, contentIndex: 0 },
      { state: 'active', name: 'tools:sdk', order: 2, contentIndex: 2, noticeIndex: [1] },
    ] },
  }) }, { surfaceOp: 'append' })
  user(session, 'Ordinary human conversation with mattpocock_record.')
  const unknown = oldSdk.replace('interface ToolOutputMap {', 'interface ToolOutputMapVNext {')
  session.append('system/message', { turn: 2, step: 1, message: sdk.createMessage({
    role: 'system', content: blocks(unknown),
    source: { kind: 'system-prompt', sections: [{ state: 'active', name: 'tools:sdk', order: 2, contentIndex: 0 }] },
  }) }, { surfaceOp: 'append' })
  const raw = session.snapshotEvents()
  assert.deepEqual(replay.stripOwnedCollaborationReplay(session), { startsRequestSeries: true, unsupported: ['ptc-sdk-format'] })
  const [revised] = session.deriveMessages()
  assert.equal(revised.role, 'system')
  assert.deepEqual(revised.content.flatMap(block => block.text), [userNote, 'Native notice.', nativeSdk])
  assert.deepEqual(session.eventAt(old.seq), old)
  assert.deepEqual(session.snapshotEvents().slice(0, raw.length), raw)
  const cold = Session.create(SessionId('cold-ptc'), session.snapshotEvents())
  assert.deepEqual(cold.deriveMessages(), session.deriveMessages())
  assert.deepEqual(replay.stripOwnedCollaborationReplay(cold), { startsRequestSeries: false, unsupported: ['ptc-sdk-format'] })
})

test('historical PTC replacement does not rewind real SystemPrompt admissions', options, async t => {
  const [{ Context }, { SessionStore }, { SessionProjectionRegistry }, { SystemPrompt }] = await Promise.all([
    load('@deepseek-ai/cordis'), load('@deepseek-ai/dsh-session'),
    load('@deepseek-ai/dsh-session-projection'), load('@deepseek-ai/dsh-system-prompt'),
  ])
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SystemPrompt, { includeHarnessIdentity: false })
  const session = ctx.sessions.create(SessionId('mounted-ptc'), { meta: { cwd: '/synthetic' } })
  const sdkText = renderToolsSdk([{ name: 'mattpocock_record', description: 'Historical SDK', parameters: { type: 'object' }, output: { type: 'string' } }])
  let current = 'OLDER native policy'
  ctx.systemPrompt.section({ name: 'native', order: 10, text: () => current })
  ctx.systemPrompt.section({ name: 'tools:sdk', order: 20, text: sdkText })
  const updates = async () => (await ctx.systemPrompt.assemble({ session })).systemUpdates(false)
  const admit = async step => {
    for (const { message, intent } of await updates()) session.append('system/message', { turn: 1, step, message }, intent)
  }
  await admit(1)
  current = 'NEWER native policy'
  await admit(2)
  assert.deepEqual(await updates(), [])
  const raw = session.snapshotEvents()
  assert.deepEqual(replay.stripOwnedCollaborationReplay(session, { turn: 1, step: 3 }), { startsRequestSeries: true, unsupported: [] })
  assert.deepEqual(await updates(), [], 'the synthetic surface event must not re-admit older native sections')
  assert.deepEqual(session.snapshotEvents().slice(0, raw.length), raw, 'all original admissions survive in the raw log')
  assert(visible(session).some(text => text.includes('OLDER native policy')))
  assert(session.deriveMessages().flatMap(message => message.content).some(block => block.text === 'NEWER native policy'))
})
