import { createHash } from 'node:crypto';
import { lstat, readlink } from 'node:fs/promises';
import { isAbsolute, normalize } from 'node:path';
import { classifyRunnerFailure, matchesSignature } from '@deepseek-ai/dsh-sandbox';
import { ResourceError } from './controls/resources.js';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { Session, SessionId } from '@deepseek-ai/dsh-session';
import { WorkspaceId } from '@deepseek-ai/dsh-workspace';
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
import { foldSubagentDescriptor } from '@deepseek-ai/dsh-subagent';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { z } from 'zod';
import { createModelTools, sourceKey } from './model-tools.js';
import { ModelOutputError, previewText } from './controls/model-output.js';
import { createDomainControlsStorage } from './controls/storage.js';
import { parseControlsDocument } from './controls/state.js';
import { createDomainInstrumentStorage } from './controls/instrument-storage.js';
import { parseInstrumentCommand, parseInstrumentDocument } from './controls/instrument-state.js';
import { parsePolicyIntent, parsePolicySnapshot } from './controls/policy.js';
import { INITIAL_SUPERVISION_CONFIG, parseSupervisionConfigDocument, parseSupervisionConfigIntent, parseSupervisionConfigSnapshot, resolveSupervisionSettings } from './controls/supervision-config.js';
import { SupervisionLedger } from './controls/supervision-ledger.js';
import { decideSupervisionTrigger, deterministicReview, initialSupervisionDocument, makeSupervisionEpisode, parseSupervisionDocument, supervisionAgentText, withSupervisionEpisode } from './controls/supervision-audit.js';
import { createDomainWindowStorage, parseWindowDocument, parseTicketWindowCommand } from './controls/windows.js';
import { createDomainResourceStorage, parseResourceDocument } from './controls/resources.js';
import { createDomainVersionedStorage } from './controls/versioned-storage.js';
import { RECOMMENDATION_REMOTE_NAMESPACE, RECOMMENDATION_REMOTE_CONTRIBUTION, parseOwnerDecisionPolicySaveRequest, parseOwnerDecisionPolicySnapshot, parseOwnerDecisionPolicySaveResult } from './controls/recommendation-contract.js';
import { REMOTE_NAMESPACE, REMOTE_CONTRIBUTION, parseHostJson, createHostJsonRepresentation, parsePolicyGrants, parseResourceAction, parseSessionSummaryRequest, parseSessionSummaryBatch } from './controls/remote-contract.js';
import { boolean, ControlsError, freeze, id, increment, memoized, record, revision } from './controls/validation.js';
function snapshotContent(value) {
    if (value === null || typeof value !== 'object')
        return JSON.stringify(value);
    if (Array.isArray(value))
        return '[' + value.map(snapshotContent).join(',') + ']';
    return '{' + Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
        .map(([key, entry]) => JSON.stringify(key) + ':' + snapshotContent(entry)).join(',') + '}';
}
export function makeSnapshotMessage(text) {
    if (typeof text !== 'string' || text.length > 262144 || text.includes('\0'))
        throw new ControlsError('invalid-input', 'snapshot must be bounded text');
    return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'mattpocock-controls', form: 'snapshot', sections: [{ name: 'collaboration-instrument', text }] } });
}
export function makeSupervisionNotice(episode) {
    const text = supervisionAgentText(episode);
    return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'mattpocock-controls-supervision', form: 'notice', summary: text.slice(0, 240), episodeId: episode.episodeId, ownerSessionId: episode.ownerSessionId, severity: 'alert' } });
}
export const HOST_CAPABILITIES = freeze({
    nativeInitialChildCwd: 'unsupported', allNativeWakeAdmission: 'unsupported',
    multiRootGitWriteScopes: 'unsupported', managedToolRouting: 'supported',
    nativeLifecycleObservation: 'supported', dynamicContext: 'supported',
});
function initialChildCwdSeam(ctx) {
    const subagents = ctx.get('subagents');
    if (!subagents)
        return 'unsupported';
    // Upstream resolves the directory through the session working-directory owner;
    // a service that carries the method without that owner cannot honor the value.
    if (typeof subagents.startActivation === 'function' && ctx.get('workingDirectory')?.ensure !== undefined)
        return 'native';
    return 'unsupported';
}
function hasNativeInitialChildCwd(ctx) {
    return initialChildCwdSeam(ctx) === 'native';
}
/** Direct discovery rows have no kind/activity discriminator. Normalize at this adapter,
 * not in the counter, and keep malformed program data as an explicit coverage gap. */
function nativeDirectRows(value) {
    const malformed = () => ({ kind: 'diagnostic', id: null, reason: 'invalid' });
    if (!Array.isArray(value))
        return [malformed()];
    return Array.from(value, value => {
        try {
            const row = record(value, 'native direct-child catalog row', ['id', 'createdAt', 'mode', 'label']);
            const childId = id(row.id, 'native catalog child id');
            if (typeof row.createdAt !== 'number' || !Number.isFinite(row.createdAt)
                || row.label !== undefined && typeof row.label !== 'string'
                || row.mode === 'continuable' && typeof row.label !== 'string') {
                throw new ControlsError('invalid-input', 'invalid native direct-child catalog fields');
            }
            if (row.mode === 'unknown')
                return { kind: 'diagnostic', id: childId, reason: 'unsupported' };
            if (row.mode !== 'one-shot' && row.mode !== 'continuable' && row.mode !== 'external')
                return malformed();
            return { kind: 'child', id: childId, mode: row.mode };
        }
        catch {
            return malformed();
        }
    });
}
function nativeSubagentLister(ctx) {
    const service = ctx.get('subagents');
    if (service === undefined || typeof service.listDescendants !== 'function' && typeof service.listChildren !== 'function')
        return undefined;
    return service;
}
/** Await a catalog call for at most its deadline: a callee that ignores its own signal, or a
 * single catalog read that never returns, still cannot hold a step or a snapshot read open. */
