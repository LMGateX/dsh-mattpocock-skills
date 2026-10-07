import type { InstrumentInstance } from './state.js'
import { array, boolean, boundedArray, ControlsError, freeze, id, invalid, record, revision } from './validation.js'

export interface InstrumentAuthor { readonly kind: 'agent' | 'user'; readonly principalId: string; readonly sessionId: string | null }
export interface StatusDefinition { readonly statusKey: string; readonly label: string; readonly meaning?: string | null; readonly summaryPriority?: number }
export interface StatusAxis { readonly axisKey: string; readonly label: string; readonly counting: 'exclusive' | 'overlapping'; readonly statuses: readonly StatusDefinition[] }
export interface WorkflowValue { readonly title: string; readonly axes: readonly StatusAxis[] }
export interface TicketValue {
  readonly title: string
  readonly externalRef?: string | null
  readonly statuses: Readonly<Record<string, readonly string[]>>
  readonly summary?: string | null
  readonly disposition?: string | null
}
export interface DecisionValue {
  readonly question: string
  readonly status: string
  readonly pending?: boolean
  readonly awaitingImplementation?: boolean
  readonly ticketIds?: readonly string[]
  readonly context?: string | null
  readonly options?: readonly { readonly key: string; readonly label: string }[]
  readonly recommendation?: string | null
  readonly impact?: string | null
  readonly addressee?: { readonly kind: 'user' | 'agent' | 'unspecified'; readonly principalId?: string | null; readonly label?: string | null }
  readonly result?: string | null
}
export interface DecisionViewValue { readonly read: boolean; readonly hidden: boolean }
interface CommandBase { readonly operationId: string; readonly expectedRevision: number; readonly workflowId: string; readonly references?: readonly string[] }
export type InstrumentCommand = CommandBase & (
  | { readonly action: 'put-workflow'; readonly value: WorkflowValue }
  | { readonly action: 'put-ticket'; readonly localTicketId: string; readonly value: TicketValue }
  | { readonly action: 'put-decision'; readonly decisionId: string; readonly value: DecisionValue }
  | { readonly action: 'set-decision-view'; readonly decisionId: string; readonly value: DecisionViewValue }
)
export interface InstrumentEvent { readonly revision: number; readonly recordedAt: number; readonly author: InstrumentAuthor; readonly command: InstrumentCommand }
export interface InstrumentDocumentV1 extends InstrumentInstance { readonly schemaVersion: 1; readonly revision: number; readonly events: readonly InstrumentEvent[] }
export interface InstrumentDocumentV2 extends InstrumentInstance {
  readonly schemaVersion: 2; readonly revision: number; readonly events: readonly InstrumentEvent[]
  readonly checkpoint: { readonly throughRevision: number; readonly state: InstrumentState }
  readonly dedup: readonly InstrumentDedup[]; readonly coverage: readonly InstrumentCleanupCoverage[]
}
export type InstrumentDocument = InstrumentDocumentV1 | InstrumentDocumentV2
export interface InstrumentDedup {
  readonly operationId:string; readonly author:InstrumentAuthor; readonly digest:string
  readonly appliedRevision:number; readonly kind:'command'|'compact'|'purge-history'
  readonly command?: InstrumentCommandMetadata
}
export interface InstrumentCommandMetadata {
  readonly action:InstrumentCommand['action'];readonly target:InstrumentHistoryTarget
  readonly expectedRevision:number;readonly recordedAt:number
}
export function instrumentCommandMetadata(event:InstrumentEvent):InstrumentCommandMetadata {
  const c=event.command,workflowId=c.workflowId
  const target:InstrumentHistoryTarget=c.action==='put-workflow' ? {kind:'workflow',workflowId} : c.action==='put-ticket' ? {kind:'ticket',workflowId,localTicketId:c.localTicketId} : {kind:'decision',workflowId,decisionId:c.decisionId}
  return {action:c.action,target,expectedRevision:c.expectedRevision,recordedAt:event.recordedAt}
}
export type InstrumentHistoryTarget = {readonly kind:'workflow';readonly workflowId:string}
  | {readonly kind:'ticket';readonly workflowId:string;readonly localTicketId:string}
  | {readonly kind:'decision';readonly workflowId:string;readonly decisionId:string}
