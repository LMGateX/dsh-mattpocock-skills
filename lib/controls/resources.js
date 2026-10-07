import { randomUUID } from 'node:crypto';
import { isAbsolute, normalize } from 'node:path';
import { array, boolean, freeze, id, increment, memoized, record, revision } from './validation.js';
import { createDomainVersionedStorage, MemoryVersionedStorage } from './versioned-storage.js';
export class ResourceError extends Error {
    code;
    name = 'ResourceError';
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
function fail(code, message) { throw new ResourceError(code, message); }
function path(value, where) {
    if (typeof value !== 'string' || !isAbsolute(value) || normalize(value) !== value || /[\u0000-\u001f\u007f]/u.test(value))
        fail('invalid-state', where + ' must be a normalized absolute path');
    return value;
}
function text(value, where) {
    if (typeof value !== 'string' || value.length > 16384 || value.includes('\0'))
        fail('invalid-state', where + ' must be text');
    return value;
}
function oid(value) { if (typeof value !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(value))
    fail('invalid-state', 'invalid Git object identity'); return value; }
function nullable(value, parse) { return value === null ? null : parse(value); }
function parseIdentity(value) {
    const r = record(value, 'Git identity', ['repositoryPath', 'root', 'path', 'gitCommonDir', 'gitCommonDirIdentity', 'gitDir', 'gitDirIdentity', 'pathIdentity', 'rootIdentity', 'branchRef', 'branchOwned', 'ownership', 'baseOid']);
    if (r.ownership !== 'owned' && r.ownership !== 'borrowed')
        fail('invalid-state', 'unknown ownership');
    const branchOwned = boolean(r.branchOwned, 'branchOwned');
    if (r.ownership === 'borrowed' && branchOwned)
        fail('invalid-state', 'borrowed branch cannot be owned');
    const branchRef = nullable(r.branchRef, v => id(v, 'branchRef'));
    if (branchRef !== null && !branchRef.startsWith('refs/heads/'))
        fail('invalid-state', 'not a local branch ref');
    return { repositoryPath: path(r.repositoryPath, 'repositoryPath'), root: path(r.root, 'root'), path: path(r.path, 'path'), gitCommonDir: path(r.gitCommonDir, 'gitCommonDir'), gitCommonDirIdentity: id(r.gitCommonDirIdentity, 'gitCommonDirIdentity'), gitDir: nullable(r.gitDir, v => path(v, 'gitDir')), gitDirIdentity: nullable(r.gitDirIdentity, v => id(v, 'gitDirIdentity')), pathIdentity: nullable(r.pathIdentity, v => id(v, 'pathIdentity')), rootIdentity: id(r.rootIdentity, 'rootIdentity'), branchRef, branchOwned, ownership: r.ownership, baseOid: oid(r.baseOid) };
}
function parseBusiness(value) {
    const r = record(value, 'business', ['status', 'disposition', 'followup']);
    return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, text(v, k)]));
}
function parseDisposition(value, authored) {
    const r = record(value, 'retire disposition', ['kind', 'branch', 'expectedFactsDigest', 'explanation', 'expectedBranchOid', ...(authored ? ['authorId'] : [])]);
    if (!['remove-clean', 'discard'].includes(String(r.kind)) || !['keep', 'delete-owned'].includes(String(r.branch)))
        fail('invalid-state', 'invalid content disposition');
    const result = { kind: r.kind, branch: r.branch };
    const extra = {};
    if (r.expectedFactsDigest !== undefined)
        extra.expectedFactsDigest = id(r.expectedFactsDigest, 'expectedFactsDigest');
    if (r.explanation !== undefined)
        extra.explanation = text(r.explanation, 'explanation');
    if (r.expectedBranchOid !== undefined)
        extra.expectedBranchOid = oid(r.expectedBranchOid);
    if (r.kind === 'discard' && (!extra.expectedFactsDigest || !extra.explanation?.trim()))
        fail('invalid-state', 'discard requires explicit content observation and explanation');
    if (r.branch === 'delete-owned' && !extra.expectedBranchOid)
        fail('invalid-state', 'branch deletion requires exact expected ref identity');
    if (authored)
        extra.authorId = id(r.authorId, 'authorId');
    return { ...result, ...extra };
}
function parseReference(value) {
    const r = record(value, 'reference', ['bindingId', 'instrumentInstanceId', 'sessionId', 'state', 'reusable', 'entryOpen']);
    if (!['active', 'queued', 'accepted-message', 'idle', 'cold', 'closed', 'unknown'].includes(String(r.state)))
        fail('invalid-state', 'unknown reference state');
    const result = { bindingId: id(r.bindingId, 'bindingId'), instrumentInstanceId: id(r.instrumentInstanceId, 'instrumentInstanceId'), sessionId: id(r.sessionId, 'sessionId'), state: r.state, reusable: boolean(r.reusable, 'reusable'), entryOpen: boolean(r.entryOpen, 'entryOpen') };
    if (result.state === 'closed' && (result.reusable || result.entryOpen))
        fail('invalid-state', 'closed reference cannot be reusable/open');
    return result;
}
function parseLease(value) {
    const r = record(value, 'lease', ['leaseId', 'instrumentInstanceId', 'kind', 'resourceIds']);
    if (r.kind !== 'writer' && r.kind !== 'integration')
        fail('invalid-state', 'unknown lease kind');
    const resourceIds = array(r.resourceIds, 'resourceIds').map(v => id(v, 'resourceId'));
    if (!resourceIds.length || new Set(resourceIds).size !== resourceIds.length)
        fail('invalid-state', 'lease needs a unique nonempty resource set');
    return { leaseId: id(r.leaseId, 'leaseId'), instrumentInstanceId: id(r.instrumentInstanceId, 'instrumentInstanceId'), kind: r.kind, resourceIds };
}
export function parseResourceDocument(value) {
    const r = record(value, 'resource document', ['schemaVersion', 'revision', 'resources', 'leases']);
    if (r.schemaVersion !== 1)
        fail('invalid-state', 'unsupported resource schema version');
    const resources = array(r.resources, 'resources').map(value => {
        const v = record(value, 'resource', ['resourceId', 'controlWorkspaceId', 'ownerInstanceId', 'identity', 'status', 'business', 'businessAuthorId', 'references', 'retireRequest', 'entrancesClosed', 'nativeColdResumeClosed', 'diagnostic']);
        if (!['creating', 'retained', 'retire-requested', 'retiring', 'retired', 'cleanup-failed', 'quarantined'].includes(String(v.status)))
            fail('invalid-state', 'unknown resource status');
        const result = { resourceId: id(v.resourceId, 'resourceId'), controlWorkspaceId: id(v.controlWorkspaceId, 'controlWorkspaceId'), ownerInstanceId: id(v.ownerInstanceId, 'ownerInstanceId'), identity: parseIdentity(v.identity), status: v.status, business: parseBusiness(v.business), businessAuthorId: id(v.businessAuthorId, 'businessAuthorId'), references: array(v.references, 'references').map(parseReference), retireRequest: v.retireRequest === null ? null : parseDisposition(v.retireRequest, true), entrancesClosed: boolean(v.entrancesClosed, 'entrancesClosed'), nativeColdResumeClosed: boolean(v.nativeColdResumeClosed, 'nativeColdResumeClosed'), diagnostic: nullable(v.diagnostic, v => text(v, 'diagnostic')) };
        if (result.nativeColdResumeClosed && !result.entrancesClosed)
            fail('invalid-state', 'cold closure requires entrance closure');
        if (result.status === 'retired' && (!result.entrancesClosed || !result.nativeColdResumeClosed || result.references.some(v => v.state !== 'closed')))
            fail('invalid-state', 'retired resource has open references');
        if (['retained', 'retire-requested', 'retiring', 'retired', 'cleanup-failed'].includes(result.status) && (!result.identity.gitDir || !result.identity.gitDirIdentity || !result.identity.pathIdentity))
            fail('invalid-state', 'published resource lacks physical identity');
        if (['retire-requested', 'retiring', 'cleanup-failed'].includes(result.status) && !result.retireRequest)
            fail('invalid-state', 'retirement has no request');
        return result;
    });
    const leases = array(r.leases, 'leases').map(parseLease);
    if (new Set(resources.map(v => v.resourceId)).size !== resources.length || new Set(leases.map(v => v.leaseId)).size !== leases.length)
        fail('invalid-state', 'duplicate resource/lease identity');
    const bindings = resources.flatMap(v => v.references.map(ref => ref.bindingId));
    const sessions = resources.flatMap(v => v.references.map(ref => ref.sessionId));
    if (new Set(bindings).size !== bindings.length || new Set(sessions).size !== sessions.length)
        fail('invalid-state', 'binding/session must keep original resource identity');
    for (const lease of leases)
        for (const resourceId of lease.resourceIds) {
            const target = resources.find(v => v.resourceId === resourceId);
            if (!target || target.status === 'retired')
                fail('invalid-state', 'lease targets missing/retired resource');
        }
    for (let i = 0; i < leases.length; i++)
        for (const other of leases.slice(i + 1))
            if (leasesConflict(resources, leases[i], other))
                fail('invalid-state', 'persisted writer/integration collision');
    return freeze({ schemaVersion: 1, revision: revision(r.revision, 'revision'), resources, leases });
}
export class MemoryResourceStorage extends MemoryVersionedStorage {
    constructor(seed) { super(parseResourceDocument, seed); }
}
export function createDomainResourceStorage(table) {
    return createDomainVersionedStorage(table, 'resources', parseResourceDocument);
}
function samePhysical(a, b) { return a.identity.path === b.identity.path || (a.identity.gitCommonDir === b.identity.gitCommonDir && a.identity.gitDir !== null && a.identity.gitDir === b.identity.gitDir); }
function sameBranch(a, b) { return a.identity.gitCommonDir === b.identity.gitCommonDir && a.identity.branchRef !== null && a.identity.branchRef === b.identity.branchRef; }
function leasesConflict(resources, a, b) {
    return a.resourceIds.some(x => b.resourceIds.some(y => {
        const one = resources.find(v => v.resourceId === x), two = resources.find(v => v.resourceId === y);
        return samePhysical(one, two) || (one.identity.gitCommonDir === two.identity.gitCommonDir && (a.kind === 'integration' || b.kind === 'integration' || (one.identity.branchRef !== null && one.identity.branchRef === two.identity.branchRef)));
    }));
}
export function createResourceModule(deps) {
    const newId = deps.newId ?? randomUUID, now = deps.now ?? Date.now;
    const initial = { schemaVersion: 1, revision: 0, resources: [], leases: [] };
    const load = async () => { const raw = await deps.storage.read(); return raw === undefined ? freeze(initial) : memoized(raw, parseResourceDocument); };
    const transact = async (fn) => {
        for (let n = 0; n < 32; n++) {
            const old = await load(), next = fn(old);
            if (next === old)
                return old;
            const parsed = parseResourceDocument({ ...next, revision: increment(old.revision) });
            if (await deps.storage.compareAndSwap(old.revision, parsed))
                return parsed;
        }
        return fail('concurrent-update', 'resource CAS contention limit reached');
    };
    const target = (d, resourceId) => d.resources.find(v => v.resourceId === id(resourceId, 'resourceId')) ?? fail('identity-conflict', 'unknown resource');
    const replace = (d, r) => ({ ...d, resources: d.resources.map(v => v.resourceId === r.resourceId ? r : v) });
    const update = async (resourceId, fn) => target(await transact(d => replace(d, fn(target(d, resourceId), d))), resourceId);
    const actor = async (principal, access, r) => {
        const result = record(await deps.authority.authorize(id(principal, 'principal'), access, r), 'trusted actor', ['controlWorkspaceId', 'instrumentInstanceId', 'authorId']);
        const a = { controlWorkspaceId: id(result.controlWorkspaceId, 'controlWorkspaceId'), instrumentInstanceId: id(result.instrumentInstanceId, 'instrumentInstanceId'), authorId: id(result.authorId, 'authorId') };
        if (r && (a.controlWorkspaceId !== r.controlWorkspaceId || a.instrumentInstanceId !== r.ownerInstanceId))
            fail('access-denied', 'resource belongs to another instrument instance');
        return a;
    };
    const authorize = async (principal, access, resourceId) => { const r = target(await load(), resourceId); return { r, a: await actor(principal, access, r) }; };
    const busy = (d, r) => d.leases.some(l => l.resourceIds.some(x => { const v = target(d, x); return samePhysical(v, r) || (r.retireRequest?.branch === 'delete-owned' && sameBranch(v, r)) || (l.kind === 'integration' && v.identity.gitCommonDir === r.identity.gitCommonDir); }));
    const barrier = (d, r) => d.resources.some(v => v.resourceId !== r.resourceId && (samePhysical(v, r) || v.identity.gitCommonDir === r.identity.gitCommonDir) && ['creating', 'retiring', 'quarantined', 'cleanup-failed'].includes(v.status));
    const mutable = (r) => { if (['creating', 'retiring', 'retired', 'quarantined', 'cleanup-failed'].includes(r.status))
        fail(r.status === 'quarantined' ? 'quarantined' : 'resource-busy', 'resource operation is not safely mutable'); };
    const check = (d, r, facts) => {
        const reasons = [];
        if (!r.retireRequest)
            reasons.push('retire-not-requested');
        if (['creating', 'quarantined', 'retired'].includes(r.status))
            reasons.push(r.status);
        if (!r.entrancesClosed)
            reasons.push('entrances-open');
        if (!r.nativeColdResumeClosed)
            reasons.push('native-cold-resume-unsupported');
        if (busy(d, r) || barrier(d, r))
            reasons.push('resource-lease-or-operation-busy');
        const aliases = d.resources.filter(v => samePhysical(v, r) && v.status !== 'retired');
        if (r.identity.ownership === 'owned' && aliases.some(v => v.resourceId !== r.resourceId))
            reasons.push('cross-instance-resource-claim');
        const refs = aliases.flatMap(v => v.references);
        if (refs.some(v => ['active', 'queued', 'accepted-message', 'unknown'].includes(v.state)))
            reasons.push('active-or-pending-reference');
        if (refs.some(v => v.reusable || v.state === 'cold'))
            reasons.push('reusable-reference');
        if (refs.some(v => v.entryOpen))
            reasons.push('reference-entrance-open');
        if (!facts || !facts.identityVerified || !facts.exists)
            reasons.push('path-or-git-identity-unverified');
        if (r.identity.ownership === 'owned' && facts && r.retireRequest) {
            if (facts.tracked.length || facts.untracked.length || facts.ignored.length) {
                if (r.retireRequest.kind !== 'discard')
                    reasons.push('content-not-disposed');
                else if (r.retireRequest.expectedFactsDigest !== facts.digest)
                    reasons.push('content-observation-changed');
            }
            else if (r.retireRequest.kind === 'discard' && r.retireRequest.expectedFactsDigest !== facts.digest)
                reasons.push('content-observation-changed');
            if (r.retireRequest.branch === 'delete-owned' && d.resources.some(v => v.resourceId !== r.resourceId && v.status !== 'retired' && sameBranch(v, r)))
                reasons.push('cross-instance-branch-claim');
            if (r.retireRequest.branch === 'delete-owned' && (!r.identity.branchOwned || !r.identity.branchRef))
                reasons.push('branch-not-owned');
            if (r.retireRequest.branch === 'delete-owned' && r.retireRequest.expectedBranchOid !== facts.branchOid)
                reasons.push('branch-identity-changed');
        }
        return freeze({ allowed: reasons.length === 0, checkedAt: now(), ledgerRevision: d.revision, reasons, facts });
    };
    const viewAt = async (d, r, signal) => {
        // Durable metadata ACL and document validation happened OUTSIDE this catch.
        // A cold caller may read its records without a live physical Git capability.
        let facts = null, inspectionReason = null;
        try {
            const observed = await deps.git.inspect(r.identity, signal);
            if (observed.exists === false)
                inspectionReason = 'physical-inspection-missing';
            else if (observed.exists !== true || observed.identityVerified !== true)
                inspectionReason = 'physical-inspection-identity-unverified';
            else
                facts = observed;
        }
        catch (error) {
            if (signal?.aborted)
                throw error;
            const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
            inspectionReason = code === 'unsupported' ? 'physical-inspection-unsupported'
                : ['access-denied', 'EACCES', 'EPERM'].includes(code) ? 'physical-inspection-access-denied'
                    : code === 'ENOENT' ? 'physical-inspection-missing' : 'physical-inspection-failed';
        }
        const eligibility = check(d, r, facts);
        return freeze({ ...r, actualCanRetire: inspectionReason === null ? eligibility
                : { ...eligibility, allowed: false, reasons: [...eligibility.reasons, inspectionReason] } });
    };
    const view = async (resourceId, signal) => { const d = await load(); return viewAt(d, target(d, resourceId), signal); };
    const add = async (a, identity, status) => {
        const resourceId = id(newId(), 'newResourceId');
        const result = { resourceId, controlWorkspaceId: a.controlWorkspaceId, ownerInstanceId: a.instrumentInstanceId, identity: parseIdentity(identity), status, business: {}, businessAuthorId: a.authorId, references: [], retireRequest: null, entrancesClosed: false, nativeColdResumeClosed: false, diagnostic: null };
        await transact(d => {
            if (d.resources.some(v => v.resourceId === resourceId))
                fail('identity-conflict', 'resource ID collision');
            if (d.resources.some(v => v.status !== 'retired' && (samePhysical(v, result) || (v.identity.gitCommonDir === result.identity.gitCommonDir && v.identity.branchRef === result.identity.branchRef)) && identity.ownership === 'owned'))
                fail('identity-conflict', 'path/ref already registered');
            if (busy(d, result) || barrier(d, result))
                fail('resource-busy', 'resource has a conflicting repository operation');
            return { ...d, resources: [...d.resources, result] };
        });
        return freeze(result);
    };
    const resources = {
        async list(principal, signal) {
            signal?.throwIfAborted();
            const a = await actor(principal, 'read'), d = await load();
            const owned = d.resources.filter(r => r.controlWorkspaceId === a.controlWorkspaceId && r.ownerInstanceId === a.instrumentInstanceId);
            // Same ledger revision for every row; reauthorize the actual row as well.
            // Cross-instance refs do not grant access to another owner's business.
            return freeze(await Promise.all(owned.map(async (r) => { await actor(principal, 'read', r); return viewAt(d, r, signal); })));
        },
        async read(principal, resourceId, signal) { await authorize(principal, 'read', resourceId); return view(resourceId, signal); },
        async create(principal, spec, signal) {
            const a = await actor(principal, 'create'), planned = await deps.git.planCreate(spec, signal), r = await add(a, planned, 'creating');
            try {
                const created = parseIdentity(await deps.git.create(planned, signal));
                if (created.repositoryPath !== planned.repositoryPath || created.root !== planned.root || created.path !== planned.path || created.gitCommonDir !== planned.gitCommonDir || created.gitCommonDirIdentity !== planned.gitCommonDirIdentity || created.branchRef !== planned.branchRef || created.ownership !== 'owned' || !created.branchOwned || created.baseOid !== planned.baseOid || created.rootIdentity !== planned.rootIdentity)
                    fail('identity-conflict', 'created worktree differs from reserved identity');
                return await update(r.resourceId, old => { if (old.status !== 'creating')
                    fail('quarantined', 'creation interrupted by host recovery'); return { ...old, identity: created, status: 'retained' }; });
            }
            catch (error) {
                // No rollback deletion: setup/header publication may have happened.
                try {
                    await update(r.resourceId, old => ({ ...old, status: 'quarantined', diagnostic: String(error) }));
                }
                catch { /* Persistence uncertainty remains latched by storage. */ }
                throw error;
            }
        },
        async borrow(principal, path, signal) { const a = await actor(principal, 'borrow'); const identity = await deps.git.borrow(path, signal); if (identity.ownership !== 'borrowed' || identity.branchOwned)
            fail('identity-conflict', 'borrowed resource cannot acquire ownership'); return add(a, identity, 'retained'); },
        async retain(principal, resourceId) { await authorize(principal, 'write', resourceId); return update(resourceId, r => { mutable(r); if (r.entrancesClosed)
            fail('unsupported', 'closed native entrances cannot be reopened implicitly'); return { ...r, status: 'retained', retireRequest: null }; }); },
        async updateBusiness(principal, resourceId, business) { const { a } = await authorize(principal, 'write', resourceId); const parsed = parseBusiness(business); return update(resourceId, r => { if (r.status === 'retired')
            fail('resource-busy', 'resource retired'); return { ...r, business: { ...r.business, ...parsed }, businessAuthorId: a.authorId }; }); },
        async requestRetire(principal, resourceId, disposition) {
            const { a } = await authorize(principal, 'retire', resourceId);
            const parsed = parseDisposition(disposition, false);
            return update(resourceId, r => {
                if (!['retained', 'retire-requested', 'cleanup-failed'].includes(r.status))
                    fail('resource-busy', 'resource cannot accept retirement request');
                if (r.identity.ownership === 'borrowed' && (parsed.branch !== 'keep' || parsed.kind === 'discard'))
                    fail('identity-conflict', 'borrowed resource can only detach, never discard/delete');
                return { ...r, status: 'retire-requested', retireRequest: { ...parsed, authorId: a.authorId }, diagnostic: null };
            });
        },
        async actualRetire(principal, resourceId, signal) {
            await authorize(principal, 'retire', resourceId);
            const before = target(await load(), resourceId);
            if (before.status === 'retired')
                return view(resourceId, signal);
            if (!['retire-requested', 'cleanup-failed'].includes(before.status))
                return view(resourceId, signal);
            // Persist reservation before closing anything: all new refs/writers now refuse.
            await update(resourceId, (r, d) => { if (busy(d, r) || barrier(d, r))
                fail('resource-busy', 'conflicting writer/integration operation'); if (!['retire-requested', 'cleanup-failed'].includes(r.status))
                fail('resource-busy', 'retirement already running'); return { ...r, status: 'retiring' }; });
            let deleting = false;
            try {
                const d = await load(), r = target(d, resourceId);
                const refs = d.resources.filter(v => samePhysical(v, r) && v.status !== 'retired').flatMap(v => v.references);
                const closure = await deps.lifecycle.closeEntrypoints(r, refs);
                if (typeof closure.closed !== 'boolean' || typeof closure.nativeColdResumeClosed !== 'boolean')
                    fail('unsupported', 'host returned no closure proof');
                await update(resourceId, old => { if (old.status !== 'retiring')
                    fail('quarantined', 'retirement interrupted by host recovery/failure'); return { ...old, entrancesClosed: closure.closed, nativeColdResumeClosed: closure.closed && closure.nativeColdResumeClosed, references: old.references.map(v => closure.closed ? { ...v, entryOpen: false } : v) }; });
                const observed = target(await load(), resourceId), facts = await deps.git.inspect(observed.identity, signal);
                const current = await load(), locked = target(current, resourceId), eligibility = check(current, locked, facts);
                if (!eligibility.allowed) {
                    await update(resourceId, old => { if (old.status !== 'retiring')
                        fail('quarantined', 'retirement interrupted by host recovery/failure'); return { ...old, status: 'retire-requested', diagnostic: eligibility.reasons.join(', ') }; });
                    return view(resourceId, signal);
                }
                // No new refs/leases can enter after reservation. Closure proof is durable;
                // program drains may only make refs safer, never reopen or resume work.
                if (locked.identity.ownership === 'owned') {
                    deleting = true;
                    await deps.git.retire(locked.identity, locked.retireRequest, signal);
                }
                await update(resourceId, old => { if (old.status !== 'retiring')
                    fail('quarantined', 'retirement interrupted by host recovery/failure'); return { ...old, status: 'retired', references: old.references.map(v => ({ ...v, state: 'closed', reusable: false, entryOpen: false })), diagnostic: null }; });
                return view(resourceId, signal);
            }
            catch (error) {
                let originalStillVerified = false;
                if (deleting) {
                    try {
                        const remaining = await deps.git.inspect(before.identity);
                        originalStillVerified = remaining.identityVerified && remaining.exists;
                    }
                    catch { /* Unknown effect outcome must quarantine. */ }
                }
                try {
                    await update(resourceId, old => ({ ...old, status: old.status !== 'quarantined' && deleting && originalStillVerified ? 'cleanup-failed' : 'quarantined', diagnostic: String(error) }));
                }
                catch { /* Fresh storage handle required. */ }
                throw error;
            }
        },
    };
    const program = {
        async setReference(resourceId, reference) {
            const parsed = parseReference(reference), r = target(await load(), resourceId);
            if (!await deps.lifecycle.verifyInitialBinding(r, parsed))
                fail('unsupported', 'host has no verified initial child cwd binding seam');
            return update(resourceId, (old, d) => {
                const bound = d.resources.find(v => v.references.some(x => x.bindingId === parsed.bindingId || x.sessionId === parsed.sessionId));
                if (bound && bound.resourceId !== resourceId)
                    fail('identity-conflict', 'durable binding cannot migrate worktree');
                const previous = old.references.find(v => v.bindingId === parsed.bindingId);
                if (!previous && old.references.some(v => v.sessionId === parsed.sessionId))
                    fail('identity-conflict', 'native session already has its original binding ID');
                if (previous && (previous.instrumentInstanceId !== parsed.instrumentInstanceId || previous.sessionId !== parsed.sessionId))
                    fail('identity-conflict', 'binding owner/session changed');
                if (['creating', 'retired', 'quarantined', 'cleanup-failed'].includes(old.status))
                    fail('resource-busy', 'resource not available for references');
                if (previous?.state === 'closed' && parsed.state !== 'closed')
                    fail('resource-busy', 'closed durable binding cannot resume');
                if ((old.entrancesClosed || old.status === 'retiring' || barrier(d, old)) && (!previous || parsed.entryOpen || parsed.reusable && !previous.reusable || ![previous.state, 'idle', 'closed'].includes(parsed.state)))
                    fail('resource-busy', 'resource entrances closed/draining');
                return { ...old, references: [...old.references.filter(v => v.bindingId !== parsed.bindingId), parsed] };
            });
        },
        async releaseReference(resourceId, bindingId) { return update(resourceId, r => { const previous = r.references.find(v => v.bindingId === id(bindingId, 'bindingId')); if (!previous)
            fail('identity-conflict', 'unknown binding'); return { ...r, references: r.references.map(v => v.bindingId === bindingId ? { ...v, state: 'closed', reusable: false, entryOpen: false } : v) }; }); },
        async acquireLease(value) {
            const lease = parseLease(value);
            await transact(d => {
                const old = d.leases.find(v => v.leaseId === lease.leaseId);
                if (old) {
                    if (JSON.stringify(old) === JSON.stringify(lease))
                        return d;
                    fail('identity-conflict', 'lease ID payload changed');
                }
                for (const resourceId of lease.resourceIds) {
                    const r = target(d, resourceId);
                    if (r.status !== 'retained' || r.entrancesClosed || barrier(d, r))
                        fail('resource-busy', 'resource is not open for writer/integration lease');
                    if (r.ownerInstanceId !== lease.instrumentInstanceId && !r.references.some(v => v.instrumentInstanceId === lease.instrumentInstanceId && v.state !== 'closed'))
                        fail('access-denied', 'lease instance has no resource reference');
                }
                if (d.leases.some(v => leasesConflict(d.resources, v, lease)))
                    fail('resource-busy', 'cross-instance writer/integration lease conflict');
                return { ...d, leases: [...d.leases, lease] };
            });
            return freeze(lease);
        },
        async releaseLease(leaseId, instrumentInstanceId) { await transact(d => { const lease = d.leases.find(v => v.leaseId === id(leaseId, 'leaseId')); if (!lease)
            return d; if (lease.instrumentInstanceId !== id(instrumentInstanceId, 'instrumentInstanceId'))
            fail('access-denied', 'lease owned by another instance'); return { ...d, leases: d.leases.filter(v => v !== lease) }; }); },
        async quarantine(resourceId, diagnostic) { const detail = text(diagnostic, 'diagnostic'); return update(resourceId, r => { if (r.status === 'retired')
            fail('resource-busy', 'resource already retired'); return { ...r, status: 'quarantined', diagnostic: detail }; }); },
        async recover() {
            // Retained references and leases survive fresh restore. An interrupted effect
            // has uncertain outcome: never infer release, reopen entrances or auto-delete.
            return transact(d => {
                if (!d.resources.some(v => v.status === 'creating' || v.status === 'retiring'))
                    return d;
                return { ...d, resources: d.resources.map(v => ['creating', 'retiring'].includes(v.status) ? { ...v, status: 'quarantined', diagnostic: 'interrupted effect; host reconciliation required, retained without auto-delete' } : v) };
            });
        },
    };
    return freeze({ resources, program });
}
