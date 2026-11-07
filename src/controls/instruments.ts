import { createHash } from 'node:crypto'
import type { WorkspaceControls, SessionControlsView } from './index.js'
import type { InstrumentInstance } from './state.js'
import type { InstrumentStorage } from './instrument-storage.js'
import { initialInstrumentDocument, parseAuthor, parseInstrumentCommand, parseInstrumentDocument, projectInstrumentDocument, upgradeInstrumentDocument, parseInstrumentHistoryTarget, instrumentCommandMetadata } from './instrument-state.js'
import type { InstrumentAuthor, InstrumentCommand, InstrumentDocument, InstrumentEvent, InstrumentState, WorkflowRecord, TicketRecord, TicketValue, TaskReferenceRecord, DecisionRecord, DecisionViewValue, DecisionValue, InstrumentCompactInput, InstrumentPurgeHistoryInput, InstrumentCleanupCoverage, InstrumentDocumentV2, InstrumentDocumentV3, InstrumentDedup, InstrumentHistoryTarget, Change } from './instrument-state.js'
import { array, ControlsError, freeze, id, increment, invalid, record, revision } from './validation.js'

const RECORD_CAPABILITIES = freeze({ taskReferences: true as const, storageVersions: [1, 2, 3] as const })

export type InstrumentScope = { readonly kind: 'coordinator' }
  | { readonly kind: 'assigned'; readonly workflowId: string | null; readonly ticketIds: readonly string[] }
export interface InstrumentAccess { readonly author: InstrumentAuthor; readonly scope: InstrumentScope }
/** The authenticated host derives actual author and delegated assignment, never the command. */
export interface InstrumentAuthority {
  resolveAccess(principal: string, sessionId: string, instance: InstrumentInstance, access: 'read' | 'write'): Promise<InstrumentAccess>
}
export interface InstrumentFilter { readonly workflowId?: string; readonly afterRevision?: number }
/** Optional additive READ metadata; absent on older hosts, null when first-version proof/access is unavailable. */
export interface InstrumentDecisionTime {
  /** First put: epoch milliseconds and source revision (not a business CAS token). */
  readonly registration?: { readonly recordedAt: number; readonly revision: number } | null
  /** Latest business update, never a viewer update or idempotent replay. */
  readonly updatedAt?: number
}
export interface InstrumentSnapshot {
  readonly instance: InstrumentInstance
  readonly revision: number
  readonly businessRevision: number
  readonly viewerRevision: number
  readonly scope: InstrumentScope
  readonly focusedWorkflowId: string | null
  readonly workflows: readonly WorkflowRecord[]
  readonly tickets: readonly TicketRecord[]
  readonly taskReferences: readonly TaskReferenceRecord[]
  readonly capabilities: { readonly taskReferences: true; readonly storageVersions: readonly [1, 2, 3] }
  /** Unfiltered authorized obligations; focusing a new workflow never erases old matters. */
  readonly decisions: readonly (DecisionRecord & InstrumentDecisionTime & { readonly view: DecisionViewValue })[]
  readonly changes: readonly InstrumentEvent[]
  readonly historyCoverage?: {readonly checkpointRevision:number;readonly purged:boolean}
  readonly summary: {
    readonly countingScope: 'instance' | 'assignment'
    readonly totalTickets: number
    readonly totalTaskReferences: number
    readonly statusCounts: readonly { readonly workflowId: string; readonly axisKey: string; readonly label: string; readonly counting: 'exclusive' | 'overlapping'; readonly unreported: number; readonly statuses: readonly { readonly statusKey: string; readonly label: string; readonly count: number; readonly meaning: string | null; readonly summaryPriority?: number }[] }[]
    readonly pendingDecisionCount: number
    readonly pendingUserDecisionCount: number
    readonly pendingForPrincipalCount: number
    readonly awaitingImplementationCount: number
  }
}
/** Metadata of the latest business version, not a retained history entry. */
export type InstrumentCurrentProvenance = Pick<Change<unknown>, 'author' | 'recordedAt' | 'references'>
export type InstrumentCurrentWorkflow = Omit<WorkflowRecord, 'history'> & { readonly provenance: InstrumentCurrentProvenance }
export type InstrumentCurrentTicket = Omit<TicketRecord, 'history'> & { readonly provenance: InstrumentCurrentProvenance }
export type InstrumentCurrentTaskReference = Omit<TaskReferenceRecord, 'history'> & { readonly provenance: InstrumentCurrentProvenance }
export type InstrumentCurrentDecision = Omit<DecisionRecord, 'history' | 'creator'> & InstrumentDecisionTime & {
  readonly creator: InstrumentAuthor
  readonly provenance: InstrumentCurrentProvenance
  readonly view: DecisionViewValue
}
/** Authorized current bodies for model projection/detail; never contains histories or changes.
 * Bodies are intentionally complete here: the model adapter owns its byte budget and locators.
 */
