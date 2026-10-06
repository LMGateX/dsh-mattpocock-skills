import type { StartupPreparation } from '../controls/startup-state.js';
export declare const COMPATIBLE_SUBAGENT_METADATA: Readonly<{
    owner: "@lmgatex/dsh-mattpocock-skills";
    version: "0.2.1-alpha.1";
    artifactPath: "compatibility/native-subagent-0.2.1-alpha.1.js";
    artifactSha256: "f6197aa3eb84c4f803e2b6517e70b1b62a804bb4e763abec94ebe961dabd77ba";
    provenancePath: "compatibility/native-subagent.provenance.json";
    provenanceSha256: "59fa929e71ae38d04dc4730a441b88fe5a97db7ed26fc817eea77883a2dc9b04";
    nativeSha256: "75b50b1c9452a6aeb10d1c859e3f45b05e062ea1fad6ed3bcd9577f2bc912541";
    wrapperPath: "lib/compatibility/native-subagent.js";
    originSymbol: "@lmgatex/dsh-mattpocock-skills/compatible-subagent-origin";
    originValue: "native-subagent-0.2.1-alpha.1";
    externalImports: readonly string[];
}>;
interface PublicContext {
    get(name: string): unknown;
}
/** Overrides are trusted operator-program fixture metadata, not serialized authority. */
export interface CompatibilityInspectionOptions {
    readonly pluginRoot?: string;
}
/** Shared metadata/owned-public-asset gate. Does not import or construct a native implementation. */
export declare function inspectCompatibleSubagentAsset(pluginRoot?: string, signal?: AbortSignal): Promise<void>;
/** Ready means SAMEPLUGIN's packaged provider can be selected on the next true
 * boot; never current enablement, shared SDK patching, or a private sticky choice. */
export declare function inspectCompatibilityPreparation(ctx: PublicContext, signal?: AbortSignal, options?: CompatibilityInspectionOptions): Promise<StartupPreparation | null>;
export {};
