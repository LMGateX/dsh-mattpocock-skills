import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

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

/**
 * Phase 1 establishes the installable plugin surface. The immutable Skill
 * provider is added in Phase 3 after verified source ingestion and catalog
 * generation exist.
 */
export function apply(_ctx: Context, _config: Config): void {}
