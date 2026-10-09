import type { InstrumentInstance } from './state.js'
import type { EffectivePolicy } from './policy.js'
import type { InstrumentSnapshot } from './instruments.js'
import type { WindowSnapshot } from './windows.js'
import type { ResourceView } from './resources.js'
import type { WorktreeBindingCurrent } from './worktree-bindings.js'

/** Supplied by authenticated host associations, never parsed from a model/wire command. */
export interface ConsumptionIdentity {
  readonly principalId: string
  readonly sessionId: string
  readonly instrumentInstanceId: string
  readonly ownerSessionId: string
}
export interface ConsumptionSnapshot {
  /** Held T slots whose ticket already sits in a terminal status; the agent releases them. */
  readonly pendingRelease?: readonly { readonly workflowId: string; readonly localTicketId: string; readonly generation: number; readonly label: string | null }[]
  readonly sessionId: string
  readonly instance: InstrumentInstance
  readonly policy: EffectivePolicy
  readonly records: InstrumentSnapshot | null
  readonly windows: WindowSnapshot | null
  readonly resources: readonly ResourceView[]
  /** Authorized current rows, already filtered by runtime; never the durable registry/history. */
  readonly worktreeBindings?: readonly (WorktreeBindingCurrent & { readonly cleanupDue?: boolean })[]
  /** Explicitly retained effective conclusions, not resolved question/option histories. */
  readonly contextConclusions?: readonly { readonly decisionId: string; readonly workflowId: string; readonly result: string;
    readonly sourceRevision: number; readonly source: unknown }[]
  readonly capabilities: readonly { readonly key: string; readonly status: string; readonly reason: string | null }[]
  readonly health: readonly { readonly scope: string; readonly status: string; readonly reason: string | null }[]
}
/** Construction-only object capability. This is NOT a model tool or a child-result reader. */
export interface ConsumptionProgramPort {
  trackCommit(instrumentInstanceId: string, commit: Promise<unknown>): void
}
export interface ConsumptionOptions {
  readonly readSnapshot: (identity: ConsumptionIdentity, signal: AbortSignal) => Promise<ConsumptionSnapshot>
  readonly timeoutMs?: number
  readonly maxPendingCommits?: number
  readonly bindProgram?: (program: ConsumptionProgramPort) => void
}
export interface ConsumptionResult {
  /** null means unchanged successful facts; diagnostics are always explicit text. */
  readonly text: string | null
  readonly snapshot?: ConsumptionSnapshot
  readonly freshness: 'current' | 'stale' | 'unavailable'
  readonly reason?: string
}
interface Commit { done: Promise<void>; failed: boolean }
interface Cached { text: string; fingerprint: string; valid: boolean; sequence: number; verified: string | null }
class ConsumptionFailure extends Error {
  constructor(readonly reason: string) { super(reason) }
}
function bounded(value: number | undefined, initial: number, maximum: number, name: string): number {
  const result = value ?? initial
  if (!Number.isSafeInteger(result) || result < 1 || result > maximum) throw new RangeError(name + ' must be an integer in 1..' + maximum)
  return result
}
function checkedIdentity(identity: ConsumptionIdentity): ConsumptionIdentity {
  for (const key of ['principalId', 'sessionId', 'instrumentInstanceId', 'ownerSessionId'] as const) {
    if (typeof identity[key] !== 'string' || !identity[key].trim() || identity[key].includes('\0')) throw new TypeError('trusted identity requires ' + key)
  }
  return Object.freeze({ principalId: identity.principalId, sessionId: identity.sessionId,
    instrumentInstanceId: identity.instrumentInstanceId, ownerSessionId: identity.ownerSessionId })
}
function cacheKey(identity: ConsumptionIdentity): string {
  return JSON.stringify([identity.principalId, identity.sessionId, identity.instrumentInstanceId, identity.ownerSessionId])
}
function sameInstance(a: InstrumentInstance, b: InstrumentInstance): boolean {
  return a.instrumentInstanceId === b.instrumentInstanceId && a.ownerSessionId === b.ownerSessionId && a.controlWorkspaceId === b.controlWorkspaceId
}
function verify(snapshot: ConsumptionSnapshot, identity: ConsumptionIdentity): void {
  const instance = snapshot.instance
  if (snapshot.sessionId !== identity.sessionId || instance.instrumentInstanceId !== identity.instrumentInstanceId ||
      instance.ownerSessionId !== identity.ownerSessionId || instance.controlWorkspaceId !== snapshot.policy.controlWorkspaceId ||
      (snapshot.records !== null && !sameInstance(snapshot.records.instance, instance)) ||
      (snapshot.windows !== null && !sameInstance(snapshot.windows.instance, instance))) throw new ConsumptionFailure('identity-mismatch')
  // A shared physical resource can belong to another instance, but must have an authorized reference to this one.
  if (snapshot.resources.some(resource => resource.ownerInstanceId !== instance.instrumentInstanceId &&
      !resource.references.some(reference => reference.instrumentInstanceId === instance.instrumentInstanceId))) throw new ConsumptionFailure('identity-mismatch')
}
/** Canonical facts, not a cryptographic/security digest. No Node crypto or host imports. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  return '{' + Object.entries(value).filter(([, entry]) => entry !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, entry]) => JSON.stringify(key) + ':' + canonical(entry)).join(',') + '}'
}
function sorted<T>(rows: readonly T[], key: (row: T) => string): T[] {
  return [...rows].sort((a, b) => key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0)
}
function provenance<T>(row: { readonly history: readonly { readonly author: unknown; readonly references: readonly string[]; readonly value: T }[] }): unknown {
  const last = row.history[row.history.length - 1]
  return last ? { author: last.author, references: last.references } : null
}
// Mechanical representation budgets (UTF-16 characters), never business/capacity limits.
const CATEGORY_TEXT_BUDGET = 2000
const FIELD_TEXT_BUDGET = 384
interface QueryLocator { readonly [key: string]: unknown }
// Only these categories are actually captured as history rows; other briefed fields must not
// advertise a query that would return an empty notRecorded page.
const RECORDED_HISTORY_KINDS: Readonly<Record<string, string>> = { workflows: 'workflow', tickets: 'ticket', decisions: 'decision',
  'status-summary': 'workflow', 'ticket-window': 'ticket-window', executions: 'execution', resources: 'resource', worktree: 'worktree' }
function historyLocator(kind: string, row?: Record<string, unknown>): QueryLocator | undefined {
  const name = RECORDED_HISTORY_KINDS[kind]
  if (name === undefined) return undefined
  let recordId: string | undefined
  if (row) {
    if (typeof row.bindingId === 'string') recordId = row.bindingId
    else if (typeof row.resourceId === 'string') recordId = row.resourceId
    else if (typeof row.executionId === 'string') recordId = JSON.stringify([row.executionId, row.generation])
    else if (typeof row.localTicketId === 'string') recordId = JSON.stringify([row.workflowId, row.localTicketId])
    else if (typeof row.decisionId === 'string') recordId = JSON.stringify([row.workflowId, row.decisionId])
    else if (typeof row.workflowId === 'string') recordId = row.workflowId
  }
  return { tool: 'mattpocock_history', action: 'query', query: { kind: name, ...(recordId === undefined ? {} : { recordId }), limit: 20 } }
}
function brief(value: unknown, query: QueryLocator | undefined, depth = 0, textBudget = FIELD_TEXT_BUDGET): unknown {
  const located = query === undefined ? {} : { query }
  if (typeof value === 'string') return value.length <= textBudget ? value : {
    // A truncated body keeps a fingerprint of the whole string: the visible prefix and length
    // alone cannot distinguish two different tails.
    text: value.slice(0, textBudget), truncated: true, originalChars: value.length, signature: currentSignature([value]), ...located,
  }
  if (value === null || typeof value !== 'object') return value
  if (depth >= 6) return { truncated: true, ...located }
  if (Array.isArray(value)) {
    const rows = value.slice(0, 8).map(entry => brief(entry, query, depth + 1, textBudget))
    // The shown prefix cannot identify the omitted tail; the digest covers the whole array.
    return rows.length === value.length ? rows : { rows, shown: rows.length, total: value.length, more: true, truncated: true, tailSignature: currentSignature(value), ...located }
  }
  const entries = Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
  const selected = entries.slice(0, 32)
  return { ...Object.fromEntries(selected.map(([key, entry]) => [key, brief(entry, query, depth + 1, textBudget)])),
    ...(selected.length < entries.length ? { truncated: true, totalFields: entries.length, fieldsSignature: currentSignature(entries.map(([key]) => key)), ...located } : {}) }
}
/** Compact non-security checksum of current rows, including details outside the text budget. */
function currentSignature(rows: readonly unknown[]): string {
  const value = canonical(rows)
  let a = 2166136261, b = 5381
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    a = Math.imul(a ^ code, 16777619)
    b = Math.imul(b, 33) ^ code
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0')
}
function category(rows: readonly unknown[], location: QueryLocator, counts: unknown = undefined): unknown {
  const kind = String(location.kind)
  const query = historyLocator(kind)
  const shown: unknown[] = []
  const currentFactsSignature = currentSignature(rows)
  const envelope = (): unknown => ({ rows: shown, shown: shown.length, total: rows.length, more: shown.length < rows.length,
    ...(query === undefined ? {} : { query }), currentFactsSignature, ...(counts === undefined ? {} : { counts }) })
  for (let index = 0; index < rows.length; index++) {
    const raw = rows[index] as Record<string, unknown>
    const locator = historyLocator(kind, raw)
    let row = brief(locator === undefined ? raw : { ...raw, query: locator }, locator)
    if (canonical(row).length > 1000) {
      // Keep a readable identifier/state while referring to the full authored payload.
      const keys = ['workflowId', 'localTicketId', 'decisionId', 'executionId', 'generation', 'resourceId', 'bindingId', 'sourceRevision', 'state', 'held', 'status']
      const value = raw.value !== null && typeof raw.value === 'object' ? raw.value as Record<string, unknown> : null
      const details = ['title', 'question', 'status', 'pending', 'awaitingImplementation', 'result', 'business', 'acceptance', 'outcome']
      row = { ...Object.fromEntries(keys.filter(key => Object.hasOwn(raw, key)).map(key => [key, brief(raw[key], locator, 0, 96)])),
        ...(value ? { value: brief(Object.fromEntries(details.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]])), locator, 0, 96) } : {}),
        ...(typeof raw.result === 'string' ? { result: brief(raw.result, locator, 0, 96) } : {}),
        ...(locator === undefined ? { truncated: true } : { truncated: true, query: locator }) }
    }
    shown.push(row)
    if (canonical(envelope()).length > CATEGORY_TEXT_BUDGET) { shown.pop(); break }
  }
  return envelope()
}
function facts(snapshot: ConsumptionSnapshot): unknown {
  const records = snapshot.records
  const windows = snapshot.windows
  return {
    sessionId: snapshot.sessionId, instance: snapshot.instance,
    policy: brief({ configRevision: snapshot.policy.configurationRevision, extensionEnabled: snapshot.policy.extensionEnabled,
      workspaceVerified: snapshot.policy.workspaceVerified, features: snapshot.policy.features, windows: snapshot.policy.windows }, { kind: 'configuration' }),
    records: records === null ? null : { scope: brief(records.scope, { kind: 'records' }),
      summary: { ...records.summary, statusCounts: category(records.summary.statusCounts, { kind: 'status-summary' }) },
      workflows: category(sorted(records.workflows, row => row.workflowId).map(row => ({ workflowId: row.workflowId, sourceRevision: row.revision, value: row.value, source: provenance(row) })), { kind: 'workflows' }),
      tickets: category(sorted(records.tickets, row => canonical([row.workflowId, row.localTicketId])).map(row => ({ workflowId: row.workflowId, localTicketId: row.localTicketId, sourceRevision: row.revision, value: row.value, source: provenance(row) })), { kind: 'tickets' }),
      decisions: category(sorted(records.decisions.filter(row => row.value.pending === true || row.value.awaitingImplementation === true), row => canonical([row.workflowId, row.decisionId])).map(row => ({ workflowId: row.workflowId, decisionId: row.decisionId, sourceRevision: row.revision, value: row.value, source: provenance(row) })), { kind: 'decisions' }) },
    windows: windows === null ? null : { configRevision: windows.configurationRevision,
      status: windows.status, reason: brief(windows.reason, { kind: 'windows' }), scope: brief(windows.scope, { kind: 'windows' }),
      runtimeKnowledge: brief(windows.runtimeKnowledge, { kind: 'windows' }), T: windows.T,
      S: { ...windows.S, byState: Object.fromEntries(Object.entries(windows.S.byState).filter(([state]) => state !== 'released')) },
      tickets: category(sorted(windows.tickets.filter(row => row.held), row => canonical([row.workflowId, row.localTicketId])), { kind: 'ticket-window' }),
      executions: category(sorted(windows.executions.filter(row => row.state !== 'released'), row => canonical([row.executionId, row.generation])), { kind: 'executions' }) },
    resources: category(sorted(snapshot.resources.filter(row=>!(row.status==='retired'&&row.identity.ownership==='owned')), row => row.resourceId).map(resource => ({ resourceId: resource.resourceId,
      ownerInstanceId: resource.ownerInstanceId, identity: { path: resource.identity.path, ownership: resource.identity.ownership }, status: resource.status,
      business: resource.business, businessAuthorId: resource.businessAuthorId,
      references: sorted(resource.references, row => row.bindingId), diagnostic: resource.diagnostic,
      observation: { factsDigest: resource.actualCanRetire.facts?.digest ?? null, facts: resource.actualCanRetire.facts } })), { kind: 'resources' }),
    contextConclusions: category(sorted(snapshot.contextConclusions ?? [], row => canonical([row.workflowId, row.decisionId])), { kind: 'decisions' }),
    worktreeRelations: category(sorted(snapshot.worktreeBindings ?? [], row => row.bindingId).map(row => ({
      bindingId: row.bindingId, sourceRevision: row.revision, value: row.value,
      source: { kind: row.source, author: row.author, recordedAt: row.recordedAt },
      ...(row.cleanupDue === undefined ? {} : { cleanupDue: row.cleanupDue }),
    })), { kind: 'worktree' }, { cleanupDue: (snapshot.worktreeBindings ?? []).filter(row => row.cleanupDue === true).length }),
    capabilities: category(sorted(snapshot.capabilities, row => row.key), { kind: 'capabilities' }),
    health: category(sorted(snapshot.health, row => row.scope), { kind: 'health' }, {
      unknown: snapshot.health.filter(row => ['stale', 'unknown', 'unavailable', 'error', 'failed'].includes(row.status)).length }),
  }
}
function pendingReleaseRows(snapshot: ConsumptionSnapshot): readonly { readonly localTicketId: string; readonly label: string | null }[] { return snapshot.pendingRelease ?? [] }
function protocol(snapshot: ConsumptionSnapshot): string {
  const p = snapshot.policy
  const lines = ['Instrument state: current effective policy supersedes earlier instrument instructions.',
    'Business records are author reports, not program execution/S receipts or physical resource proof. Skills, user agreements and task documents govern completion, delivery, pause, cancellation, reopening and questions. Register pending decisions when you judge them necessary.',
    'T and S are this session\'s configured limits. Limits, registered usage and program-fact coverage are reported below; null means unknown, never zero. Native host permissions still apply.',
    'mattpocock_record records business progress and decisions; mattpocock_execute records supported execution facts. Capability/health facts below state actual coverage. Display preferences do not erase obligations.',
    'Worktree relationships record actual child/worktree binding and authored use/cleanup reports. Abandoned but uncleaned trees remain relevant; borrowed detachment is not physical cleanup.',
    'This is a bounded current view, not complete history. Each category reports shown/total/more and query locators; truncated fields retain source pointers. Use session history queries for omitted details.']
  if (!p.extensionEnabled) lines.push('Management feature is OFF: existing records and execution facts remain.')
  else if (p.workspaceEnabled === false) lines.push('Management feature is OFF for this workspace: existing records and execution facts remain.')
  else if (p.features.windows.status === 'configured') {
    lines.push('Windows explicitly enabled: mattpocock_window records explicit T reserve/release/reacquire independently of S. Only trusted program receipts release S, never a business completion label.')
    lines.push('Ticket discipline: every ticket you reserve or delegate work on must already exist in this instrument. Record it first with mattpocock_record put-ticket (workflowId + localTicketId + title + statuses); mattpocock_window reserve and mattpocock_delegate reject an unregistered ticket, and the rejection names it. Ticketless research runs are allowed only by omitting workflowId entirely — then there is no ticket and no T requirement.')
    lines.push('Work-in-progress discipline: the T window is how many tickets may be in flight at once, not a quota. Take each ticket to its declared delivered state (or record it blocked by name) before opening the next one on that lane — spreading partial progress over many tickets is exactly what T exists to prevent. An empty slot needs no excuse; a held slot whose ticket has already reached a delivered or blocked state is yours to release with mattpocock_window release, and nothing releases it for you.')
    const pendingRelease=pendingReleaseRows(snapshot)
    if(pendingRelease.length>0)lines.push('T pending release: '+pendingRelease.map(row=>row.localTicketId+(row.label===null?'':' ('+row.label+')')).join(', ')+' — call mattpocock_window release with that ticket\'s generation; the slot stays held until you do.')
  }
  else if (p.features.windows.status === 'disabled') lines.push('Windows are OFF: preserve existing execution facts and records.')
  else lines.push('Windows are unsupported for this policy: usage coverage remains explicit in capabilities; missing facts are not known/free slots.')
  return lines.join('\n')
}
function diagnostic(identity: ConsumptionIdentity, reason: string): string {
  return 'Instrument state unknown: ' + reason + '. No current policy, capacity or resource facts are asserted. Preserve ordinary native business input; this diagnostic is not a cancellation or a business decision.\n' +
    canonical({ sessionId: identity.sessionId, instrumentInstanceId: identity.instrumentInstanceId, ownerSessionId: identity.ownerSessionId })
}

