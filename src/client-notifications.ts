import { createElement as h, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { ChangeEvent, ReactElement } from 'react'
import { Button, Checkbox, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ClientSessionSnapshot, SessionObservation } from './client.js'
import type { DecisionValue } from './controls/instrument-state.js'

/** Browser-only private module. No imports of Host/runtime and no work at module load. */
export const NOTIFICATION_PREFS_KEY = '@lmgatex/mattpocock:browser-notifications:v1'
export const NOTIFICATION_LEDGER_KEY = '@lmgatex/mattpocock:notification-attempts:v1'
const LOCK_NAME = '@lmgatex/mattpocock:notification-claim:v1'
export const NOTIFICATION_LEDGER_LIMIT = 256
const LEDGER_TTL = 24 * 60 * 60 * 1000
export interface BrowserNotificationPreferences {
  readonly sound: boolean
  readonly soundSeconds: number
  readonly volume: number
  readonly toast: boolean
  readonly toastSeconds: number
  readonly desktop: boolean
}
export const DEFAULT_BROWSER_NOTIFICATION_PREFERENCES: BrowserNotificationPreferences = Object.freeze({ sound: false, soundSeconds: 5, volume: 50, toast: true, toastSeconds: 8, desktop: false })
function integer(value: unknown, min: number, max: number): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max }
export function parseBrowserNotificationPreferences(raw: unknown): BrowserNotificationPreferences {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('提醒设置格式无效')
  const p = raw as Record<string, unknown>
  if (Object.keys(p).length !== 6 || typeof p.sound !== 'boolean' || typeof p.toast !== 'boolean' || typeof p.desktop !== 'boolean' || !integer(p.soundSeconds, 1, 60) || !integer(p.volume, 0, 100) || !integer(p.toastSeconds, 0, 60)) throw new Error('声长须为 1–60 秒，音量 0–100，页面通知时长 0–60 秒（整数）')
  return Object.freeze({ sound: p.sound, soundSeconds: p.soundSeconds, volume: p.volume, toast: p.toast, toastSeconds: p.toastSeconds, desktop: p.desktop })
}
const pendingUser = (value: DecisionValue): boolean => value.pending === true && value.addressee?.kind === 'user'
const rowKey = (row: { workflowId: string; decisionId: string }): string => JSON.stringify([row.workflowId, row.decisionId])
const notificationIdentity = (view: ClientSessionSnapshot): string => JSON.stringify([view.caller.kind, view.caller.principalId, view.caller.sessionId, view.instance.instrumentInstanceId, view.instance.ownerSessionId, view.instance.controlWorkspaceId])
/** Actual authenticated caller/instance only; neither policy display nor business text is identity. */
export function notificationScope(view: ClientSessionSnapshot): string | null {
  const r = view.records, i = view.instance, c = view.caller
  if (!r || !Array.isArray(r.decisions) || !Array.isArray(r.changes) || !r.scope || (r.scope.kind !== 'coordinator' && (r.scope.kind !== 'assigned' || !Array.isArray(r.scope.ticketIds))) || !view.policyGrants || !integer(view.policyGrants.revision, 0, Number.MAX_SAFE_INTEGER)) return null
  if (!i || !r.instance || !c || (c.kind === 'user' ? c.sessionId !== null : c.kind !== 'agent' || c.sessionId !== view.sessionId) || !c.principalId || !i.instrumentInstanceId || !i.ownerSessionId || !i.controlWorkspaceId || r.instance.instrumentInstanceId !== i.instrumentInstanceId || r.instance.ownerSessionId !== i.ownerSessionId || r.instance.controlWorkspaceId !== i.controlWorkspaceId || !integer(r.revision, 0, Number.MAX_SAFE_INTEGER)) return null
  return JSON.stringify([view.sessionId, c.kind, c.principalId, c.sessionId, i.instrumentInstanceId, i.ownerSessionId, i.controlWorkspaceId,
    r.scope.kind === 'coordinator' ? ['coordinator'] : ['assigned', r.scope.workflowId, [...r.scope.ticketIds].sort()],
    view.policyGrants.revision])
}
export interface DecisionNotificationEpisode {
  readonly id: string
  readonly scope: string
  readonly workflowId: string
  readonly decisionId: string
  readonly entryRevision: number
  readonly pendingCount: number
}
interface RowBaseline { readonly pending: boolean; readonly version: number; readonly entry: number | null }
export interface DecisionEpisodeUpdate { readonly episodes: readonly DecisionNotificationEpisode[]; readonly pendingCount: number | null; readonly diagnostic: string }
/** Fold from the last confirmed source DOCUMENT revision, never businessRevision or current row revision.
 * Unknown does not become an empty set. Rebaseline when continuity cannot be established. */
