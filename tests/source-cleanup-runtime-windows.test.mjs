import assert from 'node:assert/strict'
import {test} from 'node:test'
import {fixture,policy,caller,signal} from './fixtures/runtime-host.mjs'

test('window source cleanup compacts current facts and removes old knowledge from source and derived history',async t=>{
 const f=await fixture(t,{initialPolicy:policy()})
 f.ports.nativeActivity=async()=>({known:false,reason:'unique-old-window-marker',liveAgents:[...f.agents.values()]})
 await f.reopen(); await f.read()
 f.ports.nativeActivity=async()=>({known:false,reason:'current-window-marker',liveAgents:[...f.agents.values()]})
 await f.reopen(); const before=await f.read()
 const result=await f.runtime.historyAction(caller('root'),'root',{action:'purge-source',domain:'windows',request:{operationId:'source-window-clear',expectedRevision:before.windows.revision,throughRevision:before.windows.revision,targets:[{kind:'knowledge'}]}},signal())
 assert.equal(result.sourceRecordsDeleted,true)
 const raw=await f.windowStorage.read(before.instance.instrumentInstanceId)
 assert(!JSON.stringify(raw).includes('unique-old-window-marker'))
 assert(JSON.stringify(raw).includes('current-window-marker'))
 const page=await f.runtime.historyAction(caller('root'),'root',{action:'query',query:{kind:'runtime-knowledge'}},signal())
 const detail=await f.runtime.historyAction(caller('root'),'root',{action:'detail',historyIds:page.rows.map(row=>row.historyId)},signal())
 assert(!JSON.stringify(detail).includes('unique-old-window-marker'))
 assert.equal((await f.read()).windows.runtimeKnowledge.known,false)
})
