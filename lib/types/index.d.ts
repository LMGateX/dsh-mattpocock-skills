import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
export { CATALOG, parseCatalog } from './catalog.js';
export type { CatalogInvocation, CatalogSkill, SkillCatalog } from './catalog.js';
export { PACKAGE_ROOT, PROVIDER_NAME, createMattPocockSkillProvider } from './provider.js';
export type { ProviderDiagnostic, ProviderOptions, SkillFileReader } from './provider.js';
export declare const name = "dsh-mattpocock-skills";
export declare const inject: readonly ["skills"];
export declare const CHANNELS: readonly ["stable", "beta"];
export type Channel = (typeof CHANNELS)[number];
export declare const DEFAULT_CHANNEL: Channel;
export interface Config {
    channel: Channel;
}
export declare const Config: Schema<Config>;
/** Register one immutable bundled Skill provider for the selected channel. */
export declare function apply(ctx: Context, config?: Config): void;