export interface InstrumentCleanupCoverage {
  readonly operationId:string; readonly action:'compact'|'purge-history'; readonly appliedRevision:number
  readonly author:InstrumentAuthor; readonly recordedAt:number; readonly throughRevision:number
  readonly targets:readonly InstrumentHistoryTarget[]; readonly removedVersions:number; readonly removedRevisions:readonly number[]
}
export interface InstrumentCompactInput {readonly operationId:string;readonly expectedRevision:number}
export interface InstrumentPurgeHistoryInput extends InstrumentCompactInput {readonly throughRevision:number;readonly targets:readonly InstrumentHistoryTarget[]}
const EMPTY_INSTRUMENT_STATE: InstrumentState = freeze({businessRevision:0,viewerRevisions:{},workflows:[],tickets:[],decisions:[],decisionViews:[]})
export function upgradeInstrumentDocument(document: InstrumentDocument): InstrumentDocumentV2 {
  if(document.schemaVersion===2) return document
  return freeze({...document,schemaVersion:2,checkpoint:{throughRevision:0,state:EMPTY_INSTRUMENT_STATE},dedup:[],coverage:[]})
}
export interface Change<T> { readonly revision: number; readonly recordedAt: number; readonly author: InstrumentAuthor; readonly references: readonly string[]; readonly value: T }
export interface WorkflowRecord { readonly workflowId: string; readonly revision: number; readonly value: WorkflowValue; readonly history: readonly Change<WorkflowValue>[] }
export interface TicketRecord { readonly workflowId: string; readonly localTicketId: string; readonly revision: number; readonly value: TicketValue; readonly history: readonly Change<TicketValue>[] }
export interface DecisionRecord { readonly workflowId: string; readonly decisionId: string; readonly revision: number; readonly value: DecisionValue; readonly history: readonly Change<DecisionValue>[]; readonly creator?: InstrumentAuthor }
export interface DecisionViewRecord { readonly workflowId: string; readonly decisionId: string; readonly principalId: string; readonly revision: number; readonly value: DecisionViewValue }
export interface InstrumentState { readonly businessRevision: number; readonly viewerRevisions: Readonly<Record<string, number>>; readonly workflows: readonly WorkflowRecord[]; readonly tickets: readonly TicketRecord[]; readonly decisions: readonly DecisionRecord[]; readonly decisionViews: readonly DecisionViewRecord[] }

function text(value: unknown, where: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 65536 || value.includes('\0')) invalid(where + ' must be non-empty text, at most 65536 characters')
  return value
}
function nullableText(value: unknown, where: string): string | null { return value === undefined || value === null ? null : text(value, where) }
function ids(value: unknown, where: string): readonly string[] {
  const result = boundedArray(value, where, 256).map(entry => id(entry, where))
  if (new Set(result).size !== result.length) invalid(where + ' contains duplicates')
  return result
}

export function parseAuthor(value: unknown): InstrumentAuthor {
  const raw = record(value, 'author', ['kind', 'principalId', 'sessionId'])
  if (raw.kind !== 'agent' && raw.kind !== 'user') invalid('author kind must be an actual agent or user')
  const session = raw.sessionId === null ? null : id(raw.sessionId, 'author sessionId')
  if ((raw.kind === 'agent') !== (session !== null)) invalid('agent author requires a session; direct user author has no agent session')
  return freeze({ kind: raw.kind, principalId: id(raw.principalId, 'author principalId'), sessionId: session })
}

/** Attaches the expected value shape to a rejected authoring payload: the caller cannot
 * derive nested keys and enum literals from a generic validator message. */
function shape<T>(label: string, expected: string, parse: () => T): T {
  try { return parse() } catch (error) {
    if (error instanceof ControlsError && error.code === 'invalid-input') invalid(error.message + '; ' + label + ' shape: ' + expected)
    throw error
  }
}
const WORKFLOW_VALUE_SHAPE = '{title, axes:[{axisKey, label, counting:"exclusive"|"overlapping", statuses:[{statusKey, label, meaning?, summaryPriority?}]}]}'
const TICKET_VALUE_SHAPE = '{title, statuses:{<axisKey>:[<statusKey>, ...]}, externalRef?, summary?, disposition?}'
const DECISION_VALUE_SHAPE = '{question, status, pending?, awaitingImplementation?, ticketIds?, context?, options?:[{key, label}], recommendation?, impact?, addressee?:{kind:"user"|"agent"|"unspecified", principalId?, label?}, result?}'

