import assert from 'node:assert/strict'
import {test} from 'node:test'
import {fixture,policy,caller} from './fixtures/runtime-host.mjs'

test('reference windows and unknown observations do not block ordinary native delegation or managed follow-up',async t=>{
 const f=await fixture(t,{known:false,initialPolicy:policy({enabled:true,ticketWindowSize:1,runningSubagentLimit:1})})
 assert(f.guards.every(guard=>guard({...f.exec(),name:'subagent'})===undefined),'reference policy must not reject ordinary native delegation')
 await f.managed({args:{description:'research',prompt:'inspect'}})
 await f.managed({args:{description:'more research',prompt:'inspect independently'}})
 await f.managed({nativeTool:'send_message',args:{agent_id:'old-child',message:'continue'}})
 assert.equal(f.nativeCalls.length,3)
 assert.equal((await f.read()).windows.runtimeKnowledge.known,false)
 assert.equal(caller('root').kind,'agent')
})

test('measurement failure preserves native dispatch but stable call identity prevents redispatch',async t=>{
 const f=await fixture(t,{initialPolicy:policy()}),exec=f.exec('root','measurement-failed')
 f.windowStorage.read=async()=>{throw new Error('measurement storage unavailable')}
 const first=await f.managed({exec})
 assert.equal(first.outcome,'success')
 assert.equal(f.nativeCalls.length,1)
 await assert.rejects(f.managed({exec}),/replay|redispatch|operation/)
 assert.equal(f.nativeCalls.length,1)
})
