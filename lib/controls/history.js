import { array, ControlsError, freeze, id, increment, invalid, record, revision } from './validation.js';
import { createDomainVersionedStorage, MemoryVersionedStorage } from './versioned-storage.js';
function coverage(rows, missing = false) {
    const sources = new Map();
    for (const row of rows)
        if (row.source)
            sources.set(JSON.stringify([row.source.domain, row.source.coverage]), { domain: row.source.domain, coverage: row.source.coverage });
    return freeze({ sources: [...sources.values()], purged: rows.some(row => row.purged), notRecorded: rows.length === 0 || missing });
}
function json(value, seen = new Set()) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean')
        return value;
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    if (typeof value !== 'object' || value === null || seen.has(value))
        invalid('history payload must be finite acyclic JSON');
    seen.add(value);
    let result;
    if (Array.isArray(value))
        result = array(value, 'history JSON array').map(child => json(child, seen));
    else
        result = Object.fromEntries(Object.entries(record(value, 'history JSON')).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => [key, json(child, seen)]));
    seen.delete(value);
    return result;
}
function parseObservation(value) {
    const r = record(value, 'history observation', ['kind', 'recordId', 'recordKey', 'version', 'snapshot', 'source', 'flags', 'summary']);
    const s = record(r.source, 'history source', ['kind', 'domain', 'author', 'recordedAt', 'coverage']);
    if (s.kind !== 'authored' && s.kind !== 'program' && s.kind !== 'snapshot')
        invalid('invalid history source kind');
    if (s.coverage !== 'recorded-history' && s.coverage !== 'snapshot-only')
        invalid('invalid history source coverage');
    const result = { kind: id(r.kind, 'history kind'), recordId: id(r.recordId, 'recordId'),
        recordKey: id(r.recordKey, 'recordKey'), version: revision(r.version, 'source version'), snapshot: json(r.snapshot),
        source: { kind: s.kind, domain: id(s.domain, 'source domain'), author: json(s.author),
            recordedAt: s.recordedAt === null ? null : revision(s.recordedAt, 'source recordedAt'), coverage: s.coverage },
        ...(r.summary === undefined ? {} : { summary: typeof r.summary === 'string' ? r.summary : invalid('summary must be string') }),
        ...(r.flags === undefined ? {} : { flags: parseFlags(r.flags) }),
    };
    return freeze(result);
}
function parseFlags(value) {
    const f = record(value, 'history flags', ['done', 'cleanedWorktree']);
    for (const value of Object.values(f))
        if (typeof value !== 'boolean')
            invalid('history flags must be boolean');
    return { ...(f.done === undefined ? {} : { done: f.done }), ...(f.cleanedWorktree === undefined ? {} : { cleanedWorktree: f.cleanedWorktree }) };
}
function entity(value) { return JSON.stringify([value.kind, value.recordId]); }
function parseSource(value) {
    return parseObservation({ kind: 'source', recordId: 'source', recordKey: 'source', version: 0, snapshot: null, source: value }).source;
}
function parseAction(value) {
    const input = record(value, 'history action');
    if (input.action === 'set-context') {
        const a = record(value, 'history context action', ['action', 'kind', 'recordId', 'included']);
        if (typeof a.included !== 'boolean')
            invalid('invalid history context action');
        return { action: 'set-context', kind: id(a.kind, 'kind'), recordId: id(a.recordId, 'recordId'), included: a.included };
    }
    const a = record(value, 'history purge action', ['action', 'historyIds', 'range', 'archivedOnly']);
    if (a.action !== 'purge')
        invalid('unknown history action');
    if (a.historyIds === undefined && a.range === undefined)
        invalid('purge requires explicit historyIds or range');
    const historyIds = a.historyIds === undefined ? undefined : array(a.historyIds, 'purge historyIds').map(value => id(value, 'historyId'));
    if (historyIds && (historyIds.length === 0 || historyIds.length > 100 || new Set(historyIds).size !== historyIds.length))
        invalid('purge IDs must be 1..100 unique explicit IDs');
    let range;
    if (a.range !== undefined) {
        const r = record(a.range, 'purge range', ['fromSequence', 'toSequence']);
        range = { fromSequence: revision(r.fromSequence, 'fromSequence'), toSequence: revision(r.toSequence, 'toSequence') };
        if (range.fromSequence < 1 || range.toSequence < range.fromSequence)
            invalid('invalid purge range');
    }
    if (a.archivedOnly !== undefined && typeof a.archivedOnly !== 'boolean')
        invalid('archivedOnly must be boolean');
    return { action: 'purge', ...(historyIds === undefined ? {} : { historyIds }), ...(range === undefined ? {} : { range }), archivedOnly: a.archivedOnly === undefined ? range !== undefined : a.archivedOnly };
}
function latest(rows) {
    const map = new Map();
    for (const row of rows) {
        const prior = map.get(entity(row));
        if (!prior || prior.sourceDomain !== row.sourceDomain || row.version >= prior.version)
            map.set(entity(row), row);
    }
    return [...map.values()];
}
function inContext(row, contexts) {
    if (row.kind === 'worktree' || row.kind === 'worktrees')
        return !row.flags?.cleanedWorktree;
    if (row.purged)
        return false;
    const context = contexts.find(c => entity(c) === entity(row));
    return context?.included ?? !row.flags?.done;
}
function identity(value) { return JSON.stringify([value.kind, value.recordId, value.version, 'sourceDomain' in value ? value.sourceDomain : value.source.domain]); }
function suppressionKey(value) { return JSON.stringify([value.kind, value.recordId, value.sourceDomain]); }
export function initialHistoryDocument(instance) {
    return parseHistoryDocument({ ...instance, schemaVersion: 1, revision: 0, rows: [], contexts: [], actions: [], suppression: [] });
}
export function parseHistoryDocument(value) {
    try {
        const d = record(value, 'history document', ['schemaVersion', 'revision', 'instrumentInstanceId', 'ownerSessionId', 'controlWorkspaceId', 'rows', 'contexts', 'actions', 'suppression']);
        if (d.schemaVersion !== 1)
            invalid('unsupported history schema');
        const rows = array(d.rows, 'history rows').map(value => {
            const r = record(value, 'history row', ['historyId', 'sequence', 'capturedAt', 'kind', 'recordId', 'recordKey', 'version', 'snapshot', 'source', 'flags', 'summary', 'sourceDomain', 'purged']);
            const { historyId, sequence, capturedAt, sourceDomain, purged, ...observation } = r;
            if (typeof purged !== 'boolean')
                invalid('history row purged must be boolean');
            const domain = id(sourceDomain, 'sourceDomain');
            if (purged && (r.snapshot !== null || r.source !== null || r.summary !== undefined))
                invalid('purged history payload must be redacted');
            const parsed = parseObservation(purged ? { ...observation, source: { kind: 'snapshot', domain, author: null, recordedAt: null, coverage: 'snapshot-only' } } : observation);
            if (parsed.source.domain !== domain)
                invalid('history source domain mismatch');
            return { ...parsed, source: purged ? null : parsed.source, sourceDomain: domain, purged, historyId: id(historyId, 'historyId'), sequence: revision(sequence, 'sequence'), capturedAt: revision(capturedAt, 'capturedAt') };
        });
        if (rows.some((row, index) => row.sequence !== index + 1 || row.historyId !== 'h:' + row.sequence) || new Set(rows.map(identity)).size !== rows.length)
            invalid('duplicate or invalid history sequence');
        const contexts = array(d.contexts, 'history contexts').map(value => { const c = record(value, 'context', ['kind', 'recordId', 'included']); if (typeof c.included !== 'boolean')
            invalid('context included must be boolean'); return { kind: id(c.kind, 'kind'), recordId: id(c.recordId, 'recordId'), included: c.included }; });
        if (new Set(contexts.map(entity)).size !== contexts.length || contexts.some(c => !rows.some(row => entity(row) === entity(c))))
            invalid('duplicate or unrecorded history context');
        const actions = array(d.actions, 'history actions').map(value => { const a = record(value, 'history action record', ['revision', 'action', 'source', 'capturedAt']); return { revision: revision(a.revision, 'action revision'), action: parseAction(a.action), source: parseSource(a.source), capturedAt: revision(a.capturedAt, 'action capturedAt') }; });
        if (actions.some(a => a.source.kind === 'snapshot' || a.source.author === null))
            invalid('history action requires actual author source');
        if (actions.some((a, index) => a.revision < 1 || a.revision > Number(d.revision) || index > 0 && a.revision <= actions[index - 1].revision))
            invalid('invalid history action revisions');
        const suppression = array(d.suppression, 'history suppression').map(value => { const s = record(value, 'suppression', ['kind', 'recordId', 'sourceDomain', 'throughVersion']); return { kind: id(s.kind, 'kind'), recordId: id(s.recordId, 'recordId'), sourceDomain: id(s.sourceDomain, 'sourceDomain'), throughVersion: revision(s.throughVersion, 'throughVersion') }; });
        if (new Set(suppression.map(suppressionKey)).size !== suppression.length || rows.some(row => row.purged && !suppression.some(s => suppressionKey(s) === suppressionKey(row) && s.throughVersion >= row.version)) || suppression.some(s => { const purged = rows.filter(row => row.purged && suppressionKey(s) === suppressionKey(row)); return purged.length === 0 || s.throughVersion !== Math.max(...purged.map(row => row.version)); }))
            invalid('purged history requires matching durable suppression metadata');
        return freeze({ schemaVersion: 1, revision: revision(d.revision, 'history revision'), instrumentInstanceId: id(d.instrumentInstanceId, 'instance'),
            ownerSessionId: id(d.ownerSessionId, 'owner'), controlWorkspaceId: id(d.controlWorkspaceId, 'workspace'), rows, contexts, actions, suppression });
    }
    catch (error) {
        throw new ControlsError('invalid-state', 'invalid history document: ' + String(error));
    }
}
function scopedParser(instance) {
    return value => {
        const d = parseHistoryDocument(value);
        if (d.instrumentInstanceId !== instance.instrumentInstanceId || d.ownerSessionId !== instance.ownerSessionId || d.controlWorkspaceId !== instance.controlWorkspaceId)
            throw new ControlsError('association-conflict', 'history storage identity differs from scoped instance');
        return d;
    };
}
export class MemoryHistoryStorage extends MemoryVersionedStorage {
    constructor(instance, seed) { super(scopedParser(initialHistoryDocument(instance)), seed); }
}
const domainAdapters = new WeakMap();
export function createDomainHistoryStorage(table, instance) {
    const owner = initialHistoryDocument(instance);
    let cache = domainAdapters.get(table);
    if (!cache) {
        cache = new Map();
        domainAdapters.set(table, cache);
    }
    const key = owner.ownerSessionId;
    let storage = cache.get(key);
    if (!storage) {
        storage = createDomainVersionedStorage(table, key, scopedParser(owner));
        cache.set(key, storage);
    }
    return { async read() { const raw = await storage.read(); return raw === undefined ? undefined : scopedParser(owner)(raw); },
        compareAndSwap(expectedRevision, next) { scopedParser(owner)(next); return storage.compareAndSwap(expectedRevision, next); } };
}
/** Trusted scoped core. Runtime must authorize owner/assignment before every call. */
export class SessionHistory {
    storage;
    now;
    instance;
    constructor(instance, storage, now = Date.now) {
        this.storage = storage;
        this.now = now;
        const d = initialHistoryDocument(instance);
        this.instance = freeze({ instrumentInstanceId: d.instrumentInstanceId, ownerSessionId: d.ownerSessionId, controlWorkspaceId: d.controlWorkspaceId });
    }
    async load() {
        const value = await this.storage.read();
        return value === undefined ? initialHistoryDocument(this.instance) : scopedParser(this.instance)(value);
    }
    async capture(input) {
        const observations = array(input, 'observations').map(parseObservation);
        const capturedAt = revision(this.now(), 'capturedAt');
        for (let attempt = 0; attempt < 32; attempt++) {
            const current = await this.load(), rows = [...current.rows];
            for (const observation of observations) {
                const sourceDomain = observation.source.domain;
                if (current.suppression.some(s => suppressionKey(s) === suppressionKey({ ...observation, sourceDomain }) && observation.version <= s.throughVersion))
                    continue;
                const old = rows.find(row => identity(row) === identity(observation));
                if (old) {
                    if (old.purged)
                        continue;
                    const { historyId: _id, sequence: _sequence, capturedAt: _time, sourceDomain: _domain, purged: _purged, ...prior } = old;
                    const { recordKey: _priorKey, ...priorContent } = prior, { recordKey: _newKey, ...content } = observation;
                    if (JSON.stringify(priorContent) !== JSON.stringify(content))
                        throw new ControlsError('operation-conflict', 'history source version changed payload');
                    continue;
                }
                const sequence = increment(rows.length);
                rows.push({ ...observation, sourceDomain, purged: false, sequence, historyId: 'h:' + sequence, capturedAt });
            }
            if (rows.length === current.rows.length)
                return freeze({ revision: current.revision });
            const next = parseHistoryDocument({ ...current, revision: increment(current.revision), rows });
            if (await this.storage.compareAndSwap(current.revision, next))
                return freeze({ revision: next.revision });
        }
        throw new ControlsError('concurrent-update', 'history changed repeatedly');
    }
    async activeContext() {
        const d = await this.load();
        return freeze(latest(d.rows).filter(row => inContext(row, d.contexts)).map(({ snapshot: _snapshot, ...summary }) => summary));
    }
    async apply(input, trustedSource, signal) {
        const action = parseAction(input), source = parseSource(trustedSource), capturedAt = revision(this.now(), 'action capturedAt');
        if (source.kind === 'snapshot' || source.author === null)
            invalid('history actions require a trusted actual author source');
        for (let attempt = 0; attempt < 32; attempt++) {
            signal?.throwIfAborted();
            const d = await this.load();
            signal?.throwIfAborted();
            let contexts = d.contexts, rows = d.rows, suppression = d.suppression;
            if (action.action === 'set-context') {
                if (!d.rows.some(row => entity(row) === entity(action)))
                    invalid('context record is not recorded');
                const prior = d.contexts.find(c => entity(c) === entity(action));
                if (prior?.included === action.included)
                    return freeze({ revision: d.revision, operation: null });
                contexts = [...d.contexts.filter(c => entity(c) !== entity(action)), { kind: action.kind, recordId: action.recordId, included: action.included }];
            }
            else {
                if (action.historyIds?.some(historyId => !d.rows.some(row => row.historyId === historyId)))
                    invalid('purge explicit historyId is not recorded');
                if (action.range && action.range.toSequence > d.rows.length)
                    invalid('purge range exceeds recorded history');
                const active = new Set(latest(d.rows).filter(row => inContext({ ...row, purged: false }, d.contexts)).map(entity));
                const targets = d.rows.filter(row => !row.purged && (action.historyIds?.includes(row.historyId) || action.range && row.sequence >= action.range.fromSequence && row.sequence <= action.range.toSequence) && (!action.archivedOnly || !active.has(entity(row))));
                if (targets.length === 0)
                    return freeze({ revision: d.revision, operation: null });
                const ids = new Set(targets.map(row => row.historyId)), high = new Map(d.suppression.map(s => [suppressionKey(s), s]));
                for (const row of targets) {
                    const key = suppressionKey(row), prior = high.get(key);
                    high.set(key, { kind: row.kind, recordId: row.recordId, sourceDomain: row.sourceDomain, throughVersion: Math.max(prior?.throughVersion ?? 0, row.version) });
                }
                suppression = [...high.values()];
                rows = d.rows.map(row => { if (!ids.has(row.historyId))
                    return row; const { summary: _summary, ...rest } = row; return { ...rest, snapshot: null, source: null, purged: true }; });
            }
            const operation = { revision: increment(d.revision), action, source, capturedAt };
            const next = parseHistoryDocument({ ...d, revision: operation.revision, contexts, rows, suppression, actions: [...d.actions, operation] });
            signal?.throwIfAborted();
            if (await this.storage.compareAndSwap(d.revision, next))
                return freeze({ revision: next.revision, operation });
            signal?.throwIfAborted();
        }
        throw new ControlsError('concurrent-update', 'history changed repeatedly');
    }
    /** Aggregate documents already are lossless materializations, not destructive event replay. */
    async compact() { const d = await this.load(); return freeze({ revision: d.revision }); }
    async query(input = {}) {
        const q = record(input, 'history query', ['kind', 'recordId', 'limit', 'cursor']);
        const kind = q.kind === undefined ? null : id(q.kind, 'kind'), recordId = q.recordId === undefined ? null : id(q.recordId, 'recordId');
        const limit = q.limit === undefined ? 50 : revision(q.limit, 'limit');
        if (limit < 1 || limit > 100)
            invalid('history limit must be between 1 and 100');
        const d = await this.load();
        let cut = d.rows.length, after = 0;
        if (q.cursor !== undefined) {
            const c = record(q.cursor, 'history cursor', ['instrumentInstanceId', 'ownerSessionId', 'controlWorkspaceId', 'cut', 'after', 'kind', 'recordId']);
            if (c.instrumentInstanceId !== d.instrumentInstanceId || c.ownerSessionId !== d.ownerSessionId || c.controlWorkspaceId !== d.controlWorkspaceId || c.kind !== kind || c.recordId !== recordId)
                invalid('history cursor scope/filter mismatch');
            cut = revision(c.cut, 'cursor cut');
            after = revision(c.after, 'cursor after');
            if (cut > d.rows.length || after > cut)
                invalid('history cursor exceeds stored cut');
        }
        const selected = d.rows.filter(row => row.sequence <= cut && (kind === null || row.kind === kind) && (recordId === null || row.recordId === recordId));
        const rows = selected.filter(row => row.sequence > after).slice(0, limit);
        const last = rows.at(-1);
        const nextCursor = last && selected.some(row => row.sequence > last.sequence) ? { ...this.instance, cut, after: last.sequence, kind, recordId } : null;
        const cov = coverage(selected);
        return freeze({ instance: this.instance, revision: d.revision, cut, total: selected.length, rows: rows.map(({ snapshot: _snapshot, ...summary }) => summary), nextCursor, coverage: cov, notRecorded: cov.notRecorded });
    }
    async detail(historyIds) {
        const ids = array(historyIds, 'historyIds').map(value => id(value, 'historyId'));
        if (ids.length > 20)
            invalid('history detail accepts at most 20 historyIds');
        if (new Set(ids).size !== ids.length)
            invalid('history detail IDs must be unique');
        const d = await this.load(), rows = ids.flatMap(historyId => { const row = d.rows.find(row => row.historyId === historyId); return row ? [row] : []; });
        const missingHistoryIds = ids.filter(historyId => !rows.some(row => row.historyId === historyId)), cov = coverage(rows, missingHistoryIds.length > 0);
        return freeze({ revision: d.revision, rows, missingHistoryIds, coverage: cov, notRecorded: cov.notRecorded });
    }
}
