import { parseStartupDesired, parseStartupStatus } from './startup-state.js'
import type { StartupDesired, StartupStatus } from './startup-state.js'
import { parsePolicyIntent, parsePolicySnapshot } from './policy.js'
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
import { array, boolean, freeze, id, invalid, record, revision } from './validation.js'

/** Shared by Host and Client; no Host SDK or Node imports enter the browser. */
export const REMOTE_NAMESPACE = 'mattpocockControls' as const
export const REMOTE_METHODS = ['readPolicy', 'savePolicy', 'listWorkspaces', 'readSession', 'applyInstrument', 'applyTicketWindow', 'resourceAction', 'grantPolicy', 'historyAction', 'worktreeAction', 'startupStatus', 'saveStartupSettings'] as const
export type RemoteMethod = typeof REMOTE_METHODS[number]
export type HostJson = null | boolean | number | string | HostJson[] | { [key: string]: HostJson }
export interface HostCaller { readonly kind: 'user' | 'agent'; readonly principalId: string; readonly sessionId: string | null }
export interface WorkspaceRow { readonly id: string; readonly path: string; readonly title: string; readonly status: 'ok' | 'missing-dir'; readonly sessionIds?: readonly string[] }
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
  readonly capabilities: readonly { readonly key: string; readonly status: string; readonly reason: string | null }[]
  readonly health: readonly { readonly scope: string; readonly status: string; readonly reason: string | null }[]
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
    ...((method === 'readSession' || method === 'historyAction' || method === 'startupStatus' || method === 'saveStartupSettings') ? { cancellation: { parameter: 'signal' as const } } : {}) }
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
    descriptor('applyInstrument', [['sessionId', sessionCodec], ['command', strict('InstrumentCommand', parseInstrumentCommand)]], jsonCodec),
    descriptor('applyTicketWindow', [['sessionId', sessionCodec], ['command', strict('TicketWindowCommand', parseRemoteTicketWindow)]], jsonCodec),
    descriptor('resourceAction', [['sessionId', sessionCodec], ['request', strict('ResourceAction', parseResourceAction)]], jsonCodec),
    descriptor('historyAction', [['sessionId', sessionCodec], ['request', jsonCodec]], jsonCodec),
    descriptor('worktreeAction', [['sessionId', sessionCodec], ['request', jsonCodec]], jsonCodec),
    descriptor('grantPolicy', [['sessionId', sessionCodec], ['enabled', strict('Boolean', value => boolean(value, 'enabled'))], ['expectedRevision', revisionCodec]], strict('PolicyGrants', parsePolicyGrants)),
  ]),
})
