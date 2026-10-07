import { boolean, capacity, freeze, id, record, revision } from './validation.js'

export interface FeaturePatch { readonly enabled?: boolean }
export interface WindowPatch extends FeaturePatch {
  readonly ticketWindowSize?: number
  readonly runningSubagentLimit?: number
}
export interface DisplayPatch {
  readonly header?: boolean
  readonly inputSummary?: boolean
  readonly rightPanel?: boolean
  readonly sessionList?: boolean
  readonly timeline?: boolean
}
export interface WorkspacePolicyPatch {
  /** Per-workspace master gate; the safe initial is closed. */
  readonly workspace?: FeaturePatch
  /** Per-workspace Skill distribution; the safe initial is open. */
  readonly skills?: FeaturePatch
  readonly binding?: FeaturePatch
  readonly lifecycle?: FeaturePatch
  readonly windows?: WindowPatch
  readonly ticketProgress?: FeaturePatch
  readonly pendingDecisions?: FeaturePatch
  readonly display?: DisplayPatch
}
export interface PolicyIntent {
  readonly extensionEnabled: boolean
  readonly defaults: WorkspacePolicyPatch
  readonly workspaceOverrides: Readonly<Record<string, WorkspacePolicyPatch>>
}
export interface PolicySnapshot extends PolicyIntent { readonly revision: number }

export const FEATURE_NAMES = ['binding', 'lifecycle', 'windows', 'ticketProgress', 'pendingDecisions'] as const
export const DISPLAY_NAMES = ['header', 'inputSummary', 'rightPanel', 'sessionList', 'timeline'] as const
export type FeatureName = typeof FEATURE_NAMES[number]
export type PolicySource = 'workspace' | 'global' | 'safe-initial'
export type PolicyField =
  | 'workspace.enabled' | 'skills.enabled'
  | 'binding.enabled' | 'lifecycle.enabled' | 'windows.enabled'
  | 'ticketProgress.enabled' | 'pendingDecisions.enabled'
  | 'windows.ticketWindowSize' | 'windows.runningSubagentLimit'
  | 'display.header' | 'display.inputSummary' | 'display.rightPanel' | 'display.sessionList' | 'display.timeline'

export interface EffectivePolicy {
  readonly configurationRevision: number
  readonly controlWorkspaceId: string
  readonly workspaceVerified: boolean
  readonly extensionEnabled: boolean
  /** Per-workspace gate, resolved; the safe initial is closed. */
  readonly workspaceEnabled: boolean
  /** Skill distribution for this workspace, resolved; the safe initial is open. */
  readonly skillsEnabled: boolean
  readonly features: Readonly<Record<FeatureName, {
    readonly requested: boolean
    /** configured is policy intent, NOT a claim of installed/enforced host capability. */
    readonly status: 'disabled' | 'configured' | 'unsupported'
    readonly reason: 'extension-disabled' | 'workspace-disabled' | 'feature-disabled' | 'workspace-unverified' | 'window-capacity-unset' | null
  }>>
  readonly windows: { readonly ticketWindowSize: number | null; readonly runningSubagentLimit: number | null }
  readonly display: Required<DisplayPatch>
  readonly sources: Readonly<Record<PolicyField, PolicySource>>
}

/** No new-work automation and no guessed numeric capacities. */
export const INITIAL_POLICY: PolicySnapshot = freeze({
  revision: 0, extensionEnabled: false, defaults: {}, workspaceOverrides: {},
})
const DISPLAY_INITIAL = { header: true, inputSummary: false, rightPanel: true, sessionList: false, timeline: true } as const

function parsePatch(value: unknown, where: string): WorkspacePolicyPatch {
  const raw = record(value, where, [...FEATURE_NAMES, 'workspace', 'skills', 'display'])
  const result: Record<string, unknown> = {}
  for (const feature of FEATURE_NAMES) {
    if (!Object.hasOwn(raw, feature)) continue
    const keys = feature === 'windows' ? ['enabled', 'ticketWindowSize', 'runningSubagentLimit'] : ['enabled']
    const group = record(raw[feature], where + '.' + feature, keys)
    const parsed: Record<string, unknown> = {}
    for (const key of keys) {
      if (!Object.hasOwn(group, key)) continue
      parsed[key] = key === 'enabled' ? boolean(group[key], where + '.' + feature + '.' + key)
        : capacity(group[key], where + '.' + feature + '.' + key)
    }
    if (Object.keys(parsed).length > 0) result[feature] = parsed
  }
  for (const gate of ['workspace', 'skills'] as const) {
    if (!Object.hasOwn(raw, gate)) continue
    const group = record(raw[gate], where + '.' + gate, ['enabled'])
    if (Object.hasOwn(group, 'enabled')) result[gate] = { enabled: boolean(group.enabled, where + '.' + gate + '.enabled') }
  }
  if (Object.hasOwn(raw, 'display')) {
    const group = record(raw.display, where + '.display', DISPLAY_NAMES)
    const parsed: Record<string, boolean> = {}
    for (const key of DISPLAY_NAMES) if (Object.hasOwn(group, key)) parsed[key] = boolean(group[key], where + '.display.' + key)
    if (Object.keys(parsed).length > 0) result.display = parsed
  }
  return result as WorkspacePolicyPatch
}