export class DecisionEpisodeTracker {
  private scope: string | null = null
  private revision = 0
  private rows = new Map<string, RowBaseline>()
  private current = false
  isCurrent(episode: DecisionNotificationEpisode): boolean { const row = this.rows.get(rowKey(episode)); return this.current && episode.scope === this.scope && row?.pending === true && row.entry === episode.entryRevision }
  update(view: ClientSessionSnapshot | null): DecisionEpisodeUpdate {
    const scope = view && notificationScope(view), r = view?.records
    if (!scope || !r || !r.decisions.every(row => row && typeof row.workflowId === 'string' && typeof row.decisionId === 'string' && row.value && integer(row.revision, 0, r.revision) && Array.isArray(row.history) && row.history.every(change => change && change.value && integer(change.revision, 0, row.revision))) || new Set(r.decisions.map(rowKey)).size !== r.decisions.length) { this.current = false; return { episodes: [], pendingCount: null, diagnostic: '读取或授权未知；未当作零项，暂停提醒' } }
    const pendingCount = r.decisions.filter(row => pendingUser(row.value)).length
    const baseline = (diagnostic: string): DecisionEpisodeUpdate => {
      this.scope = scope; this.revision = r.revision; this.current = true
      this.rows = new Map(r.decisions.map(row => [rowKey(row), { pending: pendingUser(row.value), version: row.revision, entry: null }]))
      return { episodes: [], pendingCount, diagnostic }
    }
    if (this.scope !== scope) return baseline(this.scope === null ? '初见积压 ' + pendingCount + ' 项；仅建立基线，不逐条补响' : 'Session、实例或授权范围已变化；重新建立基线，不补响旧事项')
    if (r.revision < this.revision) return baseline('源修订回退；连续性未知，重新建立基线')
    if (r.historyCoverage?.purged && r.historyCoverage.checkpointRevision > this.revision) return baseline('历史已清理且 checkpoint 跨过观察基线；无法证明阶段连续，重新建立基线')
    // Assigned snapshots filter EVERY historical version by authorization. A gap in the
    // document event sequence could hide an unauthorized transition, not just an idle tick.
    if (r.scope.kind === 'assigned' && r.revision > this.revision) {
      const revisions = new Set(r.changes.filter(e => e.revision > this.revision).map(e => e.revision))
      if (revisions.size !== r.revision - this.revision) return baseline('授权历史可能缺版本；无法证明连续，重新建立基线')
    }
    const episodes: DecisionNotificationEpisode[] = [], next = new Map<string, RowBaseline>()
    let incomplete = false
    for (const row of r.decisions) {
      const key = rowKey(row), old = this.rows.get(key), changes = row.history.filter(change => change.revision > this.revision).sort((a, b) => a.revision - b.revision)
      // A newly visible assigned row is NOT proof of creation; its first true may
      // be a ticket-scope update to a previously unauthorized pending decision.
      let pending: boolean | null = old?.pending ?? (r.scope.kind === 'coordinator' && !row.history.some(change => change.revision <= this.revision) ? false : null)
      let entry = old?.entry ?? null
      const anchor = row.history.find(change => change.revision === old?.version)
      const valid = row.revision <= this.revision ? !!old && old.version === row.revision :
        changes.length > 0 && changes[changes.length - 1]!.revision === row.revision && (!old || !!anchor && pendingUser(anchor.value) === old.pending || !!r.historyCoverage && r.historyCoverage.checkpointRevision <= this.revision)
      if (!valid) { incomplete = true; next.set(key, { pending: pendingUser(row.value), version: row.revision, entry: null }); continue }
      for (const change of changes) { const p = pendingUser(change.value); if (pending === null && p) incomplete = true; if (p && pending === false) entry = change.revision; if (!p) entry = null; pending = p }
      if (pending !== pendingUser(row.value)) { incomplete = true; entry = null }
      next.set(key, { pending: pendingUser(row.value), version: row.revision, entry })
      if (pendingUser(row.value) && entry !== null && entry > this.revision) episodes.push({ id: JSON.stringify([notificationIdentity(view!), row.workflowId, row.decisionId, entry]), scope, workflowId: row.workflowId, decisionId: row.decisionId, entryRevision: entry, pendingCount })
    }
    this.rows = next; this.revision = r.revision; this.current = true
    return { episodes, pendingCount, diagnostic: incomplete ? '部分事项历史不足；仅对可证明的新阶段提醒，其余重新建立基线' : '仅覆盖已挂载会话；当前授权历史已核验，后台可能节流' }
  }
}

