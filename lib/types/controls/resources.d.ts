import { MemoryVersionedStorage } from './versioned-storage.js';
import type { VersionedStorage, VersionedTable } from './versioned-storage.js';
export type ResourceErrorCode = 'access-denied' | 'resource-busy' | 'identity-conflict' | 'unsupported' | 'quarantined' | 'invalid-state' | 'concurrent-update';
export declare class ResourceError extends Error {
    readonly code: ResourceErrorCode;
    readonly name = "ResourceError";
    constructor(code: ResourceErrorCode, message: string);
}
export interface ResourceActor {
    readonly controlWorkspaceId: string;
    readonly instrumentInstanceId: string;
    readonly authorId: string;
}
/** Host-authenticated identity and existing access rights, never model claims. */
export interface ResourceAuthority {
    authorize(principal: string, access: 'read' | 'create' | 'borrow' | 'write' | 'retire', resource?: ResourceRecord): Promise<ResourceActor>;
}
export interface CreateWorktree {
    readonly repositoryPath: string;
    readonly root: string;
    readonly name: string;
    readonly startPoint: string;
}
export interface GitWorktreeIdentity {
    readonly repositoryPath: string;
    readonly root: string;
    readonly path: string;
    readonly gitCommonDir: string;
    readonly gitCommonDirIdentity: string;
    readonly gitDir: string | null;
    readonly gitDirIdentity: string | null;
    readonly pathIdentity: string | null;
    readonly rootIdentity: string;
    readonly branchRef: string | null;
    readonly branchOwned: boolean;
    readonly ownership: 'owned' | 'borrowed';
    readonly baseOid: string;
}
export interface GitWorktreeFacts {
    readonly identityVerified: boolean;
    readonly exists: boolean;
    readonly tracked: readonly string[];
    readonly untracked: readonly string[];
    readonly ignored: readonly string[];
    readonly headOid: string | null;
    readonly branchOid: string | null;
    readonly digest: string;
}
export type RetireDisposition = {
    readonly kind: 'remove-clean' | 'discard';
    readonly branch: 'keep' | 'delete-owned';
    /** Exact content observation to which an explicit discard applies. */
    readonly expectedFactsDigest?: string;
    readonly explanation?: string;
    readonly expectedBranchOid?: string;
};
export interface AuthoredRetireDisposition extends RetireDisposition {
    readonly authorId: string;
}
/** All effects cross an authorized host adapter; no subprocess or FS defaults. */
export interface GitWorktreeAdapter {
    planCreate(spec: CreateWorktree, signal?: AbortSignal): Promise<GitWorktreeIdentity>;
    create(identity: GitWorktreeIdentity, signal?: AbortSignal): Promise<GitWorktreeIdentity>;
    borrow(path: string, signal?: AbortSignal): Promise<GitWorktreeIdentity>;
    inspect(identity: GitWorktreeIdentity, signal?: AbortSignal): Promise<GitWorktreeFacts>;
    retire(identity: GitWorktreeIdentity, disposition: AuthoredRetireDisposition, signal?: AbortSignal): Promise<void>;
}
export type ResourceReferenceState = 'active' | 'queued' | 'accepted-message' | 'idle' | 'cold' | 'closed' | 'unknown';
export interface ResourceReference {
    readonly bindingId: string;
    readonly instrumentInstanceId: string;
    readonly sessionId: string;
    readonly state: ResourceReferenceState;
    readonly reusable: boolean;
    readonly entryOpen: boolean;
}
export interface ResourceLifecycle {
    /** Must close ALL native send/resume/admission entrances, not just plugin tools.
     * Closure is durable/idempotent; outstanding accepted work is NOT discarded. */
    closeEntrypoints(identity: ResourceRecord, references: readonly ResourceReference[]): Promise<{
        readonly closed: boolean;
        readonly nativeColdResumeClosed: boolean;
    }>;
    /** Verify a real initial/followup binding; absent seam returns false. Never write headers. */
    verifyInitialBinding(identity: ResourceRecord, reference: ResourceReference): Promise<boolean>;
}
export interface ResourceBusiness {
    readonly status?: string;
    readonly disposition?: string;
    readonly followup?: string;
}
export type ResourceStatus = 'creating' | 'retained' | 'retire-requested' | 'retiring' | 'retired' | 'cleanup-failed' | 'quarantined';
export interface ResourceRecord {
    readonly resourceId: string;
    readonly controlWorkspaceId: string;
    readonly ownerInstanceId: string;
    readonly identity: GitWorktreeIdentity;
    readonly status: ResourceStatus;
    readonly business: ResourceBusiness;
    readonly businessAuthorId: string;
    readonly references: readonly ResourceReference[];
    readonly retireRequest: AuthoredRetireDisposition | null;
    readonly entrancesClosed: boolean;
    readonly nativeColdResumeClosed: boolean;
    readonly diagnostic: string | null;
}
export interface ResourceLease {
    readonly leaseId: string;
    readonly instrumentInstanceId: string;
    readonly kind: 'writer' | 'integration';
    readonly resourceIds: readonly string[];
}
/** One resource-domain aggregate: all aliases, instances, references and locks in one CAS.
 * Not an instance business aggregate or a cross-domain/multi-process transaction. */
