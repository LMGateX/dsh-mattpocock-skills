import { boolean, boundedArray, freeze, id, invalid, record, revision } from './validation.js'

export const SUPERVISION_SCHEMA_VERSION = 1 as const
export const SUPERVISION_START_MODES = ['ticket-held', 'first-support-surge'] as const
export const SUPERVISION_ROUTE_MODES = ['inherit', 'explicit'] as const
export const SUPERVISION_DELIVERY_MODES = ['card', 'card+agent-check'] as const
export const SUPERVISION_SUSPICION_MODES = ['auto', 'off'] as const

export type SupervisionStartMode = typeof SUPERVISION_START_MODES[number]
export type SupervisionRouteMode = typeof SUPERVISION_ROUTE_MODES[number]
export type SupervisionDeliveryMode = typeof SUPERVISION_DELIVERY_MODES[number]
export type SupervisionSuspicionMode = typeof SUPERVISION_SUSPICION_MODES[number]

export interface SupervisionReviewerPatch {
  readonly routeMode?: SupervisionRouteMode
  readonly provider?: string
  readonly model?: string
  readonly reasoningEffort?: string
  readonly maxTokens?: number
  readonly timeoutMs?: number
  readonly toolRounds?: number
}
export interface SupervisionDeliveryPatch {
  readonly concern?: SupervisionDeliveryMode
  readonly alert?: SupervisionDeliveryMode
  readonly alertMinNoProductHours?: number
  readonly alertMinSupportFiles?: number
}
export interface SupervisionConfigPatch {
  readonly enabled?: boolean
  readonly scheduledIntervalMinutes?: number
  readonly scheduledMaxPerHour?: number
  readonly scheduledMaxPerDay?: number
  readonly scheduledDailyTokenBudget?: number
  readonly rollingSummaryHours?: number
  readonly scheduledSummaryTopLanes?: number
  readonly suspicionStartMode?: SupervisionStartMode
  readonly suspicionMode?: SupervisionSuspicionMode
  readonly checkIntervalMinutes?: number
  readonly noProgressChecks?: number
  readonly fastWindowMinutes?: number
  readonly supportWriteThreshold?: number
  readonly supportReadBackThreshold?: number
  readonly cooldownMinutes?: number
  readonly maxAuditsPer6h?: number
  readonly backoffFactor?: number
  readonly lazyCheck?: boolean
  readonly dryRun?: boolean
  readonly episodeRetentionDays?: number
  readonly episodeMaxEntries?: number
  readonly reviewer?: SupervisionReviewerPatch
  readonly delivery?: SupervisionDeliveryPatch
  readonly softBudgetHours?: number | null
  readonly deliverableRoots?: readonly string[]
  readonly supportRoots?: readonly string[]
  readonly excludeGlobs?: readonly string[]
}
export interface SupervisionReviewerSettings {
  readonly routeMode: SupervisionRouteMode
  readonly provider: string
  readonly model: string
  readonly reasoningEffort: string
  readonly maxTokens: number
  readonly timeoutMs: number
  readonly toolRounds: number
}
export interface SupervisionDeliverySettings {
  readonly concern: SupervisionDeliveryMode
  readonly alert: SupervisionDeliveryMode
  readonly alertMinNoProductHours: number
  readonly alertMinSupportFiles: number
}
export interface SupervisionSettings {
  readonly enabled: boolean
  readonly scheduledIntervalMinutes: number
  readonly scheduledMaxPerHour: number
  readonly scheduledMaxPerDay: number
  readonly scheduledDailyTokenBudget: number
  readonly rollingSummaryHours: number
  readonly scheduledSummaryTopLanes: number
  readonly suspicionStartMode: SupervisionStartMode
  readonly suspicionMode: SupervisionSuspicionMode
  readonly checkIntervalMinutes: number
  readonly noProgressChecks: number
  readonly fastWindowMinutes: number
  readonly supportWriteThreshold: number
  readonly supportReadBackThreshold: number
  readonly cooldownMinutes: number
  readonly maxAuditsPer6h: number
  readonly backoffFactor: number
  readonly lazyCheck: boolean
  readonly dryRun: boolean
  readonly episodeRetentionDays: number
  readonly episodeMaxEntries: number
  readonly reviewer: SupervisionReviewerSettings
  readonly delivery: SupervisionDeliverySettings
  readonly softBudgetHours: number | null
  readonly deliverableRoots: readonly string[]
  readonly supportRoots: readonly string[]
  readonly excludeGlobs: readonly string[]
}
export interface SupervisionConfigIntent {
  readonly defaults: SupervisionConfigPatch
  readonly workspaceOverrides: Readonly<Record<string, SupervisionConfigPatch>>
}
export interface SupervisionConfigSnapshot extends SupervisionConfigIntent {
  readonly schemaVersion: 1
  readonly revision: number
}

