class ConsumptionFailure extends Error {
    reason;
    constructor(reason) {
        super(reason);
        this.reason = reason;
    }
}
function bounded(value, initial, maximum, name) {
    const result = value ?? initial;
    if (!Number.isSafeInteger(result) || result < 1 || result > maximum)
        throw new RangeError(name + ' must be an integer in 1..' + maximum);
    return result;
}
function checkedIdentity(identity) {
    for (const key of ['principalId', 'sessionId', 'instrumentInstanceId', 'ownerSessionId']) {
        if (typeof identity[key] !== 'string' || !identity[key].trim() || identity[key].includes('\0'))
            throw new TypeError('trusted identity requires ' + key);
    }
    const scope = identity.scopeFingerprint;
    if (scope !== undefined && (typeof scope !== 'string' || !scope.trim() || scope.length > 1024 || scope.includes('\0')))
        throw new TypeError('trusted identity requires scopeFingerprint of 1..1024 characters without NUL');
    return Object.freeze({ principalId: identity.principalId, sessionId: identity.sessionId,
        instrumentInstanceId: identity.instrumentInstanceId, ownerSessionId: identity.ownerSessionId,
        ...(scope === undefined ? {} : { scopeFingerprint: scope }) });
}
function cacheKey(identity) {
    return JSON.stringify([identity.principalId, identity.sessionId, identity.instrumentInstanceId, identity.ownerSessionId, identity.scopeFingerprint ?? null]);
}
function sameInstance(a, b) {
    return a.instrumentInstanceId === b.instrumentInstanceId && a.ownerSessionId === b.ownerSessionId && a.controlWorkspaceId === b.controlWorkspaceId;
}
function verify(snapshot, identity) {
    const instance = snapshot.instance;
    if (snapshot.sessionId !== identity.sessionId || instance.instrumentInstanceId !== identity.instrumentInstanceId ||
        instance.ownerSessionId !== identity.ownerSessionId || instance.controlWorkspaceId !== snapshot.policy.controlWorkspaceId ||
        (snapshot.records !== null && !sameInstance(snapshot.records.instance, instance)) ||
        (snapshot.windows !== null && !sameInstance(snapshot.windows.instance, instance)))
        throw new ConsumptionFailure('identity-mismatch');
    // A shared physical resource can belong to another instance, but must have an authorized reference to this one.
    if (snapshot.resources.some(resource => resource.ownerInstanceId !== instance.instrumentInstanceId &&
        !resource.references.some(reference => reference.instrumentInstanceId === instance.instrumentInstanceId)))
        throw new ConsumptionFailure('identity-mismatch');
}
/** Canonical facts, not a cryptographic/security digest. No Node crypto or host imports. */
function canonical(value) {
    if (value === null || typeof value !== 'object')
        return JSON.stringify(value) ?? 'null';
    if (Array.isArray(value))
        return '[' + value.map(canonical).join(',') + ']';
    return '{' + Object.entries(value).filter(([, entry]) => entry !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
        .map(([key, entry]) => JSON.stringify(key) + ':' + canonical(entry)).join(',') + '}';
}
function sorted(rows, key) {
    // Composite keys may require canonical encoding. Compute once per row in this
    // projection only; retain stable tie order without a cross-snapshot cache.
    return rows.map(row => ({ row, key: key(row) }))
        .sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0).map(entry => entry.row);
}
function provenance(row) {
    const last = 'provenance' in row ? row.provenance : row.history.at(-1);
    return last ? { author: last.author, references: last.references, ...(last.recordedAt === undefined ? {} : { recordedAt: last.recordedAt }) } : null;
}
// Mechanical representation budgets (UTF-16 characters), never business/capacity limits.
// Reserve space for reference facts and shared guidance within the existing overall text bound.
const CATEGORY_TEXT_BUDGET = 1600;
const FIELD_TEXT_BUDGET = 384;
// Only these categories are actually captured as history rows; other briefed fields must not
// advertise a query that would return an empty notRecorded page.
const RECORDED_HISTORY_KINDS = { workflows: 'workflow', tickets: 'ticket', decisions: 'decision',
    'status-summary': 'workflow', 'ticket-window': 'ticket-window', executions: 'execution', resources: 'resource', worktree: 'worktree',
    nativeExecutions: 'native-execution' };
