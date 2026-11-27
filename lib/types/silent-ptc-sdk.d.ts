/** Match only names owned by this bundle's verified collaboration surface. */
export declare function isCollaborationToolName(name: string): boolean;
export interface SilentPtcSdkProjection {
    readonly status: 'unchanged' | 'stripped' | 'unsupported';
    readonly text: string;
}
export declare function stripSilentPtcSdk(text: string): SilentPtcSdkProjection;
