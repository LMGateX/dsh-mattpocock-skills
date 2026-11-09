import { createElement as h, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactElement, ChangeEvent } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { DecisionRecord } from './controls/instrument-state.js'
import type { InstrumentDecisionTime } from './controls/instruments.js'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ClientSessionSnapshot, SessionObservation, RecommendationPolicySource, RecommendationPolicyPort } from './client.js'
import { RECOMMENDATION_REMOTE_CONTRIBUTION, parseOwnerDecisionPolicySnapshot, parseOwnerDecisionPolicySaveResult, parseDecisionPolicySelection } from './controls/recommendation-contract.js'
import type { OwnerDecisionPolicySnapshot, OwnerDecisionPolicySaveRequest, OwnerDecisionPolicySaveResult } from './controls/recommendation-contract.js'

/** Mounting registers a client codec, NOT proof that the server implements a method. */
export function installRecommendationPolicy(ctx: Context): RecommendationPolicySource {
  let current: RecommendationPolicyPort | null = null
  const listeners = new Set<() => void>()
  const publish = (value: RecommendationPolicyPort | null): void => { current = value; for (const listener of listeners) listener() }
  const source: RecommendationPolicySource = { subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } }, getSnapshot: () => current }
  ctx.effect(() => {
    let alive = true, unmount: (() => unknown) | undefined
    void Promise.resolve().then(() => ctx.remote.$mount(RECOMMENDATION_REMOTE_CONTRIBUTION)).then(async dispose => {
      if (!alive) { if (typeof dispose === 'function') await dispose(); return }
      if (typeof dispose === 'function') unmount = dispose
      await ctx.inject(['remote.mattpocockRecommendationSupport'], scoped => {
        scoped.effect(() => {
          const remote = (scoped.remote as typeof scoped.remote & { readonly mattpocockRecommendationSupport: RecommendationPolicyPort }).mattpocockRecommendationSupport
          const port: RecommendationPolicyPort = {
            isCurrent: () => alive && current === port,
            readOwnerDecisionPolicy: (id, signal) => { if (!port.isCurrent()) return Promise.reject(new Error('策略服务已撤回')); return remote.readOwnerDecisionPolicy(id, signal) },
            saveOwnerDecisionPolicy: (id, request) => { if (!port.isCurrent()) return Promise.reject(new Error('策略服务已撤回')); return remote.saveOwnerDecisionPolicy(id, request) },
          }
          publish(port)
          return () => { if (current === port) publish(null) }
        }, 'collaboration: optional recommendation namespace')
      })
    }).catch(() => { /* optional scope remains unavailable; base registration stays active */ })
    return () => { alive = false; publish(null); if (unmount) void Promise.resolve(unmount()).catch(() => {}) }
  }, 'collaboration: optional recommendation mount')
  return source
}
const unavailable: RecommendationPolicySource = { subscribe: () => () => {}, getSnapshot: () => null }
const secondary = 'var(--dsw-alias-label-secondary, #61666b)'
const box = { minWidth: 0, overflowWrap: 'anywhere' as const, textAlign: 'left' as const, padding: '10px 0', borderBottom: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.2))' }
function status(text: string): ReactElement { return h('p', { role: 'status' }, text) }
function serverTime(value: number | null): ReactElement {
  if (value === null) return h('span', null, '无固定到期')
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? h('time', { dateTime: date.toISOString() }, date.toISOString() + '（UTC）') : h('span', null, '时间不可表示 · server epoch ms ' + value)
}
export function policyAuthority(view: ClientSessionSnapshot): string {
  const i = view.instance, c = view.caller
  return JSON.stringify([view.sessionId, i.instrumentInstanceId, i.ownerSessionId, i.controlWorkspaceId, c.kind, c.principalId, c.sessionId, view.policyGrants.revision, view.records?.scope, view.windows?.scope])
}
function policySourceIdentity(view: ClientSessionSnapshot): string {
  const hint = view.ownerDecisionPolicy
  return JSON.stringify([hint?.revision, hint?.status, hint?.epochId, hint?.expiresAt, hint?.reason, view.policy.features.pendingDecisions?.status])
}
function sameInstance(a: OwnerDecisionPolicySnapshot['instance'], b: OwnerDecisionPolicySnapshot['instance']): boolean {
  return a.instrumentInstanceId === b.instrumentInstanceId && a.ownerSessionId === b.ownerSessionId && a.controlWorkspaceId === b.controlWorkspaceId
}
function failure(error: unknown): string {
  const code = error !== null && typeof error === 'object' && 'code' in error ? error.code : null
  return code === 'gateway/invocation-unavailable' || code === 'gateway/service-unavailable' || code === 'gateway/method-unavailable'
    ? '不支持或服务不可用（' + String(code) + '）' : '状态未知：' + (error instanceof Error ? error.message : String(error))
}
interface PanelProps { readonly view: ClientSessionSnapshot; readonly observer: SessionObservation; readonly source?: RecommendationPolicySource | undefined; readonly display?: 'inputSummary' | 'rightPanel' }
/** Key only by true authority changes. Healthy projection refreshes cannot rewrite a CAS draft. */
export function OwnerDecisionPolicyPanel(props: PanelProps): ReactElement {
  return h(PolicyControl, { ...props, key: policyAuthority(props.view) })
}
function PolicyControl(props: PanelProps): ReactElement {
  const source = props.source ?? unavailable
  const port = useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot)
  const authority = policyAuthority(props.view)
  const policySource = policySourceIdentity(props.view)
  const [snapshot, setSnapshot] = useState<OwnerDecisionPolicySnapshot | null>(null)
  const [duration, setDuration] = useState(8)
  const [reading, setReading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<OwnerDecisionPolicySaveResult | null>(null)
  const [reload, setReload] = useState(0)
  const lifetime = useRef(0), saving = useRef<number | null>(null)
  const base = useRef<OwnerDecisionPolicySnapshot | null>(null), basePort = useRef(port)
  const current = (): boolean => {
    const latest = props.observer.getSnapshot()
    return port !== null && port.isCurrent() && source.getSnapshot() === port && props.observer.sessionId === props.view.sessionId && latest.status === 'ready' && policyAuthority(latest.value) === authority && policySourceIdentity(latest.value) === policySource
      && (props.display === undefined || latest.value.policy.display[props.display] && props.observer.getDisplay()?.[props.display] !== false)
  }
  useEffect(() => {
    const generation = ++lifetime.current, abort = new AbortController()
    saving.current = null; setBusy(false)
    if (basePort.current !== port) { base.current = null; basePort.current = port; setDuration(8) }
    setSnapshot(null); setReading(true); setMessage(null); setReceipt(null)
    if (port !== null && props.view.caller.kind === 'user') void Promise.resolve().then(() => port.readOwnerDecisionPolicy(props.view.sessionId, abort.signal)).then(result => {
      if (!result.ok) throw result.error
      const value = parseOwnerDecisionPolicySnapshot(result.value)
      if (!sameInstance(value.instance, props.view.instance)) throw new Error('策略与当前实例不一致')
      if (!abort.signal.aborted && generation === lifetime.current && current()) { if (base.current === null) base.current = value; setSnapshot(value); setReading(false) }
    }).catch(error => { if (!abort.signal.aborted && generation === lifetime.current && current()) { setReading(false); setMessage(failure(error)) } })
    return () => { abort.abort(); ++lifetime.current }
  }, [port, props.observer, authority, policySource, reload])
  const save = async (action: 'enable' | 'disable'): Promise<void> => {
    if (snapshot === null || base.current === null || basePort.current !== port || !current() || saving.current !== null || props.view.caller.kind !== 'user') return
    const latest = props.observer.getSnapshot()
    if (action === 'enable' && (latest.status !== 'ready' || latest.value.policy.features.pendingDecisions?.status !== 'configured')) return
    const generation = lifetime.current
    const request: OwnerDecisionPolicySaveRequest = { operationId: 'owner-policy:' + crypto.randomUUID(), expectedRevision: base.current!.revision, expectedScope: base.current!.instance, ...(action === 'enable' ? { action, durationMs: duration * 3600000 } : { action }) }
    saving.current = generation; setBusy(true); setMessage(null)
    try {
      const result = await port!.saveOwnerDecisionPolicy(props.view.sessionId, request)
      if (!result.ok) throw result.error
      const value = parseOwnerDecisionPolicySaveResult(result.value)
      if (!sameInstance(value.snapshot.instance, props.view.instance)) throw new Error('保存回执与当前实例不一致')
      if (generation === lifetime.current && current()) { base.current = value.snapshot; setSnapshot(value.snapshot); setReceipt(value); setMessage('已保存历史操作；当前有效状态以服务端快照为准。') }
    } catch (error) {
      if (generation === lifetime.current && current()) { setSnapshot(null); setMessage('保存未确认 · ' + failure(error) + ' · 操作 ' + request.operationId + '；不会自动重试或续期，请重新读取核对。') }
    } finally { if (saving.current === generation) saving.current = null; if (generation === lifetime.current && current()) setBusy(false) }
  }
  const body = props.view.caller.kind !== 'user' ? status('仅真实 operator 用户可配置；agent 不能自行开启或延长。')
    : port === null ? status('当前推荐支持控制不可用或不支持；不是已确认关闭。')
    : snapshot === null || basePort.current !== port ? status(message ?? (reading ? '正在读取服务端策略…' : '策略状态未知；不是关闭。'))
    : h('div', null,
      status('已保存：' + (snapshot.saved.enabled ? '开启意图' : '关闭') + ' · 策略修订 ' + snapshot.revision + '；服务端当前有效状态：' + ({ active: '生效', disabled: '关闭', expired: '已到期', 'feature-disabled': '功能关闭，策略未生效', unknown: '未知' }[snapshot.effective.status])),
      status('草稿依据策略修订 ' + base.current?.revision + '；后台事实刷新不会升级保存 CAS。'),
      snapshot.effective.reason === null ? null : status('原因：' + snapshot.effective.reason),
      h('p', null, '范围：主会话 ' + snapshot.instance.ownerSessionId + ' / 实例 ' + snapshot.instance.instrumentInstanceId + ' 与当前受权后代；仅开启后新建事项，不扫描旧 backlog，不复制到独立会话或 fork。'),
      snapshot.saved.epoch === null ? null : h('p', null, '服务端固定到期：', serverTime(snapshot.saved.epoch.expiresAt), ' · epoch ' + snapshot.saved.epoch.epochId + ' · 授权者 user / ' + snapshot.saved.epoch.authorizedBy.principalId),
      h('label', null, '新期限 ', h('select', { 'aria-label': '预授权时长', value: String(duration), disabled: busy, onChange: (event: ChangeEvent<HTMLSelectElement>) => setDuration(Number(event.target.value)) }, ...[1, 4, 8].map(hours => h('option', { key: hours, value: String(hours) }, hours + ' 小时')))),
      snapshot.effective.status === 'unknown' ? status('有效状态未知；请重新读取后配置。') : h(Button, { type: 'button', role: 'switch', 'aria-label': '推荐支持预授权（已保存意图，不代表当前生效）', 'aria-checked': snapshot.saved.enabled, disabled: busy || !snapshot.saved.enabled && props.view.policy.features.pendingDecisions?.status !== 'configured', onClick: () => { void save(snapshot.saved.enabled ? 'disable' : 'enable') } }, busy ? '保存中…' : snapshot.saved.enabled ? '关闭推荐支持预授权' : '显式开启限时推荐支持'),
      receipt === null ? null : h('p', { role: 'status' }, '历史保存结果：' + receipt.operation.action + ' · appliedRevision ' + receipt.appliedRevision + (receipt.replayed ? ' · 重放（不续期）' : '') + ' · 历史epoch ' + (receipt.operation.epochId ?? '无') + ' · 原到期：', serverTime(receipt.operation.expiresAt), '；当前 snapshot 修订 ' + receipt.snapshot.revision),
      message === null ? null : status(message))
  return h('section', { 'aria-label': '推荐支持预授权', style: box }, h('h4', null, '推荐支持预授权'), body,
    h('p', { style: { color: secondary, fontSize: '12px' } }, '默认 8 小时但必须显式开启，刷新不续期。仅对范围内新建且推荐精确对应唯一选项 key 的待用户项提供支持；agent 仍须显式记录采用同一事项后继续，不是用户逐项人工答复。界面不代替 agent 采用，不新增执行或发布权限。关闭/到期阻止尚未采用候选的新采用，不撤回已执行副作用。'),
    port === null || props.view.caller.kind !== 'user' ? null : h(Button, { type: 'button', disabled: busy, onClick: () => { base.current = null; setDuration(8); setReload(value => value + 1) } }, '重新读取预授权策略（丢弃草稿）'))
}