export interface InstrumentCurrentSnapshot extends Omit<InstrumentSnapshot, 'workflows' | 'tickets' | 'taskReferences' | 'decisions' | 'changes' | 'historyCoverage'> {
  readonly workflows: readonly InstrumentCurrentWorkflow[]
  readonly tickets: readonly InstrumentCurrentTicket[]
  readonly taskReferences: readonly InstrumentCurrentTaskReference[]
  readonly decisions: readonly InstrumentCurrentDecision[]
}
/** Current authorized badge facts; no retained versions, changes or decision bodies. */
export interface InstrumentSummary {
  readonly instance: InstrumentInstance
  readonly revision: number
  readonly businessRevision: number
  readonly viewerRevision: number
  readonly scope: InstrumentScope
  readonly summary: {
    readonly countingScope: 'instance' | 'assignment'
    readonly pendingUserDecisionCount: number
  }
}
export interface InstrumentApplyResult { readonly appliedRevision: number; readonly replayed: boolean; readonly snapshot: InstrumentSnapshot }
export interface InstrumentCleanupResult extends InstrumentApplyResult {
  readonly removedVersions:number;readonly checkpointRevision:number;readonly coverage:readonly InstrumentCleanupCoverage[]
}
export type { InstrumentCompactInput, InstrumentPurgeHistoryInput, InstrumentHistoryTarget, InstrumentCleanupCoverage } from './instrument-state.js'
function digest(payload:unknown,author:InstrumentAuthor):string {return createHash('sha256').update(JSON.stringify({payload,author})).digest('hex')}
function compactInput(value:unknown):InstrumentCompactInput {
  const c=record(value,'source compact input',['operationId','expectedRevision'])
  return freeze({operationId:id(c.operationId,'operationId'),expectedRevision:revision(c.expectedRevision,'expected document revision')})
}

function purgeInput(value:unknown):InstrumentPurgeHistoryInput {
  const p=record(value,'source purge input',['operationId','expectedRevision','throughRevision','targets'])
  const targets=array(p.targets,'explicit history targets').map(parseInstrumentHistoryTarget).sort((a,b)=>JSON.stringify(a)<JSON.stringify(b)?-1:JSON.stringify(a)>JSON.stringify(b)?1:0)
  if(targets.length===0 || targets.length>100 || new Set(targets.map(t=>JSON.stringify(t))).size!==targets.length) invalid('source purge requires 1..100 unique explicit targets')
  return freeze({operationId:id(p.operationId,'operationId'),expectedRevision:revision(p.expectedRevision,'expected document revision'),throughRevision:revision(p.throughRevision,'throughRevision'),targets})
}
function checkpointPayload(document:InstrumentDocumentV2|InstrumentDocumentV3,state:InstrumentState):InstrumentState|Omit<InstrumentState,'taskReferences'> {
  const {taskReferences:_references,...legacy}=state
  return document.schemaVersion===3 ? state : legacy
}
function targetMatches(target:InstrumentHistoryTarget,kind:'workflow'|'ticket'|'task-reference'|'decision',row:WorkflowRecord|TicketRecord|TaskReferenceRecord|DecisionRecord):boolean {
  if(target.kind!==kind || target.workflowId!==row.workflowId) return false
  if(target.kind==='workflow') return true
  if(target.kind==='ticket' || target.kind==='task-reference') return 'localTicketId' in row && target.localTicketId===row.localTicketId
  return 'decisionId' in row && target.decisionId===row.decisionId
}
function parseAccess(value: unknown, principal: string, sessionId: string): InstrumentAccess {
  const raw = record(value, 'instrument access', ['author', 'scope'])
  const author = parseAuthor(raw.author)
  if (author.principalId !== principal || (author.kind === 'agent' && author.sessionId !== sessionId)) throw new ControlsError('access-denied', 'host author does not match authenticated caller')
  const scope = record(raw.scope, 'instrument scope')
  if (scope.kind === 'coordinator') { record(scope, 'coordinator scope', ['kind']); return freeze({ author, scope: { kind: 'coordinator' } }) }
  record(scope, 'assignment scope', ['kind', 'workflowId', 'ticketIds'])
  if (scope.kind !== 'assigned') invalid('host must supply a coordinator or assigned scope')
  const ticketIds = array(scope.ticketIds, 'assigned ticketIds').map(value => id(value, 'assigned ticketId'))
  if (new Set(ticketIds).size !== ticketIds.length) invalid('duplicate assigned ticketId')
  return freeze({ author, scope: { kind: 'assigned', workflowId: scope.workflowId === null ? null : id(scope.workflowId, 'assigned workflowId'), ticketIds } })
}
function creatorOf(row:DecisionRecord):string {return row.creator?.principalId ?? row.history[0]!.author.principalId}
function decisionAllowed(access: InstrumentAccess, workflowId: string, value: Pick<DecisionValue, 'ticketIds'>, creator: string): boolean {
  if (access.scope.kind === 'coordinator') return true
  if (access.scope.workflowId !== workflowId) return false
  const tickets = value.ticketIds ?? []
  return tickets.length === 0 ? creator === access.author.principalId : tickets.every(ticket => access.scope.kind === 'assigned' && access.scope.ticketIds.includes(ticket))
}