export const SUPERVISION_DEFAULTS: SupervisionSettings = freeze({
  enabled: false,
  scheduledIntervalMinutes: 60,
  scheduledMaxPerHour: 1,
  scheduledMaxPerDay: 24,
  scheduledDailyTokenBudget: 120000,
  rollingSummaryHours: 24,
  scheduledSummaryTopLanes: 4,
  suspicionStartMode: 'first-support-surge',
  suspicionMode: 'auto',
  checkIntervalMinutes: 20,
  noProgressChecks: 3,
  fastWindowMinutes: 90,
  supportWriteThreshold: 5,
  supportReadBackThreshold: 0.5,
  cooldownMinutes: 90,
  maxAuditsPer6h: 2,
  backoffFactor: 2,
  lazyCheck: true,
  dryRun: true,
  episodeRetentionDays: 30,
  episodeMaxEntries: 2000,
  reviewer: freeze({ routeMode: 'inherit', provider: '', model: '', reasoningEffort: '', maxTokens: 2048, timeoutMs: 45000, toolRounds: 1 }),
  delivery: freeze({ concern: 'card', alert: 'card+agent-check', alertMinNoProductHours: 4, alertMinSupportFiles: 10 }),
  softBudgetHours: null,
  deliverableRoots: freeze([]),
  supportRoots: freeze([]),
  excludeGlobs: freeze([]),
})

export const INITIAL_SUPERVISION_CONFIG: SupervisionConfigSnapshot = freeze({
  schemaVersion: 1, revision: 0, defaults: {}, workspaceOverrides: {},
})

const TOP_KEYS = [
  'enabled', 'scheduledIntervalMinutes', 'scheduledMaxPerHour', 'scheduledMaxPerDay',
  'scheduledDailyTokenBudget', 'rollingSummaryHours', 'scheduledSummaryTopLanes', 'suspicionStartMode', 'suspicionMode', 'checkIntervalMinutes',
  'noProgressChecks', 'fastWindowMinutes', 'supportWriteThreshold', 'supportReadBackThreshold',
  'cooldownMinutes', 'maxAuditsPer6h', 'backoffFactor', 'lazyCheck', 'dryRun', 'episodeRetentionDays', 'episodeMaxEntries', 'reviewer',
  'delivery', 'softBudgetHours', 'deliverableRoots', 'supportRoots', 'excludeGlobs',
] as const
const REVIEWER_KEYS = ['routeMode', 'provider', 'model', 'reasoningEffort', 'maxTokens', 'timeoutMs', 'toolRounds'] as const
const DELIVERY_KEYS = ['concern', 'alert', 'alertMinNoProductHours', 'alertMinSupportFiles'] as const

