import { array, boolean, ControlsError, freeze, id, record, revision } from './validation.js';
export const INITIAL_RUNTIME_DOCUMENT = freeze({ schemaVersion: 1, revision: 0, assignments: [], bindings: [], notifications: [] });
export function parseRuntimeDocument(value) {
    try {
        const r = record(value, 'runtime bindings', ['schemaVersion', 'revision', 'assignments', 'bindings', 'notifications']);
        if (r.schemaVersion !== 1)
            throw new ControlsError('invalid-state', 'unsupported runtime binding schema');
        const assignments = array(r.assignments, 'assignments').map(value => {
            const a = record(value, 'assignment', ['sessionId', 'parentSessionId', 'instrumentInstanceId', 'workflowId', 'ticketIds']);
            const workflowId = a.workflowId === null ? null : id(a.workflowId, 'workflowId');
            const ticketIds = array(a.ticketIds, 'ticketIds').map(value => id(value, 'ticketId'));
            if (new Set(ticketIds).size !== ticketIds.length || workflowId === null && ticketIds.length > 0)
                throw new ControlsError('invalid-state', 'invalid task permission set');
            return { sessionId: id(a.sessionId, 'sessionId'), parentSessionId: id(a.parentSessionId, 'parentSessionId'), instrumentInstanceId: id(a.instrumentInstanceId, 'instrumentInstanceId'), workflowId, ticketIds };
        });
        const bindings = array(r.bindings, 'bindings').map(value => {
            const b = record(value, 'binding', ['sessionId', 'parentSessionId', 'instrumentInstanceId', 'executionId', 'generation', 'leaseId', 'runtimeId', 'released']);
            const generation = revision(b.generation, 'generation');
            if (generation < 1)
                throw new ControlsError('invalid-state', 'binding generation must be positive');
            return { sessionId: id(b.sessionId, 'sessionId'), parentSessionId: id(b.parentSessionId, 'parentSessionId'), instrumentInstanceId: id(b.instrumentInstanceId, 'instrumentInstanceId'), executionId: id(b.executionId, 'executionId'), generation, leaseId: id(b.leaseId, 'leaseId'), runtimeId: id(b.runtimeId, 'runtimeId'), released: boolean(b.released, 'released') };
        });
        if (new Set(assignments.map(a => a.sessionId)).size !== assignments.length || new Set(bindings.map(b => b.leaseId)).size !== bindings.length)
            throw new ControlsError('invalid-state', 'duplicate task/execution binding');
        for (const b of bindings) {
            const a = assignments.find(a => a.sessionId === b.sessionId);
            if (!a || a.instrumentInstanceId !== b.instrumentInstanceId || a.parentSessionId !== b.parentSessionId)
                throw new ControlsError('invalid-state', 'execution binding has no matching task identity');
        }
        const notifications = array(r.notifications ?? [], 'notifications').map((value) => {
            const n = record(value, 'owner notification', ['notificationId', 'instrumentInstanceId', 'ownerSessionId', 'businessRevision', 'authorPrincipalId', 'state', 'messageId']);
            if (n.state !== 'pending' && n.state !== 'accepted' && n.state !== 'consumed')
                throw new ControlsError('invalid-state', 'invalid notification state');
            const messageId = n.messageId === null ? null : id(n.messageId, 'messageId');
            if (n.state !== 'pending' && messageId === null)
                throw new ControlsError('invalid-state', 'accepted/consumed notification requires program message identity');
            return { notificationId: id(n.notificationId, 'notificationId'), instrumentInstanceId: id(n.instrumentInstanceId, 'notification instance'), ownerSessionId: id(n.ownerSessionId, 'notification owner'), businessRevision: revision(n.businessRevision, 'businessRevision'), authorPrincipalId: id(n.authorPrincipalId, 'notification author'), state: n.state, messageId };
        });
        if (new Set(notifications.map(n => n.notificationId)).size !== notifications.length)
            throw new ControlsError('invalid-state', 'duplicate notification identity');
        return freeze({ schemaVersion: 1, revision: revision(r.revision, 'runtime revision'), assignments, bindings, notifications });
    }
    catch (error) {
        if (error instanceof ControlsError && error.code === 'invalid-state')
            throw error;
        throw new ControlsError('invalid-state', 'invalid durable runtime binding document: ' + String(error));
    }
}