interface DecisionRegistrationProof {
  readonly registration: NonNullable<InstrumentDecisionTime['registration']>
  readonly creator: string
  readonly ticketIds?: readonly string[]
}
// Only load()'s validated immutable source identities enter this cache. It stores
// first-version authorization facts, not first bodies or principal-specific results.
const registrationIndexes = new WeakMap<InstrumentDocument, ReadonlyMap<string, DecisionRegistrationProof>>()
function registrationIndex(document: InstrumentDocument): ReadonlyMap<string, DecisionRegistrationProof> {
  const known = registrationIndexes.get(document)
  if (known) return known
  const proofs = new Map<string, DecisionRegistrationProof>()
  if (document.schemaVersion !== 1) {
    // Receipts are validated as a complete, ordered source-revision chain. They
    // survive purge without retaining deleted business bodies. Time need not be monotonic.
    for (const receipt of document.dedup) {
      const metadata = receipt.command
      if (metadata?.action !== 'put-decision' || metadata.target.kind !== 'decision') continue
      const key = JSON.stringify([metadata.target.workflowId, metadata.target.decisionId])
      if (!proofs.has(key)) proofs.set(key, { registration: { recordedAt: metadata.recordedAt, revision: receipt.appliedRevision }, creator: receipt.author.principalId })
    }
    for (const row of document.checkpoint.state.decisions) {
      const key = JSON.stringify([row.workflowId, row.decisionId]), proof = proofs.get(key)
      const firstRetained = row.history[0]
      // Retained history is only an ACL witness when its revision matches the
      // independently proven first put. A purged or filtered first version is unknown.
      if (proof && firstRetained?.revision === proof.registration.revision) proofs.set(key, { ...proof, ticketIds: firstRetained.value.ticketIds ?? [] })
    }
  }
  for (const event of document.events) {
    const command = event.command
    if (command.action !== 'put-decision') continue
    const key = JSON.stringify([command.workflowId, command.decisionId])
    if (!proofs.has(key)) proofs.set(key, { registration: { recordedAt: event.recordedAt, revision: event.revision },
      creator: event.author.principalId, ticketIds: command.value.ticketIds ?? [] })
  }
  registrationIndexes.set(document, proofs)
  return proofs
}
function registrationFor(document: InstrumentDocument, access: InstrumentAccess, workflowId: string, decisionId: string): Exclude<InstrumentDecisionTime['registration'], undefined> {
  const proof = registrationIndex(document).get(JSON.stringify([workflowId, decisionId]))
  if (!proof || (access.scope.kind !== 'coordinator' && (proof.ticketIds === undefined || !decisionAllowed(access, workflowId, proof, proof.creator)))) return null
  return proof.registration
}

function selectionsFor(value: TicketValue, axisKey: string): readonly string[] {
  return Object.hasOwn(value.statuses, axisKey) ? value.statuses[axisKey]! : []
}

interface CurrentDecision {
  readonly workflowId: string
  readonly creator: string
  readonly ticketIds: readonly string[]
  readonly pending: boolean
  readonly userAddressee: boolean
}
interface CurrentDecisionIndex {
  readonly businessRevision: number
  readonly viewerRevisions: ReadonlyMap<string, number>
  readonly decisions: readonly CurrentDecision[]
}
// Only load()'s validated immutable documents enter this cache. This is deliberately
// separate from the full pure-state memo used by projectInstrumentDocument.
const currentDecisionIndexes = new WeakMap<InstrumentDocument, CurrentDecisionIndex>()
function currentDecisionIndex(document: InstrumentDocument): CurrentDecisionIndex {
  const known = currentDecisionIndexes.get(document)
  if (known !== undefined) return known
  const base = document.schemaVersion !== 1 ? document.checkpoint.state : undefined
  let businessRevision = base?.businessRevision ?? 0
  const viewerRevisions = new Map(Object.entries(base?.viewerRevisions ?? {}))
  const decisions = new Map<string, CurrentDecision>()
  const key = (workflowId: string, decisionId: string): string => JSON.stringify([workflowId, decisionId])
  for (const row of base?.decisions ?? []) decisions.set(key(row.workflowId, row.decisionId), {
    workflowId: row.workflowId, creator: creatorOf(row), ticketIds: row.value.ticketIds ?? [],
    pending: row.value.pending === true, userAddressee: row.value.addressee?.kind === 'user',
  })
  // Fold only count/authorization fields; never project or copy retained histories.
  for (const event of document.events) {
    const command = event.command
    if (command.action === 'set-decision-view') {
      viewerRevisions.set(event.author.principalId, command.expectedRevision + 1)
      continue
    }
    businessRevision++
    if (command.action !== 'put-decision') continue
    const target = key(command.workflowId, command.decisionId), previous = decisions.get(target)
    decisions.set(target, {
      workflowId: command.workflowId, creator: previous?.creator ?? event.author.principalId,
      ticketIds: command.value.ticketIds ?? previous?.ticketIds ?? [],
      pending: command.value.pending ?? previous?.pending ?? false,
      userAddressee: command.value.addressee === undefined ? previous?.userAddressee ?? false : command.value.addressee.kind === 'user',
    })
  }
  const current = Object.freeze({ businessRevision, viewerRevisions, decisions: freeze([...decisions.values()]) })
  currentDecisionIndexes.set(document, current)
  return current
}

