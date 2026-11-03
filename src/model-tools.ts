import { createHash } from 'node:crypto'
import { canonicalJson, createModelOutput, jsonBytes, modelEnvelope, modelReceipt, packModelRows, previewText, ModelOutputError } from './controls/model-output.js'
import type { ModelBinding, ModelSource as ContentSource, ModelSourceDomain } from './controls/model-output.js'
import type { RuntimeFacade } from './host.js'
import { ControlsError, record } from './controls/validation.js'
import type { InstrumentScope } from './controls/instruments.js'
import type { InstrumentInstance } from './controls/state.js'
import type { HostCaller } from './controls/remote-contract.js'

/** Plugin-private model seam. Sources contain one authorized current object, never a document. */
export interface ModelIdentity {
  readonly instance: InstrumentInstance
  readonly caller: HostCaller
  readonly sessionId: string
  readonly scope: InstrumentScope
}
export interface ModelSource {
  readonly domain: string
  readonly key: string
  readonly sourceVersion: string
  readonly value: unknown
}
export interface ModelRow extends ModelSource {
  readonly recordId: string
  readonly workflowId?: string
  readonly durable: boolean
  readonly preview: Readonly<Record<string, unknown>>
}
export interface ModelCollection {
  readonly rows: readonly ModelRow[]
  readonly version: string
  readonly coverage: 'current' | 'restricted' | 'unknown'
  readonly reason?: string
}
export interface ModelCurrent extends ModelIdentity {
  readonly policy: unknown
  readonly revisions: Readonly<Record<string, number | null>>
  readonly records: Readonly<Record<string, unknown>> | null
  readonly windows: Readonly<Record<string, unknown>> | null
  readonly nativeCount: unknown
  readonly collections: Readonly<Record<string, ModelCollection>>
}
export function sourceKey(domain: string, ...ids: readonly unknown[]): string {
  return createHash('sha256').update(JSON.stringify([domain, ...ids])).digest('hex')
}
export function sourceVersion(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}
export function modelSource(domain: string, ids: readonly unknown[], version: number | string, value: unknown): ModelSource {
  return { domain, key: sourceKey(domain, ...ids), sourceVersion: String(version), value }
}

const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const list = (value: unknown): readonly unknown[] => Array.isArray(value) ? value : []
const contentSource = (source: ModelSource): ContentSource => ({...source,domain:source.domain as ModelSourceDomain})
function binding(identity: ModelIdentity): ModelBinding {
  return { instanceId: identity.instance.instrumentInstanceId, workspaceId: identity.instance.controlWorkspaceId,
    callerSessionId: identity.sessionId, principal: identity.caller.principalId, scopeFingerprint: sourceVersion(identity.scope) }
}
function identityFields(identity: ModelIdentity) {
  const scope=identity.scope
  return {instance:identity.instance,sessionId:identity.sessionId,scope:scope.kind==='coordinator'?scope:{kind:scope.kind,workflowId:scope.workflowId,ticketCount:scope.ticketIds.length,fingerprint:sourceVersion(scope)}}
}
/** Presentation fields are selected by each domain before this bounded preview is used. */
function previewFields(fields: Readonly<Record<string, unknown>>, byteLimit=256): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).filter(([,v])=>v!==undefined).map(([key,value])=>[key,
    typeof value==='string'?(Buffer.byteLength(value)<=byteLimit?value:{preview:previewText(value,byteLimit)}):value===null||typeof value!=='object'?value:{preview:previewText(canonicalJson(value),byteLimit)}]))
}
function parseQuery(value: unknown, kinds: readonly string[]) {
  const q=value===undefined?{}:record(value,'model current query',['kind','workflowId','recordId','limit','cursor'])
  if(q.kind!==undefined&&(typeof q.kind!=='string'||!kinds.includes(q.kind)))throw new ControlsError('invalid-input','query kind must be one of: '+kinds.join(', '))
  for(const field of ['workflowId','recordId','cursor'])if(q[field]!==undefined&&typeof q[field]!=='string')throw new ControlsError('invalid-input',field+' must be a string')
  const limit=q.limit??20
  if(!Number.isSafeInteger(limit)||Number(limit)<1||Number(limit)>100)throw new ControlsError('invalid-input','limit must be between 1 and 100')
  return {...q,limit:Number(limit)} as {kind?:string;workflowId?:string;recordId?:string;limit:number;cursor?:string}
}

