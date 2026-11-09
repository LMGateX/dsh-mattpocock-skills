import { AsyncLocalStorage } from 'node:async_hooks'
import { isAbsolute, normalize } from 'node:path'
import type { VersionedStorage } from './controls/versioned-storage.js'
import { createHash, randomUUID } from 'node:crypto'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { UserMessage } from '@deepseek-ai/dsh-session'
import type { ToolExecution, ToolExecutionResult, ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { HostEvent, HostPorts, RuntimeFacade } from './host.js'
import { WorkspaceControls } from './controls/index.js'
import type { SessionControlsView } from './controls/index.js'
import { SessionInstruments } from './controls/instruments.js'
import { OwnerDecisionPolicyStore, ownerDecisionPolicyTableName, parseOwnerDecisionPolicyDocument } from './controls/owner-decision-policy.js'
import { evaluateOwnerDecisionPolicy, parseOwnerDecisionPolicySaveRequest } from './controls/recommendation-contract.js'
import type { OwnerDecisionPolicyState, OwnerDecisionPolicySnapshot, OwnerDecisionPolicyPublic } from './controls/recommendation-contract.js'
import type { InstrumentAuthority, InstrumentScope, InstrumentCurrentSnapshot } from './controls/instruments.js'
import { modelSource, sourceKey, sourceVersion } from './model-tools.js'
import type { ModelIdentity, ModelSource, ModelRow, ModelCollection, ModelCurrent } from './model-tools.js'
import { SessionWindows, parseWindowDocument } from './controls/windows.js'
import type { ExecutionToken, WindowProgramPort, WindowCompactRequest, WindowPurgeRequest } from './controls/windows.js'
import { InstrumentConsumption } from './controls/consumption.js'
import type { ConsumptionIdentity, ConsumptionProgramPort, ConsumptionSnapshot } from './controls/consumption.js'
import { createResourceModule, ResourceError, parseResourceDocument } from './controls/resources.js'
import { concreteGitAdapter, probeWorktree } from './controls/git-worktrees.js'
import { INITIAL_RUNTIME_DOCUMENT, parseRuntimeDocument } from './controls/runtime-state.js'
import type { RuntimeDocument, RuntimeStorage, TaskAssignment } from './controls/runtime-state.js'
import { applyNativeExecutionEvent, latestNativeExecutions, nativeChildrenForObservation, projectNativeExecution } from './controls/native-executions.js'
import type { NativeExecutionEvent } from './controls/native-executions.js'
import { parseHostJson, parseResourceAction, parseSessionSummaryRequest, SUMMARY_RESPONSE_LIMIT } from './controls/remote-contract.js'
import type { HostCaller, HostJson, ResourceAction, RuntimeSnapshot, SessionSummary, SessionSummaryRequest, SessionSummaryResult, SessionSummaryBatch } from './controls/remote-contract.js'
import type { InstrumentAuthor, InstrumentCommand, InstrumentCompactInput, InstrumentPurgeHistoryInput } from './controls/instrument-state.js'
import type { TicketWindowCommand } from './controls/windows.js'
import type { PolicyIntent } from './controls/policy.js'
import { array, ControlsError, freeze, id, increment, isPreCommitRejection, record, revision , memoized } from './controls/validation.js'
import { RefreshGate } from './controls/refresh-gate.js'
import { resolvePolicy } from './controls/policy.js'
import { createWorktreeBindings, parseWorktreeBindingsDocument } from './controls/worktree-bindings.js'
import type { WorktreeBindingsDocument, WorktreeBindingBusinessUpdate, WorktreeBindingRow, WorktreeBindingsCompact, WorktreeBindingsPurgeHistory, WorktreeBindingCurrentRow } from './controls/worktree-bindings.js'
import { createWorktreeObservations, parseWorktreeObservationsDocument } from './controls/worktree-observations.js'
import type { WorktreeObservationBusinessUpdate, WorktreeObservationCheckInput, WorktreeObservationInput, WorktreeObservationRow, WorktreeObservationView, WorktreeObservationsDocument, WorktreeObservationCurrentRow } from './controls/worktree-observations.js'
import { SessionHistory, parseHistoryDocument } from './controls/history.js'
import type { HistoryDocument, HistoryObservation, HistoryAction, HistoryQuery } from './controls/history.js'

function canonical(value:unknown):string {return value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(canonical).join(',')+']':'{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,entry])=>JSON.stringify(key)+':'+canonical(entry)).join(',')+'}'}
interface DelegationJournal { readonly revision:number; readonly rows:readonly {readonly operationId:string;readonly parentSessionId:string;readonly fingerprint:string;readonly childId:string;readonly result:HostJson|null}[] }
function parseDelegationJournal(input:unknown):DelegationJournal {
  const d=record(input,'delegation journal',['revision','rows'])
  return freeze({revision:revision(d.revision,'delegation revision'),rows:array(d.rows,'delegations').map(value=>{const r=record(value,'delegation',['operationId','parentSessionId','fingerprint','childId','result']);return {operationId:id(r.operationId,'operationId'),parentSessionId:id(r.parentSessionId,'parent'),fingerprint:id(r.fingerprint,'fingerprint'),childId:id(r.childId,'childId'),result:r.result===null?null:parseHostJson(r.result)}})})
}
type DelegationBinding = 'confirmed' | 'unconfirmed' | 'unknown'
type DelegationAssignment = 'granted' | 'not-attempted' | 'failed' | 'unknown'
interface DelegationRecovery { readonly binding: DelegationBinding; readonly assignment: DelegationAssignment }
/** A rejected write may have committed; only this code means the effect is unknown rather than failed. */
function storageUncertain(error: unknown): boolean {
  return error !== null && typeof error === 'object' && (error as { readonly code?: unknown }).code === 'storage-uncertain'
}
/** Current verifiable binding. Only an accepted creation with a confirmed actual header is
 * confirmed; an explicit rejection is unconfirmed; pending/accepted-unknown rows stay unknown. */
function delegationBinding(row: WorktreeBindingRow | undefined): DelegationBinding {
  if (row === undefined) return 'unknown'
  if (row.value.acceptance === 'accepted' && row.value.outcome === 'confirmed') return 'confirmed'
  if (row.value.acceptance === 'rejected') return 'unconfirmed'
  return 'unknown'
}
/** Current assignment for the same child and the exact requested workflow/ticket scope. */
function delegationAssignment(row: TaskAssignment | undefined, instanceId: string, workflowId: string | null, ticketIds: readonly string[]): DelegationAssignment {
  if (row === undefined) return 'unknown'
  return row.instrumentInstanceId === instanceId && row.workflowId === workflowId
    && row.ticketIds.length === ticketIds.length && ticketIds.every(ticket => row.ticketIds.includes(ticket)) ? 'granted' : 'failed'
}
interface SourceCleanupJournal {readonly revision:number;readonly rows:readonly {readonly operationId:string;readonly fingerprint:string;readonly historyIds:readonly string[];readonly derivedDone:boolean;readonly result:HostJson|null}[]}
function parseSourceCleanupJournal(value:unknown):SourceCleanupJournal {
  const d=record(value,'source cleanup journal',['revision','rows'])
  const rows=array(d.rows,'cleanup rows').map(value=>{const r=record(value,'cleanup receipt',['operationId','fingerprint','historyIds','derivedDone','result']);if(typeof r.derivedDone!=='boolean')throw new ControlsError('invalid-state','invalid cleanup acknowledgement');return {operationId:id(r.operationId,'operationId'),fingerprint:id(r.fingerprint,'fingerprint'),historyIds:array(r.historyIds,'history ids').map(value=>id(value,'historyId')),derivedDone:r.derivedDone,result:r.result===null?null:parseHostJson(r.result)}})
  if(new Set(rows.map(row=>row.operationId)).size!==rows.length)throw new ControlsError('invalid-state','duplicate cleanup identity')
  return freeze({revision:revision(d.revision,'cleanup revision'),rows})
}
interface Dispatch {
  readonly caller: HostCaller; readonly exec: ToolRunContext; readonly instance: SessionControlsView
  readonly workflowId: string | null; readonly ticketIds: readonly string[]
  readonly children: Set<Agent>; readonly live: Set<Agent>
  token: ExecutionToken
  released: boolean
  accepting:boolean
}
const NATIVE_TOOLS = new Set(['subagent','subagent_fork','send_message'])
function denied(message: string): never { throw new ControlsError('access-denied',message) }
/** This admission read failed before any write; keep the source unknown without inventing
 * an unacknowledged runtime mutation in the consumption durability frontier. */
class LocalHandleReadUnavailable extends ControlsError {
  constructor(){super('storage-uncertain','local task handles unavailable; no referenced admission was granted')}
}
function callerFor(principalId: string, sessionId: string, operator: string): HostCaller {
  return {kind:principalId===operator?'user':'agent',principalId,sessionId:principalId===operator?null:sessionId}
}
/** One-host operation ordering, not a multi-process or cross-domain transaction. */
class OrderedEffects {
  #tail: Promise<unknown> = Promise.resolve()
  run<T>(effect:()=>Promise<T>):Promise<T> {
    const result=this.#tail.then(effect);this.#tail=result.catch(()=>undefined);return result
  }
  async drain():Promise<void>{await this.#tail}
}
/** Rendered text block of a durable tool result, parsed back to JSON; null when it is not one. */
function contentValue(content:unknown):unknown{
  if(!Array.isArray(content))return null
  for(const block of content){
    if(block===null||typeof block!=='object')continue
    const value=block as {readonly type?:unknown;readonly text?:unknown}
    if(value.type!=='text'||typeof value.text!=='string')continue
    try{return JSON.parse(value.text)}catch{return null}
  }
  return null
}
/** Durable create_worktree calls of one session: native tool/call+tool/result pairs and PTC
 * sub-dispatches. Failed calls and unparsable payloads are skipped, never guessed. */
function scanObservedCreations(events:readonly {readonly type:string;readonly data:unknown}[],creatorSessionId:string):readonly WorktreeObservationInput[]{
  const calls=new Map<string,{readonly turn:number|null;readonly step:number|null}>(),creations:WorktreeObservationInput[]=[]
  const creation=(value:unknown)=>{const parsed=value===null||typeof value!=='object'||Array.isArray(value)?null:(()=>{const raw=value as Record<string,unknown>;for(const key of ['path','branch','baseCommit','repositoryRoot'] as const)if(typeof raw[key]!=='string')return null;return {path:raw.path as string,branch:raw.branch as string,baseCommit:raw.baseCommit as string,repositoryRoot:raw.repositoryRoot as string}})();return parsed}
  for(const event of events){
    if(event.data===null||typeof event.data!=='object')continue
    const data=event.data as Record<string,unknown>
    if(event.type==='tool/call'&&data.name==='create_worktree'&&typeof data.callId==='string')calls.set(data.callId,{turn:typeof data.turn==='number'?data.turn:null,step:typeof data.step==='number'?data.step:null})
    else if(event.type==='tool/result'&&data.error===undefined&&data.message!==null&&typeof data.message==='object'){
      const message=data.message as {readonly toolCallId?:unknown;readonly content?:unknown},position=typeof message.toolCallId==='string'?calls.get(message.toolCallId):undefined
      if(position===undefined||typeof message.toolCallId!=='string')continue
      const parsed=creation(contentValue(message.content));if(parsed)creations.push({creatorSessionId,callId:message.toolCallId,rootCallId:message.toolCallId,turn:position.turn,step:position.step,...parsed})
    }else if(event.type==='tool/ptc-dispatch'&&data.name==='create_worktree'&&data.isError!==true&&typeof data.subCallId==='string'){
      const parsed=creation(contentValue(data.content));if(parsed)creations.push({creatorSessionId,callId:data.subCallId,rootCallId:typeof data.rootCallId==='string'?data.rootCallId:data.subCallId,turn:null,step:null,...parsed})
    }
  }
  return creations
}
export interface RuntimeOptions { readonly runtimeId?: string; readonly consumptionTimeoutMs?: number; readonly now?: () => number }
export async function createRuntime(ports:HostPorts,options:RuntimeOptions={}):Promise<RuntimeFacade> {
  const runtimeId=id(options.runtimeId??randomUUID(),'runtimeId'), queue=new OrderedEffects(), now=options.now??Date.now
  // Only model read methods may re-enter an active read permit. Mutation/capture queues stay unchanged.
  const modelReadContext=new AsyncLocalStorage<{open:boolean}>()
  const modelReadOrder=<T>(effect:()=>Promise<T>):Promise<T>=>modelReadContext.getStore()?.open===true?effect():queue.run(effect)
  const refresh=new RefreshGate(2_000), project=new RefreshGate(2_000)
  // The polling path (client readSession) rebuilds the whole projection and appends another
  // history observation per call — measured 68 readSession/s and 40-50 captures/s on an
  // otherwise idle profile, with per-row JSON stringification as the top self frame. The
  // projection is a pure function of the documents plus this process's mutations, so the
  // same watermark serves it: unchanged revisions and no mutation means the frozen value is
  // still the current projection.
  type CurrentRuntimeSnapshot = Omit<RuntimeSnapshot,'records'> & { readonly records: InstrumentCurrentSnapshot | null }
  type RuntimeReadSnapshot = Omit<RuntimeSnapshot,'records'> & { readonly records: ConsumptionSnapshot['records'] }
  const projectionCache=new Map<string,{readonly key:string;readonly liveToken:string;readonly dependencies:readonly string[];readonly value:RuntimeReadSnapshot}>()
  // Weak numeric identities never retain borrowed Agent/Session graphs in a cache entry.
  const liveIdentities=new WeakMap<object,number>()
  let nextLiveIdentity=0
  const liveIdentity=(value:object):number=>{let token=liveIdentities.get(value);if(token===undefined){token=++nextLiveIdentity;liveIdentities.set(value,token)}return token}
  const captureLiveCut=(owner:string)=>{
    // Copy every field synchronously. Only this temporary cut holds the whole live index;
    // cache entries keep a digest and the registry IDs that their bodies actually used.
    const rows=new Map<string,{readonly parent:string|undefined;readonly origin:string|undefined;readonly token:readonly unknown[]}>()
    let reusable=true
    for(const agent of ports.liveAgents()){
      const session=agent.session,header=session.header,sid=String(agent.id)
      if(rows.has(sid)||String(header.id)!==sid)reusable=false
      rows.set(sid,{parent:header.parentSession,origin:header.origin,token:[sid,liveIdentity(agent),liveIdentity(session),session.id,header.id,header.version,header.createdAt,header.cwd,header.isSeeded,header.origin,header.parentSession,agent.status]})
    }
    const related=new Set<string>([owner])
    for(const [sid,row]of rows){
      if(sid===owner||row.origin!=='subagent')continue
      const seen=new Set<string>()
      let cursor:string|undefined=sid
      while(cursor!==undefined){
        if(cursor===owner){related.add(sid);for(const id of seen)related.add(id);break}
        if(seen.has(cursor)||seen.size>=64){reusable=false;break}
        seen.add(cursor)
        const current=rows.get(cursor)
        if(current===undefined){reusable=false;break}
        // A root/fork is an independent identity, not an unknown missing parent.
        if(current.origin!=='subagent')break
        if(current.parent===undefined){reusable=false;break}
        cursor=current.parent
      }
    }
    const countState=ports.nativeSubagentCountState?.(owner)
    // Stored native membership may outlive a live parent-chain change. Its compact IDs,
    // not that chain or the stored revision alone, prove which live objects can affect S.
    const members=countState?.memberSessionIds===undefined?null:[...countState.memberSessionIds].sort()
    if(members===null)reusable=false
    // Mirror only the counter's prospective live membership: native children of the owner
    // or a stored member, transitively. Ordinary forks are not new membership bridges.
    const prospective=new Set<string>([owner,...(members??[])])
    for(let pass=0;pass<64;pass++){
      let grew=false
      for(const [sid,row]of rows){
        if(row.origin!=='subagent'||prospective.has(sid)||row.parent===undefined||!prospective.has(row.parent))continue
        prospective.add(sid);grew=true
      }
      if(!grew)break
    }
    for(const sid of prospective){
      related.add(sid)
      if(sid===owner)continue
      // Native depth follows all live parents, including independent root/fork identities.
      // Keep their fields/absence in A as well; no membership reclassification occurs here.
      const seen=new Set<string>([sid])
      let cursor=rows.get(sid)?.parent
      while(cursor!==undefined){
        related.add(cursor)
        if(cursor===owner)break
        if(seen.has(cursor)||seen.size>=64){reusable=false;break}
        seen.add(cursor)
        const parent=rows.get(cursor)
        if(parent===undefined){reusable=false;break}
        cursor=parent.parent
      }
    }
    const countRevision=ports.nativeSubagentCountRevision?.(owner)??0
    const countToken=countState===undefined?null:[countState.revision,countState.known,countState.reason,countState.available,members]
    const capabilities=Object.entries(ports.capabilities).map(([key,value])=>[key,value])
    const token=(dependencies:readonly string[]):string=>sourceVersion([countRevision,countToken,capabilities,
      [...new Set([...related,...dependencies,...(reusable?[]:rows.keys())])].sort().map(sid=>[sid,rows.get(sid)?.token??null])])
    return {reusable,token}
  }
  const touchState=(instanceId?:string):void=>{refresh.touch(instanceId);project.touch(instanceId)}
  const controls=new WorkspaceControls(ports.controlsStorage,ports.authority)
  const storage=await ports.openRuntimeStorage(parseRuntimeDocument)
  const nativeDispatch=new AsyncLocalStorage<Dispatch>()
  const cachedSessions=new Map<string,SessionControlsView>(), nativeWindows=new Map<string,boolean>()
  // Trusted launch configuration, not a cwd capability inference: the Host tells the runtime
  // whether the optional delegate tool was actually registered.
  let delegateRegistered=false
  const exactExecutions=new WeakMap<Agent,Dispatch>(), initialized=new Set<string>(), readmitted=new Set<string>()
  // A continuable child is disposed between runs and re-created when it is woken, so the same child
  // session can run several times under one dispatch. Managed executions are therefore indexed by child
  // session as well: a wake re-admits the lane into the running window instead of reading as unmanaged.
  const managedExecutions=new Map<string,Dispatch>(), reattached=new WeakMap<Agent,Dispatch>()
  const worktreeStores=new Map<string,VersionedStorage<WorktreeBindingsDocument>>()
  const worktrees=createWorktreeBindings(owner=>{const store=worktreeStores.get(owner);if(!store)throw new ControlsError('invalid-state','worktree storage unopened');return store})
  const openWorktrees=async(view:SessionControlsView)=>{const owner=view.instance.ownerSessionId;if(!worktreeStores.has(owner))worktreeStores.set(owner,await ports.openUnitStorage('worktrees_'+createHash('sha256').update(view.instance.instrumentInstanceId).digest('hex').slice(0,48),parseWorktreeBindingsDocument));return worktrees}
  const observationStores=new Map<string,VersionedStorage<WorktreeObservationsDocument>>()
  const observations=createWorktreeObservations(owner=>{const store=observationStores.get(owner);if(!store)throw new ControlsError('invalid-state','worktree observation storage unopened');return store})
  const openObservations=async(view:SessionControlsView)=>{const owner=view.instance.ownerSessionId;if(!observationStores.has(owner))observationStores.set(owner,await ports.openUnitStorage('worktree_observations_'+createHash('sha256').update(view.instance.instrumentInstanceId).digest('hex').slice(0,40),parseWorktreeObservationsDocument));return observations}
  const historyStores=new Map<string,Promise<VersionedStorage<HistoryDocument>>>()
  const historyFor=async(view:SessionControlsView)=>{
    const key=view.instance.instrumentInstanceId
    let store=historyStores.get(key)
    if(!store){
      const opening=ports.openUnitStorage('history_'+createHash('sha256').update(key).digest('hex').slice(0,56),parseHistoryDocument).catch(error=>{
        // A failed open is not a durable handle: retaining its rejected promise prevents
        // every later capture retry, even though its source mark correctly stayed behind.
        if(historyStores.get(key)===opening)historyStores.delete(key)
        throw error
      })
      store=opening;historyStores.set(key,store)
    }
    return new SessionHistory(view.instance,await store)
  }
  const historyFailures=new Map<string,string>()
  const modelMutationOutcomes=new WeakMap<object,{readonly historyCapture:{readonly status:'recorded'|'failed';readonly diagnostic:string|null}}>()
  // Capture is a projection side effect; without these marks every rebuild re-derived every
  // observation and re-ran the dedupe index even when no source document had moved. The marks
  // are advanced only after a successful capture (or when there was nothing to capture), so a
  // failed capture is retried on the next rebuild rather than hidden behind a newer revision.
  interface CaptureMarks{ business:Map<string,string>; windows:number|null; worktrees:number|null; runtime:number|null; configuration:number|null; resources:number|null }
  const captureMarks=new Map<string,CaptureMarks>()
  const marksFor=(key:string):CaptureMarks=>{let marks=captureMarks.get(key);if(marks===undefined){marks={business:new Map(),windows:null,worktrees:null,runtime:null,configuration:null,resources:null};captureMarks.set(key,marks)}return marks}
  const storedRevision=(raw:unknown):number|null=>{if(raw===null||typeof raw!=='object')return null;const value=(raw as {readonly revision?:unknown}).revision;return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:null}
  // Per-session successful marks are bounded to 64 compact tokens per instance. A scope
  // change replaces that session's token, rather than accumulating arbitrary grant strings.
  // This is capture bookkeeping only; current identity and permission are checked first.
  const businessCaptureVersion=(records:NonNullable<ConsumptionSnapshot['records']>):string=>createHash('sha256').update(canonical([records.revision,records.businessRevision,records.scope])).digest('hex')
  const captureBusiness=async(view:SessionControlsView,records:RuntimeSnapshot['records'],signal?:AbortSignal) => {
    signal?.throwIfAborted()
    if(!records)return
    const marks=marksFor(view.instance.instrumentInstanceId)
    const version=businessCaptureVersion(records),consumer=view.association.sessionId
    if(marks.business.get(consumer)===version)return
    const observations:HistoryObservation[]=[]
    for(const [kind,rows]of [['workflow',records.workflows],['ticket',records.tickets],['task-reference',records.taskReferences],['decision',records.decisions]] as const){
      for(const row of rows){const recordId=kind==='workflow'?row.workflowId:JSON.stringify([row.workflowId,'localTicketId' in row?row.localTicketId:'decisionId' in row?row.decisionId:null])
        for(const h of row.history)observations.push({kind,recordId,recordKey:recordId,version:h.revision,snapshot:parseHostJson(h.policySelection===undefined?h.value:{...h.value,policySelection:h.policySelection,references:h.references}),source:{kind:'authored',domain:'instruments',author:parseHostJson(h.author),recordedAt:h.recordedAt,coverage:'recorded-history'},...(kind==='decision'?{flags:{done:!('pending' in h.value&&h.value.pending===true)&&!('awaitingImplementation' in h.value&&h.value.awaitingImplementation===true)}}:{})})
      }
    }
    if(observations.length>0){const history=await historyFor(view).catch(error=>{signal?.throwIfAborted();throw error});signal?.throwIfAborted();await history.capture(observations)}
    marks.business.delete(consumer);marks.business.set(consumer,version)
    while(marks.business.size>64)marks.business.delete(marks.business.keys().next().value as string)
  }
  // History capture is a side effect of reading the projection, not a change of it: the
  // fingerprint is computed after the capture, so invalidating here would rebuild on every
  // read and never converge. Only real document mutations touch the gate.
  const captureSafely=async(view:SessionControlsView,effect:()=>Promise<void>,signal?:AbortSignal):Promise<{readonly status:'recorded'|'failed';readonly diagnostic:string|null}>=>{try{await effect();historyFailures.delete(view.instance.instrumentInstanceId);return {status:'recorded',diagnostic:null}}catch(error){if(signal?.aborted&&error===signal.reason)throw error;const diagnostic=String(error).slice(0,1024);historyFailures.set(view.instance.instrumentInstanceId,diagnostic);return {status:'failed',diagnostic}}}
  const captureCurrent=async(view:SessionControlsView,items:readonly {kind:string;recordId:string;version:number;snapshot:unknown;domain:string;author?:HostCaller}[],signal?:AbortSignal)=>{
    signal?.throwIfAborted()
    if(items.length===0)return
    const history=await historyFor(view).catch(error=>{signal?.throwIfAborted();throw error});signal?.throwIfAborted()
    const store=await historyStores.get(view.instance.instrumentInstanceId)!;signal?.throwIfAborted()
    const raw=await store.read().catch(error=>{signal?.throwIfAborted();throw error});signal?.throwIfAborted()
    const prior=raw===undefined?[]:memoized(raw,parseHistoryDocument).rows
    // One latest-row index per call: the previous linear filter per item made a capture with
    // many rows and many items quadratic.
    const latest=new Map<string,typeof prior[number]>()
    for(const row of prior)latest.set(row.kind+'\u0000'+row.recordId+'\u0000'+row.sourceDomain,row)
    const observations:HistoryObservation[]=[]
    for(const item of items){
      const snapshot=parseHostJson(item.snapshot),last=latest.get(item.kind+'\u0000'+item.recordId+'\u0000'+item.domain)
      if(last&&(last.purged&&item.version<=last.version||!last.purged&&canonical(last.snapshot)===canonical(snapshot)))continue
      observations.push({kind:item.kind,recordId:item.recordId,recordKey:item.recordId,version:item.version,snapshot,source:{kind:last?'program':'snapshot',domain:item.domain,author:item.author?parseHostJson(item.author):null,recordedAt:null,coverage:last?'recorded-history':'snapshot-only'}})
    }
    signal?.throwIfAborted()
    await history.capture(observations)
  }
  const captureRuntime=async(view:SessionControlsView,doc:RuntimeDocument,signal?:AbortSignal)=>{
    signal?.throwIfAborted()
    const owner=view.instance.instrumentInstanceId,marks=marksFor(owner)
    if(marks.runtime===doc.revision)return
    await captureCurrent(view,[...doc.assignments.filter(row=>row.instrumentInstanceId===owner).map(row=>({kind:'assignment',recordId:row.sessionId,version:doc.revision,snapshot:row,domain:'runtime'})),
      ...doc.bindings.filter(row=>row.instrumentInstanceId===owner).map(row=>({kind:'execution-binding',recordId:JSON.stringify([row.executionId,row.generation]),version:doc.revision,snapshot:row,domain:'runtime'})),
      ...doc.notifications.filter(row=>row.instrumentInstanceId===owner).map(row=>({kind:'notification',recordId:row.notificationId,version:doc.revision,snapshot:row,domain:'runtime'})),
      ...doc.nativeExecutions.filter(row=>row.instrumentInstanceId===owner).map(row=>({kind:'native-execution',recordId:row.executionId,version:doc.revision,snapshot:row,domain:'runtime'}))],signal)
    marks.runtime=doc.revision
  }
  const windowCaptureRevisions=new Map<string,number>()
  const captureOthers=async(view:SessionControlsView,caller:HostCaller,signal?:AbortSignal)=>{
    signal?.throwIfAborted()
    // Raw operation journals are read only after the actual owner scope has been proved.
    if((await scope(caller.principalId,view.association.sessionId,view,signal)).kind!=='coordinator')return
    signal?.throwIfAborted()
    const key=view.instance.instrumentInstanceId,marks=marksFor(key),observations:HistoryObservation[]=[]
    let capturedThrough=windowCaptureRevisions.get(key)??0,windowRevision:number|null=null
    const raw=await ports.windowStorage.read(key).catch(error=>{signal?.throwIfAborted();throw error})
    signal?.throwIfAborted()
    if(raw===undefined)marks.windows=0
    else{
      const stored=storedRevision(raw)
      if(stored===null||marks.windows!==stored){
        const doc=parseWindowDocument(raw)
        if(doc.instrumentInstanceId!==key||doc.ownerSessionId!==view.instance.ownerSessionId)denied('window history owner mismatch')
        // Only operations newer than the last captured revision are rebuilt every projection pass;
        // the journal grows with every program observation and is otherwise walked in full.
        const ops=(doc.schemaVersion===2?[...doc.retainedOperations,...doc.operations].sort((a,b)=>a.revision-b.revision):doc.operations).filter(op=>op.revision>capturedThrough)
        if(ops.length>0)capturedThrough=Math.max(capturedThrough,ops[ops.length-1]!.revision)
        for(const op of ops){const payload=record(JSON.parse(op.fingerprint),'window source payload'),kind=op.kind==='ticket'?'ticket-window':op.kind==='knowledge'?'runtime-knowledge':'execution',recordId=op.kind==='ticket'?JSON.stringify([payload.workflowId,payload.localTicketId]):op.kind==='knowledge'?key:JSON.stringify([payload.executionId,op.generation])
          observations.push({kind,recordId,recordKey:op.operationId,version:op.revision,snapshot:parseHostJson({operation:op,payload}),source:{kind:'program',domain:'windows',author:op.caller===null?null:parseHostJson({principalId:op.caller}),recordedAt:null,coverage:'recorded-history'}})
        }
        windowRevision=stored
      }
    }
    const registryModule=await openWorktrees(view).catch(error=>{signal?.throwIfAborted();throw error});signal?.throwIfAborted()
    const registry=await registryModule.query(view.instance).catch(error=>{signal?.throwIfAborted();throw error});signal?.throwIfAborted()
    const worktreeRevision=registry.revision,worktreePending=marks.worktrees!==worktreeRevision
    if(worktreePending)for(const row of registry.rows){for(const h of row.history)observations.push({kind:'worktree',recordId:row.bindingId,recordKey:h.operationId,version:h.revision,snapshot:parseHostJson(h.value),source:{kind:h.source==='program'?'program':'authored',domain:'worktree-bindings',author:parseHostJson(h.author),recordedAt:h.recordedAt,coverage:'recorded-history'},flags:{cleanedWorktree:h.value.business.state==='cleaned'}})}
    if(observations.length>0){const history=await historyFor(view).catch(error=>{signal?.throwIfAborted();throw error});signal?.throwIfAborted();await history.capture(observations)}
    if(windowRevision!==null)marks.windows=windowRevision
    if(worktreePending)marks.worktrees=worktreeRevision
    windowCaptureRevisions.set(key,capturedThrough)
    signal?.throwIfAborted()
    const runtime=await load().catch(error=>{signal?.throwIfAborted();throw error});signal?.throwIfAborted()
    await captureRuntime(view,runtime,signal)
    signal?.throwIfAborted()
    if(marks.configuration!==savedPolicy.revision){
      await captureCurrent(view,[{kind:'configuration',recordId:view.instance.controlWorkspaceId,version:savedPolicy.revision,snapshot:savedPolicy,domain:'controls'}],signal)
      marks.configuration=savedPolicy.revision
    }
    signal?.throwIfAborted()
    const resourceRaw=await ports.resourceStorage.read().catch(error=>{signal?.throwIfAborted();throw error})
    signal?.throwIfAborted()
    if(resourceRaw===undefined)marks.resources=0
    else{
      const doc=record(resourceRaw,'resource history document'),resourceRevision=revision(doc.revision,'resource revision')
      if(marks.resources!==resourceRevision){
        await captureCurrent(view,array(doc.resources,'resources').map(value=>record(value,'resource')).filter(row=>row.ownerInstanceId===key).map(row=>({kind:'resource',recordId:id(row.resourceId,'resourceId'),version:resourceRevision,snapshot:row,domain:'resources'})),signal)
        marks.resources=resourceRevision
      }
    }
  }
  const notificationLifetime=new AbortController()
  let closing=false
  let savedPolicy=await controls.readPolicy(ports.operatorPrincipal)
  let transitioning:PolicyIntent|null=null
  const mayRequireWindows=(policy:PolicyIntent):boolean=>policy.extensionEnabled&&(policy.defaults.windows?.enabled===true||Object.values(policy.workspaceOverrides).some(patch=>patch.windows?.enabled===true))
  const load=async():Promise<RuntimeDocument>=>{const raw=await storage.read();return raw===undefined?INITIAL_RUNTIME_DOCUMENT:memoized(raw,parseRuntimeDocument)}
  const update=async(change:(current:RuntimeDocument)=>RuntimeDocument|Promise<RuntimeDocument>):Promise<RuntimeDocument>=>{
    for(let attempt=0;attempt<32;attempt++){
      const old=await load(),candidate=await change(old)
      if(candidate===old)return old
      const next=parseRuntimeDocument({...candidate,revision:increment(old.revision)})
      if(await storage.compareAndSwap(old.revision,next)){
        // change() retains immutable rows it did not alter. Diff row identity before parsing
        // (which detaches all rows) so owner-local notifications/assignments do not dirty
        // every other instance. Removed rows invalidate their former owner too.
        const before=new Set([...old.assignments,...old.bindings,...old.notifications,...old.nativeExecutions])
        const after=new Set([...candidate.assignments,...candidate.bindings,...candidate.notifications,...candidate.nativeExecutions])
        const owners=new Set([...before,...after].filter(row=>!before.has(row)||!after.has(row)).map(row=>row.instrumentInstanceId))
        for(const owner of owners)touchState(owner)
        // Capture only affected owner facts, never rebuild other owners merely because this
        // shared storage document acquired a new revision.
        const viewsByInstance=new Map<string,SessionControlsView>()
        for(const view of cachedSessions.values())if(!viewsByInstance.has(view.instance.instrumentInstanceId))viewsByInstance.set(view.instance.instrumentInstanceId,view)
        let captureOutcome:{readonly status:'recorded'|'failed';readonly diagnostic:string|null}|null=null
        for(const owner of owners){
          const view=viewsByInstance.get(owner)
          if(view){const outcome=await captureSafely(view,()=>captureRuntime(view,next));if(captureOutcome===null||outcome.status==='failed')captureOutcome=outcome}
        }
        if(captureOutcome!==null)modelMutationOutcomes.set(next,{historyCapture:captureOutcome})
        return next
      }
    }
    throw new ControlsError('concurrent-update','runtime association contention')
  }
  const check=async(caller:HostCaller,sessionId?:string,signal?:AbortSignal)=>{
    if(closing)denied('instrument runtime is disposing')
    signal?.throwIfAborted();await ports.authorizeCaller(caller,sessionId,signal);signal?.throwIfAborted()
  }
  const policyView=(read:SessionControlsView):SessionControlsView=>read.policy.configurationRevision<savedPolicy.revision?{...read,policy:resolvePolicy(savedPolicy,read.instance.controlWorkspaceId,read.policy.workspaceVerified)}:read
  const identity=async(caller:HostCaller,sessionId:string,signal?:AbortSignal,register=true):Promise<SessionControlsView>=>{
    await check(caller,sessionId,signal)
    const read=register?await controls.ensureSession(caller.principalId,sessionId):await controls.readSession(caller.principalId,sessionId,signal)
    const view=policyView(read)
    cachedSessions.set(sessionId,view);nativeWindows.set(sessionId,view.policy.extensionEnabled&&view.policy.features.windows.requested)
    signal?.throwIfAborted();return view
  }
  /** Referenced admission requires a current local handle; native ticketless work stays unrestricted. */
  /** Registered (workflow, ticket) pairs; a ticket id is only meaningful inside its own workflow. */
  const registeredTickets=async(caller:HostCaller,sessionId:string):Promise<ReadonlySet<string>|null>=>{
    try{const read=await instruments.read(caller.principalId,sessionId);return new Set([...read.tickets,...read.taskReferences].map(row=>row.workflowId+'\u0000'+row.localTicketId))}
    catch{return null}
  }
  /** Held T slots whose ticket already sits in a terminal status: the agent releases them, nothing else does. */
  function pendingReleaseFor(records:ConsumptionSnapshot['records'],windows:RuntimeSnapshot['windows']):readonly {readonly workflowId:string;readonly localTicketId:string;readonly generation:number;readonly label:string|null}[] {
    if(records===null||windows===null)return []
    const terminal=new Map<string,ReadonlySet<string>>(),labels=new Map<string,string>()
    for(const flow of records.workflows){const marks=new Set<string>();for(const axis of flow.value.axes)for(const status of axis.statuses){labels.set(flow.workflowId+'\u0000'+status.statusKey,status.label);if(status.terminal===true)marks.add(status.statusKey)}if(marks.size>0)terminal.set(flow.workflowId,marks)}
    if(terminal.size===0)return []
    const rows:{workflowId:string;localTicketId:string;generation:number;label:string|null}[]=[]
    const byTicket=new Map(records.tickets.map(ticket=>[ticket.workflowId+'\u0000'+ticket.localTicketId,ticket]))
    for(const row of windows.tickets){
      if(!row.held)continue
      const marks=terminal.get(row.workflowId);if(marks===undefined)continue
      const ticket=byTicket.get(row.workflowId+'\u0000'+row.localTicketId);if(ticket===undefined)continue
      for(const key of Object.values(ticket.value.statuses).flat())if(marks.has(String(key))){rows.push({workflowId:row.workflowId,localTicketId:row.localTicketId,generation:row.generation,label:labels.get(row.workflowId+'\u0000'+String(key))??null});break}
    }
    return rows
  }
/**
 * Mechanical outcome text for the main-agent health row. 'unobservable' states the absence of a
 * readable turn/end (with its evidence pointer) and is never rendered as a cause.
 */
  const nativeOutcomeText=(stop:NonNullable<RuntimeSnapshot['nativeStops']>[number]):string=>{
    const where='session '+stop.sessionId+(stop.turn===null?'':' turn '+stop.turn)
    const outcome=stop.outcome==='unobservable'
      ?'outcome unobservable (no readable turn/end'+(stop.evidence!==null&&stop.evidence.seq!==null?'; last observed seq '+stop.evidence.seq:'')+')'
      :stop.outcome==='error'?'turn failed'+(stop.diagnostic===null?'':' ('+stop.diagnostic+')')
      :stop.outcome==='interrupted'?'turn never ended normally (crash or forced stop)'
      :stop.outcome==='aborted'?'turn cancelled'+(stop.cancelCause===null?' (cancel cause unobservable)':' by '+stop.cancelCause)
      :'ended with '+stop.outcome
    const lane=stop.lane===null||stop.lane.workflowId===null&&stop.lane.localTicketId===null?'':' (lane '+String(stop.lane.workflowId??'ticketless')+(stop.lane.localTicketId===null?'':'/'+stop.lane.localTicketId)+')'
    return where+' '+outcome+lane
  }
/** Absent and explicit null both mean "no ticket"; a present value must still be a real id. */
  const optionalTicketId=(value:unknown,where:string):string|null=>{
    if(value===undefined||value===null)return null
    try{return id(value,where)}catch{throw new ControlsError('invalid-input',where+' must be a non-empty opaque id, or null when this work belongs to no ticket')}
  }
    const requireRegisteredTicket=async(caller:HostCaller,sessionId:string,workflowId:string,localTicketId:string):Promise<void>=>{
    const known=await registeredTickets(caller,sessionId)
    if(known===null)throw new LocalHandleReadUnavailable()
    if(known.has(workflowId+'\u0000'+localTicketId))return
    throw new ControlsError('invalid-input','task handle "'+localTicketId+'" is not registered in workflow "'+workflowId+'"; register a minimal mattpocock_record put-task-reference first, or omit workflowId for a ticketless research lane')
  }
  /** Raw grants are upper bounds, not independent owner overrides. Verify every real edge
   * on each read/CAS attempt; restoring a parent scope intentionally restores its raw grants. */
  const effectiveScope=async(doc:RuntimeDocument,sessionId:string,view:SessionControlsView,signal?:AbortSignal):Promise<InstrumentScope>=>{
    signal?.throwIfAborted()
    const chain:string[]=[],seen=new Set<string>()
    let cursor=sessionId
    while(cursor!==view.instance.ownerSessionId){
      if(seen.has(cursor))denied('cyclic task delegation chain')
      seen.add(cursor);chain.push(cursor)
      const fact=await ports.authority.resolveSession(cursor,signal)
      signal?.throwIfAborted()
      if(fact?.kind!=='managed-child')denied('task delegation parent chain unavailable')
      const row=doc.assignments.find(a=>a.sessionId===cursor)
      if(row&&(row.instrumentInstanceId!==view.instance.instrumentInstanceId||row.parentSessionId!==fact.parentSessionId))denied('task delegation parent or instance conflict')
      cursor=fact.parentSessionId
    }
    let permission:InstrumentScope={kind:'coordinator'}
    for(const child of chain.reverse()){
      const row=doc.assignments.find(a=>a.sessionId===child)
      const workflowId=row?.workflowId??null,ticketIds=row?.ticketIds??[]
      permission=permission.kind==='coordinator'?{kind:'assigned',workflowId,ticketIds}
        :permission.workflowId!==workflowId?{kind:'assigned',workflowId:null,ticketIds:[]}
        :{kind:'assigned',workflowId,ticketIds:ticketIds.filter(ticket=>permission.kind==='assigned'&&permission.ticketIds.includes(ticket))}
    }
    return permission
  }
  const scope=async(principal:string,sessionId:string,view:SessionControlsView,signal?:AbortSignal):Promise<InstrumentScope>=>{
    signal?.throwIfAborted()
    if(principal===ports.operatorPrincipal)return {kind:'coordinator'}
    return effectiveScope(await load(),sessionId,view,signal)
  }
  const authority:InstrumentAuthority={async resolveAccess(principal,sessionId,instance,_access,signal){
    const caller=callerFor(principal,sessionId,ports.operatorPrincipal)
    await check(caller,sessionId,signal)
    const view=await controls.readSession(principal,sessionId,signal)
    if(view.instance.instrumentInstanceId!==instance.instrumentInstanceId)denied('instrument authority identity mismatch')
    return {author:caller.kind==='user'?{kind:'user',principalId:principal,sessionId:null}:{kind:'agent',principalId:principal,sessionId},scope:await scope(principal,sessionId,view,signal)}
  }}
  const ownerPolicies=new OwnerDecisionPolicyStore({
    storageFor:instance=>ports.openUnitStorage(ownerDecisionPolicyTableName(instance.instrumentInstanceId),parseOwnerDecisionPolicyDocument),
    now,
    async authorizeOperator(author,instance){
      if(author.kind!=='user'||author.principalId!==ports.operatorPrincipal||author.sessionId!==null)denied('owner recommendation policy requires the authenticated operator')
      const view=await identity(author,instance.ownerSessionId,undefined,false)
      if(canonical(view.instance)!==canonical(instance))throw new ControlsError('association-conflict','owner policy instance changed')
    },
    async authorizeEnable(instance){
      const view=await identity({kind:'user',principalId:ports.operatorPrincipal,sessionId:null},instance.ownerSessionId,undefined,false)
      if(canonical(view.instance)!==canonical(instance))throw new ControlsError('association-conflict','owner policy instance changed')
      if(!recommendationConfigured(view))throw new ControlsError('feature-disabled','new recommendation authorization requires configured pending-decisions management')
    },
  })
  const recommendationConfigured=(view:SessionControlsView):boolean=>view.policy.extensionEnabled&&view.policy.workspaceEnabled&&view.policy.features.pendingDecisions.status==='configured'
  const policySnapshot=(view:SessionControlsView,state:OwnerDecisionPolicyState):OwnerDecisionPolicySnapshot=>freeze({schemaVersion:1,instance:view.instance,revision:state.revision,saved:{enabled:state.enabled,epoch:state.epoch},effective:evaluateOwnerDecisionPolicy(state,recommendationConfigured(view),now())})
  const readOwnerPolicy=async(view:SessionControlsView,signal?:AbortSignal):Promise<OwnerDecisionPolicyPublic>=>{
    try {
      const state=await ownerPolicies.read(view.instance);signal?.throwIfAborted()
      const effective=evaluateOwnerDecisionPolicy(state,recommendationConfigured(view),now())
      return freeze({revision:state.revision,...effective,epochId:state.epoch?.epochId??null,expiresAt:state.epoch?.expiresAt??null,scope:'new-decisions'})
    } catch {signal?.throwIfAborted();return freeze({revision:null,status:'unknown',epochId:null,expiresAt:null,scope:'new-decisions',reason:'policy-unavailable'})}
  }
  const requireOperator=async(caller:HostCaller,sessionId:string,signal:AbortSignal):Promise<SessionControlsView>=>{
    if(caller.kind!=='user'||caller.principalId!==ports.operatorPrincipal||caller.sessionId!==null)denied('owner recommendation policy requires the authenticated operator')
    return identity(caller,id(sessionId,'sessionId'),signal,false)
  }
  const instruments=new SessionInstruments(controls,ports.instrumentStorage,authority,now,ownerPolicies)
  let windowsProgram!:WindowProgramPort, consumptionProgram!:ConsumptionProgramPort
  // S is the host's live run status (live Agent.status over event-maintained membership); the ledger stays audit only.
  const windows=new SessionWindows(controls,ports.windowStorage,authority,{runtimeId,capability:'cooperative',requireKnownRuntime:false,
    nativeActivity:(ownerSessionId,signal)=>ports.nativeSubagentActivity(ownerSessionId,signal),
    bindProgram:port=>{windowsProgram=port}})
  const ownerCaller:HostCaller={kind:'user',principalId:ports.operatorPrincipal,sessionId:null}
  // Repeating an observation is not new evidence: every start/status/end edge of a native child
  // would otherwise append another durable window operation, and the next injected snapshot waits
  // for those commits. One stored unknown per runtime instance and reason is enough; a known
  // observation (or a new runtime id) re-arms the write.
  const knowledgeMemo=new Map<string,{readonly runtimeId:string;readonly reason:string|null}>()
  const knowledgeIsCurrent=(view:SessionControlsView,known:boolean,reason:string|null):boolean=>{
    const prior=knowledgeMemo.get(view.instance.instrumentInstanceId)
    return prior!==undefined&&prior.runtimeId===runtimeId&&prior.reason===(known?null:reason??'native-execution-facts-unavailable')
  }
  const markKnowledge=(view:SessionControlsView,known:boolean,reason:string|null):Promise<unknown>=>{
    const key=view.instance.instrumentInstanceId,effective=known?null:reason??'native-execution-facts-unavailable'
    if(knowledgeIsCurrent(view,known,reason))return Promise.resolve({appliedRevision:0,replayed:true,ignored:false})
    return windowsProgram.reconcileKnowledge(ports.operatorPrincipal,view.instance.ownerSessionId,{operationId:randomUUID(),state:known?'known':'unknown',reason:effective}).then(result=>{knowledgeMemo.set(key,{runtimeId,reason:effective});return result})
  }
  // A lease reports each execution state at most once while it stays in that state: repeated
  // running edges are the same audit fact and must not queue another window commit.
  const receiptStates=new Map<string,string>()
  const sendReceipt=(token:ExecutionToken,state:'accepted'|'scheduled'|'running'|'stopping'|'unknown'|'released'):Promise<unknown>=>{
    if(state==='running'&&receiptStates.get(token.leaseId)==='running')return Promise.resolve()
    receiptStates.set(token.leaseId,state)
    return windowsProgram.receipt({...token,operationId:randomUUID(),state}).catch(error=>{if(receiptStates.get(token.leaseId)===state)receiptStates.delete(token.leaseId);throw error})
  }
  const initialize=async(view:SessionControlsView):Promise<void>=>{
    const key=view.instance.instrumentInstanceId
    if(initialized.has(key))return
    const actual=await ports.nativeActivity(view.instance.ownerSessionId)
    // The host reports complete enumeration only when its catalog traversal had no
    // diagnostics; an unsupported or rejected listing stays explicitly unknown.
    await markKnowledge(view,actual.known,actual.reason)
    initialized.add(key)
  }
  /**
   * A hot reload or restart drops the in-memory dispatch map while the child keeps running. The
   * persisted bindings plus live-Agent facts re-admit exactly the lanes that are running now, so the
   * execution ledger keeps its audit rows; a lane that cannot be re-admitted stays visible as
   * unknown window facts instead. The projected S count never depends on this re-admission.
   */
  const readmitPersistedLanes=async(view:SessionControlsView):Promise<void>=>{
    try{
      if(!(view.policy.extensionEnabled&&view.policy.features.windows.requested))return
      const owner=view.instance.ownerSessionId,document=await load()
      const rows=document.bindings.filter(row=>row.instrumentInstanceId===view.instance.instrumentInstanceId&&!row.released)
      if(rows.length===0)return
      const live=new Map<string,Agent>(ports.liveAgents().filter(agent=>agent.id!==owner&&agent.session.header.origin==='subagent'&&(agent as unknown as {status?:string}).status==='running').map(agent=>[agent.id as unknown as string,agent]))
      if(live.size===0)return
      const coordinator=callerFor(ports.operatorPrincipal,owner,ports.operatorPrincipal)
      const current=await windows.read(coordinator.principalId,view.association.sessionId as unknown as Parameters<typeof windows.read>[1])
      const admitted=new Set(current.executions.filter(row=>row.state==='running'||row.state==='accepted').map(row=>row.executionId))
      for(const row of rows){
        const agent=live.get(row.sessionId)
        if(agent===undefined||admitted.has(row.executionId))continue
        try{
          const caller=callerFor('agent:'+row.parentSessionId,row.parentSessionId,ports.operatorPrincipal)
          const token={instrumentInstanceId:row.instrumentInstanceId,executionId:row.executionId,generation:row.generation,leaseId:row.leaseId}
          const dispatch:Dispatch={caller,exec:undefined as unknown as ToolRunContext,instance:view,workflowId:null,ticketIds:[],children:new Set(),live:new Set([agent]),token,released:false,accepting:false}
          await track(view.instance.instrumentInstanceId,async()=>{
            await sendReceipt(token,'running')
            managedExecutions.set(agent.id,dispatch);reattached.set(agent,dispatch);exactExecutions.set(agent,dispatch)
            await update(old=>({...old,bindings:[...old.bindings.filter(binding=>binding.sessionId!==agent.id),{...token,sessionId:agent.id,parentSessionId:row.parentSessionId,runtimeId,released:false}]}))
          })
        }catch{/* One lane that cannot be re-admitted stays an unknown window fact; it never fails the mount. */}
      }
    }catch{/* Persistence or windows unavailable during mount: the ordinary read path reports unknown. */}
  }
  const resourceModule=(caller:HostCaller,view:SessionControlsView,signal:AbortSignal)=>{
    const getGit=()=>concreteGitAdapter(ports.gitRunnerForSession(view.association.sessionId,signal))
    return createResourceModule({storage:ports.resourceStorage,lifecycle:ports.resourceLifecycle,
      authority:{async authorize(principal,access,resource){
        if(principal!==caller.principalId)denied('resource caller mismatch')
        await check(caller,view.association.sessionId,signal)
        const readSignal=access==='read'?signal:undefined
        const current=await controls.readSession(principal,view.association.sessionId,readSignal),permission=await scope(principal,view.association.sessionId,current,readSignal)
        if(resource&&resource.ownerInstanceId!==current.instance.instrumentInstanceId)denied('resource belongs to another owner')
        if(permission.kind!=='coordinator')denied('legacy resource access requires actual owner coordinator')
        if((access==='create'||access==='borrow')&&current.policy.features.binding.status!=='configured')throw new ControlsError('feature-disabled','new worktree resources require enabled binding intent')
        if(access==='retire'&&current.policy.features.lifecycle.status!=='configured')throw new ControlsError('feature-disabled','physical retirement requires enabled lifecycle intent')
        return {controlWorkspaceId:current.instance.controlWorkspaceId,instrumentInstanceId:current.instance.instrumentInstanceId,authorId:principal}
      }},git:{planCreate:(spec,s)=>getGit().planCreate(spec,s),create:(planned,s)=>getGit().create(planned,s),borrow:(path,s)=>getGit().borrow(path,s),inspect:(r,s)=>getGit().inspect(r,s),retire:(r,d,s)=>getGit().retire(r,d,s)}})
  }
  /** Small, current-only UI reads share the permission FIFO, not the full snapshot machinery.
   * Yield between members so a 32-session batch cannot monopolize the effect queue. */
  const summaries=async(caller:HostCaller,input:SessionSummaryRequest,signal:AbortSignal):Promise<SessionSummaryBatch>=>{
    const request=parseSessionSummaryRequest(input)
    await check(caller,undefined,signal)
    const rows:SessionSummaryResult[]=[]
    for(const selected of request.sessions){
      let result:SessionSummaryResult
      try{
        result=await queue.run(async():Promise<SessionSummaryResult>=>{
          await check(caller,selected.sessionId,signal)
          // List navigation neither registers sessions nor retains them as native-runtime handles.
          const view=policyView(await controls.readSession(caller.principalId,selected.sessionId,signal))
          let records:SessionSummary['records']=null,sourceRevision:number|null=null,permission:InstrumentScope|null=null
          const health:SessionSummary['health'][number][]=[]
          try{
            const current=await instruments.readSummary(caller.principalId,selected.sessionId,signal)
            sourceRevision=current.revision;permission=current.scope
            records={businessRevision:current.businessRevision,viewerRevision:current.viewerRevision,summary:current.summary}
          }catch(error){
            signal.throwIfAborted()
            if(error instanceof ControlsError&&['access-denied','unknown-session','unknown-workspace','association-conflict'].includes(error.code))throw error
            health.push({scope:'records',status:'unknown',reason:'records-unavailable'})
          }
          await check(caller,selected.sessionId,signal)
          const p=view.policy
          const summary:SessionSummary=freeze({sessionId:selected.sessionId,caller:{kind:caller.kind,principalId:caller.principalId,sessionId:caller.sessionId},instance:view.instance,
            policy:{configurationRevision:p.configurationRevision,controlWorkspaceId:p.controlWorkspaceId,workspaceVerified:p.workspaceVerified,extensionEnabled:p.extensionEnabled,workspaceEnabled:p.workspaceEnabled,display:p.display},records,health})
          // A hint is never an authorization shortcut. This cut includes the actual scope and
          // mount/source/viewer identity even when its visible numeric count happens not to change.
          const version=createHash('sha256').update(canonical([runtimeId,view.documentRevision,sourceRevision,permission,summary])).digest('hex')
          return selected.version===version?{sessionId:selected.sessionId,status:'unchanged',version}:{sessionId:selected.sessionId,status:'current',version,summary}
        })
      }catch(error){
        signal.throwIfAborted()
        result={sessionId:selected.sessionId,status:'unavailable',reason:error instanceof ControlsError?error.code:'summary-unavailable'}
      }
      const fallback=(sessionId:string):SessionSummaryResult=>({sessionId,status:'unavailable',reason:'summary-response-budget-exceeded'})
      const remaining=request.sessions.slice(rows.length+1).map(row=>fallback(row.sessionId))
      // Reserve room for an explicit result for every selected ID, including worst-case IDs.
      if(Buffer.byteLength(JSON.stringify({rows:[...rows,result,...remaining]}))>SUMMARY_RESPONSE_LIMIT)result=fallback(selected.sessionId)
      rows.push(result)
    }
    signal.throwIfAborted()
    return freeze({rows})
  }
  /** Model recovery is deliberately separate from snapshot(): no historical projection/capture. */
  const modelIdentity = async(caller:HostCaller,sessionId:string,signal:AbortSignal):Promise<{identity:ModelIdentity;view:SessionControlsView}>=>{
    const view=await identity(caller,sessionId,signal,false)
    return {view,identity:{instance:view.instance,caller,sessionId,scope:await scope(caller.principalId,sessionId,view,signal)}}
  }
  const validateModelIdentity=async(caller:HostCaller,sessionId:string,expected:ModelIdentity,signal:AbortSignal):Promise<void>=>{
    const current=(await modelIdentity(caller,sessionId,signal)).identity
    if(canonical(current)!==canonical(expected))throw new ControlsError('revision-conflict','model identity or authorization changed')
  }
  const recordSources=(records:InstrumentCurrentSnapshot,ownerDecisionPolicy:OwnerDecisionPolicyPublic):ModelRow[]=>[
    ...records.workflows.map(row=>({...modelSource('records',['workflow',row.workflowId],row.revision,row),recordId:row.workflowId,workflowId:row.workflowId,durable:true,preview:{workflowId:row.workflowId,revision:row.revision,title:row.value.title}})),
    ...records.taskReferences.map(row=>({...modelSource('records',['task-reference',row.workflowId,row.localTicketId],row.revision,row),recordId:JSON.stringify([row.workflowId,row.localTicketId]),workflowId:row.workflowId,durable:true,preview:{kind:'task-reference',workflowId:row.workflowId,localTicketId:row.localTicketId,revision:row.revision,label:row.value.label,source:row.value.source,locator:row.value.locator,sourceObservation:'authored-unverified'}})),
    ...records.tickets.map(row=>({...modelSource('records',['ticket',row.workflowId,row.localTicketId],row.revision,row),recordId:JSON.stringify([row.workflowId,row.localTicketId]),workflowId:row.workflowId,durable:true,preview:{workflowId:row.workflowId,localTicketId:row.localTicketId,revision:row.revision,title:row.value.title,statuses:row.value.statuses}})),
    ...records.decisions.map(row=>({...modelSource('records',['decision',row.workflowId,row.decisionId],sourceVersion([row.revision,records.viewerRevision,ownerDecisionPolicy]),row),recordId:JSON.stringify([row.workflowId,row.decisionId]),workflowId:row.workflowId,durable:true,preview:{workflowId:row.workflowId,decisionId:row.decisionId,revision:row.revision,question:row.value.question,status:row.value.status,pending:row.value.pending,awaitingImplementation:row.value.awaitingImplementation,view:row.view,recommendationSupport:row.recommendationSupport,policyBinding:row.policyBinding,policySelection:row.policySelection}})),
    ...records.summary.statusCounts.map(value=>({...modelSource('records',['status-count',value.workflowId,value.axisKey],records.revision,value),recordId:JSON.stringify([value.workflowId,value.axisKey]),workflowId:value.workflowId,durable:true,preview:{...value}})),
  ]
  const bindingSource=(row:WorktreeBindingCurrentRow):ModelRow=>{
    const last=row.latest
    const value={bindingId:row.bindingId,revision:row.revision,value:row.value,source:last.source,author:last.author,recordedAt:last.recordedAt}
    return {...modelSource('worktree-binding',[row.bindingId],row.revision,value),recordId:row.bindingId,durable:true,preview:{bindingId:row.bindingId,operationId:row.value.operationId,parentSessionId:row.value.parentSessionId,plannedChildSessionId:row.value.plannedChildSessionId,revision:row.revision,source:last.source,businessState:row.value.business.state,acceptance:row.value.acceptance,outcome:row.value.outcome,actualChildSessionId:row.value.actualChildSessionId,requestedCwd:row.value.requestedCwd,actualCwd:row.value.actualCwd,cleanupDue:row.value.business.state!=='cleaned'&&row.value.actualChildSessionId!==null&&ports.liveAgent(row.value.actualChildSessionId)===undefined}}
  }
  const observationSource=(row:WorktreeObservationCurrentRow):ModelRow=>{
    const last=row.latest,observed=row.creation
    const value={observationId:row.observationId,revision:row.revision,value:row.value,source:observed.source,author:observed.author,recordedAt:observed.recordedAt,provenance:{source:last.source,author:last.author,recordedAt:last.recordedAt}}
    return {...modelSource('observation',[row.observationId],row.revision,value),recordId:row.observationId,durable:true,preview:{observationId:row.observationId,revision:row.revision,source:observed.source,creatorSessionId:row.value.creatorSessionId,path:row.value.path,branch:row.value.branch,businessState:row.value.business.state,businessSource:'authored',checkState:row.value.check.state}}
  }
  const modelCurrent=async(caller:HostCaller,sessionId:string,signal:AbortSignal):Promise<ModelCurrent>=>modelReadOrder(async()=>{
    const {identity:who,view}=await modelIdentity(caller,sessionId,signal)
    const ownerDecisionPolicy=await readOwnerPolicy(view,signal)
    const collections:Record<string,ModelCollection>={}
    const health:{scope:string;status:string;reason:string|null}[]=[]
    const add=(kind:string,rows:readonly ModelRow[],version:unknown,coverage:ModelCollection['coverage']='current',reason?:string)=>{
      collections[kind]={rows,version:sourceVersion(version),coverage,...(reason===undefined?{}:{reason})}
    }
    let records:InstrumentCurrentSnapshot|null=null,windowView:RuntimeSnapshot['windows']=null
    try{records=await instruments.readCurrent(caller.principalId,sessionId,signal)}catch(error){signal.throwIfAborted();health.push({scope:'records',status:'unknown',reason:String(error)})}
    const rows=records===null?[]:recordSources(records,ownerDecisionPolicy)
    for(const kind of ['workflow','ticket','task-reference','decision'])add(kind,rows.filter(row=>kind==='workflow'?row.preview.axisKey===undefined&&!(row.preview.localTicketId||row.preview.decisionId):kind==='task-reference'?row.preview.kind==='task-reference':kind==='ticket'?row.preview.localTicketId!==undefined&&row.preview.kind!=='task-reference':row.preview.decisionId!==undefined),records===null?null:[records.revision,records.viewerRevision,...(kind==='decision'?[ownerDecisionPolicy]:[])],records===null?'unknown':'current')
    add('status-count',rows.filter(row=>row.preview.axisKey!==undefined),records?.revision??null,records===null?'unknown':'current')
    try{windowView=await windows.read(caller.principalId,sessionId,signal)}catch(error){signal.throwIfAborted();health.push({scope:'windows',status:'unknown',reason:String(error)})}
    add('window-ticket',windowView?.tickets.map(row=>({...modelSource('windows',['ticket',row.workflowId,row.localTicketId],windowView!.revision,row),recordId:JSON.stringify([row.workflowId,row.localTicketId]),workflowId:row.workflowId,durable:true,preview:{...row}}))??[],windowView?.revision??null,windowView===null?'unknown':'current')
    add('window-execution',windowView?.executions.map(row=>({...modelSource('windows',['execution',row.executionId],windowView!.revision,row),recordId:row.executionId,durable:true,preview:{...row}}))??[],windowView?.revision??null,windowView===null?'unknown':'current')
    const runtime=await load();signal.throwIfAborted()
    const coordinator=who.scope.kind==='coordinator'
    for(const kind of ['worktree-binding','worktree-observation','resource','native-execution'])if(!coordinator){add(kind,[],null,'restricted');health.push({scope:kind,status:'restricted',reason:'coordinator registry is not assigned-child task data'})}
    let bindingRows:readonly WorktreeBindingCurrentRow[]=[],observationRows:readonly WorktreeObservationCurrentRow[]=[]
    if(coordinator){
      // Live cleanup observations fence page cuts, never the durable binding body's version.
      try{signal.throwIfAborted();const registryModule=await openWorktrees(view);signal.throwIfAborted();const registry=await registryModule.readCurrent(view.instance);signal.throwIfAborted();bindingRows=registry.rows;const projected=bindingRows.map(bindingSource);add('worktree-binding',projected,[registry.revision,projected.map(row=>[row.key,row.preview.cleanupDue])])}catch(error){signal.throwIfAborted();add('worktree-binding',[],null,'unknown',String(error))}
      try{signal.throwIfAborted();const registryModule=await openObservations(view);signal.throwIfAborted();const registry=await registryModule.readCurrent(view.instance);signal.throwIfAborted();observationRows=registry.rows;add('worktree-observation',observationRows.map(row=>{
        const source=observationSource(row),agent=ports.liveAgent(row.value.creatorSessionId),assignment=runtime.assignments.find(item=>item.sessionId===row.value.creatorSessionId&&item.instrumentInstanceId===view.instance.instrumentInstanceId),binding=bindingRows.find(item=>item.value.plannedChildSessionId===row.value.creatorSessionId||item.value.actualChildSessionId===row.value.creatorSessionId)
        return {...source,preview:{...source.preview,creatorActivity:agent===undefined?'gone':(agent as unknown as {status?:string}).status==='running'?'running':'idle',lane:assignment===undefined&&binding===undefined?null:{workflowId:assignment?.workflowId??null,ticketIds:assignment?.ticketIds??binding?.value.ticketIds??[],task:binding?.value.task??null,source:'inferred'},nativeChildren:nativeChildrenForObservation(row.value.creatorSessionId,runtime.nativeExecutions.filter(row=>row.instrumentInstanceId===view.instance.instrumentInstanceId))}}
      }),[registry.revision,runtime.revision,bindingRows.map(row=>[row.bindingId,row.revision]),observationRows.map(row=>[row.value.creatorSessionId,(ports.liveAgent(row.value.creatorSessionId) as unknown as {status?:string}|undefined)?.status??'gone'])])}catch(error){signal.throwIfAborted();add('worktree-observation',[],null,'unknown',String(error))}
      try{const raw=await ports.resourceStorage.read(),data=raw===undefined?null:memoized(raw,parseResourceDocument);add('resource',data?.resources.filter(row=>row.ownerInstanceId===view.instance.instrumentInstanceId).map(row=>({...modelSource('resource',[row.resourceId],data.revision,row),recordId:row.resourceId,durable:true,preview:{resourceId:row.resourceId,status:row.status,identity:row.identity,business:row.business,ledgerRevision:data.revision,physicalCoverage:'not-checked-current-overview'}}))??[],data?.revision??0)}catch(error){signal.throwIfAborted();add('resource',[],null,'unknown',String(error))}
      // The durable collection already has one current fact per child; the injection/UI cap is not a model query limit.
      const facts=runtime.nativeExecutions.filter(row=>row.instrumentInstanceId===view.instance.instrumentInstanceId)
      const nativeRows=facts.map(fact=>{const assignment=runtime.assignments.find(row=>row.sessionId===fact.sessionId),binding=bindingRows.find(row=>row.value.plannedChildSessionId===fact.sessionId||row.value.actualChildSessionId===fact.sessionId),value=projectNativeExecution(fact,assignment,binding?.value,ports.liveAgent(fact.sessionId) as unknown as {readonly status?:string}|undefined);return {...modelSource('native-execution',[fact.sessionId],sourceVersion([runtime.revision,binding?.revision??null,value.activity,fact.recordedAt]),value),recordId:fact.sessionId,durable:false,preview:{...value}}})
      add('native-execution',nativeRows,nativeRows.map(row=>[row.key,row.sourceVersion]))
    }
    const releases=records===null||windowView===null?[]:pendingReleaseFor(records as unknown as NonNullable<RuntimeSnapshot['records']>,windowView)
    add('pending-release',releases.map(row=>({...modelSource('pending-release',[row.workflowId,row.localTicketId],sourceVersion([records?.revision,windowView?.revision]),row),recordId:JSON.stringify([row.workflowId,row.localTicketId]),workflowId:row.workflowId,durable:false,preview:{...row}})),[records?.revision,windowView?.revision],records===null||windowView===null?'unknown':'current')
    const stops=windowView===null||!coordinator?[]:(ports.nativeSubagentStops?.(view.instance.ownerSessionId)??[]).map(stop=>{
      const managed=managedExecutions.get(stop.sessionId),binding=runtime.bindings.find(row=>row.sessionId===stop.sessionId&&!row.released),lease=binding===undefined?undefined:windowView!.executions.find(row=>row.executionId===binding.executionId&&row.instrumentInstanceId===binding.instrumentInstanceId&&row.generation===binding.generation)
      return {...stop,lane:managed!==undefined?{workflowId:managed.workflowId,localTicketId:managed.ticketIds.length===1?managed.ticketIds[0]!:null}:lease===undefined?null:{workflowId:lease.workflowId,localTicketId:lease.localTicketId},createdWorktrees:observationRows.filter(row=>row.value.creatorSessionId===stop.sessionId).map(row=>({path:row.value.path,branch:row.value.branch,businessState:row.value.business.state}))}
    })
    add('native-stop',stops.map((row,index)=>({...modelSource('native-stop',[row.sessionId,index],sourceVersion(row),row),recordId:row.sessionId,durable:false,preview:{...row}})),stops,windowView===null?'unknown':'current')
    const notificationRows=runtime.notifications.filter(row=>row.instrumentInstanceId===view.instance.instrumentInstanceId),pending=notificationRows.filter(row=>row.state==='pending').length,accepted=notificationRows.filter(row=>row.state==='accepted').length
    health.push({scope:'notifications',status:pending>0?'pending':accepted>0?'accepted':'current',reason:pending>0||accepted>0?'pending='+pending+', accepted-not-consumed='+accepted:null})
    for(const [kind,collection]of Object.entries(collections))if(collection.coverage==='unknown')health.push({scope:kind,status:'unknown',reason:collection.reason??'source-unavailable'})
    for(const stop of stops)health.push({scope:'native-subagent-outcome',status:'unsupported',reason:nativeOutcomeText(stop)})
    if(windowView)health.push({scope:'native-count',status:windowView.S.countKnown?'current':'unknown',reason:windowView.S.countReason},{scope:'execution-admission',status:windowView.S.countKnown?'current':'unsupported',reason:windowView.S.countReason})
    const failure=historyFailures.get(view.instance.instrumentInstanceId);if(failure)health.push({scope:'history',status:'unknown',reason:failure})
    for(const [session,row]of nativeExecutionFailures)if(row.owner===view.instance.instrumentInstanceId||row.owner===null&&cachedSessions.get(session)?.instance.instrumentInstanceId===view.instance.instrumentInstanceId)health.push({scope:'native-executions',status:'unknown',reason:row.reason})
    const observationFailure=observationFailures.get(view.instance.instrumentInstanceId);if(observationFailure)health.push({scope:'worktree-observations',status:'unknown',reason:observationFailure})
    const capabilities=Object.entries(ports.capabilities).map(([key,status])=>({key,status,reason:status==='unsupported'?key+'-host-seam-unavailable':null}))
    add('capability',capabilities.map(row=>({...modelSource('capability',[row.key],sourceVersion(row),row),recordId:row.key,durable:false,preview:row})),capabilities)
    add('health',health.map((row,index)=>({...modelSource('health',[row.scope,index],sourceVersion(row),row),recordId:String(index),durable:false,preview:row})),health)
    signal.throwIfAborted()
    assertProjectionScope({records,windows:windowView},who.scope)
    await validateModelIdentity(caller,sessionId,who,signal)
    if(sourceVersion(ownerDecisionPolicy)!==sourceVersion(await readOwnerPolicy((await modelIdentity(caller,sessionId,signal)).view,signal)))throw new ControlsError('revision-conflict','owner policy source changed during model projection')
    return {...who,ownerDecisionPolicy,policy:view.policy,revisions:{configuration:view.policy.configurationRevision,records:records?.revision??null,business:records?.businessRevision??null,viewer:records?.viewerRevision??null,windows:windowView?.revision??null},records:records===null?null:{capabilities:records.capabilities,localCoverage:'local-current',sourceObservation:'authored-unverified',revision:records.revision,businessRevision:records.businessRevision,viewerRevision:records.viewerRevision,summary:{...records.summary,statusCounts:undefined}},windows:windowView===null?null:{revision:windowView.revision,configurationRevision:windowView.configurationRevision,status:windowView.status,reason:windowView.reason,runtimeKnowledge:windowView.runtimeKnowledge,T:windowView.T,S:windowView.S},nativeCount:windowView?.nativeBaseline??null,collections}
  }).catch(error=>{signal.throwIfAborted();throw error})
  const modelReadSource=async(caller:HostCaller,sessionId:string,selector:{domain:string;key:string},signal:AbortSignal)=>modelReadOrder(async()=>{
    const {identity:who,view}=await modelIdentity(caller,sessionId,signal),domain=selector.domain,key=selector.key
    let source:ModelSource|null=null,ownerPolicyToken:string|null=null
    if(domain==='records'){
      const ownerDecisionPolicy=await readOwnerPolicy(view,signal);ownerPolicyToken=sourceVersion(ownerDecisionPolicy)
      const current=await instruments.readCurrent(caller.principalId,sessionId,signal)
      assertProjectionScope({records:current,windows:null},who.scope)
      source=recordSources(current,ownerDecisionPolicy).find(row=>row.key===key)??null
    }
    else if(domain==='policy'&&key===sourceKey(domain,'effective',view.instance.controlWorkspaceId))source=modelSource(domain,['effective',view.instance.controlWorkspaceId],view.policy.configurationRevision,view.policy)
    else if(domain==='policy'){
      await ports.authority.authorizePolicy(caller.principalId,'read')
      const policy=await controls.readPolicy(caller.principalId)
      if(key===sourceKey(domain,'defaults'))source=modelSource(domain,['defaults'],policy.revision,policy.defaults)
      else for(const [workspace,value]of Object.entries(policy.workspaceOverrides))if(key===sourceKey(domain,'workspace',workspace)){source=modelSource(domain,['workspace',workspace],policy.revision,value);break}
    }else if(domain==='windows'){
      const current=await windows.read(caller.principalId,sessionId,signal)
      assertProjectionScope({records:null,windows:current},who.scope)
      source=[...current.tickets.map(row=>modelSource(domain,['ticket',row.workflowId,row.localTicketId],current.revision,row)),...current.executions.map(row=>modelSource(domain,['execution',row.executionId],current.revision,row))].find(row=>row.key===key)??null
    }else if(domain==='assignment'){
      const runtime=await load()
      for(const row of runtime.assignments){if(row.instrumentInstanceId!==who.instance.instrumentInstanceId||sourceKey(domain,row.sessionId)!==key)continue
        const allowed=row.sessionId===sessionId||row.parentSessionId===sessionId
        if(!allowed)denied('assignment detail requires self or authenticated direct parent')
        const permission=await effectiveScope(runtime,row.sessionId,view,signal)
        const effective=permission.kind==='coordinator'?row:{...row,workflowId:permission.workflowId,ticketIds:permission.ticketIds}
        if(who.scope.kind==='assigned'&&(effective.workflowId!==null&&effective.workflowId!==who.scope.workflowId||effective.ticketIds.some(ticket=>who.scope.kind==='assigned'&&!who.scope.ticketIds.includes(ticket))))throw new ControlsError('revision-conflict','assignment body exceeds model authorization cut')
        source=modelSource(domain,[row.sessionId],sourceVersion(effective),effective);break
      }
    }else if(['worktree-binding','observation','resource','history'].includes(domain)){
      if(who.scope.kind!=='coordinator')denied('source requires actual owner coordinator')
      if(domain==='worktree-binding')source=(await(await openWorktrees(view)).readCurrent(view.instance)).rows.map(bindingSource).find(row=>row.key===key)??null
      else if(domain==='observation')source=(await(await openObservations(view)).readCurrent(view.instance)).rows.map(observationSource).find(row=>row.key===key)??null
      else if(domain==='resource'){
        const raw=await ports.resourceStorage.read(),data=raw===undefined?null:memoized(raw,parseResourceDocument),row=data?.resources.find(row=>row.ownerInstanceId===who.instance.instrumentInstanceId&&sourceKey(domain,row.resourceId)===key)
        if(row)source=modelSource(domain,[row.resourceId],data!.revision,row)
      }else{
        // Pure retained history read. Never call historyAction/captureBusiness/captureOthers here.
        const history=await historyFor(view),store=await historyStores.get(view.instance.instrumentInstanceId)!,raw=await store.read()
        if(raw!==undefined){const data=memoized(raw,parseHistoryDocument),row=data.rows.find(row=>sourceKey(domain,row.historyId)===key);if(row&&!row.purged)source=modelSource(domain,[row.historyId],row.version,row)}
        void history
      }
    }else throw new ControlsError('invalid-input','unsupported detail source domain')
    await validateModelIdentity(caller,sessionId,who,signal)
    if(ownerPolicyToken!==null&&ownerPolicyToken!==sourceVersion(await readOwnerPolicy((await modelIdentity(caller,sessionId,signal)).view,signal)))throw new ControlsError('revision-conflict','owner policy source changed during model content selection')
    signal.throwIfAborted();return {identity:who,source}
  }).catch(error=>{signal.throwIfAborted();throw error})
  /** Every body must belong to the same authorization cut as its cache/publication key. */
  const assertProjectionScope=(value:Pick<ConsumptionSnapshot,'records'|'windows'> & {readonly assignment?:RuntimeSnapshot['assignment']},permission:InstrumentScope):void=>{
    const token=sourceVersion(permission)
    if(value.records!==null&&sourceVersion(value.records.scope)!==token||value.windows!==null&&sourceVersion(value.windows.scope)!==token||permission.kind==='assigned'&&value.assignment!==undefined&&sourceVersion({kind:'assigned',...value.assignment})!==token)throw new ControlsError('revision-conflict','snapshot authorization cut changed')
  }
  const validateProjection=async(caller:HostCaller,value:RuntimeReadSnapshot,permission:InstrumentScope,signal:AbortSignal):Promise<void>=>{
    const current=(await modelIdentity(caller,value.sessionId,signal)).identity
    if(canonical(current.instance)!==canonical(value.instance)||sourceVersion(current.scope)!==sourceVersion(permission))throw new ControlsError('revision-conflict','snapshot identity or authorization changed')
    if(sourceVersion(value.ownerDecisionPolicy)!==sourceVersion(await readOwnerPolicy((await modelIdentity(caller,value.sessionId,signal)).view,signal)))throw new ControlsError('revision-conflict','owner policy source or expiry bucket changed during projection')
    assertProjectionScope(value,permission)
  }
  function snapshot(caller:HostCaller,sessionId:string,signal:AbortSignal,currentOnly?:false):Promise<RuntimeSnapshot>
  function snapshot(caller:HostCaller,sessionId:string,signal:AbortSignal,currentOnly:true):Promise<CurrentRuntimeSnapshot>
  function snapshot(caller:HostCaller,sessionId:string,signal:AbortSignal,currentOnly=false):Promise<RuntimeReadSnapshot>{return queue.run(async()=>{
    // Native count establishment/background reconciliation may change its generation mid-read.
    // Rebuild once under this same FIFO permit; never stamp B onto the discarded A body.
    for(let attempt=0;attempt<2;attempt++){
    const view=await identity(caller,sessionId,signal,false)
    const permission=await scope(caller.principalId,sessionId,view,signal)
    const projectionBase=caller.principalId+'|'+sessionId+'|'+(currentOnly?'current':'full')
    const ownerDecisionPolicy=await readOwnerPolicy(view,signal)
    const liveCut=captureLiveCut(view.instance.ownerSessionId)
    const projectionKey=sourceVersion(ownerDecisionPolicy)+'|'+projectionBase+'|'+view.documentRevision+'|'+savedPolicy.revision+'|'+sourceVersion(permission)
    const epoch=project.epoch(view.instance.instrumentInstanceId)
    const projection=projectionCache.get(projectionBase)
    if(projection!==undefined&&liveCut.reusable&&!historyFailures.has(view.instance.instrumentInstanceId)&&projection.key===projectionKey&&projection.liveToken===liveCut.token(projection.dependencies)&&!project.shouldRefresh(projectionBase,view.instance.instrumentInstanceId)){
      await validateProjection(caller,projection.value,permission,signal)
      if(liveCut.token(projection.dependencies)!==captureLiveCut(view.instance.ownerSessionId).token(projection.dependencies)){if(attempt===0)continue;throw new ControlsError('revision-conflict','live projection sources changed during validation')}
      return projection.value
    }
    const health: {scope:string;status:string;reason:string|null}[]=[]
    const runtimeDocument=await load()
    signal.throwIfAborted()
    let records:ConsumptionSnapshot['records']=null,windowView:RuntimeSnapshot['windows']=null,resources:RuntimeSnapshot['resources']=[]
    try{records=currentOnly?await instruments.readCurrent(caller.principalId,sessionId,signal):await instruments.read(caller.principalId,sessionId,{},signal)}catch(error){signal.throwIfAborted();health.push({scope:'records',status:'unknown',reason:String(error)})}
    try{windowView=await windows.read(caller.principalId,sessionId,signal)}catch(error){signal.throwIfAborted();health.push({scope:'windows',status:'unknown',reason:String(error)})}
    try{if(permission.kind==='coordinator')resources=await resourceModule(caller,view,signal).resources.list(caller.principalId,signal);else health.push({scope:'resources',status:'restricted',reason:'coordinator registry is not assigned-child task data'})}catch(error){signal.throwIfAborted();health.push({scope:'resources',status:'unknown',reason:String(error)})}
    let worktreeBindings:NonNullable<RuntimeSnapshot['worktreeBindings']>=[]
    let bindingRows:readonly WorktreeBindingRow[]=[]
    try{signal.throwIfAborted();if(permission.kind==='coordinator'){const registryModule=await openWorktrees(view);signal.throwIfAborted();const registry=await registryModule.query(view.instance);signal.throwIfAborted();bindingRows=registry.rows;worktreeBindings=registry.current.map(row=>({...row,cleanupDue:row.value.business.state!=='cleaned'&&row.value.actualChildSessionId!==null&&ports.liveAgent(row.value.actualChildSessionId)===undefined}))}else health.push({scope:'worktree-bindings',status:'restricted',reason:'coordinator registry is not assigned-child task data'})}catch(error){signal.throwIfAborted();health.push({scope:'worktree-bindings',status:'unknown',reason:String(error)})}
    // Observed native creations are durable facts plus read-time live facts (creator activity and
    // ticket lane). The plugin never decides whether a tree is still wanted and never records who
    // "uses" it: directory use is not observable in DSH.
    let worktreeObservations:NonNullable<RuntimeSnapshot['worktreeObservations']>=[]
    let observationRows:readonly WorktreeObservationRow[]=[]
    try{
      if(permission.kind==='coordinator'){
        // Replay scans every live descendant's own session facts; it is enrichment, not part of
        // this read. Run it once per instance off the read path, and invalidate the projection
        // only when it recovers facts so completed or empty replay cannot dirty a hot read.
        void replayWorktreeObservations(view).catch(()=>undefined)
        signal.throwIfAborted()
        const registryModule=await openObservations(view);signal.throwIfAborted()
        const registry=await registryModule.query(view.instance);signal.throwIfAborted()
        const assignments=runtimeDocument.assignments
        observationRows=registry.rows
        // Child facts belong to this owner instance only; nativeChildren is a read-time observed
        // association, never a strong binding and never a directory-usage claim.
        const ownerFacts=runtimeDocument.nativeExecutions.filter(row=>row.instrumentInstanceId===view.instance.instrumentInstanceId)
        worktreeObservations=registry.current.map(row=>{
          const agent=ports.liveAgent(row.value.creatorSessionId)
          const assignment=assignments.find(item=>item.sessionId===row.value.creatorSessionId)
          const binding=bindingRows.find(item=>item.value.plannedChildSessionId===row.value.creatorSessionId||item.value.actualChildSessionId===row.value.creatorSessionId)
          const lane=assignment===undefined&&binding===undefined?null:{workflowId:assignment?.workflowId??null,ticketIds:assignment?.ticketIds??binding?.value.ticketIds??[],task:binding?.value.task??null,source:'inferred' as const}
          return {...row,creatorActivity:agent===undefined?'gone':(agent as unknown as {status?:string}).status==='running'?'running':'idle',lane,
            nativeChildren:nativeChildrenForObservation(row.value.creatorSessionId,ownerFacts)}
        })
        // Only sessions that actually recorded a failure are visited: the previous scan built an
        // array over every cached Session on each rebuild even when there was nothing to report.
        const failure=observationFailures.get(view.instance.instrumentInstanceId)
          ??[...failedObservationSessions].map(sessionId=>[sessionId,observationFailures.get('session:'+sessionId)] as const).find(([sessionId])=>cachedSessions.get(sessionId)?.instance.instrumentInstanceId===view.instance.instrumentInstanceId)?.[1]
          ??observationFailures.get('session:'+view.association.sessionId)
        if(failure!==undefined)health.push({scope:'worktree-observations',status:'unknown',reason:failure})
      }else health.push({scope:'worktree-observations',status:'restricted',reason:'coordinator registry is not assigned-child task data'})
    }catch(error){signal.throwIfAborted();health.push({scope:'worktree-observations',status:'unknown',reason:String(error)})}
    // Native execution facts are owner-coordinator data. An assigned child gets one restricted
    // health row, never sibling facts; a recorded write failure is surfaced, never hidden.
    let nativeExecutions:NonNullable<RuntimeSnapshot['nativeExecutions']>=[]
    if(permission.kind==='coordinator'){
      const ownerFacts=runtimeDocument.nativeExecutions.filter(row=>row.instrumentInstanceId===view.instance.instrumentInstanceId)
      nativeExecutions=latestNativeExecutions(ownerFacts).map(fact=>{
        const assignment=runtimeDocument.assignments.find(row=>row.sessionId===fact.sessionId)
        const binding=bindingRows.find(row=>row.value.plannedChildSessionId===fact.sessionId||row.value.actualChildSessionId===fact.sessionId)
        return projectNativeExecution(fact,assignment,binding?.value,ports.liveAgent(fact.sessionId) as unknown as {readonly status?:string}|undefined)
      })
      const failure=[...nativeExecutionFailures].find(([sessionId,row])=>row.owner===view.instance.instrumentInstanceId
        ||row.owner===null&&cachedSessions.get(sessionId)?.instance.instrumentInstanceId===view.instance.instrumentInstanceId)
      if(failure!==undefined)health.push({scope:'native-executions',status:'unknown',reason:failure[1].reason})
    }else health.push({scope:'native-executions',status:'restricted',reason:'coordinator registry is not assigned-child task data'})
    const observedByCreator=new Map<string,{readonly path:string;readonly branch:string;readonly businessState:'open'|'cleaned'}[]>()
    for(const row of observationRows){const list=observedByCreator.get(row.value.creatorSessionId)??[];list.push({path:row.value.path,branch:row.value.branch,businessState:row.value.business.state});observedByCreator.set(row.value.creatorSessionId,list)}
    try{const notifications=runtimeDocument.notifications.filter(n=>n.instrumentInstanceId===view.instance.instrumentInstanceId);const pending=notifications.filter(n=>n.state==='pending').length,accepted=notifications.filter(n=>n.state==='accepted').length
      health.push({scope:'notifications',status:pending>0?'pending':accepted>0?'accepted':'current',reason:pending>0||accepted>0?'pending='+pending+', accepted-not-consumed='+accepted:null})
    }catch(error){signal.throwIfAborted();health.push({scope:'notifications',status:'unknown',reason:String(error).slice(0,1024)})}
    signal.throwIfAborted()
    // Once capture has accepted a persistent write, let that obligation settle.
    await captureSafely(view,async()=>{
      if(records!==null){
        // Only a new source/scope version or failed prior capture pays for retained histories.
        // The current path still performs every native/resource observation above.
        if('changes' in records)await captureBusiness(view,records,signal)
        else if(marksFor(view.instance.instrumentInstanceId).business.get(view.association.sessionId)!==businessCaptureVersion(records)){
          signal.throwIfAborted()
          const retained=await instruments.read(caller.principalId,sessionId,{},signal)
          signal.throwIfAborted();await captureBusiness(view,retained,signal)
        }
      }
      signal.throwIfAborted()
      await captureOthers(view,caller,signal)
    },signal)
    signal.throwIfAborted()
    const historyFailure=historyFailures.get(view.instance.instrumentInstanceId);if(historyFailure)health.push({scope:'history',status:'unknown',reason:historyFailure})
    // Execution admission coverage is the native running-count knowledge, not ledger reconciliation.
    if(windowView)health.push(windowView.S.countKnown
      ?{scope:'execution-admission',status:'current',reason:null}
      :{scope:'execution-admission',status:'unsupported',reason:windowView.S.countReason??'native-subagent-activity-unavailable'})
    // Open terminal-outcome items are actionable and must reach the main agent; each row states
    // the published outcome (or that it is unobservable) and the lane names the last known managed
    // dispatch or persisted binding for that child when one exists.
    let nativeStops:NonNullable<RuntimeSnapshot['nativeStops']>=[]
    let nativeCount:RuntimeSnapshot['nativeCount']
    if(windowView!==null){
      const raw=permission.kind==='coordinator'?(ports.nativeSubagentStops?.(view.instance.ownerSessionId)??[]):[]
      if(raw.length>0){
        const doc=runtimeDocument
        nativeStops=raw.map(stop=>{
          const managed=managedExecutions.get(stop.sessionId)
          const binding=doc.bindings.find(row=>row.sessionId===stop.sessionId&&!row.released)
          const lease=binding===undefined?undefined:windowView.executions.find(row=>row.executionId===binding.executionId&&row.instrumentInstanceId===binding.instrumentInstanceId&&row.generation===binding.generation)
          const lane=managed!==undefined?{workflowId:managed.workflowId,localTicketId:managed.ticketIds.length===1?managed.ticketIds[0]!:null}
            :lease===undefined?null:{workflowId:lease.workflowId,localTicketId:lease.localTicketId}
          const created=observedByCreator.get(stop.sessionId)
          return {...stop,lane,...(created===undefined?{}:{createdWorktrees:created})}
        })
        for(const stop of nativeStops)health.push({scope:'native-subagent-outcome',status:'unsupported',reason:nativeOutcomeText(stop)})
      }
      nativeCount={reestablished:windowView.nativeBaseline.reestablished,runtimeId:windowView.nativeBaseline.runtimeId,previousRuntimeId:windowView.nativeBaseline.previousRuntimeId}
      health.push({scope:'native-count',status:'current',reason:nativeCount.reestablished?'re-established after runtime '+String(nativeCount.previousRuntimeId):null})
    }
    signal.throwIfAborted()
    const assignment=runtimeDocument.assignments.find(row=>row.sessionId===sessionId),assignmentScope=assignment===undefined?null:await effectiveScope(runtimeDocument,sessionId,view,signal)
    const grants=await ports.readPolicyGrants();signal.throwIfAborted()
    const managed=new Set([view.instance.ownerSessionId,...runtimeDocument.assignments.filter(row=>row.instrumentInstanceId===view.instance.instrumentInstanceId).map(row=>row.sessionId)])
    const value=freeze({sessionId,caller,delegateRegistered,ownerDecisionPolicy,policyGrants:{...grants,grants:grants.grants.filter(row=>permission.kind==='coordinator'?managed.has(row.sessionId):row.sessionId===sessionId)},instance:view.instance,policy:view.policy,...(assignment===undefined?{}:{assignment:assignmentScope?.kind==='assigned'?{workflowId:assignmentScope.workflowId,ticketIds:assignmentScope.ticketIds}:{workflowId:assignment.workflowId,ticketIds:assignment.ticketIds}}),records,windows:windowView,resources,worktreeBindings,worktreeObservations,pendingRelease:pendingReleaseFor(records,windowView),nativeStops,...(permission.kind==='coordinator'?{nativeExecutions}:{}),...(nativeCount===undefined?{}:{nativeCount}),
      capabilities:Object.entries(ports.capabilities).map(([key,status])=>({key,status,reason:status==='unsupported'?key+'-host-seam-unavailable':null})),health})
    await validateProjection(caller,value,permission,signal)
    const dependencies=[...new Set([
      ...bindingRows.flatMap(row=>[row.value.parentSessionId,row.value.plannedChildSessionId,...(row.value.actualChildSessionId===null?[]:[row.value.actualChildSessionId])]),
      ...observationRows.map(row=>row.value.creatorSessionId),
      ...runtimeDocument.nativeExecutions.filter(row=>row.instrumentInstanceId===view.instance.instrumentInstanceId).flatMap(row=>[row.sessionId,row.parentSessionId]),
    ])].sort()
    const liveToken=liveCut.token(dependencies)
    if(liveToken!==captureLiveCut(view.instance.ownerSessionId).token(dependencies)){if(attempt===0)continue;throw new ControlsError('revision-conflict','live projection sources changed during construction')}
    project.record(projectionBase,epoch,view.instance.instrumentInstanceId)
    projectionCache.delete(projectionBase);projectionCache.set(projectionBase,{key:projectionKey,liveToken,dependencies,value})
    while(projectionCache.size>64)projectionCache.delete(projectionCache.keys().next().value as string)
    return value
    }
    throw new ControlsError('revision-conflict','live projection sources did not stabilize')
  }).catch(error=>{signal.throwIfAborted();throw error})}
  const activeSnapshot=async(caller:HostCaller,signal:AbortSignal):Promise<ConsumptionSnapshot>=>{
    const current=await snapshot(caller,caller.sessionId!,signal,true),view=await identity(caller,caller.sessionId!,signal,false)
    const records=current.records
    if(!records||current.health.some(row=>row.scope==='history'&&row.status==='unknown'))return current
    try{
      const rows=await (await historyFor(view)).activeContext(),included=new Set(rows.map(row=>JSON.stringify([row.kind,row.recordId])))
      const decisions=records.decisions.filter(row=>row.value.pending===true||row.value.awaitingImplementation===true)
      // Context exclusions never swallow the identity of a held T or an active obligation.
      const required=new Set([...(current.windows?.tickets.filter(row=>row.held).map(row=>JSON.stringify([row.workflowId,row.localTicketId]))??[]),...decisions.flatMap(row=>(row.value.ticketIds??[]).map(ticket=>JSON.stringify([row.workflowId,ticket])))])
      const requiredFlows=new Set([...(current.windows?.tickets.filter(row=>row.held).map(row=>row.workflowId)??[]),...decisions.map(row=>row.workflowId)])
      const workflows=records.workflows.filter(row=>requiredFlows.has(row.workflowId)||included.has(JSON.stringify(['workflow',row.workflowId])))
      const tickets=records.tickets.filter(row=>required.has(JSON.stringify([row.workflowId,row.localTicketId]))||included.has(JSON.stringify(['ticket',JSON.stringify([row.workflowId,row.localTicketId])])) )
      const taskReferences=records.taskReferences.filter(row=>required.has(JSON.stringify([row.workflowId,row.localTicketId]))||included.has(JSON.stringify(['task-reference',JSON.stringify([row.workflowId,row.localTicketId])])) )
      const contextConclusions=records.decisions.filter(row=>row.value.pending!==true&&row.value.awaitingImplementation!==true&&(typeof row.value.result==='string'||row.policySelection!==undefined)&&included.has(JSON.stringify(['decision',JSON.stringify([row.workflowId,row.decisionId])]))).map(row=>({decisionId:row.decisionId,workflowId:row.workflowId,result:row.value.result??null,...(row.policySelection===undefined?{}:{policySelection:row.policySelection,references:row.provenance.references}),sourceRevision:row.revision,source:{kind:'authored',domain:'instruments',author:row.provenance.author,recordedAt:row.provenance.recordedAt}}))
      const statusCounts=records.summary.statusCounts.filter(row=>workflows.some(w=>w.workflowId===row.workflowId)).map(row=>{const active=tickets.filter(ticket=>ticket.workflowId===row.workflowId);return {...row,unreported:active.filter(ticket=>(ticket.value.statuses[row.axisKey]??[]).length===0).length,statuses:row.statuses.map(status=>({...status,count:active.filter(ticket=>ticket.value.statuses[row.axisKey]?.includes(status.statusKey)).length}))}})
      return {...current,records:{...records,workflows,tickets,taskReferences,decisions,summary:{...records.summary,totalTickets:tickets.length,totalTaskReferences:taskReferences.length,statusCounts}},contextConclusions}
    }catch(error){signal.throwIfAborted();return {...current,health:[...current.health,{scope:'active-context',status:'unknown',reason:String(error)}]}}
  }
  const consumption=new InstrumentConsumption({...(options.consumptionTimeoutMs===undefined?{}:{timeoutMs:options.consumptionTimeoutMs}),
    bindProgram:port=>{consumptionProgram=port},readSnapshot:async(caller,signal)=>{
      const actual=callerFor(caller.principalId,caller.sessionId,ports.operatorPrincipal),value=await activeSnapshot(actual,signal)
      const current=(await modelIdentity(actual,caller.sessionId,signal)).identity
      if(current.instance.instrumentInstanceId!==caller.instrumentInstanceId||current.instance.ownerSessionId!==caller.ownerSessionId||canonical(current.instance)!==canonical(value.instance)||caller.scopeFingerprint!==sourceVersion(current.scope))throw new ControlsError('revision-conflict','consumption authorization binding changed')
      if(caller.sourceToken!==sourceVersion(value.ownerDecisionPolicy))throw new ControlsError('revision-conflict','owner policy source changed before consumption')
      assertProjectionScope(value,current.scope)
      return value
    }})
  // Resource rejections in the tracked paths are raised before any write (unknown or foreign
  // resource, unsupported legacy action), so they settle like other pre-commit rejections.
  const preCommit=(error:unknown):boolean=>isPreCommitRejection(error)||error instanceof ResourceError||error instanceof LocalHandleReadUnavailable
  const track=<T>(instanceId:string,effect:()=>Promise<T>):Promise<T>=>{
    touchState(instanceId)
    // Also invalidate after settlement: an earlier read may still be resolving identity
    // when this effect is queued and must not stamp the pre-commit state as fresh.
    const commit=queue.run(async()=>{try{return await effect()}finally{touchState(instanceId)}})
    // The frontier guards reads against acknowledged-but-unpersisted writes. A command that
    // was rejected before its durable write claims nothing, so it must not degrade the next
    // snapshot to unknown durability. Real write outcomes stay unknown.
    consumptionProgram.trackCommit(instanceId,commit.then(()=>undefined,error=>{if(preCommit(error))return;throw error}))
    return commit
  }
  const consumptionIdentity=(caller:HostCaller,view:SessionControlsView,permission:InstrumentScope,ownerPolicy:OwnerDecisionPolicyPublic):ConsumptionIdentity=>Object.assign({principalId:caller.principalId,sessionId:view.association.sessionId,instrumentInstanceId:view.instance.instrumentInstanceId,ownerSessionId:view.instance.ownerSessionId},{scopeFingerprint:sourceVersion(permission),sourceToken:sourceVersion(ownerPolicy)})
  // Creation observation covers only the native create_worktree tool executed through this
  // pipeline (including PTC sub-dispatches). Failed calls write nothing; the tool result itself
  // is never replaced or delayed, and an unparsable value is reported as observation failure.
  const observationLifetime=new AbortController()
  const observationFailures=new Map<string,string>(),failedObservationSessions=new Set<string>()
  const observationReplays=new Set<string>()
  // Durable owner index for a session whose retained view is gone (for example after disposal).
  // It is not policy evidence; it only attributes a coverage gap to the right coordinator.
  const nativeExecutionOwners=new Map<string,string>()
  const markObservationFailure=(view:SessionControlsView,error:unknown):void=>{
    const key=view.instance.instrumentInstanceId,reason=String(error).slice(0,1024)
    if(observationFailures.get(key)!==reason){observationFailures.set(key,reason);touchState(view.instance.instrumentInstanceId)}
  }
  const programAuthor:InstrumentAuthor={kind:'user',principalId:ports.operatorPrincipal,sessionId:null}
  // C: native-observed execution facts live in the existing owner runtime document. They are
  // program facts, never strong bindings, and every observation failure stays isolated from the
  // native event, S, nativeStops and the owner-notification path.
  interface NativeExecutionFailure { readonly owner: string | null; readonly reason: string }
  const nativeExecutionFailures=new Map<string,NativeExecutionFailure>()
  /** Attribute a coverage gap to an already proved owner when the event itself lacks one;
   * an unknown owner stays unattributed rather than appearing on another owner's health row. */
  const markNativeExecutionFailure=(sessionId:string,error:unknown,ownerInstance?:string|null):void=>{
    const owner=ownerInstance===undefined?(cachedSessions.get(sessionId)?.instance.instrumentInstanceId??null):ownerInstance
    const reason=String(error).slice(0,1024)
    const prior=nativeExecutionFailures.get(sessionId)
    if(prior?.owner===owner&&prior.reason===reason)return
    nativeExecutionFailures.set(sessionId,{owner,reason})
    if(owner===null)touchState();else touchState(owner)
  }
  const clearNativeExecutionFailure=(sessionId:string):void=>{
    const prior=nativeExecutionFailures.get(sessionId)
    if(prior===undefined)return
    nativeExecutionFailures.delete(sessionId)
    if(prior.owner===null)touchState();else touchState(prior.owner)
  }
  /** First readable child header cwd. This is only the header source value: it does not
   * prove the child's actual initial/current directory or any tree use. */
  const nativeExecutionHeaderCwd=(agent:Agent):string|null=>{
    const cwd=agent.session.header.cwd
    return typeof cwd==='string'&&isAbsolute(cwd)&&normalize(cwd)===cwd&&!/[\u0000-\u001f\u007f]/u.test(cwd)?cwd:null
  }
  /** Resolve the owner instrument instance from this runtime's retained session associations,
   * then from the live parent chain, then from the durable association. A missing view is an
   * observation failure, never a native-event failure. */
  const nativeExecutionViewFor=async(agent:Agent):Promise<SessionControlsView|undefined>=>{
    const sessionId=String(agent.id),direct=cachedSessions.get(sessionId)
    if(direct!==undefined)return direct
    const visited=new Set<string>()
    let cursor=agent.session.header.parentSession
    while(cursor!==undefined&&!visited.has(cursor)&&visited.size<128){
      visited.add(cursor)
      const retained=cachedSessions.get(cursor)
      if(retained!==undefined)return retained
      cursor=ports.liveAgent(cursor)?.session.header.parentSession
    }
    try{return await controls.readSession(ports.operatorPrincipal,sessionId)}catch{return undefined}
  }
  interface NativeExecutionEdge { readonly createdAt?:number|null; readonly provider?:string|null; readonly runId?:string|null; readonly stopReason?:string }
  const nativeExecutionEvent=(agent:Agent,view:SessionControlsView,kind:'created'|'start'|'end'|'disposed',edge:NativeExecutionEdge={}):NativeExecutionEvent|null=>{
    const header=agent.session.header
    if(header.id!==agent.id||header.origin!=='subagent')return null
    const parent=header.parentSession
    if(typeof parent!=='string'||parent.length===0)return null
    const base={sessionId:String(agent.id),parentSessionId:parent,instrumentInstanceId:view.instance.instrumentInstanceId,headerCwd:nativeExecutionHeaderCwd(agent)}
    if(kind==='created')return {...base,kind,createdAt:typeof header.createdAt==='number'&&Number.isSafeInteger(header.createdAt)&&header.createdAt>=0?header.createdAt:null}
    if(kind==='start')return {...base,kind,provider:typeof edge.provider==='string'?edge.provider:null,runId:typeof edge.runId==='string'?edge.runId:null}
    if(kind==='end')return typeof edge.stopReason==='string'?{...base,kind,outcome:edge.stopReason,runId:typeof edge.runId==='string'?edge.runId:null}:null
    return {...base,kind}
  }
  const recordNativeExecution=async(view:SessionControlsView,event:NativeExecutionEvent):Promise<void>=>{
    // C writes follow the same optional-extension gate as worktree observations. Existing rows
    // remain readable; management-off adds or updates nothing and is not an observation failure.
    if(!view.policy.extensionEnabled)return
    nativeExecutionOwners.set(event.sessionId,view.instance.instrumentInstanceId)
    try{
      await update(old=>{
        const current=old.nativeExecutions.find(row=>row.executionId===event.sessionId)
        const next=applyNativeExecutionEvent(current,event,Date.now())
        if(next===null)return old
        return {...old,nativeExecutions:current===undefined?[...old.nativeExecutions,next]:old.nativeExecutions.map(row=>row.executionId===next.executionId?next:row)}
      })
      clearNativeExecutionFailure(event.sessionId)
    }catch(error){markNativeExecutionFailure(event.sessionId,error,view.instance.instrumentInstanceId)}
  }
  const nativeExecutionViewForInstance=(instanceId:string):SessionControlsView|undefined=>{
    for(const view of cachedSessions.values())if(view.instance.instrumentInstanceId===instanceId)return view
    return undefined
  }
  /**
   * A published `subagent/end` can arrive after its Agent was disposed, so the host event carries
   * no `actualAgent`. The durable owner row plus a retained SessionControlsView are enough to
   * record that same run; no row is created, no cold log is read and S/nativeStops/notifications
   * are untouched. Missing evidence or a run/owner conflict becomes an explicit native-executions
   * coverage gap for the row's owner, never a guessed outcome or another owner's health row.
   */
  const recordLateNativeExecutionEnd=async(event:Extract<HostEvent,{kind:'subagent-end'}>):Promise<void>=>{
    const sessionId=event.sessionId
    // Management off intentionally records nothing; it is not an observation failure.
    if(!savedPolicy.extensionEnabled)return
    const retained=cachedSessions.get(sessionId)
    if(retained!==undefined&&!retained.policy.extensionEnabled)return
    try{
      const document=await load()
      const row=document.nativeExecutions.find(execution=>execution.executionId===sessionId)
      if(row===undefined){
        markNativeExecutionFailure(sessionId,new ControlsError('association-conflict','native end has no durable execution row; outcome coverage is unknown'),retained?.instance.instrumentInstanceId??nativeExecutionOwners.get(sessionId)??null)
        return
      }
      if(retained!==undefined&&retained.instance.instrumentInstanceId!==row.instrumentInstanceId){
        markNativeExecutionFailure(sessionId,new ControlsError('association-conflict','native end row and retained session view disagree on the owner instrument instance'),row.instrumentInstanceId)
        return
      }
      const view=nativeExecutionViewForInstance(row.instrumentInstanceId)
      if(view===undefined){
        markNativeExecutionFailure(sessionId,new ControlsError('unknown-session','native end owner view is unavailable; outcome coverage is unknown'),row.instrumentInstanceId)
        return
      }
      // Management off intentionally records nothing and is not an observation failure.
      if(!view.policy.extensionEnabled)return
      await recordNativeExecution(view,{kind:'end',sessionId:row.sessionId,parentSessionId:row.parentSessionId,
        instrumentInstanceId:row.instrumentInstanceId,headerCwd:row.headerCwd,outcome:event.stopReason,runId:event.runId??null})
    }catch(error){markNativeExecutionFailure(sessionId,error,cachedSessions.get(sessionId)?.instance.instrumentInstanceId??nativeExecutionOwners.get(sessionId)??null)}
  }
  const recordNativeExecutionEdge=async(agent:Agent,kind:'created'|'start'|'end'|'disposed',edge:NativeExecutionEdge={}):Promise<void>=>{
    const sessionId=String(agent.id)
    try{
      const view=await nativeExecutionViewFor(agent)
      if(view===undefined){markNativeExecutionFailure(sessionId,new ControlsError('unknown-session','native execution owner association is unavailable'));return}
      const event=nativeExecutionEvent(agent,view,kind,edge)
      if(event!==null)await recordNativeExecution(view,event)
    }catch(error){markNativeExecutionFailure(sessionId,error)}
  }
  const creationFromValue=(value:unknown):{readonly path:string;readonly branch:string;readonly baseCommit:string;readonly repositoryRoot:string}|null=>{
    if(value===null||typeof value!=='object'||Array.isArray(value))return null
    const raw=value as Record<string,unknown>
    for(const key of ['path','branch','baseCommit','repositoryRoot'] as const)if(typeof raw[key]!=='string')return null
    return {path:raw.path as string,branch:raw.branch as string,baseCommit:raw.baseCommit as string,repositoryRoot:raw.repositoryRoot as string}
  }
  const stepPosition=(stepKey:string|undefined):{readonly turn:number|null;readonly step:number|null}=>{
    if(stepKey===undefined)return {turn:null,step:null}
    const parts=stepKey.split(':'),turn=Number(parts[0]),step=Number(parts[1])
    return {turn:Number.isSafeInteger(turn)?turn:null,step:Number.isSafeInteger(step)?step:null}
  }
  /** tracked=false is required on the snapshot read path: the queue must not re-enter itself. */
  const applyObservationCheck=async(view:SessionControlsView,input:WorktreeObservationCheckInput,tracked=true):Promise<void>=>{
    const registry=await openObservations(view)
    // Replay verification finishes outside the read queue, possibly after a hot snapshot was
    // cached. Its committed check is a mutation too; merely starting replay is not.
    if(!tracked){await registry.check(view.instance,programAuthor,input);touchState(view.instance.instrumentInstanceId);return}
    await track(view.instance.instrumentInstanceId,()=>registry.check(view.instance,programAuthor,input))
  }
  /** E2: prove the checkout with the authorized Git runner anchored at the owner session. A
   * creator child may already be disposed; the owner is the live anchor, and inspect carries no
   * workspace-write containment. Unknown stays unknown: no failure is reported as success. */
  const verifyWorktreeObservation=async(view:SessionControlsView,observationId:string,path:string,tracked=true):Promise<void>=>{
    if(observationLifetime.signal.aborted)return
    try{
      const probe=await probeWorktree(ports.gitRunnerForSession(view.instance.ownerSessionId,observationLifetime.signal),path)
      if(!probe.exists){await applyObservationCheck(view,{observationId,kind:'absent'},tracked);return}
      if(probe.repositoryPath===null||probe.gitCommonDir===null||probe.gitDir===null||probe.pathIdentity===null||probe.headOid===null)throw new ControlsError('invalid-state','probe returned an incomplete identity')
      await applyObservationCheck(view,{observationId,kind:'facts',facts:{repositoryPath:probe.repositoryPath,gitCommonDir:probe.gitCommonDir,gitDir:probe.gitDir,pathIdentity:probe.pathIdentity,branchRef:probe.branchRef,branchOid:probe.branchOid,headOid:probe.headOid}},tracked)
    }catch(error){
      if(observationLifetime.signal.aborted)return
      try{await applyObservationCheck(view,{observationId,kind:'failed',diagnostic:String(error).slice(0,1024)},tracked)}
      catch(writeError){if(!observationLifetime.signal.aborted)markObservationFailure(view,writeError)}
    }
  }
  /** E1: append the creation fact with the tool result, then verify asynchronously. The append is
   * awaited so the durable row exists before the result reaches the model; any failure is recorded
   * as an honest observation failure and never replaces or blocks the native tool result. */
  const recordWorktreeObservation=async(caller:HostCaller,exec:ToolExecution,result:Readonly<ToolExecutionResult>,stepKey?:string):Promise<void>=>{
    if(caller.sessionId===null||result.isError)return
    const creation=creationFromValue(result.value)
    if(creation===null)return
    const creator=caller.sessionId,position=stepPosition(stepKey)
    const input:WorktreeObservationInput={creatorSessionId:creator,callId:String(exec.callId),rootCallId:String(exec.rootCallId),turn:position.turn,step:position.step,...creation}
    try{
      const view=await identity(caller,creator)
      if(!view.policy.extensionEnabled)return
      const registry=await openObservations(view)
      const {recorded,row}=await track(view.instance.instrumentInstanceId,()=>registry.observe(view.instance,caller,input,'program'))
      if(recorded)void verifyWorktreeObservation(view,row.observationId,row.value.path)
    }catch(error){
      // A failed append must stay visible: attribute it to the creator's instrument instance when
      // one is already known, otherwise to the creator session so an owner read can report it.
      if(!observationLifetime.signal.aborted){
        const known=cachedSessions.get(creator)?.instance.instrumentInstanceId
        failedObservationSessions.add(creator)
        observationFailures.set(known===undefined?'session:'+creator:known,String(error).slice(0,1024))
      }
    }
  }
  /** E4: reconstruct missing rows from durable session events of live descendant sessions. The
   * rendered result payload is lower evidence than the tool value, so those versions say 'replay'. */
  const replayWorktreeObservations=async(view:SessionControlsView):Promise<void>=>{
    const key=view.instance.instrumentInstanceId
    if(observationReplays.has(key))return
    observationReplays.add(key)
    try{
      for(const agent of ports.liveAgents()){
        const creatorSessionId=String(agent.id)
        if(creatorSessionId===view.instance.ownerSessionId||agent.session.header.origin!=='subagent')continue
        const child=await controls.readSession(ports.operatorPrincipal,creatorSessionId).catch(()=>undefined)
        if(child===undefined||child.instance.instrumentInstanceId!==key)continue
        const facts=await ports.sessionFacts(creatorSessionId)
        for(const input of scanObservedCreations(facts.events,creatorSessionId)){
          const registry=await openObservations(view)
          // Replay starts from a snapshot that holds the effect queue. Write directly without
          // re-entering it, then invalidate only for a committed creation fact.
          const {recorded,row}=await registry.observe(view.instance,programAuthor,input,'replay')
          if(recorded){touchState(view.instance.instrumentInstanceId);void verifyWorktreeObservation(view,row.observationId,row.value.path,false)}
        }
      }
    }catch(error){
      if(!observationLifetime.signal.aborted)markObservationFailure(view,error)
    }
  }
  const directParentMessage=(exec:ToolExecution):boolean=>{
    if(exec.name!=='send_message'||!exec.agent)return false
    const args=exec.arguments
    if(!args||typeof args!=='object'||Array.isArray(args))return false
    const target=Object.getOwnPropertyDescriptor(args,'agent_id')
    return !!target&&Object.hasOwn(target,'value')&&typeof target.value==='string'&&exec.agent.session.header.origin==='subagent'&&exec.agent.session.header.parentSession===target.value
  }
  // Advisory instruments never install native admission guards. Native permissions still apply.
  const guard=()=>{}
  const notificationFlights=new Map<string,Promise<void>>()
  const notificationAttempts=new Set<string>(),earlyNotificationCommits=new Map<string,string>()
  const flushNotifications=(ownerSessionId:string,retryAccepted=false):Promise<void>=>{
    const existing=notificationFlights.get(ownerSessionId);if(existing)return existing
    const flight=(async()=>{
      await ports.notificationObserverReady
      if(closing||notificationLifetime.signal.aborted)return
      const attempted=new Set<string>()
      while(!closing){
      const rows=(await queue.run(load)).notifications.filter(n=>n.ownerSessionId===ownerSessionId&&!attempted.has(n.notificationId)&&(n.state==='pending'||retryAccepted&&n.state==='accepted'))
      if(rows.length===0)return
      for(const intent of rows){
        attempted.add(intent.notificationId)
        notificationAttempts.add(intent.notificationId)
        if(closing)return
        let receipt:Awaited<ReturnType<HostPorts['notifyOwner']>>
        try{receipt=await ports.notifyOwner({notificationId:intent.notificationId,ownerSessionId:intent.ownerSessionId,instrumentInstanceId:intent.instrumentInstanceId,businessRevision:intent.businessRevision,authorPrincipalId:intent.authorPrincipalId},notificationLifetime.signal)}catch{notificationAttempts.delete(intent.notificationId);earlyNotificationCommits.delete(intent.notificationId);return}
        if(receipt.status!=='accepted'||receipt.messageId===null){notificationAttempts.delete(intent.notificationId);earlyNotificationCommits.delete(intent.notificationId);return}
        try{await queue.run(()=>update(old=>{
          const committed=earlyNotificationCommits.get(intent.notificationId)===receipt.messageId
          return {...old,notifications:old.notifications.map(n=>n.notificationId===intent.notificationId&&n.state!=='consumed'?{...n,state:committed?'consumed':'accepted',messageId:receipt.messageId}:n)}
        }))}finally{notificationAttempts.delete(intent.notificationId);earlyNotificationCommits.delete(intent.notificationId)}
      }
      }
    })()
    notificationFlights.set(ownerSessionId,flight)
    void flight.finally(()=>{notificationFlights.delete(ownerSessionId)}).catch(()=>undefined)
    return flight
  }
  const scheduleNotification=(ownerSessionId:string,retryAccepted=false):void=>{void flushNotifications(ownerSessionId,retryAccepted).catch(()=>undefined)}
  /**
   * One wake per terminal-outcome item through the existing notification path. The durable row is
   * also the dedup ledger: the item key is the child session id + turn (+ runId when the host gave
   * one), so a repeated observation, a plugin hot reload or a DSH restart reuses the stored row
   * instead of reporting the same failed turn again.
   */
  const reportNativeStop=(event:Extract<HostEvent,{kind:'native-stop'}>):Promise<void>=>queue.run(async()=>{
    const view=cachedSessions.get(event.ownerSessionId)
    if(view===undefined)return
    const stop=event.item
    const notificationId='native-stop:'+stop.itemId
    if(!(await load()).notifications.some(n=>n.notificationId===notificationId))await update(old=>old.notifications.some(n=>n.notificationId===notificationId)?old:{...old,notifications:[...old.notifications,{notificationId,instrumentInstanceId:view.instance.instrumentInstanceId,ownerSessionId:view.instance.ownerSessionId,businessRevision:view.documentRevision,authorPrincipalId:'program:native-outcome',state:'pending',messageId:null}]})
    scheduleNotification(event.ownerSessionId)
  })
  // Keep only the latest scope baseline per caller identity, never one large body per grant.
  const baselines=new Map<string,{readonly scopeKey:string;readonly agent:Agent;readonly session:Agent['session'];readonly message:UserMessage;readonly text:string}>()
  // The host may assemble one admitted model request several times, and a PTC step may complete
  // several nested dispatches; all of them share one turn:step identity. Those passes can be seconds
  // apart while other sessions keep changing the facts, and a message queued during the step is not
  // yet visible to the host visibility oracle, so delivering every pass would put a burst of
  // near-identical full snapshots into one request. A bounded current view is delivered at most once
  // per admitted step; later passes are suppressed and the newest facts reach the model with the next
  // admitted step (its own instrument tool results still carry the state their call produced).
  let stepSerial=0,currentStepKey='serial:0'
  const deliveredInStep=new Map<string,{readonly step:string;readonly agent:Agent|undefined;readonly session:Agent['session']|undefined}>()
  // A persistent association or policy-storage failure must not append the same notice at every
  // step and every tool result: the notice reuses the snapshot baseline and visibility rule.
  const failureReason=(error:unknown):string=>error instanceof ControlsError?error.code:error instanceof ResourceError?error.code:'internal-error'
  const installSnapshot=(caller:HostCaller,acceptedMessages:readonly UserMessage[],text:string,baselineKey:string):readonly UserMessage[]=>{
    const identityKey=JSON.stringify([caller.principalId,caller.sessionId]),agent=ports.liveAgent(caller.sessionId!)
    const prior=baselines.get(identityKey),baseline=prior?.scopeKey===baselineKey?prior:undefined
    if(prior!==undefined&&baseline===undefined)baselines.delete(identityKey)
    // The admitted-step installation slot belongs to the actual caller/session, not to
    // a scope version or diagnostic kind. Scope changes must still fence baseline reuse.
    const delivered=deliveredInStep.get(identityKey)
    if(delivered!==undefined&&delivered.step===currentStepKey&&delivered.agent===agent&&delivered.session===agent?.session)return []
    if(agent&&baseline&&baseline.text===text&&baseline.agent===agent&&baseline.session===agent.session){
      if(acceptedMessages.some(message=>message.id===baseline.message.id&&canonical({source:message.source,content:message.content})===canonical({source:baseline.message.source,content:baseline.message.content})))return []
      try{if(ports.snapshotVisible?.(caller,agent,baseline.message)===true)return []}catch{/* Unavailable visibility never proves delivery. */}
    }
    const message=ports.makeSnapshotMessage(text)
    if(agent)baselines.set(identityKey,{scopeKey:baselineKey,agent,session:agent.session,message,text})
    else baselines.delete(identityKey)
    deliveredInStep.set(identityKey,{step:currentStepKey,agent,session:agent?.session})
    return [message]
  }
  const deliverFailure=(caller:HostCaller,acceptedMessages:readonly UserMessage[],error:unknown):readonly UserMessage[]=>installSnapshot(caller,acceptedMessages,
    'Instrument context unavailable: '+failureReason(error)+'. Accepted business input is retained; missing facts are not execution capacity or business completion proof.',
    'unavailable|'+caller.principalId+'|'+caller.sessionId)
  const prepare=async(caller:HostCaller,signal:AbortSignal,acceptedMessages:readonly UserMessage[]=[])=>{
    if(caller.sessionId===null)return []
    let view:SessionControlsView,permission:InstrumentScope
    try{const saved=await controls.readPolicy(caller.principalId)
      const retained=cachedSessions.get(caller.sessionId)
      if(!saved.extensionEnabled&&!retained)return []
      view=await identity(caller,caller.sessionId,signal);permission=await scope(caller.principalId,caller.sessionId,view)}catch(error){
      signal.throwIfAborted()
      // No current identity/scope proof means no cached body, even as explicitly stale text.
      return deliverFailure(caller,acceptedMessages,error)
    }
    const ownerDecisionPolicy=await queue.run(()=>readOwnerPolicy(view,signal))
    const key=consumptionIdentity(caller,view,permission,ownerDecisionPolicy)
    // Rebuilding the projection re-reads every document, clones it and appends a history
    // observation, per step *and* per tool result (measured: 32 of 41 rebuilds produced no
    // message at all). The gate watches the revisions this projection derives from plus an
    // epoch bumped by every runtime/window mutation; while they are unchanged the verified
    // projection is reused. Delivery is still decided below, so an undelivered snapshot is
    // re-offered exactly as before, and a degraded cache still takes the full read.
    const refreshKey=caller.principalId+'|'+view.association.sessionId+'|'+view.documentRevision+'|'+savedPolicy.revision+'|'+sourceVersion(permission)+'|'+sourceVersion(ownerDecisionPolicy)
    const refreshEpoch=refresh.epoch(view.instance.instrumentInstanceId)
    const mayReuse=!historyFailures.has(view.instance.instrumentInstanceId)&&!refresh.shouldRefresh(refreshKey,view.instance.instrumentInstanceId)
    // Within the gate window the last prepared projection is reused, including the explicitly
    // stale text of a failed refresh: a slow read must neither blank the instrument nor be
    // re-attempted on every step. Degraded text is never returned as current.
    const held=consumption.prepared(key)
    const reusable=mayReuse&&held!==null
    const result=reusable?null:await consumption.readForConsumption(key,signal)
    // A superseded read is an ordering outcome, not a failed instrument: the newer read owns
    // the state and the gate, so this caller must not install a false unknown snapshot.
    if(result!==null&&result.reason==='superseded-read')return []
    if(result!==null)refresh.record(refreshKey,refreshEpoch,view.instance.instrumentInstanceId)
    // Preparation is not delivery. Replay only after this consumption verified freshness.
    const freshness=result===null?(held!.fresh?'current':'stale'):result.freshness
    const text=result===null?held!.text:result.text??(result.freshness==='current'?consumption.cachedText(key):null)
    if(text===null){refresh.record(refreshKey,refreshEpoch,view.instance.instrumentInstanceId);return []}
    // readForConsumption may have degraded an earlier verified body after a raced read.
    // Re-prove the publication scope even for prepared/stale text; the initial proof is not enough.
    try{
      const current=(await modelIdentity(caller,caller.sessionId,signal)).identity
      if(canonical(current.instance)!==canonical(view.instance)||sourceVersion(current.scope)!==key.scopeFingerprint||key.sourceToken!==sourceVersion(await queue.run(()=>readOwnerPolicy(view,signal))))throw new ControlsError('revision-conflict','snapshot publication authorization or owner policy source changed')
    }catch(error){signal.throwIfAborted();return deliverFailure(caller,acceptedMessages,error)}
    const baselineKey=JSON.stringify([key.principalId,key.sessionId,key.instrumentInstanceId,key.ownerSessionId,sourceVersion(permission)])
    try{
      refresh.record(refreshKey,refreshEpoch,view.instance.instrumentInstanceId)
      // An identical snapshot that is still visible in the real session, or was already queued
      // during this step, is not installed again: fresh or stale, a failing refresh must not
      // append the same facts at every step or after every nested tool result.
      return installSnapshot(caller,acceptedMessages,text,baselineKey)
    }catch(error){signal.throwIfAborted()
      refresh.record(refreshKey,refreshEpoch,view.instance.instrumentInstanceId)
      return installSnapshot(caller,acceptedMessages,'Instrument snapshot exceeds its representation boundary. Current detail is unknown here, not zero or release proof. Accepted business input is retained; use instrument tools for detail.',baselineKey)
    }
  }
  const facade:RuntimeFacade={
    async serializePolicyPermission(effect){touchState();return queue.run(async()=>{try{return await effect()}finally{touchState()}})},
    async readPolicy(caller,signal){await check(caller,undefined,signal);return controls.readPolicy(caller.principalId)},
    async savePolicy(caller,intent:PolicyIntent,expectedRevision,signal){
      await check(caller,undefined,signal)
      return queue.run(async()=>{signal.throwIfAborted();transitioning=intent
        try{const saved=await controls.savePolicy(caller.principalId,intent,expectedRevision);if(savedPolicy.revision!==saved.revision)touchState();savedPolicy=saved
          for(const [sid,view]of cachedSessions){let verified=false;try{verified=await ports.authority.verifyWorkspace(view.instance.controlWorkspaceId)}catch{/* Preserve committed policy while reporting unverified workspace. */}
            const next={...view,policy:resolvePolicy(saved,view.instance.controlWorkspaceId,verified)};cachedSessions.set(sid,next);nativeWindows.set(sid,next.policy.extensionEnabled&&next.policy.features.windows.requested)}
          let captureFailed=false
          for(const view of new Map([...cachedSessions.values()].map(view=>[view.instance.instrumentInstanceId,view])).values()){const outcome=await captureSafely(view,async()=>{await captureCurrent(view,[{kind:'configuration',recordId:view.instance.controlWorkspaceId,version:saved.revision,snapshot:saved,domain:'controls',author:caller}]);marksFor(view.instance.instrumentInstanceId).configuration=saved.revision});captureFailed ||= outcome.status==='failed'}
          modelMutationOutcomes.set(saved,{historyCapture:{status:captureFailed?'failed':'recorded',diagnostic:captureFailed?'configuration history capture unavailable for one or more current instances':null}})
          return saved
        }finally{transitioning=null}})
    },
    setDelegateRegistered(registered){if(delegateRegistered===registered)return;delegateRegistered=registered;touchState()},
    modelMutationOutcome(result){return result!==null&&typeof result==='object'?modelMutationOutcomes.get(result)??null:null},
    async withModelRead(caller,sessionId,signal,effect){return queue.run(async()=>{
      const permit={open:true}
      try{return await modelReadContext.run(permit,async()=>{
        const before=(await modelIdentity(caller,id(sessionId,'sessionId'),signal)).identity
        const result=await effect()
        const after=(await modelIdentity(caller,sessionId,signal)).identity
        if(canonical(before)!==canonical(after))throw new ControlsError('revision-conflict','current-view-changed: current source identity or scope changed')
        signal.throwIfAborted();return result
      })}finally{permit.open=false}
    })},
    async readModelIdentity(caller,sessionId,signal){return modelReadOrder(async()=>(await modelIdentity(caller,id(sessionId,'sessionId'),signal)).identity)},
    async readModelCurrent(caller,sessionId,signal){return modelCurrent(caller,id(sessionId,'sessionId'),signal)},
    async readModelSource(caller,sessionId,selector,signal){return modelReadSource(caller,id(sessionId,'sessionId'),selector,signal)},
    async readOwnerDecisionPolicy(caller,sessionId,signal){return queue.run(async()=>{
      const view=await requireOperator(caller,sessionId,signal),state=await ownerPolicies.read(view.instance)
      signal.throwIfAborted();return policySnapshot(view,state)
    })},
    async saveOwnerDecisionPolicy(caller,sessionId,input,signal){
      const request=parseOwnerDecisionPolicySaveRequest(input),view=await requireOperator(caller,sessionId,signal)
      return track(view.instance.instrumentInstanceId,async()=>{
        const current=await requireOperator(caller,sessionId,signal)
        if(canonical(current.instance)!==canonical(view.instance))throw new ControlsError('association-conflict','owner policy route changed')
        const saved=await ownerPolicies.save(current.instance,request,{kind:'user',principalId:caller.principalId,sessionId:null})
        return freeze({appliedRevision:saved.appliedRevision,replayed:saved.replayed,operation:saved.operation,snapshot:policySnapshot(current,saved.state)})
      })
    },
    async readSession(caller,sessionId,signal){return snapshot(caller,id(sessionId,'sessionId'),signal)},
    async readSummaries(caller,request,signal){return summaries(caller,request,signal)},
    async applyInstrument(caller,sessionId,command:InstrumentCommand,signal){
      const view=await identity(caller,sessionId,signal)
      const result=await track(view.instance.instrumentInstanceId,async()=>{
        signal.throwIfAborted();await check(caller,sessionId,signal)
        const applied=await instruments.apply(caller.principalId,sessionId,command)
        let notificationFailure:string|null=null
        if(command.action!=='set-decision-view'&&(caller.kind==='user'||sessionId!==view.instance.ownerSessionId)){
          const notificationId=createHash('sha256').update(JSON.stringify([view.instance.instrumentInstanceId,command.operationId])).digest('hex')
          try{await update(old=>old.notifications.some(n=>n.notificationId===notificationId)?old:{...old,notifications:[...old.notifications,{notificationId,instrumentInstanceId:view.instance.instrumentInstanceId,ownerSessionId:view.instance.ownerSessionId,businessRevision:applied.snapshot.businessRevision,authorPrincipalId:caller.principalId,state:'pending',messageId:null}]})}catch(error){notificationFailure=String(error).slice(0,1024)}
        }
        const historyCapture=await captureSafely(view,()=>captureBusiness(view,applied.snapshot))
        const completed=notificationFailure===null?applied:{...applied,notificationRecording:'failed',diagnostic:notificationFailure}
        modelMutationOutcomes.set(completed,{historyCapture})
        return completed
      })
      if(command.action!=='set-decision-view')scheduleNotification(view.instance.ownerSessionId)
      return result
    },
    async notificationCommitted(ownerSessionId,notificationId,messageId){
      const commit=queue.run(async()=>{
        const current=await load(),intent=current.notifications.find(n=>n.notificationId===notificationId&&n.ownerSessionId===ownerSessionId)
        if(!intent)return
        if(notificationAttempts.has(notificationId)&&intent.messageId!==messageId){earlyNotificationCommits.set(notificationId,messageId);return}
        if(intent.messageId!==messageId||intent.state==='consumed')return
        await update(old=>({...old,notifications:old.notifications.map(n=>n.notificationId===notificationId&&n.ownerSessionId===ownerSessionId&&n.messageId===messageId?{...n,state:'consumed',messageId}:n)}))
      })
      const owner=cachedSessions.get(ownerSessionId);if(owner)consumptionProgram.trackCommit(owner.instance.instrumentInstanceId,commit)
      await commit
    },
    async applyTicketWindow(caller,sessionId,command:TicketWindowCommand,signal){const view=await identity(caller,sessionId,signal);return track(view.instance.instrumentInstanceId,async()=>{signal.throwIfAborted();await check(caller,sessionId,signal);if(command.action!=='release')await requireRegisteredTicket(caller,sessionId,command.workflowId,command.localTicketId);const result=await windows.apply(caller.principalId,sessionId,command);const historyCapture=await captureSafely(view,()=>captureOthers(view,caller));modelMutationOutcomes.set(result,{historyCapture});return result})},
    async resourceAction(caller,sessionId,input:ResourceAction,signal){
      const request=parseResourceAction(input),view=await identity(caller,sessionId,signal)
      return track(view.instance.instrumentInstanceId,async()=>{
        await check(caller,sessionId,signal)
        if((await scope(caller.principalId,sessionId,view)).kind!=='coordinator')denied('legacy resource access requires actual coordinator')
        if(request.action!=='read')throw new ResourceError('unsupported','legacy resource instrument is read-only; agents manage Git worktrees natively')
        return resourceModule(caller,view,signal).resources.read(caller.principalId,request.resourceId,signal)
      })
    },
    async created(caller,signal,actualAgent){
      try{
      const dispatch=nativeDispatch.getStore()
      if(dispatch?.accepting&&actualAgent.session.header.origin==='subagent'&&actualAgent.session.header.parentSession===dispatch.caller.sessionId&&ports.liveAgent(actualAgent.id)===actualAgent){
        dispatch.children.add(actualAgent);dispatch.live.add(actualAgent);exactExecutions.set(actualAgent,dispatch)
        managedExecutions.set(actualAgent.id,dispatch);reattached.set(actualAgent,dispatch)
        await track(dispatch.token.instrumentInstanceId,async()=>{
          const task:TaskAssignment={sessionId:actualAgent.id,parentSessionId:dispatch.caller.sessionId!,instrumentInstanceId:dispatch.token.instrumentInstanceId,workflowId:dispatch.workflowId,ticketIds:dispatch.ticketIds}
          await update(async old=>{
            const parent=await effectiveScope(old,dispatch.caller.sessionId!,dispatch.instance),allowed=parent.kind==='coordinator'||((task.workflowId===null||parent.workflowId===task.workflowId)&&task.ticketIds.every(ticket=>parent.ticketIds.includes(ticket)))
            const granted=allowed?task:{...task,workflowId:null,ticketIds:[]}
            return {...old,assignments:[...old.assignments.filter(a=>a.sessionId!==task.sessionId),granted],bindings:[...old.bindings,{...dispatch.token,sessionId:actualAgent.id,parentSessionId:task.parentSessionId,runtimeId,released:false}]}
          })
          await sendReceipt(dispatch.token,'accepted')
          if(dispatch.children.size>1)await markKnowledge(dispatch.instance,false,'unexpected-multiple-native-executions')
        })
      }
      if(!dispatch?.accepting&&actualAgent.session.header.origin==='subagent'){
        const managed=managedExecutions.get(actualAgent.id)
        if(managed&&managed.released){
          // A continuable child's run ended and released its slot; waking the same session runs it again,
          // so the lane is re-admitted through a fresh generation. S counts subagents that are actually
          // running — that is what the sliding window is for — instead of the runs that once started.
          try{
            const reservation=await track(managed.token.instrumentInstanceId,()=>windowsProgram.reserveExecution(managed.caller.principalId,managed.caller.sessionId!,{operationId:'readmit:'+randomUUID(),executionId:managed.token.executionId,workflowId:managed.workflowId,localTicketId:managed.ticketIds.length===1?managed.ticketIds[0]!:null}))
            if(reservation.dispatchable){
              managed.token=reservation.token;managed.released=false;managed.live.add(actualAgent)
              exactExecutions.set(actualAgent,managed);reattached.set(actualAgent,managed)
              await track(managed.token.instrumentInstanceId,async()=>{
                await update(old=>({...old,bindings:[...old.bindings.filter(b=>b.sessionId!==actualAgent.id),{...managed.token,sessionId:actualAgent.id,parentSessionId:actualAgent.session.header.parentSession??managed.caller.sessionId!,runtimeId,released:false}]}))
                await sendReceipt(managed.token,'running')
              })
            }
          }catch(error){signal.throwIfAborted()/* A woken lane that cannot be re-admitted is reported below rather than failing the wake. */}
        }
        if(managed&&!managed.released){
          // The same admitted lease is still current (a duplicate creation or a raced wake): re-attach.
          managed.live.add(actualAgent);exactExecutions.set(actualAgent,managed);reattached.set(actualAgent,managed)
          await track(managed.token.instrumentInstanceId,()=>sendReceipt(managed.token,'running'))
        }else if(!managed){
          const parent=actualAgent.session.header.parentSession,view=parent&&cachedSessions.get(parent)
          if(view&&!knowledgeIsCurrent(view,false,'unmanaged-or-late-native-creation'))await track(view.instance.instrumentInstanceId,()=>markKnowledge(view,false,'unmanaged-or-late-native-creation'))
        }
      }
      try{const view=await identity(caller,caller.sessionId!,signal);const createdEvent=nativeExecutionEvent(actualAgent,view,'created');if(createdEvent!==null)await recordNativeExecution(view,createdEvent);await track(view.instance.instrumentInstanceId,()=>initialize(view));if(view.instance.ownerSessionId===caller.sessionId)scheduleNotification(caller.sessionId,true)}
      catch(error){signal.throwIfAborted();if(!(error instanceof ControlsError)||!['unknown-session','unknown-workspace'].includes(error.code))throw error}
      }catch(error){
        signal.throwIfAborted()
        // Optional instrument observation must never become a serial native creation veto.
        const owner=cachedSessions.get(actualAgent.session.header.parentSession??caller.sessionId??'')
        if(owner){nativeWindows.set(owner.instance.instrumentInstanceId,false);historyFailures.set(owner.instance.instrumentInstanceId,'native child created; instrument recording failed: '+String(error).slice(0,1024))}
      }
    },
    async observe(event:HostEvent){
      // A terminal-outcome item reported by the native counter is actionable, not a log line:
      // it takes the existing owner-notification path before any ledger bookkeeping.
      if(event.kind==='native-stop'){await reportNativeStop(event);return}
      // C: native lifecycle edges update the same owner row. Only local actual agents are
      // accepted; a status edge has no document write (read-time activity covers it).
      const nativeAgent=event.actualAgent
      // A disposed event has no run id. If the same session already has a different live Agent,
      // this is the old Agent's late disposal and must not clear the new run or its cached view.
      const disposedIsCurrent=event.kind!=='agent-disposed'||nativeAgent===undefined
        ||ports.liveAgent(nativeAgent.id)===undefined||ports.liveAgent(nativeAgent.id)===nativeAgent
      if(event.kind==='agent-disposed'&&nativeAgent!==undefined&&!disposedIsCurrent)
        markNativeExecutionFailure(nativeAgent.id,new ControlsError('association-conflict','agent disposed event belongs to an earlier Agent; the current run remains live'))
      // A published local end survives Agent disposal; without a live Agent the durable row
      // identifies the same run, and anything less is reported instead of silently dropping the
      // outcome. Non-local ends were never this instrument's execution fact.
      if(event.kind==='subagent-end'&&event.local&&nativeAgent===undefined){await recordLateNativeExecutionEnd(event);return}
      if(nativeAgent!==undefined&&nativeAgent.session.header.origin==='subagent'&&typeof nativeAgent.session.header.parentSession==='string'){
        if(event.kind==='subagent-start')await recordNativeExecutionEdge(nativeAgent,'start',{provider:event.provider,runId:event.runId})
        else if(event.kind==='subagent-end')await recordNativeExecutionEdge(nativeAgent,'end',{provider:event.provider,runId:event.runId,stopReason:event.stopReason})
        else if(event.kind==='agent-disposed'&&disposedIsCurrent)await recordNativeExecutionEdge(nativeAgent,'disposed')
      }
      // A disposed session never prepares again: drop its baseline so the retained Agent, its
      // Session log and the injected message are not kept alive for the process lifetime.
      if(event.kind==='agent-disposed'&&event.actualAgent&&disposedIsCurrent){
        // A disposed Session never prepares again: drop its cached view and per-session failure
        // index so a long-lived runtime does not retain every child it ever observed.
        const id=event.actualAgent.id
        for(const key of baselines.keys())if(key.includes(id))baselines.delete(key)
        for(const key of deliveredInStep.keys())if(key.includes(id))deliveredInStep.delete(key)
        cachedSessions.delete(id);nativeWindows.delete(id)
        if(failedObservationSessions.delete(id))observationFailures.delete('session:'+id)
      }
      const actual=event.actualAgent,attached=actual&&(exactExecutions.get(actual)??reattached.get(actual))
      if(attached){
        const commit=track(attached.token.instrumentInstanceId,async()=>{
          if(event.kind==='agent-disposed'){
            // This run ended: the lane stops running, so its audit slot is released. A later wake
            // re-admits it through a fresh generation, which keeps the dispatch audit aligned with
            // the host's live run status (S itself never reads this ledger).
            const managed=managedExecutions.get(actual!.id)
            attached.live.delete(actual!);exactExecutions.delete(actual!);reattached.delete(actual!);attached.released=true
            if(managed)managed.released=true
            await update(old=>({...old,bindings:old.bindings.map(b=>b.sessionId===actual!.id&&b.leaseId===attached.token.leaseId?{...b,released:true}:b)}))
            if(attached.live.size===0)await sendReceipt(attached.token,'released')
          }else if(event.kind==='agent-status'&&event.status==='running'&&!attached.released)await sendReceipt(attached.token,'running')
          // Idle and subagent/end are deliberately NOT implementation-release proofs.
        })
        await commit;return
      }
      if(actual?.session.header.origin==='subagent'){
        const parent=actual.session.header.parentSession,view=parent&&cachedSessions.get(parent)
        if(view&&!knowledgeIsCurrent(view,false,'unmanaged-native-execution-observed'))await track(view.instance.instrumentInstanceId,()=>markKnowledge(view,false,'unmanaged-native-execution-observed'))
      }
    },
    async preStep(caller,signal,acceptedMessages,stepKey){currentStepKey=stepKey??('serial:'+(++stepSerial));return prepare(caller,signal,acceptedMessages)},
    // Every tool result may carry this plugin's current projection or its honest unknown
    // diagnostic, so the hook stays unrestricted; the refresh gate inside prepare keeps an
    // unchanged projection from being rebuilt per call.
    async postExecute(caller,exec,result,stepKey){if(stepKey!==undefined)currentStepKey=stepKey;if(exec.name==='create_worktree')await recordWorktreeObservation(caller,exec,result,stepKey);return prepare(caller,exec.signal)},
    context(caller){return caller.sessionId!==null&&cachedSessions.has(caller.sessionId)?'Collaboration instruments: use mattpocock_record for current records, mattpocock_history for scoped history, mattpocock_worktree for recorded bindings. Re-read with mattpocock_record when the injected snapshot is missing or stale.':''},
    async historyAction(caller,sessionId,input,signal){
      const r=record(input,'history action'),view=await identity(caller,sessionId,signal)
      if((await scope(caller.principalId,sessionId,view)).kind!=='coordinator')denied('session history requires actual owner coordinator')
      return track(view.instance.instrumentInstanceId,async()=>{
        await check(caller,sessionId,signal)
        let records:RuntimeSnapshot['records']=null
        const sourceRefreshFailures:string[]=[]
        try{records=await instruments.read(caller.principalId,sessionId,{},signal);signal.throwIfAborted();await captureBusiness(view,records,signal)}catch(error){signal.throwIfAborted();sourceRefreshFailures.push('records: '+String(error))}
        signal.throwIfAborted()
        try{await captureOthers(view,caller,signal);signal.throwIfAborted()}catch(error){signal.throwIfAborted();sourceRefreshFailures.push('other-sources: '+String(error))}
        const history=await historyFor(view)
        signal.throwIfAborted()
        if(r.action==='compact-source'||r.action==='purge-source'){
          record(input,'source cleanup action',['action','domain','request'])
          if(sessionId!==view.instance.ownerSessionId)denied('source cleanup requires the actual owner session')
          if(r.domain!=='records'&&r.domain!=='windows'&&r.domain!=='worktrees')throw new ControlsError('invalid-input','unknown source cleanup domain')
          const command=record(r.request,'source cleanup request',r.action==='compact-source'?['operationId','expectedRevision']:['operationId','expectedRevision','throughRevision',...(r.domain==='worktrees'?['bindingIds']:['targets'])])
          const operationId=id(command.operationId,'operationId'),expectedRevision=revision(command.expectedRevision,'expectedRevision')
          const throughRevision=r.action==='purge-source'?revision(command.throughRevision,'throughRevision'):0
          const bindingIds=r.action==='purge-source'&&r.domain==='worktrees'?array(command.bindingIds,'bindingIds').map(value=>id(value,'bindingId')):[]
          const targets=r.action==='purge-source'&&r.domain!=='worktrees'?array(command.targets,'source targets').map(value=>{
            const t=record(value,'source target')
            if(r.domain==='windows'&&t.kind==='knowledge'){record(t,'knowledge target',['kind']);return {kind:'knowledge' as const}}
            if(r.domain==='windows'&&t.kind==='execution'){record(t,'execution target',['kind','executionId']);return {kind:'execution' as const,executionId:id(t.executionId,'executionId')}}
            const workflowId=id(t.workflowId,'workflowId')
            if(r.domain==='records'&&t.kind==='workflow'){record(t,'workflow target',['kind','workflowId']);return {kind:'workflow' as const,workflowId}}
            if(r.domain==='records'&&t.kind==='task-reference'){record(t,'task reference target',['kind','workflowId','localTicketId']);return {kind:'task-reference' as const,workflowId,localTicketId:id(t.localTicketId,'localTicketId')}}
            if(t.kind==='ticket'){record(t,'ticket target',['kind','workflowId','localTicketId']);return {kind:'ticket' as const,workflowId,localTicketId:id(t.localTicketId,'localTicketId')}}
            if(r.domain==='records'&&t.kind==='decision'){record(t,'decision target',['kind','workflowId','decisionId']);return {kind:'decision' as const,workflowId,decisionId:id(t.decisionId,'decisionId')}}
            throw new ControlsError('invalid-input','unknown source target')
          }):[]
          if(r.action==='purge-source'&&((r.domain==='worktrees'?bindingIds.length:targets.length)<1||(r.domain==='worktrees'?bindingIds.length:targets.length)>100||new Set((r.domain==='worktrees'?bindingIds:targets).map(canonical)).size!==(r.domain==='worktrees'?bindingIds.length:targets.length)))throw new ControlsError('invalid-input','explicit unique source targets required')
          const sourceInput=r.action==='compact-source'?{operationId,expectedRevision}:{operationId,expectedRevision,throughRevision,...(r.domain==='worktrees'?{bindingIds}:{targets})}
          const fingerprint=createHash('sha256').update(canonical([caller,input])).digest('hex')
          const journal=await ports.openUnitStorage('cleanup_'+createHash('sha256').update(view.instance.instrumentInstanceId).digest('hex').slice(0,48),parseSourceCleanupJournal)
          const initialRaw=await journal.read(),initial=initialRaw===undefined?{revision:0,rows:[]}:parseSourceCleanupJournal(initialRaw)
          let planned=initial.rows.find(row=>row.operationId===operationId)
          if(planned&&planned.fingerprint!==fingerprint)throw new ControlsError('operation-conflict','cleanup identity belongs to another request or caller')
          if(planned?.result!==null&&planned?.result!==undefined)return {...record(planned.result,'cleanup result'),replayed:true}
          if(!planned){
            const selected=new Map<string,number>(),selectedWindowOperations=new Set<string>()
            let sourceRevision=records?.revision??0
            if(r.domain==='records'){
              if(records===null)throw new ControlsError('storage-uncertain','records source unavailable; no new cleanup plan committed')
              for(const target of targets){
                if(target.kind==='knowledge'||target.kind==='execution')throw new ControlsError('invalid-input','invalid records target')
                const recordId=target.kind==='workflow'?target.workflowId:JSON.stringify([target.workflowId,target.kind==='ticket'||target.kind==='task-reference'?target.localTicketId:target.decisionId])
                const row=target.kind==='workflow'?records.workflows.find(row=>row.workflowId===target.workflowId):target.kind==='ticket'?records.tickets.find(row=>row.workflowId===target.workflowId&&row.localTicketId===target.localTicketId):target.kind==='task-reference'?records.taskReferences.find(row=>row.workflowId===target.workflowId&&row.localTicketId===target.localTicketId):records.decisions.find(row=>row.workflowId===target.workflowId&&row.decisionId===target.decisionId)
                if(!row)throw new ControlsError('invalid-input','unknown source target')
                selected.set(JSON.stringify([target.kind,recordId]),row.revision)
              }
            }else if(r.domain==='worktrees'){
              const data=await (await openWorktrees(view)).query(view.instance);sourceRevision=data.revision
              for(const bindingId of bindingIds){const row=data.rows.find(row=>row.bindingId===bindingId);if(!row)throw new ControlsError('invalid-input','unknown binding target');selected.set(JSON.stringify(['worktree',bindingId]),row.revision)}
            }else{
              const raw=await ports.windowStorage.read(view.instance.instrumentInstanceId)
              signal.throwIfAborted()
              if(raw===undefined)throw new ControlsError('invalid-input','window source has no history')
              const data=memoized(raw,parseWindowDocument);sourceRevision=data.revision
              const ops=data.schemaVersion===2?[...data.retainedOperations,...data.operations]:data.operations
              for(const target of targets){
                const matching=ops.filter(op=>{const payload=record(JSON.parse(op.fingerprint),'window operation');return target.kind==='knowledge'?op.kind==='knowledge':target.kind==='execution'?op.kind!=='knowledge'&&payload.executionId===target.executionId:target.kind==='ticket'?op.kind==='ticket'&&payload.workflowId===target.workflowId&&payload.localTicketId===target.localTicketId:false})
                if(matching.length===0)throw new ControlsError('invalid-input','unknown window source target')
                const latest=Math.max(...matching.map(op=>op.revision));for(const op of matching)if(op.revision<=throughRevision&&op.revision<latest)selectedWindowOperations.add(op.operationId)
              }
            }
            if(expectedRevision!==sourceRevision)throw new ControlsError('revision-conflict','source changed; reload before cleanup')
            if(throughRevision>sourceRevision)throw new ControlsError('invalid-input','cleanup cut exceeds source revision')
            const ids:string[]=[]
            let cursor:HistoryQuery['cursor']
            do{const page=await history.query({...cursor?{cursor}:{},limit:100});for(const row of page.rows){const latest=selected.get(JSON.stringify([row.kind,row.recordId]));const selectedBody=r.domain==='windows'?row.sourceDomain==='windows'&&selectedWindowOperations.has(row.recordKey):row.sourceDomain===(r.domain==='records'?'instruments':'worktree-bindings')&&latest!==undefined&&row.version<=throughRevision&&row.version<latest;if(selectedBody&&!row.purged)ids.push(row.historyId)}cursor=page.nextCursor??undefined}while(cursor)
            signal.throwIfAborted()
            planned={operationId,fingerprint,historyIds:ids,derivedDone:false,result:null}
            if(!await journal.compareAndSwap(initial.revision,{revision:increment(initial.revision),rows:[...initial.rows,planned]}))throw new ControlsError('concurrent-update','cleanup plan changed')
          }
          const save=async(change:{derivedDone?:boolean;result?:HostJson})=>{const old=parseSourceCleanupJournal(await journal.read());signal.throwIfAborted();if(!await journal.compareAndSwap(old.revision,{revision:increment(old.revision),rows:old.rows.map(row=>row.operationId===operationId?{...row,...change}:row)}))throw new ControlsError('concurrent-update','cleanup acknowledgement changed')}
          let suppressionStarted=planned.derivedDone,acknowledgedSuppressionRows=planned.derivedDone?planned.historyIds.length:0
          try{
            if(!planned.derivedDone){
              for(let offset=0;offset<planned.historyIds.length;offset+=100){
                signal.throwIfAborted();suppressionStarted=true
                await history.apply({action:'purge',historyIds:planned.historyIds.slice(offset,offset+100),archivedOnly:false},{kind:'authored',domain:'source-cleanup',author:parseHostJson(caller),recordedAt:null,coverage:'recorded-history'},signal)
                acknowledgedSuppressionRows+=planned.historyIds.slice(offset,offset+100).length
                signal.throwIfAborted()
              }
              await save({derivedDone:true})
            }
            signal.throwIfAborted()
          }catch(error){return {operationId,phase:'partial',domain:r.domain,derivedHistoryDeleted:acknowledgedSuppressionRows>0?true:suppressionStarted?null:false,derivedOutcome:suppressionStarted?'partially-applied-or-uncertain':'not-started',acknowledgedSuppressionRows,sourceRecordsDeleted:false,sourceOutcome:'not-started',nativeConversationDeleted:false,error:String(error)}}
          let result:unknown,sourceStarted=false,sourceDeletionStarted=false,checkpointAppliedRevision:number|null=null
          try{
            signal.throwIfAborted()
            if(r.domain==='records'){sourceStarted=true;sourceDeletionStarted=r.action==='purge-source';result=r.action==='compact-source'?await instruments.compact(caller.principalId,sessionId,sourceInput as InstrumentCompactInput,signal):await instruments.purgeHistory(caller.principalId,sessionId,sourceInput as InstrumentPurgeHistoryInput,signal)}
            else if(r.domain==='worktrees'){const registry=await openWorktrees(view);signal.throwIfAborted();sourceStarted=true;sourceDeletionStarted=r.action==='purge-source';result=r.action==='compact-source'?await registry.compact(view.instance,caller,sourceInput as WorktreeBindingsCompact,signal):await registry.purgeHistory(view.instance,caller,sourceInput as WorktreeBindingsPurgeHistory,signal)}
            else if(r.action==='compact-source'){sourceStarted=true;result=await windowsProgram.compactHistory(caller.principalId,sessionId,sourceInput as WindowCompactRequest,signal)}
            else{sourceStarted=true;const checkpoint=await windowsProgram.compactHistory(caller.principalId,sessionId,{operationId:'source-checkpoint:'+operationId,expectedRevision},signal);checkpointAppliedRevision=checkpoint.appliedRevision;signal.throwIfAborted();sourceDeletionStarted=true;result=await windowsProgram.purgeHistory(caller.principalId,sessionId,{...sourceInput,expectedRevision:checkpoint.appliedRevision} as WindowPurgeRequest,signal)}
          }
          catch(error){return {operationId,phase:'partial',derivedHistoryDeleted:true,sourceRecordsDeleted:sourceDeletionStarted?null:false,sourceOutcome:checkpointAppliedRevision!==null&&!sourceDeletionStarted?'checkpoint-committed-purge-not-started':sourceStarted?'failed-or-uncertain':'not-started',...(checkpointAppliedRevision===null?{}:{checkpointAppliedRevision}),nativeConversationDeleted:false,error:String(error)}}
          const {snapshot:_snapshot,...acknowledgement}=record(result,'source result')
          const receipt=parseHostJson({...acknowledgement,domain:r.domain,scope:'selected-source-history-only',sourceRecordsDeleted:r.action==='purge-source',derivedHistoryDeleted:true,nativeConversationDeleted:false})
          try{await save({result:receipt})}catch(error){return {...record(receipt,'cleanup receipt'),receiptRecording:'failed-or-uncertain',error:String(error)}}
          return receipt
        }
        if(r.action==='query'){record(input,'history query action',['action','query']);if(record(r.query,'history query').kind==='viewer')throw new ResourceError('unsupported','personal viewer history is not exposed by shared owner history; use the original instrument personal view read');const page=await history.query(r.query as unknown as HistoryQuery);let windowRevision:number|null=null,worktreeRevision:number|null=null;try{const raw=await ports.windowStorage.read(view.instance.instrumentInstanceId);windowRevision=raw===undefined?0:memoized(raw,parseWindowDocument).revision}catch(error){signal.throwIfAborted();sourceRefreshFailures.push('windows revision: '+String(error))}try{worktreeRevision=(await (await openWorktrees(view)).query(view.instance)).revision}catch(error){signal.throwIfAborted();sourceRefreshFailures.push('worktrees revision: '+String(error))}signal.throwIfAborted();return {...page,sourceRevisions:{records:records?.revision??null,windows:windowRevision,worktrees:worktreeRevision},sourceRefresh:{status:sourceRefreshFailures.length?'unknown':'current',failures:sourceRefreshFailures}}}
        if(r.action==='detail'){record(input,'history detail action',['action','historyIds']);const detail=await history.detail(array(r.historyIds,'historyIds').map(value=>id(value,'historyId')));signal.throwIfAborted();return {...detail,sourceRefresh:{status:sourceRefreshFailures.length?'unknown':'current',failures:sourceRefreshFailures}}}
        if(r.action==='compact'){record(input,'history compact action',['action']);return history.compact()}
        if(r.action==='set-context'||r.action==='purge'){
          const result=await history.apply(input as unknown as HistoryAction,{kind:'authored',domain:'history-actions',author:parseHostJson(caller),recordedAt:null,coverage:'recorded-history'},signal)
          return r.action==='purge'?{...result,scope:'derived-session-history',sourceRecordsDeleted:false,nativeConversationDeleted:false}:result
        }
        throw new ControlsError('invalid-input','unknown history action; accepted actions: query, detail, set-context, purge, compact, compact-source, purge-source')
      })
    },
    async worktreeAction(caller,sessionId,input,signal){
      const r=record(input,'worktree action'),view=await identity(caller,sessionId,signal)
      if((await scope(caller.principalId,sessionId,view)).kind!=='coordinator')denied('worktree registry requires actual owner coordinator')
      const registry=await openWorktrees(view)
      return track(view.instance.instrumentInstanceId,async()=>{
        await check(caller,sessionId,signal)
        if(r.action==='read'){record(input,'worktree read',['action']);return registry.query(view.instance)}
        if(r.action==='update'){record(input,'worktree update',['action','command']);return registry.updateBusiness(view.instance,caller,r.command as unknown as WorktreeBindingBusinessUpdate)}
        if(r.action==='update-observation'){record(input,'worktree observation update',['action','command']);return (await openObservations(view)).updateBusiness(view.instance,caller,r.command as unknown as WorktreeObservationBusinessUpdate)}
        if(r.action==='reconcile'){
          record(input,'worktree reconcile',['action','operationId']);const operationId=id(r.operationId,'operationId'),row=(await registry.query(view.instance)).rows.find(row=>row.value.operationId===operationId)
          if(!row)throw new ControlsError('invalid-input','unknown binding operation')
          let header=null
          try{if(ports.liveAgent(row.value.plannedChildSessionId)&&(!ports.flushSession||!await ports.flushSession(row.value.plannedChildSessionId,signal)))throw new ControlsError('storage-uncertain','live child native checkpoint unavailable');const facts=await ports.sessionFacts(row.value.plannedChildSessionId,signal);if(facts.header.origin==='subagent'&&facts.header.parentSession&&typeof facts.header.cwd==='string')header={sessionId:facts.header.id,parentSessionId:facts.header.parentSession,cwd:facts.header.cwd}}catch(error){signal.throwIfAborted();if(!(error instanceof ControlsError)||error.code!=='unknown-session')throw error}
          return registry.reconcile(view.instance,operationId,header,caller)
        }
        throw new ControlsError('invalid-input','unknown worktree action; accepted actions: read, update, update-observation, reconcile')
      })
    },
    async delegate(caller,input,exec){
      if(caller.kind!=='agent'||caller.sessionId===null)denied('delegation requires actual native agent')
      const r=record(input,'delegation',['description','prompt','provider','worktree','operationId','workflowId','ticketIds'])
      if(typeof r.description!=='string'||!r.description.trim()||typeof r.prompt!=='string'||!r.prompt.trim())throw new ControlsError('invalid-input','description and prompt are required text')
      const provider=r.provider??'spawn';if(provider!=='spawn'&&provider!=='fork')throw new ControlsError('invalid-input','unsupported provider; accepted provider values: spawn, fork')
      const operationId=id(r.operationId??exec.callId,'operationId'),view=await identity(caller,caller.sessionId,exec.signal)
      const workflowId=r.workflowId===undefined?null:id(r.workflowId,'workflowId'),ticketIds=r.ticketIds===undefined?[]:array(r.ticketIds,'ticketIds').map(value=>id(value,'ticketId'))
      if(new Set(ticketIds).size!==ticketIds.length||workflowId===null&&ticketIds.length>0)throw new ControlsError('invalid-input','invalid assignment set: ticketIds must be unique and require an explicit workflowId')
      const checkGrant=async()=>{await check(caller,caller.sessionId!,exec.signal);const permission=await scope(caller.principalId,caller.sessionId!,await controls.readSession(caller.principalId,caller.sessionId!));if(permission.kind==='assigned'&&((workflowId!==null&&permission.workflowId!==workflowId)||ticketIds.some(ticket=>!permission.ticketIds.includes(ticket))))denied('delegation exceeds actual parent assignment scope');if(workflowId!==null)for(const ticket of ticketIds)await requireRegisteredTicket(caller,caller.sessionId!,workflowId,ticket)}
      await checkGrant()
      if(workflowId!==null){
        if(ticketIds.length===0)throw new ControlsError('invalid-input','delegation on workflow "'+workflowId+'" must name recorded ticketIds; record the ticket first, or omit workflowId for a ticketless research lane')
      }
      if(!ports.createContinuable)throw new ResourceError('unsupported','native continuable creation is unavailable; no child was requested')
      const cwd=r.worktree===undefined?undefined:typeof r.worktree==='string'&&isAbsolute(r.worktree)&&normalize(r.worktree)===r.worktree&&!r.worktree.includes('\0')?r.worktree:(()=>{throw new ControlsError('invalid-input','worktree must be normalized absolute path')})()
      if(cwd!==undefined&&ports.capabilities.nativeInitialChildCwd!=='supported')throw new ResourceError('unsupported','nativeInitialChildCwd unsupported; no child was requested')
      if(cwd!==undefined){if(!ports.authorizeInitialChildCwd)throw new ResourceError('unsupported','native initial cwd preflight unavailable; no creation intent was written');await ports.authorizeInitialChildCwd(exec,cwd);exec.signal.throwIfAborted();await checkGrant()}
      const fingerprint=createHash('sha256').update(JSON.stringify([caller.sessionId,r.description,r.prompt,provider,r.worktree??null,r.workflowId??null,r.ticketIds??[]])).digest('hex')
      const journal=await ports.openUnitStorage('delegation_'+createHash('sha256').update(view.instance.instrumentInstanceId).digest('hex').slice(0,48),parseDelegationJournal)
      const intent=await queue.run(async()=>{
        await check(caller,caller.sessionId!,exec.signal)
        const raw=await journal.read(),old=raw===undefined?{revision:0,rows:[]}:parseDelegationJournal(raw),prior=old.rows.find(row=>row.operationId===operationId)
        if(prior){if(prior.fingerprint!==fingerprint)throw new ControlsError('operation-conflict','delegation operationId changed request');return {row:prior,replayed:true}}
        const row={operationId,parentSessionId:caller.sessionId!,fingerprint,childId:randomUUID(),result:null}
        if(!await journal.compareAndSwap(old.revision,{revision:increment(old.revision),rows:[...old.rows,row]}))throw new ControlsError('concurrent-update','delegation intent changed')
        return {row,replayed:false}
      })
      const saveResult=async(result:HostJson)=>queue.run(async()=>{const old=parseDelegationJournal(await journal.read());if(!await journal.compareAndSwap(old.revision,{revision:increment(old.revision),rows:old.rows.map(row=>row.operationId===operationId?{...row,result}:row)}))throw new ControlsError('concurrent-update','delegation outcome changed')})
      // Current verifiable state is reported separately from the original result. Replay only reads;
      // it never creates, grants or rewrites history. An unreadable recovery is null, not a failure.
      const recoveryFor=async(childId:string):Promise<DelegationRecovery|null>=>{
        try{
          const bindingRow=(await (await openWorktrees(view)).query(view.instance)).rows.find(row=>row.value.operationId===operationId)
          const assignmentRow=(await load()).assignments.find(row=>row.sessionId===childId)
          return freeze({binding:delegationBinding(bindingRow),assignment:delegationAssignment(assignmentRow,view.instance.instrumentInstanceId,workflowId,ticketIds)})
        }catch{return null}
      }
      if(intent.replayed){
        if(intent.row.result!==null){
          // Legacy results lack the effect fields: only a recorded result proves the binding and
          // grant; a failed/unknown recording is never upgraded by inference. Current readable
          // state belongs in recovery, never in the original result.
          const saved=record(intent.row.result,'delegation result'),recorded=saved.recording==='recorded'
          const childId=typeof saved.childId==='string'?saved.childId:intent.row.childId
          return parseHostJson({...saved,...(saved.creation===undefined&&saved.accepted===true?{creation:'accepted'}:{}),...(saved.binding===undefined?{binding:recorded?'confirmed':'unknown'}:{}),...(saved.assignment===undefined?{assignment:recorded?'granted':'unknown'}:{}),replayed:true,recovery:await recoveryFor(childId)})
        }
        let accepted:boolean|null=null
        try{if((await (await openWorktrees(view)).query(view.instance)).rows.some(row=>row.value.operationId===operationId&&row.value.acceptance==='accepted'))accepted=true}catch{/* An unreadable binding leaves acceptance unknown; nothing is dispatched. */}
        return parseHostJson({accepted,childId:intent.row.childId,replayed:true,recording:'unknown',...(accepted===true?{creation:'accepted'}:{}),binding:'unknown',assignment:'unknown',recovery:await recoveryFor(intent.row.childId)})
      }
      await checkGrant()
      const registry=await openWorktrees(view)
      if(registry){const registered=await queue.run(()=>registry.registerIntent(view.instance,caller,{operationId,parentSessionId:caller.sessionId!,plannedChildSessionId:intent.row.childId,requestedCwd:cwd??null,task:r.description as string,...(ticketIds.length===0?{}:{ticketIds})}));if(!registered.dispatch)return parseHostJson({accepted:registered.row.value.acceptance==='accepted'?true:null,childId:intent.row.childId,replayed:true,recording:'unknown',...(registered.row.value.acceptance==='accepted'?{creation:'accepted'}:{}),binding:delegationBinding(registered.row),assignment:'unknown',recovery:await recoveryFor(intent.row.childId)})}
      await checkGrant()
      let dispatch:Dispatch|null=null
      if(view.policy.extensionEnabled&&view.policy.features.windows.requested){
        try{
          const reservation=await track(view.instance.instrumentInstanceId,()=>windowsProgram.reserveExecution(caller.principalId,caller.sessionId!,{operationId:'delegate-reserve:'+operationId,executionId:operationId,workflowId,localTicketId:ticketIds.length===1?ticketIds[0]!:null}))
          if(reservation.replayed||!reservation.dispatchable)throw new ControlsError('operation-conflict','delegation reservation replay is not permission to redispatch')
          dispatch={caller,exec,instance:view,token:reservation.token,workflowId,ticketIds,children:new Set(),live:new Set(),released:false,accepting:true}
        }catch(error){exec.signal.throwIfAborted();if(error instanceof ControlsError&&['access-denied','invalid-input','operation-conflict'].includes(error.code)){if(registry)try{await queue.run(()=>registry.recordOutcome(view.instance,operationId,{acceptance:'unknown',outcome:'failed',diagnostic:String(error)},caller))}catch{/* A refused reservation still reports its failed intent. */}throw error}}
      }
      let receipt:Awaited<ReturnType<NonNullable<HostPorts['createContinuable']>>>
      try{const create=()=>ports.createContinuable!(exec,{provider,label:r.description as string,prompt:r.prompt as string,childId:intent.row.childId,...(cwd===undefined?{}:{cwd})});receipt=await (dispatch?nativeDispatch.run(dispatch,create):create())}
      catch(error){if(registry)try{await queue.run(()=>registry.recordOutcome(view.instance,operationId,{acceptance:'unknown',outcome:exec.signal.aborted?'cancelled':'failed',diagnostic:String(error)},caller))}catch{/* Preserve native failure and no replay dispatch. */}if(dispatch)try{await track(view.instance.instrumentInstanceId,()=>sendReceipt(dispatch!.token,'unknown'))}catch{}throw error}
      finally{if(dispatch)dispatch.accepting=false}
      if(dispatch&&dispatch.children.size===0)try{await track(view.instance.instrumentInstanceId,()=>sendReceipt(dispatch!.token,'unknown'))}catch{}
      // The receipt already proved native acceptance: every later metadata failure keeps the
      // child identity and reports which effect actually happened. No post-acceptance path creates
      // again or grants implicitly.
      let binding:DelegationBinding='unknown',assignment:DelegationAssignment='not-attempted'
      try{
        if(receipt.childId!==intent.row.childId){binding='unconfirmed';throw new ControlsError('association-conflict','native child differs from planned identity')}
        try{if(registry&&(!ports.flushSession||!await ports.flushSession(receipt.childId,exec.signal)))throw new ControlsError('storage-uncertain','accepted child native header checkpoint unavailable')}
        catch(error){binding='unknown';throw error}
        const facts=await (async()=>{try{return await ports.sessionFacts(receipt.childId,exec.signal)}catch(error){binding=error instanceof ControlsError&&error.code==='unknown-session'?'unconfirmed':'unknown';throw error}})()
        if(facts.header.origin!=='subagent'||facts.header.parentSession!==caller.sessionId){binding='unconfirmed';throw new ControlsError('association-conflict','native parent differs from actual caller')}
        if(registry&&typeof facts.header.cwd!=='string'){binding='unconfirmed';throw new ControlsError('association-conflict','native child cwd is unavailable')}
        if(registry){
          try{await queue.run(()=>registry.confirm(view.instance,operationId,{sessionId:facts.header.id,parentSessionId:facts.header.parentSession!,cwd:facts.header.cwd!},caller))}
          catch(error){binding=storageUncertain(error)?'unknown':'unconfirmed';throw error}
        }
        binding='confirmed'
        // Assignment is a separate effect after a confirmed binding: a submission failure neither
        // rolls the binding back nor changes the accepted child identity.
        try{await facade.assign!(caller,{sessionId:receipt.childId,workflowId,ticketIds},exec.signal)}
        catch(error){assignment=storageUncertain(error)?'unknown':'failed';throw error}
        assignment='granted'
      }catch(error){
        if(registry&&binding!=='confirmed')try{await queue.run(()=>registry.recordOutcome(view.instance,operationId,{acceptance:'accepted',outcome:'accepted-unknown',diagnostic:String(error)},caller))}catch{/* Preserve the accepted child identity and the failed effect. */}
        const failed=parseHostJson({accepted:true,childId:receipt.childId,messageId:receipt.messageId,replayed:false,recording:'failed',creation:'accepted',binding,assignment,diagnostic:String(error)})
        try{await saveResult(failed)}
        catch{return parseHostJson({...record(failed,'delegation result'),persistence:'failed'})}
        return failed
      }
      const result=parseHostJson({accepted:true,childId:receipt.childId,messageId:receipt.messageId,replayed:false,recording:'recorded',creation:'accepted',binding:'confirmed',assignment:'granted'})
      try{await saveResult(result)}
      catch(error){return parseHostJson({...record(result,'delegation result'),recording:'failed',persistence:'failed',diagnostic:String(error)})}
      return result
    },
    async assign(caller,input,signal){
      const r=record(input,'task delegation',['sessionId','workflowId','ticketIds']),target=id(r.sessionId,'child sessionId'),workflowId=optionalTicketId(r.workflowId,'workflowId')
      const ticketIds=r.ticketIds===undefined?[]:array(r.ticketIds,'ticketIds').map(value=>id(value,'ticketId'))
      if(new Set(ticketIds).size!==ticketIds.length||workflowId===null&&ticketIds.length>0)throw new ControlsError('invalid-input','invalid assignment set: ticketIds must be unique and require an explicit workflowId')
      const parent=await identity(caller,caller.sessionId!,signal),facts=await ports.sessionFacts(target,signal)
      if(facts.header.origin!=='subagent'||facts.header.parentSession!==caller.sessionId)denied('task grant requires actual direct managed child')
      const child=await controls.ensureSession(ports.operatorPrincipal,target)
      if(child.instance.instrumentInstanceId!==parent.instance.instrumentInstanceId)denied('cannot grant another owner instance')
      return track(parent.instance.instrumentInstanceId,async()=>{
        await check(caller,caller.sessionId!,signal);signal.throwIfAborted()
        const currentParent=await controls.readSession(caller.principalId,caller.sessionId!),currentChild=await controls.readSession(ports.operatorPrincipal,target)
        if(currentParent.instance.instrumentInstanceId!==currentChild.instance.instrumentInstanceId)denied('task grant identity changed')
        return update(async old=>{
          const permission=await effectiveScope(old,caller.sessionId!,currentParent)
          const actual=await ports.sessionFacts(target,signal)
          if(actual.header.origin!=='subagent'||actual.header.parentSession!==caller.sessionId)denied('task grant parent changed')
          if(permission.kind==='assigned'&&((workflowId!==null&&permission.workflowId!==workflowId)||ticketIds.some(t=>!permission.ticketIds.includes(t))))denied('delegation exceeds current actual parent assignment')
          if(workflowId!==null)for(const ticket of ticketIds)await requireRegisteredTicket(caller,caller.sessionId!,workflowId,ticket)
          return {...old,assignments:[...old.assignments.filter(a=>a.sessionId!==target),{sessionId:target,parentSessionId:caller.sessionId!,instrumentInstanceId:currentParent.instance.instrumentInstanceId,workflowId,ticketIds}]}
        })
      })
    },
    async dispose(){closing=true;notificationLifetime.abort();observationLifetime.abort();guard();await Promise.allSettled([...notificationFlights.values()]);await queue.drain();nativeDispatch.disable();cachedSessions.clear();nativeWindows.clear();baselines.clear();deliveredInStep.clear();managedExecutions.clear()}
  }
  // Reconstruct only metadata/known host objects. Never resume a cold session for a dashboard.
  for(const agent of ports.liveAgents()){
    const caller:HostCaller={kind:'agent',principalId:'agent:'+agent.id,sessionId:agent.id}
    try{const view=await identity(caller,agent.id);await track(view.instance.instrumentInstanceId,()=>initialize(view));if(!readmitted.has(view.instance.instrumentInstanceId)){readmitted.add(view.instance.instrumentInstanceId);await readmitPersistedLanes(view)}if(view.instance.ownerSessionId===agent.id)scheduleNotification(agent.id,true)}catch(error){if(!(error instanceof ControlsError)||!['unknown-session','unknown-workspace'].includes(error.code))throw error}
  }
  return facade
}
