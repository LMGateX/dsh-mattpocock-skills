import { symbols } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import { createHash } from 'node:crypto'
import { lstat, readlink } from 'node:fs/promises'
import { isAbsolute, normalize } from 'node:path'
import type {} from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-subprocess'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import { classifyRunnerFailure, matchesSignature } from '@deepseek-ai/dsh-sandbox'
import type { ConfinedArgv } from '@deepseek-ai/dsh-sandbox'
import type { AuthorizedGitRunner } from './controls/git-worktrees.js'
import { ResourceError } from './controls/resources.js'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-session-query'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import type { SessionEvent, SessionHeader, UserMessage } from '@deepseek-ai/dsh-session'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { DomainSpec, Domain } from '@deepseek-ai/dsh-storage-domain'
import { foldSubagentDescriptor } from '@deepseek-ai/dsh-subagent'
import type { SubagentCatalogEntry, SubagentDescendantListEntry } from '@deepseek-ai/dsh-subagent'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolExecution, ToolExecutionResult, ToolRunContext, ToolGuard } from '@deepseek-ai/dsh-tools'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry'
import { z } from 'zod'
import { createModelTools, sourceKey } from './model-tools.js'
import { modelToolDescription } from './model-tool-contract.js'
import { ModelOutputError, previewText } from './controls/model-output.js'
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
import { INITIAL_SUPERVISION_CONFIG, parseSupervisionConfigDocument, parseSupervisionConfigIntent, parseSupervisionConfigSnapshot, resolveSupervisionSettings } from './controls/supervision-config.js'
import type { SupervisionConfigIntent, SupervisionConfigSnapshot } from './controls/supervision-config.js'
import { SupervisionLedger } from './controls/supervision-ledger.js'
import type { SupervisionTicketRef } from './controls/supervision-ledger.js'
import { decideSupervisionTrigger, deterministicReview, initialSupervisionDocument, makeSupervisionEpisode, parseSupervisionDocument, supervisionAgentText, withSupervisionEpisode } from './controls/supervision-audit.js'
import type { SupervisionDocument, SupervisionEpisode, SupervisionReview } from './controls/supervision-audit.js'
import { createDomainWindowStorage, parseWindowDocument, parseTicketWindowCommand } from './controls/windows.js'
import type { NativeRunningDepth, NativeSubagentActivity, WindowStorage, TicketWindowCommand } from './controls/windows.js'
import { createDomainResourceStorage, parseResourceDocument } from './controls/resources.js'
import type { ResourceLifecycle, ResourceStorage } from './controls/resources.js'
import { createDomainVersionedStorage } from './controls/versioned-storage.js'
import type { VersionedStorage } from './controls/versioned-storage.js'
import { RECOMMENDATION_REMOTE_NAMESPACE, RECOMMENDATION_REMOTE_CONTRIBUTION, parseOwnerDecisionPolicySaveRequest, parseOwnerDecisionPolicySnapshot, parseOwnerDecisionPolicySaveResult } from './controls/recommendation-contract.js'
import type { OwnerDecisionPolicySaveRequest, OwnerDecisionPolicySnapshot, OwnerDecisionPolicySaveResult } from './controls/recommendation-contract.js'
import { REMOTE_NAMESPACE, REMOTE_CONTRIBUTION, parseHostJson, createHostJsonRepresentation, parsePolicyGrants, parseResourceAction, parseSessionSummaryRequest, parseSessionSummaryBatch } from './controls/remote-contract.js'
import type { HostCaller, HostJson, PolicyGrants, ResourceAction, RuntimeSnapshot, WorkspaceRow, SessionSummaryRequest, SessionSummaryBatch } from './controls/remote-contract.js'
import { boolean, ControlsError, freeze, id, increment, memoized, record, revision } from './controls/validation.js'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'mattpocock-controls-notification': { readonly kind: 'mattpocock-controls-notification'; readonly form: 'notice'; readonly summary: string; readonly notificationId: string; readonly ownerSessionId: string; readonly instrumentInstanceId: string; readonly businessRevision: number; readonly authorPrincipalId: string }
    'mattpocock-controls': { readonly kind: 'mattpocock-controls'; readonly form: 'snapshot'; readonly sections: readonly { readonly name: string; readonly text: string }[] }
    'mattpocock-controls-supervision': { readonly kind: 'mattpocock-controls-supervision'; readonly form: 'notice'; readonly summary: string; readonly episodeId: string; readonly ownerSessionId: string; readonly severity: 'alert' }
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
export function makeSupervisionNotice(episode: SupervisionEpisode): UserMessage {
  const text = supervisionAgentText(episode)
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'mattpocock-controls-supervision', form: 'notice', summary: text.slice(0, 240), episodeId: episode.episodeId, ownerSessionId: episode.ownerSessionId, severity: 'alert' } })
}

export const HOST_CAPABILITIES = freeze({
  nativeInitialChildCwd: 'unsupported', allNativeWakeAdmission: 'unsupported',
  multiRootGitWriteScopes: 'unsupported', managedToolRouting: 'supported',
  nativeLifecycleObservation: 'supported', dynamicContext: 'supported',
} as const)
export type HostCapabilities = Omit<typeof HOST_CAPABILITIES, 'nativeInitialChildCwd' | 'allNativeWakeAdmission'> & {
  readonly nativeInitialChildCwd: 'supported' | 'unsupported'
  readonly allNativeWakeAdmission: 'supported' | 'unsupported'
}
/** Which live seam carries an explicit initial child directory. Only `native` —
 * the upstream activation contract (0.2.1-alpha.2 and later, where the provider
 * itself resolves and records the request directory) — is supported. This plugin
 * loads no replacement provider, and the seam is not inferred from a version
 * string: only the public methods the actual service exposes authorize cwd
 * transmission. */
type InitialChildCwdSeam = 'native' | 'unsupported'
interface NativeActivationTask {
  readonly parent: Agent
  readonly prompt: { readonly type: 'text'; readonly text: string }[]
  readonly cwd?: string
  readonly maxDepth?: number
}
/** One structurally compatible call: RC3 consumes the top-level task, while RC1
 * consumes request. Both public implementations ignore the additional fields. */
interface NativeActivationSpec extends NativeActivationTask {
  readonly request: NativeActivationTask
  readonly provider: 'spawn' | 'fork'
  readonly label: string
  readonly childId: SessionId
  readonly signal: AbortSignal
  readonly delivery: 'parent'
}
interface NativeActivationFacade {
  readonly startActivation?: (spec: NativeActivationSpec) => Promise<{ readonly childId?: unknown; readonly messageId?: unknown; readonly result?: unknown }>
}
function initialChildCwdSeam(ctx: Context): InitialChildCwdSeam {
  const subagents = ctx.get('subagents') as (Context['subagents'] & NativeActivationFacade) | undefined
  if (!subagents) return 'unsupported'
  // Upstream resolves the directory through the session working-directory owner;
  // a service that carries the method without that owner cannot honor the value.
  if (typeof subagents.startActivation === 'function' && ctx.get('workingDirectory')?.ensure !== undefined) return 'native'
  return 'unsupported'
}
function hasNativeInitialChildCwd(ctx: Context): boolean {
  return initialChildCwdSeam(ctx) === 'native'
}
/** Structural view of the native subagent catalog seam; no Agent or provider class is fabricated. */
interface NativeSubagentRow {
  readonly id: unknown
  readonly kind: string
  readonly mode?: string
  readonly activity?: string
  readonly reason?: string
}
interface NativeSubagentLister {
  readonly rootOf?: (caller: Agent) => Agent
  readonly listDescendants?: (rootSessionId: SessionId, signal?: AbortSignal) => Promise<readonly SubagentDescendantListEntry[]>
  readonly listChildren?: (parentSessionId: SessionId, signal?: AbortSignal) => Promise<readonly SubagentCatalogEntry[]>
}
/** Direct discovery rows have no kind/activity discriminator. Normalize at this adapter,
 * not in the counter, and keep malformed program data as an explicit coverage gap. */
function nativeDirectRows(value: unknown): readonly NativeSubagentRow[] {
  const malformed = (): NativeSubagentRow => ({ kind: 'diagnostic', id: null, reason: 'invalid' })
  if (!Array.isArray(value)) return [malformed()]
  return Array.from(value, value => {
    try {
      const row = record(value, 'native direct-child catalog row', ['id', 'createdAt', 'mode', 'label', 'name'])
      const childId = id(row.id, 'native catalog child id')
      if (typeof row.createdAt !== 'number' || !Number.isFinite(row.createdAt)
        || row.label !== undefined && typeof row.label !== 'string'
        || row.name !== undefined && typeof row.name !== 'string'
        || row.mode === 'continuable' && typeof row.label !== 'string') {
        throw new ControlsError('invalid-input', 'invalid native direct-child catalog fields')
      }
      if (row.mode === 'unknown') return { kind: 'diagnostic', id: childId, reason: 'unsupported' }
      if (row.mode !== 'one-shot' && row.mode !== 'continuable' && row.mode !== 'external') return malformed()
      return { kind: 'child', id: childId, mode: row.mode }
    } catch { return malformed() }
  })
}
function nativeSubagentLister(ctx: Context): NativeSubagentLister | undefined {
  const service = ctx.get('subagents') as NativeSubagentLister | undefined
  if (service === undefined || typeof service.listDescendants !== 'function' && typeof service.listChildren !== 'function') return undefined
  return service
}
export interface NativeCountDrift {
  /** The counted run whose live Agent disappeared without a paired `subagent/end`. */
  readonly sessionId: string
  /** The running-count delta the node event expected; +1 for every unpaired local start. */
  readonly expectedDelta: number
  /** Live running descendants observed at the reconciling node. */
  readonly observed: number
}
/** The published terminal outcome vocabulary for one child turn. `unobservable` is never a cause. */
export type NativeOutcomeKind = 'completed' | 'aborted' | 'blocked' | 'error' | 'max-tokens' | 'refusal' | 'interrupted' | 'unobservable'
/** One `turn/end` fact read from a child's own log, exactly as the session vocabulary publishes it. */
export interface NativeTurnEndFact {
  /** `unknown` marks a merge-extended kind this build cannot classify; it is never reported as a cause. */
  readonly kind: 'completed' | 'aborted' | 'blocked' | 'error' | 'max-tokens' | 'interrupted' | 'forked' | 'unknown'
  readonly turn: number
  readonly seq: number
  /** Published `TurnCancelCause` kind for an aborted turn; null when the log carried none. */
  readonly cause: string | null
  /** Published `LlmFailure` code/message verbatim (joined for display); null when none was published. */
  readonly diagnostic: string | null
}
/** A child's own log tail: its last `turn/end`, when one exists, plus the last observed turn/seq. */
export interface NativeTurnObservation {
  readonly end: NativeTurnEndFact | null
  readonly lastTurn: number | null
  readonly lastSeq: number | null
}
/** Reads ONLY one child's own log. A rejected read is unobservable, never a guessed outcome. */
export type NativeTurnReader = (sessionId: string, signal?: AbortSignal, currentSource?: () => boolean) => Promise<NativeTurnObservation>
/** One open terminal-outcome item the main agent is expected to handle. */
export interface NativeSubagentStop {
  /** Durable dedup key: child session id + turn, plus the host runId when the host supplied one. */
  readonly itemId: string
  readonly sessionId: string
  /** The turn whose outcome this item reports; null when no turn could be read. */
  readonly turn: number | null
  /** The published outcome. `unobservable` states the absence of a readable fact, never a cause. */
  readonly outcome: NativeOutcomeKind
  /** Published aborted cancel cause; null when unreadable or not an abort. */
  readonly cancelCause: string | null
  /** Published failure facts (LlmFailure code/message verbatim); null when the host supplied none. */
  readonly diagnostic: string | null
  /** Evidence pointer carried only by an `unobservable` outcome. */
  readonly evidence: { readonly sessionId: string; readonly turn: number | null; readonly seq: number | null } | null
  /** One-line mechanical observation; never a guessed cause. */
  readonly observed: string
}
/** An outcome item plus its owner, queued for the main-agent wake notification. */
export interface NativeSubagentStopEvent extends NativeSubagentStop {
  readonly ownerSessionId: string
}
/** Await a catalog call for at most its deadline: a callee that ignores its own signal, or a
 * single catalog read that never returns, still cannot hold a step or a snapshot read open. */
async function withinDeadline<T>(task: Promise<T>, deadline: AbortSignal): Promise<T> {
  const timeout = new Promise<{ readonly timedOut: true; readonly value: undefined; readonly error: undefined }>(resolve => {
    const fire = () => resolve({ timedOut: true, value: undefined, error: undefined })
    if (deadline.aborted) fire()
    else deadline.addEventListener('abort', fire, { once: true })
  })
  const settled = task.then(
    value => ({ timedOut: false as const, value, error: undefined }),
    error => ({ timedOut: false as const, value: undefined, error }))
  const outcome = await Promise.race([settled, timeout])
  if (outcome.timedOut) throw new ControlsError('deadline-exceeded', 'native subagent catalog did not answer within its budget')
  if (outcome.error !== undefined) throw outcome.error
  return outcome.value as T
}
/** A read path waits at most this long for the native catalog before stating a lower bound. */
const NATIVE_CATALOG_BUDGET_MS = 1_500
/** After a timeout, wait this long before paying for another catalog projection build. */
const NATIVE_CATALOG_RETRY_MS = 30_000
interface NativeRunningMembership {
  readonly ids: Set<string>
  known: boolean
  reason: string | null
  total: number
}
interface NativeRunState {
  /** True once the live Agent was observed `running`, so the run was part of the count. */
  counted: boolean
  /** True when an idle transition already explains a loss, so the run is not a suspect. */
  sawIdle: boolean
  /** Host runId for this activation, when a start/end edge supplied one. */
  runId: string | null
  /** Weak incarnation proof for a counted/started run, never a retained Agent graph. */
  agent: WeakRef<Agent> | null
  displaced: boolean
  /** The exact recorded incarnation emitted agent/disposed after registry removal. */
  disposed: boolean
  /** Only unchanged legacy catalog provenance may bridge an unclosed legacy event chain. */
  legacySource: number | null
  /** In-flight classification token; null when none is pending. */
  settle: number | null
}
interface NativeRunningLedger {
  /** Runs observed running (or started) with no paired end; seeded at the first read. */
  readonly runs: Map<string, NativeRunState>
  readonly drifts: NativeCountDrift[]
  /** Open outcome items keyed by the durable dedup itemId; one open item per failed turn. */
  readonly stops: Map<string, NativeSubagentStop>
  /** Weak run provenance retained only while its terminal item remains open. */
  readonly terminalRuns: Map<string, NativeRunState>
  /** Live subagent ids a walk already failed to list, so a read never repeats that walk for them. */
  readonly unresolved: Set<string>
  /** Per-child activation generation: a stale classification never opens an item after a new run. */
  readonly generations: Map<string, number>
}
/** Cancellations this owner side caused: a parent turn cancellation or the run's own disposal. */
const OWN_CANCEL_CAUSES = new Set(['parent', 'disposed'])
function jsonRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}
function boundedText(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= max && !value.includes('\u0000') ? value : null
}
function safeIndex(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}
/**
 * Read a child's own event suffix into the published turn-end vocabulary. Nothing is synthesized:
 * a reason kind this build does not recognize stays `unknown`, an aborted cause is the published
 * `TurnCancelCause` kind, and a failure diagnostic is the published `LlmFailure` code/message.
 */