function stale(verified: string, reason: string): string {
  return 'Instrument state stale: the last successfully captured snapshot is shown because the refresh failed with ' + reason
    + '. These facts may be out of date and are not current capacity, completion or release proof; a fresh read is retried.\n' + verified
}

/** A parent consumption seam; it owns neither native admission nor message delivery. */
export class InstrumentConsumption {
  readonly #options: ConsumptionOptions
  readonly #timeoutMs: number
  readonly #maxPending: number
  readonly #commits = new Map<string, Set<Commit>>()
  readonly #overflow = new Map<string, { pending: number }>()
  readonly #cache = new Map<string, Cached>()
  readonly #cacheMax = 64
  #sequence = 0
  constructor(options: ConsumptionOptions) {
    this.#timeoutMs = bounded(options.timeoutMs, 1000, 10000, 'timeoutMs')
    this.#maxPending = bounded(options.maxPendingCommits, 1024, 65536, 'maxPendingCommits')
    this.#options = Object.freeze({ ...options })
    options.bindProgram?.(Object.freeze({ trackCommit: (instanceId: string, commit: Promise<unknown>): void => this.#track(instanceId, commit) }))
  }
  /** Bounded insertion-ordered cache: a long-lived host must not retain one text per session ever seen. */
  #store(key: string, entry: Cached): void {
    this.#cache.delete(key)
    this.#cache.set(key, entry)
    while (this.#cache.size > this.#cacheMax) this.#cache.delete(this.#cache.keys().next().value as string)
  }
  #track(instanceId: string, promise: Promise<unknown>): void {
    if (typeof instanceId !== 'string' || !instanceId.trim()) throw new TypeError('commit requires a trusted instance ID')
    let commits = this.#commits.get(instanceId)
    if (!commits) { commits = new Set(); this.#commits.set(instanceId, commits) }
    if (commits.size >= this.#maxPending) {
      let overflow = this.#overflow.get(instanceId)
      if (!overflow) { overflow = { pending: 0 }; this.#overflow.set(instanceId, overflow) }
      overflow.pending++
      // Retain unknown until untracked work settles; observe rejection without cancelling it.
      const state = overflow
      void Promise.resolve(promise).then(() => { state.pending-- }, () => { state.pending-- })
      return
    }
    const entries = commits
    const commit: Commit = { done: Promise.resolve(), failed: false }
    entries.add(commit) // synchronous registration precedes any parent capture
    commit.done = Promise.resolve(promise).then(() => {
      entries.delete(commit)
      if (entries.size === 0 && this.#commits.get(instanceId) === entries) this.#commits.delete(instanceId)
    }, () => { commit.failed = true })
  }
  /** Last prepared projection for this identity, including degraded text whose retry is still
   * pending. Fresh is true only for a verified snapshot; degraded text never replays as current. */
  prepared(identity: ConsumptionIdentity): { readonly text: string; readonly fresh: boolean } | null {
    const cached = this.#cache.get(cacheKey(checkedIdentity(identity)))
    return cached === undefined ? null : { text: cached.text, fresh: cached.valid }
  }
  /** The last successfully captured text marked stale for `reason`, or null when nothing was
   * captured. Used when the caller cannot even resolve its identity but is already retained. */
  degraded(identity: ConsumptionIdentity, reason: string): string | null {
    const cached = this.#cache.get(cacheKey(checkedIdentity(identity)))
    return cached === undefined || cached.verified === null ? null : stale(cached.verified, reason)
  }
  cachedText(identity: ConsumptionIdentity): string | null {
    const cached = this.#cache.get(cacheKey(checkedIdentity(identity)))
    return cached?.valid ? cached.text : null
  }
  async readForConsumption(input: ConsumptionIdentity, signal?: AbortSignal): Promise<ConsumptionResult> {
    signal?.throwIfAborted()
    const identity = checkedIdentity(input)
    const key = cacheKey(identity)
    const sequence = ++this.#sequence
    // Freeze a frontier once. New commits, other instances and child lifetimes are not awaited.
    const frontier = [...(this.#commits.get(identity.instrumentInstanceId) ?? [])]
    const overflow = this.#overflow.has(identity.instrumentInstanceId)
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let rejectStop: (reason: unknown) => void = () => {}
    const stopped = new Promise<never>((_, reject) => { rejectStop = reject })
    const onAbort = (): void => { controller.abort(signal?.reason); rejectStop(signal?.reason) }
    signal?.addEventListener('abort', onAbort, { once: true })
    timer = setTimeout(() => {
      const error = new ConsumptionFailure('consumption-timeout')
      controller.abort(error); rejectStop(error)
    }, this.#timeoutMs)
    const read = async (): Promise<ConsumptionSnapshot> => {
      await Promise.all(frontier.map(commit => commit.done))
      controller.signal.throwIfAborted()
      if (overflow) throw new ConsumptionFailure('commit-frontier-overflow')
      if (frontier.some(commit => commit.failed)) throw new ConsumptionFailure('durability-commit-failed')
      // The runtime builds a deeply frozen snapshot and no consumer mutates it, so the read is
      // detached by construction: cloning 100+ KB of rows on every assembly pass bought nothing.
      const snapshot = await this.#options.readSnapshot(identity, controller.signal)
      controller.signal.throwIfAborted()
      verify(snapshot, identity)
      return snapshot
    }
    try {
      const snapshot = await Promise.race([read(), stopped])
      signal?.throwIfAborted()
      const previous = this.#cache.get(key)
      if (previous && sequence < previous.sequence) throw new ConsumptionFailure('superseded-read')
      // The projection is built here with fixed key order and deterministic row sorting, so a plain
      // stringify is a stable fingerprint; the previous canonical (recursively sorted) walk cost
      // several milliseconds per assembly pass for the same bytes.
      const fingerprint = JSON.stringify(facts(snapshot))
      const text = protocol(snapshot) + '\nCurrent runtime facts (null means unavailable/unknown, not zero):\n' + fingerprint
      const changed = !previous?.valid || previous.fingerprint !== fingerprint
      const unhealthy = snapshot.health.some(row => ['stale', 'unknown', 'unavailable', 'error', 'failed'].includes(row.status))
      // A late older read cannot regress a newer projection/cache. Unknown details are
      // still returned, but a degraded snapshot cannot be replayed as fresh context.
      if (!previous || sequence >= previous.sequence) this.#store(key, { text, verified: text, fingerprint, valid: !unhealthy, sequence })
      return { text: changed ? text : null, snapshot, freshness: unhealthy ? 'stale' : 'current', ...(unhealthy ? { reason: 'snapshot-health-degraded' } : {}) }
    } catch (error) {
      signal?.throwIfAborted() // exact caller reason; never convert cancellation into a diagnostic
      const reason = error instanceof ConsumptionFailure ? error.reason : 'snapshot-read-failed'
      const previous = this.#cache.get(key)
      const latest = previous !== undefined && sequence >= previous.sequence
      // A failed refresh must not blank the instrument: the last verified snapshot is re-offered
      // as explicitly stale text. It is never published as fresh, and the entry is invalidated,
      // so the retry still takes the full read once the gate window opens.
      const text = latest && previous.verified !== null ? stale(previous.verified, reason) : diagnostic(identity, reason)
      if (latest) this.#store(key, { ...previous, text, valid: false, sequence })
      if (reason === 'durability-commit-failed') {
        const commits = this.#commits.get(identity.instrumentInstanceId)
        for (const commit of frontier) if (commit.failed) commits?.delete(commit)
        if (commits?.size === 0) this.#commits.delete(identity.instrumentInstanceId)
      }
      if (overflow && this.#overflow.get(identity.instrumentInstanceId)?.pending === 0) this.#overflow.delete(identity.instrumentInstanceId)
      return { text, freshness: latest && previous.verified !== null ? 'stale' : 'unavailable', reason }
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
  }
}
