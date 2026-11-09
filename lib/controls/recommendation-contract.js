import { boolean, freeze, id, invalid, record, revision } from './validation.js';
export const RECOMMENDATION_REMOTE_NAMESPACE = 'mattpocockRecommendationSupport';
export const RECOMMENDATION_REMOTE_METHODS = ['readOwnerDecisionPolicy', 'saveOwnerDecisionPolicy'];
export function parseRecommendationInstance(value) {
    const r = record(value, 'policy instance', ['instrumentInstanceId', 'ownerSessionId', 'controlWorkspaceId']);
    return freeze({ instrumentInstanceId: id(r.instrumentInstanceId, 'instrumentInstanceId'), ownerSessionId: id(r.ownerSessionId, 'ownerSessionId'), controlWorkspaceId: id(r.controlWorkspaceId, 'controlWorkspaceId') });
}
export function parseOperatorAuthor(value) {
    const r = record(value, 'operator author', ['kind', 'principalId', 'sessionId']);
    if (r.kind !== 'user' || r.sessionId !== null)
        invalid('policy author must be an authenticated operator user');
    return freeze({ kind: 'user', principalId: id(r.principalId, 'operator principalId'), sessionId: null });
}
function positive(value, where) { const n = revision(value, where); if (n === 0)
    invalid(where + ' must be positive'); return n; }
