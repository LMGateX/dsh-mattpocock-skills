import { parseStartupDesired, parseStartupStatus } from './startup-state.js'
import type { StartupDesired, StartupStatus } from './startup-state.js'
import { parsePolicyIntent, parsePolicySnapshot, DISPLAY_NAMES } from './policy.js'
import type { EffectivePolicy, PolicyIntent, PolicySnapshot } from './policy.js'
import { parseInstrumentCommand } from './instrument-state.js'
import type { InstrumentSnapshot } from './instruments.js'
import type { WindowSnapshot } from './windows.js'
import type { ResourceView } from './resources.js'
import type { InstrumentInstance } from './state.js'
import type { InvocationDescriptor, TypertCodec, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type { InstrumentCommand } from './instrument-state.js'
import type { TicketWindowCommand } from './windows.js'
import type { CreateWorktree, ResourceBusiness, RetireDisposition } from './resources.js'
import { array, boundedArray, boolean, freeze, id, invalid, record, revision } from './validation.js'

/** Shared by Host and Client; no Host SDK or Node imports enter the browser. */
export const REMOTE_NAMESPACE = 'mattpocockControls' as const
export const REMOTE_METHODS = ['readPolicy', 'savePolicy', 'listWorkspaces', 'readSession', 'readSummaries', 'applyInstrument', 'applyTicketWindow', 'resourceAction', 'grantPolicy', 'historyAction', 'worktreeAction', 'startupStatus', 'saveStartupSettings'] as const
export type RemoteMethod = typeof REMOTE_METHODS[number]
export type HostJson = null | boolean | number | string | HostJson[] | { [key: string]: HostJson }
export interface HostCaller { readonly kind: 'user' | 'agent'; readonly principalId: string; readonly sessionId: string | null }
export interface WorkspaceRow { readonly id: string; readonly path: string; readonly title: string; readonly status: 'ok' | 'missing-dir'; readonly sessionIds?: readonly string[] }
/** One open terminal-outcome row for the main agent: the published outcome, never a guessed cause. */
export interface NativeStopRow {
  /** Durable dedup key: child session id + turn, plus the host runId when the host supplied one. */
  readonly itemId: string
  readonly sessionId: string
  /** The turn whose outcome this row reports; null when no turn could be read. */
  readonly turn: number | null
  /** Published outcome vocabulary, or 'unobservable' when no readable fact exists. */
  readonly outcome: string
  /** Published aborted cancel cause; null when unreadable or not an abort. */
  readonly cancelCause: string | null
  /** Published LlmFailure facts (code/message verbatim); null when the host supplied none. */
  readonly diagnostic: string | null
  /** Evidence pointer carried only by an 'unobservable' outcome. */
  readonly evidence: { readonly sessionId: string; readonly turn: number | null; readonly seq: number | null } | null
  /** One-line mechanical observation; never a guessed cause. */
  readonly observed: string
  readonly lane: { readonly workflowId: string | null; readonly localTicketId: string | null } | null
  /** Trees this child created with the native tool, so one terminal item also names its trees. */
  readonly createdWorktrees?: readonly { readonly path: string; readonly branch: string; readonly businessState: 'open' | 'cleaned' }[]
}
export interface RuntimeSnapshot {
  readonly sessionId: string
  readonly caller: HostCaller
  readonly policyGrants: PolicyGrants
  readonly instance: InstrumentInstance
  readonly policy: EffectivePolicy
  readonly records: InstrumentSnapshot | null
  readonly windows: WindowSnapshot | null
  readonly resources: readonly ResourceView[]
  readonly worktreeBindings?: readonly import('./worktree-bindings.js').WorktreeBindingCurrent[]
  /** Observed native create_worktree rows with read-time creator activity and lane; never a usage claim. */
  readonly worktreeObservations?: readonly import('./worktree-observations.js').WorktreeObservationView[]
  /** Native count provenance: a runtime re-establishment is never a terminal-outcome signal. */
  readonly nativeCount?: { readonly reestablished: boolean; readonly runtimeId: string; readonly previousRuntimeId: string | null }
  /** Open terminal-outcome items the main agent must handle; never a count source. */
  readonly nativeStops?: readonly NativeStopRow[]
  readonly capabilities: readonly { readonly key: string; readonly status: string; readonly reason: string | null }[]
  readonly health: readonly { readonly scope: string; readonly status: string; readonly reason: string | null }[]
}
/** Bounded UI read model, not a full instrument snapshot or a business ledger. */
export const SUMMARY_BATCH_LIMIT = 32
export const SUMMARY_RESPONSE_LIMIT = 256 * 1024
export interface SessionSummaryRequest {
  readonly sessions: readonly { readonly sessionId: string; readonly version?: string }[]
}
export interface SessionSummary {
  readonly sessionId: string
  readonly caller: HostCaller
  readonly instance: InstrumentInstance
  readonly policy: Pick<EffectivePolicy, 'configurationRevision' | 'controlWorkspaceId' | 'workspaceVerified' | 'extensionEnabled' | 'workspaceEnabled' | 'display'>
  readonly records: null | {
    readonly businessRevision: number
    readonly viewerRevision: number
    readonly summary: { readonly countingScope: 'instance' | 'assignment'; readonly pendingUserDecisionCount: number }
  }
  /** Coverage only for fields this read model actually provides, not full runtime health. */
  readonly health: readonly { readonly scope: 'records'; readonly status: 'unknown'; readonly reason: string }[]
}
export type SessionSummaryResult =
  | { readonly sessionId: string; readonly status: 'current'; readonly version: string; readonly summary: SessionSummary }
  | { readonly sessionId: string; readonly status: 'unchanged'; readonly version: string }
  | { readonly sessionId: string; readonly status: 'unavailable'; readonly reason: string }
export interface SessionSummaryBatch { readonly rows: readonly SessionSummaryResult[] }
function summaryArray(value: unknown, where: string, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length > maximum) invalid(where + ' accepts at most ' + maximum + ' entries')
  return boundedArray(value, where, maximum)
}
function summaryVersion(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)) invalid('summary version must be a SHA-256 token')
  return value
}
export function parseSessionSummaryRequest(value: unknown): SessionSummaryRequest {
  const request = record(value, 'session summary request', ['sessions'])
  const sessions = summaryArray(request.sessions, 'summary sessions', SUMMARY_BATCH_LIMIT).map(value => {
    const row = record(value, 'summary session', ['sessionId', 'version'])
    return { sessionId: id(row.sessionId, 'summary sessionId'), ...(row.version === undefined ? {} : { version: summaryVersion(row.version) }) }
  })
  if (sessions.length === 0 || new Set(sessions.map(row => row.sessionId)).size !== sessions.length) invalid('summary batch needs unique sessions')
  return freeze({ sessions })
}
function parseSessionSummary(value: unknown): SessionSummary {
  const raw = record(value, 'session summary', ['sessionId', 'caller', 'instance', 'policy', 'records', 'health'])
  const sessionId = id(raw.sessionId, 'summary sessionId'), c = record(raw.caller, 'summary caller', ['kind', 'principalId', 'sessionId'])
  if (c.kind !== 'user' && c.kind !== 'agent' || (c.kind === 'user' ? c.sessionId !== null : c.sessionId !== sessionId)) invalid('summary caller identity is inconsistent')
  const caller: HostCaller = { kind: c.kind, principalId: id(c.principalId, 'summary principal'), sessionId: c.kind === 'user' ? null : sessionId }
  const i = record(raw.instance, 'summary instance', ['instrumentInstanceId', 'ownerSessionId', 'controlWorkspaceId'])
  const instance = { instrumentInstanceId: id(i.instrumentInstanceId, 'summary instanceId'), ownerSessionId: id(i.ownerSessionId, 'summary owner'), controlWorkspaceId: id(i.controlWorkspaceId, 'summary workspace') }
  const p = record(raw.policy, 'summary policy', ['configurationRevision', 'controlWorkspaceId', 'workspaceVerified', 'extensionEnabled', 'workspaceEnabled', 'display'])
  if (p.controlWorkspaceId !== instance.controlWorkspaceId) invalid('summary policy and instance workspace disagree')
  const d = record(p.display, 'summary display', DISPLAY_NAMES)
  const display = Object.fromEntries(DISPLAY_NAMES.map(key => [key, boolean(d[key], 'summary display ' + key)])) as unknown as EffectivePolicy['display']
  const policy = { configurationRevision: revision(p.configurationRevision, 'summary policy revision'), controlWorkspaceId: instance.controlWorkspaceId,
    workspaceVerified: boolean(p.workspaceVerified, 'summary workspace verified'), extensionEnabled: boolean(p.extensionEnabled, 'summary extension enabled'), workspaceEnabled: boolean(p.workspaceEnabled, 'summary workspace enabled'), display }
  let records: SessionSummary['records'] = null
  if (raw.records !== null) {
    const r = record(raw.records, 'summary records', ['businessRevision', 'viewerRevision', 'summary'])
    const s = record(r.summary, 'summary counts', ['countingScope', 'pendingUserDecisionCount'])
    if (s.countingScope !== 'instance' && s.countingScope !== 'assignment') invalid('summary counting scope is unavailable')
    records = { businessRevision: revision(r.businessRevision, 'summary business revision'), viewerRevision: revision(r.viewerRevision, 'summary viewer revision'),
      summary: { countingScope: s.countingScope, pendingUserDecisionCount: revision(s.pendingUserDecisionCount, 'summary pending count') } }
  }
  const health = summaryArray(raw.health, 'summary health', 1).map(value => {
    const h = record(value, 'summary health row', ['scope', 'status', 'reason'])
    if (h.scope !== 'records' || h.status !== 'unknown') invalid('unsupported summary health scope')
    return { scope: 'records' as const, status: 'unknown' as const, reason: id(h.reason, 'summary health reason') }
  })
  if (records === null ? health.length !== 1 : health.length !== 0) invalid('summary record coverage and health disagree')
  return freeze({ sessionId, caller, instance, policy, records, health })
}
export function parseSessionSummaryBatch(value: unknown): SessionSummaryBatch {
  const raw = record(value, 'session summary batch', ['rows'])
  const rows = summaryArray(raw.rows, 'summary rows', SUMMARY_BATCH_LIMIT).map((value): SessionSummaryResult => {
    const row = record(value, 'summary result'), sessionId = id(row.sessionId, 'summary result sessionId')
    if (row.status === 'current') {
      record(row, 'current summary', ['sessionId', 'status', 'version', 'summary'])
      const summary = parseSessionSummary(row.summary)
      if (summary.sessionId !== sessionId) invalid('summary result belongs to another session')
      return { sessionId, status: 'current', version: summaryVersion(row.version), summary }
    }
    if (row.status === 'unchanged') {
      record(row, 'unchanged summary', ['sessionId', 'status', 'version'])
      return { sessionId, status: 'unchanged', version: summaryVersion(row.version) }
    }
    record(row, 'unavailable summary', ['sessionId', 'status', 'reason'])
    if (row.status !== 'unavailable') invalid('unsupported summary result status')
    return { sessionId, status: 'unavailable', reason: id(row.reason, 'summary unavailable reason') }
  })
  if (new Set(rows.map(row => row.sessionId)).size !== rows.length) invalid('duplicate summary result session')
  return freeze({ rows })
}
export interface PolicyGrant { readonly sessionId: string; readonly enabled: boolean }
export interface PolicyGrants { readonly schemaVersion: 1; readonly revision: number; readonly grants: readonly PolicyGrant[] }
export type ResourceAction =
  | { readonly action: 'create'; readonly spec: CreateWorktree }
  | { readonly action: 'borrow'; readonly path: string }
  | { readonly action: 'read' | 'retain' | 'actual-retire'; readonly resourceId: string }
  | { readonly action: 'update-business'; readonly resourceId: string; readonly business: ResourceBusiness }
  | { readonly action: 'request-retire'; readonly resourceId: string; readonly disposition: RetireDisposition }

