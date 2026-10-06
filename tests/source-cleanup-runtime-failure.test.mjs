import assert from 'node:assert/strict'
import {test} from 'node:test'
import {fixture,policy,workflow,ticket,caller,signal} from './fixtures/runtime-host.mjs'
// Agreed seams: public RuntimeFacade operations and VersionedStorage transport barriers.
// Genuine production CAS executes unless a caller cancellation fences it before entry.
async function ready(t){const f=await fixture(t,{initialPolicy:policy()});await f.apply('put-workflow',{value:workflow});await f.apply('put-ticket',{localTicketId:'A',value:ticket('partial','unique-source-private-marker')});await f.apply('put-ticket',{localTicketId:'A',value:ticket('repair','current-private-report')});return f}

test('latched source storage does not block retained independent history query/detail or invent a source CAS revision',async t=>{
 const f=await ready(t);const before=await f.read();const read=f.instrumentStorage.read.bind(f.instrumentStorage);let latched=false
 f.instrumentStorage.compareAndSwap=async()=>{latched=true;throw new Error('source uncertain latch')}
 f.instrumentStorage.read=async(...args)=>{if(latched)throw new Error('source handle latched');return read(...args)}
 const partial=await f.runtime.historyAction(caller('root'),'root',{action:'purge-source',domain:'records',request:{operationId:'latched-clear',expectedRevision:before.records.revision,throughRevision:before.records.revision,targets:[{kind:'ticket',workflowId:'flow',localTicketId:'A'}]}},signal())
 assert.equal(partial.phase,'partial')
 const page=await f.runtime.historyAction(caller('root'),'root',{action:'query',query:{kind:'ticket'}},signal())
 assert.equal(page.sourceRevisions.records,null);assert.equal(page.sourceRefresh.status,'unknown');assert(page.rows.some(row=>row.purged));assert(page.rows.some(row=>!row.purged))
 const detail=await f.runtime.historyAction(caller('root'),'root',{action:'detail',historyIds:page.rows.map(row=>row.historyId)},signal())
 assert(JSON.stringify(detail).includes('current-private-report'));assert(!JSON.stringify(detail).includes('unique-source-private-marker'));assert.equal(detail.sourceRefresh.status,'unknown')
})

test('suppression page failure reports known committed rows and preserves a resumable plan without source deletion',async t=>{
 const f=await fixture(t,{initialPolicy:policy()});await f.apply('put-workflow',{value:workflow})
 for(let n=0;n<104;n++)await f.apply('put-ticket',{localTicketId:'A',value:ticket('repair','version-'+n)})
 const before=await f.read();const historyStore=[...f.units.entries()].find(([key])=>key.startsWith('history_'))[1];const swap=historyStore.compareAndSwap.bind(historyStore);let pageCount=0
 historyStore.compareAndSwap=async(rev,next)=>{const old=await historyStore.read();if(next.rows.filter(row=>row.purged).length>old.rows.filter(row=>row.purged).length&&++pageCount===2)throw new Error('second suppression page refused');return swap(rev,next)}
 const request={action:'purge-source',domain:'records',request:{operationId:'paged-clear',expectedRevision:before.records.revision,throughRevision:before.records.revision,targets:[{kind:'ticket',workflowId:'flow',localTicketId:'A'}]}}
 const result=await f.runtime.historyAction(caller('root'),'root',request,signal())
 assert.equal(result.phase,'partial');assert.equal(result.sourceOutcome,'not-started');assert.equal(result.sourceRecordsDeleted,false);assert.equal(result.acknowledgedSuppressionRows,100)
 assert.equal((await f.instrumentStorage.read(before.instance.instrumentInstanceId)).revision,before.records.revision)
 const done=await f.runtime.historyAction(caller('root'),'root',request,signal());assert.equal(done.sourceRecordsDeleted,true)
})

test('lossless source checkpoint acknowledgements never copy private history bodies into a side journal',async t=>{
 const f=await ready(t);const before=await f.read()
 const compact=await f.runtime.historyAction(caller('root'),'root',{action:'compact-source',domain:'records',request:{operationId:'compact-records',expectedRevision:before.records.revision}},signal())
 assert.equal(compact.sourceRecordsDeleted,false)
 assert.equal(Object.hasOwn(compact,'snapshot'),false)
 const after=await f.read()
 await f.runtime.historyAction(caller('root'),'root',{action:'purge-source',domain:'records',request:{operationId:'clear-records',expectedRevision:after.records.revision,throughRevision:after.records.revision,targets:[{kind:'ticket',workflowId:'flow',localTicketId:'A'}]}},signal())
 for(const store of f.units.values()){const value=await store.read();assert(value===undefined||!JSON.stringify(value).includes('unique-source-private-marker'))}
})

