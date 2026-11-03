import { isAbsolute, normalize } from 'node:path';
import { ControlsError, freeze, id, invalid, record, revision } from './validation.js';
/** Snapshot cap only; the durable owner document retains one row per child. */
export const NATIVE_EXECUTION_SNAPSHOT_LIMIT = 64;
const STATES = ['created', 'running', 'ended', 'disposed'];
function boundedText(value, where, maximum = 1024) {
    if (typeof value !== 'string' || value.length === 0 || value.length > maximum || /[\u0000-\u001f\u007f]/u.test(value))
        invalid(where + ' must be bounded non-empty text');
    return value;
}
function optionalText(value, where) {
    if (value === null)
        return null;
    return boundedText(value, where, 512);
}
function absolutePath(value, where) {
    if (typeof value !== 'string' || !isAbsolute(value) || normalize(value) !== value || /[\u0000-\u001f\u007f]/u.test(value))
        invalid(where + ' must be a normalized absolute path');
    return value;
}
function optionalPath(value, where) {
    return value === null ? null : absolutePath(value, where);
}
function optionalRevision(value, where) {
    return value === null ? null : revision(value, where);
}
/**
 * Strict storage parser; malformed rows are rejected, never silently reset. `initialCwd` is
 * accepted only as the legacy spelling of the same header value. A row that carries both keys
 * is accepted only when the values agree; conflicting values are rejected rather than choosing
 * one silently. Every read result exposes only `headerCwd`, and every new write stores only
 * `headerCwd`.
 */
export function parseNativeExecutionFact(value) {
    const r = record(value, 'native execution fact', ['executionId', 'sessionId', 'parentSessionId', 'instrumentInstanceId',
        'provider', 'runId', 'headerCwd', 'initialCwd', 'state', 'outcome', 'observed', 'startedAt', 'endedAt', 'recordedAt']);
    const hasHeader = Object.hasOwn(r, 'headerCwd'), hasLegacy = Object.hasOwn(r, 'initialCwd');
    if (!hasHeader && !hasLegacy)
        invalid('native execution fact requires headerCwd (legacy initialCwd is accepted only as a read-compatible input)');
    const headerCwd = hasHeader ? optionalPath(r.headerCwd, 'native headerCwd') : optionalPath(r.initialCwd, 'legacy native initialCwd');
    if (hasHeader && hasLegacy && headerCwd !== optionalPath(r.initialCwd, 'legacy native initialCwd'))
        invalid('native execution fact has conflicting headerCwd and legacy initialCwd values');
    const executionId = id(r.executionId, 'native executionId'), sessionId = id(r.sessionId, 'native sessionId');
    if (executionId !== sessionId)
        invalid('native execution identity must equal its child session');
    if (!STATES.includes(r.state))
        invalid('unknown native execution state');
    const state = r.state;
    const outcome = optionalText(r.outcome, 'native outcome');
    const endedAt = optionalRevision(r.endedAt, 'native endedAt');
    if (state === 'ended' ? outcome === null || endedAt === null : outcome !== null || endedAt !== null)
        invalid('native execution outcome/end belong only to an ended row');
    return freeze({ executionId, sessionId, parentSessionId: id(r.parentSessionId, 'native parentSessionId'),
        instrumentInstanceId: id(r.instrumentInstanceId, 'native instrumentInstanceId'),
        provider: optionalText(r.provider, 'native provider'), runId: optionalText(r.runId, 'native runId'),
        headerCwd,
        state, outcome, observed: boundedText(r.observed, 'native observed'), startedAt: revision(r.startedAt, 'native startedAt'),
        endedAt, recordedAt: revision(r.recordedAt, 'native recordedAt') });
}
function sameFact(a, b) {
    return a.executionId === b.executionId && a.sessionId === b.sessionId && a.parentSessionId === b.parentSessionId
        && a.instrumentInstanceId === b.instrumentInstanceId && a.provider === b.provider && a.runId === b.runId
        && a.headerCwd === b.headerCwd && a.state === b.state && a.outcome === b.outcome
        && a.observed === b.observed && a.startedAt === b.startedAt && a.endedAt === b.endedAt;
}
function committed(existing, candidate, at) {
    if (existing === undefined)
        return freeze({ ...candidate, recordedAt: at });
    if (sameFact(candidate, existing))
        return null;
    return freeze({ ...candidate, recordedAt: at });
}
/**
 * Pure event fold for one native child session. Returns null when the event is equivalent to
 * the stored row, so repeated lifecycle edges never add a document revision. `agent/status`
 * has no event here: activity is read from the live Agent and never stored.
 *
 * An end edge is fenced by host run identity. When both the stored row and the event name a
 * run they must agree; when the event omits the run while the row belongs to one, the outcome
 * cannot be attributed and is rejected instead of guessed from arrival order. A row that never
 * learned a run id may learn it from the end edge. Repeated end of the same run/outcome is
 * equivalent and writes no revision.
 */
