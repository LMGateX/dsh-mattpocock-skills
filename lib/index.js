import Schema from '@deepseek-ai/schemastery';
import { createMattPocockSkillProvider } from './provider.js';
export { CATALOG, parseCatalog } from './catalog.js';
export { PACKAGE_ROOT, PROVIDER_NAME, createMattPocockSkillProvider } from './provider.js';
export const name = 'dsh-mattpocock-skills';
export const inject = ['skills'];
export const CHANNELS = ['stable', 'beta'];
export const DEFAULT_CHANNEL = 'stable';
export const Config = Schema.object({
    channel: Schema.union([...CHANNELS]).default(DEFAULT_CHANNEL),
}).description('Select the Matt Pocock Skills distribution channel');
/** Register one immutable bundled Skill provider for the selected channel. */
export function apply(ctx, config = { channel: DEFAULT_CHANNEL }) {
    const logger = ctx.logger(name);
    ctx.skills.registerProvider((control) => createMattPocockSkillProvider(config.channel, {
        lifecycleSignal: control.signal,
        diagnostic: (message) => logger.warn(message),
    }));
}
