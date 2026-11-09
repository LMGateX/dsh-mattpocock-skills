import assert from 'node:assert/strict'
import { test } from 'node:test'
import { OwnerDecisionPolicyStore, parseOwnerDecisionPolicyDocument, evaluateOwnerDecisionPolicy, parseOwnerDecisionPolicySaveRequest, parseOwnerDecisionPolicyEpoch, parseOwnerDecisionPolicyOperation, parseDecisionPolicySelection, RECOMMENDATION_REMOTE_CONTRIBUTION } from '../lib/controls/index.js'
import { createDomainVersionedStorage, MemoryVersionedStorage } from '../lib/controls/versioned-storage.js'
const instance = { instrumentInstanceId:'i',ownerSessionId:'owner',controlWorkspaceId:'w' }
const author = {kind:'user',principalId:'operator',sessionId:null}
function fixture() {
  let now=1000, enabled=true, operator=true, seq=0
  const storage=new MemoryVersionedStorage(parseOwnerDecisionPolicyDocument)
  const store=new OwnerDecisionPolicyStore({storageFor:()=>storage,now:()=>now,newEpochId:()=> 'epoch-'+ ++seq,
    authorizeOperator:async a=>{if(!operator||a.principalId!=='operator') throw new Error('not operator')},
    authorizeEnable:async()=>{if(!enabled) throw new Error('feature OFF')}})
  return {store,storage,setNow:v=>now=v,setEnabled:v=>enabled=v,setOperator:v=>operator=v}
}
const enable=(more={})=>({operationId:'enable',expectedRevision:0,expectedScope:instance,action:'enable',durationMs:3600000,...more})
test('operator revocation during a rejected CAS prevents the retry from writing',async()=>{
 let allowed=true,writes=0
 const storage=new MemoryVersionedStorage(parseOwnerDecisionPolicyDocument)
 const racing={read:()=>storage.read(),compareAndSwap:async()=>{writes++;allowed=false;return false}}
 const store=new OwnerDecisionPolicyStore({storageFor:()=>racing,now:()=>1000,newEpochId:()=> 'epoch',authorizeOperator:async()=>{if(!allowed) throw Error('revoked')},authorizeEnable:async()=>{}})
 await assert.rejects(store.save(instance,enable(),author),/revoked/)
 assert.equal(writes,1);assert.equal(await storage.read(),undefined)
})
test('operator auth, scope equality, feature gates, finite durations and expected revision are independent fences',async()=>{
 const f=fixture();f.setOperator(false)
 await assert.rejects(f.store.save(instance,enable(),author),/operator/)
 f.setOperator(true)
 await assert.rejects(f.store.save(instance,enable(),{...author,kind:'agent',sessionId:'owner'}))
 await assert.rejects(f.store.save(instance,enable({expectedScope:{...instance,ownerSessionId:'other'}}),author),e=>e.code==='association-conflict')
 for(const durationMs of [0,-1,86400001,1.5,Infinity]) await assert.rejects(f.store.save(instance,enable({durationMs}),author))
 f.setEnabled(false);await assert.rejects(f.store.save(instance,enable(),author),/OFF/)
 assert.deepEqual(await f.store.read(instance),{revision:0,enabled:false,epoch:null})
 const disabled=await f.store.save(instance,{operationId:'disable-empty',expectedRevision:0,expectedScope:instance,action:'disable'},author)
 assert.equal(disabled.appliedRevision,1);f.setEnabled(true)
 await assert.rejects(f.store.save(instance,enable(),author),e=>e.code==='revision-conflict')
 const enabled=await f.store.save(instance,enable({expectedRevision:1,durationMs:1}),author)
 assert.equal(enabled.state.epoch.expiresAt,1001)
 f.setEnabled(false)
 const stopped=await f.store.save(instance,{operationId:'disable',expectedRevision:2,expectedScope:instance,action:'disable'},author)
 assert.equal(stopped.state.enabled,false);assert.equal(stopped.state.epoch.epochId,enabled.state.epoch.epochId)
 assert.deepEqual(stopped.operation,{action:'disable',epochId:enabled.state.epoch.epochId,expiresAt:enabled.state.epoch.expiresAt})
 const replay=await f.store.save(instance,enable({expectedRevision:1,durationMs:1}),author)
 assert.equal(replay.appliedRevision,2);assert.equal(replay.state.revision,3);assert.equal(replay.state.enabled,false)
 await assert.rejects(f.store.save(instance,enable({expectedRevision:1,durationMs:2}),author),e=>e.code==='operation-conflict')
 f.setOperator(false);await assert.rejects(f.store.save(instance,enable({expectedRevision:1,durationMs:1}),author),/operator/)
})
test('write-uncertain survives a new store and domain adapter wrapper until an actual fresh handle reopens committed receipts',async()=>{
 const values=new Map(),lost=new Error('lost durable receipt')
 const handle={get:k=>values.get(k),put:async(k,v)=>{values.set(k,v);throw lost},update:async(k,fn)=>{const v=fn(values.get(k));values.set(k,v);return v}}
 const open=table=>createDomainVersionedStorage(table,'state',parseOwnerDecisionPolicyDocument)
 const make=storage=>new OwnerDecisionPolicyStore({storageFor:()=>storage,now:()=>1000,newEpochId:()=> 'epoch',authorizeOperator:async()=>{},authorizeEnable:async()=>{}})
 const storage=open(handle);await assert.rejects(make(storage).save(instance,enable(),author),e=>e===lost)
 await assert.rejects(make(storage).read(instance),e=>e.code==='storage-uncertain')
 await assert.rejects(make(open(handle)).read(instance),e=>e.code==='storage-uncertain')
 const fresh={get:k=>values.get(k),put:async(k,v)=>values.set(k,v),update:async(k,fn)=>{const v=fn(values.get(k));values.set(k,v);return v}}
 const reopened=make(open(fresh)),replay=await reopened.save(instance,enable(),author)
 assert.equal(replay.replayed,true);assert.equal(replay.appliedRevision,1);assert.equal(replay.state.epoch.expiresAt,3601000)
})
test('corrupt owner policy documents and wrong owner identities fail closed instead of returning disabled defaults',async()=>{
 const f=fixture();await f.store.save(instance,enable(),author)
 await assert.rejects(f.store.read({...instance,ownerSessionId:'other'}),e=>e.code==='association-conflict')
 const good=await f.storage.read()
 for(const change of [d=>d.schemaVersion=2,d=>d.receipts=[],d=>d.epoch.authorizedBy.kind='agent',d=>d.epoch.policyRevision=2,d=>d.enabled=false]) {
  const raw=structuredClone(good);change(raw)
  const store=new OwnerDecisionPolicyStore({storageFor:()=>({read:async()=>raw,compareAndSwap:async()=>{throw Error('never write corrupt')}}),authorizeOperator:async()=>{},authorizeEnable:async()=>{}})
  await assert.rejects(store.read(instance),e=>e.code==='invalid-state')
 }
})
test('operator store persists a finite epoch and historical replay does not renew or require feature ON',async()=>{
 const f=fixture(); assert.deepEqual(await f.store.read(instance),{revision:0,enabled:false,epoch:null})
 const request=enable(); const saved=await f.store.save(instance,request,author)
 assert.equal(saved.appliedRevision,1);assert.equal(saved.state.epoch.expiresAt,3601000)
 f.setEnabled(false);f.setNow(2000)
 const reopened=new OwnerDecisionPolicyStore({storageFor:()=>f.storage,now:()=>2000,newEpochId:()=>{throw Error('must not renew')},authorizeOperator:async()=>{},authorizeEnable:async()=>{throw Error('OFF')}})
 const replay=await reopened.save(instance,request,author)
 assert.equal(replay.replayed,true);assert.equal(replay.operation.expiresAt,3601000);assert.equal(replay.state.revision,1)
 assert.equal(evaluateOwnerDecisionPolicy(replay.state,false,2000).status,'feature-disabled')
 assert.equal(evaluateOwnerDecisionPolicy(replay.state,true,3601000).status,'expired')
 assert.equal(RECOMMENDATION_REMOTE_CONTRIBUTION.descriptors.length,2)
 assert.throws(()=>parseOwnerDecisionPolicySaveRequest({...request,author}),/unknown key/)
})
test('persistent policy stores a null expiry, never expires and accepts a later authorized selection',async()=>{
 const f=fixture(), saved=await f.store.save(instance,enable({durationMs:null}),author)
 assert.equal(saved.operation.expiresAt,null)
 assert.equal(saved.state.epoch.expiresAt,null)
 assert.equal(evaluateOwnerDecisionPolicy(saved.state,true,999).status,'unknown')
 assert.equal(evaluateOwnerDecisionPolicy(saved.state,true,1000).status,'active')
 assert.equal(evaluateOwnerDecisionPolicy(saved.state,true,Number.MAX_SAFE_INTEGER).status,'active')
 const policy=saved.state.epoch
 const selection=parseDecisionPolicySelection({kind:'owner-policy',selectedOptionKey:'A',decisionSourceRevision:1,policy,authorizedAt:Number.MAX_SAFE_INTEGER})
 assert.equal(selection.authorizedAt,Number.MAX_SAFE_INTEGER)
 assert.equal(parseOwnerDecisionPolicyEpoch({...policy,expiresAt:null}).expiresAt,null)
 assert.throws(()=>parseOwnerDecisionPolicyEpoch({...policy,expiresAt:policy.enabledAt}),/1\.\.86400000ms or persistent/)
 assert.throws(()=>parseOwnerDecisionPolicyEpoch({...policy,expiresAt:policy.enabledAt+86400001}),/1\.\.86400000ms or persistent/)
 const disabled=await f.store.save(instance,{operationId:'persistent-disable',expectedRevision:1,expectedScope:instance,action:'disable'},author)
 assert.equal(disabled.state.enabled,false)
 assert.equal(disabled.state.epoch.epochId,policy.epochId)
 assert.equal(disabled.state.epoch.expiresAt,null)
 assert.equal(disabled.operation.epochId,policy.epochId)
 assert.equal(disabled.operation.expiresAt,null)
 assert.deepEqual(await f.store.read(instance),disabled.state)
 const reopenedStore=new OwnerDecisionPolicyStore({storageFor:()=>f.storage,now:()=>1000,newEpochId:()=>{throw Error('must not renew')},authorizeOperator:async()=>{},authorizeEnable:async()=>{}})
 assert.deepEqual(await reopenedStore.read(instance),disabled.state)
 assert.equal((await reopenedStore.read(instance)).enabled,false)
 assert.equal(evaluateOwnerDecisionPolicy(disabled.state,true,Number.MAX_SAFE_INTEGER).status,'disabled')
 const replayDisable=await f.store.save(instance,{operationId:'persistent-disable',expectedRevision:1,expectedScope:instance,action:'disable'},author)
 assert.equal(replayDisable.replayed,true)
 assert.equal(replayDisable.appliedRevision,disabled.appliedRevision)
 assert.equal(replayDisable.state.revision,disabled.state.revision)
 assert.deepEqual(replayDisable.operation,{action:'disable',epochId:policy.epochId,expiresAt:null})
 assert.deepEqual(parseOwnerDecisionPolicyOperation({action:'disable',epochId:'manual',expiresAt:null}),{action:'disable',epochId:'manual',expiresAt:null})
 assert.throws(()=>parseOwnerDecisionPolicyOperation({action:'disable',epochId:null,expiresAt:policy.enabledAt}),/policy operation epoch mismatch/)
 assert.throws(()=>parseOwnerDecisionPolicyOperation({action:'enable',epochId:null,expiresAt:null}),/policy operation epoch mismatch/)
})
