import { array, boolean, freeze, id, invalid, record, revision } from './validation.js'
import type { SupervisionSettings } from './supervision-config.js'
import type { SupervisionLedgerSummary } from './supervision-ledger.js'

export const SUPERVISION_TRIGGERS = ['scheduled', 'suspicion'] as const
export const SUPERVISION_VERDICTS = ['on-track', 'suspicion', 'uncertain'] as const
export const SUPERVISION_SEVERITIES = ['info', 'concern', 'alert'] as const
export type SupervisionTrigger = typeof SUPERVISION_TRIGGERS[number]
export type SupervisionVerdict = typeof SUPERVISION_VERDICTS[number]
export type SupervisionSeverity = typeof SUPERVISION_SEVERITIES[number]
export type SupervisionDelivery = 'none' | 'card' | 'card+agent'

export interface SupervisionReview {
  readonly verdict: SupervisionVerdict
  readonly severity: SupervisionSeverity
  readonly observed: string
  readonly possibleIssue: string
  readonly confidence: number
}
export interface SupervisionEvidence {
  readonly events: number
  readonly productWrites: number
  readonly supportWrites: number
  readonly productFiles: readonly string[]
  readonly supportFiles: readonly string[]
  readonly noProductHours: number | null
  readonly rootsConfigured: boolean
}
export interface SupervisionEpisode {
  readonly episodeId: string
  readonly ownerSessionId: string
  /** Assigned ticket visible to this check, or null when attribution is unavailable. */
  readonly ticketId: string | null
  /** The check ran for a ticket whose program-suspicion mode is off (research/review marker). */
  readonly research: boolean
  readonly at: number
  readonly trigger: SupervisionTrigger
  readonly verdict: SupervisionVerdict
  readonly severity: SupervisionSeverity
  readonly observed: string
  readonly possibleIssue: string
  readonly confidence: number
  readonly delivery: SupervisionDelivery
  readonly evidence: SupervisionEvidence
}
export interface SupervisionDocument {
  readonly schemaVersion: 1
  readonly revision: number
  readonly ownerSessionId: string
  readonly workspaceId: string
  readonly createdAt: number
  readonly lastScheduledAt: number
  readonly lastSuspicionAt: number | null
  readonly consecutiveOnTrack: number
  readonly backoffUntil: number | null
  readonly hourKey: string
  readonly hourCalls: number
  readonly dailyKey: string
  readonly dailyCalls: number
  readonly dailyTokens: number
  readonly episodes: readonly SupervisionEpisode[]
}

const MAX_EPISODES = 2000
const hour = 60 * 60 * 1000
function dayKey(at: number): string { return new Date(at).toISOString().slice(0, 10) }
function hourKey(at: number): string { return new Date(at).toISOString().slice(0, 13) }
function integer(value: unknown, where: string, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) invalid(where + ' must be an integer between ' + minimum + ' and ' + maximum)
  return value
}
function text(value: unknown, where: string, maximum = 2048): string {
  if (typeof value !== 'string' || value.length > maximum || value.includes('\u0000')) invalid(where + ' must be bounded text')
  return value
}
function parseEvidence(value: unknown): SupervisionEvidence {
  const raw = record(value, 'supervision evidence', ['events', 'productWrites', 'supportWrites', 'productFiles', 'supportFiles', 'noProductHours', 'rootsConfigured'])
  const files = (key: 'productFiles' | 'supportFiles'): readonly string[] => {
    const rows = array(raw[key], 'supervision ' + key).map((row, index) => text(row, 'supervision ' + key + '[' + index + ']', 512))
    if (rows.length > 100 || new Set(rows).size !== rows.length) invalid('supervision ' + key + ' must be bounded unique paths')
    return freeze(rows)
  }
  return freeze({
    events: integer(raw.events, 'supervision events', 0, 1_000_000),
    productWrites: integer(raw.productWrites, 'supervision productWrites', 0, 1_000_000),
    supportWrites: integer(raw.supportWrites, 'supervision supportWrites', 0, 1_000_000),
    productFiles: files('productFiles'), supportFiles: files('supportFiles'),
    noProductHours: raw.noProductHours === null ? null : (() => { const n = raw.noProductHours; if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 100000) invalid('supervision noProductHours must be null or a non-negative number'); return n })(),
    rootsConfigured: boolean(raw.rootsConfigured, 'supervision rootsConfigured'),
  })
}
function parseEpisode(value: unknown): SupervisionEpisode {
  const raw = record(value, 'supervision episode', ['episodeId', 'ownerSessionId', 'ticketId', 'research', 'at', 'trigger', 'verdict', 'severity', 'observed', 'possibleIssue', 'confidence', 'delivery', 'evidence'])
  if (!SUPERVISION_TRIGGERS.includes(raw.trigger as SupervisionTrigger)) invalid('supervision trigger is invalid')
  if (!SUPERVISION_VERDICTS.includes(raw.verdict as SupervisionVerdict)) invalid('supervision verdict is invalid')
  if (!SUPERVISION_SEVERITIES.includes(raw.severity as SupervisionSeverity)) invalid('supervision severity is invalid')
  if (!['none', 'card', 'card+agent'].includes(raw.delivery as SupervisionDelivery)) invalid('supervision delivery is invalid')
  return freeze({
    episodeId: id(raw.episodeId, 'supervision episodeId'), ownerSessionId: id(raw.ownerSessionId, 'supervision ownerSessionId'),
    ticketId: raw.ticketId === undefined || raw.ticketId === null ? null : id(raw.ticketId, 'supervision ticketId'),
    research: raw.research === undefined ? false : boolean(raw.research, 'supervision research'), at: revision(raw.at, 'supervision at'),
    trigger: raw.trigger as SupervisionTrigger, verdict: raw.verdict as SupervisionVerdict, severity: raw.severity as SupervisionSeverity,
    observed: text(raw.observed, 'supervision observed', 4096), possibleIssue: text(raw.possibleIssue, 'supervision possibleIssue', 2048),
    confidence: (() => { const n = raw.confidence; if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1) invalid('supervision confidence must be 0..1'); return n })(),
    delivery: raw.delivery as SupervisionDelivery, evidence: parseEvidence(raw.evidence),
  })
}

