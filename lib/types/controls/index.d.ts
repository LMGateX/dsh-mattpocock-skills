import type { EffectivePolicy, PolicyIntent, PolicySnapshot } from './policy.js';
import type { InstrumentInstance, SessionAssociation } from './state.js';
import type { ControlsStorage } from './storage.js';
export { INITIAL_POLICY, parsePolicyIntent, parsePolicySnapshot, resolvePolicy } from './policy.js';
export type { PolicyIntent, PolicySnapshot, WorkspacePolicyPatch, EffectivePolicy, PolicySource, PolicyField, FeatureName, FeaturePatch, WindowPatch, DisplayPatch } from './policy.js';
export { INITIAL_DOCUMENT, parseControlsDocument } from './state.js';
export type { ControlsDocument, InstrumentInstance, SessionAssociation } from './state.js';
export { MemoryControlsStorage, createDomainControlsStorage } from './storage.js';
export type { ControlsStorage, ControlsStateTable } from './storage.js';
export { ControlsError } from './validation.js';
export type { ControlsErrorCode } from './validation.js';
export { SessionInstruments } from './instruments.js';
export type { InstrumentAuthority, InstrumentAccess, InstrumentScope, InstrumentFilter, InstrumentSnapshot, InstrumentApplyResult } from './instruments.js';
export { parseInstrumentCommand, parseInstrumentDocument, initialInstrumentDocument } from './instrument-state.js';
export type { InstrumentDocument, InstrumentEvent, InstrumentAuthor, InstrumentCommand, WorkflowValue, StatusAxis, StatusDefinition, TicketValue, DecisionValue, DecisionViewValue, WorkflowRecord, TicketRecord, DecisionRecord, Change } from './instrument-state.js';
export { MemoryInstrumentStorage, createDomainInstrumentStorage } from './instrument-storage.js';
export type { InstrumentStorage } from './instrument-storage.js';
export * from './windows.js';
export * from './resources.js';
export * from './git-worktrees.js';
export * from './consumption.js';
export * from './remote-contract.js';
export * from './runtime-state.js';
export * from './history.js';
export * from './worktree-bindings.js';
export * from './startup-state.js';
export * from './startup-support.js';
export type TrustedSession = {
    readonly kind: 'owner';
    readonly controlWorkspaceId: string;
} | {
    readonly kind: 'managed-child';
    readonly parentSessionId: string;
};
/** Required host seam, not model-supplied declarations or a new approval policy.
 * Principals/session ids must originate in the existing authenticated host call.
 * Session role, parent and original control workspace are durable identity facts.
 */
export interface ControlsAuthority {
    authorizePolicy(principal: string, access: 'read' | 'write'): Promise<void>;
    authorizeSession(principal: string, sessionId: string, access: 'read' | 'register'): Promise<void>;
    resolveSession(sessionId: string): Promise<TrustedSession | undefined>;
    verifyWorkspace(workspaceId: string): Promise<boolean>;
}
export interface SessionControlsView {
    readonly documentRevision: number;
    readonly association: SessionAssociation;
    readonly instance: InstrumentInstance;
    readonly policy: EffectivePolicy;
}
/** Unmounted first-stage core. It has NO tools, T/S leases, Git actions or GUI effects.
 * Both business callers and settings callers later cross this same checked seam.
 */
export declare class WorkspaceControls {
    private readonly storage;
    private readonly authority;
    private readonly newInstanceId;
    constructor(storage: ControlsStorage, authority: ControlsAuthority, newInstanceId?: () => string);
    readPolicy(principal: string): Promise<PolicySnapshot>;
    savePolicy(principal: string, intent: PolicyIntent, expectedRevision: number): Promise<PolicySnapshot>;
    /** Atomically register the verified root and missing descendants. Repeated/cold ensure
     * preserves identity; missing host lineage never defaults a child to a new owner.
     */
    ensureSession(principal: string, sessionId: string): Promise<SessionControlsView>;
    readSession(principal: string, sessionId: string): Promise<SessionControlsView>;
    private lineage;
    private checkLineage;
    /** load/transact validate referential integrity before this internal lookup. */
    private lookup;
    private view;
    private load;
    private transact;
}
