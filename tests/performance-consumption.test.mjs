import assert from 'node:assert/strict'
import { test } from 'node:test'
import { caller } from './fixtures/runtime-host.mjs'
const { SessionHistory, createDomainHistoryStorage } = await import('../src/controls/history.ts')
const instance = { instrumentInstanceId: 'I', ownerSessionId: 'root', controlWorkspaceId: 'W' }
const author = caller('root')
const source = { kind: 'authored', domain: 'instruments', author, recordedAt: 10, coverage: 'recorded-history' }
const observation = (kind, id, version, flags = {}) => ({ kind, recordId: id, recordKey: id, version, snapshot: { value: version }, source, flags })

test('trusted immutable history reuses active context, invalidating context, purge, suppression and source changes', async () => {
  let document
  const table = { get() { return document }, async put(_key, value) { document = value }, async update(_key, fn) { document = fn(document); return document } }
  const storage = createDomainHistoryStorage(table, instance)
  const history = new SessionHistory(instance, storage, () => 100)
  await history.capture([observation('ticket', 'T', 1), observation('decision', 'D', 1, { done: true }), observation('worktree', 'W', 1)])
  const first = await history.activeContext()
  assert.deepEqual(first.map(row => row.recordId), ['T', 'W'])
  assert.equal(await new SessionHistory(instance, storage).activeContext(), first, 'hot trusted document does not scan all retained rows again')
  await history.apply({ action: 'set-context', kind: 'decision', recordId: 'D', included: true }, source)
  assert.deepEqual((await history.activeContext()).map(row => row.recordId), ['T', 'D', 'W'])
  await history.capture([observation('worktree', 'W', 2, { cleanedWorktree: true })])
  assert.deepEqual((await history.activeContext()).map(row => row.recordId), ['T', 'D'])
  await history.apply({ action: 'set-context', kind: 'decision', recordId: 'D', included: false }, source)
  const id = (await history.query({ kind: 'decision' })).rows[0].historyId
  await history.apply({ action: 'purge', historyIds: [id] }, source)
  await history.capture([observation('decision', 'D', 1, { done: true })])
  assert.equal((await history.detail([id])).rows[0].snapshot, null, 'capture cannot resurrect a suppressed historical source')
  assert.deepEqual((await history.activeContext()).map(row => row.recordId), ['T'])
  await history.capture([observation('ticket', 'T', 2)])
  assert.equal((await history.activeContext())[0].version, 2)
})
