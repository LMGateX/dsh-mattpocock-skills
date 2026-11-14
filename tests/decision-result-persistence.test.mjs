import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { basename, isAbsolute, join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { SessionInstruments, createDomainInstrumentStorage, parseInstrumentDocument } from '../lib/controls/index.js'
import { openInstrumentDomain } from './fixtures/instrument-domain.mjs'

const answer = { answer: 'Use the isolated test runtime', source: { kind: 'user-message', sessionId: 'A', messageId: 'reply', text: 'Yes, isolated only' }, included: ['temporary test data'], excluded: ['production writes'] }

test('native JSON V5 survives cold reopen and independent process, compact/purge, legacy replies and lost durable receipt', async t => {
  assert(process.env.DSH_CONTROLS_HOST_ROOT && isAbsolute(process.env.DSH_CONTROLS_HOST_ROOT), 'set DSH_CONTROLS_HOST_ROOT to the isolated SDK; native V5 persistence is mandatory')
  const temporary = await mkdtemp(join(tmpdir(), 'dsh-decision-result-')), root = join(temporary, 'storage')
  let f
  const reopen = async () => { await f?.close(); f = await openInstrumentDomain(root); return f }
  t.after(async () => { try { await f?.close() } finally { assert(isAbsolute(temporary) && basename(temporary).startsWith('dsh-decision-result-')); await rm(temporary, { recursive: true, force: true }) } })
  await reopen()
  await f.apply('put-workflow', { value: { title: 'Task', axes: [] } })
  const command = await f.command('put-decision', { decisionId: 'D', value: { question: 'Scope?', status: 'reported', pending: true, awaitingImplementation: true, result: answer }, references: ['task:source'] })
  const lost = new Error('V5 durable receipt lost'), table = f.table
  const faulty = { get: key => table.get(key), put: (...args) => table.put(...args), update: async (...args) => { await table.update(...args); throw lost } }
  const instruments = new SessionInstruments(f.controls, createDomainInstrumentStorage(faulty), f.authority, () => 12345)
  await assert.rejects(instruments.apply('A', 'A', command), error => error === lost)
  await assert.rejects(instruments.read('A', 'A'), error => error.code === 'storage-uncertain')
  await reopen()
  let replay = await f.instruments.apply('A', 'A', command)
  assert.equal(replay.replayed, true)
  assert.deepEqual(replay.snapshot.decisions[0].value.result, answer)
  assert.equal(replay.snapshot.decisions[0].history[0].author.kind, 'agent')
  assert.equal(f.table.get(replay.snapshot.instance.instrumentInstanceId).schemaVersion, 5)
  await f.instruments.compact('A', 'A', { operationId: 'compact', expectedRevision: replay.snapshot.revision })
  let before = await f.read()
  await reopen()
  assert.deepEqual(await f.read(), before)
  assert.deepEqual((await f.instruments.readCurrent('A', 'A')).decisions[0].value.result, answer)
  await f.close()
  const child = execFileSync(process.execPath, [fileURLToPath(new URL('./fixtures/instruments-restart.mjs', import.meta.url)), root], { encoding: 'utf8' })
  assert.deepEqual(JSON.parse(child).decisions[0].value.result, answer)
  await reopen()
  await f.apply('put-decision', { decisionId: 'D', value: { question: 'Scope?', status: 'human correction', result: 'Original text replies remain valid' } }, 'user', 'A')
  before = await f.read()
  const purge = { operationId: 'purge', expectedRevision: before.revision, throughRevision: before.revision, targets: [{ kind: 'decision', workflowId: 'flow', decisionId: 'D' }] }
  const purged = await f.instruments.purgeHistory('A', 'A', purge)
  assert.equal(purged.removedVersions, 1)
  await reopen()
  replay = await f.instruments.apply('A', 'A', command)
  assert.equal(replay.replayed, true)
  const row = replay.snapshot.decisions[0]
  assert.equal(row.value.result, 'Original text replies remain valid')
  assert.equal(row.value.pending, true)
  assert.equal(row.value.awaitingImplementation, true)
  assert.equal(row.creator.sessionId, 'A')
  assert.equal(row.history.length, 1)
  assert.equal(row.history[0].author.kind, 'user')
  assert.equal((await f.instruments.purgeHistory('A', 'A', purge)).replayed, true)
  const raw = f.table.get(replay.snapshot.instance.instrumentInstanceId)
  assert.equal(raw.schemaVersion, 5)
  assert.equal(parseInstrumentDocument(JSON.parse(JSON.stringify(raw))).schemaVersion, 5)
})