/** All browser effects are injectable; tests must pass fake ports. Timer handles are opaque. */
export interface NotificationSound { state(): string; start(seconds: number, volume: number): Promise<void>; stop(): void }
export interface NotificationCapabilities { readonly secure: boolean; readonly audio: boolean; readonly desktop: 'unsupported' | NotificationPermission; readonly hidden: boolean }
export interface BrowserNotificationPorts {
  readonly storage?: Pick<Storage, 'getItem' | 'setItem'>
  readonly withLock?: (name: string, operation: () => Promise<boolean>) => Promise<boolean>
  readonly onStorage?: (listener: () => void) => () => void
  readonly capabilities: () => NotificationCapabilities
  readonly createSound?: () => NotificationSound
  readonly requestDesktopPermission?: () => Promise<NotificationPermission>
  readonly showDesktop?: (title: string, body: string, onClick: () => void) => { close(): void }
  readonly now: () => number
  readonly later: (callback: () => void, milliseconds: number) => unknown
  readonly cancel: (handle: unknown) => void
}
/** Called lazily on mounting, not during module evaluation. No permission prompts here. */
export function createBrowserNotificationPorts(): BrowserNotificationPorts {
  const w = typeof window === 'undefined' ? undefined : window
  let storage: BrowserNotificationPorts['storage']
  try { storage = w?.localStorage } catch { /* denied storage is diagnosed below */ }
  const notification = w?.Notification, audio = w?.AudioContext
  const locks = w?.navigator.locks
  return {
    ...(storage ? { storage } : {}),
    ...(locks ? { withLock: async (name: string, operation: () => Promise<boolean>) => await locks.request(name, operation) } : {}),
    ...(w ? { onStorage: (listener: () => void) => { const handler = (event: StorageEvent) => { if (event.key === NOTIFICATION_PREFS_KEY || event.key === null) listener() }; w.addEventListener('storage', handler); return () => w.removeEventListener('storage', handler) } } : {}),
    capabilities: () => ({ secure: w?.isSecureContext === true, audio: !!audio, desktop: notification ? notification.permission : 'unsupported', hidden: w?.document.visibilityState === 'hidden' }),
    ...(audio ? { createSound: () => {
      const context = new audio(), oscillator = context.createOscillator(), gain = context.createGain()
      let stopped = false
      oscillator.type = 'sine'; oscillator.frequency.value = 660; oscillator.connect(gain); gain.connect(context.destination)
      return { state: () => context.state,
        start: async (seconds: number, volume: number) => { gain.gain.value = volume / 100 * 0.12; oscillator.start(); oscillator.stop(context.currentTime + seconds); if (context.state === 'suspended') await context.resume() },
        stop: () => { if (stopped) return; stopped = true; try { oscillator.stop() } catch { /* already ended */ } oscillator.disconnect(); gain.disconnect(); void context.close().catch(() => {}) },
      }
    } } : {}),
    ...(notification ? { requestDesktopPermission: () => notification.requestPermission(), showDesktop: (title: string, body: string, onClick: () => void) => { const notice = new notification(title, { body }); notice.onclick = onClick; return { close: () => { notice.onclick = null; notice.close() } } } } : {}),
    now: () => Date.now(), later: (callback, ms) => setTimeout(callback, ms), cancel: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
  }
}
interface CenterState { readonly preferences: BrowserNotificationPreferences; readonly storage: string; readonly delivery: string; readonly coordination: string; readonly capabilities: NotificationCapabilities }
interface Attempt { readonly id: string; readonly at: number }
/** Shared preferences/BOUNDED attempt ledger only. It owns no Session observers or polling. */
export class BrowserNotificationCenter {
  private state: CenterState
  private readonly listeners = new Set<() => void>()
  private stopStorage: (() => void) | undefined
  private memory: Attempt[] = []
  private readonly soundStops = new Set<() => void>()
  registerSoundStop(stop: () => void): () => void { this.soundStops.add(stop); return () => { this.soundStops.delete(stop) } }
  stopAllSounds(): void { for (const stop of this.soundStops) stop(); this.report('已停止本浏览器当前铃声；未改变业务或已读状态') }
  constructor(readonly ports: BrowserNotificationPorts) {
    this.state = { preferences: DEFAULT_BROWSER_NOTIFICATION_PREFERENCES, storage: '仅本浏览器同源/Profile；不跨设备同步', delivery: '开关不是送达证明', coordination: ports.withLock && ports.storage ? 'Web Locks + 有界本地去重；仅协调尝试，不承诺送达 exactly-once' : '跨标签 best-effort：缺少 Web Locks 或持久存储，可能重复', capabilities: ports.capabilities() }
    this.load()
  }
  getSnapshot = (): CenterState => this.state
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    if (this.listeners.size === 1) this.stopStorage = this.ports.onStorage?.(() => this.load())
    return () => { this.listeners.delete(listener); if (!this.listeners.size) { this.stopStorage?.(); this.stopStorage = undefined } }
  }
  private patch(patch: Partial<CenterState>): void { this.state = { ...this.state, ...patch }; for (const listener of this.listeners) listener() }
  report(delivery: string): void { this.patch({ delivery, capabilities: this.ports.capabilities() }) }
  private load(): void {
    try {
      if (!this.ports.storage) throw new Error('不可用')
      const raw = this.ports.storage.getItem(NOTIFICATION_PREFS_KEY)
      this.patch({ preferences: raw === null ? DEFAULT_BROWSER_NOTIFICATION_PREFERENCES : parseBrowserNotificationPreferences(JSON.parse(raw)), storage: '设置仅保存在本浏览器同源/Profile；不跨设备同步' })
    } catch { this.patch({ preferences: DEFAULT_BROWSER_NOTIFICATION_PREFERENCES, storage: '存储损坏或不可用；使用非持久安全初值，尚未保存' }) }
  }
  save(raw: unknown): boolean {
    const preferences = parseBrowserNotificationPreferences(raw)
    try { if (!this.ports.storage) throw new Error('不可用'); this.ports.storage.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(preferences)); this.patch({ preferences, storage: '已保存到本浏览器同源/Profile（不跨设备同步）' }); return true }
    catch { this.patch({ preferences, storage: '保存失败；当前设置仅内存生效，刷新可能丢失', coordination: '持久存储不可用；跨标签 best-effort，可能重复' }); return false }
  }
  /** Call ONLY in the explicit permission button handler; mount/save/delivery never call it. */
  async requestDesktopPermission(): Promise<void> {
    if (!this.ports.capabilities().secure || !this.ports.requestDesktopPermission) { this.report('桌面通知不可用：需安全环境与浏览器支持'); return }
    try { const permission = await this.ports.requestDesktopPermission(); this.report('桌面通知权限：' + permission + '；权限不代表已送达') }
    catch { this.report('桌面通知权限请求失败或被拒绝') }
  }
  async claim(id: string, current: () => boolean): Promise<boolean> {
    const operation = async (): Promise<boolean> => {
      if (!current()) return false
      const now = this.ports.now(), fresh = (rows: Attempt[]): Attempt[] => rows.filter(row => row.at <= now && now - row.at < LEDGER_TTL).slice(-NOTIFICATION_LEDGER_LIMIT)
      this.memory = fresh(this.memory)
      let persisted: Attempt[] = []
      try {
        if (!this.ports.storage) throw new Error('storage unavailable')
        const raw = this.ports.storage.getItem(NOTIFICATION_LEDGER_KEY)
        if (raw !== null) {
          const parsed: unknown = JSON.parse(raw)
          if (!Array.isArray(parsed) || parsed.length > NOTIFICATION_LEDGER_LIMIT || !parsed.every(row => row && typeof row.id === 'string' && row.id.length <= 4096 && integer(row.at, 0, Number.MAX_SAFE_INTEGER))) throw new Error('invalid attempt ledger')
          persisted = fresh(parsed as Attempt[])
        }
      } catch { this.patch({ coordination: '去重存储损坏或不可用；仅内存 best-effort，跨标签可能重复' }) }
      if (this.memory.some(row => row.id === id) || persisted.some(row => row.id === id)) return false
      const entry = { id, at: now }; this.memory = [...this.memory, entry].slice(-NOTIFICATION_LEDGER_LIMIT)
      try {
        if (!this.ports.storage || id.length > 4096) throw new Error('storage unavailable')
        this.ports.storage.setItem(NOTIFICATION_LEDGER_KEY, JSON.stringify([...persisted, entry].slice(-NOTIFICATION_LEDGER_LIMIT)))
      } catch { this.patch({ coordination: '去重保存失败；仅内存 best-effort，跨标签可能重复' }) }
      return true
    }
    if (this.ports.withLock) {
      try { return await this.ports.withLock(LOCK_NAME, operation) }
      catch { this.patch({ coordination: 'Web Locks 失败；退化为 best-effort，跨标签可能重复' }) }
    }
    return operation()
  }
}
let browserCenter: BrowserNotificationCenter | undefined
function defaultCenter(): BrowserNotificationCenter { return browserCenter ??= new BrowserNotificationCenter(createBrowserNotificationPorts()) }

