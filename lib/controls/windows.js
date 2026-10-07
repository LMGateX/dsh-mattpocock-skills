import { createHash, randomUUID } from 'node:crypto';
import { parseAuthor } from './instrument-state.js';
import { array, boolean, ControlsError, freeze, id, increment, invalid, record, revision, memoized } from './validation.js';
import { createDomainVersionedStorage, MemoryVersionedStorage } from './versioned-storage.js';
const STATES = ['reserved', 'accepted', 'scheduled', 'running', 'stopping', 'unknown', 'released'];
function state(value) {
    if (!STATES.includes(value))
        invalid('unsupported execution state');
    return value;
}
function checkTransition(lease, runtimeId, target) {
    if (lease.runtimeId !== runtimeId || lease.state === 'unknown' || target === 'unknown' || target === 'released')
        return;
    const rank = { reserved: 0, accepted: 1, scheduled: 2, running: 3, stopping: 4, unknown: 5, released: 6 };
    if (rank[target] < rank[lease.state])
        throw new ControlsError('operation-conflict', 'execution state cannot regress without trusted unknown/restart reconciliation');
}
function generation(value) {
    const parsed = revision(value, 'generation');
    if (parsed < 1)
        invalid('generation must be positive');
    return parsed;
}
function ticketIdentity(raw) {
    return { workflowId: id(raw.workflowId, 'workflowId'), localTicketId: id(raw.localTicketId, 'localTicketId') };
}
export function parseTicketWindowCommand(value) {
    const raw = record(value, 'ticket window command');
    if (raw.action !== 'reserve' && raw.action !== 'release' && raw.action !== 'reacquire')
        invalid('ticket window commands must declare action "reserve", "release" or "reacquire"; there is no read action — read T/S from the injected snapshot or query mattpocock_history');
    record(raw, 'ticket window command', ['operationId', 'workflowId', 'localTicketId', 'action', ...(raw.action === 'reserve' ? [] : ['generation'])]);
    const base = { operationId: id(raw.operationId, 'operationId'), ...ticketIdentity(raw) };
    return freeze(raw.action === 'reserve' ? { ...base, action: 'reserve' } : { ...base, action: raw.action, generation: generation(raw.generation) });
}
function executionAssignment(raw) {
    const workflowId = raw.workflowId === null ? null : id(raw.workflowId, 'workflowId');
    const localTicketId = raw.localTicketId === null ? null : id(raw.localTicketId, 'localTicketId');
    if (workflowId === null && localTicketId !== null)
        invalid('ticket-linked execution requires a real workflowId');
    return { workflowId, localTicketId };
}
function parseRequest(value) {
    const raw = record(value, 'execution request', ['operationId', 'executionId', 'workflowId', 'localTicketId']);
    return freeze({ operationId: id(raw.operationId, 'operationId'), executionId: id(raw.executionId, 'executionId'),
        ...executionAssignment(raw) });
}
function parseObservation(value) {
    const raw = record(value, 'runtime observation', ['operationId', 'state', 'reason']);
    if (raw.state !== 'known' && raw.state !== 'unknown')
        invalid('runtime observation must explicitly declare known/unknown');
    const reason = raw.reason === null ? null : id(raw.reason, 'runtime observation reason');
    if ((raw.state === 'known') !== (reason === null))
        invalid('known runtime clears reason; unknown requires a mechanical reason');
    return freeze({ operationId: id(raw.operationId, 'operationId'), state: raw.state, reason });
}
function parseKnowledge(value) {
    const raw = record(value, 'runtime knowledge', ['runtimeId', 'known', 'reason']);
    const runtimeId = raw.runtimeId === null ? null : id(raw.runtimeId, 'knowledge runtimeId');
    const known = boolean(raw.known, 'runtime known');
    const reason = raw.reason === null ? null : id(raw.reason, 'knowledge reason');
    if (known && (runtimeId === null || reason !== null))
        invalid('known runtime requires inspected identity and no unknown reason');
    if (!known && reason === null)
        invalid('unknown runtime requires reason');
    return { runtimeId, known, reason };
}
function parseToken(raw) {
    return { instrumentInstanceId: id(raw.instrumentInstanceId, 'instrumentInstanceId'), executionId: id(raw.executionId, 'executionId'),
        generation: generation(raw.generation), leaseId: id(raw.leaseId, 'leaseId') };
}
function parseReceipt(value) {
    const raw = record(value, 'execution receipt', ['operationId', 'instrumentInstanceId', 'executionId', 'generation', 'leaseId', 'state']);
    return freeze({ operationId: id(raw.operationId, 'operationId'), ...parseToken(raw), state: state(raw.state) });
}
function parseTicket(value) {
    const raw = record(value, 'ticket lease', ['workflowId', 'localTicketId', 'generation', 'held']);
    return { ...ticketIdentity(raw), generation: generation(raw.generation), held: boolean(raw.held, 'held') };
}
function parseExecution(value) {
    const raw = record(value, 'execution lease', ['instrumentInstanceId', 'executionId', 'generation', 'leaseId', 'workflowId', 'localTicketId', 'runtimeId', 'state']);
    return { ...parseToken(raw), ...executionAssignment(raw),
        runtimeId: id(raw.runtimeId, 'runtimeId'), state: state(raw.state) };
}
function sameTicket(a, b) {
    return a.workflowId === b.workflowId && a.localTicketId === b.localTicketId;
}
function parseDocument(value) {
    const shape = record(value, 'window document');
    if (shape.schemaVersion !== 1 && shape.schemaVersion !== 2)
        invalid('unsupported window schemaVersion');
    const raw = record(shape, 'window document', ['schemaVersion', 'revision', 'instrumentInstanceId', 'ownerSessionId', 'controlWorkspaceId', 'knowledge', 'tickets', 'executions', 'operations', ...(shape.schemaVersion === 2 ? ['checkpoint', 'dedup', 'retainedOperations', 'historyActions'] : [])]);
    const checkpoint = raw.schemaVersion === 2 ? parseCheckpoint(raw.checkpoint) : null;
    const dedup = checkpoint ? array(raw.dedup, 'window dedup').map(parseDedupOperation) : [];
    const historyActions = checkpoint ? array(raw.historyActions, 'window history actions').map(parseHistoryAction) : [];
    const instance = { instrumentInstanceId: id(raw.instrumentInstanceId, 'instrumentInstanceId'),
        ownerSessionId: id(raw.ownerSessionId, 'ownerSessionId'), controlWorkspaceId: id(raw.controlWorkspaceId, 'controlWorkspaceId') };
    const docRevision = revision(raw.revision, 'window revision');
    const knowledge = parseKnowledge(raw.knowledge);
    const tickets = array(raw.tickets, 'tickets').map(parseTicket);
    const executions = array(raw.executions, 'executions').map(parseExecution);
    const ticketKeys = tickets.map(row => JSON.stringify([row.workflowId, row.localTicketId]));
    if (new Set(ticketKeys).size !== tickets.length)
        invalid('duplicate ticket lease');
    if (new Set(executions.map(row => row.leaseId)).size !== executions.length)
        invalid('duplicate execution leaseId');
    const groups = new Map();
    for (const lease of executions) {
        if (lease.instrumentInstanceId !== instance.instrumentInstanceId)
            invalid('execution belongs to another instance');
        const prior = groups.get(lease.executionId) ?? [];
        if (lease.generation !== prior.length + 1 || prior.some(row => row.state !== 'released' || !sameTicket(row, lease)))
            invalid('invalid execution generation or reassignment');
        prior.push(lease);
        groups.set(lease.executionId, prior);
    }
    const parseOperation = (value) => {
        const op = record(value, 'operation', ['operationId', 'kind', 'caller', 'fingerprint', 'runtimeId', 'revision', 'generation', 'leaseId', 'ignored']);
        if (op.kind !== 'ticket' && op.kind !== 'execution' && op.kind !== 'receipt' && op.kind !== 'knowledge')
            invalid('invalid operation kind');
        if (typeof op.fingerprint !== 'string')
            invalid('invalid operation fingerprint');
        const payload = JSON.parse(op.fingerprint);
        const parsed = op.kind === 'ticket' ? parseTicketWindowCommand(payload) : op.kind === 'execution' ? parseRequest(payload) : op.kind === 'receipt' ? parseReceipt(payload) : parseObservation(payload);
        if (JSON.stringify(parsed) !== op.fingerprint || parsed.operationId !== op.operationId)
            invalid('noncanonical operation fingerprint');
        if (op.kind === 'receipt') {
            if (op.caller !== null)
                invalid('program receipt cannot claim business caller');
        }
        else {
            if (typeof op.caller !== 'string')
                invalid('missing authenticated caller');
            const pair = array(JSON.parse(op.caller), 'operation caller');
            if (pair.length !== 2 || JSON.stringify(pair.map(entry => id(entry, 'caller identity'))) !== op.caller)
                invalid('invalid caller identity');
        }
        const result = { operationId: id(op.operationId, 'operationId'), kind: op.kind, caller: op.caller,
            fingerprint: op.fingerprint, runtimeId: op.runtimeId === null ? null : id(op.runtimeId, 'operation runtimeId'), revision: generation(op.revision), generation: op.kind === 'knowledge' ? revision(op.generation, 'knowledge generation') : generation(op.generation),
            leaseId: op.leaseId === null ? null : id(op.leaseId, 'leaseId'), ignored: boolean(op.ignored, 'ignored') };
        if (result.kind === 'ticket') {
            const command = parsed;
            const lease = tickets.find(row => sameTicket(row, command));
            if (!lease || result.generation > lease.generation || result.leaseId !== null)
                invalid('ticket operation has no matching lease');
        }
        else if (result.kind === 'knowledge') {
            if (result.generation !== 0 || result.leaseId !== null || result.ignored || result.runtimeId === null)
                invalid('invalid runtime observation operation');
        }
        else {
            const request = parsed;
            const lease = executions.find(row => row.executionId === request.executionId && row.generation === result.generation && row.leaseId === result.leaseId);
            if (!lease || (result.kind === 'execution' && !sameTicket(lease, request)))
                invalid('execution operation has no matching lease');
            if (result.kind === 'receipt') {
                const receipt = parsed;
                if (receipt.instrumentInstanceId !== instance.instrumentInstanceId || receipt.generation !== result.generation || receipt.leaseId !== result.leaseId)
                    invalid('receipt identity mismatch');
            }
        }
        return result;
    };
    const operations = array(raw.operations, 'operations').map(parseOperation);
    const retainedOperations = checkpoint ? array(raw.retainedOperations, 'retained operations').map(parseOperation) : [];
    const journal = [...operations, ...dedup, ...historyActions].sort((a, b) => a.revision - b.revision);
    if (journal.length !== docRevision || journal.some((op, index) => op.revision !== index + 1)
        || new Set(journal.map(op => op.operationId)).size !== journal.length)
        invalid('invalid operation journal revisions');
    const facts = [...operations, ...dedup];
    if (tickets.some(row => !facts.some(op => op.kind === 'ticket' && op.generation === row.generation && sameHistoryTarget(operationTarget(op), { kind: 'ticket', workflowId: row.workflowId, localTicketId: row.localTicketId })))
        || executions.some(row => !facts.some(op => op.kind === 'execution' && op.generation === row.generation && op.leaseId === row.leaseId)))
        invalid('lease is missing reservation history');
    if (checkpoint)
        validateCheckpoint(checkpoint, dedup, operations, retainedOperations, historyActions, instance, tickets, executions, docRevision);
    // Reconstruct control facts from the closed, typed journal: a tampered state
    // array cannot invent a release, discard a held ticket or fabricate capacity.
    let projectedKnowledge = checkpoint?.knowledge ?? { runtimeId: null, known: false, reason: 'runtime-not-reconciled' };
    const projectedTickets = [...(checkpoint?.tickets ?? [])];
    const projectedExecutions = [...(checkpoint?.executions ?? [])];
    for (const op of operations) {
        if (op.kind === 'ticket') {
            if (op.runtimeId !== null)
                invalid('ticket intent cannot carry program runtime identity');
            const command = parseTicketWindowCommand(JSON.parse(op.fingerprint));
            const index = projectedTickets.findIndex(row => sameTicket(row, command));
            const existing = projectedTickets[index];
            let next;
            let ignored = false;
            if (command.action === 'reserve') {
                if (existing && !existing.held)
                    invalid('released ticket reserved without reacquire');
                next = existing ?? { ...ticketIdentity({ ...command }), generation: 1, held: true };
            }
            else {
                if (!existing || command.generation > existing.generation)
                    invalid('unregistered ticket generation in history');
                ignored = command.generation < existing.generation;
                if (ignored)
                    next = existing;
                else if (command.action === 'release')
                    next = { ...existing, held: false };
                else {
                    if (existing.held)
                        invalid('reacquire of already held ticket');
                    next = { ...existing, held: true, generation: increment(existing.generation) };
                }
            }
            const resultGeneration = ignored && command.action !== 'reserve' ? command.generation : next.generation;
            if (op.ignored !== ignored || op.generation !== resultGeneration)
                invalid('ticket operation result differs from history');
            if (index === -1)
                projectedTickets.push(next);
            else
                projectedTickets[index] = next;
        }
        else if (op.kind === 'execution') {
            if (op.runtimeId === null || op.ignored)
                invalid('reservation requires trusted runtime');
            const request = parseRequest(JSON.parse(op.fingerprint));
            const existing = projectedExecutions.filter(row => row.executionId === request.executionId).at(-1);
            if (existing && !sameTicket(existing, request))
                invalid('execution assignment changed in history');
            if (!existing || existing.state === 'released') {
                const next = { instrumentInstanceId: instance.instrumentInstanceId, executionId: request.executionId,
                    generation: increment(existing?.generation ?? 0), leaseId: op.leaseId, workflowId: request.workflowId,
                    localTicketId: request.localTicketId, runtimeId: op.runtimeId, state: 'reserved' };
                if (op.generation !== next.generation)
                    invalid('reservation generation differs from history');
                projectedExecutions.push(next);
            }
            else if (op.generation !== existing.generation || op.leaseId !== existing.leaseId || existing.runtimeId !== op.runtimeId || existing.state === 'unknown')
                invalid('repeat reservation changed lease or skipped reconciliation');
        }
        else if (op.kind === 'knowledge') {
            const observation = parseObservation(JSON.parse(op.fingerprint));
            projectedKnowledge = { runtimeId: op.runtimeId, known: observation.state === 'known', reason: observation.reason };
        }
        else {
            if (op.runtimeId === null)
                invalid('receipt requires trusted runtime');
            const receipt = parseReceipt(JSON.parse(op.fingerprint));
            const index = projectedExecutions.findIndex(row => row.executionId === receipt.executionId && row.generation === receipt.generation && row.leaseId === receipt.leaseId);
            const lease = projectedExecutions[index];
            if (!lease)
                invalid('receipt precedes reservation');
            const latest = projectedExecutions.filter(row => row.executionId === receipt.executionId).at(-1);
            const ignored = latest !== lease || lease.state === 'released';
            if (op.ignored !== ignored)
                invalid('receipt ignore flag differs from history');
            if (!ignored) {
                checkTransition(lease, op.runtimeId, receipt.state);
                projectedExecutions[index] = { ...lease, runtimeId: op.runtimeId, state: receipt.state };
            }
        }
    }
    const sortedTickets = (rows) => [...rows].sort((a, b) => JSON.stringify([a.workflowId, a.localTicketId]).localeCompare(JSON.stringify([b.workflowId, b.localTicketId])));
    if (JSON.stringify(projectedKnowledge) !== JSON.stringify(knowledge)
        || JSON.stringify(sortedTickets(projectedTickets)) !== JSON.stringify(sortedTickets(tickets))
        || JSON.stringify(projectedExecutions) !== JSON.stringify(executions))
        invalid('window state differs from typed operation history');
    const current = { ...instance, revision: docRevision, knowledge, tickets, executions, operations };
    return freeze(checkpoint ? { schemaVersion: 2, ...current, checkpoint, dedup, retainedOperations, historyActions } : { schemaVersion: 1, ...current });
}
function sha256(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function parseDigest(value) {
    if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value))
        invalid('SHA-256 digest required');
    return value;
}
function checkpointState(knowledge, tickets, executions, reservationOrigins) {
    return { knowledge, tickets, executions, reservationOrigins };
}
function parseCheckpoint(value) {
    const raw = record(value, 'window checkpoint', ['throughRevision', 'knowledge', 'tickets', 'executions', 'reservationOrigins', 'stateDigest']);
    const knowledge = parseKnowledge(raw.knowledge);
    const tickets = array(raw.tickets, 'checkpoint tickets').map(parseTicket);
    const executions = array(raw.executions, 'checkpoint executions').map(parseExecution);
    const reservationOrigins = array(raw.reservationOrigins, 'reservation origins').map(value => {
        const origin = record(value, 'reservation origin', ['leaseId', 'revision']);
        return { leaseId: id(origin.leaseId, 'origin leaseId'), revision: generation(origin.revision) };
    });
    const stateDigest = parseDigest(raw.stateDigest);
    if (stateDigest !== sha256(checkpointState(knowledge, tickets, executions, reservationOrigins)))
        invalid('checkpoint state checksum differs');
    return { throughRevision: revision(raw.throughRevision, 'checkpoint throughRevision'), knowledge, tickets, executions, reservationOrigins, stateDigest };
}
function parseCaller(value, receipt = false) {
    if (receipt) {
        if (value !== null)
            invalid('receipt cannot claim business caller');
        return null;
    }
    if (typeof value !== 'string')
        invalid('authenticated caller required');
    const pair = array(JSON.parse(value), 'operation caller');
    if (pair.length !== 2 || JSON.stringify(pair.map(entry => id(entry, 'caller identity'))) !== value)
        invalid('invalid caller identity');
    return value;
}
function parseHistoryTarget(value) {
    const raw = record(value, 'window history target');
    if (raw.kind === 'knowledge') {
        record(raw, 'knowledge target', ['kind']);
        return { kind: 'knowledge' };
    }
    if (raw.kind === 'ticket') {
        record(raw, 'ticket target', ['kind', 'workflowId', 'localTicketId']);
        return { kind: 'ticket', ...ticketIdentity(raw) };
    }
    if (raw.kind === 'execution') {
        record(raw, 'execution target', ['kind', 'executionId']);
        return { kind: 'execution', executionId: id(raw.executionId, 'target executionId') };
    }
    return invalid('knowledge/ticket/execution history target required');
}
function sameHistoryTarget(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function operationTarget(op) {
    if ('target' in op)
        return op.target;
    const payload = record(JSON.parse(op.fingerprint), 'operation payload');
    return op.kind === 'knowledge' ? { kind: 'knowledge' } : op.kind === 'ticket' ? { kind: 'ticket', ...ticketIdentity(payload) } : { kind: 'execution', executionId: id(payload.executionId, 'executionId') };
}
function operationDigest(kind, caller, payload) { return sha256([kind, caller, payload]); }
function descriptor(op) {
    const { fingerprint, ...metadata } = op;
    return { ...metadata, digest: operationDigest(op.kind, op.caller, JSON.parse(fingerprint)), target: operationTarget(op) };
}
function parseDedupOperation(value) {
    const raw = record(value, 'window dedup operation', ['operationId', 'kind', 'caller', 'digest', 'runtimeId', 'revision', 'generation', 'leaseId', 'ignored', 'target']);
    if (raw.kind !== 'ticket' && raw.kind !== 'execution' && raw.kind !== 'receipt' && raw.kind !== 'knowledge')
        invalid('invalid dedup operation kind');
    const result = { operationId: id(raw.operationId, 'operationId'), kind: raw.kind, caller: parseCaller(raw.caller, raw.kind === 'receipt'),
        runtimeId: raw.runtimeId === null ? null : id(raw.runtimeId, 'runtimeId'), revision: generation(raw.revision),
        generation: raw.kind === 'knowledge' ? revision(raw.generation, 'knowledge generation') : generation(raw.generation), leaseId: raw.leaseId === null ? null : id(raw.leaseId, 'leaseId'), ignored: boolean(raw.ignored, 'ignored'), digest: parseDigest(raw.digest), target: parseHistoryTarget(raw.target) };
    if (result.kind === 'ticket') {
        if (result.target.kind !== 'ticket' || result.runtimeId !== null || result.leaseId !== null)
            invalid('ticket dedup identity differs');
    }
    else if (result.kind === 'knowledge') {
        if (result.target.kind !== 'knowledge' || result.runtimeId === null || result.leaseId !== null || result.generation !== 0 || result.ignored)
            invalid('invalid knowledge dedup');
    }
    else if (result.target.kind !== 'execution' || result.runtimeId === null || result.leaseId === null || (result.kind === 'execution' && result.ignored))
        invalid('execution dedup identity differs');
    return result;
}
function parseHistoryAction(value) {
    const raw = record(value, 'window history action', ['operationId', 'kind', 'caller', 'runtimeId', 'digest', 'revision', 'compactedThroughRevision', 'purgedOperationIds']);
    if (raw.kind !== 'compact' && raw.kind !== 'purge')
        invalid('invalid source cleanup action');
    const caller = parseCaller(raw.caller);
    const purgedOperationIds = array(raw.purgedOperationIds, 'purged operation ids').map(value => id(value, 'purged operationId'));
    const result = { operationId: id(raw.operationId, 'operationId'), kind: raw.kind, caller, runtimeId: id(raw.runtimeId, 'runtimeId'), digest: parseDigest(raw.digest),
        revision: generation(raw.revision), compactedThroughRevision: revision(raw.compactedThroughRevision, 'compacted throughRevision'), purgedOperationIds };
    if (new Set(purgedOperationIds).size !== purgedOperationIds.length || result.compactedThroughRevision >= result.revision || (result.kind === 'compact' && purgedOperationIds.length))
        invalid('invalid cleanup result');
    return result;
}
function latestOperationIds(ops) {
    const latest = new Map();
    for (const op of ops) {
        const key = JSON.stringify(operationTarget(op));
        const prior = latest.get(key);
        if (!prior || prior.revision < op.revision)
            latest.set(key, op);
    }
    return new Set([...latest.values()].map(op => op.operationId));
}
function validateCheckpoint(checkpoint, dedup, operations, retained, actions, instance, tickets, executions, docRevision) {
    const cut = checkpoint.throughRevision;
    if (cut > docRevision || dedup.some(op => op.revision > cut) || operations.some(op => op.revision <= cut))
        invalid('operation lies outside checkpoint/tail cut');
    if (cut === 0 && (checkpoint.tickets.length || checkpoint.executions.length || checkpoint.reservationOrigins.length || JSON.stringify(checkpoint.knowledge) !== JSON.stringify({ runtimeId: null, known: false, reason: 'runtime-not-reconciled' })))
        invalid('zero checkpoint cannot invent state');
    if (new Set(checkpoint.tickets.map(row => JSON.stringify([row.workflowId, row.localTicketId]))).size !== checkpoint.tickets.length
        || new Set(checkpoint.executions.map(row => row.leaseId)).size !== checkpoint.executions.length)
        invalid('duplicate checkpoint lease');
    for (const row of checkpoint.tickets)
        if (!tickets.some(current => sameTicket(current, row) && current.generation >= row.generation)
            || !dedup.some(op => op.kind === 'ticket' && op.generation === row.generation && sameHistoryTarget(op.target, { kind: 'ticket', workflowId: row.workflowId, localTicketId: row.localTicketId })))
            invalid('checkpoint ticket lacks matching fencing history');
    const groups = new Map();
    for (const row of checkpoint.executions) {
        const previous = groups.get(row.executionId) ?? [];
        if (row.instrumentInstanceId !== instance.instrumentInstanceId || row.generation !== previous.length + 1 || previous.some(prior => prior.state !== 'released' || !sameTicket(prior, row))
            || !executions.some(current => current.leaseId === row.leaseId && current.executionId === row.executionId && current.generation === row.generation && sameTicket(current, row)))
            invalid('invalid checkpoint execution generations');
        previous.push(row);
        groups.set(row.executionId, previous);
    }
    if (checkpoint.reservationOrigins.length !== checkpoint.executions.length || new Set(checkpoint.reservationOrigins.map(row => row.leaseId)).size !== checkpoint.reservationOrigins.length)
        invalid('reservation origins must cover every checkpoint lease');
    for (const origin of checkpoint.reservationOrigins) {
        const lease = checkpoint.executions.find(row => row.leaseId === origin.leaseId);
        const first = [...dedup].sort((a, b) => a.revision - b.revision).find(op => op.kind === 'execution' && op.leaseId === origin.leaseId);
        if (!lease || !first || origin.revision !== first.revision || first.generation !== lease.generation || first.target.kind !== 'execution' || first.target.executionId !== lease.executionId)
            invalid('reservation origin differs from first operation');
    }
    for (const op of dedup) {
        if (op.target.kind === 'ticket' && !checkpoint.tickets.some(row => op.target.kind === 'ticket' && sameTicket(row, op.target) && row.generation >= op.generation))
            invalid('ticket dedup lacks checkpoint identity');
        if (op.target.kind === 'execution' && !checkpoint.executions.some(row => op.target.kind === 'execution' && row.executionId === op.target.executionId && row.generation === op.generation && row.leaseId === op.leaseId))
            invalid('execution dedup lacks checkpoint token');
    }
    if (new Set(retained.map(op => op.operationId)).size !== retained.length)
        invalid('duplicate retained operation body');
    const purgedIds = actions.flatMap(action => action.purgedOperationIds);
    const purged = new Set(purgedIds);
    if (purged.size !== purgedIds.length)
        invalid('historical body cannot have multiple deletion receipts');
    for (const action of actions) {
        if (!action.purgedOperationIds.length)
            continue;
        const baseBodies = latestOperationIds(dedup.filter(row => row.revision <= action.compactedThroughRevision));
        const thenCurrentBodies = latestOperationIds([...dedup, ...operations].filter(row => row.revision < action.revision));
        for (const operationId of action.purgedOperationIds) {
            const op = dedup.find(row => row.operationId === operationId);
            if (!op || op.revision > action.compactedThroughRevision)
                invalid('purge receipt lacks a tombstone within its checkpoint cut');
            if (baseBodies.has(operationId) || thenCurrentBodies.has(operationId))
                invalid('purge receipt claims a then-current operation body');
        }
    }
    for (const op of retained) {
        const matching = dedup.find(row => row.operationId === op.operationId);
        if (!matching || JSON.stringify(descriptor(op)) !== JSON.stringify(matching) || purged.has(op.operationId))
            invalid('retained body differs from dedup or was purged');
    }
    for (const op of dedup)
        if (!purged.has(op.operationId) && !retained.some(row => row.operationId === op.operationId))
            invalid('historical operation body missing without purge receipt');
    const currentBodies = latestOperationIds([...dedup, ...operations]);
    for (const op of dedup)
        if (currentBodies.has(op.operationId) && !retained.some(row => row.operationId === op.operationId))
            invalid('current operation body cannot be purged');
}
function parseCompactRequest(value) {
    const raw = record(value, 'window compact request', ['operationId', 'expectedRevision']);
    return freeze({ operationId: id(raw.operationId, 'operationId'), expectedRevision: revision(raw.expectedRevision, 'expectedRevision') });
}
function parsePurgeRequest(value) {
    const raw = record(value, 'window purge request', ['operationId', 'expectedRevision', 'throughRevision', 'targets']);
    const targets = array(raw.targets, 'source purge targets').map(parseHistoryTarget).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    if (!targets.length || new Set(targets.map(target => JSON.stringify(target))).size !== targets.length)
        invalid('explicit distinct source purge targets required');
    return freeze({ operationId: id(raw.operationId, 'operationId'), expectedRevision: revision(raw.expectedRevision, 'expectedRevision'), throughRevision: revision(raw.throughRevision, 'throughRevision'), targets });
}
function reservationOrigin(document, leaseId) {
    const checkpointOrigin = document.schemaVersion === 2 ? document.checkpoint.reservationOrigins.find(row => row.leaseId === leaseId) : undefined;
    const origin = checkpointOrigin?.revision ?? document.operations.find(op => op.kind === 'execution' && op.leaseId === leaseId)?.revision;
    if (origin === undefined)
        invalid('execution has no reservation origin');
    return origin;
}
function materializeCheckpoint(document) {
    const materialized = checkpointState(document.knowledge, document.tickets, document.executions, document.executions.map(lease => ({ leaseId: lease.leaseId, revision: reservationOrigin(document, lease.leaseId) })));
    return { throughRevision: document.revision, ...materialized, stateDigest: sha256(materialized) };
}
export function parseWindowDocument(value) {
    try {
        return parseDocument(value);
    }
    catch (error) {
        if (error instanceof ControlsError && error.code !== 'invalid-input' && error.code !== 'operation-conflict')
            throw error;
        throw new ControlsError('invalid-state', 'invalid persisted window document: ' + (error instanceof Error ? error.message : String(error)));
    }
}
export function initialWindowDocument(instance) {
    return parseWindowDocument({ schemaVersion: 1, ...instance, revision: 0, knowledge: { runtimeId: null, known: false, reason: 'runtime-not-reconciled' }, tickets: [], executions: [], operations: [] });
}
function parserFor(instanceId) {
    return value => {
        const parsed = memoized(value, parseWindowDocument);
        if (parsed.instrumentInstanceId !== instanceId)
            throw new ControlsError('association-conflict', 'window row and document identities differ');
        return parsed;
    };
}
/** Explicit non-durable helper, NEVER a fallback for storage errors. */
export class MemoryWindowStorage {
    #rows = new Map();
    #row(instanceId) {
        id(instanceId, 'instrumentInstanceId');
        let row = this.#rows.get(instanceId);
        if (!row) {
            row = new MemoryVersionedStorage(parserFor(instanceId));
            this.#rows.set(instanceId, row);
        }
        return row;
    }
    read(instanceId) { return this.#row(instanceId).read(); }
    compareAndSwap(instanceId, expectedRevision, next) {
        return this.#row(instanceId).compareAndSwap(expectedRevision, next);
    }
}
const domainAdapters = new WeakMap();
/** Dedicated SINGLE-TABLE domain/handle. No cross-process or sibling-table CAS. */
export function createDomainWindowStorage(table) {
    const prior = domainAdapters.get(table);
    if (prior)
        return prior;
    const rows = new Map();
    const row = (instanceId) => {
        id(instanceId, 'instrumentInstanceId');
        let storage = rows.get(instanceId);
        if (!storage) {
            storage = createDomainVersionedStorage(table, instanceId, parserFor(instanceId));
            rows.set(instanceId, storage);
        }
        return storage;
    };
    const storage = { read: instanceId => row(instanceId).read(),
        compareAndSwap: (instanceId, expectedRevision, next) => row(instanceId).compareAndSwap(expectedRevision, next) };
    domainAdapters.set(table, storage);
    return storage;
}
function parseScope(value) {
    const raw = record(value, 'window scope');
    if (raw.kind === 'coordinator') {
        record(raw, 'coordinator scope', ['kind']);
        return freeze({ kind: 'coordinator' });
    }
    record(raw, 'assignment scope', ['kind', 'workflowId', 'ticketIds']);
    if (raw.kind !== 'assigned')
        invalid('trusted coordinator/assignment scope required');
    const ticketIds = array(raw.ticketIds, 'assigned ticketIds').map(entry => id(entry, 'assigned ticketId'));
    if (new Set(ticketIds).size !== ticketIds.length)
        invalid('duplicate assigned ticketId');
    const workflowId = raw.workflowId === null ? null : id(raw.workflowId, 'assigned workflowId');
    if (workflowId === null && ticketIds.length !== 0)
        invalid('workflowless assignment cannot grant ticket permissions');
    return freeze({ kind: 'assigned', workflowId, ticketIds });
}
function allowed(scope, value) {
    return scope.kind === 'coordinator' || (scope.workflowId === value.workflowId && (value.localTicketId === null || scope.ticketIds.includes(value.localTicketId)));
}
function checkScope(scope, value) {
    if (!allowed(scope, value))
        throw new ControlsError('access-denied', 'ticket/execution is outside trusted assignment');
}
function token(lease) {
    return { instrumentInstanceId: lease.instrumentInstanceId, executionId: lease.executionId, generation: lease.generation, leaseId: lease.leaseId };
}
/** Two-operation BUSINESS interface. All S mutations live in private closures. */
export class SessionWindows {
    #runtimeId;
    #capability;
    #requireKnownRuntime;
    #newLeaseId;
    #controls;
    #storage;
    #authority;
    constructor(controls, storage, authority, options) {
        this.#controls = controls;
        this.#storage = storage;
        this.#authority = authority;
        this.#runtimeId = id(options.runtimeId, 'runtimeId');
        if (options.capability !== 'unsupported' && options.capability !== 'cooperative')
            invalid('declare unsupported/cooperative host capability');
        this.#requireKnownRuntime = options.requireKnownRuntime === undefined ? false : boolean(options.requireKnownRuntime, 'requireKnownRuntime');
        this.#capability = options.capability;
        this.#newLeaseId = options.newLeaseId ?? randomUUID;
        options.bindProgram(Object.freeze({ reserveExecution: (principal, sessionId, request) => this.#reserve(principal, sessionId, request),
            receipt: (receipt) => this.#receipt(receipt),
            reconcileKnowledge: (principal, sessionId, observation) => this.#knowledge(principal, sessionId, observation),
            compactHistory: (principal, sessionId, request, signal) => this.#compact(principal, sessionId, request, signal),
            purgeHistory: (principal, sessionId, request, signal) => this.#purge(principal, sessionId, request, signal) }));
    }
    async read(principal, sessionId) {
        const context = await this.#context(principal, sessionId, 'read');
        return this.#snapshot(await this.#load(context.controls.instance), context);
    }
    async apply(principal, sessionId, input) {
        const command = parseTicketWindowCommand(input);
        for (let attempt = 0; attempt < 32; attempt += 1) {
            const context = await this.#context(principal, sessionId, 'write');
            checkScope(context.scope, command);
            const current = await this.#load(context.controls.instance);
            const prior = this.#prior(current, 'ticket', context.caller, command);
            if (prior)
                return freeze({ appliedRevision: prior.revision, replayed: true, ignored: prior.ignored, generation: prior.generation, snapshot: this.#snapshot(current, context) });
            const existing = current.tickets.find(row => sameTicket(row, command));
            let nextLease;
            let ignored = false;
            if (command.action === 'reserve') {
                if (existing && !existing.held)
                    throw new ControlsError('operation-conflict', 'released ticket requires explicit reacquire');
                if (!existing)
                    this.#admit(context, 'T');
                nextLease = existing ?? { ...ticketIdentity({ ...command }), generation: 1, held: true };
            }
            else {
                if (!existing || command.generation > existing.generation)
                    throw new ControlsError('association-conflict', 'ticket generation is not registered');
                if (command.generation < existing.generation) {
                    nextLease = existing;
                    ignored = true;
                }
                else if (command.action === 'release')
                    nextLease = { ...existing, held: false };
                else {
                    if (existing.held)
                        throw new ControlsError('operation-conflict', 'reacquire requires a released ticket generation');
                    this.#admit(context, 'T');
                    nextLease = { ...existing, held: true, generation: increment(existing.generation) };
                }
            }
            const op = this.#operation(current, 'ticket', context.caller, command, ignored ? command.action === 'reserve' ? nextLease.generation : command.generation : nextLease.generation, null, ignored);
            const next = parseWindowDocument({ ...current, revision: op.revision, tickets: [...current.tickets.filter(row => !sameTicket(row, command)), nextLease], operations: [...current.operations, op] });
            if (await this.#storage.compareAndSwap(current.instrumentInstanceId, current.revision, next))
                return freeze({ appliedRevision: op.revision, replayed: false, ignored, generation: op.generation, snapshot: this.#snapshot(next, context) });
        }
        return this.#contention();
    }
    async #reserve(principal, sessionId, input) {
        const request = parseRequest(input);
        const leaseId = id(this.#newLeaseId(), 'new leaseId');
        for (let attempt = 0; attempt < 32; attempt += 1) {
            const context = await this.#context(principal, sessionId, 'write');
            checkScope(context.scope, request);
            const current = await this.#load(context.controls.instance);
            const prior = this.#prior(current, 'execution', context.caller, request);
            if (prior) {
                const lease = current.executions.find(row => row.leaseId === prior.leaseId);
                return this.#reservation(current, context, lease, prior.revision, true);
            }
            const history = current.executions.filter(row => row.executionId === request.executionId);
            const latest = history.at(-1);
            if (latest && !sameTicket(latest, request))
                throw new ControlsError('association-conflict', 'execution cannot be relabeled as another ticket or ticketless');
            let lease = latest;
            if (!lease || lease.state === 'released') {
                this.#admit(context, 'S');
                if (current.executions.some(row => row.leaseId === leaseId))
                    throw new ControlsError('association-conflict', 'new leaseId is not unique');
                lease = { instrumentInstanceId: current.instrumentInstanceId, executionId: request.executionId, generation: increment(latest?.generation ?? 0), leaseId,
                    workflowId: request.workflowId, localTicketId: request.localTicketId, runtimeId: this.#runtimeId, state: 'reserved' };
            }
            else if (lease.runtimeId !== this.#runtimeId || lease.state === 'unknown')
                throw new ControlsError('association-conflict', 'execution needs trusted reconciliation before dispatch');
            const op = this.#operation(current, 'execution', context.caller, request, lease.generation, lease.leaseId, false);
            const next = parseWindowDocument({ ...current, revision: op.revision, executions: current.executions.includes(lease) ? current.executions : [...current.executions, lease], operations: [...current.operations, op] });
            if (await this.#storage.compareAndSwap(current.instrumentInstanceId, current.revision, next))
                return this.#reservation(next, context, lease, op.revision, false);
        }
        return this.#contention();
    }
    async #receipt(input) {
        const receipt = parseReceipt(input);
        for (let attempt = 0; attempt < 32; attempt += 1) {
            const raw = await this.#storage.read(receipt.instrumentInstanceId);
            if (raw === undefined)
                throw new ControlsError('association-conflict', 'receipt instance has no execution ledger');
            const current = parserFor(receipt.instrumentInstanceId)(raw);
            const prior = this.#prior(current, 'receipt', null, receipt);
            if (prior)
                return freeze({ appliedRevision: prior.revision, replayed: true, ignored: prior.ignored });
            const lease = current.executions.find(row => row.executionId === receipt.executionId && row.generation === receipt.generation && row.leaseId === receipt.leaseId);
            if (!lease)
                throw new ControlsError('association-conflict', 'receipt does not match instance/execution/generation/lease');
            const latest = current.executions.filter(row => row.executionId === receipt.executionId).at(-1);
            const ignored = latest !== lease || lease.state === 'released';
            if (!ignored)
                checkTransition(lease, this.#runtimeId, receipt.state);
            const op = this.#operation(current, 'receipt', null, receipt, receipt.generation, receipt.leaseId, ignored);
            const next = parseWindowDocument({ ...current, revision: op.revision, executions: current.executions.map(row => row === lease && !ignored ? { ...row, state: receipt.state, runtimeId: this.#runtimeId } : row), operations: [...current.operations, op] });
            if (await this.#storage.compareAndSwap(current.instrumentInstanceId, current.revision, next))
                return freeze({ appliedRevision: op.revision, replayed: false, ignored });
        }
        return this.#contention();
    }
    async #knowledge(principal, sessionId, input) {
        const observation = parseObservation(input);
        for (let attempt = 0; attempt < 32; attempt += 1) {
            const context = await this.#context(principal, sessionId, 'write');
            if (context.scope.kind !== 'coordinator')
                throw new ControlsError('access-denied', 'runtime observation requires trusted owner coordinator scope');
            const current = await this.#load(context.controls.instance);
            const prior = this.#prior(current, 'knowledge', context.caller, observation);
            if (prior)
                return freeze({ appliedRevision: prior.revision, replayed: true, ignored: false });
            const op = this.#operation(current, 'knowledge', context.caller, observation, 0, null, false);
            const next = parseWindowDocument({ ...current, revision: op.revision,
                knowledge: { runtimeId: this.#runtimeId, known: observation.state === 'known', reason: observation.reason }, operations: [...current.operations, op] });
            if (await this.#storage.compareAndSwap(current.instrumentInstanceId, current.revision, next))
                return freeze({ appliedRevision: op.revision, replayed: false, ignored: false });
        }
        return this.#contention();
    }
    async #compact(principal, sessionId, input, signal) {
        signal?.throwIfAborted();
        const request = parseCompactRequest(input);
        for (let attempt = 0; attempt < 32; attempt += 1) {
            const context = await this.#historyContext(principal, sessionId, signal);
            signal?.throwIfAborted();
            const current = await this.#load(context.controls.instance, signal);
            signal?.throwIfAborted();
            const prior = this.#historyPrior(current, 'compact', context.caller, request);
            if (prior)
                return this.#historyResult(prior, true);
            if (request.expectedRevision !== current.revision)
                throw new ControlsError('revision-conflict', 'window source changed before compaction');
            const action = { operationId: request.operationId, kind: 'compact', caller: context.caller, runtimeId: this.#runtimeId,
                digest: operationDigest('compact', context.caller, request), revision: increment(current.revision), compactedThroughRevision: current.revision, purgedOperationIds: [] };
            const next = parseWindowDocument({ ...current, schemaVersion: 2, revision: action.revision, checkpoint: materializeCheckpoint(current), operations: [],
                dedup: [...(current.schemaVersion === 2 ? current.dedup : []), ...current.operations.map(descriptor)],
                retainedOperations: [...(current.schemaVersion === 2 ? current.retainedOperations : []), ...current.operations],
                historyActions: [...(current.schemaVersion === 2 ? current.historyActions : []), action] });
            signal?.throwIfAborted();
            const committed = await this.#storage.compareAndSwap(current.instrumentInstanceId, current.revision, next);
            if (committed)
                return this.#historyResult(action, false);
            signal?.throwIfAborted(); // A refused CAS may not be retried after cancellation.
        }
        return this.#contention();
    }
    async #purge(principal, sessionId, input, signal) {
        signal?.throwIfAborted();
        const request = parsePurgeRequest(input);
        for (let attempt = 0; attempt < 32; attempt += 1) {
            const context = await this.#historyContext(principal, sessionId, signal);
            signal?.throwIfAborted();
            const current = await this.#load(context.controls.instance, signal);
            signal?.throwIfAborted();
            const prior = this.#historyPrior(current, 'purge', context.caller, request);
            if (prior)
                return this.#historyResult(prior, true);
            if (request.expectedRevision !== current.revision)
                throw new ControlsError('revision-conflict', 'window source changed before purge');
            if (current.schemaVersion !== 2 || request.throughRevision > current.checkpoint.throughRevision)
                invalid('compact source through the requested purge revision first');
            // The current checkpoint base and newest tail body are necessary state,
            // not history-only bodies. A later explicit compact can supersede the base.
            const protectedIds = new Set([...latestOperationIds(current.dedup), ...latestOperationIds([...current.dedup, ...current.operations])]);
            const purgedOperationIds = current.retainedOperations.filter(op => op.revision <= request.throughRevision && !protectedIds.has(op.operationId)
                && request.targets.some(target => sameHistoryTarget(target, operationTarget(op)))).map(op => op.operationId);
            const action = { operationId: request.operationId, kind: 'purge', caller: context.caller, runtimeId: this.#runtimeId,
                digest: operationDigest('purge', context.caller, request), revision: increment(current.revision), compactedThroughRevision: current.checkpoint.throughRevision, purgedOperationIds };
            const next = parseWindowDocument({ ...current, revision: action.revision,
                retainedOperations: current.retainedOperations.filter(op => !purgedOperationIds.includes(op.operationId)), historyActions: [...current.historyActions, action] });
            signal?.throwIfAborted();
            const committed = await this.#storage.compareAndSwap(current.instrumentInstanceId, current.revision, next);
            if (committed)
                return this.#historyResult(action, false);
            signal?.throwIfAborted(); // A refused CAS may not be retried after cancellation.
        }
        return this.#contention();
    }
    async #historyContext(principal, sessionId, signal) {
        signal?.throwIfAborted();
        const context = await this.#context(principal, sessionId, 'write', signal);
        signal?.throwIfAborted();
        if (context.scope.kind !== 'coordinator' || sessionId !== context.controls.instance.ownerSessionId)
            throw new ControlsError('access-denied', 'source cleanup requires actual owner coordinator scope');
        return context;
    }
    #historyPrior(document, kind, caller, request) {
        if (document.operations.some(op => op.operationId === request.operationId) || (document.schemaVersion === 2 && document.dedup.some(op => op.operationId === request.operationId)))
            throw new ControlsError('operation-conflict', 'cleanup operationId belongs to data operation');
        const prior = document.schemaVersion === 2 ? document.historyActions.find(op => op.operationId === request.operationId) : undefined;
        if (prior && (prior.kind !== kind || prior.caller !== caller || prior.digest !== operationDigest(kind, caller, request)))
            throw new ControlsError('operation-conflict', 'cleanup operationId belongs to another caller or payload');
        return prior;
    }
    #historyResult(action, replayed) {
        return freeze({ appliedRevision: action.revision, replayed, compactedThroughRevision: action.compactedThroughRevision, purgedOperationIds: action.purgedOperationIds });
    }
    async #context(principal, sessionId, access, signal) {
        signal?.throwIfAborted();
        const actor = id(principal, 'principal');
        const session = id(sessionId, 'sessionId');
        const controls = await this.#controls.readSession(actor, session);
        signal?.throwIfAborted();
        const resolved = await this.#authority.resolveAccess(actor, session, controls.instance, access);
        signal?.throwIfAborted();
        const raw = record(resolved, 'window access', ['author', 'scope']);
        const author = parseAuthor(raw.author);
        if (author.principalId !== actor || (author.kind === 'agent' && author.sessionId !== session))
            throw new ControlsError('access-denied', 'trusted author differs from authenticated caller');
        return { controls, scope: parseScope(raw.scope), caller: JSON.stringify([actor, session]) };
    }
    async #load(instance, signal) {
        signal?.throwIfAborted();
        const raw = await this.#storage.read(instance.instrumentInstanceId);
        signal?.throwIfAborted();
        const document = raw === undefined ? initialWindowDocument(instance) : parserFor(instance.instrumentInstanceId)(raw);
        if (document.ownerSessionId !== instance.ownerSessionId || document.controlWorkspaceId !== instance.controlWorkspaceId)
            throw new ControlsError('association-conflict', 'window owner/control workspace differs from trusted controls');
        return document;
    }
    #prior(document, kind, caller, payload) {
        if (document.schemaVersion === 2 && document.historyActions.some(op => op.operationId === payload.operationId))
            throw new ControlsError('operation-conflict', 'operationId belongs to source cleanup');
        const prior = document.operations.find(op => op.operationId === payload.operationId) ?? (document.schemaVersion === 2 ? document.dedup.find(op => op.operationId === payload.operationId) : undefined);
        if (prior && (prior.kind !== kind || prior.caller !== caller || ('digest' in prior ? prior.digest !== operationDigest(kind, caller, payload) : prior.fingerprint !== JSON.stringify(payload))))
            throw new ControlsError('operation-conflict', 'operationId belongs to another caller or payload');
        return prior;
    }
    #operation(document, kind, caller, payload, gen, leaseId, ignored) {
        return { operationId: payload.operationId, kind, caller, fingerprint: JSON.stringify(payload), runtimeId: kind === 'ticket' ? null : this.#runtimeId, revision: increment(document.revision), generation: gen, leaseId, ignored };
    }
    #admit(context, axis) {
        const policy = context.controls.policy;
        const feature = policy.features.windows;
        if (axis === 'T') {
            // T is model-declared business bookkeeping, not proof of native S facts.
            if (feature.status === 'disabled')
                throw new ControlsError('feature-disabled', 'new ticket reservations disabled; existing releases remain available');
            if (!policy.workspaceVerified)
                throw new ControlsError('feature-disabled', 'ticket window workspace unverified');
            return;
        }
        if (feature.status === 'disabled')
            return; // off never clears registered execution facts or knowledge
        if (!policy.workspaceVerified)
            throw new ControlsError('feature-disabled', 'execution window workspace unverified');
    }
    #reservation(document, context, lease, appliedRevision, replayed) {
        const snapshot = this.#snapshot(document, context);
        const dispatchable = !replayed && reservationOrigin(document, lease.leaseId) === appliedRevision
            && context.controls.policy.workspaceVerified && lease.runtimeId === this.#runtimeId && lease.state === 'reserved';
        return freeze({ appliedRevision, replayed, dispatchable, token: token(lease), snapshot });
    }
    #snapshot(document, context) {
        const policy = context.controls.policy;
        const feature = policy.features.windows;
        const executions = document.executions.map(row => ({ ...row,
            state: row.state !== 'released' && row.runtimeId !== this.#runtimeId ? 'unknown' : row.state,
            ticketApplicable: row.localTicketId !== null, ticketReason: row.localTicketId === null ? 'no-ticket-assignment' : null }));
        const byState = Object.fromEntries(STATES.map(value => [value, executions.filter(row => row.state === value).length]));
        const knowledgeUnknown = document.knowledge.runtimeId === null ? this.#requireKnownRuntime : document.knowledge.runtimeId !== this.#runtimeId || !document.knowledge.known;
        const runtimeKnowledge = this.#capability === 'unsupported'
            ? { runtimeId: document.knowledge.runtimeId, known: false, reason: 'host-observation-unsupported' }
            : knowledgeUnknown ? { runtimeId: document.knowledge.runtimeId, known: false, reason: document.knowledge.runtimeId === this.#runtimeId ? document.knowledge.reason : 'runtime-not-reconciled' } : document.knowledge;
        const unknown = byState.unknown > 0 || knowledgeUnknown;
        const ticketConfigured = policy.extensionEnabled && feature.requested && policy.workspaceVerified && policy.windows.ticketWindowSize !== null;
        const usage = (capacity, used, configured) => ({ capacity, used,
            available: !configured || capacity === null ? null : Math.max(0, capacity - used),
            overcommitted: capacity !== null && used > capacity,
            overage: capacity === null ? null : Math.max(0, used - capacity),
            gap: capacity === null ? null : capacity - used });
        const T = usage(policy.windows.ticketWindowSize, document.tickets.filter(row => row.held).length, ticketConfigured);
        const S = { ...usage(policy.windows.runningSubagentLimit, executions.filter(row => row.state !== 'released').length, policy.extensionEnabled && feature.requested && policy.workspaceVerified && policy.windows.runningSubagentLimit !== null),
            countKnown: runtimeKnowledge.known && byState.unknown === 0, byState };
        const status = unknown ? 'reconciling' : feature.status === 'disabled' ? 'disabled' : feature.status === 'unsupported' || this.#capability === 'unsupported' ? 'unsupported' : T.overcommitted || S.overcommitted ? 'overcommitted' : 'ready';
        return freeze({ instance: { instrumentInstanceId: document.instrumentInstanceId, ownerSessionId: document.ownerSessionId, controlWorkspaceId: document.controlWorkspaceId },
            revision: document.revision, configurationRevision: policy.configurationRevision, capability: this.#capability, status,
            reason: unknown ? (knowledgeUnknown ? runtimeKnowledge.reason : 'execution-reconciliation-required') : this.#capability === 'unsupported' ? 'host-admission-unsupported' : feature.reason,
            scope: context.scope, runtimeKnowledge, tickets: document.tickets.filter(row => allowed(context.scope, row)), executions: executions.filter(row => allowed(context.scope, row)), T, S });
    }
    #contention() { throw new ControlsError('concurrent-update', 'window changed repeatedly; retry against durable state'); }
}
