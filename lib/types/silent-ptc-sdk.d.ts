export interface SilentPtcSdkProjection {
    readonly status: 'unchanged' | 'stripped' | 'unsupported';
    readonly text: string;
}
export declare function stripSilentPtcSdk(text: string): SilentPtcSdkProjection;
