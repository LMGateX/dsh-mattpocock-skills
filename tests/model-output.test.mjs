import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

// Public plugin output interface tests, not a substitute for Host execute/render integration.
const sourceURL = new URL('../src/controls/model-output.ts', import.meta.url)
registerHooks({ load(url, context, nextLoad) {
  if (url === sourceURL.href) return { format: 'module', shortCircuit: true, source: ts.transpileModule(readFileSync(sourceURL, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText }
  return nextLoad(url, context)
} })
const output = await import(sourceURL.href)

test('explicit previews, receipts and diagnostics never embed unbounded input', () => {
  assert.deepEqual(output.previewText('A😀B', 5), { text: 'A😀', totalBytes: 6, shownBytes: 5, truncated: true })
  assert.deepEqual(output.previewText('é', 1), { text: 'e', totalBytes: 3, shownBytes: 1, truncated: true })
  const error = output.modelError('fault', '\n'.repeat(100000), 'unavailable')
  assert.equal(error.code, 'fault')
  assert.ok(output.jsonBytes(error) <= 8192)
  const receipt = output.modelReceipt({ instance: 'a' }, { committed: true, ignored: false, generation: 7 }, { diagnostics: 'x'.repeat(20000) })
  assert.equal(receipt.committed, true)
  assert.equal(receipt.generation, 7)
  assert.equal(receipt.ignored, false)
  assert.equal(receipt.omittedOptional, true)
  assert.ok(output.jsonBytes(receipt) <= 8192)
})

test('row pages use the delivered last index, preserve every row, and progress at byte edges', () => {
  const rows = Array.from({ length: 19 }, (_, index) => ({ id: index, title: '漢😀\n'.repeat(20) }))
  const delivered = []
  let offset = 0
  while (offset < rows.length) {
    const page = output.packModelRows({ rows: rows.slice(offset), limit: 3, budget: 800, makeEnvelope: (packed, lastIndex, more) => ({ schemaVersion: 2, rows: packed, next: more ? offset + lastIndex + 1 : null, more }) })
    assert.ok(page.rows.length >= 1)
    assert.ok(output.jsonBytes(page) <= 800)
    delivered.push(...page.rows.map(row => row.id))
    offset += page.rows.length
    assert.equal(page.more, offset < rows.length)
    assert.equal(page.next, page.more ? offset : null)
  }
  assert.deepEqual(delivered, Array.from({ length: 19 }, (_, index) => index))
  assert.throws(() => output.packModelRows({ rows: ['x'.repeat(1000)], budget: 100, makeEnvelope: rows => ({ rows }) }), { code: 'row-too-large' })
  assert.deepEqual(output.packModelRows({ rows: [], makeEnvelope: (rows, lastIndex, more) => ({ rows, lastIndex, more }) }), { rows: [], lastIndex: -1, more: false })
})

test('selected domain bodies have stable canonical JSON without invoking foreign serializers', () => {
  assert.equal(output.canonicalJson({ z: ['漢😀', -0, true, null], a: { b: 2, a: 1 }, optional: undefined }), '{"a":{"a":1,"b":2},"z":["漢😀",0,true,null]}')
  assert.equal(output.canonicalJson({ '10': 10, '2': 2 }), '{"10":10,"2":2}')
  assert.equal(output.canonicalJson({ b: 2, a: 1 }), output.canonicalJson({ a: 1, b: 2 }))
  const cyclic = {}; cyclic.self = cyclic
  for (const value of [cyclic, { toJSON() { throw new Error('not called') } }, { value: Infinity }, new Date()]) assert.throws(() => output.canonicalJson(value), { code: 'invalid-content' })
})

const binding = { instanceId: 'instance', workspaceId: 'workspace', callerSessionId: 'caller', principal: 'principal', scopeFingerprint: 'assigned:a' }
function selected(value = { title: '選定😀', provenance: { source: 'authored' } }) { return { domain: 'records', key: output.sourceKey('records', 'ticket-A'), sourceVersion: 3, value } }

test('opaque source locators resolve only the selected freshly authorized source', async () => {
  const model = output.createModelOutput()
  const source = selected()
  const locator = model.locator(binding, source)
  assert.ok(Buffer.byteLength(locator) < 4096)
  assert.equal(locator.includes('ticket-A'), false)
  const calls = []
  const result = await model.readContent(binding, { locator }, selector => { calls.push(selector); return source })
  assert.deepEqual(calls, [{ domain: 'records', key: source.key }])
  assert.equal(result.schemaVersion, 2)
  assert.equal(result.kind, 'content')
  assert.equal(result.sourceVersion, 3)
  assert.equal(result.offset, 0)
  assert.equal(result.done, true)
  assert.deepEqual(JSON.parse(result.data), source.value)
  assert.equal(result.nextOffset, result.totalBytes)
  await assert.rejects(model.readContent(binding, { locator }, () => null), { code: 'unavailable' })
})

test('content fragments reconstruct exact UTF-8 JSON and hash across escaped Unicode byte edges', async () => {
  const model = output.createModelOutput()
  const text = '漢😀\n\"\\\u0000é'.repeat(12000)
  const source = selected({ text })
  const locator = model.locator(binding, source)
  const expected = '{"text":' + JSON.stringify(text) + '}'
  const chunks = []
  let offset = 0
  let calls = 0
  let page
  do {
    page = await model.readContent(binding, { locator, offset }, () => { calls++; return source })
    assert.ok(output.jsonBytes(page) <= 65536)
    assert.equal(page.offset, offset)
    assert.equal(page.nextOffset, offset + Buffer.byteLength(page.data))
    assert.ok(page.nextOffset > offset)
    assert.equal(page.data.includes('�'), false)
    chunks.push(page.data)
    offset = page.nextOffset
  } while (!page.done)
  assert.ok(calls > 2)
  assert.equal(chunks.join(''), expected)
  assert.equal(page.totalBytes, Buffer.byteLength(expected))
  assert.equal(page.contentHash, createHash('sha256').update(expected).digest('hex'))
  const eof = await model.readContent(binding, { locator, offset }, () => source)
  assert.equal(eof.data, '')
  assert.equal(eof.nextOffset, offset)
  assert.equal(eof.done, true)
  const emojiByte = Buffer.from(expected).indexOf(Buffer.from('😀'))
  for (const bad of [-1, 0.5, NaN, offset + 1, emojiByte + 1, emojiByte + 2, emojiByte + 3]) await assert.rejects(model.readContent(binding, { locator, offset: bad }, () => source), { code: 'invalid-offset' })
})

test('page cursors bind scope, query, current source revision and actual delivered sort key', () => {
  const model = output.createModelOutput()
  const query = { kind: 'ticket', workflowId: 'flow' }
  const version = { records: 9, windows: 12, live: 'fingerprint' }
  const key = '漢😀'.repeat(60)
  const cursor = model.pageCursor(binding, query, version, key)
  assert.ok(cursor.length < 4096)
  assert.equal(model.readPageCursor(binding, { workflowId: 'flow', kind: 'ticket' }, version, cursor), key)
  assert.throws(() => model.readPageCursor(binding, query, { ...version, windows: 13 }, cursor), { code: 'revision-conflict', reason: 'current-view-changed' })
  assert.throws(() => model.readPageCursor({ ...binding, scopeFingerprint: 'revoked' }, query, version, cursor), { code: 'revision-conflict', reason: 'current-view-changed' })
  assert.throws(() => model.readPageCursor(binding, { ...query, kind: 'decision' }, version, cursor), { code: 'invalid-cursor' })
})

test('locators reject tampering, new mounts, changed principals, changed versions and removed sources', async () => {
  const secret = new Uint8Array(32).fill(7)
  const model = output.createModelOutput({ secret, mountEpoch: 'mount-a' })
  const sameMount = output.createModelOutput({ secret, mountEpoch: 'mount-a' })
  const source = selected()
  const locator = model.locator(binding, source)
  assert.equal((await sameMount.readContent(binding, { locator }, () => source)).done, true)
  let unauthorizedResolverCalls = 0
  const forbidden = () => { unauthorizedResolverCalls++; return source }
  for (const field of Object.keys(binding)) await assert.rejects(model.readContent({ ...binding, [field]: 'other' }, { locator }, forbidden), { code: 'invalid-locator' })
  for (const token of [locator.slice(0, -1), locator + '=', locator.slice(0, 25) + (locator[25] === 'A' ? 'B' : 'A') + locator.slice(26), 'x'.repeat(100000), '', null]) await assert.rejects(model.readContent(binding, { locator: token }, forbidden), { code: 'invalid-locator' })
  for (const changed of [output.createModelOutput({ secret, mountEpoch: 'mount-b' }), output.createModelOutput({ secret, mountEpoch: 'mount-a', representationVersion: 2 }), output.createModelOutput()]) await assert.rejects(changed.readContent(binding, { locator }, forbidden), { code: 'invalid-locator' })
  assert.equal(unauthorizedResolverCalls, 0)
  for (const changed of [{ ...source, sourceVersion: 4 }, { ...source, value: { title: 'modified' } }, { ...source, domain: 'windows' }, { ...source, key: output.sourceKey('records', 'other') }]) await assert.rejects(model.readContent(binding, { locator }, () => changed), { code: 'revision-conflict', reason: 'content-version-changed' })
  await assert.rejects(model.readContent(binding, { locator }, () => null), { code: 'unavailable' })
  const revoked = new output.ModelOutputError('forbidden', 'Access revoked')
  await assert.rejects(model.readContent(binding, { locator }, () => { throw revoked }), error => error === revoked)
})

test('cancellation propagates unchanged before and after authorized source resolution', async () => {
  const model = output.createModelOutput()
  const source = selected()
  const locator = model.locator(binding, source)
  const controller = new AbortController()
  const reason = new Error('stop selected read')
  let called = 0
  controller.abort(reason)
  await assert.rejects(model.readContent(binding, { locator }, () => { called++; return source }, controller.signal), error => error === reason)
  assert.equal(called, 0)
  const during = new AbortController()
  await assert.rejects(model.readContent(binding, { locator }, (_selector, signal) => { assert.equal(signal, during.signal); during.abort(reason); return source }, during.signal), error => error === reason)
})

test('large selected content encoding yields to cancellation rather than finishing an aborted response', async () => {
  const model = output.createModelOutput()
  const source = selected({ data: '漢😀\n'.repeat(300000) })
  const locator = model.locator(binding, source)
  const controller = new AbortController()
  const reason = new Error('cancel during selected-body encoding')
  await assert.rejects(model.readContent(binding, { locator }, () => {
    setImmediate(() => setImmediate(() => controller.abort(reason)))
    return source
  }, controller.signal), error => error === reason)
})

test('final budget edges cannot be relaxed above the fixed read or receipt maximum', () => {
  const base = output.jsonBytes(output.modelEnvelope('current', {}, { data: '' }))
  assert.equal(output.jsonBytes(output.modelEnvelope('current', {}, { data: 'x'.repeat(65536 - base) })), 65536)
  assert.throws(() => output.modelEnvelope('current', {}, { data: 'x'.repeat(65537 - base) }), { code: 'output-budget-exceeded' })
  assert.throws(() => output.modelEnvelope('current', {}, { data: 'x'.repeat(70000) }, 100000), { code: 'invalid-budget' })
  assert.throws(() => output.modelEnvelope('receipt', {}, {}, 8193), { code: 'invalid-budget' })
  const receiptBase = output.jsonBytes(output.modelReceipt({}, { data: '' }))
  assert.equal(output.jsonBytes(output.modelReceipt({}, { data: 'x'.repeat(8192 - receiptBase) })), 8192)
  const longId = '\u0000'.repeat(256)
  const receipt = output.modelReceipt({ instanceId: longId }, { operationId: longId, targetId: longId, generation: 4, ignored: false, committed: true, replayed: true }, { diagnostics: 'too large'.repeat(5000) })
  assert.equal(receipt.targetId, longId)
  assert.equal(receipt.operationId, longId)
  assert.equal(receipt.committed, true)
  assert.equal(receipt.replayed, true)
  assert.equal(receipt.ignored, false)
  assert.ok(output.jsonBytes(receipt) <= 8192)
})

test('final envelope budget measures UTF-8 JSON including escapes', () => {
  const value = output.modelEnvelope('current', { instance: 'a' }, { data: '\n漢😀\"' })
  assert.equal(output.jsonBytes(value), Buffer.byteLength(JSON.stringify(value)))
  assert.equal(value.schemaVersion, 2)
  assert.equal(value.kind, 'current')
  assert.throws(() => output.modelEnvelope('current', {}, { data: '\n'.repeat(40000) }), { code: 'output-budget-exceeded' })
})