/** One mounted owner of transient audio/OS notices. Nothing writes business/read/hidden state. */
export class MountedNotificationDelivery {
  private sound: NotificationSound | undefined
  private soundTimer: unknown
  private readonly desktops = new Map<{ close(): void }, () => boolean>()
  private soundCurrent: (() => boolean) | undefined
  private disposed = false
  constructor(readonly center: BrowserNotificationCenter) {}
  private releaseSoundStop: (() => void) | undefined
  isActive(): boolean { return !this.disposed }
  mount(): void { this.disposed = false; this.releaseSoundStop ??= this.center.registerSoundStop(this.stopSound) }
  reconcile(): void {
    if (this.soundCurrent && !this.soundCurrent()) this.stopSound()
    for (const [notice, current] of this.desktops) if (!current()) { notice.close(); this.desktops.delete(notice) }
  }
  applyPreferences(): void { const p = this.center.getSnapshot().preferences; if (!p.sound) this.stopSound(); if (!p.desktop) this.closeDesktops() }
  stopSound = (): void => { if (this.soundTimer !== undefined) this.center.ports.cancel(this.soundTimer); this.soundTimer = undefined; this.sound?.stop(); this.sound = undefined; this.soundCurrent = undefined }
  private closeDesktops(): void { for (const notice of this.desktops.keys()) notice.close(); this.desktops.clear() }
  clear(): void { this.stopSound(); this.closeDesktops() }
  preview(preferences = this.center.getSnapshot().preferences): void {
    this.stopSound()
    if (this.disposed) return
    this.releaseSoundStop ??= this.center.registerSoundStop(this.stopSound)
    const ports = this.center.ports
    if (!ports.createSound) { this.center.report('声音不可用：浏览器不支持 AudioContext'); return }
    try {
      const sound = ports.createSound(); this.sound = sound
      this.soundTimer = ports.later(() => this.stopSound(), preferences.soundSeconds * 1000)
      const playing = sound.start(preferences.soundSeconds, preferences.volume)
      this.center.report(sound.state() === 'running' ? '声音已启动；浏览器/OS 静音仍可能阻止听见' : '声音被挂起或自动播放受限；请显式试听，后台也可能节流')
      void playing.then(() => { if (this.sound === sound && !this.disposed) this.center.report(sound.state() === 'running' ? '声音已启动；不代表用户已听见' : '声音仍被挂起或不可用') }, () => { if (this.sound === sound) { this.stopSound(); this.center.report('声音启动失败或自动播放被拒绝') } })
    } catch { this.stopSound(); this.center.report('声音启动失败或浏览器拒绝') }
  }
  async deliver(episode: DecisionNotificationEpisode, current: () => boolean, onOpen: () => void): Promise<boolean> {
    const valid = (): boolean => !this.disposed && current()
    const p = this.center.getSnapshot().preferences
    if (!valid() || !p.sound && !p.toast && !p.desktop || !await this.center.claim(episode.id, valid) || !valid()) return false
    const preferences = this.center.getSnapshot().preferences
    if (preferences.sound) { this.preview(preferences); this.soundCurrent = valid }
    if (preferences.desktop) {
      const ports = this.center.ports, capabilities = ports.capabilities()
      if (!capabilities.secure || capabilities.desktop !== 'granted' || !ports.showDesktop) this.center.report('桌面通知未发送：需显式授权、安全环境与浏览器支持')
      else try {
        const notice = ports.showDesktop('DSH 待你裁决', '检测时授权会话有 ' + episode.pendingCount + ' 项待用户裁决。请回到页面查看。', () => { if (valid()) onOpen() })
        this.desktops.set(notice, valid)
        // Bound browser handles even when the OS retains the visible notification longer.
        if (this.desktops.size > 8) { const first = this.desktops.keys().next().value!; first.close(); this.desktops.delete(first) }
        this.center.report('已尝试桌面通知；实际呈现/时长由浏览器和 OS 控制')
      } catch { this.center.report('桌面通知构造失败；未确认送达') }
    }
    return preferences.toast
  }
  dispose(): void { if (this.disposed) return; this.disposed = true; this.releaseSoundStop?.(); this.releaseSoundStop = undefined; this.clear() }
}