export function observeNativeTurn(events: readonly SessionEvent[]): NativeTurnObservation {
  let lastTurn: number | null = null, lastSeq: number | null = null, end: NativeTurnEndFact | null = null
  for (const event of events) {
    const data = jsonRecord((event as { readonly data?: unknown }).data)
    const turn = safeIndex(data?.turn), seq = safeIndex((event as { readonly seq?: unknown }).seq)
    if (turn !== null) lastTurn = turn
    if (seq !== null) lastSeq = seq
    if ((event as { readonly type?: unknown }).type !== 'turn/end' || data === undefined || turn === null || seq === null) continue
    const reason = jsonRecord(data.reason), kind = reason?.kind
    if (kind === 'error') {
      const failure = jsonRecord(reason?.error)
      const code = boundedText(failure?.code, 256), message = boundedText(failure?.message, 4096)
      const parts = [code, message].filter((part): part is string => part !== null)
      end = freeze({ kind, turn, seq, cause: null, diagnostic: parts.length === 0 ? null : parts.join(': ') })
    } else if (kind === 'aborted') {
      end = freeze({ kind, turn, seq, cause: boundedText(jsonRecord(reason?.reason)?.kind, 64), diagnostic: null })
    } else if (kind === 'completed' || kind === 'blocked' || kind === 'max-tokens' || kind === 'interrupted' || kind === 'forked') {
      end = freeze({ kind, turn, seq, cause: null, diagnostic: null })
    } else {
      // Merge-extended kind: a turn ended, but this build cannot claim why.
      end = freeze({ kind: 'unknown', turn, seq, cause: null, diagnostic: null })
    }
  }
  return freeze({ end, lastTurn, lastSeq })
}
/**
 * Event-driven native running count for one mount.
 *
 * Creator membership is enriched from one direct catalog (legacy recursive-only services
 * retain their existing fallback), only at membership-change nodes (agent/created, agent/disposed,
 * `subagent/catalog`, unknown subagent/start-end ids, a first baseline read, or a read that
 * finds a live descendant the membership does not know). A read is O(live agents) and performs
 * no catalog IO once membership is fresh. Exact public runtime-root facts supplement root
 * owners across cold creator gaps; nonroot owners still require creator ancestry proof.
 *
 * The count is the host's live run status: descendant subagents whose live `Agent.status` is
 * `running`. The catalog `activity` field is session residency, not execution, so idle
 * resident children stay out of the count. External children own no local Agent and are never
 * counted.
 *
 * `subagent/start` / `subagent/end` build an expected-run ledger. The installed host
 * publishes `subagent/start` before the child's driver wakes (dsh-subagent emits the start edge
 * during materialization and delivers the initial prompt afterwards), so a start's own node does
 * not reconcile it; the following node reconciles it against the live set.
 *
 * Terminal outcomes come from the host's own vocabulary, never from inference:
 * - Primary path: a `subagent/end` edge carries the published `stopReason`; any non-`completed`
 *   reason opens one item (a `completed` run is an ordinary slot release).
 * - Reconciliation path: a counted run that lost its live Agent with no paired end and no idle
 *   transition is a suspect; ONLY that child's own log is read, its last `turn/end` is classified
 *   with the public kind vocabulary, and an unreadable log or missing `turn/end` yields an
 *   `unobservable` item carrying an evidence pointer - never a guessed cause.
 * Items dedup on child session id + turn (plus the host runId when supplied), so a repeated node
 * observation reuses the same durable item and a later failing turn is a new item. An item clears
 * when the child runs again, its start edge arrives, or a late end arrives. A run that never
 * entered the count is never reported, and an unreadable catalog never produces an outcome claim.
 */
