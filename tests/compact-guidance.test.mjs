import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { actualAgent, mountedFixture, operator, policy, signal } from './fixtures/runtime-host.mjs'

const fixed = ['controls', 'record', 'window', 'resource', 'assign', 'history', 'worktree']
// Frozen 4dbff5d mounted baseline: 26,556 UTF-8 bytes / 26,548 UTF-16 chars (seven complete descriptions).
const baselineBytes = 26556
const supervisionConfig = { schemaVersion: 1, revision: 0, defaults: { enabled: true, dryRun: true }, workspaceOverrides: {} }

test('mounted descriptions publish output guidance by capability, not a repeated body protocol', async t => {
  const f = await mountedFixture(t, { delegate: true, seedUnits: new Map([
    ['mattpocock_supervision_config', new Map([['state', supervisionConfig]])],
  ]) })
  const descriptions = Object.fromEntries([...fixed, 'audit', 'delegate'].map(suffix =>
    [suffix, f.ctx.tools.get('mattpocock_' + suffix).description]))
  const sizes = Object.fromEntries(Object.entries(descriptions).map(([name, text]) =>
    [name, { bytes: Buffer.byteLength(text), chars: text.length }]))
  t.diagnostic(JSON.stringify({ sizes, defaultBytes: fixed.reduce((n, name) => n + sizes[name].bytes, 0),
    defaultChars: fixed.reduce((n, name) => n + sizes[name].chars, 0) }))
  for (const name of ['window', 'assign', 'delegate']) {
    assert.doesNotMatch(descriptions[name], /canonical JSON|complete reassembly|nextOffset/u, name + ' has receipts, not body chunks')
    assert.match(descriptions[name], /receipt/u)
  }
  for (const name of ['controls', 'resource', 'history', 'worktree', 'audit']) {
    assert.match(descriptions[name], /mattpocock_record.*detail/u, name + ' points to the real body reader')
    assert.match(descriptions[name], /not (?:an? )?(?:authorization )?credential/u)
    assert.doesNotMatch(descriptions[name], /canonical JSON|complete reassembly/u)
    assert.match(descriptions[name], /next:\{tool,request\}/u)
  }
  assert.match(descriptions.record, /canonical JSON.*UTF-8/u)
  assert.match(descriptions.record, /done.*complete reassembly/u)
  assert.match(descriptions.record, /source\/scope changes/u)
  assert.match(descriptions.record, /next:\{tool,request\}/u)
})

test('record defines shared command types once and default mounted descriptions shrink at least twenty percent', async t => {
  const f = await mountedFixture(t)
  const record = f.ctx.tools.get('mattpocock_record').description
  for (const field of ['operationId: string', 'expectedRevision: number', 'workflowId: string, references?: string[]']) {
    assert.equal(record.split(field).length - 1, 1, field + ' is defined once')
  }
  assert.match(record, /CommandFields/u)
  const bytes = fixed.reduce((n, name) => n + Buffer.byteLength(f.ctx.tools.get('mattpocock_' + name).description), 0)
  assert.ok(bytes <= Math.floor(baselineBytes * 0.8), JSON.stringify({ baselineBytes, bytes }))
})

// Parse the actual mounted examples, not a second hand-maintained request copy.
function examples(description) {
  return description.split('Example request: ').slice(1).map(tail => {
    let depth = 0, quoted = false, escaped = false
    for (let i = 0; i < tail.length; i++) {
      const char = tail[i]
      if (escaped) { escaped = false; continue }
      if (quoted && char === '\\') { escaped = true; continue }
      if (char === '"') quoted = !quoted
      if (quoted) continue
      if (char === '{') depth++
      if (char === '}' && --depth === 0) return JSON.parse(tail.slice(0, i + 1))
    }
    assert.fail('unbalanced published JSON example')
  })
}
async function execute(f, suffix, request) {
  const result = await f.execute('mattpocock_' + suffix, { request })
  assert.notEqual(result.isError, true, result.error?.message)
  const rendered = result.content.filter(row => row.type === 'text').map(row => row.text).join('')
  assert.deepEqual(JSON.parse(rendered), result.value)
  assert.equal(result.value.schemaVersion, 2)
  assert.equal(result.value.representationVersion, 2)
  return result.value
}