export function parseOwnerDecisionPolicyEpoch(value) {
    const r = record(value, 'policy epoch', ['epochId', 'policyRevision', 'scope', 'enabledAt', 'expiresAt', 'authorizedBy']);
    if (r.scope !== 'new-decisions')
        invalid('policy scope must be new-decisions');
    const enabledAt = revision(r.enabledAt, 'enabledAt'), expiresAt = r.expiresAt === null ? null : revision(r.expiresAt, 'expiresAt');
    if (expiresAt !== null && (expiresAt <= enabledAt || expiresAt - enabledAt > 86400000))
        invalid('policy epoch must be 1..86400000ms or persistent');
    return freeze({ epochId: id(r.epochId, 'epochId'), policyRevision: positive(r.policyRevision, 'policyRevision'), scope: 'new-decisions', enabledAt, expiresAt, authorizedBy: parseOperatorAuthor(r.authorizedBy) });
}
export function parseOwnerDecisionPolicyState(value) {
    const r = record(value, 'policy state', ['revision', 'enabled', 'epoch']);
    const state = { revision: revision(r.revision, 'policy revision'), enabled: boolean(r.enabled, 'enabled'), epoch: r.epoch === null ? null : parseOwnerDecisionPolicyEpoch(r.epoch) };
    if (state.enabled && !state.epoch || state.epoch && state.epoch.policyRevision > state.revision)
        invalid('policy epoch revision/enabled mismatch');
    return freeze(state);
}
export function parseOwnerDecisionPolicySaveRequest(value) {
    const r = record(value, 'policy save request');
    if (r.action !== 'enable' && r.action !== 'disable')
        invalid('policy save requires enable or disable');
    record(value, 'policy save request', ['operationId', 'expectedRevision', 'expectedScope', 'action', ...(r.action === 'enable' ? ['durationMs'] : [])]);
    const base = { operationId: id(r.operationId, 'operationId'), expectedRevision: revision(r.expectedRevision, 'expectedRevision'), expectedScope: parseRecommendationInstance(r.expectedScope) };
    if (r.action === 'disable')
        return freeze({ ...base, action: 'disable' });
    if (r.durationMs === null)
        return freeze({ ...base, action: 'enable', durationMs: null });
    const durationMs = positive(r.durationMs, 'durationMs');
    if (durationMs > 86400000)
        invalid('durationMs must be 1..86400000 or null');
    return freeze({ ...base, action: 'enable', durationMs });
}
export function parseOwnerDecisionPolicySnapshot(value) {
    const r = record(value, 'policy snapshot', ['schemaVersion', 'instance', 'revision', 'saved', 'effective']);
    if (r.schemaVersion !== 1)
        invalid('unsupported policy snapshot version');
    const saved = record(r.saved, 'saved policy', ['enabled', 'epoch']), effective = record(r.effective, 'effective policy', ['status', 'reason']);
    if (!['active', 'disabled', 'expired', 'feature-disabled', 'unknown'].includes(effective.status))
        invalid('unknown policy status');
    const state = parseOwnerDecisionPolicyState({ revision: r.revision, ...saved });
    return freeze({ schemaVersion: 1, instance: parseRecommendationInstance(r.instance), revision: state.revision, saved: { enabled: state.enabled, epoch: state.epoch }, effective: { status: effective.status, reason: nullableReason(effective.reason) } });
}
function nullableReason(value) { return value === null ? null : id(value, 'reason'); }
export function parseOwnerDecisionPolicyOperation(value) {
    const r = record(value, 'policy operation', ['action', 'epochId', 'expiresAt']);
    if (r.action !== 'enable' && r.action !== 'disable')
        invalid('unknown policy operation');
    const epochId = r.epochId === null ? null : id(r.epochId, 'epochId'), expiresAt = r.expiresAt === null ? null : revision(r.expiresAt, 'expiresAt');
    // Enable always opens an epoch; disable may retain a persistent epoch (epochId set, expiresAt null).
    if (r.action === 'enable' ? epochId === null : epochId === null && expiresAt !== null)
        invalid('policy operation epoch mismatch');
    return freeze({ action: r.action, epochId, expiresAt });
}
export function parseOwnerDecisionPolicySaveResult(value) {
    const r = record(value, 'policy save result', ['appliedRevision', 'replayed', 'operation', 'snapshot']);
    return freeze({ appliedRevision: positive(r.appliedRevision, 'appliedRevision'), replayed: boolean(r.replayed, 'replayed'), operation: parseOwnerDecisionPolicyOperation(r.operation), snapshot: parseOwnerDecisionPolicySnapshot(r.snapshot) });
}
export function parseDecisionPolicyBinding(value) {
    const r = record(value, 'decision policy binding', ['createdRevision', 'optionKey', 'policy']);
    return freeze({ createdRevision: positive(r.createdRevision, 'createdRevision'), optionKey: id(r.optionKey, 'optionKey'), policy: parseOwnerDecisionPolicyEpoch(r.policy) });
}
export function parseDecisionPolicySelection(value) {
    const r = record(value, 'decision policy selection', ['kind', 'selectedOptionKey', 'decisionSourceRevision', 'policy', 'authorizedAt']);
    if (r.kind !== 'owner-policy')
        invalid('unknown decision selection kind');
    const policy = parseOwnerDecisionPolicyEpoch(r.policy), authorizedAt = revision(r.authorizedAt, 'authorizedAt');
    if (authorizedAt < policy.enabledAt || policy.expiresAt !== null && authorizedAt >= policy.expiresAt)
        invalid('selection time outside authorization epoch');
    return freeze({ kind: 'owner-policy', selectedOptionKey: id(r.selectedOptionKey, 'selectedOptionKey'), decisionSourceRevision: positive(r.decisionSourceRevision, 'decisionSourceRevision'), policy, authorizedAt });
}
export function parseDecisionPolicyEventEffect(value) {
    const r = record(value, 'decision policy effect');
    if (r.kind === 'bound') {
        record(value, 'binding effect', ['kind', 'binding']);
        return freeze({ kind: 'bound', binding: parseDecisionPolicyBinding(r.binding) });
    }
    if (r.kind === 'adopted') {
        record(value, 'adoption effect', ['kind', 'selection']);
        return freeze({ kind: 'adopted', selection: parseDecisionPolicySelection(r.selection) });
    }
    return invalid('unknown decision policy effect');
}
/** Stable effective buckets; caller samples its trusted clock, never a model timestamp. */
export function evaluateOwnerDecisionPolicy(state, featureConfigured, now) {
    if (!featureConfigured)
        return freeze({ status: 'feature-disabled', reason: 'feature-disabled' });
    if (!state.enabled || !state.epoch)
        return freeze({ status: 'disabled', reason: 'policy-disabled' });
    if (!Number.isSafeInteger(now) || now < state.epoch.enabledAt)
        return freeze({ status: 'unknown', reason: 'clock-unavailable' });
    if (state.epoch.expiresAt !== null && now >= state.epoch.expiresAt)
        return freeze({ status: 'expired', reason: 'policy-expired' });
    return freeze({ status: 'active', reason: null });
}
/** Decision-local eligibility; no task/business semantic inference. */
export function evaluateRecommendationSupport(row, state, featureConfigured, now) {
    if (row.policySelection)
        return freeze({ status: 'adopted', selection: row.policySelection });
    if (!state)
        return freeze({ status: 'unknown', reason: 'policy-unavailable' });
    const effective = evaluateOwnerDecisionPolicy(state, featureConfigured, now);
    if (effective.status === 'unknown')
        return freeze({ status: 'unknown', reason: 'policy-unavailable' });
    const ineligible = (reason) => freeze({ status: 'not-eligible', reason });
    if (effective.status === 'feature-disabled')
        return ineligible('feature-disabled');
    if (effective.status === 'disabled')
        return ineligible('policy-disabled');
    if (effective.status === 'expired')
        return ineligible('policy-expired');
    const binding = row.policyBinding;
    if (!binding)
        return ineligible('no-creation-binding');
    if (row.revision !== binding.createdRevision)
        return ineligible('decision-changed');
    if (row.value.pending !== true || row.value.addressee?.kind !== 'user')
        return ineligible('not-pending-user');
    if (row.value.addressee.principalId != null && row.value.addressee.principalId !== state.epoch.authorizedBy.principalId)
        return ineligible('different-addressee');
    if (row.value.recommendation !== binding.optionKey || row.value.options?.filter(o => o.key === binding.optionKey).length !== 1)
        return ineligible('no-exact-recommendation');
    if (state.epoch.epochId !== binding.policy.epochId || state.epoch.policyRevision !== binding.policy.policyRevision || JSON.stringify(state.epoch) !== JSON.stringify(binding.policy))
        return ineligible('policy-epoch-changed');
    return freeze({ status: 'candidate', candidate: { optionKey: binding.optionKey, decisionRevision: row.revision, policyEpochId: binding.policy.epochId, policyRevision: binding.policy.policyRevision, expiresAt: binding.policy.expiresAt } });
}
function strict(name, parse) { return { mode: 'strict', typeSymbol: RECOMMENDATION_REMOTE_NAMESPACE + '#' + name, create: () => ({ parse }) }; }
function descriptor(method, parameters, result) {
    return { id: '@lmgatex/dsh-mattpocock-skills#' + RECOMMENDATION_REMOTE_NAMESPACE + '/' + method, service: RECOMMENDATION_REMOTE_NAMESPACE, namespace: RECOMMENDATION_REMOTE_NAMESPACE, method, invocation: { kind: 'direct' }, parameters: parameters.map(([name, codec]) => ({ name, wire: name, source: 'json', codec })), result, ...(method === 'readOwnerDecisionPolicy' ? { cancellation: { parameter: 'signal' } } : {}) };
}
const sessionCodec = strict('SessionId', v => id(v, 'sessionId'));
export const RECOMMENDATION_REMOTE_CONTRIBUTION = freeze({ package: '@lmgatex/dsh-mattpocock-skills/recommendation-support', descriptors: [
        descriptor('readOwnerDecisionPolicy', [['sessionId', sessionCodec]], strict('OwnerDecisionPolicySnapshot', parseOwnerDecisionPolicySnapshot)),
        descriptor('saveOwnerDecisionPolicy', [['sessionId', sessionCodec], ['request', strict('OwnerDecisionPolicySaveRequest', parseOwnerDecisionPolicySaveRequest)]], strict('OwnerDecisionPolicySaveResult', parseOwnerDecisionPolicySaveResult)),
    ] });
