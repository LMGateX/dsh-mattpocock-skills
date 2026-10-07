import { boolean, capacity, freeze, id, record, revision } from './validation.js';
export const FEATURE_NAMES = ['binding', 'lifecycle', 'windows', 'ticketProgress', 'pendingDecisions'];
export const DISPLAY_NAMES = ['header', 'inputSummary', 'rightPanel', 'sessionList', 'timeline'];
/** No new-work automation and no guessed numeric capacities. */
export const INITIAL_POLICY = freeze({
    revision: 0, extensionEnabled: false, defaults: {}, workspaceOverrides: {},
});
const DISPLAY_INITIAL = { header: true, inputSummary: false, rightPanel: true, sessionList: false, timeline: true };
function parsePatch(value, where) {
    const raw = record(value, where, [...FEATURE_NAMES, 'workspace', 'skills', 'display']);
    const result = {};
    for (const feature of FEATURE_NAMES) {
        if (!Object.hasOwn(raw, feature))
            continue;
        const keys = feature === 'windows' ? ['enabled', 'ticketWindowSize', 'runningSubagentLimit'] : ['enabled'];
        const group = record(raw[feature], where + '.' + feature, keys);
        const parsed = {};
        for (const key of keys) {
            if (!Object.hasOwn(group, key))
                continue;
            parsed[key] = key === 'enabled' ? boolean(group[key], where + '.' + feature + '.' + key)
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
    const workspaceEnabled = choose('workspace', 'enabled', false);
    const skillsEnabled = choose('skills', 'enabled', true);
    const features = {};
    for (const feature of FEATURE_NAMES) {
        const requested = choose(feature, 'enabled', false);
        const reason = !parsed.extensionEnabled ? 'extension-disabled' : !workspaceEnabled ? 'workspace-disabled' : !requested ? 'feature-disabled'
            : !workspaceVerified ? 'workspace-unverified'
                : feature === 'windows' && (windows.ticketWindowSize === null || windows.runningSubagentLimit === null) ? 'window-capacity-unset' : null;
        features[feature] = { requested, status: reason === null ? 'configured'
                : reason === 'workspace-unverified' || reason === 'window-capacity-unset' ? 'unsupported' : 'disabled', reason };
    }
    const display = Object.fromEntries(DISPLAY_NAMES.map(key => [key, choose('display', key, DISPLAY_INITIAL[key])]));
    return freeze({ configurationRevision: parsed.revision, controlWorkspaceId: workspaceId, workspaceVerified,
        extensionEnabled: parsed.extensionEnabled, workspaceEnabled, skillsEnabled, features, windows, display, sources });
}
