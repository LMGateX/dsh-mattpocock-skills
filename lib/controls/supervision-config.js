import { boolean, boundedArray, freeze, id, invalid, record, revision } from './validation.js';
export const SUPERVISION_SCHEMA_VERSION = 1;
export const SUPERVISION_START_MODES = ['ticket-held', 'first-support-surge'];
export const SUPERVISION_ROUTE_MODES = ['inherit', 'explicit'];
export const SUPERVISION_DELIVERY_MODES = ['card', 'card+agent-check'];
export const SUPERVISION_SUSPICION_MODES = ['auto', 'off'];
export const SUPERVISION_DEFAULTS = freeze({
    enabled: false,
    scheduledIntervalMinutes: 60,
    scheduledMaxPerHour: 1,
    scheduledMaxPerDay: 24,
    scheduledDailyTokenBudget: 120000,
    rollingSummaryHours: 24,
    scheduledSummaryTopLanes: 4,
    suspicionStartMode: 'first-support-surge',
    suspicionMode: 'auto',
    checkIntervalMinutes: 20,
    noProgressChecks: 3,
    fastWindowMinutes: 90,
    supportWriteThreshold: 5,
    supportReadBackThreshold: 0.5,
    cooldownMinutes: 90,
    maxAuditsPer6h: 2,
    backoffFactor: 2,
    lazyCheck: true,
    dryRun: true,
    episodeRetentionDays: 30,
    episodeMaxEntries: 2000,
    reviewer: freeze({ routeMode: 'inherit', provider: '', model: '', reasoningEffort: '', maxTokens: 2048, timeoutMs: 45000, toolRounds: 1 }),
    delivery: freeze({ concern: 'card', alert: 'card+agent-check', alertMinNoProductHours: 4, alertMinSupportFiles: 10 }),
    softBudgetHours: null,
    deliverableRoots: freeze([]),
    supportRoots: freeze([]),
    excludeGlobs: freeze([]),
});
export const INITIAL_SUPERVISION_CONFIG = freeze({
    schemaVersion: 1, revision: 0, defaults: {}, workspaceOverrides: {},
});
const TOP_KEYS = [
    'enabled', 'scheduledIntervalMinutes', 'scheduledMaxPerHour', 'scheduledMaxPerDay',
    'scheduledDailyTokenBudget', 'rollingSummaryHours', 'scheduledSummaryTopLanes', 'suspicionStartMode', 'suspicionMode', 'checkIntervalMinutes',
    'noProgressChecks', 'fastWindowMinutes', 'supportWriteThreshold', 'supportReadBackThreshold',
    'cooldownMinutes', 'maxAuditsPer6h', 'backoffFactor', 'lazyCheck', 'dryRun', 'episodeRetentionDays', 'episodeMaxEntries', 'reviewer',
    'delivery', 'softBudgetHours', 'deliverableRoots', 'supportRoots', 'excludeGlobs',
];
const REVIEWER_KEYS = ['routeMode', 'provider', 'model', 'reasoningEffort', 'maxTokens', 'timeoutMs', 'toolRounds'];
const DELIVERY_KEYS = ['concern', 'alert', 'alertMinNoProductHours', 'alertMinSupportFiles'];
function text(value, where, maximum = 256) {
    if (typeof value !== 'string' || value.length > maximum || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value))
        invalid(where + ' must be a bounded single-line string');
    return value;
}
function integer(value, where, minimum, maximum) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum)
        invalid(where + ' must be an integer between ' + minimum + ' and ' + maximum);
    return value;
}
function decimal(value, where, minimum, maximum) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum)
        invalid(where + ' must be a number between ' + minimum + ' and ' + maximum);
    return value;
}
function oneOf(value, where, values) {
    if (typeof value !== 'string' || !values.includes(value))
        invalid(where + ' must be one of ' + values.join(', '));
    return value;
}
function strings(value, where) {
    const rows = boundedArray(value, where, 100).map((row, index) => {
        const parsed = text(row, where + '[' + index + ']', 512);
        if (parsed.length === 0)
            invalid(where + ' entries must be non-empty');
        return parsed;
    });
    if (new Set(rows).size !== rows.length)
        invalid(where + ' must not contain duplicates');
    return freeze(rows);
}
function parseReviewerPatch(value, where) {
    const raw = record(value, where, REVIEWER_KEYS);
    const result = {};
    if (Object.hasOwn(raw, 'routeMode'))
        result.routeMode = oneOf(raw.routeMode, where + '.routeMode', SUPERVISION_ROUTE_MODES);
    if (Object.hasOwn(raw, 'provider'))
        result.provider = text(raw.provider, where + '.provider', 256);
    if (Object.hasOwn(raw, 'model'))
        result.model = text(raw.model, where + '.model', 256);
    if (Object.hasOwn(raw, 'reasoningEffort'))
        result.reasoningEffort = text(raw.reasoningEffort, where + '.reasoningEffort', 64);
    if (Object.hasOwn(raw, 'maxTokens'))
        result.maxTokens = integer(raw.maxTokens, where + '.maxTokens', 256, 8192);
    if (Object.hasOwn(raw, 'timeoutMs'))
        result.timeoutMs = integer(raw.timeoutMs, where + '.timeoutMs', 5000, 120000);
    if (Object.hasOwn(raw, 'toolRounds'))
        result.toolRounds = integer(raw.toolRounds, where + '.toolRounds', 0, 2);
    return result;
}
function parseDeliveryPatch(value, where) {
    const raw = record(value, where, DELIVERY_KEYS);
    const result = {};
    if (Object.hasOwn(raw, 'concern'))
        result.concern = oneOf(raw.concern, where + '.concern', SUPERVISION_DELIVERY_MODES);
    if (Object.hasOwn(raw, 'alert'))
        result.alert = oneOf(raw.alert, where + '.alert', SUPERVISION_DELIVERY_MODES);
    if (Object.hasOwn(raw, 'alertMinNoProductHours'))
        result.alertMinNoProductHours = integer(raw.alertMinNoProductHours, where + '.alertMinNoProductHours', 1, 24);
    if (Object.hasOwn(raw, 'alertMinSupportFiles'))
        result.alertMinSupportFiles = integer(raw.alertMinSupportFiles, where + '.alertMinSupportFiles', 1, 100);
    return result;
}
function parsePatch(value, where) {
    const raw = record(value, where, TOP_KEYS);
    const result = {};
    const bools = ['enabled', 'lazyCheck', 'dryRun'];
    for (const key of bools)
        if (Object.hasOwn(raw, key))
            result[key] = boolean(raw[key], where + '.' + key);
    const ranges = [
        ['scheduledIntervalMinutes', 15, 240], ['scheduledMaxPerHour', 1, 4], ['scheduledMaxPerDay', 1, 24],
        ['scheduledDailyTokenBudget', 1000, 1000000], ['rollingSummaryHours', 1, 72], ['scheduledSummaryTopLanes', 1, 20], ['checkIntervalMinutes', 5, 60],
        ['noProgressChecks', 2, 12], ['fastWindowMinutes', 15, 180], ['supportWriteThreshold', 1, 100],
        ['cooldownMinutes', 15, 360], ['maxAuditsPer6h', 1, 12], ['backoffFactor', 1, 4],
        ['episodeRetentionDays', 1, 365], ['episodeMaxEntries', 100, 10000],
    ];
    for (const [key, minimum, maximum] of ranges)
        if (Object.hasOwn(raw, key)) {
            result[key] = integer(raw[key], where + '.' + key, minimum, maximum);
        }
    if (Object.hasOwn(raw, 'supportReadBackThreshold'))
        result.supportReadBackThreshold = decimal(raw.supportReadBackThreshold, where + '.supportReadBackThreshold', 0, 1);
    if (Object.hasOwn(raw, 'suspicionStartMode'))
        result.suspicionStartMode = oneOf(raw.suspicionStartMode, where + '.suspicionStartMode', SUPERVISION_START_MODES);
    if (Object.hasOwn(raw, 'suspicionMode'))
        result.suspicionMode = oneOf(raw.suspicionMode, where + '.suspicionMode', SUPERVISION_SUSPICION_MODES);
    if (Object.hasOwn(raw, 'reviewer')) {
        const reviewer = parseReviewerPatch(raw.reviewer, where + '.reviewer');
        if (Object.keys(reviewer).length > 0)
            result.reviewer = reviewer;
    }
    if (Object.hasOwn(raw, 'delivery')) {
        const delivery = parseDeliveryPatch(raw.delivery, where + '.delivery');
        if (Object.keys(delivery).length > 0)
            result.delivery = delivery;
    }
    if (Object.hasOwn(raw, 'softBudgetHours')) {
        result.softBudgetHours = raw.softBudgetHours === null ? null : integer(raw.softBudgetHours, where + '.softBudgetHours', 1, 720);
    }
    for (const key of ['deliverableRoots', 'supportRoots', 'excludeGlobs']) {
        if (Object.hasOwn(raw, key))
            result[key] = strings(raw[key], where + '.' + key);
    }
    return result;
}
function mergeSettings(defaults, override) {
    const reviewer = freeze({
        ...SUPERVISION_DEFAULTS.reviewer,
        ...(defaults.reviewer ?? {}),
        ...(override?.reviewer ?? {}),
    });
    const delivery = freeze({
        ...SUPERVISION_DEFAULTS.delivery,
        ...(defaults.delivery ?? {}),
        ...(override?.delivery ?? {}),
    });
    const merged = {
        ...SUPERVISION_DEFAULTS,
        ...defaults,
        ...(override ?? {}),
        reviewer,
        delivery,
        deliverableRoots: override?.deliverableRoots ?? defaults.deliverableRoots ?? SUPERVISION_DEFAULTS.deliverableRoots,
        supportRoots: override?.supportRoots ?? defaults.supportRoots ?? SUPERVISION_DEFAULTS.supportRoots,
        excludeGlobs: override?.excludeGlobs ?? defaults.excludeGlobs ?? SUPERVISION_DEFAULTS.excludeGlobs,
        softBudgetHours: override && Object.hasOwn(override, 'softBudgetHours') ? override.softBudgetHours ?? null
            : defaults && Object.hasOwn(defaults, 'softBudgetHours') ? defaults.softBudgetHours ?? null : null,
    };
    return freeze(merged);
}
export function resolveSupervisionSettings(snapshot, workspaceId) {
    if (workspaceId !== null)
        id(workspaceId, 'workspaceId');
    return mergeSettings(snapshot.defaults, workspaceId === null ? undefined : snapshot.workspaceOverrides[workspaceId]);
}
function assertResolved(settings, where) {
    if (settings.reviewer.routeMode === 'explicit' && (settings.reviewer.provider.length === 0 || settings.reviewer.model.length === 0)) {
        invalid(where + ': explicit reviewer route requires provider and model');
    }
}
function parseIntentRaw(value) {
    const raw = record(value, 'supervision config intent', ['defaults', 'workspaceOverrides']);
    const overrides = record(raw.workspaceOverrides, 'supervision workspaceOverrides');
    const entries = Object.entries(overrides).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, patch]) => {
        const workspace = id(key, 'supervision workspace id');
        return [workspace, parsePatch(patch, 'supervision workspaceOverrides.' + workspace)];
    }).filter(([, patch]) => Object.keys(patch).length > 0);
    return freeze({
        defaults: parsePatch(raw.defaults, 'supervision defaults'),
        workspaceOverrides: Object.fromEntries(entries),
    });
}
export function parseSupervisionConfigIntent(value) {
    const parsed = parseIntentRaw(value);
    assertResolved(resolveSupervisionSettings(parsed, null), 'supervision defaults');
    for (const workspace of Object.keys(parsed.workspaceOverrides))
        assertResolved(resolveSupervisionSettings(parsed, workspace), 'supervision workspaceOverrides.' + workspace);
    return parsed;
}
export function parseSupervisionConfigSnapshot(value) {
    const raw = record(value, 'supervision config snapshot', ['schemaVersion', 'revision', 'defaults', 'workspaceOverrides']);
    if (raw.schemaVersion !== 1)
        invalid('unsupported supervision schemaVersion');
    const parsed = parseSupervisionConfigIntent({ defaults: raw.defaults, workspaceOverrides: raw.workspaceOverrides });
    return freeze({ schemaVersion: 1, revision: revision(raw.revision, 'supervision revision'), ...parsed });
}
export const parseSupervisionConfigDocument = parseSupervisionConfigSnapshot;
export function supervisionIntentOf(snapshot) {
    return freeze({ defaults: snapshot.defaults, workspaceOverrides: snapshot.workspaceOverrides });
}
export function ownSupervisionLeaf(intent, workspaceId, field) {
    const patch = workspaceId === null ? intent.defaults : intent.workspaceOverrides[workspaceId];
    if (!patch)
        return undefined;
    const dot = field.indexOf('.');
    if (dot < 0)
        return patch[field];
    const group = field.slice(0, dot), key = field.slice(dot + 1);
    const nested = group === 'reviewer' ? patch.reviewer : patch.delivery;
    return nested ? nested[key] : undefined;
}
export function setSupervisionLeaf(intent, workspaceId, field, value) {
    if (workspaceId !== null)
        id(workspaceId, 'workspaceId');
    const next = JSON.parse(JSON.stringify(intent));
    const target = workspaceId === null ? next.defaults : (next.workspaceOverrides[workspaceId] ?? (next.workspaceOverrides[workspaceId] = {}));
    const dot = field.indexOf('.');
    if (dot < 0) {
        if (value === undefined)
            delete target[field];
        else
            target[field] = value;
    }
    else {
        const group = field.slice(0, dot), key = field.slice(dot + 1);
        const nested = target[group] ?? {};
        if (value === undefined)
            delete nested[key];
        else
            nested[key] = value;
        if (Object.keys(nested).length === 0)
            delete target[group];
        else
            target[group] = nested;
    }
    if (workspaceId !== null && Object.keys(target).length === 0)
        delete next.workspaceOverrides[workspaceId];
    // Structural parse catches wrong field types without requiring a complete explicit route while the user is typing.
    const parsed = parseIntentRaw(next);
    return parsed;
}
