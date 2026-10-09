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
import type { InstrumentAuthority, InstrumentScope } from './controls/instruments.js'
import { SessionWindows, parseWindowDocument } from './controls/windows.js'
import type { ExecutionToken, WindowProgramPort, WindowCompactRequest, WindowPurgeRequest } from './controls/windows.js'
import { InstrumentConsumption } from './controls/consumption.js'
import type { ConsumptionIdentity, ConsumptionProgramPort } from './controls/consumption.js'
import { createResourceModule, ResourceError } from './controls/resources.js'
import { concreteGitAdapter } from './controls/git-worktrees.js'
import { INITIAL_RUNTIME_DOCUMENT, parseRuntimeDocument } from './controls/runtime-state.js'
import type { RuntimeDocument, RuntimeStorage, TaskAssignment } from './controls/runtime-state.js'
import { parseHostJson, parseResourceAction } from './controls/remote-contract.js'
import type { HostCaller, HostJson, ResourceAction, RuntimeSnapshot } from './controls/remote-contract.js'
import type { InstrumentCommand, InstrumentCompactInput, InstrumentPurgeHistoryInput } from './controls/instrument-state.js'
import type { TicketWindowCommand } from './controls/windows.js'
import type { PolicyIntent } from './controls/policy.js'
import { array, ControlsError, freeze, id, increment, isPreCommitRejection, record, revision , memoized } from './controls/validation.js'
import { RefreshGate } from './controls/refresh-gate.js'
import { resolvePolicy } from './controls/policy.js'
import { createWorktreeBindings, parseWorktreeBindingsDocument } from './controls/worktree-bindings.js'
import type { WorktreeBindingsDocument, WorktreeBindingBusinessUpdate, WorktreeBindingsCompact, WorktreeBindingsPurgeHistory } from './controls/worktree-bindings.js'
import { SessionHistory, parseHistoryDocument } from './controls/history.js'
import type { HistoryDocument, HistoryObservation, HistoryAction, HistoryQuery } from './controls/history.js'

