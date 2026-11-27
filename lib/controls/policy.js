import { boolean, capacity, freeze, id, invalid, record, revision } from './validation.js';
export const FEATURE_NAMES = ['binding', 'lifecycle', 'windows', 'ticketProgress', 'pendingDecisions'];
export const DISPLAY_NAMES = ['header', 'inputSummary', 'rightPanel', 'sessionList', 'timeline'];
/** No new-work automation and no guessed numeric capacities. */
export const INITIAL_POLICY = freeze({
    revision: 0, extensionEnabled: false, defaults: {}, workspaceOverrides: {},
});
const DISPLAY_INITIAL = { header: true, inputSummary: false, rightPanel: true, sessionList: false, timeline: true };
function parseInteractionMode(value, where) {
    if (value !== 'native-question' && value !== 'async-decision')
        invalid(where + ' must be native-question or async-decision');
    return value;
}
function parsePatch(value, where) {
    const raw = record(value, where, [...FEATURE_NAMES, 'workspace', 'skills', 'display']);
    const result = {};
    for (const feature of FEATURE_NAMES) {
        if (!Object.hasOwn(raw, feature))
            continue;
        const keys = feature === 'windows' ? ['enabled', 'ticketWindowSize', 'runningSubagentLimit']
            : feature === 'pendingDecisions' ? ['enabled', 'interactionMode'] : ['enabled'];
        const group = record(raw[feature], where + '.' + feature, keys);
        const parsed = {};
        for (const key of keys) {
            if (!Object.hasOwn(group, key))
                continue;
            parsed[key] = key === 'enabled' ? boolean(group[key], where + '.' + feature + '.' + key)
                : key === 'interactionMode' ? parseInteractionMode(group[key], where + '.' + feature + '.' + key)
                    : capacity(group[key], where + '.' + feature + '.' + key);
        }
        if (Object.keys(parsed).length > 0)
            result[feature] = parsed;
    }
    for (const gate of ['workspace', 'skills']) {
        if (!Object.hasOwn(raw, gate))
            continue;
        const group = record(raw[gate], where + '.' + gate, ['enabled']);
        if (Object.hasOwn(group, 'enabled'))
            result[gate] = { enabled: boolean(group.enabled, where + '.' + gate + '.enabled') };
    }
    if (Object.hasOwn(raw, 'display')) {
        const group = record(raw.display, where + '.display', DISPLAY_NAMES);
        const parsed = {};
        for (const key of DISPLAY_NAMES)
            if (Object.hasOwn(group, key))
                parsed[key] = boolean(group[key], where + '.display.' + key);
        if (Object.keys(parsed).length > 0)
            result.display = parsed;
    }
    return result;
}
/** A save replaces a complete sparse intent; removing a field restores inheritance. */
export function parsePolicyIntent(value) {
    const raw = record(value, 'policy', ['extensionEnabled', 'defaults', 'workspaceOverrides']);
    const overrides = record(raw.workspaceOverrides, 'policy.workspaceOverrides');
    const entries = Object.entries(overrides).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
        .map(([key, patch]) => [id(key, 'workspace id'), parsePatch(patch, 'workspaceOverrides.' + key)])
        .filter(([, patch]) => Object.keys(patch).length > 0);
    return freeze({
        extensionEnabled: boolean(raw.extensionEnabled, 'policy.extensionEnabled'),
        defaults: parsePatch(raw.defaults, 'policy.defaults'),
        workspaceOverrides: Object.fromEntries(entries),
    });
}
export function parsePolicySnapshot(value) {
    const raw = record(value, 'policy snapshot', ['revision', 'extensionEnabled', 'defaults', 'workspaceOverrides']);
    return freeze({ ...parsePolicyIntent({ extensionEnabled: raw.extensionEnabled, defaults: raw.defaults,
            workspaceOverrides: raw.workspaceOverrides }), revision: revision(raw.revision, 'policy revision') });
}
/** Apply the save-time master-gate transition to complete, parsed sparse intents.
 * Keep the other leaves untouched, including inactive feature and display settings.
 */
