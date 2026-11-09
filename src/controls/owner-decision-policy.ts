import { createHash, randomUUID } from 'node:crypto'
import type { InstrumentInstance } from './state.js'
import type { VersionedStorage } from './versioned-storage.js'
import type { DecisionPolicyReader, OperatorAuthor, OwnerDecisionPolicyEpoch, OwnerDecisionPolicySaveRequest, OwnerDecisionPolicySaveResult, OwnerDecisionPolicyState } from './recommendation-contract.js'
import { parseRecommendationInstance, parseOperatorAuthor, parseOwnerDecisionPolicyEpoch, parseOwnerDecisionPolicyOperation, parseOwnerDecisionPolicySaveRequest, parseOwnerDecisionPolicyState } from './recommendation-contract.js'
import { array, boolean, ControlsError, freeze, id, increment, invalid, record, revision } from './validation.js'

interface PolicyReceipt {
 readonly operationId:string;readonly author:OperatorAuthor;readonly digest:string;readonly appliedRevision:number
 readonly operation:OwnerDecisionPolicySaveResult['operation']
}
export interface OwnerDecisionPolicyDocument extends InstrumentInstance,OwnerDecisionPolicyState {
 readonly schemaVersion:1;readonly updatedAt:number;readonly updatedBy:OperatorAuthor
 readonly receipts:readonly PolicyReceipt[]
}
export interface OwnerDecisionPolicyStoreOptions {
 readonly storageFor:(instance:InstrumentInstance)=>VersionedStorage<OwnerDecisionPolicyDocument>|Promise<VersionedStorage<OwnerDecisionPolicyDocument>>
 readonly authorizeOperator:(author:OperatorAuthor,instance:InstrumentInstance)=>Promise<void>
 readonly authorizeEnable:(instance:InstrumentInstance)=>Promise<void>
 readonly now?:()=>number;readonly newEpochId?:()=>string
}
export interface OwnerDecisionPolicyStoreResult {
 readonly appliedRevision:number;readonly replayed:boolean;readonly operation:OwnerDecisionPolicySaveResult['operation'];readonly state:OwnerDecisionPolicyState
}
export function ownerDecisionPolicyTableName(instanceId:string):string {return 'owner_decision_policy_'+createHash('sha256').update(id(instanceId,'instanceId')).digest('hex').slice(0,32)}
export function parseOwnerDecisionPolicyDocument(value:unknown):OwnerDecisionPolicyDocument {
 try {
  const r=record(value,'owner decision policy document',['schemaVersion','instrumentInstanceId','ownerSessionId','controlWorkspaceId','revision','enabled','epoch','updatedAt','updatedBy','receipts'])
  if(r.schemaVersion!==1) invalid('unsupported owner decision policy version')
  const instance=parseRecommendationInstance({instrumentInstanceId:r.instrumentInstanceId,ownerSessionId:r.ownerSessionId,controlWorkspaceId:r.controlWorkspaceId})
  const state=parseOwnerDecisionPolicyState({revision:r.revision,enabled:r.enabled,epoch:r.epoch})
  if(state.revision<1) invalid('stored owner policy must have positive revision')
  const receipts=array(r.receipts,'policy receipts').map((value,i):PolicyReceipt=>{
   const d=record(value,'policy receipt',['operationId','author','digest','appliedRevision','operation'])
   if(typeof d.digest!=='string'||!/^[a-f0-9]{64}$/u.test(d.digest)) invalid('invalid policy command digest')
   if(revision(d.appliedRevision,'appliedRevision')!==i+1) invalid('policy receipt revision gap')
   return {operationId:id(d.operationId,'operationId'),author:parseOperatorAuthor(d.author),digest:d.digest,appliedRevision:i+1,operation:parseOwnerDecisionPolicyOperation(d.operation)}
  })
  if(receipts.length!==state.revision||new Set(receipts.map(r=>r.operationId)).size!==receipts.length) invalid('policy receipt inventory mismatch')
  const updatedBy=parseOperatorAuthor(r.updatedBy),last=receipts.at(-1)!
  if(JSON.stringify(last.author)!==JSON.stringify(updatedBy)||state.enabled!==(last.operation.action==='enable')||last.operation.epochId!==(state.epoch?.epochId??null)||last.operation.expiresAt!==(state.epoch?.expiresAt??null)) invalid('policy current state differs from last receipt')
  if(state.epoch) {
   const opening=receipts[state.epoch.policyRevision-1]
   if(!opening||opening.operation.action!=='enable'||opening.operation.epochId!==state.epoch.epochId||opening.operation.expiresAt!==state.epoch.expiresAt||JSON.stringify(opening.author)!==JSON.stringify(state.epoch.authorizedBy)) invalid('policy epoch has no opening receipt')
  }
  return freeze({schemaVersion:1,...instance,...state,updatedAt:revision(r.updatedAt,'updatedAt'),updatedBy,receipts})
 }catch(error){if(error instanceof ControlsError&&error.code==='invalid-input') throw new ControlsError('invalid-state',error.message);throw error}
}
function sameInstance(a:InstrumentInstance,b:InstrumentInstance):boolean {return a.instrumentInstanceId===b.instrumentInstanceId&&a.ownerSessionId===b.ownerSessionId&&a.controlWorkspaceId===b.controlWorkspaceId}
function stateOf(document:OwnerDecisionPolicyDocument|undefined):OwnerDecisionPolicyState {return freeze(document?{revision:document.revision,enabled:document.enabled,epoch:document.epoch}:{revision:0,enabled:false,epoch:null})}
/** No queue: trusted runtime serializes cross-domain policy/record/assignment writes. */
const uncertainPolicyStorages=new WeakSet<object>()
export class OwnerDecisionPolicyStore implements DecisionPolicyReader {
 constructor(private readonly options:OwnerDecisionPolicyStoreOptions) {
  if(typeof options.authorizeOperator!=='function'||typeof options.authorizeEnable!=='function') invalid('operator and enable authorization callbacks are mandatory')
 }
 private async load(storage:VersionedStorage<OwnerDecisionPolicyDocument>,instance:InstrumentInstance):Promise<OwnerDecisionPolicyDocument|undefined> {
  if(uncertainPolicyStorages.has(storage)) throw new ControlsError('storage-uncertain','policy storage must be reopened with a fresh handle')
  const raw=await storage.read();if(raw===undefined) return undefined
  const document=parseOwnerDecisionPolicyDocument(raw)
  if(!sameInstance(document,instance)) throw new ControlsError('association-conflict','policy document conflicts with trusted instance')
  return document
 }
 async read(input:InstrumentInstance):Promise<OwnerDecisionPolicyState> {
  const instance=parseRecommendationInstance(input),storage=await this.options.storageFor(instance)
  return stateOf(await this.load(storage,instance))
 }
 async save(input:InstrumentInstance,request:OwnerDecisionPolicySaveRequest,inputAuthor:OperatorAuthor):Promise<OwnerDecisionPolicyStoreResult> {
  const instance=parseRecommendationInstance(input),command=parseOwnerDecisionPolicySaveRequest(request),author=parseOperatorAuthor(inputAuthor)
  await this.options.authorizeOperator(author,instance)
  if(!sameInstance(command.expectedScope,instance)) throw new ControlsError('association-conflict','expectedScope differs from current owner instance')
  const storage=await this.options.storageFor(instance),hash=createHash('sha256').update(JSON.stringify({command,author})).digest('hex')
  for(let attempt=0;attempt<32;attempt++) {
   await this.options.authorizeOperator(author,instance)
   const current=await this.load(storage,instance),state=stateOf(current),prior=current?.receipts.find(r=>r.operationId===command.operationId)
   if(prior) {
    if(prior.digest!==hash) throw new ControlsError('operation-conflict','policy operation belongs to another author or payload')
    return freeze({appliedRevision:prior.appliedRevision,replayed:true,operation:prior.operation,state})
   }
   if(state.revision!==command.expectedRevision) throw new ControlsError('revision-conflict','owner decision policy changed; reload before saving')
   if(command.action==='enable') await this.options.authorizeEnable(instance)
   // The operator identity may have changed during awaited storage/feature checks.
   await this.options.authorizeOperator(author,instance)
   const updatedAt=revision((this.options.now??Date.now)(),'policy updatedAt'),appliedRevision=increment(state.revision)
   const epoch:OwnerDecisionPolicyEpoch|null=command.action==='enable'?parseOwnerDecisionPolicyEpoch({epochId:(this.options.newEpochId??randomUUID)(),policyRevision:appliedRevision,scope:'new-decisions',enabledAt:updatedAt,expiresAt:command.durationMs===null?null:updatedAt+command.durationMs,authorizedBy:author}):state.epoch
   const operation:OwnerDecisionPolicySaveResult['operation']={action:command.action,epochId:epoch?.epochId??null,expiresAt:epoch?.expiresAt??null}
   const next=parseOwnerDecisionPolicyDocument({schemaVersion:1,...instance,revision:appliedRevision,enabled:command.action==='enable',epoch,updatedAt,updatedBy:author,receipts:[...current?.receipts??[],{operationId:command.operationId,author,digest:hash,appliedRevision,operation}]})
   let committed:boolean
   try {committed=await storage.compareAndSwap(state.revision,next)}catch(error){uncertainPolicyStorages.add(storage);throw error}
   if(committed) return freeze({appliedRevision,replayed:false,operation,state:stateOf(next)})
  }
  throw new ControlsError('concurrent-update','owner policy changed repeatedly')
 }
}
