import { createElement as h, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { ReactElement, ChangeEvent, SyntheticEvent } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Button, Checkbox, Input, CodeBlock, DisclosureRow, IconSparkleRegular, JsonBlock } from '@deepseek-ai/dsh-client-ui-primitives'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PluginConfigViewProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { BrowserNotificationPreferencesPanel, DecisionNotifications, notificationScope } from './client-notifications.js'
import { parsePolicyIntent, parsePolicySnapshot, resolvePolicy, FEATURE_NAMES, DISPLAY_NAMES } from './controls/policy.js'
import type { EffectivePolicy, PolicyField, PolicyIntent, PolicySnapshot } from './controls/policy.js'
import { ownSupervisionLeaf, parseSupervisionConfigSnapshot, resolveSupervisionSettings, setSupervisionLeaf, supervisionIntentOf } from './controls/supervision-config.js'
import type { SupervisionConfigIntent, SupervisionConfigSnapshot, SupervisionField, SupervisionSettings } from './controls/supervision-config.js'
import { parseSupervisionDocument } from './controls/supervision-audit.js'
import type { SupervisionEpisode } from './controls/supervision-audit.js'
import type { InstrumentCurrentTaskReference, InstrumentDecisionTime, InstrumentSnapshot } from './controls/instruments.js'
import type { DecisionRecord, InstrumentCommand } from './controls/instrument-state.js'
import type { WindowSnapshot } from './controls/windows.js'
import type { WorktreeBindingCurrent } from './controls/worktree-bindings.js'
import type { WorktreeObservationView } from './controls/worktree-observations.js'
import type { NativeExecutionView } from './controls/native-executions.js'
import { REMOTE_CONTRIBUTION, parseHostJson, parsePolicyGrants, SUMMARY_BATCH_LIMIT, SUMMARY_RESPONSE_LIMIT, parseSessionSummaryBatch, parseSessionSummaryRequest } from './controls/remote-contract.js'
import type { ControlsRemote as HostControlsRemote, HostJson, HostCaller, NativeStopRow, PolicyGrants, RuntimeSnapshot, SessionSummary, SessionSummaryBatch } from './controls/remote-contract.js'

export const PACKAGE_NAME = '@lmgatex/dsh-mattpocock-skills'
export const TAB_KIND = 'mattpocock-collaboration'
export const TAB_ID = PACKAGE_NAME + ':collaboration'
export const ROW_KEY = PACKAGE_NAME + '#dsh-mattpocock-skills'
export const OWN_TOOL_NAMES = ['mattpocock_record', 'mattpocock_window', 'mattpocock_resource', 'mattpocock_controls', 'mattpocock_assign', 'mattpocock_history', 'mattpocock_worktree', 'mattpocock_delegate', 'mattpocock_audit'] as const
export const UNSUPPORTED_SEATS = Object.freeze([
  { key: 'secondary-header', reason: 'No additive full-width secondary session header slot.' },
  { key: 'persistent-session-list-badge', reason: 'Native leading decoration is idle-only; hover detail is hover-only.' },
  { key: 'background-tab-open', reason: 'Native openTab selects and expands; no background/no-focus option.' },
])

export interface CapabilityView { readonly key: string; readonly status: string; readonly reason: string | null }
export interface WorkspaceChoice { readonly workspaceId: string; readonly label: string; readonly verified: boolean; readonly sessionIds: readonly string[] | null }
export type ClientSessionSnapshot = RuntimeSnapshot
type RemoteProjection<T> = { [K in keyof T]: T[K] extends (...args: infer A) => Promise<infer R> ? (...args: A) => Promise<RemoteResult<R>> : never }
export type ControlsRemote = RemoteProjection<HostControlsRemote>

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a record from the Host')
  return value as Record<string, unknown>
}
function nonempty(value: unknown): string { if (typeof value !== 'string' || !value.trim()) throw new Error('Host identity is unavailable'); return value }
function remoteValue<T>(result: RemoteResult<T>): T { if (!result.ok) throw result.error; return result.value }
function errorText(error: unknown): string { return error instanceof Error ? error.message : String(error) }

/** Additional UI boundary check: an arriving result must belong to the requested Session. */
export function decodeSession(value: unknown, sessionId: string): ClientSessionSnapshot {
  const parsed = parseHostJson(value)
  const raw = object(parsed)
  if (raw.sessionId !== sessionId) throw new Error('Session snapshot belongs to a different caller Session')
  const caller = object(raw.caller)
  nonempty(caller.principalId)
  if ((caller.kind !== 'user' && caller.kind !== 'agent') || (caller.kind === 'user' ? caller.sessionId !== null : caller.sessionId !== sessionId)) throw new Error('Host caller identity is inconsistent')
  parsePolicyGrants(raw.policyGrants)
  const instance = object(raw.instance)
  nonempty(instance.instrumentInstanceId); nonempty(instance.ownerSessionId); nonempty(instance.controlWorkspaceId)
  const policy = object(raw.policy)
  if (policy.controlWorkspaceId !== instance.controlWorkspaceId) throw new Error('Policy and instance workspace disagree')
  const display = object(policy.display); object(policy.features); const capacities = object(policy.windows)
  for (const key of DISPLAY_NAMES) if (typeof display[key] !== 'boolean') throw new Error('Display policy is unavailable')
  for (const key of ['ticketWindowSize', 'runningSubagentLimit']) { const value = capacities[key]; if (value !== null && (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)) throw new Error('Window capacity is unavailable') }
  for (const key of ['records', 'windows'] as const) {
    if (raw[key] === null) continue
    const child = object(raw[key]); const bound = object(child.instance)
    if (bound.instrumentInstanceId !== instance.instrumentInstanceId || bound.ownerSessionId !== instance.ownerSessionId) throw new Error('Instrument snapshot belongs to a different instance')
  }
  if (!Array.isArray(raw.resources) || !Array.isArray(raw.capabilities) || !Array.isArray(raw.health)) throw new Error('Host snapshot sections are unavailable')
  return parsed as unknown as ClientSessionSnapshot
}

export type Observation<T> =
  | { readonly status: 'unknown'; readonly value: null; readonly error: string | null }
  | { readonly status: 'ready'; readonly value: T; readonly error: null }

/** Document visibility is a polling hint, not a claim about row viewport visibility. */
function documentHidden(): boolean { return typeof document !== 'undefined' && document.visibilityState === 'hidden' }
/** Per-Session, mounted-only observation. It never creates an instance or wakes a model. */
export class SessionObserver {
  private state: Observation<ClientSessionSnapshot> = { status: 'unknown', value: null, error: null }
  private readonly listeners = new Set<() => void>()
  private holds = 0
  private generation = 0
  private timer: ReturnType<typeof setTimeout> | undefined
  private closed = false
  private controller: AbortController | undefined
  private lastPolicy: EffectivePolicy | null = null
  getDisplay = (): EffectivePolicy['display'] | undefined => this.lastPolicy?.display
  constructor(readonly sessionId: string, private readonly read: (sessionId: string, signal?: AbortSignal) => Promise<RemoteResult<unknown>>, private readonly intervalMs = 5000) {}
  getSnapshot = (): Observation<ClientSessionSnapshot> => this.state
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  retain = (): (() => void) => {
    if (this.closed) throw new Error('Session observer has been disposed')
    if (this.holds++ === 0) { this.publish({ status: 'unknown', value: null, error: null }); void this.refresh() }
    let released = false
    return () => { if (released || this.closed) return; released = true; if (--this.holds === 0) { this.generation++; this.controller?.abort(); this.clearTimer(); this.state = { status: 'unknown', value: null, error: null } } }
  }
  refresh = async (): Promise<void> => {
    if (this.closed || this.holds === 0) return
    this.clearTimer()
    const generation = ++this.generation
    this.controller?.abort()
    const request = new AbortController(); this.controller = request
    try {
      const value = decodeSession(remoteValue(await this.read(this.sessionId, request.signal)), this.sessionId)
      if (generation !== this.generation || this.closed || this.holds === 0) return
      this.lastPolicy = value.policy
      this.publish({ status: 'ready', value, error: null })
    } catch (error) {
      if (generation !== this.generation || this.closed || this.holds === 0) return
      this.publish({ status: 'unknown', value: null, error: errorText(error) })
    } finally {
      if (generation === this.generation && !this.closed && this.holds > 0 && this.intervalMs > 0) {
        // A hidden tab has no visible badge to keep current; backing off avoids N full snapshot
        // reads per interval for every row while the user is elsewhere.
        const delay = documentHidden() ? Math.max(this.intervalMs * 4, 30_000) : this.intervalMs
        this.timer = setTimeout(() => { void this.refresh() }, delay)
      }
    }
  }
  dispose(): void { this.closed = true; this.generation++; this.controller?.abort(); this.holds = 0; this.clearTimer(); this.state = { status: 'unknown', value: null, error: 'Observer disposed' }; this.listeners.clear() }
  private clearTimer(): void { if (this.timer !== undefined) clearTimeout(this.timer); this.timer = undefined }
  private publish(state: Observation<ClientSessionSnapshot>): void { this.state = state; for (const listener of this.listeners) listener() }
}

export type SessionObservation = Pick<SessionObserver, 'sessionId' | 'getSnapshot' | 'getDisplay' | 'subscribe' | 'retain' | 'refresh'>
const SESSION_UNKNOWN: Observation<ClientSessionSnapshot> = Object.freeze({ status: 'unknown', value: null, error: null })
interface FullCacheEntry { readonly observer: SessionObserver; active: number; idleSince: number }
/** Faces carry lazy handles, never bare evictable observers. A render-to-effect gap and
 * even a previously evicted native face can reacquire the single current Session entry.
 * TTL is checked on registry activity; the last full holder already clears its snapshot.
 * Only transient UI metadata is evicted, never durable records or model consumption. */
export class SessionObserverCache {
  private readonly entries = new Map<string, FullCacheEntry>()
  private closed = false
  constructor(private readonly read: (sessionId: string, signal?: AbortSignal) => Promise<RemoteResult<unknown>>, private readonly intervalMs = 5000,
    private readonly idleTtlMs = 60_000, private readonly maxIdle = 64) {}
  get size(): number { return this.entries.size }
  observe(sessionId: string): SessionObservation {
    nonempty(sessionId)
    const acquire = (action: (observer: SessionObserver) => () => void): (() => void) => {
      if (this.closed) throw new Error('Session observer cache has been disposed')
      this.prune()
      let entry = this.entries.get(sessionId)
      if (entry === undefined) { entry = { observer: new SessionObserver(sessionId, this.read, this.intervalMs), active: 0, idleSince: Date.now() }; this.entries.set(sessionId, entry) }
      entry.active++
      const cleanup = action(entry.observer), held = entry
      let released = false
      return () => { if (released) return; released = true; cleanup(); if (--held.active === 0) held.idleSince = Date.now(); this.prune() }
    }
    return { sessionId,
      getSnapshot: () => this.entries.get(sessionId)?.observer.getSnapshot() ?? SESSION_UNKNOWN,
      getDisplay: () => this.entries.get(sessionId)?.observer.getDisplay(),
      subscribe: listener => acquire(observer => observer.subscribe(listener)), retain: () => acquire(observer => observer.retain()),
      refresh: async () => { await this.entries.get(sessionId)?.observer.refresh() },
    }
  }
  refreshAll(): void { for (const entry of this.entries.values()) if (entry.active > 0) void entry.observer.refresh() }
  dispose(): void { this.closed = true; for (const entry of this.entries.values()) entry.observer.dispose(); this.entries.clear() }
  private prune(): void {
    const idle = [...this.entries].filter(([, entry]) => entry.active === 0).sort((a, b) => a[1].idleSince - b[1].idleSince)
    for (let i = 0; i < idle.length; i++) { const [id, entry] = idle[i]!; if (Date.now() - entry.idleSince >= this.idleTtlMs || idle.length - i > this.maxIdle) { entry.observer.dispose(); this.entries.delete(id) } }
  }
}

interface SummaryEntry {
  readonly sessionId: string
  readonly handle: SummaryObserver
  readonly listeners: Set<() => void>
  state: Observation<SessionSummary>
  display: EffectivePolicy['display'] | undefined
  policyRevision: number | undefined
  version: string | undefined
  holds: number
  /** A continuously held cohort; refresh changes generation, reacquisition changes lifetime. */
  lifetime: number
  generation: number
  failures: number
  served: number
  due: number
  idleSince: number
  flight: SummaryFlight | undefined
}
interface SummaryFlight {
  readonly controller: AbortController
  readonly members: readonly { readonly entry: SummaryEntry; readonly lifetime: number; readonly generation: number; readonly version: string | undefined }[]
  readonly deadline: number
  expired: boolean
}
type SummaryRead = (request: { readonly sessions: readonly { readonly sessionId: string; readonly version?: string }[] }, signal?: AbortSignal) => Promise<RemoteResult<SessionSummaryBatch>>
const SUMMARY_UNKNOWN: Observation<SessionSummary> = Object.freeze({ status: 'unknown', value: null, error: null })
function boundedSummaryBytes(value: unknown): void {
  const text = JSON.stringify(value)
  if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > SUMMARY_RESPONSE_LIMIT) throw new Error('Summary batch exceeds its byte budget')
}
/** A lightweight handle, not a second per-Session timer. Old handles route back through the
 * shared registry after idle eviction, so a native injected face cannot retain a dead observer. */
export class SummaryObserver {
  constructor(readonly sessionId: string, private readonly scheduler: SummaryScheduler) {}
  getSnapshot = (): Observation<SessionSummary> => this.scheduler.snapshot(this.sessionId)
  getDisplay = (): EffectivePolicy['display'] | undefined => this.scheduler.display(this.sessionId)
  getConfigurationRevision = (): number | undefined => this.scheduler.configurationRevision(this.sessionId)
  subscribe = (listener: () => void): (() => void) => this.scheduler.subscribe(this.sessionId, listener)
  retain = (): (() => void) => this.scheduler.retain(this.sessionId)
  refresh = (): void => this.scheduler.refresh(this.sessionId)
}
/** One scheduler per mounted plugin namespace: 32 identities per batch, two requests in flight,
 * one timer, and no host Session activation. Only mounted holders become query work. */
export class SummaryScheduler {
  private readonly entries = new Map<string, SummaryEntry>()
  private readonly flights = new Set<SummaryFlight>()
  private sequence = 0
  private timer: ReturnType<typeof setTimeout> | undefined
  private closed = false
  private hidden = documentHidden()
  private readonly onVisibility = (): void => {
    const hidden = documentHidden(), restored = this.hidden && !hidden
    this.hidden = hidden
    if (restored) this.refresh()
    else if (hidden) { for (const entry of this.entries.values()) if (entry.holds > 0 && entry.flight === undefined) entry.due = Math.max(entry.due, Date.now() + 30_000); this.arm() }
  }
  constructor(private readonly read: SummaryRead, private readonly intervalMs = 5000, private readonly idleTtlMs = 60_000, private readonly maxIdle = 64) {
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisibility)
  }
  get size(): number { return this.entries.size }
  observe(sessionId: string): SummaryObserver { nonempty(sessionId); return this.entries.get(sessionId)?.handle ?? new SummaryObserver(sessionId, this) }
  snapshot(sessionId: string): Observation<SessionSummary> { return this.entries.get(sessionId)?.state ?? SUMMARY_UNKNOWN }
  display(sessionId: string): EffectivePolicy['display'] | undefined { return this.entries.get(sessionId)?.display }
  configurationRevision(sessionId: string): number | undefined { return this.entries.get(sessionId)?.policyRevision }
  subscribe(sessionId: string, listener: () => void): () => void {
    const entry = this.entry(sessionId); entry.listeners.add(listener)
    return () => { entry.listeners.delete(listener); this.prune() }
  }
  retain(sessionId: string): () => void {
    if (this.closed) throw new Error('Summary scheduler has been disposed')
    const entry = this.entry(sessionId)
    if (entry.holds++ === 0) { entry.lifetime++; entry.generation++; entry.due = Date.now(); this.publish(entry, SUMMARY_UNKNOWN); this.arm() }
    let released = false
    return () => {
      if (released || this.closed) return
      released = true
      if (--entry.holds === 0) {
        entry.generation++; entry.state = SUMMARY_UNKNOWN; entry.version = undefined; entry.failures = 0; entry.idleSince = Date.now()
        const flight = entry.flight
        if (flight !== undefined && !flight.members.some(member => this.current(member, flight))) flight.controller.abort()
        this.prune(); this.arm()
      }
    }
  }
  refresh(sessionId?: string): void {
    if (this.closed) return
    for (const entry of this.entries.values()) if (entry.holds > 0 && (sessionId === undefined || entry.sessionId === sessionId)) { entry.generation++; entry.due = Date.now() }
    for (const flight of this.flights) if (!flight.members.some(member => this.current(member, flight))) flight.controller.abort()
    this.arm()
  }
  dispose(): void {
    this.closed = true; this.clearTimer()
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility)
    for (const flight of this.flights) flight.controller.abort()
    for (const entry of this.entries.values()) { entry.generation++; entry.state = SUMMARY_UNKNOWN; entry.listeners.clear(); entry.holds = 0 }
    this.entries.clear()
  }
  private entry(sessionId: string): SummaryEntry {
    let entry = this.entries.get(sessionId)
    if (entry === undefined) {
      this.prune()
      entry = { sessionId, handle: new SummaryObserver(sessionId, this), listeners: new Set(), state: SUMMARY_UNKNOWN, display: undefined, policyRevision: undefined, version: undefined,
        holds: 0, lifetime: 0, generation: 0, failures: 0, served: 0, due: Infinity, idleSince: Date.now(), flight: undefined }
      this.entries.set(sessionId, entry)
    }
    return entry
  }
  private prune(): void {
    const idle = [...this.entries.values()].filter(entry => entry.holds === 0 && entry.listeners.size === 0 && entry.flight === undefined).sort((a, b) => a.idleSince - b.idleSince)
    for (let i = 0; i < idle.length; i++) {
      const entry = idle[i]!
      if (Date.now() - entry.idleSince >= this.idleTtlMs || idle.length - i > this.maxIdle) this.entries.delete(entry.sessionId)
    }
  }
  private clearTimer(): void { if (this.timer !== undefined) clearTimeout(this.timer); this.timer = undefined }
  private arm(): void {
    this.clearTimer()
    if (this.closed) return
    const dates = [...this.flights].filter(flight => !flight.expired).map(flight => flight.deadline)
    if (this.flights.size < 2) for (const entry of this.entries.values()) if (entry.holds > 0 && entry.flight === undefined) dates.push(entry.due)
    const next = Math.min(...dates)
    if (Number.isFinite(next)) this.timer = setTimeout(() => this.pump(), Math.max(0, next - Date.now()))
  }
  private pump(): void {
    this.clearTimer()
    if (this.closed) return
    for (const flight of this.flights) if (!flight.expired && flight.deadline <= Date.now()) {
      flight.expired = true; flight.controller.abort()
      for (const member of flight.members) if (this.attached(member, flight)) this.fail(member.entry, new Error('Summary read timed out'))
    }
    while (this.flights.size < 2) {
      const entries = [...this.entries.values()].filter(entry => entry.holds > 0 && entry.flight === undefined && entry.due <= Date.now()).sort((a, b) => a.due - b.due || a.served - b.served).slice(0, SUMMARY_BATCH_LIMIT)
      if (entries.length === 0) break
      const flight: SummaryFlight = { controller: new AbortController(), members: entries.map(entry => ({ entry, lifetime: entry.lifetime, generation: entry.generation, version: entry.version })), deadline: Date.now() + 10_000, expired: false }
      for (const entry of entries) { entry.flight = flight; entry.due = Infinity; entry.served = ++this.sequence }
      this.flights.add(flight); void this.run(flight)
    }
    this.prune(); this.arm()
  }
  private attached(member: SummaryFlight['members'][number], flight: SummaryFlight): boolean {
    return !this.closed && this.entries.get(member.entry.sessionId) === member.entry && member.entry.holds > 0 && member.entry.lifetime === member.lifetime && member.entry.flight === flight
  }
  private current(member: SummaryFlight['members'][number], flight: SummaryFlight): boolean {
    return this.attached(member, flight) && member.entry.generation === member.generation
  }
  private delay(entry: SummaryEntry): number { return Math.max(documentHidden() ? 30_000 : 0, entry.failures === 0 ? this.intervalMs : Math.min(60_000, this.intervalMs * 2 ** Math.min(entry.failures - 1, 10))) }
  private fail(entry: SummaryEntry, error: unknown): void { entry.failures++; entry.version = undefined; entry.due = Date.now() + this.delay(entry); this.publish(entry, { status: 'unknown', value: null, error: errorText(error) }) }
  private publish(entry: SummaryEntry, state: Observation<SessionSummary>): void { entry.state = state; for (const listener of entry.listeners) listener() }
  private async run(flight: SummaryFlight): Promise<void> {
    try {
      const request = parseSessionSummaryRequest({ sessions: flight.members.map(member => ({ sessionId: member.entry.sessionId, ...(member.version === undefined ? {} : { version: member.version }) })) })
      boundedSummaryBytes(request)
      const value = remoteValue(await this.read(request, flight.controller.signal))
      if (this.closed || flight.expired) return
      boundedSummaryBytes(value)
      const batch = parseSessionSummaryBatch(value), expected = new Set(flight.members.map(member => member.entry.sessionId))
      if (batch.rows.length !== expected.size || batch.rows.some(row => !expected.has(row.sessionId))) throw new Error('Summary batch does not match requested Sessions')
      for (const member of flight.members) {
        if (!this.current(member, flight)) continue
        const row = batch.rows.find(row => row.sessionId === member.entry.sessionId)!, entry = member.entry
        if (row.status === 'unavailable') { this.fail(entry, row.reason); continue }
        if (row.status === 'unchanged') {
          if (member.version !== row.version || entry.version !== row.version || entry.state.status !== 'ready') { this.fail(entry, new Error('Unchanged summary has no matching current base')); continue }
        } else {
          entry.version = row.version; entry.display = row.summary.policy.display; entry.policyRevision = row.summary.policy.configurationRevision; this.publish(entry, { status: 'ready', value: row.summary, error: null })
        }
        entry.failures = 0; entry.due = Date.now() + this.delay(entry)
      }
    } catch (error) {
      const cancelled = flight.controller.signal.aborted && typeof error === 'object' && error !== null
        && (('code' in error && error.code === 'gateway/cancelled') || ('name' in error && error.name === 'AbortError'))
      // Real failures invalidate attached holders even after supersession; intentional
      // cancellation and an already-published timeout must not become another UI error.
      if (!flight.expired && !cancelled) for (const member of flight.members) if (this.attached(member, flight)) this.fail(member.entry, error)
    } finally {
      this.flights.delete(flight)
      for (const member of flight.members) if (member.entry.flight === flight) member.entry.flight = undefined
      this.prune(); this.arm()
    }
  }
}

