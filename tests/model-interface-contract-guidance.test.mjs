import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import ts from 'typescript'
import { mountedFixture, operator, policy, signal } from './fixtures/runtime-host.mjs'

test('record publishes typed action values and result replacement semantics without changing authority', async t => {
  const f = await mountedFixture(t)
  const description = f.ctx.tools.get('mattpocock_record').description
  assert.ok(description.includes('references?: string[]'))
  assert.ok(description.includes('result: string | DecisionResult | null'))
  assert.match(description, /structuredDecisionResults=true/u)
  assert.match(description, /answer: string/u)
  assert.ok(description.includes('source?: {kind: string'))
  assert.ok(description.includes('included?: string | string[]'))
  assert.ok(description.includes('excluded?: string | string[]'))
  assert.ok(description.includes('selectedOptionKey?: string'))
  assert.match(description, /omitting result preserves the existing result; a supplied result replaces it as a whole; null clears it/u)
  assert.ok(description.includes('terminal?: boolean'))
  assert.match(description, /source is an authored report, not an authenticated user event/u)
  assert.match(description, /selectedOptionKey does not adopt a recommendation/u)
  assert.match(description, /Ordinary put-\* updates use references as this operation's declarations, not an automatic union/u)
  assert.match(description, /adopt-decision-recommendation retains the original references and adds the supplied declarations/u)
  assert.match(description, /included and excluded belong inside result/u)
})

test('all mounted tools expose only their own action contract and share truthful output guidance', async t => {
  const f = await mountedFixture(t, { delegate: true })
  const description = name => f.ctx.tools.get(name).description
  for (const name of ['controls', 'record', 'window', 'resource', 'assign', 'history', 'worktree', 'delegate']) {
    const text = description('mattpocock_' + name)
    assert.match(text, /representationVersion:2/u)
    if (['window', 'assign', 'delegate'].includes(name)) {
      assert.match(text, /bounded receipt/u)
      assert.doesNotMatch(text, /canonical JSON/u)
    } else {
      assert.match(text, /next.*tool.*request/u)
      assert.match(text, /mattpocock_record.*detail/u)
    }
    if (name === 'record') assert.match(text, /canonical JSON.*UTF-8/u)
    assert.doesNotMatch(text, /Read queries use query=/u)
    assert.match(text, /Action contract:/u)
  }
  assert.match(description('mattpocock_controls'), /complete sparse intent replacement, not a patch/u)
  assert.match(description('mattpocock_controls'), /completeIntent:false/u)
  assert.match(description('mattpocock_controls'), /same policy revision/u)
  assert.match(description('mattpocock_controls'), /false explicitly disables/u)
  assert.match(description('mattpocock_controls'), /null is not an inheritance marker/u)
  assert.match(description('mattpocock_window'), /generation: number/u)
  assert.match(description('mattpocock_window'), /mattpocock_record/u)
  assert.match(description('mattpocock_history'), /coordinator-only/u)
  assert.match(description('mattpocock_history'), /cursor unchanged/u)
  assert.match(description('mattpocock_worktree'), /notes: string/u)
  assert.match(description('mattpocock_worktree'), /65536/u)
  assert.match(description('mattpocock_worktree'), /4096/u)
  assert.match(description('mattpocock_worktree'), /empty string clears/u)
  assert.match(description('mattpocock_worktree'), /null is rejected/u)
  assert.ok(description('mattpocock_worktree').includes('{"action":"reconcile","operationId":"existing-delegation-operation-id"}'))
  assert.doesNotMatch(description('mattpocock_resource'), /query[?:=]/u)
  assert.match(description('mattpocock_resource'), /resourceId: string/u)
  assert.ok(description('mattpocock_assign').includes('ticketIds: string[]'))
})

test('published read examples execute through typed and rendered mounted tools', async t => {
  const f = await mountedFixture(t)
  await f.runtime.savePolicy(operator, policy(), 0, signal())
  for (const name of ['mattpocock_controls', 'mattpocock_record', 'mattpocock_worktree']) {
    const result = await f.execute(name, { request: { action: 'read' } })
    assert.notEqual(result.isError, true, JSON.stringify(result))
    const rendered = result.content.filter(block => block.type === 'text').map(block => block.text).join('')
    assert.deepEqual(JSON.parse(rendered), result.value)
    assert.equal(result.value.schemaVersion, 2)
  }
  const result = await f.execute('mattpocock_worktree', { request: { action: 'reconcile', operationId: 'existing-delegation-operation-id' } })
  assert.equal(result.isError, true, 'a syntactically valid example must still require a real existing operation')
  assert.doesNotMatch(result.error.message, /operationId must|unexpected key|action required/u)
})

const supervisionConfig = { schemaVersion: 1, revision: 0, defaults: { enabled: true, dryRun: true }, workspaceOverrides: {} }
const episodeStore = 'mattpocock_supervision_state_' + createHash('sha256').update('root').digest('hex').slice(0, 32)

test('standalone audit shares output guidance and distinguishes current memory summary from unrecorded durable episodes', async t => {
  const f = await mountedFixture(t, { seedUnits: new Map([
    ['mattpocock_supervision_config', new Map([['state', supervisionConfig]])],
  ]) })
  const description = f.ctx.tools.get('mattpocock_audit').description
  for (const expected of ['representationVersion:2', 'next:{tool,request}', 'mattpocock_record {action:"detail"', 'durable source', 'unknown and not-recorded']) {
    assert.ok(description.includes(expected), expected)
  }
  await f.runtime.savePolicy(operator, policy(), 0, signal())
  const result = await f.execute('mattpocock_audit', { request: { action: 'read' } })
  assert.notEqual(result.isError, true)
  assert.equal(result.value.coverage.persistence, 'mixed')
  assert.deepEqual(result.value.coverage.summary, { persistence: 'memory-only', status: 'current' })
  assert.deepEqual(result.value.coverage.episodes, { persistence: 'durable', status: 'not-recorded', retained: null })
  const denied = await f.execute('mattpocock_audit', { request: { action: 'read' } }, f.child)
  assert.equal(denied.isError, true, 'the independent registration still enforces actual owner identity')
})

test('audit retains durable episode provenance and reports unreadable storage as unknown instead of zero', async t => {
  const { initialSupervisionDocument, parseSupervisionDocument } = await import('../src/controls/supervision-audit.ts')
  const state = parseSupervisionDocument(initialSupervisionDocument('root', 'W', Date.now()))
  for (const [source, expected] of [[state, { persistence: 'durable', status: 'current', retained: 0 }],
    [{ schemaVersion: 99 }, { persistence: 'durable', status: 'unknown', retained: null }]]) {
    const f = await mountedFixture(t, { seedUnits: new Map([
      ['mattpocock_supervision_config', new Map([['state', supervisionConfig]])],
      [episodeStore, new Map([['state', source]])],
    ]) })
    await f.runtime.savePolicy(operator, policy(), 0, signal())
    const result = await f.execute('mattpocock_audit', { request: { action: 'read' } })
    assert.notEqual(result.isError, true, 'failed durable episodes do not hide available live memory observations')
    assert.deepEqual(result.value.coverage.episodes, expected)
    assert.deepEqual(result.value.coverage.summary, { persistence: 'memory-only', status: 'current' })
  }
})

function firstActionShape(description) {
  const start = description.indexOf('Action contract: ') + 'Action contract: '.length
  assert.equal(description[start], '{')
  let depth = 0, quoted = false
  for (let index = start; index < description.length; index += 1) {
    const char = description[index]
    if (char === '"') quoted = !quoted
    if (quoted) continue
    if (char === '{') depth += 1
    if (char === '}' && --depth === 0) return description.slice(start, index + 1)
  }
  assert.fail('published action shape is not balanced')
}

test('controls worktree and standalone audit publish parseable read types with limit prose outside the shape', async t => {
  const f = await mountedFixture(t, { seedUnits: new Map([
    ['mattpocock_supervision_config', new Map([['state', supervisionConfig]])],
  ]) })
  for (const name of ['mattpocock_controls', 'mattpocock_worktree', 'mattpocock_audit']) {
    const description = f.ctx.tools.get(name).description
    const shape = firstActionShape(description)
    const parsed = ts.transpileModule('type Request = ' + shape, {
      reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022 },
    })
    assert.deepEqual(parsed.diagnostics.map(item => ts.flattenDiagnosticMessageText(item.messageText, '\n')), [], name)
    assert.doesNotMatch(shape, /limit is/u)
    assert.match(description.slice(description.indexOf(shape) + shape.length), /limit is 1\.\.100 \(default 20\)/u)
  }
})