function text(value: unknown, where: string, maximum = 256): string {
  if (typeof value !== 'string' || value.length > maximum || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) invalid(where + ' must be a bounded single-line string')
  return value
}
function integer(value: unknown, where: string, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) invalid(where + ' must be an integer between ' + minimum + ' and ' + maximum)
  return value
}
function decimal(value: unknown, where: string, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) invalid(where + ' must be a number between ' + minimum + ' and ' + maximum)
  return value
}
function oneOf<T extends string>(value: unknown, where: string, values: readonly T[]): T {
  if (typeof value !== 'string' || !values.includes(value as T)) invalid(where + ' must be one of ' + values.join(', '))
  return value as T
}
function strings(value: unknown, where: string): readonly string[] {
  const rows = boundedArray(value, where, 100).map((row, index) => {
    const parsed = text(row, where + '[' + index + ']', 512)
    if (parsed.length === 0) invalid(where + ' entries must be non-empty')
    return parsed
  })
  if (new Set(rows).size !== rows.length) invalid(where + ' must not contain duplicates')
  return freeze(rows)
}
function parseReviewerPatch(value: unknown, where: string): SupervisionReviewerPatch {
  const raw = record(value, where, REVIEWER_KEYS)
  const result: Record<string, unknown> = {}
  if (Object.hasOwn(raw, 'routeMode')) result.routeMode = oneOf(raw.routeMode, where + '.routeMode', SUPERVISION_ROUTE_MODES)
  if (Object.hasOwn(raw, 'provider')) result.provider = text(raw.provider, where + '.provider', 256)
  if (Object.hasOwn(raw, 'model')) result.model = text(raw.model, where + '.model', 256)
  if (Object.hasOwn(raw, 'reasoningEffort')) result.reasoningEffort = text(raw.reasoningEffort, where + '.reasoningEffort', 64)
  if (Object.hasOwn(raw, 'maxTokens')) result.maxTokens = integer(raw.maxTokens, where + '.maxTokens', 256, 8192)
  if (Object.hasOwn(raw, 'timeoutMs')) result.timeoutMs = integer(raw.timeoutMs, where + '.timeoutMs', 5000, 120000)
  if (Object.hasOwn(raw, 'toolRounds')) result.toolRounds = integer(raw.toolRounds, where + '.toolRounds', 0, 2)
  return result as SupervisionReviewerPatch
}
function parseDeliveryPatch(value: unknown, where: string): SupervisionDeliveryPatch {
  const raw = record(value, where, DELIVERY_KEYS)
  const result: Record<string, unknown> = {}
  if (Object.hasOwn(raw, 'concern')) result.concern = oneOf(raw.concern, where + '.concern', SUPERVISION_DELIVERY_MODES)
  if (Object.hasOwn(raw, 'alert')) result.alert = oneOf(raw.alert, where + '.alert', SUPERVISION_DELIVERY_MODES)
  if (Object.hasOwn(raw, 'alertMinNoProductHours')) result.alertMinNoProductHours = integer(raw.alertMinNoProductHours, where + '.alertMinNoProductHours', 1, 24)
  if (Object.hasOwn(raw, 'alertMinSupportFiles')) result.alertMinSupportFiles = integer(raw.alertMinSupportFiles, where + '.alertMinSupportFiles', 1, 100)
  return result as SupervisionDeliveryPatch
}
function parsePatch(value: unknown, where: string): SupervisionConfigPatch {
  const raw = record(value, where, TOP_KEYS)
  const result: Record<string, unknown> = {}
  const bools = ['enabled', 'lazyCheck', 'dryRun'] as const
  for (const key of bools) if (Object.hasOwn(raw, key)) result[key] = boolean(raw[key], where + '.' + key)
  const ranges: readonly [string, number, number][] = [
    ['scheduledIntervalMinutes', 15, 240], ['scheduledMaxPerHour', 1, 4], ['scheduledMaxPerDay', 1, 24],
    ['scheduledDailyTokenBudget', 1000, 1000000], ['rollingSummaryHours', 1, 72], ['scheduledSummaryTopLanes', 1, 20], ['checkIntervalMinutes', 5, 60],
    ['noProgressChecks', 2, 12], ['fastWindowMinutes', 15, 180], ['supportWriteThreshold', 1, 100],
    ['cooldownMinutes', 15, 360], ['maxAuditsPer6h', 1, 12], ['backoffFactor', 1, 4],
    ['episodeRetentionDays', 1, 365], ['episodeMaxEntries', 100, 10000],
  ]
  for (const [key, minimum, maximum] of ranges) if (Object.hasOwn(raw, key)) {
    result[key] = integer(raw[key], where + '.' + key, minimum, maximum)
  }
  if (Object.hasOwn(raw, 'supportReadBackThreshold')) result.supportReadBackThreshold = decimal(raw.supportReadBackThreshold, where + '.supportReadBackThreshold', 0, 1)
  if (Object.hasOwn(raw, 'suspicionStartMode')) result.suspicionStartMode = oneOf(raw.suspicionStartMode, where + '.suspicionStartMode', SUPERVISION_START_MODES)
  if (Object.hasOwn(raw, 'suspicionMode')) result.suspicionMode = oneOf(raw.suspicionMode, where + '.suspicionMode', SUPERVISION_SUSPICION_MODES)
  if (Object.hasOwn(raw, 'reviewer')) {
    const reviewer = parseReviewerPatch(raw.reviewer, where + '.reviewer')
    if (Object.keys(reviewer).length > 0) result.reviewer = reviewer
  }
  if (Object.hasOwn(raw, 'delivery')) {
    const delivery = parseDeliveryPatch(raw.delivery, where + '.delivery')
    if (Object.keys(delivery).length > 0) result.delivery = delivery
  }
  if (Object.hasOwn(raw, 'softBudgetHours')) {
    result.softBudgetHours = raw.softBudgetHours === null ? null : integer(raw.softBudgetHours, where + '.softBudgetHours', 1, 720)
  }
  for (const key of ['deliverableRoots', 'supportRoots', 'excludeGlobs'] as const) {
    if (Object.hasOwn(raw, key)) result[key] = strings(raw[key], where + '.' + key)
  }
  return result as SupervisionConfigPatch
}

