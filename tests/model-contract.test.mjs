import assert from 'node:assert/strict'
import { test } from 'node:test'

import { caller, mountedFixture, operator, policy, sdk, signal } from './fixtures/runtime-host.mjs'

// Model-facing contract. A tool request is raw JSON, so the description and the rejection
// message are the only schema a model has: an omitted optional field must behave exactly like
// an explicit null, and every rejection must name the accepted values or the fix.

async function readyMounted(t) {
  const f = await mountedFixture(t)
  await f.runtime.savePolicy(operator, policy(), 0, signal())
  f.ctx.tools.register(sdk.defineTool({ name: 'send_message', description: 'mechanical native fixture',
    parameters: { agent_id: { type: 'string', required: true }, message: { type: 'string', required: true } },
    output: { schema: { type: 'null' }, render: () => [] },
    async execute() { return null } }))
  return f
}

const text = result => JSON.stringify([result.error?.message ?? null, result.content ?? null])

test('a ticketless execution fact accepts an omitted workflowId exactly like explicit null', async t => {
  const f = await readyMounted(t)
  const shape = { nativeTool: 'send_message', arguments: { agent_id: 'root', message: 'ordinary progress' } }
  const omitted = await f.execute('mattpocock_execute', { request: shape })
  assert.equal(omitted.isError, false, text(omitted))
  const explicit = await f.execute('mattpocock_execute', { request: { ...shape, workflowId: null, localTicketId: null } })
  assert.equal(explicit.isError, false, text(explicit))
})

test('a present but invalid ticket value teaches the null alternative instead of demanding an id', async t => {
  const f = await readyMounted(t)
  const bad = await f.execute('mattpocock_execute', { request: { nativeTool: 'send_message',
    arguments: { agent_id: 'root', message: 'ordinary progress' }, workflowId: '' } })
  assert.equal(bad.isError, true)
  assert.match(text(bad), /or null when this work belongs to no ticket/)
})

test('an assignment grant accepts an omitted workflowId and omitted ticketIds', async t => {
  const f = await readyMounted(t)
  // The rejection is the real session check, never the ticket parser: the omitted fields parsed.
  const outcome = await f.runtime.assign(caller('root'), { sessionId: 'ghost' }, signal()).then(() => null, error => error)
  assert.notEqual(outcome, null, 'a ghost child must still be rejected')
  assert.doesNotMatch(String(outcome.message), /workflowId|ticketIds/)
})

test('model-facing rejections name the accepted values', async t => {
  const f = await readyMounted(t)
  const provider = await f.execute('mattpocock_delegate', { request: { description: 'x', prompt: 'y', provider: 'bogus' } })
  assert.equal(provider.isError, true)
  assert.match(text(provider), /accepted provider values: spawn, fork/)
  const worktree = await f.execute('mattpocock_worktree', { request: { action: 'bogus' } })
  assert.equal(worktree.isError, true)
  assert.match(text(worktree), /read\/update\/reconcile action required|accepted actions: read, update, reconcile/)
  const history = await f.execute('mattpocock_history', { request: { action: 'bogus' } })
  assert.equal(history.isError, true)
  assert.match(text(history), /accepted actions: query, detail, set-context, purge/)
})
