import { createElement as h, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { ReactElement, ChangeEvent } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PluginConfigViewProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { parsePolicyIntent, parsePolicySnapshot, resolvePolicy, FEATURE_NAMES, DISPLAY_NAMES } from './controls/policy.js'
import type { EffectivePolicy, PolicyField, PolicyIntent, PolicySnapshot } from './controls/policy.js'
import { parseStartupDesired, parseStartupStatus } from './controls/startup-state.js'
import type { StartupDesired, StartupStatus } from './controls/startup-state.js'
import type { InstrumentSnapshot } from './controls/instruments.js'
import type { DecisionRecord, InstrumentCommand } from './controls/instrument-state.js'
import type { WindowSnapshot } from './controls/windows.js'
import type { WorktreeBindingCurrent } from './controls/worktree-bindings.js'
import { REMOTE_CONTRIBUTION, parseHostJson, parsePolicyGrants } from './controls/remote-contract.js'
import type { ControlsRemote as HostControlsRemote, HostJson, HostCaller, PolicyGrants, RuntimeSnapshot } from './controls/remote-contract.js'

export const PACKAGE_NAME = '@lmgatex/dsh-mattpocock-skills'
export const TAB_KIND = 'mattpocock-collaboration'
export const TAB_ID = PACKAGE_NAME + ':collaboration'
export const ROW_KEY = PACKAGE_NAME + '#dsh-mattpocock-skills'
export const OWN_TOOL_NAMES = ['mattpocock_record', 'mattpocock_window', 'mattpocock_resource', 'mattpocock_controls', 'mattpocock_execute', 'mattpocock_assign', 'mattpocock_history', 'mattpocock_worktree', 'mattpocock_delegate'] as const
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
      if (generation === this.generation && !this.closed && this.holds > 0 && this.intervalMs > 0) this.timer = setTimeout(() => { void this.refresh() }, this.intervalMs)
    }
  }
  dispose(): void { this.closed = true; this.generation++; this.controller?.abort(); this.holds = 0; this.clearTimer(); this.state = { status: 'unknown', value: null, error: 'Observer disposed' }; this.listeners.clear() }
  private clearTimer(): void { if (this.timer !== undefined) clearTimeout(this.timer); this.timer = undefined }
  private publish(state: Observation<ClientSessionSnapshot>): void { this.state = state; for (const listener of this.listeners) listener() }
}

