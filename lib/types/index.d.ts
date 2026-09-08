import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
export declare const name = "dsh-mattpocock-skills";
export declare const inject: readonly ["skills"];
export declare const CHANNELS: readonly ["stable", "beta"];
export type Channel = (typeof CHANNELS)[number];
export declare const DEFAULT_CHANNEL: Channel;
export interface Config {
    channel: Channel;
}
export declare const Config: Schema<Config>;
/**
 * Phase 1 establishes the installable plugin surface. The immutable Skill
 * provider is added in Phase 3 after verified source ingestion and catalog
 * generation exist.
 */
export declare function apply(_ctx: Context, _config: Config): void;
