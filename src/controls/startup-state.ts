import { array, boolean, ControlsError, freeze, id, invalid, record, revision } from './validation.js'

/** Only this feature's next-process request; never the plugin master switch. */
export interface StartupDesired { readonly startupCwdEnabled: boolean }
/** Trusted real-process identity supplied by Host, never a settings/model field. */
export interface StartupBoot { readonly epoch: string }
export interface StartupPreparation {
  readonly status: 'ready' | 'not-prepared' | 'incompatible' | 'failed' | 'uncertain'
  readonly sdkVersion: string | null
  readonly diagnostic: string | null
  /** Optional live observation detail; never a stored setting or capability grant. */
  readonly reason?: 'compatibility-component-disabled' | 'compatibility-component-forced-enabled'
}
export interface StartupObservation {
  readonly nativeInitialCwdSupported: boolean | null
  readonly preparation: StartupPreparation
}
export interface StartupBootReceipt {
  readonly epoch: string
  readonly requested: StartupDesired
}
export interface StartupDocument {
  readonly schemaVersion: 1
  readonly revision: number
  readonly desired: StartupDesired
  readonly bootReceipts: readonly StartupBootReceipt[]
}
export interface StartupStatus {
  readonly revision: number
  readonly desired: StartupDesired
  readonly boot: StartupBootReceipt
  readonly enabledNow: boolean | null
  readonly nativeInitialCwdSupported: boolean | null
  readonly preparation: StartupPreparation
  readonly restartNeeded: boolean
  readonly state: 'disabled' | 'enabled' | 'pending-restart' | 'needs-preparation' | 'unsupported' | 'incompatible' | 'failed' | 'uncertain'
}

export function parseStartupDesired(value: unknown): StartupDesired {
  const raw = record(value, 'startup desired', ['startupCwdEnabled'])
  return freeze({ startupCwdEnabled: boolean(raw.startupCwdEnabled, 'startupCwdEnabled') })
}
function nullableText(value: unknown, where: string): string | null {
  if (value === null) return null
  if (typeof value !== 'string') invalid(where + ' must be a string or null')
  return value
}
export function parseStartupObservation(value: unknown): StartupObservation {
  const raw = record(value, 'startup observation', ['nativeInitialCwdSupported', 'preparation'])
  const prep = record(raw.preparation, 'startup preparation', ['status', 'sdkVersion', 'diagnostic', 'reason'])
  const statuses = ['ready', 'not-prepared', 'incompatible', 'failed', 'uncertain'] as const
  const status = statuses.find(status => status === prep.status)
  if (!status) invalid('unsupported startup preparation status')
  const reason = prep.reason
  if (Object.hasOwn(prep, 'reason') && ((reason !== 'compatibility-component-disabled' && reason !== 'compatibility-component-forced-enabled') || status !== 'incompatible')) {
    invalid('unsupported startup preparation reason or reason/status combination')
  }
  return freeze({ nativeInitialCwdSupported: raw.nativeInitialCwdSupported === null ? null : boolean(raw.nativeInitialCwdSupported, 'nativeInitialCwdSupported'),
    preparation: { status, sdkVersion: nullableText(prep.sdkVersion, 'sdkVersion'), diagnostic: nullableText(prep.diagnostic, 'diagnostic'),
      ...(reason === 'compatibility-component-disabled' || reason === 'compatibility-component-forced-enabled' ? { reason } : {}) } })
}
/** Strict transport decoder. It validates JSON facts, not a second UI projection. */
export function parseStartupStatus(value: unknown): StartupStatus {
  const raw = record(value, 'startup status', ['revision', 'desired', 'boot', 'enabledNow', 'nativeInitialCwdSupported', 'preparation', 'restartNeeded', 'state'])
  const receipt = record(raw.boot, 'startup boot receipt', ['epoch', 'requested'])
  const observation = parseStartupObservation({ nativeInitialCwdSupported: raw.nativeInitialCwdSupported, preparation: raw.preparation })
  const states = ['disabled', 'enabled', 'pending-restart', 'needs-preparation', 'unsupported', 'incompatible', 'failed', 'uncertain'] as const
  const state = states.find(state => state === raw.state)
  if (!state) invalid('unsupported startup state')
  return freeze({ revision: revision(raw.revision, 'startup revision'), desired: parseStartupDesired(raw.desired),
    boot: { epoch: id(receipt.epoch, 'startup epoch'), requested: parseStartupDesired(receipt.requested) },
    enabledNow: raw.enabledNow === null ? null : boolean(raw.enabledNow, 'enabledNow'),
    ...observation, restartNeeded: boolean(raw.restartNeeded, 'restartNeeded'), state })
}
export function emptyStartupDocument(): StartupDocument {
  return freeze({ schemaVersion: 1, revision: 0, desired: { startupCwdEnabled: false }, bootReceipts: [] })
}
export function parseStartupDocument(value: unknown): StartupDocument {
  try {
    const raw = record(value, 'startup document', ['schemaVersion', 'revision', 'desired', 'bootReceipts'])
    if (raw.schemaVersion !== 1) invalid('unsupported startup schemaVersion')
    const bootReceipts = array(raw.bootReceipts, 'bootReceipts').map(value => {
      const receipt = record(value, 'startup boot receipt', ['epoch', 'requested'])
      return { epoch: id(receipt.epoch, 'startup epoch'), requested: parseStartupDesired(receipt.requested) }
    })
    if (new Set(bootReceipts.map(receipt => receipt.epoch)).size !== bootReceipts.length) invalid('duplicate startup epoch')
    return freeze({ schemaVersion: 1, revision: revision(raw.revision, 'startup revision'), desired: parseStartupDesired(raw.desired), bootReceipts })
  } catch (error) {
    if (error instanceof ControlsError && error.code === 'invalid-input') throw new ControlsError('invalid-state', error.message)
    throw error
  }
}
