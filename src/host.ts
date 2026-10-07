import type { Context } from '@deepseek-ai/cordis'
import { lstat, readlink } from 'node:fs/promises'
import { isAbsolute, normalize } from 'node:path'
import type {} from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-subprocess'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import { classifyRunnerFailure, matchesSignature } from '@deepseek-ai/dsh-sandbox'
import type { ConfinedArgv } from '@deepseek-ai/dsh-sandbox'
import type { AuthorizedGitRunner } from './controls/git-worktrees.js'
import { ResourceError } from './controls/resources.js'
import { createUserMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-session-query'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionEvent, SessionHeader, UserMessage } from '@deepseek-ai/dsh-session'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { DomainSpec, Domain } from '@deepseek-ai/dsh-storage-domain'
import { foldSubagentDescriptor } from '@deepseek-ai/dsh-subagent'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolExecution, ToolExecutionResult, ToolRunContext, ToolGuard } from '@deepseek-ai/dsh-tools'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry'
import { z } from 'zod'
import { createDomainControlsStorage } from './controls/storage.js'
import type { ControlsStorage } from './controls/storage.js'
import { parseControlsDocument } from './controls/state.js'
import type { ControlsAuthority, TrustedSession } from './controls/index.js'
import { createDomainInstrumentStorage } from './controls/instrument-storage.js'
import type { InstrumentStorage } from './controls/instrument-storage.js'
import { parseInstrumentCommand, parseInstrumentDocument } from './controls/instrument-state.js'
import type { InstrumentCommand } from './controls/instrument-state.js'
import { parsePolicyIntent, parsePolicySnapshot } from './controls/policy.js'
import type { PolicyIntent, PolicySnapshot } from './controls/policy.js'
import { createDomainWindowStorage, parseWindowDocument, parseTicketWindowCommand } from './controls/windows.js'
import type { WindowStorage, TicketWindowCommand } from './controls/windows.js'
import { createDomainResourceStorage, parseResourceDocument } from './controls/resources.js'
import type { ResourceLifecycle, ResourceStorage } from './controls/resources.js'
import { createDomainVersionedStorage } from './controls/versioned-storage.js'
import type { VersionedStorage } from './controls/versioned-storage.js'
import { REMOTE_NAMESPACE, REMOTE_CONTRIBUTION, parseHostJson, parsePolicyGrants, parseResourceAction } from './controls/remote-contract.js'
import type { HostCaller, HostJson, PolicyGrants, ResourceAction, WorkspaceRow } from './controls/remote-contract.js'
import { boolean, ControlsError, freeze, id, increment, memoized, record, revision } from './controls/validation.js'
import { StartupSupport } from './controls/startup-support.js'
import { parseStartupDesired, parseStartupDocument } from './controls/startup-state.js'
import type { StartupStatus } from './controls/startup-state.js'
import { HostStartupNode } from './compatibility/host-startup.js'
import { inspectCompatibilityPreparation } from './compatibility/readiness.js'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'mattpocock-controls-notification': { readonly kind: 'mattpocock-controls-notification'; readonly form: 'notice'; readonly summary: string; readonly notificationId: string; readonly ownerSessionId: string; readonly instrumentInstanceId: string; readonly businessRevision: number; readonly authorPrincipalId: string }
    'mattpocock-controls': { readonly kind: 'mattpocock-controls'; readonly form: 'snapshot'; readonly sections: readonly { readonly name: string; readonly text: string }[] }
  }
}
function snapshotContent(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(snapshotContent).join(',') + ']'
  return '{' + Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, entry]) => JSON.stringify(key) + ':' + snapshotContent(entry)).join(',') + '}'
}
export function makeSnapshotMessage(text: string): UserMessage {
  if (typeof text !== 'string' || text.length > 262144 || text.includes('\0')) throw new ControlsError('invalid-input', 'snapshot must be bounded text')
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'mattpocock-controls', form: 'snapshot', sections: [{ name: 'collaboration-instrument', text }] } })
}

export const HOST_CAPABILITIES = freeze({
  nativeInitialChildCwd: 'unsupported', allNativeWakeAdmission: 'unsupported',
  multiRootGitWriteScopes: 'unsupported', managedToolRouting: 'supported',
  nativeLifecycleObservation: 'supported', dynamicContext: 'supported',
} as const)
export type HostCapabilities = Omit<typeof HOST_CAPABILITIES, 'nativeInitialChildCwd'> & {
  readonly nativeInitialChildCwd: 'supported' | 'unsupported'
}
// Old SDKs lack the getter; only explicit native support authorizes cwd transmission.
function initialChildCwdSupported(ctx: Context): boolean {
  return (ctx.get('subagents') as (Context['subagents'] & { readonly initialCwdSupported?: boolean }) | undefined)?.initialCwdSupported === true
}
/** Initial cwd is a file-scope change, not merely an accessible-directory check. */
async function authorizeInitialChildCwd(ctx: Context, parent: Agent, cwd: string, signal: AbortSignal): Promise<() => void> {
  const fs = ctx.get('fs'), policyService = ctx.get('sandboxPolicy'), session = parent.session
  if (!fs || !policyService || typeof fs.resolve !== 'function' || typeof fs.contains !== 'function'
    || typeof fs.stat !== 'function' || typeof fs.processPath !== 'function' || typeof fs.processPathFromHostPath !== 'function'
    || typeof policyService.resolve !== 'function') throw new ResourceError('unsupported', 'initial child cwd requires native filesystem and sandboxPolicy peers')
  const current = () => {
    signal.throwIfAborted(); agentCaller(ctx, parent)
    // Cordis may return a fresh scoped service wrapper for each get(); wrapper
    // pointer equality is not provider identity. Pin the actual parent/session,
    // use provider-owned targets/mapping, and require peers to remain mounted.
    const livePolicyService = ctx.get('sandboxPolicy')
    if (parent.session !== session || !ctx.get('fs') || !livePolicyService) throw new ResourceError('access-denied', 'initial child cwd authorization identity changed')
    if (typeof livePolicyService.resolve !== 'function') throw new ResourceError('unsupported', 'native file policy interface is unavailable')
    const policy = livePolicyService.resolve({ session })
    if (!['read-only', 'workspace-write', 'danger-full-access'].includes(policy.mode)) throw new ResourceError('unsupported', 'unknown native file policy')
    return policy
  }
  const policy = current()
  const root = policy.mode === 'workspace-write' ? await fs.resolve(policy.workspaceRoot, { signal }) : undefined
  current()
  const target = await fs.resolve(cwd, { signal })
  current()
  // Provider-owned canonical targets, not lexical prefixes or opaque-key parsing.
  if (root && !fs.contains(root, target)) throw new ResourceError('access-denied', 'initial child cwd is outside the parent authorized workspace root')
  const processPath = fs.processPath(target)
  // The native manager validates host paths. A different execution world or a
  // mutable symlink alias cannot be silently rebound under the requested identity.
  if (processPath !== cwd || fs.processPathFromHostPath(cwd) !== cwd) throw new ResourceError('unsupported', 'initial child cwd requires a canonical same-world host path; resolve the existing directory first')
  const info = await fs.stat(target, signal)
  current()
  if (!info || info.type !== 'directory') throw new ResourceError('access-denied', 'initial child cwd must be an existing authorized directory')
  const verify = () => {
    const latest = current(), liveFs = ctx.get('fs')!
    if (latest.mode !== policy.mode || latest.workspaceRoot !== policy.workspaceRoot) throw new ResourceError('access-denied', 'parent file policy changed during initial child cwd authorization')
    if (typeof liveFs.processPath !== 'function' || typeof liveFs.processPathFromHostPath !== 'function'
      || liveFs.processPath(target) !== cwd || liveFs.processPathFromHostPath(cwd) !== cwd) throw new ResourceError('unsupported', 'native filesystem mapping changed before initial child creation')
  }
  verify()
  // No mode override enters the native spec: read-only stays read-only and
  // native delegation retains the parent's captured permission state.
  return verify
}
export interface ContinuableChildRequest {
  readonly provider: 'spawn' | 'fork'
  readonly label: string
  readonly prompt: string
  readonly childId: string
  readonly cwd?: string
}
export interface SessionFacts {
  readonly header: SessionHeader
  /** Only this session's owned suffix; never a fork-inherited descriptor. */
  readonly events: readonly SessionEvent[]
  readonly live: boolean
}
export type HostEvent = (
  | { readonly kind: 'agent-status'; readonly sessionId: string; readonly status: 'idle' | 'running' }
  | { readonly kind: 'agent-disposed'; readonly sessionId: string }
  | { readonly kind: 'subagent-start'; readonly sessionId: string; readonly runId: string; readonly provider: string; readonly local: boolean }
  | { readonly kind: 'subagent-end'; readonly sessionId: string; readonly runId: string; readonly provider: string; readonly local: boolean; readonly stopReason: string }
) & { readonly actualAgent?: Agent }

