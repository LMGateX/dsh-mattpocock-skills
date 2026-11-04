import assert from 'node:assert/strict'
import { test } from 'node:test'

import { caller, mountedFixture, operator, policy, sdk, signal } from './fixtures/runtime-host.mjs'

// Model-facing contract. A tool request is raw JSON, so the description and the rejection
// message are the only schema a model has: an omitted optional field must behave exactly like
// an explicit null, and every rejection must name the accepted values or the fix.

const FIXED_TOOLS = ['mattpocock_controls', 'mattpocock_record', 'mattpocock_window',
  'mattpocock_resource', 'mattpocock_assign', 'mattpocock_history', 'mattpocock_worktree']
const OPT_IN_TOOLS = ['mattpocock_delegate']

async function readyMounted(t, options) {
  const f = await mountedFixture(t, options)
  await f.runtime.savePolicy(operator, policy(), 0, signal())
  f.ctx.tools.register(sdk.defineTool({ name: 'send_message', description: 'mechanical native fixture',
    parameters: { agent_id: { type: 'string', required: true }, message: { type: 'string', required: true } },
    output: { schema: { type: 'null' }, render: () => [] },
    async execute() { return null } }))
  return f
}

const text = result => JSON.stringify([result.error?.message ?? null, result.content ?? null])

test('the default model surface registers seven fixed instruments; delegate is opt-in and audit stays conditional', async t => {
  const f = await mountedFixture(t)
  for (const name of FIXED_TOOLS) assert.ok(f.ctx.tools.get(name), name + ' must be registered')
  assert.equal(FIXED_TOOLS.length, 7)
  for (const name of OPT_IN_TOOLS) assert.equal(f.ctx.tools.get(name), undefined, name + ' is opt-in and must stay unregistered by default')
  assert.equal(f.ctx.tools.get('mattpocock_execute'), undefined, 'execute is retired and must not be a model tool')
  assert.equal(f.ctx.tools.get('mattpocock_audit'), undefined, 'audit is conditional and stays off by default')
  assert.equal(f.ctx.tools.get('mattpocock_execute', f.root), undefined)
  const visible = f.ctx.tools.schemas(f.root).map(row => row.name)
  assert.equal(visible.includes('mattpocock_execute'), false)
  assert.deepEqual(visible.filter(name => name.startsWith('mattpocock_')).sort(), [...FIXED_TOOLS].sort())

  const opted = await mountedFixture(t, { delegate: true })
  for (const name of OPT_IN_TOOLS) assert.ok(opted.ctx.tools.get(name), name + ' must be registered when opted in')
  const optedVisible = opted.ctx.tools.schemas(opted.root).map(row => row.name)
  assert.deepEqual(optedVisible.filter(name => name.startsWith('mattpocock_')).sort(), [...FIXED_TOOLS, ...OPT_IN_TOOLS].sort())
})

test('delegate config is opt-in and defaults off', async () => {
  const { Config } = await import('../src/index.ts')
  assert.equal(Config({}).delegate, false)
  assert.equal(Config({ delegate: true }).delegate, true)
})

test('delegate is described as binding-first creation, not a general dispatcher', async t => {
  const f = await mountedFixture(t, { delegate: true })
  const description = f.ctx.tools.get('mattpocock_delegate').description
  assert.match(description, /Binding-first creation/)
  assert.match(description, /ticket↔worktree binding/)
  assert.match(description, /native subagent\/subagent_fork and mattpocock_assign/)
  assert.match(description, /create_worktree/)
  assert.match(description, /actual child\/parent\/cwd header/)
  assert.match(description, /operationId/)
  assert.match(description, /ticketIds/)
  assert.match(description, /does not prove where the child actually started/, 'the header is a source value, not proof of the actual initial directory')
  assert.match(description, /not a completed binding or assignment/, 'native acceptance is not binding or assignment completion')
  assert.match(description, /use that existing child/, 'an accepted or uncertain creation reuses its existing child')
  assert.match(description, /never create it again/, 'metadata failure is never a reason for a second creation')
  assert.match(description, /grant it explicitly to the same child with mattpocock_assign/, 'a missing or failed grant is completed explicitly, not reparsed as creation')
  assert.doesNotMatch(description, /child starts there/, 'the absolute directory claim is removed')
  assert.doesNotMatch(description, /Preferred flow/)
  assert.doesNotMatch(description, /let the lane create its own tree/)
})