function canonical(value:unknown):string {return value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(canonical).join(',')+']':'{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,entry])=>JSON.stringify(key)+':'+canonical(entry)).join(',')+'}'}
interface DelegationJournal { readonly revision:number; readonly rows:readonly {readonly operationId:string;readonly parentSessionId:string;readonly fingerprint:string;readonly childId:string;readonly result:HostJson|null}[] }
function parseDelegationJournal(input:unknown):DelegationJournal {
  const d=record(input,'delegation journal',['revision','rows'])
  return freeze({revision:revision(d.revision,'delegation revision'),rows:array(d.rows,'delegations').map(value=>{const r=record(value,'delegation',['operationId','parentSessionId','fingerprint','childId','result']);return {operationId:id(r.operationId,'operationId'),parentSessionId:id(r.parentSessionId,'parent'),fingerprint:id(r.fingerprint,'fingerprint'),childId:id(r.childId,'childId'),result:r.result===null?null:parseHostJson(r.result)}})})
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
export interface RuntimeOptions { readonly runtimeId?: string; readonly consumptionTimeoutMs?: number }
export async function createRuntime(ports:HostPorts,options:RuntimeOptions={}):Promise<RuntimeFacade> {
  const runtimeId=id(options.runtimeId??randomUUID(),'runtimeId'), queue=new OrderedEffects()
  const refresh=new RefreshGate(2_000), project=new RefreshGate(2_000)
  // The polling path (client readSession) rebuilds the whole projection and appends another
  // history observation per call — measured 68 readSession/s and 40-50 captures/s on an
  // otherwise idle profile, with per-row JSON stringification as the top self frame. The
  // projection is a pure function of the documents plus this process's mutations, so the
  // same watermark serves it: unchanged revisions and no mutation means the frozen value is
  // still the current projection.
  const projectionCache=new Map<string,{readonly key:string;readonly value:RuntimeSnapshot}>()
  const touchState=():void=>{refresh.touch();project.touch()}
  const controls=new WorkspaceControls(ports.controlsStorage,ports.authority)
  const storage=await ports.openRuntimeStorage(parseRuntimeDocument)
  const nativeDispatch=new AsyncLocalStorage<Dispatch>()
  const cachedSessions=new Map<string,SessionControlsView>(), nativeWindows=new Map<string,boolean>()
  const exactExecutions=new WeakMap<Agent,Dispatch>(), initialized=new Set<string>()
  // A continuable child is disposed between runs and re-created when it is woken, so the same child
  // session can run several times under one dispatch. Managed executions are therefore indexed by child
  // session as well: a wake re-admits the lane into the running window instead of reading as unmanaged.
  const managedExecutions=new Map<string,Dispatch>(), reattached=new WeakMap<Agent,Dispatch>()
  const worktreeStores=new Map<string,VersionedStorage<WorktreeBindingsDocument>>()
  const worktrees=createWorktreeBindings(owner=>{const store=worktreeStores.get(owner);if(!store)throw new ControlsError('invalid-state','worktree storage unopened');return store})
  const openWorktrees=async(view:SessionControlsView)=>{const owner=view.instance.ownerSessionId;if(!worktreeStores.has(owner))worktreeStores.set(owner,await ports.openUnitStorage('worktrees_'+createHash('sha256').update(view.instance.instrumentInstanceId).digest('hex').slice(0,48),parseWorktreeBindingsDocument));return worktrees}
  const historyStores=new Map<string,Promise<VersionedStorage<HistoryDocument>>>()
  const historyFor=async(view:SessionControlsView)=>{
    const key=view.instance.instrumentInstanceId
    let store=historyStores.get(key)
    if(!store){store=ports.openUnitStorage('history_'+createHash('sha256').update(key).digest('hex').slice(0,56),parseHistoryDocument);historyStores.set(key,store)}
    return new SessionHistory(view.instance,await store)
  }
  const historyFailures=new Map<string,string>()
  const captureBusiness=async(view:SessionControlsView,records:RuntimeSnapshot['records'])=>{
    if(!records)return
    const observations:HistoryObservation[]=[]
    for(const [kind,rows]of [['workflow',records.workflows],['ticket',records.tickets],['decision',records.decisions]] as const){
      for(const row of rows){const recordId=kind==='workflow'?row.workflowId:JSON.stringify([row.workflowId,'localTicketId' in row?row.localTicketId:'decisionId' in row?row.decisionId:null])
        for(const h of row.history)observations.push({kind,recordId,recordKey:recordId,version:h.revision,snapshot:parseHostJson(h.value),source:{kind:'authored',domain:'instruments',author:parseHostJson(h.author),recordedAt:h.recordedAt,coverage:'recorded-history'},...(kind==='decision'?{flags:{done:!('pending' in h.value&&h.value.pending===true)&&!('awaitingImplementation' in h.value&&h.value.awaitingImplementation===true)}}:{})})
      }
    }
    await (await historyFor(view)).capture(observations)
  }
  // History capture is a side effect of reading the projection, not a change of it: the
  // fingerprint is computed after the capture, so invalidating here would rebuild on every
  // read and never converge. Only real document mutations touch the gate.
  const captureSafely=async(view:SessionControlsView,effect:()=>Promise<void>)=>{try{await effect();historyFailures.delete(view.instance.instrumentInstanceId)}catch(error){historyFailures.set(view.instance.instrumentInstanceId,String(error).slice(0,1024))}}
  const captureCurrent=async(view:SessionControlsView,items:readonly {kind:string;recordId:string;version:number;snapshot:unknown;domain:string;author?:HostCaller}[])=>{
    const history=await historyFor(view),store=await historyStores.get(view.instance.instrumentInstanceId)!,raw=await store.read(),prior=raw===undefined?[]:parseHistoryDocument(raw).rows
    const observations:HistoryObservation[]=[]
    for(const item of items){
      const snapshot=parseHostJson(item.snapshot),last=prior.filter(row=>row.kind===item.kind&&row.recordId===item.recordId&&row.sourceDomain===item.domain).at(-1)
      if(last&&(last.purged&&item.version<=last.version||!last.purged&&canonical(last.snapshot)===canonical(snapshot)))continue
      observations.push({kind:item.kind,recordId:item.recordId,recordKey:item.recordId,version:item.version,snapshot,source:{kind:last?'program':'snapshot',domain:item.domain,author:item.author?parseHostJson(item.author):null,recordedAt:null,coverage:last?'recorded-history':'snapshot-only'}})
    }
    await history.capture(observations)
  }
  const captureRuntime=async(view:SessionControlsView,doc:RuntimeDocument)=>{
    const owner=view.instance.instrumentInstanceId
    await captureCurrent(view,[...doc.assignments.filter(row=>row.instrumentInstanceId===owner).map(row=>({kind:'assignment',recordId:row.sessionId,version:doc.revision,snapshot:row,domain:'runtime'})),
      ...doc.bindings.filter(row=>row.instrumentInstanceId===owner).map(row=>({kind:'execution-binding',recordId:JSON.stringify([row.executionId,row.generation]),version:doc.revision,snapshot:row,domain:'runtime'})),
      ...doc.notifications.filter(row=>row.instrumentInstanceId===owner).map(row=>({kind:'notification',recordId:row.notificationId,version:doc.revision,snapshot:row,domain:'runtime'}))])
  }
  const captureOthers=async(view:SessionControlsView,caller:HostCaller)=>{
    // Raw operation journals are read only after the actual owner scope has been proved.
    if((await scope(caller.principalId,view.association.sessionId,view)).kind!=='coordinator')return
    const observations:HistoryObservation[]=[],raw=await ports.windowStorage.read(view.instance.instrumentInstanceId)
    if(raw!==undefined){const doc=parseWindowDocument(raw)
      if(doc.instrumentInstanceId!==view.instance.instrumentInstanceId||doc.ownerSessionId!==view.instance.ownerSessionId)denied('window history owner mismatch')
      for(const op of (doc.schemaVersion===2?[...doc.retainedOperations,...doc.operations].sort((a,b)=>a.revision-b.revision):doc.operations)){const payload=record(JSON.parse(op.fingerprint),'window source payload'),kind=op.kind==='ticket'?'ticket-window':op.kind==='knowledge'?'runtime-knowledge':'execution',recordId=op.kind==='ticket'?JSON.stringify([payload.workflowId,payload.localTicketId]):op.kind==='knowledge'?view.instance.instrumentInstanceId:JSON.stringify([payload.executionId,op.generation])
        observations.push({kind,recordId,recordKey:op.operationId,version:op.revision,snapshot:parseHostJson({operation:op,payload}),source:{kind:'program',domain:'windows',author:op.caller===null?null:parseHostJson({principalId:op.caller}),recordedAt:null,coverage:'recorded-history'}})
      }
    }
    for(const row of (await (await openWorktrees(view)).query(view.instance)).rows){for(const h of row.history)observations.push({kind:'worktree',recordId:row.bindingId,recordKey:h.operationId,version:h.revision,snapshot:parseHostJson(h.value),source:{kind:h.source==='program'?'program':'authored',domain:'worktree-bindings',author:parseHostJson(h.author),recordedAt:h.recordedAt,coverage:'recorded-history'},flags:{cleanedWorktree:h.value.business.state==='cleaned'}})}
    await (await historyFor(view)).capture(observations)
    await captureRuntime(view,await load())
    await captureCurrent(view,[{kind:'configuration',recordId:view.instance.controlWorkspaceId,version:savedPolicy.revision,snapshot:savedPolicy,domain:'controls'}])
    const resourceRaw=await ports.resourceStorage.read()
    if(resourceRaw!==undefined){const doc=record(resourceRaw,'resource history document');await captureCurrent(view,array(doc.resources,'resources').map(value=>record(value,'resource')).filter(row=>row.ownerInstanceId===view.instance.instrumentInstanceId).map(row=>({kind:'resource',recordId:id(row.resourceId,'resourceId'),version:revision(doc.revision,'resource revision'),snapshot:row,domain:'resources'})))}
  }
  const notificationLifetime=new AbortController()
  let closing=false
  let savedPolicy=await controls.readPolicy(ports.operatorPrincipal)
  let transitioning:PolicyIntent|null=null
  const mayRequireWindows=(policy:PolicyIntent):boolean=>policy.extensionEnabled&&(policy.defaults.windows?.enabled===true||Object.values(policy.workspaceOverrides).some(patch=>patch.windows?.enabled===true))
  const load=async():Promise<RuntimeDocument>=>{const raw=await storage.read();return raw===undefined?INITIAL_RUNTIME_DOCUMENT:memoized(raw,parseRuntimeDocument)}
  const update=async(change:(current:RuntimeDocument)=>RuntimeDocument):Promise<RuntimeDocument>=>{
    for(let attempt=0;attempt<32;attempt++){
      const old=await load(),candidate=change(old)
      if(candidate===old)return old
      const next=parseRuntimeDocument({...candidate,revision:increment(old.revision)})
      if(await storage.compareAndSwap(old.revision,next)){
        touchState()
        for(const owner of new Set([...next.assignments.map(row=>row.instrumentInstanceId),...next.notifications.map(row=>row.instrumentInstanceId)])){
          const view=[...cachedSessions.values()].find(view=>view.instance.instrumentInstanceId===owner)
          if(view)await captureSafely(view,()=>captureRuntime(view,next))
        }
        return next
      }
    }
    throw new ControlsError('concurrent-update','runtime association contention')
  }
  const check=async(caller:HostCaller,sessionId?:string,signal?:AbortSignal)=>{
    if(closing)denied('instrument runtime is disposing')
    signal?.throwIfAborted();await ports.authorizeCaller(caller,sessionId);signal?.throwIfAborted()
  }
  const identity=async(caller:HostCaller,sessionId:string,signal?:AbortSignal,register=true):Promise<SessionControlsView>=>{
    await check(caller,sessionId,signal)
    const read=register?await controls.ensureSession(caller.principalId,sessionId):await controls.readSession(caller.principalId,sessionId)
    const view=read.policy.configurationRevision<savedPolicy.revision?{...read,policy:resolvePolicy(savedPolicy,read.instance.controlWorkspaceId,read.policy.workspaceVerified)}:read
    cachedSessions.set(sessionId,view);nativeWindows.set(sessionId,view.policy.extensionEnabled&&view.policy.features.windows.requested)
    signal?.throwIfAborted();return view
  }
  /** A ticket window may only name tickets this instrument already knows; unverifiable reads never veto work. */
  const registeredTickets=async(caller:HostCaller,sessionId:string):Promise<ReadonlySet<string>|null>=>{
    try{const read=await instruments.read(caller.principalId,sessionId);return new Set(read.tickets.map(row=>row.localTicketId))}
    catch{return null}
  }
  /** Held T slots whose ticket already sits in a terminal status: the agent releases them, nothing else does. */
  function pendingReleaseFor(records:RuntimeSnapshot['records'],windows:RuntimeSnapshot['windows']):readonly {readonly workflowId:string;readonly localTicketId:string;readonly generation:number;readonly label:string|null}[] {
    if(records===null||windows===null)return []
    const terminal=new Map<string,ReadonlySet<string>>(),labels=new Map<string,string>()
    for(const flow of records.workflows){const marks=new Set<string>();for(const axis of flow.value.axes)for(const status of axis.statuses){labels.set(flow.workflowId+'\u0000'+status.statusKey,status.label);if(status.terminal===true)marks.add(status.statusKey)}if(marks.size>0)terminal.set(flow.workflowId,marks)}
    if(terminal.size===0)return []
    const rows:{workflowId:string;localTicketId:string;generation:number;label:string|null}[]=[]
    for(const row of windows.tickets){
      if(!row.held)continue
      const marks=terminal.get(row.workflowId);if(marks===undefined)continue
      const ticket=records.tickets.find(candidate=>candidate.workflowId===row.workflowId&&candidate.localTicketId===row.localTicketId);if(ticket===undefined)continue
      for(const key of Object.values(ticket.value.statuses).flat())if(marks.has(String(key))){rows.push({workflowId:row.workflowId,localTicketId:row.localTicketId,generation:row.generation,label:labels.get(row.workflowId+'\u0000'+String(key))??null});break}
    }
    return rows
  }
  const requireRegisteredTicket=async(caller:HostCaller,sessionId:string,workflowId:string,localTicketId:string):Promise<void>=>{
    const known=await registeredTickets(caller,sessionId)
    if(known===null||known.has(localTicketId))return
    throw new ControlsError('invalid-input','ticket "'+localTicketId+'" is not registered in this instrument; record it with mattpocock_record put-ticket (workflowId "'+workflowId+'", localTicketId "'+localTicketId+'") first, or omit workflowId for a ticketless research lane')
  }
  const scope=async(principal:string,sessionId:string,view:SessionControlsView):Promise<InstrumentScope>=>{
    if(principal===ports.operatorPrincipal||sessionId===view.instance.ownerSessionId)return {kind:'coordinator'}
    const row=(await load()).assignments.find(a=>a.sessionId===sessionId)
    if(row&&row.instrumentInstanceId!==view.instance.instrumentInstanceId)denied('task assignment belongs to another instance')
    return {kind:'assigned',workflowId:row?.workflowId??null,ticketIds:row?.ticketIds??[]}
  }
  const authority:InstrumentAuthority={async resolveAccess(principal,sessionId,instance){
    const caller=callerFor(principal,sessionId,ports.operatorPrincipal)
    await check(caller,sessionId)
    const view=await controls.readSession(principal,sessionId)
    if(view.instance.instrumentInstanceId!==instance.instrumentInstanceId)denied('instrument authority identity mismatch')
    return {author:caller.kind==='user'?{kind:'user',principalId:principal,sessionId:null}:{kind:'agent',principalId:principal,sessionId},scope:await scope(principal,sessionId,view)}
  }}
  const instruments=new SessionInstruments(controls,ports.instrumentStorage,authority)
  let windowsProgram!:WindowProgramPort, consumptionProgram!:ConsumptionProgramPort
  const windows=new SessionWindows(controls,ports.windowStorage,authority,{runtimeId,capability:'cooperative',requireKnownRuntime:false,bindProgram:port=>{windowsProgram=port}})
  const ownerCaller:HostCaller={kind:'user',principalId:ports.operatorPrincipal,sessionId:null}
  const markKnowledge=(view:SessionControlsView,known:boolean,reason:string|null):Promise<unknown>=>windowsProgram.reconcileKnowledge(ports.operatorPrincipal,view.instance.ownerSessionId,{operationId:randomUUID(),state:known?'known':'unknown',reason:known?null:reason??'native-execution-facts-unavailable'})
  const initialize=async(view:SessionControlsView):Promise<void>=>{
    const key=view.instance.instrumentInstanceId
    if(initialized.has(key))return
    const actual=await ports.nativeActivity(view.instance.ownerSessionId)
    // The installed host truthfully reports unsupported complete enumeration. No guessed empty list.
    await markKnowledge(view,actual.known,actual.reason)
    initialized.add(key)
  }
  const resourceModule=(caller:HostCaller,view:SessionControlsView,signal:AbortSignal)=>{
    const getGit=()=>concreteGitAdapter(ports.gitRunnerForSession(view.association.sessionId,signal))
    return createResourceModule({storage:ports.resourceStorage,lifecycle:ports.resourceLifecycle,
      authority:{async authorize(principal,access,resource){
        if(principal!==caller.principalId)denied('resource caller mismatch')
        await check(caller,view.association.sessionId,signal)
        const current=await controls.readSession(principal,view.association.sessionId),permission=await scope(principal,view.association.sessionId,current)
        if(resource&&resource.ownerInstanceId!==current.instance.instrumentInstanceId)denied('resource belongs to another owner')
        if(permission.kind!=='coordinator')denied('legacy resource access requires actual owner coordinator')
        if((access==='create'||access==='borrow')&&current.policy.features.binding.status!=='configured')throw new ControlsError('feature-disabled','new worktree resources require enabled binding intent')
        if(access==='retire'&&current.policy.features.lifecycle.status!=='configured')throw new ControlsError('feature-disabled','physical retirement requires enabled lifecycle intent')
        return {controlWorkspaceId:current.instance.controlWorkspaceId,instrumentInstanceId:current.instance.instrumentInstanceId,authorId:principal}
      }},git:{planCreate:(spec,s)=>getGit().planCreate(spec,s),create:(planned,s)=>getGit().create(planned,s),borrow:(path,s)=>getGit().borrow(path,s),inspect:(r,s)=>getGit().inspect(r,s),retire:(r,d,s)=>getGit().retire(r,d,s)}})
  }
  const snapshot=async(caller:HostCaller,sessionId:string,signal:AbortSignal):Promise<RuntimeSnapshot>=>queue.run(async()=>{
    const view=await identity(caller,sessionId,signal,false)
    const permission=await scope(caller.principalId,sessionId,view)
    const projectionBase=caller.principalId+'|'+sessionId
    const projectionKey=projectionBase+'|'+view.documentRevision+'|'+savedPolicy.revision
    const epoch=project.epoch()
    const projection=projectionCache.get(projectionBase)
    if(projection!==undefined&&projection.key===projectionKey&&!project.shouldRefresh(projectionBase))return projection.value
    const health: {scope:string;status:string;reason:string|null}[]=[]
    let records:RuntimeSnapshot['records']=null,windowView:RuntimeSnapshot['windows']=null,resources:RuntimeSnapshot['resources']=[]
    try{records=await instruments.read(caller.principalId,sessionId)}catch(error){signal.throwIfAborted();health.push({scope:'records',status:'unknown',reason:String(error)})}
    try{windowView=await windows.read(caller.principalId,sessionId)}catch(error){signal.throwIfAborted();health.push({scope:'windows',status:'unknown',reason:String(error)})}
    try{if(permission.kind==='coordinator')resources=await resourceModule(caller,view,signal).resources.list(caller.principalId,signal);else health.push({scope:'resources',status:'restricted',reason:'coordinator registry is not assigned-child task data'})}catch(error){signal.throwIfAborted();health.push({scope:'resources',status:'unknown',reason:String(error)})}
    let worktreeBindings:NonNullable<RuntimeSnapshot['worktreeBindings']>=[]
    try{if(permission.kind==='coordinator')worktreeBindings=(await (await openWorktrees(view)).query(view.instance)).current.map(row=>({...row,cleanupDue:row.value.business.state!=='cleaned'&&row.value.actualChildSessionId!==null&&ports.liveAgent(row.value.actualChildSessionId)===undefined}));else health.push({scope:'worktree-bindings',status:'restricted',reason:'coordinator registry is not assigned-child task data'})}catch(error){signal.throwIfAborted();health.push({scope:'worktree-bindings',status:'unknown',reason:String(error)})}
    try{const notifications=(await load()).notifications.filter(n=>n.instrumentInstanceId===view.instance.instrumentInstanceId);const pending=notifications.filter(n=>n.state==='pending').length,accepted=notifications.filter(n=>n.state==='accepted').length
      health.push({scope:'notifications',status:pending>0?'pending':accepted>0?'accepted':'current',reason:pending>0||accepted>0?'pending='+pending+', accepted-not-consumed='+accepted:null})
    }catch(error){signal.throwIfAborted();health.push({scope:'notifications',status:'unknown',reason:String(error).slice(0,1024)})}
    await captureSafely(view,async()=>{await captureBusiness(view,records);await captureOthers(view,caller)})
    const historyFailure=historyFailures.get(view.instance.instrumentInstanceId);if(historyFailure)health.push({scope:'history',status:'unknown',reason:historyFailure})
    if(windowView&&!windowView.runtimeKnowledge.known)health.push({scope:'execution-admission',status:'unsupported',reason:windowView.runtimeKnowledge.reason})
    signal.throwIfAborted()
    const grants=await ports.readPolicyGrants(),managed=new Set([view.instance.ownerSessionId,...(await load()).assignments.filter(row=>row.instrumentInstanceId===view.instance.instrumentInstanceId).map(row=>row.sessionId)])
    const value=freeze({sessionId,caller,policyGrants:{...grants,grants:grants.grants.filter(row=>managed.has(row.sessionId))},instance:view.instance,policy:view.policy,records,windows:windowView,resources,worktreeBindings,pendingRelease:pendingReleaseFor(records,windowView),
      capabilities:Object.entries(ports.capabilities).map(([key,status])=>({key,status,reason:status==='unsupported'?key+'-host-seam-unavailable':null})),health})
    project.record(projectionBase,epoch)
    projectionCache.delete(projectionBase);projectionCache.set(projectionBase,{key:projectionKey,value})
    while(projectionCache.size>64)projectionCache.delete(projectionCache.keys().next().value as string)
    return value
  })
  const activeSnapshot=async(caller:HostCaller,signal:AbortSignal):Promise<RuntimeSnapshot & {readonly contextConclusions?:readonly {decisionId:string;workflowId:string;result:string;sourceRevision:number;source:unknown}[]}>=>{
    const current=await snapshot(caller,caller.sessionId!,signal),view=await identity(caller,caller.sessionId!,signal,false)
    const records=current.records
    if(!records||current.health.some(row=>row.scope==='history'&&row.status==='unknown'))return current
    try{
      const rows=await (await historyFor(view)).activeContext(),included=new Set(rows.map(row=>JSON.stringify([row.kind,row.recordId])))
      const workflows=records.workflows.filter(row=>included.has(JSON.stringify(['workflow',row.workflowId])))
      const tickets=records.tickets.filter(row=>included.has(JSON.stringify(['ticket',JSON.stringify([row.workflowId,row.localTicketId])])))
      const decisions=records.decisions.filter(row=>row.value.pending===true||row.value.awaitingImplementation===true)
      const contextConclusions=records.decisions.filter(row=>row.value.pending!==true&&row.value.awaitingImplementation!==true&&typeof row.value.result==='string'&&included.has(JSON.stringify(['decision',JSON.stringify([row.workflowId,row.decisionId])]))).map(row=>({decisionId:row.decisionId,workflowId:row.workflowId,result:row.value.result!,sourceRevision:row.revision,source:{kind:'authored',domain:'instruments',author:row.history.at(-1)?.author??null,recordedAt:row.history.at(-1)?.recordedAt??null}}))
      const statusCounts=records.summary.statusCounts.filter(row=>workflows.some(w=>w.workflowId===row.workflowId)).map(row=>{const active=tickets.filter(ticket=>ticket.workflowId===row.workflowId);return {...row,unreported:active.filter(ticket=>(ticket.value.statuses[row.axisKey]??[]).length===0).length,statuses:row.statuses.map(status=>({...status,count:active.filter(ticket=>ticket.value.statuses[row.axisKey]?.includes(status.statusKey)).length}))}})
      return {...current,records:{...records,workflows,tickets,decisions,changes:[],summary:{...records.summary,totalTickets:tickets.length,statusCounts}},contextConclusions}
    }catch(error){signal.throwIfAborted();return {...current,health:[...current.health,{scope:'active-context',status:'unknown',reason:String(error)}]}}
  }
  const consumption=new InstrumentConsumption({...(options.consumptionTimeoutMs===undefined?{}:{timeoutMs:options.consumptionTimeoutMs}),
    bindProgram:port=>{consumptionProgram=port},readSnapshot:async(caller,signal)=>activeSnapshot(callerFor(caller.principalId,caller.sessionId,ports.operatorPrincipal),signal)})
  // Resource rejections in the tracked paths are raised before any write (unknown or foreign
  // resource, unsupported legacy action), so they settle like other pre-commit rejections.
  const preCommit=(error:unknown):boolean=>isPreCommitRejection(error)||error instanceof ResourceError
  const track=<T>(instanceId:string,effect:()=>Promise<T>):Promise<T>=>{
    touchState()
    const commit=queue.run(effect)
    // The frontier guards reads against acknowledged-but-unpersisted writes. A command that
    // was rejected before its durable write claims nothing, so it must not degrade the next
    // snapshot to unknown durability. Real write outcomes stay unknown.
    consumptionProgram.trackCommit(instanceId,commit.then(()=>undefined,error=>{if(preCommit(error))return;throw error}))
    return commit
  }
  const consumptionIdentity=(caller:HostCaller,view:SessionControlsView):ConsumptionIdentity=>({principalId:caller.principalId,sessionId:view.association.sessionId,instrumentInstanceId:view.instance.instrumentInstanceId,ownerSessionId:view.instance.ownerSessionId})
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
  const baselines=new Map<string,{readonly agent:Agent;readonly session:Agent['session'];readonly message:UserMessage;readonly text:string}>()
  // The host may assemble one admitted model request several times, and a PTC step may complete
  // several nested dispatches; all of them share one turn:step identity. Those passes can be seconds
  // apart while other sessions keep changing the facts, and a message queued during the step is not
  // yet visible to the host visibility oracle, so delivering every pass would put a burst of
  // near-identical full snapshots into one request. A bounded current view is delivered at most once
  // per admitted step; later passes are suppressed and the newest facts reach the model with the next
  // admitted step (its own instrument tool results still carry the state their call produced).
  let stepSerial=0,currentStepKey='serial:0'
  const deliveredInStep=new Map<string,{readonly step:string;readonly text:string}>()
  // A persistent association or policy-storage failure must not append the same notice at every
  // step and every tool result: the notice reuses the snapshot baseline and visibility rule.
  const failureReason=(error:unknown):string=>error instanceof ControlsError?error.code:error instanceof ResourceError?error.code:'internal-error'
  const installSnapshot=(caller:HostCaller,acceptedMessages:readonly UserMessage[],text:string,baselineKey:string):readonly UserMessage[]=>{
    const delivered=deliveredInStep.get(baselineKey)
    if(delivered!==undefined&&delivered.step===currentStepKey)return []
    const agent=ports.liveAgent(caller.sessionId!),baseline=baselines.get(baselineKey)
    if(agent&&baseline&&baseline.text===text&&baseline.agent===agent&&baseline.session===agent.session){
      if(acceptedMessages.some(message=>message.id===baseline.message.id&&canonical({source:message.source,content:message.content})===canonical({source:baseline.message.source,content:baseline.message.content})))return []
      try{if(ports.snapshotVisible?.(caller,agent,baseline.message)===true)return []}catch{/* Unavailable visibility never proves delivery. */}
    }
    const message=ports.makeSnapshotMessage(text)
    if(agent)baselines.set(baselineKey,{agent,session:agent.session,message,text})
    else baselines.delete(baselineKey)
    deliveredInStep.set(baselineKey,{step:currentStepKey,text})
    return [message]
  }
  const deliverFailure=(caller:HostCaller,acceptedMessages:readonly UserMessage[],error:unknown):readonly UserMessage[]=>installSnapshot(caller,acceptedMessages,
    'Instrument context unavailable: '+failureReason(error)+'. Accepted business input is retained; missing facts are not execution capacity or business completion proof.',
    'unavailable|'+caller.principalId+'|'+caller.sessionId)
  const prepare=async(caller:HostCaller,signal:AbortSignal,acceptedMessages:readonly UserMessage[]=[])=>{
    if(caller.sessionId===null)return []
    let view:SessionControlsView
    try{const saved=await controls.readPolicy(caller.principalId)
      const retained=cachedSessions.get(caller.sessionId)
      if(!saved.extensionEnabled&&!retained)return []
      view=await identity(caller,caller.sessionId,signal)}catch(error){
      signal.throwIfAborted()
      // A retained association can still serve its last captured snapshot: only the reason changes.
      const retained=cachedSessions.get(caller.sessionId)
      const held=retained===undefined?null:consumption.degraded(consumptionIdentity(caller,retained),failureReason(error))
      if(held!==null)return installSnapshot(caller,acceptedMessages,held,'held|'+caller.principalId+'|'+caller.sessionId)
      return deliverFailure(caller,acceptedMessages,error)
    }
    const key=consumptionIdentity(caller,view)
    // Rebuilding the projection re-reads every document, clones it and appends a history
    // observation, per step *and* per tool result (measured: 32 of 41 rebuilds produced no
    // message at all). The gate watches the revisions this projection derives from plus an
    // epoch bumped by every runtime/window mutation; while they are unchanged the verified
    // projection is reused. Delivery is still decided below, so an undelivered snapshot is
    // re-offered exactly as before, and a degraded cache still takes the full read.
    const refreshKey=caller.principalId+'|'+view.association.sessionId+'|'+view.documentRevision+'|'+savedPolicy.revision
    const refreshEpoch=refresh.epoch()
    const mayReuse=!refresh.shouldRefresh(refreshKey)
    // Within the gate window the last prepared projection is reused, including the explicitly
    // stale text of a failed refresh: a slow read must neither blank the instrument nor be
    // re-attempted on every step. Degraded text is never returned as current.
    const held=consumption.prepared(key)
    const reusable=mayReuse&&held!==null
    const result=reusable?null:await consumption.readForConsumption(key,signal)
    // A superseded read is an ordering outcome, not a failed instrument: the newer read owns
    // the state and the gate, so this caller must not install a false unknown snapshot.
    if(result!==null&&result.reason==='superseded-read')return []
    if(result!==null)refresh.record(refreshKey,refreshEpoch)
    // Preparation is not delivery. Replay only after this consumption verified freshness.
    const freshness=result===null?(held!.fresh?'current':'stale'):result.freshness
    const text=result===null?held!.text:result.text??(result.freshness==='current'?consumption.cachedText(key):null)
    if(text===null){refresh.record(refreshKey,refreshEpoch);return []}
    const baselineKey=JSON.stringify([key.principalId,key.sessionId,key.instrumentInstanceId,key.ownerSessionId])
    try{
      refresh.record(refreshKey,refreshEpoch)
      // An identical snapshot that is still visible in the real session, or was already queued
      // during this step, is not installed again: fresh or stale, a failing refresh must not
      // append the same facts at every step or after every nested tool result.
      return installSnapshot(caller,acceptedMessages,text,baselineKey)
    }catch(error){signal.throwIfAborted()
      refresh.record(refreshKey,refreshEpoch)
      return installSnapshot(caller,acceptedMessages,'Instrument snapshot exceeds its representation boundary. Current detail is unknown here, not zero or release proof. Accepted business input is retained; use instrument tools for detail.',baselineKey)
    }
  }
  const facade:RuntimeFacade={
    async serializePolicyPermission(effect){return queue.run(effect)},
    async readPolicy(caller,signal){await check(caller,undefined,signal);return controls.readPolicy(caller.principalId)},
    async savePolicy(caller,intent:PolicyIntent,expectedRevision,signal){
      await check(caller,undefined,signal)
      return queue.run(async()=>{signal.throwIfAborted();transitioning=intent
        try{const saved=await controls.savePolicy(caller.principalId,intent,expectedRevision);savedPolicy=saved
          for(const [sid,view]of cachedSessions){let verified=false;try{verified=await ports.authority.verifyWorkspace(view.instance.controlWorkspaceId)}catch{/* Preserve committed policy while reporting unverified workspace. */}
            const next={...view,policy:resolvePolicy(saved,view.instance.controlWorkspaceId,verified)};cachedSessions.set(sid,next);nativeWindows.set(sid,next.policy.extensionEnabled&&next.policy.features.windows.requested)}
          for(const view of new Map([...cachedSessions.values()].map(view=>[view.instance.instrumentInstanceId,view])).values())await captureSafely(view,()=>captureCurrent(view,[{kind:'configuration',recordId:view.instance.controlWorkspaceId,version:saved.revision,snapshot:saved,domain:'controls',author:caller}]))
          return saved
        }finally{transitioning=null}})
    },
    async readSession(caller,sessionId,signal){return snapshot(caller,id(sessionId,'sessionId'),signal)},
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
        await captureSafely(view,()=>captureBusiness(view,applied.snapshot))
        return notificationFailure===null?applied:{...applied,notificationRecording:'failed',diagnostic:notificationFailure}
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
    async applyTicketWindow(caller,sessionId,command:TicketWindowCommand,signal){const view=await identity(caller,sessionId,signal);return track(view.instance.instrumentInstanceId,async()=>{signal.throwIfAborted();await check(caller,sessionId,signal);if(command.action!=='release')await requireRegisteredTicket(caller,sessionId,command.workflowId,command.localTicketId);const result=await windows.apply(caller.principalId,sessionId,command);await captureSafely(view,()=>captureOthers(view,caller));return result})},
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
          await update(old=>{
            const parent=old.assignments.find(row=>row.sessionId===dispatch.caller.sessionId),allowed=dispatch.caller.principalId===ports.operatorPrincipal||dispatch.caller.sessionId===dispatch.instance.instance.ownerSessionId||((parent?.workflowId??null)===task.workflowId&&task.ticketIds.every(ticket=>(parent?.ticketIds??[]).includes(ticket)))
            const granted=allowed?task:{...task,workflowId:null,ticketIds:[]}
            return {...old,assignments:[...old.assignments.filter(a=>a.sessionId!==task.sessionId),granted],bindings:[...old.bindings,{...dispatch.token,sessionId:actualAgent.id,parentSessionId:task.parentSessionId,runtimeId,released:false}]}
          })
          await windowsProgram.receipt({...dispatch.token,operationId:randomUUID(),state:'accepted'})
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
                await windowsProgram.receipt({...managed.token,operationId:randomUUID(),state:'running'})
              })
            }
          }catch(error){signal.throwIfAborted()/* A woken lane that cannot be re-admitted is reported below rather than failing the wake. */}
        }
        if(managed&&!managed.released){
          // The same admitted lease is still current (a duplicate creation or a raced wake): re-attach.
          managed.live.add(actualAgent);exactExecutions.set(actualAgent,managed);reattached.set(actualAgent,managed)
          await track(managed.token.instrumentInstanceId,()=>windowsProgram.receipt({...managed.token,operationId:randomUUID(),state:'running'}))
        }else if(!managed){
          const parent=actualAgent.session.header.parentSession,view=parent&&cachedSessions.get(parent)
          if(view)await track(view.instance.instrumentInstanceId,()=>markKnowledge(view,false,'unmanaged-or-late-native-creation'))
        }
      }
      try{const view=await identity(caller,caller.sessionId!,signal);await track(view.instance.instrumentInstanceId,()=>initialize(view));if(view.instance.ownerSessionId===caller.sessionId)scheduleNotification(caller.sessionId,true)}
      catch(error){signal.throwIfAborted();if(!(error instanceof ControlsError)||!['unknown-session','unknown-workspace'].includes(error.code))throw error}
      }catch(error){
        signal.throwIfAborted()
        // Optional instrument observation must never become a serial native creation veto.
        const owner=cachedSessions.get(actualAgent.session.header.parentSession??caller.sessionId??'')
        if(owner){nativeWindows.set(owner.instance.instrumentInstanceId,false);historyFailures.set(owner.instance.instrumentInstanceId,'native child created; instrument recording failed: '+String(error).slice(0,1024))}
      }
    },
    async observe(event:HostEvent){
      // A disposed session never prepares again: drop its baseline so the retained Agent, its
      // Session log and the injected message are not kept alive for the process lifetime.
      if(event.kind==='agent-disposed'&&event.actualAgent){const id=event.actualAgent.id;for(const key of baselines.keys())if(key.includes(id))baselines.delete(key);for(const key of deliveredInStep.keys())if(key.includes(id))deliveredInStep.delete(key)}
      const actual=event.actualAgent,attached=actual&&(exactExecutions.get(actual)??reattached.get(actual))
      if(attached){
        const commit=track(attached.token.instrumentInstanceId,async()=>{
          if(event.kind==='agent-disposed'){
            // This run ended: the lane stops running, so its slot is released. A later wake re-admits
            // it through a fresh generation, which is what keeps S equal to the running subagent count.
            const managed=managedExecutions.get(actual!.id)
            attached.live.delete(actual!);exactExecutions.delete(actual!);reattached.delete(actual!);attached.released=true
            if(managed)managed.released=true
            await update(old=>({...old,bindings:old.bindings.map(b=>b.sessionId===actual!.id&&b.leaseId===attached.token.leaseId?{...b,released:true}:b)}))
            if(attached.live.size===0)await windowsProgram.receipt({...attached.token,operationId:randomUUID(),state:'released'})
          }else if(event.kind==='agent-status'&&event.status==='running'&&!attached.released)await windowsProgram.receipt({...attached.token,operationId:randomUUID(),state:'running'})
          // Idle and subagent/end are deliberately NOT implementation-release proofs.
        })
        await commit;return
      }
      if(actual?.session.header.origin==='subagent'){
        const parent=actual.session.header.parentSession,view=parent&&cachedSessions.get(parent)
        if(view)await track(view.instance.instrumentInstanceId,()=>markKnowledge(view,false,'unmanaged-native-execution-observed'))
      }
    },
    async preStep(caller,signal,acceptedMessages,stepKey){currentStepKey=stepKey??('serial:'+(++stepSerial));return prepare(caller,signal,acceptedMessages)},
    // Every tool result may carry this plugin's current projection or its honest unknown
    // diagnostic, so the hook stays unrestricted; the refresh gate inside prepare keeps an
    // unchanged projection from being rebuilt per call.
    async postExecute(caller,exec,_result,stepKey){if(stepKey!==undefined)currentStepKey=stepKey;return prepare(caller,exec.signal)},
    context(caller){return caller.sessionId!==null&&cachedSessions.has(caller.sessionId)?'Collaboration instruments: use mattpocock_record for current records, mattpocock_history for scoped history, mattpocock_worktree for recorded bindings. Fresh bounded state is sent when changed or its exact baseline is missing from the effective input; old chat messages are not deleted.':''},
    async executeManaged(caller,input:HostJson,exec:ToolRunContext){
      const r=record(input,'managed execution',['nativeTool','arguments','workflowId','localTicketId'])
      if(r.nativeTool!=='subagent'&&r.nativeTool!=='subagent_fork'&&r.nativeTool!=='send_message')throw new ControlsError('invalid-input','unsupported managed native tool; accepted nativeTool values: subagent, subagent_fork, send_message')
      const args=parseHostJson(r.arguments),workflowId=r.workflowId===null?null:id(r.workflowId,'workflowId'),localTicketId=r.localTicketId===null?null:id(r.localTicketId,'localTicketId')
      if(workflowId===null&&localTicketId!==null)throw new ControlsError('invalid-input','ticket needs a declared workflow')
      const view=await identity(caller,caller.sessionId!,exec.signal),executionId=id(exec.callId,'execution callId')
      const permission=await scope(caller.principalId,caller.sessionId!,view)
      if(localTicketId!==null&&workflowId!==null)await requireRegisteredTicket(caller,caller.sessionId!,workflowId,localTicketId)
      if(permission.kind==='assigned'&&(workflowId!==null&&workflowId!==permission.workflowId||localTicketId!==null&&!permission.ticketIds.includes(localTicketId)))denied('managed assignment exceeds actual parent scope')
      const fence=await ports.openUnitStorage('native_calls_'+createHash('sha256').update(view.instance.instrumentInstanceId).digest('hex').slice(0,48),parseDelegationJournal)
      await track(view.instance.instrumentInstanceId,async()=>{
        await check(caller,caller.sessionId!,exec.signal)
        const raw=await fence.read(),old=raw===undefined?{revision:0,rows:[]}:parseDelegationJournal(raw)
        if(old.rows.some(row=>row.operationId===executionId))throw new ControlsError('operation-conflict','native call replay is not permission to redispatch')
        const fingerprint=createHash('sha256').update(canonical([caller,input])).digest('hex')
        if(!await fence.compareAndSwap(old.revision,{revision:increment(old.revision),rows:[...old.rows,{operationId:executionId,parentSessionId:caller.sessionId!,fingerprint,childId:executionId,result:null}]}))throw new ControlsError('concurrent-update','native dispatch fence changed')
      })
      if(r.nativeTool==='send_message'){
        await check(caller,caller.sessionId!,exec.signal)
        // Preserve native direct-child identity/history/cwd; incomplete S observation is not a veto.
        const sent=await ports.executeNative(exec,'send_message',args)
        for(const context of sent.additionalContexts??[])exec.deferContext(context)
        if(!sent.isError&&sent.concludesTurn)exec.concludeTurn()
        return parseHostJson({nativeTool:'send_message',direction:'native-adjacency',outcome:sent.isError?'error':'success',...(sent.isError?{error:sent.error}:{value:sent.value}),source:'native-tool-program-result'})
      }
      if(!view.policy.extensionEnabled||!view.policy.features.windows.requested){
        const sent=await ports.executeNative(exec,r.nativeTool,args)
        for(const context of sent.additionalContexts??[])exec.deferContext(context)
        if(!sent.isError&&sent.concludesTurn)exec.concludeTurn()
        return parseHostJson({nativeTool:r.nativeTool,outcome:sent.isError?'error':'success',...(sent.isError?{error:sent.error}:{value:sent.value}),source:'native-tool-program-result',observation:'instrument-disabled'})
      }
      let reservation:Awaited<ReturnType<WindowProgramPort['reserveExecution']>>
      try{reservation=await track(view.instance.instrumentInstanceId,async()=>{await initialize(view);return windowsProgram.reserveExecution(caller.principalId,caller.sessionId!,{operationId:'reserve:'+executionId,executionId,workflowId,localTicketId})})}
      catch(error){
        exec.signal.throwIfAborted()
        if(error instanceof ControlsError&&['access-denied','invalid-input','operation-conflict'].includes(error.code))throw error
        const sent=await ports.executeNative(exec,r.nativeTool,args)
        for(const context of sent.additionalContexts??[])exec.deferContext(context)
        if(!sent.isError&&sent.concludesTurn)exec.concludeTurn()
        return parseHostJson({nativeTool:r.nativeTool,outcome:sent.isError?'error':'success',...(sent.isError?{error:sent.error}:{value:sent.value}),source:'native-tool-program-result',observation:'unknown',diagnostic:String(error).slice(0,1024)})
      }
      if(reservation.replayed||!reservation.dispatchable)throw new ControlsError('operation-conflict','reservation replay/unknown is not permission to redispatch')
      const dispatch:Dispatch={caller,exec,instance:view,token:reservation.token,workflowId,ticketIds:localTicketId===null?[]:[localTicketId],children:new Set(),live:new Set(),released:false,accepting:true}
      let result:ToolExecutionResult
      try{result=await nativeDispatch.run(dispatch,()=>ports.executeNative(exec,r.nativeTool as 'subagent'|'subagent_fork'|'send_message',args))}
      catch(error){try{await track(view.instance.instrumentInstanceId,()=>windowsProgram.receipt({...reservation.token,operationId:randomUUID(),state:'unknown'}))}catch{}throw error}
      finally{dispatch.accepting=false}
      for(const context of result.additionalContexts??[])exec.deferContext(context)
      if(!result.isError&&result.concludesTurn)exec.concludeTurn()
      if(dispatch.children.size===0)try{await track(view.instance.instrumentInstanceId,()=>windowsProgram.receipt({...reservation.token,operationId:randomUUID(),state:'unknown'}))}catch{/* A failed observation never turns accepted native input into a failed native call. */}
      return parseHostJson({nativeTool:r.nativeTool,outcome:result.isError?'error':'success',...(result.isError?{error:result.error}:{value:result.value}),execution:reservation.token,source:'native-tool-program-result'})
    },
    async historyAction(caller,sessionId,input,signal){
      const r=record(input,'history action'),view=await identity(caller,sessionId,signal)
      if((await scope(caller.principalId,sessionId,view)).kind!=='coordinator')denied('session history requires actual owner coordinator')
      return track(view.instance.instrumentInstanceId,async()=>{
        await check(caller,sessionId,signal)
        let records:RuntimeSnapshot['records']=null
        const sourceRefreshFailures:string[]=[]
        try{records=await instruments.read(caller.principalId,sessionId);signal.throwIfAborted();await captureBusiness(view,records)}catch(error){signal.throwIfAborted();sourceRefreshFailures.push('records: '+String(error))}
        signal.throwIfAborted()
        try{await captureOthers(view,caller);signal.throwIfAborted()}catch(error){signal.throwIfAborted();sourceRefreshFailures.push('other-sources: '+String(error))}
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
                const recordId=target.kind==='workflow'?target.workflowId:JSON.stringify([target.workflowId,target.kind==='ticket'?target.localTicketId:target.decisionId])
                const row=target.kind==='workflow'?records.workflows.find(row=>row.workflowId===target.workflowId):target.kind==='ticket'?records.tickets.find(row=>row.workflowId===target.workflowId&&row.localTicketId===target.localTicketId):records.decisions.find(row=>row.workflowId===target.workflowId&&row.decisionId===target.decisionId)
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
              const data=parseWindowDocument(raw);sourceRevision=data.revision
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
        if(r.action==='query'){record(input,'history query action',['action','query']);if(record(r.query,'history query').kind==='viewer')throw new ResourceError('unsupported','personal viewer history is not exposed by shared owner history; use the original instrument personal view read');const page=await history.query(r.query as unknown as HistoryQuery);let windowRevision:number|null=null,worktreeRevision:number|null=null;try{const raw=await ports.windowStorage.read(view.instance.instrumentInstanceId);windowRevision=raw===undefined?0:parseWindowDocument(raw).revision}catch(error){signal.throwIfAborted();sourceRefreshFailures.push('windows revision: '+String(error))}try{worktreeRevision=(await (await openWorktrees(view)).query(view.instance)).revision}catch(error){signal.throwIfAborted();sourceRefreshFailures.push('worktrees revision: '+String(error))}signal.throwIfAborted();return {...page,sourceRevisions:{records:records?.revision??null,windows:windowRevision,worktrees:worktreeRevision},sourceRefresh:{status:sourceRefreshFailures.length?'unknown':'current',failures:sourceRefreshFailures}}}
        if(r.action==='detail'){record(input,'history detail action',['action','historyIds']);const detail=await history.detail(array(r.historyIds,'historyIds').map(value=>id(value,'historyId')));signal.throwIfAborted();return {...detail,sourceRefresh:{status:sourceRefreshFailures.length?'unknown':'current',failures:sourceRefreshFailures}}}
        if(r.action==='compact'){record(input,'history compact action',['action']);return history.compact()}
        if(r.action==='set-context'||r.action==='purge'){
          const result=await history.apply(input as unknown as HistoryAction,{kind:'authored',domain:'history-actions',author:parseHostJson(caller),recordedAt:null,coverage:'recorded-history'},signal)
          return r.action==='purge'?{...result,scope:'derived-session-history',sourceRecordsDeleted:false,nativeConversationDeleted:false}:result
        }
        throw new ControlsError('invalid-input','unknown history action')
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
        if(r.action==='reconcile'){
          record(input,'worktree reconcile',['action','operationId']);const operationId=id(r.operationId,'operationId'),row=(await registry.query(view.instance)).rows.find(row=>row.value.operationId===operationId)
          if(!row)throw new ControlsError('invalid-input','unknown binding operation')
          let header=null
          try{if(ports.liveAgent(row.value.plannedChildSessionId)&&(!ports.flushSession||!await ports.flushSession(row.value.plannedChildSessionId,signal)))throw new ControlsError('storage-uncertain','live child native checkpoint unavailable');const facts=await ports.sessionFacts(row.value.plannedChildSessionId,signal);if(facts.header.origin==='subagent'&&facts.header.parentSession&&typeof facts.header.cwd==='string')header={sessionId:facts.header.id,parentSessionId:facts.header.parentSession,cwd:facts.header.cwd}}catch(error){signal.throwIfAborted();if(!(error instanceof ControlsError)||error.code!=='unknown-session')throw error}
          return registry.reconcile(view.instance,operationId,header,caller)
        }
        throw new ControlsError('invalid-input','unknown worktree action')
      })
    },
    async delegate(caller,input,exec){
      if(caller.kind!=='agent'||caller.sessionId===null)denied('delegation requires actual native agent')
      const r=record(input,'delegation',['description','prompt','provider','worktree','operationId','workflowId','ticketIds'])
      if(typeof r.description!=='string'||!r.description.trim()||typeof r.prompt!=='string'||!r.prompt.trim())throw new ControlsError('invalid-input','description and prompt are required text')
      const provider=r.provider??'spawn';if(provider!=='spawn'&&provider!=='fork')throw new ControlsError('invalid-input','unsupported provider')
      const operationId=id(r.operationId??exec.callId,'operationId'),view=await identity(caller,caller.sessionId,exec.signal)
      const workflowId=r.workflowId===undefined?null:id(r.workflowId,'workflowId'),ticketIds=r.ticketIds===undefined?[]:array(r.ticketIds,'ticketIds').map(value=>id(value,'ticketId'))
      if(new Set(ticketIds).size!==ticketIds.length||workflowId===null&&ticketIds.length>0)throw new ControlsError('invalid-input','invalid assignment set: ticketIds must be unique and require an explicit workflowId')
      const checkGrant=async()=>{await check(caller,caller.sessionId!,exec.signal);const permission=await scope(caller.principalId,caller.sessionId!,await controls.readSession(caller.principalId,caller.sessionId!));if(permission.kind==='assigned'&&((workflowId!==null&&permission.workflowId!==workflowId)||ticketIds.some(ticket=>!permission.ticketIds.includes(ticket))))denied('delegation exceeds actual parent assignment scope')}
      await checkGrant()
      if(workflowId!==null){
        if(ticketIds.length===0)throw new ControlsError('invalid-input','delegation on workflow "'+workflowId+'" must name recorded ticketIds; record the ticket first, or omit workflowId for a ticketless research lane')
        for(const ticket of ticketIds)await requireRegisteredTicket(caller,caller.sessionId!,workflowId,ticket)
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
      if(intent.replayed){
        if(intent.row.result!==null)return {...record(intent.row.result,'delegation result'),replayed:true}
        const binding=(await (await openWorktrees(view)).query(view.instance)).rows.find(row=>row.value.operationId===operationId)
        return {accepted:binding?.value.acceptance==='accepted'?true:null,childId:intent.row.childId,replayed:true,recording:'unknown'}
      }
      await checkGrant()
      const registry=await openWorktrees(view)
      if(registry){const registered=await queue.run(()=>registry.registerIntent(view.instance,caller,{operationId,parentSessionId:caller.sessionId!,plannedChildSessionId:intent.row.childId,requestedCwd:cwd??null,task:r.description as string,...(ticketIds.length===0?{}:{ticketIds})}));if(!registered.dispatch)return {accepted:registered.row.value.acceptance==='accepted',childId:intent.row.childId,replayed:true,recording:registered.row.value.outcome}}
      await checkGrant()
      let dispatch:Dispatch|null=null
      if(view.policy.extensionEnabled&&view.policy.features.windows.requested){
        try{
          const reservation=await track(view.instance.instrumentInstanceId,()=>windowsProgram.reserveExecution(caller.principalId,caller.sessionId!,{operationId:'delegate-reserve:'+operationId,executionId:operationId,workflowId,localTicketId:ticketIds.length===1?ticketIds[0]!:null}))
          if(reservation.replayed||!reservation.dispatchable)throw new ControlsError('operation-conflict','delegation reservation replay is not permission to redispatch')
          dispatch={caller,exec,instance:view,token:reservation.token,workflowId,ticketIds,children:new Set(),live:new Set(),released:false,accepting:true}
        }catch(error){exec.signal.throwIfAborted();if(error instanceof ControlsError&&['access-denied','invalid-input','operation-conflict'].includes(error.code))throw error}
      }
      let receipt:Awaited<ReturnType<NonNullable<HostPorts['createContinuable']>>>
      try{const create=()=>ports.createContinuable!(exec,{provider,label:r.description as string,prompt:r.prompt as string,childId:intent.row.childId,...(cwd===undefined?{}:{cwd})});receipt=await (dispatch?nativeDispatch.run(dispatch,create):create())}
      catch(error){if(registry)try{await queue.run(()=>registry.recordOutcome(view.instance,operationId,{acceptance:'unknown',outcome:exec.signal.aborted?'cancelled':'failed',diagnostic:String(error)},caller))}catch{/* Preserve native failure and no replay dispatch. */}if(dispatch)try{await track(view.instance.instrumentInstanceId,()=>windowsProgram.receipt({...dispatch!.token,operationId:randomUUID(),state:'unknown'}))}catch{}throw error}
      finally{if(dispatch)dispatch.accepting=false}
      if(dispatch&&dispatch.children.size===0)try{await track(view.instance.instrumentInstanceId,()=>windowsProgram.receipt({...dispatch!.token,operationId:randomUUID(),state:'unknown'}))}catch{}
      try{
        if(receipt.childId!==intent.row.childId)throw new ControlsError('association-conflict','native child differs from planned identity')
        if(registry&&(!ports.flushSession||!await ports.flushSession(receipt.childId,exec.signal)))throw new ControlsError('storage-uncertain','accepted child native header checkpoint unavailable')
        const facts=await ports.sessionFacts(receipt.childId,exec.signal)
        if(facts.header.origin!=='subagent'||facts.header.parentSession!==caller.sessionId)throw new ControlsError('association-conflict','native parent differs from actual caller')
        if(registry&&typeof facts.header.cwd!=='string')throw new ControlsError('association-conflict','native child cwd is unavailable')
        if(registry)await queue.run(()=>registry.confirm(view.instance,operationId,{sessionId:facts.header.id,parentSessionId:facts.header.parentSession!,cwd:facts.header.cwd!},caller))
        await facade.assign!(caller,{sessionId:receipt.childId,workflowId,ticketIds},exec.signal)
      }catch(error){if(registry)try{await queue.run(()=>registry.recordOutcome(view.instance,operationId,{acceptance:'accepted',outcome:'accepted-unknown',diagnostic:String(error)},caller))}catch{}const failed=parseHostJson({accepted:true,childId:receipt.childId,messageId:receipt.messageId,recording:'failed',diagnostic:String(error)});try{await saveResult(failed)}catch{}return failed}
      const result=parseHostJson({accepted:true,childId:receipt.childId,messageId:receipt.messageId,replayed:false,recording:'recorded'})
      try{await saveResult(result)}
      catch(error){return {accepted:true,childId:receipt.childId,messageId:receipt.messageId,recording:'failed',diagnostic:String(error)}}
      return result
    },
    async assign(caller,input,signal){
      const r=record(input,'task delegation',['sessionId','workflowId','ticketIds']),target=id(r.sessionId,'child sessionId'),workflowId=r.workflowId===null?null:id(r.workflowId,'workflowId')
      const ticketIds=array(r.ticketIds,'ticketIds').map(value=>id(value,'ticketId'))
      if(new Set(ticketIds).size!==ticketIds.length||workflowId===null&&ticketIds.length>0)throw new ControlsError('invalid-input','invalid assignment set: ticketIds must be unique and require an explicit workflowId')
      const parent=await identity(caller,caller.sessionId!,signal),facts=await ports.sessionFacts(target,signal)
      if(facts.header.origin!=='subagent'||facts.header.parentSession!==caller.sessionId)denied('task grant requires actual direct managed child')
      const child=await controls.ensureSession(ports.operatorPrincipal,target)
      if(child.instance.instrumentInstanceId!==parent.instance.instrumentInstanceId)denied('cannot grant another owner instance')
      return track(parent.instance.instrumentInstanceId,async()=>{
        await check(caller,caller.sessionId!,signal);signal.throwIfAborted()
        const currentParent=await controls.readSession(caller.principalId,caller.sessionId!),currentChild=await controls.readSession(ports.operatorPrincipal,target)
        if(currentParent.instance.instrumentInstanceId!==currentChild.instance.instrumentInstanceId)denied('task grant identity changed')
        return update(old=>{
          const permission=old.assignments.find(a=>a.sessionId===caller.sessionId)
          if(caller.principalId!==ports.operatorPrincipal&&caller.sessionId!==currentParent.instance.ownerSessionId&&
            ((permission?.workflowId??null)!==workflowId||ticketIds.some(t=>!(permission?.ticketIds??[]).includes(t))))denied('delegation exceeds current actual parent assignment')
          return {...old,assignments:[...old.assignments.filter(a=>a.sessionId!==target),{sessionId:target,parentSessionId:caller.sessionId!,instrumentInstanceId:currentParent.instance.instrumentInstanceId,workflowId,ticketIds}]}
        })
      })
    },
    async dispose(){closing=true;notificationLifetime.abort();guard();await Promise.allSettled([...notificationFlights.values()]);await queue.drain();nativeDispatch.disable();cachedSessions.clear();nativeWindows.clear();baselines.clear();deliveredInStep.clear();managedExecutions.clear()}
  }
  // Reconstruct only metadata/known host objects. Never resume a cold session for a dashboard.
  for(const agent of ports.liveAgents()){
    const caller:HostCaller={kind:'agent',principalId:'agent:'+agent.id,sessionId:agent.id}
    try{const view=await identity(caller,agent.id);await track(view.instance.instrumentInstanceId,()=>initialize(view));if(view.instance.ownerSessionId===agent.id)scheduleNotification(agent.id,true)}catch(error){if(!(error instanceof ControlsError)||!['unknown-session','unknown-workspace'].includes(error.code))throw error}
  }
  return facade
}