function workflowValue(value: unknown): WorkflowValue {
  const raw = record(value, 'workflow', ['title', 'axes'])
  const axes = boundedArray(raw.axes, 'axes', 64).map(value => {
    const axis = record(value, 'axis', ['axisKey', 'label', 'counting', 'statuses'])
    if (axis.counting !== 'exclusive' && axis.counting !== 'overlapping') invalid('axis.counting must be "exclusive" or "overlapping"')
    const statuses = boundedArray(axis.statuses, 'statuses', 64).map(value => {
      const status = record(value, 'status', ['statusKey', 'label', 'meaning', 'summaryPriority'])
      return { statusKey: id(status.statusKey, 'statusKey'), label: text(status.label, 'status label'),
        meaning: nullableText(status.meaning, 'status meaning'), ...(status.summaryPriority === undefined ? {} : { summaryPriority: revision(status.summaryPriority, 'summaryPriority') }) }
    })
    if (new Set(statuses.map(row => row.statusKey)).size !== statuses.length) invalid('duplicate statusKey within an axis')
    return { axisKey: id(axis.axisKey, 'axisKey'), label: text(axis.label, 'axis label'), counting: axis.counting, statuses } as StatusAxis
  })
  if (new Set(axes.map(row => row.axisKey)).size !== axes.length) invalid('duplicate axisKey')
  return { title: text(raw.title, 'workflow title'), axes }
}
function ticketValue(value: unknown): TicketValue {
  const raw = record(value, 'ticket', ['title', 'externalRef', 'statuses', 'summary', 'disposition'])
  const selections = record(raw.statuses, 'ticket statuses')
  return { title: text(raw.title, 'ticket title'),
    statuses: Object.fromEntries(Object.entries(selections).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => [id(key, 'axisKey'), ids(value, 'status selections')])),
    ...(Object.hasOwn(raw, 'externalRef') ? { externalRef: nullableText(raw.externalRef, 'externalRef') } : {}),
    ...(Object.hasOwn(raw, 'summary') ? { summary: nullableText(raw.summary, 'ticket summary') } : {}),
    ...(Object.hasOwn(raw, 'disposition') ? { disposition: nullableText(raw.disposition, 'ticket disposition') } : {}) }
}
function decisionValue(value: unknown): DecisionValue {
  const raw = record(value, 'decision', ['question', 'status', 'pending', 'awaitingImplementation', 'ticketIds', 'context', 'options', 'recommendation', 'impact', 'addressee', 'result'])
  const optional: Record<string, unknown> = {}
  for (const key of ['pending', 'awaitingImplementation']) if (Object.hasOwn(raw, key)) optional[key] = boolean(raw[key], key)
  for (const key of ['context', 'recommendation', 'impact', 'result']) if (Object.hasOwn(raw, key)) optional[key] = nullableText(raw[key], key)
  if (Object.hasOwn(raw, 'ticketIds')) optional.ticketIds = ids(raw.ticketIds, 'decision ticketIds')
  if (Object.hasOwn(raw, 'options')) {
    const options = boundedArray(raw.options, 'decision options', 64).map(value => {
      const option = record(value, 'decision option', ['key', 'label'])
      return { key: id(option.key, 'option key'), label: text(option.label, 'option label') }
    })
    if (new Set(options.map(row => row.key)).size !== options.length) invalid('duplicate decision option')
    optional.options = options
  }
  if (Object.hasOwn(raw, 'addressee')) {
    const target = record(raw.addressee, 'addressee', ['kind', 'principalId', 'label'])
    if (target.kind !== 'user' && target.kind !== 'agent' && target.kind !== 'unspecified') invalid('unknown addressee kind')
    optional.addressee = { kind: target.kind, principalId: target.principalId === undefined || target.principalId === null ? null : id(target.principalId, 'addressee principalId'), label: nullableText(target.label, 'addressee label') }
  }
  return { question: text(raw.question, 'decision question'), status: text(raw.status, 'decision status'), ...optional }
}

/** Thin business declarations. No author/instance/config/lease fields accepted. */
export function parseInstrumentCommand(value: unknown): InstrumentCommand {
  const raw = record(value, 'instrument command')
  const baseKeys = ['operationId', 'expectedRevision', 'action', 'workflowId', 'references', 'value']
  const base = { operationId: id(raw.operationId, 'operationId'), expectedRevision: revision(raw.expectedRevision, 'expected instrument revision'),
    workflowId: id(raw.workflowId, 'workflowId'), references: boundedArray(raw.references ?? [], 'references', 256).map(value => text(value, 'declared reference')) }
  switch (raw.action) {
    case 'put-workflow': record(raw, 'command', baseKeys); return freeze({ ...base, action: raw.action, value: shape('workflow value', WORKFLOW_VALUE_SHAPE, () => workflowValue(raw.value)) })
    case 'put-ticket': record(raw, 'command', [...baseKeys, 'localTicketId']); return freeze({ ...base, action: raw.action, localTicketId: id(raw.localTicketId, 'localTicketId'), value: shape('ticket value', TICKET_VALUE_SHAPE, () => ticketValue(raw.value)) })
    case 'put-decision': record(raw, 'command', [...baseKeys, 'decisionId']); return freeze({ ...base, action: raw.action, decisionId: id(raw.decisionId, 'decisionId'), value: shape('decision value', DECISION_VALUE_SHAPE, () => decisionValue(raw.value)) })
    case 'set-decision-view': {
      record(raw, 'command', [...baseKeys, 'decisionId'])
      const view = shape('decision view value', '{read, hidden}', () => record(raw.value, 'decision view', ['read', 'hidden']))
      return freeze({ ...base, action: raw.action, decisionId: id(raw.decisionId, 'decisionId'), value: { read: boolean(view.read, 'read'), hidden: boolean(view.hidden, 'hidden') } })
    }
    default: return invalid('unknown instrument action; accepted actions: put-workflow, put-ticket, put-decision, set-decision-view')
  }
}