/** Changes a draft only. undefined deletes a leaf and restores inheritance. */
export function setPolicyLeaf(intent: PolicyIntent, workspaceId: string | null, field: PolicyField, value: boolean | number | undefined): PolicyIntent {
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
function ownLeaf(intent: PolicyIntent, workspaceId: string | null, field: PolicyField): boolean | number | undefined {
  const [group, key] = field.split('.')
  const patch = workspaceId === null ? intent.defaults : intent.workspaceOverrides[workspaceId] ?? {}
  if (group === undefined || key === undefined) return undefined
  const row = object(patch)[group]
  return row === undefined ? undefined : object(row)[key] as boolean | number | undefined
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
  for (const key of DISPLAY_NAMES) add('display.' + key, { value: old.display[key], source: old.sources[('display.' + key) as PolicyField] }, { value: next.display[key], source: next.sources[('display.' + key) as PolicyField] })
  return { readRevision: saved.revision, scope: workspaceId ?? 'global-defaults', changes, executionEffects: 'Intent only. Existing obligations/executions remain; inspect the authorized Session snapshot for actual usage/convergence.' }
}
function intentOf(snapshot: PolicySnapshot): PolicyIntent { return parsePolicyIntent({ extensionEnabled: snapshot.extensionEnabled, defaults: snapshot.defaults, workspaceOverrides: snapshot.workspaceOverrides }) }
function useObservation(observer: SessionObserver): Observation<ClientSessionSnapshot> {
  useEffect(() => observer.retain(), [observer])
  return useSyncExternalStore(observer.subscribe, observer.getSnapshot, observer.getSnapshot)
}
const panelStyle = { boxSizing: 'border-box' as const, padding: '16px', height: '100%', width: '100%', maxWidth: '100%', minWidth: 0, overflow: 'auto', minHeight: 0, overflowWrap: 'anywhere' as const, textAlign: 'left' as const }
function diagnostic(message: string): ReactElement { return h('p', { role: 'status' }, message) }
function pretty(value: unknown): ReactElement { return h('pre', { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, JSON.stringify(value, null, 2)) }

interface SessionFace { readonly observer: SessionObserver; readonly openDetails: () => void }
type HeaderProps = PropsRuntime<'conversation.session.header.utilities'> & SessionFace
function countText(value: unknown): string { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? String(value) : '未知' }
function capacityText(value: unknown): string { return value === null ? '未配置' : typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? String(value) : '未知' }
/** T is explicit bookkeeping; S tracking is not proof that all runtime work is known. */
export function windowSummary(windows: WindowSnapshot | null, health: ClientSessionSnapshot['health'] = []): readonly string[] {
  if (windows === null || health.some(row => row.scope === 'windows' && row.status === 'unknown')) return ['T 未知', 'S 未知']
  const signed = (value: unknown): string => typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : '未知'
  const reference = (usage: WindowSnapshot['T']): string => '/' + capacityText(usage.capacity) + '（参考） · 超出 ' + countText(usage.overage) + ' · 差额 ' + signed(usage.gap)
  const T = 'T ' + countText(windows.T.used) + reference(windows.T)
  const knownS = windows.S.countKnown === true && windows.capability === 'cooperative' && windows.runtimeKnowledge?.known === true && windows.S.byState.unknown === 0
  const S = knownS ? 'S ' + countText(windows.S.used) + reference(windows.S)
    : 'S 已登记 ' + countText(windows.S.used) + reference(windows.S) + ' · 总数未知'
  return [T, S]
}
export function WindowProjection(props: { readonly view: ClientSessionSnapshot }): ReactElement {
  const failed = props.view.health.find(row => row.scope === 'windows' && row.status === 'unknown')
  const windows = props.view.windows
  if (failed || windows === null) return diagnostic('窗口观测未知：' + (failed?.reason ?? '未返回 T/S；不是 0 或默认容量'))
  return h('section', { 'aria-label': '参考窗口观测' },
    diagnostic('T/S 是参考值，不是硬名额；超出或统计未知不拒绝派发，也不要求额外审批。'),
    diagnostic('available 仅是登记账本余量，不是全机可派发数量；countKnown=false 时 used 只是已登记量，总数未知。'),
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
  const records = view.records
  const statuses = records?.summary.statusCounts.flatMap(axis => axis.statuses.map(status => ({
    key: axis.workflowId + '/' + axis.axisKey + '/' + status.statusKey,
    priority: status.summaryPriority ?? Number.MAX_SAFE_INTEGER,
    text: axis.workflowId + '/' + axis.label + ':' + status.label + ' ' + countText(status.count) + ' (' + axis.counting + ')',
  }))).sort((a, b) => a.priority - b.priority || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)) ?? []
  const custom = statuses.slice(0, 2).map(row => row.text).join(' · ')
  const ticket = '票 ' + (records === null ? '未知' : countText(records.summary.totalTickets)) + (custom ? ' · ' + custom : '') + (statuses.length > 2 ? ' · 更多 ' + (statuses.length - 2) : '')
  const [T = 'T 未知', S = 'S 未知'] = windowSummary(view.windows, view.health)
  const resource = resourceSummary(view)
  const parts = ['待用户裁决 ' + (records === null ? '未知' : countText(records.summary.pendingUserDecisionCount)) + ' · 待落实 ' + (records === null ? '未知' : countText(records.summary.awaitingImplementationCount)), ticket, T, S,
    bindingSummary(view), resource.label]
  const detail = '实例 ' + view.instance.instrumentInstanceId + ' · ' + (records?.summary.countingScope ?? '统计未知') + ' · ' + parts.join(' · ')
    + (statuses.length ? ' · 完整状态：' + statuses.map(row => row.text).join(' · ') : '') + (resource.reason === null ? '' : ' · 资源读取原因：' + resource.reason)
  return { parts, detail }
}
export function HeaderEntry(props: HeaderProps): ReactElement | null {
  const observation = useObservation(props.observer)
  if (props.observer.getDisplay()?.header === false) return null
  if (observation.status === 'unknown') return h('span', { title: observation.error ?? '尚无已确认的状态快照', role: 'status', style: { display: 'inline-block', maxWidth: 'min(36vw, 320px)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, '协作 · 状态未知')
  const view = observation.value
  if (!view.policy.display.header) return null
  const summary = compactInstrumentSummary(view)
  const style = { display: 'inline-flex', alignItems: 'center', gap: '6px', maxWidth: 'min(36vw, 320px)', minWidth: 0, overflow: 'hidden', fontSize: '11px' }
  const content = [h('span', { key: 'identity', style: { flexShrink: 0 } }, '协作'), ...summary.parts.map((part, index) => h('span', { key: index, style: { minWidth: 0, maxWidth: index === 1 ? '220px' : '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, part))]
  return view.policy.display.rightPanel ? h('button', { type: 'button', onClick: props.openDetails, title: summary.detail, 'aria-label': summary.detail, style }, ...content)
    : h('span', { title: summary.detail + ' · 右侧详情入口已关闭', 'aria-label': summary.detail, style }, ...content)
}
function countingScopeText(scope: InstrumentSnapshot['summary']['countingScope']): string {
  return ({ instance: '当前实例统计', assignment: '当前分配范围统计' } satisfies Record<InstrumentSnapshot['summary']['countingScope'], string>)[scope] ?? '统计范围未知'
}
export function InputSummary(props: PropsRuntime<'conversation.input.dock'> & SessionFace): ReactElement | null {
  const observation = useObservation(props.observer)
  if (observation.status !== 'ready' || !observation.value.policy.display.inputSummary) return null
  const view = observation.value
  const gates = view.policy as { readonly extensionEnabled?: boolean; readonly workspaceEnabled?: boolean }
  const inactive = gates.extensionEnabled === false ? '全局总闸已关闭' : gates.workspaceEnabled === false ? '本工作区总闸已关闭' : null
  return h('section', { 'aria-label': '协作进度摘要', style: { boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', width: 'calc(100% - 2 * var(--dsh-composer-side-clearance, 16px))', maxWidth: 'var(--dsh-composer-card-max-width, 952px)', marginInline: 'auto', padding: '8px 12px', minWidth: 0, maxHeight: '96px', overflowY: 'auto', overflowWrap: 'anywhere', gap: '4px', lineHeight: 1.5 } },
    inactive === null ? null : diagnostic('协作管理未生效：' + inactive + '，下列数字仅为已保存记录，不会随工作更新。'),
    view.records === null ? diagnostic('票进度未知') : h('span', null, '票 ' + String(view.records.summary.totalTickets) + ' · ' + countingScopeText(view.records.summary.countingScope)),
    h('span', null, windowSummary(view.windows, view.health).join(' · ')),
    view.records?.summary.statusCounts.map(axis => h('div', { key: axis.workflowId + ':' + axis.axisKey }, axis.workflowId + ' / ' + axis.label + '（' + (axis.counting === 'exclusive' ? '互斥统计' : '可重叠统计') + '） · ' + axis.statuses.map(status => status.label + ' ' + status.count).join(' · '))))
}

/** Explicit user answer; the Host RPC derives the real author, never the command. */
export function decisionAnswerCommand(records: InstrumentSnapshot, decision: DecisionRecord, answer: string, status: string,
  pending: boolean, awaitingImplementation: boolean, operationId: string): InstrumentCommand {
  if (!answer.trim() || !status.trim()) throw new Error('Answer and user-selected status are required')
  return { operationId, expectedRevision: records.businessRevision, workflowId: decision.workflowId,
    action: 'put-decision', decisionId: decision.decisionId,
    value: { question: decision.value.question, status, result: answer, pending, awaitingImplementation } }
}

function DecisionEditor(props: { readonly decision: DecisionRecord; readonly records: InstrumentSnapshot;
  readonly sessionId: string; readonly remote: ControlsRemote; readonly refresh: () => Promise<void> }): ReactElement {
  const [base, setBase] = useState({ records: props.records, decision: props.decision })
  const [answer, setAnswer] = useState('')
  const [status, setStatus] = useState(props.decision.value.status)
  const [pending, setPending] = useState(props.decision.value.pending ?? false)
  const [awaiting, setAwaiting] = useState(props.decision.value.awaitingImplementation ?? false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const save = async (): Promise<void> => {
    setBusy(true); setMessage(null)
    try {
      const command = decisionAnswerCommand(base.records, base.decision, answer, status, pending, awaiting, crypto.randomUUID())
      remoteValue(await props.remote.applyInstrument(props.sessionId, command))
      setMessage('已记录你的裁决；待落实标记按你的明确选择保存。')
      await props.refresh()
    } catch (error) { setMessage(errorText(error)) } finally { setBusy(false) }
  }
  return h('article', { style: { borderBottom: '1px solid currentColor', padding: '12px 0' } },
    h('h4', null, props.decision.value.question),
    h('p', null, props.decision.workflowId + ' · ' + props.decision.value.status + (props.decision.value.pending ? ' · 未解决' : '') + (props.decision.value.awaitingImplementation ? ' · 已裁决待落实' : '')),
    props.decision.value.context ? h('p', null, props.decision.value.context) : null,
    props.decision.value.options?.map(option => h('button', { key: option.key, type: 'button', disabled: busy, onClick: () => setAnswer(option.label) }, option.label)),
    props.decision.value.result ? h('p', null, '已记录结果：' + props.decision.value.result) : null,
    h('label', null, '你的裁决', h('textarea', { value: answer, disabled: busy, onChange: (event: ChangeEvent<HTMLTextAreaElement>) => setAnswer(event.target.value) })),
    h('label', null, '保存状态（任务自定义）', h('input', { value: status, disabled: busy, onChange: (event: ChangeEvent<HTMLInputElement>) => setStatus(event.target.value) })),
    h('label', null, h('input', { type: 'checkbox', checked: pending, disabled: busy, onChange: (event: ChangeEvent<HTMLInputElement>) => setPending(event.target.checked) }), '仍 pending'),
    h('label', null, h('input', { type: 'checkbox', checked: awaiting, disabled: busy, onChange: (event: ChangeEvent<HTMLInputElement>) => setAwaiting(event.target.checked) }), '已裁决，仍待落实'),
    h('button', { type: 'button', disabled: busy || !answer.trim() || !status.trim(), onClick: () => { void save() } }, '按明确选择记录裁决'),
    h('button', { type: 'button', disabled: busy, onClick: () => { setBase({ records: props.records, decision: props.decision }); setAnswer(''); setStatus(props.decision.value.status); setPending(props.decision.value.pending ?? false); setAwaiting(props.decision.value.awaitingImplementation ?? false); setMessage(null) } }, '重新读取事项（丢弃草稿）'),
    diagnostic('草稿业务修订 ' + base.records.businessRevision + '；背景刷新不会升级保存修订。'),
    message === null ? null : diagnostic(message),
    h('details', null, h('summary', null, '来源历史（不是当前状态）'), pretty(props.decision.history)))
}

export function Details(props: PropsRuntime<'sidebar.right.pane.tab'> & SessionFace & { readonly remote: ControlsRemote }): ReactElement {
  const observation = useObservation(props.observer)
  const tab = props.useTabInfo()
  if (props.observer.sessionId !== props.sessionId) return diagnostic('会话选择与观察归属不一致；状态未知。')
  if (observation.status === 'unknown') return h('section', { style: panelStyle }, diagnostic('当前状态未知：' + (observation.error ?? '读取中')), h('button', { type: 'button', onClick: () => { void props.observer.refresh() } }, '重新读取'))
  const view = observation.value
  if (!view.policy.display.rightPanel) return h('section', { style: panelStyle }, diagnostic('右侧显示已关闭；账本和模型消费不受影响。'))
  return h('section', { style: panelStyle, 'aria-label': '协作详情' },
    h('h3', null, '协作 · ' + view.instance.ownerSessionId),
    diagnostic('实例 ' + view.instance.instrumentInstanceId + ' · Session ' + props.sessionId + (tab.tab.visible ? '' : ' · 非前台')),
    h('button', { type: 'button', onClick: () => { void props.observer.refresh() } }, '刷新已提交投影'),
    h('h4', null, '票进度'),
    view.records === null ? diagnostic('票/事项账本未知或不可用') : h('div', null,
      diagnostic('统计范围：' + view.records.summary.countingScope + ' · 业务修订 ' + view.records.businessRevision),
      view.records.workflows.map(workflow => h('section', { key: workflow.workflowId }, h('h4', null, workflow.value.title),
        workflow.value.axes.map(axis => h('div', { key: axis.axisKey }, h('p', null, axis.label + ' · ' + axis.counting), axis.statuses.map(status => h('span', { key: status.statusKey, title: status.meaning ?? undefined }, status.label + ' ')))),
        view.records?.tickets.filter(ticket => ticket.workflowId === workflow.workflowId).map(ticket => h('article', { key: ticket.localTicketId }, h('strong', null, ticket.value.title), pretty(ticket.value))))),
      h('h4', null, '待用户裁决 ' + view.records.summary.pendingUserDecisionCount + ' · 待落实 ' + view.records.summary.awaitingImplementationCount),
      view.records.decisions.map(decision => h(DecisionEditor, { key: props.sessionId + ':' + decision.workflowId + ':' + decision.decisionId, decision, records: view.records!, sessionId: props.sessionId, remote: props.remote, refresh: props.observer.refresh }))),
    h('h4', null, '双窗口（实例范围，观测/参考）'), h(WindowProjection, { view }),
    h(WorktreeBindingsPanel, { key: props.sessionId + ':bindings', view, remote: props.remote, refresh: props.observer.refresh }),
    h('details', null, h('summary', null, '旧资源记录（仅只读，不提供创建/实际退役入口）'), ResourceProjection({ view })),
    h('h4', null, '能力与健康（观测标签）'), diagnostic('能力与健康标签是宿主观测，不是操作许可或业务裁决。'), pretty({ capabilities: view.capabilities, health: view.health }),
    h(HistoryPanel, { key: props.sessionId + ':history', sessionId: props.sessionId, instance: view.instance, remote: props.remote, refresh: props.observer.refresh }),
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
  private readonly listeners = new Set<() => void>()
  constructor(private readonly read: () => Promise<RemoteResult<unknown>>) {}
  getSnapshot = (): PolicySnapshot | null => this.value
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  async refresh(): Promise<void> {
    const generation = ++this.generation
    try { const value = parsePolicySnapshot(remoteValue(await this.read())); if (this.closed || generation !== this.generation) return; this.value = value }
    catch { if (this.closed || generation !== this.generation) return; this.value = null }
    for (const listener of this.listeners) listener()
  }
  dispose(): void { this.closed = true; this.generation++; this.listeners.clear() }
}
export function WorkspaceBadge(props: PropsRuntime<'sidebar.session.row.leading'> & { readonly observe: (sessionId: string) => SessionObserver; readonly visibility: PolicyObserver }): ReactElement | null {
  const policy = useSyncExternalStore(props.visibility.subscribe, props.visibility.getSnapshot, props.visibility.getSnapshot)
  if (!sessionListRequested(policy)) return null
  return h(BadgeContent, { observer: props.observe(props.sessionId), policyRevision: policy!.revision })
}
function BadgeContent(props: { readonly observer: SessionObserver; readonly policyRevision: number }): ReactElement | null {
  const observation = useSyncExternalStore(props.observer.subscribe, props.observer.getSnapshot, props.observer.getSnapshot)
  const active = observation.status !== 'ready' || observation.value.policy.configurationRevision !== props.policyRevision || observation.value.policy.display.sessionList
  useEffect(() => active ? props.observer.retain() : undefined, [props.observer, active])
  if (observation.status !== 'ready' || !observation.value.policy.display.sessionList) return null
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
export function SettingsInspection(props: { readonly sessionId: string; readonly observer: SessionObserver; readonly remote?: ControlsRemote }): ReactElement {
  if (props.observer.sessionId !== props.sessionId) return diagnostic('会话选择与观察归属不一致；状态未知。')
  return h(ObservedSettingsInspection, props)
}
export function ObservedSettingsInspection(props: { readonly sessionId: string; readonly observer: SessionObserver; readonly remote?: ControlsRemote }): ReactElement {
  const observation = useObservation(props.observer)
  if (observation.status !== 'ready') return h('section', { 'aria-label': '设置页会话仪器', style: { maxHeight: '50vh', overflow: 'auto' } }, diagnostic(props.sessionId + ' · 仪器状态未知：' + (observation.error ?? '读取中')),
    h('button', { type: 'button', onClick: () => { void props.observer.refresh() } }, '重新读取所选会话'))
  const view = observation.value
  return h('section', { 'aria-label': '设置页会话仪器', style: { maxHeight: '50vh', overflow: 'auto' } },
    h('h4', null, '所选会话 ' + props.sessionId + ' · 当前投影与显式登记'),
    diagnostic('实例 ' + view.instance.instrumentInstanceId + ' · 主会话 ' + view.instance.ownerSessionId + ' · 真实调用者 ' + view.caller.kind + ':' + view.caller.principalId),
    h('button', { type: 'button', onClick: () => { void props.observer.refresh() } }, '刷新所选会话'),
    h('h4', null, '票进度与待裁决'), view.records === null ? diagnostic('票/事项账本未知') : pretty(view.records),
    h('h4', null, '独立 T/S（观测/参考）'), h(WindowProjection, { view }),
    props.remote ? h(WorktreeBindingsPanel, { key: props.sessionId + ':bindings', view, remote: props.remote, refresh: props.observer.refresh }) : null,
    h('details', null, h('summary', null, '旧资源记录（仅只读）'), ResourceProjection({ view })),
    props.remote ? h(HistoryPanel, { key: props.sessionId + ':history', sessionId: props.sessionId, instance: view.instance, remote: props.remote, refresh: props.observer.refresh }) : null,
    h('h4', null, '能力、健康观测与有效策略'), diagnostic('能力与健康标签是宿主观测，不是操作许可或业务裁决。'), pretty({ capabilities: view.capabilities, health: view.health, policy: view.policy }))
}
export interface StartupSettingsView {
  readonly saved: StartupStatus | null
  readonly draft: StartupDesired | null
  readonly busy: 'loading' | 'saving' | null
  readonly error: string | null
  readonly notice: string | null
}
type StartupRemote = Pick<ControlsRemote, 'startupStatus' | 'saveStartupSettings'>
/** Global Profile startup intent only; no Workspace Policy revision or SDK write enters this seam. */
export class StartupSettingsController {
  private state: StartupSettingsView = { saved: null, draft: null, busy: null, error: null, notice: null }
  private readonly listeners = new Set<() => void>()
  private generation = 0
  private controller: AbortController | undefined
  private holds = 0
  private closed = false
  constructor(private readonly remote: StartupRemote) {}
  getSnapshot = (): StartupSettingsView => this.state
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private publish(state: StartupSettingsView): void { this.state = state; for (const listener of this.listeners) listener() }
  private cancel(): void { this.generation++; this.controller?.abort(); this.controller = undefined }
  retain = (): (() => void) => {
    if (this.closed) throw new Error('Startup settings have been disposed')
    if (this.holds++ === 0) void this.refresh()
    let released = false
    return () => { if (released || this.closed) return; released = true; if (--this.holds === 0) { this.cancel(); this.publish({ saved: null, draft: null, busy: null, error: null, notice: null }) } }
  }
  refresh = async (): Promise<void> => {
    if (this.closed) return
    this.cancel(); const generation = this.generation; const controller = this.controller = new AbortController()
    this.publish({ saved: null, draft: null, busy: 'loading', error: null, notice: null })
    try {
      const saved = parseStartupStatus(remoteValue(await this.remote.startupStatus(controller.signal)))
      if (this.closed || generation !== this.generation) return
      this.publish({ saved, draft: parseStartupDesired(saved.desired), busy: null, error: null, notice: null })
    } catch (error) {
      if (!this.closed && generation === this.generation) this.publish({ ...this.state, busy: null, error: '启动状态不可用：' + errorText(error) })
    }
  }
  setDesired = (startupCwdEnabled: boolean): void => {
    const draft = parseStartupDesired({ startupCwdEnabled })
    if (this.closed || this.state.busy !== null || this.state.saved === null) return
    this.publish({ ...this.state, draft, notice: null })
  }
  save = async (): Promise<void> => {
    const { saved, draft, busy } = this.state
    if (this.closed || busy !== null || saved === null || draft === null || saved.desired.startupCwdEnabled === draft.startupCwdEnabled) return
    const desired = parseStartupDesired(draft); const expectedRevision = saved.revision
    this.cancel(); const generation = this.generation; const controller = this.controller = new AbortController()
    this.publish({ ...this.state, busy: 'saving', error: null, notice: null })
    try {
      const receipt = parseStartupStatus(remoteValue(await this.remote.saveStartupSettings(desired, expectedRevision, controller.signal)))
      if (this.closed || generation !== this.generation) return
      if (receipt.desired.startupCwdEnabled !== desired.startupCwdEnabled || receipt.revision < expectedRevision) throw new Error('Host startup save receipt does not confirm the submitted configuration')
      this.publish({ saved: receipt, draft: parseStartupDesired(receipt.desired), busy: null, error: null, notice: '已保存下次启动请求修订 ' + receipt.revision + '；当前进程不会立即改变。' })
    } catch (error) {
      if (!this.closed && generation === this.generation) this.publish({ ...this.state, busy: null, error: '保存结果未确认：' + errorText(error) + '。配置可能已写入；请重新读取启动状态核对。', notice: null })
    }
  }
  dispose = (): void => { if (this.closed) return; this.closed = true; this.cancel(); this.holds = 0; this.publish({ saved: null, draft: null, busy: null, error: '启动设置已卸载；状态不可用。', notice: null }); this.listeners.clear() }
}
const STARTUP_HINT = '此设置在 DSH 启动时读取。保存只修改下次启动配置，不会立即改变当前进程；刷新网页或热重载不能代替进程重启。兼容支持由同一插件包提供；安装或更新插件后，保存下次启动请求，再正常重启 DSH。是否生效以当前运行状态为准；兼容性尚未验证时，反复重启也不会生效。'
const settingsCard = { border: '1px solid rgba(127,127,127,.3)', borderRadius: '12px', padding: '20px', minWidth: 0, overflowWrap: 'anywhere' as const }
const settingsGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '16px', minWidth: 0 }
const TONE = { open: '#15803d', closed: '#b45309' } as const
const settingsActions = { display: 'flex', flexWrap: 'wrap' as const, gap: '8px', marginTop: '16px' }
const settingsField = { display: 'flex', flexWrap: 'wrap' as const, alignItems: 'center', gap: '8px', margin: '12px 0', minWidth: 0 }
function startupFlag(value: boolean | null): string { return value === null ? '未知（观测不可用）' : value ? '启用' : '禁用' }
/** Translate the authoritative Host state; plugin readiness never overrides loaded capability. */
function startupStateText(saved: StartupStatus): string {
  if (saved.state === 'incompatible' && saved.preparation.reason === 'compatibility-component-disabled') return '兼容桥被配置禁用'
  if (saved.state === 'incompatible' && saved.preparation.reason === 'compatibility-component-forced-enabled') return '兼容桥被强制开启'
  return ({ disabled: '禁用', enabled: '启用', 'pending-restart': '待重启（当前运行状态未改变）', 'needs-preparation': '插件兼容性尚未验证', unsupported: '增强功能不可用', incompatible: '插件兼容性不匹配', failed: '插件兼容验证失败', uncertain: '状态不确定' } satisfies Record<StartupStatus['state'], string>)[saved.state]
}
function preparationText(saved: StartupStatus): string {
  if (saved.preparation.reason === 'compatibility-component-disabled') return '兼容桥被配置禁用（需要恢复自动选择）'
  if (saved.preparation.reason === 'compatibility-component-forced-enabled') return '兼容桥被强制开启（自动选择保护被覆盖）'
  return ({ ready: '插件实现已就绪（不代表当前已启用）', 'not-prepared': '插件兼容性尚未验证', incompatible: '插件兼容性不匹配', failed: '插件兼容验证失败', uncertain: '状态不确定' } satisfies Record<StartupStatus['preparation']['status'], string>)[saved.preparation.status]
}
function startupExplanation(saved: StartupStatus): { readonly title: string; readonly detail: string } {
  const request = saved.desired.startupCwdEnabled ? '已保存启用请求。' : '已保存关闭请求。'
  if (saved.state === 'enabled') return { title: '已生效', detail: '当前进程已启用；创建新的可继续交互子代理时，可指定工作树作为初始工作目录。' }
  if (saved.state === 'disabled') return { title: '已关闭', detail: '当前进程未启用此功能；关闭不卸载运行时能力，也不改变已有子代理的工作目录。' }
  if (saved.state === 'pending-restart') return { title: saved.enabledNow === true ? '当前仍生效：关闭请求待重启' : '尚未生效：待重启', detail: request + '当前进程保留本次启动配置；重启 DSH 后重新核对运行状态，刷新网页无效。' }
  if (saved.preparation.reason === 'compatibility-component-disabled') return { title: (saved.enabledNow === null ? '运行状态未知：' : '尚未生效：') + '兼容桥被配置禁用', detail: request + '功能请求已保留，但内部依赖被组件配置关闭。请撤销兼容桥的关闭覆盖，恢复自动选择；不要把组件强制开启当作恢复默认。保存功能请求或反复重启都不会撤销该覆盖。当前进程与已有子代理不会被替换。' }
  if (saved.preparation.reason === 'compatibility-component-forced-enabled') return { title: (saved.enabledNow === null ? '运行状态未知：' : '尚未生效：') + '兼容桥被强制开启', detail: request + '功能请求已保留，但兼容桥的自动选择保护已被强制开启覆盖替换。请仅撤销该组件的强制开启覆盖，恢复自动选择；不要改成强制关闭或再次强制开启。其他兼容性冲突仍可能存在，恢复后请重新读取诊断。保存功能请求、刷新网页或反复重启都不会撤销该覆盖。当前进程与已有子代理不会被替换。' }
  if (saved.state === 'needs-preparation') return { title: '尚未生效：插件兼容性尚未验证', detail: request + '插件兼容性尚未验证，反复重启也不会生效。请安装或更新兼容的插件版本，并查看技术诊断。' }
  if (saved.state === 'unsupported') return { title: '尚未生效：增强功能不可用', detail: request + '当前无法提供此增强功能，仍可使用普通原生子代理。请更新兼容的插件版本并查看技术诊断；重启本身不能解决兼容性未知的问题。' }
  return { title: (saved.enabledNow === null ? '运行状态未知：' : '尚未生效：') + startupStateText(saved), detail: request + '此增强功能暂不可用，仍可使用普通原生子代理。请更新兼容的插件版本并查看技术诊断，不要将保存成功或重启标记当作功能已生效。' }
}
/** Permanently separate from the Workspace Policy form, including while that form is unavailable. */
export function StartupSettingsPanel(props: { readonly remote: StartupRemote }): ReactElement {
  const controller = useMemo(() => new StartupSettingsController(props.remote), [props.remote])
  useEffect(() => controller.retain(), [controller])
  const view = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const saved = view.saved; const draft = view.draft
  const dirty = saved !== null && draft !== null && saved.desired.startupCwdEnabled !== draft.startupCwdEnabled
  const explanation = saved === null ? null : startupExplanation(saved)
  const needsPreparation = saved !== null && saved.nativeInitialCwdSupported !== true && (saved.preparation.status !== 'ready' || ['needs-preparation', 'unsupported', 'incompatible', 'failed'].includes(saved.state))
  return h('section', { 'aria-label': '子代理创建时的工作树设置', style: settingsCard },
    h('h3', { style: { marginTop: 0 } }, '创建子代理（subagent）时指定工作树（worktree）'),
    h('p', null, '本插件的启动配置（不是 DSH 的全局开关）· 让新建、可继续交互的子代理从指定工作树目录开始工作。不改变 DSH 自身启动目录或已有会话，不负责创建、合并或清理工作树。'),
    h('p', null, '独立启动配置；只控制本插件显式指定初始工作目录的子代理派发，不是 DSH 全部子代理 API 的总开关；不受工作区策略、管理总开关或技能分发开关控制。'),
    h('p', null, '子代理工作目录兼容桥（本插件提供）是内部实现依赖，不是 DSH 官方组件。框架插件列表中的组件开关是高级维护控制，不是第二个功能开关；正常使用只需在这里设置功能请求。'),
    saved !== null && view.error !== null ? h('p', { role: 'alert' }, '以下为上次确认的启动状态；保存后的持久配置尚未确认，不能当作当前配置回执。') : null,
    h('div', { style: settingsGrid },
      h('section', { 'aria-label': '当前运行状态', style: { ...settingsCard, background: 'rgba(127,127,127,.05)' } },
        h('h4', { style: { marginTop: 0 } }, '当前运行状态'),
        saved === null || explanation === null ? diagnostic(view.error ?? '启动状态不可用：读取中；当前生效与下次配置均未知。') : h('div', { role: 'status', 'aria-live': 'polite' },
          h('strong', null, explanation.title), h('p', null, explanation.detail),
          h('p', null, '当前生效：' + startupFlag(saved.enabledNow)),
          h('p', null, '本次启动请求：' + startupFlag(saved.boot.requested.startupCwdEnabled)),
          h('p', null, '插件兼容支持：' + (saved.nativeInitialCwdSupported === true ? '当前运行时能力已支持，无需额外兼容准备' : preparationText(saved))),
          h('p', null, '当前运行时能力：' + (saved.nativeInitialCwdSupported === null ? '未知（观测不可用）' : saved.nativeInitialCwdSupported ? '支持' : '不支持')))),
      h('section', { 'aria-label': '下次启动设置', style: settingsCard },
        h('h4', { style: { marginTop: 0 } }, '下次启动设置'),
        h('label', { style: settingsField }, h('input', { type: 'checkbox', 'aria-label': '允许本插件创建子代理时指定工作树', checked: draft?.startupCwdEnabled ?? false, disabled: view.busy !== null || draft === null,
          onChange: (event: ChangeEvent<HTMLInputElement>) => controller.setDesired(event.target.checked) }), '允许本插件创建子代理时指定工作树'),
        saved === null ? h('p', null, '已保存配置与草稿尚未确认。') : h('div', null,
          h('p', null, '下次启动（已保存）：' + startupFlag(saved.desired.startupCwdEnabled)),
          h('p', null, '草稿：' + startupFlag(draft?.startupCwdEnabled ?? null) + (dirty ? '（未保存）' : '（与已保存一致）'))),
        h('div', { style: settingsActions },
          h('button', { type: 'button', disabled: view.busy !== null || !dirty, onClick: () => { void controller.save() } }, view.busy === 'saving' ? '正在保存…' : '保存下次启动请求'),
          h('button', { type: 'button', disabled: view.busy === 'loading', onClick: () => { void controller.refresh() } }, '重新读取启动状态（丢弃草稿）')))),
    h('p', { style: { lineHeight: 1.65 } }, saved?.preparation.reason === 'compatibility-component-disabled'
      ? saved.nativeInitialCwdSupported === true
        ? '当前运行时能力已支持，组件关闭覆盖不会抹除当前能力，但可能阻断下次启动的兼容选择。需要继续使用兼容桥时，撤销关闭覆盖以恢复自动选择；保存功能请求或刷新网页不会代替这一配置恢复。'
        : '此设置在 DSH 启动时读取；保存不改变当前进程。当前阻断是兼容桥的关闭覆盖，不是版本不匹配；先恢复自动选择，再正常重启并核对实际运行状态。刷新网页或反复重启不会撤销配置覆盖。'
      : saved?.preparation.reason === 'compatibility-component-forced-enabled'
        ? saved.nativeInitialCwdSupported === true
          ? '当前运行时能力已支持，强制开启覆盖不会抹除当前能力，但已替换下次启动的自动选择保护。需要继续使用兼容桥时，仅撤销该强制开启覆盖以恢复自动选择；保存功能请求或刷新网页不会代替这一配置恢复。其他兼容性冲突仍可能存在。'
          : '此设置在 DSH 启动时读取；保存不改变当前进程。兼容桥的强制开启覆盖替换了自动选择保护，不是组件被禁用或版本不匹配；仅撤销该覆盖以恢复自动选择，再重新读取诊断。其他兼容性冲突仍可能存在；刷新网页或反复重启不会撤销配置覆盖。'
        : STARTUP_HINT),
    needsPreparation ? h('p', null, saved.state === 'disabled'
      ? '当前已关闭，不要求兼容验证。若以后启用此功能，请使用兼容的插件版本。'
      : saved.preparation.reason === 'compatibility-component-disabled'
        ? '内部依赖被配置禁用；撤销该组件的关闭覆盖以恢复自动选择，而不是强制开启或重新安装。普通原生子代理与已有会话不受此诊断操作影响。'
        : saved.preparation.reason === 'compatibility-component-forced-enabled'
          ? '内部兼容桥被强制开启，自动选择保护已被覆盖；仅撤销该组件的强制开启覆盖以恢复自动选择，不改其他配置，也不强制关闭。恢复后重新读取兼容诊断；普通原生子代理与已有会话不受此诊断操作影响。'
          : '此增强功能暂不可用，仍可使用普通原生子代理。请安装或更新兼容的插件版本并查看技术诊断；保存或反复重启不会自动解决兼容问题。') : null,
    saved?.state === 'pending-restart' && saved.preparation.status === 'ready' && saved.nativeInitialCwdSupported === false
      ? h('p', null, '插件实现已就绪，但当前运行时能力尚未启用；实现就绪不等于当前生效。已保存启用请求后，请正常重启 DSH 并重新核对。') : null,
    saved === null ? null : h('details', { style: { marginTop: '12px' } }, h('summary', null, '技术诊断（启动标识、版本与原始状态）'),
      h('p', null, '启动配置修订 ' + saved.revision + ' · 启动标识 ' + saved.boot.epoch),
      h('p', null, '宿主重启标记：' + (saved.restartNeeded ? '是（不代表兼容准备已完成）' : '否（不代表功能已生效）')),
      h('p', null, '启动状态：' + startupStateText(saved)),
      h('p', null, 'SDK 版本：' + (saved.preparation.sdkVersion ?? '未知（观测不可用）')),
      saved.preparation.diagnostic === null ? null : h('p', null, '原始准备诊断：' + saved.preparation.diagnostic), pretty(saved)),
    view.error === null || saved === null ? null : h('p', { role: 'alert' }, view.error),
    view.notice === null ? null : diagnostic(view.notice))
}
const FEATURE_LABELS = { binding: '工作树绑定', lifecycle: '子代理生命周期观测', windows: '任务与子代理参考窗口', ticketProgress: '任务票进度', pendingDecisions: '待裁决事项' } satisfies Record<typeof FEATURE_NAMES[number], string>
const DISPLAY_LABELS = { header: '会话标题栏', inputSummary: '输入区摘要', rightPanel: '右侧协作面板', sessionList: '会话列表提醒', timeline: '工具记录标注' } satisfies Record<typeof DISPLAY_NAMES[number], string>
const CAPACITY_LABELS = { ticketWindowSize: '任务票参考上限（T）', runningSubagentLimit: '运行中子代理参考上限（S）' }
const SOURCE_LABELS = { workspace: '工作区覆盖', global: '全局默认', 'safe-initial': '安全初始值' } satisfies Record<EffectivePolicy['sources'][PolicyField], string>
const POLICY_FIELD_LABELS: Readonly<Record<PolicyField | 'extensionEnabled', string>> = {
  extensionEnabled: '协作管理总闸（全局）', 'workspace.enabled': '本工作区总闸', 'skills.enabled': '本工作区技能分发', 'binding.enabled': FEATURE_LABELS.binding, 'lifecycle.enabled': FEATURE_LABELS.lifecycle,
  'windows.enabled': FEATURE_LABELS.windows, 'ticketProgress.enabled': FEATURE_LABELS.ticketProgress, 'pendingDecisions.enabled': FEATURE_LABELS.pendingDecisions,
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
export function SettingsPage(props: PluginConfigViewProps & { readonly remote: ControlsRemote; readonly refreshAll: () => void; readonly observe: (sessionId: string) => SessionObserver }): ReactElement {
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
  if (props.view === 'summary') return h('span', null, '子代理工作树启动设置、协作管理与会话仪器；配置分别保存。')
  const pageStyle = { display: 'grid', gap: '24px', minWidth: 0, width: '100%', maxWidth: '1080px', margin: '0 auto', lineHeight: 1.6, overflowWrap: 'anywhere' as const }
  if (saved === null || draft === null) return h('section', { 'aria-label': '插件配置', style: pageStyle }, h(StartupSettingsPanel, { remote: props.remote }),
    h('section', { 'aria-label': '工作区协作管理', style: settingsCard }, h('h3', null, '协作管理'), diagnostic(message ?? '读取已保存的协作配置…'), h('button', { type: 'button', onClick: () => setReload(value => value + 1) }, '重新读取协作配置')))
  const selected = workspaces.find(row => row.workspaceId === workspace)
  const sessionChoices = settingsSessionChoices(workspaces, workspace)
  const selectedInspection = inspection !== null && sessionChoices.ids.includes(inspection) ? inspection : null
  const preview = resolvePolicy({ ...draft, workspaceOverrides: workspace === null ? {} : draft.workspaceOverrides, revision: saved.revision }, workspace ?? 'global-preview', workspace === null || selected?.verified === true)
  const impact = policyDraftImpact(saved, draft, workspace, workspace === null || selected?.verified === true)
  const change = (field: PolicyField, value: boolean | number | undefined): void => {
    try { setDraft(setPolicyLeaf(draft, workspace, field, value)); setMessage(null) } catch (error) { setMessage('配置值无效：' + errorText(error)) }
  }
  const save = async (): Promise<void> => {
    setBusy(true); setMessage(null)
    try {
      const snapshot = await savePolicyDraft(props.remote, draft, saved.revision)
      setSaved(snapshot); setDraft(intentOf(snapshot)); props.refreshAll()
      setMessage('已保存并应用配置（修订 ' + snapshot.revision + '）；协作管理' + (snapshot.extensionEnabled ? '已启用' : '已关闭') + '，无需额外启用按钮。功能可用性仍以宿主能力与会话观测为准；上述工作树启动配置独立保存。' + (snapshot.extensionEnabled ? '' : '协作管理总闸（全局）仍为关闭，各工作区的「协作功能」「参考上限」都不会生效。'))
    } catch (error) { setMessage('保存结果未确认：' + errorText(error) + '。请重新读取协作配置核对，草稿未作为成功回执。') } finally { setBusy(false) }
  }
  const globalScope = workspace === null
  const inheritLabel = globalScope ? '未设置（用安全初始值）' : '继承全局'
  const scopeWord = globalScope ? '所有工作区默认' : '本工作区'
  const gatesOpen = draft.extensionEnabled && preview.workspaceEnabled
  const gateReason = (value: { readonly reason: string | null }): boolean => value.reason === 'extension-disabled' || value.reason === 'workspace-disabled'
  const badge = (text: string, tone: string): ReactElement => h('span', { style: { background: tone, color: '#fff', borderRadius: '999px', padding: '1px 10px', fontSize: '12px', lineHeight: '18px', whiteSpace: 'nowrap' as const } }, text)
  const booleanField = (field: PolicyField, label: string, effective: string, alert = false): ReactElement => {
    const explicit = ownLeaf(draft, workspace, field)
    return h('label', { key: field, style: { ...settingsField, justifyContent: 'space-between' } }, h('span', { style: { flex: '1 1 180px' } }, label),
      h('select', { 'aria-label': label, value: explicit === undefined ? 'inherit' : explicit ? 'on' : 'off', disabled: busy,
        onChange: (event: ChangeEvent<HTMLSelectElement>) => change(field, event.target.value === 'inherit' ? undefined : event.target.value === 'on') },
        h('option', { value: 'inherit' }, inheritLabel), h('option', { value: 'on' }, '启用'), h('option', { value: 'off' }, '禁用')),
      h('small', { style: { flexBasis: '100%' } }, alert ? badge('总闸未开', TONE.closed) : null, '草稿有效值：' + effective + ' · 来源：' + SOURCE_LABELS[preview.sources[field]]))
  }
  const gateField = (field: PolicyField, label: string, open: boolean, effectiveText: string): ReactElement => {
    const explicit = ownLeaf(draft, workspace, field)
    return h('div', { key: field, style: { display: 'flex', flexWrap: 'wrap' as const, alignItems: 'center', gap: '8px', margin: '10px 0', minWidth: 0 } },
      h('span', { style: { fontWeight: 600, minWidth: '9em' } }, label),
      h('select', { 'aria-label': label, value: explicit === undefined ? 'inherit' : explicit ? 'on' : 'off', disabled: busy,
        onChange: (event: ChangeEvent<HTMLSelectElement>) => change(field, event.target.value === 'inherit' ? undefined : event.target.value === 'on') },
        h('option', { value: 'inherit' }, inheritLabel), h('option', { value: 'on' }, '启用'), h('option', { value: 'off' }, '禁用')),
      badge(effectiveText, open ? TONE.open : TONE.closed),
      h('small', { style: { flexBasis: '100%' } }, '来源：' + SOURCE_LABELS[preview.sources[field]]))
  }
  const gatePanel = h('div', { style: { ...settingsCard, borderLeft: '4px solid ' + (gatesOpen ? TONE.open : TONE.closed), background: gatesOpen ? 'rgba(21,128,61,.10)' : 'rgba(180,83,9,.12)', marginBottom: '16px' } },
    h('div', { style: { display: 'flex', flexWrap: 'wrap' as const, alignItems: 'center', gap: '12px', marginBottom: '8px' } },
      h('label', { style: { display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '15px' } },
        h('input', { type: 'checkbox', 'aria-label': '协作管理总闸（全局）', checked: draft.extensionEnabled, disabled: busy, onChange: (event: ChangeEvent<HTMLInputElement>) => { setDraft({ ...draft, extensionEnabled: event.target.checked }); setMessage(null) } }),
        '协作管理总闸（全局）'),
      badge(draft.extensionEnabled ? '已开启' : '已关闭', draft.extensionEnabled ? TONE.open : TONE.closed),
      badge(preview.workspaceEnabled ? scopeWord + '总闸：已开' : scopeWord + '总闸：未开', preview.workspaceEnabled ? TONE.open : TONE.closed)),
    h('p', { style: { margin: '0 0 8px' } }, '两级总闸都打开后，当前范围的「协作功能」才生效；只开一级时下面会标出原因。总闸不影响技能分发，也不控制子代理工作树启动设置。'),
    h('label', { style: settingsField }, h('span', { style: { fontWeight: 600 } }, '配置编辑范围'),
      h('select', { 'aria-label': '配置编辑范围', value: workspace ?? '', disabled: busy, style: { maxWidth: '100%' }, onChange: (event: ChangeEvent<HTMLSelectElement>) => { setWorkspace(event.target.value || null); setInspection(null) } },
        ...workspaces.map(row => h('option', { key: row.workspaceId, value: row.workspaceId }, row.label + (row.verified ? '' : '（未核验）'))), h('option', { value: '' }, '全局默认'))),
    gateField('workspace.enabled', scopeWord + '总闸', preview.workspaceEnabled, preview.workspaceEnabled ? '已启用' : '未启用'),
    gateField('skills.enabled', scopeWord + '技能分发', preview.skillsEnabled, preview.skillsEnabled ? '启用' : '禁用'),
    h('p', { style: { margin: '6px 0 0' } }, globalScope
      ? '当前编辑的是「全局默认」：选「未设置（用安全初始值）」表示没有默认值，该叶子回落到安全初始值（本工作区总闸＝关闭，技能分发＝开启）。'
      : '选「继承全局」表示删除本工作区的覆盖，回落到上面的全局默认；参考上限留空同理。'))
  const gateRow = h('div', null,
    h('p', null, '生效需要两级总闸同时打开：「协作管理总闸（全局）」全局唯一、对所有工作区生效；每个工作区另有自己的总闸且默认关闭。'),
    !draft.extensionEnabled ? diagnostic('全局总闸当前为关闭：下面各范围的「协作功能」「参考上限」都不会生效，只有「界面显示位置」与技能分发不受影响。') : null)
  const featureField = (name: typeof FEATURE_NAMES[number]): ReactElement => booleanField((name + '.enabled') as PolicyField, FEATURE_LABELS[name], policyFeatureText(preview.features[name]), gateReason(preview.features[name]))
  const dirty = JSON.stringify(draft) !== JSON.stringify(intentOf(saved))
  const saveLabel = busy ? '正在保存…' : saved.extensionEnabled !== draft.extensionEnabled ? draft.extensionEnabled ? '保存并启用协作管理' : '保存并关闭协作管理' : '保存并应用配置'
  return h('section', { 'aria-label': '插件配置', style: pageStyle },
    h(StartupSettingsPanel, { remote: props.remote }),
    h('section', { 'aria-label': '工作区协作管理', style: settingsCard },
      h('h3', { style: { marginTop: 0 } }, '协作管理'),
      gatePanel,
      gateRow,
      h('div', { style: settingsGrid },
        h('fieldset', { disabled: busy, style: settingsCard }, h('legend', null, '协作功能'), h('p', null, '每个功能仍受两级总闸约束；这里只决定该功能在本范围是否被请求。'), FEATURE_NAMES.map(name => featureField(name))),
        h('fieldset', { disabled: busy, style: settingsCard }, h('legend', null, '参考上限'), h('p', null, 'T/S 仅提供规模参考，不是硬名额；留空继承，不猜测默认数值。'),
          (['ticketWindowSize', 'runningSubagentLimit'] as const).map(name => { const field = ('windows.' + name) as PolicyField; return h('label', { key: name, style: settingsField },
            h('span', null, CAPACITY_LABELS[name]), h('input', { 'aria-label': CAPACITY_LABELS[name], type: 'number', min: 1, step: 1, style: { width: '100px', maxWidth: '100%' }, value: ownLeaf(draft, workspace, field) ?? '',
              onChange: (event: ChangeEvent<HTMLInputElement>) => change(field, event.target.value === '' ? undefined : Number(event.target.value)) }),
            h('small', { style: { flexBasis: '100%' } }, '草稿有效值：' + (preview.windows[name] ?? '未配置') + ' · 来源：' + SOURCE_LABELS[preview.sources[field]])) })),
        h('fieldset', { disabled: busy, style: settingsCard }, h('legend', null, '界面显示位置'), h('p', null, '只控制入口显示；隐藏不关闭功能，不删除记录，也不免除现有义务。'), DISPLAY_NAMES.map(name => booleanField(('display.' + name) as PolicyField, DISPLAY_LABELS[name], preview.display[name] ? '显示' : '隐藏')))),
      !Object.values(preview.display).some(Boolean) ? diagnostic('全部入口关闭：待裁决不再有常驻页面提醒；仍可明确保存。') : null,
      h('section', { 'aria-label': '保存前预览', style: { marginTop: '20px' } },
        h('h4', null, '保存前预览'), h('p', null, '配置修订 ' + saved.revision + ' · ' + (dirty ? '有未保存更改' : '与已保存配置一致') + '。预览仅代表配置意图，不代表执行结果。'),
        impact.changes.length === 0 ? h('p', null, dirty ? '保存将更新稀疏覆盖；当前编辑范围的有效值未改变。' : '没有待保存的更改。') : h('ul', null, impact.changes.map(row => h('li', { key: row.field }, (POLICY_FIELD_LABELS[row.field as keyof typeof POLICY_FIELD_LABELS] ?? '未知配置项') + '：' + policyImpactText(row.before) + ' → ' + policyImpactText(row.after)))),
        h('p', null, '缩小参考上限不会释放正在执行的子代理；已有事实和义务保留，实际执行状态以会话观测为准。'),
        h('div', { style: settingsActions }, h('button', { type: 'button', disabled: busy || !dirty, onClick: () => { void save() } }, saveLabel),
          h('button', { type: 'button', disabled: busy || !dirty, onClick: () => { setDraft(intentOf(saved)); setMessage(null) } }, '放弃未保存更改'),
          h('button', { type: 'button', disabled: busy, onClick: () => setReload(value => value + 1) }, '重新读取协作配置（丢弃草稿）')),
        message === null ? null : diagnostic(message)),
      h('details', { style: { marginTop: '16px' } }, h('summary', null, '技术详情（原始有效策略与变更）'), pretty(preview), pretty(impact)),
      unsupportedSeatsDetails()),
    h('section', { 'aria-label': '会话状态查看', style: settingsCard },
      h('h3', { style: { marginTop: 0 } }, '会话状态查看'), h('p', null, '仅查看已存在会话，不修改草稿、不授予权限、不唤醒模型，也不自动打开侧栏。'),
      h('label', { style: settingsField }, '选择会话', h('select', { 'aria-label': '选择查看会话', value: selectedInspection ?? '', style: { maxWidth: '100%' }, onChange: (event: ChangeEvent<HTMLSelectElement>) => setInspection(event.target.value || null) },
        h('option', { value: '' }, '选择会话查看'), ...sessionChoices.ids.map(id => h('option', { key: id, value: id }, id)))),
      sessionChoices.unknown ? diagnostic('会话导航未知或不完整；不能据此断言没有会话。') : sessionChoices.ids.length === 0 ? h('p', null, '当前导航没有列出的会话（不是实例或权限结论）。') : null,
      selectedInspection === null ? null : h(SettingsInspection, { key: selectedInspection, sessionId: selectedInspection, observer: props.observe(selectedInspection), remote: props.remote })))
}

/** Read only public call material; never serialize the lazy argument reader's internals. */
export function sourceRecord(props: ToolCallViewProps): unknown {
  if (props.phase === 'preparing') return { phase: props.phase, callId: props.callId, name: props.toolName, time: props.block.time, note: 'Arguments are still preparing and may be incomplete.' }
  if (props.phase === 'start') return { phase: props.phase, callId: props.callId, name: props.toolName, time: props.block.time, argsRaw: props.block.argsRaw }
  return { phase: props.phase, callId: props.callId, name: props.toolName, time: props.block.time, seq: props.block.seq, argsRaw: props.block.call?.argsRaw ?? null, content: props.block.content, isError: props.block.isError, error: props.block.error ?? null, meta: props.block.meta ?? null }
}
/** Only our own wire Tool names may claim a toolview; never another plugin's key. */
export function SourceCard(props: ToolCallViewProps & SessionFace): ReactElement {
  const observation = useObservation(props.observer)
  const annotate = observation.status === 'ready' && observation.value.policy.display.timeline
  return h('section', { 'aria-label': '协作工具记录', style: { boxSizing: 'border-box', width: '100%', maxWidth: '100%', minWidth: 0, padding: '12px', overflowWrap: 'anywhere', textAlign: 'left' } }, h('strong', null, props.toolName),
    annotate ? diagnostic('来源记录 · call ' + props.callId + ' · 历史快照；当前事实以实例账本为准。') : null,
    pretty(sourceRecord(props)), annotate && observation.value.policy.display.rightPanel ? h('button', { type: 'button', onClick: props.openDetails }, '打开当前实例') : null)
}

export const inject = ['slots', 'remote', 'sidebarRight', 'sidebarRightTabs']
/** Browser plugin activation, governed by Host Loader/package manifest, not DOM insertion. */
export async function apply(ctx: Context): Promise<void> {
  await ctx.remote.$mount(REMOTE_CONTRIBUTION)
  // $mount creates the namespace. Requiring it on the bootstrap itself would
  // prevent apply from running; all consumers instead belong to this child scope.
  await ctx.inject(['remote.mattpocockControls'], (ctx) => {
    const remote = (ctx.remote as typeof ctx.remote & { readonly mattpocockControls: ControlsRemote }).mattpocockControls
    const observers = new Map<string, SessionObserver>()
    const observe = (sessionId: string): SessionObserver => {
      let observer = observers.get(sessionId)
      if (observer === undefined) { observer = new SessionObserver(sessionId, (id, signal) => remote.readSession(id, signal)); observers.set(sessionId, observer) }
      return observer
    }
    const visibility = new PolicyObserver(() => remote.readPolicy())
    ctx.effect(() => { void visibility.refresh(); return () => visibility.dispose() }, 'collaboration: committed policy visibility')
    const refreshAll = (): void => { void visibility.refresh(); for (const observer of observers.values()) void observer.refresh() }
    ctx.effect(() => () => { for (const observer of observers.values()) observer.dispose(); observers.clear() }, 'collaboration: observations')
    const face = (sessionId: string): SessionFace => ({ observer: observe(sessionId), openDetails: () => {
      if (ctx.sidebarRight.mounted.getSnapshot() !== sessionId) return
      const snapshot = observe(sessionId).getSnapshot()
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
    ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({ name: 'conversation.input.dock',
      id: TAB_ID + ':input', order: 100, inject: face }, InputSummary))
    ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID,
      inject: (sessionId) => ({ ...face(sessionId), remote }) }, Details))
    ctx.slots.inject('sidebar.session.row.leading', () => ctx.slots.register({ name: 'sidebar.session.row.leading',
      id: TAB_ID + ':row', order: 100, inject: () => ({ observe, visibility }) }, WorkspaceBadge))
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