interface InstrumentCurrentIndex {
  readonly businessRevision: number
  readonly viewerRevisions: Readonly<Record<string, number>>
  readonly workflows: readonly InstrumentCurrentWorkflow[]
  readonly tickets: readonly InstrumentCurrentTicket[]
  readonly taskReferences: readonly InstrumentCurrentTaskReference[]
  readonly decisions: readonly Omit<InstrumentCurrentDecision, 'view'>[]
  readonly decisionViews: InstrumentState['decisionViews']
}
const currentIndexes = new WeakMap<InstrumentDocument, InstrumentCurrentIndex>()
function currentIndex(document: InstrumentDocument): InstrumentCurrentIndex {
  const known = currentIndexes.get(document)
  if (known !== undefined) return known
  const base = document.schemaVersion !== 1 ? document.checkpoint.state : undefined
  let businessRevision = base?.businessRevision ?? 0
  const viewerRevisions = new Map(Object.entries(base?.viewerRevisions ?? {}))
  const workflows = new Map<string, InstrumentCurrentWorkflow>()
  const tickets = new Map<string, InstrumentCurrentTicket>()
  const taskReferences = new Map<string, InstrumentCurrentTaskReference>()
  const decisions = new Map<string, Omit<InstrumentCurrentDecision, 'view'>>()
  const views = new Map<string, InstrumentState['decisionViews'][number]>()
  const key = (...ids: string[]): string => JSON.stringify(ids)
  const provenance = (change: Pick<Change<unknown>, 'author' | 'recordedAt' | 'references'>): InstrumentCurrentProvenance =>
    ({ author: change.author, recordedAt: change.recordedAt, references: change.references })
  // Checkpoints retain histories for their separate callers; read only the latest metadata
  // and authoritative merged value here. Never spread a retained row into this index.
  for (const row of base?.workflows ?? []) workflows.set(row.workflowId, {
    workflowId: row.workflowId, revision: row.revision, value: row.value, provenance: provenance(row.history.at(-1)!) })
  for (const row of base?.tickets ?? []) tickets.set(key(row.workflowId, row.localTicketId), {
    workflowId: row.workflowId, localTicketId: row.localTicketId, revision: row.revision, value: row.value, provenance: provenance(row.history.at(-1)!) })
  for (const row of document.schemaVersion === 3 ? document.checkpoint.state.taskReferences : []) taskReferences.set(key(row.workflowId, row.localTicketId), {
    workflowId: row.workflowId, localTicketId: row.localTicketId, revision: row.revision, value: row.value, provenance: provenance(row.history.at(-1)!) })
  for (const row of base?.decisions ?? []) decisions.set(key(row.workflowId, row.decisionId), {
    workflowId: row.workflowId, decisionId: row.decisionId, revision: row.revision, value: row.value,
    creator: row.creator ?? row.history[0]!.author, provenance: provenance(row.history.at(-1)!) })
  for (const row of base?.decisionViews ?? []) views.set(key(row.workflowId, row.decisionId, row.principalId), row)
  // The document was validated by load(). Fold only latest values and metadata, with
  // O(current rows) retained space, independent of the number of historic versions.
  for (const event of document.events) {
    const command = event.command, workflowId = command.workflowId
    if (command.action === 'set-decision-view') {
      viewerRevisions.set(event.author.principalId, command.expectedRevision + 1)
      views.set(key(workflowId, command.decisionId, event.author.principalId), {
        workflowId, decisionId: command.decisionId, principalId: event.author.principalId, revision: event.revision, value: command.value })
      continue
    }
    businessRevision++
    const metadata = { revision: event.revision, provenance: provenance({ ...event, references: command.references ?? [] }) }
    if (command.action === 'put-workflow') workflows.set(workflowId, { workflowId, ...metadata, value: command.value })
    else if (command.action === 'put-ticket') {
      const target = key(workflowId, command.localTicketId), previous = tickets.get(target)
      tickets.set(target, { workflowId, localTicketId: command.localTicketId, ...metadata, value: { ...previous?.value, ...command.value } })
    } else if (command.action === 'put-task-reference') {
      const target = key(workflowId, command.localTicketId), previous = taskReferences.get(target)
      taskReferences.set(target, { workflowId, localTicketId: command.localTicketId, ...metadata, value: { ...previous?.value, ...command.value } })
    } else {
      const target = key(workflowId, command.decisionId), previous = decisions.get(target)
      decisions.set(target, { workflowId, decisionId: command.decisionId, ...metadata,
        creator: previous?.creator ?? event.author, value: { ...previous?.value, ...command.value } })
    }
  }
  const current = freeze({ businessRevision, viewerRevisions: Object.fromEntries(viewerRevisions),
    workflows: [...workflows.values()], tickets: [...tickets.values()], taskReferences: [...taskReferences.values()], decisions: [...decisions.values()], decisionViews: [...views.values()] })
  currentIndexes.set(document, current)
  return current
}

/** Unmounted instrument seam; records model/user judgment, never judges it. */
export class SessionInstruments {
  constructor(private readonly controls: WorkspaceControls, private readonly storage: InstrumentStorage,
    private readonly authority: InstrumentAuthority, private readonly now: () => number = Date.now) {}

  async read(principal: string, sessionId: string, filter: InstrumentFilter = {}): Promise<InstrumentSnapshot> {
    const parsedFilter = this.filter(filter)
    const context = await this.context(principal, sessionId, 'read')
    const document = await this.load(context.controls.instance)
    return this.snapshot(document, context.access, parsedFilter)
  }

