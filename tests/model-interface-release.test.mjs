import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { mountedFixture, operator, policy, signal } from './fixtures/runtime-host.mjs'

// Cross-lane regression: real registry writes, V5 persistence, current target and exact next requests.
// This does not assert production-session repair or authenticate result.source as a user event.
test('mounted structured writes retain scoped results through bounded current and UTF-8 body continuations', async t => {
  const f = await mountedFixture(t)
  await f.runtime.savePolicy(operator, policy(), 0, signal())
  const execute = async (tool, request) => {
    const output = await f.execute(tool, { request })
    assert.notEqual(output.isError, true, output.error?.message)
    const rendered = output.content.find(block => block.type === 'text').text
    assert.equal(rendered, JSON.stringify(output.value))
    assert.equal(output.value.representationVersion, 2)
    assert.ok(Buffer.byteLength(rendered) <= (output.value.kind === 'receipt' ? 8192 : 65536))
    return output.value
  }
  await execute('mattpocock_record', { action: 'apply', command: {
    operationId: 'workflow', expectedRevision: 0, action: 'put-workflow', workflowId: 'flow',
    value: { title: 'Scoped integration', axes: [] },
  } })
  let revision = 1
  for (const answer of ['Allow isolated reads only', '漢'.repeat(60000)]) {
    const result = { answer, selectedOptionKey: 'read-only',
      source: { kind: 'authored-user-citation', messageId: 'message-42', text: 'Read only' },
      included: ['isolated tests'], excluded: ['local installation', 'production restart'] }
    const receipt = await execute('mattpocock_record', { action: 'apply', command: {
      operationId: 'reply-' + revision, expectedRevision: revision, action: 'put-decision',
      workflowId: 'flow', decisionId: 'D', references: ['source:message-42'],
      value: { question: 'Which boundary?', status: 'partial reply', pending: true, awaitingImplementation: true, result },
    } })
    revision++
    assert.equal(receipt.businessRevision, revision)
    const current = await execute('mattpocock_record', { action: 'read' })
    assert.equal(current.records.capabilities.structuredDecisionResults, true)
    assert.deepEqual(current.records.capabilities.storageVersions, [1, 2, 3, 4, 5])
    const page = await execute('mattpocock_record', { action: 'read', query: {
      kind: 'decision', target: { workflowId: 'flow', decisionId: 'D' },
    } })
    assert.equal(page.rows.length, 1)
    let next = { tool: 'mattpocock_record', request: { action: 'detail', locator: page.rows[0].detail.locator } }
    const chunks = []
    let offset = 0, total, hash
    while (next !== null) {
      const part = await execute(next.tool, next.request)
      assert.equal(part.contentType, 'application/json')
      assert.equal(part.encoding, 'utf-8')
      assert.equal(part.offset, offset)
      total ??= part.totalBytes; hash ??= part.contentHash
      assert.equal(part.totalBytes, total); assert.equal(part.contentHash, hash)
      assert.ok(part.nextOffset > offset || part.done)
      assert.equal(part.next === null, part.done)
      chunks.push(part.data); offset = part.nextOffset; next = part.next
      assert.ok(chunks.length < 16, 'continuation must make bounded forward progress')
    }
    const json = chunks.join('')
    assert.equal(Buffer.byteLength(json), total)
    assert.equal(createHash('sha256').update(json).digest('hex'), hash)
    const body = JSON.parse(json)
    assert.deepEqual(body.value.result, result)
    assert.equal(body.value.pending, true)
    assert.equal(body.value.awaitingImplementation, true)
    assert.equal(body.policySelection, undefined, 'a reported option is not authenticated adoption')
    if (answer.length > 1000) assert.ok(chunks.length > 1, 'large Unicode result exercises real chunk continuation')
  }
})