/** The core is supplied by the package composition, not fabricated by this adapter. */
export interface RuntimeFacade {
  readPolicy(caller: HostCaller, signal: AbortSignal): Promise<PolicySnapshot>
  savePolicy(caller: HostCaller, intent: PolicyIntent, expectedRevision: number, signal: AbortSignal): Promise<PolicySnapshot>
  readSession(caller: HostCaller, sessionId: string, signal: AbortSignal): Promise<unknown>
  applyInstrument(caller: HostCaller, sessionId: string, command: InstrumentCommand, signal: AbortSignal): Promise<unknown>
  applyTicketWindow(caller: HostCaller, sessionId: string, command: TicketWindowCommand, signal: AbortSignal): Promise<unknown>
  resourceAction(caller: HostCaller, sessionId: string, request: ResourceAction, signal: AbortSignal): Promise<unknown>
  historyAction?(caller: HostCaller, sessionId: string, input: HostJson, signal: AbortSignal): Promise<unknown>
  worktreeAction?(caller: HostCaller, sessionId: string, input: HostJson, signal: AbortSignal): Promise<unknown>
  delegate?(caller: HostCaller, input: HostJson, exec: ToolRunContext): Promise<unknown>
  created(caller: HostCaller, signal: AbortSignal, actualAgent: Agent): Promise<void>
  observe(event: HostEvent): Promise<void>
  /** Admitted-step consumption; must return freshly owned, attributed messages. */
  preStep(caller: HostCaller, signal: AbortSignal, acceptedMessages?: readonly UserMessage[]): Promise<readonly UserMessage[]>
  postExecute?(caller: HostCaller, exec: ToolExecution, result: Readonly<ToolExecutionResult>): Promise<readonly UserMessage[]>
  executeManaged?(caller: HostCaller, request: HostJson, exec: ToolRunContext): Promise<unknown>
  assign?(caller: HostCaller, request: HostJson, signal: AbortSignal): Promise<unknown>
  serializePolicyPermission?<T>(effect: () => Promise<T>): Promise<T>
  notificationCommitted?(ownerSessionId: string, notificationId: string, messageId: string): Promise<void>
  context?(caller: HostCaller): string
  dispose(): Promise<void>
}
export interface OwnerNotificationInput { readonly notificationId: string; readonly ownerSessionId: string; readonly instrumentInstanceId: string; readonly businessRevision: number; readonly authorPrincipalId: string }
export interface OwnerNotificationResult { readonly status: 'accepted' | 'offline' | 'unavailable'; readonly messageId: string | null }
export interface HostPorts {
  readonly controlsStorage: ControlsStorage
  readonly instrumentStorage: InstrumentStorage
  readonly windowStorage: WindowStorage
  readonly resourceStorage: ResourceStorage
  readonly authority: ControlsAuthority
  readonly operatorPrincipal: string
  readonly capabilities: HostCapabilities
  readonly resourceLifecycle: ResourceLifecycle
  /** Background startup notification retries await registration; factories must not await their flush. */
  readonly notificationObserverReady?: Promise<void>
  /** Host-owned startup configuration and real native health; never a policy write port. */
  startupStatus?(signal?: AbortSignal): Promise<StartupStatus>
  gitRunnerForSession(sessionId: string, signal: AbortSignal): AuthorizedGitRunner
  makeSnapshotMessage(text: string): UserMessage
  /** Program-only proof on the exact live model surface; preparation/log existence is not visibility. */
  snapshotVisible?(caller: HostCaller, actualAgent: Agent, message: UserMessage): boolean
  notifyOwner(input: OwnerNotificationInput, signal: AbortSignal): Promise<OwnerNotificationResult>
  executeNative(exec: ToolExecution, name: 'subagent' | 'subagent_fork' | 'send_message', args: unknown): Promise<ToolExecutionResult>
  /** Technical scope preflight before runtime records intent; creates no native child or durable facts. */
  authorizeInitialChildCwd?(exec: ToolRunContext, cwd: string): Promise<void>
  /** Returns native inbox acceptance only; runtime verifies actual session facts separately. */
  createContinuable?(exec: ToolRunContext, request: ContinuableChildRequest): Promise<{ readonly childId: string; readonly messageId: string }>
  installNativeGuard(guard: ToolGuard): () => void
  installManagedGuard(guard: ToolGuard): () => void
  liveAgent(sessionId: string): Agent | undefined
  liveAgents(): readonly Agent[]
  nativeActivity(sessionId: string): Promise<{ readonly known: boolean; readonly reason: string | null; readonly liveAgents: readonly Agent[] }>
  openRuntimeStorage<T extends { readonly revision: number }>(parse: (value: unknown) => T): Promise<VersionedStorage<T>>
  openUnitStorage<T extends { readonly revision: number }>(suffix: string, parse: (value: unknown) => T): Promise<VersionedStorage<T>>
  readPolicyGrants(): Promise<PolicyGrants>
  sessionFacts(sessionId: string, signal?: AbortSignal): Promise<SessionFacts>
  /** Native acceptance/live facts are not durability; false never certifies persistence. */
  flushSession?(sessionId: string, signal: AbortSignal): Promise<boolean>
  /** Authority checks are repeated at effect boundaries; never wire-supplied principals. */
  authorizeCaller(caller: HostCaller, sessionId?: string): Promise<void>
}
export interface HostOptions {
  createRuntime(ports: HostPorts): Promise<RuntimeFacade>
  /** Notified after a saved policy change so derived caches can be refreshed. */
  readonly onPolicyChanged?: () => void
  /** Explicit trusted launch configuration; not a Remote/GUI/model path. */
  readonly sdkRoot?: string
  /** Program-only test/embedding seam; production uses the actual process epoch. */
  readonly startup?: { readonly bootEpoch?: string }
}
export interface HostMount {
  /** Workspace-scoped Skill delivery gate; unavailable policy keeps skills on. */
  readonly skillsEnabledForCwd: (cwd: string | undefined) => Promise<boolean>
  readonly service: MattPocockControlsService; readonly ports: HostPorts; dispose(): Promise<void> }

function deny(message: string): never { throw new ControlsError('access-denied', message) }
export function operatorCaller(ctx: Context): HostCaller {
  const invocation = ctx.invocation
  const operator = ctx.connection.operator
  if (!invocation || invocation.peer.id !== operator.id) return deny('authenticated profile operator invocation required')
  invocation.signal.throwIfAborted()
  return freeze({ kind: 'user', principalId: 'user:' + id(operator.id, 'operator id'), sessionId: null })
}
export function agentCaller(ctx: Context, agent: Agent | undefined): HostCaller {
  if (!agent || ctx.agents.get(agent.id) !== agent || agent.session.header.id !== agent.id) return deny('actual live tool caller required')
  return freeze({ kind: 'agent', principalId: 'agent:' + id(agent.id, 'agent id'), sessionId: agent.id })
}

/** Header classification distinguishes ordinary forks from delegated children. */
export function classifySession(facts: SessionFacts, retained?: TrustedSession): 'owner' | TrustedSession | undefined {
  const h = facts.header
  if (h.origin !== 'subagent') return retained?.kind === 'managed-child' ? undefined : 'owner'
  if (!h.parentSession) return undefined
  const descriptor = foldSubagentDescriptor(facts.events)
  if (!descriptor && !(retained?.kind === 'managed-child' && retained.parentSessionId === h.parentSession)) return undefined
  if (retained?.kind === 'owner' || retained?.kind === 'managed-child' && retained.parentSessionId !== h.parentSession) return undefined
  return freeze({ kind: 'managed-child', parentSessionId: h.parentSession })
}