test('a failed source write is partial, keeps durable suppression, and the same authorized cleanup can finish later',async t=>{
 const f=await ready(t);const before=await f.read()
 const request={action:'purge-source',domain:'records',request:{operationId:'partial-clear',expectedRevision:before.records.revision,throughRevision:before.records.revision,targets:[{kind:'ticket',workflowId:'flow',localTicketId:'A'}]}}
 const swap=f.instrumentStorage.compareAndSwap.bind(f.instrumentStorage);let fail=true
 f.instrumentStorage.compareAndSwap=async(...args)=>{if(fail)throw new Error('simulated source write denial');return swap(...args)}
 const partial=await f.runtime.historyAction(caller('root'),'root',request,signal())
 assert.equal(partial.phase,'partial');assert.equal(partial.sourceRecordsDeleted,null);assert.equal(partial.sourceOutcome,'failed-or-uncertain')
 assert(JSON.stringify(await f.instrumentStorage.read(before.instance.instrumentInstanceId)).includes('unique-source-private-marker'))
 await f.read()
 const page=await f.runtime.historyAction(caller('root'),'root',{action:'query',query:{kind:'ticket'}},signal())
 const detail=await f.runtime.historyAction(caller('root'),'root',{action:'detail',historyIds:page.rows.map(row=>row.historyId)},signal())
 assert(!JSON.stringify(detail).includes('unique-source-private-marker'))
 fail=false
 const finished=await f.runtime.historyAction(caller('root'),'root',request,signal())
 assert.equal(finished.sourceRecordsDeleted,true)
 assert(!JSON.stringify(await f.instrumentStorage.read(before.instance.instrumentInstanceId)).includes('unique-source-private-marker'))
})

test('cancellation during derived suppression load prevents its not-yet-started deletion CAS',async t=>{
 const f=await ready(t),before=await f.read()
 const history=[...f.units].find(([key])=>key.startsWith('history_'))[1]
 const read=history.read.bind(history),swap=history.compareAndSwap.bind(history)
 const entered=Promise.withResolvers(),resume=Promise.withResolvers();t.after(()=>resume.resolve())
 let pause=true,deletionCAS=0
 history.read=async()=>{const value=await read();const journal=[...f.units].find(([key])=>key.startsWith('cleanup_'))?.[1];if(pause&&journal&&(await journal.read())?.rows.length){pause=false;entered.resolve();await resume.promise}return value}
 history.compareAndSwap=async(rev,next)=>{if(next.actions.at(-1)?.action.action==='purge')deletionCAS++;return swap(rev,next)}
 const control=new AbortController()
 const pending=f.runtime.historyAction(caller('root'),'root',{action:'purge-source',domain:'records',request:{operationId:'cancel-derived-load',expectedRevision:before.records.revision,throughRevision:before.records.revision,targets:[{kind:'ticket',workflowId:'flow',localTicketId:'A'}]}},control.signal)
 const outcome=pending.then(value=>({value}),error=>({error}))
 await Promise.race([entered.promise,outcome.then(()=>{throw new Error('cleanup did not reach suppression read')})])
 control.abort(new Error('cancel while suppression reads'));resume.resolve()
 const result=await outcome
 assert.equal(deletionCAS,0,'cancelled derived deletion must never enter CAS')
 assert.equal(result.value.phase,'partial');assert.equal(result.value.acknowledgedSuppressionRows,0)
 assert.equal(result.value.sourceOutcome,'not-started');assert.equal(result.value.sourceRecordsDeleted,false)
 assert(JSON.stringify(await read()).includes('unique-source-private-marker'))
 assert.equal((await f.instrumentStorage.read(before.instance.instrumentInstanceId)).revision,before.records.revision)
})

test('ordinary derived purge does not retry a refused CAS after caller cancellation',async t=>{
 const f=await ready(t);await f.read()
 const page=await f.runtime.historyAction(caller('root'),'root',{action:'query',query:{kind:'ticket'}},signal())
 const history=[...f.units].find(([key])=>key.startsWith('history_'))[1],swap=history.compareAndSwap.bind(history)
 const control=new AbortController(),reason=new Error('cancel before retry');let deletionCAS=0
 history.compareAndSwap=async(rev,next)=>{if(next.actions.at(-1)?.action.action==='purge'){deletionCAS++;if(deletionCAS===1){control.abort(reason);return false}}return swap(rev,next)}
 const outcome=await f.runtime.historyAction(caller('root'),'root',{action:'purge',historyIds:[page.rows[0].historyId]},control.signal).then(value=>({value}),error=>({error}))
 assert.equal(outcome.error,reason)
 assert.equal(deletionCAS,1,'a refused CAS must not be retried after cancellation')
 assert.equal((await history.read()).rows.find(row=>row.historyId===page.rows[0].historyId).purged,false)
})

test('a genuinely committed source CAS with a lost acknowledgment reports unknown deletion without retry or rollback',async t=>{
 const f=await ready(t),before=await f.read()
 const swap=f.instrumentStorage.compareAndSwap.bind(f.instrumentStorage);let sourceCAS=0
 f.instrumentStorage.compareAndSwap=async(...args)=>{sourceCAS++;const committed=await swap(...args);assert.equal(committed,true);throw new Error('source committed but transport lost acknowledgment')}
 const result=await f.runtime.historyAction(caller('root'),'root',{action:'purge-source',domain:'records',request:{operationId:'committed-lost-ack',expectedRevision:before.records.revision,throughRevision:before.records.revision,targets:[{kind:'ticket',workflowId:'flow',localTicketId:'A'}]}},signal())
 assert.equal(result.phase,'partial');assert.equal(result.sourceOutcome,'failed-or-uncertain')
 assert.equal(result.sourceRecordsDeleted,null,'an unacknowledged invocation is not proof that source deletion failed')
 assert.equal(result.derivedHistoryDeleted,true);assert.equal(sourceCAS,1)
 const durable=await f.instrumentStorage.read(before.instance.instrumentInstanceId)
 assert.equal(durable.revision,before.records.revision+1)
 assert(!JSON.stringify(durable).includes('unique-source-private-marker'))
 assert(JSON.stringify(durable).includes('current-private-report'))
})
