import assert from 'node:assert/strict'
import { test } from 'node:test'
import { OwnerDecisionPolicyStore, parseOwnerDecisionPolicyDocument, evaluateOwnerDecisionPolicy, parseOwnerDecisionPolicySaveRequest, RECOMMENDATION_REMOTE_CONTRIBUTION } from '../lib/controls/index.js'
import { MemoryVersionedStorage } from '../lib/controls/versioned-storage.js'
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
