import Schema from '@deepseek-ai/schemastery';
export const name = 'dsh-mattpocock-skills';
export const inject = ['skills'];
export const CHANNELS = ['stable', 'beta'];
export const DEFAULT_CHANNEL = 'stable';
export const Config = Schema.object({
    channel: Schema.union([...CHANNELS]).default(DEFAULT_CHANNEL),
}).description('Select the Matt Pocock Skills distribution channel');
/**
 * Phase 1 establishes the installable plugin surface. The immutable Skill
 * provider is added in Phase 3 after verified source ingestion and catalog
 * generation exist.
 */
export function apply(_ctx, _config) { }
