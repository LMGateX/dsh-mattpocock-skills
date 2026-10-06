import { createHash } from 'node:crypto';
import { initialInstrumentDocument, parseAuthor, parseInstrumentCommand, parseInstrumentDocument, projectInstrumentDocument, upgradeInstrumentDocument, parseInstrumentHistoryTarget, instrumentCommandMetadata } from './instrument-state.js';
import { array, ControlsError, freeze, id, increment, invalid, record, revision } from './validation.js';
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
function targetMatches(target, kind, row) {
    if (target.kind !== kind || target.workflowId !== row.workflowId)
        return false;
    if (target.kind === 'workflow')
        return true;
    if (target.kind === 'ticket')
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
function selectionsFor(value, axisKey) {
    return Object.hasOwn(value.statuses, axisKey) ? value.statuses[axisKey] : [];
}
/** Two-operation unmounted instrument seam; records model/user judgment, never judges it. */
export class SessionInstruments {
    controls;
    storage;
    authority;
    now;
    constructor(controls, storage, authority, now = Date.now) {
        this.controls = controls;
        this.storage = storage;
        this.authority = authority;
        this.now = now;
    }
    async read(principal, sessionId, filter = {}) {
        const parsedFilter = this.filter(filter);
        const context = await this.context(principal, sessionId, 'read');
        const document = await this.load(context.controls.instance);
        return this.snapshot(document, context.access, parsedFilter);
    }
    async apply(principal, sessionId, input) {
        const command = parseInstrumentCommand(input); // detach before any awaited host access
        const recordedAt = revision(this.now(), 'recordedAt');
        for (let attempt = 0; attempt < 32; attempt += 1) {
            const context = await this.context(principal, sessionId, 'write');
            const current = await this.load(context.controls.instance);
            const state = projectInstrumentDocument(current);
            this.checkChange(state, command, context.access);
            const receipt = current.schemaVersion === 2 ? current.dedup.find(d => d.operationId === command.operationId) : undefined;
            if (receipt) {
                if (receipt.kind !== 'command' || receipt.digest !== digest(command, context.access.author))
                    throw new ControlsError('operation-conflict', 'operationId already belongs to another author or payload');
                return freeze({ appliedRevision: receipt.appliedRevision, replayed: true, snapshot: this.snapshot(current, context.access, {}) });
            }
            const prior = current.events.find(event => event.command.operationId === command.operationId);
            if (prior) {
                if (JSON.stringify(prior.command) !== JSON.stringify(command) || JSON.stringify(prior.author) !== JSON.stringify(context.access.author))
                    throw new ControlsError('operation-conflict', 'operationId already belongs to another author or payload');
                return freeze({ appliedRevision: prior.revision, replayed: true, snapshot: this.snapshot(current, context.access, {}) });
            }
            const targetRevision = command.action === 'set-decision-view' ? this.viewerRevision(state, principal) : state.businessRevision;
            if (targetRevision !== command.expectedRevision)
                throw new ControlsError('revision-conflict', 'instrument business/viewer revision changed; reload before updating');
            this.checkFeature(context.controls, state, command);
            const candidate = { ...upgradeInstrumentDocument(current), revision: increment(current.revision),
                events: [...current.events, { revision: increment(current.revision), recordedAt, author: context.access.author, command }] };
            projectInstrumentDocument(candidate); // malformed references are input errors, not business rulings
            const next = parseInstrumentDocument(candidate);
            const snapshot = this.snapshot(next, context.access, {});
            if (await this.storage.compareAndSwap(current.instrumentInstanceId, current.revision, next)) {
                return freeze({ appliedRevision: next.revision, replayed: false, snapshot });
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
            const next = parseInstrumentDocument({ ...current, revision: appliedRevision, checkpoint: { throughRevision: appliedRevision, state: checkpointState }, events: [], dedup, coverage: [...current.coverage, coverage] });
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
            if (command.targets.some(t => !(t.kind === 'workflow' ? state.workflows : t.kind === 'ticket' ? state.tickets : state.decisions).some(row => targetMatches(t, t.kind, row))))
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
                decisions: state.decisions.map(row => ({ ...row, creator: row.creator ?? row.history[0].author, history: history('decision', row, row.history) })) };
            const appliedRevision = increment(current.revision), receipt = { operationId: command.operationId, author: context.access.author, digest: hash, kind: 'purge-history', appliedRevision };
            const coverage = { operationId: command.operationId, action: 'purge-history', appliedRevision, author: context.access.author, recordedAt, throughRevision: command.throughRevision, targets: command.targets, removedVersions, removedRevisions: removedRevisions.sort((a, b) => a - b) };
            const dedup = [...current.dedup, ...current.events.map((event) => ({ operationId: event.command.operationId, author: event.author, digest: digest(event.command, event.author), kind: 'command', appliedRevision: event.revision, command: instrumentCommandMetadata(event) })), receipt];
            const next = parseInstrumentDocument({ ...current, revision: appliedRevision, checkpoint: { throughRevision: appliedRevision, state: checkpointState }, events: [], dedup, coverage: [...current.coverage, coverage] });
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
        const controls = await this.controls.readSession(actor, session);
        signal?.throwIfAborted();
        const rawAccess = await this.authority.resolveAccess(actor, session, controls.instance, mode);
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
        if (command.action === 'put-ticket') {
            if (!access.scope.ticketIds.includes(command.localTicketId))
                denied();
            return;
        }
        if (command.action !== 'put-decision' && command.action !== 'set-decision-view')
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
            allowed = controls.policy.features.ticketProgress.status === 'configured' || controls.policy.features.pendingDecisions.status === 'configured';
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
        const decisions = state.decisions.filter(row => decisionAllowed(access, row.workflowId, row.value, creatorOf(row)))
            .map(row => ({ ...row, history: row.history.filter(change => decisionAllowed(access, row.workflowId, change.value, creatorOf(row))),
            view: state.decisionViews.find(view => view.workflowId === row.workflowId && view.decisionId === row.decisionId && view.principalId === access.author.principalId)?.value ?? { read: false, hidden: false } }));
        const changes = document.events.filter(event => {
            if (event.revision <= (filter.afterRevision ?? 0))
                return false;
            const command = event.command;
            if (!withinWorkflow(command.workflowId))
                return false;
            if (command.action === 'put-ticket')
                return withinTicket(command.workflowId, command.localTicketId);
            if (command.action === 'put-decision') {
                const current = state.decisions.find(row => row.workflowId === command.workflowId && row.decisionId === command.decisionId);
                return !!current && decisions.some(row => row.decisionId === command.decisionId && row.workflowId === command.workflowId) && decisionAllowed(access, command.workflowId, current.history.find(change => change.revision === event.revision).value, creatorOf(current));
            }
            if (command.action === 'set-decision-view')
                return event.author.principalId === access.author.principalId && decisions.some(row => row.decisionId === command.decisionId && row.workflowId === command.workflowId);
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
            focusedWorkflowId: filter.workflowId ?? null, workflows: workflows.filter(row => filter.workflowId === undefined || row.workflowId === filter.workflowId),
            tickets: tickets.filter(row => filter.workflowId === undefined || row.workflowId === filter.workflowId), decisions, changes,
            ...(document.schemaVersion === 2 && document.checkpoint.throughRevision > 0 ? { historyCoverage: { checkpointRevision: document.checkpoint.throughRevision, purged: document.coverage.some(c => c.removedVersions > 0) } } : {}),
            summary: { countingScope: access.scope.kind === 'coordinator' ? 'instance' : 'assignment', totalTickets: tickets.length, statusCounts,
                pendingDecisionCount: decisions.filter(row => row.value.pending).length,
                pendingUserDecisionCount: decisions.filter(row => row.value.pending && row.value.addressee?.kind === 'user').length,
                pendingForPrincipalCount: decisions.filter(row => row.value.pending && row.value.addressee?.principalId === access.author.principalId).length,
                awaitingImplementationCount: decisions.filter(row => row.value.awaitingImplementation).length } });
    }
}
