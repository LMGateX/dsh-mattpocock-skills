import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

import { CATALOG } from './catalog.js'
import { createMattPocockSkillProvider } from './provider.js'

export { CATALOG, parseCatalog } from './catalog.js'
export type { CatalogInvocation, CatalogSkill, SkillCatalog } from './catalog.js'
export { PACKAGE_ROOT, PROVIDER_NAME, createMattPocockSkillProvider } from './provider.js'
export type { ProviderDiagnostic, ProviderOptions, SkillFileReader } from './provider.js'

export const name = 'dsh-mattpocock-skills'
export const inject = ['skills'] as const

/**
 * Channels declared by the vendored distribution. Sorting is stable and the set is
 * closed for one mount: an unknown channel name is rejected rather than silently empty.
 */
export const CHANNELS: readonly string[] = Object.freeze(Object.keys(CATALOG.channels).sort())

/** Channel names are data-driven, so the type is a string validated against {@link CHANNELS}. */
export type Channel = string

/** Channel used when a profile selects none: `stable` when declared, otherwise the first channel. */
export const DEFAULT_CHANNEL: Channel = CHANNELS.includes('stable') ? 'stable' : CHANNELS[0]!

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
  // The immutable Skills provider never depends on the optional controls plane.
  // A Skills-only/older composition keeps working without these services or peers.
  if (typeof ctx.inject === 'function') ctx.inject(['storageDomain', 'tools', 'agents', 'workspaceRegistry', 'sessionQuery', 'systemPrompt', 'typert', 'connection'], async (scope) => {
    try {
      const [{ mountHost }, { createRuntime }] = await Promise.all([import('./host.js'), import('./runtime.js')])
      await mountHost(scope, { createRuntime })
    } catch (error) {
      scope.logger(name).warn('Workspace controls unavailable; Skills delivery remains mounted: %s', error)
    }
  })
}