  async readCurrent(principal: string, sessionId: string, signal?: AbortSignal): Promise<InstrumentCurrentSnapshot> {
    const context = await this.context(principal, sessionId, 'read', signal)
    const document = await this.load(context.controls.instance, signal)
    const state = currentIndex(document), access = context.access
    const workflows = state.workflows.filter(row => access.scope.kind === 'coordinator' || row.workflowId === access.scope.workflowId)
    const tickets = state.tickets.filter(row => access.scope.kind === 'coordinator' || (row.workflowId === access.scope.workflowId && access.scope.ticketIds.includes(row.localTicketId)))
    const taskReferences = state.taskReferences.filter(row => access.scope.kind === 'coordinator' || (row.workflowId === access.scope.workflowId && access.scope.ticketIds.includes(row.localTicketId)))
    const decisions = state.decisions.filter(row => decisionAllowed(access, row.workflowId, row.value, row.creator.principalId))
      .map(row => ({ ...row, registration: registrationFor(document, access, row.workflowId, row.decisionId), updatedAt: row.provenance.recordedAt, view: state.decisionViews.find(view => view.workflowId === row.workflowId && view.decisionId === row.decisionId && view.principalId === access.author.principalId)?.value ?? { read: false, hidden: false } }))
    const statusCounts = workflows.flatMap(workflow => workflow.value.axes.map(axis => {
      const scoped = tickets.filter(ticket => ticket.workflowId === workflow.workflowId)
      return { workflowId: workflow.workflowId, axisKey: axis.axisKey, label: axis.label, counting: axis.counting,
        unreported: scoped.filter(ticket => selectionsFor(ticket.value, axis.axisKey).length === 0).length,
        statuses: axis.statuses.map(status => ({ statusKey: status.statusKey, label: status.label, meaning: status.meaning ?? null,
          ...(status.summaryPriority === undefined ? {} : { summaryPriority: status.summaryPriority }),
          count: scoped.filter(ticket => selectionsFor(ticket.value, axis.axisKey).includes(status.statusKey)).length })) }
    }))
    return freeze({ instance: context.controls.instance, revision: document.revision, businessRevision: state.businessRevision,
      viewerRevision: Object.hasOwn(state.viewerRevisions, access.author.principalId) ? state.viewerRevisions[access.author.principalId]! : 0,
      scope: access.scope, focusedWorkflowId: null, capabilities: RECORD_CAPABILITIES, workflows, tickets, taskReferences, decisions,
      summary: { countingScope: access.scope.kind === 'coordinator' ? 'instance' : 'assignment', totalTickets: tickets.length, totalTaskReferences: taskReferences.length, statusCounts,
        pendingDecisionCount: decisions.filter(row => row.value.pending).length,
        pendingUserDecisionCount: decisions.filter(row => row.value.pending && row.value.addressee?.kind === 'user').length,
        pendingForPrincipalCount: decisions.filter(row => row.value.pending && row.value.addressee?.principalId === access.author.principalId).length,
        awaitingImplementationCount: decisions.filter(row => row.value.awaitingImplementation).length } })
  }

  async readSummary(principal: string, sessionId: string, signal?: AbortSignal): Promise<InstrumentSummary> {
    const context = await this.context(principal, sessionId, 'read', signal)
    const document = await this.load(context.controls.instance, signal)
    const current = currentDecisionIndex(document), access = context.access
    let pendingUserDecisionCount = 0
    for (const decision of current.decisions) {
      if (decision.pending && decision.userAddressee && decisionAllowed(access, decision.workflowId, decision, decision.creator)) pendingUserDecisionCount++
    }
    return freeze({ instance: context.controls.instance, revision: document.revision,
      businessRevision: current.businessRevision, viewerRevision: current.viewerRevisions.get(access.author.principalId) ?? 0,
      scope: access.scope, summary: { countingScope: access.scope.kind === 'coordinator' ? 'instance' : 'assignment', pendingUserDecisionCount } })
  }