test('published examples for all nine tools execute through real mounted tools without dropping authority', async t => {
  const f = await mountedFixture(t, { delegate: true, seedUnits: new Map([
    ['mattpocock_supervision_config', new Map([['state', supervisionConfig]])],
  ]) })
  await f.runtime.savePolicy(operator, policy(), 0, signal())
  const published = suffix => examples(f.ctx.tools.get('mattpocock_' + suffix).description)
  const apply = command => execute(f, 'record', { action: 'apply', command })
  await apply({ operationId: 'example-flow', expectedRevision: 0, workflowId: 'flow', action: 'put-workflow', value: { title: 'Reply task', axes: [] } })
  await apply({ operationId: 'example-question', expectedRevision: 1, workflowId: 'flow', action: 'put-decision', decisionId: 'question-1', value: { question: 'Which path?', status: 'open', pending: true, awaitingImplementation: true, addressee: { kind: 'user' } } })
  await apply({ operationId: 'example-reference', expectedRevision: 2, workflowId: 'flow', action: 'put-task-reference', localTicketId: 'task-1', value: { source: { kind: 'unverified' }, locator: 'task:one' } })
  for (const suffix of ['controls', 'record', 'history', 'worktree', 'audit']) await execute(f, suffix, published(suffix)[0])
  const reply = published('record')[1]
  assert.equal(reply.command.expectedRevision, 3)
  const written = await execute(f, 'record', reply)
  assert.equal(written.appliedRevision, 4)
  const current = await execute(f, 'record', { action: 'read', query: { kind: 'decision', target: { workflowId: 'flow', decisionId: 'question-1' } } })
  assert.equal(current.rows[0].awaitingImplementation, true, 'a real reply does not erase existing follow-through')
  const body = await execute(f, 'record', { action: 'detail', locator: current.rows[0].detail.locator })
  assert.equal(body.done, true)
  assert.equal(Buffer.byteLength(body.data), body.totalBytes)
  assert.equal(createHash('sha256').update(body.data).digest('hex'), body.contentHash)
  assert.deepEqual(JSON.parse(body.data).value.result, reply.command.value.result)
  const reserved = await execute(f, 'window', published('window')[0])
  assert.equal(reserved.generation, 1)
  f.agents.set('actual-direct-child', actualAgent('actual-direct-child', { parent: 'root', managed: true }))
  await execute(f, 'assign', published('assign')[0])
  let creations = 0
  f.mounted.ports.createContinuable = async (_, request) => {
    creations++
    f.agents.set(request.childId, actualAgent(request.childId, { parent: 'root', managed: true }))
    return { childId: request.childId, messageId: 'example-accepted' }
  }
  const delegated = await execute(f, 'delegate', published('delegate')[0])
  const replayed = await execute(f, 'delegate', published('delegate')[0])
  assert.equal(delegated.childId, replayed.childId)
  assert.equal(creations, 1, 'the exact published operation never creates twice')
  // A reconcile example names an existing intent, not a new creation operation.
  const reconcile = published('worktree')[1]
  f.mounted.ports.flushSession = async () => true
  await execute(f, 'delegate', { ...published('delegate')[0], operationId: reconcile.operationId })
  const starts = creations
  await execute(f, 'worktree', reconcile)
  assert.equal(creations, starts, 'reconcile does not redispatch')
  const { parseResourceDocument } = await import('../src/controls/resources.ts')
  const resource = {
    resourceId: published('resource')[0].resourceId, controlWorkspaceId: 'W', ownerInstanceId: current.instance.instrumentInstanceId,
    identity: { repositoryPath: '/fixture/repo', root: '/fixture', path: '/fixture/tree', gitCommonDir: '/fixture/repo/.git',
      gitCommonDirIdentity: 'common', gitDir: '/fixture/repo/.git/worktrees/tree', gitDirIdentity: 'private',
      pathIdentity: 'tree', rootIdentity: 'root', branchRef: 'refs/heads/tree', branchOwned: true, ownership: 'owned', baseOid: 'a'.repeat(40) },
    status: 'retained', business: { status: 'unknown physical state' }, businessAuthorId: 'agent:root', references: [],
    retireRequest: null, entrancesClosed: false, nativeColdResumeClosed: false, diagnostic: null,
  }
  assert.equal(await f.mounted.ports.resourceStorage.compareAndSwap(0, parseResourceDocument({ schemaVersion: 1, revision: 1, resources: [resource], leases: [] })), true)
  const readResource = await execute(f, 'resource', published('resource')[0])
  assert.equal(readResource.actualCanRetire.allowed, false, 'read success does not turn unknown physical facts into retirement permission')
  const absent = await f.execute('mattpocock_resource', { request: { action: 'read', resourceId: 'absent-resource' } })
  assert.equal(absent.isError, true, 'a well-typed read cannot fabricate an existing resource')
})
