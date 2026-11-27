import type { GenerateOptions } from '@deepseek-ai/dsh-llm';
type InputProjection = Partial<Pick<GenerateOptions<string>, 'tools' | 'toolHistory' | 'messages'>>;
/**
 * Request-only replacements for an exact DSH 0.2.3-alpha.2 auxiliary call.
 * The Host must first verify Session ownership and current silent policy. Only
 * apply replacements to the mutable one-shot envelope before calling next().
 * Ordinary loop requests and borrowed Session data are never changed.
 */
export declare function projectSilentCompactionInput(options: Readonly<GenerateOptions<string>>): InputProjection | null;
export {};