function validateTicket(value: TicketValue, workflow: WorkflowValue): void {
  for (const [key, selections] of Object.entries(value.statuses)) {
    const axis = workflow.axes.find(row => row.axisKey === key)
    if (!axis) invalid('ticket refers to undeclared axis ' + key)
    if (axis.counting === 'exclusive' && selections.length > 1) invalid('exclusive axis cannot count multiple selections')
    for (const selection of selections) if (!axis.statuses.some(row => row.statusKey === selection)) invalid('ticket refers to undeclared status ' + selection)
  }
}

/** Replaying task-defined records also checks reference integrity; no semantic judge. */
export function parseInstrumentHistoryTarget(value: unknown): InstrumentHistoryTarget {
  const r=record(value,'history target')
  const workflowId=id(r.workflowId,'workflowId')
  if(r.kind==='workflow') {record(value,'workflow target',['kind','workflowId']);return {kind:'workflow',workflowId}}
  if(r.kind==='ticket') {record(value,'ticket target',['kind','workflowId','localTicketId']);return {kind:'ticket',workflowId,localTicketId:id(r.localTicketId,'localTicketId')}}
  if(r.kind==='decision') {record(value,'decision target',['kind','workflowId','decisionId']);return {kind:'decision',workflowId,decisionId:id(r.decisionId,'decisionId')}}
  return invalid('unknown instrument history target kind; accepted kinds: workflow, ticket, decision')
}
function checkpointState(value: unknown, cut: number): InstrumentState {
  const s=record(value,'checkpoint state',['businessRevision','viewerRevisions','workflows','tickets','decisions','decisionViews'])
  const viewers=record(s.viewerRevisions,'viewer revisions')
  const viewerRevisions=Object.fromEntries(Object.entries(viewers).map(([key,value])=>[id(key,'viewer'),revision(value,'viewer revision')]))
  const parseRows=<T>(input:unknown,kind:'workflow'|'ticket'|'decision',parse:(value:unknown)=>T) => array(input,kind+' checkpoint rows').map(value=>{
    const key=kind==='workflow' ? undefined : kind==='ticket' ? 'localTicketId' : 'decisionId'
    const r=record(value,'checkpoint record',['workflowId',...(key ? [key] : []),'revision','value','history',...(kind==='decision' ? ['creator'] : [])])
    const history=array(r.history,'retained history').map(value=>{
      const h=record(value,'history version',['revision','recordedAt','author','references','value'])
      return {revision:revision(h.revision,'history revision'),recordedAt:revision(h.recordedAt,'recordedAt'),author:parseAuthor(h.author),references:array(h.references,'references').map(value=>text(value,'reference')),value:parse(h.value)}
    })
    const current=parse(r.value), rowRevision=revision(r.revision,'row revision'),last=history.at(-1)
    if(!last || rowRevision!==last.revision || rowRevision>cut || history.some((h,i)=>h.revision<1 || h.revision>cut || i>0 && h.revision<=history[i-1]!.revision) || JSON.stringify(current)!==JSON.stringify(last.value)) invalid('checkpoint current value differs from latest retained version')
    return {workflowId:id(r.workflowId,'workflowId'),...(key ? {[key]:id(r[key],key)} : {}),revision:rowRevision,value:current,history,...(kind==='decision' ? {creator:parseAuthor(r.creator)} : {})}
  })
  const workflows=parseRows(s.workflows,'workflow',workflowValue) as unknown as readonly WorkflowRecord[]
  const tickets=parseRows(s.tickets,'ticket',ticketValue) as unknown as readonly TicketRecord[]
  const decisions=parseRows(s.decisions,'decision',decisionValue) as unknown as readonly DecisionRecord[]
  const decisionViews=array(s.decisionViews,'decision views').map(value=>{
    const v=record(value,'decision view',['workflowId','decisionId','principalId','revision','value']),payload=record(v.value,'view value',['read','hidden'])
    return {workflowId:id(v.workflowId,'workflowId'),decisionId:id(v.decisionId,'decisionId'),principalId:id(v.principalId,'principalId'),revision:revision(v.revision,'view revision'),value:{read:boolean(payload.read,'read'),hidden:boolean(payload.hidden,'hidden')}}
  })
  for(const rows of [workflows,tickets,decisions,decisionViews]) {
    const identities=rows.map(row=>JSON.stringify([row.workflowId,'localTicketId' in row ? row.localTicketId : 'decisionId' in row ? row.decisionId : null,'principalId' in row ? row.principalId : null]))
    if(new Set(identities).size!==identities.length) invalid('duplicate checkpoint record identity')
  }
  for(const row of tickets) {const workflow=workflows.find(w=>w.workflowId===row.workflowId);if(!workflow) invalid('checkpoint ticket has no workflow');validateTicket(row.value,workflow.value)}
  for(const row of decisions) if(!workflows.some(w=>w.workflowId===row.workflowId) || (row.value.ticketIds??[]).some(id=>!tickets.some(t=>t.workflowId===row.workflowId && t.localTicketId===id))) invalid('checkpoint decision references unknown records')
  for(const view of decisionViews) if(view.revision<1 || view.revision>cut || !decisions.some(d=>d.workflowId===view.workflowId && d.decisionId===view.decisionId)) invalid('checkpoint decision view references unknown records')
  const businessRevision=revision(s.businessRevision,'business revision')
  if(businessRevision+Object.values(viewerRevisions).reduce((sum,n)=>sum+n,0)>cut) invalid('checkpoint business/viewer revision exceeds source cut')
  return freeze({businessRevision,viewerRevisions,workflows,tickets,decisions,decisionViews})
}
function parseCommandMetadata(value:unknown):InstrumentCommandMetadata {
  const m=record(value,'technical command metadata',['action','target','expectedRevision','recordedAt'])
  if(m.action!=='put-workflow' && m.action!=='put-ticket' && m.action!=='put-decision' && m.action!=='set-decision-view') invalid('unknown technical command action')
  const target=parseInstrumentHistoryTarget(m.target),kind=m.action==='put-workflow'?'workflow':m.action==='put-ticket'?'ticket':'decision'
  if(target.kind!==kind) invalid('technical command action and target differ')
  return {action:m.action,target,expectedRevision:revision(m.expectedRevision,'expectedRevision'),recordedAt:revision(m.recordedAt,'recordedAt')}
}
function dedupRows(value: unknown, cut:number): readonly InstrumentDedup[] {
  const rows=array(value,'instrument dedup').map(value=>{
    const d=record(value,'dedup receipt',['operationId','author','digest','appliedRevision','kind','command'])
    if(typeof d.digest!=='string' || !/^[a-f0-9]{64}$/u.test(d.digest)) invalid('invalid SHA256 command digest')
    if(d.kind!=='command' && d.kind!=='compact' && d.kind!=='purge-history') invalid('invalid dedup receipt kind')
    if(d.kind!=='command' && d.command!==undefined) invalid('cleanup receipt must not carry command metadata')
    return {operationId:id(d.operationId,'operationId'),author:parseAuthor(d.author),digest:d.digest,appliedRevision:revision(d.appliedRevision,'appliedRevision'),kind:d.kind,...(d.kind==='command'?{command:parseCommandMetadata(d.command)}:{})} as InstrumentDedup
  })
  if(rows.length!==cut || rows.some((d,i)=>d.appliedRevision!==i+1) || new Set(rows.map(d=>d.operationId)).size!==rows.length) invalid('checkpoint dedup receipt revision gap or duplicate')
  return rows
}
function cleanupCoverage(value:unknown,dedup:readonly InstrumentDedup[]):readonly InstrumentCleanupCoverage[] {
  const rows=array(value,'cleanup coverage').map(value=>{
    const c=record(value,'cleanup coverage record',['operationId','action','appliedRevision','author','recordedAt','throughRevision','targets','removedVersions','removedRevisions'])
    if(c.action!=='compact' && c.action!=='purge-history') invalid('unknown cleanup action')
    const targets=array(c.targets,'cleanup targets').map(parseInstrumentHistoryTarget)
    const result={operationId:id(c.operationId,'operationId'),action:c.action,appliedRevision:revision(c.appliedRevision,'appliedRevision'),author:parseAuthor(c.author),recordedAt:revision(c.recordedAt,'recordedAt'),throughRevision:revision(c.throughRevision,'throughRevision'),targets,removedVersions:revision(c.removedVersions,'removedVersions'),removedRevisions:array(c.removedRevisions,'removed revisions').map(value=>revision(value,'removed revision'))} as InstrumentCleanupCoverage
    if(result.removedVersions!==result.removedRevisions.length || result.removedRevisions.some((r,i)=>r<1 || r>result.throughRevision || i>0 && r<=result.removedRevisions[i-1]!) || new Set(targets.map(t=>JSON.stringify(t))).size!==targets.length || targets.length>100) invalid('cleanup coverage removal count/index mismatch')
    const receipt=dedup.find(d=>d.operationId===result.operationId)
    if(!receipt || receipt.kind!==result.action || receipt.appliedRevision!==result.appliedRevision || JSON.stringify(receipt.author)!==JSON.stringify(result.author) || result.throughRevision>=result.appliedRevision || (result.action==='compact' && (targets.length>0 || result.removedVersions!==0 || result.throughRevision!==result.appliedRevision-1)) || (result.action==='purge-history' && targets.length===0)) invalid('cleanup coverage has no matching technical receipt')
    return result
  })
  if(new Set(rows.map(c=>c.operationId)).size!==rows.length || rows.some((c,i)=>i>0 && c.appliedRevision<=rows[i-1]!.appliedRevision) || dedup.filter(d=>d.kind!=='command').length!==rows.length) invalid('cleanup coverage index mismatch')
  return rows
}
function validateCheckpointHistory(state:InstrumentState,dedup:readonly InstrumentDedup[],coverage:readonly InstrumentCleanupCoverage[]):void {
  const versions=dedup.filter(d=>d.kind==='command' && d.command!.action!=='set-decision-view'),removed=new Set<number>()
  for(const c of coverage) {
    const prior=versions.filter(d=>d.appliedRevision<c.appliedRevision),latest=new Map<string,number>()
    for(const d of prior) latest.set(JSON.stringify(d.command!.target),d.appliedRevision)
    if(c.targets.some(t=>!latest.has(JSON.stringify(t)))) invalid('cleanup target has no source versions at its applied revision')
    const selected=new Set(c.targets.map(t=>JSON.stringify(t)))
    const expected=c.action==='compact' ? [] : prior.filter(d=>selected.has(JSON.stringify(d.command!.target)) && d.appliedRevision<=c.throughRevision && latest.get(JSON.stringify(d.command!.target))!==d.appliedRevision && !removed.has(d.appliedRevision)).map(d=>d.appliedRevision)
    if(JSON.stringify(c.removedRevisions)!==JSON.stringify(expected)) invalid('cleanup coverage does not match actual selectable historical revisions')
    for(const r of expected) removed.add(r)
  }
  const records=new Map<string,{readonly revision:number;readonly history:readonly {readonly revision:number}[]}>()
  for(const row of state.workflows) records.set(JSON.stringify({kind:'workflow',workflowId:row.workflowId}),row)
  for(const row of state.tickets) records.set(JSON.stringify({kind:'ticket',workflowId:row.workflowId,localTicketId:row.localTicketId}),row)
  for(const row of state.decisions) records.set(JSON.stringify({kind:'decision',workflowId:row.workflowId,decisionId:row.decisionId}),row)
  const byTarget=new Map<string,InstrumentDedup[]>()
  for(const d of versions) {const key=JSON.stringify(d.command!.target),group=byTarget.get(key)??[];group.push(d);byTarget.set(key,group)}
  if(records.size!==byTarget.size) invalid('checkpoint record inventory differs from command receipts')
  for(const [key,group] of byTarget) {
    const row=records.get(key),expected=group.filter(d=>!removed.has(d.appliedRevision)).map(d=>d.appliedRevision)
    if(!row || row.revision!==group.at(-1)!.appliedRevision || JSON.stringify(row.history.map(h=>h.revision))!==JSON.stringify(expected)) invalid('checkpoint history contains an unexplained hole or resurrected purged version')
  }
}
function validateCheckpointCounters(state:InstrumentState,dedup:readonly InstrumentDedup[]):void {
  let businessRevision=0
  const viewers=new Map<string,number>()
  for(const receipt of dedup) if(receipt.kind==='command') {
    const meta=receipt.command!
    const expected=meta.action==='set-decision-view' ? viewers.get(receipt.author.principalId)??0 : businessRevision
    if(meta.expectedRevision!==expected) invalid('technical receipt business/viewer revision chain mismatch')
    if(meta.action==='set-decision-view') viewers.set(receipt.author.principalId,expected+1)
    else businessRevision++
  }
  if(state.businessRevision!==businessRevision || Object.keys(state.viewerRevisions).length!==viewers.size || [...viewers].some(([key,value])=>!Object.hasOwn(state.viewerRevisions,key) || state.viewerRevisions[key]!==value)) invalid('checkpoint counters differ from technical command receipts')
  const latestViews=new Map<string,number>()
  for(const receipt of dedup) if(receipt.command?.action==='set-decision-view') {
    const target=receipt.command.target
    if(target.kind!=='decision') invalid('personal view receipt must target a decision')
    latestViews.set(JSON.stringify([target.workflowId,target.decisionId,receipt.author.principalId]),receipt.appliedRevision)
  }
  if(state.decisionViews.length!==latestViews.size || state.decisionViews.some(view=>latestViews.get(JSON.stringify([view.workflowId,view.decisionId,view.principalId]))!==view.revision)) invalid('checkpoint personal view inventory/revision differs from actual viewer receipts')
}
function validateCheckpointAuthors(state:InstrumentState,dedup:readonly InstrumentDedup[]):void {
  const receipts=new Map(dedup.map(d=>[d.appliedRevision,d]))
  const groups:{kind:'workflow'|'ticket'|'decision';rows:readonly (WorkflowRecord|TicketRecord|DecisionRecord)[]}[]=[{kind:'workflow',rows:state.workflows},{kind:'ticket',rows:state.tickets},{kind:'decision',rows:state.decisions}]
  for(const group of groups) for(const row of group.rows) {
    const target:InstrumentHistoryTarget=group.kind==='workflow' ? {kind:'workflow',workflowId:row.workflowId} : group.kind==='ticket' && 'localTicketId' in row ? {kind:'ticket',workflowId:row.workflowId,localTicketId:row.localTicketId} : 'decisionId' in row ? {kind:'decision',workflowId:row.workflowId,decisionId:row.decisionId} : invalid('invalid checkpoint object target')
    if(group.kind==='decision') {
      const first=dedup.find(d=>d.kind==='command' && d.command!.action==='put-decision' && JSON.stringify(d.command!.target)===JSON.stringify(target)),creator='creator' in row ? row.creator : undefined
      if(!first || JSON.stringify(first.author)!==JSON.stringify(creator)) invalid('checkpoint decision creator differs from first source target receipt')
    }
    for(const version of row.history) {
      const receipt=receipts.get(version.revision),meta=receipt?.command
      if(!receipt || receipt.kind!=='command' || !meta || meta.action!=='put-'+group.kind || JSON.stringify(meta.target)!==JSON.stringify(target) || meta.recordedAt!==version.recordedAt || JSON.stringify(receipt.author)!==JSON.stringify(version.author)) invalid('checkpoint retained version metadata differs from source receipt')
    }
  }
}
export function projectInstrumentDocument(document: InstrumentDocument): InstrumentState {
  const base=document.schemaVersion===2 ? document.checkpoint.state : EMPTY_INSTRUMENT_STATE
  const workflows: WorkflowRecord[] = [...base.workflows], tickets: TicketRecord[] = [...base.tickets], decisions: DecisionRecord[] = [...base.decisions], decisionViews: DecisionViewRecord[] = [...base.decisionViews]
  let businessRevision = base.businessRevision
  const viewerRevisions = new Map<string, number>(Object.entries(base.viewerRevisions))
  for (const event of document.events) {
    const command = event.command
    const previousRevision = command.action === 'set-decision-view' ? viewerRevisions.get(event.author.principalId) ?? 0 : businessRevision
    if (command.expectedRevision !== previousRevision) invalid('event expectedRevision mismatches its business/viewer revision')
    if (command.action === 'set-decision-view') viewerRevisions.set(event.author.principalId, previousRevision + 1)
    else businessRevision += 1
    const workflow = workflows.find(row => row.workflowId === command.workflowId)
    const change = <T>(value: T): Change<T> => ({ revision: event.revision, recordedAt: event.recordedAt, author: event.author, references: command.references ?? [], value })
    if (command.action === 'put-workflow') {
      for (const ticket of tickets.filter(row => row.workflowId === command.workflowId)) validateTicket(ticket.value, command.value)
      const row = { workflowId: command.workflowId, revision: event.revision, value: command.value, history: [...(workflow?.history ?? []), change(command.value)] }
      if (workflow) workflows[workflows.indexOf(workflow)] = row; else workflows.push(row)
      continue
    }
    if (!workflow) invalid('workflow must be declared before its records')
    if (command.action === 'put-ticket') {
      validateTicket(command.value, workflow.value)
      const previous = tickets.find(row => row.workflowId === command.workflowId && row.localTicketId === command.localTicketId)
      const value = { ...previous?.value, ...command.value }
      const row = { workflowId: command.workflowId, localTicketId: command.localTicketId, revision: event.revision, value, history: [...(previous?.history ?? []), change(value)] }
      if (previous) tickets[tickets.indexOf(previous)] = row; else tickets.push(row)
    } else if (command.action === 'put-decision') {
      const previous = decisions.find(row => row.workflowId === command.workflowId && row.decisionId === command.decisionId)
      const value = { ...previous?.value, ...command.value }
      for (const ticketId of value.ticketIds ?? []) if (!tickets.some(row => row.workflowId === command.workflowId && row.localTicketId === ticketId)) invalid('decision refers to unknown ticket')
      const row = { workflowId: command.workflowId, decisionId: command.decisionId, revision: event.revision, value, history: [...(previous?.history ?? []), change(value)], ...(previous?.creator ? {creator:previous.creator} : {}) }
      if (previous) decisions[decisions.indexOf(previous)] = row; else decisions.push(row)
    } else {
      if (!decisions.some(row => row.workflowId === command.workflowId && row.decisionId === command.decisionId)) invalid('view refers to unknown decision')
      const previous = decisionViews.find(row => row.workflowId === command.workflowId && row.decisionId === command.decisionId && row.principalId === event.author.principalId)
      const row = { workflowId: command.workflowId, decisionId: command.decisionId, principalId: event.author.principalId, revision: event.revision, value: command.value }
      if (previous) decisionViews[decisionViews.indexOf(previous)] = row; else decisionViews.push(row)
    }
  }
  return freeze({ businessRevision, viewerRevisions: Object.fromEntries(viewerRevisions), workflows, tickets, decisions, decisionViews })
}

