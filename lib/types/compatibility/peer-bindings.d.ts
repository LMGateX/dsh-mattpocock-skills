interface BindingContext {
    get(name: string): unknown;
}
export interface ImportBindingSite {
    readonly offset: number;
    readonly length: number;
    readonly specifier: string;
    readonly literal: string;
}
export interface ImportBindingInventory {
    readonly id: 'canonical-native-url-v1';
    readonly sites: readonly ImportBindingSite[];
}
/** Closed and synchronous: the serialized pre-import guard embeds this exact function.
 * Only declared Loader resolution methods are used; no cache/job or Node reflection. */
export declare function inspectCanonicalPeerBindings(ctx: BindingContext, nativePath: string, wrapperPath: string, artifactPath: string, installationAnchor: string): Readonly<Record<string, string>>;
/** Rebind only the hash-verified finite literal inventory; normal ESM keeps live bindings. */
export declare function bindCompatibleSubagentSource(source: string, inventory: ImportBindingInventory, peers: Readonly<Record<string, string>>): string;
export {};
