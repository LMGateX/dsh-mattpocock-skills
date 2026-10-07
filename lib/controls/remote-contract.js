import { parseStartupDesired, parseStartupStatus } from './startup-state.js';
import { parsePolicyIntent, parsePolicySnapshot } from './policy.js';
import { parseInstrumentCommand } from './instrument-state.js';
import { array, boolean, freeze, id, invalid, record, revision } from './validation.js';
/** Shared by Host and Client; no Host SDK or Node imports enter the browser. */
export const REMOTE_NAMESPACE = 'mattpocockControls';
export const REMOTE_METHODS = ['readPolicy', 'savePolicy', 'listWorkspaces', 'readSession', 'applyInstrument', 'applyTicketWindow', 'resourceAction', 'grantPolicy', 'historyAction', 'worktreeAction', 'startupStatus', 'saveStartupSettings'];
/** A complete lossless JSON boundary, not JSON.stringify-based repair. */
export function parseHostJson(value) {
    const ancestors = new Set();
    const visit = (input, depth) => {
        if (depth > 128)
            invalid('remote JSON exceeds maximum depth');
        if (input === null || typeof input === 'string' || typeof input === 'boolean')
            return input;
        if (typeof input === 'number') {
            if (!Number.isFinite(input) || Object.is(input, -0))
                invalid('remote number must be lossless JSON');
            return input;
        }
        if (typeof input !== 'object' || input === null)
            invalid('remote value must be JSON data');
        if (ancestors.has(input))
            invalid('remote JSON must not cycle');
        ancestors.add(input);
        try {
            if (Array.isArray(input))
                return array(input, 'remote array').map(entry => visit(entry, depth + 1));
            const raw = record(input, 'remote object');
            return Object.fromEntries(Object.entries(raw).map(([key, entry]) => [key, visit(entry, depth + 1)]));
        }
        finally {
            ancestors.delete(input);
        }
    };
    return freeze(visit(value, 0));
}
export function parsePolicyGrants(value) {
    const raw = record(value, 'policy grants', ['schemaVersion', 'revision', 'grants']);
    if (raw.schemaVersion !== 1)
        invalid('unsupported policy grant version');
    const grants = array(raw.grants, 'policy grants').map(value => {
        const row = record(value, 'policy grant', ['sessionId', 'enabled']);
        return { sessionId: id(row.sessionId, 'grant sessionId'), enabled: boolean(row.enabled, 'grant enabled') };
    });
    if (new Set(grants.map(row => row.sessionId)).size !== grants.length)
        invalid('duplicate policy grant');
    return freeze({ schemaVersion: 1, revision: revision(raw.revision, 'grant revision'), grants });
}
/** Browser-safe equivalent of the window business command boundary, never execution receipts. */
export function parseRemoteTicketWindow(value) {
    const r = record(value, 'ticket window command');
    if (r.action !== 'reserve' && r.action !== 'release' && r.action !== 'reacquire')
        invalid('ticket window commands must declare action "reserve", "release" or "reacquire"; there is no read action');
    record(r, 'ticket window command', ['action', 'operationId', 'workflowId', 'localTicketId', ...(r.action === 'reserve' ? [] : ['generation'])]);
    const base = { operationId: id(r.operationId, 'operationId'), workflowId: id(r.workflowId, 'workflowId'), localTicketId: id(r.localTicketId, 'localTicketId') };
    if (r.action === 'reserve')
        return freeze({ ...base, action: 'reserve' });
    const generation = revision(r.generation, 'generation');
    if (generation < 1)
        invalid('generation must be positive');
    return freeze({ ...base, action: r.action, generation });
}
export function parseResourceAction(value) {
    const raw = record(parseHostJson(value), 'resource action');
    const target = () => id(raw.resourceId, 'resourceId');
    const text = (value, where) => { if (typeof value !== 'string' || value.length > 16384 || value.includes('\0'))
        invalid(where + ' must be bounded text'); return value; };
    const absolute = (value) => { const path = text(value, 'resource path'); if (!(path.startsWith('/') || /^[A-Za-z]:/u.test(path) && (path[2] === '/' || path.charCodeAt(2) === 92)))
        invalid('resource path must be absolute'); return path; };
    switch (raw.action) {
        case 'create': {
            record(raw, 'create resource', ['action', 'spec']);
            const spec = record(raw.spec, 'worktree spec', ['repositoryPath', 'root', 'name', 'startPoint']);
            return freeze({ action: 'create', spec: { repositoryPath: absolute(spec.repositoryPath), root: absolute(spec.root), name: id(spec.name, 'name'), startPoint: id(spec.startPoint, 'startPoint') } });
        }
        case 'borrow':
            record(raw, 'borrow resource', ['action', 'path']);
            return freeze({ action: 'borrow', path: absolute(raw.path) });
        case 'read':
        case 'retain':
        case 'actual-retire':
            record(raw, 'resource target', ['action', 'resourceId']);
            return freeze({ action: raw.action, resourceId: target() });
        case 'update-business': {
            record(raw, 'resource business', ['action', 'resourceId', 'business']);
            const business = record(raw.business, 'resource business value', ['status', 'disposition', 'followup']);
            return freeze({ action: 'update-business', resourceId: target(), business: Object.fromEntries(Object.entries(business).map(([key, value]) => [key, text(value, key)])) });
        }
        case 'request-retire': {
            record(raw, 'retire resource', ['action', 'resourceId', 'disposition']);
            const d = record(raw.disposition, 'retire disposition', ['kind', 'branch', 'expectedFactsDigest', 'explanation', 'expectedBranchOid']);
            if (d.kind !== 'remove-clean' && d.kind !== 'discard')
                invalid('explicit retire disposition required');
            if (d.branch !== 'keep' && d.branch !== 'delete-owned')
                invalid('explicit branch disposition required');
            if (d.expectedBranchOid !== undefined && (typeof d.expectedBranchOid !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(d.expectedBranchOid)))
                invalid('invalid expected branch OID');
            return freeze({ action: 'request-retire', resourceId: target(), disposition: { kind: d.kind, branch: d.branch,
                    ...(d.expectedFactsDigest === undefined ? {} : { expectedFactsDigest: id(d.expectedFactsDigest, 'expectedFactsDigest') }),
                    ...(d.explanation === undefined ? {} : { explanation: text(d.explanation, 'explanation') }),
                    ...(d.expectedBranchOid === undefined ? {} : { expectedBranchOid: d.expectedBranchOid }) } });
        }
        default: return invalid('unsupported resource action; program receipts are not wire operations');
    }
}
function strict(name, parse) { return { mode: 'strict', typeSymbol: REMOTE_NAMESPACE + '#' + name, create: () => ({ parse }) }; }
const sessionCodec = strict('SessionId', value => id(value, 'sessionId'));
const jsonCodec = strict('Json', parseHostJson);
const revisionCodec = strict('Revision', value => revision(value, 'expectedRevision'));
function descriptor(method, parameters, result) {
    return { id: '@lmgatex/dsh-mattpocock-skills#' + REMOTE_NAMESPACE + '/' + method, service: REMOTE_NAMESPACE, namespace: REMOTE_NAMESPACE, method,
        invocation: { kind: 'direct' }, parameters: parameters.map(([name, codec]) => ({ name, wire: name, source: 'json', codec })), result,
        ...((method === 'readSession' || method === 'historyAction' || method === 'startupStatus' || method === 'saveStartupSettings') ? { cancellation: { parameter: 'signal' } } : {}) };
}
/** The same strict contract is registered on Host and selected by Client $mount. */
export const REMOTE_CONTRIBUTION = Object.freeze({
    package: '@lmgatex/dsh-mattpocock-skills',
    descriptors: Object.freeze([
        descriptor('startupStatus', [], strict('StartupStatus', parseStartupStatus)),
        descriptor('saveStartupSettings', [['desired', strict('StartupDesired', parseStartupDesired)], ['expectedRevision', revisionCodec]], strict('StartupStatus', parseStartupStatus)),
        descriptor('readPolicy', [], strict('PolicySnapshot', parsePolicySnapshot)),
        descriptor('savePolicy', [['intent', strict('PolicyIntent', parsePolicyIntent)], ['expectedRevision', revisionCodec]], strict('PolicySnapshot', parsePolicySnapshot)),
        descriptor('listWorkspaces', [], jsonCodec), descriptor('readSession', [['sessionId', sessionCodec]], jsonCodec),
        descriptor('applyInstrument', [['sessionId', sessionCodec], ['command', strict('InstrumentCommand', parseInstrumentCommand)]], jsonCodec),
        descriptor('applyTicketWindow', [['sessionId', sessionCodec], ['command', strict('TicketWindowCommand', parseRemoteTicketWindow)]], jsonCodec),
        descriptor('resourceAction', [['sessionId', sessionCodec], ['request', strict('ResourceAction', parseResourceAction)]], jsonCodec),
        descriptor('historyAction', [['sessionId', sessionCodec], ['request', jsonCodec]], jsonCodec),
        descriptor('worktreeAction', [['sessionId', sessionCodec], ['request', jsonCodec]], jsonCodec),
        descriptor('grantPolicy', [['sessionId', sessionCodec], ['enabled', strict('Boolean', value => boolean(value, 'enabled'))], ['expectedRevision', revisionCodec]], strict('PolicyGrants', parsePolicyGrants)),
    ]),
});