export function createHostAuthority(ctx: Context, storage: ControlsStorage, grants: VersionedStorage<PolicyGrants>): {
  readonly authority: ControlsAuthority; readonly sessionFacts: HostPorts['sessionFacts']; readonly authorizeCaller: HostPorts['authorizeCaller']; readonly operatorPrincipal: string
} {
  const operatorPrincipal = 'user:' + id(ctx.connection.operator.id, 'operator id')
  // Authorization, association resolution and native-child confirmation read these facts.
  // Only subagent classification consumes the folded event stream; every other caller reads
  // the immutable header. The lightweight persistence port observes one stored session
  // WITHOUT reading its event log, so owner sessions never pay a cold log decode here; the
  // full observation stays the fallback and the canonical not-found path, and its result is
  // shared across concurrent and near-term repeat calls.
  const FACTS_CACHE_TTL_MS = 5_000
  const FACTS_CACHE_MAX = 16
  const FACTS_CACHE_MAX_EVENTS = 4_000
  const EMPTY_EVENTS: readonly SessionEvent[] = Object.freeze([])
  const LIVE_FACTS_TTL_MS = 250
  const liveFacts = new Map<string, { readonly at: number; readonly facts: SessionFacts }>()
  const HEADER_FACTS_TTL_MS = 2_000
  const HEADER_FACTS_MAX = 64
  const headerFacts = new Map<string, { readonly at: number; readonly facts: SessionFacts }>()
  interface StoredSessionStat {
    stat(id: SessionId, options?: { readonly signal?: AbortSignal }): Promise<{ readonly header: SessionHeader } | undefined>
  }
  const coldFacts = new Map<string, { readonly at: number; readonly facts: SessionFacts }>()
  const coldInflight = new Map<string, Promise<SessionFacts>>()
  const storedSnapshot = async (sessionId: SessionId, signal?: AbortSignal): Promise<{ readonly header: SessionHeader } | undefined> => {
    // Optional seam: an older composition without this service keeps the observation path.
    const persistence = typeof ctx.get === 'function' ? ctx.get('sessionPersistence') as StoredSessionStat | undefined : undefined
    if (persistence === undefined || typeof persistence.stat !== 'function') return undefined
    return await persistence.stat(sessionId, signal === undefined ? undefined : { signal })
  }
  const observeColdFacts = async (sessionId: SessionId, signal?: AbortSignal): Promise<SessionFacts> => {
    const cached = coldFacts.get(sessionId)
    if (cached !== undefined && Date.now() - cached.at < FACTS_CACHE_TTL_MS) return cached.facts
    const inflight = coldInflight.get(sessionId)
    if (inflight !== undefined) return await inflight
    const pending = (async (): Promise<SessionFacts> => {
      const observation = await ctx.sessionQuery.observeSession(sessionId, { ...(signal ? { signal } : {}), projectionMode: 'none' })
      try { return freeze({ header: observation.header, events: observation.events.slice(observation.inheritedEventCount), live: false }) }
      finally { observation[Symbol.dispose]() }
    })()
    coldInflight.set(sessionId, pending)
    try {
      const facts = await pending
      if (facts.events.length <= FACTS_CACHE_MAX_EVENTS) {
        const cutoff = Date.now() - FACTS_CACHE_TTL_MS
        for (const [key, entry] of coldFacts) if (entry.at < cutoff) coldFacts.delete(key)
        coldFacts.delete(sessionId)
        coldFacts.set(sessionId, { at: Date.now(), facts })
        while (coldFacts.size > FACTS_CACHE_MAX) coldFacts.delete(coldFacts.keys().next().value as string)
      }
      return facts
    } finally { coldInflight.delete(sessionId) }
  }
  /** foldSubagentDescriptor is the only reader of `events`, and it is reached only
   * for subagent headers. Deep-freezing a long-lived owner session's whole owned
   * suffix cost a full traversal per tool execution and per step (measured: 135 ms
   * for 47k events), which pegged a core while a single agent worked. Owners now
   * carry no events, and subagent facts are reused briefly instead of re-frozen.
   */
  const liveSessionFacts = (live: Agent): SessionFacts => {
    const header = live.session.header
    if (header.origin !== 'subagent') return Object.freeze({ header, events: EMPTY_EVENTS, live: true })
    const cached = liveFacts.get(header.id)
    const now = Date.now()
    if (cached !== undefined && now - cached.at < LIVE_FACTS_TTL_MS) return cached.facts
    const events = live.session.ownEvents()
    const facts: SessionFacts = Object.freeze({ header, events: Object.freeze(events), live: true })
    liveFacts.set(header.id, { at: now, facts })
    while (liveFacts.size > FACTS_CACHE_MAX) liveFacts.delete(liveFacts.keys().next().value as string)
    return facts
  }
  const sessionHeaderFacts = async (raw: string, signal?: AbortSignal): Promise<SessionFacts> => {
    const sessionId = SessionId(id(raw, 'sessionId'))
    signal?.throwIfAborted()
    // Header facts change only when a session is created or delegated, yet the authorization
    // seam asks for them dozens of times per second (measured: ~82 stored-session stats per
    // second while a turn was active). Repeat lookups inside this short window reuse them.
    const cachedHeader = headerFacts.get(sessionId)
    const now = Date.now()
    if (cachedHeader !== undefined && now - cachedHeader.at < HEADER_FACTS_TTL_MS) return cachedHeader.facts
    const live = ctx.agents.get(sessionId)
    let facts: SessionFacts
    if (live !== undefined) facts = liveSessionFacts(live)
    else {
      const snapshot = await storedSnapshot(sessionId, signal)
      facts = snapshot !== undefined ? freeze({ header: snapshot.header, events: [], live: false }) : await observeColdFacts(sessionId, signal)
    }
    headerFacts.set(sessionId, { at: now, facts })
    while (headerFacts.size > HEADER_FACTS_MAX) headerFacts.delete(headerFacts.keys().next().value as string)
    return facts
  }
  const sessionFacts = async (raw: string, signal?: AbortSignal): Promise<SessionFacts> => {
    const header = await sessionHeaderFacts(raw, signal)
    if (header.live || header.header.origin !== 'subagent') return header
    return await observeColdFacts(SessionId(id(raw, 'sessionId')), signal)
  }
  const resolveSession = async (sessionId: string): Promise<TrustedSession | undefined> => {
    const facts = await sessionFacts(sessionId)
    const document = await storage.read()
    const saved = document === undefined ? undefined : memoized(document, parseControlsDocument)
    const association = saved?.associations.find(row => row.sessionId === sessionId)
    const instance = association && saved?.instances.find(row => row.instrumentInstanceId === association.instrumentInstanceId)
    const retained: TrustedSession | undefined = association && instance
      ? association.parentSessionId === null ? { kind: 'owner', controlWorkspaceId: instance.controlWorkspaceId }
        : { kind: 'managed-child', parentSessionId: association.parentSessionId } : undefined
    const classified = classifySession(facts, retained)
    if (classified !== 'owner') return classified
    if (retained?.kind === 'owner') return retained
    if (facts.header.cwd === undefined) return undefined
    const workspace = await ctx.workspaceRegistry.resolveByPath(facts.header.cwd)
    return workspace ? freeze({ kind: 'owner', controlWorkspaceId: workspace.id }) : undefined
  }
  const authenticate = (principal: string): void => {
    if (principal === operatorPrincipal) return
    if (!principal.startsWith('agent:')) deny('unknown host principal')
    const sid = principal.slice('agent:'.length), agent = ctx.agents.get(SessionId(id(sid, 'principal sessionId')))
    if (!agent || agent.session.header.id !== sid) deny('agent principal has no actual live session')
  }
  const authority: ControlsAuthority = {
    async authorizePolicy(principal, access) {
      authenticate(principal)
      if (access === 'read' || principal === operatorPrincipal) return
      const state = await grants.read(), saved = state === undefined ? undefined : parsePolicyGrants(state)
      if (!saved?.grants.some(row => row.sessionId === principal.slice('agent:'.length) && row.enabled)) deny('agent policy write requires explicit operator delegation')
    },
    async authorizeSession(principal, sessionId) {
      authenticate(principal)
      if (principal !== operatorPrincipal && principal !== 'agent:' + sessionId) deny('agent cannot address another session as its own')
      await sessionHeaderFacts(sessionId)
    },
    resolveSession,
    async verifyWorkspace(workspaceId) { const row = ctx.workspaceRegistry.get(WorkspaceId(id(workspaceId, 'workspaceId'))); return row !== undefined && await row.status() === 'ok' },
  }
  const authorizeCaller: HostPorts['authorizeCaller'] = async (caller, sessionId) => {
    if (caller.kind === 'user') { if (caller.principalId !== operatorPrincipal || caller.sessionId !== null) deny('invalid operator caller') }
    else if (caller.sessionId === null || caller.principalId !== 'agent:' + caller.sessionId) deny('invalid actual agent caller')
    authenticate(caller.principalId)
    if (sessionId !== undefined) await authority.authorizeSession(caller.principalId, id(sessionId, 'sessionId'), 'read')
  }
  return { authority, sessionFacts, authorizeCaller, operatorPrincipal }
}

