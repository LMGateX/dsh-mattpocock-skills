import assert from 'node:assert/strict'
import {test} from 'node:test'
import {fixture,policy,workflow,ticket,caller,signal,actualAgent} from './fixtures/runtime-host.mjs'

test('explicit source history cleanup removes old record bodies and derived copies without changing current progress or replay safety',async t=>{
 const f=await fixture(t,{initialPolicy:policy()})
 await f.apply('put-workflow',{value:workflow})
 await f.apply('put-ticket',{localTicketId:'A',value:ticket('partial','unique-old-source-marker')})
 await f.apply('put-ticket',{localTicketId:'A',value:ticket('repair','current-report')})
 const before=await f.read(),rev=before.records.revision
 const result=await f.runtime.historyAction(caller('root'),'root',{action:'purge-source',domain:'records',request:{operationId:'source-clear-A',expectedRevision:rev,throughRevision:rev,targets:[{kind:'ticket',workflowId:'flow',localTicketId:'A'}]}},signal())
 assert.equal(result.sourceRecordsDeleted,true)
 assert.equal(result.nativeConversationDeleted,false)
 const raw=await f.instrumentStorage.read(before.instance.instrumentInstanceId)
 assert(!JSON.stringify(raw).includes('unique-old-source-marker'))
 assert(JSON.stringify(raw).includes('current-report'))
 const page=await f.runtime.historyAction(caller('root'),'root',{action:'query',query:{kind:'ticket',recordId:JSON.stringify(['flow','A'])}},signal())
 const detail=await f.runtime.historyAction(caller('root'),'root',{action:'detail',historyIds:page.rows.map(r=>r.historyId)},signal())
 assert(!JSON.stringify(detail).includes('unique-old-source-marker'))
 assert.equal((await f.read()).records.tickets[0].value.summary,'current-report')
 const replay=await f.runtime.historyAction(caller('root'),'root',{action:'purge-source',domain:'records',request:{operationId:'source-clear-A',expectedRevision:rev,throughRevision:rev,targets:[{kind:'ticket',workflowId:'flow',localTicketId:'A'}]}},signal())
 assert.equal(replay.replayed,true)
})