test('the runtime snapshot reports trusted delegate registration instead of inferring it from cwd capability', async t => {
  const off = await mountedFixture(t)
  assert.equal(off.ctx.tools.get('mattpocock_delegate'), undefined)
  const offSnapshot = await off.runtime.readSession(caller('root'), 'root', signal())
  assert.equal(offSnapshot.delegateRegistered, false)
  const opted = await mountedFixture(t, { delegate: true })
  assert.ok(opted.ctx.tools.get('mattpocock_delegate'))
  const optedSnapshot = await opted.runtime.readSession(caller('root'), 'root', signal())
  assert.equal(optedSnapshot.delegateRegistered, true, 'registration comes from the trusted Host option')
  assert.ok(optedSnapshot.capabilities.some(row => row.key === 'nativeInitialChildCwd'),
    'the cwd capability remains a separate report, never the source of the delegate flag')
})

test('an assignment grant accepts an omitted workflowId and omitted ticketIds', async t => {
  const f = await readyMounted(t)
  // The rejection is the real session check, never the ticket parser: the omitted fields parsed.
  const outcome = await f.runtime.assign(caller('root'), { sessionId: 'ghost' }, signal()).then(() => null, error => error)
  assert.notEqual(outcome, null, 'a ghost child must still be rejected')
  assert.doesNotMatch(String(outcome.message), /workflowId|ticketIds/)
})

test('model-facing rejections name the accepted values', async t => {
  const f = await readyMounted(t, { delegate: true })
  const provider = await f.execute('mattpocock_delegate', { request: { description: 'x', prompt: 'y', provider: 'bogus' } })
  assert.equal(provider.isError, true)
  assert.match(text(provider), /accepted provider values: spawn, fork/)
  const worktree = await f.execute('mattpocock_worktree', { request: { action: 'bogus' } })
  assert.equal(worktree.isError, true)
  const worktreeMessage = worktree.error?.message ?? ''
  assert.match(worktreeMessage, /worktree action required: received action="bogus" with request keys \["action"\]/)
  assert.match(worktreeMessage, /expected one of .*"action":"update-observation","command"/)
  const history = await f.execute('mattpocock_history', { request: { action: 'bogus' } })
  assert.equal(history.isError, true)
  assert.match(text(history), /accepted actions: query, detail, set-context, purge/)
})

test('a nested worktree action names the received key and the expected shape', async t => {
  const f = await readyMounted(t)
  const result = await f.execute('mattpocock_worktree', {
    request: { 'update-observation': { action: 'update-observation', command: {} } },
  })
  assert.equal(result.isError, true)
  const message = result.error?.message ?? ''
  assert.match(message, /worktree action required: received no action with request keys \["update-observation"\]/)
  assert.match(message, /expected one of .*"action":"update-observation","command"/)
})

test('model tool descriptions publish the top-level action requests they accept', async t => {
  const f = await mountedFixture(t)
  const description = name => f.ctx.tools.get(name).description
  for (const name of FIXED_TOOLS) {
    assert.doesNotMatch(description(name), /\b(?:read|save|apply)=\{/u,
      name + ' must not describe a nested request-key envelope')
  }
  assert.match(description('mattpocock_controls'), /\{action:"read"/u)
  assert.match(description('mattpocock_controls'), /\{action:"save"/u)
  assert.match(description('mattpocock_record'), /\{action:"read"/u)
  assert.match(description('mattpocock_record'), /\{action:"detail"/u)
  assert.match(description('mattpocock_record'), /\{action:"apply"/u)
  assert.match(description('mattpocock_history'), /\{action:"query"/u)
  assert.match(description('mattpocock_history'), /\{action:"detail"/u)
  assert.match(description('mattpocock_history'), /\{action:"purge-source"/u)
})