/** A source-mode binding plus a strict descriptor contribution; no monkeypatch. */
export class MattPocockControlsService extends TypertRemoteService {
  constructor(ctx: Context, private readonly runtime: RuntimeFacade, private readonly ports: HostPorts,
    private readonly grants: VersionedStorage<PolicyGrants>,
    private readonly startup: StartupSupport,
    private readonly lifecycle: { readonly signal: AbortSignal; track<T>(work: () => Promise<T>): Promise<T>; readonly onPolicyChanged?: () => void }) { super(ctx, REMOTE_NAMESPACE) }
  private run<T>(operation: (caller: HostCaller, signal: AbortSignal) => Promise<T>, suppliedSignal?: AbortSignal): Promise<T> {
    const caller = operatorCaller(this.ctx)
    this.lifecycle.signal.throwIfAborted()
    const signal = AbortSignal.any([this.ctx.invocation!.signal, this.lifecycle.signal, ...(suppliedSignal ? [suppliedSignal] : [])])
    return this.lifecycle.track(() => operation(caller, signal))
  }
  startupStatus(suppliedSignal?: AbortSignal): Promise<StartupStatus> {
    return this.run((_, signal) => this.startup.readStatus(signal), suppliedSignal)
  }
  saveStartupSettings(desired: unknown, expectedRevision: unknown, suppliedSignal?: AbortSignal): Promise<StartupStatus> {
    return this.run((_, signal) => this.startup.save(parseStartupDesired(desired), revision(expectedRevision, 'expectedRevision'), signal), suppliedSignal)
  }
  readPolicy(): Promise<PolicySnapshot> { return this.run(async (caller, signal) => parsePolicySnapshot(await this.runtime.readPolicy(caller, signal))) }
  savePolicy(intent: unknown, expectedRevision: unknown): Promise<PolicySnapshot> {
    return this.run(async (caller, signal) => {
      const saved = parsePolicySnapshot(await this.runtime.savePolicy(caller, parsePolicyIntent(intent), revision(expectedRevision, 'expectedRevision'), signal))
      this.lifecycle.onPolicyChanged?.()
      return saved
    })
  }
  listWorkspaces(): Promise<readonly WorkspaceRow[]> {
    return this.run(async (_, signal) => {
      const rows = await Promise.all(this.ctx.workspaceRegistry.list().map(async workspace => ({ id: workspace.id, path: workspace.path, title: workspace.title, status: await workspace.status(), sessionIds: workspace.sessionIds.map(sid => id(sid, 'workspace sessionId')) })))
      signal.throwIfAborted(); return freeze(rows)
    })
  }
  readSession(sessionId: unknown, suppliedSignal?: AbortSignal): Promise<HostJson> { return this.run(async (caller, signal) => {
    const sid = id(sessionId, 'sessionId'); await this.ports.authorizeCaller(caller, sid); signal.throwIfAborted()
    return parseHostJson(await this.runtime.readSession(caller, sid, signal))
  }, suppliedSignal) }
  applyInstrument(sessionId: unknown, command: unknown): Promise<HostJson> { return this.run(async (caller, signal) => {
    const sid = id(sessionId, 'sessionId'), parsed = parseInstrumentCommand(command)
    await this.ports.authorizeCaller(caller, sid); signal.throwIfAborted(); return parseHostJson(await this.runtime.applyInstrument(caller, sid, parsed, signal))
  }) }
  applyTicketWindow(sessionId: unknown, command: unknown): Promise<HostJson> { return this.run(async (caller, signal) => {
    const sid = id(sessionId, 'sessionId'), parsed = parseTicketWindowCommand(command)
    await this.ports.authorizeCaller(caller, sid); signal.throwIfAborted(); return parseHostJson(await this.runtime.applyTicketWindow(caller, sid, parsed, signal))
  }) }
  historyAction(sessionId: unknown, request: unknown, suppliedSignal?: AbortSignal): Promise<HostJson> { return this.run(async (caller, signal) => {
    const sid = id(sessionId, 'sessionId'); await this.ports.authorizeCaller(caller, sid); signal.throwIfAborted()
    const parsed = parseHostJson(request)
    if (!this.runtime.historyAction) throw new ControlsError('feature-disabled', 'session history is unavailable in this runtime')
    return parseHostJson(await this.runtime.historyAction(caller, sid, parsed, signal))
  }, suppliedSignal) }
  worktreeAction(sessionId: unknown, request: unknown): Promise<HostJson> { return this.run(async (caller, signal) => {
    const sid = id(sessionId, 'sessionId'); await this.ports.authorizeCaller(caller, sid); signal.throwIfAborted()
    const parsed = parseHostJson(request)
    if (!this.runtime.worktreeAction) throw new ControlsError('feature-disabled', 'worktree bindings are unavailable in this runtime')
    return parseHostJson(await this.runtime.worktreeAction(caller, sid, parsed, signal))
  }) }
  resourceAction(sessionId: unknown, request: unknown): Promise<HostJson> { return this.run(async (caller, signal) => {
    const sid = id(sessionId, 'sessionId'), parsed = parseResourceAction(request)
    await this.ports.authorizeCaller(caller, sid); signal.throwIfAborted()
    if (parsed.action !== 'read') throw new ControlsError('feature-disabled', 'deprecated resource lifecycle writes are disabled; manage Git yourself and use worktree bindings')
    return parseHostJson(await this.runtime.resourceAction(caller, sid, parsed, signal))
  }) }
  grantPolicy(sessionId: unknown, enabled: unknown, expectedRevision: unknown): Promise<PolicyGrants> { return this.run(async (caller, signal) => {
    const sid = id(sessionId, 'sessionId'), value = boolean(enabled, 'enabled'), expected = revision(expectedRevision, 'expectedRevision')
    if (!this.runtime.serializePolicyPermission) throw new ControlsError('feature-disabled', 'policy grants require the runtime shared permission serializer')
    return this.runtime.serializePolicyPermission(async () => {
    await this.ports.authorizeCaller(caller, sid); signal.throwIfAborted()
    const prior = await this.grants.read(), current = prior === undefined ? parsePolicyGrants({ schemaVersion: 1, revision: 0, grants: [] }) : parsePolicyGrants(prior)
    if (current.revision !== expected) throw new ControlsError('revision-conflict', 'policy delegations changed')
    if (current.grants.some(row => row.sessionId === sid && row.enabled === value) || !value && !current.grants.some(row => row.sessionId === sid)) return current
    const next = parsePolicyGrants({ schemaVersion: 1, revision: increment(current.revision), grants: [...current.grants.filter(row => row.sessionId !== sid), { sessionId: sid, enabled: value }] })
    signal.throwIfAborted()
    if (!await this.grants.compareAndSwap(expected, next)) throw new ControlsError('revision-conflict', 'policy delegations changed')
    return next
    })
  }) }
}


export function hostRemoteContribution(): TypertContribution {
  return { package: REMOTE_CONTRIBUTION.package, face: 'host', schemas: [], model: { services: [], events: [], objects: [] }, invocations: REMOTE_CONTRIBUTION.descriptors }
}