export function BrowserNotificationPreferencesPanel(props: { readonly center?: BrowserNotificationCenter } = {}): ReactElement {
  const center = useMemo(() => props.center ?? defaultCenter(), [props.center])
  const saved = useSyncExternalStore(center.subscribe, center.getSnapshot, center.getSnapshot)
  const [draft, setDraft] = useState(saved.preferences)
  const [message, setMessage] = useState('个人提醒独立保存，不修改服务器策略或 notifyOwner')
  const preview = useMemo(() => new MountedNotificationDelivery(center), [center])
  useEffect(() => { preview.mount(); return () => preview.dispose() }, [preview])
  const number = (key: 'soundSeconds' | 'volume' | 'toastSeconds', label: string, min: number, max: number): ReactElement => h('label', null, label,
    h(Input, { 'aria-label': label, type: 'number', min, max, step: 1, value: Number.isNaN(draft[key]) ? '' : draft[key], onChange: (event: ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, [key]: event.target.value === '' ? NaN : Number(event.target.value) }) }))
  const caps = saved.capabilities
  return h('section', { 'aria-label': '本浏览器提醒', style: { minWidth: 0 } },
    h('h3', null, '本浏览器提醒'),
    h('p', null, '仅当前同源浏览器/Profile 保存，不承诺账号隔离、跨设备同步。只覆盖宿主仍挂载的会话（包括保留挂载的后台标签）；未打开、取消挂载或关闭网页不覆盖。与所有显示位置开关无关。'),
    h(Checkbox, { label: '声音通知', checked: draft.sound, onChange: sound => setDraft({ ...draft, sound }) }),
    number('soundSeconds', '铃声持续秒数', 1, 60),
    h('span', null, ...[3, 5, 10, 30].map(soundSeconds => h(Button, { key: soundSeconds, type: 'button', size: 'sm', onClick: () => setDraft({ ...draft, soundSeconds }) }, soundSeconds + ' 秒'))),
    number('volume', '音量百分比', 0, 100),
    h(Button, { type: 'button', onClick: () => { try { preview.preview(parseBrowserNotificationPreferences(draft)) } catch (error) { setMessage(String(error)) } } }, '试听'),
    h(Button, { type: 'button', onClick: () => center.stopAllSounds() }, '停止当前铃声'),
    h(Checkbox, { label: '页面内通知', checked: draft.toast, onChange: toast => setDraft({ ...draft, toast }) }),
    number('toastSeconds', '页面通知关闭秒数（0 为手动）', 0, 60),
    h(Checkbox, { label: '桌面通知', checked: draft.desktop, onChange: desktop => setDraft({ ...draft, desktop }) }),
    h(Button, { type: 'button', onClick: () => { void center.requestDesktopPermission() } }, '请求桌面通知权限'),
    h('p', null, '桌面通知只发送泛化标题与数量，不含裁决正文；时长由浏览器/OS 控制。无 Service Worker，不承诺关闭浏览器后送达。'),
    h(Button, { type: 'button', onClick: () => { try { const persisted = center.save(draft); setMessage(persisted ? '本浏览器提醒已独立保存' : '保存失败；仅本页内存生效') } catch (error) { setMessage(String(error)) } } }, '保存本浏览器提醒'),
    h(Button, { type: 'button', onClick: () => { setDraft(saved.preferences); setMessage('已恢复当前本浏览器设置') } }, '恢复当前提醒设置'),
    h('p', { role: 'status' }, message), h('p', { role: 'status' }, saved.storage),
    h('details', null, h('summary', null, '提醒能力与限制'),
      h(Button, { type: 'button', onClick: () => center.report(saved.delivery) }, '重新检查提醒能力'),
      h('p', null, '上次检查：安全环境：' + caps.secure + '；AudioContext：' + caps.audio + '；桌面权限：' + caps.desktop + '；后台：' + caps.hidden + '（隐藏页面/OS 可能节流）'),
      h('p', null, saved.delivery), h('p', null, saved.coordination), h('p', null, '有界去重保存最近 256 个尝试身份，最长 24 小时，不存业务正文；过期、清存储、崩溃或能力降级都不承诺 exactly-once。')))
}