function historyLocator(kind, row) {
    // Current reference lookup is available to assigned readers too; history is coordinator-only.
    if (kind === 'taskReferences')
        return { tool: 'mattpocock_record', action: 'read', query: { kind: 'task-reference',
                ...(row === undefined ? {} : { recordId: JSON.stringify([row.workflowId, row.localTicketId]) }), limit: 20 } };
    const name = RECORDED_HISTORY_KINDS[kind];
    if (name === undefined)
        return undefined;
    let recordId;
    if (row) {
        if (typeof row.bindingId === 'string')
            recordId = row.bindingId;
        else if (typeof row.resourceId === 'string')
            recordId = row.resourceId;
        else if (typeof row.executionId === 'string')
            recordId = typeof row.generation === 'number' ? JSON.stringify([row.executionId, row.generation]) : row.executionId;
        else if (typeof row.localTicketId === 'string')
            recordId = JSON.stringify([row.workflowId, row.localTicketId]);
        else if (typeof row.decisionId === 'string')
            recordId = JSON.stringify([row.workflowId, row.decisionId]);
        else if (typeof row.workflowId === 'string')
            recordId = row.workflowId;
    }
    return { tool: 'mattpocock_history', action: 'query', query: { kind: name, ...(recordId === undefined ? {} : { recordId }), limit: 20 } };
}
function brief(value, query, depth = 0, textBudget = FIELD_TEXT_BUDGET) {
    const located = query === undefined ? {} : { query };
    if (typeof value === 'string')
        return value.length <= textBudget ? value : {
            // A truncated body keeps a fingerprint of the whole string: the visible prefix and length
            // alone cannot distinguish two different tails.
            text: value.slice(0, textBudget), truncated: true, originalChars: value.length, signature: currentSignature([value]), ...located,
        };
    if (value === null || typeof value !== 'object')
        return value;
    if (depth >= 6)
        return { truncated: true, ...located };
    if (Array.isArray(value)) {
        const rows = value.slice(0, 8).map(entry => brief(entry, query, depth + 1, textBudget));
        // The shown prefix cannot identify the omitted tail; the digest covers the whole array.
        return rows.length === value.length ? rows : { rows, shown: rows.length, total: value.length, more: true, truncated: true, tailSignature: currentSignature(value), ...located };
    }
    const entries = Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    const selected = entries.slice(0, 32);
    return { ...Object.fromEntries(selected.map(([key, entry]) => [key, brief(entry, query, depth + 1, textBudget)])),
        ...(selected.length < entries.length ? { truncated: true, totalFields: entries.length, fieldsSignature: currentSignature(entries.map(([key]) => key)), ...located } : {}) };
}
/** Compact non-security checksum of current rows, including details outside the text budget. */
function currentSignature(rows) {
    const value = canonical(rows);
    let a = 2166136261, b = 5381;
    for (let index = 0; index < value.length; index++) {
        const code = value.charCodeAt(index);
        a = Math.imul(a ^ code, 16777619);
        b = Math.imul(b, 33) ^ code;
    }
    return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}