/** Fixed Git argv execution; subprocess alone is not a sandbox or permission decision. */
export function createAuthorizedGitRunner(ctx: Context, rawSessionId: string, outerSignal: AbortSignal): AuthorizedGitRunner {
  const sessionId = SessionId(id(rawSessionId, 'Git sessionId'))
  const initial = ctx.agents.get(sessionId)
  if (!initial) throw new ResourceError('unsupported', 'Git requires an existing live session; do not resume a model for resource actions')
  const fs = ctx.get('fs'), subprocess = ctx.get('subprocess'), policyService = ctx.get('sandboxPolicy'), sandbox = ctx.get('sandbox')
  if (!fs || !subprocess || !policyService) throw new ResourceError('unsupported', 'filesystem, subprocess and sandboxPolicy peers are required')
  const current = () => {
    outerSignal.throwIfAborted()
    if (ctx.agents.get(sessionId) !== initial) throw new ResourceError('access-denied', 'Git session identity changed')
    return policyService.resolve({ session: initial.session })
  }
  const signalFor = (signal?: AbortSignal) => signal ? AbortSignal.any([outerSignal, signal]) : outerSignal
  const absolute = (path: string) => {
    if (typeof path !== 'string' || !isAbsolute(path) || normalize(path) !== path || path.includes('\0')) throw new ResourceError('identity-conflict', 'normalized absolute filesystem path required')
    return path
  }
  const checkLocal = async (path: string, signal: AbortSignal) => {
    current(); absolute(path)
    // Only metadata absent from the filesystem seam uses local Node APIs, and only
    // after the provider proves that host and execution-world paths identify the same file.
    if (fs.processPathFromHostPath(path) !== path) throw new ResourceError('unsupported', 'stable inode/readlink metadata requires a same-world local filesystem mapping')
    await fs.lstat(path, {}, signal)
    signal.throwIfAborted()
  }
  const authorize: AuthorizedGitRunner['authorize'] = async (request, signal) => {
    const control = signalFor(signal), policy = current(); control.throwIfAborted()
    for (const path of request.paths) {
      absolute(path)
      if (request.operation === 'create' || request.operation === 'retire') {
        if (policy.mode === 'read-only') throw new ResourceError('access-denied', 'existing session file policy is read-only')
        if (policy.mode === 'workspace-write') {
          const root = await fs.resolve(policy.workspaceRoot, { signal: control }), target = await fs.resolve(path, { signal: control })
          if (!fs.contains(root, target)) throw new ResourceError('access-denied', 'Git metadata or worktree path is outside the existing writable root')
        }
      }
    }
  }
  return {
    authorize,
    async run(argv, cwd, signal) {
      const control = signalFor(signal), policy = current(); control.throwIfAborted(); absolute(cwd)
      if (argv[0] !== 'git' || argv[1] !== '--no-optional-locks' || argv[2] !== '--no-pager' || argv[3] !== '-c' || argv[4] !== 'core.hooksPath=/dev/null'
        || !['rev-parse', 'symbolic-ref', 'worktree', 'check-ref-format', 'show-ref', 'status', 'ls-files', 'update-ref', 'diff', 'ls-tree', 'cat-file'].includes(argv[5] ?? '')
        || argv.some(value => typeof value !== 'string' || value.includes('\0'))) throw new ResourceError('access-denied', 'only the fixed resource adapter Git argv contract may execute')
      const env: NodeJS.ProcessEnv = Object.fromEntries(Object.keys(process.env).filter(key => key.toUpperCase().startsWith('GIT_')).map(key => [key, undefined]))
      Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', GIT_PAGER: 'cat', PAGER: 'cat' })
      const lookupEnv = Object.fromEntries(Object.entries(env).flatMap(([key, value]) => value === undefined ? [] : [[key, value]]))
      const git = await subprocess.resolveExecutable('git', lookupEnv, control)
      const original = [git, '-c', 'core.fsmonitor=false', '-c', 'diff.external=', '-c', 'core.pager=cat', ...argv.slice(1)], bounded = AbortSignal.any([control, AbortSignal.timeout(30000)])
      let confined: ConfinedArgv | undefined
      if (policy.mode !== 'danger-full-access') {
        if (!sandbox) throw new ResourceError('unsupported', 'required Git confinement peer is missing')
        confined = await sandbox.confine(original, { ...policy, mode: policy.mode }, bounded)
        if (confined.enforcement !== 'full') throw new ResourceError('unsupported', 'partial file sandbox cannot certify resource effects')
      }
      current(); bounded.throwIfAborted()
      const handle = subprocess.spawn({ argv: confined?.argv ?? original, cwd, stdio: { stdin: 'ignore', stdout: { maxBytes: 16777216 }, stderr: { maxBytes: 65536 } }, graceMs: 3000, signal: bounded, env })
      let outcome
      try { outcome = await handle.done }
      finally { if (!await handle.waitForExit()) throw new ResourceError('unsupported', 'Git process range did not converge') }
      bounded.throwIfAborted()
      const stdout = handle.collected.stdout!.readFrom(0), stderr = handle.collected.stderr!.readFrom(0)
      if (stdout.lossy || stderr.lossy) throw new ResourceError('unsupported', 'Git output exceeded its complete capture budget')
      if (outcome.exitCode === null || outcome.signal !== null) throw new ResourceError('unsupported', 'Git did not exit normally')
      if (confined && outcome.exitCode !== 0) {
        if (classifyRunnerFailure(outcome.exitCode, stderr.text, confined.runnerFailureRules)) throw new ResourceError('unsupported', 'Git sandbox runner failed before execution')
        if (matchesSignature(outcome.exitCode, stderr.text, confined.denialSignatures)) throw new ResourceError('access-denied', 'Git effect denied by the existing file sandbox')
      }
      return { exitCode: outcome.exitCode, stdout: stdout.text, stderr: stderr.text }
    },
    async lstat(path, signal) {
      const control = signalFor(signal); await checkLocal(path, control)
      const stat = await lstat(path, { bigint: true }); control.throwIfAborted()
      return { kind: stat.isSymbolicLink() ? 'symlink' : stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : 'other', identity: String(stat.dev) + ':' + String(stat.ino) }
    },
    async realpath(path, signal) { const control = signalFor(signal); current(); const target = await fs.resolve(absolute(path), { signal: control }); return fs.processPath(target) },
    async readFile(path, signal) { const control = signalFor(signal); current(); const target = await fs.resolve(absolute(path), { signal: control }); return fs.readBytes(target, control, 16777216) },
    async readDirectory(path, signal) { const control = signalFor(signal); current(); const target = await fs.resolve(absolute(path), { signal: control }); return (await fs.listDir(target, control)).map(entry => entry.name) },
    async readlink(path, signal) { const control = signalFor(signal); await checkLocal(path, control); const value = await readlink(path); control.throwIfAborted(); return value },
  }
}