export interface ControlsRemote {
  startupStatus(signal?: AbortSignal): Promise<StartupStatus>
  saveStartupSettings(desired: StartupDesired, expectedRevision: number, signal?: AbortSignal): Promise<StartupStatus>
  readPolicy(): Promise<PolicySnapshot>
  savePolicy(intent: PolicyIntent, expectedRevision: number): Promise<PolicySnapshot>
  listWorkspaces(): Promise<readonly WorkspaceRow[]>
  readSession(sessionId: string, signal?: AbortSignal): Promise<HostJson>
  readSummaries(request: SessionSummaryRequest, signal?: AbortSignal): Promise<SessionSummaryBatch>
  applyInstrument(sessionId: string, command: InstrumentCommand): Promise<HostJson>
  applyTicketWindow(sessionId: string, command: TicketWindowCommand): Promise<HostJson>
  resourceAction(sessionId: string, request: ResourceAction): Promise<HostJson>
  grantPolicy(sessionId: string, enabled: boolean, expectedRevision: number): Promise<PolicyGrants>
  historyAction(sessionId: string, request: HostJson, signal?: AbortSignal): Promise<HostJson>
  worktreeAction(sessionId: string, request: HostJson): Promise<HostJson>
}

/** A complete lossless JSON boundary, not JSON.stringify-based repair. */
export function parseHostJson(value: unknown): HostJson {
  const ancestors = new Set<object>()
  const visit = (input: unknown, depth: number): HostJson => {
    if (depth > 128) invalid('remote JSON exceeds maximum depth')
    if (input === null || typeof input === 'string' || typeof input === 'boolean') return input
    if (typeof input === 'number') { if (!Number.isFinite(input) || Object.is(input, -0)) invalid('remote number must be lossless JSON'); return input }
    if (typeof input !== 'object' || input === null) invalid('remote value must be JSON data')
    if (ancestors.has(input)) invalid('remote JSON must not cycle')
    ancestors.add(input)
    try {
      if (Array.isArray(input)) return array(input, 'remote array').map(entry => visit(entry, depth + 1))
      const raw = record(input, 'remote object')
      return Object.fromEntries(Object.entries(raw).map(([key, entry]) => [key, visit(entry, depth + 1)]))
    } finally { ancestors.delete(input) }
  }
  return freeze(visit(value, 0))
}
export function parsePolicyGrants(value: unknown): PolicyGrants {
  const raw = record(value, 'policy grants', ['schemaVersion', 'revision', 'grants'])
  if (raw.schemaVersion !== 1) invalid('unsupported policy grant version')
  const grants = array(raw.grants, 'policy grants').map(value => {
    const row = record(value, 'policy grant', ['sessionId', 'enabled'])
    return { sessionId: id(row.sessionId, 'grant sessionId'), enabled: boolean(row.enabled, 'grant enabled') }
  })
  if (new Set(grants.map(row => row.sessionId)).size !== grants.length) invalid('duplicate policy grant')
  return freeze({ schemaVersion: 1, revision: revision(raw.revision, 'grant revision'), grants })
}
/** Browser-safe equivalent of the window business command boundary, never execution receipts. */
export function parseRemoteTicketWindow(value: unknown): TicketWindowCommand {
  const r = record(value, 'ticket window command')
  if (r.action !== 'reserve' && r.action !== 'release' && r.action !== 'reacquire') invalid('ticket window commands must declare action "reserve", "release" or "reacquire"; there is no read action')
  record(r, 'ticket window command', ['action', 'operationId', 'workflowId', 'localTicketId', ...(r.action === 'reserve' ? [] : ['generation'])])
  const base = { operationId: id(r.operationId, 'operationId'), workflowId: id(r.workflowId, 'workflowId'), localTicketId: id(r.localTicketId, 'localTicketId') }
  if (r.action === 'reserve') return freeze({ ...base, action: 'reserve' })
  const generation = revision(r.generation, 'generation'); if (generation < 1) invalid('generation must be positive')
  return freeze({ ...base, action: r.action, generation })
}
export function parseResourceAction(value: unknown): ResourceAction {
  const raw = record(parseHostJson(value), 'resource action')
  const target = (): string => id(raw.resourceId, 'resourceId')
  const text = (value: unknown, where: string): string => { if (typeof value !== 'string' || value.length > 16384 || value.includes('\0')) invalid(where + ' must be bounded text'); return value }
  const absolute = (value: unknown): string => { const path = text(value, 'resource path'); if (!(path.startsWith('/') || /^[A-Za-z]:/u.test(path) && (path[2] === '/' || path.charCodeAt(2) === 92))) invalid('resource path must be absolute'); return path }
  switch (raw.action) {
    case 'create': {
      record(raw, 'create resource', ['action', 'spec'])
      const spec = record(raw.spec, 'worktree spec', ['repositoryPath', 'root', 'name', 'startPoint'])
      return freeze({ action: 'create', spec: { repositoryPath: absolute(spec.repositoryPath), root: absolute(spec.root), name: id(spec.name, 'name'), startPoint: id(spec.startPoint, 'startPoint') } })
    }
    case 'borrow': record(raw, 'borrow resource', ['action', 'path']); return freeze({ action: 'borrow', path: absolute(raw.path) })
    case 'read': case 'retain': case 'actual-retire':
      record(raw, 'resource target', ['action', 'resourceId']); return freeze({ action: raw.action, resourceId: target() })
    case 'update-business': {
      record(raw, 'resource business', ['action', 'resourceId', 'business'])
      const business = record(raw.business, 'resource business value', ['status', 'disposition', 'followup'])
      return freeze({ action: 'update-business', resourceId: target(), business: Object.fromEntries(Object.entries(business).map(([key, value]) => [key, text(value, key)])) })
    }
    case 'request-retire': {
      record(raw, 'retire resource', ['action', 'resourceId', 'disposition'])
      const d = record(raw.disposition, 'retire disposition', ['kind', 'branch', 'expectedFactsDigest', 'explanation', 'expectedBranchOid'])
      if (d.kind !== 'remove-clean' && d.kind !== 'discard') invalid('explicit retire disposition required')
      if (d.branch !== 'keep' && d.branch !== 'delete-owned') invalid('explicit branch disposition required')
      if (d.expectedBranchOid !== undefined && (typeof d.expectedBranchOid !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(d.expectedBranchOid))) invalid('invalid expected branch OID')
      return freeze({ action: 'request-retire', resourceId: target(), disposition: { kind: d.kind, branch: d.branch,
        ...(d.expectedFactsDigest === undefined ? {} : { expectedFactsDigest: id(d.expectedFactsDigest, 'expectedFactsDigest') }),
        ...(d.explanation === undefined ? {} : { explanation: text(d.explanation, 'explanation') }),
        ...(d.expectedBranchOid === undefined ? {} : { expectedBranchOid: d.expectedBranchOid as string }) } })
    }
    default: return invalid('unsupported resource action; program receipts are not wire operations')
  }
}