export function protectSkillsTransition(previous, draft) {
    const skills = (patch, defaults) => patch.skills?.enabled ?? defaults.skills?.enabled ?? true;
    const workspace = (patch, defaults) => patch.workspace?.enabled ?? defaults.workspace?.enabled ?? false;
    const toggleDefaults = skills({}, previous.defaults) !== skills({}, draft.defaults);
    const resetDefaults = toggleDefaults && workspace({}, draft.defaults);
    const defaults = resetDefaults ? { ...draft.defaults, workspace: { enabled: false } } : draft.defaults;
    const overrides = new Map(Object.entries(draft.workspaceOverrides));
    const find = (intent, key) => Object.hasOwn(intent.workspaceOverrides, key) ? intent.workspaceOverrides[key] : {};
    for (const key of new Set([...Object.keys(previous.workspaceOverrides), ...overrides.keys()])) {
        const oldSkills = skills(find(previous, key), previous.defaults);
        const patch = overrides.get(key) ?? {};
        const newSkills = skills(patch, draft.defaults);
        if (oldSkills !== newSkills && workspace(patch, defaults)) {
            // Includes an inherited ON or a simultaneous explicit attempt to turn both gates on.
            overrides.set(key, { ...patch, workspace: { enabled: false } });
        }
        else if (oldSkills && newSkills && workspace(patch, draft.defaults) && !workspace(patch, defaults)) {
            // A pinned Skills-on exception should not be turned off by a synthesized default reset.
            overrides.set(key, { ...patch, workspace: { enabled: true } });
        }
    }
    return parsePolicyIntent({ ...draft, defaults, workspaceOverrides: Object.fromEntries(overrides) });
}
/** Pure server-side resolution; display preferences never control functional eligibility. */
export function resolvePolicy(policy, controlWorkspaceId, workspaceVerified) {
    const parsed = parsePolicySnapshot(policy);
    const workspaceId = id(controlWorkspaceId, 'controlWorkspaceId');
    boolean(workspaceVerified, 'workspaceVerified');
    const override = Object.hasOwn(parsed.workspaceOverrides, workspaceId) ? parsed.workspaceOverrides[workspaceId] : {};
    const sources = {};
    const choose = (group, key, initial) => {
        const workspace = override[group];
        const global = parsed.defaults[group];
        const field = (group + '.' + key);
        if (workspace && Object.hasOwn(workspace, key)) {
            sources[field] = 'workspace';
            return workspace[key];
        }
        if (global && Object.hasOwn(global, key)) {
            sources[field] = 'global';
            return global[key];
        }
        sources[field] = 'safe-initial';
        return initial;
    };
    const windows = {
        ticketWindowSize: choose('windows', 'ticketWindowSize', null),
        runningSubagentLimit: choose('windows', 'runningSubagentLimit', null),
    };
    const pendingDecisions = { interactionMode: choose('pendingDecisions', 'interactionMode', 'native-question') };
    const workspaceEnabled = choose('workspace', 'enabled', false);
    const skillsEnabled = choose('skills', 'enabled', true);
    const collaborationEnabled = parsed.extensionEnabled && workspaceEnabled && skillsEnabled && workspaceVerified;
    const features = {};
    for (const feature of FEATURE_NAMES) {
        const requested = choose(feature, 'enabled', false);
        const reason = !skillsEnabled ? 'skills-disabled' : !parsed.extensionEnabled ? 'extension-disabled' : !workspaceEnabled ? 'workspace-disabled' : !requested ? 'feature-disabled'
            : !workspaceVerified ? 'workspace-unverified'
                : feature === 'windows' && (windows.ticketWindowSize === null || windows.runningSubagentLimit === null) ? 'window-capacity-unset' : null;
        features[feature] = { requested, status: reason === null ? 'configured'
                : reason === 'workspace-unverified' || reason === 'window-capacity-unset' ? 'unsupported' : 'disabled', reason };
    }
    const display = Object.fromEntries(DISPLAY_NAMES.map(key => [key, choose('display', key, DISPLAY_INITIAL[key])]));
    return freeze({ configurationRevision: parsed.revision, controlWorkspaceId: workspaceId, workspaceVerified,
        extensionEnabled: parsed.extensionEnabled, workspaceEnabled, skillsEnabled, collaborationEnabled, features, windows, pendingDecisions, display, sources });
}
