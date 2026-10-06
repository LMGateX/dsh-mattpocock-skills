import test from 'node:test'
import assert from 'node:assert/strict'
import { REMOTE_METHODS, REMOTE_CONTRIBUTION } from '../lib/controls/remote-contract.js'

test('startup preferences use two cancellable, strict operator Remote methods separate from policy', () => {
  assert.ok(REMOTE_METHODS.includes('startupStatus'))
  assert.ok(REMOTE_METHODS.includes('saveStartupSettings'))
  const read = REMOTE_CONTRIBUTION.descriptors.find(d => d.method === 'startupStatus')
  const save = REMOTE_CONTRIBUTION.descriptors.find(d => d.method === 'saveStartupSettings')
  assert.deepEqual(read.parameters, [])
  assert.equal(read.cancellation.parameter, 'signal')
  assert.deepEqual(save.parameters.map(p => p.wire), ['desired', 'expectedRevision'])
  assert.equal(save.cancellation.parameter, 'signal')
  const desired = save.parameters[0].codec.create()
  assert.deepEqual(desired.parse({startupCwdEnabled:true}), {startupCwdEnabled:true})
  for (const forged of [{startupCwdEnabled:'true'}, {startupCwdEnabled:true,epoch:'fake-reboot'}, {startupCwdEnabled:true,enabledNow:true}, {startupCwdEnabled:true,hostRoot:'/foreign'}]) assert.throws(() => desired.parse(forged))
  assert.throws(() => save.result.create().parse({revision:0,desired:{startupCwdEnabled:true},enabledNow:true}))
})
