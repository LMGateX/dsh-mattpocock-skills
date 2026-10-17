import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fixture, caller, signal, policy, workflow, ticket } from './fixtures/runtime-host.mjs'

// Capture is a projection side effect. Without a source watermark the dedupe index and the
// observation replay run on every rebuild even when no document moved. The projection itself
// always reads the history context once; an extra read here is a capture re-entering the store.
test('an unchanged projection does not re-enter history capture', async t => {
  const f = await fixture(t, { initialPolicy: policy() })
  await f.apply('put-workflow', { value: workflow })
  const c = caller('root'), s = signal()
  await f.runtime.preStep(c, s, [], '1:1')

  const name = [...f.units.keys()].find(key => key.startsWith('history_'))
  assert.ok(name, 'the first capture opened a history unit')
  const store = f.units.get(name)
  const read = store.read.bind(store)
  let reads = 0
  store.read = async () => { reads += 1; return read() }

  await new Promise(resolve => setTimeout(resolve, 2100))
  const before = reads
  await f.runtime.preStep(c, s, [], '1:2')
  assert.ok(reads - before <= 1, 'only the projection context read; no capture re-read (got ' + (reads - before) + ')')

  await f.apply('put-ticket', { localTicketId: 'T1', value: ticket() })
  const afterApply = reads
  await f.runtime.preStep(c, s, [], '1:3')
  assert.ok(reads >= afterApply, 'the new business version is captured without losing history')
})
