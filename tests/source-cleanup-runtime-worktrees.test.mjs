import assert from 'node:assert/strict'
import {test} from 'node:test'
import {fixture,policy,caller,signal,actualAgent} from './fixtures/runtime-host.mjs'

test('worktree old notes are removed from both source and history while cleaned binding identity remains queryable',async t=>{
 const f=await fixture(t,{initialPolicy:policy()})
 f.ports.capabilities={...f.ports.capabilities,nativeInitialChildCwd:'supported'}
 f.ports.flushSession=async()=>true
 f.ports.createContinuable=async(exec,r)=>{const a=actualAgent(r.childId,{parent:'root',managed:true,cwd:r.cwd});await f.created(a);return {childId:r.childId,messageId:'initial-message'}}
 const created=await f.runtime.delegate(caller('root'),{description:'task',prompt:'work',worktree:'/existing-tree',operationId:'tree-create'},f.exec())
 assert.equal(created.accepted,true)
 let data=await f.runtime.worktreeAction(caller('root'),'root',{action:'read'},signal())
 const bindingId=data.rows[0].bindingId
 await f.runtime.worktreeAction(caller('root'),'root',{action:'update',command:{operationId:'old-note',bindingId,expectedRevision:data.rows[0].revision,state:'discarded',notes:'unique-old-worktree-marker'}},signal())
 data=await f.runtime.worktreeAction(caller('root'),'root',{action:'read'},signal())
 await f.runtime.worktreeAction(caller('root'),'root',{action:'update',command:{operationId:'clean-note',bindingId,expectedRevision:data.rows[0].revision,state:'cleaned',notes:'current-cleaned-report'}},signal())
 data=await f.runtime.worktreeAction(caller('root'),'root',{action:'read'},signal())
 const result=await f.runtime.historyAction(caller('root'),'root',{action:'purge-source',domain:'worktrees',request:{operationId:'source-tree-clear',expectedRevision:data.revision,throughRevision:data.revision,bindingIds:[bindingId]}},signal())
 assert.equal(result.sourceRecordsDeleted,true)
 const page=await f.runtime.historyAction(caller('root'),'root',{action:'query',query:{kind:'worktree',recordId:bindingId}},signal())
 const detail=await f.runtime.historyAction(caller('root'),'root',{action:'detail',historyIds:page.rows.map(row=>row.historyId)},signal())
 assert(!JSON.stringify(detail).includes('unique-old-worktree-marker'))
 assert(JSON.stringify(detail).includes('current-cleaned-report'))
 data=await f.runtime.worktreeAction(caller('root'),'root',{action:'read'},signal())
 assert.equal(data.current.length,0)
 assert(!JSON.stringify(data).includes('unique-old-worktree-marker'))
 assert.equal(data.rows[0].value.actualChildSessionId,created.childId)
})
