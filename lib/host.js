import { lstat, readlink } from 'node:fs/promises';
import { isAbsolute, normalize } from 'node:path';
import { classifyRunnerFailure, matchesSignature } from '@deepseek-ai/dsh-sandbox';
import { ResourceError } from './controls/resources.js';
import { createUserMessage, ToolCallId } from '@deepseek-ai/dsh-llm';
import { SessionId } from '@deepseek-ai/dsh-session';
import { WorkspaceId } from '@deepseek-ai/dsh-workspace';
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
import { foldSubagentDescriptor } from '@deepseek-ai/dsh-subagent';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { z } from 'zod';
import { createDomainControlsStorage } from './controls/storage.js';
import { parseControlsDocument } from './controls/state.js';
import { createDomainInstrumentStorage } from './controls/instrument-storage.js';
import { parseInstrumentCommand, parseInstrumentDocument } from './controls/instrument-state.js';
import { parsePolicyIntent, parsePolicySnapshot } from './controls/policy.js';
import { createDomainWindowStorage, parseWindowDocument, parseTicketWindowCommand } from './controls/windows.js';
import { createDomainResourceStorage, parseResourceDocument } from './controls/resources.js';
import { createDomainVersionedStorage } from './controls/versioned-storage.js';
import { REMOTE_NAMESPACE, REMOTE_CONTRIBUTION, parseHostJson, parsePolicyGrants, parseResourceAction } from './controls/remote-contract.js';
import { boolean, ControlsError, freeze, id, increment, memoized, record, revision } from './controls/validation.js';
import { StartupSupport } from './controls/startup-support.js';
import { parseStartupDesired, parseStartupDocument } from './controls/startup-state.js';
import { HostStartupNode } from './compatibility/host-startup.js';
import { inspectCompatibilityPreparation } from './compatibility/readiness.js';
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
    return subagents.initialCwdSupported === true ? 'bridge' : 'unsupported';
}
function initialChildCwdSupported(ctx) {
    return initialChildCwdSeam(ctx) !== 'unsupported';
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
/** A read path waits at most this long for queued walk work before stating the state it has. */
const NATIVE_SETTLE_BUDGET_MS = 1_500;
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
        this.#tails.set(owner, next.then(() => undefined, () => undefined));
        return next;
    }
    /** Await the owner's serial queue to quiescence: a task it queues must not be missed by a read. */
    async #settle(owner, budgetMs) {
        if (budgetMs === undefined) {
            for (;;) {
                const pending = this.#tails.get(owner);
                if (pending === undefined)
                    return;
                await pending;
                if (this.#tails.get(owner) === pending)
                    return;
            }
        }
        const until = Date.now() + budgetMs;
        for (;;) {
            const pending = this.#tails.get(owner);
            if (pending === undefined)
                return;
            const remaining = until - Date.now();
            if (remaining <= 0)
                return;
            await Promise.race([pending.then(() => undefined, () => undefined),
                new Promise(resolve => setTimeout(resolve, remaining))]);
            if (this.#tails.get(owner) === pending)
                return;
        }
    }
    #refresh(owner, signal) {
        return this.#serial(owner, () => this.#refreshNow(owner, signal));
    }
    /** Walk first, then reconcile: a stop is never claimed from a catalog this node just lost. */
    #afterWalk(owner, task) {
        void this.#serial(owner, async () => { await this.#refreshNow(owner); task(); }).catch(() => undefined);
    }
    #bump(owner) { this.#revisions.set(owner, (this.#revisions.get(owner) ?? 0) + 1); }
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
        const bounded = control === undefined ? deadline : AbortSignal.any([control, deadline]);
        let rows;
        try {
            // Exactly one direct-children read. The full-subtree walk this replaces reads every
            // descendant's own session log, which is unbounded work on a read path (measured on a
            // live profile: 2048 descendant logs, 2.1 GB, a baseline walk that never finished); the
            // resident subtree comes from the live Agent index instead, whose parent chains already
            // describe it, and the deadline keeps an unavailable catalog from blocking the caller.
            const listing = typeof list.listChildren === 'function'
                ? list.listChildren(SessionId(owner), bounded)
                : list.listDescendants(SessionId(owner), bounded);
            listing.catch(() => undefined);
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
            return;
        }
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
    }
    /** Resident subtree membership from the live Agent index alone: the direct children admit
     * their own resident children, transitively. Reads no session log, bounded by the live count. */
    #liveSubtree(owner, known) {
        const live = this.#liveIndex(), members = new Set(known), added = [];
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
        for (const [runId, run] of ledger.runs) {
            if (runId === skip || running.has(runId))
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
        await this.#settle(owner, NATIVE_SETTLE_BUDGET_MS);
        let membership = this.#members.get(owner), ledger = this.#ledgers.get(owner);
        if (ledger === undefined) {
            // Load/restart baseline: one bounded catalog read plus ctx.agents.list().
            await this.#refresh(owner, signal);
            await this.#settle(owner, NATIVE_SETTLE_BUDGET_MS);
            membership = this.#members.get(owner);
            if (membership === undefined)
                return { known: false, running: 0, total: 0, reason: 'native-subagent-service-unavailable' };
            ledger = { runs: new Map(), drifts: [], stops: new Map(), unresolved: new Set(), generations: new Map() };
            for (const runId of this.#running(this.#liveIndex(), membership))
                ledger.runs.set(runId, { counted: true, sawIdle: false, runId: null, settle: null });
            this.#ledgers.set(owner, ledger);
        }
        if (membership === undefined || ledger === undefined)
            return { known: false, running: 0, total: 0, reason: 'native-subagent-service-unavailable' };
        if (this.#lister() === undefined) {
            const running = this.#running(this.#liveIndex(), membership).size;
            return { known: false, running, total: Math.max(membership.total, running), reason: 'native-subagent-service-unavailable' };
        }
        // A live descendant the membership does not know is itself a membership-change node.
        const live = this.#liveIndex();
        const unknown = this.#unknownLiveMembers(owner, membership, ledger, live);
        if (unknown.length > 0) {
            await this.#refresh(owner, signal);
            await this.#settle(owner);
            membership = this.#members.get(owner) ?? membership;
            for (const candidate of unknown)
                if (membership.ids.has(candidate))
                    ledger.unresolved.delete(candidate);
                else
                    ledger.unresolved.add(candidate);
        }
        const running = this.#running(live, membership).size, total = Math.max(membership.total, running);
        if (!membership.known)
            return { known: false, running, total, reason: membership.reason };
        return { known: true, running, total, reason: null };
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
                this.#reconcile(owner, sessionId);
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
                this.#reconcile(owner, sessionId);
            else
                this.#afterWalk(owner, () => this.#reconcile(owner, sessionId));
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
                this.#reconcile(owner, sessionId);
            else
                this.#afterWalk(owner, () => this.#reconcile(owner, sessionId));
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
                this.#reconcile(owner);
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
export function operatorCaller(ctx) {
    const invocation = ctx.invocation;
    const operator = ctx.connection.operator;
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
    const descriptor = foldSubagentDescriptor(facts.events);
    if (!descriptor && !(retained?.kind === 'managed-child' && retained.parentSessionId === h.parentSession))
        return undefined;
    if (retained?.kind === 'owner' || retained?.kind === 'managed-child' && retained.parentSessionId !== h.parentSession)
        return undefined;
    return freeze({ kind: 'managed-child', parentSessionId: h.parentSession });
}
export function createHostAuthority(ctx, storage, grants) {
    const operatorPrincipal = 'user:' + id(ctx.connection.operator.id, 'operator id');
    // Authorization, association resolution and native-child confirmation read these facts.
    // Only subagent classification consumes the folded event stream; every other caller reads
    // the immutable header. The lightweight persistence port observes one stored session
    // WITHOUT reading its event log, so owner sessions never pay a cold log decode here; the
    // full observation stays the fallback and the canonical not-found path, and its result is
    // shared across concurrent and near-term repeat calls.
    const FACTS_CACHE_TTL_MS = 5_000;
    const FACTS_CACHE_MAX = 16;
    const FACTS_CACHE_MAX_EVENTS = 4_000;
    const EMPTY_EVENTS = Object.freeze([]);
    const LIVE_FACTS_TTL_MS = 250;
    const liveFacts = new Map();
    const HEADER_FACTS_TTL_MS = 2_000;
    const HEADER_FACTS_MAX = 64;
    const headerFacts = new Map();
    const coldFacts = new Map();
    const coldInflight = new Map();
    const storedSnapshot = async (sessionId, signal) => {
        // Optional seam: an older composition without this service keeps the observation path.
        const persistence = typeof ctx.get === 'function' ? ctx.get('sessionPersistence') : undefined;
        if (persistence === undefined || typeof persistence.stat !== 'function')
            return undefined;
        return await persistence.stat(sessionId, signal === undefined ? undefined : { signal });
    };
    const observeColdFacts = async (sessionId, signal) => {
        const cached = coldFacts.get(sessionId);
        if (cached !== undefined && Date.now() - cached.at < FACTS_CACHE_TTL_MS)
            return cached.facts;
        const inflight = coldInflight.get(sessionId);
        if (inflight !== undefined)
            return await inflight;
        const pending = (async () => {
            const observation = await ctx.sessionQuery.observeSession(sessionId, { ...(signal ? { signal } : {}), projectionMode: 'none' });
            try {
                return freeze({ header: observation.header, events: observation.events.slice(observation.inheritedEventCount), live: false });
            }
            finally {
                observation[Symbol.dispose]();
            }
        })();
        coldInflight.set(sessionId, pending);
        try {
            const facts = await pending;
            if (facts.events.length <= FACTS_CACHE_MAX_EVENTS) {
                const cutoff = Date.now() - FACTS_CACHE_TTL_MS;
                for (const [key, entry] of coldFacts)
                    if (entry.at < cutoff)
                        coldFacts.delete(key);
                coldFacts.delete(sessionId);
                coldFacts.set(sessionId, { at: Date.now(), facts });
                while (coldFacts.size > FACTS_CACHE_MAX)
                    coldFacts.delete(coldFacts.keys().next().value);
            }
            return facts;
        }
        finally {
            coldInflight.delete(sessionId);
        }
    };
    /** foldSubagentDescriptor is the only reader of `events`, and it is reached only
     * for subagent headers. Deep-freezing a long-lived owner session's whole owned
     * suffix cost a full traversal per tool execution and per step (measured: 135 ms
     * for 47k events), which pegged a core while a single agent worked. Owners now
     * carry no events, and subagent facts are reused briefly instead of re-frozen.
     */
    const liveSessionFacts = (live) => {
        const header = live.session.header;
        if (header.origin !== 'subagent')
            return Object.freeze({ header, events: EMPTY_EVENTS, live: true });
        const cached = liveFacts.get(header.id);
        const now = Date.now();
        if (cached !== undefined && now - cached.at < LIVE_FACTS_TTL_MS)
            return cached.facts;
        const events = live.session.ownEvents();
        const facts = Object.freeze({ header, events: Object.freeze(events), live: true });
        liveFacts.set(header.id, { at: now, facts });
        while (liveFacts.size > FACTS_CACHE_MAX)
            liveFacts.delete(liveFacts.keys().next().value);
        return facts;
    };
    const sessionHeaderFacts = async (raw, signal) => {
        const sessionId = SessionId(id(raw, 'sessionId'));
        signal?.throwIfAborted();
        // Header facts change only when a session is created or delegated, yet the authorization
        // seam asks for them dozens of times per second (measured: ~82 stored-session stats per
        // second while a turn was active). Repeat lookups inside this short window reuse them.
        const cachedHeader = headerFacts.get(sessionId);
        const now = Date.now();
        if (cachedHeader !== undefined && now - cachedHeader.at < HEADER_FACTS_TTL_MS)
            return cachedHeader.facts;
        const live = ctx.agents.get(sessionId);
        let facts;
        if (live !== undefined)
            facts = liveSessionFacts(live);
        else {
            const snapshot = await storedSnapshot(sessionId, signal);
            facts = snapshot !== undefined ? freeze({ header: snapshot.header, events: [], live: false }) : await observeColdFacts(sessionId, signal);
        }
        headerFacts.set(sessionId, { at: now, facts });
        while (headerFacts.size > HEADER_FACTS_MAX)
            headerFacts.delete(headerFacts.keys().next().value);
        return facts;
    };
    const sessionFacts = async (raw, signal) => {
        const header = await sessionHeaderFacts(raw, signal);
        if (header.live || header.header.origin !== 'subagent')
            return header;
        return await observeColdFacts(SessionId(id(raw, 'sessionId')), signal);
    };
    const resolveSession = async (sessionId) => {
        const facts = await sessionFacts(sessionId);
        const document = await storage.read();
        const saved = document === undefined ? undefined : memoized(document, parseControlsDocument);
        const association = saved?.associations.find(row => row.sessionId === sessionId);
        const instance = association && saved?.instances.find(row => row.instrumentInstanceId === association.instrumentInstanceId);
        const retained = association && instance
            ? association.parentSessionId === null ? { kind: 'owner', controlWorkspaceId: instance.controlWorkspaceId }
                : { kind: 'managed-child', parentSessionId: association.parentSessionId } : undefined;
        const classified = classifySession(facts, retained);
        if (classified !== 'owner')
            return classified;
        if (retained?.kind === 'owner')
            return retained;
        if (facts.header.cwd === undefined)
            return undefined;
        const workspace = await ctx.workspaceRegistry.resolveByPath(facts.header.cwd);
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
        async authorizeSession(principal, sessionId) {
            authenticate(principal);
            if (principal !== operatorPrincipal && principal !== 'agent:' + sessionId)
                deny('agent cannot address another session as its own');
            await sessionHeaderFacts(sessionId);
        },
        resolveSession,
        async verifyWorkspace(workspaceId) { const row = ctx.workspaceRegistry.get(WorkspaceId(id(workspaceId, 'workspaceId'))); return row !== undefined && await row.status() === 'ok'; },
    };
    const authorizeCaller = async (caller, sessionId) => {
        if (caller.kind === 'user') {
            if (caller.principalId !== operatorPrincipal || caller.sessionId !== null)
                deny('invalid operator caller');
        }
        else if (caller.sessionId === null || caller.principalId !== 'agent:' + caller.sessionId)
            deny('invalid actual agent caller');
        authenticate(caller.principalId);
        if (sessionId !== undefined)
            await authority.authorizeSession(caller.principalId, id(sessionId, 'sessionId'), 'read');
    };
    return { authority, sessionFacts, authorizeCaller, operatorPrincipal };
}
/** A source-mode binding plus a strict descriptor contribution; no monkeypatch. */
export class MattPocockControlsService extends TypertRemoteService {
    runtime;
    ports;
    grants;
    startup;
    lifecycle;
    constructor(ctx, runtime, ports, grants, startup, lifecycle) {
        super(ctx, REMOTE_NAMESPACE);
        this.runtime = runtime;
        this.ports = ports;
        this.grants = grants;
        this.startup = startup;
        this.lifecycle = lifecycle;
    }
    run(operation, suppliedSignal) {
        const caller = operatorCaller(this.ctx);
        this.lifecycle.signal.throwIfAborted();
        const signal = AbortSignal.any([this.ctx.invocation.signal, this.lifecycle.signal, ...(suppliedSignal ? [suppliedSignal] : [])]);
        return this.lifecycle.track(() => operation(caller, signal));
    }
    startupStatus(suppliedSignal) {
        return this.run((_, signal) => this.startup.readStatus(signal), suppliedSignal);
    }
    saveStartupSettings(desired, expectedRevision, suppliedSignal) {
        return this.run((_, signal) => this.startup.save(parseStartupDesired(desired), revision(expectedRevision, 'expectedRevision'), signal), suppliedSignal);
    }
    readPolicy() { return this.run(async (caller, signal) => parsePolicySnapshot(await this.runtime.readPolicy(caller, signal))); }
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
            await this.ports.authorizeCaller(caller, sid);
            signal.throwIfAborted();
            return parseHostJson(await this.runtime.readSession(caller, sid, signal));
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
            const domain = await ctx.storageDomain.open(defineDomain({ name: 'mattpocock_' + name, version: 1, tables: { records: domainTable(z.unknown().transform(parse)) } }));
            domains.push(domain);
            return domain.table('records');
        };
        const startupNode = new HostStartupNode({
            observeCompatibilityPreparation: signal => inspectCompatibilityPreparation(ctx, signal),
            nativeSource: () => {
                // Diagnostic origin of the actually loaded seam; never a capability claim.
                const seam = initialChildCwdSeam(ctx);
                if (seam === 'native')
                    return 'native-activation';
                if (seam !== 'bridge')
                    return null;
                const service = ctx.get('subagents');
                const source = service?.[Symbol.for('@lmgatex/dsh-mattpocock-skills/compatible-subagent-origin')];
                return source === 'native-subagent-0.2.1-alpha.1' ? source : null;
            },
            ...(options.sdkRoot === undefined ? {} : { sdkRoot: options.sdkRoot }), ...options.startup,
        }, () => initialChildCwdSupported(ctx), lifetime.signal);
        const startup = new StartupSupport(createDomainVersionedStorage(await open('startup_settings', parseStartupDocument), 'state', parseStartupDocument), { epoch: startupNode.epoch }, signal => startupNode.observe(signal));
        // Capture the trusted boot request before runtime factories or model tools exist.
        const bootRequested = (await startup.readStatus(lifetime.signal)).boot.requested.startupCwdEnabled;
        const requireStartupCwd = () => {
            if (!bootRequested)
                throw new ControlsError('feature-disabled', 'initial child cwd is disabled for this process; save startup settings and restart the instance to enable it');
        };
        const controlsStorage = createDomainControlsStorage(await open('controls', parseControlsDocument));
        const instrumentStorage = createDomainInstrumentStorage(await open('instruments', parseInstrumentDocument));
        const windowStorage = createDomainWindowStorage(await open('windows', parseWindowDocument));
        const resourceStorage = createDomainResourceStorage(await open('resources', parseResourceDocument));
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
                get nativeInitialChildCwd() { return initialChildCwdSupported(ctx) ? 'supported' : 'unsupported'; },
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
            startupStatus(signal) { return track(() => startup.readStatus(signal ? AbortSignal.any([signal, lifetime.signal]) : lifetime.signal)); },
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
            async executeNative(exec, name, args) {
                agentCaller(ctx, exec.agent);
                exec.signal.throwIfAborted();
                return ctx.tools.execute({ callId: ToolCallId(exec.callId + ':managed'), rootCallId: exec.rootCallId, parent: exec.token, name, arguments: args, agent: exec.agent, signal: exec.signal });
            },
            async authorizeInitialChildCwd(exec, cwd) {
                lifetime.signal.throwIfAborted();
                exec.signal.throwIfAborted();
                const caller = agentCaller(ctx, exec.agent);
                await identity.authorizeCaller(caller, caller.sessionId);
                if (typeof cwd !== 'string' || cwd.length === 0 || cwd.length > 16384 || cwd.includes('\0') || !isAbsolute(cwd) || normalize(cwd) !== cwd)
                    throw new ControlsError('invalid-input', 'cwd must be a bounded normalized absolute path');
                requireStartupCwd();
                if (!initialChildCwdSupported(ctx))
                    throw new ResourceError('unsupported', 'nativeInitialChildCwd unsupported; no child was requested');
                const verify = await authorizeInitialChildCwd(ctx, exec.agent, cwd, AbortSignal.any([exec.signal, lifetime.signal]));
                requireStartupCwd();
                if (!initialChildCwdSupported(ctx))
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
                if (cwd !== undefined)
                    requireStartupCwd();
                const native = ctx.get('subagents');
                if (!native)
                    throw new ResourceError('unsupported', 'native continuable creation is unavailable');
                if (cwd !== undefined && !initialChildCwdSupported(ctx))
                    throw new ResourceError('unsupported', 'nativeInitialChildCwd unsupported; no child was requested');
                const verifyCwd = cwd === undefined ? undefined : await authorizeInitialChildCwd(ctx, exec.agent, cwd, AbortSignal.any([exec.signal, lifetime.signal]));
                const maxDepth = native.resolveMaxDepth();
                lifetime.signal.throwIfAborted();
                exec.signal.throwIfAborted();
                agentCaller(ctx, exec.agent);
                // Public manager owns provider capability/depth checks, permissions, lineage,
                // factory headers and durable descriptors. Never mutate parent/child metadata.
                const spec = { provider: raw.provider, label, childId,
                    request: { parent: exec.agent, prompt: [{ type: 'text', text: prompt }], ...(maxDepth === undefined ? {} : { maxDepth }) },
                    signal: exec.signal, ...(cwd === undefined ? {} : { cwd }) };
                const seam = initialChildCwdSeam(ctx);
                if (cwd !== undefined) {
                    requireStartupCwd();
                    if (seam === 'unsupported')
                        throw new ResourceError('unsupported', 'nativeInitialChildCwd unsupported; no child was requested');
                }
                verifyCwd?.();
                if (seam === 'native') {
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
                }
                return native.startContinuable(spec);
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
        const service = new MattPocockControlsService(ctx, active, ports, grants, startup, { signal: lifetime.signal, track, ...(options.onPolicyChanged === undefined ? {} : { onPolicyChanged: options.onPolicyChanged }) });
        disposers.push(ctx.typert.register(hostRemoteContribution()));
        // Model tools always address the actual caller's session, never a supplied principal.
        const tool = (name, description, action) => {
            disposers.push(ctx.tools.register(defineTool({ name, description, parameters: { request: { type: 'json', required: true } },
                output: { schema: { type: 'json' }, render: (_, value) => [{ type: 'text', text: JSON.stringify(value) }] },
                async execute(args, exec) {
                    exec.signal.throwIfAborted();
                    const caller = agentCaller(ctx, exec.agent), envelope = record(args, 'tool arguments', ['request']), raw = record(envelope.request, 'request');
                    const controlled = { ...exec, signal: AbortSignal.any([exec.signal, lifetime.signal]), concludeTurn: exec.concludeTurn.bind(exec), deferContext: exec.deferContext.bind(exec) };
                    return parseHostJson(await track(() => action(raw, caller, controlled)));
                },
            })));
        };
        tool('mattpocock_controls', 'Read saved workspace controls or save an explicitly delegated policy change. Request keys: read={action:"read"}; save={action:"save", intent, expectedRevision} where intent carries all three keys: {extensionEnabled, defaults, workspaceOverrides} (empty objects are valid). A patch accepts {workspace?, skills?} as {enabled}, {display?} as {header, inputSummary, rightPanel, sessionList, timeline}, {binding?, lifecycle?, ticketProgress?, pendingDecisions?} as {enabled}, and {windows?} as {enabled, ticketWindowSize, runningSubagentLimit}. Extra keys are rejected and the error lists the accepted keys.', async (raw, caller, exec) => {
            if (raw.action === 'read') {
                record(raw, 'policy read', ['action']);
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
        tool('mattpocock_record', 'Read the actual session instrument or submit authored ticket/decision records. Request keys: read={action:"read"}; apply={action:"apply", command} with command={operationId, expectedRevision, action:"put-workflow"|"put-ticket"|"put-decision"|"set-decision-view", workflowId, references, value, plus localTicketId for put-ticket and decisionId for put-decision or set-decision-view}. Value shapes: put-workflow {title, axes:[{axisKey, label, counting:"exclusive"|"overlapping", statuses:[{statusKey, label, meaning?, summaryPriority?}]}]}; put-ticket {title, statuses:{axisKey:[statusKey, ...]}, externalRef?, summary?, disposition?}; put-decision {question, status, pending?, awaitingImplementation?, ticketIds?, context?, options?:[{key,label}], recommendation?, impact?, addressee?, result?}; set-decision-view {read, hidden}. Extra keys are rejected and the error lists the accepted keys.', async (raw, caller, exec) => {
            await ports.authorizeCaller(caller, caller.sessionId);
            if (raw.action === 'read') {
                record(raw, 'instrument read', ['action']);
                return active.readSession(caller, caller.sessionId, exec.signal);
            }
            record(raw, 'instrument apply', ['action', 'command']);
            if (raw.action !== 'apply')
                throw new ControlsError('invalid-input', 'read/apply action required');
            return active.applyInstrument(caller, caller.sessionId, parseInstrumentCommand(raw.command), exec.signal);
        });
        tool('mattpocock_window', 'Request keys: a flat object {operationId, workflowId, localTicketId, action:"reserve"|"release"|"reacquire", generation}, with generation required for release and reacquire and omitted for reserve; the ticket key is localTicketId, there is no nested command object and no read action — T/S facts come from the injected snapshot and mattpocock_history. Extra keys are rejected and the error lists the accepted keys. Register explicit ticket-window reservations, releases and reacquisitions. A reserve or reacquire that names a ticket not recorded in this instrument is rejected; record it with mattpocock_record put-ticket first. You release the slot yourself once that ticket reaches its declared delivered state or is blocked by name — nothing releases it for you, and the injected snapshot lists every held slot whose ticket is already in a terminal status as "T pending release".', async (raw, caller, exec) => {
            await ports.authorizeCaller(caller, caller.sessionId);
            return active.applyTicketWindow(caller, caller.sessionId, parseTicketWindowCommand(raw), exec.signal);
        });
        if (active.historyAction)
            tool('mattpocock_history', 'Query this session retained instrument history separately from current context: query with query={kind?,recordId?,limit?,cursor?}; detail with historyIds; set-context with kind,recordId,included; purge with historyIds/range/archivedOnly deletes derived copies; compact validates them. compact-source or purge-source with domain=records|windows|worktrees and an explicit request performs source history cleanup preserving current state; use sourceRevisions from query, not history revision. Paging summaries are not complete detail. Purge affects instrument data, not Git worktrees or native conversation history.', async (raw, caller, exec) => {
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
            tool('mattpocock_worktree', 'Worktree binding instrument: read={action:read}; update={action:update,command:{operationId,bindingId,expectedRevision,state:active|discarded|cleaned,notes?}}; reconcile={action:reconcile,operationId}. Agent status and program-verified native binding facts remain distinct. To enter or leave a checkout use the host\'s working_directory tool: cd to the checkout to enter it, and cd back to the project directory it reported to leave; the checkout and branch remain. To create, merge or delete trees and branches use the host\'s own Git tools (create_worktree when provided). This instrument records bindings only.', async (raw, caller, exec) => {
                const action = raw.action;
                if (action === 'read')
                    record(raw, 'worktree read', ['action']);
                else if (action === 'update')
                    record(raw, 'worktree update', ['action', 'command']);
                else if (action === 'reconcile')
                    record(raw, 'worktree reconcile', ['action', 'operationId']);
                else
                    throw new ControlsError('invalid-input', 'read/update/reconcile action required');
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
        if (active.delegate)
            tool('mattpocock_delegate', 'Create a continuable spawn/fork child: description, prompt, optional provider ("spawn" or "fork"; default "spawn"), worktree, operationId, workflowId and ticketIds. Prepare the lane\'s tree first — use the host\'s create_worktree when the host provides it, otherwise run Git yourself — then pass its absolute path as worktree; the child starts there and the binding row records it. Retrying the same operationId never creates a second child; use a new operationId when you want another one. When workflowId is given, ticketIds must name at least one ticket already recorded in this instrument; omit workflowId entirely for a ticketless research lane. If recording is reported unknown or failed, read the binding with mattpocock_worktree before retrying.', async (raw, caller, exec) => {
                record(raw, 'delegation request', ['description', 'prompt', 'provider', 'worktree', 'operationId', 'workflowId', 'ticketIds']);
                await ports.authorizeCaller(caller, caller.sessionId);
                return active.delegate(caller, parseHostJson(raw), exec);
            });
        if (active.executeManaged)
            tool('mattpocock_execute', 'Record one execution fact you actually observed for a native delegation (nativeTool as "subagent", "subagent_fork" or "send_message", its arguments, plus workflowId and localTicketId; omit both or pass null when the execution belongs to no ticket). Never record an execution you did not observe. Extra keys are rejected and the error lists the accepted keys.', async (raw, caller, exec) => {
                await ports.authorizeCaller(caller, caller.sessionId);
                return active.executeManaged(caller, parseHostJson(raw), exec);
            });
        if (active.assign)
            tool('mattpocock_assign', 'Record only authenticated delegation assignments as {sessionId, workflowId, ticketIds}; omit workflowId (or pass null) and omit ticketIds for a grant with no ticket. Never self-grant user policy access. Extra keys are rejected and the error lists the accepted keys.', async (raw, caller, exec) => {
                await ports.authorizeCaller(caller, caller.sessionId);
                return active.assign(caller, parseHostJson(raw), exec.signal);
            });
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