function mergeSettings(defaults: SupervisionConfigPatch, override: SupervisionConfigPatch | undefined): SupervisionSettings {
  const reviewer: SupervisionReviewerSettings = freeze({
    ...SUPERVISION_DEFAULTS.reviewer,
    ...(defaults.reviewer ?? {}),
    ...(override?.reviewer ?? {}),
  })
  const delivery: SupervisionDeliverySettings = freeze({
    ...SUPERVISION_DEFAULTS.delivery,
    ...(defaults.delivery ?? {}),
    ...(override?.delivery ?? {}),
  })
  const merged = {
    ...SUPERVISION_DEFAULTS,
    ...defaults,
    ...(override ?? {}),
    reviewer,
    delivery,
    deliverableRoots: override?.deliverableRoots ?? defaults.deliverableRoots ?? SUPERVISION_DEFAULTS.deliverableRoots,
    supportRoots: override?.supportRoots ?? defaults.supportRoots ?? SUPERVISION_DEFAULTS.supportRoots,
    excludeGlobs: override?.excludeGlobs ?? defaults.excludeGlobs ?? SUPERVISION_DEFAULTS.excludeGlobs,
    softBudgetHours: override && Object.hasOwn(override, 'softBudgetHours') ? override.softBudgetHours ?? null
      : defaults && Object.hasOwn(defaults, 'softBudgetHours') ? defaults.softBudgetHours ?? null : null,
  }
  return freeze(merged)
}

export function resolveSupervisionSettings(snapshot: SupervisionConfigIntent, workspaceId: string | null): SupervisionSettings {
  if (workspaceId !== null) id(workspaceId, 'workspaceId')
  return mergeSettings(snapshot.defaults, workspaceId === null ? undefined : snapshot.workspaceOverrides[workspaceId])
}

function assertResolved(settings: SupervisionSettings, where: string): void {
  if (settings.reviewer.routeMode === 'explicit' && (settings.reviewer.provider.length === 0 || settings.reviewer.model.length === 0)) {
    invalid(where + ': explicit reviewer route requires provider and model')
  }
}

function parseIntentRaw(value: unknown): SupervisionConfigIntent {
  const raw = record(value, 'supervision config intent', ['defaults', 'workspaceOverrides'])
  const overrides = record(raw.workspaceOverrides, 'supervision workspaceOverrides')
  const entries = Object.entries(overrides).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, patch]) => {
    const workspace = id(key, 'supervision workspace id')
    return [workspace, parsePatch(patch, 'supervision workspaceOverrides.' + workspace)] as const
  }).filter(([, patch]) => Object.keys(patch).length > 0)
  return freeze({
    defaults: parsePatch(raw.defaults, 'supervision defaults'),
    workspaceOverrides: Object.fromEntries(entries) as Readonly<Record<string, SupervisionConfigPatch>>,
  })
}

export function parseSupervisionConfigIntent(value: unknown): SupervisionConfigIntent {
  const parsed = parseIntentRaw(value)
  assertResolved(resolveSupervisionSettings(parsed, null), 'supervision defaults')
  for (const workspace of Object.keys(parsed.workspaceOverrides)) assertResolved(resolveSupervisionSettings(parsed, workspace), 'supervision workspaceOverrides.' + workspace)
  return parsed
}