  async apply(principal: string, sessionId: string, input: InstrumentCommand): Promise<InstrumentApplyResult> {
    const command = parseInstrumentCommand(input) // detach before any awaited host access
    const recordedAt = revision(this.now(), 'recordedAt')
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const context = await this.context(principal, sessionId, 'write')
      const current = await this.load(context.controls.instance)
      const state = projectInstrumentDocument(current)
      this.checkChange(state, command, context.access)
      const receipt=current.schemaVersion!==1 ? current.dedup.find(d=>d.operationId===command.operationId) : undefined
      if(receipt) {
        if(receipt.kind!=='command' || receipt.digest!==digest(command,context.access.author)) throw new ControlsError('operation-conflict','operationId already belongs to another author or payload')
        return freeze({appliedRevision:receipt.appliedRevision,replayed:true,snapshot:this.snapshot(current,context.access,{})})
      }
      const prior = current.events.find(event => event.command.operationId === command.operationId)
      if (prior) {
        if (JSON.stringify(prior.command) !== JSON.stringify(command) || JSON.stringify(prior.author) !== JSON.stringify(context.access.author)) throw new ControlsError('operation-conflict', 'operationId already belongs to another author or payload')
        return freeze({ appliedRevision: prior.revision, replayed: true, snapshot: this.snapshot(current, context.access, {}) })
      }
      const targetRevision = command.action === 'set-decision-view' ? this.viewerRevision(state, principal) : state.businessRevision
      if (targetRevision !== command.expectedRevision) throw new ControlsError('revision-conflict', 'instrument business/viewer revision changed; reload before updating')
      this.checkFeature(context.controls, state, command)
      const candidate: InstrumentDocument = { ...upgradeInstrumentDocument(current, command.action === 'put-task-reference'), revision: increment(current.revision),
        events: [...current.events, { revision: increment(current.revision), recordedAt, author: context.access.author, command }] }
      projectInstrumentDocument(candidate) // malformed references are input errors, not business rulings
      const next = parseInstrumentDocument(candidate)
      const snapshot = this.snapshot(next, context.access, {})
      if (await this.storage.compareAndSwap(current.instrumentInstanceId, current.revision, next)) {
        return freeze({ appliedRevision: next.revision, replayed: false, snapshot })
      }
    }
    throw new ControlsError('concurrent-update', 'instrument changed repeatedly; retry against the saved revision')
  }

  async compact(principal:string,sessionId:string,input:InstrumentCompactInput,signal?:AbortSignal):Promise<InstrumentCleanupResult> {
    signal?.throwIfAborted()
    const command=compactInput(input), recordedAt=revision(this.now(),'cleanup recordedAt')
    for(let attempt=0;attempt<32;attempt++) {
      signal?.throwIfAborted()
      const context=await this.context(principal,sessionId,'write',signal)
      signal?.throwIfAborted()
      this.cleanupAccess(context,sessionId)
      const loaded=await this.load(context.controls.instance,signal)
      signal?.throwIfAborted()
      const current=upgradeInstrumentDocument(loaded),hash=digest({action:'compact',...command},context.access.author)
      const prior=current.dedup.find(d=>d.operationId===command.operationId)
      if(prior) {
        if(prior.kind!=='compact' || prior.digest!==hash) throw new ControlsError('operation-conflict','cleanup operation belongs to another author or payload')
        return this.cleanupResult(current,context.access,prior.appliedRevision,true,0)
      }
      if(current.events.some(e=>e.command.operationId===command.operationId)) throw new ControlsError('operation-conflict','cleanup operation belongs to a business command')
      if(command.expectedRevision!==current.revision) throw new ControlsError('revision-conflict','source document changed; reload before cleanup')
      const state=projectInstrumentDocument(current), appliedRevision=increment(current.revision)
      const checkpointState={...state,decisions:state.decisions.map(row=>({...row,creator:row.creator??row.history[0]!.author}))}
      const receipt:InstrumentDedup={operationId:command.operationId,author:context.access.author,digest:hash,kind:'compact',appliedRevision}
      const coverage:InstrumentCleanupCoverage={operationId:command.operationId,action:'compact',appliedRevision,author:context.access.author,recordedAt,throughRevision:current.revision,targets:[],removedVersions:0,removedRevisions:[]}
      const dedup=[...current.dedup,...current.events.map((event):InstrumentDedup=>({operationId:event.command.operationId,author:event.author,digest:digest(event.command,event.author),kind:'command',appliedRevision:event.revision,command:instrumentCommandMetadata(event)})),receipt]
      const next=parseInstrumentDocument({...current,revision:appliedRevision,checkpoint:{throughRevision:appliedRevision,state:checkpointPayload(current,checkpointState)},events:[],dedup,coverage:[...current.coverage,coverage]}) as InstrumentDocumentV2 | InstrumentDocumentV3
      signal?.throwIfAborted()
      // CAS has begun: cancellation cannot turn a durable acknowledgement into rollback.
      const committed=await this.storage.compareAndSwap(current.instrumentInstanceId,current.revision,next)
      if(committed) return this.cleanupResult(next,context.access,appliedRevision,false,0)
      signal?.throwIfAborted()
    }
    throw new ControlsError('concurrent-update','source changed repeatedly during compact')
  }
  async purgeHistory(principal:string,sessionId:string,input:InstrumentPurgeHistoryInput,signal?:AbortSignal):Promise<InstrumentCleanupResult> {
    signal?.throwIfAborted()
    const command=purgeInput(input),recordedAt=revision(this.now(),'cleanup recordedAt')
    for(let attempt=0;attempt<32;attempt++) {
      signal?.throwIfAborted()
      const context=await this.context(principal,sessionId,'write',signal)
      signal?.throwIfAborted()
      this.cleanupAccess(context,sessionId)
      const loaded=await this.load(context.controls.instance,signal)
      signal?.throwIfAborted()
      const current=upgradeInstrumentDocument(loaded),hash=digest({action:'purge-history',...command},context.access.author)
      const prior=current.dedup.find(d=>d.operationId===command.operationId)
      if(prior) {
        if(prior.kind!=='purge-history' || prior.digest!==hash) throw new ControlsError('operation-conflict','cleanup operation belongs to another author or payload')
        const result=current.coverage.find(c=>c.operationId===command.operationId)!
        return this.cleanupResult(current,context.access,prior.appliedRevision,true,result.removedVersions)
      }
      if(current.events.some(e=>e.command.operationId===command.operationId)) throw new ControlsError('operation-conflict','cleanup operation belongs to a business command')
      if(command.expectedRevision!==current.revision) throw new ControlsError('revision-conflict','source document changed; reload before cleanup')
      if(command.throughRevision>current.revision) invalid('source purge throughRevision exceeds saved source revision')
      const state=projectInstrumentDocument(current)
      if(command.targets.some(t=>!(t.kind==='workflow' ? state.workflows : t.kind==='ticket' ? state.tickets : t.kind==='task-reference' ? state.taskReferences : state.decisions).some(row=>targetMatches(t,t.kind,row)))) invalid('source purge target is not recorded in scoped owner')
      let removedVersions=0
      const removedRevisions:number[]=[]
      const history=<T>(kind:'workflow'|'ticket'|'task-reference'|'decision',row:WorkflowRecord|TicketRecord|TaskReferenceRecord|DecisionRecord,versions:readonly Change<T>[]):readonly Change<T>[]=>{
        if(!command.targets.some(t=>targetMatches(t,kind,row))) return versions
        return versions.filter(version=>{const keep=version.revision===row.revision || version.revision>command.throughRevision;if(!keep) {removedVersions++;removedRevisions.push(version.revision)}return keep})
      }
      const checkpointState={...state,
        workflows:state.workflows.map(row=>({...row,history:history('workflow',row,row.history)})),
        tickets:state.tickets.map(row=>({...row,history:history('ticket',row,row.history)})),
        taskReferences:state.taskReferences.map(row=>({...row,history:history('task-reference',row,row.history)})),
        decisions:state.decisions.map(row=>({...row,creator:row.creator??row.history[0]!.author,history:history('decision',row,row.history)}))}
      const appliedRevision=increment(current.revision),receipt:InstrumentDedup={operationId:command.operationId,author:context.access.author,digest:hash,kind:'purge-history',appliedRevision}
      const coverage:InstrumentCleanupCoverage={operationId:command.operationId,action:'purge-history',appliedRevision,author:context.access.author,recordedAt,throughRevision:command.throughRevision,targets:command.targets,removedVersions,removedRevisions:removedRevisions.sort((a,b)=>a-b)}
      const dedup=[...current.dedup,...current.events.map((event):InstrumentDedup=>({operationId:event.command.operationId,author:event.author,digest:digest(event.command,event.author),kind:'command',appliedRevision:event.revision,command:instrumentCommandMetadata(event)})),receipt]
      const next=parseInstrumentDocument({...current,revision:appliedRevision,checkpoint:{throughRevision:appliedRevision,state:checkpointPayload(current,checkpointState)},events:[],dedup,coverage:[...current.coverage,coverage]}) as InstrumentDocumentV2 | InstrumentDocumentV3
      signal?.throwIfAborted()
      // CAS has begun: cancellation cannot turn a durable acknowledgement into rollback.
      const committed=await this.storage.compareAndSwap(current.instrumentInstanceId,current.revision,next)
      if(committed) return this.cleanupResult(next,context.access,appliedRevision,false,removedVersions)
      signal?.throwIfAborted()
    }
    throw new ControlsError('concurrent-update','source changed repeatedly during history purge')
  }
  private cleanupAccess(context:{controls:SessionControlsView;access:InstrumentAccess},sessionId:string):void {
    if(context.access.scope.kind!=='coordinator' || sessionId!==context.controls.instance.ownerSessionId) throw new ControlsError('access-denied','source cleanup requires authenticated owner coordinator context')
  }
  private cleanupResult(document:InstrumentDocumentV2|InstrumentDocumentV3,access:InstrumentAccess,appliedRevision:number,replayed:boolean,removedVersions:number):InstrumentCleanupResult {
    return freeze({appliedRevision,replayed,removedVersions,checkpointRevision:document.checkpoint.throughRevision,coverage:document.coverage,snapshot:this.snapshot(document,access,{})})
  }
  private async context(principal: string, sessionId: string, mode: 'read' | 'write', signal?:AbortSignal): Promise<{ controls: SessionControlsView; access: InstrumentAccess }> {
    signal?.throwIfAborted()
    const actor = id(principal, 'principal'), session = id(sessionId, 'sessionId')
    const controls = await this.controls.readSession(actor, session)
    signal?.throwIfAborted()
    const rawAccess=await this.authority.resolveAccess(actor, session, controls.instance, mode)
    signal?.throwIfAborted()
    const access = parseAccess(rawAccess, actor, session)
    return { controls, access }
  }
  private async load(instance: InstrumentInstance, signal?:AbortSignal): Promise<InstrumentDocument> {
    signal?.throwIfAborted()
    const raw = await this.storage.read(instance.instrumentInstanceId)
    signal?.throwIfAborted()
    const document = raw === undefined ? initialInstrumentDocument(instance) : parseInstrumentDocument(raw)
    if (document.instrumentInstanceId !== instance.instrumentInstanceId || document.ownerSessionId !== instance.ownerSessionId || document.controlWorkspaceId !== instance.controlWorkspaceId) throw new ControlsError('association-conflict', 'instrument record conflicts with trusted owner instance')
    return document
  }
  private viewerRevision(state: InstrumentState, principal: string): number {
    return Object.hasOwn(state.viewerRevisions, principal) ? state.viewerRevisions[principal]! : 0
  }
  private checkChange(state: InstrumentState, command: InstrumentCommand, access: InstrumentAccess): void {
    if (access.scope.kind === 'coordinator') return
    const denied = (): never => { throw new ControlsError('access-denied', 'change exceeds authenticated assignment') }
    if (command.workflowId !== access.scope.workflowId || command.action === 'put-workflow') denied()
    if (command.action === 'put-ticket' || command.action === 'put-task-reference') {
      if (!access.scope.ticketIds.includes(command.localTicketId)) denied()
      return
    }
    if (command.action !== 'put-decision' && command.action !== 'set-decision-view') return denied()
    const previous = state.decisions.find(row => row.workflowId === command.workflowId && row.decisionId === command.decisionId)
    if (previous && !decisionAllowed(access, command.workflowId, previous.value, creatorOf(previous))) denied()
    if (command.action === 'put-decision' && !decisionAllowed(access, command.workflowId, { ...previous?.value, ...command.value }, previous ? creatorOf(previous) : access.author.principalId)) denied()
  }
  private checkFeature(controls: SessionControlsView, state: InstrumentState, command: InstrumentCommand): void {
    let allowed = true
    if (command.action === 'put-workflow' && !state.workflows.some(row => row.workflowId === command.workflowId)) allowed = controls.policy.features.ticketProgress.status === 'configured' || controls.policy.features.pendingDecisions.status === 'configured' || command.value.axes.length === 0 && controls.policy.features.windows?.status === 'configured'
    if (command.action === 'put-task-reference' && !state.taskReferences.some(row => row.workflowId === command.workflowId && row.localTicketId === command.localTicketId)) allowed = controls.policy.features.ticketProgress.status === 'configured' || controls.policy.features.pendingDecisions.status === 'configured' || controls.policy.features.windows?.status === 'configured'
    if (command.action === 'put-ticket' && !state.tickets.some(row => row.workflowId === command.workflowId && row.localTicketId === command.localTicketId)) allowed = controls.policy.features.ticketProgress.status === 'configured'
    if (command.action === 'put-decision' && !state.decisions.some(row => row.workflowId === command.workflowId && row.decisionId === command.decisionId)) allowed = controls.policy.features.pendingDecisions.status === 'configured'
    if (!allowed) throw new ControlsError('feature-disabled', 'new instrument records require the corresponding configured feature; retained records remain available')
  }
  private filter(value: unknown): InstrumentFilter {
    const raw = record(value, 'instrument filter', ['workflowId', 'afterRevision'])
    return { ...(raw.workflowId === undefined ? {} : { workflowId: id(raw.workflowId, 'filter workflowId') }),
      ...(raw.afterRevision === undefined ? {} : { afterRevision: revision(raw.afterRevision, 'afterRevision') }) }
  }

  private snapshot(document: InstrumentDocument, access: InstrumentAccess, filter: InstrumentFilter): InstrumentSnapshot {
    const state = projectInstrumentDocument(document)
    if ((filter.afterRevision ?? 0) > document.revision) invalid('change cursor exceeds this instance revision')
    const withinWorkflow = (workflowId: string): boolean => access.scope.kind === 'coordinator' || access.scope.workflowId === workflowId
    const withinTicket = (workflowId: string, ticketId: string): boolean => withinWorkflow(workflowId) && (access.scope.kind === 'coordinator' || access.scope.ticketIds.includes(ticketId))
    const workflows = state.workflows.filter(row => withinWorkflow(row.workflowId))
    const tickets = state.tickets.filter(row => withinTicket(row.workflowId, row.localTicketId))
    const taskReferences = state.taskReferences.filter(row => withinTicket(row.workflowId, row.localTicketId))
    const keyOf = (workflowId: string, decisionId: string): string => JSON.stringify([workflowId, decisionId])
    const views = new Map(state.decisionViews.filter(view => view.principalId === access.author.principalId)
      .map(view => [keyOf(view.workflowId, view.decisionId), view.value]))
    // Source revisions are unique within this document. Index the merged value at
    // that exact revision, never the raw optional patch or the latest association.
    const versions = new Map<number, { readonly value: DecisionValue; readonly creator: string }>()
    for (const row of state.decisions) for (const change of row.history) versions.set(change.revision, { value: change.value, creator: creatorOf(row) })
    const decisions = state.decisions.filter(row => decisionAllowed(access, row.workflowId, row.value, creatorOf(row)))
      .map(row => ({ ...row, registration: registrationFor(document, access, row.workflowId, row.decisionId), updatedAt: row.history.at(-1)!.recordedAt, history: row.history.filter(change => decisionAllowed(access, row.workflowId, change.value, creatorOf(row))),
        view: views.get(keyOf(row.workflowId, row.decisionId)) ?? { read: false, hidden: false } }))
    const visibleDecisions = new Set(decisions.map(row => keyOf(row.workflowId, row.decisionId)))
    const changes = document.events.filter(event => {
      if (event.revision <= (filter.afterRevision ?? 0)) return false
      const command = event.command
      if (!withinWorkflow(command.workflowId)) return false
      if (command.action === 'put-ticket' || command.action === 'put-task-reference') return withinTicket(command.workflowId, command.localTicketId)
      if (command.action === 'put-decision') {
        const version = versions.get(event.revision)
        return !!version && visibleDecisions.has(keyOf(command.workflowId, command.decisionId)) && decisionAllowed(access, command.workflowId, version.value, version.creator)
      }
      if (command.action === 'set-decision-view') return event.author.principalId === access.author.principalId && visibleDecisions.has(keyOf(command.workflowId, command.decisionId))
      return true
    })
    const statusCounts = workflows.flatMap(workflow => workflow.value.axes.map(axis => {
      const scoped = tickets.filter(ticket => ticket.workflowId === workflow.workflowId)
      return { workflowId: workflow.workflowId, axisKey: axis.axisKey, label: axis.label, counting: axis.counting,
        unreported: scoped.filter(ticket => selectionsFor(ticket.value, axis.axisKey).length === 0).length,
        statuses: axis.statuses.map(status => ({ statusKey: status.statusKey, label: status.label, meaning: status.meaning ?? null,
          ...(status.summaryPriority === undefined ? {} : { summaryPriority: status.summaryPriority }),
          count: scoped.filter(ticket => selectionsFor(ticket.value, axis.axisKey).includes(status.statusKey)).length })) }
    }))
    return freeze({ instance: { instrumentInstanceId: document.instrumentInstanceId, ownerSessionId: document.ownerSessionId, controlWorkspaceId: document.controlWorkspaceId },
      revision: document.revision, businessRevision: state.businessRevision, viewerRevision: this.viewerRevision(state, access.author.principalId), scope: access.scope,
      capabilities: RECORD_CAPABILITIES, focusedWorkflowId: filter.workflowId ?? null, workflows: workflows.filter(row => filter.workflowId === undefined || row.workflowId === filter.workflowId),
      tickets: tickets.filter(row => filter.workflowId === undefined || row.workflowId === filter.workflowId), taskReferences: taskReferences.filter(row => filter.workflowId === undefined || row.workflowId === filter.workflowId), decisions, changes,
      ...(document.schemaVersion!==1 && document.checkpoint.throughRevision>0 ? {historyCoverage:{checkpointRevision:document.checkpoint.throughRevision,purged:document.coverage.some(c=>c.removedVersions>0)}} : {}),
      summary: { countingScope: access.scope.kind === 'coordinator' ? 'instance' : 'assignment', totalTickets: tickets.length, totalTaskReferences: taskReferences.length, statusCounts,
        pendingDecisionCount: decisions.filter(row => row.value.pending).length,
        pendingUserDecisionCount: decisions.filter(row => row.value.pending && row.value.addressee?.kind === 'user').length,
        pendingForPrincipalCount: decisions.filter(row => row.value.pending && row.value.addressee?.principalId === access.author.principalId).length,
        awaitingImplementationCount: decisions.filter(row => row.value.awaitingImplementation).length } })
  }
}
