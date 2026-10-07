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
  readonly sessionId: string
  readonly instance: InstrumentInstance
  readonly policy: EffectivePolicy
  readonly records: InstrumentSnapshot | null
  readonly windows: WindowSnapshot | null
  readonly resources: readonly ResourceView[]
  /** Authorized current rows, already filtered by runtime; never the durable registry/history. */
  readonly worktreeBindings?: readonly WorktreeBindingCurrent[]
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
interface Cached { text: string; fingerprint: string; valid: boolean; sequence: number }
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
function historyLocator(kind: string, row?: Record<string, unknown>): QueryLocator {
  const names: Readonly<Record<string, string>> = { workflows: 'workflow', tickets: 'ticket', decisions: 'decision',
    'status-summary': 'workflow', 'ticket-window': 'ticket-window', executions: 'execution', resources: 'resource', worktree: 'worktree' }
  let recordId: string | undefined
  if (row) {
    if (typeof row.bindingId === 'string') recordId = row.bindingId
    else if (typeof row.resourceId === 'string') recordId = row.resourceId
    else if (typeof row.executionId === 'string') recordId = JSON.stringify([row.executionId, row.generation])
    else if (typeof row.localTicketId === 'string') recordId = JSON.stringify([row.workflowId, row.localTicketId])
    else if (typeof row.decisionId === 'string') recordId = JSON.stringify([row.workflowId, row.decisionId])
    else if (typeof row.workflowId === 'string') recordId = row.workflowId
  }
  return { tool: 'mattpocock_history', action: 'query', query: { kind: names[kind] ?? kind, ...(recordId === undefined ? {} : { recordId }), limit: 20 } }
}
function brief(value: unknown, query: QueryLocator, depth = 0, textBudget = FIELD_TEXT_BUDGET): unknown {
  if (typeof value === 'string') return value.length <= textBudget ? value : {
    text: value.slice(0, textBudget), truncated: true, originalChars: value.length, query,
  }
  if (value === null || typeof value !== 'object') return value
  if (depth >= 6) return { truncated: true, query }
  if (Array.isArray(value)) {
    const rows = value.slice(0, 8).map(entry => brief(entry, query, depth + 1, textBudget))
    return rows.length === value.length ? rows : { rows, shown: rows.length, total: value.length, more: true, truncated: true, query }
  }
  const entries = Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
  const selected = entries.slice(0, 32)
  return { ...Object.fromEntries(selected.map(([key, entry]) => [key, brief(entry, query, depth + 1, textBudget)])),
    ...(selected.length < entries.length ? { truncated: true, totalFields: entries.length, query } : {}) }
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
    query, currentFactsSignature, ...(counts === undefined ? {} : { counts }) })
  for (let index = 0; index < rows.length; index++) {
    const raw = rows[index] as Record<string, unknown>
    const locator = historyLocator(kind, raw)
    let row = brief({ ...raw, query: locator }, locator)
    if (canonical(row).length > 1000) {
      // Keep a readable identifier/state while referring to the full authored payload.
      const keys = ['workflowId', 'localTicketId', 'decisionId', 'executionId', 'generation', 'resourceId', 'bindingId', 'sourceRevision', 'state', 'held', 'status']
      const value = raw.value !== null && typeof raw.value === 'object' ? raw.value as Record<string, unknown> : null
      const details = ['title', 'question', 'status', 'pending', 'awaitingImplementation', 'result', 'business', 'acceptance', 'outcome']
      row = { ...Object.fromEntries(keys.filter(key => Object.hasOwn(raw, key)).map(key => [key, brief(raw[key], locator, 0, 96)])),
        ...(value ? { value: brief(Object.fromEntries(details.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]])), locator, 0, 96) } : {}),
        ...(typeof raw.result === 'string' ? { result: brief(raw.result, locator, 0, 96) } : {}),
        truncated: true, query: locator }
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
    })), { kind: 'worktree' }),
    capabilities: category(sorted(snapshot.capabilities, row => row.key), { kind: 'capabilities' }),
    health: category(sorted(snapshot.health, row => row.scope), { kind: 'health' }, {
      unknown: snapshot.health.filter(row => ['stale', 'unknown', 'unavailable', 'error', 'failed'].includes(row.status)).length }),
  }
}
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
    lines.push('Windows explicitly enabled: mattpocock_window records explicit T reserve/release/reacquire independently of S. Only trusted program receipts release S, never a business completion label. Ticketless work has no T requirement: do not invent tickets.')
    lines.push('Ticket discipline: T slots are held and worked in parallel up to the configured T limit. Each slot stays bound to its ticket until that ticket reaches its declared delivered state, or is blocked with no further implementable work (waiting on a user decision, an external dependency, an upstream ticket, or similar); that is when the slot may be released and reused for a new ticket. While a ticket is still partially implemented, its T slot should not be released or reacquired merely to make room for a different ticket.')
  }
  else if (p.features.windows.status === 'disabled') lines.push('Windows are OFF: preserve existing execution facts and records.')
  else lines.push('Windows are unsupported for this policy: usage coverage remains explicit in capabilities; missing facts are not known/free slots.')
  return lines.join('\n')
}
function diagnostic(identity: ConsumptionIdentity, reason: string): string {
  return 'Instrument state unknown: ' + reason + '. No current policy, capacity or resource facts are asserted. Preserve ordinary native business input; this diagnostic is not a cancellation or a business decision.\n' +
    canonical({ sessionId: identity.sessionId, instrumentInstanceId: identity.instrumentInstanceId, ownerSessionId: identity.ownerSessionId })
}