type PolicyLeafValue = boolean | number | EffectivePolicy['pendingDecisions']['interactionMode'] | undefined
/** Changes a draft only. undefined deletes a leaf and restores inheritance. */
export function setPolicyLeaf(intent: PolicyIntent, workspaceId: string | null, field: PolicyField, value: PolicyLeafValue): PolicyIntent {
  const [group, key] = field.split('.')
  if (group === undefined || key === undefined) throw new Error('Invalid policy field')
  const current = workspaceId === null ? intent.defaults : intent.workspaceOverrides[workspaceId] ?? {}
  const patch = object(structuredClone(current))
  const leaf = { ...(patch[group] === undefined ? {} : object(patch[group])) }
  if (value === undefined) delete leaf[key]; else leaf[key] = value
  if (Object.keys(leaf).length) patch[group] = leaf; else delete patch[group]
  const overrides = { ...intent.workspaceOverrides }
  if (workspaceId !== null) { if (Object.keys(patch).length) Object.defineProperty(overrides, workspaceId, { value: patch, enumerable: true, configurable: true }); else delete overrides[workspaceId] }
  return parsePolicyIntent({ extensionEnabled: intent.extensionEnabled, defaults: workspaceId === null ? patch : intent.defaults, workspaceOverrides: overrides })
}
function ownLeaf(intent: PolicyIntent, workspaceId: string | null, field: PolicyField): PolicyLeafValue {
  const [group, key] = field.split('.')
  const patch = workspaceId === null ? intent.defaults : intent.workspaceOverrides[workspaceId] ?? {}
  if (group === undefined || key === undefined) return undefined
  const row = object(patch)[group]
  return row === undefined ? undefined : object(row)[key] as PolicyLeafValue
}
export async function savePolicyDraft(remote: Pick<ControlsRemote, 'savePolicy'>, draft: PolicyIntent, expectedRevision: number): Promise<PolicySnapshot> {
  return parsePolicySnapshot(remoteValue(await remote.savePolicy(parsePolicyIntent(draft), expectedRevision)))
}
/** Policy-only impact snapshot: never an invented execution or convergence receipt. */
export function policyDraftImpact(saved: PolicySnapshot, draft: PolicyIntent, workspaceId: string | null, verified: boolean): { readonly readRevision: number; readonly scope: string; readonly changes: readonly { readonly field: string; readonly before: unknown; readonly after: unknown }[]; readonly executionEffects: string } {
  const scope = workspaceId ?? 'global-preview'
  const old = resolvePolicy({ ...saved, workspaceOverrides: workspaceId === null ? {} : saved.workspaceOverrides }, scope, verified)
  const next = resolvePolicy({ ...draft, revision: saved.revision, workspaceOverrides: workspaceId === null ? {} : draft.workspaceOverrides }, scope, verified)
  const changes: { field: string; before: unknown; after: unknown }[] = []
  const add = (field: string, before: unknown, after: unknown): void => { if (JSON.stringify(before) !== JSON.stringify(after)) changes.push({ field, before, after }) }
  add('extensionEnabled', old.extensionEnabled, next.extensionEnabled)
  for (const feature of FEATURE_NAMES) add(feature + '.enabled', { value: old.features[feature], source: old.sources[(feature + '.enabled') as PolicyField] }, { value: next.features[feature], source: next.sources[(feature + '.enabled') as PolicyField] })
  for (const key of ['ticketWindowSize', 'runningSubagentLimit'] as const) add('windows.' + key, { value: old.windows[key], source: old.sources[('windows.' + key) as PolicyField] }, { value: next.windows[key], source: next.sources[('windows.' + key) as PolicyField] })
  add('pendingDecisions.interactionMode', { value: old.pendingDecisions.interactionMode, source: old.sources['pendingDecisions.interactionMode'] }, { value: next.pendingDecisions.interactionMode, source: next.sources['pendingDecisions.interactionMode'] })
  for (const key of DISPLAY_NAMES) add('display.' + key, { value: old.display[key], source: old.sources[('display.' + key) as PolicyField] }, { value: next.display[key], source: next.sources[('display.' + key) as PolicyField] })
  return { readRevision: saved.revision, scope: workspaceId ?? 'global-defaults', changes, executionEffects: 'Intent only. Existing obligations/executions remain; inspect the authorized Session snapshot for actual usage/convergence.' }
}
function intentOf(snapshot: PolicySnapshot): PolicyIntent { return parsePolicyIntent({ extensionEnabled: snapshot.extensionEnabled, defaults: snapshot.defaults, workspaceOverrides: snapshot.workspaceOverrides }) }
function useObservation(observer: SessionObservation): Observation<ClientSessionSnapshot> {
  useEffect(() => observer.retain(), [observer])
  return useSyncExternalStore(observer.subscribe, observer.getSnapshot, observer.getSnapshot)
}
const panelStyle = { boxSizing: 'border-box' as const, padding: '16px', height: '100%', width: '100%', maxWidth: '100%', minWidth: 0, overflow: 'auto', minHeight: 0, overflowWrap: 'anywhere' as const, textAlign: 'left' as const }
function diagnostic(message: string): ReactElement { return h('p', { role: 'status' }, message) }
function pretty(value: unknown): ReactElement { return h('pre', { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, JSON.stringify(value, null, 2)) }

interface SessionFace { readonly observer: SessionObservation; readonly openDetails: () => void }
interface SummaryFace { readonly summary: SummaryObserver; readonly observe: () => SessionObservation; readonly openDetails: () => void }
type HeaderProps = PropsRuntime<'conversation.session.header.utilities'> & SummaryFace
function useSummaryObservation(observer: SummaryObserver, active = true): Observation<SessionSummary> {
  useEffect(() => active ? observer.retain() : undefined, [observer, active])
  return useSyncExternalStore(observer.subscribe, observer.getSnapshot, observer.getSnapshot)
}
function countText(value: unknown): string { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? String(value) : '未知' }
function capacityText(value: unknown): string { return value === null ? '未配置' : typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? String(value) : '未知' }
/** T is explicit bookkeeping; S tracking is not proof that all runtime work is known. */
/** State the published outcome; 'unobservable' reads as unobservable, never as a cause. */
export function nativeStopText(row: NativeStopRow): string {
  const where = row.sessionId + (row.turn === null ? '' : ' 第' + row.turn + '回合')
  const outcome = row.outcome === 'unobservable'
    ? '结局不可观测（无可读 turn/end' + (row.evidence !== null && row.evidence.seq !== null ? '；最后观测 seq ' + row.evidence.seq : '') + '）'
    : row.outcome === 'error' ? '回合失败' + (row.diagnostic === null ? '' : '（' + row.diagnostic + '）')
    : row.outcome === 'interrupted' ? '回合从未正常结束（崩溃或强制停止）'
    : row.outcome === 'aborted' ? '回合被取消' + (row.cancelCause === null ? '（取消原因不可观测）' : '（原因 ' + row.cancelCause + '）')
    : '结局 ' + row.outcome
  const lane = row.lane !== null && row.lane.workflowId !== null ? '（lane ' + row.lane.workflowId + (row.lane.localTicketId === null ? '' : '/' + row.lane.localTicketId) + '）' : ''
  return where + '：' + outcome + lane
}
/** One native execution row; observed/inferred labels never become completion proof. */
export function nativeExecutionText(row: NativeExecutionView): string {
  const outcome = row.outcome === null ? '' : ' · 结局 ' + row.outcome
  // The header is a recorded source value. It does not prove the effective initial directory.
  const headerCwd = row.headerCwd === null ? '' : ' · header cwd（来源值，不证明实际初始目录）' + row.headerCwd
  const lane = row.lane === null ? '' : ' · lane（inferred）' + String(row.lane.workflowId ?? '无工作流')
    + (row.lane.ticketIds.length === 0 ? '' : '/' + row.lane.ticketIds.join(','))
  return row.sessionId + ' · ' + row.state + outcome + ' · 活动 ' + row.activity + headerCwd + lane
}
function hasKnownNativeRunningTotal(windows: WindowSnapshot): boolean {
  return windows.S.countKnown === true && windows.capability === 'cooperative'
}
export function windowSummary(windows: WindowSnapshot | null, health: ClientSessionSnapshot['health'] = []): readonly string[] {
  if (windows === null || health.some(row => row.scope === 'windows' && row.status === 'unknown')) return ['T 未知', 'S 未知']
  const signed = (value: unknown): string => typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : '未知'
  const reference = (usage: WindowSnapshot['T']): string => '/' + capacityText(usage.capacity) + ' · 超出 ' + countText(usage.overage) + ' · 差额 ' + signed(usage.gap)
  const T = 'T ' + countText(windows.T.used) + reference(windows.T)
  // Depth is a structural fact of the native count, so it rides with the number it decomposes;
  // a source that cannot measure depth prints nothing rather than a fabricated 0.
  const depthText = (usage: WindowSnapshot['S']): string => {
    const depth = usage.depth
    if (depth === null || depth === undefined) return ''
    return '（直接 ' + countText(depth.direct) + ' · 更深 ' + countText(depth.deeper)
      + (depth.unknown === 0 ? '' : ' · 深度未知 ' + countText(depth.unknown)) + '）'
  }
  const knownS = hasKnownNativeRunningTotal(windows)
  const S = knownS ? 'S ' + countText(windows.S.used) + depthText(windows.S) + reference(windows.S)
    : 'S 在跑 ' + countText(windows.S.used) + depthText(windows.S) + reference(windows.S) + '（下界） · 总数未知'
  return [T, S]
}
export function WindowProjection(props: { readonly view: ClientSessionSnapshot }): ReactElement {
  const failed = props.view.health.find(row => row.scope === 'windows' && row.status === 'unknown')
  const windows = props.view.windows
  if (failed || windows === null) return diagnostic('窗口观测未知：' + (failed?.reason ?? '未返回 T/S；不是 0 或默认容量'))
  const stops = props.view.nativeStops ?? []
  const executions = props.view.nativeExecutions ?? []
  const executionHealth = props.view.health.find(row => row.scope === 'native-executions')
  return h('section', { 'aria-label': '窗口观测' },
    diagnostic('T/S 是参考值，不是硬名额；超出或统计未知不拒绝派发，也不要求额外审批。'),
    h('div', { key: decisionReadingIdentity(props.view), 'aria-label': 'T 占位明细' }, h('h4', null, 'T 占位明细'), inputTicketDetails(props.view)),
    diagnostic('S 是宿主的实时运行状态（当前 Agent.status 为 running 的后代子代理；idle 常驻子代理不算在跑）；countKnown 为 false 时它是明示下界（总数未知），available 只是参考余量，不是全机可派发数量。S.depth 按到本会话的边距分解：direct（1 级）、deeper（2 级及更深）、unknown（父链不可测量），三者恒等于 S.used；depth.levels 给出各层精确计数，depth 为 null 表示来源无法测量深度。宿主的活动子代理名额按 continuable 血缘共用一个池，孙代与直接子代消耗同一个名额。'),
    ...(props.view.nativeCount?.reestablished === true ? [diagnostic('S 计数已由新 runtime 依据实时事实重建（前一个 ' + String(props.view.nativeCount.previousRuntimeId) + '），不是未归因的消失。')] : []),
    ...(stops.length > 0 ? [diagnostic('原生子代理结局待处理：' + stops.map(row => nativeStopText(row)).join('；') + '。每项对应一个子代理回合的宿主公开结局或明示不可观测；子代理重新运行或其结束回执到达后清除。')] : []),
    ...(executionHealth?.status === 'unknown' ? [diagnostic('原生执行事实未知：' + (executionHealth.reason ?? '宿主未返回该类别'))] : []),
    ...(executionHealth?.status === 'restricted' ? [diagnostic('原生执行事实受限：' + (executionHealth.reason ?? '仅协调者可读取'))] : []),
    ...(executions.length > 0 ? [h('div', { 'aria-label': '原生执行事实' },
      diagnostic('原生执行事实 ' + executions.length + ' 行（native-observed；lane=inferred；header cwd 是来源值，不证明实际初始目录；不是任务完成证明）'),
      executions.map(row => diagnostic(nativeExecutionText(row))))] : []),
    diagnostic(windowSummary(windows, props.view.health).join(' · ')), pretty(windows))
}
/** Aggregate read health controls the count; per-resource physical inspection never erases metadata. */
export function resourceSummary(view: ClientSessionSnapshot): { readonly label: string; readonly count: number | null; readonly reason: string | null } {
  const failedRoot = view.health.find(row => row.scope === 'resources' && row.status === 'unknown')
  if (failedRoot !== undefined) return { label: '资源未知 · 程序读取提醒', count: null, reason: failedRoot.reason ?? 'Resource domain read is unavailable' }
  const reminders = view.resources.filter(resource => ['cleanup-failed', 'quarantined', 'retire-requested'].includes(resource.status)).length
  return { label: '资源 ' + view.resources.length + (reminders > 0 ? ' · 提醒 ' + reminders : ''), count: view.resources.length, reason: null }
}
export function ResourceProjection(props: { readonly view: ClientSessionSnapshot }): ReactElement {
  const summary = resourceSummary(props.view)
  if (summary.count === null) return h('section', { 'aria-label': '资源读取未知' }, diagnostic('资源未知：' + summary.reason),
    props.view.resources.length > 0 ? h('div', null, diagnostic('仅展示已返回元数据；整体资源数量未知。'), pretty(props.view.resources)) : null)
  return h('section', { 'aria-label': '资源授权投影' }, diagnostic(summary.label), pretty(props.view.resources))
}
export function compactInstrumentSummary(view: ClientSessionSnapshot): { readonly parts: readonly string[]; readonly detail: string } {
  const records = inputRecords(view)
  const statuses = records?.summary.statusCounts.flatMap(axis => axis.statuses.map(status => ({
    key: axis.workflowId + '/' + axis.axisKey + '/' + status.statusKey,
    priority: status.summaryPriority ?? Number.MAX_SAFE_INTEGER,
    text: axis.workflowId + '/' + axis.label + ':' + status.label + ' ' + countText(status.count) + ' (' + axis.counting + ')',
  }))).sort((a, b) => a.priority - b.priority || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)) ?? []
  const custom = statuses.slice(0, 2).map(row => row.text).join(' · ')
  const ticket = '任务引用 ' + taskReferenceCount(records) + ' · 旧票 ' + (records === null ? '未知' : countText(records.summary.totalTickets)) + '（业务报告）' + (custom ? ' · ' + custom : '') + (statuses.length > 2 ? ' · 更多 ' + (statuses.length - 2) : '')
  const [T = 'T 未知', S = 'S 未知'] = windowSummary(view.windows, view.health)
  const resource = resourceSummary(view)
  const parts = ['待用户裁决 ' + (records === null ? '未知' : countText(records.summary.pendingUserDecisionCount)), ticket, T, S,
    bindingSummary(view), observationSummary(view), resource.label]
  const detail = '实例 ' + view.instance.instrumentInstanceId + ' · ' + (records?.summary.countingScope ?? '统计未知') + ' · ' + parts.join(' · ') + (needsRecordCheck(inputRecords(view)) ? ' · 记录核对' : '')
    + (statuses.length ? ' · 完整状态：' + statuses.map(row => row.text).join(' · ') : '') + (resource.reason === null ? '' : ' · 资源读取原因：' + resource.reason)
  return { parts, detail }
}
export function HeaderEntry(props: HeaderProps): ReactElement | null {
  const observation = useSummaryObservation(props.summary)
  if (props.summary.getDisplay()?.header === false) return null
  if (observation.status !== 'ready') return h('span', { title: observation.error ?? '尚无已确认的状态摘要', role: 'status', style: { display: 'inline-block', maxWidth: 'min(36vw, 320px)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, '协作 · 状态未知')
  return h(HeaderSnapshot, props)
}
function HeaderSnapshot(props: HeaderProps): ReactElement | null {
  const observer = useMemo(props.observe, [props.observe])
  return h(ObservedHeaderEntry, { ...props, observer })
}
export function ObservedHeaderEntry(props: PropsRuntime<'conversation.session.header.utilities'> & SessionFace): ReactElement | null {
  const observation = useObservation(props.observer)
  if (props.observer.getDisplay()?.header === false) return null
  if (observation.status === 'unknown') return h('span', { title: observation.error ?? '尚无已确认的状态快照', role: 'status', style: { display: 'inline-block', maxWidth: 'min(36vw, 320px)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, '协作 · 状态未知')
  const view = observation.value
  if (!view.policy.display.header) return null
  const summary = compactInstrumentSummary(view)
  const style = { display: 'inline-flex', alignItems: 'center', gap: '6px', maxWidth: 'min(36vw, 320px)', minWidth: 0, overflow: 'hidden', fontSize: '11px' }
  const content = [h('span', { key: 'identity', style: { flexShrink: 0 } }, '协作'), ...summary.parts.map((part, index) => h('span', { key: index, style: { minWidth: 0, maxWidth: index === 1 ? '220px' : '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, part)), needsRecordCheck(inputRecords(view)) ? h('span', { key: 'record-check', style: { color: 'var(--dsw-alias-label-secondary, #61666b)', fontWeight: 400, flexShrink: 0 } }, '记录核对') : null]
  return view.policy.display.rightPanel ? h('button', { type: 'button', onClick: props.openDetails, title: summary.detail, 'aria-label': summary.detail, style }, ...content)
    : h('span', { title: summary.detail + ' · 右侧详情入口已关闭', 'aria-label': summary.detail, style }, ...content)
}
function countingScopeText(scope: InstrumentSnapshot['summary']['countingScope']): string {
  return ({ instance: '当前实例统计', assignment: '当前分配范围统计' } satisfies Record<InstrumentSnapshot['summary']['countingScope'], string>)[scope] ?? '统计范围未知'
}
const INPUT_SUMMARY_WORKFLOW_LIMIT = 2
type InputSummaryAxis = InstrumentSnapshot['summary']['statusCounts'][number]
interface InputSummaryWorkflow {
  readonly workflowId: string
  readonly axes: readonly InputSummaryAxis[]
  readonly lastActivity: number
  readonly ticketCount: number | null
  readonly referenceCount: number | null
  readonly order: number
}
/** Order the compact summary by real activity, not by the order workflows first appeared.
 * The revision is a program fact; a newer ticket can lift an older long-lived workflow. */
function inputSummaryWorkflows(records: InstrumentSnapshot): readonly InputSummaryWorkflow[] {
  const axesByWorkflow = new Map<string, InputSummaryAxis[]>()
  for (const axis of records.summary.statusCounts) {
    const axes = axesByWorkflow.get(axis.workflowId)
    if (axes === undefined) axesByWorkflow.set(axis.workflowId, [axis])
    else axes.push(axis)
  }
  const workflowRows = Array.isArray(records.workflows) ? records.workflows : []
  const ticketRows = Array.isArray(records.tickets) ? records.tickets : []
  const ticketInventoryKnown = Array.isArray(records.tickets)
  const workflowById = new Map(workflowRows.map(row => [row.workflowId, row] as const))
  const ticketsByWorkflow = new Map<string, (typeof ticketRows)[number][]>()
  for (const ticket of ticketRows) {
    const rows = ticketsByWorkflow.get(ticket.workflowId)
    if (rows === undefined) ticketsByWorkflow.set(ticket.workflowId, [ticket])
    else rows.push(ticket)
  }
  const references = taskReferenceRows(records)
  const referencesByWorkflow = new Map<string, NonNullable<typeof references>[number][]>()
  for (const reference of references ?? []) {
    if (!axesByWorkflow.has(reference.workflowId)) axesByWorkflow.set(reference.workflowId, [])
    const rows = referencesByWorkflow.get(reference.workflowId)
    if (rows === undefined) referencesByWorkflow.set(reference.workflowId, [reference])
    else rows.push(reference)
  }
  return [...axesByWorkflow].map(([workflowId, axes], order) => {
    const scopedReferences = referencesByWorkflow.get(workflowId) ?? []
    const scopedTickets = ticketsByWorkflow.get(workflowId) ?? []
    const revisions = [...scopedTickets, ...scopedReferences].map(row => row.revision)
    const workflow = workflowById.get(workflowId)
    if (workflow !== undefined) revisions.push(workflow.revision)
    const lastActivity = revisions.reduce((latest, revision) => revision > latest ? revision : latest, 0)
    return { workflowId, axes, lastActivity, ticketCount: ticketInventoryKnown ? scopedTickets.length : null, referenceCount: references === null ? null : scopedReferences.length, order }
  }).sort((left, right) => right.lastActivity - left.lastActivity || left.order - right.order)
}
function workflowSummaryLine(workflowId: string, axis: InputSummaryAxis): ReactElement {
  const statuses = axis.statuses.filter(status => status.count !== 0)
  return h('div', { key: workflowId + ':' + axis.axisKey }, workflowId + ' / ' + axis.label + '（' + (axis.counting === 'exclusive' ? '互斥统计' : '可重叠统计') + '） · ' + (statuses.length === 0 ? '当前无非零状态计数' : statuses.map(status => status.label + ' ' + countText(status.count)).join(' · ')))
}
export function InputSummary(props: PropsRuntime<'conversation.input.dock'> & SummaryFace): ReactElement | null {
  const observation = useSummaryObservation(props.summary)
  if (observation.status !== 'ready' || !observation.value.policy.display.inputSummary) return null
  return h(InputSnapshot, props)
}
function InputSnapshot(props: PropsRuntime<'conversation.input.dock'> & SummaryFace): ReactElement | null {
  const observer = useMemo(props.observe, [props.observe])
  return h(ObservedInputSummary, { ...props, observer })
}
type InputDisclosure = 'T' | 'S' | 'pending' | 'awaiting'
const INPUT_DISCLOSURES = {
  T: { entrance: '查看 T 票窗口', region: 'T 票窗口详情', color: 'var(--dsw-alias-state-business-primary, #2563eb)' },
  S: { entrance: '查看 S 在跑子代理', region: 'S 在跑详情', color: 'var(--dsw-alias-state-done-primary, #7460c8)' },
  pending: { entrance: '查看待你裁决事项', region: '待你裁决详情', color: 'var(--dsw-alias-state-error-primary, #dc4444)' },
  awaiting: { entrance: '查看记录核对', region: '记录核对详情', color: 'var(--dsw-alias-label-secondary, #61666b)' },
} as const
const inputTextButtonStyle = { background: 'none', border: 0, padding: 0, color: 'inherit', font: 'inherit', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: '2px' } as const
let nextInputDisclosureId = 0
function signedCountText(value: unknown): string { return typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : '未知' }
function inputReadFailure(view: ClientSessionSnapshot, scope: string): string | null {
  const row = view.health.find(row => row.scope === scope && (row.status === 'unknown' || row.status === 'restricted'))
  return row === undefined ? null : (row.status === 'restricted' ? '受限：' : '未知：') + (row.reason ?? '未返回可读数据')
}
function inputRecords(view: ClientSessionSnapshot): InstrumentSnapshot | null { return inputReadFailure(view, 'records') === null ? view.records : null }
function inputWindows(view: ClientSessionSnapshot): WindowSnapshot | null { return inputReadFailure(view, 'windows') === null ? view.windows : null }
/** Strict decision membership: pending-user and business awaiting are independent flags. */
function isPendingUserDecision(row: DecisionRecord): boolean { return row.value.pending === true && row.value.addressee?.kind === 'user' }
function isAwaitingImplementation(row: DecisionRecord): boolean { return row.value.awaitingImplementation === true }
function isNonUserPending(row: DecisionRecord): boolean { return row.value.pending === true && row.value.addressee?.kind !== 'user' }
function needsRecordCheck(records: InstrumentSnapshot | null): boolean {
  if (records === null || !Array.isArray(records.decisions)) return true
  const s = records.summary
  return s.awaitingImplementationCount !== 0 || records.decisions.some(row => isAwaitingImplementation(row) || isNonUserPending(row))
    || typeof s.pendingDecisionCount !== 'number' || typeof s.pendingUserDecisionCount !== 'number' || s.pendingDecisionCount !== s.pendingUserDecisionCount
}
function decisionRecordKey(row: DecisionRecord): string { return row.workflowId + '\u0000' + row.decisionId }
/** Duplicate projection rows never become a second editor or a second queue item. */
function uniqueDecisionRecords(rows: readonly DecisionRecord[]): readonly DecisionRecord[] {
  const seen = new Set<string>()
  const result: DecisionRecord[] = []
  for (const row of rows) {
    const key = decisionRecordKey(row)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(row)
  }
  return result
}
function decisionAddresseeText(row: DecisionRecord): string {
  const addressee = row.value.addressee
  if (addressee === undefined) return '缺省（未指定）'
  return addressee.kind + (addressee.principalId ? ' · ' + addressee.principalId : '') + (addressee.label ? ' · ' + addressee.label : '')
}
/** The authorized summary count stays authoritative; a disagreement is diagnosed, never recomputed. */
function decisionSummaryMismatch(label: string, summary: unknown, listLength: number): ReactElement | null {
  if (typeof summary !== 'number' || !Number.isSafeInteger(summary) || summary < 0 || summary === listLength) return null
  return diagnostic(label + '摘要计数 ' + summary + ' 与当前可显示列表 ' + listLength + ' 条不一致；不从列表重算计数，请刷新后核实授权快照。')
}
function technicalDetails(value: unknown): ReactElement { return h('details', null, h('summary', null, '技术详情'), pretty(value)) }
function workflowIdentity(records: InstrumentSnapshot | null, workflowId: string): string {
  const workflow = records?.workflows?.find(row => row.workflowId === workflowId)
  return workflow === undefined ? workflowId : workflow.value.title + '（' + workflowId + '）'
}
/** Capability absence is an old endpoint, never evidence of zero references. */
function taskReferenceRows(records: InstrumentSnapshot | null): InstrumentSnapshot['taskReferences'] | null {
  return records?.capabilities?.taskReferences === true && Array.isArray(records.taskReferences) ? records.taskReferences : null
}
function taskReferenceCount(records: InstrumentSnapshot | null): string {
  return records?.capabilities?.taskReferences === true ? countText(records.summary.totalTaskReferences) : '未知'
}
function TaskReferenceItem(props: { readonly row: InstrumentSnapshot['taskReferences'][number] | InstrumentCurrentTaskReference }): ReactElement {
  const row = props.row, value = row.value
  const source = value.source
  const provenance = 'provenance' in row ? row.provenance : row.history?.find(change => change.revision === row.revision)
  return h('details', { style: { borderTop: decisionBorder, padding: '8px 0', minWidth: 0, overflowWrap: 'anywhere' } },
    h('summary', { style: { cursor: 'pointer', whiteSpace: 'normal', lineHeight: 1.6 } }, value.label ?? row.workflowId + '/' + row.localTicketId),
    h('div', { style: { paddingInlineStart: '12px', minWidth: 0 } },
      h('p', { style: decisionBodyStyle }, '本地引用：' + row.workflowId + '/' + row.localTicketId + ' · 修订 ' + row.revision),
      h('p', { style: decisionBodyStyle }, '来源：作者报告（authored），未核验；未观察源状态。'),
      h('p', { style: decisionBodyStyle }, source.kind === 'external' ? '外部任务：' + source.instance + ' / ' + source.project + ' / ' + source.taskId
        : source.kind === 'repository' ? '仓内任务：' + source.repositoryAnchor + ' / ' + source.relativePath + (source.anchor ? ' # ' + source.anchor : '') : '未核验来源（unverified）'),
      h('p', { style: decisionBodyStyle }, '导航位置（仅文本）：' + value.locator),
      provenance === undefined ? h('p', null, '当前版本作者与报告时间未知') : h('p', { style: decisionBodyStyle },
        '报告作者：' + provenance.author.kind + ' / ' + provenance.author.principalId + ' · ', decisionTime('本地报告时间', provenance.recordedAt, '报告时间未知')),
      h(DecisionTechnicalDetails, { label: '引用技术详情与历史（不证明来源时效）', value: row })))
}
function TaskReferences(props: { readonly view: ClientSessionSnapshot }): ReactElement {
  const records = inputRecords(props.view), rows = taskReferenceRows(records)
  return h('section', { 'aria-label': '任务引用', style: { minWidth: 0, overflowWrap: 'anywhere' } },
    h('h4', null, '任务引用 ' + taskReferenceCount(records) + ' · 旧票 ' + (records === null ? '未知' : countText(records.summary.totalTickets)) + '（业务报告）'),
    rows === null ? diagnostic('任务引用读取能力未知或不支持（旧端可能缺少能力标记）；不是 0，不创建替代业务票。')
      : h('div', null, diagnostic(countingScopeText(records!.summary.countingScope) + '；仅本地引用，不是外部任务总数或完成率。'),
        rows.length === 0 ? diagnostic('本次授权投影没有任务引用。') : rows.map(row => h(TaskReferenceItem, { key: JSON.stringify([row.workflowId, row.localTicketId]), row }))))
}
function ticketIdentity(records: InstrumentSnapshot | null, workflowId: string, ticketId: string): string {
  const reference = taskReferenceRows(records)?.find(row => row.workflowId === workflowId && row.localTicketId === ticketId)
  const ticket = records?.tickets?.find(row => row.workflowId === workflowId && row.localTicketId === ticketId)
  return workflowId + '/' + ticketId + (reference !== undefined ? ' · 任务引用 · ' + (reference.value.label ?? reference.value.locator) : ticket === undefined ? '' : ' · 旧票报告 · ' + ticket.value.title)
}
function ticketStatusText(records: InstrumentSnapshot, ticket: InstrumentSnapshot['tickets'][number]): string {
  const workflow = records.workflows.find(row => row.workflowId === ticket.workflowId)
  return Object.entries(ticket.value.statuses).map(([axisKey, keys]) => {
    const axis = workflow?.value.axes.find(row => row.axisKey === axisKey)
    return (axis?.label ?? axisKey) + '：' + (keys.length === 0 ? '未报告' : keys.map(key => axis?.statuses.find(row => row.statusKey === key)?.label ?? key).join('、'))
  }).join(' · ') || '未报告状态'
}
function inputTicketDetails(view: ClientSessionSnapshot): ReactElement {
  const windows = inputWindows(view), records = inputRecords(view)
  if (windows === null) return diagnostic('票窗口未知：' + (inputReadFailure(view, 'windows') ?? '未返回窗口；不是空清单或 0'))
  const held = Array.isArray(windows.tickets) ? windows.tickets.filter(row => row.held === true) : null
  return h('div', null,
    diagnostic('实例总占用 T ' + countText(windows.T.used) + ' / 参考 ' + capacityText(windows.T.capacity) + '；仅作规模提示，不是硬名额。'),
    diagnostic(windows.scope?.kind === 'assigned' ? '当前可见 scope：分配范围，明细只是子集，不能从子集重算实例总数。' : windows.scope?.kind === 'coordinator' ? '当前可见 scope：协调者实例范围。' : '当前可见 scope 未知，不从明细重算实例总数。'),
    records === null ? diagnostic('票账本未知：' + (inputReadFailure(view, 'records') ?? '未返回账本') + '；保留显式占位身份。') : null,
    taskReferenceRows(records) === null ? diagnostic('任务引用读取能力未知或不支持；未解析 handle 不视为业务票或空清单。') : null,
    held === null ? diagnostic('占位明细未知：未返回占位记录。') : h('div', null,
      diagnostic('本次可展示 held=true 占位 ' + held.length + ' 条。'),
      held.map(row => {
        const reference = taskReferenceRows(records)?.find(reference => reference.workflowId === row.workflowId && reference.localTicketId === row.localTicketId)
        const ticket = records?.tickets?.find(ticket => ticket.workflowId === row.workflowId && ticket.localTicketId === row.localTicketId)
        return h('article', { key: row.workflowId + ':' + row.localTicketId },
          h('p', null, ticketIdentity(records, row.workflowId, row.localTicketId)),
          h('p', null, '工作流：' + workflowIdentity(records, row.workflowId)),
          reference === undefined ? h('p', null, ticket === undefined || records === null ? '票标题/状态未在当前授权账本返回。' : ticketStatusText(records, ticket)) : h(TaskReferenceItem, { row: reference }), technicalDetails(row))
      })),
    records === null ? null : h('details', null, h('summary', null, '全部状态定义与计数（含零值）'),
      records.summary.statusCounts.map(axis => h('div', { key: axis.workflowId + ':' + axis.axisKey },
        h('p', null, axis.workflowId + ' / ' + axis.label + '（' + axis.counting + '） · 未报告 ' + countText(axis.unreported)),
        axis.statuses.map(status => h('p', { key: status.statusKey }, status.label + ' [' + status.statusKey + '] ' + countText(status.count) + (status.meaning ? ' · ' + status.meaning : '')))))))
}
const decisionBorder = '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.22))'
const decisionSecondary = 'var(--dsw-alias-label-secondary, #61666b)'
const decisionBodyStyle = { margin: '8px 0', whiteSpace: 'pre-wrap' as const, overflowWrap: 'anywhere' as const }
function DecisionTechnicalDetails(props: { readonly value: unknown; readonly label?: string }): ReactElement {
  const [open, setOpen] = useState(false)
  return h('details', { onToggle: (event: SyntheticEvent<HTMLDetailsElement>) => { if (event.target === event.currentTarget) setOpen(event.currentTarget.open) }, style: { borderTop: decisionBorder, padding: '8px 0', minWidth: 0 } },
    h('summary', { style: { cursor: 'pointer' } }, props.label ?? '技术详情'), open ? pretty(props.value) : null)
}
function decisionLongText(label: string, text: string | null | undefined): ReactElement | null {
  return text ? h('details', { style: { borderTop: decisionBorder, padding: '8px 0' } }, h('summary', { style: { cursor: 'pointer' } }, label), h('p', { style: decisionBodyStyle }, text)) : null
}
// Optional authorized READ metadata; not a stored DecisionValue or a creation guess from retained history.
type DecisionReadingRow = DecisionRecord & InstrumentDecisionTime
function decisionTime(label: string, value: number | undefined, unknown: string): ReactElement {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || !Number.isFinite(new Date(value).getTime())) return h('span', null, unknown)
  return h('span', null, label + ' ', h('time', { dateTime: new Date(value).toISOString() }, new Intl.DateTimeFormat(undefined, {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZoneName: 'longOffset',
  }).format(value)))
}
/** Semantic details supports multi-line previews and native keyboard/touch disclosure without truncating the full question. */
function DecisionReadingItem(props: { readonly decision: DecisionReadingRow; readonly records: InstrumentSnapshot; readonly updated?: boolean; readonly edit?: (() => void) | undefined; readonly onOpen?: (open: boolean) => void }): ReactElement {
  const row = props.decision, value = row.value
  const source = row.history?.find(change => change.revision === row.revision)
  const workflow = props.records.workflows?.find(item => item.workflowId === row.workflowId)?.value.title ?? row.workflowId
  const preview = Array.from(value.question).slice(0, 96).join('') + (Array.from(value.question).length > 96 ? '…' : '')
  return h('details', { 'data-decision-item': decisionRecordKey(row), onToggle: (event: SyntheticEvent<HTMLDetailsElement>) => { if (event.target === event.currentTarget) props.onOpen?.(event.currentTarget.open) }, style: { borderTop: decisionBorder, padding: '10px 0', minWidth: 0, color: 'var(--dsw-alias-label-primary, CanvasText)', overflowWrap: 'anywhere' } },
    h('summary', { style: { cursor: 'pointer', lineHeight: 1.6 } },
      h('span', { style: { fontWeight: 600 } }, preview),
      h('span', { style: { display: 'block', color: decisionSecondary, fontSize: '12px' } }, workflow + ' · ' + value.status + ' · ', decisionTime('首次登记', row.registration?.recordedAt, '创建时间未知'), ' · ', decisionTime('业务更新', row.updatedAt, '业务更新时间未知'), props.updated ? ' · 已更新 / 已解决：此事项已不在原分类' : null)),
    h('div', { style: { padding: '4px 0 0 12px', lineHeight: 1.65, minWidth: 0 } },
      h('p', { style: { ...decisionBodyStyle, fontWeight: 600 } }, value.question),
      value.options?.length ? h('div', null, h('strong', null, '选项'), h('ul', { style: { margin: '6px 0', paddingInlineStart: '24px' } }, value.options.map(option => h('li', { key: option.key, style: { whiteSpace: 'pre-wrap' } }, option.key + '：' + option.label)))) : null,
      value.recommendation ? h('p', { style: decisionBodyStyle }, '建议：' + value.recommendation) : null,
      value.impact ? h('p', { style: decisionBodyStyle }, '影响：' + value.impact) : null,
      value.ticketIds?.length ? h('p', { style: decisionBodyStyle }, '关联任务（引用 / 旧票报告）：' + value.ticketIds.map(id => ticketIdentity(props.records, row.workflowId, id)).join('；')) : null,
      decisionLongText('背景', value.context), decisionLongText('已记录结果', value.result),
      h('details', { style: { borderTop: decisionBorder, padding: '8px 0' } }, h('summary', null, '标识与来源'),
        h('p', { style: decisionBodyStyle }, '工作流：' + row.workflowId + ' · 事项：' + row.decisionId + ' · 裁决者：' + decisionAddresseeText(row)),
        source === undefined ? h('p', null, '当前版本来源未知') : h('p', { style: decisionBodyStyle }, '来源（authored）：' + source.author.kind + ' / ' + source.author.principalId + ' · 修订 ' + source.revision + (source.references.length ? ' · 引用：' + source.references.join('；') : ''))),
      h(DecisionTechnicalDetails, { value: row }),
      props.edit ? h(Button, { variant: 'ghost', onClick: props.edit, size: 'sm', style: { marginTop: '8px', maxWidth: '100%', height: 'auto', whiteSpace: 'normal', overflowWrap: 'anywhere', textAlign: 'left' } }, '阅读 / 编辑：' + preview) : null))
}
/** Mount with an authorization identity key. Open items retain their original region on classification changes. */
function DecisionQueues(props: { readonly view: ClientSessionSnapshot; readonly edit?: (row: DecisionRecord) => void }): ReactElement {
  const records = inputRecords(props.view)
  const [opened, setOpened] = useState<Record<string, readonly string[]>>({ pending: [], check: [], other: [] })
  if (records === null || !Array.isArray(records.decisions)) return diagnostic('裁决账本未知：未返回授权事项列表，不作空清单或 0。')
  const all = uniqueDecisionRecords(records.decisions)
  const matches = { pending: isPendingUserDecision, check: (row: DecisionRecord) => isAwaitingImplementation(row) || isNonUserPending(row), other: (row: DecisionRecord) => !isPendingUserDecision(row) && !isAwaitingImplementation(row) && !isNonUserPending(row) }
  const rows = (group: keyof typeof matches): readonly DecisionRecord[] => all.filter(row => matches[group](row) || opened[group]!.includes(decisionRecordKey(row)))
  const items = (group: keyof typeof matches): readonly ReactElement[] => rows(group).map(row => h('article', { key: decisionRecordKey(row), 'data-decision-key': props.view.sessionId + ':' + row.workflowId + ':' + row.decisionId },
    h(DecisionReadingItem, { decision: row, records, updated: !matches[group](row), edit: props.edit === undefined ? undefined : () => props.edit!(row),
      onOpen: (open: boolean) => setOpened(current => { const key = decisionRecordKey(row), keys = current[group]!; return { ...current, [group]: open ? [...new Set([...keys, key])] : keys.filter(item => item !== key) } }) })))
  return h('div', { style: { minWidth: 0, textAlign: 'left' } },
    h('section', { 'aria-label': '待你裁决' }, h('h4', { style: { fontSize: '14px', margin: '12px 0 6px' } }, '待你裁决 ' + countText(records.summary.pendingUserDecisionCount)),
      decisionSummaryMismatch('待你裁决', records.summary.pendingUserDecisionCount, all.filter(isPendingUserDecision).length),
      rows('pending').length ? items('pending') : h('p', { style: { fontSize: '12px', color: decisionSecondary } }, '本次授权账本未返回待你裁决事项；不从空明细重算摘要计数。')),
    h('section', { 'aria-label': '记录核对' }, h('h4', { style: { fontSize: '14px', margin: '12px 0 6px' } }, '记录核对'), recordCheckFacts(records), items('check')),
    h('details', { 'aria-label': '其他裁决记录' }, h('summary', { style: { fontSize: '13px', color: decisionSecondary, cursor: 'pointer' } }, '其他裁决记录（不是待你裁决） · ' + all.filter(matches.other).length + ' 条'), items('other')))
}
function decisionReadingIdentity(view: ClientSessionSnapshot): string {
  return JSON.stringify([view.sessionId, view.instance, view.caller, view.policyGrants.revision, view.records?.scope, inputRecords(view) !== null])
}
function recordCheckFacts(records: InstrumentSnapshot): ReactElement {
  const rows = Array.isArray(records.decisions) ? uniqueDecisionRecords(records.decisions) : null
  return h('div', { style: { fontSize: '12px', color: decisionSecondary, lineHeight: 1.6 } },
    h('p', { style: { margin: '6px 0' } }, '原待落实标记 ' + countText(records.summary.awaitingImplementationCount) + '，不等于未完成任务；保留原始兼容标记，需按任务依据核对。'),
    h('p', { style: { margin: '6px 0' } }, '非用户 pending 记录：' + (rows === null ? '未知' : rows.filter(isNonUserPending).length) + '（当前授权列表）；与原待落实标记可重叠，不能相加。'),
    rows === null ? diagnostic('核对清单未知：未返回授权事项列表，不作空清单或 0。') : decisionSummaryMismatch('原待落实标记', records.summary.awaitingImplementationCount, rows.filter(isAwaitingImplementation).length))
}
function inputDecisionDetails(view: ClientSessionSnapshot, category: 'pending' | 'awaiting', openedKeys: readonly string[]): ReactElement {
  const records = inputRecords(view)
  if (records === null || !Array.isArray(records.decisions)) return diagnostic('裁决账本未知：' + (inputReadFailure(view, 'records') ?? '未返回可读事项'))
  // Keep deliberately opened identities; bodies always come from the current authorized projection.
  const decisions = openedKeys.flatMap(key => { const row = records.decisions.find(row => decisionRecordKey(row) === key); return row === undefined ? [] : [row] })
  return h('div', null, h('p', { style: { color: decisionSecondary, margin: '6px 0', fontSize: '12px' } }, countingScopeText(records.summary.countingScope) + '；只读查看，不标记已读或解决事项。可在原聊天中回答。'),
    decisions.length === 0 ? diagnostic('本次授权账本未返回此类事项；不从空明细重算摘要计数。') : null,
    category === 'awaiting' ? recordCheckFacts(records) : decisionSummaryMismatch('待你裁决', records.summary.pendingUserDecisionCount, uniqueDecisionRecords(records.decisions).filter(isPendingUserDecision).length),
    decisions.map(decision => h(DecisionReadingItem, { key: decisionRecordKey(decision), decision, records,
      updated: category === 'pending' ? !isPendingUserDecision(decision) : !(isAwaitingImplementation(decision) || isNonUserPending(decision)) })))
}
// One explicit navigation selection per plugin activation; no business content, polling or Session retention.
interface NotificationReadingValue { readonly sessionId: string | null; readonly scope: string | null; readonly key: string | null; readonly identity: string | null }
interface NotificationReading { readonly getSnapshot: () => NotificationReadingValue; readonly subscribe: (listener: () => void) => () => void; readonly select: (view: ClientSessionSnapshot | null, key: string | null) => void }
function notificationReadingIdentity(view: ClientSessionSnapshot): string {
  const c = view.caller, i = view.instance
  return JSON.stringify([view.sessionId, c.kind, c.principalId, c.sessionId, i?.instrumentInstanceId, i?.ownerSessionId, i?.controlWorkspaceId, view.policyGrants?.revision])
}
function createNotificationReading(): NotificationReading {
  let value: NotificationReadingValue = { sessionId: null, scope: null, key: null, identity: null }
  const listeners = new Set<() => void>()
  return { getSnapshot: () => value, subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
    select: (view, key) => {
      const scope = view !== null && key !== null ? notificationScope(view) : null
      const next = view !== null && scope !== null ? { sessionId: view.sessionId, scope, key, identity: notificationReadingIdentity(view) } : { sessionId: null, scope: null, key: null, identity: null }
      if (value.sessionId === next.sessionId && value.scope === next.scope && value.key === next.key && value.identity === next.identity) return
      value = next; for (const listener of listeners) listener()
    } }
}
/** Independent native header lifetime; no policy display gate or automatic navigation. */
export function DecisionNotificationSeat(props: PropsRuntime<'conversation.session.header.utilities'> & { readonly observer: SessionObservation; readonly reading: NotificationReading }): ReactElement {
  return h(DecisionNotifications, { sessionId: props.sessionId, observer: props.observer, onOpenDecision: (workflowId, decisionId) => {
    const latest = props.observer.getSnapshot()
    if (latest.status !== 'ready' || props.observer.sessionId !== props.sessionId || latest.value.sessionId !== props.sessionId || inputRecords(latest.value) === null) return
    const scope = notificationScope(latest.value), row = latest.value.records?.decisions.find(row => row.workflowId === workflowId && row.decisionId === decisionId)
    if (scope !== null && row !== undefined && isPendingUserDecision(row)) props.reading.select(latest.value, decisionRecordKey(row))
  } })
}
/** Reuse the native input dock, not a custom overlay or a second composer. */
export function DecisionNotificationReader(props: PropsRuntime<'conversation.input.dock'> & { readonly observer: SessionObservation; readonly reading: NotificationReading }): ReactElement | null {
  const observation = useObservation(props.observer), store = props.reading
  const selection = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const view = observation.status === 'ready' ? observation.value : null
  const scope = view === null ? null : notificationScope(view)
  const identityMatches = props.observer.sessionId === props.sessionId && (view === null || (view.sessionId === props.sessionId && notificationReadingIdentity(view) === selection.identity))
  const unknown = view === null || scope === null || inputRecords(view) === null
  const present = view?.records?.decisions.some(row => decisionRecordKey(row) === selection.key) === true
  const valid = selection.sessionId === props.sessionId && selection.key !== null && identityMatches && (scope === null || scope === selection.scope) && (unknown || present)
  useEffect(() => { if (selection.sessionId === props.sessionId && !valid && selection.key !== null) store.select(null, null) }, [store, valid, selection, props.sessionId])
  useEffect(() => () => { if (store.getSnapshot().sessionId === props.sessionId) store.select(null, null) }, [store, props.sessionId])
  if (!valid) return null
  return h('section', { 'aria-label': '通知裁决阅读', style: { boxSizing: 'border-box', width: 'calc(100% - 2 * var(--dsh-composer-side-clearance, 16px))', maxWidth: 'var(--dsh-composer-card-max-width, 952px)', marginInline: 'auto', padding: '8px 12px', maxHeight: '50vh', overflow: 'auto', overflowWrap: 'anywhere' } },
    h(Button, { type: 'button', onClick: () => store.select(null, null) }, '关闭通知阅读'), unknown || view === null ? diagnostic('裁决读取未知；暂停显示正文，待相同授权范围恢复后继续阅读。') : inputDecisionDetails(view, 'pending', [selection.key!]))
}

function inputRunningDetails(view: ClientSessionSnapshot): ReactElement {
  const windows = inputWindows(view)
  const failure = inputReadFailure(view, 'native-executions')
  const assigned = inputRecords(view)?.scope?.kind === 'assigned' || windows?.scope?.kind === 'assigned' || view.caller.kind === 'agent'
  // Neither a persisted state nor execution leases prove live activity. This is a bounded observation, never a roster.
  const rows = failure !== null || assigned || !Array.isArray(view.nativeExecutions) ? null : view.nativeExecutions.filter(row => row.activity === 'running')
  return h('div', null,
    windows === null ? diagnostic('宿主在跑数未知：' + (inputReadFailure(view, 'windows') ?? '未返回窗口'))
      : diagnostic('宿主在跑数：' + countText(windows.S.used) + (hasKnownNativeRunningTotal(windows) ? '' : '（已知下界；总数未知）') + (windows.S.countReason ? ' · ' + windows.S.countReason : '')),
    diagnostic('本次可观测在跑明细：' + (rows === null ? '未知/受限' : rows.length + ' 条') + '；最近原生观测快照默认最多 64 行，明细可能不完整，即使条数相等也不代表完整在跑名册。租约仅作审计，不是实时名册。'),
    rows === null ? diagnostic('原生明细' + (failure ?? (assigned ? '受限：仅 owner 协调者可读取，不展示 sibling。' : '未知：未返回 nativeExecutions。')))
      : rows.length === 0 ? diagnostic('本次未返回 activity=running 的可观测记录，不代表没有在跑子代理。')
      : rows.map(row => h('article', { key: row.sessionId }, h('p', null, nativeExecutionText(row)), h('p', null, '来源：native-observed · ' + row.observed), technicalDetails(row))),
    windows?.S.depth == null ? diagnostic('深度结构未知/不可测量。') : h('div', null,
      diagnostic('深度结构：直接 ' + countText(windows.S.depth.direct) + ' · 更深 ' + countText(windows.S.depth.deeper) + ' · 深度未知 ' + countText(windows.S.depth.unknown)),
      Object.entries(windows.S.depth.levels).map(([level, count]) => h('p', { key: level }, '距离 ' + level + '：' + countText(count)))))
}
export function ObservedInputSummary(props: PropsRuntime<'conversation.input.dock'> & SessionFace): ReactElement | null {
  const observation = useObservation(props.observer)
  const view = observation.status === 'ready' && props.sessionId === props.observer.sessionId && observation.value.sessionId === props.sessionId ? observation.value : null
  const shown = view !== null && view.policy.display.inputSummary && props.observer.getDisplay()?.inputSummary !== false
  // Render-time fencing prevents even one stale frame on a new Session/instance or an unreadable/gated view.
  // No effect focuses anything, and the same identity keeps both the button DOM and the user's selection on refresh.
  const identity = JSON.stringify([props.sessionId, props.observer.sessionId, shown, view?.instance, view?.caller, view?.policyGrants.revision, view?.records?.scope, view?.policy.extensionEnabled, view?.policy.workspaceEnabled,
    view !== null && inputRecords(view) !== null, view !== null && inputWindows(view) !== null, view === null ? null : inputReadFailure(view, 'native-executions')])
  const [selection, setSelection] = useState<{ readonly identity: string; readonly category: InputDisclosure | null; readonly decisionKeys: readonly string[] }>(() => ({ identity, category: null, decisionKeys: [] }))
  const [regionPrefix] = useState(() => 'mattpocock-input-details-' + ++nextInputDisclosureId)
  const records = view === null ? null : inputRecords(view)
  const pending = records?.summary.pendingUserDecisionCount, awaiting = records?.summary.awaitingImplementationCount
  const selected = selection.identity === identity && shown ? selection.category : null
  if (selection.identity !== identity) setSelection({ identity, category: null, decisionKeys: [] })
  const close = (): void => setSelection({ identity, category: null, decisionKeys: [] })
  if (!shown || view === null) return null
  const inactive = view.policy.extensionEnabled === false ? '全局总闸已关闭' : view.policy.workspaceEnabled === false ? '本工作区总闸已关闭' : null
  const workflows = records === null ? [] : inputSummaryWorkflows(records)
  // Collapsing without an enabled details entrance would make the omitted rows unreachable.
  const visible = view.policy.display.rightPanel ? workflows.slice(0, INPUT_SUMMARY_WORKFLOW_LIMIT) : workflows
  const hidden = view.policy.display.rightPanel ? workflows.slice(INPUT_SUMMARY_WORKFLOW_LIMIT) : []
  const entrance = (category: InputDisclosure, text: string): ReactElement => h('button', {
    key: category, type: 'button', 'aria-label': INPUT_DISCLOSURES[category].entrance, 'aria-expanded': selected === category,
    'aria-controls': regionPrefix, style: { ...inputTextButtonStyle, color: INPUT_DISCLOSURES[category].color },
    onClick: () => selected === category ? close() : setSelection({ identity, category, decisionKeys: uniqueDecisionRecords(records?.decisions ?? []).filter(row => category === 'pending' ? isPendingUserDecision(row) : category === 'awaiting' && (isAwaitingImplementation(row) || isNonUserPending(row))).map(decisionRecordKey) }),
  }, text)
  const windows = inputWindows(view)
  const windowEntrance = (category: 'T' | 'S'): ReactElement => {
    const usage = windows?.[category]
    const depth = category === 'S' ? windows?.S.depth : null
    const unknownTotal = category === 'S' && windows !== null && !(hasKnownNativeRunningTotal(windows))
    return h('span', { key: category, style: { color: 'inherit' } }, entrance(category, category + ' ' + (usage === undefined ? '未知' : countText(usage.used) + '/' + capacityText(usage.capacity))),
      unknownTotal ? '（下界；总数未知）' : null,
      depth == null ? null : '（直接 ' + countText(depth.direct) + ' · 更深 ' + countText(depth.deeper) + (depth.unknown === 0 ? '' : ' · 深度未知 ' + countText(depth.unknown)) + '）',
      usage === undefined ? null : h('span', { style: { color: 'inherit' } },
        usage.overage === 0 ? null : h('span', { style: { color: 'var(--dsw-alias-state-warn-label, #b7791f)' } }, ' · 超出 ' + countText(usage.overage)),
        h('span', { style: { color: 'inherit', fontWeight: 'normal' } }, ' · 差额 ' + signedCountText(usage.gap))))
  }
  return h('section', { 'aria-label': '协作进度摘要', style: { boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', width: 'calc(100% - 2 * var(--dsh-composer-side-clearance, 16px))', maxWidth: 'var(--dsh-composer-card-max-width, 952px)', marginInline: 'auto', padding: '8px 12px', minWidth: 0, overflowWrap: 'anywhere', gap: '4px', lineHeight: 1.5 } },
    h('div', { 'aria-label': '常驻协作提醒', style: { flexShrink: 0, width: '100%' } },
      inactive === null ? null : diagnostic('协作管理未生效：' + inactive + '，下列数字仅为已保存记录，不会随工作更新（非实时更新）。'),
      records === null ? diagnostic('任务引用与旧票报告未知') : h('span', null, '任务引用 ' + taskReferenceCount(records) + ' · 旧票 ' + countText(records.summary.totalTickets) + '（业务报告） · ' + countingScopeText(records.summary.countingScope)),
      h('div', { style: { display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '4px 12px' } },
        pending === 0 ? null : entrance('pending', '待你裁决 ' + countText(pending)),
        windowEntrance('T'), windowEntrance('S'))),
    needsRecordCheck(records) ? h('div', { 'aria-label': '次级记录入口', style: { alignSelf: 'flex-end', fontSize: '12px' } }, entrance('awaiting', '记录核对')) : null,
    h('div', { 'aria-label': '工作流进度', style: { maxHeight: '96px', overflowY: 'auto', width: '100%', minHeight: 0 } },
      ...visible.flatMap(workflow => workflow.referenceCount !== null && workflow.referenceCount > 0
        ? [h('div', { key: workflow.workflowId + ':references' }, workflow.workflowId + ' · 任务引用 ' + workflow.referenceCount + ' · 旧票 ' + countText(workflow.ticketCount) + '（业务报告）'), ...workflow.axes.map(axis => workflowSummaryLine(workflow.workflowId, axis))]
        : workflow.ticketCount === 0
        ? [h('div', { key: workflow.workflowId + ':no-tickets' }, workflow.workflowId + ' / ' + workflow.axes.map(axis => axis.label).join(' / ') + ' · 暂无票')]
        : workflow.axes.map(axis => workflowSummaryLine(workflow.workflowId, axis))),
      hidden.length === 0 ? null : h('button', { key: 'workflow-rest', type: 'button', onClick: props.openDetails,
        'aria-label': '查看其余 ' + hidden.length + ' 个工作流的完整详情', style: inputTextButtonStyle }, '其余 ' + hidden.length + ' 个工作流 · 查看详情')),
    h('section', {
      id: regionPrefix, role: 'region', 'aria-label': selected === null ? undefined : INPUT_DISCLOSURES[selected].region,
      hidden: selected === null, style: { width: '100%', minWidth: 0, maxHeight: 'min(320px, 35vh)', overflowY: 'auto', textAlign: 'left' },
    }, selected === null ? null : h('div', null,
      h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', borderBottom: decisionBorder, padding: '4px 0' } },
        h('h3', { style: { fontSize: '14px', margin: 0, fontWeight: 600 } }, INPUT_DISCLOSURES[selected].region),
        h(Button, { variant: 'ghost', 'aria-label': '关闭详情', onClick: close }, '关闭详情')),
      selected === 'T' ? inputTicketDetails(view) : selected === 'S' ? inputRunningDetails(view) : inputDecisionDetails(view, selected, selection.decisionKeys))))
}

/** Explicit user answer; the Host RPC derives the real author, never the command. */
export function decisionAnswerCommand(records: InstrumentSnapshot, decision: DecisionRecord, answer: string, status: string,
  pending: boolean, awaitingImplementation: boolean, operationId: string): InstrumentCommand {
  if (!answer.trim() || !status.trim()) throw new Error('Answer and user-selected status are required')
  return { operationId, expectedRevision: records.businessRevision, workflowId: decision.workflowId,
    action: 'put-decision', decisionId: decision.decisionId,
    value: { question: decision.value.question, status, result: answer, pending, awaitingImplementation } }
}

/** Compatibility disposition is an authored context append, never a synthetic user answer. */
type DecisionFlagEdit = 'keep' | 'true' | 'false'
function decisionSourceTranscription(decision: DecisionRecord): string {
  return decision.history?.filter(change => change.references.length > 0).map(change =>
    '修订 ' + change.revision + ' · 原作者 ' + change.author.kind + ' / ' + change.author.principalId + '\n' + change.references.join('\n')).join('\n\n') ?? ''
}
// Mirrors the unchanged DecisionValue text wire bound; no source or context is truncated to fit it.
const DECISION_CONTEXT_TEXT_LIMIT = 65536
function decisionCloseoutContext(decision: DecisionRecord, note: string, sources: string): string {
  return [decision.value.context ?? '', '【核账处置（authored 声明，不是用户答复或完成证明）】\n' + note.trim(),
    sources.trim() ? '【本次 authored 转录：所选必要旧来源；不认证引用内容】\n' + sources.trim() : '本次未转录旧来源；不代表历史不存在，未知来源未补造。'].filter(Boolean).join('\n\n')
}
function decisionCloseoutContextError(context: string): string | null {
  if (context.length <= DECISION_CONTEXT_TEXT_LIMIT) return null
  return '超过现有背景字段 ' + DECISION_CONTEXT_TEXT_LIMIT + ' 字符上限，不能提交。请精简核账说明或仅保留必要旧来源转录；不会自动截断原背景或来源。若原背景本身无法容纳追加内容，请先通过原有授权编辑流程整理背景并保留必要指针，再显式重新读取。'
}
function decisionCloseoutCommand(records: InstrumentSnapshot, decision: DecisionRecord, note: string, references: string, sources: string,
  changes: { readonly status: string; readonly pending: DecisionFlagEdit; readonly awaiting: DecisionFlagEdit }, operationId: string): InstrumentCommand {
  if (!note.trim()) throw new Error('请填写核账说明与任务去向；这不是用户答复或完成证明。')

  const context = decisionCloseoutContext(decision, note, sources)
  const contextError = decisionCloseoutContextError(context)
  if (contextError !== null) throw new Error(contextError)
  return { operationId, expectedRevision: records.businessRevision, workflowId: decision.workflowId, action: 'put-decision', decisionId: decision.decisionId,
    references: [...new Set(references.split(/\r?\n/).map(value => value.trim()).filter(Boolean))],
    value: { question: decision.value.question, status: changes.status.trim() || decision.value.status, context,
      ...(changes.pending === 'keep' ? {} : { pending: changes.pending === 'true' }),
      ...(changes.awaiting === 'keep' ? {} : { awaitingImplementation: changes.awaiting === 'true' }) } }
}
function DecisionEditor(props: { readonly decision: DecisionRecord; readonly records: InstrumentSnapshot;
  readonly sessionId: string; readonly remote: ControlsRemote; readonly refresh: () => Promise<void> }): ReactElement {
  const [base, setBase] = useState({ records: props.records, decision: props.decision })
  const [answer, setAnswer] = useState('')
  const [intent, setIntent] = useState<'answer' | 'closeout'>('answer')
  const [closeoutNote, setCloseoutNote] = useState('')
  const [closeoutReferences, setCloseoutReferences] = useState('')
  const [closeoutSources, setCloseoutSources] = useState(() => decisionSourceTranscription(props.decision))
  const [closeoutStatus, setCloseoutStatus] = useState('')
  const [closeoutPending, setCloseoutPending] = useState<DecisionFlagEdit>('keep')
  const [closeoutAwaiting, setCloseoutAwaiting] = useState<DecisionFlagEdit>('keep')
  const [status, setStatus] = useState(props.decision.value.status)
  const [pending, setPending] = useState(props.decision.value.pending ?? false)
  const [awaiting, setAwaiting] = useState(props.decision.value.awaitingImplementation ?? false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const closeoutContext = decisionCloseoutContext(base.decision, closeoutNote, closeoutSources)
  const closeoutContextError = decisionCloseoutContextError(closeoutContext)
  const save = async (): Promise<void> => {
    setBusy(true); setMessage(null)
    try {
      const command = intent === 'closeout' ? decisionCloseoutCommand(base.records, base.decision, closeoutNote, closeoutReferences, closeoutSources,
        { status: closeoutStatus, pending: closeoutPending, awaiting: closeoutAwaiting }, crypto.randomUUID())
        : decisionAnswerCommand(base.records, base.decision, answer, status, pending, awaiting, crypto.randomUUID())
      remoteValue(await props.remote.applyInstrument(props.sessionId, command))
      setMessage(intent === 'closeout' ? '已登记核账处置（作者声明）；未替代用户答复或证明任务完成。' : '已记录你的裁决；待落实标记按你的明确选择保存。')
      await props.refresh()
    } catch (error) { setMessage(errorText(error)) } finally { setBusy(false) }
  }
  const flagChoice = (label: string, value: DecisionFlagEdit, setValue: (value: DecisionFlagEdit) => void): ReactElement =>
    h('label', { style: { display: 'block', margin: '8px 0' } }, label, h('select', { 'aria-label': label, value, disabled: busy, onChange: (event: ChangeEvent<HTMLSelectElement>) => setValue(event.target.value as DecisionFlagEdit) },
      h('option', { value: 'keep' }, '保持原值（本次不修改）'), h('option', { value: 'true' }, '明确设为 true'), h('option', { value: 'false' }, '明确设为 false')))
  return h('article', { style: { borderBottom: '1px solid currentColor', padding: '12px 0' } },
    h('h4', null, props.decision.value.question),
    h('p', null, props.decision.workflowId + ' · ' + props.decision.value.status + (props.decision.value.pending ? ' · 未解决' : '') + (props.decision.value.awaitingImplementation ? ' · 原待落实标记' : '')),
    decisionLongText('背景', props.decision.value.context),
    props.decision.value.recommendation ? h('p', null, '建议：' + props.decision.value.recommendation) : null,
    props.decision.value.impact ? h('p', null, '影响：' + props.decision.value.impact) : null,
    h('label', { style: { display: 'block', margin: '10px 0' } }, '保存意图', h('select', { 'aria-label': '保存意图', value: intent, disabled: busy, onChange: (event: ChangeEvent<HTMLSelectElement>) => { setIntent(event.target.value as 'answer' | 'closeout'); setMessage(null) } },
      h('option', { value: 'answer' }, '记录用户答复'), h('option', { value: 'closeout' }, '登记核账处置'))),
    intent === 'answer' ? props.decision.value.options?.map(option => h(Button, { key: option.key, type: 'button', disabled: busy, onClick: () => setAnswer(option.label) }, option.label)) : null,
    decisionLongText('已记录结果', props.decision.value.result),
    intent === 'closeout' ? h('fieldset', { style: { border: decisionBorder, padding: '10px', minWidth: 0 } },
      h('legend', null, '登记核账处置'),
      h('p', { style: { color: decisionSecondary, fontSize: '12px', lineHeight: 1.6 } }, '在原背景后追加作者声明与任务去向，不改原用户答复；必要旧来源须由你在下方明确保留，所选内容以 authored 转录写入持久背景，不认证引用内容。这不是完成证明，不自动清除标记。'),
      h('label', { style: { display: 'block' } }, '核账说明与任务去向', h('textarea', { 'aria-label': '核账说明与任务去向', value: closeoutNote, disabled: busy, style: { width: '100%', boxSizing: 'border-box' }, onChange: (event: ChangeEvent<HTMLTextAreaElement>) => setCloseoutNote(event.target.value) })),
      h('label', { style: { display: 'block', margin: '8px 0' } }, '必要旧来源转录（authored，可编辑）', h('textarea', { 'aria-label': '必要旧来源转录（authored，可编辑）', rows: 5, value: closeoutSources, disabled: busy, style: { width: '100%', boxSizing: 'border-box' }, onChange: (event: ChangeEvent<HTMLTextAreaElement>) => setCloseoutSources(event.target.value) })),
      h('p', { style: { color: decisionSecondary, fontSize: '12px', lineHeight: 1.6 } }, '预填当前授权可见引用，可删减为本次必要来源并编辑；请连同原修订与原作者保留。不会静默截断或替你判断哪些来源可以丢弃。本次来源引用是另一个字段，不代替持久背景中的必要旧来源。'),
      h('label', { style: { display: 'block' } }, '本次来源引用（每行一条）', h('textarea', { 'aria-label': '本次来源引用（每行一条）', value: closeoutReferences, disabled: busy, style: { width: '100%', boxSizing: 'border-box' }, onChange: (event: ChangeEvent<HTMLTextAreaElement>) => setCloseoutReferences(event.target.value) })),
      h('label', { style: { display: 'block', margin: '8px 0' } }, '核账状态（留空保留原状态）', h(Input, { 'aria-label': '核账状态（留空保留原状态）', value: closeoutStatus, disabled: busy, placeholder: base.decision.value.status, onChange: (event: ChangeEvent<HTMLInputElement>) => setCloseoutStatus(event.target.value) })),
      flagChoice('核账 pending', closeoutPending, setCloseoutPending), flagChoice('核账原待落实标记', closeoutAwaiting, setCloseoutAwaiting),
      h('p', { 'aria-label': '核账背景长度', role: closeoutContextError === null ? undefined : 'status', style: { color: closeoutContextError === null ? decisionSecondary : 'var(--dsw-alias-state-error-primary, #dc4444)', fontSize: '12px', lineHeight: 1.6 } },
        '拼接后背景 ' + closeoutContext.length + ' / ' + DECISION_CONTEXT_TEXT_LIMIT + ' 字符；原背景 ' + (base.decision.value.context?.length ?? 0) + ' 字符原样保留。' + (closeoutContextError ?? '')),
      h(Button, { disabled: busy || !closeoutNote.trim() || closeoutContextError !== null, onClick: () => { void save() } }, '登记核账处置'))
    : h('div', null,
      h('label', null, '你的裁决', h('textarea', { 'aria-label': '用户答复', value: answer, disabled: busy, onChange: (event: ChangeEvent<HTMLTextAreaElement>) => setAnswer(event.target.value) })),
      h('label', null, '保存状态（任务自定义）', h('input', { value: status, disabled: busy, onChange: (event: ChangeEvent<HTMLInputElement>) => setStatus(event.target.value) })),
      h('label', null, h('input', { type: 'checkbox', checked: pending, disabled: busy, onChange: (event: ChangeEvent<HTMLInputElement>) => setPending(event.target.checked) }), '仍 pending'),
      h('label', null, h('input', { type: 'checkbox', checked: awaiting, disabled: busy, onChange: (event: ChangeEvent<HTMLInputElement>) => setAwaiting(event.target.checked) }), '保留原待落实标记（不代表已经用户裁决）'),
      h(Button, { disabled: busy || !answer.trim() || !status.trim(), onClick: () => { void save() } }, '按明确选择记录裁决')),
    h('button', { type: 'button', disabled: busy, onClick: () => { setBase({ records: props.records, decision: props.decision }); setAnswer(''); setIntent('answer'); setCloseoutNote(''); setCloseoutReferences(''); setCloseoutSources(decisionSourceTranscription(props.decision)); setCloseoutStatus(''); setCloseoutPending('keep'); setCloseoutAwaiting('keep'); setStatus(props.decision.value.status); setPending(props.decision.value.pending ?? false); setAwaiting(props.decision.value.awaitingImplementation ?? false); setMessage(null) } }, '重新读取事项（丢弃草稿）'),
    diagnostic('草稿业务修订 ' + base.records.businessRevision + '；背景刷新不会升级保存修订。'),
    message === null ? null : diagnostic(message),
    h(DecisionTechnicalDetails, { label: '来源历史（不是当前状态）', value: props.decision.history }))
}

export function Details(props: PropsRuntime<'sidebar.right.pane.tab'> & SessionFace & { readonly remote: ControlsRemote }): ReactElement {
  const observation = useObservation(props.observer)
  const tab = props.useTabInfo()
  const current = observation.status === 'ready' && observation.value.sessionId === props.sessionId && props.observer.sessionId === props.sessionId ? observation.value : null
  const readIdentity = JSON.stringify([props.sessionId, props.observer.sessionId, current?.instance, current?.caller, current?.policyGrants.revision, current?.records?.scope,
    current?.policy.display.rightPanel, current !== null && inputRecords(current) !== null])
  const [reading, setReading] = useState<{ readonly identity: string; readonly key: string | null }>({ identity: readIdentity, key: null })
  if (reading.identity !== readIdentity) setReading({ identity: readIdentity, key: null })
  if (props.observer.sessionId !== props.sessionId) return diagnostic('会话选择与观察归属不一致；状态未知。')
  if (observation.status === 'unknown') return h('section', { style: panelStyle }, diagnostic('当前状态未知：' + (observation.error ?? '读取中')), h('button', { type: 'button', onClick: () => { void props.observer.refresh() } }, '重新读取'))
  const view = observation.value
  if (!view.policy.display.rightPanel) return h('section', { style: panelStyle }, diagnostic('右侧显示已关闭；账本和模型消费不受影响。'))
  const records = inputRecords(view)
  const decisions = records === null || !Array.isArray(records.decisions) ? [] : uniqueDecisionRecords(records.decisions)

  const selectedDecision = reading.identity === readIdentity ? decisions.find(row => decisionRecordKey(row) === reading.key) : undefined
  if (reading.identity === readIdentity && reading.key !== null && selectedDecision === undefined) setReading({ identity: readIdentity, key: null })

  // The editor is mounted at one stable location, never moved between queue parents.
  // Current authorized rows supply the body; scope/identity/read failures unmount all draft content.
  const reader = selectedDecision === undefined || records === null ? null : h('section', { key: 'decision-reader', 'aria-label': '裁决阅读与编辑' },
    h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' } }, h('h4', { style: { fontSize: '14px', margin: 0 } }, '裁决阅读与编辑'),
      h(Button, { variant: 'ghost', size: 'sm', onClick: () => setReading({ identity: readIdentity, key: null }) }, '关闭阅读')),
    diagnostic('当前分类：' + (isPendingUserDecision(selectedDecision) ? '待你裁决' : isAwaitingImplementation(selectedDecision) || isNonUserPending(selectedDecision) ? '记录核对（已更新）' : '其他 / 已解决（已更新）') + '；分类变化不关闭阅读。'),
    h(DecisionEditor, { key: readIdentity + ':' + decisionRecordKey(selectedDecision), decision: selectedDecision, records, sessionId: props.sessionId, remote: props.remote, refresh: props.observer.refresh }))
  return h('section', { style: panelStyle, 'aria-label': '协作详情' },
    h('h3', null, '协作 · ' + view.instance.ownerSessionId),
    diagnostic('实例 ' + view.instance.instrumentInstanceId + ' · Session ' + props.sessionId + (tab.tab.visible ? '' : ' · 非前台')),
    h('button', { type: 'button', onClick: () => { void props.observer.refresh() } }, '刷新已提交投影'),
    h(TaskReferences, { key: readIdentity + ':references', view }),
    h('h4', null, '旧票业务报告'),
    records === null ? diagnostic('票/事项账本未知或不可用') : h('div', null,
      diagnostic('统计范围：' + records.summary.countingScope + ' · 业务修订 ' + records.businessRevision),
      records.workflows.map(workflow => h('section', { key: workflow.workflowId }, h('h4', null, workflow.value.title),
        workflow.value.axes.map(axis => h('div', { key: axis.axisKey }, h('p', null, axis.label + ' · ' + axis.counting), axis.statuses.map(status => h('span', { key: status.statusKey, title: status.meaning ?? undefined }, status.label + ' ')))),
        records.tickets.filter(ticket => ticket.workflowId === workflow.workflowId).map(ticket => h('article', { key: ticket.localTicketId }, h('strong', null, ticket.value.title), pretty(ticket.value))))),
      h(DecisionQueues, { key: readIdentity, view, edit: (decision: DecisionRecord) => setReading({ identity: readIdentity, key: decisionRecordKey(decision) }) })),
    reader,
    h('h4', null, '双窗口（实例范围，观测）'), h(WindowProjection, { view }),
    h(WorktreeBindingsPanel, { key: props.sessionId + ':bindings', view, remote: props.remote, refresh: props.observer.refresh }),
    h(WorktreeObservationsPanel, { key: props.sessionId + ':observations', view, remote: props.remote, refresh: props.observer.refresh }),
    h('details', null, h('summary', null, '旧资源记录（仅只读，不提供创建/实际退役入口）'), ResourceProjection({ view })),
    h('h4', null, '能力与健康（观测标签）'), diagnostic('能力与健康标签是宿主观测，不是操作许可或业务裁决。'), pretty({ capabilities: view.capabilities, health: view.health }),
    h(HistoryPanel, { key: props.sessionId + ':history', sessionId: props.sessionId, instance: view.instance, remote: props.remote, refresh: props.observer.refresh }),
    h(SupervisionHistory, { remote: props.remote, sessionId: props.sessionId }),
    h(PolicyDelegation, { key: props.sessionId + ':policy-grants', view, remote: props.remote, refresh: props.observer.refresh }),
    h('details', null, h('summary', null, '有效策略及来源'), pretty(view.policy)))
}

function bindingRows(view: ClientSessionSnapshot): readonly WorktreeBindingCurrent[] | null {
  const failure = view.health.find(row => ['worktree-bindings', 'worktrees'].includes(row.scope) && row.status === 'unknown')
  if (failure !== undefined || view.worktreeBindings === undefined) return null
  if (!Array.isArray(view.worktreeBindings)) throw new Error('工作树绑定列表未知')
  return view.worktreeBindings.map(value => {
    const row = object(value); nonempty(row.bindingId); safeCount(row.revision)
    const binding = object(row.value); const business = object(binding.business)
    if (!['active', 'discarded', 'cleaned'].includes(String(business.state))) throw new Error('工作树业务状态未知')
    if (!['intent', 'program', 'agent'].includes(String(row.source))) throw new Error('工作树来源未知')
    nonempty(binding.parentSessionId); nonempty(binding.plannedChildSessionId); nonempty(binding.requestedCwd)
    if (binding.actualChildSessionId !== null) nonempty(binding.actualChildSessionId)
    if (binding.actualCwd !== null) nonempty(binding.actualCwd)
    if (!['unknown', 'accepted', 'rejected'].includes(String(binding.acceptance)) || !['pending', 'confirmed', 'failed', 'cancelled', 'accepted-unknown'].includes(String(binding.outcome))) throw new Error('原生绑定观测状态未知')
    if (Object.hasOwn(row, 'history')) throw new Error('当前工作树投影不能夹带完整历史')
    return value
  }).filter(row => row.value.business.state !== 'cleaned')
}
export function bindingSummary(view: ClientSessionSnapshot): string {
  try { const rows = bindingRows(view)
    if (rows === null) return '工作树绑定未知'
    const reminders = rows.filter(row => row.value.business.state === 'discarded').length
    return '工作树绑定 ' + rows.length + (reminders ? ' · 待处置 ' + reminders : '')
  } catch { return '工作树绑定未知' }
}
export function WorktreeBindingsPanel(props: { readonly view: ClientSessionSnapshot; readonly remote: ControlsRemote; readonly refresh: () => Promise<void> }): ReactElement {
  let rows: readonly WorktreeBindingCurrent[] | null
  try { rows = bindingRows(props.view) } catch (error) { return diagnostic('工作树绑定未知：' + errorText(error)) }
  const reason = props.view.health.find(row => ['worktree-bindings', 'worktrees'].includes(row.scope) && row.status === 'unknown')?.reason
  return h('section', { 'aria-label': '工作树绑定仪器' }, h('h4', null, '工作树绑定（当前注入视图）'),
    diagnostic('这里只登记业务状态，不创建、合并或删除工作树/分支，不证明已执行 Git。已清理树退出当前视图，历史需主动查询。'),
    rows === null ? diagnostic('工作树绑定数量未知：' + (reason ?? '宿主未返回绑定投影')) : h('div', null,
      diagnostic('当前绑定 ' + rows.length + '（不是完整历史或执行总数）'),
      rows.map(row => h(WorktreeBindingEditor, { key: props.view.sessionId + ':' + row.bindingId, sessionId: props.view.sessionId, row, remote: props.remote, refresh: props.refresh })),
      rows.some(row => row.value.business.state === 'discarded') ? diagnostic('废弃但未清理的工作树仍待处置，不自动隐藏或删除。') : null))
}
function observationRows(view: ClientSessionSnapshot): readonly WorktreeObservationView[] | null {
  const failure = view.health.find(row => row.scope === 'worktree-observations' && row.status === 'unknown')
  if (failure !== undefined || view.worktreeObservations === undefined) return null
  if (!Array.isArray(view.worktreeObservations)) throw new Error('工作树观测列表未知')
  return view.worktreeObservations.map(value => {
    const row = object(value); nonempty(row.observationId); safeCount(row.revision)
    const observed = object(row.value)
    nonempty(observed.creatorSessionId); nonempty(observed.path); nonempty(observed.branch); nonempty(observed.baseCommit); nonempty(observed.repositoryRoot)
    if (!['running', 'idle', 'gone'].includes(String(row.creatorActivity))) throw new Error('创建者活动性未知')
    if (!['program', 'replay', 'agent'].includes(String(row.source))) throw new Error('工作树观测来源未知')
    const check = object(observed.check)
    if (!['unverified', 'verified', 'failed', 'absent'].includes(String(check.state))) throw new Error('工作树核验状态未知')
    const business = object(observed.business)
    if (!['open', 'cleaned'].includes(String(business.state))) throw new Error('工作树观测业务状态未知')
    if (!Array.isArray(row.nativeChildren)) throw new Error('工作树观测的原生子会话关联未知')
    for (const child of row.nativeChildren) {
      const linked = object(child)
      nonempty(linked.sessionId)
      if (Object.hasOwn(linked, 'initialCwd')) throw new Error('原生子会话关联不再接受初始 cwd 字段')
      if (linked.headerCwd !== null && (typeof linked.headerCwd !== 'string' || !linked.headerCwd.trim())) throw new Error('原生子会话 header cwd 未知')
      if (linked.relation !== 'created-tree' || linked.source !== 'observed') throw new Error('原生子会话关联来源未知')
    }
    if (row.lane !== null && row.lane !== undefined) {
      const lane = object(row.lane)
      if (lane.source !== 'inferred') throw new Error('工作树观测 lane 来源未知')
    }
    if (Object.hasOwn(row, 'history')) throw new Error('当前工作树观测不能夹带完整历史')
    return value
  }).filter(row => row.value.business.state !== 'cleaned')
}
export function observationSummary(view: ClientSessionSnapshot): string {
  try { const rows = observationRows(view); return rows === null ? '原生建树未知' : '原生建树 ' + rows.length } catch { return '原生建树未知' }
}
export function WorktreeObservationsPanel(props: { readonly view: ClientSessionSnapshot; readonly remote: ControlsRemote; readonly refresh: () => Promise<void> }): ReactElement {
  let rows: readonly WorktreeObservationView[] | null
  try { rows = observationRows(props.view) } catch (error) { return diagnostic('工作树观测未知：' + errorText(error)) }
  const reason = props.view.health.find(row => row.scope === 'worktree-observations' && row.status === 'unknown')?.reason
  const linked = rows?.reduce((total, row) => total + row.nativeChildren.length, 0) ?? 0
  return h('section', { 'aria-label': '工作树观测仪器' }, h('h4', null, '原生建树观测（create_worktree）'),
    diagnostic('只登记经 DSH 工具管线成功执行的原生 create_worktree；创建者活动性是读取时的宿主事实，树是否存在以受权 Git 核验为准。不记录、不推测目录被谁使用，也不创建或删除任何树。'),
    rows === null ? diagnostic('工作树观测数量未知：' + (reason ?? '宿主未返回观测投影')) : h('div', null,
      diagnostic('当前观测 ' + rows.length + (linked === 0 ? '' : ' · 原生子会话关联 ' + linked + ' 条（created-tree；observed）') + '（已登记清理的行退出当前视图，记录与历史保留）'),
      rows.map(row => h(WorktreeObservationEditor, { key: props.view.sessionId + ':' + row.observationId, sessionId: props.view.sessionId, row, remote: props.remote, refresh: props.refresh }))))
}
export function WorktreeObservationEditor(props: { readonly sessionId: string; readonly row: WorktreeObservationView; readonly remote: ControlsRemote; readonly refresh: () => Promise<void> }): ReactElement {
  const [base, setBase] = useState(props.row)
  const [state, setState] = useState(props.row.value.business.state)
  const [notes, setNotes] = useState(props.row.value.business.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [lifetime] = useState(() => ({ active: false, generation: 0, sessionId: props.sessionId, observationId: props.row.observationId }))
  useEffect(() => { lifetime.active = true; lifetime.sessionId = props.sessionId; lifetime.observationId = props.row.observationId; lifetime.generation++
    setBase(props.row); setState(props.row.value.business.state); setNotes(props.row.value.business.notes ?? ''); setBusy(false); setMessage(null)
    return () => { lifetime.active = false; lifetime.generation++ }
  }, [props.sessionId, props.row.observationId, props.remote, lifetime])
  const save = async (): Promise<void> => {
    if (!lifetime.active || lifetime.sessionId !== props.sessionId || lifetime.observationId !== props.row.observationId) return
    const generation = ++lifetime.generation; setBusy(true); setMessage(null)
    try { const request = parseHostJson({ action: 'update-observation', command: { operationId: crypto.randomUUID(), observationId: base.observationId, expectedRevision: base.revision, state, notes } })
      const response = object(parseHostJson(remoteValue(await props.remote.worktreeAction(props.sessionId, request))))
      if (!lifetime.active || generation !== lifetime.generation) return
      if (response.observationId !== base.observationId) throw new Error('工作树观测更新回执归属不一致')
      safeCount(response.revision)
      const saved = object(object(response.value).business)
      if (saved.state !== state || (saved.notes ?? '') !== notes) throw new Error('工作树观测业务回执缺失或与登记不一致')
      setMessage('已保存作者登记；未执行 Git，程序核验事实不变。')
      await props.refresh()
    } catch (error) { if (lifetime.active && generation === lifetime.generation) setMessage('登记结果未知/冲突：' + errorText(error)) }
    finally { if (lifetime.active && generation === lifetime.generation) setBusy(false) }
  }
  if (lifetime.sessionId !== props.sessionId || lifetime.observationId !== props.row.observationId) return diagnostic('工作树观测归属变化；登记草稿未知，等待重新读取。')
  const check = props.row.value.check
  return h('article', { 'aria-label': '工作树观测 ' + props.row.observationId },
    h('strong', null, props.row.value.branch + ' · ' + check.state),
    diagnostic('目录 ' + props.row.value.path + ' · 仓库 ' + props.row.value.repositoryRoot),
    diagnostic('创建者 ' + props.row.value.creatorSessionId + '（当前 ' + props.row.creatorActivity + '） · 观测来源 ' + props.row.source + ' · 调用 ' + props.row.value.callId),
    diagnostic('核验时间 ' + (check.checkedAt ?? '尚未核验') + ' · Git 身份 ' + (check.facts === null ? '未知（未留下已证事实）' : check.facts.gitCommonDir + ' · ' + (check.facts.branchRef ?? '无本地分支') + ' @ ' + (check.facts.branchOid ?? '未知'))),
    check.diagnostic === null ? null : diagnostic('核验失败原因（未知即未知）：' + check.diagnostic),
    props.row.lane === null ? diagnostic('票信息未知：该创建者没有可核对的 lane 绑定。') : diagnostic('lane（inferred）' + (props.row.lane.workflowId ?? '无工作流') + ' · 票 ' + (props.row.lane.ticketIds.join(', ') || '无') + (props.row.lane.task === null ? '' : ' · ' + props.row.lane.task)),
    h('div', { 'aria-label': '原生子会话关联' }, diagnostic('原生子会话关联（created-tree；observed；只证明创建，不是强绑定，也不表示目录正在被使用）'),
      props.row.nativeChildren.length === 0 ? diagnostic('没有可观测的 created-tree 创建者关联；空关联不等于没人使用该目录。')
        : props.row.nativeChildren.map(child => diagnostic(child.sessionId + ' · 创建此树（created-tree） · header cwd '
          + (child.headerCwd === null ? '未知' : child.headerCwd + '（来源值，不证明实际初始目录）')))),
    h('label', null, '业务状态 ', h('select', { disabled: busy, value: state, onChange: (event: ChangeEvent<HTMLSelectElement>) => { const next = event.target.value; if (next === 'open' || next === 'cleaned') setState(next) } },
      h('option', { value: 'open' }, '未处理'), h('option', { value: 'cleaned' }, '登记已处理'))),
    h('label', null, '业务说明 ', h('textarea', { disabled: busy, value: notes, onChange: (event: ChangeEvent<HTMLTextAreaElement>) => setNotes(event.target.value) })),
    diagnostic('草稿观测修订 ' + base.revision + '；背景刷新不会升级保存修订。已处理只是作者登记，不是此界面执行 Git 的回执。'),
    h('button', { type: 'button', disabled: busy, onClick: () => { void save() } }, '保存作者登记（不执行 Git）'),
    h('button', { type: 'button', disabled: busy, onClick: () => { setBase(props.row); setState(props.row.value.business.state); setNotes(props.row.value.business.notes ?? ''); setMessage(null) } }, '重新读取观测（丢弃草稿）'),
    message === null ? null : diagnostic(message))
}
export function WorktreeBindingEditor(props: { readonly sessionId: string; readonly row: WorktreeBindingCurrent; readonly remote: ControlsRemote; readonly refresh: () => Promise<void> }): ReactElement {
  const [base, setBase] = useState(props.row)
  const [state, setState] = useState(props.row.value.business.state)
  const [notes, setNotes] = useState(props.row.value.business.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [lifetime] = useState(() => ({ active: false, generation: 0, sessionId: props.sessionId, bindingId: props.row.bindingId }))
  useEffect(() => { lifetime.active = true; lifetime.sessionId = props.sessionId; lifetime.bindingId = props.row.bindingId; lifetime.generation++
    setBase(props.row); setState(props.row.value.business.state); setNotes(props.row.value.business.notes ?? ''); setBusy(false); setMessage(null)
    return () => { lifetime.active = false; lifetime.generation++ }
  }, [props.sessionId, props.row.bindingId, props.remote, lifetime])
  const save = async (): Promise<void> => {
    if (!lifetime.active || lifetime.sessionId !== props.sessionId || lifetime.bindingId !== props.row.bindingId) return
    const generation = ++lifetime.generation; setBusy(true); setMessage(null)
    try { const request = parseHostJson({ action: 'update', command: { operationId: crypto.randomUUID(), bindingId: base.bindingId, expectedRevision: base.revision, state, notes } })
      const response = object(parseHostJson(remoteValue(await props.remote.worktreeAction(props.sessionId, request))))
      if (!lifetime.active || generation !== lifetime.generation) return
      if (response.bindingId !== base.bindingId) throw new Error('工作树更新回执归属不一致')
      safeCount(response.revision)
      const saved = object(object(response.value).business)
      if (saved.state !== state || (saved.notes ?? '') !== notes) throw new Error('工作树业务回执缺失或与登记不一致')
      setMessage('已保存业务登记；未执行 Git 或物理删除，事实观测与业务登记分别标来源。')
      await props.refresh()
    } catch (error) { if (lifetime.active && generation === lifetime.generation) setMessage('登记结果未知/冲突：' + errorText(error)) }
    finally { if (lifetime.active && generation === lifetime.generation) setBusy(false) }
  }
  if (lifetime.sessionId !== props.sessionId || lifetime.bindingId !== props.row.bindingId) return diagnostic('工作树归属变化；登记草稿未知，等待重新读取。')
  return h('article', { 'aria-label': '工作树绑定 ' + props.row.bindingId },
    h('strong', null, props.row.bindingId + ' · ' + props.row.value.business.state),
    diagnostic('计划子会话 ' + props.row.value.plannedChildSessionId + ' · 实际子会话 ' + (props.row.value.actualChildSessionId ?? '未知') + ' · 实际目录 ' + (props.row.value.actualCwd ?? '未知')),
    diagnostic('原生接收观测 ' + props.row.value.acceptance + ' / ' + props.row.value.outcome + '（程序字段） · 当前登记来源 ' + props.row.source + ' · 当前登记时间 ' + props.row.recordedAt),
    pretty({ requestedCwd: props.row.value.requestedCwd, task: props.row.value.task ?? null, author: props.row.author, diagnostic: props.row.value.diagnostic }),
    props.row.value.business.state === 'discarded' ? diagnostic('废弃但未清理：待处置提醒仍保留。') : null,
    h('label', null, '业务状态 ', h('select', { disabled: busy, value: state, onChange: (event: ChangeEvent<HTMLSelectElement>) => { const next = event.target.value; if (next === 'active' || next === 'discarded' || next === 'cleaned') setState(next) } },
      h('option', { value: 'active' }, '使用中'), h('option', { value: 'discarded' }, '废弃但未清理'), h('option', { value: 'cleaned' }, '登记已清理'))),
    h('label', null, '业务说明 ', h('textarea', { disabled: busy, value: notes, onChange: (event: ChangeEvent<HTMLTextAreaElement>) => setNotes(event.target.value) })),
    diagnostic('草稿绑定修订 ' + base.revision + '；背景刷新不会升级保存修订。已清理是业务登记，不是此界面执行 Git 的回执。'),
    h('button', { type: 'button', disabled: busy, onClick: () => { void save() } }, '保存业务登记（不执行 Git）'),
    h('button', { type: 'button', disabled: busy, onClick: () => { setBase(props.row); setState(props.row.value.business.state); setNotes(props.row.value.business.notes ?? ''); setMessage(null) } }, '重新读取绑定（丢弃草稿）'),
    message === null ? null : diagnostic(message))
}

interface HistorySummaryView { readonly historyId: string; readonly kind: string; readonly recordId: string; readonly sequence: number; readonly purged: boolean; readonly [key: string]: unknown }
type SourceDomain = 'records' | 'windows' | 'worktrees'
interface HistoryPageView { readonly rows: readonly HistorySummaryView[]; readonly total: number; readonly cut: number; readonly nextCursor: HostJson; readonly coverage: HostJson; readonly sourceRevisions: Readonly<Record<SourceDomain, number | null>> }
function knownRevision(value: unknown): number | null { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null }
function sourceCleanupPlan(row: HistorySummaryView, page: HistoryPageView, instanceId: string): { readonly domain: SourceDomain; readonly request: HostJson | null; readonly reason: string } | null {
  const domain: SourceDomain | null = row.sourceDomain === 'worktree-bindings' && row.kind === 'worktree' ? 'worktrees'
    : row.sourceDomain === 'instruments' && ['workflow', 'ticket', 'decision'].includes(row.kind) ? 'records'
      : row.sourceDomain === 'windows' && ['ticket-window', 'execution', 'runtime-knowledge'].includes(row.kind) ? 'windows' : null
  if (domain === null) return null
  let selector: HostJson
  try {
    if (domain === 'worktrees') selector = { bindingIds: [row.recordId] }
    else if (domain === 'records' && row.kind === 'workflow') selector = { targets: [{ kind: 'workflow', workflowId: row.recordId }] }
    else if (row.kind === 'runtime-knowledge') { if (row.recordId !== instanceId) throw new Error('knowledge belongs to another instance'); selector = { targets: [{ kind: 'knowledge' }] } }
    else {
      const pair: unknown = JSON.parse(row.recordId)
      if (!Array.isArray(pair) || pair.length !== 2) throw new Error('source identity must be a pair')
      const first = nonempty(pair[0])
      if (row.kind === 'execution') { const generation = knownRevision(pair[1]); if (generation === null || generation < 1) throw new Error('execution generation is unknown'); selector = { targets: [{ kind: 'execution', executionId: first }] } }
      else { const second = nonempty(pair[1]); selector = { targets: [row.kind === 'decision' ? { kind: 'decision', workflowId: first, decisionId: second } : { kind: 'ticket', workflowId: first, localTicketId: second }] } }
    }
  } catch { return { domain, request: null, reason: '源对象选择器未知或不一致，删除不可用；不猜测工作流/票/执行身份。' } }
  const expectedRevision = page.sourceRevisions[domain]; const throughRevision = knownRevision(row.version)
  if (expectedRevision === null || throughRevision === null) return { domain, request: null, reason: '源修订或本版本未知，源旧历史删除不可用；请重新查询，不补零。' }
  if (throughRevision > expectedRevision) return { domain, request: null, reason: '本版本超出已读取源修订，删除不可用；请重新查询。' }
  return { domain, request: { expectedRevision, throughRevision, ...object(selector) } as HostJson, reason: '源修订 ' + expectedRevision + ' · 截至版本 ' + throughRevision + '；仅此对象的源旧历史，保留最新/当前记录。' }
}
function safeCount(value: unknown): number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Host count is unavailable'); return value }
function sameInstance(value: unknown, expected: ClientSessionSnapshot['instance']): void {
  const bound = object(value)
  for (const key of ['instrumentInstanceId', 'ownerSessionId', 'controlWorkspaceId'] as const) if (bound[key] !== expected[key]) throw new Error('历史查询属于不同实例')
}
function historySummary(value: unknown): HistorySummaryView {
  const row = object(value)
  nonempty(row.historyId); nonempty(row.kind); nonempty(row.recordId); safeCount(row.sequence)
  if (typeof row.purged !== 'boolean') throw new Error('历史保留状态未知')
  if (Object.hasOwn(row, 'snapshot')) throw new Error('历史摘要不应夹带详情正文')
  return row as unknown as HistorySummaryView
}
function historyPage(value: unknown, expected: ClientSessionSnapshot['instance']): HistoryPageView {
  const raw = object(parseHostJson(value)); sameInstance(raw.instance, expected); safeCount(raw.revision)
  if (typeof raw.notRecorded !== 'boolean') throw new Error('历史记录覆盖状态未知')
  if (!Array.isArray(raw.rows)) throw new Error('历史摘要页未知')
  const rows = raw.rows.map(historySummary); const total = safeCount(raw.total); const cut = safeCount(raw.cut)
  const coverage = parseHostJson(raw.coverage); const covered = object(coverage)
  if (typeof covered.purged !== 'boolean' || typeof covered.notRecorded !== 'boolean' || !Array.isArray(covered.sources)) throw new Error('历史覆盖范围未知')
  const nextCursor = parseHostJson(raw.nextCursor)
  if (nextCursor !== null) { const cursor = object(nextCursor); sameInstance(cursor, expected); if (safeCount(cursor.cut) !== cut) throw new Error('历史游标截点不一致'); safeCount(cursor.after) }
  const sourceData = raw.sourceRevisions !== null && typeof raw.sourceRevisions === 'object' && !Array.isArray(raw.sourceRevisions) ? object(raw.sourceRevisions) : {}
  const sourceRevisions = { records: knownRevision(sourceData.records), windows: knownRevision(sourceData.windows), worktrees: knownRevision(sourceData.worktrees) }
  return { rows, total, cut, nextCursor, coverage, sourceRevisions }
}
/** Effects only fence lifetime; all history reads are initiated by explicit clicks. */
export function HistoryPanel(props: { readonly sessionId: string; readonly instance: ClientSessionSnapshot['instance']; readonly remote: ControlsRemote; readonly refresh: () => Promise<void> }): ReactElement {
  const [kind, setKind] = useState('')
  const [recordId, setRecordId] = useState('')
  const [page, setPage] = useState<HistoryPageView | null>(null)
  const [details, setDetails] = useState<Record<string, HostJson>>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [lifetime] = useState(() => ({ generation: 0, active: false, sessionId: props.sessionId, instanceId: props.instance.instrumentInstanceId, controller: undefined as AbortController | undefined }))
  useEffect(() => { lifetime.active = true; lifetime.sessionId = props.sessionId; lifetime.instanceId = props.instance.instrumentInstanceId; lifetime.generation++; setPage(null); setDetails({}); setBusy(false); setMessage(null)
    return () => { lifetime.active = false; lifetime.generation++; lifetime.controller?.abort() }
  }, [props.sessionId, props.remote, props.instance.instrumentInstanceId, lifetime])
  const run = async (request: HostJson, receive: (value: HostJson) => void): Promise<void> => {
    if (!lifetime.active || lifetime.sessionId !== props.sessionId || lifetime.instanceId !== props.instance.instrumentInstanceId) return
    const generation = ++lifetime.generation; lifetime.controller?.abort(); const controller = new AbortController(); lifetime.controller = controller; setBusy(true); setMessage(null)
    try { const value = parseHostJson(remoteValue(await props.remote.historyAction(props.sessionId, parseHostJson(request), controller.signal)))
      if (lifetime.active && generation === lifetime.generation) receive(value)
    } catch (error) { if (lifetime.active && generation === lifetime.generation) {
      const action = object(request); const operation = action.action === 'purge-source' ? ' · 操作 ' + String(object(action.request).operationId) : ''
      setPage(null); setDetails({}); setMessage('历史状态未知：' + errorText(error) + operation)
    } }
    finally { if (lifetime.active && generation === lifetime.generation) setBusy(false) }
  }
  const query = (cursor?: HostJson): void => {
    setPage(null); setDetails({})
    void run({ action: 'query', query: { ...(kind.trim() ? { kind: kind.trim() } : {}), ...(recordId.trim() ? { recordId: recordId.trim() } : {}), limit: 20, ...(cursor === undefined ? {} : { cursor }) } }, value => setPage(historyPage(value, props.instance)))
  }
  const expand = (row: HistorySummaryView): void => {
    void run({ action: 'detail', historyIds: [row.historyId] }, value => {
      const detail = object(value); safeCount(detail.revision)
      const coverage = object(detail.coverage)
      if (typeof coverage.purged !== 'boolean' || typeof coverage.notRecorded !== 'boolean' || !Array.isArray(coverage.sources) || typeof detail.notRecorded !== 'boolean') throw new Error('历史详情覆盖范围未知')
      if (!Array.isArray(detail.rows) || !Array.isArray(detail.missingHistoryIds)) throw new Error('历史详情未知')
      for (const item of detail.rows) { const found = object(item); if (found.historyId !== row.historyId || !Object.hasOwn(found, 'snapshot')) throw new Error('历史详情身份不一致') }
      setDetails(previous => ({ ...previous, [row.historyId]: value }))
    })
  }
  const mutate = (request: HostJson): void => {
    void run(request, value => {
      safeCount(object(value).revision); setPage(null); setDetails({})
      setMessage('已提交历史副本/注入操作；未执行 Git 删除或磁盘清理，未声称删除源事件或原生会话。可重新查询核对结果。')
      void props.refresh()
    })
  }
  const sourceControls = (row: HistorySummaryView, page: HistoryPageView): ReactElement | null => {
    const plan = sourceCleanupPlan(row, page, props.instance.instrumentInstanceId)
    if (plan === null) return null
    const purgeSource = (): void => {
      if (plan.request === null) return
      void run({ action: 'purge-source', domain: plan.domain, request: { ...object(plan.request), operationId: crypto.randomUUID() } } as HostJson, value => {
        const receipt = object(value)
        if (receipt.phase === 'partial') throw new Error('源清理部分完成/状态未知：' + (receipt.derivedHistoryDeleted === true ? '衍生副本已处理；' : '衍生副本状态未知；') + '源旧历史删除未完成或不确定。' + String(receipt.error ?? ''))
        if (receipt.receiptRecording === 'failed-or-uncertain') throw new Error('源清理回执记录失败或不确定，不能声称全部成功。' + String(receipt.error ?? ''))
        if (receipt.scope !== 'selected-source-history-only' || receipt.domain !== plan.domain || receipt.sourceRecordsDeleted !== true || receipt.derivedHistoryDeleted !== true || receipt.nativeConversationDeleted !== false || typeof receipt.replayed !== 'boolean') throw new Error('源清理回执不完整或归属不一致')
        safeCount(receipt.appliedRevision ?? receipt.revision); setPage(null); setDetails({})
        setMessage('已删除所选对象的源旧历史及关联衍生副本；保留当前/最新记录。未删除原生会话，未执行 Git 或磁盘清理。' + (receipt.replayed ? '（原操作回执重放）' : ''))
        void props.refresh()
      })
    }
    return h('div', { 'aria-label': '源旧历史操作 ' + row.historyId }, diagnostic(plan.reason),
      h('button', { type: 'button', disabled: busy || plan.request === null, onClick: purgeSource }, '删除此对象截至本版本的源旧历史（保当前）'))
  }
  const changeFilter = (set: (value: string) => void, value: string): void => { lifetime.generation++; lifetime.controller?.abort(); set(value); setPage(null); setDetails({}); setBusy(false); setMessage(null) }
  if (lifetime.sessionId !== props.sessionId || lifetime.instanceId !== props.instance.instrumentInstanceId) return diagnostic('所选会话 历史状态未知；等待重新选择查询。')
  return h('section', { 'aria-label': '主动历史查询' }, h('h4', null, '会话历史（按需查询）'),
    diagnostic('主动查询历史不等于自动注入；摘要页不包含正文，详情按行展开。已清理工作树仍可查。'),
    diagnostic('永久删除此条历史副本不可恢复，不等于 Git 删除、工作树磁盘清理，也不声称删除源事件或原生会话历史；仅提供单条显式操作。'),
    diagnostic('源旧历史删除是独立操作：仅删除所选对象截至本版本的源旧载荷与关联副本，保留最新/当前；不删除原生会话、Git 或磁盘，不自动清理或设置默认保留期限。源修订未知不可用。'),
    h('label', null, '类别（留空全部） ', h('input', { 'aria-label': '历史类别', value: kind, onChange: (event: ChangeEvent<HTMLInputElement>) => changeFilter(setKind, event.target.value) })),
    h('label', null, '记录 ID（留空全部） ', h('input', { 'aria-label': '历史记录 ID', value: recordId, onChange: (event: ChangeEvent<HTMLInputElement>) => changeFilter(setRecordId, event.target.value) })),
    h('button', { type: 'button', disabled: busy, onClick: () => query() }, '查询历史'),
    message === null ? null : diagnostic(message),
    page === null ? diagnostic(busy ? '历史读取中…' : '历史尚未查询或状态未知；不是 0 条。') : h('div', null,
      diagnostic('匹配总数 ' + page.total + ' · 截点 ' + page.cut + ' · 本页摘要 ' + page.rows.length),
      diagnostic('覆盖是观测标签，不保证所有原生历史已记录。recorded-history 是已记录历史；snapshot-only 只是快照。purged 表示有已删除副本，notRecorded 表示未记录或缺失。'), pretty(page.coverage),
      page.rows.map(row => h('article', { key: row.historyId, 'aria-label': '历史行 ' + row.historyId },
        h('strong', null, row.kind + ' · ' + row.recordId + ' · ' + row.historyId + ' · 序号 ' + row.sequence), pretty(row),
        h('button', { type: 'button', disabled: busy, onClick: () => { if (details[row.historyId] !== undefined) setDetails(previous => { const next = { ...previous }; delete next[row.historyId]; return next }); else expand(row) } }, details[row.historyId] === undefined ? '展开详情' : '收起详情'),
        details[row.historyId] === undefined ? null : pretty(details[row.historyId]),
        row.kind === 'worktree' || row.kind === 'worktrees' ? diagnostic('工作树当前注入由已清理状态决定；废弃但未清理仍提示待处置。') : h('div', null,
          h('button', { type: 'button', disabled: busy || row.purged, onClick: () => mutate({ action: 'set-context', kind: row.kind, recordId: row.recordId, included: false }) }, '退出当前注入（保留历史）'),
          h('button', { type: 'button', disabled: busy || row.purged, onClick: () => mutate({ action: 'set-context', kind: row.kind, recordId: row.recordId, included: true }) }, '纳入当前注入')),
        h('button', { type: 'button', disabled: busy || row.purged, onClick: () => mutate({ action: 'purge', historyIds: [row.historyId], archivedOnly: false }) }, '永久删除此条历史副本'), sourceControls(row, page))),
      h('button', { type: 'button', disabled: busy || page.nextCursor === null, onClick: () => { if (page.nextCursor !== null) query(page.nextCursor) } }, '下一页')))
}

export function sessionListRequested(policy: PolicySnapshot | null): boolean {
  return policy !== null && (policy.defaults.display?.sessionList === true || Object.values(policy.workspaceOverrides).some(patch => patch.display?.sessionList === true))
}
export class PolicyObserver {
  private value: PolicySnapshot | null = null
  private generation = 0
  private closed = false
  private pending: Promise<void> | undefined
  private timer: ReturnType<typeof setTimeout> | undefined
  private hidden = documentHidden()
  private readonly listeners = new Set<() => void>()
  private readonly onVisibility = (): void => {
    const hidden = documentHidden(), restored = this.hidden && !hidden
    this.hidden = hidden
    if (restored) { this.clearTimer(); void this.refresh() }
    else if (hidden) this.arm()
  }
  constructor(private readonly read: () => Promise<RemoteResult<unknown>>) { if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisibility) }
  getSnapshot = (): PolicySnapshot | null => this.value
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  refresh(): Promise<void> {
    if (this.closed) return Promise.resolve()
    if (this.pending !== undefined) return this.pending
    const generation = ++this.generation
    this.pending = (async () => {
      try { const value = parsePolicySnapshot(remoteValue(await this.read())); if (this.closed || generation !== this.generation) return; this.value = value }
      catch { if (this.closed || generation !== this.generation) return; this.value = null }
      for (const listener of this.listeners) listener()
    })().finally(() => { this.pending = undefined; this.arm() })
    return this.pending
  }
  private clearTimer(): void { if (this.timer !== undefined) clearTimeout(this.timer); this.timer = undefined }
  private arm(): void { this.clearTimer(); if (!this.closed) this.timer = setTimeout(() => { void this.refresh() }, documentHidden() ? 60_000 : 30_000) }
  dispose(): void { this.closed = true; this.generation++; this.clearTimer(); if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility); this.listeners.clear() }
}
export function WorkspaceBadge(props: PropsRuntime<'sidebar.session.row.leading'> & { readonly observeSummary: (sessionId: string) => SummaryObserver; readonly visibility: PolicyObserver }): ReactElement | null {
  const policy = useSyncExternalStore(props.visibility.subscribe, props.visibility.getSnapshot, props.visibility.getSnapshot)
  if (!sessionListRequested(policy)) return null
  return h(BadgeContent, { observer: props.observeSummary(props.sessionId), policyRevision: policy!.revision })
}
function BadgeContent(props: { readonly observer: SummaryObserver; readonly policyRevision: number }): ReactElement | null {
  const observation = useSyncExternalStore(props.observer.subscribe, props.observer.getSnapshot, props.observer.getSnapshot)
  const active = props.observer.getDisplay()?.sessionList !== false || props.observer.getConfigurationRevision() !== props.policyRevision
  useEffect(() => active ? props.observer.retain() : undefined, [props.observer, active])
  if (observation.status !== 'ready') return props.observer.getDisplay()?.sessionList ? h('span', { title: observation.error ?? '协作提醒未知' }, '?') : null
  if (!observation.value.policy.display.sessionList) return null
  const count = observation.value.records?.summary.pendingUserDecisionCount
  return count === undefined ? h('span', { title: '协作提醒未知' }, '?') : count === 0 ? null : h('span', { title: '待用户裁决 ' + count, 'aria-label': '待用户裁决 ' + count, style: { display: 'inline-block', maxWidth: '16px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, String(count))
}

export function decodeWorkspaces(value: unknown): readonly WorkspaceChoice[] {
  if (!Array.isArray(value)) throw new Error('Host workspace list is unavailable')
  return value.map(value => { const row = object(value)
    if (row.sessionIds !== undefined && !Array.isArray(row.sessionIds)) throw new Error('Host Session navigation is unavailable')
    return { workspaceId: nonempty(row.id), label: nonempty(row.title), verified: row.status === 'ok',
      sessionIds: row.sessionIds === undefined ? null : [...new Set((row.sessionIds as unknown[]).map(nonempty))] }
  })
}
/** Navigation only. Listed ids grant neither ACL rights nor an owner-instance association. */
export function settingsSessionChoices(workspaces: readonly WorkspaceChoice[], workspaceId: string | null): { readonly ids: readonly string[]; readonly unknown: boolean } {
  const rows = workspaceId === null ? workspaces : workspaces.filter(row => row.workspaceId === workspaceId)
  const ids = [...new Set(rows.flatMap(row => row.sessionIds ?? []))].sort()
  return { ids, unknown: rows.length === 0 || rows.some(row => row.sessionIds === null) }
}
/** Explicit selected-session read projection on the settings page, independent of sidebar placement. */
export function SettingsInspection(props: { readonly sessionId: string; readonly observer: SessionObservation; readonly remote?: ControlsRemote }): ReactElement {
  if (props.observer.sessionId !== props.sessionId) return diagnostic('会话选择与观察归属不一致；状态未知。')
  return h(ObservedSettingsInspection, props)
}
export function ObservedSettingsInspection(props: { readonly sessionId: string; readonly observer: SessionObservation; readonly remote?: ControlsRemote }): ReactElement {
  const observation = useObservation(props.observer)
  if (props.observer.sessionId !== props.sessionId || (observation.status === 'ready' && observation.value.sessionId !== props.sessionId)) return diagnostic('会话选择与观察归属不一致；状态未知。')
  if (observation.status !== 'ready') return h('section', { 'aria-label': '设置页会话仪器', style: { maxHeight: '50vh', overflow: 'auto' } }, diagnostic(props.sessionId + ' · 仪器状态未知：' + (observation.error ?? '读取中')),
    h('button', { type: 'button', onClick: () => { void props.observer.refresh() } }, '重新读取所选会话'))
  const view = observation.value
  return h('section', { 'aria-label': '设置页会话仪器', style: { maxHeight: '50vh', overflow: 'auto' } },
    h('h4', null, '所选会话 ' + props.sessionId + ' · 当前投影与显式登记'),
    diagnostic('实例 ' + view.instance.instrumentInstanceId + ' · 主会话 ' + view.instance.ownerSessionId + ' · 真实调用者 ' + view.caller.kind + ':' + view.caller.principalId),
    h('button', { type: 'button', onClick: () => { void props.observer.refresh() } }, '刷新所选会话'),
    h('h4', null, '任务引用、旧票报告与裁决记录'),
    h(TaskReferences, { key: decisionReadingIdentity(view) + ':references', view }),
    h('section', { 'aria-label': '设置页裁决记录' }, h(DecisionQueues, { key: decisionReadingIdentity(view), view })),
    h(DecisionTechnicalDetails, { key: decisionReadingIdentity(view) + ':raw', label: '票与事项账本技术数据', value: inputRecords(view) }),
    h('h4', null, '独立 T/S（观测）'), h(WindowProjection, { view }),
    props.remote ? h(WorktreeBindingsPanel, { key: props.sessionId + ':bindings', view, remote: props.remote, refresh: props.observer.refresh }) : null,
    h('details', null, h('summary', null, '旧资源记录（仅只读）'), ResourceProjection({ view })),
    props.remote ? h(HistoryPanel, { key: props.sessionId + ':history', sessionId: props.sessionId, instance: view.instance, remote: props.remote, refresh: props.observer.refresh }) : null,
    h('h4', null, '能力、健康观测与有效策略'), diagnostic('能力与健康标签是宿主观测，不是操作许可或业务裁决。'), pretty({ capabilities: view.capabilities, health: view.health, policy: view.policy }))
}
// Settings-only composition: public primitives keep their native control/focus styling.
const settingsBorder = '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.22))'
const settingsSecondary = 'var(--dsw-alias-label-secondary, #61666b)'
const settingsAccent = 'color-mix(in srgb, var(--dsw-alias-state-business-primary, #4176e6) 85%, var(--dsw-alias-label-primary, CanvasText))'
const settingsWarning = 'color-mix(in srgb, var(--dsw-alias-state-warn-label, #dd8629) 65%, var(--dsw-alias-label-primary, CanvasText))'
const settingsCard = { border: 0, borderTop: settingsBorder, padding: '20px 0', minWidth: 0, overflowWrap: 'anywhere' as const }
const settingsGroup = { border: settingsBorder, borderRadius: '12px', padding: '16px 20px', margin: 0, minWidth: 0, background: 'var(--dsw-alias-bg-base, Canvas)' }
const settingsLegend = { padding: '0 8px', fontSize: '15px', fontWeight: 650 }
const settingsHint = { color: settingsSecondary, fontSize: '13px', lineHeight: 1.6, margin: '8px 0 12px' }
const settingsGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '20px', minWidth: 0, alignItems: 'start' }
const settingsActions = { display: 'flex', flexWrap: 'wrap' as const, gap: '8px', marginTop: '16px' }
const settingsField = { display: 'flex', flexWrap: 'wrap' as const, alignItems: 'center', gap: '6px 12px', padding: '12px 0', margin: 0, minWidth: 0, borderBottom: settingsBorder }
const settingsSelect = { font: 'inherit', color: 'var(--dsw-alias-label-primary, CanvasText)', background: 'var(--dsw-alias-bg-base, Canvas)', border: settingsBorder, borderRadius: '8px', minHeight: '36px', padding: '6px 28px 6px 10px', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box' as const }
function settingsHeading(title: string, detail: string): ReactElement {
  return h('header', { style: { marginBottom: '20px', borderLeft: '3px solid ' + settingsAccent, paddingLeft: '12px' } },
    h('h3', { style: { margin: 0, fontSize: '18px', fontWeight: 650 } }, title), h('p', { style: { ...settingsHint, margin: '4px 0 0' } }, detail))
}
function settingsState(text: string, tone: 'accent' | 'warning' | 'muted' = 'muted'): ReactElement {
  return h('span', { style: { fontWeight: 600, color: tone === 'warning' ? settingsWarning : tone === 'accent' ? settingsAccent : settingsSecondary } }, text)
}
const FEATURE_LABELS = { binding: '工作树绑定', lifecycle: '子代理生命周期观测', windows: '任务与子代理参考窗口', ticketProgress: '任务票进度', pendingDecisions: '待裁决事项' } satisfies Record<typeof FEATURE_NAMES[number], string>
const DISPLAY_LABELS = { header: '会话标题栏', inputSummary: '输入区摘要', rightPanel: '右侧协作面板', sessionList: '会话列表提醒', timeline: '工具记录标注' } satisfies Record<typeof DISPLAY_NAMES[number], string>
const CAPACITY_LABELS = { ticketWindowSize: '任务票参考上限（T）', runningSubagentLimit: '运行中子代理参考上限（S）' }
const SOURCE_LABELS = { workspace: '工作区覆盖', global: '全局默认', 'safe-initial': '安全初始值' } satisfies Record<EffectivePolicy['sources'][PolicyField], string>
const POLICY_FIELD_LABELS: Readonly<Record<PolicyField | 'extensionEnabled', string>> = {
  extensionEnabled: '协作管理总闸（全局）', 'workspace.enabled': '本工作区总闸', 'skills.enabled': '本工作区技能分发', 'binding.enabled': FEATURE_LABELS.binding, 'lifecycle.enabled': FEATURE_LABELS.lifecycle,
  'windows.enabled': FEATURE_LABELS.windows, 'ticketProgress.enabled': FEATURE_LABELS.ticketProgress, 'pendingDecisions.enabled': FEATURE_LABELS.pendingDecisions, 'pendingDecisions.interactionMode': '裁决交互偏好',
  'windows.ticketWindowSize': CAPACITY_LABELS.ticketWindowSize, 'windows.runningSubagentLimit': CAPACITY_LABELS.runningSubagentLimit,
  'display.header': DISPLAY_LABELS.header, 'display.inputSummary': DISPLAY_LABELS.inputSummary, 'display.rightPanel': DISPLAY_LABELS.rightPanel,
  'display.sessionList': DISPLAY_LABELS.sessionList, 'display.timeline': DISPLAY_LABELS.timeline,
}
function policyFeatureText(value: EffectivePolicy['features'][typeof FEATURE_NAMES[number]]): string {
  const state = ({ configured: '已配置（仅意图）', disabled: '未启用', unsupported: '条件不满足' } satisfies Record<typeof value.status, string>)[value.status]
  const reasons = { 'extension-disabled': '全局总闸已关闭', 'workspace-disabled': '本工作区总闸已关闭', 'feature-disabled': '此功能已关闭', 'workspace-unverified': '工作区未核验', 'window-capacity-unset': '参考上限未配置' } satisfies Record<Exclude<typeof value.reason, null>, string>
  return state + (value.reason === null ? '' : ' · ' + reasons[value.reason])
}
function policyImpactText(value: unknown): string {
  if (typeof value === 'boolean') return value ? '启用' : '禁用'
  if (value === null) return '未配置'
  if (typeof value === 'number') return String(value)
  if (value === 'native-question') return '原生提问优先'
  if (value === 'async-decision') return '异步裁决优先'
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const row = value as { readonly value: boolean | number | null | EffectivePolicy['features'][typeof FEATURE_NAMES[number]]; readonly source: EffectivePolicy['sources'][PolicyField] }
    const label = row.value !== null && typeof row.value === 'object' ? policyFeatureText(row.value) : policyImpactText(row.value)
    return label + '（' + (SOURCE_LABELS[row.source] ?? '未知来源') + '）'
  }
  return '未知（详见原始诊断）'
}
function unsupportedSeatsDetails(): ReactElement {
  return h('details', null, h('summary', null, '显示限制（宿主暂未提供对应接口）'),
    h('ul', null, h('li', null, '独立的第二行会话标题：宿主没有可追加的全宽标题栏位置。'),
      h('li', null, '会话列表常驻徽标：当前装饰只在空闲时显示，详情只在鼠标悬停时显示。'),
      h('li', null, '后台打开协作面板：宿主打开标签页时会选中并展开，暂不支持不切换焦点的后台打开。')),
    h('details', null, h('summary', null, '原始接口诊断'), pretty(UNSUPPORTED_SEATS)))
}
const SUPERVISION_ROUTE_LABELS = { inherit: '继承主路由', explicit: '显式 provider / model' } satisfies Record<SupervisionSettings['reviewer']['routeMode'], string>
const SUPERVISION_START_LABELS = { 'ticket-held': '开始处理票后', 'first-support-surge': '首次支撑写入激增' } satisfies Record<SupervisionSettings['suspicionStartMode'], string>
const SUPERVISION_DELIVERY_LABELS = { card: '仅卡片', 'card+agent-check': '卡片 + agent 检查句' } satisfies Record<SupervisionSettings['delivery']['concern'], string>
const SUPERVISION_SUSPICION_LABELS = { auto: '自动', off: '关闭程序嫌疑（定期审计仍运行）' } satisfies Record<SupervisionSettings['suspicionMode'], string>
function supervisionNumber(value: unknown): number | undefined { return typeof value === 'number' ? value : undefined }

export function SupervisionSettingsPanel(props: { readonly remote: ControlsRemote; readonly workspace: string | null }): ReactElement {
  const [saved, setSaved] = useState<SupervisionConfigSnapshot | null>(null)
  const [draft, setDraft] = useState<SupervisionConfigIntent | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    setMessage(null)
    void Promise.resolve().then(() => props.remote.readSupervisionConfig()).then(result => {
      const snapshot = parseSupervisionConfigSnapshot(remoteValue(result))
      if (!active) return
      setSaved(snapshot); setDraft(supervisionIntentOf(snapshot))
    }).catch(error => { if (active) setMessage('交付监督配置不可用：' + errorText(error)) })
    return () => { active = false }
  }, [props.remote, reload])
  if (saved === null || draft === null) return h('section', { 'aria-label': '交付监督配置', style: settingsCard },
    settingsHeading('交付监督', '进阶设置 · 独立于协作策略保存'), diagnostic('读取交付监督配置…'), message === null ? null : diagnostic(message),
    h(Button, { type: 'button', onClick: () => setReload(value => value + 1) }, '重新读取监督配置'))
  const scope = props.workspace === null ? '全局默认' : '本工作区覆盖'
  const inheritLabel = props.workspace === null ? '未设置（安全初始值）' : '继承全局'
  const effective = resolveSupervisionSettings(draft, props.workspace ?? 'global-preview')
  const own = (field: SupervisionField): unknown => ownSupervisionLeaf(draft, props.workspace, field)
  const update = (field: SupervisionField, value: unknown): void => {
    try { setDraft(setSupervisionLeaf(draft, props.workspace, field, value)); setMessage(null) }
    catch (error) { setMessage('配置值无效：' + errorText(error)) }
  }
  const dirty = JSON.stringify(draft) !== JSON.stringify(supervisionIntentOf(saved))
  const save = async (): Promise<void> => {
    setBusy(true); setMessage(null)
    try {
      const snapshot = parseSupervisionConfigSnapshot(remoteValue(await props.remote.saveSupervisionConfig(draft, saved.revision)))
      setSaved(snapshot); setDraft(supervisionIntentOf(snapshot))
      setMessage('已保存监督配置（修订 ' + snapshot.revision + '）。运行时将按两级总闸、监督开关、活动与预算条件读取此配置；保存不代表必定启动模型调用。')
    } catch (error) { setMessage('保存结果未确认：' + errorText(error) + '。请重新读取并核对，草稿未作为成功回执。') }
    finally { setBusy(false) }
  }
  const boolField = (field: SupervisionField, label: string, value: boolean): ReactElement => {
    const raw = own(field)
    return h('label', { key: field, style: { ...settingsField, justifyContent: 'space-between' } },
      h('span', { style: { flex: '1 1 180px' } }, label),
      h('select', { style: settingsSelect, 'aria-label': label, value: raw === undefined ? 'inherit' : raw === true ? 'on' : 'off', disabled: busy,
        onChange: (event: ChangeEvent<HTMLSelectElement>) => update(field, event.target.value === 'inherit' ? undefined : event.target.value === 'on') },
        h('option', { value: 'inherit' }, inheritLabel), h('option', { value: 'on' }, '启用'), h('option', { value: 'off' }, '禁用')),
      h('small', { style: { flexBasis: '100%' } }, '有效值：' + (value ? '启用' : '禁用')))
  }
  const numberField = (field: SupervisionField, label: string, value: number, minimum: number, maximum: number, step = 1): ReactElement => {
    const raw = supervisionNumber(own(field))
    return h('label', { key: field, style: settingsField }, h('span', null, label),
      h(Input, { 'aria-label': label, type: 'number', min: minimum, max: maximum, step, value: raw === undefined ? '' : String(raw), disabled: busy,
        placeholder: inheritLabel + '：' + value, style: { width: '130px', maxWidth: '100%' },
        onChange: (event: ChangeEvent<HTMLInputElement>) => {
          const text = event.target.value
          if (text === '') { update(field, undefined); return }
          const number = Number(text)
          if (Number.isFinite(number) && number >= minimum && number <= maximum) update(field, number)
        } }),
      h('small', { style: { flexBasis: '100%' } }, '有效值：' + value))
  }
  const textField = (field: SupervisionField, label: string, value: string, placeholder = ''): ReactElement => {
    const raw = own(field)
    return h('label', { key: field, style: settingsField }, h('span', null, label),
      h(Input, { 'aria-label': label, type: 'text', value: typeof raw === 'string' ? raw : '', disabled: busy, placeholder: inheritLabel + '：' + (value || placeholder || '空'), style: { width: '100%', maxWidth: '360px' },
        onChange: (event: ChangeEvent<HTMLInputElement>) => update(field, event.target.value === '' ? undefined : event.target.value) }),
      h('small', { style: { flexBasis: '100%' } }, '有效值：' + (value || '空')))
  }
  const selectField = (field: SupervisionField, label: string, value: string, options: readonly [string, string][]): ReactElement => {
    const raw = own(field)
    return h('label', { key: field, style: settingsField }, h('span', null, label),
      h('select', { style: settingsSelect, 'aria-label': label, value: typeof raw === 'string' ? raw : '__unset__', disabled: busy,
        onChange: (event: ChangeEvent<HTMLSelectElement>) => update(field, event.target.value === '__unset__' ? undefined : event.target.value) },
        h('option', { value: '__unset__' }, inheritLabel), ...options.map(([option, text]) => h('option', { key: option, value: option }, text))),
      h('small', { style: { flexBasis: '100%' } }, '有效值：' + (options.find(([option]) => option === value)?.[1] ?? value)))
  }
  const listField = (field: SupervisionField, label: string, values: readonly string[], hint: string): ReactElement => {
    const raw = own(field)
    const text = Array.isArray(raw) ? (raw as readonly string[]).join('\n') : ''
    return h('label', { key: field, style: settingsField }, h('span', null, label),
      h('textarea', { 'aria-label': label, value: text, disabled: busy, rows: 3, placeholder: inheritLabel + '：' + (values.length === 0 ? '空' : values.join(', ')), style: { width: '100%', minHeight: '64px', boxSizing: 'border-box' as const },
        onChange: (event: ChangeEvent<HTMLTextAreaElement>) => {
          const rows = event.target.value.split(/[\n,]/u).map(row => row.trim()).filter(row => row.length > 0)
          update(field, rows.length === 0 ? undefined : rows)
        } }),
      h('small', { style: { flexBasis: '100%' } }, hint + ' 有效值：' + (values.length === 0 ? '空' : values.join(', '))))
  }
  const route = effective.reviewer.routeMode
  const softBudget = own('softBudgetHours')
  return h('section', { 'aria-label': '交付监督配置', style: settingsCard },
    settingsHeading('交付监督', '进阶设置 · 独立于协作策略保存'),
    h('p', null, '当前编辑范围：' + scope + '。监督配置由宿主运行时读取；定期/嫌疑审计与 LLM reviewer 受两级总闸、监督开关、活动和预算等条件约束，保存不代表必定启动模型调用。'),
    h('div', { style: settingsGrid },
      h('fieldset', { disabled: busy, style: settingsGroup }, h('legend', { style: settingsLegend }, '开关与模型路由'), h('p', null, '父代理与子代理共用这条轻量 reviewer 路由；周期性审计和嫌疑审计共用。继承主路由时，owner 不活跃即审计不可用（失败关闭），不回退到旧路由。'), boolField('enabled', '请求启用交付监督', effective.enabled),
        selectField('reviewer.routeMode', '模型路由', route, [['inherit', SUPERVISION_ROUTE_LABELS.inherit], ['explicit', SUPERVISION_ROUTE_LABELS.explicit]]),
        textField('reviewer.provider', '显式 provider', effective.reviewer.provider), textField('reviewer.model', '显式 model', effective.reviewer.model),
        textField('reviewer.reasoningEffort', 'reasoning effort（可选）', effective.reviewer.reasoningEffort),
        numberField('reviewer.maxTokens', '单次输出上限', effective.reviewer.maxTokens, 256, 8192, 1),
        numberField('reviewer.timeoutMs', '超时（毫秒）', effective.reviewer.timeoutMs, 5000, 120000, 1000),
        numberField('reviewer.toolRounds', '只读工具轮数', effective.reviewer.toolRounds, 0, 2, 1),
        route === 'explicit' ? diagnostic('显式路由会把审计所需的路径/摘要发送给指定的 provider，可能不同于主模型；请确认这是你要的隐私边界。') : null,
        route === 'explicit' && (effective.reviewer.provider.length === 0 || effective.reviewer.model.length === 0) ? diagnostic('显式路由还缺 provider/model；保存会被拒绝，不会静默回退。') : null),
      h('fieldset', { disabled: busy, style: settingsGroup }, h('legend', { style: settingsLegend }, '定期审计'), h('p', null, '定期审计是底线；程序嫌疑只提前/加深。无新活动时跳过模型调用。'),
        numberField('scheduledIntervalMinutes', '间隔（分钟）', effective.scheduledIntervalMinutes, 15, 240, 5),
        numberField('scheduledMaxPerHour', '每小时最多调用', effective.scheduledMaxPerHour, 1, 4, 1),
        numberField('scheduledMaxPerDay', '每日最多调用', effective.scheduledMaxPerDay, 1, 24, 1),
        numberField('scheduledDailyTokenBudget', '每日 token 预算', effective.scheduledDailyTokenBudget, 1000, 1000000, 1000),
        numberField('rollingSummaryHours', '滚动摘要回看（小时）', effective.rollingSummaryHours, 1, 72, 1),
        numberField('scheduledSummaryTopLanes', 'owner 摘要活跃 lane 上限', effective.scheduledSummaryTopLanes, 1, 20, 1)),
      h('fieldset', { disabled: busy, style: settingsGroup }, h('legend', { style: settingsLegend }, '嫌疑与停滞巡检'), h('p', null, '程序信号只决定是否更深地看；研究/评审票可使用票级 off，定期审计仍按条件运行。'),
        selectField('suspicionStartMode', '开始方式', effective.suspicionStartMode, [['ticket-held', SUPERVISION_START_LABELS['ticket-held']], ['first-support-surge', SUPERVISION_START_LABELS['first-support-surge']]]),
        selectField('suspicionMode', '程序嫌疑模式', effective.suspicionMode, [['auto', SUPERVISION_SUSPICION_LABELS.auto], ['off', SUPERVISION_SUSPICION_LABELS.off]]),
        numberField('checkIntervalMinutes', '检查间隔（分钟）', effective.checkIntervalMinutes, 5, 60, 1),
        numberField('noProgressChecks', '连续无进展检查数（K）', effective.noProgressChecks, 2, 12, 1),
        numberField('fastWindowMinutes', '快周期窗口（分钟）', effective.fastWindowMinutes, 15, 180, 5),
        numberField('supportWriteThreshold', '支撑写入阈值', effective.supportWriteThreshold, 1, 100, 1),
        numberField('supportReadBackThreshold', '支撑回读比例', effective.supportReadBackThreshold, 0, 1, 0.05),
        numberField('cooldownMinutes', '冷却（分钟）', effective.cooldownMinutes, 15, 360, 5),
        numberField('maxAuditsPer6h', '每 6 小时最多审计', effective.maxAuditsPer6h, 1, 12, 1),
        numberField('backoffFactor', '退避倍数', effective.backoffFactor, 1, 4, 1),
        boolField('lazyCheck', '懒检查（不后台唤醒）', effective.lazyCheck), boolField('dryRun', 'dry-run（只记录不投递）', effective.dryRun),
        numberField('episodeRetentionDays', '审计 episode 保留天数', effective.episodeRetentionDays, 1, 365, 1),
        numberField('episodeMaxEntries', '每 owner episode 上限', effective.episodeMaxEntries, 100, 10000, 100)),
      h('fieldset', { disabled: busy, style: settingsGroup }, h('legend', { style: settingsLegend }, '投递与预算'), h('p', null, 'info 只写日志；concern 默认只出卡片；alert 还需 noProductGap 与 supportFiles 门槛才自动注入 agent。'),
        selectField('delivery.concern', 'concern 档', effective.delivery.concern, [['card', SUPERVISION_DELIVERY_LABELS.card], ['card+agent-check', SUPERVISION_DELIVERY_LABELS['card+agent-check']]]),
        selectField('delivery.alert', 'alert 档', effective.delivery.alert, [['card', SUPERVISION_DELIVERY_LABELS.card], ['card+agent-check', SUPERVISION_DELIVERY_LABELS['card+agent-check']]]),
        numberField('delivery.alertMinNoProductHours', 'alert：无产品写入小时', effective.delivery.alertMinNoProductHours, 1, 24, 1),
        numberField('delivery.alertMinSupportFiles', 'alert：支撑文件数', effective.delivery.alertMinSupportFiles, 1, 100, 1),
        h('label', { style: settingsField }, h('span', null, '软预算（小时）'),
          h(Input, { 'aria-label': '软预算（小时）', type: 'number', min: 1, max: 720, value: typeof softBudget === 'number' ? String(softBudget) : '', disabled: busy, placeholder: inheritLabel + '：' + (effective.softBudgetHours === null ? '关闭' : effective.softBudgetHours), style: { width: '120px' },
            onChange: (event: ChangeEvent<HTMLInputElement>) => {
              const text = event.target.value
              if (text === '') { update('softBudgetHours', undefined); return }
              const number = Number(text)
              if (Number.isFinite(number) && number >= 1 && number <= 720) update('softBudgetHours', number)
            } }),
          h('label', { style: { display: 'flex', alignItems: 'center', gap: '6px' } }, h(Input, { type: 'checkbox', checked: softBudget === null, disabled: busy, onChange: (event: ChangeEvent<HTMLInputElement>) => update('softBudgetHours', event.target.checked ? null : undefined) }), '关闭'),
          h('small', { style: { flexBasis: '100%' } }, '有效值：' + (effective.softBudgetHours === null ? '关闭（仅人工提醒）' : effective.softBudgetHours + ' 小时')))),
      h('fieldset', { disabled: busy, style: settingsGroup }, h('legend', { style: settingsLegend }, '交付路径'), h('p', null, '产品/支撑根用于区分交付写入与支撑写入；空表示未配置。这里只保存，不改变任何文件或票。'),
        listField('deliverableRoots', '产品根（每行/逗号一项）', effective.deliverableRoots, '留空继承。'),
        listField('supportRoots', '支撑根（每行/逗号一项）', effective.supportRoots, '留空继承。'),
        listField('excludeGlobs', '排除 glob（每行/逗号一项）', effective.excludeGlobs, '留空继承。'))),
    h('div', { style: settingsActions }, h(Button, { type: 'button', variant: 'primary', disabled: busy || !dirty, onClick: () => { void save() } }, busy ? '正在保存…' : '保存监督配置'),
      h(Button, { type: 'button', disabled: busy || !dirty, onClick: () => { setDraft(supervisionIntentOf(saved)); setMessage(null) } }, '放弃未保存更改'),
      h(Button, { type: 'button', disabled: busy, onClick: () => setReload(value => value + 1) }, '重新读取监督配置')),
    h('p', null, '配置修订 ' + saved.revision + ' · ' + (dirty ? '有未保存更改' : '与已保存配置一致') + '。保存只写独立 supervision 配置，不写入协作 PolicySnapshot。'),
    message === null ? null : diagnostic(message),
    h('details', { style: { marginTop: '12px' } }, h('summary', null, '技术详情（有效监督配置）'), pretty(effective)))
}

export function SupervisionHistory(props: { readonly remote: ControlsRemote; readonly sessionId: string | null }): ReactElement {
  const [document, setDocument] = useState<{ readonly episodes: readonly SupervisionEpisode[] } | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    setMessage(null); setDocument(null)
    if (props.sessionId === null) return () => { active = false }
    void Promise.resolve().then(() => props.remote.readSupervision(props.sessionId!)).then(result => {
      const value = remoteValue(result)
      if (!active) return
      setDocument(value === null ? { episodes: [] } : parseSupervisionDocument(value))
    }).catch(error => { if (active) setMessage('监督记录不可用：' + errorText(error)) })
    return () => { active = false }
  }, [props.remote, props.sessionId, reload])
  return h('section', { 'aria-label': '交付监督记录', style: settingsCard },
    h('h3', { style: { marginTop: 0 } }, '交付监督记录'),
    h('p', null, '只读当前会话 owner 的持久化审计 episode；没有推送卡片，也不修改任何票、T/S 或工作树。'),
    props.sessionId === null ? diagnostic('先选择一个会话查看监督记录。') : message !== null ? diagnostic(message) : document === null ? diagnostic('读取监督记录…') : document.episodes.length === 0 ? diagnostic('当前没有已记录的审计 episode（可能未启用、仍是 dry-run 或尚未到点）。') :
      h('ul', { style: { display: 'grid', gap: '8px', paddingLeft: '18px' } }, document.episodes.slice().reverse().map(episode => h('li', { key: episode.episodeId },
        h('strong', null, episode.trigger + ' · ' + episode.severity + ' · ' + episode.verdict + ' · ' + episode.delivery + ' · ' + new Date(episode.at).toISOString() + (episode.ticketId === null ? '' : ' · ' + episode.ticketId) + (episode.research ? ' · 研究/评审标记' : '')),
        h('div', null, '观察：' + episode.observed),
        h('div', null, '可能的问题：' + episode.possibleIssue)))),
    props.sessionId === null ? null : h(Button, { type: 'button', onClick: () => setReload(value => value + 1) }, '重新读取监督记录'))
}
export function SettingsPage(props: PluginConfigViewProps & { readonly remote: ControlsRemote; readonly refreshAll: () => void; readonly observe: (sessionId: string) => SessionObservation }): ReactElement {
  const [saved, setSaved] = useState<PolicySnapshot | null>(null)
  const [draft, setDraft] = useState<PolicyIntent | null>(null)
  const [workspaces, setWorkspaces] = useState<readonly WorkspaceChoice[]>([])
  const [workspace, setWorkspace] = useState<string | null>(null)
  const [inspection, setInspection] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    void Promise.all([props.remote.readPolicy(), props.remote.listWorkspaces()]).then(([policy, list]) => {
      const snapshot = parsePolicySnapshot(remoteValue(policy)); const rows = decodeWorkspaces(remoteValue(list))
      if (!active) return
      setSaved(snapshot); setDraft(intentOf(snapshot)); setWorkspaces(rows); setWorkspace(rows[0]?.workspaceId ?? null); setInspection(null); setMessage(null)
    }).catch(error => { if (active) setMessage('协作配置不可用：' + errorText(error)) })
    return () => { active = false }
  }, [props.remote, reload])
  if (props.view === 'summary') return h('span', null, '协作管理、交付监督与会话仪器；配置分别保存。')
  const pageStyle = { display: 'grid', gap: '28px', minWidth: 0, width: '100%', maxWidth: '1040px', margin: '0 auto', color: 'var(--dsw-alias-label-primary, CanvasText)', fontSize: '14px', lineHeight: 1.6, overflowWrap: 'anywhere' as const }
  if (saved === null || draft === null) return h('section', { 'aria-label': '插件配置', style: pageStyle },
    h('details', { key: 'supervision-settings', 'aria-label': '进阶交付监督', style: settingsCard }, h('summary', { tabIndex: 0, style: { cursor: 'pointer', fontSize: '16px', fontWeight: 600 } }, '进阶交付监督（独立保存）'),
      h(SupervisionSettingsPanel, { remote: props.remote, workspace: null })),
    h('section', { 'aria-label': '工作区协作管理', style: settingsCard }, h('h3', null, '协作管理'), diagnostic(message ?? '读取已保存的协作配置…'), h(Button, { type: 'button', onClick: () => setReload(value => value + 1) }, '重新读取协作配置')))
  const selected = workspaces.find(row => row.workspaceId === workspace)
  const sessionChoices = settingsSessionChoices(workspaces, workspace)
  const selectedInspection = inspection !== null && sessionChoices.ids.includes(inspection) ? inspection : null
  const preview = resolvePolicy({ ...draft, workspaceOverrides: workspace === null ? {} : draft.workspaceOverrides, revision: saved.revision }, workspace ?? 'global-preview', workspace === null || selected?.verified === true)
  const impact = policyDraftImpact(saved, draft, workspace, workspace === null || selected?.verified === true)
  const change = (field: PolicyField, value: PolicyLeafValue): void => {
    try { setDraft(setPolicyLeaf(draft, workspace, field, value)); setMessage(null) } catch (error) { setMessage('配置值无效：' + errorText(error)) }
  }
  const save = async (): Promise<void> => {
    setBusy(true); setMessage(null)
    try {
      const snapshot = await savePolicyDraft(props.remote, draft, saved.revision)
      setSaved(snapshot); setDraft(intentOf(snapshot)); props.refreshAll()
      setMessage('已保存并应用配置（修订 ' + snapshot.revision + '）；协作管理' + (snapshot.extensionEnabled ? '已启用' : '已关闭') + '，无需额外启用按钮。功能可用性仍以宿主能力与会话观测为准。' + (snapshot.extensionEnabled ? '' : '协作管理总闸（全局）仍为关闭，各工作区的「协作功能」「参考上限」都不会生效。'))
    } catch (error) { setMessage('保存结果未确认：' + errorText(error) + '。请重新读取协作配置核对，草稿未作为成功回执。') } finally { setBusy(false) }
  }
  const globalScope = workspace === null
  const inheritLabel = globalScope ? '未设置（用安全初始值）' : '继承全局'
  const scopeWord = globalScope ? '所有工作区默认' : '本工作区'
  const gateReason = (value: { readonly reason: string | null }): boolean => value.reason === 'extension-disabled' || value.reason === 'workspace-disabled'
  const booleanField = (field: PolicyField, label: string, effective: string, alert = false): ReactElement => {
    const explicit = ownLeaf(draft, workspace, field)
    return h('label', { key: field, style: { ...settingsField, justifyContent: 'space-between' } }, h('span', { style: { flex: '1 1 170px', fontWeight: 550 } }, label),
      h('select', { style: settingsSelect, 'aria-label': label, value: explicit === undefined ? 'inherit' : explicit ? 'on' : 'off', disabled: busy,
        onChange: (event: ChangeEvent<HTMLSelectElement>) => change(field, event.target.value === 'inherit' ? undefined : event.target.value === 'on') },
        h('option', { value: 'inherit' }, inheritLabel), h('option', { value: 'on' }, '启用'), h('option', { value: 'off' }, '禁用')),
      h('small', { style: { flexBasis: '100%', color: settingsSecondary, fontSize: '12px' } },
        settingsState((alert ? '总闸未开 · ' : '') + '草稿有效值：' + effective, alert ? 'warning' : 'muted'),
        h('span', { style: { display: 'block', marginTop: '2px' } }, '来源：' + SOURCE_LABELS[preview.sources[field]])))
  }
  const gateField = (field: PolicyField, label: string, open: boolean, effectiveText: string): ReactElement => {
    const explicit = ownLeaf(draft, workspace, field)
    return h('div', { key: field, style: settingsField },
      h('span', { style: { fontWeight: 600, flex: '1 1 180px' } }, label),
      h('select', { style: settingsSelect, 'aria-label': label, value: explicit === undefined ? 'inherit' : explicit ? 'on' : 'off', disabled: busy,
        onChange: (event: ChangeEvent<HTMLSelectElement>) => change(field, event.target.value === 'inherit' ? undefined : event.target.value === 'on') },
        h('option', { value: 'inherit' }, inheritLabel), h('option', { value: 'on' }, '启用'), h('option', { value: 'off' }, '禁用')),
      settingsState(effectiveText, open ? 'accent' : 'muted'),
      h('small', { style: { flexBasis: '100%', color: settingsSecondary } }, '来源：' + SOURCE_LABELS[preview.sources[field]]))
  }
  const gatePanel = h('section', { 'aria-label': '范围与总闸', style: { ...settingsGroup, background: 'var(--dsw-alias-bg-module-platform, Canvas)', marginBottom: '20px' } },
    h('h4', { style: { margin: '0 0 12px', fontSize: '15px', fontWeight: 650 } }, '编辑范围与总闸'),
    h('p', { style: settingsHint }, '总闸为全局设置；其余字段按所选范围编辑。切换范围保留草稿，保存会提交全部策略更改。'),
    h('label', { style: { ...settingsField, paddingTop: 0 } }, h('span', { style: { fontWeight: 600, flex: '1 1 170px' } }, '配置编辑范围'),
      h('select', { 'aria-label': '配置编辑范围', value: workspace ?? '', disabled: busy, style: { ...settingsSelect, flex: '1 1 240px' }, onChange: (event: ChangeEvent<HTMLSelectElement>) => { setWorkspace(event.target.value || null); setInspection(null) } },
        ...workspaces.map(row => h('option', { key: row.workspaceId, value: row.workspaceId }, row.label + (row.verified ? '' : '（未核验）'))), h('option', { value: '' }, '全局默认'))),
    h('div', { style: { ...settingsField, gap: '12px', borderBottom: 0 } },
      h(Checkbox, { label: '协作管理总闸（全局）', checked: draft.extensionEnabled, disabled: busy, onChange: (checked: boolean) => { setDraft({ ...draft, extensionEnabled: checked }); setMessage(null) } }),
      settingsState(draft.extensionEnabled ? '草稿：已开启' : '草稿：已关闭', draft.extensionEnabled ? 'accent' : 'warning'),
      settingsState(preview.workspaceEnabled ? scopeWord + '总闸：已开' : scopeWord + '总闸：未开', preview.workspaceEnabled ? 'accent' : 'warning')),
    h('p', { style: settingsHint }, '两级总闸都打开后，当前范围的「协作功能」才生效；只开一级时下面会标出原因。总闸不影响技能分发。'),
    gateField('workspace.enabled', scopeWord + '总闸', preview.workspaceEnabled, preview.workspaceEnabled ? '已启用' : '未启用'),
    gateField('skills.enabled', scopeWord + '技能分发', preview.skillsEnabled, preview.skillsEnabled ? '启用' : '禁用'),
    h('p', { style: { ...settingsHint, marginBottom: 0 } }, globalScope
      ? '当前编辑的是「全局默认」：选「未设置（用安全初始值）」表示没有默认值，该叶子回落到安全初始值（本工作区总闸＝关闭，技能分发＝开启）。'
      : '选「继承全局」表示删除本工作区的覆盖，回落到上面的全局默认；参考上限留空同理。'))
  const gateRow = h('div', { style: { color: settingsWarning, borderLeft: !draft.extensionEnabled ? '3px solid ' + settingsWarning : undefined, paddingLeft: '12px', marginBottom: '20px' } },
    !draft.extensionEnabled ? diagnostic('全局总闸当前为关闭：下面各范围的「协作功能」「参考上限」都不会生效，只有「界面显示位置」与技能分发不受影响。') : null)
  const featureField = (name: typeof FEATURE_NAMES[number]): ReactElement => booleanField((name + '.enabled') as PolicyField, FEATURE_LABELS[name], policyFeatureText(preview.features[name]), gateReason(preview.features[name]))
  const interactionField = 'pendingDecisions.interactionMode' as PolicyField
  const interactionMode = preview.pendingDecisions.interactionMode
  // No public Select export on the supported baseline: use native semantic HTML.
  const interaction = h('label', { style: settingsField }, h('span', { style: { fontWeight: 600, flex: '1 1 170px' } }, '裁决交互偏好'),
    h('select', { style: settingsSelect, 'aria-label': '裁决交互偏好', value: ownLeaf(draft, workspace, interactionField) ?? '__unset__', disabled: busy,
      onChange: (event: ChangeEvent<HTMLSelectElement>) => change(interactionField, event.target.value === '__unset__' ? undefined : event.target.value as 'native-question' | 'async-decision') },
      h('option', { value: '__unset__' }, inheritLabel), h('option', { value: 'native-question' }, '原生提问优先'), h('option', { value: 'async-decision' }, '异步裁决优先')),
    h('small', { style: { flexBasis: '100%', color: settingsSecondary, fontSize: '12px' } }, '草稿有效值：' + policyImpactText(interactionMode) + ' · 来源：' + (SOURCE_LABELS[preview.sources[interactionField]] ?? '安全初始值') + ' · ' + policyFeatureText(preview.features.pendingDecisions)))
  const dirty = JSON.stringify(draft) !== JSON.stringify(intentOf(saved))
  const saveLabel = busy ? '正在保存…' : saved.extensionEnabled !== draft.extensionEnabled ? draft.extensionEnabled ? '保存并启用协作管理' : '保存并关闭协作管理' : '保存并应用配置'
  return h('section', { 'aria-label': '插件配置', style: pageStyle },
    h('header', null, h('p', { style: { ...settingsHint, margin: '0 0 4px', color: settingsAccent, fontWeight: 600 } }, 'Matt Pocock Skills · 插件设置'),
      h('h2', { style: { margin: 0, fontSize: '26px', lineHeight: 1.4, fontWeight: 650 } }, '协作与提醒'),
      h('p', { style: { ...settingsHint, marginBottom: 0 } }, '服务器策略控制协作行为；个人提醒只保存在本浏览器。两者分别保存。')),
    h('section', { 'aria-label': '工作区协作管理', style: { minWidth: 0 } },
      settingsHeading('协作管理', '服务器策略 · 配置修订 ' + saved.revision + ' · ' + (dirty ? '有未保存更改' : '与已保存配置一致')),
      gatePanel,
      gateRow,
      h('div', { style: settingsGrid },
        h('fieldset', { disabled: busy, style: settingsGroup }, h('legend', { style: settingsLegend }, '协作功能'), h('p', { style: settingsHint }, '选择需要的协作能力；每个功能仍受两级总闸约束。'), FEATURE_NAMES.map(name => featureField(name)), interaction,
          h('details', null, h('summary', null, '交互偏好说明'), h('p', null, '原生提问优先沿用可用的原生问答；异步裁决优先使用裁决仪器，由你通过下方原生会话消息答复，agent 可继续不依赖该裁决的工作。偏好不越过明确的等待确认或宿主权限，关闭功能时不激活该引导。'))),
        h('div', { style: { display: 'grid', gap: '20px', minWidth: 0 } },
        h('fieldset', { disabled: busy, style: settingsGroup }, h('legend', { style: settingsLegend }, '参考上限'), h('p', { style: settingsHint }, 'T/S 仅提供规模参考，不是硬名额；留空继承，不猜测默认数值。'),
          (['ticketWindowSize', 'runningSubagentLimit'] as const).map(name => { const field = ('windows.' + name) as PolicyField; return h('label', { key: name, style: settingsField },
            h('span', { style: { flex: '1 1 200px', fontWeight: 550, color: settingsAccent } }, CAPACITY_LABELS[name]), h(Input, { 'aria-label': CAPACITY_LABELS[name], type: 'number', min: 1, step: 1, style: { width: '100px', maxWidth: '100%' }, value: String(ownLeaf(draft, workspace, field) ?? ''),
              onChange: (event: ChangeEvent<HTMLInputElement>) => change(field, event.target.value === '' ? undefined : Number(event.target.value)) }),
            h('small', { style: { flexBasis: '100%', color: settingsSecondary, fontSize: '12px' } }, '草稿有效值：' + (preview.windows[name] ?? '未配置') + ' · 来源：' + SOURCE_LABELS[preview.sources[field]])) })),
        h('fieldset', { disabled: busy, style: settingsGroup }, h('legend', { style: settingsLegend }, '界面显示位置'), h('p', { style: settingsHint }, '只控制入口显示；隐藏不关闭功能，不删除记录，也不免除现有义务。'), DISPLAY_NAMES.map(name => booleanField(('display.' + name) as PolicyField, DISPLAY_LABELS[name], preview.display[name] ? '显示' : '隐藏'))))),
      !Object.values(preview.display).some(Boolean) ? diagnostic('全部显示入口已关闭；本浏览器个人提醒独立于这些显示设置。') : null,
      h('section', { 'aria-label': '保存前预览', style: { ...settingsGroup, marginTop: '24px', borderLeft: '3px solid ' + (dirty ? settingsWarning : settingsAccent), background: 'var(--dsw-alias-bg-module-platform, Canvas)' } },
        h('div', { style: { display: 'flex', flexWrap: 'wrap' as const, justifyContent: 'space-between', gap: '8px' } },
          h('h4', { style: { margin: 0, fontSize: '15px' } }, '保存前预览'), settingsState(dirty ? '待保存草稿' : '与已保存配置一致', dirty ? 'warning' : 'muted')),
        h('p', { style: settingsHint }, '配置修订 ' + saved.revision + ' · ' + (dirty ? '有未保存更改' : '与已保存配置一致') + '。预览仅代表配置意图，不代表执行结果。'),
        impact.changes.length === 0 ? h('p', null, dirty ? '保存将更新稀疏覆盖；当前编辑范围的有效值未改变。' : '没有待保存的更改。') : h('ul', null, impact.changes.map(row => h('li', { key: row.field }, (POLICY_FIELD_LABELS[row.field as keyof typeof POLICY_FIELD_LABELS] ?? '未知配置项') + '：' + policyImpactText(row.before) + ' → ' + policyImpactText(row.after)))),
        h('p', { style: settingsHint }, '缩小参考上限不会释放正在执行的子代理；已有事实和义务保留，实际执行状态以会话观测为准。'),
        h('div', { style: settingsActions }, h(Button, { type: 'button', variant: 'primary', disabled: busy || !dirty, onClick: () => { void save() } }, saveLabel),
          h(Button, { type: 'button', disabled: busy || !dirty, onClick: () => { setDraft(intentOf(saved)); setMessage(null) } }, '放弃未保存更改'),
          h(Button, { type: 'button', disabled: busy, onClick: () => setReload(value => value + 1) }, '重新读取协作配置（丢弃草稿）')),
        message === null ? null : diagnostic(message)),
      h('details', { style: { marginTop: '16px' } }, h('summary', null, '技术详情（原始有效策略与变更）'), pretty(preview), pretty(impact)),
      unsupportedSeatsDetails()),
    h(BrowserNotificationPreferencesPanel),
    h('details', { key: 'supervision-settings', 'aria-label': '进阶交付监督', style: settingsCard }, h('summary', { tabIndex: 0, style: { cursor: 'pointer', fontSize: '16px', fontWeight: 600 } }, '进阶交付监督（独立保存）'),
      h(SupervisionSettingsPanel, { remote: props.remote, workspace })),
    h('details', { 'aria-label': '会话状态查看', style: settingsCard },
      h('summary', { tabIndex: 0, style: { cursor: 'pointer', fontSize: '16px', fontWeight: 600 } }, '会话状态查看'), h('p', { style: settingsHint }, '仅查看已存在会话，不修改草稿、不授予权限、不唤醒模型，也不自动打开侧栏。'),
      h('label', { style: settingsField }, '选择会话', h('select', { 'aria-label': '选择查看会话', value: selectedInspection ?? '', style: settingsSelect, onChange: (event: ChangeEvent<HTMLSelectElement>) => setInspection(event.target.value || null) },
        h('option', { value: '' }, '选择会话查看'), ...sessionChoices.ids.map(id => h('option', { key: id, value: id }, id)))),
      sessionChoices.unknown ? diagnostic('会话导航未知或不完整；不能据此断言没有会话。') : sessionChoices.ids.length === 0 ? h('p', null, '当前导航没有列出的会话（不是实例或权限结论）。') : null,
      selectedInspection === null ? null : h(SettingsInspection, { key: selectedInspection, sessionId: selectedInspection, observer: props.observe(selectedInspection), remote: props.remote }),
      h(SupervisionHistory, { remote: props.remote, sessionId: selectedInspection })))
}

type SourceState = 'preparing' | 'running' | 'ok' | 'error' | 'stopped'
export interface SourceView {
  readonly state: SourceState
  readonly summary: string
  readonly color: string | null
  readonly expandable: boolean
}
interface SourcePayload { readonly kind: 'json' | 'text'; readonly text: string; readonly note: string | null }

const SOURCE_ERROR_COLOR = 'var(--dsw-alias-state-error-primary, #dc2626)'
const SOURCE_STOPPED_COLOR = 'var(--dsw-alias-state-warn-label, #b45309)'
const SOURCE_CAPTION_COLOR = 'var(--dsw-alias-label-caption, #6b7280)'
const SOURCE_SECONDARY_COLOR = 'var(--dsw-alias-label-secondary, #4b5563)'
/** Expanded bodies and payloads are user-opened; parse/format only then, with a cap for pathological results. */
const SOURCE_MAX_INLINE = 200_000
const SOURCE_SUMMARY_STYLE = { display: 'inline-flex', alignItems: 'center', minWidth: 0, maxWidth: '100%' } as const
const SOURCE_SUMMARY_TEXT_STYLE = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 'var(--dsh-content-font-size-secondary, 13px)', lineHeight: 'calc(24px + var(--dsh-content-font-delta, 0px))' } as const
const SOURCE_SECTION_STYLE = { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 } as const
const SOURCE_SECTION_LABEL_STYLE = { color: SOURCE_CAPTION_COLOR, fontSize: '11px', lineHeight: '16px', margin: '0 0 0 4px' } as const
const SOURCE_CAPTION_STYLE = { margin: '0 0 0 4px', color: SOURCE_CAPTION_COLOR, fontSize: '12px', lineHeight: '18px' } as const
const SOURCE_PRE_STYLE = { margin: '0 0 0 4px', maxHeight: '200px', overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word', borderRadius: '8px', border: '.5px solid var(--dsw-alias-border-l1, rgba(127,127,127,.25))', background: 'var(--dsw-alias-markdown-code-block, rgba(127,127,127,.08))', color: SOURCE_SECONDARY_COLOR, font: 'var(--dsw-font-markdown-code-block-small, 12px/1.5 ui-monospace, monospace)', padding: '8px 10px' } as const
const SOURCE_BODY_STYLE = { display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '360px', overflowY: 'auto', overflowX: 'hidden', minWidth: 0, marginTop: '2px', paddingRight: '2px' } as const
const SOURCE_NOTE_STYLE = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', minWidth: 0 } as const
const SOURCE_NOTE_TEXT_STYLE = { minWidth: 0, color: SOURCE_CAPTION_COLOR, fontSize: '12px', lineHeight: '18px', overflowWrap: 'anywhere' } as const

function sourceTruncatedLabel(total: number): string { return '内容过长（' + String(total) + ' 字符），已截断显示' }
function isSourceRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value) }
function sourceTextField(value: unknown): string | null { return typeof value === 'string' && value.trim() !== '' ? value.trim() : null }
function sourceFirstLine(value: string): string { const newline = value.search(/\r?\n/u); return newline === -1 ? value : value.slice(0, newline) }
function sourceTruncate(value: string, max: number): string { return value.length <= max ? value : value.slice(0, Math.max(1, max - 1)) + '…' }
function sourceParse(text: string): unknown | undefined {
  if (text === '' || text.length > SOURCE_MAX_INLINE) return undefined
  try { return JSON.parse(text) as unknown } catch { return undefined }
}
function sourceRequest(argsRaw: string | null): Record<string, unknown> | null {
  if (argsRaw === null) return null
  const parsed = sourceParse(argsRaw)
  if (!isSourceRecord(parsed)) return null
  return isSourceRecord(parsed.request) ? parsed.request : parsed
}
function sourceCommand(request: Record<string, unknown> | null): Record<string, unknown> | null {
  return request !== null && isSourceRecord(request.command) ? request.command : null
}
function sourceArgsRaw(props: ToolCallViewProps): string | null {
  if (props.phase === 'preparing') return null
  if (props.phase === 'start') return props.block.argsRaw
  return props.block.call?.argsRaw ?? null
}
function sourceState(props: ToolCallViewProps): SourceState {
  if (props.phase === 'preparing') return 'preparing'
  if (props.phase === 'start') return 'running'
  if (props.block.error?.code === 'interrupted') return 'stopped'
  return props.block.isError ? 'error' : 'ok'
}
/** Compact English summary from wire action/target values; no translated title map. */
export function sourceAction(toolName: string, request: Record<string, unknown> | null): string {
  const command = sourceCommand(request)
  const commandAction = command === null ? null : sourceTextField(command.action)
  if (commandAction !== null) return commandAction
  const action = request === null ? null : sourceTextField(request.action)
  if (action !== null) return action
  if (toolName === 'mattpocock_assign') return 'assign'
  if (toolName === 'mattpocock_delegate') return 'delegate'
  return toolName.replace(/^mattpocock_/u, '') || 'instrument'
}
export function sourceTarget(request: Record<string, unknown> | null): string {
  if (request === null) return ''
  const command = sourceCommand(request)
  const pick = (key: string): unknown => command !== null && command[key] !== undefined ? command[key] : request[key]
  const parts: string[] = []
  const add = (value: string | null): void => { if (value !== null && value !== '' && !parts.includes(value)) parts.push(value) }
  add(sourceTextField(request.sessionId))
  const workflow = sourceTextField(pick('workflowId'))
  const item = sourceTextField(pick('localTicketId')) ?? sourceTextField(pick('decisionId'))
  if (workflow !== null && item !== null) add(workflow + '/' + item)
  else { add(workflow); add(item) }
  add(sourceTextField(request.resourceId))
  add(sourceTextField(pick('bindingId')))
  add(sourceTextField(pick('observationId')))
  add(sourceTextField(pick('state')))
  add(sourceTextField(request.domain))
  const query = isSourceRecord(request.query) ? request.query : null
  add(sourceTextField(query?.kind))
  add(sourceTextField(request.kind))
  add(sourceTextField(request.recordId))
  const historyIds = Array.isArray(request.historyIds) ? request.historyIds.filter(value => typeof value === 'string') : []
  if (historyIds.length > 0) add(String(historyIds.length) + ' history item(s)')
  const ticketIds = Array.isArray(request.ticketIds) ? request.ticketIds.filter(value => typeof value === 'string') : []
  if (ticketIds.length > 0) add(String(ticketIds.length) + ' ticket(s)')
  const description = sourceTextField(request.description)
  if (description !== null) add(sourceFirstLine(description))
  add(sourceTextField(request.provider))
  const expectedRevision = pick('expectedRevision')
  if (typeof expectedRevision === 'number' && Number.isSafeInteger(expectedRevision)) add('rev ' + String(expectedRevision))
  const generation = pick('generation')
  if (typeof generation === 'number' && Number.isSafeInteger(generation)) add('gen ' + String(generation))
  if (typeof request.included === 'boolean') add(request.included ? 'include' : 'exclude')
  return sourceTruncate(parts.join(' · '), 180)
}
export function sourceView(props: ToolCallViewProps): SourceView {
  const state = sourceState(props)
  if (state === 'preparing') return { state, summary: '', color: null, expandable: false }
  const request = sourceRequest(sourceArgsRaw(props))
  const parts = [sourceAction(props.toolName, request), sourceTarget(request)].filter(part => part !== '')
  if (state === 'running') parts.push('running')
  if (state === 'stopped') parts.push('interrupted')
  if (state === 'error') {
    const error = props.phase === 'result' ? props.block.error : undefined
    const reason = error === undefined ? null : sourceTextField(error.reason) ?? sourceTextField(error.code)
    parts.push(reason === null ? 'failed' : 'failed: ' + sourceFirstLine(reason))
  }
  return { state, summary: sourceTruncate(parts.join(' · '), 180), color: state === 'error' ? SOURCE_ERROR_COLOR : state === 'stopped' ? SOURCE_STOPPED_COLOR : null, expandable: true }
}
function sourceSummaryElement(view: SourceView): ReactElement | null {
  if (view.summary === '') return null
  return h('span', { style: SOURCE_SUMMARY_STYLE },
    h('span', { 'aria-hidden': true, style: { flex: 'none', width: 2, height: 2, borderRadius: 1, background: SOURCE_CAPTION_COLOR, opacity: 0.55, margin: '0 8px' } }),
    h('span', { title: view.summary, style: { ...SOURCE_SUMMARY_TEXT_STYLE, color: view.color ?? 'inherit' } }, view.summary))
}
function decodeSourcePayload(text: string, fallbackNote: string | null = null): SourcePayload {
  if (text === '') return { kind: 'text', text: '', note: fallbackNote }
  if (text.length > SOURCE_MAX_INLINE) return { kind: 'text', text, note: '内容较长，按原文显示' }
  const parsed = sourceParse(text)
  if (parsed === undefined) return { kind: 'text', text, note: fallbackNote }
  if (typeof parsed === 'string') return { kind: 'text', text: parsed, note: fallbackNote }
  try {
    const pretty = JSON.stringify(parsed, null, 2)
    return { kind: 'json', text: pretty ?? text, note: fallbackNote }
  } catch { return { kind: 'text', text, note: fallbackNote } }
}
function sourceInput(props: ToolCallViewProps): SourcePayload | null {
  const argsRaw = sourceArgsRaw(props)
  if (argsRaw === null) return null
  return decodeSourcePayload(argsRaw, props.phase === 'start' ? '参数可能仍在准备中，按原文显示' : null)
}
function sourceOutput(props: ToolCallViewProps): SourcePayload | null {
  if (props.phase !== 'result') return null
  const content = props.block.content
  if (content.length === 0) return null
  const texts: string[] = []
  const other: string[] = []
  for (const block of content) {
    if (block.type === 'text') texts.push(block.text)
    else other.push(block.type)
  }
  const otherNote = other.length === 0 ? null : '另含非文本内容：' + other.join(', ')
  if (texts.length === 0) return { kind: 'text', text: '[non-text content: ' + other.join(', ') + ']', note: null }
  if (texts.length === 1) return decodeSourcePayload(texts[0]!, otherNote)
  const payloads = texts.map(text => decodeSourcePayload(text))
  if (payloads.every(payload => payload.kind === 'json')) return { kind: 'json', text: payloads.map(payload => payload.text).join('\n\n'), note: otherNote }
  return { kind: 'text', text: texts.join('\n\n'), note: otherNote }
}
function sourceErrorText(props: ToolCallViewProps): string | null {
  if (props.phase !== 'result' || !props.block.isError) return null
  const error = props.block.error
  if (error === undefined) return '错误详情不可用（请查看原始记录）'
  const text = [error.name, error.code, error.reason].filter((value): value is string => typeof value === 'string' && value.trim() !== '').join(' · ')
  return text === '' ? '错误详情不可用（请查看原始记录）' : text
}
function sourcePayloadElement(payload: SourcePayload): ReactElement {
  const content = payload.kind === 'json'
    ? h(CodeBlock, { code: payload.text, lang: 'json', showHeader: true, copyLabel: '复制', copiedLabel: '已复制' })
    : payload.text === '' ? h('span', { style: SOURCE_CAPTION_STYLE }, '空文本') : h('pre', { style: SOURCE_PRE_STYLE }, payload.text)
  return h('div', { style: { minWidth: 0 } }, content, payload.note === null ? null : h('p', { style: SOURCE_CAPTION_STYLE }, payload.note))
}
function sourceBody(props: ToolCallViewProps, openDetails: () => void, annotate: boolean, canOpenDetails: boolean): ReactElement {
  const children: ReactElement[] = []
  const input = sourceInput(props)
  if (input === null) children.push(h('p', { key: 'input-unknown', style: SOURCE_CAPTION_STYLE }, '输入未知（调用头不在当前窗口）'))
  else if (input.kind === 'text' && input.text === '') children.push(h('p', { key: 'input-empty', style: SOURCE_CAPTION_STYLE }, '输入为空'))
  else children.push(h('div', { key: 'input', style: SOURCE_SECTION_STYLE }, h('div', { style: SOURCE_SECTION_LABEL_STYLE }, '输入'), sourcePayloadElement(input)))
  if (props.phase === 'result') {
    const output = sourceOutput(props)
    children.push(h('div', { key: 'output', style: SOURCE_SECTION_STYLE }, h('div', { style: SOURCE_SECTION_LABEL_STYLE }, '输出'), output === null ? h('p', { style: SOURCE_CAPTION_STYLE }, '无输出') : sourcePayloadElement(output)))
  } else children.push(h('p', { key: 'running-output', style: SOURCE_CAPTION_STYLE }, '运行中，尚无输出'))
  const error = sourceErrorText(props)
  if (error !== null) children.push(h('div', { key: 'error', style: SOURCE_SECTION_STYLE }, h('div', { style: SOURCE_SECTION_LABEL_STYLE }, '错误'), h('pre', { style: { ...SOURCE_PRE_STYLE, color: SOURCE_ERROR_COLOR } }, error)))
  if (annotate) children.push(h('div', { key: 'source-note', style: SOURCE_NOTE_STYLE },
    h('span', { style: SOURCE_NOTE_TEXT_STYLE }, '来源记录 · call ' + props.callId + ' · 历史快照；当前事实以实例账本为准。'),
    canOpenDetails ? h(Button, { size: 'sm', variant: 'ghost', onClick: openDetails }, '打开当前实例') : null))
  children.push(h(JsonBlock, { key: 'raw', label: '原始记录（JSON）', payload: sourceRecord(props), defaultOpen: false, truncatedLabel: sourceTruncatedLabel }))
  return h('div', { style: SOURCE_BODY_STYLE }, ...children)
}

/** Read only public call material; never serialize the lazy argument reader's internals. */
export function sourceRecord(props: ToolCallViewProps): unknown {
  if (props.phase === 'preparing') return { phase: props.phase, callId: props.callId, name: props.toolName, time: props.block.time, note: 'Arguments are still preparing and may be incomplete.' }
  if (props.phase === 'start') return { phase: props.phase, callId: props.callId, name: props.toolName, time: props.block.time, argsRaw: props.block.argsRaw }
  return { phase: props.phase, callId: props.callId, name: props.toolName, time: props.block.time, seq: props.block.seq, argsRaw: props.block.call?.argsRaw ?? null, content: props.block.content, isError: props.block.isError, error: props.block.error ?? null, meta: props.block.meta ?? null }
}
/** Only our own wire Tool names may claim a toolview; never another plugin's key. */
export function SourceCard(props: ToolCallViewProps & SummaryFace): ReactElement {
  const observation = useSummaryObservation(props.summary)
  const disclosure = props.useDisclosure()
  const view = useMemo(() => sourceView(props), [props.phase, props.block, props.toolName])
  const annotate = observation.status === 'ready' && observation.value.policy.display.timeline
  const canOpenDetails = annotate && observation.status === 'ready' && observation.value.policy.display.rightPanel
  const open = disclosure.expanded && view.expandable
  const body = useMemo(() => open ? sourceBody(props, props.openDetails, annotate, canOpenDetails) : null,
    [open, annotate, canOpenDetails, props.phase, props.block, props.callId, props.toolName, props.openDetails])
  return h('section', { 'aria-label': '协作工具记录', 'data-tool': props.toolName, 'data-state': view.state,
    style: { boxSizing: 'border-box', width: '100%', maxWidth: '100%', minWidth: 0, textAlign: 'left' } },
  h(DisclosureRow, {
    icon: h(IconSparkleRegular, { size: 14 }),
    title: props.toolName || 'instrument',
    running: view.state === 'preparing' || view.state === 'running',
    open,
    expandable: view.expandable,
    expandOnRowClick: true,
    keepContentWhenOpen: true,
    onToggle: disclosure.toggle,
    collapsedContent: sourceSummaryElement(view),
  }, body))
}

export const inject = ['slots', 'remote', 'sidebarRight', 'sidebarRightTabs']
/** Browser plugin activation, governed by Host Loader/package manifest, not DOM insertion. */
export async function apply(ctx: Context): Promise<void> {
  await ctx.remote.$mount(REMOTE_CONTRIBUTION)
  // $mount creates the namespace. Requiring it on the bootstrap itself would
  // prevent apply from running; all consumers instead belong to this child scope.
  await ctx.inject(['remote.mattpocockControls'], (ctx) => {
    const remote = (ctx.remote as typeof ctx.remote & { readonly mattpocockControls: ControlsRemote }).mattpocockControls
    const observers = new SessionObserverCache((id, signal) => remote.readSession(id, signal))
    const notificationReading = createNotificationReading()
    const observe = (sessionId: string): SessionObservation => observers.observe(sessionId)
    const summaries = new SummaryScheduler((request, signal) => remote.readSummaries(request, signal))
    const observeSummary = (sessionId: string): SummaryObserver => summaries.observe(sessionId)
    const visibility = new PolicyObserver(() => remote.readPolicy())
    ctx.effect(() => { void visibility.refresh(); return () => visibility.dispose() }, 'collaboration: committed policy visibility')
    const refreshAll = (): void => { void visibility.refresh(); summaries.refresh(); observers.refreshAll() }
    ctx.effect(() => () => { summaries.dispose(); observers.dispose() }, 'collaboration: observations')
    const face = (sessionId: string): SummaryFace => ({ summary: observeSummary(sessionId), observe: () => observe(sessionId), openDetails: () => {
      if (ctx.sidebarRight.mounted.getSnapshot() !== sessionId) return
      const snapshot = observeSummary(sessionId).getSnapshot()
      if (snapshot.status !== 'ready' || !snapshot.value.policy.display.rightPanel) return
      ctx.sidebarRight.openTab(TAB_KIND, { preferNewPane: true })
    } })
    const definition: SidebarRightTabDefinition = { id: TAB_ID, kind: TAB_KIND, title: () => '协作', keepMounted: false }
    ctx.effect(() => ctx.sidebarRightTabs.register(definition), 'collaboration: tab type')
    ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({ name: 'plugins.bundle.config', key: PACKAGE_NAME,
      inject: () => ({ remote, refreshAll, observe }) }, SettingsPage))
    ctx.slots.inject('plugins.row.config', () => ctx.slots.register({ name: 'plugins.row.config', key: ROW_KEY,
      inject: () => ({ remote, refreshAll, observe }) }, SettingsPage))
    ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({ name: 'conversation.session.header.utilities',
      id: TAB_ID + ':header', order: 100, inject: face }, HeaderEntry))
    ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({ name: 'conversation.session.header.utilities',
      id: TAB_ID + ':notifications', order: 110, inject: (sessionId) => ({ observer: observe(sessionId), reading: notificationReading }) }, DecisionNotificationSeat))
    ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({ name: 'conversation.input.dock',
      id: TAB_ID + ':notification-reader', order: 110, inject: (sessionId) => ({ observer: observe(sessionId), reading: notificationReading }) }, DecisionNotificationReader))
    ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({ name: 'conversation.input.dock',
      id: TAB_ID + ':input', order: 100, inject: face }, InputSummary))
    ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID,
      inject: (sessionId) => ({ observer: observe(sessionId), openDetails: face(sessionId).openDetails, remote }) }, Details))
    ctx.slots.inject('sidebar.session.row.leading', () => ctx.slots.register({ name: 'sidebar.session.row.leading',
      id: TAB_ID + ':row', order: 100, inject: () => ({ observeSummary, visibility }) }, WorkspaceBadge))
    ctx.slots.inject('tool.call.toolview', () => OWN_TOOL_NAMES.map(key => ctx.slots.register({ name: 'tool.call.toolview', key, inject: face }, SourceCard)))
  })
}

