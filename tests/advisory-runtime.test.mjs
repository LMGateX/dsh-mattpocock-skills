import assert from 'node:assert/strict'
import {test} from 'node:test'
import {actualAgent,fixture,policy} from './fixtures/runtime-host.mjs'

test('reference windows and unknown S never veto native subagent creation or assignment',async t=>{
 const f=await fixture(t,{known:false,initialPolicy:policy({enabled:true,ticketWindowSize:1,runningSubagentLimit:1})})
 const child=actualAgent('advisory-native-child',{parent:'root',managed:true})
 await f.created(child)
 await f.assign(child.id,null,[])
 const snap=await f.read()
 assert.equal(snap.windows.S.used,1,'the host live count is reported even at the reference limit')
 assert.equal(snap.windows.S.countKnown,false)
 assert.equal(snap.windows.S.overcommitted,false)
 assert.deepEqual(snap.worktreeBindings,[],'native creation plus assign does not write a strong binding')
 assert.deepEqual(f.guards,[],'advisory windows install no native veto')
})