/** A parent consumption seam; it owns neither native admission nor message delivery. */
export class InstrumentConsumption {
  readonly #options: ConsumptionOptions
  readonly #timeoutMs: number
  readonly #maxPending: number
  readonly #commits = new Map<string, Set<Commit>>()
  readonly #overflow = new Map<string, { pending: number }>()
  readonly #cache = new Map<string, Cached>()
  #sequence = 0
  constructor(options: ConsumptionOptions) {
    this.#timeoutMs = bounded(options.timeoutMs, 1000, 10000, 'timeoutMs')
    this.#maxPending = bounded(options.maxPendingCommits, 1024, 65536, 'maxPendingCommits')
    this.#options = Object.freeze({ ...options })
    options.bindProgram?.(Object.freeze({ trackCommit: (instanceId: string, commit: Promise<unknown>): void => this.#track(instanceId, commit) }))
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
      const snapshot = structuredClone(await this.#options.readSnapshot(identity, controller.signal))
      controller.signal.throwIfAborted()
      verify(snapshot, identity)
      return snapshot
    }
    try {
      const snapshot = await Promise.race([read(), stopped])
      signal?.throwIfAborted()
      const fingerprint = canonical(facts(snapshot))
      const text = protocol(snapshot) + '\nCurrent runtime facts (null means unavailable/unknown, not zero):\n' + fingerprint
      const previous = this.#cache.get(key)
      if (previous && sequence < previous.sequence) throw new ConsumptionFailure('superseded-read')
      const changed = !previous?.valid || previous.fingerprint !== fingerprint
      const unhealthy = snapshot.health.some(row => ['stale', 'unknown', 'unavailable', 'error', 'failed'].includes(row.status))
      // A late older read cannot regress a newer projection/cache. Unknown details are
      // still returned, but a degraded snapshot cannot be replayed as fresh context.
      if (!previous || sequence >= previous.sequence) this.#cache.set(key, { text, fingerprint, valid: !unhealthy, sequence })
      return { text: changed ? text : null, snapshot, freshness: unhealthy ? 'stale' : 'current', ...(unhealthy ? { reason: 'snapshot-health-degraded' } : {}) }
    } catch (error) {
      signal?.throwIfAborted() // exact caller reason; never convert cancellation into a diagnostic
      const reason = error instanceof ConsumptionFailure ? error.reason : 'snapshot-read-failed'
      const previous = this.#cache.get(key)
      if (previous && sequence >= previous.sequence) this.#cache.set(key, { ...previous, valid: false, sequence })
      if (reason === 'durability-commit-failed') {
        const commits = this.#commits.get(identity.instrumentInstanceId)
        for (const commit of frontier) if (commit.failed) commits?.delete(commit)
        if (commits?.size === 0) this.#commits.delete(identity.instrumentInstanceId)
      }
      if (overflow && this.#overflow.get(identity.instrumentInstanceId)?.pending === 0) this.#overflow.delete(identity.instrumentInstanceId)
      return { text: diagnostic(identity, reason), freshness: previous ? 'stale' : 'unavailable', reason }
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
  }
}