/** A save replaces a complete sparse intent; removing a field restores inheritance. */
export function parsePolicyIntent(value: unknown): PolicyIntent {
  const raw = record(value, 'policy', ['extensionEnabled', 'defaults', 'workspaceOverrides'])
  const overrides = record(raw.workspaceOverrides, 'policy.workspaceOverrides')
  const entries = Object.entries(overrides).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, patch]) => [id(key, 'workspace id'), parsePatch(patch, 'workspaceOverrides.' + key)] as const)
    .filter(([, patch]) => Object.keys(patch).length > 0)
  return freeze({
    extensionEnabled: boolean(raw.extensionEnabled, 'policy.extensionEnabled'),
    defaults: parsePatch(raw.defaults, 'policy.defaults'),
    workspaceOverrides: Object.fromEntries(entries),
  })
}

export function parsePolicySnapshot(value: unknown): PolicySnapshot {
  const raw = record(value, 'policy snapshot', ['revision', 'extensionEnabled', 'defaults', 'workspaceOverrides'])
  return freeze({ ...parsePolicyIntent({ extensionEnabled: raw.extensionEnabled, defaults: raw.defaults,
    workspaceOverrides: raw.workspaceOverrides }), revision: revision(raw.revision, 'policy revision') })
}

/** Pure server-side resolution; display preferences never control functional eligibility. */
export function resolvePolicy(policy: PolicySnapshot, controlWorkspaceId: string, workspaceVerified: boolean): EffectivePolicy {
  const parsed = parsePolicySnapshot(policy)
  const workspaceId = id(controlWorkspaceId, 'controlWorkspaceId')
  boolean(workspaceVerified, 'workspaceVerified')
  const override = Object.hasOwn(parsed.workspaceOverrides, workspaceId) ? parsed.workspaceOverrides[workspaceId]! : {}
  const sources = {} as Record<PolicyField, PolicySource>
  const choose = (group: keyof WorkspacePolicyPatch, key: string, initial: boolean | number | null): boolean | number | null => {
    const workspace = override[group] as Record<string, unknown> | undefined
    const global = parsed.defaults[group] as Record<string, unknown> | undefined
    const field = (group + '.' + key) as PolicyField
    if (workspace && Object.hasOwn(workspace, key)) { sources[field] = 'workspace'; return workspace[key] as boolean | number }
    if (global && Object.hasOwn(global, key)) { sources[field] = 'global'; return global[key] as boolean | number }
    sources[field] = 'safe-initial'
    return initial
  }
  const windows = {
    ticketWindowSize: choose('windows', 'ticketWindowSize', null) as number | null,
    runningSubagentLimit: choose('windows', 'runningSubagentLimit', null) as number | null,
  }
  const workspaceEnabled = choose('workspace', 'enabled', false) as boolean
  const skillsEnabled = choose('skills', 'enabled', true) as boolean
  const features = {} as Record<FeatureName, EffectivePolicy['features'][FeatureName]>
  for (const feature of FEATURE_NAMES) {
    const requested = choose(feature, 'enabled', false) as boolean
    const reason = !parsed.extensionEnabled ? 'extension-disabled' : !workspaceEnabled ? 'workspace-disabled' : !requested ? 'feature-disabled'
      : !workspaceVerified ? 'workspace-unverified'
      : feature === 'windows' && (windows.ticketWindowSize === null || windows.runningSubagentLimit === null) ? 'window-capacity-unset' : null
    features[feature] = { requested, status: reason === null ? 'configured'
      : reason === 'workspace-unverified' || reason === 'window-capacity-unset' ? 'unsupported' : 'disabled', reason }
  }
  const display = Object.fromEntries(DISPLAY_NAMES.map(key => [key, choose('display', key, DISPLAY_INITIAL[key])])) as Required<DisplayPatch>
  return freeze({ configurationRevision: parsed.revision, controlWorkspaceId: workspaceId, workspaceVerified,
    extensionEnabled: parsed.extensionEnabled, workspaceEnabled, skillsEnabled, features, windows, display, sources })
}