export function parseSupervisionConfigSnapshot(value: unknown): SupervisionConfigSnapshot {
  const raw = record(value, 'supervision config snapshot', ['schemaVersion', 'revision', 'defaults', 'workspaceOverrides'])
  if (raw.schemaVersion !== 1) invalid('unsupported supervision schemaVersion')
  const parsed = parseSupervisionConfigIntent({ defaults: raw.defaults, workspaceOverrides: raw.workspaceOverrides })
  return freeze({ schemaVersion: 1, revision: revision(raw.revision, 'supervision revision'), ...parsed })
}

export const parseSupervisionConfigDocument = parseSupervisionConfigSnapshot

export function supervisionIntentOf(snapshot: SupervisionConfigSnapshot): SupervisionConfigIntent {
  return freeze({ defaults: snapshot.defaults, workspaceOverrides: snapshot.workspaceOverrides })
}

export function ownSupervisionLeaf(intent: SupervisionConfigIntent, workspaceId: string | null, field: SupervisionField): unknown {
  const patch = workspaceId === null ? intent.defaults : intent.workspaceOverrides[workspaceId]
  if (!patch) return undefined
  const dot = field.indexOf('.')
  if (dot < 0) return patch[field as keyof SupervisionConfigPatch]
  const group = field.slice(0, dot), key = field.slice(dot + 1)
  const nested = group === 'reviewer' ? patch.reviewer : patch.delivery
  return nested ? (nested as unknown as Record<string, unknown>)[key] : undefined
}

export type SupervisionField =
  | 'enabled' | 'scheduledIntervalMinutes' | 'scheduledMaxPerHour' | 'scheduledMaxPerDay'
  | 'scheduledDailyTokenBudget' | 'rollingSummaryHours' | 'scheduledSummaryTopLanes' | 'suspicionStartMode' | 'checkIntervalMinutes'
  | 'noProgressChecks' | 'fastWindowMinutes' | 'supportWriteThreshold' | 'supportReadBackThreshold'
  | 'cooldownMinutes' | 'maxAuditsPer6h' | 'backoffFactor' | 'lazyCheck' | 'dryRun' | 'episodeRetentionDays' | 'episodeMaxEntries' | 'softBudgetHours'
  | 'suspicionMode'
  | 'deliverableRoots' | 'supportRoots' | 'excludeGlobs'
  | 'reviewer.routeMode' | 'reviewer.provider' | 'reviewer.model' | 'reviewer.reasoningEffort'
  | 'reviewer.maxTokens' | 'reviewer.timeoutMs' | 'reviewer.toolRounds'
  | 'delivery.concern' | 'delivery.alert' | 'delivery.alertMinNoProductHours' | 'delivery.alertMinSupportFiles'

export function setSupervisionLeaf(intent: SupervisionConfigIntent, workspaceId: string | null, field: SupervisionField, value: unknown): SupervisionConfigIntent {
  if (workspaceId !== null) id(workspaceId, 'workspaceId')
  const next = JSON.parse(JSON.stringify(intent)) as { defaults: Record<string, unknown>, workspaceOverrides: Record<string, Record<string, unknown>> }
  const target = workspaceId === null ? next.defaults : (next.workspaceOverrides[workspaceId] ?? (next.workspaceOverrides[workspaceId] = {}))
  const dot = field.indexOf('.')
  if (dot < 0) {
    if (value === undefined) delete target[field]
    else target[field] = value
  } else {
    const group = field.slice(0, dot), key = field.slice(dot + 1)
    const nested = (target[group] as Record<string, unknown> | undefined) ?? {}
    if (value === undefined) delete nested[key]
    else nested[key] = value
    if (Object.keys(nested).length === 0) delete target[group]
    else target[group] = nested
  }
  if (workspaceId !== null && Object.keys(target).length === 0) delete next.workspaceOverrides[workspaceId]
  // Structural parse catches wrong field types without requiring a complete explicit route while the user is typing.
  const parsed = parseIntentRaw(next)
  return parsed
}