function category(rows, location, counts = undefined) {
    const kind = String(location.kind);
    const query = historyLocator(kind);
    const shown = [];
    const currentFactsSignature = currentSignature(rows);
    const envelope = () => ({ rows: shown, shown: shown.length, total: rows.length, more: shown.length < rows.length,
        ...(query === undefined ? {} : { query }), currentFactsSignature, ...(counts === undefined ? {} : { counts }) });
    for (let index = 0; index < rows.length; index++) {
        const raw = rows[index];
        const locator = historyLocator(kind, raw);
        let row = brief(locator === undefined ? raw : { ...raw, query: locator }, locator);
        if (canonical(row).length > 1000) {
            // Keep a readable identifier/state while referring to the full authored payload.
            const keys = ['workflowId', 'localTicketId', 'decisionId', 'executionId', 'generation', 'resourceId', 'bindingId', 'sourceRevision', 'state', 'held', 'status',
                ...(kind === 'taskReferences' ? ['sourceEvidence', 'sourceState'] : [])];
            const value = raw.value !== null && typeof raw.value === 'object' ? raw.value : null;
            const details = ['title', 'question', 'status', 'pending', 'awaitingImplementation', 'result', 'business', 'acceptance', 'outcome',
                ...(kind === 'taskReferences' ? ['label', 'locator', 'source'] : [])];
            row = { ...Object.fromEntries(keys.filter(key => Object.hasOwn(raw, key)).map(key => [key, brief(raw[key], locator, 0, 96)])),
                ...(value ? { value: brief(Object.fromEntries(details.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]])), locator, 0, 96) } : {}),
                ...(typeof raw.result === 'string' ? { result: brief(raw.result, locator, 0, 96) } : {}),
                ...(kind === 'taskReferences' ? { source: brief(raw.source, locator, 0, 96) } : {}),
                ...(locator === undefined ? { truncated: true } : { truncated: true, query: locator }) };
        }
        shown.push(row);
        if (canonical(envelope()).length > CATEGORY_TEXT_BUDGET) {
            shown.pop();
            break;
        }
    }
    return envelope();
}
function facts(snapshot) {
    const records = snapshot.records;
    const windows = snapshot.windows;
    const taskReferencesAvailable = records?.capabilities?.taskReferences === true && Array.isArray(records.taskReferences);
    return {
        sessionId: snapshot.sessionId, instance: snapshot.instance, delegateRegistered: snapshot.delegateRegistered === true,
        policy: brief({ configRevision: snapshot.policy.configurationRevision, extensionEnabled: snapshot.policy.extensionEnabled,
            workspaceVerified: snapshot.policy.workspaceVerified, features: snapshot.policy.features, windows: snapshot.policy.windows,
            pendingDecisions: snapshot.policy.pendingDecisions, sources: snapshot.policy.sources }, { kind: 'configuration' }),
        records: records === null ? null : { scope: brief(records.scope, { kind: 'records' }),
            capabilities: records.capabilities ?? null,
            summary: { ...records.summary, totalTaskReferences: taskReferencesAvailable ? records.summary.totalTaskReferences ?? null : null,
                statusCounts: category(records.summary.statusCounts, { kind: 'status-summary' }) },
            workflows: category(sorted(records.workflows, row => row.workflowId).map(row => ({ workflowId: row.workflowId, sourceRevision: row.revision, value: row.value, source: provenance(row) })), { kind: 'workflows' }),
            tickets: category(sorted(records.tickets, row => canonical([row.workflowId, row.localTicketId])).map(row => ({ workflowId: row.workflowId, localTicketId: row.localTicketId, sourceRevision: row.revision, value: row.value, source: provenance(row) })), { kind: 'tickets' }),
            taskReferences: taskReferencesAvailable ? category(sorted(records.taskReferences, row => canonical([row.workflowId, row.localTicketId]))
                .map(row => ({ workflowId: row.workflowId, localTicketId: row.localTicketId, sourceRevision: row.revision, value: row.value,
                source: provenance(row), sourceEvidence: 'authored', sourceState: 'unknown' })), { kind: 'taskReferences' }) : null,
            decisions: category(sorted(records.decisions.filter(row => row.value.pending === true || row.value.awaitingImplementation === true), row => canonical([row.workflowId, row.decisionId])).map(row => ({ workflowId: row.workflowId, decisionId: row.decisionId, sourceRevision: row.revision, value: row.value, source: provenance(row) })), { kind: 'decisions' }) },
        windows: windows === null ? null : { configRevision: windows.configurationRevision,
            status: windows.status, reason: brief(windows.reason, { kind: 'windows' }), scope: brief(windows.scope, { kind: 'windows' }),
            runtimeKnowledge: brief(windows.runtimeKnowledge, { kind: 'windows' }), T: windows.T,
            S: { ...windows.S, byState: Object.fromEntries(Object.entries(windows.S.byState).filter(([state]) => state !== 'released')) },
            tickets: category(sorted(windows.tickets.filter(row => row.held), row => canonical([row.workflowId, row.localTicketId])), { kind: 'ticket-window' }),
            executions: category(sorted(windows.executions.filter(row => row.state !== 'released'), row => canonical([row.executionId, row.generation])), { kind: 'executions' }) },
        resources: category(sorted(snapshot.resources.filter(row => !(row.status === 'retired' && row.identity.ownership === 'owned')), row => row.resourceId).map(resource => ({ resourceId: resource.resourceId,
            ownerInstanceId: resource.ownerInstanceId, identity: { path: resource.identity.path, ownership: resource.identity.ownership }, status: resource.status,
            business: resource.business, businessAuthorId: resource.businessAuthorId,
            references: sorted(resource.references, row => row.bindingId), diagnostic: resource.diagnostic,
            observation: { factsDigest: resource.actualCanRetire.facts?.digest ?? null, facts: resource.actualCanRetire.facts } })), { kind: 'resources' }),
        contextConclusions: category(sorted(snapshot.contextConclusions ?? [], row => canonical([row.workflowId, row.decisionId])), { kind: 'decisions' }),
        worktreeRelations: category(sorted(snapshot.worktreeBindings ?? [], row => row.bindingId).map(row => ({
            bindingId: row.bindingId, sourceRevision: row.revision, value: row.value,
            source: { kind: row.source, author: row.author, recordedAt: row.recordedAt },
            ...(row.cleanupDue === undefined ? {} : { cleanupDue: row.cleanupDue }),
        })), { kind: 'worktree' }, { cleanupDue: (snapshot.worktreeBindings ?? []).filter(row => row.cleanupDue === true).length }),
        worktreeObservations: category(sorted(snapshot.worktreeObservations ?? [], row => canonical([row.recordedAt, row.observationId])).map(row => ({
            observationId: row.observationId, sourceRevision: row.revision, creatorSessionId: row.value.creatorSessionId, creatorActivity: row.creatorActivity,
            lane: row.lane, path: row.value.path, branch: row.value.branch, repositoryRoot: row.value.repositoryRoot,
            check: { state: row.value.check.state, checkedAt: row.value.check.checkedAt, diagnostic: row.value.check.diagnostic,
                facts: row.value.check.facts === null ? null : { gitCommonDir: row.value.check.facts.gitCommonDir, gitDir: row.value.check.facts.gitDir, branchRef: row.value.check.facts.branchRef, branchOid: row.value.check.facts.branchOid, headOid: row.value.check.facts.headOid } },
            business: row.value.business, source: row.source, recordedAt: row.recordedAt,
        })), { kind: 'worktree-observations' }, { open: (snapshot.worktreeObservations ?? []).filter(row => row.value.business.state === 'open').length }),
        nativeCount: snapshot.nativeCount ?? null,
        nativeStops: category(sorted(snapshot.nativeStops ?? [], row => row.sessionId), { kind: 'native-stops' }),
        nativeExecutions: category(snapshot.nativeExecutions ?? [], { kind: 'nativeExecutions' }),
        capabilities: category(sorted(snapshot.capabilities, row => row.key), { kind: 'capabilities' }),
        health: category(sorted(snapshot.health, row => row.scope), { kind: 'health' }, {
            unknown: snapshot.health.filter(row => ['stale', 'unknown', 'unavailable', 'error', 'failed'].includes(row.status)).length
        }),
    };
}
function pendingReleaseRows(snapshot) { return snapshot.pendingRelease ?? []; }
/** Render one published outcome; 'unobservable' reads as unobservable, never as a cause. */
function nativeOutcomeText(row) {
    const where = row.sessionId + (row.turn === null ? '' : ' turn ' + row.turn);
    const lane = row.lane !== null && row.lane.workflowId !== null ? ' (lane ' + row.lane.workflowId + (row.lane.localTicketId === null ? '' : '/' + row.lane.localTicketId) + ')' : '';
    const outcome = row.outcome === 'unobservable'
        ? 'outcome unobservable (no readable turn/end' + (row.evidence !== null && row.evidence.seq !== null ? '; last observed seq ' + row.evidence.seq : '') + ')'
        : row.outcome === 'error' ? 'turn failed' + (row.diagnostic === null ? '' : ' (' + row.diagnostic + ')')
            : row.outcome === 'interrupted' ? 'turn never ended normally (crash or forced stop)'
                : row.outcome === 'aborted' ? 'turn cancelled' + (row.cancelCause === null ? ' (cancel cause unobservable)' : ' by ' + row.cancelCause)
                    : 'ended with ' + row.outcome;
    return where + ' — ' + outcome + lane;
}
/** One common decision protocol; only the presentation/wait fragments differ by preference. */
function decisionGuidance(snapshot) {
    const p = snapshot.policy;
    const mode = p.pendingDecisions.interactionMode;
    const active = p.extensionEnabled && p.workspaceEnabled !== false && p.features.pendingDecisions.status === 'configured';
    if (!active)
        return 'Decision interaction preference: ' + mode + ' (inactive). Management or pending-decisions is not configured: do not initiate new decision registration or follow an earlier interaction-mode protocol. Preserve existing records, unresolved obligations and necessary closeout; this does not authorize enabling the feature.';
    const child = snapshot.sessionId !== snapshot.instance.ownerSessionId;
    const channel = mode === 'async-decision'
        ? 'prefer the decision instrument; user replies through DSH native session messages'
        : child ? 'hand the user question back to the main agent under host restrictions; do not call a user-question tool forbidden to an owned child'
            : 'prefer an available native user-question tool';
    const waiting = mode === 'async-decision'
        ? 'continue independent work without calling a blocking question tool to wait for the reply'
        : child ? 'let the main agent receive the answer through its permitted native question flow'
            : 'receive the answer through the native question flow';
    return 'Decision interaction preference: ' + mode + ' (active). New decisions: genuine unresolved user questions only, pending=true/addressee.kind=user. Implementation/research/completion: existing spec/ADR/tasks, no self-question/answer ledger; '
        + channel + '; ' + waiting + '. '
        + 'Skip/cancel/silence is not approval. Block only actions that actually depend on the decision. With no independent work, end the current turn normally; do not claim overall completion. Native failure/cancel: keep unresolved, explain fallback; no retry loop. Owned children hand questions to the main agent. Never claim registration after a failed write or silently enable a feature. Higher-priority/confirmation/host/task restrictions prevail.';
}
function referenceGuidance(snapshot) {
    const records = snapshot.records, p = snapshot.policy;
    const sourceLimits = 'Task references carry authored source, label and navigation reports; source state remains unknown without an authorized source observation. local-current is not source-current. totalTaskReferences is separate from legacy totalTickets/statusCounts; neither proves external task totals or completion. ';
    if (records?.capabilities?.taskReferences !== true || !Array.isArray(records.taskReferences))
        return sourceLimits
            + 'Task-reference capability is unknown or unsupported here. Use an authorized current record read to check support; do not create mirrored business tickets as a fallback. Continue permitted native work and legitimate old-record closeout; missing reference coverage is not a known zero.';
    const enabled = p.extensionEnabled && p.workspaceEnabled !== false && ['windows', 'ticketProgress', 'pendingDecisions'].some(key => p.features[key].status === 'configured');
    if (!enabled)
        return sourceLimits + 'New task-reference registration is inactive. Preserve retained references, existing obligations and legitimate closeout; do not enable management to manufacture an association.';
    return sourceLimits + 'Only when task association, T selection or instrument access is needed, register with mattpocock_record put-task-reference (workflowId, localTicketId, value={source,locator,label?}); a collaboration workflow may use empty axes. Keep task body, acceptance, claim and completion in the existing tracker/spec, not a second business lifecycle. Unreferenced native research requires no task reference or T reservation.';
}
function protocol(snapshot) {
    const p = snapshot.policy;
    const lines = ['Instrument state: current effective policy supersedes earlier instrument instructions.',
        'Business records are author reports, not program execution/S receipts or physical resource proof. Skills, user agreements and task documents govern completion, delivery, pause, cancellation, reopening and questions.',
        'T and S are this session\'s configured limits; S is the host\'s live run status (descendant Agents currently running; an idle resident child is not running), and countKnown false means S.used is a stated lower bound with the total unknown. S.depth structures that count by edge distance from this session: direct (distance 1), deeper (distance 2 and below) and unknown when the live parent chain cannot be measured — the three always sum to S.used — with S.depth.levels holding the exact count per distance and S.depth null when the source cannot measure depth at all. The host pools one active-child capacity per continuable lineage, so a grandchild consumes the same capacity as a direct child and every depth belongs in S. Limits, registered usage and program-fact coverage are reported below; null means unknown, never zero. Native host permissions still apply.',
        'mattpocock_record keeps task references, genuine user questions and retained authored reports; execution facts come from native subagent lifecycle observation, never from model reports. Capability/health facts below state actual coverage. Display preferences do not erase obligations.',
        'Worktree relationships record the actual child/worktree binding and your authored use and cleanup reports; worktreeObservations record every native create_worktree this instrument observed, with its creator, the creator\'s live activity and the verified Git identity. They never claim who uses a directory. A worktree observation lane is inferred from assignment/binding at read time; cleaned/notes are authored, and created-tree only proves that child created the tree. A tree you detached but did not clean up still needs a disposition.'];
    // Management ON adds action guidance. Management OFF keeps existing records, obligations and source
    // limits visible, but does not command new managed trees, bindings or reservations.
    lines.push(decisionGuidance(snapshot));
    lines.push(referenceGuidance(snapshot));
    lines.push('Replies: SAME decisionId + source; agent author stays agent. pending=false only for explicit resolution; partial replies stay pending; refusal/withdrawal is not approval. Answers preserve awaitingImplementation=true; no default new await. awaitingImplementationCount: raw compatibility markers, not unfinished tasks; review task evidence. Handoff is not completion. Clear explicitly only with commitments/constraints/source pointers carried by effective task/document context. Preserve result/included/excluded/contextConclusions; review in context. Old agent/unspecified/no-addressee updates legal; OFF no new records. Never infer clearance from status/count/hidden/links.');
    const managementOn = p.extensionEnabled && p.workspaceEnabled !== false;
    if (managementOn) {
        lines.push('Only prepare a tree with the host\'s create_worktree when the task requires write isolation; read-only research/review may share a stable checkout. Use the host\'s working_directory to enter or leave a directory; this instrument does not create or delete trees. Ordinary lanes use native subagent({cwd}) + mattpocock_assign, and a native tree observation never becomes a strong binding. Mark an observed tree cleaned with mattpocock_worktree update-observation only when you decided it needs no further attention.');
        if (snapshot.delegateRegistered === true)
            lines.push('Opt-in mattpocock_delegate is binding-first creation only, when a verifiable ticket↔worktree binding is required; it is not the default dispatch path. If a delegate operation was accepted or its result is uncertain, do not create another child: keep the existing child, re-read its effects and use an explicit mattpocock_assign when assignment is needed; reconcile only rechecks binding. A native tree observation never becomes a strong binding.');
    }
    lines.push('This is a bounded current view, not complete history. Each category reports shown/total/more and query locators; truncated fields retain source pointers. Use the supplied current-query or session-history locator for omitted details.');
    if (!p.extensionEnabled)
        lines.push('Management feature is OFF: existing records and execution facts remain.');
    else if (p.workspaceEnabled === false)
        lines.push('Management feature is OFF for this workspace: existing records and execution facts remain.');
    else if (p.features.windows.status === 'configured') {
        lines.push('Windows explicitly enabled: mattpocock_window records explicit T reserve/release/reacquire independently of S. Only trusted program receipts release S, never a business completion label.');
        lines.push('Reference discipline: every handle used for T reserve/reacquire or instrument assignment must already exist in this instrument as an authorized task reference or retained legacy ticket. mattpocock_window reserve rejects an unregistered handle'
            + (snapshot.delegateRegistered === true ? ', and an opted-in mattpocock_delegate does too' : '')
            + '; the rejection names it. Do not create a business-ticket mirror to satisfy this requirement.');
        lines.push('Work-in-progress discipline: the T window counts selected local task handles, independently of source task status and S. Follow the current task agreement; explicit release may mean pause or handoff, not only delivery. Release never proves business completion, clears a pending question or releases S, and source status or child end never releases T automatically.');
    }
    else if (p.features.windows.status === 'disabled')
        lines.push('Windows are OFF: preserve existing execution facts and records.');
    else
        lines.push('Windows are unsupported for this policy: usage coverage remains explicit in capabilities; missing facts are not known/free slots.');
    return lines.join('\n');
}
/** Current notices are deliberately after all policy guidance, inside the same owned snapshot. */
function currentNotices(snapshot) {
    const lines = [];
    const nativeExecutionRows = snapshot.nativeExecutions ?? [];
    if (nativeExecutionRows.length > 0) {
        const shown = nativeExecutionRows.slice(0, 8).map(row => row.sessionId + ' ' + row.state
            + (row.outcome === null ? '' : ' outcome ' + row.outcome) + ' activity ' + row.activity
            + (row.headerCwd === null ? '' : ' header cwd ' + row.headerCwd + ' (source value, not proof of the effective initial directory)')
            + (row.lane === null ? '' : ' lane inferred ' + String(row.lane.workflowId ?? 'ticketless')
                + (row.lane.ticketIds.length === 0 ? '' : '/' + row.lane.ticketIds.join(','))));
        lines.push('Native-observed executions: ' + nativeExecutionRows.length + ' current row(s) from the host\'s native lifecycle events'
            + (nativeExecutionRows.length > shown.length ? ' (showing ' + shown.length + ')' : '') + '. ' + shown.join('; ')
            + '. Activity is live; lane inferred from assignment/binding only, and header cwd is a recorded source value, not proof of the effective initial directory. They are native execution facts, not strong bindings or task-completion proof; use mattpocock_history query kind "native-execution" for recorded versions.');
    }
    const p = snapshot.policy;
    if (p.extensionEnabled && p.workspaceEnabled !== false && p.features.windows.status === 'configured') {
        const pendingRelease = pendingReleaseRows(snapshot);
        if (pendingRelease.length > 0)
            lines.push('T pending release: ' + pendingRelease.map(row => row.localTicketId + (row.label === null ? '' : ' (' + row.label + ')')).join(', ') + ' — call mattpocock_window release with that ticket\'s generation; the slot stays held until you do.');
        const nativeStops = snapshot.nativeStops ?? [];
        if (nativeStops.length > 0)
            lines.push('Native child outcomes to handle: ' + nativeStops.map(row => nativeOutcomeText(row)).join('; ') + '. Each item names one child turn from the host\'s published outcome vocabulary, or states that the outcome is unobservable; the item clears when the child runs again or its end arrives.');
    }
    return lines.length === 0 ? 'No current notices in this projection.' : lines.join('\n');
}
function diagnostic(identity, reason) {
    return 'Instrument state unknown: ' + reason + '. No current policy, capacity or resource facts are asserted. Preserve ordinary native business input; this diagnostic is not a cancellation or a business decision.\n' +
        canonical({ sessionId: identity.sessionId, instrumentInstanceId: identity.instrumentInstanceId, ownerSessionId: identity.ownerSessionId });
}
function stale(verified, reason) {
    return 'Instrument state stale: the last successfully captured snapshot is shown because the refresh failed with ' + reason
        + '. These facts may be out of date and are not current capacity, completion or release proof; a fresh read is retried.\n' + verified;
}
/** A parent consumption seam; it owns neither native admission nor message delivery. */
export class InstrumentConsumption {
    #options;
    #timeoutMs;
    #maxPending;
    #commits = new Map();
    #overflow = new Map();
    #cache = new Map();
    #cacheMax = 64;
    #sequence = 0;
    constructor(options) {
        this.#timeoutMs = bounded(options.timeoutMs, 1000, 10000, 'timeoutMs');
        this.#maxPending = bounded(options.maxPendingCommits, 1024, 65536, 'maxPendingCommits');
        this.#options = Object.freeze({ ...options });
        options.bindProgram?.(Object.freeze({ trackCommit: (instanceId, commit) => this.#track(instanceId, commit) }));
    }
    /** Bounded insertion-ordered cache: a long-lived host must not retain one text per session ever seen. */
    #store(key, entry) {
        this.#cache.delete(key);
        this.#cache.set(key, entry);
        while (this.#cache.size > this.#cacheMax)
            this.#cache.delete(this.#cache.keys().next().value);
    }
    #track(instanceId, promise) {
        if (typeof instanceId !== 'string' || !instanceId.trim())
            throw new TypeError('commit requires a trusted instance ID');
        let commits = this.#commits.get(instanceId);
        if (!commits) {
            commits = new Set();
            this.#commits.set(instanceId, commits);
        }
        if (commits.size >= this.#maxPending) {
            let overflow = this.#overflow.get(instanceId);
            if (!overflow) {
                overflow = { pending: 0 };
                this.#overflow.set(instanceId, overflow);
            }
            overflow.pending++;
            // Retain unknown until untracked work settles; observe rejection without cancelling it.
            const state = overflow;
            void Promise.resolve(promise).then(() => { state.pending--; }, () => { state.pending--; });
            return;
        }
        const entries = commits;
        const commit = { done: Promise.resolve(), failed: false };
        entries.add(commit); // synchronous registration precedes any parent capture
        commit.done = Promise.resolve(promise).then(() => {
            entries.delete(commit);
            if (entries.size === 0 && this.#commits.get(instanceId) === entries)
                this.#commits.delete(instanceId);
        }, () => { commit.failed = true; });
    }
    /** Last prepared projection for this identity, including degraded text whose retry is still
     * pending. Fresh is true only for a verified snapshot; degraded text never replays as current. */
    prepared(identity) {
        const cached = this.#cache.get(cacheKey(checkedIdentity(identity)));
        return cached === undefined ? null : { text: cached.text, fresh: cached.valid };
    }
    /** The last successfully captured text marked stale for `reason`, or null when nothing was
     * captured. Used when the caller cannot even resolve its identity but is already retained. */
    degraded(identity, reason) {
        const cached = this.#cache.get(cacheKey(checkedIdentity(identity)));
        return cached === undefined || cached.verified === null ? null : stale(cached.verified, reason);
    }
    cachedText(identity) {
        const cached = this.#cache.get(cacheKey(checkedIdentity(identity)));
        return cached?.valid ? cached.text : null;
    }
    async readForConsumption(input, signal) {
        signal?.throwIfAborted();
        const identity = checkedIdentity(input);
        const key = cacheKey(identity);
        const sequence = ++this.#sequence;
        // Freeze a frontier once. New commits, other instances and child lifetimes are not awaited.
        const frontier = [...(this.#commits.get(identity.instrumentInstanceId) ?? [])];
        const overflow = this.#overflow.has(identity.instrumentInstanceId);
        const controller = new AbortController();
        let timer;
        let rejectStop = () => { };
        const stopped = new Promise((_, reject) => { rejectStop = reject; });
        const onAbort = () => { controller.abort(signal?.reason); rejectStop(signal?.reason); };
        signal?.addEventListener('abort', onAbort, { once: true });
        timer = setTimeout(() => {
            const error = new ConsumptionFailure('consumption-timeout');
            controller.abort(error);
            rejectStop(error);
        }, this.#timeoutMs);
        const read = async () => {
            await Promise.all(frontier.map(commit => commit.done));
            controller.signal.throwIfAborted();
            if (overflow)
                throw new ConsumptionFailure('commit-frontier-overflow');
            if (frontier.some(commit => commit.failed))
                throw new ConsumptionFailure('durability-commit-failed');
            // The runtime builds a deeply frozen snapshot and no consumer mutates it, so the read is
            // detached by construction: cloning 100+ KB of rows on every assembly pass bought nothing.
            const snapshot = await this.#options.readSnapshot(identity, controller.signal);
            controller.signal.throwIfAborted();
            verify(snapshot, identity);
            return snapshot;
        };
        try {
            const snapshot = await Promise.race([read(), stopped]);
            signal?.throwIfAborted();
            const previous = this.#cache.get(key);
            if (previous && sequence < previous.sequence)
                throw new ConsumptionFailure('superseded-read');
            // The projection is built here with fixed key order and deterministic row sorting, so a plain
            // stringify is a stable fingerprint; the previous canonical (recursively sorted) walk cost
            // several milliseconds per assembly pass for the same bytes.
            const currentFacts = JSON.stringify(facts(snapshot));
            const text = protocol(snapshot) + '\nCurrent runtime notices:\n' + currentNotices(snapshot)
                + '\nCurrent runtime facts (null means unavailable/unknown, not zero):\n' + currentFacts;
            // Notices such as pending release can change without changing the facts JSON. Compare
            // the complete representation so adding or clearing an obligation is never consumed.
            const changed = !previous?.valid || previous.text !== text;
            const unhealthy = snapshot.health.some(row => ['stale', 'unknown', 'unavailable', 'error', 'failed'].includes(row.status));
            // A late older read cannot regress a newer projection/cache. Unknown details are
            // still returned, but a degraded snapshot cannot be replayed as fresh context.
            if (!previous || sequence >= previous.sequence)
                this.#store(key, { text, verified: text, valid: !unhealthy, sequence });
            return { text: changed ? text : null, snapshot, freshness: unhealthy ? 'stale' : 'current', ...(unhealthy ? { reason: 'snapshot-health-degraded' } : {}) };
        }
        catch (error) {
            signal?.throwIfAborted(); // exact caller reason; never convert cancellation into a diagnostic
            const reason = error instanceof ConsumptionFailure ? error.reason : 'snapshot-read-failed';
            const previous = this.#cache.get(key);
            const latest = previous !== undefined && sequence >= previous.sequence;
            // A failed refresh must not blank the instrument: the last verified snapshot is re-offered
            // as explicitly stale text. It is never published as fresh, and the entry is invalidated,
            // so the retry still takes the full read once the gate window opens.
            const text = latest && previous.verified !== null ? stale(previous.verified, reason) : diagnostic(identity, reason);
            if (latest)
                this.#store(key, { ...previous, text, valid: false, sequence });
            if (reason === 'durability-commit-failed') {
                const commits = this.#commits.get(identity.instrumentInstanceId);
                for (const commit of frontier)
                    if (commit.failed)
                        commits?.delete(commit);
                if (commits?.size === 0)
                    this.#commits.delete(identity.instrumentInstanceId);
            }
            if (overflow && this.#overflow.get(identity.instrumentInstanceId)?.pending === 0)
                this.#overflow.delete(identity.instrumentInstanceId);
            return { text, freshness: latest && previous.verified !== null ? 'stale' : 'unavailable', reason };
        }
        finally {
            clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
        }
    }
}