async function withinDeadline(task, deadline) {
    const timeout = new Promise(resolve => {
        const fire = () => resolve({ timedOut: true, value: undefined, error: undefined });
        if (deadline.aborted)
            fire();
        else
            deadline.addEventListener('abort', fire, { once: true });
    });
    const settled = task.then(value => ({ timedOut: false, value, error: undefined }), error => ({ timedOut: false, value: undefined, error }));
    const outcome = await Promise.race([settled, timeout]);
    if (outcome.timedOut)
        throw new ControlsError('deadline-exceeded', 'native subagent catalog did not answer within its budget');
    if (outcome.error !== undefined)
        throw outcome.error;
    return outcome.value;
}
/** A read path waits at most this long for the native catalog before stating a lower bound. */
const NATIVE_CATALOG_BUDGET_MS = 1_500;
/** After a timeout, wait this long before paying for another catalog projection build. */
const NATIVE_CATALOG_RETRY_MS = 30_000;
/** Cancellations this owner side caused: a parent turn cancellation or the run's own disposal. */
const OWN_CANCEL_CAUSES = new Set(['parent', 'disposed']);
function jsonRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}
function boundedText(value, max) {
    return typeof value === 'string' && value.length > 0 && value.length <= max && !value.includes('\u0000') ? value : null;
}
function safeIndex(value) {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
/**
 * Read a child's own event suffix into the published turn-end vocabulary. Nothing is synthesized:
 * a reason kind this build does not recognize stays `unknown`, an aborted cause is the published
 * `TurnCancelCause` kind, and a failure diagnostic is the published `LlmFailure` code/message.
 */
export function observeNativeTurn(events) {
    let lastTurn = null, lastSeq = null, end = null;
    for (const event of events) {
        const data = jsonRecord(event.data);
        const turn = safeIndex(data?.turn), seq = safeIndex(event.seq);
        if (turn !== null)
            lastTurn = turn;
        if (seq !== null)
            lastSeq = seq;
        if (event.type !== 'turn/end' || data === undefined || turn === null || seq === null)
            continue;
        const reason = jsonRecord(data.reason), kind = reason?.kind;
        if (kind === 'error') {
            const failure = jsonRecord(reason?.error);
            const code = boundedText(failure?.code, 256), message = boundedText(failure?.message, 4096);
            const parts = [code, message].filter((part) => part !== null);
            end = freeze({ kind, turn, seq, cause: null, diagnostic: parts.length === 0 ? null : parts.join(': ') });
        }
        else if (kind === 'aborted') {
            end = freeze({ kind, turn, seq, cause: boundedText(jsonRecord(reason?.reason)?.kind, 64), diagnostic: null });
        }
        else if (kind === 'completed' || kind === 'blocked' || kind === 'max-tokens' || kind === 'interrupted' || kind === 'forked') {
            end = freeze({ kind, turn, seq, cause: null, diagnostic: null });
        }
        else {
            // Merge-extended kind: a turn ended, but this build cannot claim why.
            end = freeze({ kind: 'unknown', turn, seq, cause: null, diagnostic: null });
        }
    }
    return freeze({ end, lastTurn, lastSeq });
}
/**
 * Event-driven native running count for one mount.
 *
 * Membership comes from the durable catalog (`listDescendants`, recursive `listChildren`
 * fallback) and is refreshed only at membership-change nodes (agent/created, agent/disposed,
 * `subagent/catalog`, unknown subagent/start-end ids, a first baseline read, or a read that
 * finds a live descendant the membership does not know). A read is O(live agents) and performs
 * no catalog IO once membership is fresh.
 *
 * The count is the host's live run status: descendant subagents whose live `Agent.status` is
 * `running`. The catalog `activity` field is session residency, not execution, so idle
 * resident children stay out of the count. External children own no local Agent and are never
 * counted.
 *
 * `subagent/start` / `subagent/end` build an expected-run ledger. The installed host
 * publishes `subagent/start` before the child's driver wakes (dsh-subagent emits the start edge
 * during materialization and delivers the initial prompt afterwards), so a start's own node does
 * not reconcile it; the following node reconciles it against the live set.
 *
 * Terminal outcomes come from the host's own vocabulary, never from inference:
 * - Primary path: a `subagent/end` edge carries the published `stopReason`; any non-`completed`
 *   reason opens one item (a `completed` run is an ordinary slot release).
 * - Reconciliation path: a counted run that lost its live Agent with no paired end and no idle
 *   transition is a suspect; ONLY that child's own log is read, its last `turn/end` is classified
 *   with the public kind vocabulary, and an unreadable log or missing `turn/end` yields an
 *   `unobservable` item carrying an evidence pointer - never a guessed cause.
 * Items dedup on child session id + turn (plus the host runId when supplied), so a repeated node
 * observation reuses the same durable item and a later failing turn is a new item. An item clears
 * when the child runs again, its start edge arrives, or a late end arrives. A run that never
 * entered the count is never reported, and an unreadable catalog never produces an outcome claim.
 */
class NativeRunningCounter {
    #liveAgents;
    #lister;
    #signal;
    #onStop;
    #turnReader;
    #members = new Map();
    #ledgers = new Map();
    #idOwners = new Map();
    #tails = new Map();
    #revisions = new Map();
    #walkStates = new Map();
    #reconcileDue = new Map();
    #walkTokens = new Map();
    #appliedWalks = new Map();
    #opened = [];
    #settles = 0;
    constructor(options) {
        this.#liveAgents = options.liveAgents;
        this.#lister = options.lister;
        this.#signal = options.signal;
        this.#onStop = options.onStop;
        this.#turnReader = options.turnReader ?? (async () => { throw new ControlsError('feature-disabled', 'child session log observation is unavailable'); });
    }
    /** Serialize per-owner refreshes so a read after a node awaits that node's walk, never a second one. */
    #serial(owner, task) {
        const prior = this.#tails.get(owner) ?? Promise.resolve();
        const next = prior.then(task, task);
        const tail = next.then(() => undefined, () => undefined);
        this.#tails.set(owner, tail);
        // Drop the per-owner chain entry once it settles: otherwise every owner that ever walked
        // keeps a promise for the process lifetime.
        void tail.then(() => { if (this.#tails.get(owner) === tail)
            this.#tails.delete(owner); }, () => undefined);
        return next;
    }
    #refresh(owner, signal) {
        return this.#serial(owner, () => this.#refreshNow(owner, signal));
    }
    /** Walk first, then reconcile: a stop is never claimed from a catalog this node just lost.
     * A burst of membership-change events shares one walk: a walk already in flight absorbs later
     * events into one further walk instead of queueing one catalog read per event. */
    #afterWalk(owner, task) {
        const state = this.#walkState(owner);
        if (state.running) {
            state.dirty = true;
            return;
        }
        state.dirty = false;
        state.running = true;
        void this.#serial(owner, async () => {
            try {
                if (Date.now() >= state.notBefore)
                    await this.#refreshNow(owner);
                task();
            }
            finally {
                state.running = false;
            }
            if (state.dirty) {
                state.dirty = false;
                this.#afterWalk(owner, () => this.#reconcile(owner));
            }
        }).catch(() => undefined);
    }
    #walkState(owner) {
        let state = this.#walkStates.get(owner);
        if (state === undefined) {
            state = { running: false, dirty: false, notBefore: 0 };
            this.#walkStates.set(owner, state);
        }
        return state;
    }
    #bump(owner) { this.#revisions.set(owner, (this.#revisions.get(owner) ?? 0) + 1); }
    /** Coalesce reconciliation for one owner into the current microtask turn. A status burst must
     * not rebuild the live index once per event; the skip set keeps a starting child from being
     * classified as a lost run before its running edge lands. */
    #reconcileSoon(owner, skip) {
        const due = this.#reconcileDue.get(owner);
        if (due !== undefined) {
            if (skip !== undefined)
                due.add(skip);
            return;
        }
        const skips = new Set();
        if (skip !== undefined)
            skips.add(skip);
        this.#reconcileDue.set(owner, skips);
        queueMicrotask(() => {
            const pending = this.#reconcileDue.get(owner);
            this.#reconcileDue.delete(owner);
            this.#reconcile(owner, pending === undefined || pending.size === 0 ? undefined : pending);
        });
    }
    async #refreshNow(owner, signal) {
        this.#bump(owner);
        const list = this.#lister(), current = this.#members.get(owner);
        if (list === undefined) {
            if (current !== undefined) {
                current.known = false;
                current.reason = 'native-subagent-service-unavailable';
            }
            return;
        }
        const control = signal ?? this.#signal;
        const deadline = AbortSignal.timeout(NATIVE_CATALOG_BUDGET_MS);
        // The deadline bounds what this walk waits for, not the host's projection build. Aborting a
        // slow build makes every retry start over (a large owner log then times out forever); letting
        // it finish once lets the host cache the projection and a late result restore membership.
        const token = (this.#walkTokens.get(owner) ?? 0) + 1;
        this.#walkTokens.set(owner, token);
        // Exactly one direct-children read. The full-subtree walk this replaces reads every
        // descendant's own session log, which is unbounded work on a read path (measured on a live
        // profile: 2048 descendant logs, 2.1 GB, a baseline walk that never finished); the resident
        // subtree comes from the live Agent index instead, whose parent chains already describe it.
        const listing = typeof list.listChildren === 'function'
            ? list.listChildren(SessionId(owner), control).then(nativeDirectRows)
            : list.listDescendants(SessionId(owner), control);
        listing.catch(() => undefined);
        let rows;
        try {
            rows = await withinDeadline(listing, deadline);
        }
        catch (error) {
            if (control?.aborted === true)
                throw error;
            const reason = deadline.aborted ? 'native-subagent-listing-timeout' : 'native-subagent-listing-rejected';
            if (current !== undefined) {
                current.known = false;
                current.reason = reason;
            }
            else
                this.#members.set(owner, { ids: new Set(), known: false, reason, total: 0 });
            if (deadline.aborted) {
                // Keep the stated lower bound, but let the in-flight build complete. A late result is
                // applied only when no newer walk has already published membership.
                this.#walkState(owner).notBefore = Date.now() + NATIVE_CATALOG_RETRY_MS;
                void listing.then(lateRows => { if (this.#applyWalk(owner, token, lateRows))
                    this.#reconcile(owner); }, () => undefined);
            }
            return;
        }
        this.#applyWalk(owner, token, rows);
    }
    /** Publish one walk's rows. Returns false when a newer walk already published membership. */
    #applyWalk(owner, token, rows) {
        if (token <= (this.#appliedWalks.get(owner) ?? 0))
            return false;
        this.#appliedWalks.set(owner, token);
        this.#walkState(owner).notBefore = 0;
        const current = this.#members.get(owner);
        const children = rows.filter(row => row.kind === 'child');
        const diagnostic = rows.find(row => row.kind !== 'child');
        const ids = new Set(current?.ids ?? []);
        for (const row of children)
            ids.add(String(row.id));
        for (const member of this.#liveSubtree(owner, ids))
            ids.add(member);
        this.#members.set(owner, { ids, total: Math.max(ids.size, children.length), known: diagnostic === undefined,
            reason: diagnostic === undefined ? null : 'native-subagent-diagnostic-' + (diagnostic.reason ?? 'unknown') });
        for (const childId of ids) {
            const owners = this.#idOwners.get(childId) ?? new Set();
            owners.add(owner);
            this.#idOwners.set(childId, owners);
        }
        this.#bump(owner);
        return true;
    }
    /** Membership from the live Agent index alone: no catalog, no session log, no IO. Every
     * running subagent is a live agent whose parent chain reaches this owner, so the running
     * count is complete without enumerating cold descendants. */
    #adoptLiveMembership(owner, live) {
        const membership = { ids: new Set(), total: 0, known: true, reason: null };
        this.#absorbLiveMembership(owner, membership, live);
        this.#members.set(owner, membership);
    }
    /** Add every resident member the live index can see right now. Called on each read, so a child
     * created a moment ago is counted by the very next read with no catalog round trip; catalog
     * enumeration then only ever adds non-resident descendants and branch diagnostics. */
    #absorbLiveMembership(owner, membership, live = this.#liveIndex()) {
        const added = this.#liveSubtree(owner, membership.ids, live);
        if (added.length === 0)
            return;
        for (const member of added) {
            membership.ids.add(member);
            const owners = this.#idOwners.get(member) ?? new Set();
            owners.add(owner);
            this.#idOwners.set(member, owners);
        }
        membership.total = Math.max(membership.total, membership.ids.size);
    }
    /** Resident subtree membership from the live Agent index alone: the direct children admit
     * their own resident children, transitively. Reads no session log, bounded by the live count. */
    #liveSubtree(owner, known, live = this.#liveIndex()) {
        const members = new Set(known), added = [];
        for (let pass = 0; pass < 64; pass += 1) {
            let grew = false;
            for (const agent of live.values()) {
                if (agent.session.header.origin !== 'subagent')
                    continue;
                const sessionId = String(agent.id);
                if (members.has(sessionId))
                    continue;
                const parent = agent.session.header.parentSession;
                if (parent === undefined)
                    continue;
                const candidate = String(parent);
                if (candidate !== owner && !members.has(candidate))
                    continue;
                members.add(sessionId);
                added.push(sessionId);
                grew = true;
            }
            if (!grew)
                break;
        }
        return added;
    }
    #liveIndex() {
        const index = new Map();
        for (const agent of this.#liveAgents())
            index.set(String(agent.id), agent);
        return index;
    }
    /**
     * Edge distance from the owner to one live descendant; a direct child is 1. A chain that never
     * reaches the owner, a missing live parent or a cycle is unmeasurable and stays null, never a
     * fabricated depth. Bounded by the same 64-level walk the resident subtree uses.
     */
    #depthOf(owner, sessionId, live) {
        const seen = new Set();
        let cursor = sessionId, depth = 0;
        while (cursor !== owner) {
            if (seen.has(cursor) || depth >= 64)
                return null;
            seen.add(cursor);
            const parent = live.get(cursor)?.session.header.parentSession;
            if (parent === undefined)
                return null;
            depth += 1;
            cursor = String(parent);
        }
        return depth;
    }
    /** Depth structure of one running set: every counted run lands in exactly one bucket. */
    #depthStructure(owner, running, live) {
        const levels = new Map();
        let unknown = 0;
        for (const sessionId of running) {
            const depth = this.#depthOf(owner, sessionId, live);
            if (depth === null) {
                unknown += 1;
                continue;
            }
            levels.set(depth, (levels.get(depth) ?? 0) + 1);
        }
        let direct = 0, deeper = 0;
        const published = {};
        for (const distance of [...levels.keys()].sort((left, right) => left - right)) {
            const count = levels.get(distance);
            published[String(distance)] = count;
            if (distance === 1)
                direct += count;
            else
                deeper += count;
        }
        return freeze({ direct, deeper, unknown, levels: freeze(published) });
    }
    #running(live, membership) {
        const running = new Set();
        for (const agent of live.values()) {
            if (agent.session.header.origin !== 'subagent' || agent.status !== 'running')
                continue;
            const sessionId = String(agent.id);
            if (membership.ids.has(sessionId))
                running.add(sessionId);
        }
        return running;
    }
    /** A live subagent belongs to the owner when its parent chain reaches the owner or a known descendant. */
    #inOwnerSubtree(owner, agent, membership, live) {
        let cursor = agent.session.header.parentSession;
        const seen = new Set();
        while (cursor !== undefined) {
            const current = String(cursor);
            if (current === owner || membership.ids.has(current))
                return true;
            if (seen.has(current))
                return false;
            seen.add(current);
            const parent = live.get(current);
            if (parent === undefined)
                return false;
            cursor = parent.session.header.parentSession;
        }
        return false;
    }
    #unknownLiveMembers(owner, membership, ledger, live) {
        const unknown = [];
        for (const agent of live.values()) {
            if (agent.session.header.origin !== 'subagent')
                continue;
            const sessionId = String(agent.id);
            if (membership.ids.has(sessionId) || ledger.unresolved.has(sessionId))
                continue;
            if (this.#inOwnerSubtree(owner, agent, membership, live))
                unknown.push(sessionId);
        }
        return unknown;
    }
    #ownersFor(sessionId, agent) {
        const owners = new Set();
        const direct = (candidate) => {
            if (candidate === undefined)
                return;
            if (this.#members.has(candidate))
                owners.add(candidate);
            for (const owner of this.#idOwners.get(candidate) ?? [])
                owners.add(owner);
        };
        direct(sessionId);
        direct(agent?.session.header.parentSession === undefined ? undefined : String(agent.session.header.parentSession));
        return owners;
    }
    #generation(ledger, sessionId) {
        return ledger.generations.get(sessionId) ?? 0;
    }
    /** Every new activation invalidates an in-flight classification of the previous run. */
    #activate(ledger, sessionId) {
        ledger.generations.set(sessionId, this.#generation(ledger, sessionId) + 1);
    }
    /** Durable dedup key: sessionId[:runId]:turn; `unknown` is the turn slot when none could be read. */
    #itemId(sessionId, runId, turn) {
        return sessionId + ':' + (runId === null ? '' : runId + ':') + (turn === null ? 'unknown' : String(turn));
    }
    /** Open exactly one durable dedup item and queue exactly one wake for it. */
    #openStop(owner, ledger, item) {
        if (ledger.stops.has(item.itemId))
            return;
        ledger.stops.set(item.itemId, item);
        this.#bump(owner);
        const queued = { ownerSessionId: owner, ...item };
        this.#opened.push(queued);
        this.#onStop?.(queued);
    }
    /** An item clears when the child runs again, its start edge arrives, or a late end arrives. */
    #closeSessionStops(owner, ledger, sessionId) {
        let closed = false;
        for (const [itemId, item] of ledger.stops)
            if (item.sessionId === sessionId) {
                ledger.stops.delete(itemId);
                closed = true;
            }
        if (closed)
            this.#bump(owner);
    }
    /** An `unobservable` item carries the evidence pointer and never a cause. */
    #unobservable(sessionId, runId, turn, seq, observed) {
        return freeze({ itemId: this.#itemId(sessionId, runId, turn), sessionId, turn, outcome: 'unobservable', cancelCause: null, diagnostic: null,
            evidence: freeze({ sessionId, turn, seq }), observed });
    }
    /**
     * Reconciliation path: classify one suspect child from its own log tail. `observation === null`
     * means the log could not be read; both that and a missing `turn/end` are unobservable.
     */
    async #classifySuspect(owner, run, token, sessionId, runIdFact, generation) {
        let observation = null;
        try {
            observation = await this.#turnReader(sessionId, this.#signal);
        }
        catch {
            observation = null;
        }
        const ledger = this.#ledgers.get(owner);
        if (ledger === undefined || this.#signal?.aborted === true)
            return;
        // A newer activation, a late end or an already-settled check owns the child now: drop this result.
        if (ledger.runs.get(sessionId) !== run || run.settle !== token || this.#generation(ledger, sessionId) !== generation)
            return;
        run.settle = null;
        // The run is terminal once classified; retire it so a later node never repeats this log read.
        ledger.runs.delete(sessionId);
        const item = observation === null ? this.#unobservable(sessionId, runIdFact, null, null, 'child log could not be read') : this.#itemFromTurn(sessionId, runIdFact, observation);
        if (item !== null)
            this.#openStop(owner, ledger, item);
    }
    /** Classify one child's own log tail; null means a normal return that opens no item. */
    #itemFromTurn(sessionId, runIdFact, observation) {
        const end = observation.end;
        if (end === null)
            return this.#unobservable(sessionId, runIdFact, observation.lastTurn, observation.lastSeq, 'no turn/end in the readable child log');
        if (end.kind === 'completed' || end.kind === 'forked')
            return null;
        if (end.kind === 'aborted') {
            // Our own cancellation (the parent turn was cancelled or the run was disposed) needs no item.
            if (end.cause !== null && OWN_CANCEL_CAUSES.has(end.cause))
                return null;
            const item = freeze({ itemId: this.#itemId(sessionId, runIdFact, end.turn), sessionId, turn: end.turn, outcome: 'aborted', cancelCause: end.cause, diagnostic: null, evidence: null,
                observed: end.cause === null ? 'turn/end: aborted; cancel cause not readable' : 'turn/end: aborted by ' + end.cause });
            return item;
        }
        if (end.kind === 'unknown')
            return this.#unobservable(sessionId, runIdFact, end.turn, end.seq, 'unrecognized turn/end kind');
        const diagnostic = end.kind === 'error' ? end.diagnostic : null;
        const item = freeze({ itemId: this.#itemId(sessionId, runIdFact, end.turn), sessionId, turn: end.turn, outcome: end.kind, cancelCause: null, diagnostic, evidence: null,
            observed: 'turn/end: ' + end.kind + (diagnostic === null ? '' : ' (' + diagnostic + ')') });
        return item;
    }
    /**
     * Primary path: the host's `subagent/end` edge publishes the terminal reason. The child's own log
     * is consulted only for the turn number, the aborted cancel cause and any LlmFailure facts.
     */
    async #classifyEnd(owner, sessionId, runIdFact, stopReason, generation) {
        let observation = null;
        try {
            observation = await this.#turnReader(sessionId, this.#signal);
        }
        catch {
            observation = null;
        }
        const ledger = this.#ledgers.get(owner);
        if (ledger === undefined || this.#signal?.aborted === true || this.#generation(ledger, sessionId) !== generation)
            return;
        const end = observation?.end ?? null;
        const turn = end?.turn ?? observation?.lastTurn ?? null;
        const itemId = this.#itemId(sessionId, runIdFact, turn);
        if (stopReason === 'aborted') {
            // Report only a cancellation this owner side did not cause; an unreadable cause stays unobservable.
            if (end?.kind === 'aborted' && end.cause !== null && OWN_CANCEL_CAUSES.has(end.cause))
                return;
            const cause = end?.kind === 'aborted' ? end.cause : null;
            const item = freeze({ itemId, sessionId, turn, outcome: 'aborted', cancelCause: cause, diagnostic: null, evidence: null,
                observed: cause === null ? 'subagent/end: aborted; cancel cause not observable' : 'subagent/end: aborted by ' + cause });
            this.#openStop(owner, ledger, item);
            return;
        }
        if (stopReason === 'error') {
            const diagnostic = end?.kind === 'error' ? end.diagnostic : null;
            const item = freeze({ itemId, sessionId, turn, outcome: 'error', cancelCause: null, diagnostic, evidence: null,
                observed: 'subagent/end: error' + (diagnostic === null ? '' : ' (' + diagnostic + ')') });
            this.#openStop(owner, ledger, item);
            return;
        }
        if (stopReason === 'max-tokens' || stopReason === 'refusal') {
            const item = freeze({ itemId, sessionId, turn, outcome: stopReason, cancelCause: null, diagnostic: null, evidence: null, observed: 'subagent/end: ' + stopReason });
            this.#openStop(owner, ledger, item);
            return;
        }
        if (stopReason === 'completed')
            return;
        // A merge-extended reason this build cannot classify: keep the host fact, claim no cause.
        this.#openStop(owner, ledger, this.#unobservable(sessionId, runIdFact, turn, end?.seq ?? observation?.lastSeq ?? null, 'subagent/end: ' + stopReason + ' (unrecognized reason)'));
    }
    /**
     * Attribute each expected-delta mismatch by construction; only a counted run with no end and no
     * idle transition is a suspect, and only that child's own log is read.
     */
    #reconcile(owner, skip) {
        const ledger = this.#ledgers.get(owner), membership = this.#members.get(owner);
        if (ledger === undefined || membership === undefined)
            return;
        this.#bump(owner);
        // An unreadable catalog cannot distinguish a stopped run from an unlisted branch: keep the
        // stated lower bound instead of inventing an outcome.
        if (!membership.known)
            return;
        const live = this.#liveIndex(), running = this.#running(live, membership);
        const skipped = (runId) => typeof skip === 'string' ? runId === skip : skip?.has(runId) === true;
        for (const [runId, run] of ledger.runs) {
            if (skipped(runId) || running.has(runId))
                continue;
            const agent = live.get(runId);
            if (agent !== undefined) {
                // A live Agent that is not running is a parked inbox or a driver that has not woken yet,
                // not a lost run; an idle observation explains any later loss.
                if (agent.status === 'idle')
                    run.sawIdle = true;
                continue;
            }
            // Never counted running, or an observed idle transition already explained the loss.
            if (!run.counted || run.sawIdle) {
                ledger.runs.delete(runId);
                continue;
            }
            if (run.settle !== null)
                continue;
            // Expected-delta mismatch: mechanical drift evidence, then classification from this child's
            // own log only. No other child is read and an ordinary count read never reaches here.
            ledger.drifts.push({ sessionId: runId, expectedDelta: 1, observed: running.size });
            if (ledger.drifts.length > 64)
                ledger.drifts.splice(0, ledger.drifts.length - 64);
            run.settle = ++this.#settles;
            const token = run.settle, runIdFact = run.runId, generation = this.#generation(ledger, runId);
            void this.#serial(owner, () => this.#classifySuspect(owner, run, token, runId, runIdFact, generation)).catch(() => undefined);
        }
    }
    async read(ownerSessionId, signal) {
        const owner = id(ownerSessionId, 'ownerSessionId');
        // The read never touches a session catalog or a child log: membership is the live Agent
        // index, so this is O(live agents) memory work. Catalog enumeration and branch diagnostics
        // are enrichment that runs off this path, which is why no step or snapshot read can be held
        // by a slow, huge or unreadable catalog.
        // One live index per read: it is the only membership source on this path.
        const live = this.#liveIndex();
        if (this.#lister() === undefined) {
            // No native service: nothing can be enumerated, and the index alone is not a promise of
            // completeness, so the count stays an explicit unknown rather than a live-derived guess.
            const held = this.#members.get(owner);
            const counted = held === undefined ? new Set() : this.#running(live, held);
            const running = counted.size;
            return { known: false, running, total: held === undefined ? 0 : Math.max(held.total, running), reason: 'native-subagent-service-unavailable',
                depth: this.#depthStructure(owner, counted, live) };
        }
        if (!this.#members.has(owner)) {
            this.#adoptLiveMembership(owner, live);
            this.#afterWalk(owner, () => this.#reconcile(owner));
        }
        const membership = this.#members.get(owner);
        if (membership === undefined)
            return { known: false, running: 0, total: 0, reason: 'native-subagent-service-unavailable',
                depth: this.#depthStructure(owner, new Set(), live) };
        this.#absorbLiveMembership(owner, membership, live);
        let ledger = this.#ledgers.get(owner);
        if (ledger === undefined) {
            ledger = { runs: new Map(), drifts: [], stops: new Map(), unresolved: new Set(), generations: new Map() };
            for (const runId of this.#running(live, membership))
                ledger.runs.set(runId, { counted: true, sawIdle: false, runId: null, settle: null });
            this.#ledgers.set(owner, ledger);
        }
        // A live descendant outside the membership is a membership-change node; the refresh that
        // resolves it is queued, never awaited, so the stated count stays immediate.
        const unknown = this.#unknownLiveMembers(owner, membership, ledger, live);
        if (unknown.length > 0) {
            for (const candidate of unknown)
                ledger.unresolved.add(candidate);
            this.#afterWalk(owner, () => this.#reconcile(owner));
        }
        const counted = this.#running(live, membership);
        const running = counted.size, total = Math.max(membership.total, running);
        const depth = this.#depthStructure(owner, counted, live);
        if (!membership.known)
            return { known: false, running, total, reason: membership.reason, depth };
        return { known: true, running, total, reason: null, depth };
    }
    driftFacts(ownerSessionId) {
        const ledger = this.#ledgers.get(String(ownerSessionId));
        return ledger === undefined ? [] : [...ledger.drifts];
    }
    /** Open terminal-outcome items for one owner; the durable dedup set behind the snapshot rows. */
    stops(ownerSessionId) {
        const ledger = this.#ledgers.get(String(ownerSessionId));
        return ledger === undefined ? [] : [...ledger.stops.values()];
    }
    /** New outcome items since the previous call; each item is queued exactly once. */
    takeOpened() {
        return this.#opened.splice(0, this.#opened.length);
    }
    /** Copy stored count knowledge/membership IDs plus current service availability; no refresh or catalog IO. */
    state(ownerSessionId) {
        const owner = String(ownerSessionId), membership = this.#members.get(owner), available = this.#lister() !== undefined;
        return { revision: this.revision(owner), available, known: available && membership?.known === true, memberSessionIds: membership === undefined ? [] : [...membership.ids],
            reason: !available ? 'native-subagent-service-unavailable' : membership?.reason ?? (membership === undefined ? 'native-subagent-membership-unestablished' : null) };
    }
    /** Monotone count-state revision so a cached snapshot cannot mask an item or a count change. */
    revision(ownerSessionId) {
        return this.#revisions.get(String(ownerSessionId)) ?? 0;
    }
    status(agent, status) {
        if (agent.session.header.origin !== 'subagent')
            return;
        const sessionId = String(agent.id);
        for (const owner of this.#ownersFor(sessionId, agent)) {
            const ledger = this.#ledgers.get(owner);
            if (ledger === undefined)
                continue;
            const run = ledger.runs.get(sessionId);
            if (status === 'running') {
                // Running again is a new activation: any open item is resolved by the existing clearing path.
                if (run !== undefined) {
                    run.counted = true;
                    run.sawIdle = false;
                    run.settle = null;
                }
                this.#activate(ledger, sessionId);
                this.#closeSessionStops(owner, ledger, sessionId);
                this.#reconcileSoon(owner, sessionId);
            }
            else if (run !== undefined)
                run.sawIdle = true;
        }
    }
    /** Known member: reconcile now. Unknown id: walk first, then reconcile under the new membership. */
    created(agent) {
        if (agent.session.header.origin !== 'subagent')
            return;
        const sessionId = String(agent.id);
        for (const owner of this.#ownersFor(sessionId, agent)) {
            if (this.#ledgers.get(owner) === undefined)
                continue;
            if (this.#members.get(owner)?.ids.has(sessionId) === true)
                this.#reconcileSoon(owner, sessionId);
            else
                this.#afterWalk(owner, () => this.#reconcileSoon(owner, sessionId));
        }
    }
    disposed(agent) {
        if (agent.session.header.origin !== 'subagent')
            return;
        const sessionId = String(agent.id);
        for (const owner of this.#ownersFor(sessionId, agent)) {
            if (this.#ledgers.get(owner) === undefined)
                continue;
            // agent/disposed is a membership-change node: re-walk before deciding whether a run is lost.
            this.#afterWalk(owner, () => this.#reconcile(owner));
        }
        // The reverse id index is kept: a late subagent/end may arrive after disposal with no live
        // Agent to supply the parent chain, and routing must not depend on the Agent still existing.
    }
    start(sessionId, local, agent, runId) {
        for (const owner of this.#ownersFor(sessionId, agent)) {
            const ledger = this.#ledgers.get(owner);
            if (ledger === undefined)
                continue;
            if (local) {
                const run = ledger.runs.get(sessionId) ?? { counted: false, sawIdle: false, runId: null, settle: null };
                run.sawIdle = false;
                run.settle = null;
                if (runId !== undefined)
                    run.runId = runId;
                this.#activate(ledger, sessionId);
                this.#closeSessionStops(owner, ledger, sessionId);
                ledger.runs.set(sessionId, run);
            }
            if (this.#members.get(owner)?.ids.has(sessionId) === true)
                this.#reconcileSoon(owner, sessionId);
            else
                this.#afterWalk(owner, () => this.#reconcileSoon(owner, sessionId));
        }
    }
    /**
     * Primary outcome edge. The published `stopReason` is used directly; a non-`completed` reason
     * opens one item after this child's own log supplied the turn/cause/failure detail. A late end
     * also clears any open item for the same child through the existing clearing path.
     */
    end(sessionId, local, agent, stopReason, runId) {
        for (const owner of this.#ownersFor(sessionId, agent)) {
            const ledger = this.#ledgers.get(owner);
            if (ledger === undefined)
                continue;
            const run = ledger.runs.get(sessionId);
            const hostRunId = runId ?? run?.runId ?? null;
            if (run !== undefined) {
                run.settle = null;
                ledger.runs.delete(sessionId);
            }
            this.#closeSessionStops(owner, ledger, sessionId);
            if (this.#members.get(owner)?.ids.has(sessionId) === true)
                this.#reconcileSoon(owner);
            else
                this.#afterWalk(owner, () => this.#reconcile(owner));
            if (!local || stopReason === undefined || stopReason === 'completed')
                continue;
            const generation = this.#generation(ledger, sessionId);
            void this.#serial(owner, () => this.#classifyEnd(owner, sessionId, hostRunId, stopReason, generation)).catch(() => undefined);
        }
    }
    catalog(sessionId, childId) {
        // `subagent/catalog` means the parent's durable membership changed: always re-walk first.
        void childId;
        for (const owner of this.#ownersFor(sessionId)) {
            if (this.#ledgers.get(owner) === undefined)
                continue;
            this.#afterWalk(owner, () => this.#reconcile(owner));
        }
    }
}
/** Initial cwd is a file-scope change, not merely an accessible-directory check. */
async function authorizeInitialChildCwd(ctx, parent, cwd, signal) {
    const fs = ctx.get('fs'), policyService = ctx.get('sandboxPolicy'), session = parent.session;
    if (!fs || !policyService || typeof fs.resolve !== 'function' || typeof fs.contains !== 'function'
        || typeof fs.stat !== 'function' || typeof fs.processPath !== 'function' || typeof fs.processPathFromHostPath !== 'function'
        || typeof policyService.resolve !== 'function')
        throw new ResourceError('unsupported', 'initial child cwd requires native filesystem and sandboxPolicy peers');
    const current = () => {
        signal.throwIfAborted();
        agentCaller(ctx, parent);
        // Cordis may return a fresh scoped service wrapper for each get(); wrapper
        // pointer equality is not provider identity. Pin the actual parent/session,
        // use provider-owned targets/mapping, and require peers to remain mounted.
        const livePolicyService = ctx.get('sandboxPolicy');
        if (parent.session !== session || !ctx.get('fs') || !livePolicyService)
            throw new ResourceError('access-denied', 'initial child cwd authorization identity changed');
        if (typeof livePolicyService.resolve !== 'function')
            throw new ResourceError('unsupported', 'native file policy interface is unavailable');
        const policy = livePolicyService.resolve({ session });
        if (!['read-only', 'workspace-write', 'danger-full-access'].includes(policy.mode))
            throw new ResourceError('unsupported', 'unknown native file policy');
        return policy;
    };
    const policy = current();
    const root = policy.mode === 'workspace-write' ? await fs.resolve(policy.workspaceRoot, { signal }) : undefined;
    current();
    const target = await fs.resolve(cwd, { signal });
    current();
    // Provider-owned canonical targets, not lexical prefixes or opaque-key parsing.
    if (root && !fs.contains(root, target))
        throw new ResourceError('access-denied', 'initial child cwd is outside the parent authorized workspace root');
    const processPath = fs.processPath(target);
    // The native manager validates host paths. A different execution world or a
    // mutable symlink alias cannot be silently rebound under the requested identity.
    if (processPath !== cwd || fs.processPathFromHostPath(cwd) !== cwd)
        throw new ResourceError('unsupported', 'initial child cwd requires a canonical same-world host path; resolve the existing directory first');
    const info = await fs.stat(target, signal);
    current();
    if (!info || info.type !== 'directory')
        throw new ResourceError('access-denied', 'initial child cwd must be an existing authorized directory');
    const verify = () => {
        const latest = current(), liveFs = ctx.get('fs');
        if (latest.mode !== policy.mode || latest.workspaceRoot !== policy.workspaceRoot)
            throw new ResourceError('access-denied', 'parent file policy changed during initial child cwd authorization');
        if (typeof liveFs.processPath !== 'function' || typeof liveFs.processPathFromHostPath !== 'function'
            || liveFs.processPath(target) !== cwd || liveFs.processPathFromHostPath(cwd) !== cwd)
            throw new ResourceError('unsupported', 'native filesystem mapping changed before initial child creation');
    };
    verify();
    // No mode override enters the native spec: read-only stays read-only and
    // native delegation retains the parent's captured permission state.
    return verify;
}
function deny(message) { throw new ControlsError('access-denied', message); }
/**
 * Resolve the connection service's operator Peer without pinning one host generation.
 * alpha.3 replaced `connection.operator` with `connection.browserPeer`; both carry the
 * per-process owner identity that `invocation.peer.id` is matched against, so authorization
 * keeps working and a host exposing neither fails closed with a diagnosable code.
 */
export function connectionOperatorPeer(ctx) {
    const connection = ctx.connection;
    const peer = connection.operator ?? connection.browserPeer;
    if (peer === undefined || typeof peer.id !== 'string' || peer.id.length === 0)
        throw new ControlsError('feature-disabled', 'this host exposes no operator Peer on the connection service');
    return peer;
}
export function operatorCaller(ctx) {
    const invocation = ctx.invocation;
    const operator = connectionOperatorPeer(ctx);
    if (!invocation || invocation.peer.id !== operator.id)
        return deny('authenticated profile operator invocation required');
    invocation.signal.throwIfAborted();
    return freeze({ kind: 'user', principalId: 'user:' + id(operator.id, 'operator id'), sessionId: null });
}
export function agentCaller(ctx, agent) {
    if (!agent || ctx.agents.get(agent.id) !== agent || agent.session.header.id !== agent.id)
        return deny('actual live tool caller required');
    return freeze({ kind: 'agent', principalId: 'agent:' + id(agent.id, 'agent id'), sessionId: agent.id });
}
/** Header classification distinguishes ordinary forks from delegated children. */
export function classifySession(facts, retained) {
    const h = facts.header;
    if (h.origin !== 'subagent')
        return retained?.kind === 'managed-child' ? undefined : 'owner';
    if (!h.parentSession)
        return undefined;
    return classifySessionIdentity(h, foldSubagentDescriptor(facts.events) !== undefined, retained);
}
/** Compact classification is deliberately separate from full public event facts. */
function classifySessionIdentity(h, hasDescriptor, retained) {
    if (h.origin !== 'subagent')
        return retained?.kind === 'managed-child' ? undefined : 'owner';
    if (!h.parentSession)
        return undefined;
    if (!hasDescriptor && !(retained?.kind === 'managed-child' && retained.parentSessionId === h.parentSession))
        return undefined;
    if (retained?.kind === 'owner' || retained?.kind === 'managed-child' && retained.parentSessionId !== h.parentSession)
        return undefined;
    return freeze({ kind: 'managed-child', parentSessionId: h.parentSession });
}
export function createHostAuthority(ctx, storage, grants) {
    const operatorPrincipal = 'user:' + id(connectionOperatorPeer(ctx).id, 'operator id');
    // Only compact, verified classification is retained. Public sessionFacts never pins logs.
    // Tokens are host capabilities, not a version-string or TTL assertion.
    const IDENTITY_CACHE_MAX = 64;
    const EMPTY_EVENTS = Object.freeze([]);
    const coldIdentities = new Map();
    const liveIdentities = new Map();
    const persistencePort = () => typeof ctx.get === 'function' ? ctx.get('sessionPersistence') : undefined;
    const fingerprint = (h) => JSON.stringify([h.id, h.origin, h.parentSession, h.createdAt, h.cwd, h.isSeeded, h.version]);
    const checkedHeader = (sessionId, header) => {
        if (header.id !== sessionId)
            deny('session source returned conflicting identity');
        return Object.freeze({ ...header });
    };
    const liveSource = (sessionId) => {
        const agent = ctx.agents.get(sessionId);
        const sessions = typeof ctx.get === 'function' ? ctx.get('sessions') : undefined;
        const session = typeof sessions?.get === 'function' ? sessions.get(sessionId) : undefined;
        if (agent !== undefined && session !== undefined && agent.session !== session)
            deny('live Session and Agent identity conflict');
        return session ?? agent?.session;
    };
    const storedSnapshot = async (sessionId, signal) => {
        signal?.throwIfAborted();
        const persistence = persistencePort();
        if (typeof persistence?.stat !== 'function')
            return undefined;
        const snapshot = await persistence.stat(sessionId, signal === undefined ? undefined : { signal }).catch(error => { signal?.throwIfAborted(); throw error; });
        signal?.throwIfAborted();
        if (snapshot !== undefined)
            checkedHeader(sessionId, snapshot.header);
        return snapshot;
    };
    const sessionHeaderFacts = async (raw, signal) => {
        const sessionId = SessionId(id(raw, 'sessionId'));
        signal?.throwIfAborted();
        const live = liveSource(sessionId);
        if (live !== undefined) {
            coldIdentities.delete(sessionId);
            return Object.freeze({ header: checkedHeader(sessionId, live.header), events: EMPTY_EVENTS, live: true });
        }
        const snapshot = await storedSnapshot(sessionId, signal);
        signal?.throwIfAborted();
        if (snapshot !== undefined)
            return Object.freeze({ header: checkedHeader(sessionId, snapshot.header), events: EMPTY_EVENTS, live: false });
        const observation = await ctx.sessionQuery.observeSession(sessionId, { ...(signal ? { signal } : {}), projectionMode: 'none' }).catch(error => { signal?.throwIfAborted(); throw error; });
        try {
            signal?.throwIfAborted();
            return Object.freeze({ header: checkedHeader(sessionId, observation.header), events: EMPTY_EVENTS, live: observation.source === 'live' });
        }
        finally {
            observation[Symbol.dispose]();
        }
    };
    const sessionFacts = async (raw, signal) => {
        const sessionId = SessionId(id(raw, 'sessionId'));
        const facts = await sessionHeaderFacts(raw, signal);
        signal?.throwIfAborted();
        if (facts.header.origin !== 'subagent')
            return facts;
        const live = liveSource(sessionId);
        if (live !== undefined)
            return Object.freeze({ header: checkedHeader(sessionId, live.header), events: Object.freeze(live.ownEvents()), live: true });
        const observation = await ctx.sessionQuery.observeSession(sessionId, { ...(signal ? { signal } : {}), projectionMode: 'none' }).catch(error => { signal?.throwIfAborted(); throw error; });
        try {
            signal?.throwIfAborted();
            return freeze({ header: checkedHeader(sessionId, observation.header), events: observation.events.slice(observation.inheritedEventCount), live: observation.source === 'live' });
        }
        finally {
            observation[Symbol.dispose]();
        }
    };
    const sessionIdentity = async (raw, signal) => {
        signal?.throwIfAborted();
        const sessionId = SessionId(id(raw, 'sessionId'));
        const live = liveSource(sessionId);
        if (live !== undefined) {
            coldIdentities.delete(sessionId);
            const header = checkedHeader(sessionId, live.header), key = fingerprint(header);
            const agent = ctx.agents.get(sessionId), seq = live.seq;
            const cached = liveIdentities.get(sessionId);
            // The public Session class owns an immutable append-only log, and the first OWN
            // descriptor is authoritative. Only a successfully folded positive fact survives
            // later appends on that exact host Session. Session-like adapters, absence and
            // unsupported descriptors retain the exact-generation fallback below.
            if (Number.isSafeInteger(seq) && seq >= 0 && cached?.session.deref() === live && (cached.agent === undefined ? agent === undefined : agent !== undefined && cached.agent.deref() === agent) && (cached.seq === seq || live instanceof Session && cached.facts.hasDescriptor && seq > cached.seq) && cached.fingerprint === key)
                return cached.facts;
            liveIdentities.delete(sessionId);
            const facts = Object.freeze({ header, hasDescriptor: header.origin === 'subagent' && !!header.parentSession && foldSubagentDescriptor(live.ownEvents()) !== undefined });
            if (Number.isSafeInteger(seq) && seq >= 0) {
                // Weak references prevent this compact cache from pinning an otherwise disposed
                // Session/Agent (and indirectly its whole event log).
                liveIdentities.set(sessionId, { session: new WeakRef(live), agent: agent === undefined ? undefined : new WeakRef(agent), seq, fingerprint: key, facts });
                while (liveIdentities.size > IDENTITY_CACHE_MAX)
                    liveIdentities.delete(liveIdentities.keys().next().value);
            }
            return facts;
        }
        liveIdentities.delete(sessionId);
        const persistence = persistencePort(), identity = persistence?.identity;
        const snapshot = await storedSnapshot(sessionId, signal);
        signal?.throwIfAborted();
        if (persistencePort()?.identity !== identity || liveSource(sessionId) !== undefined)
            deny('session source changed during identity stat');
        const sourceRevision = snapshot?.revision;
        const key = snapshot === undefined ? undefined : fingerprint(snapshot.header);
        const cached = coldIdentities.get(sessionId);
        if (snapshot !== undefined && typeof identity === 'symbol' && typeof sourceRevision === 'string' && sourceRevision.length > 0 && cached?.persistence === identity && cached.revision === sourceRevision && cached.fingerprint === key)
            return cached.facts;
        coldIdentities.delete(sessionId);
        // Owner classification needs no log. A child always folds its current OWN descriptor
        // at least once; retained associations can never hide a malformed current descriptor.
        if (snapshot !== undefined && snapshot.header.origin !== 'subagent')
            return { header: checkedHeader(sessionId, snapshot.header), hasDescriptor: false };
        signal?.throwIfAborted();
        const observation = await ctx.sessionQuery.observeSession(sessionId, { ...(signal ? { signal } : {}), projectionMode: 'none' }).catch(error => { signal?.throwIfAborted(); throw error; });
        try {
            signal?.throwIfAborted();
            const header = checkedHeader(sessionId, observation.header);
            if (snapshot !== undefined && fingerprint(header) !== key)
                deny('stored header conflicts with observed session identity');
            const facts = Object.freeze({ header, hasDescriptor: header.origin === 'subagent' && !!header.parentSession && foldSubagentDescriptor(observation.events.slice(observation.inheritedEventCount)) !== undefined });
            // Reuse requires a source revision for the exact prepared cut. Compositions
            // lacking this proof intentionally pay the conservative observation cost.
            const observed = observation;
            if (typeof sourceRevision === 'string' && observed.revision !== undefined && observed.revision !== sourceRevision)
                deny('observed session source revision conflicts with current stat');
            if (snapshot !== undefined && typeof identity === 'symbol' && typeof sourceRevision === 'string' && sourceRevision.length > 0 && observed.source === 'prepared' && observed.revision === sourceRevision && fingerprint(header) === key) {
                const after = await storedSnapshot(sessionId, signal);
                if (persistencePort()?.identity !== identity || after?.revision !== sourceRevision || fingerprint(after.header) !== key || liveSource(sessionId) !== undefined)
                    deny('session source changed while verifying identity');
                coldIdentities.set(sessionId, { persistence: identity, revision: sourceRevision, fingerprint: key, facts });
                while (coldIdentities.size > IDENTITY_CACHE_MAX)
                    coldIdentities.delete(coldIdentities.keys().next().value);
            }
            return facts;
        }
        finally {
            observation[Symbol.dispose]();
        }
    };
    const resolveSession = async (sessionId, signal) => {
        const facts = await sessionIdentity(sessionId, signal);
        signal?.throwIfAborted();
        const document = await storage.read().catch(error => { signal?.throwIfAborted(); throw error; });
        signal?.throwIfAborted();
        const saved = document === undefined ? undefined : memoized(document, parseControlsDocument);
        const association = saved?.associations.find(row => row.sessionId === sessionId);
        const instance = association && saved?.instances.find(row => row.instrumentInstanceId === association.instrumentInstanceId);
        const retained = association && instance
            ? association.parentSessionId === null ? { kind: 'owner', controlWorkspaceId: instance.controlWorkspaceId }
                : { kind: 'managed-child', parentSessionId: association.parentSessionId } : undefined;
        const classified = classifySessionIdentity(facts.header, facts.hasDescriptor, retained);
        if (classified !== 'owner')
            return classified;
        if (retained?.kind === 'owner')
            return retained;
        if (facts.header.cwd === undefined)
            return undefined;
        const workspace = await ctx.workspaceRegistry.resolveByPath(facts.header.cwd);
        signal?.throwIfAborted();
        return workspace ? freeze({ kind: 'owner', controlWorkspaceId: workspace.id }) : undefined;
    };
    const authenticate = (principal) => {
        if (principal === operatorPrincipal)
            return;
        if (!principal.startsWith('agent:'))
            deny('unknown host principal');
        const sid = principal.slice('agent:'.length), agent = ctx.agents.get(SessionId(id(sid, 'principal sessionId')));
        if (!agent || agent.session.header.id !== sid)
            deny('agent principal has no actual live session');
    };
    const authority = {
        async authorizePolicy(principal, access) {
            authenticate(principal);
            if (access === 'read' || principal === operatorPrincipal)
                return;
            const state = await grants.read(), saved = state === undefined ? undefined : parsePolicyGrants(state);
            if (!saved?.grants.some(row => row.sessionId === principal.slice('agent:'.length) && row.enabled))
                deny('agent policy write requires explicit operator delegation');
        },
        async authorizeSession(principal, sessionId, _access, signal) {
            signal?.throwIfAborted();
            authenticate(principal);
            if (principal !== operatorPrincipal && principal !== 'agent:' + sessionId)
                deny('agent cannot address another session as its own');
            await sessionHeaderFacts(sessionId, signal);
        },
        resolveSession,
        async verifyWorkspace(workspaceId, signal) {
            signal?.throwIfAborted();
            const row = ctx.workspaceRegistry.get(WorkspaceId(id(workspaceId, 'workspaceId')));
            const status = row === undefined ? undefined : await row.status().catch(error => { signal?.throwIfAborted(); throw error; });
            signal?.throwIfAborted();
            return status === 'ok';
        },
    };
    const authorizeCaller = async (caller, sessionId, signal) => {
        signal?.throwIfAborted();
        if (caller.kind === 'user') {
            if (caller.principalId !== operatorPrincipal || caller.sessionId !== null)
                deny('invalid operator caller');
        }
        else if (caller.sessionId === null || caller.principalId !== 'agent:' + caller.sessionId)
            deny('invalid actual agent caller');
        authenticate(caller.principalId);
        if (sessionId !== undefined)
            await authority.authorizeSession(caller.principalId, id(sessionId, 'sessionId'), 'read', signal);
    };
    return { authority, sessionFacts, authorizeCaller, operatorPrincipal };
}
/** A source-mode binding plus a strict descriptor contribution; no monkeypatch. */
export class MattPocockControlsService extends TypertRemoteService {
    runtime;
    ports;
    grants;
    supervision;
    lifecycle;
    sessionRepresentation = createHostJsonRepresentation();
    constructor(ctx, runtime, ports, grants, supervision, lifecycle) {
        super(ctx, REMOTE_NAMESPACE);
        this.runtime = runtime;
        this.ports = ports;
        this.grants = grants;
        this.supervision = supervision;
        this.lifecycle = lifecycle;
    }
    run(operation, suppliedSignal) {
        const caller = operatorCaller(this.ctx);
        this.lifecycle.signal.throwIfAborted();
        const signal = AbortSignal.any([this.ctx.invocation.signal, this.lifecycle.signal, ...(suppliedSignal ? [suppliedSignal] : [])]);
        return this.lifecycle.track(() => operation(caller, signal));
    }
    readPolicy() { return this.run(async (caller, signal) => parsePolicySnapshot(await this.runtime.readPolicy(caller, signal))); }
    readSupervisionConfig() {
        return this.run(async () => {
            const raw = await this.supervision.read();
            return raw === undefined ? INITIAL_SUPERVISION_CONFIG : parseSupervisionConfigSnapshot(raw);
        });
    }
    saveSupervisionConfig(intent, expectedRevision) {
        return this.run(async (_caller, signal) => {
            const parsed = parseSupervisionConfigIntent(intent), expected = revision(expectedRevision, 'expectedRevision');
            const store = this.supervision, raw = await store.read();
            const current = raw === undefined ? INITIAL_SUPERVISION_CONFIG : parseSupervisionConfigSnapshot(raw);
            if (current.revision !== expected)
                throw new ControlsError('revision-conflict', 'supervision configuration changed; reload the saved revision');
            if (JSON.stringify({ defaults: current.defaults, workspaceOverrides: current.workspaceOverrides }) === JSON.stringify(parsed))
                return current;
            signal.throwIfAborted();
            const next = parseSupervisionConfigSnapshot({ schemaVersion: 1, revision: increment(expected), ...parsed });
            if (!await store.compareAndSwap(expected, next))
                throw new ControlsError('revision-conflict', 'supervision configuration changed; reload the saved revision');
            try {
                this.lifecycle.onSupervisionChanged?.(next);
            }
            catch { /* configuration is saved; tool registration failure must not report a false write failure */ }
            return next;
        });
    }
    readSupervision(sessionId) {
        return this.run(async (caller, signal) => {
            const sid = id(sessionId, 'sessionId');
            await this.ports.authorizeCaller(caller, sid);
            signal.throwIfAborted();
            const view = await this.runtime.readSession(caller, sid, signal);
            const store = await this.ports.openUnitStorage('supervision_state_' + createHash('sha256').update(view.instance.ownerSessionId).digest('hex').slice(0, 32), parseSupervisionDocument);
            const raw = await store.read();
            return raw === undefined ? null : parseHostJson(raw);
        });
    }
    savePolicy(intent, expectedRevision) {
        return this.run(async (caller, signal) => {
            const saved = parsePolicySnapshot(await this.runtime.savePolicy(caller, parsePolicyIntent(intent), revision(expectedRevision, 'expectedRevision'), signal));
            this.lifecycle.onPolicyChanged?.();
            return saved;
        });
    }
    listWorkspaces() {
        return this.run(async (_, signal) => {
            const rows = await Promise.all(this.ctx.workspaceRegistry.list().map(async (workspace) => ({ id: workspace.id, path: workspace.path, title: workspace.title, status: await workspace.status(), sessionIds: workspace.sessionIds.map(sid => id(sid, 'workspace sessionId')) })));
            signal.throwIfAborted();
            return freeze(rows);
        });
    }
    readSession(sessionId, suppliedSignal) {
        return this.run(async (caller, signal) => {
            const sid = id(sessionId, 'sessionId');
            await this.ports.authorizeCaller(caller, sid, signal);
            signal.throwIfAborted();
            const snapshot = await this.runtime.readSession(caller, sid, signal);
            signal.throwIfAborted();
            return this.sessionRepresentation(snapshot);
        }, suppliedSignal);
    }
    readSummaries(request, suppliedSignal) {
        const parsed = parseSessionSummaryRequest(request);
        return this.run(async (caller, signal) => {
            await this.ports.authorizeCaller(caller, undefined, signal);
            signal.throwIfAborted();
            return parseSessionSummaryBatch(await this.runtime.readSummaries(caller, parsed, signal));
        }, suppliedSignal);
    }
    applyInstrument(sessionId, command) {
        return this.run(async (caller, signal) => {
            const sid = id(sessionId, 'sessionId'), parsed = parseInstrumentCommand(command);
            await this.ports.authorizeCaller(caller, sid);
            signal.throwIfAborted();
            return parseHostJson(await this.runtime.applyInstrument(caller, sid, parsed, signal));
        });
    }
    applyTicketWindow(sessionId, command) {
        return this.run(async (caller, signal) => {
            const sid = id(sessionId, 'sessionId'), parsed = parseTicketWindowCommand(command);
            await this.ports.authorizeCaller(caller, sid);
            signal.throwIfAborted();
            return parseHostJson(await this.runtime.applyTicketWindow(caller, sid, parsed, signal));
        });
    }
    historyAction(sessionId, request, suppliedSignal) {
        return this.run(async (caller, signal) => {
            const sid = id(sessionId, 'sessionId');
            await this.ports.authorizeCaller(caller, sid);
            signal.throwIfAborted();
            const parsed = parseHostJson(request);
            if (!this.runtime.historyAction)
                throw new ControlsError('feature-disabled', 'session history is unavailable in this runtime');
            return parseHostJson(await this.runtime.historyAction(caller, sid, parsed, signal));
        }, suppliedSignal);
    }
    worktreeAction(sessionId, request) {
        return this.run(async (caller, signal) => {
            const sid = id(sessionId, 'sessionId');
            await this.ports.authorizeCaller(caller, sid);
            signal.throwIfAborted();
            const parsed = parseHostJson(request);
            if (!this.runtime.worktreeAction)
                throw new ControlsError('feature-disabled', 'worktree bindings are unavailable in this runtime');
            return parseHostJson(await this.runtime.worktreeAction(caller, sid, parsed, signal));
        });
    }
    resourceAction(sessionId, request) {
        return this.run(async (caller, signal) => {
            const sid = id(sessionId, 'sessionId'), parsed = parseResourceAction(request);
            await this.ports.authorizeCaller(caller, sid);
            signal.throwIfAborted();
            if (parsed.action !== 'read')
                throw new ControlsError('feature-disabled', 'deprecated resource lifecycle writes are disabled; manage Git yourself and use worktree bindings');
            return parseHostJson(await this.runtime.resourceAction(caller, sid, parsed, signal));
        });
    }
    grantPolicy(sessionId, enabled, expectedRevision) {
        return this.run(async (caller, signal) => {
            const sid = id(sessionId, 'sessionId'), value = boolean(enabled, 'enabled'), expected = revision(expectedRevision, 'expectedRevision');
            if (!this.runtime.serializePolicyPermission)
                throw new ControlsError('feature-disabled', 'policy grants require the runtime shared permission serializer');
            return this.runtime.serializePolicyPermission(async () => {
                await this.ports.authorizeCaller(caller, sid);
                signal.throwIfAborted();
                const prior = await this.grants.read(), current = prior === undefined ? parsePolicyGrants({ schemaVersion: 1, revision: 0, grants: [] }) : parsePolicyGrants(prior);
                if (current.revision !== expected)
                    throw new ControlsError('revision-conflict', 'policy delegations changed');
                if (current.grants.some(row => row.sessionId === sid && row.enabled === value) || !value && !current.grants.some(row => row.sessionId === sid))
                    return current;
                const next = parsePolicyGrants({ schemaVersion: 1, revision: increment(current.revision), grants: [...current.grants.filter(row => row.sessionId !== sid), { sessionId: sid, enabled: value }] });
                signal.throwIfAborted();
                if (!await this.grants.compareAndSwap(expected, next))
                    throw new ControlsError('revision-conflict', 'policy delegations changed');
                return next;
            });
        });
    }
}
/** Independent optional namespace: old server/client base descriptors are unchanged. */
export class MattPocockRecommendationSupportService extends TypertRemoteService {
    runtime;
    ports;
    lifecycle;
    constructor(ctx, runtime, ports, lifecycle) {
        super(ctx, RECOMMENDATION_REMOTE_NAMESPACE);
        this.runtime = runtime;
        this.ports = ports;
        this.lifecycle = lifecycle;
    }
    run(operation, suppliedSignal) {
        const caller = operatorCaller(this.ctx);
        this.lifecycle.signal.throwIfAborted();
        const signal = AbortSignal.any([this.ctx.invocation.signal, this.lifecycle.signal, ...(suppliedSignal ? [suppliedSignal] : [])]);
        return this.lifecycle.track(() => operation(caller, signal));
    }
    readOwnerDecisionPolicy(sessionId, suppliedSignal) {
        return this.run(async (caller, signal) => {
            const sid = id(sessionId, 'sessionId');
            await this.ports.authorizeCaller(caller, sid);
            signal.throwIfAborted();
            if (!this.runtime.readOwnerDecisionPolicy)
                throw new ControlsError('feature-disabled', 'owner recommendation policy is unsupported by this runtime');
            return parseOwnerDecisionPolicySnapshot(await this.runtime.readOwnerDecisionPolicy(caller, sid, signal));
        }, suppliedSignal);
    }
    saveOwnerDecisionPolicy(sessionId, request) {
        return this.run(async (caller, signal) => {
            const sid = id(sessionId, 'sessionId'), parsed = parseOwnerDecisionPolicySaveRequest(request);
            await this.ports.authorizeCaller(caller, sid);
            signal.throwIfAborted();
            if (!this.runtime.saveOwnerDecisionPolicy)
                throw new ControlsError('feature-disabled', 'owner recommendation policy is unsupported by this runtime');
            return parseOwnerDecisionPolicySaveResult(await this.runtime.saveOwnerDecisionPolicy(caller, sid, parsed, signal));
        });
    }
}
export function recommendationHostRemoteContribution() {
    return { package: RECOMMENDATION_REMOTE_CONTRIBUTION.package, face: 'host', schemas: [], model: { services: [], events: [], objects: [] }, invocations: RECOMMENDATION_REMOTE_CONTRIBUTION.descriptors };
}
export function hostRemoteContribution() {
    return { package: REMOTE_CONTRIBUTION.package, face: 'host', schemas: [], model: { services: [], events: [], objects: [] }, invocations: REMOTE_CONTRIBUTION.descriptors };
}
/** Fixed Git argv execution; subprocess alone is not a sandbox or permission decision. */
export function createAuthorizedGitRunner(ctx, rawSessionId, outerSignal) {
    const sessionId = SessionId(id(rawSessionId, 'Git sessionId'));
    const initial = ctx.agents.get(sessionId);
    if (!initial)
        throw new ResourceError('unsupported', 'Git requires an existing live session; do not resume a model for resource actions');
    const fs = ctx.get('fs'), subprocess = ctx.get('subprocess'), policyService = ctx.get('sandboxPolicy'), sandbox = ctx.get('sandbox');
    if (!fs || !subprocess || !policyService)
        throw new ResourceError('unsupported', 'filesystem, subprocess and sandboxPolicy peers are required');
    const current = () => {
        outerSignal.throwIfAborted();
        if (ctx.agents.get(sessionId) !== initial)
            throw new ResourceError('access-denied', 'Git session identity changed');
        return policyService.resolve({ session: initial.session });
    };
    const signalFor = (signal) => signal ? AbortSignal.any([outerSignal, signal]) : outerSignal;
    const absolute = (path) => {
        if (typeof path !== 'string' || !isAbsolute(path) || normalize(path) !== path || path.includes('\0'))
            throw new ResourceError('identity-conflict', 'normalized absolute filesystem path required');
        return path;
    };
    const checkLocal = async (path, signal) => {
        current();
        absolute(path);
        // Only metadata absent from the filesystem seam uses local Node APIs, and only
        // after the provider proves that host and execution-world paths identify the same file.
        if (fs.processPathFromHostPath(path) !== path)
            throw new ResourceError('unsupported', 'stable inode/readlink metadata requires a same-world local filesystem mapping');
        await fs.lstat(path, {}, signal);
        signal.throwIfAborted();
    };
    const authorize = async (request, signal) => {
        const control = signalFor(signal), policy = current();
        control.throwIfAborted();
        for (const path of request.paths) {
            absolute(path);
            if (request.operation === 'create' || request.operation === 'retire') {
                if (policy.mode === 'read-only')
                    throw new ResourceError('access-denied', 'existing session file policy is read-only');
                if (policy.mode === 'workspace-write') {
                    const root = await fs.resolve(policy.workspaceRoot, { signal: control }), target = await fs.resolve(path, { signal: control });
                    if (!fs.contains(root, target))
                        throw new ResourceError('access-denied', 'Git metadata or worktree path is outside the existing writable root');
                }
            }
        }
    };
    return {
        authorize,
        async run(argv, cwd, signal) {
            const control = signalFor(signal), policy = current();
            control.throwIfAborted();
            absolute(cwd);
            if (argv[0] !== 'git' || argv[1] !== '--no-optional-locks' || argv[2] !== '--no-pager' || argv[3] !== '-c' || argv[4] !== 'core.hooksPath=/dev/null'
                || !['rev-parse', 'symbolic-ref', 'worktree', 'check-ref-format', 'show-ref', 'status', 'ls-files', 'update-ref', 'diff', 'ls-tree', 'cat-file'].includes(argv[5] ?? '')
                || argv.some(value => typeof value !== 'string' || value.includes('\0')))
                throw new ResourceError('access-denied', 'only the fixed resource adapter Git argv contract may execute');
            const env = Object.fromEntries(Object.keys(process.env).filter(key => key.toUpperCase().startsWith('GIT_')).map(key => [key, undefined]));
            Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', GIT_PAGER: 'cat', PAGER: 'cat' });
            const lookupEnv = Object.fromEntries(Object.entries(env).flatMap(([key, value]) => value === undefined ? [] : [[key, value]]));
            const git = await subprocess.resolveExecutable('git', lookupEnv, control);
            const original = [git, '-c', 'core.fsmonitor=false', '-c', 'diff.external=', '-c', 'core.pager=cat', ...argv.slice(1)], bounded = AbortSignal.any([control, AbortSignal.timeout(30000)]);
            let confined;
            if (policy.mode !== 'danger-full-access') {
                if (!sandbox)
                    throw new ResourceError('unsupported', 'required Git confinement peer is missing');
                confined = await sandbox.confine(original, { ...policy, mode: policy.mode }, bounded);
                if (confined.enforcement !== 'full')
                    throw new ResourceError('unsupported', 'partial file sandbox cannot certify resource effects');
            }
            current();
            bounded.throwIfAborted();
            const handle = subprocess.spawn({ argv: confined?.argv ?? original, cwd, stdio: { stdin: 'ignore', stdout: { maxBytes: 16777216 }, stderr: { maxBytes: 65536 } }, graceMs: 3000, signal: bounded, env });
            let outcome;
            try {
                outcome = await handle.done;
            }
            finally {
                if (!await handle.waitForExit())
                    throw new ResourceError('unsupported', 'Git process range did not converge');
            }
            bounded.throwIfAborted();
            const stdout = handle.collected.stdout.readFrom(0), stderr = handle.collected.stderr.readFrom(0);
            if (stdout.lossy || stderr.lossy)
                throw new ResourceError('unsupported', 'Git output exceeded its complete capture budget');
            if (outcome.exitCode === null || outcome.signal !== null)
                throw new ResourceError('unsupported', 'Git did not exit normally');
            if (confined && outcome.exitCode !== 0) {
                if (classifyRunnerFailure(outcome.exitCode, stderr.text, confined.runnerFailureRules))
                    throw new ResourceError('unsupported', 'Git sandbox runner failed before execution');
                if (matchesSignature(outcome.exitCode, stderr.text, confined.denialSignatures))
                    throw new ResourceError('access-denied', 'Git effect denied by the existing file sandbox');
            }
            return { exitCode: outcome.exitCode, stdout: stdout.text, stderr: stderr.text };
        },
        async lstat(path, signal) {
            const control = signalFor(signal);
            await checkLocal(path, control);
            const stat = await lstat(path, { bigint: true });
            control.throwIfAborted();
            return { kind: stat.isSymbolicLink() ? 'symlink' : stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : 'other', identity: String(stat.dev) + ':' + String(stat.ino) };
        },
        async realpath(path, signal) { const control = signalFor(signal); current(); const target = await fs.resolve(absolute(path), { signal: control }); return fs.processPath(target); },
        async readFile(path, signal) { const control = signalFor(signal); current(); const target = await fs.resolve(absolute(path), { signal: control }); return fs.readBytes(target, control, 16777216); },
        async readDirectory(path, signal) { const control = signalFor(signal); current(); const target = await fs.resolve(absolute(path), { signal: control }); return (await fs.listDir(target, control)).map(entry => entry.name); },
        async readlink(path, signal) { const control = signalFor(signal); await checkLocal(path, control); const value = await readlink(path); control.throwIfAborted(); return value; },
    };
}
/** Mount actual SDK registrations over independently owned single-table domains. */
export async function mountHost(ctx, options) {
    const domains = [];
    const unitHandles = new Map();
    let runtime;
    let closing = false;
    const lifetime = new AbortController(), pending = new Set(), disposers = [];
    let resolveNotificationObserverReady;
    const notificationObserverReady = new Promise(resolve => { resolveNotificationObserverReady = resolve; });
    const noticeAttempts = new Map();
    const track = (operation) => {
        if (closing)
            return Promise.reject(new ControlsError('access-denied', 'host is disposing'));
        // Invoke synchronously: native event program ports register their commit fence
        // before a parent pre-step can capture its relevant receipt watermark.
        let promise;
        try {
            promise = Promise.resolve(operation());
        }
        catch (error) {
            promise = Promise.reject(error);
        }
        pending.add(promise);
        void promise.then(() => pending.delete(promise), () => pending.delete(promise));
        return promise;
    };
    let shutdown;
    const dispose = () => shutdown ??= (async () => {
        closing = true;
        lifetime.abort();
        resolveNotificationObserverReady();
        noticeAttempts.clear();
        const errors = [];
        for (const disposer of disposers.reverse()) {
            try {
                await disposer();
            }
            catch (error) {
                errors.push(error);
            }
        }
        await Promise.allSettled([...pending]);
        try {
            await runtime?.dispose();
        }
        catch (error) {
            errors.push(error);
        }
        unitHandles.clear();
        for (const domain of domains.reverse()) {
            try {
                await domain.close();
            }
            catch (error) {
                errors.push(error);
            }
        }
        if (errors.length)
            throw new AggregateError(errors, 'Host teardown could not certify complete release');
    })();
    try {
        const open = async (name, parse) => {
            if (closing)
                throw new ControlsError('access-denied', 'host is disposing');
            const domain = await ctx.storageDomain.open(defineDomain({ name: 'mattpocock_' + name, version: 1, tables: { records: domainTable(z.unknown().transform(parse)) } }));
            // A lazy open may finish while the host is already disposing; never leak the handle.
            if (closing) {
                await domain.close();
                throw new ControlsError('access-denied', 'host is disposing');
            }
            domains.push(domain);
            return domain.table('records');
        };
        const controlsStorage = createDomainControlsStorage(await open('controls', parseControlsDocument));
        const supervisionStorage = createDomainVersionedStorage(await open('supervision_config', parseSupervisionConfigDocument), 'state', parseSupervisionConfigDocument);
        let supervisionSnapshot = INITIAL_SUPERVISION_CONFIG;
        try {
            const raw = await supervisionStorage.read();
            if (raw !== undefined)
                supervisionSnapshot = parseSupervisionConfigSnapshot(raw);
        }
        catch (error) {
            ctx.logger('mattpocock-controls').warn('supervision configuration unavailable; audit remains off', error);
        }
        // The multi-row instruments/windows domains validate every stored record on open. They are
        // not needed to mount: the first session read opens them, so startup pays only the
        // documents every mount actually needs (controls and supervision configuration).
        let instrumentOpening;
        const instrumentStorage = {
            read: async (id) => (await (instrumentOpening ??= open('instruments', parseInstrumentDocument).then(createDomainInstrumentStorage))).read(id),
            compareAndSwap: async (id, expectedRevision, next) => (await (instrumentOpening ??= open('instruments', parseInstrumentDocument).then(createDomainInstrumentStorage))).compareAndSwap(id, expectedRevision, next),
        };
        let windowOpening;
        const windowStorage = {
            read: async (id) => (await (windowOpening ??= open('windows', parseWindowDocument).then(createDomainWindowStorage))).read(id),
            compareAndSwap: async (id, expectedRevision, next) => (await (windowOpening ??= open('windows', parseWindowDocument).then(createDomainWindowStorage))).compareAndSwap(id, expectedRevision, next),
        };
        let resourceOpening;
        const resourceStorage = {
            read: async () => (await (resourceOpening ??= open('resources', parseResourceDocument).then(createDomainResourceStorage))).read(),
            compareAndSwap: async (expectedRevision, next) => (await (resourceOpening ??= open('resources', parseResourceDocument).then(createDomainResourceStorage))).compareAndSwap(expectedRevision, next),
        };
        const grants = createDomainVersionedStorage(await open('policy_grants', parsePolicyGrants), 'state', parsePolicyGrants);
        const identity = createHostAuthority(ctx, controlsStorage, grants);
        // One event-driven count per mount: membership walks happen only at membership-change
        // nodes, so the panel/tool read path is O(live agents) with no catalog IO.
        let forwardNativeStop = () => { };
        // The reconciliation path reads ONLY the suspect child's own log. A live child's owned events
        // are already in memory; a cold child is observed through the public session query, never
        // resumed, and is never walked as a tree.
        const readNativeTurn = async (rawSessionId, signal) => {
            const sessionId = SessionId(id(rawSessionId, 'sessionId'));
            const live = ctx.agents.get(sessionId);
            if (live !== undefined && live.session.header.origin === 'subagent')
                return observeNativeTurn(live.session.ownEvents());
            const query = ctx.get('sessionQuery');
            if (query === undefined || typeof query.observeSession !== 'function')
                throw new ControlsError('feature-disabled', 'child session log observation is unavailable');
            const observation = await query.observeSession(sessionId, { projectionMode: 'none', ...(signal === undefined ? {} : { signal }) });
            try {
                return observeNativeTurn(observation.events.slice(observation.inheritedEventCount));
            }
            finally {
                observation[Symbol.dispose]();
            }
        };
        const nativeCounter = new NativeRunningCounter({ liveAgents: () => ctx.agents.list(), lister: () => nativeSubagentLister(ctx), signal: lifetime.signal, onStop: event => forwardNativeStop(event), turnReader: readNativeTurn });
        const readNativeActivity = async (sessionId, signal) => {
            const ownerSessionId = id(sessionId, 'sessionId');
            const control = signal === undefined ? lifetime.signal : AbortSignal.any([signal, lifetime.signal]);
            control.throwIfAborted();
            return await nativeCounter.read(ownerSessionId, control);
        };
        const ports = {
            controlsStorage, instrumentStorage, windowStorage, resourceStorage, ...identity,
            capabilities: freeze({ ...HOST_CAPABILITIES,
                get nativeInitialChildCwd() { return hasNativeInitialChildCwd(ctx) ? 'supported' : 'unsupported'; },
                get allNativeWakeAdmission() { return nativeSubagentLister(ctx) === undefined ? 'unsupported' : 'supported'; } }),
            makeSnapshotMessage, notificationObserverReady,
            snapshotVisible(caller, actualAgent, message) {
                try {
                    const actual = agentCaller(ctx, actualAgent);
                    if (closing || caller.kind !== actual.kind || caller.principalId !== actual.principalId || caller.sessionId !== actual.sessionId
                        || message.source.kind !== 'mattpocock-controls' || message.source.form !== 'snapshot')
                        return false;
                    const expected = snapshotContent({ source: message.source, content: message.content });
                    return actualAgent.session.deriveMessages().some(visible => visible.role === 'user' && visible.id === message.id
                        && snapshotContent({ source: visible.source, content: visible.content }) === expected);
                }
                catch {
                    return false;
                }
            },
            async notifyOwner(input, signal) {
                const control = AbortSignal.any([signal, lifetime.signal]);
                control.throwIfAborted();
                if (closing)
                    return { status: 'unavailable', messageId: null };
                const raw = record(input, 'owner notification', ['notificationId', 'ownerSessionId', 'instrumentInstanceId', 'businessRevision', 'authorPrincipalId']);
                const notice = freeze({ notificationId: id(raw.notificationId, 'notificationId'), ownerSessionId: id(raw.ownerSessionId, 'ownerSessionId'), instrumentInstanceId: id(raw.instrumentInstanceId, 'instrumentInstanceId'), businessRevision: revision(raw.businessRevision, 'businessRevision'), authorPrincipalId: id(raw.authorPrincipalId, 'authorPrincipalId') });
                const owner = ctx.agents.get(SessionId(notice.ownerSessionId));
                if (!owner)
                    return { status: 'offline', messageId: null };
                if (owner.session.header.id !== owner.id || owner.session.header.origin === 'subagent' || typeof owner.steer !== 'function')
                    return { status: 'unavailable', messageId: null };
                const summary = ('Collaboration instruments updated at revision ' + notice.businessRevision + '. Review the saved snapshot; no task outcome is inferred.').slice(0, 120);
                const message = createUserMessage({ content: [{ type: 'text', text: summary }], source: { kind: 'mattpocock-controls-notification', form: 'notice', summary, ...notice } });
                noticeAttempts.set(message.id, { input: notice, actualAgent: owner, message });
                try {
                    control.throwIfAborted();
                    owner.steer(message);
                }
                catch (error) {
                    noticeAttempts.delete(message.id);
                    control.throwIfAborted();
                    return { status: 'unavailable', messageId: null };
                }
                // Native steering acceptance is not durable delivery or business completion.
                return { status: 'accepted', messageId: message.id };
            },
            gitRunnerForSession(sessionId, signal) { return createAuthorizedGitRunner(ctx, sessionId, AbortSignal.any([signal, lifetime.signal])); },
            async authorizeInitialChildCwd(exec, cwd) {
                lifetime.signal.throwIfAborted();
                exec.signal.throwIfAborted();
                const caller = agentCaller(ctx, exec.agent);
                await identity.authorizeCaller(caller, caller.sessionId);
                if (typeof cwd !== 'string' || cwd.length === 0 || cwd.length > 16384 || cwd.includes('\0') || !isAbsolute(cwd) || normalize(cwd) !== cwd)
                    throw new ControlsError('invalid-input', 'cwd must be a bounded normalized absolute path');
                if (!hasNativeInitialChildCwd(ctx))
                    throw new ResourceError('unsupported', 'nativeInitialChildCwd unsupported; no child was requested');
                const verify = await authorizeInitialChildCwd(ctx, exec.agent, cwd, AbortSignal.any([exec.signal, lifetime.signal]));
                if (!hasNativeInitialChildCwd(ctx))
                    throw new ResourceError('unsupported', 'nativeInitialChildCwd unsupported; no child was requested');
                verify();
                // This is a fresh technical read, not a reusable authorization token.
                // Creation repeats the full scope check at its own native effect boundary.
            },
            async createContinuable(exec, request) {
                lifetime.signal.throwIfAborted();
                exec.signal.throwIfAborted();
                const caller = agentCaller(ctx, exec.agent);
                await identity.authorizeCaller(caller, caller.sessionId);
                const raw = record(parseHostJson(request), 'continuable child request', ['provider', 'label', 'prompt', 'childId', 'cwd']);
                if (raw.provider !== 'spawn' && raw.provider !== 'fork')
                    throw new ControlsError('invalid-input', 'spawn/fork provider required');
                const bounded = (value, where, max) => {
                    if (typeof value !== 'string' || value.length === 0 || value.length > max || value.includes('\0'))
                        throw new ControlsError('invalid-input', where + ' must be bounded non-empty text');
                    return value;
                };
                const childId = SessionId(id(raw.childId, 'childId')), label = bounded(raw.label, 'label', 256), prompt = bounded(raw.prompt, 'prompt', 262144);
                const cwd = raw.cwd === undefined ? undefined : bounded(raw.cwd, 'cwd', 16384);
                if (cwd !== undefined && (!isAbsolute(cwd) || normalize(cwd) !== cwd))
                    throw new ControlsError('invalid-input', 'cwd must be a normalized absolute path');
                const native = ctx.get('subagents');
                if (!native || typeof native.startActivation !== 'function')
                    throw new ResourceError('unsupported', 'native continuable creation is unavailable; no child was requested');
                // No replacement provider is loaded: an explicit cwd requires the native
                // activation contract, and an unsupported host creates no child at all.
                if (cwd !== undefined && !hasNativeInitialChildCwd(ctx))
                    throw new ResourceError('unsupported', 'nativeInitialChildCwd unsupported; no child was requested');
                const verifyCwd = cwd === undefined ? undefined : await authorizeInitialChildCwd(ctx, exec.agent, cwd, AbortSignal.any([exec.signal, lifetime.signal]));
                const maxDepth = native.resolveMaxDepth();
                lifetime.signal.throwIfAborted();
                exec.signal.throwIfAborted();
                agentCaller(ctx, exec.agent);
                verifyCwd?.();
                if (cwd !== undefined && !hasNativeInitialChildCwd(ctx))
                    throw new ResourceError('unsupported', 'nativeInitialChildCwd unsupported; no child was requested');
                // Public manager owns provider capability/depth checks, permissions, lineage,
                // factory headers and durable descriptors. Never mutate parent/child metadata.
                // Upstream keeps the reserved identity and carries the directory inside the
                // request, so the provider resolves and records it before the child exists.
                // Parent delivery is the model-facing completion notice this plugin's receipt
                // already implies; the returned handle stays with the upstream manager, which
                // settles the child and releases its slot without further action here.
                const activation = await native.startActivation({ provider: raw.provider, label, childId,
                    request: { parent: exec.agent, prompt: [{ type: 'text', text: prompt }], ...(maxDepth === undefined ? {} : { maxDepth }), ...(cwd === undefined ? {} : { cwd }) },
                    signal: exec.signal, delivery: 'parent' });
                // The result promise rejects on capture failure; nobody here awaits it, and an
                // unhandled rejection would surface in the host process. The parent notice and
                // this plugin's lifecycle observation carry the outcome instead.
                const result = activation.result;
                if (result !== null && typeof result === 'object' && typeof result.catch === 'function')
                    result.catch(() => undefined);
                // The local-child overload with a reserved childId guarantees the message id.
                return { childId: String(activation.childId), messageId: String(activation.messageId ?? '') };
            },
            installNativeGuard(guard) { const remove = ctx.tools.guard(guard); disposers.push(remove); return remove; },
            installManagedGuard(guard) { const remove = ctx.tools.guard(guard); disposers.push(remove); return remove; },
            async flushSession(rawSessionId, signal) {
                const sessionId = SessionId(id(rawSessionId, 'sessionId')), control = AbortSignal.any([signal, lifetime.signal]);
                control.throwIfAborted();
                const actual = ctx.agents.get(sessionId), sessions = ctx.get('sessions');
                // A cold child is not resumed merely to prove a binding. No peer/actual
                // session means no program checkpoint receipt, not successful durability.
                if (!actual || actual.id !== sessionId || actual.session.header.id !== sessionId || !sessions)
                    return false;
                const persisted = await sessions.flush(actual.session);
                control.throwIfAborted();
                return persisted === true;
            },
            liveAgent(sessionId) { return ctx.agents.get(SessionId(id(sessionId, 'sessionId'))); },
            liveAgents() { return ctx.agents.list(); },
            async nativeActivity(sessionId) {
                const activity = await readNativeActivity(sessionId);
                // Complete only when the native catalog traversal succeeded without diagnostics.
                return { known: activity.known, reason: activity.reason, liveAgents: ctx.agents.list() };
            },
            nativeSubagentActivity(sessionId, signal) { return readNativeActivity(sessionId, signal); },
            nativeSubagentDrift(sessionId) { return nativeCounter.driftFacts(sessionId); },
            nativeSubagentStops(sessionId) { return nativeCounter.stops(sessionId); },
            nativeSubagentCountRevision(sessionId) { return nativeCounter.revision(sessionId); },
            nativeSubagentCountState(sessionId) { return nativeCounter.state(sessionId); },
            async openRuntimeStorage(parse) { return ports.openUnitStorage('runtime_bindings', parse); },
            async openUnitStorage(suffix, parse) {
                if (closing)
                    throw new ControlsError('access-denied', 'host is disposing');
                if (!/^[a-z][a-z0-9_]{0,63}$/u.test(suffix))
                    throw new ControlsError('invalid-input', 'module storage suffix must be a bounded domain identifier');
                const existing = unitHandles.get(suffix);
                if (existing) {
                    if (existing.parse !== parse)
                        throw new ControlsError('invalid-state', 'unit suffix is already bound to a different parser identity');
                    // The exact parser identity determines T. This sole generic erasure
                    // boundary shares the existing handle and its uncertainty latch.
                    return await existing.opening;
                }
                const opening = track(() => Promise.resolve().then(async () => createDomainVersionedStorage(await open(suffix, parse), 'state', parse)));
                unitHandles.set(suffix, { parse, opening });
                return await opening;
            },
            async readPolicyGrants() { const raw = await grants.read(); return raw === undefined ? parsePolicyGrants({ schemaVersion: 1, revision: 0, grants: [] }) : parsePolicyGrants(raw); },
            resourceLifecycle: {
                async closeEntrypoints() { return { closed: false, nativeColdResumeClosed: false }; },
                async verifyInitialBinding() { return false; },
            },
        };
        runtime = await options.createRuntime(ports);
        const active = runtime;
        active.setDelegateRegistered?.(options.delegate === true && active.delegate !== undefined);
        const supervisionLedger = new SupervisionLedger();
        let ledgerActive = false;
        const ownerBySession = new Map();
        const ownerOf = async (sessionId) => {
            const cached = ownerBySession.get(sessionId);
            if (cached !== undefined)
                return cached;
            let cursor = sessionId;
            const seen = new Set();
            for (let depth = 0; depth < 32; depth += 1) {
                if (seen.has(cursor))
                    return undefined;
                seen.add(cursor);
                let identity;
                try {
                    identity = await ports.authority.resolveSession(cursor);
                }
                catch {
                    return undefined;
                }
                if (identity === undefined)
                    return undefined;
                if (identity.kind === 'owner') {
                    for (const id of seen)
                        ownerBySession.set(id, cursor);
                    return cursor;
                }
                cursor = identity.parentSessionId;
            }
            return undefined;
        };
        let syncAuditTool = () => { };
        const service = new MattPocockControlsService(ctx, active, ports, grants, supervisionStorage, { signal: lifetime.signal, track, ...(options.onPolicyChanged === undefined ? {} : { onPolicyChanged: options.onPolicyChanged }), onSupervisionChanged: snapshot => syncAuditTool(snapshot) });
        disposers.push(ctx.typert.register(hostRemoteContribution()));
        // Optional enhancement failure never removes the established base namespace or tools.
        try {
            const unregister = ctx.typert.register(recommendationHostRemoteContribution());
            try {
                new MattPocockRecommendationSupportService(ctx, active, ports, { signal: lifetime.signal, track });
            }
            catch (error) {
                unregister();
                throw error;
            }
            disposers.push(unregister);
        }
        catch { /* Unsupported optional namespace is observable as unavailable; base remains usable. */ }
        // Model tools always address the actual caller's session, never a supplied principal.
        const model = createModelTools(active);
        const boundedError = (error) => {
            if (error instanceof ControlsError)
                return new ControlsError(error.code, previewText(error.message, 768).text);
            const value = error;
            return new ModelOutputError(typeof value?.code === 'string' ? previewText(value.code, 128).text : 'plugin-error', previewText(typeof value?.message === 'string' ? value.message : 'Plugin operation failed; source outcome may be unknown', 768).text, typeof value?.reason === 'string' ? previewText(value.reason, 128).text : undefined);
        };
        const tool = (name, description, action) => {
            disposers.push(ctx.tools.register(defineTool({ name, description: description + ' Model output schemaVersion 2: bounded current/page/detail/content or receipt, never result.snapshot. Use receipt appliedRevision/businessRevision/viewerRevision for their respective domains. Read queries use query={kind,recordId?,limit?,cursor?}; long fields use mattpocock_record {action:"detail",locator,offset?}.', parameters: { request: { type: 'json', required: true } },
                output: { schema: { type: 'json' }, render: (_, value) => [{ type: 'text', text: JSON.stringify(value) }] },
                async execute(args, exec) {
                    try {
                        exec.signal.throwIfAborted();
                        const caller = agentCaller(ctx, exec.agent), envelope = record(args, 'tool arguments', ['request']), raw = record(envelope.request, 'request');
                        const controlled = { ...exec, signal: AbortSignal.any([exec.signal, lifetime.signal]), concludeTurn: exec.concludeTurn.bind(exec), deferContext: exec.deferContext.bind(exec) };
                        return parseHostJson(JSON.parse(JSON.stringify(await track(async () => {
                            const who = await model.identity(caller, controlled.signal);
                            const result = await action(raw, caller, controlled);
                            try {
                                return model.finish(await model.project(name, who, raw, result, controlled.signal), name, raw);
                            }
                            catch (error) {
                                controlled.signal.throwIfAborted();
                                return model.finish(model.projectionFailure(name, who, raw, result, error), name, raw);
                            }
                        }))));
                    }
                    catch (error) {
                        exec.signal.throwIfAborted();
                        throw boundedError(error);
                    }
                },
            })));
        };
        tool('mattpocock_controls', 'Read saved workspace controls or save an explicitly delegated policy change. Requests are {action:"read", query?} or {action:"save", intent, expectedRevision}, where intent carries all three keys: {extensionEnabled, defaults, workspaceOverrides} (empty objects are valid). A patch accepts {workspace?, skills?} as {enabled}, {display?} as {header, inputSummary, rightPanel, sessionList, timeline}, {binding?, lifecycle?, ticketProgress?} as {enabled}, {pendingDecisions?} as {enabled?, interactionMode?: "native-question"|"async-decision"}, and {windows?} as {enabled, ticketWindowSize, runningSubagentLimit}. Extra keys are rejected and the error lists the accepted keys.', async (raw, caller, exec) => {
            if (raw.action === 'read') {
                record(raw, 'policy read', ['action', 'query']);
                await ports.authority.authorizePolicy(caller.principalId, 'read');
                return active.readPolicy(caller, exec.signal);
            }
            record(raw, 'policy save', ['action', 'intent', 'expectedRevision']);
            if (raw.action !== 'save')
                throw new ControlsError('invalid-input', 'read/save action required');
            await ports.authority.authorizePolicy(caller.principalId, 'write');
            const saved = await active.savePolicy(caller, parsePolicyIntent(raw.intent), revision(raw.expectedRevision, 'expectedRevision'), exec.signal);
            options.onPolicyChanged?.();
            return saved;
        });
        tool('mattpocock_record', 'Read the actual session instrument or submit authored task references and genuine user decisions. Task business facts stay in the agreed tracker/document. Prefer put-task-reference for T, assignment and decision links, not a duplicate business ticket. References are author reports, not verified source observations; local-current only certifies local instrument state. Read capabilities.taskReferences=true before using references; absence means unsupported, never fall back to a fake ticket. New query kind task-reference returns reference handles; legacy ticket remains readable. No source fetch is performed. New decisions are only for genuine unresolved user questions: set pending=true and addressee.kind=user; ordinary implementation choices, research and completion reports use existing spec, ADR and task records, not self-question/answer entries. Record an explicit reply with its source on the same decisionId; actual authenticated author stays agent when an agent records the reply. Partial, skipped, cancelled or silent replies are not approval; pending=false requires an explicit real resolution. On ordinary answer updates preserve existing awaitingImplementation=true; do not default new questions to awaiting=true. Await flags/counts are raw compatibility markers needing task-evidence review, not unfinished-task totals; explicit task handoff is not completion. Preserve the answer/result and task/source pointers; append review notes to context. Never infer completion or clear flags automatically. Legacy agent/unspecified/missing-addressee updates remain legal; OFF permits old-record closeout but no new records. Recommendation support requires capabilities.decisionRecommendationAdoption=true and current active owner authorization; absent means unsupported. First put a genuine pending user question with recommendation exactly equal to a unique options.key. Candidate is not adopted. Only an explicit second adopt-decision-recommendation on the same decisionId using returned exact candidate fields records a selection. Prior operator authorization is not a fresh user reply, completion proof, or additional operation permission; preserve result, references, await flags and task constraints. Never self-enable or renew the owner policy. Requests are {action:"read", query?}, {action:"detail", locator, offset?}, or {action:"apply", command} with command={operationId, expectedRevision, action:"put-workflow"|"put-task-reference"|"put-ticket"|"put-decision"|"set-decision-view"|"adopt-decision-recommendation", workflowId, references, value, plus localTicketId for put-task-reference or legacy put-ticket and decisionId for put-decision or set-decision-view}. Value shapes: put-task-reference {source:{kind:"external",instance,project,taskId}|{kind:"repository",repositoryAnchor,relativePath,anchor?}|{kind:"unverified"},locator,label?}; source is immutable and locator is required nonempty navigation only. No statuses/summary/disposition/claim/body/author/time. put-workflow {title, axes:[{axisKey, label, counting:"exclusive"|"overlapping", statuses:[{statusKey, label, meaning?, summaryPriority?}]}]}; put-ticket {title, statuses:{axisKey:[statusKey, ...]}, externalRef?, summary?, disposition?, suspicionMode?:\"auto\"|\"off\"}; put-decision {question, status, pending?, awaitingImplementation?, ticketIds?, context?, options?:[{key,label}], recommendation?, impact?, addressee?, result?}; set-decision-view {read, hidden}; adopt-decision-recommendation {optionKey,decisionRevision,policyEpochId,policyRevision} with no caller, author or time claims. Extra keys are rejected and the error lists the accepted keys.', async (raw, caller, exec) => {
            await ports.authorizeCaller(caller, caller.sessionId);
            if (raw.action === 'read') {
                record(raw, 'instrument read', ['action', 'query']);
                return model.current(caller, raw.query, exec.signal);
            }
            if (raw.action === 'detail')
                return model.detail(caller, raw, exec.signal);
            record(raw, 'instrument apply', ['action', 'command']);
            if (raw.action !== 'apply')
                throw new ControlsError('invalid-input', 'read/apply/detail action required');
            return active.applyInstrument(caller, caller.sessionId, parseInstrumentCommand(raw.command), exec.signal);
        });
        tool('mattpocock_window', 'Request keys: a flat object {operationId, workflowId, localTicketId, action:"reserve"|"release"|"reacquire", generation}, with generation required for release and reacquire and omitted for reserve; the ticket key is localTicketId, there is no nested command object and no read action — T/S facts come from the injected snapshot and mattpocock_history. Extra keys are rejected and the error lists the accepted keys. Register explicit local task-handle reservations, releases and reacquisitions. Handles may name taskReferences or legacy tickets in the same workflow. Register a minimal put-task-reference when a real T/assignment/decision association is needed; no duplicate task lifecycle or status dictionary is required (workflow axes may be empty). Reserve/reacquire fail closed if local handles cannot be read. Release exits this session advancement set, not source completion; follow task agreements and release explicitly when leaving that set. Release does not depend on source/local ticket reads, and OFF still permits authorized existing release. Never auto-release on child end, source closure or hiding. Legacy terminal pending-release is only an authored-report hint.', async (raw, caller, exec) => {
            await ports.authorizeCaller(caller, caller.sessionId);
            return active.applyTicketWindow(caller, caller.sessionId, parseTicketWindowCommand(raw), exec.signal);
        });
        if (active.historyAction)
            tool('mattpocock_history', 'Query this session retained instrument history separately from current context. Requests are {action:"query", query:{kind?,recordId?,limit?,cursor?}}, {action:"detail", historyIds}, {action:"set-context", kind, recordId, included}, {action:"purge", historyIds?, range?, archivedOnly?} to delete derived copies, {action:"compact"} to validate retained copies, {action:"purge-source", domain:"records"|"windows"|"worktrees", request}, or {action:"compact-source", domain:"records"|"windows"|"worktrees", request} for source cleanup preserving current state. Use sourceRevisions from query, not history revision. Paging summaries are not complete detail. Purge affects instrument data, not Git worktrees or native conversation history.', async (raw, caller, exec) => {
                const keys = {
                    query: ['action', 'query'], detail: ['action', 'historyIds'],
                    'set-context': ['action', 'kind', 'recordId', 'included'],
                    purge: ['action', 'historyIds', 'range', 'archivedOnly'], compact: ['action'],
                    'purge-source': ['action', 'domain', 'request'], 'compact-source': ['action', 'domain', 'request'],
                };
                const allowed = typeof raw.action === 'string' && Object.hasOwn(keys, raw.action) ? keys[raw.action] : undefined;
                if (!allowed)
                    throw new ControlsError('invalid-input', 'action required; accepted actions: query, detail, set-context, purge, compact, purge-source, compact-source');
                record(raw, 'history request', allowed);
                await ports.authorizeCaller(caller, caller.sessionId);
                return active.historyAction(caller, caller.sessionId, parseHostJson(raw), exec.signal);
            });
        if (active.worktreeAction)
            tool('mattpocock_worktree', 'Worktree instrument. The request is one of these shapes: {"action":"read"}; {"action":"update","command":{operationId,bindingId,expectedRevision,state:active|discarded|cleaned,notes?}}; {"action":"update-observation","command":{operationId,observationId,expectedRevision,state:open|cleaned,notes?}} marks a native-observed tree as handled; {"action":"reconcile","operationId"}. Put action at the top level of request; do not nest the action name as a key. Agent-authored marks and program facts (native binding facts, observed create_worktree rows, verified Git identity, read-time creator activity, and read-time nativeChildren associations) remain distinct; nativeChildren is a read-time created-tree association from the creator identity only — a child header cwd is a source value and never proof of the actual initial directory — and is never a strong binding, and an observation never claims who uses a directory. To enter or leave a checkout use the host\'s working_directory tool: cd to the checkout to enter it, and cd back to the project directory it reported to leave; the checkout and branch remain. To create, merge or delete trees and branches use the host\'s own Git tools (create_worktree when provided). This instrument records bindings only.', async (raw, caller, exec) => {
                const action = raw.action;
                if (action === 'read') {
                    record(raw, 'worktree read', ['action', 'query']);
                    return model.worktrees(caller, raw.query, exec.signal);
                }
                else if (action === 'update')
                    record(raw, 'worktree update', ['action', 'command']);
                else if (action === 'update-observation')
                    record(raw, 'worktree observation update', ['action', 'command']);
                else if (action === 'reconcile')
                    record(raw, 'worktree reconcile', ['action', 'operationId']);
                else {
                    const keys = JSON.stringify(Object.keys(raw).sort());
                    const received = typeof action === 'string' ? `action=${JSON.stringify(action)}` : action === undefined ? 'no action' : `action=<${typeof action}>`;
                    throw new ControlsError('invalid-input', `worktree action required: received ${received} with request keys ${keys}; expected one of {"action":"read"} | {"action":"update","command":{...}} | {"action":"update-observation","command":{...}} | {"action":"reconcile","operationId"}`);
                }
                await ports.authorizeCaller(caller, caller.sessionId);
                return active.worktreeAction(caller, caller.sessionId, parseHostJson(raw), exec.signal);
            });
        tool('mattpocock_resource', 'Read one recorded worktree resource row: its Git identity, retention facts and whether it can be retired ({action:"read", resourceId}). Manage Git checkouts and branches with the host\'s own tools — use the host\'s create_worktree when it is provided — and record lane relationships with mattpocock_worktree. Extra keys are rejected and the error lists the accepted keys.', async (raw, caller, exec) => {
            await ports.authorizeCaller(caller, caller.sessionId);
            const parsed = parseResourceAction(raw);
            if (parsed.action !== 'read')
                throw new ControlsError('feature-disabled', 'this tool only reads recorded resources; pass {action:"read", resourceId}. Creating, borrowing and retiring trees is Git work you do with the host tools.');
            return active.resourceAction(caller, caller.sessionId, parsed, exec.signal);
        });
        if (options.delegate === true && active.delegate)
            tool('mattpocock_delegate', 'Binding-first creation of a continuable spawn/fork child: description, prompt, optional provider ("spawn" or "fork"; default "spawn"), prepared worktree, operationId, workflowId and ticketIds. Use this only when you need a durable, verifiable ticket↔worktree binding (or the persistent intent, idempotency and pre-creation scope check that come with it); ordinary unbound lanes should use the host\'s native subagent/subagent_fork and mattpocock_assign instead. Prepare the worktree first with the host\'s create_worktree and pass its absolute path as worktree: the worktree is a requested initial cwd, and the actual child/parent/cwd header is verified only as a header source value — a header cwd does not prove where the child actually started or which directory it now uses. The binding records the requested cwd and the header-derived actual cwd with the task and ticketIds before the ticket assignment is written. Native acceptance of the creation is not a completed binding or assignment; report those effects separately. Omitting worktree records only the inherited intent, not a claim that the lane owns a dedicated tree. Retrying the same operationId never creates a second child; use a new operationId when you want another one. When workflowId is given, ticketIds must name at least one ticket already recorded in this instrument; omit workflowId entirely for a ticketless research lane. If creation was accepted or its metadata is uncertain, use that existing child and verify the binding; never create it again. If assignment was not granted, grant it explicitly to the same child with mattpocock_assign. If recording is reported unknown or failed, read the binding with mattpocock_worktree before retrying.', async (raw, caller, exec) => {
                record(raw, 'delegation request', ['description', 'prompt', 'provider', 'worktree', 'operationId', 'workflowId', 'ticketIds']);
                await ports.authorizeCaller(caller, caller.sessionId);
                return active.delegate(caller, parseHostJson(raw), exec);
            });
        if (active.assign)
            tool('mattpocock_assign', 'Record only authenticated delegation assignments as {sessionId, workflowId, ticketIds}; handles name existing taskReferences or legacy tickets, not external URLs or tracker claims. Unknown local handle reads fail closed. The target must be your actual direct child in the same instance. Effective scope is the intersection of raw grants along its actual current parent chain; ancestor narrowing immediately hides old scope, and restoring it may make an original raw grant effective again. Omit workflowId (or pass null) and omit ticketIds for an unrestricted native ticketless lane with no instrument task access. Never self-grant user policy access. Extra keys are rejected and the error lists the accepted keys.', async (raw, caller, exec) => {
                await ports.authorizeCaller(caller, caller.sessionId);
                return active.assign(caller, parseHostJson(raw), exec.signal);
            });
        const supervisionStores = new Map();
        const nextSupervisionCheck = new Map();
        const assignmentCache = new Map();
        const assignmentAttempts = new Set();
        const rememberAssignment = (owner, session, assignment) => {
            const refs = assignment === undefined ? [] : assignment.ticketIds.map(ticketId => Object.freeze({ workflowId: assignment.workflowId, ticketId }));
            assignmentCache.set(session, refs);
            supervisionLedger.tagSession(owner, session, refs);
            return refs;
        };
        const assignmentFromArguments = (argumentsValue) => {
            if (argumentsValue === null || typeof argumentsValue !== 'object' || Array.isArray(argumentsValue))
                return undefined;
            const outer = argumentsValue, request = outer.request !== null && typeof outer.request === 'object' && !Array.isArray(outer.request) ? outer.request : outer;
            if (typeof request.sessionId !== 'string' || request.sessionId.length === 0)
                return undefined;
            const workflowId = request.workflowId === null || request.workflowId === undefined ? null : (typeof request.workflowId === 'string' ? request.workflowId : undefined);
            const ticketIds = request.ticketIds === undefined ? [] : (Array.isArray(request.ticketIds) && request.ticketIds.every(ticket => typeof ticket === 'string') ? request.ticketIds : undefined);
            if (workflowId === undefined || ticketIds === undefined)
                return undefined;
            return { sessionId: request.sessionId, refs: ticketIds.map(ticketId => Object.freeze({ workflowId, ticketId })) };
        };
        const resolveAssignment = (owner, agent, signal) => {
            const session = agent.id;
            if (assignmentCache.has(session) || assignmentAttempts.has(session))
                return;
            assignmentAttempts.add(session);
            void track(async () => {
                const view = await active.readSession(agentCaller(ctx, agent), session, signal);
                rememberAssignment(owner, session, view.assignment);
            }).catch(error => { assignmentAttempts.delete(session); ctx.logger('mattpocock-controls').warn('supervision assignment read skipped', error); });
        };
        const openSupervisionState = (owner) => {
            let store = supervisionStores.get(owner);
            if (!store) {
                store = ports.openUnitStorage('supervision_state_' + createHash('sha256').update(owner).digest('hex').slice(0, 32), parseSupervisionDocument);
                supervisionStores.set(owner, store);
            }
            return store;
        };
        let auditToolDispose;
        const audit = async (caller, exec) => {
            const identity = await model.identity(caller, exec.signal);
            const selected = await active.readModelSource(caller, caller.sessionId, { domain: 'policy', key: sourceKey('policy', 'effective', identity.instance.controlWorkspaceId) }, exec.signal);
            if (selected.source === null)
                throw new ControlsError('invalid-state', 'effective supervision policy unavailable');
            const view = { instance: identity.instance, policy: selected.source.value };
            if (view.instance.ownerSessionId !== caller.sessionId)
                throw new ControlsError('access-denied', 'delivery supervision audit is owner-session only');
            if (!view.policy.extensionEnabled || !view.policy.workspaceEnabled)
                throw new ControlsError('feature-disabled', 'collaboration controls are disabled for this workspace');
            const settings = resolveSupervisionSettings(supervisionSnapshot, view.instance.controlWorkspaceId);
            if (!settings.enabled)
                throw new ControlsError('feature-disabled', 'delivery supervision is disabled for this workspace');
            const summary = supervisionLedger.summary(view.instance.ownerSessionId, {
                deliverableRoots: settings.deliverableRoots, supportRoots: settings.supportRoots, excludeGlobs: settings.excludeGlobs,
            }, Date.now());
            let episodes = [], episodeRevision = null, episodeCoverage = 'not-recorded';
            try {
                const raw = await (await openSupervisionState(view.instance.ownerSessionId)).read();
                if (raw !== undefined) {
                    const retained = parseSupervisionDocument(raw);
                    episodes = retained.episodes;
                    episodeRevision = retained.revision;
                    episodeCoverage = 'current';
                }
            }
            catch {
                episodeCoverage = 'unknown'; /* A corrupt episode source must not hide the live ledger or claim an empty known set. */
            }
            return {
                action: 'read', status: 'ok', generatedAt: new Date().toISOString(),
                coverage: { ownerSessionId: view.instance.ownerSessionId, workspaceId: view.instance.controlWorkspaceId,
                    persistence: 'memory-only', events: summary.events, sessions: summary.sessions, dropped: summary.dropped, episodes: { status: episodeCoverage, retained: episodeCoverage === 'unknown' ? null : episodes.length } },
                summary, episodes, episodeRevision,
                note: 'Memory-only observation from this host process; no model call, ticket mutation, T/S release or automatic delivery.',
            };
        };
        model.setAuditReader((caller, signal) => audit(caller, { signal }));
        syncAuditTool = snapshot => {
            supervisionSnapshot = snapshot;
            const enabled = snapshot.defaults.enabled === true || Object.values(snapshot.workspaceOverrides).some(patch => patch.enabled === true);
            ledgerActive = enabled;
            nextSupervisionCheck.clear();
            if (!enabled) {
                supervisionLedger.clear();
                auditToolDispose?.();
                auditToolDispose = undefined;
                return;
            }
            if (auditToolDispose !== undefined)
                return;
            try {
                auditToolDispose = ctx.tools.register(defineTool({ name: 'mattpocock_audit', description: 'Read the optional delivery-supervision ledger for the authenticated owner session. Request: {action:"read", query?}. Returns memory-only observations from this host process; it never calls a model, mutates tickets, releases T/S or delivers a message. It is registered only while supervision is enabled in configured defaults or a workspace override; per-workspace policy still gates each call.', parameters: { request: { type: 'json', required: true } },
                    output: { schema: { type: 'json' }, render: (_, value) => [{ type: 'text', text: JSON.stringify(value) }] },
                    async execute(args, exec) {
                        try {
                            exec.signal.throwIfAborted();
                            const caller = agentCaller(ctx, exec.agent), envelope = record(args, 'tool arguments', ['request']), raw = record(envelope.request, 'request', ['action', 'query']);
                            if (raw.action !== 'read')
                                throw new ControlsError('invalid-input', 'audit action required: {action:"read"}');
                            const controlled = { ...exec, signal: AbortSignal.any([exec.signal, lifetime.signal]), concludeTurn: exec.concludeTurn.bind(exec), deferContext: exec.deferContext.bind(exec) };
                            await ports.authorizeCaller(caller, caller.sessionId);
                            return parseHostJson(JSON.parse(JSON.stringify(await track(async () => model.finish(await model.audit(caller, raw.query, await audit(caller, controlled), controlled.signal), 'mattpocock_audit', raw)))));
                        }
                        catch (error) {
                            exec.signal.throwIfAborted();
                            throw boundedError(error);
                        }
                    } }));
            }
            catch (error) {
                auditToolDispose = undefined;
                ctx.logger('mattpocock-controls').warn('audit tool registration failed; supervision observations remain off', error);
            }
        };
        syncAuditTool(supervisionSnapshot);
        const llmReview = async (ownerSessionId, settings, trigger, summary, ticket, signal) => {
            const llm = ctx.get('llm');
            const ownerAgent = ctx.agents.get(SessionId(ownerSessionId));
            const selected = settings.reviewer.routeMode === 'explicit'
                ? (settings.reviewer.provider.length > 0 && settings.reviewer.model.length > 0 ? { provider: settings.reviewer.provider, model: settings.reviewer.model, ...(settings.reviewer.reasoningEffort.length > 0 ? { reasoningEffort: settings.reviewer.reasoningEffort } : {}) } : null)
                : ownerAgent?.model?.current();
            if (!llm || !selected)
                return null;
            const prompt = JSON.stringify({ task: 'delivery-supervision-review', trigger,
                instructions: 'Return one JSON object only with verdict on-track|suspicion|uncertain, severity info|concern|alert, observed (short factual sentence), possibleIssue (short tentative sentence), confidence 0..1. Do not claim certainty and do not issue commands.',
                ticket,
                tickets: summary.tickets.slice(0, 4),
                evidence: { events: summary.events, productWrites: summary.productWrites, supportWrites: summary.supportWrites,
                    productFiles: summary.productFiles.slice(0, 30), supportFiles: summary.supportFiles.slice(0, 30),
                    lastProductAt: summary.lastProductAt, noProductHours: summary.noProductHours, supportOnly: summary.supportOnly, rootsConfigured: summary.rootsConfigured } });
            const control = AbortSignal.any([signal, AbortSignal.timeout(settings.reviewer.timeoutMs)]);
            let text = '', tokens = 0;
            try {
                for await (const chunk of llm.stream({ provider: selected.provider, model: selected.model, ...(selected.reasoningEffort === undefined ? {} : { reasoningEffort: selected.reasoningEffort }),
                    messages: [createUserMessage({ content: [{ type: 'text', text: prompt }], source: { kind: 'user' } })], maxTokens: settings.reviewer.maxTokens, temperature: 0, signal: control })) {
                    if (chunk.type === 'text-delta')
                        text += chunk.text ?? '';
                    if (chunk.type === 'usage' && chunk.usage !== undefined)
                        tokens = Math.max(tokens, chunk.usage.totalTokens ?? chunk.usage.inputTokens + chunk.usage.outputTokens);
                    if (text.length > 16_384)
                        return null;
                }
            }
            catch {
                return null;
            }
            const start = text.indexOf('{'), end = text.lastIndexOf('}');
            if (start < 0 || end <= start)
                return null;
            try {
                const raw = JSON.parse(text.slice(start, end + 1));
                const verdict = raw.verdict, severity = raw.severity, observed = raw.observed, possibleIssue = raw.possibleIssue, confidence = raw.confidence;
                if (!['on-track', 'suspicion', 'uncertain'].includes(String(verdict)) || !['info', 'concern', 'alert'].includes(String(severity)))
                    return null;
                if (typeof observed !== 'string' || observed.length === 0 || observed.length > 4096 || typeof possibleIssue !== 'string' || possibleIssue.length === 0 || possibleIssue.length > 2048)
                    return null;
                if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1)
                    return null;
                return Object.freeze({ review: Object.freeze({ verdict: verdict, severity: severity, observed, possibleIssue, confidence }), tokens });
            }
            catch {
                return null;
            }
        };
        const maybeSupervise = async (ownerSessionId, agent, signal) => {
            if (!ledgerActive)
                return;
            const now = Date.now();
            if ((nextSupervisionCheck.get(ownerSessionId) ?? 0) > now)
                return;
            const identity = await ports.authority.resolveSession(ownerSessionId);
            if (identity === undefined || identity.kind !== 'owner')
                return;
            const settings = resolveSupervisionSettings(supervisionSnapshot, identity.controlWorkspaceId);
            if (!settings.enabled)
                return;
            nextSupervisionCheck.set(ownerSessionId, now + Math.max(1, settings.checkIntervalMinutes) * 60_000);
            const store = await openSupervisionState(ownerSessionId);
            let raw = await store.read();
            if (raw === undefined) {
                try {
                    await store.compareAndSwap(0, initialSupervisionDocument(ownerSessionId, identity.controlWorkspaceId, now));
                }
                catch { /* another observer may have initialized it */ }
                raw = await store.read();
            }
            if (raw === undefined)
                return;
            const document = parseSupervisionDocument(raw);
            const summary = supervisionLedger.summary(ownerSessionId, { deliverableRoots: settings.deliverableRoots, supportRoots: settings.supportRoots, excludeGlobs: settings.excludeGlobs }, now);
            const view = await active.readSession(agentCaller(ctx, agent), agent.id, signal);
            if (!view.policy.extensionEnabled || !view.policy.workspaceEnabled)
                return;
            rememberAssignment(ownerSessionId, agent.id, view.assignment);
            const assignedTickets = view.assignment === undefined ? [] : (view.records?.tickets ?? []).filter(ticket => view.assignment.ticketIds.includes(ticket.localTicketId) && (view.assignment.workflowId === null || ticket.workflowId === view.assignment.workflowId));
            const markedTicket = assignedTickets.find(ticket => ticket.value.suspicionMode === 'off') ?? assignedTickets[0];
            const ticketContext = { id: markedTicket?.localTicketId ?? null, research: assignedTickets.some(ticket => ticket.value.suspicionMode === 'off') };
            const ticketSuspicionMode = ticketContext.research ? 'off' : assignedTickets.find(ticket => ticket.value.suspicionMode === 'auto')?.value.suspicionMode;
            const trigger = decideSupervisionTrigger(document, settings, summary, now, ticketSuspicionMode);
            if (trigger === null)
                return;
            const reviewed = settings.dryRun ? { review: deterministicReview(trigger, summary), tokens: 0 } : await llmReview(ownerSessionId, settings, trigger, summary, ticketContext, signal);
            if (reviewed === null)
                return;
            const review = reviewed.review;
            const gate = (summary.noProductHours ?? 0) >= settings.delivery.alertMinNoProductHours && summary.supportFiles.length >= settings.delivery.alertMinSupportFiles;
            const ownerAgent = ctx.agents.get(SessionId(ownerSessionId));
            const delivery = settings.dryRun ? 'none' : review.severity === 'alert' && gate && ownerAgent ? 'card+agent' : review.severity === 'info' ? 'none' : 'card';
            const episode = makeSupervisionEpisode({ document, trigger, review, summary, now, delivery, ticketId: ticketContext.id, research: ticketContext.research });
            if (!await store.compareAndSwap(document.revision, withSupervisionEpisode(document, episode, settings, now, reviewed.tokens)))
                return;
            if (delivery === 'card+agent' && ownerAgent) {
                try {
                    ownerAgent.inject(makeSupervisionNotice(episode));
                }
                catch (error) {
                    ctx.logger('mattpocock-controls').warn('supervision notice injection failed', error);
                }
            }
        };
        disposers.push(() => { auditToolDispose?.(); auditToolDispose = undefined; });
        disposers.push(ctx.on('session/event', (session, event) => {
            // A parent-owned subagent/catalog fact is a membership-change node.
            if (event.type === 'subagent/catalog')
                nativeCounter.catalog(String(session.id), event.data.childId === undefined ? undefined : String(event.data.childId));
            if (event.type !== 'user/message')
                return;
            const message = event.data, attempt = noticeAttempts.get(message.id);
            if (!attempt || session !== attempt.actualAgent.session || message.source.kind !== 'mattpocock-controls-notification')
                return;
            const source = message.source;
            if (source.form !== 'notice' || source.notificationId !== attempt.input.notificationId || source.ownerSessionId !== session.id || source.instrumentInstanceId !== attempt.input.instrumentInstanceId || source.businessRevision !== attempt.input.businessRevision || source.authorPrincipalId !== attempt.input.authorPrincipalId)
                return;
            void track(async () => {
                // Append observers publish after in-memory log commit. Let the entire
                // synchronous append feed buffer before requesting the real checkpoint.
                await Promise.resolve();
                const store = ctx.get('sessions');
                if (!store || !active.notificationCommitted || !await store.flush(session))
                    return;
                await active.notificationCommitted(attempt.input.ownerSessionId, attempt.input.notificationId, message.id);
                for (const [key, pendingAttempt] of noticeAttempts)
                    if (pendingAttempt.input.notificationId === attempt.input.notificationId && pendingAttempt.input.ownerSessionId === attempt.input.ownerSessionId)
                        noticeAttempts.delete(key);
            }).catch(error => ctx.logger.warn('controls notification durability failed', error));
        }));
        disposers.push(ctx.on('agent/created', async ({ agent, signal }) => {
            nativeCounter.created(agent);
            await track(() => active.created(agentCaller(ctx, agent), signal ? AbortSignal.any([signal, lifetime.signal]) : lifetime.signal, agent));
            return undefined;
        }));
        // The host may assemble one model request several times (and a PTC step may complete several
        // nested dispatches); all of them share the same turn:step identity, which is the delivery step.
        let admittedStep = '0:0';
        disposers.push(ctx.on('agent/pre-step', async ({ agent, signal, turn, step }, next) => {
            const decision = await next();
            if (decision.kind === 'reject')
                return decision;
            admittedStep = turn + ':' + step;
            const messages = await track(() => active.preStep(agentCaller(ctx, agent), signal, decision.messages, admittedStep));
            signal.throwIfAborted();
            return messages.length === 0 ? decision : { ...decision, messages: [...decision.messages, ...messages] };
        }));
        if (active.postExecute)
            disposers.push(ctx.on('tools/post-execute', async (exec, result, next) => {
                const decision = await next();
                if (!exec.agent)
                    return decision;
                // A throwing post-execute listener replaces the native result — and every context
                // ferried through it — with a bare error, so this observation must never fail the
                // call. Aborts (including the post-program drain after a PTC run aborts) pass the
                // decision through unchanged.
                try {
                    const contexts = await track(() => active.postExecute(agentCaller(ctx, exec.agent), exec, result, admittedStep));
                    return contexts.length === 0 ? decision : { ...decision, additionalContexts: [...decision.additionalContexts ?? [], ...contexts] };
                }
                catch (error) {
                    // Cancellation keeps the exact caller reason: swallowing an abort would misreport the
                    // caller's own cancellation. Any other observer failure must not replace the native
                    // result, which is why it is logged and passed through instead of rethrown.
                    if (exec.signal.aborted)
                        throw exec.signal.reason ?? error;
                    ctx.logger.warn('mattpocock-controls post-execute observation skipped', error);
                    return decision;
                }
            }));
        disposers.push(ctx.on('tools/post-execute', async (exec, result, next) => {
            const decision = await next();
            if (!ledgerActive || !exec.agent)
                return decision;
            try {
                const agent = exec.agent, owner = await ownerOf(agent.id);
                if (owner !== undefined) {
                    const assigned = exec.name === 'mattpocock_assign' ? assignmentFromArguments(exec.arguments) : undefined;
                    if (assigned !== undefined) {
                        assignmentCache.set(assigned.sessionId, assigned.refs);
                        supervisionLedger.tagSession(owner, assigned.sessionId, assigned.refs);
                    }
                    const tickets = assignmentCache.get(agent.id) ?? [];
                    supervisionLedger.record({ ownerSessionId: owner, sessionId: agent.id, callId: exec.callId, rootCallId: exec.rootCallId, tool: exec.name, arguments: exec.arguments, tickets });
                    if (!assignmentCache.has(agent.id))
                        resolveAssignment(owner, agent, AbortSignal.any([exec.signal, lifetime.signal]));
                    void track(() => maybeSupervise(owner, agent, AbortSignal.any([exec.signal, lifetime.signal]))).catch(error => ctx.logger('mattpocock-controls').warn('supervision audit skipped', error));
                }
            }
            catch (error) {
                // Ledger observation is an optional side effect; never replace the native result.
                ctx.logger('mattpocock-controls').warn('supervision ledger observation skipped', error);
            }
            return decision;
        }));
        if (active.context)
            disposers.push(ctx.systemPrompt.context({ name: 'mattpocock-controls', order: 130,
                text: assembly => assembly.agent ? active.context(agentCaller(ctx, assembly.agent)) : '' }));
        const observe = (event) => { void track(() => active.observe(Object.freeze(event))).catch(error => ctx.logger('mattpocock-controls').warn(error)); };
        // One wake event per new terminal-outcome item; the item stays in the counter until the
        // child runs again, its start edge arrives, or a late end arrives.
        forwardNativeStop = stop => { const { ownerSessionId, ...item } = stop; observe({ kind: 'native-stop', ownerSessionId, item }); };
        disposers.push(ctx.on('agent/status', ({ agent, status }) => {
            nativeCounter.status(agent, status);
            observe({ kind: 'agent-status', sessionId: agent.id, status, actualAgent: agent });
        }));
        disposers.push(ctx.on('agent/disposed', ({ agent }) => {
            nativeCounter.disposed(agent);
            for (const [key, attempt] of noticeAttempts)
                if (attempt.actualAgent === agent)
                    noticeAttempts.delete(key);
            return observe({ kind: 'agent-disposed', sessionId: agent.id, actualAgent: agent });
        }));
        disposers.push(ctx.on('subagent/start', info => {
            const agent = info.local ? ctx.agents.get(info.id) : undefined;
            nativeCounter.start(String(info.id), info.local, agent, String(info.runId));
            observe({ kind: 'subagent-start', sessionId: info.id, runId: info.runId, provider: info.provider, local: info.local, ...(agent ? { actualAgent: agent } : {}) });
        }));
        disposers.push(ctx.on('subagent/end', info => {
            const agent = info.local ? ctx.agents.get(info.id) : undefined;
            nativeCounter.end(String(info.id), info.local, agent, info.stopReason, String(info.runId));
            // The published end is forwarded even when this mount no longer holds the Agent (dispose or
            // registry loss). The runtime records it from durable owner facts or reports an explicit gap.
            observe({ kind: 'subagent-end', sessionId: info.id, runId: info.runId, provider: info.provider, local: info.local, stopReason: info.stopReason, ...(agent ? { actualAgent: agent } : {}) });
        }));
        ctx.effect(() => dispose);
        resolveNotificationObserverReady();
        return { service, ports, dispose, skillsEnabledForCwd: async (cwd) => {
                try {
                    if (typeof cwd !== 'string' || cwd === '')
                        return true;
                    const workspace = await ctx.workspaceRegistry.resolveByPath(cwd);
                    if (!workspace)
                        return true;
                    const { resolvePolicy } = await import('./controls/policy.js');
                    const policy = await service.readPolicy();
                    return resolvePolicy(policy, workspace.id, true).skillsEnabled;
                }
                catch {
                    return true;
                }
            } };
    }
    catch (error) {
        await dispose();
        throw error;
    }
}
