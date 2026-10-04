import Schema from '@deepseek-ai/schemastery';
import { CATALOG } from './catalog.js';
import { createMattPocockSkillProvider } from './provider.js';
export { CATALOG, parseCatalog } from './catalog.js';
export { PACKAGE_ROOT, PROVIDER_NAME, createMattPocockSkillProvider } from './provider.js';
export const name = 'dsh-mattpocock-skills';
export const inject = ['skills'];
/**
 * Channels declared by the vendored distribution. Sorting is stable and the set is
 * closed for one mount: an unknown channel name is rejected rather than silently empty.
 */
export const CHANNELS = Object.freeze(Object.keys(CATALOG.channels).sort());
/** Channel used when a profile selects none: `stable` when declared, otherwise the first channel. */
export const DEFAULT_CHANNEL = CHANNELS.includes('stable') ? 'stable' : CHANNELS[0];
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
