import { randomUUID } from 'node:crypto'
import { parsePolicyIntent, resolvePolicy } from './policy.js'
import type { EffectivePolicy, PolicyIntent, PolicySnapshot } from './policy.js'
import { INITIAL_DOCUMENT, parseControlsDocument } from './state.js'
import type { ControlsDocument, InstrumentInstance, SessionAssociation } from './state.js'
import type { ControlsStorage } from './storage.js'
import { boolean, ControlsError, freeze, id, increment, invalid, record, revision } from './validation.js'

export { INITIAL_POLICY, parsePolicyIntent, parsePolicySnapshot, resolvePolicy } from './policy.js'
export type { PolicyIntent, PolicySnapshot, WorkspacePolicyPatch, EffectivePolicy, PolicySource,
  PolicyField, FeatureName, FeaturePatch, WindowPatch, DisplayPatch } from './policy.js'
export { INITIAL_DOCUMENT, parseControlsDocument } from './state.js'
export type { ControlsDocument, InstrumentInstance, SessionAssociation } from './state.js'
export { MemoryControlsStorage, createDomainControlsStorage } from './storage.js'
export type { ControlsStorage, ControlsStateTable } from './storage.js'
export { ControlsError } from './validation.js'
export type { ControlsErrorCode } from './validation.js'
export { SessionInstruments } from './instruments.js'
export type { InstrumentAuthority, InstrumentAccess, InstrumentScope, InstrumentFilter, InstrumentSnapshot, InstrumentApplyResult } from './instruments.js'
export { parseInstrumentCommand, parseInstrumentDocument, initialInstrumentDocument } from './instrument-state.js'
export type { InstrumentDocument, InstrumentEvent, InstrumentAuthor, InstrumentCommand, WorkflowValue, StatusAxis, StatusDefinition, TicketValue, DecisionValue, DecisionViewValue, WorkflowRecord, TicketRecord, DecisionRecord, Change } from './instrument-state.js'
export { MemoryInstrumentStorage, createDomainInstrumentStorage } from './instrument-storage.js'
export type { InstrumentStorage } from './instrument-storage.js'
export * from './windows.js'
export * from './resources.js'
export * from './git-worktrees.js'
export * from './consumption.js'
export * from './remote-contract.js'
export * from './runtime-state.js'
export * from './history.js'
export * from './worktree-bindings.js'
export * from './startup-state.js'
export * from './startup-support.js'

export type TrustedSession =
  | { readonly kind: 'owner'; readonly controlWorkspaceId: string }
  | { readonly kind: 'managed-child'; readonly parentSessionId: string }

/** Required host seam, not model-supplied declarations or a new approval policy.
 * Principals/session ids must originate in the existing authenticated host call.
 * Session role, parent and original control workspace are durable identity facts.
 */
export interface ControlsAuthority {
  authorizePolicy(principal: string, access: 'read' | 'write'): Promise<void>
  authorizeSession(principal: string, sessionId: string, access: 'read' | 'register'): Promise<void>
  resolveSession(sessionId: string): Promise<TrustedSession | undefined>
  verifyWorkspace(workspaceId: string): Promise<boolean>
}
export interface SessionControlsView {
  readonly documentRevision: number
  readonly association: SessionAssociation
  readonly instance: InstrumentInstance
  readonly policy: EffectivePolicy
}
interface Lineage { readonly sessionId: string; readonly identity: TrustedSession }

function parseIdentity(value: unknown): TrustedSession {
  const raw = record(value, 'trusted session')
  if (raw.kind === 'owner') {
    record(raw, 'owner identity', ['kind', 'controlWorkspaceId'])
    return { kind: 'owner', controlWorkspaceId: id(raw.controlWorkspaceId, 'controlWorkspaceId') }
  }
  if (raw.kind === 'managed-child') {
    record(raw, 'child identity', ['kind', 'parentSessionId'])
    return { kind: 'managed-child', parentSessionId: id(raw.parentSessionId, 'parentSessionId') }
  }
  return invalid('host must classify owner or managed-child explicitly')
}

/** Unmounted first-stage core. It has NO tools, T/S leases, Git actions or GUI effects.
 * Both business callers and settings callers later cross this same checked seam.
 */
export class WorkspaceControls {
  constructor(private readonly storage: ControlsStorage, private readonly authority: ControlsAuthority,
    private readonly newInstanceId: () => string = randomUUID) {}

  async readPolicy(principal: string): Promise<PolicySnapshot> {
    await this.authority.authorizePolicy(id(principal, 'principal'), 'read')
    return (await this.load()).policy
  }

  async savePolicy(principal: string, intent: PolicyIntent, expectedRevision: number): Promise<PolicySnapshot> {
    const actor = id(principal, 'principal')
    const draft = parsePolicyIntent(intent)
    revision(expectedRevision, 'expected policy revision')
    await this.authority.authorizePolicy(actor, 'write')
    const saved = await this.transact(current => {
      if (current.policy.revision !== expectedRevision) throw new ControlsError('revision-conflict', 'policy changed; reload the saved revision')
      const oldIntent = parsePolicyIntent({ extensionEnabled: current.policy.extensionEnabled,
        defaults: current.policy.defaults, workspaceOverrides: current.policy.workspaceOverrides })
      if (JSON.stringify(oldIntent) === JSON.stringify(draft)) return current
      return { ...current, revision: increment(current.revision), policy: { ...draft, revision: increment(current.policy.revision) } }
    })
    return saved.policy
  }