/** Mount in an independent strict Session utility seat; never under display-policy gates. */
export function DecisionNotifications(props: { readonly sessionId: string; readonly observer: SessionObservation; readonly onOpenDecision: (workflowId: string, decisionId: string) => void; readonly center?: BrowserNotificationCenter }): ReactElement {
  // A keyed child makes a Session/observer replacement a hard lifetime boundary.
  return h(MountedDecisionNotifications, { ...props, key: props.sessionId })
}
function MountedDecisionNotifications(props: { readonly sessionId: string; readonly observer: SessionObservation; readonly onOpenDecision: (workflowId: string, decisionId: string) => void; readonly center?: BrowserNotificationCenter }): ReactElement {
  const center = useMemo(() => props.center ?? defaultCenter(), [props.center])
  const observation = useSyncExternalStore(props.observer.subscribe, props.observer.getSnapshot, props.observer.getSnapshot)
  const settings = useSyncExternalStore(center.subscribe, center.getSnapshot, center.getSnapshot)
  const tracker = useMemo(() => new DecisionEpisodeTracker(), [props.observer, props.sessionId])
  const delivery = useMemo(() => new MountedNotificationDelivery(center), [center, props.observer, props.sessionId])
  const timers = useMemo(() => new Map<string, { readonly episode: DecisionNotificationEpisode; readonly handle: unknown }>(), [delivery])
  const [toasts, setToasts] = useState<readonly DecisionNotificationEpisode[]>([])
  const [diagnostic, setDiagnostic] = useState('读取中；提醒仅覆盖已挂载会话')
  useEffect(() => props.observer.retain(), [props.observer])
  useEffect(() => { delivery.mount(); return () => { delivery.dispose(); for (const timer of timers.values()) center.ports.cancel(timer.handle); timers.clear() } }, [delivery, timers, center])
  useEffect(() => { delivery.applyPreferences() }, [delivery, settings.preferences])
  const ready = observation.status === 'ready' && props.observer.sessionId === props.sessionId && observation.value.sessionId === props.sessionId ? observation.value : null
  const scope = ready && notificationScope(ready)
  const current = (episode: DecisionNotificationEpisode): boolean => {
    const latest = props.observer.getSnapshot()
    return latest.status === 'ready' && latest.value.sessionId === props.sessionId && notificationScope(latest.value) === episode.scope && tracker.isCurrent(episode) && latest.value.records?.decisions.some(row => row && row.value && rowKey(row) === rowKey(episode) && pendingUser(row.value)) === true
  }
  const dismiss = (id: string): void => { const timer = timers.get(id); if (timer !== undefined) center.ports.cancel(timer.handle); timers.delete(id); setToasts(rows => rows.filter(row => row.id !== id)) }
  useEffect(() => {
    const update = tracker.update(ready); setDiagnostic(update.diagnostic)
    // Reading failure/revocation and scope changes stop all old transient effects.
    delivery.reconcile()
    setToasts(rows => rows.filter(current))
    for (const [id, timer] of timers) { if (!current(timer.episode)) { center.ports.cancel(timer.handle); timers.delete(id) } }
    for (const episode of update.episodes) void delivery.deliver(episode, () => current(episode), () => props.onOpenDecision(episode.workflowId, episode.decisionId)).then(show => {
      if (!show || !delivery.isActive() || !current(episode)) return
      setToasts(rows => [...rows.filter(row => row.id !== episode.id), episode].slice(-3))
      const seconds = center.getSnapshot().preferences.toastSeconds
      if (seconds > 0) {
        timers.set(episode.id, { episode, handle: center.ports.later(() => dismiss(episode.id), seconds * 1000) })
        while (timers.size > 3) { const oldest = timers.keys().next().value!; center.ports.cancel(timers.get(oldest)!.handle); timers.delete(oldest) }
      }
    })
  }, [observation, props.observer, tracker, delivery])
  useEffect(() => { if (!settings.preferences.toast) { setToasts([]); for (const timer of timers.values()) center.ports.cancel(timer.handle); timers.clear() } }, [settings.preferences.toast, center, timers])
  return h('div', { 'aria-label': '待用户裁决提醒', style: { minWidth: 0 } },
    h('details', null, h('summary', null, '提醒状态'), h('p', { role: 'status' }, diagnostic), h('p', null, settings.delivery), h('p', null, settings.coordination)),
    scope && settings.preferences.toast ? toasts.filter(row => row.scope === scope && current(row)).map(episode => h('div', { key: episode.id, role: 'status', 'aria-label': '新待用户裁决', style: { overflowWrap: 'anywhere', maxWidth: '28rem' } },
      h('span', null, '新待你裁决事项（检测时 ' + episode.pendingCount + ' 项）'),
      h(Button, { type: 'button', onClick: () => { if (current(episode)) props.onOpenDecision(episode.workflowId, episode.decisionId) } }, '打开裁决详情'),
      h(Button, { type: 'button', onClick: () => dismiss(episode.id) }, '关闭提醒'),
      h(Button, { type: 'button', onClick: delivery.stopSound }, '停止铃声'))) : null)
}