export function initialInstrumentDocument(instance: InstrumentInstance): InstrumentDocument {
  return parseInstrumentDocument({ ...instance, schemaVersion: 1, revision: 0, events: [] })
}
export function parseInstrumentDocument(value: unknown): InstrumentDocument {
  try {
    const raw=record(value,'instrument document',['schemaVersion','revision','instrumentInstanceId','ownerSessionId','controlWorkspaceId','events','checkpoint','dedup','coverage'])
    if(raw.schemaVersion!==1 && raw.schemaVersion!==2) invalid('unsupported instrument schemaVersion')
    if(raw.schemaVersion===1) record(value,'V1 instrument document',['schemaVersion','revision','instrumentInstanceId','ownerSessionId','controlWorkspaceId','events'])
    const docRevision=revision(raw.revision,'instrument revision')
    let checkpoint:InstrumentDocumentV2['checkpoint']|undefined, dedup:readonly InstrumentDedup[]=[], coverage:readonly InstrumentCleanupCoverage[]=[]
    if(raw.schemaVersion===2) {
      const c=record(raw.checkpoint,'instrument checkpoint',['throughRevision','state']),cut=revision(c.throughRevision,'checkpoint revision')
      if(cut>docRevision) invalid('checkpoint exceeds source revision')
      checkpoint={throughRevision:cut,state:checkpointState(c.state,cut)}
      dedup=dedupRows(raw.dedup,cut);coverage=cleanupCoverage(raw.coverage,dedup)
      validateCheckpointAuthors(checkpoint.state,dedup)
      validateCheckpointCounters(checkpoint.state,dedup)
      validateCheckpointHistory(checkpoint.state,dedup,coverage)
    }
    const cut=checkpoint?.throughRevision??0
    const events=array(raw.events,'instrument events').map((value,index):InstrumentEvent=>{
      const event=record(value,'instrument event',['revision','recordedAt','author','command']),eventRevision=cut+index+1
      if(revision(event.revision,'event revision')!==eventRevision) invalid('instrument event revision gap')
      return {revision:eventRevision,recordedAt:revision(event.recordedAt,'recordedAt'),author:parseAuthor(event.author),command:parseInstrumentCommand(event.command)}
    })
    const operationIds=[...dedup.map(d=>d.operationId),...events.map(e=>e.command.operationId)]
    if(events.length+cut!==docRevision || new Set(operationIds).size!==operationIds.length) invalid('revision or operation-id index is inconsistent')
    const identity={instrumentInstanceId:id(raw.instrumentInstanceId,'instrumentInstanceId'),ownerSessionId:id(raw.ownerSessionId,'ownerSessionId'),controlWorkspaceId:id(raw.controlWorkspaceId,'controlWorkspaceId'),revision:docRevision,events}
    const result:InstrumentDocument=checkpoint ? {schemaVersion:2,...identity,checkpoint,dedup,coverage} : {schemaVersion:1,...identity}
    projectInstrumentDocument(result)
    return freeze(result)
  } catch(error) {if(error instanceof ControlsError && error.code==='invalid-input') throw new ControlsError('invalid-state',error.message);throw error}
}