export function initialSupervisionDocument(ownerSessionId: string, workspaceId: string, now: number): SupervisionDocument {
  return freeze({ schemaVersion: 1, revision: 0, ownerSessionId: id(ownerSessionId, 'ownerSessionId'), workspaceId: id(workspaceId, 'workspaceId'),
    createdAt: now, lastScheduledAt: now, lastSuspicionAt: null, consecutiveOnTrack: 0, backoffUntil: null,
    hourKey: hourKey(now), hourCalls: 0, dailyKey: dayKey(now), dailyCalls: 0, dailyTokens: 0, episodes: [] })
}
export function parseSupervisionDocument(value: unknown): SupervisionDocument {
  const raw = record(value, 'supervision document', ['schemaVersion', 'revision', 'ownerSessionId', 'workspaceId', 'createdAt', 'lastScheduledAt', 'lastSuspicionAt', 'consecutiveOnTrack', 'backoffUntil', 'hourKey', 'hourCalls', 'dailyKey', 'dailyCalls', 'dailyTokens', 'episodes'])
  if (raw.schemaVersion !== 1) invalid('unsupported supervision schemaVersion')
  const episodes = array(raw.episodes, 'supervision episodes').map(parseEpisode)
  if (episodes.length > MAX_EPISODES) invalid('supervision episode budget exceeded')
  return freeze({
    schemaVersion: 1, revision: revision(raw.revision, 'supervision revision'), ownerSessionId: id(raw.ownerSessionId, 'ownerSessionId'),
    workspaceId: id(raw.workspaceId, 'workspaceId'), createdAt: revision(raw.createdAt, 'supervision createdAt'),
    lastScheduledAt: revision(raw.lastScheduledAt, 'supervision lastScheduledAt'),
    lastSuspicionAt: raw.lastSuspicionAt === null ? null : revision(raw.lastSuspicionAt, 'supervision lastSuspicionAt'),
    consecutiveOnTrack: integer(raw.consecutiveOnTrack, 'supervision consecutiveOnTrack', 0, 100000),
    backoffUntil: raw.backoffUntil === null ? null : revision(raw.backoffUntil, 'supervision backoffUntil'),
    hourKey: text(raw.hourKey, 'supervision hourKey', 13), hourCalls: integer(raw.hourCalls, 'supervision hourCalls', 0, 100000),
    dailyKey: text(raw.dailyKey, 'supervision dailyKey', 10), dailyCalls: integer(raw.dailyCalls, 'supervision dailyCalls', 0, 100000),
    dailyTokens: integer(raw.dailyTokens, 'supervision dailyTokens', 0, 100_000_000),
    episodes: freeze(episodes),
  })
}

export function decideSupervisionTrigger(document: SupervisionDocument, settings: SupervisionSettings, summary: SupervisionLedgerSummary, now: number, ticketSuspicionMode?: 'auto' | 'off'): SupervisionTrigger | null {
  if (document.backoffUntil !== null && now < document.backoffUntil) return null
  const currentHourCalls = document.hourKey === hourKey(now) ? document.hourCalls : 0
  const currentDailyCalls = document.dailyKey === dayKey(now) ? document.dailyCalls : 0
  const currentDailyTokens = document.dailyKey === dayKey(now) ? document.dailyTokens : 0
  const budgetAllows = currentHourCalls < settings.scheduledMaxPerHour && currentDailyCalls < settings.scheduledMaxPerDay && currentDailyTokens < settings.scheduledDailyTokenBudget
  if (!budgetAllows) return null
  const supportSurge = settings.suspicionMode === 'auto' && ticketSuspicionMode !== 'off' && summary.supportOnly && (summary.noProductHours ?? 0) >= settings.delivery.alertMinNoProductHours && summary.supportFiles.length >= settings.delivery.alertMinSupportFiles
  const suspicionDue = supportSurge && (document.lastSuspicionAt === null || now - document.lastSuspicionAt >= settings.cooldownMinutes * 60 * 1000)
  if (suspicionDue) return 'suspicion'
  const scheduledDue = summary.events > 0 && now - document.lastScheduledAt >= settings.scheduledIntervalMinutes * 60 * 1000
  if (scheduledDue) return 'scheduled'
  return null
}

