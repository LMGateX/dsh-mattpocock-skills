import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mountedFixture, actualAgent } from './fixtures/runtime-host.mjs'

const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)) }
const running = (id, parent) => Object.assign(actualAgent(id, { parent, managed: true }), { status: 'running' })
const start = (f, runId) => f.ctx.emit('subagent/start', { id: 'leaf', provider: 'controlled', local: true, runId })
const end = (f, runId, stopReason = 'refusal') => f.ctx.emit('subagent/end', { id: 'leaf', provider: 'controlled', local: true, stopReason, runId })

// Public mounted Host ports/events only: current count and the durable notification owner
// must agree about replacement incarnations, while old run receipts remain attributable.
test('a same-id other-tree replacement cannot send its new stop or notice to the old owner', async t => {
  const roots = new Map(); let other
  const f = await mountedFixture(t, { configureBeforeMount({ ctx, agents }) {
    agents.delete('child'); other = actualAgent('other'); agents.set(other.id, other)
    ctx.provide('subagents', { rootOf(agent) { assert.equal(agents.get(agent.id), agent); return roots.get(agent) ?? agent },
      async listChildren() { return [{ id: 'cold-a', createdAt: 0, mode: 'continuable', label: 'cold' }] } })
  } })
  const old = running('leaf', 'cold-b'); roots.set(old, f.root); f.agents.set(old.id, old)
  assert.equal((await f.mounted.ports.nativeSubagentActivity('root')).running, 1); await settle()
  const replacement = running('leaf', 'other'); roots.set(replacement, other); f.agents.set(replacement.id, replacement)
  const current = await f.mounted.ports.nativeSubagentActivity('root')
  assert.equal(current.running, 0); assert.equal(current.known, true)
  start(f, 'new-other-run'); replacement.status = 'idle'; end(f, 'new-other-run')
  await settle()
  assert.equal(f.mounted.ports.nativeSubagentStops('root').some(row => row.itemId.includes('new-other-run')), false)
  const document = await f.runtimeStorage.read()
  assert(document, 'the actual mounted Runtime document is available')
  assert.equal(document.notifications.some(row => row.ownerSessionId === 'root' && row.notificationId.includes('new-other-run')), false)
})

test('a genuine late old-run end follows the old owner without ending the replacement run', async t => {
  const roots = new Map(); let other
  const f = await mountedFixture(t, { configureBeforeMount({ ctx, agents }) {
    agents.delete('child'); other = actualAgent('other'); agents.set(other.id, other)
    ctx.provide('subagents', { rootOf(agent) { return roots.get(agent) ?? agent }, async listChildren() { return [] } })
  } })
  const old = running('leaf', 'cold-b'); roots.set(old, f.root); f.agents.set(old.id, old)
  await f.mounted.ports.nativeSubagentActivity('root'); start(f, 'old-root-run'); await settle()
  const replacement = running('leaf', 'other'); roots.set(replacement, other); f.agents.set(replacement.id, replacement)
  const events = replacement.session.ownEvents()
  replacement.session.ownEvents = () => [...events, { type: 'turn/end', seq: 42, data: { turn: 42, reason: { kind: 'error', error: { code: 'NEW', message: 'replacement turn only' } } } }]
  await f.mounted.ports.nativeSubagentActivity('other'); start(f, 'new-other-run'); await settle()
  end(f, 'old-root-run'); await settle()
  assert.equal(f.mounted.ports.nativeSubagentStops('root').filter(row => row.itemId.includes('old-root-run')).length, 1)
  assert.equal(f.mounted.ports.nativeSubagentStops('other').some(row => row.itemId.includes('old-root-run')), false)
  assert.equal(f.mounted.ports.nativeSubagentStops('root').find(row => row.itemId.includes('old-root-run')).turn, null, 'the replacement turn tail is not evidence for an older run')
  assert.equal((await f.mounted.ports.nativeSubagentActivity('other')).running, 1)
  replacement.status = 'idle'; end(f, 'new-other-run'); await settle()
  assert.equal(f.mounted.ports.nativeSubagentStops('other').filter(row => row.itemId.includes('new-other-run')).length, 1)
  assert.equal(f.mounted.ports.nativeSubagentStops('root').some(row => row.itemId.includes('new-other-run')), false)
  const document = await f.runtimeStorage.read()
  assert(document.notifications.some(row => row.ownerSessionId === 'root' && row.notificationId.includes('old-root-run')), 'the true late old-run outcome still reaches its original owner notification journal')
})

test('a displaced baseline cannot authorize an unobserved cold replacement start and end', async t => {
  const roots = new Map(); let other
  const f = await mountedFixture(t, { configureBeforeMount({ ctx, agents }) {
    agents.delete('child'); other = actualAgent('other'); agents.set(other.id, other)
    ctx.provide('subagents', { rootOf(agent) { return roots.get(agent) ?? agent }, async listChildren() { return [] } })
  } })
  const old = running('leaf', 'cold-b'); roots.set(old, f.root); f.agents.set(old.id, old)
  await f.mounted.ports.nativeSubagentActivity('root'); await settle()
  const replacement = running('leaf', 'other'); roots.set(replacement, other); f.agents.set(replacement.id, replacement)
  assert.equal((await f.mounted.ports.nativeSubagentActivity('root')).running, 0)
  f.agents.delete('leaf')
  start(f, 'unobserved-other-run'); end(f, 'unobserved-other-run'); await settle()
  assert.equal(f.mounted.ports.nativeSubagentStops('root').some(row => row.itemId.includes('unobserved-other-run')), false)
})