/** Existing Host authorization, not a model-supplied permission or business approval. */
export async function grantPolicyFromSnapshot(remote: Pick<ControlsRemote, 'grantPolicy'>,
  view: RuntimeSnapshot & { readonly caller: HostCaller; readonly policyGrants: PolicyGrants }, targetSessionId: string, enabled: boolean): Promise<PolicyGrants> {
  if (view.caller.kind !== 'user') throw new Error('Only the authenticated operator may grant agent configuration access')
  return remoteValue(await remote.grantPolicy(nonempty(targetSessionId), enabled, view.policyGrants.revision))
}
function PolicyDelegation(props: { readonly view: RuntimeSnapshot & { readonly caller: HostCaller; readonly policyGrants: PolicyGrants };
  readonly remote: ControlsRemote; readonly refresh: () => Promise<void> }): ReactElement {
  const [baseGrants, setBaseGrants] = useState(props.view.policyGrants)
  const [target, setTarget] = useState(props.view.sessionId)
  const [enabled, setEnabled] = useState(props.view.policyGrants.grants.find(row => row.sessionId === props.view.sessionId)?.enabled ?? false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  if (props.view.caller.kind !== 'user') return diagnostic('当前调用者是 agent：不能自行授予配置修改权限。')
  const save = async (): Promise<void> => {
    setBusy(true); setMessage(null)
    try { const grants = await grantPolicyFromSnapshot(props.remote, { ...props.view, policyGrants: baseGrants }, target, enabled); setBaseGrants(grants); await props.refresh(); setMessage('已保存明确配置委托；这不授予业务 scope 或资源租约。') }
    catch (error) { setMessage(errorText(error)) } finally { setBusy(false) }
  }
  return h('fieldset', { disabled: busy }, h('legend', null, 'Operator 明确授予 agent 配置权限（默认拒绝）'),
    h('label', null, '目标 Session ', h('input', { value: target, onChange: (event: ChangeEvent<HTMLInputElement>) => { const id = event.target.value; setTarget(id); setEnabled(props.view.policyGrants.grants.find(row => row.sessionId === id)?.enabled ?? false) } })),
    h('label', null, h('input', { type: 'checkbox', checked: enabled, onChange: (event: ChangeEvent<HTMLInputElement>) => setEnabled(event.target.checked) }), '允许此 agent 修改配置'),
    h('button', { type: 'button', disabled: !target.trim() || busy, onClick: () => { void save() } }, '明确保存委托'),
    h('button', { type: 'button', onClick: () => { setBaseGrants(props.view.policyGrants); setEnabled(props.view.policyGrants.grants.find(row => row.sessionId === target)?.enabled ?? false); setMessage(null) } }, '重新读取委托'),
    diagnostic('草稿委托修订 ' + baseGrants.revision), message === null ? null : diagnostic(message))
}