export function deterministicReview(trigger: SupervisionTrigger, summary: SupervisionLedgerSummary): SupervisionReview {
  const observed = summary.productWrites + ' product write(s), ' + summary.supportWrites + ' support write(s), ' + summary.supportFiles.length + ' support file(s)' +
    (summary.noProductHours === null ? '; no product write observed.' : '; ' + summary.noProductHours + 'h since the last product write.')
  if (trigger === 'suspicion') return freeze({ verdict: 'suspicion', severity: 'alert', observed,
    possibleIssue: '当前正在进行的工作可能偏离原票的交付方向，也可能只是必要的准备。', confidence: 0.55 })
  if (summary.supportOnly) return freeze({ verdict: 'uncertain', severity: 'concern', observed,
    possibleIssue: '当前正在进行的工作可能偏向支撑材料，尚未看到产品交付写入，也可能仍在准备。', confidence: 0.35 })
  return freeze({ verdict: 'on-track', severity: 'info', observed, possibleIssue: '当前观察未形成明确问题；仍需结合票面交付判断。', confidence: 0.2 })
}

export function makeSupervisionEpisode(input: { readonly document: SupervisionDocument; readonly trigger: SupervisionTrigger; readonly review: SupervisionReview; readonly summary: SupervisionLedgerSummary; readonly now: number; readonly delivery: SupervisionDelivery; readonly ticketId?: string | null; readonly research?: boolean }): SupervisionEpisode {
  const evidence: SupervisionEvidence = freeze({ events: input.summary.events, productWrites: input.summary.productWrites,
    supportWrites: input.summary.supportWrites, productFiles: input.summary.productFiles, supportFiles: input.summary.supportFiles,
    noProductHours: input.summary.noProductHours, rootsConfigured: input.summary.rootsConfigured })
  return freeze({ episodeId: input.document.ownerSessionId + ':' + input.now + ':' + input.trigger + ':' + input.document.episodes.length,
    ownerSessionId: input.document.ownerSessionId, ticketId: input.ticketId ?? null, research: input.research === true, at: input.now, trigger: input.trigger, verdict: input.review.verdict, severity: input.review.severity,
    observed: input.review.observed, possibleIssue: input.review.possibleIssue, confidence: input.review.confidence,
    delivery: input.delivery, evidence })
}

export function withSupervisionEpisode(document: SupervisionDocument, episode: SupervisionEpisode, settings: SupervisionSettings, now: number, tokens = 0): SupervisionDocument {
  const cutoff = now - settings.episodeRetentionDays * 24 * hour
  const episodes = [...document.episodes.filter(row => row.at >= cutoff), episode].slice(-Math.min(settings.episodeMaxEntries, MAX_EPISODES))
  const nextHour = document.hourKey === hourKey(now) ? document.hourCalls : 0
  const nextDaily = document.dailyKey === dayKey(now) ? document.dailyCalls : 0
  const nextTokens = document.dailyKey === dayKey(now) ? document.dailyTokens : 0
  const onTrack = episode.verdict === 'on-track'
  const consecutive = onTrack ? Math.min(document.consecutiveOnTrack + 1, 100) : 0
  return freeze({
    ...document, revision: document.revision + 1, lastScheduledAt: episode.trigger === 'scheduled' ? now : document.lastScheduledAt,
    lastSuspicionAt: episode.trigger === 'suspicion' ? now : document.lastSuspicionAt, consecutiveOnTrack: consecutive,
    backoffUntil: onTrack ? now + Math.min(settings.cooldownMinutes * settings.backoffFactor, 24 * 60) * 60 * 1000 : null,
    hourKey: hourKey(now), hourCalls: nextHour + 1, dailyKey: dayKey(now), dailyCalls: nextDaily + 1,
    dailyTokens: nextTokens + Math.max(0, Math.floor(tokens)), episodes: freeze(episodes),
  })
}

export function supervisionAgentText(episode: SupervisionEpisode): string {
  return '[监督提示 · 轻量模型，仅供参考]\n\n观察：' + episode.observed + '\n\n可能的问题：' + episode.possibleIssue +
    '\n\n建议：无需中断当前 subagents 的工作；插入一个临时检查任务（subagents），确认当前正在进行的工作是否仍在对应票的交付方向上，再决定是否调整如何调整。'
}
