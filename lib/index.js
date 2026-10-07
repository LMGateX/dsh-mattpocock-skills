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
}).description('选择 Matt Pocock 技能分发渠道');
/** Register one immutable bundled Skill provider for the selected channel. */
export function apply(ctx, config = { channel: DEFAULT_CHANNEL }) {
    const logger = ctx.logger(name);
    const gate = { resolve: null };
    let invalidateSkills = null;
    ctx.skills.registerProvider((control) => {
        invalidateSkills = () => control.invalidate();
        return createMattPocockSkillProvider(config.channel, {
            lifecycleSignal: control.signal,
            diagnostic: (message) => logger.warn(message),
            // Missing policy keeps the safe initial: skills stay delivered.
            workspaceAllowed: async (cwd) => gate.resolve === null ? true : await gate.resolve(cwd),
        });
    });
    // The immutable Skills provider never depends on the optional controls plane.
    // A Skills-only/older composition keeps working without these services or peers.
    if (typeof ctx.inject === 'function')
        ctx.inject(['storageDomain', 'tools', 'agents', 'workspaceRegistry', 'sessionQuery', 'systemPrompt', 'typert', 'connection'], async (scope) => {
            try {
                const [{ mountHost }, { createRuntime }] = await Promise.all([import('./host.js'), import('./runtime.js')]);
                const host = await mountHost(scope, { createRuntime, onPolicyChanged: () => invalidateSkills?.() });
                gate.resolve = host.skillsEnabledForCwd;
            }
            catch (error) {
                scope.logger(name).warn('Workspace controls unavailable; Skills delivery remains mounted: %s', error);
            }
        });
}
