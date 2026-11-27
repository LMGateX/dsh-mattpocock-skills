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
  /** Opt in to the binding-first delegate creation tool. Default false. */
  delegate?: boolean
}

export const Config: Schema<Config> = Schema.object({
  channel: Schema.union([...CHANNELS]).default(DEFAULT_CHANNEL),
  delegate: Schema.boolean().default(false).description('注册绑定式 mattpocock_delegate（默认关闭；普通派发用宿主原生 subagent）'),
}).description('选择 Matt Pocock 技能分发渠道')

/** Register one immutable bundled Skill provider for the selected channel. */
export function apply(ctx: Context, config: Config = { channel: DEFAULT_CHANNEL }): void {
  const logger = ctx.logger(name)
  let resolveScope: NonNullable<import('./provider.js').ProviderOptions['scopeAllowed']> | undefined
  let invalidateSkills: (() => void) | undefined
  let revision = 0
  const catalogChanged = () => {
    revision++
    invalidateSkills?.()
  }
  ctx.skills.registerProvider((control) => {
    invalidateSkills = control.invalidate
    return createMattPocockSkillProvider(config.channel, {
      lifecycleSignal: control.signal,
      diagnostic: (message) => logger.warn(message),
      async scopeAllowed(agent, signal) {
        const checked = revision
        // Never turn an unavailable policy reader into permission to distribute.
        return resolveScope !== undefined && await resolveScope(agent, signal) && checked === revision
      },
    })
  })
  if (typeof ctx.inject === 'function') ctx.inject(['storageDomain', 'tools', 'agents', 'workspaceRegistry', 'sessionQuery', 'systemPrompt', 'typert', 'connection'], async (scope) => {
    let active = true
    scope.effect(() => () => {
      active = false
      resolveScope = undefined
      catalogChanged()
    })
    try {
      const [{ mountHost }, { createRuntime }] = await Promise.all([import('./host.js'), import('./runtime.js')])
      if (!active) return
      const host = await mountHost(scope, { createRuntime, onPolicyChanged: catalogChanged, delegate: config.delegate === true })
      if (!active) return
      resolveScope = host.skillsEnabledForScope
      catalogChanged()
    } catch (error) {
      if (active) scope.logger(name).warn('Workspace controls unavailable; bundled Skills require verified workspace policy: %s', error)
    }
  })
}
