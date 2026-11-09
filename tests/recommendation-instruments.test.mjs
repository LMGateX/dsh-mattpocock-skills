import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SessionInstruments, OwnerDecisionPolicyStore, parseOwnerDecisionPolicyDocument, parseInstrumentDocument, parseInstrumentCommand } from '../lib/controls/index.js'
import { MemoryVersionedStorage } from '../lib/controls/versioned-storage.js'
import { instrumentFixture } from './fixtures/instrument-fixture.mjs'
const user={kind:'user',principalId:'user',sessionId:null}
const question={question:'Choose delivery path',status:'open',pending:true,addressee:{kind:'user',principalId:'user'},options:[{key:'B',label:'Recommended'},{key:'A',label:'Alternative'}],recommendation:'B',context:'Keep constraints',result:'Prior explanation',awaitingImplementation:true}
async function setup() {
 const f=await instrumentFixture();let now=12345
 const instance=(await f.read()).instance, policyStorage=new MemoryVersionedStorage(parseOwnerDecisionPolicyDocument)
 const policy=new OwnerDecisionPolicyStore({storageFor:()=>policyStorage,now:()=>now,newEpochId:()=> 'epoch',authorizeOperator:async()=>{},authorizeEnable:async()=>{}})
 await policy.save(instance,{operationId:'enable',expectedRevision:0,expectedScope:instance,action:'enable',durationMs:3600000},user)
 const instruments=new SessionInstruments(f.controls,f.storage,f.authority,()=>now,policy)
 const apply=async(action,fields={},principal='A',session='A')=>instruments.apply(principal,session,{operationId:crypto.randomUUID(),expectedRevision:(await instruments.read(principal,session)).businessRevision,workflowId:'flow',action,...fields})
 await apply('put-workflow',{value:{title:'Task',axes:[]}})
 return {...f,instance,policy,policyStorage,instruments,apply,setNow:v=>now=v,getNow:()=>now}
}
const adoption=async(f,operationId='adopt')=>{
 const snapshot=await f.instruments.read('A','A'),row=snapshot.decisions[0],candidate=row.recommendationSupport.candidate
 return {operationId,expectedRevision:snapshot.businessRevision,workflowId:'flow',decisionId:row.decisionId,action:'adopt-decision-recommendation',references:['source:adoption'],value:{optionKey:candidate.optionKey,decisionRevision:candidate.decisionRevision,policyEpochId:candidate.policyEpochId,policyRevision:candidate.policyRevision}}
}
test('explicit adoption is agent-authored, preserves commitments and merges references, then replays after disable',async()=>{
 const f=await setup();await f.apply('put-decision',{decisionId:'D',value:question,references:['source:task']})
 const command=await adoption(f),result=await f.instruments.apply('A','A',command),row=result.snapshot.decisions[0]
 assert.equal(row.value.pending,false)
 assert.deepEqual({...row.value,pending:true},(await f.instruments.read('A','A')).decisions[0].history[0].value)
 assert.equal(row.policySelection.selectedOptionKey,'B');assert.equal(row.policySelection.decisionSourceRevision,2)
 assert.equal(row.policySelection.authorizedAt,12345)
 assert.equal(row.history.at(-1).author.kind,'agent');assert.deepEqual(row.history.at(-1).references,['source:task','source:adoption'])
 assert.equal(row.recommendationSupport.status,'adopted');assert.equal(row.history.at(-1).policySelection.selectedOptionKey,'B')
 assert.equal((await f.instruments.readSummary('A','A')).summary.pendingUserDecisionCount,0)
 await f.policy.save(f.instance,{operationId:'disable',expectedRevision:1,expectedScope:f.instance,action:'disable'},user)
 const replay=await f.instruments.apply('A','A',command)
 assert.equal(replay.replayed,true);assert.equal(replay.appliedRevision,result.appliedRevision)
 assert.equal((await f.instruments.readCurrent('A','A')).decisions[0].policySelection.selectedOptionKey,'B')
})
test('V4 checkpoint, recovery and selective purge retain authoritative binding/selection and dedup without resurrecting versions',async()=>{
 const f=await setup();await f.apply('put-task-reference',{localTicketId:'T1',value:{source:{kind:'unverified'},locator:'task:1'}})
 await f.apply('put-decision',{decisionId:'D',value:{...question,ticketIds:['T1']},references:['source:task']})
 const command=await adoption(f);await f.instruments.apply('A','A',command)
 let snapshot=await f.instruments.read('A','A')
 await f.instruments.compact('A','A',{operationId:'compact',expectedRevision:snapshot.revision})
 const reopened=new SessionInstruments(f.controls,f.storage,f.authority,()=>12345,f.policy)
 snapshot=await reopened.read('A','A')
 assert.equal(snapshot.decisions[0].policyBinding.createdRevision,3)
 assert.equal(snapshot.decisions[0].policySelection.selectedOptionKey,'B')
 assert.equal(snapshot.taskReferences[0].localTicketId,'T1')
 assert.equal((await reopened.readCurrent('A','A')).decisions[0].policySelection.selectedOptionKey,'B')
 await reopened.apply('user','A',{operationId:'correct',expectedRevision:snapshot.businessRevision,action:'put-decision',workflowId:'flow',decisionId:'D',value:{question:question.question,status:'corrected',result:'Human correction'}})
 snapshot=await reopened.read('A','A')
 assert.equal(snapshot.decisions[0].policySelection,undefined)
 assert.equal(snapshot.decisions[0].history[1].policySelection.selectedOptionKey,'B')
 const replay=await reopened.apply('A','A',command)
 assert.equal(replay.replayed,true);assert.equal(replay.snapshot.decisions[0].value.result,'Human correction')
 assert.equal(replay.recommendation.status,'adopted');assert.equal(replay.recommendation.selection.selectedOptionKey,'B')
 await reopened.purgeHistory('A','A',{operationId:'purge',expectedRevision:snapshot.revision,throughRevision:3,targets:[{kind:'decision',workflowId:'flow',decisionId:'D'}]})
 snapshot=await reopened.read('A','A')
 assert.deepEqual(snapshot.decisions[0].history.map(h=>h.revision),[4,6])
 assert.equal(snapshot.decisions[0].history[0].policySelection.selectedOptionKey,'B')
 assert.equal(snapshot.decisions[0].policyBinding.createdRevision,3)
 assert.equal((await reopened.apply('A','A',command)).replayed,true)
})
test('a policy read cannot hide assignment revocation before adoption CAS',async()=>{
 const f=await setup();await f.apply('put-task-reference',{localTicketId:'T1',value:{source:{kind:'unverified'},locator:'task:1'}})
 await f.apply('put-decision',{decisionId:'D',value:{...question,ticketIds:['T1']}},'child','child')
 const snapshot=await f.instruments.read('child','child'),c=snapshot.decisions[0].recommendationSupport.candidate
 const command={operationId:'late-revoke',expectedRevision:snapshot.businessRevision,workflowId:'flow',decisionId:'D',action:'adopt-decision-recommendation',value:{optionKey:c.optionKey,decisionRevision:c.decisionRevision,policyEpochId:c.policyEpochId,policyRevision:c.policyRevision}}
 const reader={read:async instance=>{const state=await f.policy.read(instance);f.scopes.set('child',{kind:'assigned',workflowId:'flow',ticketIds:[]});return state}}
 const instruments=new SessionInstruments(f.controls,f.storage,f.authority,()=>12345,reader)
 await assert.rejects(instruments.apply('child','child',command),e=>e.code==='access-denied')
 assert.equal((await f.instruments.read('A','A')).decisions[0].value.pending,true)
})
test('creation replay reports current support after viewer changes and policy disable, without rebinding',async()=>{
 const f=await setup(),command={operationId:'create',expectedRevision:1,workflowId:'flow',decisionId:'D',action:'put-decision',value:question}
 await f.instruments.apply('A','A',command)
 await f.instruments.apply('user','A',{operationId:'view',expectedRevision:0,workflowId:'flow',decisionId:'D',action:'set-decision-view',value:{read:true,hidden:false}})
 let replay=await f.instruments.apply('A','A',command)
 assert.equal(replay.recommendation.status,'candidate');assert.equal(replay.snapshot.businessRevision,2)
 await f.policy.save(f.instance,{operationId:'disable',expectedRevision:1,expectedScope:f.instance,action:'disable'},user)
 replay=await f.instruments.apply('A','A',command)
 assert.equal(replay.replayed,true);assert.deepEqual(replay.recommendation,{status:'not-eligible',reason:'policy-disabled'})
 assert.equal(replay.snapshot.decisions[0].policyBinding.createdRevision,2)
})
test('old, reopened, nonexact, other-addressee and user-authored decisions never acquire creation eligibility',async()=>{
 const f=await setup()
 const legacy=new SessionInstruments(f.controls,f.storage,f.authority,()=>12345)
 await legacy.apply('A','A',{operationId:'old',expectedRevision:1,workflowId:'flow',decisionId:'old',action:'put-decision',value:question})
 assert.equal((await f.storage.read(f.instance.instrumentInstanceId)).schemaVersion,2)
 await f.apply('put-decision',{decisionId:'old',value:{question:question.question,status:'reopen',pending:true}})
 assert.equal((await f.instruments.read('A','A')).decisions[0].policyBinding,undefined)
 for(const [decisionId,value,principal] of [
 ['label',{...question,recommendation:'Recommended'},'A'],['other',{...question,addressee:{kind:'user',principalId:'other'}},'A'],
 ['not-pending',{...question,pending:false},'A'],['agent',{...question,addressee:{kind:'agent'}},'A'],['user',question,'user']]) {
   const result=await f.apply('put-decision',{decisionId,value},principal,'A')
   assert.equal(result.snapshot.decisions.find(r=>r.decisionId===decisionId).policyBinding,undefined)
 }
 assert.equal((await f.storage.read(f.instance.instrumentInstanceId)).schemaVersion,2)
})
test('ordinary edits cannot regain a binding and a renewed epoch invalidates prior candidates',async()=>{
 const f=await setup();await f.apply('put-decision',{decisionId:'D',value:question});const command=await adoption(f)
 await f.policy.save(f.instance,{operationId:'renew',expectedRevision:1,expectedScope:f.instance,action:'enable',durationMs:3600000},user)
 assert.deepEqual((await f.instruments.read('A','A')).decisions[0].recommendationSupport,{status:'not-eligible',reason:'policy-epoch-changed'})
 await assert.rejects(f.instruments.apply('A','A',command))
 await f.apply('put-decision',{decisionId:'D',value:{...question,status:'reopened'}})
 const row=(await f.instruments.readCurrent('A','A')).decisions[0]
 assert.equal(row.policyBinding.createdRevision,2);assert.equal(row.recommendationSupport.reason,'decision-changed')
})
test('optional policy failure saves an ordinary question with unknown support and no retrofit',async()=>{
 const f=await setup(),reader={read:async()=>{throw Error('unavailable')}}
 const instruments=new SessionInstruments(f.controls,f.storage,f.authority,()=>12345,reader)
 const result=await instruments.apply('A','A',{operationId:'unavailable-create',expectedRevision:1,workflowId:'flow',decisionId:'D',action:'put-decision',value:question})
 assert.equal(result.recommendation.status,'unknown');assert.equal(result.snapshot.decisions[0].policyBinding,undefined)
 assert.equal((await f.storage.read(f.instance.instrumentInstanceId)).schemaVersion,2)
 assert.equal((await f.instruments.read('A','A')).decisions[0].recommendationSupport.reason,'no-creation-binding')
 const noReader=new SessionInstruments(f.controls,f.storage,f.authority,()=>12345)
 assert.equal((await noReader.read('A','A')).capabilities.decisionRecommendationAdoption,false)
 await assert.rejects(noReader.apply('A','A',{operationId:'unsupported',expectedRevision:2,workflowId:'flow',decisionId:'D',action:'adopt-decision-recommendation',value:{optionKey:'B',decisionRevision:2,policyEpochId:'epoch',policyRevision:1}}))
})
test('expiry is a half-open interval checked after awaited policy reads; an in-flight CAS can acknowledge after expiry',async()=>{
 const f=await setup();await f.apply('put-decision',{decisionId:'D',value:question});const command=await adoption(f)
 const expiresAt=(await f.policy.read(f.instance)).epoch.expiresAt
 f.setNow(expiresAt)
 assert.equal((await f.instruments.read('A','A')).decisions[0].recommendationSupport.reason,'policy-expired')
 await assert.rejects(f.instruments.apply('A','A',command));assert.equal((await f.instruments.read('A','A')).decisions[0].value.pending,true)
 f.setNow(12344);assert.equal((await f.instruments.read('A','A')).decisions[0].recommendationSupport.status,'unknown')
 f.setNow(12345)
 const reader={read:async instance=>{const policy=await f.policy.read(instance);f.setNow(expiresAt);return policy}}
 const late=new SessionInstruments(f.controls,f.storage,f.authority,f.getNow,reader)
 await assert.rejects(late.apply('A','A',command))
 f.setNow(expiresAt-1)
 const slowStorage={read:id=>f.storage.read(id),compareAndSwap:async(...args)=>{f.setNow(expiresAt+1);return f.storage.compareAndSwap(...args)}}
 const inflight=new SessionInstruments(f.controls,slowStorage,f.authority,f.getNow,f.policy)
 const saved=await inflight.apply('A','A',command)
 assert.equal(saved.recommendation.selection.authorizedAt,expiresAt-1)
})
test('OFF denies new adoption but preserves old effects, and real user correction wins both CAS tokens',async()=>{
 const f=await setup();await f.apply('put-decision',{decisionId:'D',value:question});const command=await adoption(f)
 await f.controls.savePolicy('admin',{extensionEnabled:false,defaults:{},workspaceOverrides:{}},1)
 await assert.rejects(f.instruments.apply('A','A',command));assert.equal((await f.instruments.read('A','A')).decisions[0].value.pending,true)
 await f.apply('put-decision',{decisionId:'D',value:{question:question.question,status:'answered',pending:false,result:'Human answer'}},'user','A')
 await assert.rejects(f.instruments.apply('A','A',command),e=>e.code==='revision-conflict')
 const snapshot=await f.instruments.read('A','A')
 await assert.rejects(f.instruments.apply('A','A',{...command,operationId:'source-conflict',expectedRevision:snapshot.businessRevision}),e=>e.code==='revision-conflict')
 assert.equal(snapshot.decisions[0].history.at(-1).author.kind,'user');assert.equal(snapshot.decisions[0].value.result,'Human answer')
})
test('expiry at the final creation gate removes the tentative binding but still commits the ordinary question',async()=>{
 const f=await setup(),expiresAt=(await f.policy.read(f.instance)).epoch.expiresAt
 const times=[12345,expiresAt]
 const instruments=new SessionInstruments(f.controls,f.storage,f.authority,()=>times.shift()??expiresAt,f.policy)
 const saved=await instruments.apply('A','A',{operationId:'gate-expiry',expectedRevision:1,workflowId:'flow',decisionId:'D',action:'put-decision',value:question})
 assert.equal(saved.snapshot.decisions[0].value.pending,true);assert.equal(saved.snapshot.decisions[0].policyBinding,undefined)
 assert.equal((await f.storage.read(f.instance.instrumentInstanceId)).schemaVersion,2)
})
test('viewer-only events after adoption do not erase selection during checkpoint validation',async()=>{
 const f=await setup();await f.apply('put-decision',{decisionId:'D',value:question});await f.instruments.apply('A','A',await adoption(f))
 await f.instruments.apply('user','A',{operationId:'view-after',expectedRevision:0,workflowId:'flow',decisionId:'D',action:'set-decision-view',value:{read:true,hidden:true}})
 const before=await f.instruments.read('A','A')
 await f.instruments.compact('A','A',{operationId:'compact-after-view',expectedRevision:before.revision})
 assert.equal((await f.instruments.readCurrent('A','A')).decisions[0].policySelection.selectedOptionKey,'B')
})
test('V4 retained adoption cannot manufacture a different recommendation or discard preserved result',async()=>{
 const f=await setup();await f.apply('put-decision',{decisionId:'D',value:question});await f.instruments.apply('A','A',await adoption(f))
 await f.instruments.compact('A','A',{operationId:'strict-compact',expectedRevision:3})
 const saved=await f.storage.read(f.instance.instrumentInstanceId)
 const corrupted=structuredClone(saved),row=corrupted.checkpoint.state.decisions[0]
 row.value.result='discarded original';row.history.at(-1).value.result='discarded original'
 assert.throws(()=>parseInstrumentDocument(corrupted),e=>e.code==='invalid-state')
 const forged=structuredClone(saved),decision=forged.checkpoint.state.decisions[0]
 decision.policyBinding.optionKey='A';decision.policySelection.selectedOptionKey='A';decision.history.at(-1).policySelection.selectedOptionKey='A'
 forged.dedup[1].command.decisionPolicy.binding.optionKey='A';forged.dedup[2].command.decisionPolicy.selection.selectedOptionKey='A'
 assert.throws(()=>parseInstrumentDocument(forged),e=>e.code==='invalid-state')
 for(const field of ['policyBinding','policySelection','author']) assert.throws(()=>parseInstrumentCommand({operationId:'forged',expectedRevision:3,workflowId:'flow',decisionId:'D',action:'put-decision',value:{...question,[field]:decision[field]??user}}))
})
test('historical creation replay cannot return stale authority after the optional policy read revokes its caller',async()=>{
 const f=await setup(),command={operationId:'creation-replay-auth',expectedRevision:1,workflowId:'flow',decisionId:'D',action:'put-decision',value:question}
 await f.instruments.apply('A','A',command)
 const reader={read:async instance=>{const state=await f.policy.read(instance);f.revoked.add('A');return state}}
 const instruments=new SessionInstruments(f.controls,f.storage,f.authority,()=>12345,reader)
 await assert.rejects(instruments.apply('A','A',command),/permission denied/)
 f.revoked.delete('A')
 assert.equal((await f.instruments.read('A','A')).revision,2)
})
test('new pending exact-key agent question binds in its creation CAS and returns a candidate, not adoption',async()=>{
 const f=await setup()
 const result=await f.apply('put-decision',{decisionId:'D',value:question,references:['source:task']})
 const row=result.snapshot.decisions[0]
 assert.equal(row.policyBinding.createdRevision,result.appliedRevision)
 assert.equal(row.policyBinding.optionKey,'B');assert.equal(row.value.pending,true)
 assert.equal(row.recommendationSupport.status,'candidate')
 assert.equal(row.recommendationSupport.candidate.decisionRevision,row.revision)
 assert.equal((await f.storage.read(f.instance.instrumentInstanceId)).schemaVersion,4)
 assert.equal((await f.instruments.readCurrent('A','A')).decisions[0].recommendationSupport.status,'candidate')
})