function strict(name: string, parse: (value: unknown) => unknown): TypertCodec { return { mode: 'strict', typeSymbol: REMOTE_NAMESPACE + '#' + name, create: () => ({ parse }) } }
const sessionCodec = strict('SessionId', value => id(value, 'sessionId'))
const jsonCodec = strict('Json', parseHostJson)
const revisionCodec = strict('Revision', value => revision(value, 'expectedRevision'))
function descriptor(method: RemoteMethod, parameters: readonly [string, TypertCodec][], result: TypertCodec): InvocationDescriptor {
  return { id: '@lmgatex/dsh-mattpocock-skills#' + REMOTE_NAMESPACE + '/' + method, service: REMOTE_NAMESPACE, namespace: REMOTE_NAMESPACE, method,
    invocation: { kind: 'direct' }, parameters: parameters.map(([name, codec]) => ({ name, wire: name, source: 'json', codec })), result,
    ...((method === 'readSession' || method === 'readSummaries' || method === 'historyAction' || method === 'startupStatus' || method === 'saveStartupSettings') ? { cancellation: { parameter: 'signal' as const } } : {}) }
}
/** The same strict contract is registered on Host and selected by Client $mount. */
export const REMOTE_CONTRIBUTION: TypertRemoteContribution = Object.freeze({
  package: '@lmgatex/dsh-mattpocock-skills',
  descriptors: Object.freeze([
    descriptor('startupStatus', [], strict('StartupStatus', parseStartupStatus)),
    descriptor('saveStartupSettings', [['desired', strict('StartupDesired', parseStartupDesired)], ['expectedRevision', revisionCodec]], strict('StartupStatus', parseStartupStatus)),
    descriptor('readPolicy', [], strict('PolicySnapshot', parsePolicySnapshot)),
    descriptor('savePolicy', [['intent', strict('PolicyIntent', parsePolicyIntent)], ['expectedRevision', revisionCodec]], strict('PolicySnapshot', parsePolicySnapshot)),
    descriptor('listWorkspaces', [], jsonCodec), descriptor('readSession', [['sessionId', sessionCodec]], jsonCodec),
    descriptor('readSummaries', [['request', strict('SessionSummaryRequest', parseSessionSummaryRequest)]], strict('SessionSummaryBatch', parseSessionSummaryBatch)),
    descriptor('applyInstrument', [['sessionId', sessionCodec], ['command', strict('InstrumentCommand', parseInstrumentCommand)]], jsonCodec),
    descriptor('applyTicketWindow', [['sessionId', sessionCodec], ['command', strict('TicketWindowCommand', parseRemoteTicketWindow)]], jsonCodec),
    descriptor('resourceAction', [['sessionId', sessionCodec], ['request', strict('ResourceAction', parseResourceAction)]], jsonCodec),
    descriptor('historyAction', [['sessionId', sessionCodec], ['request', jsonCodec]], jsonCodec),
    descriptor('worktreeAction', [['sessionId', sessionCodec], ['request', jsonCodec]], jsonCodec),
    descriptor('grantPolicy', [['sessionId', sessionCodec], ['enabled', strict('Boolean', value => boolean(value, 'enabled'))], ['expectedRevision', revisionCodec]], strict('PolicyGrants', parsePolicyGrants)),
  ]),
})