class NativeRunningCounter {
  readonly #liveAgents: () => readonly Agent[]
  readonly #liveAgent: (sessionId: string) => Agent | undefined
  readonly #lister: () => NativeSubagentLister | undefined
  readonly #directChildren: ((owner: SessionId, signal?: AbortSignal) => Promise<unknown>) | undefined
  readonly #signal: AbortSignal | undefined
  readonly #onStop: ((event: NativeSubagentStopEvent) => void) | undefined
  readonly #turnReader: NativeTurnReader
  readonly #members = new Map<string, NativeRunningMembership>()
  readonly #ledgers = new Map<string, NativeRunningLedger>()
  readonly #idOwners = new Map<string, Set<string>>()
  readonly #tails = new Map<string, Promise<unknown>>()
  readonly #revisions = new Map<string, number>()
  readonly #walkStates = new Map<string, { running: boolean; dirty: boolean; notBefore: number }>()
  readonly #reconcileDue = new Map<string, Set<string>>()
  readonly #walkTokens = new Map<string, number>()
  readonly #appliedWalks = new Map<string, number>()
  readonly #opened: NativeSubagentStopEvent[] = []
  readonly #identities = new WeakMap<object, number>()
  #nextIdentity = 0
  #identity(value: object): number {
    // Cordis's public original symbol distinguishes providers, not transient scoped wrappers.
    const original: unknown = Reflect.get(value, symbols.original)
    const target = original !== null && (typeof original === 'object' || typeof original === 'function') ? original : value
    let token = this.#identities.get(target)
    if (token === undefined) { token = ++this.#nextIdentity; this.#identities.set(target, token) }
    return token
  }
  #legacySource(): number | null {
    const service = this.#lister()
    return service === undefined || service.rootOf !== undefined ? null : this.#identity(service)
  }
  readonly #startEpochs = new Map<string, number>()
  #turnSource(owner: string, sessionId: string, source: NativeRunState, permitted = true): () => boolean {
    if (!permitted) return () => false
    const ownerAgent = this.#liveAgent(owner), ownerRef = ownerAgent === undefined ? null : new WeakRef(ownerAgent)
    const service = this.#lister(), provider = service === undefined ? null : this.#identity(service)
    const method = service?.rootOf === undefined ? null : this.#identity(service.rootOf)
    const epoch = this.#startEpochs.get(sessionId) ?? 0
    let rootRef: WeakRef<Agent> | null = null
    try {
      const current = this.#liveAgent(sessionId) ?? ownerAgent
      if (current !== undefined && service?.rootOf !== undefined) rootRef = new WeakRef(service.rootOf(current))
    } catch { return () => false }
    return () => {
      const expected = source.agent?.deref(), expectedOwner = ownerRef?.deref(), current = this.#liveAgent(sessionId)
      if (source.displaced || expected === undefined || expectedOwner === undefined || this.#liveAgent(owner) !== expectedOwner
        || (this.#startEpochs.get(sessionId) ?? 0) !== epoch || (current === undefined ? !source.disposed : current !== expected)) return false
      const now = this.#lister()
      if ((now === undefined ? null : this.#identity(now)) !== provider
        || (now?.rootOf === undefined ? null : this.#identity(now.rootOf)) !== method) return false
      try {
        if (now?.rootOf !== undefined) {
          const root = rootRef?.deref()
          if (root === undefined || this.#liveAgent(String(root.id)) !== root || now.rootOf(root) !== root
            || now.rootOf(current ?? expectedOwner) !== root) return false
        }
        return current === undefined || this.#ownersFor(sessionId, current).has(owner)
      } catch { return false }
    }
  }
  async #observeRunTurn(sessionId: string, currentSource: () => boolean): Promise<NativeTurnObservation | null> {
    if (!currentSource()) return null
    let observation: NativeTurnObservation | null = null
    try { observation = await this.#turnReader(sessionId, this.#signal, currentSource) } catch { observation = null }
    return currentSource() ? observation : null
  }
  #settles = 0
  constructor(options: { readonly liveAgents: () => readonly Agent[]; readonly liveAgent: (sessionId: string) => Agent | undefined; readonly lister: () => NativeSubagentLister | undefined; readonly directChildren?: (owner: SessionId, signal?: AbortSignal) => Promise<unknown>; readonly signal?: AbortSignal; readonly onStop?: (event: NativeSubagentStopEvent) => void; readonly turnReader?: NativeTurnReader }) {
    this.#liveAgents = options.liveAgents; this.#liveAgent = options.liveAgent; this.#lister = options.lister; this.#directChildren = options.directChildren; this.#signal = options.signal; this.#onStop = options.onStop
    this.#turnReader = options.turnReader ?? (async () => { throw new ControlsError('feature-disabled', 'child session log observation is unavailable') })
  }
  /** Serialize per-owner refreshes so a read after a node awaits that node's walk, never a second one. */
  #serial<T>(owner: string, task: () => Promise<T>): Promise<T> {
    const prior = this.#tails.get(owner) ?? Promise.resolve()
    const next = prior.then(task, task)
    const tail = next.then(() => undefined, () => undefined)
    this.#tails.set(owner, tail)
    // Drop the per-owner chain entry once it settles: otherwise every owner that ever walked
    // keeps a promise for the process lifetime.
    void tail.then(() => { if (this.#tails.get(owner) === tail) this.#tails.delete(owner) }, () => undefined)
    return next
  }
  #refresh(owner: string, signal?: AbortSignal): Promise<void> {
    return this.#serial(owner, () => this.#refreshNow(owner, signal))
  }
  /** Walk first, then reconcile: a stop is never claimed from a catalog this node just lost.
   * A burst of membership-change events shares one walk: a walk already in flight absorbs later
   * events into one further walk instead of queueing one catalog read per event. */
  #afterWalk(owner: string, task: () => void): void {
    const state = this.#walkState(owner)
    if (state.running) { state.dirty = true; return }
    state.dirty = false
    state.running = true
    void this.#serial(owner, async () => {
      try {
        if (Date.now() >= state.notBefore) await this.#refreshNow(owner)
        task()
      } finally { state.running = false }
      if (state.dirty) { state.dirty = false; this.#afterWalk(owner, () => this.#reconcile(owner)) }
    }).catch(() => undefined)
  }
  #walkState(owner: string): { running: boolean; dirty: boolean; notBefore: number } {
    let state = this.#walkStates.get(owner)
    if (state === undefined) {
      state = { running: false, dirty: false, notBefore: 0 }
      this.#walkStates.set(owner, state)
    }
    return state
  }
  #bump(owner: string): void { this.#revisions.set(owner, (this.#revisions.get(owner) ?? 0) + 1) }
  /** Coalesce reconciliation for one owner into the current microtask turn. A status burst must
   * not rebuild the live index once per event; the skip set keeps a starting child from being
   * classified as a lost run before its running edge lands. */
  #reconcileSoon(owner: string, skip?: string): void {
    const due = this.#reconcileDue.get(owner)
    if (due !== undefined) { if (skip !== undefined) due.add(skip); return }
    const skips = new Set<string>()
    if (skip !== undefined) skips.add(skip)
    this.#reconcileDue.set(owner, skips)
    queueMicrotask(() => {
      const pending = this.#reconcileDue.get(owner)
      this.#reconcileDue.delete(owner)
      this.#reconcile(owner, pending === undefined || pending.size === 0 ? undefined : pending)
    })
  }
  async #refreshNow(owner: string, signal?: AbortSignal): Promise<void> {
    this.#bump(owner)
    const list = this.#lister(), current = this.#members.get(owner)
    if (list === undefined) {
      if (current !== undefined) { current.known = false; current.reason = 'native-subagent-service-unavailable' }
      return
    }
    const control = signal ?? this.#signal
    const deadline = AbortSignal.timeout(NATIVE_CATALOG_BUDGET_MS)
    // The deadline bounds what this walk waits for, not the host's projection build. Aborting a
    // slow build makes every retry start over (a large owner log then times out forever); letting
    // it finish once lets the host cache the projection and a late result restore membership.
    const token = (this.#walkTokens.get(owner) ?? 0) + 1
    this.#walkTokens.set(owner, token)
    // Exactly one direct-children read. The full-subtree walk this replaces reads every
    // descendant's own session log, which is unbounded work on a read path (measured on a live
    // profile: 2048 descendant logs, 2.1 GB, a baseline walk that never finished); the resident
    // subtree comes from live creator links plus exact runtime-root membership, without cold IO.
    const listing: Promise<readonly NativeSubagentRow[]> = typeof list.listChildren === 'function'
      ? list.listChildren(SessionId(owner), control).then(nativeDirectRows)
      : list.rootOf !== undefined && this.#directChildren !== undefined
        ? this.#directChildren(SessionId(owner), control).then(nativeDirectRows)
        : list.listDescendants!(SessionId(owner), control)
    listing.catch(() => undefined)
    let rows: readonly NativeSubagentRow[]
    try {
      rows = await withinDeadline(listing, deadline)
    } catch (error) {
      if (control?.aborted === true) throw error
      const reason = deadline.aborted ? 'native-subagent-listing-timeout' : 'native-subagent-listing-rejected'
      if (current !== undefined) { current.known = false; current.reason = reason }
      else this.#members.set(owner, { ids: new Set(), known: false, reason, total: 0 })
      if (deadline.aborted) {
        // Keep the stated lower bound, but let the in-flight build complete. A late result is
        // applied only when no newer walk has already published membership.
        this.#walkState(owner).notBefore = Date.now() + NATIVE_CATALOG_RETRY_MS
        void listing.then(
          lateRows => { if (this.#applyWalk(owner, token, lateRows)) this.#reconcile(owner) },
          () => undefined)
      }
      return
    }
    this.#applyWalk(owner, token, rows)
  }
  /** Publish one walk's rows. Returns false when a newer walk already published membership. */
  #applyWalk(owner: string, token: number, rows: readonly NativeSubagentRow[]): boolean {
    if (this.#signal?.aborted === true || token <= (this.#appliedWalks.get(owner) ?? 0)) return false
    this.#appliedWalks.set(owner, token)
    this.#walkState(owner).notBefore = 0
    const current = this.#members.get(owner)
    const children = rows.filter(row => row.kind === 'child')
    const diagnostic = rows.find(row => row.kind !== 'child')
    const ids = new Set<string>(current?.ids ?? [])
    for (const row of children) ids.add(String(row.id))
    for (const member of this.#liveSubtree(owner, ids)) ids.add(member)
    this.#members.set(owner, { ids, total: Math.max(ids.size, children.length), known: diagnostic === undefined,
      reason: diagnostic === undefined ? null : 'native-subagent-diagnostic-' + (diagnostic.reason ?? 'unknown') })
    for (const childId of ids) {
      const owners = this.#idOwners.get(childId) ?? new Set<string>()
      owners.add(owner); this.#idOwners.set(childId, owners)
    }
    this.#bump(owner)
    return true
  }
  /** Seed only proven live creator membership: no catalog, no session log, no IO. Publication
   * separately supplements exact runtime-root facts or reports an unclosed chain as unknown. */
  #adoptLiveMembership(owner: string, live: Map<string, Agent>): void {
    const membership: NativeRunningMembership = { ids: new Set<string>(), total: 0, known: true, reason: null }
    this.#absorbLiveMembership(owner, membership, live)
    this.#members.set(owner, membership)
  }
  /** Add every resident member the live index can see right now. Called on each read, so a child
   * created a moment ago is counted by the very next read with no catalog round trip; catalog
   * enumeration then only ever adds non-resident descendants and branch diagnostics. */
  #absorbLiveMembership(owner: string, membership: NativeRunningMembership, live: Map<string, Agent> = this.#liveIndex()): void {
    const added = this.#liveSubtree(owner, membership.ids, live)
    if (added.length === 0) return
    for (const member of added) {
      membership.ids.add(member)
      const owners = this.#idOwners.get(member) ?? new Set<string>()
      owners.add(owner); this.#idOwners.set(member, owners)
    }
    membership.total = Math.max(membership.total, membership.ids.size)
  }
  /** Resident subtree membership from the live Agent index alone: the direct children admit
   * their own resident children, transitively. Reads no session log, bounded by the live count. */
  #liveSubtree(owner: string, known: ReadonlySet<string>, live: Map<string, Agent> = this.#liveIndex()): string[] {
    const members = new Set(known), added: string[] = []
    for (let pass = 0; pass < 64; pass += 1) {
      let grew = false
      for (const agent of live.values()) {
        if (agent.session.header.origin !== 'subagent') continue
        const sessionId = String(agent.id)
        if (members.has(sessionId)) continue
        const parent = agent.session.header.parentSession
        if (parent === undefined) continue
        const candidate = String(parent)
        if (candidate !== owner && !members.has(candidate)) continue
        members.add(sessionId); added.push(sessionId); grew = true
      }
      if (!grew) break
    }
    return added
  }
  #liveIndex(): Map<string, Agent> {
    const index = new Map<string, Agent>()
    for (const agent of this.#liveAgents()) index.set(String(agent.id), agent)
    return index
  }
  /**
   * Edge distance from the owner to one live descendant; a direct child is 1. A chain that never
   * reaches the owner, a missing live parent or a cycle is unmeasurable and stays null, never a
   * fabricated depth. Bounded by the same 64-level walk the resident subtree uses.
   */
  #depthOf(owner: string, sessionId: string, live: Map<string, Agent>): number | null {
    const seen = new Set<string>()
    let cursor = sessionId, depth = 0
    while (cursor !== owner) {
      if (seen.has(cursor) || depth >= 64) return null
      seen.add(cursor)
      const parent = live.get(cursor)?.session.header.parentSession
      if (parent === undefined) return null
      depth += 1
      cursor = String(parent)
    }
    return depth
  }
  /** Depth structure of one running set: every counted run lands in exactly one bucket. */
  #depthStructure(owner: string, running: ReadonlySet<string>, live: Map<string, Agent>): NativeRunningDepth {
    const levels = new Map<number, number>()
    let unknown = 0
    for (const sessionId of running) {
      const depth = this.#depthOf(owner, sessionId, live)
      if (depth === null) { unknown += 1; continue }
      levels.set(depth, (levels.get(depth) ?? 0) + 1)
    }
    let direct = 0, deeper = 0
    const published: Record<string, number> = {}
    for (const distance of [...levels.keys()].sort((left, right) => left - right)) {
      const count = levels.get(distance)!
      published[String(distance)] = count
      if (distance === 1) direct += count
      else deeper += count
    }
    return freeze({ direct, deeper, unknown, levels: freeze(published) })
  }
  #running(owner: string, live: Map<string, Agent>, membership: NativeRunningMembership): Set<string> {
    const running = new Set<string>()
    const proof = this.#runtimeMembership(owner, membership, live)
    for (const agent of live.values()) {
      if (agent.session.header.origin !== 'subagent' || agent.status !== 'running') continue
      const sessionId = String(agent.id)
      if (proof.ids.has(sessionId)) running.add(sessionId)
    }
    return running
  }
  /** Creator ancestry and runtime-tree ownership are deliberately different proofs. Only an
   * exact registry root owner may use a shared runtime root to bridge cold creator edges.
   * This synchronous fact is count-only: it never enters session/business authorization. */
  #runtimeMembership(owner: string, membership: NativeRunningMembership, live: Map<string, Agent>): { ids: Set<string>; reason: string | null; token: string } {
    const ids = new Set<string>(), service = this.#lister(), ownerAgent = live.get(owner)
    const serviceSource: object | undefined = service === undefined ? undefined : Reflect.get(service, symbols.original) ?? service
    const rootMethod: unknown = serviceSource === undefined ? undefined : Reflect.get(serviceSource, 'rootOf')
    const facts: unknown[] = [serviceSource === undefined ? null : this.#identity(serviceSource),
      typeof rootMethod === 'function' ? this.#identity(rootMethod) : null]
    let root: Agent | undefined, reason: string | null = null
    const rootOf = (agent: Agent): Agent => {
      const found = service!.rootOf!(agent)
      if (live.get(String(agent.id)) !== agent || live.get(String(found.id)) !== found
        || String(found.session.header.id) !== String(found.id) || service!.rootOf!(found) !== found) {
        throw new Error('native runtime root is not the exact registry root')
      }
      return found
    }
    if (service?.rootOf !== undefined) {
      try {
        if (ownerAgent === undefined) throw new Error('owner is not live')
        root = rootOf(ownerAgent)
        facts.push([owner, this.#identity(ownerAgent), String(root.id), this.#identity(root)])
      }
      catch { reason = 'native-subagent-runtime-root-unavailable' }
    }
    for (const agent of live.values()) {
      if (String(agent.id) === owner || agent.session.header.origin !== 'subagent') continue
      let sameTree: boolean | undefined
      if (service?.rootOf !== undefined) {
        try {
          const candidateRoot = rootOf(agent)
          if (root !== undefined) sameTree = candidateRoot === root
          // A verified different tree is not an owner dependency. Its later entry into this
          // tree still changes the next token; rejected/unclosed evidence remains unknown.
          if (sameTree !== false) facts.push([String(agent.id), this.#identity(agent), String(candidateRoot.id), this.#identity(candidateRoot)])
        }
        catch { reason = 'native-subagent-runtime-root-unavailable' }
      }
      if (sameTree === false) continue
      if (sameTree === true && root === ownerAgent) { ids.add(String(agent.id)); continue }
      // A known catalog member or a closed creator chain proves nonroot ancestry, never siblings.
      let cursor: string | undefined = String(agent.id), relation: boolean | undefined
      const seen = new Set<string>()
      while (cursor !== undefined) {
        if (cursor === owner || membership.ids.has(cursor)) { relation = true; break }
        if (seen.has(cursor) || seen.size >= 64) break
        seen.add(cursor)
        const current = live.get(cursor)
        if (current === undefined) break
        if (current.session.header.origin !== 'subagent') { relation = false; break }
        cursor = current.session.header.parentSession
      }
      if (relation === true) ids.add(String(agent.id))
      else if (relation === undefined && reason === null) reason = 'native-subagent-membership-unproven'
    }
    return { ids, reason, token: createHash('sha256').update(JSON.stringify([facts, reason])).digest('hex') }
  }
  /** A live subagent belongs to the owner when its parent chain reaches the owner or a known descendant. */
  #inOwnerSubtree(owner: string, agent: Agent, membership: NativeRunningMembership, live: Map<string, Agent>): boolean {
    let cursor = agent.session.header.parentSession
    const seen = new Set<string>()
    while (cursor !== undefined) {
      const current = String(cursor)
      if (current === owner || membership.ids.has(current)) return true
      if (seen.has(current)) return false
      seen.add(current)
      const parent = live.get(current)
      if (parent === undefined) return false
      cursor = parent.session.header.parentSession
    }
    return false
  }
  #unknownLiveMembers(owner: string, membership: NativeRunningMembership, ledger: NativeRunningLedger, live: Map<string, Agent>): string[] {
    const unknown: string[] = []
    for (const agent of live.values()) {
      if (agent.session.header.origin !== 'subagent') continue
      const sessionId = String(agent.id)
      if (membership.ids.has(sessionId) || ledger.unresolved.has(sessionId)) continue
      if (this.#inOwnerSubtree(owner, agent, membership, live)) unknown.push(sessionId)
    }
    return unknown
  }
  #ownersFor(sessionId: string, agent?: Agent): Set<string> {
    const owners = new Set<string>()
    const direct = (candidate: string | undefined): void => {
      if (candidate === undefined) return
      if (this.#members.has(candidate)) owners.add(candidate)
      for (const owner of this.#idOwners.get(candidate) ?? []) owners.add(owner)
    }
    direct(sessionId)
    direct(agent?.session.header.parentSession === undefined ? undefined : String(agent.session.header.parentSession))
    if (agent !== undefined) {
      const ancestry = (owner: string): boolean | undefined => {
        let parent = agent.session.header.parentSession
        const seen = new Set<string>()
        while (parent !== undefined && seen.size < 64 && !seen.has(String(parent))) {
          const current = String(parent)
          if (current === owner) return true
          seen.add(current)
          const ancestor = this.#liveAgent(current)
          if (ancestor === undefined) return undefined
          if (ancestor.session.header.origin !== 'subagent') return false
          parent = ancestor.session.header.parentSession
        }
        return undefined
      }
      const service = this.#lister()
      if (service?.rootOf !== undefined) {
        // Reverse IDs are discovery hints, not authority for this incarnation's events.
        // Revalidate the exact registry Agent/root through the currently loaded service.
        if (this.#liveAgent(sessionId) !== agent) return new Set()
        try {
          const root = service.rootOf(agent)
          if (this.#liveAgent(String(root.id)) !== root || service.rootOf(root) !== root) return new Set()
          direct(String(root.id))
          for (const owner of owners) {
            const ownerAgent = this.#liveAgent(owner)
            if (ownerAgent === root) continue
            try {
              if (ownerAgent === undefined || service.rootOf(ownerAgent) !== root) { owners.delete(owner); continue }
            } catch { owners.delete(owner); continue }
            if (ancestry(owner) !== true) owners.delete(owner)
          }
        } catch { return new Set() }
      } else {
        if (this.#liveAgent(sessionId) !== agent) return new Set()
        const source = this.#legacySource()
        for (const owner of owners) {
          const related = ancestry(owner), run = this.#ledgers.get(owner)?.runs.get(sessionId)
          if (related !== true && (related === false || run?.agent?.deref() !== agent || run.displaced
            || source === null || run.legacySource !== source)) owners.delete(owner)
        }
      }
    }
    return owners
  }
  #generation(ledger: NativeRunningLedger, sessionId: string): number {
    return ledger.generations.get(sessionId) ?? 0
  }
  /** Every new activation invalidates an in-flight classification of the previous run. */
  #activate(ledger: NativeRunningLedger, sessionId: string): void {
    ledger.generations.set(sessionId, this.#generation(ledger, sessionId) + 1)
  }
  /** Durable dedup key: sessionId[:runId]:turn; `unknown` is the turn slot when none could be read. */
  #itemId(sessionId: string, runId: string | null, turn: number | null): string {
    return sessionId + ':' + (runId === null ? '' : runId + ':') + (turn === null ? 'unknown' : String(turn))
  }
  /** Open exactly one durable dedup item and queue exactly one wake for it. */
  #openStop(owner: string, ledger: NativeRunningLedger, item: NativeSubagentStop, source?: NativeRunState): void {
    if (ledger.stops.has(item.itemId)) return
    ledger.stops.set(item.itemId, item)
    if (source !== undefined) ledger.terminalRuns.set(item.sessionId, source)
    this.#bump(owner)
    const queued: NativeSubagentStopEvent = { ownerSessionId: owner, ...item }
    this.#opened.push(queued)
    this.#onStop?.(queued)
  }
  /** An item clears when the child runs again, its start edge arrives, or a late end arrives. */
  #closeSessionStops(owner: string, ledger: NativeRunningLedger, sessionId: string): void {
    let closed = false
    ledger.terminalRuns.delete(sessionId)
    for (const [itemId, item] of ledger.stops) if (item.sessionId === sessionId) { ledger.stops.delete(itemId); closed = true }
    if (closed) this.#bump(owner)
  }
  /** An `unobservable` item carries the evidence pointer and never a cause. */
  #unobservable(sessionId: string, runId: string | null, turn: number | null, seq: number | null, observed: string): NativeSubagentStop {
    return freeze({ itemId: this.#itemId(sessionId, runId, turn), sessionId, turn, outcome: 'unobservable', cancelCause: null, diagnostic: null,
      evidence: freeze({ sessionId, turn, seq }), observed })
  }
  /**
   * Reconciliation path: classify one suspect child from its own log tail. `observation === null`
   * means the log could not be read; both that and a missing `turn/end` are unobservable.
   */
  async #classifySuspect(owner: string, run: NativeRunState, token: number, sessionId: string, runIdFact: string | null, generation: number, currentSource: () => boolean): Promise<void> {
    const observation = await this.#observeRunTurn(sessionId, currentSource)
    const ledger = this.#ledgers.get(owner)
    if (ledger === undefined || this.#signal?.aborted === true) return
    // A newer activation, a late end or an already-settled check owns the child now: drop this result.
    if (ledger.runs.get(sessionId) !== run || run.settle !== token || this.#generation(ledger, sessionId) !== generation) return
    run.settle = null
    // The run is terminal once classified; retire it so a later node never repeats this log read.
    ledger.runs.delete(sessionId)
    const item = observation === null ? this.#unobservable(sessionId, runIdFact, null, null, 'child log could not be read') : this.#itemFromTurn(sessionId, runIdFact, observation)
    if (item !== null) this.#openStop(owner, ledger, item, run)
  }
  /** Classify one child's own log tail; null means a normal return that opens no item. */
  #itemFromTurn(sessionId: string, runIdFact: string | null, observation: NativeTurnObservation): NativeSubagentStop | null {
    const end = observation.end
    if (end === null) return this.#unobservable(sessionId, runIdFact, observation.lastTurn, observation.lastSeq, 'no turn/end in the readable child log')
    if (end.kind === 'completed' || end.kind === 'forked') return null
    if (end.kind === 'aborted') {
      // Our own cancellation (the parent turn was cancelled or the run was disposed) needs no item.
      if (end.cause !== null && OWN_CANCEL_CAUSES.has(end.cause)) return null
      const item: NativeSubagentStop = freeze({ itemId: this.#itemId(sessionId, runIdFact, end.turn), sessionId, turn: end.turn, outcome: 'aborted', cancelCause: end.cause, diagnostic: null, evidence: null,
        observed: end.cause === null ? 'turn/end: aborted; cancel cause not readable' : 'turn/end: aborted by ' + end.cause })
      return item
    }
    if (end.kind === 'unknown') return this.#unobservable(sessionId, runIdFact, end.turn, end.seq, 'unrecognized turn/end kind')
    const diagnostic = end.kind === 'error' ? end.diagnostic : null
    const item: NativeSubagentStop = freeze({ itemId: this.#itemId(sessionId, runIdFact, end.turn), sessionId, turn: end.turn, outcome: end.kind, cancelCause: null, diagnostic, evidence: null,
      observed: 'turn/end: ' + end.kind + (diagnostic === null ? '' : ' (' + diagnostic + ')') })
    return item
  }
  /**
   * Primary path: the host's `subagent/end` edge publishes the terminal reason. The child's own log
   * is consulted only for the turn number, the aborted cancel cause and any LlmFailure facts.
   */
  async #classifyEnd(owner: string, sessionId: string, runIdFact: string | null, stopReason: string, generation: number, currentSource: () => boolean, source: NativeRunState): Promise<void> {
    const observation = await this.#observeRunTurn(sessionId, currentSource)
    const ledger = this.#ledgers.get(owner)
    if (ledger === undefined || this.#signal?.aborted === true || this.#generation(ledger, sessionId) !== generation) return
    const end = observation?.end ?? null
    const turn = end?.turn ?? observation?.lastTurn ?? null
    const itemId = this.#itemId(sessionId, runIdFact, turn)
    if (stopReason === 'aborted') {
      // Report only a cancellation this owner side did not cause; an unreadable cause stays unobservable.
      if (end?.kind === 'aborted' && end.cause !== null && OWN_CANCEL_CAUSES.has(end.cause)) return
      const cause = end?.kind === 'aborted' ? end.cause : null
      const item: NativeSubagentStop = freeze({ itemId, sessionId, turn, outcome: 'aborted', cancelCause: cause, diagnostic: null, evidence: null,
        observed: cause === null ? 'subagent/end: aborted; cancel cause not observable' : 'subagent/end: aborted by ' + cause })
      this.#openStop(owner, ledger, item, source)
      return
    }
    if (stopReason === 'error') {
      const diagnostic = end?.kind === 'error' ? end.diagnostic : null
      const item: NativeSubagentStop = freeze({ itemId, sessionId, turn, outcome: 'error', cancelCause: null, diagnostic, evidence: null,
        observed: 'subagent/end: error' + (diagnostic === null ? '' : ' (' + diagnostic + ')') })
      this.#openStop(owner, ledger, item, source)
      return
    }
    if (stopReason === 'max-tokens' || stopReason === 'refusal') {
      const item: NativeSubagentStop = freeze({ itemId, sessionId, turn, outcome: stopReason, cancelCause: null, diagnostic: null, evidence: null, observed: 'subagent/end: ' + stopReason })
      this.#openStop(owner, ledger, item, source)
      return
    }
    if (stopReason === 'completed') return
    // A merge-extended reason this build cannot classify: keep the host fact, claim no cause.
    this.#openStop(owner, ledger, this.#unobservable(sessionId, runIdFact, turn, end?.seq ?? observation?.lastSeq ?? null, 'subagent/end: ' + stopReason + ' (unrecognized reason)'), source)
  }
  /**
   * Attribute each expected-delta mismatch by construction; only a counted run with no end and no
   * idle transition is a suspect, and only that child's own log is read.
   */
  #reconcile(owner: string, skip?: string | ReadonlySet<string>): void {
    const ledger = this.#ledgers.get(owner), membership = this.#members.get(owner)
    if (ledger === undefined || membership === undefined) return
    this.#bump(owner)
    // An unreadable catalog cannot distinguish a stopped run from an unlisted branch: keep the
    // stated lower bound instead of inventing an outcome.
    if (!membership.known) return
    const live = this.#liveIndex()
    const proof = this.#runtimeMembership(owner, membership, live)
    if (proof.reason !== null) return
    const running = this.#running(owner, live, membership)
    const skipped = (runId: string): boolean => typeof skip === 'string' ? runId === skip : skip?.has(runId) === true
    for (const [runId, run] of ledger.runs) {
      const current = live.get(runId)
      if (current !== undefined && (run.agent?.deref() !== current || !proof.ids.has(runId))) run.displaced = true
      if (skipped(runId) || running.has(runId) || run.displaced) continue
      const agent = live.get(runId)
      if (agent !== undefined) {
        // A live Agent that is not running is a parked inbox or a driver that has not woken yet,
        // not a lost run; an idle observation explains any later loss.
        if (agent.status === 'idle') run.sawIdle = true
        continue
      }
      // Never counted running, or an observed idle transition already explained the loss.
      if (!run.counted || run.sawIdle) { ledger.runs.delete(runId); continue }
      if (run.settle !== null) continue
      // Expected-delta mismatch: mechanical drift evidence, then classification from this child's
      // own log only. No other child is read and an ordinary count read never reaches here.
      ledger.drifts.push({ sessionId: runId, expectedDelta: 1, observed: running.size })
      if (ledger.drifts.length > 64) ledger.drifts.splice(0, ledger.drifts.length - 64)
      run.settle = ++this.#settles
      const token = run.settle, runIdFact = run.runId, generation = this.#generation(ledger, runId)
      const currentSource = this.#turnSource(owner, runId, run)
      void this.#serial(owner, () => this.#classifySuspect(owner, run, token, runId, runIdFact, generation, currentSource)).catch(() => undefined)
    }
  }
  async read(ownerSessionId: string, signal?: AbortSignal): Promise<NativeSubagentActivity> {
    const owner = id(ownerSessionId, 'ownerSessionId')
    // The read never touches a session catalog or a child log: membership is the live Agent
    // index, so this is O(live agents) memory work. Catalog enumeration and branch diagnostics
    // are enrichment that runs off this path, which is why no step or snapshot read can be held
    // by a slow, huge or unreadable catalog.
    // One live index per read: it is the only membership source on this path.
    const live = this.#liveIndex()
    if (this.#lister() === undefined) {
      // No native service: nothing can be enumerated, and the index alone is not a promise of
      // completeness, so the count stays an explicit unknown rather than a live-derived guess.
      const held = this.#members.get(owner)
      const counted = held === undefined ? new Set<string>() : this.#running(owner, live, held)
      const running = counted.size
      return { known: false, running, total: held === undefined ? 0 : Math.max(held.total, running), reason: 'native-subagent-service-unavailable',
        depth: this.#depthStructure(owner, counted, live) }
    }
    if (!this.#members.has(owner)) {
      this.#adoptLiveMembership(owner, live)
      this.#afterWalk(owner, () => this.#reconcile(owner))
    }
    const membership = this.#members.get(owner)
    if (membership === undefined) return { known: false, running: 0, total: 0, reason: 'native-subagent-service-unavailable',
      depth: this.#depthStructure(owner, new Set<string>(), live) }
    this.#absorbLiveMembership(owner, membership, live)
    const proof = this.#runtimeMembership(owner, membership, live)
    // Count-only runtime membership also routes late native run edges after a creator went
    // cold. Keep this reverse event index separate from durable creator membership/ACL.
    for (const member of proof.ids) {
      const owners = this.#idOwners.get(member) ?? new Set<string>()
      owners.add(owner); this.#idOwners.set(member, owners)
    }
    let ledger = this.#ledgers.get(owner)
    if (ledger === undefined) {
      ledger = { runs: new Map(), drifts: [], stops: new Map(), terminalRuns: new Map(), unresolved: new Set(), generations: new Map() }
      this.#ledgers.set(owner, ledger)
    }
    for (const sessionId of this.#running(owner, live, membership)) {
      if (!ledger.runs.has(sessionId)) ledger.runs.set(sessionId, { counted: true, sawIdle: false, runId: null,
        agent: new WeakRef(live.get(sessionId)!), displaced: false, disposed: false, legacySource: this.#legacySource(), settle: null })
    }
    for (const [sessionId, current] of live) {
      const run = ledger.runs.get(sessionId)
      if (run !== undefined && (run.agent?.deref() !== current || !proof.ids.has(sessionId))) run.displaced = true
    }
    // A live descendant outside the membership is a membership-change node; the refresh that
    // resolves it is queued, never awaited, so the stated count stays immediate.
    const unknown = this.#unknownLiveMembers(owner, membership, ledger, live)
    if (unknown.length > 0) {
      for (const candidate of unknown) ledger.unresolved.add(candidate)
      this.#afterWalk(owner, () => this.#reconcile(owner))
    }
    const counted = this.#running(owner, live, membership)
    const running = counted.size, total = Math.max(membership.total, running)
    const depth = this.#depthStructure(owner, counted, live)
    if (proof.reason !== null) return { known: false, running, total, reason: proof.reason, depth }
    if (!membership.known) return { known: false, running, total, reason: membership.reason, depth }
    return { known: true, running, total, reason: null, depth }
  }
  driftFacts(ownerSessionId: string): readonly NativeCountDrift[] {
    const ledger = this.#ledgers.get(String(ownerSessionId))
    return ledger === undefined ? [] : [...ledger.drifts]
  }
  /** Open terminal-outcome items for one owner; the durable dedup set behind the snapshot rows. */
  stops(ownerSessionId: string): readonly NativeSubagentStop[] {
    const ledger = this.#ledgers.get(String(ownerSessionId))
    return ledger === undefined ? [] : [...ledger.stops.values()]
  }
  /** New outcome items since the previous call; each item is queued exactly once. */
  takeOpened(): readonly NativeSubagentStopEvent[] {
    return this.#opened.splice(0, this.#opened.length)
  }
  /** Copy stored count knowledge/membership IDs plus current service availability; no refresh or catalog IO. */
  state(ownerSessionId: string): { readonly revision: number; readonly known: boolean; readonly reason: string | null; readonly available: boolean; readonly memberSessionIds: readonly string[]; readonly liveMembershipToken: string } {
    const owner = String(ownerSessionId), membership = this.#members.get(owner), available = this.#lister() !== undefined
    const proof = this.#runtimeMembership(owner, membership ?? { ids: new Set(), known: false, reason: null, total: 0 }, this.#liveIndex())
    return { revision: this.revision(owner), available, known: available && membership?.known === true && proof.reason === null,
      memberSessionIds: [...new Set([...(membership?.ids ?? []), ...(this.#lister()?.rootOf === undefined ? [] : proof.ids)])], liveMembershipToken: proof.token,
      reason: !available ? 'native-subagent-service-unavailable' : proof.reason ?? membership?.reason ?? (membership === undefined ? 'native-subagent-membership-unestablished' : null) }
  }
  /** Monotone count-state revision so a cached snapshot cannot mask an item or a count change. */
  revision(ownerSessionId: string): number {
    return this.#revisions.get(String(ownerSessionId)) ?? 0
  }
  status(agent: Agent, status: 'idle' | 'running'): void {
    if (agent.session.header.origin !== 'subagent') return
    const sessionId = String(agent.id)
    for (const owner of this.#ownersFor(sessionId, agent)) {
      const ledger = this.#ledgers.get(owner)
      if (ledger === undefined) continue
      const run = ledger.runs.get(sessionId)
      if (status === 'running') {
        // Running again is a new activation: any open item is resolved by the existing clearing path.
        if (run !== undefined) { run.counted = true; run.sawIdle = false; run.settle = null }
        this.#activate(ledger, sessionId)
        this.#closeSessionStops(owner, ledger, sessionId)
        this.#reconcileSoon(owner, sessionId)
      } else if (run !== undefined) run.sawIdle = true
    }
  }
  /** Known member: reconcile now. Unknown id: walk first, then reconcile under the new membership. */
  created(agent: Agent): void {
    if (agent.session.header.origin !== 'subagent') return
    const sessionId = String(agent.id)
    for (const owner of this.#ownersFor(sessionId, agent)) {
      if (this.#ledgers.get(owner) === undefined) continue
      if (this.#members.get(owner)?.ids.has(sessionId) === true) this.#reconcileSoon(owner, sessionId)
      else this.#afterWalk(owner, () => this.#reconcileSoon(owner, sessionId))
    }
  }
  disposed(agent: Agent): void {
    if (agent.session.header.origin !== 'subagent') return
    const sessionId = String(agent.id), owners = this.#ownersFor(sessionId, agent)
    for (const owner of this.#idOwners.get(sessionId) ?? []) {
      const ledger = this.#ledgers.get(owner), run = ledger?.runs.get(sessionId) ?? ledger?.terminalRuns.get(sessionId)
      if (run?.agent?.deref() === agent && this.#liveAgent(sessionId) === undefined) run.disposed = true
    }
    // Disposal IDs may request discovery after registry removal, never authorize new run
    // edges. Reconciliation rechecks catalog coverage and the recorded incarnation itself.
    for (const owner of this.#idOwners.get(sessionId) ?? []) owners.add(owner)
    for (const owner of owners) {
      if (this.#ledgers.get(owner) === undefined) continue
      // agent/disposed is a membership-change node: re-walk before deciding whether a run is lost.
      this.#afterWalk(owner, () => this.#reconcile(owner))
    }
    // The reverse id index is kept: a late subagent/end may arrive after disposal with no live
    // Agent to supply the parent chain, and routing must not depend on the Agent still existing.
  }
  start(sessionId: string, local: boolean, agent?: Agent, runId?: string): void {
    if (local && this.#idOwners.has(sessionId)) this.#startEpochs.set(sessionId, (this.#startEpochs.get(sessionId) ?? 0) + 1)
    const owners = local && agent === undefined ? new Set<string>() : this.#ownersFor(sessionId, agent)
    // Even a rejected/Agent-absent start is a synchronous boundary: it cannot associate
    // a new runId with an older count-only baseline, before any deferred reconciliation.
    if (local) for (const owner of this.#idOwners.get(sessionId) ?? []) {
      const ledger = this.#ledgers.get(owner)
      for (const run of [ledger?.runs.get(sessionId), ledger?.terminalRuns.get(sessionId)]) {
        if (run !== undefined && (!owners.has(owner) || run.agent?.deref() !== agent)) run.displaced = true
      }
    }
    if (local && (agent === undefined || this.#liveAgent(sessionId) !== agent)) return
    for (const owner of owners) {
      const ledger = this.#ledgers.get(owner)
      if (ledger === undefined) continue
      if (local) {
        const run = ledger.runs.get(sessionId) ?? { counted: false, sawIdle: false, runId: null, agent: null, displaced: false, disposed: false, legacySource: null, settle: null }
        run.sawIdle = false
        run.agent = agent === undefined ? null : new WeakRef(agent)
        run.displaced = false
        run.disposed = false
        run.legacySource = this.#legacySource()
        run.settle = null
        if (runId !== undefined) run.runId = runId
        this.#activate(ledger, sessionId)
        this.#closeSessionStops(owner, ledger, sessionId)
        ledger.runs.set(sessionId, run)
        const owners = this.#idOwners.get(sessionId) ?? new Set<string>()
        owners.add(owner); this.#idOwners.set(sessionId, owners)
      }
      if (this.#members.get(owner)?.ids.has(sessionId) === true) this.#reconcileSoon(owner, sessionId)
      else this.#afterWalk(owner, () => this.#reconcileSoon(owner, sessionId))
    }
  }
  /**
   * Primary outcome edge. The published `stopReason` is used directly; a non-`completed` reason
   * opens one item after this child's own log supplied the turn/cause/failure detail. A late end
   * also clears any open item for the same child through the existing clearing path.
   */
  end(sessionId: string, local: boolean, agent?: Agent, stopReason?: string, runId?: string): void {
    const currentOwners = this.#ownersFor(sessionId, agent), owners = new Set(currentOwners)
    // A terminal edge can arrive after the registry already holds another incarnation.
    // Only an observed matching start runId, not a reverse session ID, restores that old route.
    if (runId !== undefined) for (const owner of this.#idOwners.get(sessionId) ?? []) {
      const ledger = this.#ledgers.get(owner)
      if ((ledger?.runs.get(sessionId) ?? ledger?.terminalRuns.get(sessionId))?.runId === runId) owners.add(owner)
    }
    for (const owner of owners) {
      const ledger = this.#ledgers.get(owner)
      if (ledger === undefined) continue
      const activeRun = ledger.runs.get(sessionId), run = activeRun ?? ledger.terminalRuns.get(sessionId)
      if (agent === undefined && !(runId !== undefined && run?.runId === runId)
        && (run?.disposed !== true || run.displaced)) continue
      if (runId !== undefined && activeRun === undefined) {
        const stops = [...ledger.stops.values()].filter(item => item.sessionId === sessionId)
        if (stops.some(item => item.itemId !== this.#itemId(sessionId, null, item.turn)
          && item.itemId !== this.#itemId(sessionId, runId, item.turn))) continue
        if (stops.some(item => item.itemId === this.#itemId(sessionId, runId, item.turn) && item.outcome === stopReason)) continue
      }
      if (run?.displaced === true && (runId === undefined || run.runId !== runId)) continue
      // An old end never retires, clears or classifies a different observed activation.
      if (runId !== undefined && run?.runId !== undefined && run.runId !== null && run.runId !== runId) continue
      const hostRunId = runId ?? run?.runId ?? null
      const source = run ?? { counted: false, sawIdle: false, runId: hostRunId, agent: agent === undefined ? null : new WeakRef(agent),
        displaced: false, disposed: false, legacySource: this.#legacySource(), settle: null }
      source.runId = hostRunId
      // A matching historical run keeps its published outcome, never a replacement's turn tail.
      const observeTurn = currentOwners.has(owner) && run?.displaced !== true
        && (agent === undefined || run === undefined || run.agent?.deref() === agent)
      if (run !== undefined) { run.settle = null; ledger.runs.delete(sessionId) }
      this.#closeSessionStops(owner, ledger, sessionId)
      if (this.#members.get(owner)?.ids.has(sessionId) === true) this.#reconcileSoon(owner)
      else this.#afterWalk(owner, () => this.#reconcile(owner))
      if (!local || stopReason === undefined || stopReason === 'completed') continue
      const generation = this.#generation(ledger, sessionId)
      const currentSource = this.#turnSource(owner, sessionId, source, observeTurn)
      void this.#serial(owner, () => this.#classifyEnd(owner, sessionId, hostRunId, stopReason, generation, currentSource, source)).catch(() => undefined)
    }
  }
  catalog(sessionId: string, childId: string | undefined): void {
    // `subagent/catalog` means the parent's durable membership changed: always re-walk first.
    void childId
    for (const owner of this.#ownersFor(sessionId)) {
      if (this.#ledgers.get(owner) === undefined) continue
      this.#afterWalk(owner, () => this.#reconcile(owner))
    }
  }
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
  | { readonly kind: 'native-stop'; readonly ownerSessionId: string; readonly item: NativeSubagentStop }
) & { readonly actualAgent?: Agent }

/** The core is supplied by the package composition, not fabricated by this adapter. */
export interface RuntimeFacade {
  /** Plugin-only read permit: callback must perform only model reads. Holds permission ordering through encoding. */
  withModelRead?<T>(caller: HostCaller, sessionId: string, signal: AbortSignal, effect: () => Promise<T>): Promise<T>
  /** Small model-only side-effect diagnostics attached by result identity; Remote results stay complete and unchanged. */
  modelMutationOutcome?(result: unknown): { readonly historyCapture: { readonly status: 'recorded' | 'failed'; readonly diagnostic: string | null } } | null
  /** Required production model-only reads. Missing capability is an explicit error, never full-read fallback. */
  readModelIdentity?(caller: HostCaller, sessionId: string, signal: AbortSignal): Promise<import('./model-tools.js').ModelIdentity>
  readModelCurrent?(caller: HostCaller, sessionId: string, signal: AbortSignal): Promise<import('./model-tools.js').ModelCurrent>
  readModelSource?(caller: HostCaller, sessionId: string, selector: { readonly domain: string; readonly key: string }, signal: AbortSignal): Promise<{ readonly identity: import('./model-tools.js').ModelIdentity; readonly source: import('./model-tools.js').ModelSource | null }>
  readPolicy(caller: HostCaller, signal: AbortSignal): Promise<PolicySnapshot>
  savePolicy(caller: HostCaller, intent: PolicyIntent, expectedRevision: number, signal: AbortSignal): Promise<PolicySnapshot>
  readOwnerDecisionPolicy?(caller: HostCaller, sessionId: string, signal: AbortSignal): Promise<OwnerDecisionPolicySnapshot>
  saveOwnerDecisionPolicy?(caller: HostCaller, sessionId: string, request: OwnerDecisionPolicySaveRequest, signal: AbortSignal): Promise<OwnerDecisionPolicySaveResult>
  readSession(caller: HostCaller, sessionId: string, signal: AbortSignal): Promise<unknown>
  readSummaries(caller: HostCaller, request: SessionSummaryRequest, signal: AbortSignal): Promise<SessionSummaryBatch>
  applyInstrument(caller: HostCaller, sessionId: string, command: InstrumentCommand, signal: AbortSignal): Promise<unknown>
  applyTicketWindow(caller: HostCaller, sessionId: string, command: TicketWindowCommand, signal: AbortSignal): Promise<unknown>
  resourceAction(caller: HostCaller, sessionId: string, request: ResourceAction, signal: AbortSignal): Promise<unknown>
  historyAction?(caller: HostCaller, sessionId: string, input: HostJson, signal: AbortSignal): Promise<unknown>
  worktreeAction?(caller: HostCaller, sessionId: string, input: HostJson, signal: AbortSignal): Promise<unknown>
  delegate?(caller: HostCaller, input: HostJson, exec: ToolRunContext): Promise<unknown>
  /** Trusted launch configuration for the model-facing guidance; the runtime stores no cwd inference. */
  setDelegateRegistered?(registered: boolean): void
  created(caller: HostCaller, signal: AbortSignal, actualAgent: Agent): Promise<void>
  observe(event: HostEvent): Promise<void>
  /** Admitted-step consumption; must return freshly owned, attributed messages. `stepKey` identifies
   * the admitted model step (turn:step), so one step's repeated assembly passes stay one delivery step. */
  preStep(caller: HostCaller, signal: AbortSignal, acceptedMessages?: readonly UserMessage[], stepKey?: string): Promise<readonly UserMessage[]>
  postExecute?(caller: HostCaller, exec: ToolExecution, result: Readonly<ToolExecutionResult>, stepKey?: string): Promise<readonly UserMessage[]>
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
  gitRunnerForSession(sessionId: string, signal: AbortSignal): AuthorizedGitRunner
  makeSnapshotMessage(text: string): UserMessage
  /** Program-only proof on the exact live model surface; preparation/log existence is not visibility. */
  snapshotVisible?(caller: HostCaller, actualAgent: Agent, message: UserMessage): boolean
  notifyOwner(input: OwnerNotificationInput, signal: AbortSignal): Promise<OwnerNotificationResult>
  /** Technical scope preflight before runtime records intent; creates no native child or durable facts. */
  authorizeInitialChildCwd?(exec: ToolRunContext, cwd: string): Promise<void>
  /** Returns native inbox acceptance only; runtime verifies actual session facts separately. */
  createContinuable?(exec: ToolRunContext, request: ContinuableChildRequest): Promise<{ readonly childId: string; readonly messageId: string }>
  installNativeGuard(guard: ToolGuard): () => void
  installManagedGuard(guard: ToolGuard): () => void
  liveAgent(sessionId: string): Agent | undefined
  liveAgents(): readonly Agent[]
  nativeActivity(sessionId: string): Promise<{ readonly known: boolean; readonly reason: string | null; readonly liveAgents: readonly Agent[] }>
  /** Native host descendant activity for one owner session; the projected S count source. */
  nativeSubagentActivity(ownerSessionId: string, signal?: AbortSignal): Promise<NativeSubagentActivity>
  /** Node-reconciliation drifts for one owner; mechanical evidence, never a count source. */
  nativeSubagentDrift(ownerSessionId: string): readonly NativeCountDrift[]
  /** Open terminal-outcome items for one owner; the snapshot items the main agent must handle. */
  nativeSubagentStops(ownerSessionId: string): readonly NativeSubagentStop[]
  /** Monotone native-count state revision; part of snapshot freshness, never a count. */
  nativeSubagentCountRevision(ownerSessionId: string): number
  /** Optional synchronous freshness proof. Missing membership coverage conservatively disables projection reuse. */
  nativeSubagentCountState?(ownerSessionId: string): { readonly revision: number; readonly known: boolean; readonly reason: string | null; readonly available: boolean; readonly memberSessionIds?: readonly string[]; readonly liveMembershipToken?: string }
  openRuntimeStorage<T extends { readonly revision: number }>(parse: (value: unknown) => T): Promise<VersionedStorage<T>>
  openUnitStorage<T extends { readonly revision: number }>(suffix: string, parse: (value: unknown) => T): Promise<VersionedStorage<T>>
  readPolicyGrants(): Promise<PolicyGrants>
  sessionFacts(sessionId: string, signal?: AbortSignal): Promise<SessionFacts>
  /** Native acceptance/live facts are not durability; false never certifies persistence. */
  flushSession?(sessionId: string, signal: AbortSignal): Promise<boolean>
  /** Authority checks are repeated at effect boundaries; never wire-supplied principals. */
  authorizeCaller(caller: HostCaller, sessionId?: string, signal?: AbortSignal): Promise<void>
}
export interface HostOptions {
  createRuntime(ports: HostPorts): Promise<RuntimeFacade>
  /** Opt in to the binding-first delegate creation tool; omitted means disabled. */
  readonly delegate?: boolean
  /** Notified after a saved policy change so derived caches can be refreshed. */
  readonly onPolicyChanged?: () => void
}
export interface HostMount {
  /** Workspace-scoped Skill delivery gate; unavailable policy keeps skills on. */
  readonly skillsEnabledForCwd: (cwd: string | undefined) => Promise<boolean>
  readonly service: MattPocockControlsService; readonly ports: HostPorts; dispose(): Promise<void> }

function deny(message: string): never { throw new ControlsError('access-denied', message) }
/** The owner-principal Peer shape both connection generations share; only its id names the operator. */
export interface ConnectionOperatorPeer { readonly id: string }
/** One generation's spelling of the operator Peer on the connection service. */
interface ConnectionOperatorView {
  /** 0.2.1-alpha.1 and alpha.2: the admitted operator Peer itself. */
  readonly operator?: ConnectionOperatorPeer
  /** 0.2.1-alpha.3 and later: the owner Peer every authenticated browser request speaks for. */
  readonly browserPeer?: ConnectionOperatorPeer
}
/**
 * Resolve the connection service's operator Peer without pinning one host generation.
 * alpha.3 replaced `connection.operator` with `connection.browserPeer`; both carry the
 * per-process owner identity that `invocation.peer.id` is matched against, so authorization
 * keeps working and a host exposing neither fails closed with a diagnosable code.
 */
export function connectionOperatorPeer(ctx: Context): ConnectionOperatorPeer {
  const connection = ctx.connection as unknown as ConnectionOperatorView
  const peer = connection.operator ?? connection.browserPeer
  if (peer === undefined || typeof peer.id !== 'string' || peer.id.length === 0)
    throw new ControlsError('feature-disabled', 'this host exposes no operator Peer on the connection service')
  return peer
}
export function operatorCaller(ctx: Context): HostCaller {
  const invocation = ctx.invocation
  const operator = connectionOperatorPeer(ctx)
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
  return classifySessionIdentity(h, foldSubagentDescriptor(facts.events) !== undefined, retained)
}

/** Compact classification is deliberately separate from full public event facts. */
function classifySessionIdentity(h: SessionHeader, hasDescriptor: boolean, retained?: TrustedSession): 'owner' | TrustedSession | undefined {
  if (h.origin !== 'subagent') return retained?.kind === 'managed-child' ? undefined : 'owner'
  if (!h.parentSession) return undefined
  if (!hasDescriptor && !(retained?.kind === 'managed-child' && retained.parentSessionId === h.parentSession)) return undefined
  if (retained?.kind === 'owner' || retained?.kind === 'managed-child' && retained.parentSessionId !== h.parentSession) return undefined
  return freeze({ kind: 'managed-child', parentSessionId: h.parentSession })
}

export function createHostAuthority(ctx: Context, storage: ControlsStorage, grants: VersionedStorage<PolicyGrants>): {
  readonly authority: ControlsAuthority; readonly sessionFacts: HostPorts['sessionFacts']; readonly authorizeCaller: HostPorts['authorizeCaller']; readonly operatorPrincipal: string
} {
  const operatorPrincipal = 'user:' + id(connectionOperatorPeer(ctx).id, 'operator id')
  // Only compact, verified classification is retained. Public sessionFacts never pins logs.
  // Tokens are host capabilities, not a version-string or TTL assertion.
  const IDENTITY_CACHE_MAX = 64
  const EMPTY_EVENTS: readonly SessionEvent[] = Object.freeze([])
  interface IdentityFacts { readonly header: SessionHeader; readonly hasDescriptor: boolean }
  interface StoredSnapshot { readonly header: SessionHeader; readonly revision?: unknown }
  interface StoredSessionStat {
    readonly identity?: unknown
    stat(id: SessionId, options?: { readonly signal?: AbortSignal }): Promise<StoredSnapshot | undefined>
  }
  interface ColdIdentity { readonly persistence: symbol; readonly revision: string; readonly fingerprint: string; readonly facts: IdentityFacts }
  const coldIdentities = new Map<string, ColdIdentity>()
  interface LiveIdentity {
    readonly session: WeakRef<Agent['session']>; readonly agent: WeakRef<Agent> | undefined
    readonly seq: number; readonly fingerprint: string; readonly facts: IdentityFacts
  }
  const liveIdentities = new Map<string, LiveIdentity>()
  const persistencePort = (): StoredSessionStat | undefined => typeof ctx.get === 'function' ? ctx.get('sessionPersistence') as StoredSessionStat | undefined : undefined
  const fingerprint = (h: SessionHeader): string => JSON.stringify([h.id, h.origin, h.parentSession, h.createdAt, h.cwd, h.isSeeded, h.version])
  const checkedHeader = (sessionId: string, header: SessionHeader): SessionHeader => {
    if (header.id !== sessionId) deny('session source returned conflicting identity')
    return Object.freeze({ ...header })
  }
  const liveSource = (sessionId: SessionId): Agent['session'] | undefined => {
    const agent = ctx.agents.get(sessionId)
    const sessions = typeof ctx.get === 'function' ? ctx.get('sessions') : undefined
    const session = typeof sessions?.get === 'function' ? sessions.get(sessionId) : undefined
    if (agent !== undefined && session !== undefined && agent.session !== session) deny('live Session and Agent identity conflict')
    return session ?? agent?.session
  }
  const storedSnapshot = async (sessionId: SessionId, signal?: AbortSignal): Promise<StoredSnapshot | undefined> => {
    signal?.throwIfAborted()
    const persistence = persistencePort()
    if (typeof persistence?.stat !== 'function') return undefined
    const snapshot = await persistence.stat(sessionId, signal === undefined ? undefined : { signal }).catch(error => { signal?.throwIfAborted(); throw error })
    signal?.throwIfAborted()
    if (snapshot !== undefined) checkedHeader(sessionId, snapshot.header)
    return snapshot
  }
  const sessionHeaderFacts = async (raw: string, signal?: AbortSignal): Promise<SessionFacts> => {
    const sessionId = SessionId(id(raw, 'sessionId'))
    signal?.throwIfAborted()
    const live = liveSource(sessionId)
    if (live !== undefined) {
      coldIdentities.delete(sessionId)
      return Object.freeze({ header: checkedHeader(sessionId, live.header), events: EMPTY_EVENTS, live: true })
    }
    const snapshot = await storedSnapshot(sessionId, signal)
    signal?.throwIfAborted()
    if (snapshot !== undefined) return Object.freeze({ header: checkedHeader(sessionId, snapshot.header), events: EMPTY_EVENTS, live: false })
    const observation = await ctx.sessionQuery.observeSession(sessionId, { ...(signal ? { signal } : {}), projectionMode: 'none' }).catch(error => { signal?.throwIfAborted(); throw error })
    try {
      signal?.throwIfAborted()
      return Object.freeze({ header: checkedHeader(sessionId, observation.header), events: EMPTY_EVENTS, live: observation.source === 'live' })
    } finally { observation[Symbol.dispose]() }
  }
  const sessionFacts = async (raw: string, signal?: AbortSignal): Promise<SessionFacts> => {
    const sessionId = SessionId(id(raw, 'sessionId'))
    const facts = await sessionHeaderFacts(raw, signal)
    signal?.throwIfAborted()
    if (facts.header.origin !== 'subagent') return facts
    const live = liveSource(sessionId)
    if (live !== undefined) return Object.freeze({ header: checkedHeader(sessionId, live.header), events: Object.freeze(live.ownEvents()), live: true })
    const observation = await ctx.sessionQuery.observeSession(sessionId, { ...(signal ? { signal } : {}), projectionMode: 'none' }).catch(error => { signal?.throwIfAborted(); throw error })
    try {
      signal?.throwIfAborted()
      return freeze({ header: checkedHeader(sessionId, observation.header), events: observation.events.slice(observation.inheritedEventCount), live: observation.source === 'live' })
    } finally { observation[Symbol.dispose]() }
  }
  const sessionIdentity = async (raw: string, signal?: AbortSignal): Promise<IdentityFacts> => {
    signal?.throwIfAborted()
    const sessionId = SessionId(id(raw, 'sessionId'))
    const live = liveSource(sessionId)
    if (live !== undefined) {
      coldIdentities.delete(sessionId)
      const header = checkedHeader(sessionId, live.header), key = fingerprint(header)
      const agent = ctx.agents.get(sessionId), seq = live.seq
      const cached = liveIdentities.get(sessionId)
      // The public Session class owns an immutable append-only log, and the first OWN
      // descriptor is authoritative. Only a successfully folded positive fact survives
      // later appends on that exact host Session. Session-like adapters, absence and
      // unsupported descriptors retain the exact-generation fallback below.
      if (Number.isSafeInteger(seq) && seq >= 0 && cached?.session.deref() === live && (cached.agent === undefined ? agent === undefined : agent !== undefined && cached.agent.deref() === agent) && (cached.seq === seq || live instanceof Session && cached.facts.hasDescriptor && seq > cached.seq) && cached.fingerprint === key) return cached.facts
      liveIdentities.delete(sessionId)
      const facts = Object.freeze({ header, hasDescriptor: header.origin === 'subagent' && !!header.parentSession && foldSubagentDescriptor(live.ownEvents()) !== undefined })
      if (Number.isSafeInteger(seq) && seq >= 0) {
        // Weak references prevent this compact cache from pinning an otherwise disposed
        // Session/Agent (and indirectly its whole event log).
        liveIdentities.set(sessionId, { session: new WeakRef(live), agent: agent === undefined ? undefined : new WeakRef(agent), seq, fingerprint: key, facts })
        while (liveIdentities.size > IDENTITY_CACHE_MAX) liveIdentities.delete(liveIdentities.keys().next().value as string)
      }
      return facts
    }
    liveIdentities.delete(sessionId)
    const persistence = persistencePort(), identity = persistence?.identity
    const snapshot = await storedSnapshot(sessionId, signal)
    signal?.throwIfAborted()
    if (persistencePort()?.identity !== identity || liveSource(sessionId) !== undefined) deny('session source changed during identity stat')
    const sourceRevision = snapshot?.revision
    const key = snapshot === undefined ? undefined : fingerprint(snapshot.header)
    const cached = coldIdentities.get(sessionId)
    if (snapshot !== undefined && typeof identity === 'symbol' && typeof sourceRevision === 'string' && sourceRevision.length > 0 && cached?.persistence === identity && cached.revision === sourceRevision && cached.fingerprint === key) return cached.facts
    coldIdentities.delete(sessionId)
    // Owner classification needs no log. A child always folds its current OWN descriptor
    // at least once; retained associations can never hide a malformed current descriptor.
    if (snapshot !== undefined && snapshot.header.origin !== 'subagent') return { header: checkedHeader(sessionId, snapshot.header), hasDescriptor: false }
    signal?.throwIfAborted()
    const observation = await ctx.sessionQuery.observeSession(sessionId, { ...(signal ? { signal } : {}), projectionMode: 'none' }).catch(error => { signal?.throwIfAborted(); throw error })
    try {
      signal?.throwIfAborted()
      const header = checkedHeader(sessionId, observation.header)
      if (snapshot !== undefined && fingerprint(header) !== key) deny('stored header conflicts with observed session identity')
      const facts = Object.freeze({ header, hasDescriptor: header.origin === 'subagent' && !!header.parentSession && foldSubagentDescriptor(observation.events.slice(observation.inheritedEventCount)) !== undefined })
      // Reuse requires a source revision for the exact prepared cut. Compositions
      // lacking this proof intentionally pay the conservative observation cost.
      const observed = observation as typeof observation & { readonly revision?: unknown; readonly source?: string }
      if (typeof sourceRevision === 'string' && observed.revision !== undefined && observed.revision !== sourceRevision) deny('observed session source revision conflicts with current stat')
      if (snapshot !== undefined && typeof identity === 'symbol' && typeof sourceRevision === 'string' && sourceRevision.length > 0 && observed.source === 'prepared' && observed.revision === sourceRevision && fingerprint(header) === key) {
        const after = await storedSnapshot(sessionId, signal)
        if (persistencePort()?.identity !== identity || after?.revision !== sourceRevision || fingerprint(after.header) !== key || liveSource(sessionId) !== undefined) deny('session source changed while verifying identity')
        coldIdentities.set(sessionId, { persistence: identity, revision: sourceRevision, fingerprint: key, facts })
        while (coldIdentities.size > IDENTITY_CACHE_MAX) coldIdentities.delete(coldIdentities.keys().next().value as string)
      }
      return facts
    } finally { observation[Symbol.dispose]() }
  }
  const resolveSession = async (sessionId: string, signal?: AbortSignal): Promise<TrustedSession | undefined> => {
    const facts = await sessionIdentity(sessionId, signal)
    signal?.throwIfAborted()
    const document = await storage.read().catch(error => { signal?.throwIfAborted(); throw error })
    signal?.throwIfAborted()
    const saved = document === undefined ? undefined : memoized(document, parseControlsDocument)
    const association = saved?.associations.find(row => row.sessionId === sessionId)
    const instance = association && saved?.instances.find(row => row.instrumentInstanceId === association.instrumentInstanceId)
    const retained: TrustedSession | undefined = association && instance
      ? association.parentSessionId === null ? { kind: 'owner', controlWorkspaceId: instance.controlWorkspaceId }
        : { kind: 'managed-child', parentSessionId: association.parentSessionId } : undefined
    const classified = classifySessionIdentity(facts.header, facts.hasDescriptor, retained)
    if (classified !== 'owner') return classified
    if (retained?.kind === 'owner') return retained
    if (facts.header.cwd === undefined) return undefined
    const workspace = await ctx.workspaceRegistry.resolveByPath(facts.header.cwd)
    signal?.throwIfAborted()
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
    async authorizeSession(principal, sessionId, _access, signal) {
      signal?.throwIfAborted()
      authenticate(principal)
      if (principal !== operatorPrincipal && principal !== 'agent:' + sessionId) deny('agent cannot address another session as its own')
      await sessionHeaderFacts(sessionId, signal)
    },
    resolveSession,
    async verifyWorkspace(workspaceId, signal) {
      signal?.throwIfAborted()
      const row = ctx.workspaceRegistry.get(WorkspaceId(id(workspaceId, 'workspaceId')))
      const status = row === undefined ? undefined : await row.status().catch(error => { signal?.throwIfAborted(); throw error })
      signal?.throwIfAborted(); return status === 'ok'
    },
  }
  const authorizeCaller: HostPorts['authorizeCaller'] = async (caller, sessionId, signal) => {
    signal?.throwIfAborted()
    if (caller.kind === 'user') { if (caller.principalId !== operatorPrincipal || caller.sessionId !== null) deny('invalid operator caller') }
    else if (caller.sessionId === null || caller.principalId !== 'agent:' + caller.sessionId) deny('invalid actual agent caller')
    authenticate(caller.principalId)
    if (sessionId !== undefined) await authority.authorizeSession(caller.principalId, id(sessionId, 'sessionId'), 'read', signal)
  }
  return { authority, sessionFacts, authorizeCaller, operatorPrincipal }
}

/** A source-mode binding plus a strict descriptor contribution; no monkeypatch. */
export class MattPocockControlsService extends TypertRemoteService {
  private readonly sessionRepresentation = createHostJsonRepresentation()
  constructor(ctx: Context, private readonly runtime: RuntimeFacade, private readonly ports: HostPorts,
    private readonly grants: VersionedStorage<PolicyGrants>, private readonly supervision: VersionedStorage<SupervisionConfigSnapshot>,
    private readonly lifecycle: { readonly signal: AbortSignal; track<T>(work: () => Promise<T>): Promise<T>; readonly onPolicyChanged?: () => void; readonly onSupervisionChanged?: (snapshot: SupervisionConfigSnapshot) => void }) { super(ctx, REMOTE_NAMESPACE) }
  private run<T>(operation: (caller: HostCaller, signal: AbortSignal) => Promise<T>, suppliedSignal?: AbortSignal): Promise<T> {
    const caller = operatorCaller(this.ctx)
    this.lifecycle.signal.throwIfAborted()
    const signal = AbortSignal.any([this.ctx.invocation!.signal, this.lifecycle.signal, ...(suppliedSignal ? [suppliedSignal] : [])])
    return this.lifecycle.track(() => operation(caller, signal))
  }
  readPolicy(): Promise<PolicySnapshot> { return this.run(async (caller, signal) => parsePolicySnapshot(await this.runtime.readPolicy(caller, signal))) }
  readSupervisionConfig(): Promise<SupervisionConfigSnapshot> {
    return this.run(async () => {
      const raw = await this.supervision.read()
      return raw === undefined ? INITIAL_SUPERVISION_CONFIG : parseSupervisionConfigSnapshot(raw)
    })
  }
  saveSupervisionConfig(intent: unknown, expectedRevision: unknown): Promise<SupervisionConfigSnapshot> {
    return this.run(async (_caller, signal) => {
      const parsed = parseSupervisionConfigIntent(intent), expected = revision(expectedRevision, 'expectedRevision')
      const store = this.supervision, raw = await store.read()
      const current = raw === undefined ? INITIAL_SUPERVISION_CONFIG : parseSupervisionConfigSnapshot(raw)
      if (current.revision !== expected) throw new ControlsError('revision-conflict', 'supervision configuration changed; reload the saved revision')
      if (JSON.stringify({ defaults: current.defaults, workspaceOverrides: current.workspaceOverrides }) === JSON.stringify(parsed)) return current
      signal.throwIfAborted()
      const next = parseSupervisionConfigSnapshot({ schemaVersion: 1, revision: increment(expected), ...parsed })
      if (!await store.compareAndSwap(expected, next)) throw new ControlsError('revision-conflict', 'supervision configuration changed; reload the saved revision')
      try { this.lifecycle.onSupervisionChanged?.(next) } catch { /* configuration is saved; tool registration failure must not report a false write failure */ }
      return next
    })
  }
  readSupervision(sessionId: unknown): Promise<HostJson> {
    return this.run(async (caller, signal) => {
      const sid = id(sessionId, 'sessionId')
      await this.ports.authorizeCaller(caller, sid); signal.throwIfAborted()
      const view = await this.runtime.readSession(caller, sid, signal) as RuntimeSnapshot
      const store = await this.ports.openUnitStorage('supervision_state_' + createHash('sha256').update(view.instance.ownerSessionId).digest('hex').slice(0, 32), parseSupervisionDocument)
      const raw = await store.read()
      return raw === undefined ? null : parseHostJson(raw)
    })
  }
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
    const sid = id(sessionId, 'sessionId'); await this.ports.authorizeCaller(caller, sid, signal); signal.throwIfAborted()
    const snapshot = await this.runtime.readSession(caller, sid, signal)
    signal.throwIfAborted()
    return this.sessionRepresentation(snapshot)
  }, suppliedSignal) }
  readSummaries(request: unknown, suppliedSignal?: AbortSignal): Promise<SessionSummaryBatch> {
    const parsed=parseSessionSummaryRequest(request)
    return this.run(async (caller,signal)=>{
      await this.ports.authorizeCaller(caller,undefined,signal);signal.throwIfAborted()
      return parseSessionSummaryBatch(await this.runtime.readSummaries(caller,parsed,signal))
    },suppliedSignal)
  }
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


/** Independent optional namespace: old server/client base descriptors are unchanged. */
export class MattPocockRecommendationSupportService extends TypertRemoteService {
  constructor(ctx: Context, private readonly runtime: RuntimeFacade, private readonly ports: HostPorts,
    private readonly lifecycle: { readonly signal: AbortSignal; track<T>(work: () => Promise<T>): Promise<T> }) { super(ctx, RECOMMENDATION_REMOTE_NAMESPACE) }
  private run<T>(operation: (caller: HostCaller, signal: AbortSignal) => Promise<T>, suppliedSignal?: AbortSignal): Promise<T> {
    const caller = operatorCaller(this.ctx)
    this.lifecycle.signal.throwIfAborted()
    const signal = AbortSignal.any([this.ctx.invocation!.signal, this.lifecycle.signal, ...(suppliedSignal ? [suppliedSignal] : [])])
    return this.lifecycle.track(() => operation(caller, signal))
  }
  readOwnerDecisionPolicy(sessionId: unknown, suppliedSignal?: AbortSignal): Promise<OwnerDecisionPolicySnapshot> {
    return this.run(async (caller, signal) => {
      const sid = id(sessionId, 'sessionId')
      await this.ports.authorizeCaller(caller, sid); signal.throwIfAborted()
      if (!this.runtime.readOwnerDecisionPolicy) throw new ControlsError('feature-disabled', 'owner recommendation policy is unsupported by this runtime')
      return parseOwnerDecisionPolicySnapshot(await this.runtime.readOwnerDecisionPolicy(caller, sid, signal))
    }, suppliedSignal)
  }
  saveOwnerDecisionPolicy(sessionId: unknown, request: unknown): Promise<OwnerDecisionPolicySaveResult> {
    return this.run(async (caller, signal) => {
      const sid = id(sessionId, 'sessionId'), parsed = parseOwnerDecisionPolicySaveRequest(request)
      await this.ports.authorizeCaller(caller, sid); signal.throwIfAborted()
      if (!this.runtime.saveOwnerDecisionPolicy) throw new ControlsError('feature-disabled', 'owner recommendation policy is unsupported by this runtime')
      return parseOwnerDecisionPolicySaveResult(await this.runtime.saveOwnerDecisionPolicy(caller, sid, parsed, signal))
    })
  }
}
export function recommendationHostRemoteContribution(): TypertContribution {
  return { package: RECOMMENDATION_REMOTE_CONTRIBUTION.package, face: 'host', schemas: [], model: { services: [], events: [], objects: [] }, invocations: RECOMMENDATION_REMOTE_CONTRIBUTION.descriptors }
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
      if (closing) throw new ControlsError('access-denied', 'host is disposing')
      const domain = await ctx.storageDomain.open(defineDomain({ name: 'mattpocock_' + name, version: 1, tables: { records: domainTable<string, T>(z.unknown().transform(parse)) } }))
      // A lazy open may finish while the host is already disposing; never leak the handle.
      if (closing) { await domain.close(); throw new ControlsError('access-denied', 'host is disposing') }
      domains.push(domain); return domain.table('records')
    }
    const controlsStorage = createDomainControlsStorage(await open('controls', parseControlsDocument))
    const supervisionStorage = createDomainVersionedStorage(await open('supervision_config', parseSupervisionConfigDocument), 'state', parseSupervisionConfigDocument)
    let supervisionSnapshot: SupervisionConfigSnapshot = INITIAL_SUPERVISION_CONFIG
    try {
      const raw = await supervisionStorage.read()
      if (raw !== undefined) supervisionSnapshot = parseSupervisionConfigSnapshot(raw)
    } catch (error) {
      ctx.logger('mattpocock-controls').warn('supervision configuration unavailable; audit remains off', error)
    }
    // The multi-row instruments/windows domains validate every stored record on open. They are
    // not needed to mount: the first session read opens them, so startup pays only the
    // documents every mount actually needs (controls and supervision configuration).
    let instrumentOpening: Promise<InstrumentStorage> | undefined
    const instrumentStorage: InstrumentStorage = {
      read: async id => (await (instrumentOpening ??= open('instruments', parseInstrumentDocument).then(createDomainInstrumentStorage))).read(id),
      compareAndSwap: async (id, expectedRevision, next) => (await (instrumentOpening ??= open('instruments', parseInstrumentDocument).then(createDomainInstrumentStorage))).compareAndSwap(id, expectedRevision, next),
    }
    let windowOpening: Promise<WindowStorage> | undefined
    const windowStorage: WindowStorage = {
      read: async id => (await (windowOpening ??= open('windows', parseWindowDocument).then(createDomainWindowStorage))).read(id),
      compareAndSwap: async (id, expectedRevision, next) => (await (windowOpening ??= open('windows', parseWindowDocument).then(createDomainWindowStorage))).compareAndSwap(id, expectedRevision, next),
    }
    let resourceOpening: Promise<ResourceStorage> | undefined
    const resourceStorage: ResourceStorage = {
      read: async () => (await (resourceOpening ??= open('resources', parseResourceDocument).then(createDomainResourceStorage))).read(),
      compareAndSwap: async (expectedRevision, next) => (await (resourceOpening ??= open('resources', parseResourceDocument).then(createDomainResourceStorage))).compareAndSwap(expectedRevision, next),
    }
    const grants = createDomainVersionedStorage(await open('policy_grants', parsePolicyGrants), 'state', parsePolicyGrants)
    const identity = createHostAuthority(ctx, controlsStorage, grants)
    // One event-driven count per mount: membership walks happen only at membership-change
    // nodes, so the panel/tool read path is O(live agents) with no catalog IO.
    let forwardNativeStop: (event: NativeSubagentStopEvent) => void = () => {}
    // The reconciliation path reads ONLY the suspect child's own log. A live child's owned events
    // are already in memory; a cold child is observed through the public session query, never
    // resumed, and is never walked as a tree.
    const readNativeTurn: NativeTurnReader = async (rawSessionId, signal, currentSource) => {
      const sessionId = SessionId(id(rawSessionId, 'sessionId'))
      const live = ctx.agents.get(sessionId)
      if (currentSource?.() === false) throw new ControlsError('association-conflict', 'native turn source changed before read')
      if (live !== undefined && live.session.header.origin === 'subagent') return observeNativeTurn(live.session.ownEvents())
      interface NativeTurnQuery { observeSession(id: SessionId, options?: { readonly projectionMode?: 'none'; readonly signal?: AbortSignal }): Promise<{ readonly inheritedEventCount: number; readonly events: readonly SessionEvent[] } & Disposable> }
      const query = ctx.get('sessionQuery') as NativeTurnQuery | undefined
      if (query === undefined || typeof query.observeSession !== 'function') throw new ControlsError('feature-disabled', 'child session log observation is unavailable')
      const observation = await query.observeSession(sessionId, { projectionMode: 'none', ...(signal === undefined ? {} : { signal }) })
      try {
        if (currentSource?.() === false) throw new ControlsError('association-conflict', 'native turn source changed during observation')
        return observeNativeTurn(observation.events.slice(observation.inheritedEventCount))
      } finally { observation[Symbol.dispose]() }
    }
    // RC3 exposes rootOf on the runtime but direct catalogs through public SessionQuery
    // projection values, not a runtime.listChildren method or a package-root helper export.
    // This observation is background enrichment only, with one disposable parent lease.
    const directChildren = async (owner: SessionId, signal?: AbortSignal): Promise<unknown> => {
      signal?.throwIfAborted()
      const query = ctx.get('sessionQuery')
      if (query === undefined) throw new ControlsError('feature-disabled', 'native direct catalog query is unavailable')
      const observation = await query.observeSession(owner, signal === undefined ? {} : { signal })
      try {
        signal?.throwIfAborted()
        return observation.projections?.values.subagentCatalog
      } finally { observation[Symbol.dispose]() }
    }
    const nativeCounter = new NativeRunningCounter({ liveAgents: () => ctx.agents.list(), liveAgent: sessionId => ctx.agents.get(SessionId(sessionId)), lister: () => nativeSubagentLister(ctx), directChildren, signal: lifetime.signal, onStop: event => forwardNativeStop(event), turnReader: readNativeTurn })
    const readNativeActivity = async (sessionId: string, signal?: AbortSignal): Promise<NativeSubagentActivity> => {
      const ownerSessionId = id(sessionId, 'sessionId')
      const control = signal === undefined ? lifetime.signal : AbortSignal.any([signal, lifetime.signal])
      control.throwIfAborted()
      const activity = await nativeCounter.read(ownerSessionId, control)
      control.throwIfAborted()
      return activity
    }
    const ports: HostPorts = {
      controlsStorage, instrumentStorage, windowStorage, resourceStorage, ...identity,
      capabilities: freeze({ ...HOST_CAPABILITIES,
        get nativeInitialChildCwd(): HostCapabilities['nativeInitialChildCwd'] { return hasNativeInitialChildCwd(ctx) ? 'supported' : 'unsupported' },
        get allNativeWakeAdmission(): HostCapabilities['allNativeWakeAdmission'] { return nativeSubagentLister(ctx) === undefined ? 'unsupported' : 'supported' } }),
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
      async authorizeInitialChildCwd(exec, cwd) {
        lifetime.signal.throwIfAborted(); exec.signal.throwIfAborted()
        const caller = agentCaller(ctx, exec.agent)
        await identity.authorizeCaller(caller, caller.sessionId!)
        if (typeof cwd !== 'string' || cwd.length === 0 || cwd.length > 16384 || cwd.includes('\0') || !isAbsolute(cwd) || normalize(cwd) !== cwd) throw new ControlsError('invalid-input', 'cwd must be a bounded normalized absolute path')
        if (!hasNativeInitialChildCwd(ctx)) throw new ResourceError('unsupported', 'nativeInitialChildCwd unsupported; no child was requested')
        const verify = await authorizeInitialChildCwd(ctx, exec.agent!, cwd, AbortSignal.any([exec.signal, lifetime.signal]))
        if (!hasNativeInitialChildCwd(ctx)) throw new ResourceError('unsupported', 'nativeInitialChildCwd unsupported; no child was requested')
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
        const native = ctx.get('subagents') as (Context['subagents'] & NativeActivationFacade) | undefined
        if (!native || typeof native.startActivation !== 'function') throw new ResourceError('unsupported', 'native continuable creation is unavailable; no child was requested')
        // No replacement provider is loaded: an explicit cwd requires the native
        // activation contract, and an unsupported host creates no child at all.
        if (cwd !== undefined && !hasNativeInitialChildCwd(ctx)) throw new ResourceError('unsupported', 'nativeInitialChildCwd unsupported; no child was requested')
        const verifyCwd = cwd === undefined ? undefined : await authorizeInitialChildCwd(ctx, exec.agent!, cwd, AbortSignal.any([exec.signal, lifetime.signal]))
        const maxDepth = native.resolveMaxDepth()
        lifetime.signal.throwIfAborted(); exec.signal.throwIfAborted(); agentCaller(ctx, exec.agent)
        verifyCwd?.()
        if (cwd !== undefined && !hasNativeInitialChildCwd(ctx)) throw new ResourceError('unsupported', 'nativeInitialChildCwd unsupported; no child was requested')
        // Public manager owns provider capability/depth checks, permissions, lineage,
        // factory headers and durable descriptors. Never mutate parent/child metadata.
        // Upstream keeps the reserved identity and resolves the task directory
        // before the child exists. RC3 reads top-level task fields; RC1 reads request.
        // Parent delivery is the model-facing completion notice this plugin's receipt
        // already implies; the returned handle stays with the upstream manager, which
        // settles the child and releases its slot without further action here.
        const task: NativeActivationTask = { parent: exec.agent!, prompt: [{ type: 'text', text: prompt }],
          ...(maxDepth === undefined ? {} : { maxDepth }), ...(cwd === undefined ? {} : { cwd }) }
        const spec: NativeActivationSpec = { ...task, request: task, provider: raw.provider, label, childId,
          signal: exec.signal, delivery: 'parent' }
        const activation = await native.startActivation(spec)
        // The result promise rejects on capture failure; nobody here awaits it, and an
        // unhandled rejection would surface in the host process. The parent notice and
        // this plugin's lifecycle observation carry the outcome instead.
        const result = activation.result
        if (result !== null && typeof result === 'object' && typeof (result as Promise<unknown>).catch === 'function') (result as Promise<unknown>).catch(() => undefined)
        // The local-child overload with a reserved childId guarantees the message id.
        return { childId: String(activation.childId), messageId: String(activation.messageId ?? '') }
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
        const activity = await readNativeActivity(sessionId)
        // Complete only when the native catalog traversal succeeded without diagnostics.
        return { known: activity.known, reason: activity.reason, liveAgents: ctx.agents.list() }
      },
      nativeSubagentActivity(sessionId, signal) { return readNativeActivity(sessionId, signal) },
      nativeSubagentDrift(sessionId) { return nativeCounter.driftFacts(sessionId) },
      nativeSubagentStops(sessionId) { return nativeCounter.stops(sessionId) },
      nativeSubagentCountRevision(sessionId) { return nativeCounter.revision(sessionId) },
      nativeSubagentCountState(sessionId) { return nativeCounter.state(sessionId) },
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
    active.setDelegateRegistered?.(options.delegate === true && active.delegate !== undefined)
    const supervisionLedger = new SupervisionLedger()
    let ledgerActive = false
    const ownerBySession = new Map<string, string>()
    const ownerOf = async (sessionId: string): Promise<string | undefined> => {
      const cached = ownerBySession.get(sessionId)
      if (cached !== undefined) return cached
      let cursor = sessionId
      const seen = new Set<string>()
      for (let depth = 0; depth < 32; depth += 1) {
        if (seen.has(cursor)) return undefined
        seen.add(cursor)
        let identity
        try { identity = await ports.authority.resolveSession(cursor) } catch { return undefined }
        if (identity === undefined) return undefined
        if (identity.kind === 'owner') {
          for (const id of seen) ownerBySession.set(id, cursor)
          return cursor
        }
        cursor = identity.parentSessionId
      }
      return undefined
    }
    let syncAuditTool: (snapshot: SupervisionConfigSnapshot) => void = () => {}
    const service = new MattPocockControlsService(ctx, active, ports, grants, supervisionStorage, { signal: lifetime.signal, track, ...(options.onPolicyChanged === undefined ? {} : { onPolicyChanged: options.onPolicyChanged }), onSupervisionChanged: snapshot => syncAuditTool(snapshot) })
    disposers.push(ctx.typert.register(hostRemoteContribution()))
    // Optional enhancement failure never removes the established base namespace or tools.
    try {
      const unregister = ctx.typert.register(recommendationHostRemoteContribution())
      try { new MattPocockRecommendationSupportService(ctx, active, ports, { signal: lifetime.signal, track }) }
      catch (error) { unregister(); throw error }
      disposers.push(unregister)
    } catch { /* Unsupported optional namespace is observable as unavailable; base remains usable. */ }
    // Model tools always address the actual caller's session, never a supplied principal.
    const model = createModelTools(active)
    const boundedError = (error: unknown): Error => {
      if (error instanceof ControlsError) return new ControlsError(error.code, previewText(error.message, 768).text)
      const value = error as { readonly code?: unknown; readonly message?: unknown; readonly reason?: unknown } | null
      return new ModelOutputError(typeof value?.code === 'string' ? previewText(value.code, 128).text : 'plugin-error', previewText(typeof value?.message === 'string' ? value.message : 'Plugin operation failed; source outcome may be unknown', 768).text, typeof value?.reason === 'string' ? previewText(value.reason, 128).text : undefined)
    }
    const tool = (name: string, description: string, action: (raw: Record<string, unknown>, caller: HostCaller, exec: ToolRunContext) => Promise<unknown>) => {
      disposers.push(ctx.tools.register(defineTool({ name, description: modelToolDescription(name, description), parameters: { request: { type: 'json', required: true } },
        output: { schema: { type: 'json' }, render: (_, value) => [{ type: 'text', text: JSON.stringify(value) }] },
        async execute(args, exec) {
          try {
            exec.signal.throwIfAborted(); const caller = agentCaller(ctx, exec.agent), envelope = record(args, 'tool arguments', ['request']), raw = record(envelope.request, 'request')
            const controlled: ToolRunContext = { ...exec, signal: AbortSignal.any([exec.signal, lifetime.signal]), concludeTurn: exec.concludeTurn.bind(exec), deferContext: exec.deferContext.bind(exec) }
            return parseHostJson(JSON.parse(JSON.stringify(await track(async () => {
              const who = await model.identity(caller, controlled.signal)
              const result = await action(raw, caller, controlled)
              try { return model.finish(await model.project(name, who, raw, result, controlled.signal), name, raw) }
              catch (error) { controlled.signal.throwIfAborted(); return model.finish(model.projectionFailure(name, who, raw, result, error), name, raw) }
            }))))
          } catch (error) { exec.signal.throwIfAborted(); throw boundedError(error) }
        },
      })))
    }
    tool('mattpocock_controls', 'Read saved workspace controls or save an explicitly delegated policy change. Extra keys are rejected and the error lists the accepted keys.', async (raw, caller, exec) => {
      if (raw.action === 'read') { record(raw, 'policy read', ['action', 'query']); await ports.authority.authorizePolicy(caller.principalId, 'read'); return active.readPolicy(caller, exec.signal) }
      record(raw, 'policy save', ['action', 'intent', 'expectedRevision']); if (raw.action !== 'save') throw new ControlsError('invalid-input', 'read/save action required')
      await ports.authority.authorizePolicy(caller.principalId, 'write')
      const saved = await active.savePolicy(caller, parsePolicyIntent(raw.intent), revision(raw.expectedRevision, 'expectedRevision'), exec.signal)
      options.onPolicyChanged?.(); return saved
    })
    tool('mattpocock_record', "Read the session instrument; write authored task references or genuine user decisions. Business facts stay in the agreed tracker/document, not duplicate tickets. local-current certifies only local state; references are unverified author reports, with no source fetch. Require capabilities.taskReferences=true (absent means unsupported); prefer references for T/assignment/decision links, never fake tickets. Legacy tickets remain readable. New decisions: genuine unresolved user questions only, pending=true and addressee.kind=user; implementation/research/completion belong in existing spec/ADR/task records, not self-question/answer entries. Record a real reply and source on the same decisionId; authenticated author stays agent. Partial/skipped/cancelled/silent replies are not approval; pending=false requires explicit real resolution. Preserve existing awaitingImplementation=true on answers; never default new await=true. Await counts are raw compatibility markers, not unfinished-task totals: review task evidence, append notes to context, preserve answer/task/source pointers; handoff is not completion, never auto-clear flags. Legacy agent/unspecified/missing-addressee updates remain legal; OFF allows old-record closeout, no new records. Recommendation support requires capabilities.decisionRecommendationAdoption=true and current active owner authorization. First put a genuine pending user question with recommendation exactly equal to a unique options.key. Candidate is not adopted: explicitly adopt on the SAME decisionId using exact returned candidate fields and current businessRevision (not decisionRevision) as expectedRevision. Only successful adopted receipt records selection; do not reconfirm the same authorized path. Path selection grants no operation permissions or external inputs: a maintainer-provided read-only runtime still requires qualified input, not installation/download/SDK changes. Higher-priority personal-confirmation requirements prevail. If support is missing, unknown or not eligible, use the ordinary user-question flow. On conflict, expiry, withdrawal or an earlier human answer, reread current state; never blindly replay authorization. Prior authorization is not a fresh user reply or completion proof; preserve result, references, await flags and task constraints. Never self-enable or renew the owner policy.", async (raw, caller, exec) => {
      await ports.authorizeCaller(caller, caller.sessionId!)
      if (raw.action === 'read') { record(raw, 'instrument read', ['action', 'query']); return model.current(caller, raw.query, exec.signal) }
      if (raw.action === 'detail') return model.detail(caller, raw, exec.signal)
      record(raw, 'instrument apply', ['action', 'command']); if (raw.action !== 'apply') throw new ControlsError('invalid-input', 'read/apply/detail action required')
      return active.applyInstrument(caller, caller.sessionId!, parseInstrumentCommand(raw.command), exec.signal)
    })
    tool('mattpocock_window', "Explicitly reserve/release/reacquire local taskReferences or legacy ticket handles in one workflow, not duplicate business lifecycles (empty workflow axes allowed). Reserve/reacquire fail closed on unreadable handles. Release explicitly when leaving the advancement set under task agreements; it is not source completion and needs no source/local-ticket read. OFF permits authorized existing release only. Never auto-release on child end, source closure or hiding; legacy terminal pending-release is an authored hint.", async (raw, caller, exec) => {
      await ports.authorizeCaller(caller, caller.sessionId!); return active.applyTicketWindow(caller, caller.sessionId!, parseTicketWindowCommand(raw), exec.signal)
    })
    if (active.historyAction) tool('mattpocock_history', "Read retained instrument history separately from current context. Paging summaries are not full detail. Explicit source cleanup preserving current state differs from derived-copy cleanup; neither deletes Git worktrees or native conversation history.", async (raw, caller, exec) => {
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
    if (active.worktreeAction) tool('mattpocock_worktree', "Record worktree relationships and authored handling of native observations; action stays at request top level. Distinguish authored marks, native binding facts, observed create_worktree/Git identity/creator activity, and read-time nativeChildren inferred from creator identity: never a strong binding or directory-use claim. Child header cwd is a source value, not actual initial/current directory proof. Use host working_directory to enter/leave (cd back to the reported project; checkout/branch remain) and host Git/create_worktree to create/merge/delete trees, not this instrument.", async (raw, caller, exec) => {
      const action = raw.action
      if (action === 'read') { record(raw, 'worktree read', ['action', 'query']); return model.worktrees(caller, raw.query, exec.signal) }
      else if (action === 'update') record(raw, 'worktree update', ['action', 'command'])
      else if (action === 'update-observation') record(raw, 'worktree observation update', ['action', 'command'])
      else if (action === 'reconcile') record(raw, 'worktree reconcile', ['action', 'operationId'])
      else {
        const keys = JSON.stringify(Object.keys(raw).sort())
        const received = typeof action === 'string' ? `action=${JSON.stringify(action)}` : action === undefined ? 'no action' : `action=<${typeof action}>`
        throw new ControlsError('invalid-input', `worktree action required: received ${received} with request keys ${keys}; expected one of {"action":"read"} | {"action":"update","command":{...}} | {"action":"update-observation","command":{...}} | {"action":"reconcile","operationId":"existing-delegation-operation-id"}`)
      }
      await ports.authorizeCaller(caller, caller.sessionId!); return active.worktreeAction!(caller, caller.sessionId!, parseHostJson(raw), exec.signal)
    })
    tool('mattpocock_resource', "Read one recorded resource: Git identity, retention and retirement facts. Use host Git/create_worktree for checkouts/branches and mattpocock_worktree for lane relationships.", async (raw, caller, exec) => {
      await ports.authorizeCaller(caller, caller.sessionId!)
      const parsed = parseResourceAction(raw)
      if (parsed.action !== 'read') throw new ControlsError('feature-disabled', 'this tool only reads recorded resources; pass {action:"read", resourceId}. Creating, borrowing and retiring trees is Git work you do with the host tools.')
      return active.resourceAction(caller, caller.sessionId!, parsed, exec.signal)
    })
    if (options.delegate === true && active.delegate) tool('mattpocock_delegate', 'Binding-first creation of a continuable spawn/fork child. Use this only when you need a durable, verifiable ticket↔worktree binding (or the persistent intent, idempotency and pre-creation scope check that come with it); ordinary unbound lanes should use the host\'s native subagent/subagent_fork and mattpocock_assign instead. Prepare the worktree first with the host\'s create_worktree and pass its absolute path as worktree: the worktree is a requested initial cwd, and the actual child/parent/cwd header is verified only as a header source value — a header cwd does not prove where the child actually started or which directory it now uses. The binding records the requested cwd and the header-derived actual cwd with the task and ticketIds before the ticket assignment is written. Native acceptance of the creation is not a completed binding or assignment; report those effects separately. Omitting worktree records only the inherited intent, not a claim that the lane owns a dedicated tree. Retrying the same operationId never creates a second child; use a new operationId when you want another one. When workflowId is given, ticketIds must name at least one ticket already recorded in this instrument; omit workflowId entirely for a ticketless research lane. If creation was accepted or its metadata is uncertain, use that existing child and verify the binding; never create it again. If assignment was not granted, grant it explicitly to the same child with mattpocock_assign. If recording is reported unknown or failed, read the binding with mattpocock_worktree before retrying.', async (raw, caller, exec) => {
      record(raw, 'delegation request', ['description', 'prompt', 'provider', 'worktree', 'operationId', 'workflowId', 'ticketIds'])
      await ports.authorizeCaller(caller, caller.sessionId!); return active.delegate!(caller, parseHostJson(raw), exec)
    })
    if (active.assign) tool('mattpocock_assign', "Assign instrument access only to your actual direct child in the same instance. Handles must name existing taskReferences/legacy tickets, not external URLs or tracker claims; unreadable handles fail closed. Effective scope is the intersection of raw grants along the actual current parent chain: ancestor narrowing hides old scope immediately; restoration may reactivate an original raw grant. Never self-grant policy access.", async (raw, caller, exec) => {
      await ports.authorizeCaller(caller, caller.sessionId!); return active.assign!(caller, parseHostJson(raw), exec.signal)
    })
    const supervisionStores = new Map<string, Promise<VersionedStorage<SupervisionDocument>>>()
    const nextSupervisionCheck = new Map<string, number>()
    const assignmentCache = new Map<string, readonly SupervisionTicketRef[]>()
    const assignmentAttempts = new Set<string>()
    const rememberAssignment = (owner: string, session: string, assignment: RuntimeSnapshot['assignment']): readonly SupervisionTicketRef[] => {
      const refs = assignment === undefined ? [] : assignment.ticketIds.map(ticketId => Object.freeze({ workflowId: assignment.workflowId, ticketId }))
      assignmentCache.set(session, refs)
      supervisionLedger.tagSession(owner, session, refs)
      return refs
    }
    const assignmentFromArguments = (argumentsValue: unknown): { readonly sessionId: string; readonly refs: readonly SupervisionTicketRef[] } | undefined => {
      if (argumentsValue === null || typeof argumentsValue !== 'object' || Array.isArray(argumentsValue)) return undefined
      const outer = argumentsValue as Record<string, unknown>, request = outer.request !== null && typeof outer.request === 'object' && !Array.isArray(outer.request) ? outer.request as Record<string, unknown> : outer
      if (typeof request.sessionId !== 'string' || request.sessionId.length === 0) return undefined
      const workflowId = request.workflowId === null || request.workflowId === undefined ? null : (typeof request.workflowId === 'string' ? request.workflowId : undefined)
      const ticketIds = request.ticketIds === undefined ? [] : (Array.isArray(request.ticketIds) && request.ticketIds.every(ticket => typeof ticket === 'string') ? request.ticketIds as string[] : undefined)
      if (workflowId === undefined || ticketIds === undefined) return undefined
      return { sessionId: request.sessionId, refs: ticketIds.map(ticketId => Object.freeze({ workflowId, ticketId })) }
    }
    const resolveAssignment = (owner: string, agent: Agent, signal: AbortSignal): void => {
      const session = agent.id
      if (assignmentCache.has(session) || assignmentAttempts.has(session)) return
      assignmentAttempts.add(session)
      void track(async () => {
        const view = await active.readSession(agentCaller(ctx, agent), session, signal) as RuntimeSnapshot
        rememberAssignment(owner, session, view.assignment)
      }).catch(error => { assignmentAttempts.delete(session); ctx.logger('mattpocock-controls').warn('supervision assignment read skipped', error) })
    }
    const openSupervisionState = (owner: string): Promise<VersionedStorage<SupervisionDocument>> => {
      let store = supervisionStores.get(owner)
      if (!store) { store = ports.openUnitStorage('supervision_state_' + createHash('sha256').update(owner).digest('hex').slice(0, 32), parseSupervisionDocument); supervisionStores.set(owner, store) }
      return store
    }
    let auditToolDispose: (() => unknown) | undefined
    const audit = async (caller: HostCaller, exec: ToolRunContext): Promise<unknown> => {
      const identity = await model.identity(caller, exec.signal)
      const selected = await active.readModelSource!(caller, caller.sessionId!, { domain: 'policy', key: sourceKey('policy', 'effective', identity.instance.controlWorkspaceId) }, exec.signal)
      if (selected.source === null) throw new ControlsError('invalid-state', 'effective supervision policy unavailable')
      const view = { instance: identity.instance, policy: selected.source.value as RuntimeSnapshot['policy'] }
      if (view.instance.ownerSessionId !== caller.sessionId) throw new ControlsError('access-denied', 'delivery supervision audit is owner-session only')
      if (!view.policy.extensionEnabled || !view.policy.workspaceEnabled) throw new ControlsError('feature-disabled', 'collaboration controls are disabled for this workspace')
      const settings = resolveSupervisionSettings(supervisionSnapshot, view.instance.controlWorkspaceId)
      if (!settings.enabled) throw new ControlsError('feature-disabled', 'delivery supervision is disabled for this workspace')
      const summary = supervisionLedger.summary(view.instance.ownerSessionId, {
        deliverableRoots: settings.deliverableRoots, supportRoots: settings.supportRoots, excludeGlobs: settings.excludeGlobs,
      }, Date.now())
      let episodes: readonly SupervisionEpisode[] = [], episodeRevision: number | null = null, episodeCoverage = 'not-recorded'
      try {
        const raw = await (await openSupervisionState(view.instance.ownerSessionId)).read()
        if (raw !== undefined) { const retained = parseSupervisionDocument(raw); episodes = retained.episodes; episodeRevision = retained.revision; episodeCoverage = 'current' }
      } catch { episodeCoverage = 'unknown' /* A corrupt episode source must not hide the live ledger or claim an empty known set. */ }
      return {
        action: 'read', status: 'ok', generatedAt: new Date().toISOString(),
        coverage: { ownerSessionId: view.instance.ownerSessionId, workspaceId: view.instance.controlWorkspaceId,
          persistence: 'mixed', summary: { persistence: 'memory-only', status: 'current' }, events: summary.events, sessions: summary.sessions, dropped: summary.dropped,
          episodes: { persistence: 'durable', status: episodeCoverage, retained: episodeCoverage === 'current' ? episodes.length : null } },
        summary, episodes, episodeRevision,
        note: 'Summary/event observations are memory-only in this host process; retained episodes have a separate durable source with explicit coverage. This read makes no model call, ticket mutation, T/S release or automatic delivery.',
      }
    }
    model.setAuditReader((caller, signal) => audit(caller, { signal } as ToolRunContext))
    syncAuditTool = snapshot => {
      supervisionSnapshot = snapshot
      const enabled = snapshot.defaults.enabled === true || Object.values(snapshot.workspaceOverrides).some(patch => patch.enabled === true)
      ledgerActive = enabled
      nextSupervisionCheck.clear()
      if (!enabled) { supervisionLedger.clear(); auditToolDispose?.(); auditToolDispose = undefined; return }
      if (auditToolDispose !== undefined) return
      try {
        auditToolDispose = ctx.tools.register(defineTool({ name: 'mattpocock_audit', description: modelToolDescription('mattpocock_audit', 'Read the optional delivery-supervision ledger for the authenticated owner session. It never calls a model, mutates tickets, releases T/S or delivers a message. It is registered only while supervision is enabled in configured defaults or a workspace override; per-workspace policy still gates each call.'), parameters: { request: { type: 'json', required: true } },
          output: { schema: { type: 'json' }, render: (_, value) => [{ type: 'text', text: JSON.stringify(value) }] },
          async execute(args, exec) {
            try {
              exec.signal.throwIfAborted(); const caller = agentCaller(ctx, exec.agent), envelope = record(args, 'tool arguments', ['request']), raw = record(envelope.request, 'request', ['action', 'query'])
              if (raw.action !== 'read') throw new ControlsError('invalid-input', 'audit action required: {action:"read"}')
              const controlled: ToolRunContext = { ...exec, signal: AbortSignal.any([exec.signal, lifetime.signal]), concludeTurn: exec.concludeTurn.bind(exec), deferContext: exec.deferContext.bind(exec) }
              await ports.authorizeCaller(caller, caller.sessionId!)
              return parseHostJson(JSON.parse(JSON.stringify(await track(async () => model.finish(await model.audit(caller, raw.query, await audit(caller, controlled), controlled.signal), 'mattpocock_audit', raw)))))
            } catch (error) { exec.signal.throwIfAborted(); throw boundedError(error) }
          } }))
      } catch (error) {
        auditToolDispose = undefined
        ctx.logger('mattpocock-controls').warn('audit tool registration failed; supervision observations remain off', error)
      }
    }
    syncAuditTool(supervisionSnapshot)
    const llmReview = async (ownerSessionId: string, settings: ReturnType<typeof resolveSupervisionSettings>, trigger: 'scheduled' | 'suspicion', summary: ReturnType<SupervisionLedger['summary']>, ticket: { readonly id: string | null; readonly research: boolean }, signal: AbortSignal): Promise<{ readonly review: SupervisionReview; readonly tokens: number } | null> => {
      const llm = ctx.get('llm') as { stream(options: Record<string, unknown>): AsyncIterable<{ type: string; text?: string; usage?: { readonly inputTokens: number; readonly outputTokens: number; readonly totalTokens?: number } }> } | undefined
      const ownerAgent = ctx.agents.get(SessionId(ownerSessionId)) as (Agent & { readonly model?: { current(): { readonly provider: string; readonly model: string; readonly reasoningEffort?: string } | undefined } }) | undefined
      const selected = settings.reviewer.routeMode === 'explicit'
        ? (settings.reviewer.provider.length > 0 && settings.reviewer.model.length > 0 ? { provider: settings.reviewer.provider, model: settings.reviewer.model, ...(settings.reviewer.reasoningEffort.length > 0 ? { reasoningEffort: settings.reviewer.reasoningEffort } : {}) } : null)
        : ownerAgent?.model?.current()
      if (!llm || !selected) return null
      const prompt = JSON.stringify({ task: 'delivery-supervision-review', trigger,
        instructions: 'Return one JSON object only with verdict on-track|suspicion|uncertain, severity info|concern|alert, observed (short factual sentence), possibleIssue (short tentative sentence), confidence 0..1. Do not claim certainty and do not issue commands.',
        ticket,
        tickets: summary.tickets.slice(0, 4),
        evidence: { events: summary.events, productWrites: summary.productWrites, supportWrites: summary.supportWrites,
          productFiles: summary.productFiles.slice(0, 30), supportFiles: summary.supportFiles.slice(0, 30),
          lastProductAt: summary.lastProductAt, noProductHours: summary.noProductHours, supportOnly: summary.supportOnly, rootsConfigured: summary.rootsConfigured } })
      const control = AbortSignal.any([signal, AbortSignal.timeout(settings.reviewer.timeoutMs)])
      let text = '', tokens = 0
      try {
        for await (const chunk of llm.stream({ provider: selected.provider, model: selected.model, ...(selected.reasoningEffort === undefined ? {} : { reasoningEffort: selected.reasoningEffort }),
          messages: [createUserMessage({ content: [{ type: 'text', text: prompt }], source: { kind: 'user' } })], maxTokens: settings.reviewer.maxTokens, temperature: 0, signal: control })) {
          if (chunk.type === 'text-delta') text += chunk.text ?? ''
          if (chunk.type === 'usage' && chunk.usage !== undefined) tokens = Math.max(tokens, chunk.usage.totalTokens ?? chunk.usage.inputTokens + chunk.usage.outputTokens)
          if (text.length > 16_384) return null
        }
      } catch { return null }
      const start = text.indexOf('{'), end = text.lastIndexOf('}')
      if (start < 0 || end <= start) return null
      try {
        const raw = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
        const verdict = raw.verdict, severity = raw.severity, observed = raw.observed, possibleIssue = raw.possibleIssue, confidence = raw.confidence
        if (!['on-track', 'suspicion', 'uncertain'].includes(String(verdict)) || !['info', 'concern', 'alert'].includes(String(severity))) return null
        if (typeof observed !== 'string' || observed.length === 0 || observed.length > 4096 || typeof possibleIssue !== 'string' || possibleIssue.length === 0 || possibleIssue.length > 2048) return null
        if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null
        return Object.freeze({ review: Object.freeze({ verdict: verdict as SupervisionReview['verdict'], severity: severity as SupervisionReview['severity'], observed, possibleIssue, confidence }), tokens })
      } catch { return null }
    }
    const maybeSupervise = async (ownerSessionId: string, agent: Agent, signal: AbortSignal): Promise<void> => {
      if (!ledgerActive) return
      const now = Date.now()
      if ((nextSupervisionCheck.get(ownerSessionId) ?? 0) > now) return
      const identity = await ports.authority.resolveSession(ownerSessionId)
      if (identity === undefined || identity.kind !== 'owner') return
      const settings = resolveSupervisionSettings(supervisionSnapshot, identity.controlWorkspaceId)
      if (!settings.enabled) return
      nextSupervisionCheck.set(ownerSessionId, now + Math.max(1, settings.checkIntervalMinutes) * 60_000)
      const store = await openSupervisionState(ownerSessionId)
      let raw = await store.read()
      if (raw === undefined) {
        try { await store.compareAndSwap(0, initialSupervisionDocument(ownerSessionId, identity.controlWorkspaceId, now)) } catch { /* another observer may have initialized it */ }
        raw = await store.read()
      }
      if (raw === undefined) return
      const document = parseSupervisionDocument(raw)
      const summary = supervisionLedger.summary(ownerSessionId, { deliverableRoots: settings.deliverableRoots, supportRoots: settings.supportRoots, excludeGlobs: settings.excludeGlobs }, now)
      const view = await active.readSession(agentCaller(ctx, agent), agent.id, signal) as RuntimeSnapshot
      if (!view.policy.extensionEnabled || !view.policy.workspaceEnabled) return
      rememberAssignment(ownerSessionId, agent.id, view.assignment)
      const assignedTickets = view.assignment === undefined ? [] : (view.records?.tickets ?? []).filter(ticket => view.assignment!.ticketIds.includes(ticket.localTicketId) && (view.assignment!.workflowId === null || ticket.workflowId === view.assignment!.workflowId))
      const markedTicket = assignedTickets.find(ticket => ticket.value.suspicionMode === 'off') ?? assignedTickets[0]
      const ticketContext = { id: markedTicket?.localTicketId ?? null, research: assignedTickets.some(ticket => ticket.value.suspicionMode === 'off') }
      const ticketSuspicionMode = ticketContext.research ? 'off' : assignedTickets.find(ticket => ticket.value.suspicionMode === 'auto')?.value.suspicionMode
      const trigger = decideSupervisionTrigger(document, settings, summary, now, ticketSuspicionMode)
      if (trigger === null) return
      const reviewed = settings.dryRun ? { review: deterministicReview(trigger, summary), tokens: 0 } : await llmReview(ownerSessionId, settings, trigger, summary, ticketContext, signal)
      if (reviewed === null) return
      const review = reviewed.review
      const gate = (summary.noProductHours ?? 0) >= settings.delivery.alertMinNoProductHours && summary.supportFiles.length >= settings.delivery.alertMinSupportFiles
      const ownerAgent = ctx.agents.get(SessionId(ownerSessionId))
      const delivery = settings.dryRun ? 'none' : review.severity === 'alert' && gate && ownerAgent ? 'card+agent' : review.severity === 'info' ? 'none' : 'card'
      const episode = makeSupervisionEpisode({ document, trigger, review, summary, now, delivery, ticketId: ticketContext.id, research: ticketContext.research })
      if (!await store.compareAndSwap(document.revision, withSupervisionEpisode(document, episode, settings, now, reviewed.tokens))) return
      if (delivery === 'card+agent' && ownerAgent) {
        try { ownerAgent.inject(makeSupervisionNotice(episode)) } catch (error) { ctx.logger('mattpocock-controls').warn('supervision notice injection failed', error) }
      }
    }
    disposers.push(() => { auditToolDispose?.(); auditToolDispose = undefined })
    disposers.push(ctx.on('session/event', (session, event) => {
      // A parent-owned subagent/catalog fact is a membership-change node.
      if (event.type === 'subagent/catalog') nativeCounter.catalog(String(session.id), event.data.childId === undefined ? undefined : String(event.data.childId))
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
    disposers.push(ctx.on('agent/created', async ({ agent, signal }) => {
      nativeCounter.created(agent)
      await track(() => active.created(agentCaller(ctx, agent), signal ? AbortSignal.any([signal, lifetime.signal]) : lifetime.signal, agent)); return undefined
    }))
    // The host may assemble one model request several times (and a PTC step may complete several
    // nested dispatches); all of them share the same turn:step identity, which is the delivery step.
    let admittedStep = '0:0'
    disposers.push(ctx.on('agent/pre-step', async ({ agent, signal, turn, step }, next): Promise<PreStepDecision> => {
      const decision = await next()
      if (decision.kind === 'reject') return decision
      admittedStep = turn + ':' + step
      const messages = await track(() => active.preStep(agentCaller(ctx, agent), signal, decision.messages, admittedStep)); signal.throwIfAborted()
      return messages.length === 0 ? decision : { ...decision, messages: [...decision.messages, ...messages] }
    }))
    if (active.postExecute) disposers.push(ctx.on('tools/post-execute', async (exec, result, next) => {
      const decision = await next()
      if (!exec.agent) return decision
      // A throwing post-execute listener replaces the native result — and every context
      // ferried through it — with a bare error, so this observation must never fail the
      // call. Aborts (including the post-program drain after a PTC run aborts) pass the
      // decision through unchanged.
      try {
        const contexts = await track(() => active.postExecute!(agentCaller(ctx, exec.agent), exec, result, admittedStep))
        return contexts.length === 0 ? decision : { ...decision, additionalContexts: [...decision.additionalContexts ?? [], ...contexts] }
      } catch (error) {
        // Cancellation keeps the exact caller reason: swallowing an abort would misreport the
        // caller's own cancellation. Any other observer failure must not replace the native
        // result, which is why it is logged and passed through instead of rethrown.
        if (exec.signal.aborted) throw exec.signal.reason ?? error
        ctx.logger.warn('mattpocock-controls post-execute observation skipped', error)
        return decision
      }
    }))
    disposers.push(ctx.on('tools/post-execute', async (exec, result, next) => {
      const decision = await next()
      if (!ledgerActive || !exec.agent) return decision
      try {
        const agent = exec.agent, owner = await ownerOf(agent.id)
        if (owner !== undefined) {
          const assigned = exec.name === 'mattpocock_assign' ? assignmentFromArguments(exec.arguments) : undefined
          if (assigned !== undefined) { assignmentCache.set(assigned.sessionId, assigned.refs); supervisionLedger.tagSession(owner, assigned.sessionId, assigned.refs) }
          const tickets = assignmentCache.get(agent.id) ?? []
          supervisionLedger.record({ ownerSessionId: owner, sessionId: agent.id, callId: exec.callId, rootCallId: exec.rootCallId, tool: exec.name, arguments: exec.arguments, tickets })
          if (!assignmentCache.has(agent.id)) resolveAssignment(owner, agent, AbortSignal.any([exec.signal, lifetime.signal]))
          void track(() => maybeSupervise(owner, agent, AbortSignal.any([exec.signal, lifetime.signal]))).catch(error => ctx.logger('mattpocock-controls').warn('supervision audit skipped', error))
        }
      } catch (error) {
        // Ledger observation is an optional side effect; never replace the native result.
        ctx.logger('mattpocock-controls').warn('supervision ledger observation skipped', error)
      }
      return decision
    }))
    if (active.context) disposers.push(ctx.systemPrompt.context({ name: 'mattpocock-controls', order: 130,
      text: assembly => assembly.agent ? active.context!(agentCaller(ctx, assembly.agent)) : '' }))
    const observe = (event: HostEvent) => { void track(() => active.observe(Object.freeze(event))).catch(error => ctx.logger('mattpocock-controls').warn(error)) }
    // One wake event per new terminal-outcome item; the item stays in the counter until the
    // child runs again, its start edge arrives, or a late end arrives.
    forwardNativeStop = stop => { const { ownerSessionId, ...item } = stop; observe({ kind: 'native-stop', ownerSessionId, item }) }
    disposers.push(ctx.on('agent/status', ({ agent, status }) => {
      nativeCounter.status(agent, status)
      observe({ kind: 'agent-status', sessionId: agent.id, status, actualAgent: agent })
    }))
    disposers.push(ctx.on('agent/disposed', ({ agent }) => {
      nativeCounter.disposed(agent)
      for (const [key, attempt] of noticeAttempts) if (attempt.actualAgent === agent) noticeAttempts.delete(key)
      return observe({ kind: 'agent-disposed', sessionId: agent.id, actualAgent: agent })
    }))
    disposers.push(ctx.on('subagent/start', info => {
      const agent = info.local ? ctx.agents.get(info.id) : undefined
      nativeCounter.start(String(info.id), info.local, agent, String(info.runId))
      observe({ kind: 'subagent-start', sessionId: info.id, runId: info.runId, provider: info.provider, local: info.local, ...(agent ? { actualAgent: agent } : {}) })
    }))
    disposers.push(ctx.on('subagent/end', info => {
      const agent = info.local ? ctx.agents.get(info.id) : undefined
      nativeCounter.end(String(info.id), info.local, agent, info.stopReason, String(info.runId))
      // The published end is forwarded even when this mount no longer holds the Agent (dispose or
      // registry loss). The runtime records it from durable owner facts or reports an explicit gap.
      observe({ kind: 'subagent-end', sessionId: info.id, runId: info.runId, provider: info.provider, local: info.local, stopReason: info.stopReason, ...(agent ? { actualAgent: agent } : {}) })
    }))
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