/** One model adapter per Host mount; all tools share these stateless authenticated selectors. */
export function createModelTools(runtime: RuntimeFacade) {
  const output=createModelOutput()
  let auditReader: ((caller:HostCaller,signal:AbortSignal)=>Promise<unknown>)|undefined
  const requireReads=()=>{if(!runtime.readModelIdentity||!runtime.readModelCurrent||!runtime.readModelSource)throw new ControlsError('feature-disabled','current-only model read capability unavailable; full snapshot fallback is not supported')}
  const identity=async(caller:HostCaller,signal:AbortSignal)=>{requireReads();return runtime.readModelIdentity!(caller,caller.sessionId!,signal)}
  const rowValue=(who:ModelIdentity,row:ModelRow)=>({recordId:row.recordId,...(row.workflowId===undefined?{}:{workflowId:row.workflowId}),sourceVersion:row.sourceVersion,
    ...previewFields(row.preview),...(row.durable?{detail:{tool:'mattpocock_record',action:'detail',locator:output.locator(binding(who),contentSource(row))}}:{observation:{recordId:row.recordId,coverage:'live-current-only; reopen query after a change'}})})
  const page=(who:ModelIdentity,collection:ModelCollection,query:ReturnType<typeof parseQuery>,tool:string,kind:string,extra:object={})=>{
    const filter={kind,...(query.workflowId===undefined?{}:{workflowId:query.workflowId}),...(query.recordId===undefined?{}:{recordId:query.recordId})}
    const selected=collection.rows.filter(row=>(query.workflowId===undefined||row.workflowId===query.workflowId)&&(query.recordId===undefined||row.recordId===query.recordId)).slice().sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0)
    const last=query.cursor===undefined?null:output.readPageCursor(binding(who),{tool,...filter},collection.version,query.cursor)
    const remaining=selected.filter(row=>last===null||row.key>last)
    // Only selected page candidates may hash/encode bodies; untouched rows remain references.
    const rows=remaining.slice(0,query.limit).map(row=>({key:row.key,value:rowValue(who,row)}))
    return packModelRows({rows,limit:query.limit,makeEnvelope:(emitted,index,packedMore)=>{const more=packedMore||remaining.length>rows.length;return modelEnvelope('page',identityFields(who),{...extra,query:filter,coverage:collection.coverage,reason:collection.reason??null,sourceVersion:collection.version,rows:emitted.map(row=>row.value),shown:emitted.length,total:selected.length,more,nextCursor:more&&index>=0?output.pageCursor(binding(who),{tool,...filter},collection.version,rows[index]!.key):null})}})
  }
  const current=async(caller:HostCaller,rawQuery:unknown,signal:AbortSignal)=>{
    requireReads();const view=await runtime.readModelCurrent!(caller,caller.sessionId!,signal),kinds=Object.keys(view.collections),q=parseQuery(rawQuery,kinds)
    if(rawQuery!==undefined){if(!q.kind)throw new ControlsError('invalid-input','query.kind is required');return page(view,view.collections[q.kind]!,q,'mattpocock_record',q.kind,{revisions:view.revisions})}
    const collections=Object.fromEntries(Object.entries(view.collections).map(([kind,collection])=>{const shown=['native-stop','health','capability','pending-release','worktree-binding','worktree-observation'].includes(kind)?collection.rows.slice(0,2).map(row=>({recordId:row.recordId,...previewFields(row.preview,128)})):[];return [kind,{rows:shown,shown:shown.length,total:collection.coverage==='current'?collection.rows.length:null,more:collection.coverage==='current'&&collection.rows.length>shown.length,coverage:collection.coverage,reason:collection.reason===undefined?null:previewText(collection.reason,256).text,...(kind==='health'?{counts:Object.fromEntries(['unknown','restricted','unsupported','pending'].map(status=>[status,collection.rows.filter(row=>row.preview.status===status).length]))}:{}),query:collection.coverage==='current'?{tool:'mattpocock_record',action:'read',query:{kind,limit:20}}:null}]}))
    const policy=object(view.policy)
    const effective=modelSource('policy',['effective',view.instance.controlWorkspaceId],view.revisions.configuration??0,view.policy)
    const ownAssignment=view.scope.kind==='assigned'?await runtime.readModelSource!(caller,caller.sessionId!,{domain:'assignment',key:sourceKey('assignment',view.sessionId)},signal):null
    const scopeDetail=ownAssignment?.source===null||ownAssignment===null?{}:{scopeDetail:{tool:'mattpocock_record',action:'detail',locator:output.locator(binding(view),contentSource(ownAssignment.source))}}
    return modelEnvelope('current',identityFields(view),{...scopeDetail,revisions:view.revisions,policy:{configurationRevision:policy.configurationRevision,workspaceVerified:policy.workspaceVerified,extensionEnabled:policy.extensionEnabled,workspaceEnabled:policy.workspaceEnabled,features:policy.features,windows:policy.windows,detail:{tool:'mattpocock_record',action:'detail',locator:output.locator(binding(view),contentSource(effective))}},records:view.records,windows:view.windows,nativeCount:view.nativeCount,collections})
  }
  const auditSources=(data:unknown):ModelRow[]=>list(object(data).episodes).map((entry,index)=>{const row=object(entry),id=String(row.episodeId??index);return {...modelSource('audit',[id],sourceVersion([object(data).episodeRevision??null,id,row.at]),row),recordId:id,durable:true,preview:{episodeId:id,observed:row.observed,possibleIssue:row.possibleIssue,severity:row.severity,verdict:row.verdict}}})
  const detail=async(caller:HostCaller,request:Record<string,unknown>,signal:AbortSignal)=>{
    record(request,'content detail',['action','locator','offset']);if(typeof request.locator!=='string')throw new ControlsError('invalid-input','detail requires locator')
    const locator=request.locator
    if(!runtime.withModelRead)throw new ControlsError('feature-disabled','permission-ordered content read capability unavailable; full fallback is not supported')
    return runtime.withModelRead(caller,caller.sessionId!,signal,async()=>{
    const who=await identity(caller,signal),bound=binding(who)
    return finish(await output.readContent(bound,{locator,...(request.offset===undefined?{}:{offset:request.offset as number})},async selector=>{
      // Source selection and the second identity check share the runtime permission FIFO.
      if(selector.domain==='audit'){
        if(!auditReader)throw new ModelOutputError('unavailable','Audit observation is unavailable')
        const data=await auditReader(caller,signal),fresh=await identity(caller,signal)
        if(canonicalJson(binding(fresh))!==canonicalJson(bound))throw new ModelOutputError('revision-conflict','Current source scope changed','current-view-changed')
        const row=auditSources(data).find(row=>row.key===selector.key);return row?contentSource(row):null
      }
      const result=await runtime.readModelSource!(caller,caller.sessionId!,selector,signal)
      if(canonicalJson(binding(result.identity))!==canonicalJson(bound))throw new ModelOutputError('revision-conflict','Current source scope changed','current-view-changed')
      return result.source===null?null:contentSource(result.source)
    },signal),'mattpocock_record',request)
    })
  }
  const worktrees=async(caller:HostCaller,rawQuery:unknown,signal:AbortSignal)=>{
    const view=await runtime.readModelCurrent!(caller,caller.sessionId!,signal)
    if(view.scope.kind!=='coordinator')throw new ControlsError('access-denied','worktree registry requires actual owner coordinator')
    const q=parseQuery(rawQuery,['binding','observation']),key=q.kind==='observation'?'worktree-observation':'worktree-binding'
    if(rawQuery!==undefined)return page(view,view.collections[key]!,q,'mattpocock_worktree',q.kind??'binding')
    return modelEnvelope('current',identityFields(view),{collections:Object.fromEntries(['binding','observation'].map(kind=>{const c=view.collections[kind==='binding'?'worktree-binding':'worktree-observation']!;return [kind,{shown:0,total:c.coverage==='current'?c.rows.length:null,more:c.rows.length>0,coverage:c.coverage,query:{tool:'mattpocock_worktree',action:'read',query:{kind,limit:20}}}]})),note:'Queries include cleaned rows. Program observation, inferred association, strong binding and authored cleanup remain distinct.'})
  }
  const policy=(who:ModelIdentity,raw:Record<string,unknown>,result:unknown)=>{
    const data=object(result),revision=data.revision
    if(raw.action==='save')return modelReceipt(identityFields(who),{action:'save',revision,configurationRevision:revision,...mutationOutcome(result)})
    const sources:Record<string,ModelCollection>={defaults:{rows:[{...modelSource('policy',['defaults'],String(revision),data.defaults),recordId:'defaults',durable:true,preview:{name:'defaults'}}],version:String(revision),coverage:'current'},workspace:{rows:Object.entries(object(data.workspaceOverrides)).map(([key,value])=>({...modelSource('policy',['workspace',key],String(revision),value),recordId:key,durable:true,preview:{workspaceId:key}})),version:String(revision),coverage:'current'}}
    const q=parseQuery(raw.query,['defaults','workspace'])
    const extra={revision,extensionEnabled:data.extensionEnabled,completeIntent:false,reconstruction:{revision,steps:'Read all defaults and workspace pages and their record.detail content at this revision before constructing a complete save intent; restart if revision changes.'}}
    if(raw.query!==undefined)return page(who,sources[q.kind??'workspace']!,q,'mattpocock_controls',q.kind??'workspace',extra)
    return modelEnvelope('current',identityFields(who),{...extra,collections:Object.fromEntries(Object.entries(sources).map(([kind,c])=>[kind,{shown:0,total:c.rows.length,more:c.rows.length>0,query:{tool:'mattpocock_controls',action:'read',query:{kind,limit:20}}}]))})
  }
  const history=async(who:ModelIdentity,raw:Record<string,unknown>,result:unknown,signal:AbortSignal)=>{
    const data=object(result)
    if(raw.action!=='query'&&raw.action!=='detail')return receipt('mattpocock_history',who,raw,data)
    const rows=[] as {source:Record<string,unknown>;value:Record<string,unknown>}[]
    for(const entry of list(data.rows)){
      signal.throwIfAborted();const row=object(entry)
      let locator:string|null=null
      if(row.purged!==true){
        const source=raw.action==='detail'?modelSource('history',[row.historyId],String(row.version),row):(await runtime.readModelSource!(who.caller,who.sessionId,{domain:'history',key:sourceKey('history',row.historyId)},signal)).source
        if(source)locator=output.locator(binding(who),contentSource(source))
      }
      rows.push({source:row,value:{historyId:row.historyId,sequence:row.sequence,kind:row.kind,recordId:row.recordId,version:row.version,purged:row.purged,sourceDomain:row.sourceDomain,summary:typeof row.summary==='string'?previewText(row.summary,192):null,...(locator===null?{coverage:row.purged?'purged':'unavailable'}:{detail:{tool:'mattpocock_record',action:'detail',locator}})}})
    }
    return packModelRows({rows,limit:100,makeEnvelope:(emitted,index,more)=>{
      const last=index<0?null:rows[index]!.source,query=object(raw.query)
      // Freeze the original cut but advance only to the last sequence actually delivered.
      const cursor=last&&(more||data.nextCursor!==null)?{...who.instance,cut:data.cut,after:last.sequence,kind:query.kind??null,recordId:query.recordId??null}:null
      const emittedIds=new Set(emitted.map(row=>row.source.historyId))
      return modelEnvelope(raw.action==='query'?'page':'detail',identityFields(who),{revision:data.revision,coverage:data.coverage,notRecorded:data.notRecorded,sourceRevisions:data.sourceRevisions,sourceRefresh:previewFields(object(data.sourceRefresh)),rows:emitted.map(row=>row.value),shown:emitted.length,...(raw.action==='query'?{cut:data.cut,total:data.total,more:more||data.nextCursor!==null,nextCursor:cursor}:{missingHistoryIds:data.missingHistoryIds,remainingHistoryIds:list(raw.historyIds).filter(id=>!emittedIds.has(id)&&!list(data.missingHistoryIds).includes(id))})})
    }})
  }
  const mutationOutcome=(result:unknown)=>{const outcome=runtime.modelMutationOutcome?.(result);return outcome?{historyCapture:{status:outcome.historyCapture.status,diagnostic:outcome.historyCapture.diagnostic===null?null:previewText(outcome.historyCapture.diagnostic,384).text}}:{}}
  function receipt(name:string,who:ModelIdentity,raw:Record<string,unknown>,data:Record<string,unknown>) {
    const command=object(raw.command),snapshot=object(data.snapshot),action=raw.action??name.replace('mattpocock_','')
    const operationId=command.operationId??raw.operationId
    const target={workflowId:command.workflowId??raw.workflowId,localTicketId:command.localTicketId??raw.localTicketId,decisionId:command.decisionId,bindingId:command.bindingId??data.bindingId,observationId:command.observationId??data.observationId}
    const facts:Record<string,unknown>={action,...(operationId===undefined?{}:{operationId}),...Object.fromEntries(Object.entries(target).filter(([,value])=>value!==undefined)),...mutationOutcome(data)}
    for(const key of ['appliedRevision','replayed','ignored','generation','revision','businessRevision','viewerRevision','phase','domain','derivedHistoryDeleted','derivedOutcome','acknowledgedSuppressionRows','sourceRecordsDeleted','sourceOutcome','nativeConversationDeleted','checkpointAppliedRevision','receiptRecording','removedVersions','checkpointRev','checkpointRevision','compactedThroughRevision','notificationRecording','recording','persistence','accepted','creation','binding','assignment','childId','messageId','recovery'])if(data[key]!==undefined)facts[key]=data[key]
    for(const key of ['revision','businessRevision','viewerRevision'])if(snapshot[key]!==undefined)facts[key]=snapshot[key]
    if(data.scope!==undefined)facts.sourceScope=data.scope
    if(name==='mattpocock_record')facts.read={tool:'mattpocock_record',action:'read',query:{kind:command.action==='put-workflow'?'workflow':command.action==='put-ticket'?'ticket':'decision',workflowId:command.workflowId,recordId:command.action==='put-workflow'?command.workflowId:JSON.stringify([command.workflowId,command.localTicketId??command.decisionId])}}
    if(name==='mattpocock_window')facts.read={tool:'mattpocock_record',action:'read',query:{kind:'window-ticket',workflowId:raw.workflowId,recordId:JSON.stringify([raw.workflowId,raw.localTicketId])}}
    if(name==='mattpocock_history')facts.read={tool:'mattpocock_history',action:'query',query:{limit:20}}
    if(name==='mattpocock_delegate')facts.read={tool:'mattpocock_worktree',action:'read',query:{kind:'binding',limit:20}}
    if(name==='mattpocock_assign'){
      const assignment=list(data.assignments).map(object).find(row=>row.sessionId===raw.sessionId&&row.parentSessionId===who.sessionId&&row.instrumentInstanceId===who.instance.instrumentInstanceId)
      delete facts.revision // Shared runtime document revision is not this assignment's commit identity.
      if(!assignment)Object.assign(facts,{assignment:'unknown',sessionId:raw.sessionId})
      else Object.assign(facts,{assignment:'granted',sessionId:assignment.sessionId,parentSessionId:assignment.parentSessionId,workflowId:assignment.workflowId,ticketCount:list(assignment.ticketIds).length,scopeFingerprint:sourceVersion(assignment),detail:{tool:'mattpocock_record',action:'detail',locator:output.locator(binding(who),contentSource(modelSource('assignment',[assignment.sessionId],sourceVersion(assignment),assignment)))}})
    }
    if(name==='mattpocock_worktree'){
      const value=object(data.value)
      facts.businessRevision=data.revision;facts.businessState=object(value.business).state
      if(data.value!==undefined){
        const versions=list(data.history),latest=object(versions.at(-1)),isObservation=data.observationId!==undefined
        const creation=isObservation?object(versions.filter(row=>object(row).event==='observed').at(-1)):latest
        // This source returns the current row for replays/no-ops, not an original commit cut.
        facts.source=creation.source;facts.appliedRevision=null;facts.appliedRevisionCoverage='source-does-not-report-original-commit';facts.replayed=null;facts.replayCoverage='source-does-not-report-replay'
        if(!isObservation){facts.acceptance=value.acceptance;facts.outcome=value.outcome}
        const body={...(isObservation?{observationId:data.observationId}:{bindingId:data.bindingId}),revision:data.revision,value:data.value,source:creation.source,author:creation.author,recordedAt:creation.recordedAt,...(isObservation?{provenance:{source:latest.source,author:latest.author,recordedAt:latest.recordedAt}}:{})}
        facts.detail={tool:'mattpocock_record',action:'detail',locator:output.locator(binding(who),contentSource(modelSource(isObservation?'observation':'worktree-binding',[data.bindingId??data.observationId],String(data.revision),body)))}
      }
    }
    const diagnostics=Object.fromEntries(['diagnostic','error','sourceCoverage','coverage','operation'].filter(key=>data[key]!==undefined).map(key=>[key,typeof data[key]==='string'?previewText(String(data[key]),384):{preview:previewText(canonicalJson(data[key]),384)}]))
    const {detail:_detail,read:_read,historyCapture,...required}=facts
    const minimal={...required,...(historyCapture===undefined?{}:{historyCapture:{status:object(historyCapture).status,diagnosticOmitted:true}})}
    return modelReceipt(identityFields(who),facts,diagnostics,minimal)
  }
  const project=async(name:string,who:ModelIdentity,raw:Record<string,unknown>,result:unknown,signal:AbortSignal):Promise<unknown>=>{
    const data=object(result)
    if(data.schemaVersion===2)return result
    if(name==='mattpocock_controls')return policy(who,raw,result)
    if(name==='mattpocock_history')return history(who,raw,result,signal)
    if(name==='mattpocock_resource'){
      const actual=object(data.actualCanRetire),facts=object(actual.facts)
      const durable=Object.fromEntries(Object.entries(data).filter(([key])=>key!=='actualCanRetire'))
      return modelEnvelope('current',identityFields(who),{resourceId:data.resourceId,status:data.status,ledgerRevision:actual.ledgerRevision,checkedAt:actual.checkedAt,actualCanRetire:{allowed:actual.allowed,reasons:previewText(canonicalJson(actual.reasons??[]),512),facts:actual.facts===null?null:{identityVerified:facts.identityVerified,exists:facts.exists,headOid:facts.headOid,branchOid:facts.branchOid,digest:facts.digest,tracked:{total:list(facts.tracked).length,shown:0,coverage:'live-inspection-not-frozen'},untracked:{total:list(facts.untracked).length,shown:0,coverage:'live-inspection-not-frozen'},ignored:{total:list(facts.ignored).length,shown:0,coverage:'live-inspection-not-frozen'}}},detail:{tool:'mattpocock_record',action:'detail',locator:output.locator(binding(who),contentSource(modelSource('resource',[data.resourceId],String(actual.ledgerRevision),durable)))}})
    }
    return receipt(name,who,raw,data)
  }
  const audit=async(caller:HostCaller,rawQuery:unknown,result:unknown,signal:AbortSignal)=>{
    const who=await identity(caller,signal),data=object(result),summary=object(data.summary),q=parseQuery(rawQuery,['session','episode'])
    const episodes=auditSources(data),recentBySession=new Map<string,unknown[]>()
    for(const event of list(summary.recent)){const row=object(event);if(typeof row.sessionId==='string'){const events=recentBySession.get(row.sessionId)??[];events.push(event);recentBySession.set(row.sessionId,events)}}
    const sessions=[...recentBySession].map(([id,events])=>{const row={sessionId:id,recentEvents:events.length,events};return {...modelSource('audit',['session',id],sourceVersion(row),row),recordId:id,durable:false,preview:{sessionId:id,recentEvents:events.length,coverage:'recent-event subset only; lifetime session count is in overview'}}})
    const rows=q.kind==='session'?sessions:episodes,collection:ModelCollection={rows,version:sourceVersion(rows.map(row=>[row.key,row.sourceVersion])),coverage:'current'}
    if(rawQuery!==undefined)return page(who,collection,q,'mattpocock_audit',q.kind??'episode',{auditCoverage:{...object(data.coverage),persistence:'memory-only',sessions:'recent-event subset only'}})
    return modelEnvelope('current',identityFields(who),{generatedAt:data.generatedAt,coverage:previewFields(object(data.coverage)),summary:{...previewFields(Object.fromEntries(Object.entries(summary).filter(([key])=>!['tickets','productFiles','supportFiles','recent'].includes(key)))),...Object.fromEntries(['productFiles','supportFiles'].map(key=>[key,{rows:list(summary[key]).slice(0,20).map(path=>typeof path==='string'?previewText(path,512):null),shown:Math.min(list(summary[key]).length,20),total:list(summary[key]).length,more:list(summary[key]).length>20,coverage:'bounded current aggregate; not a frozen history'}]))},collections:{episode:{shown:0,total:episodes.length,more:episodes.length>0,query:{tool:'mattpocock_audit',action:'read',query:{kind:'episode',limit:20}}},session:{shown:0,total:sessions.length,ownerSessions:summary.sessions,coverage:'recent-event subset only',more:sessions.length>0,query:{tool:'mattpocock_audit',action:'read',query:{kind:'session',limit:20}}}},note:data.note})
  }

  const isMutation=(name:string,raw:Record<string,unknown>)=>['mattpocock_window','mattpocock_assign','mattpocock_delegate'].includes(name)||name==='mattpocock_record'&&raw.action==='apply'||name==='mattpocock_controls'&&raw.action==='save'||name==='mattpocock_worktree'&&raw.action!=='read'||name==='mattpocock_history'&&!['query','detail'].includes(String(raw.action))
  const finish=(value:unknown,name:string,raw:Record<string,unknown>)=>{
    const dto=JSON.parse(JSON.stringify(value)) as Record<string,unknown>,maximum=isMutation(name,raw)?8192:65536
    if(dto.schemaVersion!==2||jsonBytes(dto)>maximum)throw new ModelOutputError('output-budget-exceeded','Projected model value exceeds its fixed envelope budget')
    return dto
  }
  /** Action has already returned. This path never retries it or encodes another body. */
  const projectionFailure=(name:string,who:ModelIdentity,raw:Record<string,unknown>,result:unknown,error:unknown)=>{
    if(!isMutation(name,raw))throw error
    const data=object(result),snapshot=object(data.snapshot),command=object(raw.command)
    const facts:Record<string,unknown>={action:raw.action??name.replace('mattpocock_',''),projection:'failed',effect:'action-returned',commit:data.accepted===null||data.phase==='partial'||data.sourceOutcome==='failed-or-uncertain'||data.persistence==='failed'?'unknown':data.appliedRevision!==undefined||data.revision!==undefined?'confirmed':'not-reported',diagnostic:previewText(error instanceof Error?error.message:'Model projection unavailable',192).text}
    for(const key of ['appliedRevision','replayed','ignored','generation','revision','businessRevision','viewerRevision','phase','domain','derivedHistoryDeleted','derivedOutcome','acknowledgedSuppressionRows','sourceRecordsDeleted','sourceOutcome','nativeConversationDeleted','checkpointAppliedRevision','receiptRecording','notificationRecording','recording','persistence','accepted','creation','binding','assignment','childId','messageId'])if(data[key]!==undefined)facts[key]=data[key]
    for(const key of ['revision','businessRevision','viewerRevision'])if(snapshot[key]!==undefined)facts[key]=snapshot[key]
    Object.assign(facts,mutationOutcome(data))
    if(name==='mattpocock_worktree'&&data.value!==undefined)Object.assign(facts,{commit:'not-reported',businessRevision:data.revision,businessState:object(object(data.value).business).state,appliedRevision:null,appliedRevisionCoverage:'source-does-not-report-original-commit',replayed:null,replayCoverage:'source-does-not-report-replay'})
    if(data.recovery!==undefined)facts.recovery=previewFields(object(data.recovery),128)
    const operationId=command.operationId??raw.operationId;if(operationId!==undefined)facts.operationId=operationId
    for(const key of ['workflowId','localTicketId','decisionId','bindingId','observationId'])if(command[key]!==undefined)facts[key]=command[key]
    if(name==='mattpocock_assign'){delete facts.revision;const target=list(data.assignments).map(object).find(row=>row.sessionId===raw.sessionId&&row.parentSessionId===who.sessionId&&row.instrumentInstanceId===who.instance.instrumentInstanceId);facts.sessionId=raw.sessionId;facts.assignment=target===undefined?'unknown':'granted';if(target)Object.assign(facts,{parentSessionId:target.parentSessionId,workflowId:target.workflowId,ticketCount:list(target.ticketIds).length})}
    return modelReceipt(identityFields(who),facts)
  }
  return {identity,current,detail,worktrees,project,audit,finish,projectionFailure,setAuditReader(reader:typeof auditReader){auditReader=reader}}
}
