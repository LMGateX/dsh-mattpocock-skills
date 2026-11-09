import type { InstrumentInstance } from './state.js'
import type { TypertCodec, TypertRemoteContribution, InvocationDescriptor } from '@deepseek-ai/dsh-typert-protocol'
import { boolean, freeze, id, invalid, record, revision } from './validation.js'

/** Browser-pure wire contract. Policy facts are server-authored, never command values. */
export interface OperatorAuthor { readonly kind:'user'; readonly principalId:string; readonly sessionId:null }
export interface OwnerDecisionPolicyEpoch {
 readonly epochId:string; readonly policyRevision:number; readonly scope:'new-decisions'
 readonly enabledAt:number; readonly expiresAt:number; readonly authorizedBy:OperatorAuthor
}
export type OwnerDecisionPolicyStatus='active'|'disabled'|'expired'|'feature-disabled'|'unknown'
export type OwnerDecisionPolicySaveRequest={readonly operationId:string;readonly expectedRevision:number;readonly expectedScope:InstrumentInstance}&(
 {readonly action:'enable';readonly durationMs:number}|{readonly action:'disable'})
export interface OwnerDecisionPolicyState { readonly revision:number;readonly enabled:boolean;readonly epoch:OwnerDecisionPolicyEpoch|null }
export interface DecisionPolicyReader { read(instance:InstrumentInstance):Promise<OwnerDecisionPolicyState> }
export interface OwnerDecisionPolicySnapshot {
 readonly schemaVersion:1;readonly instance:InstrumentInstance;readonly revision:number
 readonly saved:{readonly enabled:boolean;readonly epoch:OwnerDecisionPolicyEpoch|null}
 readonly effective:{readonly status:OwnerDecisionPolicyStatus;readonly reason:string|null}
}
export interface OwnerDecisionPolicySaveResult {
 readonly appliedRevision:number;readonly replayed:boolean
 readonly operation:{readonly action:'enable'|'disable';readonly epochId:string|null;readonly expiresAt:number|null}
 readonly snapshot:OwnerDecisionPolicySnapshot
}
export interface DecisionPolicyBinding { readonly createdRevision:number;readonly optionKey:string;readonly policy:OwnerDecisionPolicyEpoch }
export interface DecisionPolicySelection {
 readonly kind:'owner-policy';readonly selectedOptionKey:string;readonly decisionSourceRevision:number
 readonly policy:OwnerDecisionPolicyEpoch;readonly authorizedAt:number
}
export type DecisionPolicyEventEffect={readonly kind:'bound';readonly binding:DecisionPolicyBinding}|{readonly kind:'adopted';readonly selection:DecisionPolicySelection}
export interface RecommendationCandidate {readonly optionKey:string;readonly decisionRevision:number;readonly policyEpochId:string;readonly policyRevision:number;readonly expiresAt:number}
export type RecommendationReason='policy-disabled'|'policy-expired'|'feature-disabled'|'no-creation-binding'|'decision-changed'|'not-pending-user'|'no-exact-recommendation'|'policy-epoch-changed'|'different-addressee'
export type RecommendationOutcome={readonly status:'candidate';readonly candidate:RecommendationCandidate}|{readonly status:'adopted';readonly selection:DecisionPolicySelection}|{readonly status:'not-eligible';readonly reason:RecommendationReason}|{readonly status:'unknown';readonly reason:'policy-unavailable'|'projection-unavailable'}
export interface OwnerDecisionPolicyPublic {readonly revision:number|null;readonly status:OwnerDecisionPolicyStatus;readonly epochId:string|null;readonly expiresAt:number|null;readonly scope:'new-decisions';readonly reason:string|null}
export const RECOMMENDATION_REMOTE_NAMESPACE='mattpocockRecommendationSupport' as const
export const RECOMMENDATION_REMOTE_METHODS=['readOwnerDecisionPolicy','saveOwnerDecisionPolicy'] as const
export interface RecommendationRemote {
 readOwnerDecisionPolicy(sessionId:string,signal?:AbortSignal):Promise<OwnerDecisionPolicySnapshot>
 saveOwnerDecisionPolicy(sessionId:string,request:OwnerDecisionPolicySaveRequest):Promise<OwnerDecisionPolicySaveResult>
}
export function parseRecommendationInstance(value:unknown):InstrumentInstance {
 const r=record(value,'policy instance',['instrumentInstanceId','ownerSessionId','controlWorkspaceId'])
 return freeze({instrumentInstanceId:id(r.instrumentInstanceId,'instrumentInstanceId'),ownerSessionId:id(r.ownerSessionId,'ownerSessionId'),controlWorkspaceId:id(r.controlWorkspaceId,'controlWorkspaceId')})
}
export function parseOperatorAuthor(value:unknown):OperatorAuthor {
 const r=record(value,'operator author',['kind','principalId','sessionId'])
 if(r.kind!=='user'||r.sessionId!==null) invalid('policy author must be an authenticated operator user')
 return freeze({kind:'user',principalId:id(r.principalId,'operator principalId'),sessionId:null})
}
function positive(value:unknown,where:string):number {const n=revision(value,where);if(n===0) invalid(where+' must be positive');return n}
export function parseOwnerDecisionPolicyEpoch(value:unknown):OwnerDecisionPolicyEpoch {
 const r=record(value,'policy epoch',['epochId','policyRevision','scope','enabledAt','expiresAt','authorizedBy'])
 if(r.scope!=='new-decisions') invalid('policy scope must be new-decisions')
 const enabledAt=revision(r.enabledAt,'enabledAt'),expiresAt=revision(r.expiresAt,'expiresAt')
 if(expiresAt<=enabledAt||expiresAt-enabledAt>86400000) invalid('policy epoch must have a finite 1..86400000ms duration')
 return freeze({epochId:id(r.epochId,'epochId'),policyRevision:positive(r.policyRevision,'policyRevision'),scope:'new-decisions',enabledAt,expiresAt,authorizedBy:parseOperatorAuthor(r.authorizedBy)})
}
export function parseOwnerDecisionPolicyState(value:unknown):OwnerDecisionPolicyState {
 const r=record(value,'policy state',['revision','enabled','epoch'])
 const state={revision:revision(r.revision,'policy revision'),enabled:boolean(r.enabled,'enabled'),epoch:r.epoch===null?null:parseOwnerDecisionPolicyEpoch(r.epoch)}
 if(state.enabled&&!state.epoch||state.epoch&&state.epoch.policyRevision>state.revision) invalid('policy epoch revision/enabled mismatch')
 return freeze(state)
}
export function parseOwnerDecisionPolicySaveRequest(value:unknown):OwnerDecisionPolicySaveRequest {
 const r=record(value,'policy save request')
 if(r.action!=='enable'&&r.action!=='disable') invalid('policy save requires enable or disable')
 record(value,'policy save request',['operationId','expectedRevision','expectedScope','action',...(r.action==='enable'?['durationMs']:[])])
 const base={operationId:id(r.operationId,'operationId'),expectedRevision:revision(r.expectedRevision,'expectedRevision'),expectedScope:parseRecommendationInstance(r.expectedScope)}
 if(r.action==='disable') return freeze({...base,action:'disable'})
 const durationMs=positive(r.durationMs,'durationMs');if(durationMs>86400000) invalid('durationMs must be 1..86400000')
 return freeze({...base,action:'enable',durationMs})
}
export function parseOwnerDecisionPolicySnapshot(value:unknown):OwnerDecisionPolicySnapshot {
 const r=record(value,'policy snapshot',['schemaVersion','instance','revision','saved','effective'])
 if(r.schemaVersion!==1) invalid('unsupported policy snapshot version')
 const saved=record(r.saved,'saved policy',['enabled','epoch']),effective=record(r.effective,'effective policy',['status','reason'])
 if(!['active','disabled','expired','feature-disabled','unknown'].includes(effective.status as string)) invalid('unknown policy status')
 const state=parseOwnerDecisionPolicyState({revision:r.revision,...saved})
 return freeze({schemaVersion:1,instance:parseRecommendationInstance(r.instance),revision:state.revision,saved:{enabled:state.enabled,epoch:state.epoch},effective:{status:effective.status as OwnerDecisionPolicyStatus,reason:nullableReason(effective.reason)}})
}
function nullableReason(value:unknown):string|null {return value===null?null:id(value,'reason')}
export function parseOwnerDecisionPolicyOperation(value:unknown):OwnerDecisionPolicySaveResult['operation'] {
 const r=record(value,'policy operation',['action','epochId','expiresAt'])
 if(r.action!=='enable'&&r.action!=='disable') invalid('unknown policy operation')
 const epochId=r.epochId===null?null:id(r.epochId,'epochId'),expiresAt=r.expiresAt===null?null:revision(r.expiresAt,'expiresAt')
 if((epochId===null)!==(expiresAt===null)||r.action==='enable'&&epochId===null) invalid('policy operation epoch mismatch')
 return freeze({action:r.action,epochId,expiresAt})
}
export function parseOwnerDecisionPolicySaveResult(value:unknown):OwnerDecisionPolicySaveResult {
 const r=record(value,'policy save result',['appliedRevision','replayed','operation','snapshot'])
 return freeze({appliedRevision:positive(r.appliedRevision,'appliedRevision'),replayed:boolean(r.replayed,'replayed'),operation:parseOwnerDecisionPolicyOperation(r.operation),snapshot:parseOwnerDecisionPolicySnapshot(r.snapshot)})
}
export function parseDecisionPolicyBinding(value:unknown):DecisionPolicyBinding {
 const r=record(value,'decision policy binding',['createdRevision','optionKey','policy'])
 return freeze({createdRevision:positive(r.createdRevision,'createdRevision'),optionKey:id(r.optionKey,'optionKey'),policy:parseOwnerDecisionPolicyEpoch(r.policy)})
}
export function parseDecisionPolicySelection(value:unknown):DecisionPolicySelection {
 const r=record(value,'decision policy selection',['kind','selectedOptionKey','decisionSourceRevision','policy','authorizedAt'])
 if(r.kind!=='owner-policy') invalid('unknown decision selection kind')
 const policy=parseOwnerDecisionPolicyEpoch(r.policy),authorizedAt=revision(r.authorizedAt,'authorizedAt')
 if(authorizedAt<policy.enabledAt||authorizedAt>=policy.expiresAt) invalid('selection time outside authorization epoch')
 return freeze({kind:'owner-policy',selectedOptionKey:id(r.selectedOptionKey,'selectedOptionKey'),decisionSourceRevision:positive(r.decisionSourceRevision,'decisionSourceRevision'),policy,authorizedAt})
}
export function parseDecisionPolicyEventEffect(value:unknown):DecisionPolicyEventEffect {
 const r=record(value,'decision policy effect')
 if(r.kind==='bound') {record(value,'binding effect',['kind','binding']);return freeze({kind:'bound',binding:parseDecisionPolicyBinding(r.binding)})}
 if(r.kind==='adopted') {record(value,'adoption effect',['kind','selection']);return freeze({kind:'adopted',selection:parseDecisionPolicySelection(r.selection)})}
 return invalid('unknown decision policy effect')
}
/** Stable effective buckets; caller samples its trusted clock, never a model timestamp. */
export function evaluateOwnerDecisionPolicy(state:OwnerDecisionPolicyState,featureConfigured:boolean,now:number):OwnerDecisionPolicySnapshot['effective'] {
 if(!featureConfigured) return freeze({status:'feature-disabled',reason:'feature-disabled'})
 if(!state.enabled||!state.epoch) return freeze({status:'disabled',reason:'policy-disabled'})
 if(!Number.isSafeInteger(now)||now<state.epoch.enabledAt) return freeze({status:'unknown',reason:'clock-unavailable'})
 if(now>=state.epoch.expiresAt) return freeze({status:'expired',reason:'policy-expired'})
 return freeze({status:'active',reason:null})
}
/** Decision-local eligibility; no task/business semantic inference. */
export function evaluateRecommendationSupport(row:{readonly revision:number;readonly value:{readonly pending?:boolean;readonly recommendation?:string|null;readonly options?:readonly {readonly key:string}[];readonly addressee?:{readonly kind:string;readonly principalId?:string|null}};readonly policyBinding?:DecisionPolicyBinding;readonly policySelection?:DecisionPolicySelection},state:OwnerDecisionPolicyState|undefined,featureConfigured:boolean,now:number):RecommendationOutcome {
 if(row.policySelection) return freeze({status:'adopted',selection:row.policySelection})
 if(!state) return freeze({status:'unknown',reason:'policy-unavailable'})
 const effective=evaluateOwnerDecisionPolicy(state,featureConfigured,now)
 if(effective.status==='unknown') return freeze({status:'unknown',reason:'policy-unavailable'})
 const ineligible=(reason:RecommendationReason):RecommendationOutcome=>freeze({status:'not-eligible',reason})
 if(effective.status==='feature-disabled') return ineligible('feature-disabled')
 if(effective.status==='disabled') return ineligible('policy-disabled')
 if(effective.status==='expired') return ineligible('policy-expired')
 const binding=row.policyBinding
 if(!binding) return ineligible('no-creation-binding')
 if(row.revision!==binding.createdRevision) return ineligible('decision-changed')
 if(row.value.pending!==true||row.value.addressee?.kind!=='user') return ineligible('not-pending-user')
 if(row.value.addressee.principalId!=null&&row.value.addressee.principalId!==state.epoch!.authorizedBy.principalId) return ineligible('different-addressee')
 if(row.value.recommendation!==binding.optionKey||row.value.options?.filter(o=>o.key===binding.optionKey).length!==1) return ineligible('no-exact-recommendation')
 if(state.epoch!.epochId!==binding.policy.epochId||state.epoch!.policyRevision!==binding.policy.policyRevision||JSON.stringify(state.epoch)!==JSON.stringify(binding.policy)) return ineligible('policy-epoch-changed')
 return freeze({status:'candidate',candidate:{optionKey:binding.optionKey,decisionRevision:row.revision,policyEpochId:binding.policy.epochId,policyRevision:binding.policy.policyRevision,expiresAt:binding.policy.expiresAt}})
}
function strict(name:string,parse:(value:unknown)=>unknown):TypertCodec {return {mode:'strict',typeSymbol:RECOMMENDATION_REMOTE_NAMESPACE+'#'+name,create:()=>({parse})}}
function descriptor(method:typeof RECOMMENDATION_REMOTE_METHODS[number],parameters:readonly [string,TypertCodec][],result:TypertCodec):InvocationDescriptor {
 return {id:'@lmgatex/dsh-mattpocock-skills#'+RECOMMENDATION_REMOTE_NAMESPACE+'/'+method,service:RECOMMENDATION_REMOTE_NAMESPACE,namespace:RECOMMENDATION_REMOTE_NAMESPACE,method,invocation:{kind:'direct'},parameters:parameters.map(([name,codec])=>({name,wire:name,source:'json',codec})),result,...(method==='readOwnerDecisionPolicy'?{cancellation:{parameter:'signal' as const}}:{})}
}
const sessionCodec=strict('SessionId',v=>id(v,'sessionId'))
export const RECOMMENDATION_REMOTE_CONTRIBUTION:TypertRemoteContribution=freeze({package:'@lmgatex/dsh-mattpocock-skills/recommendation-support',descriptors:[
 descriptor('readOwnerDecisionPolicy',[['sessionId',sessionCodec]],strict('OwnerDecisionPolicySnapshot',parseOwnerDecisionPolicySnapshot)),
 descriptor('saveOwnerDecisionPolicy',[['sessionId',sessionCodec],['request',strict('OwnerDecisionPolicySaveRequest',parseOwnerDecisionPolicySaveRequest)]],strict('OwnerDecisionPolicySaveResult',parseOwnerDecisionPolicySaveResult)),
]})