  /** Atomically register the verified root and missing descendants. Repeated/cold ensure
   * preserves identity; missing host lineage never defaults a child to a new owner.
   */
  async ensureSession(principal: string, sessionId: string): Promise<SessionControlsView> {
    const session = id(sessionId, 'sessionId')
    await this.authority.authorizeSession(id(principal, 'principal'), session, 'register')
    const lineage = await this.lineage(session)
    const root = lineage.at(-1)!
    if (root.identity.kind !== 'owner') throw new ControlsError('association-conflict', 'lineage has no owner')
    const workspaceId = root.identity.controlWorkspaceId
    const workspaceVerified = boolean(await this.authority.verifyWorkspace(workspaceId), 'workspace verification')
    const saved = await this.transact(current => {
      this.checkLineage(current, lineage, false)
      let instance = current.instances.find(row => row.ownerSessionId === root.sessionId)
      const instances = [...current.instances]
      const associations = [...current.associations]
      if (!instance) {
        if (!workspaceVerified) throw new ControlsError('unknown-workspace', 'cannot register a new instance for an unverified workspace')
        const instanceId = id(this.newInstanceId(), 'new instrumentInstanceId')
        if (instances.some(row => row.instrumentInstanceId === instanceId)) throw new ControlsError('association-conflict', 'instance id already belongs to another owner')
        instance = { instrumentInstanceId: instanceId, ownerSessionId: root.sessionId, controlWorkspaceId: workspaceId }
        instances.push(instance)
      }
      for (const entry of lineage) {
        if (associations.some(row => row.sessionId === entry.sessionId)) continue
        associations.push({ sessionId: entry.sessionId, instrumentInstanceId: instance.instrumentInstanceId,
          parentSessionId: entry.identity.kind === 'owner' ? null : entry.identity.parentSessionId })
      }
      if (instances.length === current.instances.length && associations.length === current.associations.length) return current
      return { ...current, revision: increment(current.revision), instances, associations }
    })
    return this.view(saved, session, workspaceVerified)
  }

  async readSession(principal: string, sessionId: string): Promise<SessionControlsView> {
    const session = id(sessionId, 'sessionId')
    await this.authority.authorizeSession(id(principal, 'principal'), session, 'read')
    const lineage = await this.lineage(session)
    const current = await this.load()
    this.checkLineage(current, lineage, true)
    const { instance } = this.lookup(current, session)!
    const verified = boolean(await this.authority.verifyWorkspace(instance.controlWorkspaceId), 'workspace verification')
    return this.view(current, session, verified)
  }

  private async lineage(sessionId: string): Promise<readonly Lineage[]> {
    const result: Lineage[] = []
    const visited = new Set<string>()
    let cursor = sessionId
    while (true) {
      if (visited.has(cursor) || result.length >= 128) throw new ControlsError('association-conflict', 'cyclic or excessive host lineage')
      visited.add(cursor)
      const raw = await this.authority.resolveSession(cursor)
      if (raw === undefined) throw new ControlsError('unknown-session', 'host identity unavailable for ' + cursor)
      const identity = parseIdentity(raw)
      result.push({ sessionId: cursor, identity })
      if (identity.kind === 'owner') return result
      cursor = identity.parentSessionId
    }
  }

  private checkLineage(current: ControlsDocument, lineage: readonly Lineage[], requireRegistered: boolean): void {
    const root = lineage.at(-1)!
    for (const entry of lineage) {
      const stored = this.lookup(current, entry.sessionId)
      if (!stored) {
        if (requireRegistered) throw new ControlsError('unknown-session', 'session is not registered: ' + entry.sessionId)
        continue
      }
      const { association, instance } = stored
      const parent = entry.identity.kind === 'owner' ? null : entry.identity.parentSessionId
      if (association.parentSessionId !== parent || instance.ownerSessionId !== root.sessionId
        || root.identity.kind !== 'owner' || instance.controlWorkspaceId !== root.identity.controlWorkspaceId) {
        throw new ControlsError('association-conflict', 'host identity conflicts with retained session ownership')
      }
    }
  }

  /** load/transact validate referential integrity before this internal lookup. */
  private lookup(current: ControlsDocument, sessionId: string): { association: SessionAssociation; instance: InstrumentInstance } | undefined {
    const association = current.associations.find(row => row.sessionId === sessionId)
    if (!association) return undefined
    return { association, instance: current.instances.find(row => row.instrumentInstanceId === association.instrumentInstanceId)! }
  }

  private view(current: ControlsDocument, sessionId: string, verified: boolean): SessionControlsView {
    const { association, instance } = this.lookup(current, sessionId)!
    return freeze({ documentRevision: current.revision, association, instance,
      policy: resolvePolicy(current.policy, instance.controlWorkspaceId, verified) })
  }

  private async load(): Promise<ControlsDocument> {
    const raw = await this.storage.read()
    return raw === undefined ? INITIAL_DOCUMENT : parseControlsDocument(raw)
  }

  private async transact(change: (current: ControlsDocument) => ControlsDocument): Promise<ControlsDocument> {
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const current = await this.load()
      const next = change(current)
      if (next === current) return current
      const parsed = parseControlsDocument(next)
      if (await this.storage.compareAndSwap(current.revision, parsed)) return parsed
    }
    throw new ControlsError('concurrent-update', 'state changed repeatedly; retry against the saved revision')
  }
}
