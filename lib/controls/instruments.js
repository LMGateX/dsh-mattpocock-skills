import { createHash } from 'node:crypto';
import { evaluateOwnerDecisionPolicy, evaluateRecommendationSupport, parseOwnerDecisionPolicyState } from './recommendation-contract.js';
import { initialInstrumentDocument, parseAuthor, parseInstrumentCommand, parseInstrumentDocument, projectInstrumentDocument, upgradeInstrumentDocument, parseInstrumentHistoryTarget, instrumentCommandMetadata } from './instrument-state.js';
import { array, ControlsError, freeze, id, increment, invalid, record, revision } from './validation.js';
const RECORD_CAPABILITIES = freeze({ taskReferences: true, storageVersions: [1, 2, 3, 4], decisionRecommendationAdoption: true });
function digest(payload, author) { return createHash('sha256').update(JSON.stringify({ payload, author })).digest('hex'); }
function compactInput(value) {
    const c = record(value, 'source compact input', ['operationId', 'expectedRevision']);
    return freeze({ operationId: id(c.operationId, 'operationId'), expectedRevision: revision(c.expectedRevision, 'expected document revision') });
}
function purgeInput(value) {
    const p = record(value, 'source purge input', ['operationId', 'expectedRevision', 'throughRevision', 'targets']);
    const targets = array(p.targets, 'explicit history targets').map(parseInstrumentHistoryTarget).sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0);
    if (targets.length === 0 || targets.length > 100 || new Set(targets.map(t => JSON.stringify(t))).size !== targets.length)
        invalid('source purge requires 1..100 unique explicit targets');
    return freeze({ operationId: id(p.operationId, 'operationId'), expectedRevision: revision(p.expectedRevision, 'expected document revision'), throughRevision: revision(p.throughRevision, 'throughRevision'), targets });
}
function checkpointPayload(document, state) {
    const { taskReferences: _references, ...legacy } = state;
    return document.schemaVersion >= 3 ? state : legacy;
}
function targetMatches(target, kind, row) {
    if (target.kind !== kind || target.workflowId !== row.workflowId)
        return false;
    if (target.kind === 'workflow')
        return true;
    if (target.kind === 'ticket' || target.kind === 'task-reference')
        return 'localTicketId' in row && target.localTicketId === row.localTicketId;
    return 'decisionId' in row && target.decisionId === row.decisionId;
}
function parseAccess(value, principal, sessionId) {
    const raw = record(value, 'instrument access', ['author', 'scope']);
    const author = parseAuthor(raw.author);
    if (author.principalId !== principal || (author.kind === 'agent' && author.sessionId !== sessionId))
        throw new ControlsError('access-denied', 'host author does not match authenticated caller');
    const scope = record(raw.scope, 'instrument scope');
    if (scope.kind === 'coordinator') {
        record(scope, 'coordinator scope', ['kind']);
        return freeze({ author, scope: { kind: 'coordinator' } });
    }
    record(scope, 'assignment scope', ['kind', 'workflowId', 'ticketIds']);
    if (scope.kind !== 'assigned')
        invalid('host must supply a coordinator or assigned scope');
    const ticketIds = array(scope.ticketIds, 'assigned ticketIds').map(value => id(value, 'assigned ticketId'));
    if (new Set(ticketIds).size !== ticketIds.length)
        invalid('duplicate assigned ticketId');
    return freeze({ author, scope: { kind: 'assigned', workflowId: scope.workflowId === null ? null : id(scope.workflowId, 'assigned workflowId'), ticketIds } });
}
function creatorOf(row) { return row.creator?.principalId ?? row.history[0].author.principalId; }
function decisionAllowed(access, workflowId, value, creator) {
    if (access.scope.kind === 'coordinator')
        return true;
    if (access.scope.workflowId !== workflowId)
        return false;
    const tickets = value.ticketIds ?? [];
    return tickets.length === 0 ? creator === access.author.principalId : tickets.every(ticket => access.scope.kind === 'assigned' && access.scope.ticketIds.includes(ticket));
}
// Only load()'s validated immutable source identities enter this cache. It stores
// first-version authorization facts, not first bodies or principal-specific results.
const registrationIndexes = new WeakMap();
function registrationIndex(document) {
    const known = registrationIndexes.get(document);
    if (known)
        return known;
    const proofs = new Map();
    if (document.schemaVersion !== 1) {
        // Receipts are validated as a complete, ordered source-revision chain. They
        // survive purge without retaining deleted business bodies. Time need not be monotonic.
        for (const receipt of document.dedup) {
            const metadata = receipt.command;
            if (metadata?.action !== 'put-decision' || metadata.target.kind !== 'decision')
                continue;
            const key = JSON.stringify([metadata.target.workflowId, metadata.target.decisionId]);
            if (!proofs.has(key))
                proofs.set(key, { registration: { recordedAt: metadata.recordedAt, revision: receipt.appliedRevision }, creator: receipt.author.principalId });
        }
        for (const row of document.checkpoint.state.decisions) {
            const key = JSON.stringify([row.workflowId, row.decisionId]), proof = proofs.get(key);
            const firstRetained = row.history[0];
            // Retained history is only an ACL witness when its revision matches the
            // independently proven first put. A purged or filtered first version is unknown.
            if (proof && firstRetained?.revision === proof.registration.revision)
                proofs.set(key, { ...proof, ticketIds: firstRetained.value.ticketIds ?? [] });
        }
    }
    for (const event of document.events) {
        const command = event.command;
        if (command.action !== 'put-decision')
            continue;
        const key = JSON.stringify([command.workflowId, command.decisionId]);
        if (!proofs.has(key))
            proofs.set(key, { registration: { recordedAt: event.recordedAt, revision: event.revision },
                creator: event.author.principalId, ticketIds: command.value.ticketIds ?? [] });
    }
    registrationIndexes.set(document, proofs);
    return proofs;
}
function registrationFor(document, access, workflowId, decisionId) {
    const proof = registrationIndex(document).get(JSON.stringify([workflowId, decisionId]));
    if (!proof || (access.scope.kind !== 'coordinator' && (proof.ticketIds === undefined || !decisionAllowed(access, workflowId, proof, proof.creator))))
        return null;
    return proof.registration;
}
function selectionsFor(value, axisKey) {
    return Object.hasOwn(value.statuses, axisKey) ? value.statuses[axisKey] : [];
}
// Only load()'s validated immutable documents enter this cache. This is deliberately
// separate from the full pure-state memo used by projectInstrumentDocument.
const currentDecisionIndexes = new WeakMap();
function currentDecisionIndex(document) {
    const known = currentDecisionIndexes.get(document);
    if (known !== undefined)
        return known;
    const base = document.schemaVersion !== 1 ? document.checkpoint.state : undefined;
    let businessRevision = base?.businessRevision ?? 0;
    const viewerRevisions = new Map(Object.entries(base?.viewerRevisions ?? {}));
    const decisions = new Map();
    const key = (workflowId, decisionId) => JSON.stringify([workflowId, decisionId]);
    for (const row of base?.decisions ?? [])
        decisions.set(key(row.workflowId, row.decisionId), {
            workflowId: row.workflowId, creator: creatorOf(row), ticketIds: row.value.ticketIds ?? [],
            pending: row.value.pending === true, userAddressee: row.value.addressee?.kind === 'user',
        });
    // Fold only count/authorization fields; never project or copy retained histories.
    for (const event of document.events) {
        const command = event.command;
        if (command.action === 'set-decision-view') {
            viewerRevisions.set(event.author.principalId, command.expectedRevision + 1);
            continue;
        }
        businessRevision++;
        if (command.action === 'adopt-decision-recommendation') {
            const target = key(command.workflowId, command.decisionId), previous = decisions.get(target);
            decisions.set(target, { ...previous, pending: false });
            continue;
        }
        if (command.action !== 'put-decision')
            continue;
        const target = key(command.workflowId, command.decisionId), previous = decisions.get(target);
        decisions.set(target, {
            workflowId: command.workflowId, creator: previous?.creator ?? event.author.principalId,
            ticketIds: command.value.ticketIds ?? previous?.ticketIds ?? [],
            pending: command.value.pending ?? previous?.pending ?? false,
            userAddressee: command.value.addressee === undefined ? previous?.userAddressee ?? false : command.value.addressee.kind === 'user',
        });
    }
    const current = Object.freeze({ businessRevision, viewerRevisions, decisions: freeze([...decisions.values()]) });
    currentDecisionIndexes.set(document, current);
    return current;
}
const currentIndexes = new WeakMap();
function currentIndex(document) {
    const known = currentIndexes.get(document);
    if (known !== undefined)
        return known;
    const base = document.schemaVersion !== 1 ? document.checkpoint.state : undefined;
    let businessRevision = base?.businessRevision ?? 0;
    const viewerRevisions = new Map(Object.entries(base?.viewerRevisions ?? {}));
    const workflows = new Map();
    const tickets = new Map();
    const taskReferences = new Map();
    const decisions = new Map();
    const views = new Map();
    const key = (...ids) => JSON.stringify(ids);
    const provenance = (change) => ({ author: change.author, recordedAt: change.recordedAt, references: change.references });
    // Checkpoints retain histories for their separate callers; read only the latest metadata
    // and authoritative merged value here. Never spread a retained row into this index.
    for (const row of base?.workflows ?? [])
        workflows.set(row.workflowId, {
            workflowId: row.workflowId, revision: row.revision, value: row.value, provenance: provenance(row.history.at(-1))
        });
    for (const row of base?.tickets ?? [])
        tickets.set(key(row.workflowId, row.localTicketId), {
            workflowId: row.workflowId, localTicketId: row.localTicketId, revision: row.revision, value: row.value, provenance: provenance(row.history.at(-1))
        });
    for (const row of document.schemaVersion === 3 || document.schemaVersion === 4 ? document.checkpoint.state.taskReferences : [])
        taskReferences.set(key(row.workflowId, row.localTicketId), {
            workflowId: row.workflowId, localTicketId: row.localTicketId, revision: row.revision, value: row.value, provenance: provenance(row.history.at(-1))
        });
    for (const row of base?.decisions ?? [])
        decisions.set(key(row.workflowId, row.decisionId), {
            workflowId: row.workflowId, decisionId: row.decisionId, revision: row.revision, value: row.value,
            creator: row.creator ?? row.history[0].author, provenance: provenance(row.history.at(-1)),
            ...(row.policyBinding ? { policyBinding: row.policyBinding } : {}), ...(row.policySelection ? { policySelection: row.policySelection } : {})
        });
    for (const row of base?.decisionViews ?? [])
        views.set(key(row.workflowId, row.decisionId, row.principalId), row);
    // The document was validated by load(). Fold only latest values and metadata, with
    // O(current rows) retained space, independent of the number of historic versions.
    for (const event of document.events) {
        const command = event.command, workflowId = command.workflowId;
        if (command.action === 'set-decision-view') {
            viewerRevisions.set(event.author.principalId, command.expectedRevision + 1);
            views.set(key(workflowId, command.decisionId, event.author.principalId), {
                workflowId, decisionId: command.decisionId, principalId: event.author.principalId, revision: event.revision, value: command.value
            });
            continue;
        }
        businessRevision++;
        const metadata = { revision: event.revision, provenance: provenance({ ...event, references: command.references ?? [] }) };
        if (command.action === 'put-workflow')
            workflows.set(workflowId, { workflowId, ...metadata, value: command.value });
        else if (command.action === 'put-ticket') {
            const target = key(workflowId, command.localTicketId), previous = tickets.get(target);
            tickets.set(target, { workflowId, localTicketId: command.localTicketId, ...metadata, value: { ...previous?.value, ...command.value } });
        }
        else if (command.action === 'put-task-reference') {
            const target = key(workflowId, command.localTicketId), previous = taskReferences.get(target);
            taskReferences.set(target, { workflowId, localTicketId: command.localTicketId, ...metadata, value: { ...previous?.value, ...command.value } });
        }
        else if (command.action === 'adopt-decision-recommendation') {
            const target = key(workflowId, command.decisionId), previous = decisions.get(target);
            decisions.set(target, { ...previous, ...metadata, value: { ...previous.value, pending: false }, provenance: { ...metadata.provenance, references: [...new Set([...previous.provenance.references, ...command.references ?? []])] }, ...(event.decisionPolicy?.kind === 'adopted' ? { policySelection: event.decisionPolicy.selection } : {}) });
        }
        else {
            const target = key(workflowId, command.decisionId), previous = decisions.get(target);
            decisions.set(target, { workflowId, decisionId: command.decisionId, ...metadata,
                creator: previous?.creator ?? event.author, value: { ...previous?.value, ...command.value },
                ...(previous?.policyBinding ? { policyBinding: previous.policyBinding } : {}), ...(event.decisionPolicy?.kind === 'bound' ? { policyBinding: event.decisionPolicy.binding } : {}) });
        }
    }
    const current = freeze({ businessRevision, viewerRevisions: Object.fromEntries(viewerRevisions),
        workflows: [...workflows.values()], tickets: [...tickets.values()], taskReferences: [...taskReferences.values()], decisions: [...decisions.values()], decisionViews: [...views.values()] });
    currentIndexes.set(document, current);
    return current;
}
/** Unmounted instrument seam; records model/user judgment, never judges it. */
export class SessionInstruments {
    controls;
    storage;
    authority;
    now;
    decisionPolicy;
    constructor(controls, storage, authority, now = Date.now, decisionPolicy) {
        this.controls = controls;
        this.storage = storage;
        this.authority = authority;
        this.now = now;
        this.decisionPolicy = decisionPolicy;
    }
    async policyState(instance) {
        try {
            return this.decisionPolicy ? parseOwnerDecisionPolicyState(await this.decisionPolicy.read(instance)) : undefined;
        }
        catch {
            return undefined;
        }
    }
    supportSnapshot(snapshot, controls, policy) {
        const now = this.now(), feature = controls.policy.features.pendingDecisions.status === 'configured';
        return freeze({ ...snapshot, capabilities: { ...RECORD_CAPABILITIES, decisionRecommendationAdoption: this.decisionPolicy !== undefined }, decisions: snapshot.decisions.map(row => ({ ...row, recommendationSupport: evaluateRecommendationSupport(row, policy, feature, now) })) });
    }
    async refreshWriteContext(principal, sessionId, previous, state, command) {
        const fresh = await this.context(principal, sessionId, 'write');
        const a = previous.controls.instance, b = fresh.controls.instance;
        if (a.instrumentInstanceId !== b.instrumentInstanceId || a.ownerSessionId !== b.ownerSessionId || a.controlWorkspaceId !== b.controlWorkspaceId)
            throw new ControlsError('association-conflict', 'owner instance changed during policy read');
        if (JSON.stringify(previous.access.author) !== JSON.stringify(fresh.access.author))
            throw new ControlsError('access-denied', 'actual author changed during policy read');
        this.checkChange(state, command, fresh.access);
        return fresh;
    }
    applyResult(command, appliedRevision, replayed, snapshot, effect) {
        const recommendation = command.action === 'adopt-decision-recommendation' && effect?.kind === 'adopted' ? { status: 'adopted', selection: effect.selection }
            : command.action === 'put-decision' ? snapshot.decisions.find(r => r.workflowId === command.workflowId && r.decisionId === command.decisionId)?.recommendationSupport : undefined;
        return freeze({ appliedRevision, replayed, snapshot, ...(recommendation ? { recommendation } : {}) });
    }
    async read(principal, sessionId, filter = {}, signal) {
        signal?.throwIfAborted();
        const parsedFilter = this.filter(filter);
        const context = await this.context(principal, sessionId, 'read', signal);
        const document = await this.load(context.controls.instance, signal);
        const policy = await this.policyState(context.controls.instance);
        signal?.throwIfAborted();
        return this.supportSnapshot(this.snapshot(document, context.access, parsedFilter), context.controls, policy);
    }
    async readCurrent(principal, sessionId, signal) {
        const context = await this.context(principal, sessionId, 'read', signal);
        const document = await this.load(context.controls.instance, signal);
        const state = currentIndex(document), access = context.access;
        const workflows = state.workflows.filter(row => access.scope.kind === 'coordinator' || row.workflowId === access.scope.workflowId);
        const tickets = state.tickets.filter(row => access.scope.kind === 'coordinator' || (row.workflowId === access.scope.workflowId && access.scope.ticketIds.includes(row.localTicketId)));
        const taskReferences = state.taskReferences.filter(row => access.scope.kind === 'coordinator' || (row.workflowId === access.scope.workflowId && access.scope.ticketIds.includes(row.localTicketId)));
        const decisions = state.decisions.filter(row => decisionAllowed(access, row.workflowId, row.value, row.creator.principalId))
            .map(row => ({ ...row, registration: registrationFor(document, access, row.workflowId, row.decisionId), updatedAt: row.provenance.recordedAt, view: state.decisionViews.find(view => view.workflowId === row.workflowId && view.decisionId === row.decisionId && view.principalId === access.author.principalId)?.value ?? { read: false, hidden: false } }));
        const statusCounts = workflows.flatMap(workflow => workflow.value.axes.map(axis => {
            const scoped = tickets.filter(ticket => ticket.workflowId === workflow.workflowId);
            return { workflowId: workflow.workflowId, axisKey: axis.axisKey, label: axis.label, counting: axis.counting,
                unreported: scoped.filter(ticket => selectionsFor(ticket.value, axis.axisKey).length === 0).length,
                statuses: axis.statuses.map(status => ({ statusKey: status.statusKey, label: status.label, meaning: status.meaning ?? null,
                    ...(status.summaryPriority === undefined ? {} : { summaryPriority: status.summaryPriority }),
                    count: scoped.filter(ticket => selectionsFor(ticket.value, axis.axisKey).includes(status.statusKey)).length })) };
        }));
        const snapshot = freeze({ instance: context.controls.instance, revision: document.revision, businessRevision: state.businessRevision,
            viewerRevision: Object.hasOwn(state.viewerRevisions, access.author.principalId) ? state.viewerRevisions[access.author.principalId] : 0,
            scope: access.scope, focusedWorkflowId: null, capabilities: { ...RECORD_CAPABILITIES, decisionRecommendationAdoption: this.decisionPolicy !== undefined }, workflows, tickets, taskReferences, decisions,
            summary: { countingScope: access.scope.kind === 'coordinator' ? 'instance' : 'assignment', totalTickets: tickets.length, totalTaskReferences: taskReferences.length, statusCounts,
                pendingDecisionCount: decisions.filter(row => row.value.pending).length,
                pendingUserDecisionCount: decisions.filter(row => row.value.pending && row.value.addressee?.kind === 'user').length,
                pendingForPrincipalCount: decisions.filter(row => row.value.pending && row.value.addressee?.principalId === access.author.principalId).length,
                awaitingImplementationCount: decisions.filter(row => row.value.awaitingImplementation).length } });
        return this.supportSnapshot(snapshot, context.controls, await this.policyState(context.controls.instance));
    }
    async readSummary(principal, sessionId, signal) {
        const context = await this.context(principal, sessionId, 'read', signal);
        const document = await this.load(context.controls.instance, signal);
        const current = currentDecisionIndex(document), access = context.access;
        let pendingUserDecisionCount = 0;
        for (const decision of current.decisions) {
            if (decision.pending && decision.userAddressee && decisionAllowed(access, decision.workflowId, decision, decision.creator))
                pendingUserDecisionCount++;
        }
        return freeze({ instance: context.controls.instance, revision: document.revision,
            businessRevision: current.businessRevision, viewerRevision: current.viewerRevisions.get(access.author.principalId) ?? 0,
            scope: access.scope, summary: { countingScope: access.scope.kind === 'coordinator' ? 'instance' : 'assignment', pendingUserDecisionCount } });
    }
    async apply(principal, sessionId, input) {
        const command = parseInstrumentCommand(input); // detach before any awaited host access
        for (let attempt = 0; attempt < 32; attempt += 1) {
            let context = await this.context(principal, sessionId, 'write');
            const current = await this.load(context.controls.instance);
            const state = projectInstrumentDocument(current);
            this.checkChange(state, command, context.access);
            const receipt = current.schemaVersion !== 1 ? current.dedup.find(d => d.operationId === command.operationId) : undefined;
            if (receipt) {
                if (receipt.kind !== 'command' || receipt.digest !== digest(command, context.access.author))
                    throw new ControlsError('operation-conflict', 'operationId already belongs to another author or payload');
                const policy = await this.policyState(context.controls.instance);
                if (this.decisionPolicy)
                    context = await this.refreshWriteContext(principal, sessionId, context, state, command);
                const snapshot = this.supportSnapshot(this.snapshot(current, context.access, {}), context.controls, policy);
                return this.applyResult(command, receipt.appliedRevision, true, snapshot, receipt.command?.decisionPolicy);
            }
            const prior = current.events.find(event => event.command.operationId === command.operationId);
            if (prior) {
                if (JSON.stringify(prior.command) !== JSON.stringify(command) || JSON.stringify(prior.author) !== JSON.stringify(context.access.author))
                    throw new ControlsError('operation-conflict', 'operationId already belongs to another author or payload');
                const policy = await this.policyState(context.controls.instance);
                if (this.decisionPolicy)
                    context = await this.refreshWriteContext(principal, sessionId, context, state, command);
                const snapshot = this.supportSnapshot(this.snapshot(current, context.access, {}), context.controls, policy);
                return this.applyResult(command, prior.revision, true, snapshot, prior.decisionPolicy);
            }
            const targetRevision = command.action === 'set-decision-view' ? this.viewerRevision(state, principal) : state.businessRevision;
            if (targetRevision !== command.expectedRevision)
                throw new ControlsError('revision-conflict', 'instrument business/viewer revision changed; reload before updating');
            this.checkFeature(context.controls, state, command);
            if (command.action === 'adopt-decision-recommendation' && (!this.decisionPolicy || context.access.author.kind !== 'agent'))
                throw new ControlsError('access-denied', 'recommendation adoption requires supported agent context');
            const policy = await this.policyState(context.controls.instance);
            if (this.decisionPolicy && (command.action === 'put-decision' || command.action === 'adopt-decision-recommendation'))
                context = await this.refreshWriteContext(principal, sessionId, context, state, command);
            this.checkFeature(context.controls, state, command);
            const finalTime = revision(this.now(), 'recordedAt');
            let decisionPolicy;
            if (command.action === 'adopt-decision-recommendation') {
                const row = state.decisions.find(row => row.workflowId === command.workflowId && row.decisionId === command.decisionId);
                if (!row)
                    invalid('adoption refers to unknown decision');
                if (row.revision !== command.value.decisionRevision)
                    throw new ControlsError('revision-conflict', 'decision source revision changed');
                const support = evaluateRecommendationSupport(row, policy, context.controls.policy.features.pendingDecisions.status === 'configured', finalTime);
                if (support.status !== 'candidate')
                    throw new ControlsError(support.status === 'unknown' ? 'invalid-state' : 'feature-disabled', 'recommendation cannot be adopted: ' + ('reason' in support ? support.reason : support.status));
                const c = support.candidate, v = command.value;
                if (c.decisionRevision !== v.decisionRevision || c.optionKey !== v.optionKey || c.policyEpochId !== v.policyEpochId || c.policyRevision !== v.policyRevision)
                    throw new ControlsError('revision-conflict', 'adoption candidate changed');
                decisionPolicy = { kind: 'adopted', selection: { kind: 'owner-policy', selectedOptionKey: c.optionKey, decisionSourceRevision: c.decisionRevision, policy: row.policyBinding.policy, authorizedAt: finalTime } };
            }
            if (command.action === 'put-decision' && !state.decisions.some(row => row.workflowId === command.workflowId && row.decisionId === command.decisionId)
                && context.access.author.kind === 'agent' && command.value.pending === true && command.value.addressee?.kind === 'user'
                && policy?.epoch && evaluateOwnerDecisionPolicy(policy, context.controls.policy.features.pendingDecisions.status === 'configured', finalTime).status === 'active'
                && (command.value.addressee.principalId == null || command.value.addressee.principalId === policy.epoch.authorizedBy.principalId)
                && typeof command.value.recommendation === 'string' && command.value.options?.filter(o => o.key === command.value.recommendation).length === 1) {
                decisionPolicy = { kind: 'bound', binding: { createdRevision: increment(current.revision), optionKey: command.value.recommendation, policy: policy.epoch } };
            }
            const candidate = { ...upgradeInstrumentDocument(current, command.action === 'put-task-reference', decisionPolicy !== undefined), revision: increment(current.revision),
                events: [...current.events, { revision: increment(current.revision), recordedAt: finalTime, author: context.access.author, command, ...(decisionPolicy ? { decisionPolicy } : {}) }] };
            projectInstrumentDocument(candidate); // malformed references are input errors, not business rulings
            let next = parseInstrumentDocument(candidate);
            // Finish all validation/projection work BEFORE the final trusted clock gate.
            // The storage CAS validates/detaches its input inside the CAS invocation.
            this.snapshot(next, context.access, {});
            if (decisionPolicy) {
                const authorizedAt = revision(this.now(), 'final authorization time');
                if (!policy || evaluateOwnerDecisionPolicy(policy, context.controls.policy.features.pendingDecisions.status === 'configured', authorizedAt).status !== 'active') {
                    if (decisionPolicy.kind === 'adopted')
                        throw new ControlsError('feature-disabled', 'recommendation authorization expired before CAS');
                    // Losing optional eligibility must not discard a legitimate ordinary question.
                    decisionPolicy = undefined;
                    next = { ...upgradeInstrumentDocument(current, command.action === 'put-task-reference'), revision: increment(current.revision), events: [...current.events, { revision: increment(current.revision), recordedAt: authorizedAt, author: context.access.author, command }] };
                }
                else {
                    if (decisionPolicy.kind === 'adopted')
                        decisionPolicy = { kind: 'adopted', selection: { ...decisionPolicy.selection, authorizedAt } };
                    const last = next.events.at(-1);
                    next = { ...next, events: [...next.events.slice(0, -1), { ...last, recordedAt: authorizedAt, decisionPolicy }] };
                }
            }
            if (await this.storage.compareAndSwap(current.instrumentInstanceId, current.revision, next)) {
                const snapshot = this.snapshot(parseInstrumentDocument(next), context.access, {});
                return this.applyResult(command, next.revision, false, this.supportSnapshot(snapshot, context.controls, policy), decisionPolicy);
            }
        }
        throw new ControlsError('concurrent-update', 'instrument changed repeatedly; retry against the saved revision');
    }
    async compact(principal, sessionId, input, signal) {
        signal?.throwIfAborted();
        const command = compactInput(input), recordedAt = revision(this.now(), 'cleanup recordedAt');
        for (let attempt = 0; attempt < 32; attempt++) {
            signal?.throwIfAborted();
            const context = await this.context(principal, sessionId, 'write', signal);
            signal?.throwIfAborted();
            this.cleanupAccess(context, sessionId);
            const loaded = await this.load(context.controls.instance, signal);
            signal?.throwIfAborted();
            const current = upgradeInstrumentDocument(loaded), hash = digest({ action: 'compact', ...command }, context.access.author);
            const prior = current.dedup.find(d => d.operationId === command.operationId);
            if (prior) {
                if (prior.kind !== 'compact' || prior.digest !== hash)
                    throw new ControlsError('operation-conflict', 'cleanup operation belongs to another author or payload');
                return this.cleanupResult(current, context.access, prior.appliedRevision, true, 0);
            }
            if (current.events.some(e => e.command.operationId === command.operationId))
                throw new ControlsError('operation-conflict', 'cleanup operation belongs to a business command');
            if (command.expectedRevision !== current.revision)
                throw new ControlsError('revision-conflict', 'source document changed; reload before cleanup');
            const state = projectInstrumentDocument(current), appliedRevision = increment(current.revision);
            const checkpointState = { ...state, decisions: state.decisions.map(row => ({ ...row, creator: row.creator ?? row.history[0].author })) };
            const receipt = { operationId: command.operationId, author: context.access.author, digest: hash, kind: 'compact', appliedRevision };
            const coverage = { operationId: command.operationId, action: 'compact', appliedRevision, author: context.access.author, recordedAt, throughRevision: current.revision, targets: [], removedVersions: 0, removedRevisions: [] };
            const dedup = [...current.dedup, ...current.events.map((event) => ({ operationId: event.command.operationId, author: event.author, digest: digest(event.command, event.author), kind: 'command', appliedRevision: event.revision, command: instrumentCommandMetadata(event) })), receipt];
            const next = parseInstrumentDocument({ ...current, revision: appliedRevision, checkpoint: { throughRevision: appliedRevision, state: checkpointPayload(current, checkpointState) }, events: [], dedup, coverage: [...current.coverage, coverage] });
            signal?.throwIfAborted();
            // CAS has begun: cancellation cannot turn a durable acknowledgement into rollback.
            const committed = await this.storage.compareAndSwap(current.instrumentInstanceId, current.revision, next);
            if (committed)
                return this.cleanupResult(next, context.access, appliedRevision, false, 0);
            signal?.throwIfAborted();
        }
        throw new ControlsError('concurrent-update', 'source changed repeatedly during compact');
    }
    async purgeHistory(principal, sessionId, input, signal) {
        signal?.throwIfAborted();
        const command = purgeInput(input), recordedAt = revision(this.now(), 'cleanup recordedAt');
        for (let attempt = 0; attempt < 32; attempt++) {
            signal?.throwIfAborted();
            const context = await this.context(principal, sessionId, 'write', signal);
            signal?.throwIfAborted();
            this.cleanupAccess(context, sessionId);
            const loaded = await this.load(context.controls.instance, signal);
            signal?.throwIfAborted();
            const current = upgradeInstrumentDocument(loaded), hash = digest({ action: 'purge-history', ...command }, context.access.author);
            const prior = current.dedup.find(d => d.operationId === command.operationId);
            if (prior) {
                if (prior.kind !== 'purge-history' || prior.digest !== hash)
                    throw new ControlsError('operation-conflict', 'cleanup operation belongs to another author or payload');
                const result = current.coverage.find(c => c.operationId === command.operationId);
                return this.cleanupResult(current, context.access, prior.appliedRevision, true, result.removedVersions);
            }
            if (current.events.some(e => e.command.operationId === command.operationId))
                throw new ControlsError('operation-conflict', 'cleanup operation belongs to a business command');
            if (command.expectedRevision !== current.revision)
                throw new ControlsError('revision-conflict', 'source document changed; reload before cleanup');
            if (command.throughRevision > current.revision)
                invalid('source purge throughRevision exceeds saved source revision');
            const state = projectInstrumentDocument(current);
            if (command.targets.some(t => !(t.kind === 'workflow' ? state.workflows : t.kind === 'ticket' ? state.tickets : t.kind === 'task-reference' ? state.taskReferences : state.decisions).some(row => targetMatches(t, t.kind, row))))
                invalid('source purge target is not recorded in scoped owner');
            let removedVersions = 0;
            const removedRevisions = [];
            const history = (kind, row, versions) => {
                if (!command.targets.some(t => targetMatches(t, kind, row)))
                    return versions;
                return versions.filter(version => { const keep = version.revision === row.revision || version.revision > command.throughRevision; if (!keep) {
                    removedVersions++;
                    removedRevisions.push(version.revision);
                } return keep; });
            };
            const checkpointState = { ...state,
                workflows: state.workflows.map(row => ({ ...row, history: history('workflow', row, row.history) })),
                tickets: state.tickets.map(row => ({ ...row, history: history('ticket', row, row.history) })),
                taskReferences: state.taskReferences.map(row => ({ ...row, history: history('task-reference', row, row.history) })),
                decisions: state.decisions.map(row => ({ ...row, creator: row.creator ?? row.history[0].author, history: history('decision', row, row.history) })) };
            const appliedRevision = increment(current.revision), receipt = { operationId: command.operationId, author: context.access.author, digest: hash, kind: 'purge-history', appliedRevision };
            const coverage = { operationId: command.operationId, action: 'purge-history', appliedRevision, author: context.access.author, recordedAt, throughRevision: command.throughRevision, targets: command.targets, removedVersions, removedRevisions: removedRevisions.sort((a, b) => a - b) };
            const dedup = [...current.dedup, ...current.events.map((event) => ({ operationId: event.command.operationId, author: event.author, digest: digest(event.command, event.author), kind: 'command', appliedRevision: event.revision, command: instrumentCommandMetadata(event) })), receipt];
            const next = parseInstrumentDocument({ ...current, revision: appliedRevision, checkpoint: { throughRevision: appliedRevision, state: checkpointPayload(current, checkpointState) }, events: [], dedup, coverage: [...current.coverage, coverage] });
            signal?.throwIfAborted();
            // CAS has begun: cancellation cannot turn a durable acknowledgement into rollback.
            const committed = await this.storage.compareAndSwap(current.instrumentInstanceId, current.revision, next);
            if (committed)
                return this.cleanupResult(next, context.access, appliedRevision, false, removedVersions);
            signal?.throwIfAborted();
        }
        throw new ControlsError('concurrent-update', 'source changed repeatedly during history purge');
    }
    cleanupAccess(context, sessionId) {
        if (context.access.scope.kind !== 'coordinator' || sessionId !== context.controls.instance.ownerSessionId)
            throw new ControlsError('access-denied', 'source cleanup requires authenticated owner coordinator context');
    }
    cleanupResult(document, access, appliedRevision, replayed, removedVersions) {
        return freeze({ appliedRevision, replayed, removedVersions, checkpointRevision: document.checkpoint.throughRevision, coverage: document.coverage, snapshot: this.snapshot(document, access, {}) });
    }
    async context(principal, sessionId, mode, signal) {
        signal?.throwIfAborted();
        const actor = id(principal, 'principal'), session = id(sessionId, 'sessionId');
        const controls = await this.controls.readSession(actor, session, mode === 'read' ? signal : undefined);
        signal?.throwIfAborted();
        const rawAccess = await this.authority.resolveAccess(actor, session, controls.instance, mode, mode === 'read' ? signal : undefined);
        signal?.throwIfAborted();
        const access = parseAccess(rawAccess, actor, session);
        return { controls, access };
    }
    async load(instance, signal) {
        signal?.throwIfAborted();
        const raw = await this.storage.read(instance.instrumentInstanceId);
        signal?.throwIfAborted();
        const document = raw === undefined ? initialInstrumentDocument(instance) : parseInstrumentDocument(raw);
        if (document.instrumentInstanceId !== instance.instrumentInstanceId || document.ownerSessionId !== instance.ownerSessionId || document.controlWorkspaceId !== instance.controlWorkspaceId)
            throw new ControlsError('association-conflict', 'instrument record conflicts with trusted owner instance');
        return document;
    }
    viewerRevision(state, principal) {
        return Object.hasOwn(state.viewerRevisions, principal) ? state.viewerRevisions[principal] : 0;
    }
    checkChange(state, command, access) {
        if (access.scope.kind === 'coordinator')
            return;
        const denied = () => { throw new ControlsError('access-denied', 'change exceeds authenticated assignment'); };
        if (command.workflowId !== access.scope.workflowId || command.action === 'put-workflow')
            denied();
        if (command.action === 'put-ticket' || command.action === 'put-task-reference') {
            if (!access.scope.ticketIds.includes(command.localTicketId))
                denied();
            return;
        }
        if (command.action !== 'put-decision' && command.action !== 'set-decision-view' && command.action !== 'adopt-decision-recommendation')
            return denied();
        const previous = state.decisions.find(row => row.workflowId === command.workflowId && row.decisionId === command.decisionId);
        if (previous && !decisionAllowed(access, command.workflowId, previous.value, creatorOf(previous)))
            denied();
        if (command.action === 'put-decision' && !decisionAllowed(access, command.workflowId, { ...previous?.value, ...command.value }, previous ? creatorOf(previous) : access.author.principalId))
            denied();
    }
    checkFeature(controls, state, command) {
        let allowed = true;
        if (command.action === 'put-workflow' && !state.workflows.some(row => row.workflowId === command.workflowId))
            allowed = controls.policy.features.ticketProgress.status === 'configured' || controls.policy.features.pendingDecisions.status === 'configured' || command.value.axes.length === 0 && controls.policy.features.windows?.status === 'configured';
        if (command.action === 'put-task-reference' && !state.taskReferences.some(row => row.workflowId === command.workflowId && row.localTicketId === command.localTicketId))
            allowed = controls.policy.features.ticketProgress.status === 'configured' || controls.policy.features.pendingDecisions.status === 'configured' || controls.policy.features.windows?.status === 'configured';
        if (command.action === 'put-ticket' && !state.tickets.some(row => row.workflowId === command.workflowId && row.localTicketId === command.localTicketId))
            allowed = controls.policy.features.ticketProgress.status === 'configured';
        if (command.action === 'put-decision' && !state.decisions.some(row => row.workflowId === command.workflowId && row.decisionId === command.decisionId))
            allowed = controls.policy.features.pendingDecisions.status === 'configured';
        if (!allowed)
            throw new ControlsError('feature-disabled', 'new instrument records require the corresponding configured feature; retained records remain available');
    }
    filter(value) {
        const raw = record(value, 'instrument filter', ['workflowId', 'afterRevision']);
        return { ...(raw.workflowId === undefined ? {} : { workflowId: id(raw.workflowId, 'filter workflowId') }),
            ...(raw.afterRevision === undefined ? {} : { afterRevision: revision(raw.afterRevision, 'afterRevision') }) };
    }
    snapshot(document, access, filter) {
        const state = projectInstrumentDocument(document);
        if ((filter.afterRevision ?? 0) > document.revision)
            invalid('change cursor exceeds this instance revision');
        const withinWorkflow = (workflowId) => access.scope.kind === 'coordinator' || access.scope.workflowId === workflowId;
        const withinTicket = (workflowId, ticketId) => withinWorkflow(workflowId) && (access.scope.kind === 'coordinator' || access.scope.ticketIds.includes(ticketId));
        const workflows = state.workflows.filter(row => withinWorkflow(row.workflowId));
        const tickets = state.tickets.filter(row => withinTicket(row.workflowId, row.localTicketId));
        const taskReferences = state.taskReferences.filter(row => withinTicket(row.workflowId, row.localTicketId));
        const keyOf = (workflowId, decisionId) => JSON.stringify([workflowId, decisionId]);
        const views = new Map(state.decisionViews.filter(view => view.principalId === access.author.principalId)
            .map(view => [keyOf(view.workflowId, view.decisionId), view.value]));
        // Source revisions are unique within this document. Index the merged value at
        // that exact revision, never the raw optional patch or the latest association.
        const versions = new Map();
        for (const row of state.decisions)
            for (const change of row.history)
                versions.set(change.revision, { value: change.value, creator: creatorOf(row) });
        const decisions = state.decisions.filter(row => decisionAllowed(access, row.workflowId, row.value, creatorOf(row)))
            .map(row => ({ ...row, registration: registrationFor(document, access, row.workflowId, row.decisionId), updatedAt: row.history.at(-1).recordedAt, history: row.history.filter(change => decisionAllowed(access, row.workflowId, change.value, creatorOf(row))),
            view: views.get(keyOf(row.workflowId, row.decisionId)) ?? { read: false, hidden: false } }));
        const visibleDecisions = new Set(decisions.map(row => keyOf(row.workflowId, row.decisionId)));
        const changes = document.events.filter(event => {
            if (event.revision <= (filter.afterRevision ?? 0))
                return false;
            const command = event.command;
            if (!withinWorkflow(command.workflowId))
                return false;
            if (command.action === 'put-ticket' || command.action === 'put-task-reference')
                return withinTicket(command.workflowId, command.localTicketId);
            if (command.action === 'put-decision' || command.action === 'adopt-decision-recommendation') {
                const version = versions.get(event.revision);
                return !!version && visibleDecisions.has(keyOf(command.workflowId, command.decisionId)) && decisionAllowed(access, command.workflowId, version.value, version.creator);
            }
            if (command.action === 'set-decision-view')
                return event.author.principalId === access.author.principalId && visibleDecisions.has(keyOf(command.workflowId, command.decisionId));
            return true;
        });
        const statusCounts = workflows.flatMap(workflow => workflow.value.axes.map(axis => {
            const scoped = tickets.filter(ticket => ticket.workflowId === workflow.workflowId);
            return { workflowId: workflow.workflowId, axisKey: axis.axisKey, label: axis.label, counting: axis.counting,
                unreported: scoped.filter(ticket => selectionsFor(ticket.value, axis.axisKey).length === 0).length,
                statuses: axis.statuses.map(status => ({ statusKey: status.statusKey, label: status.label, meaning: status.meaning ?? null,
                    ...(status.summaryPriority === undefined ? {} : { summaryPriority: status.summaryPriority }),
                    count: scoped.filter(ticket => selectionsFor(ticket.value, axis.axisKey).includes(status.statusKey)).length })) };
        }));
        return freeze({ instance: { instrumentInstanceId: document.instrumentInstanceId, ownerSessionId: document.ownerSessionId, controlWorkspaceId: document.controlWorkspaceId },
            revision: document.revision, businessRevision: state.businessRevision, viewerRevision: this.viewerRevision(state, access.author.principalId), scope: access.scope,
            capabilities: { ...RECORD_CAPABILITIES, decisionRecommendationAdoption: this.decisionPolicy !== undefined }, focusedWorkflowId: filter.workflowId ?? null, workflows: workflows.filter(row => filter.workflowId === undefined || row.workflowId === filter.workflowId),
            tickets: tickets.filter(row => filter.workflowId === undefined || row.workflowId === filter.workflowId), taskReferences: taskReferences.filter(row => filter.workflowId === undefined || row.workflowId === filter.workflowId), decisions, changes,
            ...(document.schemaVersion !== 1 && document.checkpoint.throughRevision > 0 ? { historyCoverage: { checkpointRevision: document.checkpoint.throughRevision, purged: document.coverage.some(c => c.removedVersions > 0) } } : {}),
            summary: { countingScope: access.scope.kind === 'coordinator' ? 'instance' : 'assignment', totalTickets: tickets.length, totalTaskReferences: taskReferences.length, statusCounts,
                pendingDecisionCount: decisions.filter(row => row.value.pending).length,
                pendingUserDecisionCount: decisions.filter(row => row.value.pending && row.value.addressee?.kind === 'user').length,
                pendingForPrincipalCount: decisions.filter(row => row.value.pending && row.value.addressee?.principalId === access.author.principalId).length,
                awaitingImplementationCount: decisions.filter(row => row.value.awaitingImplementation).length } });
    }
}