test('one action contract owns request mechanics while legacy authority and recovery guidance remain', async t => {
  const f = await mountedFixture(t, { delegate: true, seedUnits: new Map([
    ['mattpocock_supervision_config', new Map([['state', supervisionConfig]])],
  ]) })
  for (const suffix of ['controls', 'record', 'window', 'history', 'worktree', 'resource', 'assign', 'delegate', 'audit']) {
    const description = f.ctx.tools.get('mattpocock_' + suffix).description
    const purpose = description.slice(0, description.indexOf('Action contract:'))
    assert.doesNotMatch(purpose, /Requests are|Request: \{|Request keys:|Value shapes:|Each sparse PolicyPatch accepts|The request is one of these shapes/u, suffix)
  }
  const record = f.ctx.tools.get('mattpocock_record').description
  for (const safety of ['Source identity is immutable', 'No statuses/summary/disposition/claim/body/author/time', 'never send caller/author/time or policySelection', 'Never self-enable or renew the owner policy', 'preserve result, references, await flags and task constraints']) {
    assert.ok(record.includes(safety), safety)
  }
  assert.match(f.ctx.tools.get('mattpocock_controls').description, /explicitly delegated policy change/u)
  assert.match(f.ctx.tools.get('mattpocock_history').description, /source cleanup preserving current state/u)
  assert.match(f.ctx.tools.get('mattpocock_worktree').description, /never a strong binding/u)
})