/** Mount actual SDK registrations over independently owned single-table domains. */
export async function mountHost(ctx: Context, options: HostOptions): Promise<HostMount> {
  const domains: Domain<DomainSpec>[] = []
  const unitHandles = new Map<string, { readonly parse: (value: unknown) => unknown; readonly opening: Promise<unknown> }>()
  let runtime: RuntimeFacade | undefined
  let closing = false
  const lifetime = new AbortController(), pending = new Set<Promise<unknown>>(), disposers: (() => unknown)[] = []
  let resolveNotificationObserverReady!: () => void
  const notificationObserverReady = new Promise<void>(resolve => { resolveNotificationObserverReady = resolve })
  const noticeAttempts = new Map<string, { readonly input: OwnerNotificationInput; readonly actualAgent: Agent; readonly message: UserMessage }>()
  const track = <T>(operation: () => Promise<T>): Promise<T> => {
    if (closing) return Promise.reject(new ControlsError('access-denied', 'host is disposing'))
    // Invoke synchronously: native event program ports register their commit fence
    // before a parent pre-step can capture its relevant receipt watermark.
    let promise: Promise<T>
    try { promise = Promise.resolve(operation()) } catch (error) { promise = Promise.reject(error) }
    pending.add(promise)
    void promise.then(() => pending.delete(promise), () => pending.delete(promise)); return promise
  }
  let shutdown: Promise<void> | undefined
  const dispose = (): Promise<void> => shutdown ??= (async () => {
    closing = true; lifetime.abort(); resolveNotificationObserverReady(); noticeAttempts.clear()
    const errors: unknown[] = []
    for (const disposer of disposers.reverse()) { try { await disposer() } catch (error) { errors.push(error) } }
    await Promise.allSettled([...pending])
    try { await runtime?.dispose() } catch (error) { errors.push(error) }
    unitHandles.clear()
    for (const domain of domains.reverse()) { try { await domain.close() } catch (error) { errors.push(error) } }
    if (errors.length) throw new AggregateError(errors, 'Host teardown could not certify complete release')
  })()
  try {
    const open = async <T>(name: string, parse: (value: unknown) => T) => {
      const domain = await ctx.storageDomain.open(defineDomain({ name: 'mattpocock_' + name, version: 1, tables: { records: domainTable<string, T>(z.unknown().transform(parse)) } }))
      domains.push(domain); return domain.table('records')
    }
    const startupNode = new HostStartupNode({
      observeCompatibilityPreparation: signal => inspectCompatibilityPreparation(ctx, signal),
      nativeSource: () => {
        const service = ctx.get('subagents') as unknown as Record<symbol, unknown> | undefined
        const source = service?.[Symbol.for('@lmgatex/dsh-mattpocock-skills/compatible-subagent-origin')]
        return source === 'native-subagent-0.2.1-alpha.1' ? source : null
      },
      ...(options.sdkRoot === undefined ? {} : { sdkRoot: options.sdkRoot }), ...options.startup,
    },
      () => initialChildCwdSupported(ctx), lifetime.signal)
    const startup = new StartupSupport(createDomainVersionedStorage(await open('startup_settings', parseStartupDocument), 'state', parseStartupDocument),
      { epoch: startupNode.epoch }, signal => startupNode.observe(signal))
    // Capture the trusted boot request before runtime factories or model tools exist.
    const bootRequested = (await startup.readStatus(lifetime.signal)).boot.requested.startupCwdEnabled
    const requireStartupCwd = () => {
      if (!bootRequested) throw new ControlsError('feature-disabled', 'initial child cwd is disabled for this process; save startup settings and restart the instance to enable it')
    }
    const controlsStorage = createDomainControlsStorage(await open('controls', parseControlsDocument))
    const instrumentStorage = createDomainInstrumentStorage(await open('instruments', parseInstrumentDocument))
    const windowStorage = createDomainWindowStorage(await open('windows', parseWindowDocument))
    const resourceStorage = createDomainResourceStorage(await open('resources', parseResourceDocument))
    const grants = createDomainVersionedStorage(await open('policy_grants', parsePolicyGrants), 'state', parsePolicyGrants)
    const identity = createHostAuthority(ctx, controlsStorage, grants)
    const ports: HostPorts = {
      controlsStorage, instrumentStorage, windowStorage, resourceStorage, ...identity,
      capabilities: freeze({ ...HOST_CAPABILITIES, get nativeInitialChildCwd(): HostCapabilities['nativeInitialChildCwd'] { return initialChildCwdSupported(ctx) ? 'supported' : 'unsupported' } }),
      makeSnapshotMessage, notificationObserverReady,
      snapshotVisible(caller, actualAgent, message) {
        try {
          const actual = agentCaller(ctx, actualAgent)
          if (closing || caller.kind !== actual.kind || caller.principalId !== actual.principalId || caller.sessionId !== actual.sessionId
            || message.source.kind !== 'mattpocock-controls' || message.source.form !== 'snapshot') return false
          const expected = snapshotContent({ source: message.source, content: message.content })
          return actualAgent.session.deriveMessages().some(visible => visible.role === 'user' && visible.id === message.id
            && snapshotContent({ source: visible.source, content: visible.content }) === expected)
        } catch { return false }
      },
      startupStatus(signal) { return track(() => startup.readStatus(signal ? AbortSignal.any([signal, lifetime.signal]) : lifetime.signal)) },
      async notifyOwner(input, signal) {
        const control = AbortSignal.any([signal, lifetime.signal]); control.throwIfAborted()
        if (closing) return { status: 'unavailable', messageId: null }
        const raw = record(input, 'owner notification', ['notificationId', 'ownerSessionId', 'instrumentInstanceId', 'businessRevision', 'authorPrincipalId'])
        const notice: OwnerNotificationInput = freeze({ notificationId: id(raw.notificationId, 'notificationId'), ownerSessionId: id(raw.ownerSessionId, 'ownerSessionId'), instrumentInstanceId: id(raw.instrumentInstanceId, 'instrumentInstanceId'), businessRevision: revision(raw.businessRevision, 'businessRevision'), authorPrincipalId: id(raw.authorPrincipalId, 'authorPrincipalId') })
        const owner = ctx.agents.get(SessionId(notice.ownerSessionId))
        if (!owner) return { status: 'offline', messageId: null }
        if (owner.session.header.id !== owner.id || owner.session.header.origin === 'subagent' || typeof owner.steer !== 'function') return { status: 'unavailable', messageId: null }
        const summary = ('Collaboration instruments updated at revision ' + notice.businessRevision + '. Review the saved snapshot; no task outcome is inferred.').slice(0, 120)
        const message = createUserMessage({ content: [{ type: 'text', text: summary }], source: { kind: 'mattpocock-controls-notification', form: 'notice', summary, ...notice } })
        noticeAttempts.set(message.id, { input: notice, actualAgent: owner, message })
        try { control.throwIfAborted(); owner.steer(message) }
        catch (error) { noticeAttempts.delete(message.id); control.throwIfAborted(); return { status: 'unavailable', messageId: null } }
        // Native steering acceptance is not durable delivery or business completion.
        return { status: 'accepted', messageId: message.id }
      },
      gitRunnerForSession(sessionId, signal) { return createAuthorizedGitRunner(ctx, sessionId, AbortSignal.any([signal, lifetime.signal])) },
      async executeNative(exec, name, args) {
        agentCaller(ctx, exec.agent); exec.signal.throwIfAborted()
        return ctx.tools.execute({ callId: ToolCallId(exec.callId + ':managed'), rootCallId: exec.rootCallId, parent: exec.token, name, arguments: args, agent: exec.agent!, signal: exec.signal })
      },
      async authorizeInitialChildCwd(exec, cwd) {
        lifetime.signal.throwIfAborted(); exec.signal.throwIfAborted()
        const caller = agentCaller(ctx, exec.agent)
        await identity.authorizeCaller(caller, caller.sessionId!)
        if (typeof cwd !== 'string' || cwd.length === 0 || cwd.length > 16384 || cwd.includes('\0') || !isAbsolute(cwd) || normalize(cwd) !== cwd) throw new ControlsError('invalid-input', 'cwd must be a bounded normalized absolute path')
        requireStartupCwd()
        if (!initialChildCwdSupported(ctx)) throw new ResourceError('unsupported', 'nativeInitialChildCwd unsupported; no child was requested')
        const verify = await authorizeInitialChildCwd(ctx, exec.agent!, cwd, AbortSignal.any([exec.signal, lifetime.signal]))
        requireStartupCwd()
        if (!initialChildCwdSupported(ctx)) throw new ResourceError('unsupported', 'nativeInitialChildCwd unsupported; no child was requested')
        verify()
        // This is a fresh technical read, not a reusable authorization token.
        // Creation repeats the full scope check at its own native effect boundary.
      },
      async createContinuable(exec, request) {
        lifetime.signal.throwIfAborted(); exec.signal.throwIfAborted()
        const caller = agentCaller(ctx, exec.agent)
        await identity.authorizeCaller(caller, caller.sessionId!)
        const raw = record(parseHostJson(request), 'continuable child request', ['provider', 'label', 'prompt', 'childId', 'cwd'])
        if (raw.provider !== 'spawn' && raw.provider !== 'fork') throw new ControlsError('invalid-input', 'spawn/fork provider required')
        const bounded = (value: unknown, where: string, max: number) => {
          if (typeof value !== 'string' || value.length === 0 || value.length > max || value.includes('\0')) throw new ControlsError('invalid-input', where + ' must be bounded non-empty text')
          return value
        }
        const childId = SessionId(id(raw.childId, 'childId')), label = bounded(raw.label, 'label', 256), prompt = bounded(raw.prompt, 'prompt', 262144)
        const cwd = raw.cwd === undefined ? undefined : bounded(raw.cwd, 'cwd', 16384)
        if (cwd !== undefined && (!isAbsolute(cwd) || normalize(cwd) !== cwd)) throw new ControlsError('invalid-input', 'cwd must be a normalized absolute path')
        if (cwd !== undefined) requireStartupCwd()
        const native = ctx.get('subagents')
        if (!native) throw new ResourceError('unsupported', 'native continuable creation is unavailable')
        if (cwd !== undefined && !initialChildCwdSupported(ctx)) throw new ResourceError('unsupported', 'nativeInitialChildCwd unsupported; no child was requested')
        const verifyCwd = cwd === undefined ? undefined : await authorizeInitialChildCwd(ctx, exec.agent!, cwd, AbortSignal.any([exec.signal, lifetime.signal]))
        const maxDepth = native.resolveMaxDepth()
        lifetime.signal.throwIfAborted(); exec.signal.throwIfAborted(); agentCaller(ctx, exec.agent)
        // Public manager owns provider capability/depth checks, permissions, lineage,
        // factory headers and durable descriptors. Never mutate parent/child metadata.
        const spec = { provider: raw.provider, label, childId,
          request: { parent: exec.agent!, prompt: [{ type: 'text' as const, text: prompt }], ...(maxDepth === undefined ? {} : { maxDepth }) },
          signal: exec.signal, ...(cwd === undefined ? {} : { cwd }) }
        if (cwd !== undefined) {
          requireStartupCwd()
          if (!initialChildCwdSupported(ctx)) throw new ResourceError('unsupported', 'nativeInitialChildCwd unsupported; no child was requested')
        }
        verifyCwd?.()
        return native.startContinuable(spec)
      },
      installNativeGuard(guard) { const remove = ctx.tools.guard(guard); disposers.push(remove); return remove },
      installManagedGuard(guard) { const remove = ctx.tools.guard(guard); disposers.push(remove); return remove },
      async flushSession(rawSessionId, signal) {
        const sessionId = SessionId(id(rawSessionId, 'sessionId')), control = AbortSignal.any([signal, lifetime.signal])
        control.throwIfAborted()
        const actual = ctx.agents.get(sessionId), sessions = ctx.get('sessions')
        // A cold child is not resumed merely to prove a binding. No peer/actual
        // session means no program checkpoint receipt, not successful durability.
        if (!actual || actual.id !== sessionId || actual.session.header.id !== sessionId || !sessions) return false
        const persisted = await sessions.flush(actual.session)
        control.throwIfAborted(); return persisted === true
      },
      liveAgent(sessionId) { return ctx.agents.get(SessionId(id(sessionId, 'sessionId'))) },
      liveAgents() { return ctx.agents.list() },
      async nativeActivity(sessionId) {
        id(sessionId, 'sessionId')
        // AgentRegistry is complete for local live Agents, not external provider runs,
        // unpublished preparations or every native activation. Absence is not proof.
        return { known: false, reason: 'all-native-activity-enumeration-unsupported', liveAgents: ctx.agents.list() }
      },
      async openRuntimeStorage(parse) { return ports.openUnitStorage('runtime_bindings', parse) },
      async openUnitStorage<T extends { readonly revision: number }>(suffix: string, parse: (value: unknown) => T) {
        if (closing) throw new ControlsError('access-denied', 'host is disposing')
        if (!/^[a-z][a-z0-9_]{0,63}$/u.test(suffix)) throw new ControlsError('invalid-input', 'module storage suffix must be a bounded domain identifier')
        const existing = unitHandles.get(suffix)
        if (existing) {
          if (existing.parse !== parse) throw new ControlsError('invalid-state', 'unit suffix is already bound to a different parser identity')
          // The exact parser identity determines T. This sole generic erasure
          // boundary shares the existing handle and its uncertainty latch.
          return await existing.opening as VersionedStorage<T>
        }
        const opening = track(() => Promise.resolve().then(async () => createDomainVersionedStorage(await open(suffix, parse), 'state', parse)))
        unitHandles.set(suffix, { parse, opening })
        return await opening
      },
      async readPolicyGrants() { const raw = await grants.read(); return raw === undefined ? parsePolicyGrants({ schemaVersion: 1, revision: 0, grants: [] }) : parsePolicyGrants(raw) },
      resourceLifecycle: {
        async closeEntrypoints() { return { closed: false, nativeColdResumeClosed: false } },
        async verifyInitialBinding() { return false },
      },
    }
    runtime = await options.createRuntime(ports)
    const active = runtime
    const service = new MattPocockControlsService(ctx, active, ports, grants, startup, { signal: lifetime.signal, track, ...(options.onPolicyChanged === undefined ? {} : { onPolicyChanged: options.onPolicyChanged }) })
    disposers.push(ctx.typert.register(hostRemoteContribution()))
    // Model tools always address the actual caller's session, never a supplied principal.
    const tool = (name: string, description: string, action: (raw: Record<string, unknown>, caller: HostCaller, exec: ToolRunContext) => Promise<unknown>) => {
      disposers.push(ctx.tools.register(defineTool({ name, description, parameters: { request: { type: 'json', required: true } },
        output: { schema: { type: 'json' }, render: (_, value) => [{ type: 'text', text: JSON.stringify(value) }] },
        async execute(args, exec) {
          exec.signal.throwIfAborted(); const caller = agentCaller(ctx, exec.agent), envelope = record(args, 'tool arguments', ['request']), raw = record(envelope.request, 'request')
          const controlled: ToolRunContext = { ...exec, signal: AbortSignal.any([exec.signal, lifetime.signal]), concludeTurn: exec.concludeTurn.bind(exec), deferContext: exec.deferContext.bind(exec) }
          return parseHostJson(await track(() => action(raw, caller, controlled)))
        },
      })))
    }
    tool('mattpocock_controls', 'Read saved workspace controls or explicitly delegated policy saves. Request keys: read={action:"read"}; save={action:"save", intent, expectedRevision}. Extra keys are rejected and the error lists the accepted keys.', async (raw, caller, exec) => {
      if (raw.action === 'read') { record(raw, 'policy read', ['action']); await ports.authority.authorizePolicy(caller.principalId, 'read'); return active.readPolicy(caller, exec.signal) }
      record(raw, 'policy save', ['action', 'intent', 'expectedRevision']); if (raw.action !== 'save') throw new ControlsError('invalid-input', 'read/save action required')
      await ports.authority.authorizePolicy(caller.principalId, 'write')
      const saved = await active.savePolicy(caller, parsePolicyIntent(raw.intent), revision(raw.expectedRevision, 'expectedRevision'), exec.signal)
      options.onPolicyChanged?.(); return saved
    })
    tool('mattpocock_record', 'Read the actual session instrument or submit authored ticket/decision records. Request keys: read={action:"read"}; apply={action:"apply", command} with command={operationId, expectedRevision, action:"put-workflow"|"put-ticket"|"put-decision"|"set-decision-view", workflowId, references, value, plus localTicketId for put-ticket and decisionId for put-decision or set-decision-view}. Extra keys are rejected and the error lists the accepted keys.', async (raw, caller, exec) => {
      await ports.authorizeCaller(caller, caller.sessionId!)
      if (raw.action === 'read') { record(raw, 'instrument read', ['action']); return active.readSession(caller, caller.sessionId!, exec.signal) }
      record(raw, 'instrument apply', ['action', 'command']); if (raw.action !== 'apply') throw new ControlsError('invalid-input', 'read/apply action required')
      return active.applyInstrument(caller, caller.sessionId!, parseInstrumentCommand(raw.command), exec.signal)
    })
    tool('mattpocock_window', 'Request keys: a flat object {operationId, workflowId, localTicketId, action:"reserve"|"release"|"reacquire", generation}, with generation required for release and reacquire and omitted for reserve; the ticket key is localTicketId, there is no nested command object. Extra keys are rejected and the error lists the accepted keys. Register explicit ticket-window reservations, releases and reacquisitions. Release a T slot only after its ticket has reached its declared delivered state, or is blocked with no further implementable work.', async (raw, caller, exec) => {
      await ports.authorizeCaller(caller, caller.sessionId!); return active.applyTicketWindow(caller, caller.sessionId!, parseTicketWindowCommand(raw), exec.signal)
    })
    if (active.historyAction) tool('mattpocock_history', 'Query this session retained instrument history separately from current context: query with query={kind?,recordId?,limit?,cursor?}; detail with historyIds; set-context with kind,recordId,included; purge with historyIds/range/archivedOnly deletes derived copies; compact validates them. compact-source or purge-source with domain=records|windows|worktrees and an explicit request performs source history cleanup preserving current state; use sourceRevisions from query, not history revision. Paging summaries are not complete detail. Purge affects instrument data, not Git worktrees or native conversation history.', async (raw, caller, exec) => {
      const keys: Record<string, readonly string[]> = {
        query: ['action', 'query'], detail: ['action', 'historyIds'],
        'set-context': ['action', 'kind', 'recordId', 'included'],
        purge: ['action', 'historyIds', 'range', 'archivedOnly'], compact: ['action'],
        'purge-source': ['action','domain','request'], 'compact-source': ['action','domain','request'],
      }
      const allowed = typeof raw.action === 'string' && Object.hasOwn(keys, raw.action) ? keys[raw.action] : undefined
      if (!allowed) throw new ControlsError('invalid-input', 'action required; accepted actions: query, detail, set-context, purge, compact, purge-source, compact-source')
      record(raw, 'history request', allowed)
      await ports.authorizeCaller(caller, caller.sessionId!); return active.historyAction!(caller, caller.sessionId!, parseHostJson(raw), exec.signal)
    })
    if (active.worktreeAction) tool('mattpocock_worktree', 'Worktree binding instrument: read={action:read}; update={action:update,command:{operationId,bindingId,expectedRevision,state:active|discarded|cleaned,notes?}}; reconcile={action:reconcile,operationId}. Agent status and program-verified native binding facts remain distinct. Does not create, merge or delete Git worktrees.', async (raw, caller, exec) => {
      const action = raw.action
      if (action === 'read') record(raw, 'worktree read', ['action'])
      else if (action === 'update') record(raw, 'worktree update', ['action', 'command'])
      else if (action === 'reconcile') record(raw, 'worktree reconcile', ['action', 'operationId'])
      else throw new ControlsError('invalid-input', 'read/update/reconcile action required')
      await ports.authorizeCaller(caller, caller.sessionId!); return active.worktreeAction!(caller, caller.sessionId!, parseHostJson(raw), exec.signal)
    })
    tool('mattpocock_resource', 'Deprecated read-only resource inspection. Git lifecycle writes are disabled; use mattpocock_worktree for recorded bindings, not Git management.', async (raw, caller, exec) => {
      await ports.authorizeCaller(caller, caller.sessionId!)
      const parsed = parseResourceAction(raw)
      if (parsed.action !== 'read') throw new ControlsError('feature-disabled', 'deprecated resource lifecycle writes are disabled; manage Git yourself and use worktree bindings')
      return active.resourceAction(caller, caller.sessionId!, parsed, exec.signal)
    })
    if (active.delegate) tool('mattpocock_delegate', 'Create a continuable spawn/fork child: description, prompt, optional provider, worktree, operationId, workflowId and ticketIds. Prepare any Git worktree yourself first. Routes inherit the parent/native configuration; model route overrides are not supported. Continue the same child/history/cwd with native send_message; do not create another child for a follow-up. Native acceptance and persisted binding facts are reported separately.', async (raw, caller, exec) => {
      record(raw, 'delegation request', ['description', 'prompt', 'provider', 'worktree', 'operationId', 'workflowId', 'ticketIds'])
      await ports.authorizeCaller(caller, caller.sessionId!); return active.delegate!(caller, parseHostJson(raw), exec)
    })
    if (active.executeManaged) tool('mattpocock_execute', 'Observe native delegation through its existing permission pipeline and record supported execution facts. Never forge execution receipts. Extra keys are rejected and the error lists the accepted keys.', async (raw, caller, exec) => {
      await ports.authorizeCaller(caller, caller.sessionId!); return active.executeManaged!(caller, parseHostJson(raw), exec)
    })
    if (active.assign) tool('mattpocock_assign', 'Record only authenticated delegation assignments; never self-grant user policy access. Extra keys are rejected and the error lists the accepted keys.', async (raw, caller, exec) => {
      await ports.authorizeCaller(caller, caller.sessionId!); return active.assign!(caller, parseHostJson(raw), exec.signal)
    })
    disposers.push(ctx.on('session/event', (session, event) => {
      if (event.type !== 'user/message') return
      const message = event.data, attempt = noticeAttempts.get(message.id)
      if (!attempt || session !== attempt.actualAgent.session || message.source.kind !== 'mattpocock-controls-notification') return
      const source = message.source
      if (source.form !== 'notice' || source.notificationId !== attempt.input.notificationId || source.ownerSessionId !== session.id || source.instrumentInstanceId !== attempt.input.instrumentInstanceId || source.businessRevision !== attempt.input.businessRevision || source.authorPrincipalId !== attempt.input.authorPrincipalId) return
      void track(async () => {
        // Append observers publish after in-memory log commit. Let the entire
        // synchronous append feed buffer before requesting the real checkpoint.
        await Promise.resolve()
        const store = ctx.get('sessions')
        if (!store || !active.notificationCommitted || !await store.flush(session)) return
        await active.notificationCommitted(attempt.input.ownerSessionId, attempt.input.notificationId, message.id)
        for (const [key, pendingAttempt] of noticeAttempts) if (pendingAttempt.input.notificationId === attempt.input.notificationId && pendingAttempt.input.ownerSessionId === attempt.input.ownerSessionId) noticeAttempts.delete(key)
      }).catch(error => ctx.logger.warn('controls notification durability failed', error))
    }))
    disposers.push(ctx.on('agent/created', async ({ agent, signal }) => { await track(() => active.created(agentCaller(ctx, agent), signal ? AbortSignal.any([signal, lifetime.signal]) : lifetime.signal, agent)); return undefined }))
    disposers.push(ctx.on('agent/pre-step', async ({ agent, signal }, next): Promise<PreStepDecision> => {
      const decision = await next()
      if (decision.kind === 'reject') return decision
      const messages = await track(() => active.preStep(agentCaller(ctx, agent), signal, decision.messages)); signal.throwIfAborted()
      return messages.length === 0 ? decision : { ...decision, messages: [...decision.messages, ...messages] }
    }))
    if (active.postExecute) disposers.push(ctx.on('tools/post-execute', async (exec, result, next) => {
      const decision = await next()
      if (!exec.agent) return decision
      const contexts = await track(() => active.postExecute!(agentCaller(ctx, exec.agent), exec, result)); exec.signal.throwIfAborted()
      return contexts.length === 0 ? decision : { ...decision, additionalContexts: [...decision.additionalContexts ?? [], ...contexts] }
    }))
    if (active.context) disposers.push(ctx.systemPrompt.context({ name: 'mattpocock-controls', order: 130,
      text: assembly => assembly.agent ? active.context!(agentCaller(ctx, assembly.agent)) : '' }))
    const observe = (event: HostEvent) => { void track(() => active.observe(Object.freeze(event))).catch(error => ctx.logger('mattpocock-controls').warn(error)) }
    disposers.push(ctx.on('agent/status', ({ agent, status }) => observe({ kind: 'agent-status', sessionId: agent.id, status, actualAgent: agent })))
    disposers.push(ctx.on('agent/disposed', ({ agent }) => {
      for (const [key, attempt] of noticeAttempts) if (attempt.actualAgent === agent) noticeAttempts.delete(key)
      return observe({ kind: 'agent-disposed', sessionId: agent.id, actualAgent: agent })
    }))
    disposers.push(ctx.on('subagent/start', info => { const agent = info.local ? ctx.agents.get(info.id) : undefined; observe({ kind: 'subagent-start', sessionId: info.id, runId: info.runId, provider: info.provider, local: info.local, ...(agent ? { actualAgent: agent } : {}) }) }))
    disposers.push(ctx.on('subagent/end', info => { const agent = info.local ? ctx.agents.get(info.id) : undefined; observe({ kind: 'subagent-end', sessionId: info.id, runId: info.runId, provider: info.provider, local: info.local, stopReason: info.stopReason, ...(agent ? { actualAgent: agent } : {}) }) }))
    ctx.effect(() => dispose)
    resolveNotificationObserverReady()
    return { service, ports, dispose, skillsEnabledForCwd: async (cwd?: string) => {
    try {
      if (typeof cwd !== 'string' || cwd === '') return true
      const workspace = await ctx.workspaceRegistry.resolveByPath(cwd)
      if (!workspace) return true
      const { resolvePolicy } = await import('./controls/policy.js')
      const policy = await service.readPolicy()
      return resolvePolicy(policy, workspace.id, true).skillsEnabled
    } catch { return true }
  } }
  } catch (error) { await dispose(); throw error }
}
