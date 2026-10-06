import assert from 'node:assert/strict'
import {test} from 'node:test'
import {fixture,policy,workflow,ticket,caller,signal,actualAgent} from './fixtures/runtime-host.mjs'

test('assigned descendants never receive the coordinator worktree registry or sibling business tasks',async t=>{
 const f=await fixture(t,{initialPolicy:policy()});await f.apply('put-workflow',{value:workflow});for(const id of ['A','B'])await f.apply('put-ticket',{localTicketId:id,value:ticket()});await f.assign('old-child','flow',['A'])
 f.ports.capabilities={...f.ports.capabilities,nativeInitialChildCwd:'supported'};f.ports.flushSession=async()=>true
 f.ports.createContinuable=async(exec,r)=>{const a=actualAgent(r.childId,{parent:'root',managed:true,cwd:r.cwd});await f.created(a);return {childId:r.childId,messageId:'scope-message'}}
 await f.runtime.delegate(caller('root'),{description:'private-sibling-task',prompt:'work on B',worktree:'/private-sibling-tree',workflowId:'flow',ticketIds:['B']},f.exec())
 const child=await f.read('old-child')
 assert.equal(child.worktreeBindings.length,0)
 assert.equal(child.resources.length,0)
 const text=(await f.runtime.preStep(caller('old-child'),signal())).map(m=>JSON.stringify(m)).join('')
 assert(!text.includes('private-sibling-task'));assert(!text.includes('/private-sibling-tree'))
 assert.equal((await f.read()).worktreeBindings.length,1)
})

test('known legacy resource IDs cannot expose sibling business or paths to assigned or unassigned children',async t=>{
 const f=await fixture(t,{initialPolicy:policy()})
 await f.apply('put-workflow',{value:workflow});for(const id of ['A','B'])await f.apply('put-ticket',{localTicketId:id,value:ticket()})
 await f.assign('old-child','flow',['A'])
 await f.created(actualAgent('unassigned-child',{parent:'root',managed:true}))
 const owner=(await f.read()).instance
 const resource={resourceId:'legacy-B',controlWorkspaceId:owner.controlWorkspaceId,ownerInstanceId:owner.instrumentInstanceId,
  identity:{repositoryPath:'/fixture/repo',root:'/fixture',path:'/private-ticket-B-tree',gitCommonDir:'/fixture/repo/.git',gitCommonDirIdentity:'common',gitDir:'/fixture/repo/.git/worktrees/B',gitDirIdentity:'private-B',pathIdentity:'tree-B',rootIdentity:'root',branchRef:'refs/heads/B',branchOwned:true,ownership:'owned',baseOid:'a'.repeat(40)},
  status:'retained',business:{status:'private business for ticket B'},businessAuthorId:'agent:root',references:[],retireRequest:null,entrancesClosed:false,nativeColdResumeClosed:false,diagnostic:null}
 assert.equal(await f.resourceStorage.compareAndSwap(0,{schemaVersion:1,revision:1,resources:[resource],leases:[]}),true)
 f.setRunner(()=>{throw Object.assign(new Error('physical Git capability unavailable'),{code:'unsupported'})})
 const request={action:'read',resourceId:'legacy-B'}
 await assert.rejects(f.runtime.resourceAction(caller('old-child'),'old-child',request,signal()),error=>error.code==='access-denied')
 await assert.rejects(f.runtime.resourceAction(caller('unassigned-child'),'unassigned-child',request,signal()),error=>error.code==='access-denied')
 await assert.rejects(f.runtime.resourceAction(caller('other'),'other',request,signal()),error=>error.code==='access-denied')
 const retained=await f.runtime.resourceAction(caller('root'),'root',request,signal())
 assert.equal(retained.business.status,'private business for ticket B');assert.equal(retained.identity.path,'/private-ticket-B-tree')
 assert.equal(retained.actualCanRetire.facts,null);assert.equal(retained.actualCanRetire.allowed,false)
 assert(retained.actualCanRetire.reasons.includes('physical-inspection-unsupported'))
})
