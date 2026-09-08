import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

import { createMattPocockSkillProvider } from './provider.js'

export { CATALOG, parseCatalog } from './catalog.js'
export type { CatalogInvocation, CatalogSkill, SkillCatalog } from './catalog.js'
export { PACKAGE_ROOT, PROVIDER_NAME, createMattPocockSkillProvider } from './provider.js'
export type { ProviderDiagnostic, ProviderOptions, SkillFileReader } from './provider.js'

export const name = 'dsh-mattpocock-skills'
export const inject = ['skills'] as const

export const CHANNELS = ['stable', 'beta'] as const
export type Channel = (typeof CHANNELS)[number]
export const DEFAULT_CHANNEL: Channel = 'stable'

export interface Config {
  channel: Channel
}

export const Config: Schema<Config> = Schema.object({
  channel: Schema.union([...CHANNELS]).default(DEFAULT_CHANNEL),
}).description('Select the Matt Pocock Skills distribution channel')

/** Register one immutable bundled Skill provider for the selected channel. */
export function apply(ctx: Context, config: Config = { channel: DEFAULT_CHANNEL }): void {
  const logger = ctx.logger(name)
  ctx.skills.registerProvider((control) => createMattPocockSkillProvider(config.channel, {
    lifecycleSignal: control.signal,
    diagnostic: (message) => logger.warn(message),
  }))
}
