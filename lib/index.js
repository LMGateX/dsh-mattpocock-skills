import { addAbortListener } from 'node:events';
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
    delegate: Schema.boolean().default(false).description('注册绑定式 mattpocock_delegate（默认关闭；普通派发用宿主原生 subagent）'),
}).description('选择 Matt Pocock 技能分发渠道');
/** Settle only this bundle's policy Host activation, not the surrounding loader or profile. */
async function settleHostMount(fiber, signal) {
    signal?.throwIfAborted();
    if (signal === undefined) {
        await fiber.await();
        return;
    }
    let subscription;
    const cancelled = new Promise((_, reject) => {
        subscription = addAbortListener(signal, () => reject(signal.reason));
    });
    try {
        await Promise.race([fiber.await(), cancelled]);
    }
    finally {
        subscription?.[Symbol.dispose]();
    }
}
/** Register one immutable bundled Skill provider for the selected channel. */
export function apply(ctx, config = { channel: DEFAULT_CHANNEL }) {
    const logger = ctx.logger(name);
    let resolveScope;
    let hostMount;
    let invalidateSkills;
    let revision = 0;
    const catalogChanged = () => {
        revision++;
        invalidateSkills?.();
    };
    ctx.skills.registerProvider((control) => {
        invalidateSkills = control.invalidate;
        return createMattPocockSkillProvider(config.channel, {
            lifecycleSignal: control.signal,
            diagnostic: (message) => logger.warn(message),
            async scopeAllowed(agent, signal) {
                // Profile recomposition can publish this row before its injected Host fiber has settled.
                // Pending dependencies settle without a resolver; only the actual Host can grant access.
                if (resolveScope === undefined && hostMount !== undefined)
                    await settleHostMount(hostMount, signal);
                signal?.throwIfAborted();
                const checked = revision;
                // Never turn an unavailable policy reader into permission to distribute.
                return resolveScope !== undefined && await resolveScope(agent, signal) && checked === revision;
            },
        });
    });
    if (typeof ctx.inject === 'function')
        hostMount = ctx.inject(['storageDomain', 'tools', 'agents', 'workspaceRegistry', 'sessionQuery', 'systemPrompt', 'typert', 'connection'], async (scope) => {
            let active = true;
            scope.effect(() => () => {
                active = false;
                resolveScope = undefined;
                catalogChanged();
            });
            try {
                const [{ mountHost }, { createRuntime }] = await Promise.all([import('./host.js'), import('./runtime.js')]);
                if (!active)
                    return;
                const host = await mountHost(scope, { createRuntime, onPolicyChanged: catalogChanged, delegate: config.delegate === true });
                if (!active)
                    return;
                resolveScope = host.skillsEnabledForScope;
                catalogChanged();
            }
            catch (error) {
                if (active)
                    scope.logger(name).warn('Workspace controls unavailable; bundled Skills require verified workspace policy: %s', error);
            }
        });
}