export function applyNativeExecutionEvent(existing, event, at) {
    const timestamp = revision(at, 'native recordedAt');
    if (existing !== undefined && (existing.parentSessionId !== event.parentSessionId || existing.instrumentInstanceId !== event.instrumentInstanceId))
        throw new ControlsError('association-conflict', 'native execution row belongs to another parent or instrument instance');
    const headerCwd = existing?.headerCwd ?? event.headerCwd ?? null;
    const base = existing ?? { executionId: event.sessionId, sessionId: event.sessionId,
        parentSessionId: event.parentSessionId, instrumentInstanceId: event.instrumentInstanceId, provider: null, runId: null,
        headerCwd: null, state: 'created', outcome: null, observed: 'agent/created', startedAt: timestamp, endedAt: null, recordedAt: timestamp };
    let candidate;
    switch (event.kind) {
        case 'created':
            // A creation edge fills an absent row. On an existing row it may fill the immutable
            // header cwd but never rewrites a recorded state: a wake is proven by its start edge.
            candidate = existing === undefined
                ? { ...base, headerCwd, state: 'created', outcome: null, endedAt: null, observed: 'agent/created', startedAt: event.createdAt ?? timestamp }
                : { ...base, headerCwd };
            break;
        case 'start': {
            // A new activation with no host run identity cannot be told apart from a duplicate start or
            // from an older run. Never inherit the previous run id: that would let the old end pass the
            // run fence and overwrite the new activation. Preserve the current row and report a gap.
            if (event.runId === null && base.runId !== null) {
                if (base.state === 'running')
                    return null;
                throw new ControlsError('association-conflict', 'native start has no host run identity while the stored row belongs to a specific run; new activation is not attributable');
            }
            const newActivation = base.state !== 'running' || base.runId !== event.runId;
            candidate = { ...base, headerCwd, state: 'running', provider: event.provider ?? base.provider,
                runId: newActivation ? event.runId ?? null : base.runId, outcome: null, endedAt: null, observed: 'subagent/start',
                startedAt: newActivation ? timestamp : base.startedAt };
            break;
        }
        case 'end': {
            const runId = event.runId ?? null;
            if (base.runId !== null && runId !== null && base.runId !== runId)
                throw new ControlsError('association-conflict', 'native execution end belongs to another host run than the stored row');
            if (base.runId !== null && runId === null)
                throw new ControlsError('association-conflict', 'native execution end has no host run identity while the stored row belongs to a specific run; outcome coverage is unknown');
            if (base.state === 'ended' && base.outcome !== event.outcome)
                throw new ControlsError('association-conflict', 'native execution already published a different outcome for this run; later end coverage is unknown');
            const observed = 'subagent/end: ' + event.outcome;
            const duplicate = base.state === 'ended' && base.outcome === event.outcome && base.observed === observed;
            candidate = { ...base, headerCwd, state: 'ended', outcome: event.outcome, runId: base.runId ?? runId,
                endedAt: duplicate ? base.endedAt : timestamp, observed };
            break;
        }
        default:
            candidate = base.state === 'ended' ? { ...base, headerCwd } : { ...base, headerCwd, state: 'disposed', outcome: null, endedAt: null, observed: 'agent/disposed' };
            break;
    }
    return committed(existing, candidate, timestamp);
}
/** Latest rows first; ties use the stable execution id so a snapshot is deterministic. */
export function latestNativeExecutions(facts, limit = NATIVE_EXECUTION_SNAPSHOT_LIMIT) {
    const maximum = Math.max(0, Math.floor(limit));
    return [...facts].sort((a, b) => b.recordedAt - a.recordedAt || (a.executionId < b.executionId ? -1 : a.executionId > b.executionId ? 1 : 0)).slice(0, maximum);
}
export function nativeExecutionActivity(agent) {
    return agent === undefined ? 'gone' : agent.status === 'running' ? 'running' : 'idle';
}
/** Assignment/binding association is inferred; it never creates or rewrites a binding. */
export function nativeExecutionLane(assignment, binding) {
    if (assignment === undefined && binding === undefined)
        return null;
    return freeze({ workflowId: assignment?.workflowId ?? null, ticketIds: assignment?.ticketIds ?? binding?.ticketIds ?? [],
        task: binding?.task ?? null, source: 'inferred' });
}
/**
 * Read-time child association for one observed tree. Only the observed tree creator yields a
 * `created-tree` row; the creator's header cwd is carried as source data and may be null. No
 * path-equality relation is produced: a matching header path does not prove the child started
 * in, or uses, that tree.
 */
export function nativeChildrenForObservation(creatorSessionId, facts) {
    const rows = [];
    for (const fact of facts) {
        if (fact.sessionId !== creatorSessionId)
            continue;
        rows.push(freeze({ sessionId: fact.sessionId, headerCwd: fact.headerCwd, relation: 'created-tree', source: 'observed' }));
    }
    return freeze(rows.sort((a, b) => a.sessionId < b.sessionId ? -1 : a.sessionId > b.sessionId ? 1 : 0));
}
export function projectNativeExecution(fact, assignment, binding, agent) {
    return freeze({ ...fact, activity: nativeExecutionActivity(agent), lane: nativeExecutionLane(assignment, binding) });
}