/** Render only durable current-version selection metadata. Never manufacture a user reply or adopt. */
export function DecisionRecommendationProvenance(props: { readonly row: DecisionRecord & InstrumentDecisionTime }): ReactElement | null {
  if (props.row.policySelection === undefined) {
    const support = props.row.recommendationSupport
    if (support?.status === 'adopted') return status('持久采用来源未知：临时结果不能代替当前版本的 policySelection，不冒充用户答复。')
    if (support?.status !== 'candidate') return null
    const candidate = support.candidate, row = props.row
    if (candidate === undefined || candidate === null || typeof candidate !== 'object') return status('推荐支持候选未知：未返回完整候选，不当作支持或采用。')
    if (row.value.pending !== true || row.value.addressee?.kind !== 'user' || candidate.decisionRevision !== row.revision
      || typeof candidate.optionKey !== 'string' || row.value.recommendation !== candidate.optionKey || row.value.options?.filter(option => option.key === candidate.optionKey).length !== 1
      || typeof candidate.policyEpochId !== 'string' || !candidate.policyEpochId.trim() || !Number.isSafeInteger(candidate.policyRevision) || candidate.policyRevision < 1 || !Number.isSafeInteger(candidate.expiresAt) || candidate.expiresAt < 0) return status('推荐支持候选未知：当前事项或来源已变化，请重新读取。')
    return h('section', { 'aria-label': '推荐支持候选', style: box }, h('strong', null, '支持候选（尚未采用）'),
      h('p', null, '精确 key：' + candidate.optionKey + ' · 源事项修订 ' + candidate.decisionRevision + ' · policyRef / epoch ' + candidate.policyEpochId + ' · 策略修订 ' + candidate.policyRevision),
      h('p', null, '服务端候选固定截止：', serverTime(candidate.expiresAt), '；采用时仍须重验。界面不自动采用，也不修改 pending/await。'))
  }
  try {
    const selection = parseDecisionPolicySelection(props.row.policySelection)
    const source = props.row.history?.find(change => change.revision === props.row.revision)
    const author = source?.author
    return h('section', { 'aria-label': '预授权采用来源', style: box },
      h('strong', null, '按预授权策略选择'),
      h('p', null, '精确选项 key：' + selection.selectedOptionKey + ' · 源事项修订 ' + selection.decisionSourceRevision + ' · 策略修订 ' + selection.policy.policyRevision),
      h('p', null, 'policyRef / epoch：' + selection.policy.epochId + ' · 授权者 user / ' + selection.policy.authorizedBy.principalId),
      h('p', null, author?.kind === 'agent' ? '真实采用作者：agent / ' + author.principalId + ' / Session ' + author.sessionId : '真实采用作者未知；当前版本未提供受权 agent 来源。'),
      h('p', null, '这是 agent 依据预授权作出的持久选择，不是用户逐项答复，不代表任务已落实；原 awaiting、答复和任务约束不自动清除。'))
  } catch { return status('预授权采用来源未知：元数据不完整或不合法，不冒充用户答复。') }
}