export interface ResourceDocument {
    readonly schemaVersion: 1;
    readonly revision: number;
    readonly resources: readonly ResourceRecord[];
    readonly leases: readonly ResourceLease[];
}
export type ResourceStorage = VersionedStorage<ResourceDocument>;
export interface ActualCanRetire {
    readonly allowed: boolean;
    readonly checkedAt: number;
    readonly ledgerRevision: number;
    readonly reasons: readonly string[];
    readonly facts: GitWorktreeFacts | null;
}
export interface ResourceView extends ResourceRecord {
    readonly actualCanRetire: ActualCanRetire;
}
export interface ResourceOperations {
    /** Resolve actual host instance, no wire owner id or foreign business projection. */
    list(principal: string, signal?: AbortSignal): Promise<readonly ResourceView[]>;
    read(principal: string, resourceId: string, signal?: AbortSignal): Promise<ResourceView>;
    create(principal: string, spec: CreateWorktree, signal?: AbortSignal): Promise<ResourceRecord>;
    borrow(principal: string, path: string, signal?: AbortSignal): Promise<ResourceRecord>;
    retain(principal: string, resourceId: string): Promise<ResourceRecord>;
    updateBusiness(principal: string, resourceId: string, business: ResourceBusiness): Promise<ResourceRecord>;
    requestRetire(principal: string, resourceId: string, disposition: RetireDisposition): Promise<ResourceRecord>;
    actualRetire(principal: string, resourceId: string, signal?: AbortSignal): Promise<ResourceView>;
}
/** Trusted host-only program port; MUST NOT be mounted as model tools. */
export interface ResourceProgram {
    setReference(resourceId: string, reference: ResourceReference): Promise<ResourceRecord>;
    releaseReference(resourceId: string, bindingId: string): Promise<ResourceRecord>;
    acquireLease(lease: ResourceLease): Promise<ResourceLease>;
    releaseLease(leaseId: string, instrumentInstanceId: string): Promise<void>;
    /** Host reports uncertain late setup/initial-message/catalog publication. */
    quarantine(resourceId: string, diagnostic: string): Promise<ResourceRecord>;
    /** Inspect interrupted operations, quarantine rather than auto-delete or infer idle. */
    recover(): Promise<ResourceDocument>;
}
export declare function parseResourceDocument(value: unknown): ResourceDocument;
export declare class MemoryResourceStorage extends MemoryVersionedStorage<ResourceDocument> {
    constructor(seed?: unknown);
}
export declare function createDomainResourceStorage(table: VersionedTable<ResourceDocument>): ResourceStorage;
export interface ResourceDependencies {
    readonly storage: ResourceStorage;
    readonly authority: ResourceAuthority;
    readonly git: GitWorktreeAdapter;
    readonly lifecycle: ResourceLifecycle;
    readonly newId?: () => string;
    readonly now?: () => number;
}
export declare function createResourceModule(deps: ResourceDependencies): {
    readonly resources: ResourceOperations;
    readonly program: ResourceProgram;
};