test('legacy creator evidence does not adopt a different same-id live creator chain', async t => {
  const f = await mountedFixture(t, { configureBeforeMount({ ctx, agents }) {
    agents.delete('child'); agents.set('other', actualAgent('other'))
    ctx.provide('subagents', { async listChildren() { return [{ id: 'leaf', createdAt: 0, mode: 'continuable', label: 'legacy' }] } })
  } })
  const old = running('leaf', 'root'); f.agents.set(old.id, old)
  await f.mounted.ports.nativeSubagentActivity('root'); start(f, 'legacy-old-run'); await settle()
  const replacement = running('leaf', 'other'); f.agents.set(replacement.id, replacement)
  start(f, 'legacy-other-run'); replacement.status = 'idle'; end(f, 'legacy-other-run'); await settle()
  assert.equal(f.mounted.ports.nativeSubagentStops('root').some(row => row.itemId.includes('legacy-other-run')), false)
  f.agents.delete('leaf'); end(f, 'legacy-old-run'); await settle()
  assert.equal(f.mounted.ports.nativeSubagentStops('root').filter(row => row.itemId.includes('legacy-old-run')).length, 1,
    'legacy cold terminal receipt still follows its observed old run')
})

test('an older same-owner end cannot clear a newer run terminal receipt', async t => {
  const f = await mountedFixture(t, { configureBeforeMount({ ctx, agents, root }) {
    agents.delete('child'); ctx.provide('subagents', { rootOf() { return root }, async listChildren() { return [] } })
  } })
  const leaf = running('leaf', 'cold-b'); f.agents.set(leaf.id, leaf)
  await f.mounted.ports.nativeSubagentActivity('root')
  start(f, 'same-owner-old'); start(f, 'same-owner-new'); leaf.status = 'idle'; end(f, 'same-owner-new'); await settle()
  assert.equal(f.mounted.ports.nativeSubagentStops('root').filter(row => row.itemId.includes('same-owner-new')).length, 1)
  end(f, 'same-owner-old', 'completed'); await settle()
  assert.equal(f.mounted.ports.nativeSubagentStops('root').filter(row => row.itemId.includes('same-owner-new')).length, 1,
    'an old run end cannot clear the newer failure item after its ledger run retired')
})

test('service and root replacement fence new edges while retaining an authenticated prior run end', async t => {
  for (const variant of ['other-root-service', 'denied-service', 'legacy-service', 'same-id-root', 'selective-denial']) {
    const roots = new Map(); let other
    const f = await mountedFixture(t, { configureBeforeMount({ ctx, agents }) {
      agents.delete('child'); other = actualAgent('other'); agents.set(other.id, other)
      ctx.provide('subagents', { rootOf(agent) { return roots.get(agent) ?? agent }, async listChildren() { return [] } })
    } })
    const leaf = running('leaf', 'cold-b'); roots.set(leaf, f.root); f.agents.set(leaf.id, leaf)
    await f.mounted.ports.nativeSubagentActivity('root'); start(f, 'prior-' + variant); await settle()
    if (variant === 'other-root-service') f.ctx.set('subagents', { rootOf(agent) { return agent === leaf ? other : agent }, async listChildren() { return [] } })
    if (variant === 'denied-service') f.ctx.set('subagents', { rootOf() { throw new Error('new service rejects old runtime facts') }, async listChildren() { return [] } })
    if (variant === 'legacy-service') f.ctx.set('subagents', { async listChildren() { return [] } })
    if (variant === 'same-id-root') f.agents.set('root', actualAgent('root'))
    if (variant === 'selective-denial') {
      f.ctx.set('subagents', { rootOf(agent) { if (agent === f.root) throw new Error('old root denied'); return agent === leaf ? other : agent }, async listChildren() { return [] } })
      await f.mounted.ports.nativeSubagentActivity('other')
    }
    start(f, 'new-' + variant); leaf.status = 'idle'; end(f, 'new-' + variant); await settle()
    assert.equal(f.mounted.ports.nativeSubagentStops('root').some(row => row.itemId.includes('new-' + variant)), false, variant)
    if (variant === 'selective-denial') assert.equal(f.mounted.ports.nativeSubagentStops('other').filter(row => row.itemId.includes('new-' + variant)).length, 1, 'a denied obsolete candidate cannot suppress the verified new root')
    end(f, 'prior-' + variant); await settle()
    assert.equal(f.mounted.ports.nativeSubagentStops('root').filter(row => row.itemId.includes('prior-' + variant)).length, 1, variant + ': true old run end remains observable')
  }
})

test('a proved start before the next count read retains its genuine cold old-run route', async t => {
  const roots = new Map()
  const f = await mountedFixture(t, { configureBeforeMount({ ctx, agents }) {
    agents.delete('child'); ctx.provide('subagents', { rootOf(agent) { return roots.get(agent) ?? agent }, async listChildren() { return [] } })
  } })
  await f.mounted.ports.nativeSubagentActivity('root')
  const leaf = running('leaf', 'cold-b'); roots.set(leaf, f.root); f.agents.set(leaf.id, leaf)
  start(f, 'started-without-poll'); await settle()
  f.agents.delete('leaf'); end(f, 'started-without-poll'); await settle()
  assert.equal(f.mounted.ports.nativeSubagentStops('root').filter(row => row.itemId.includes('started-without-poll')).length, 1)
})
