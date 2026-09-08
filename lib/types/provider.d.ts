import { type FileHandle } from 'node:fs/promises';
import type { SkillProvider } from '@deepseek-ai/dsh-skill';
import type { SkillCatalog } from './catalog.js';
import type { Channel } from './index.js';
export declare const PROVIDER_NAME = "dsh-mattpocock-skills";
export declare const PACKAGE_ROOT: string;
export type ProviderDiagnostic = (message: string) => void;
export type SkillFileReader = (handle: FileHandle, signal: AbortSignal | undefined) => Promise<Buffer>;
export interface ProviderOptions {
    readonly packageRoot?: string;
    readonly catalog?: SkillCatalog;
    readonly lifecycleSignal?: AbortSignal;
    readonly diagnostic?: ProviderDiagnostic;
    /** @internal Deterministic I/O seam for provider contract tests. */
    readonly readSkillFile?: SkillFileReader;
}
export declare function createMattPocockSkillProvider(channel: Channel, options?: ProviderOptions): SkillProvider;
