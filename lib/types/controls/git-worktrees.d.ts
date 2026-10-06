import type { AuthoredRetireDisposition, GitWorktreeAdapter } from './resources.js';
export interface GitRunResult {
    readonly exitCode: number;
    readonly stdout: string;
    readonly stderr: string;
}
export interface AuthorizedFileStat {
    readonly kind: 'directory' | 'file' | 'symlink' | 'other';
    readonly identity: string;
}
export interface GitAuthorizationRequest {
    readonly operation: 'inspect' | 'create' | 'borrow' | 'retire';
    readonly paths: readonly string[];
    readonly disposition?: AuthoredRetireDisposition;
}
/** Existing host permission path is mandatory. The host must confine each call,
 * preserve abort/error semantics, prohibit inherited GIT_* redirection, and serialize
 * effects with the resource program lease. No native/default runner is supplied. */
export interface AuthorizedGitRunner {
    authorize(request: GitAuthorizationRequest, signal?: AbortSignal): Promise<void>;
    run(argv: readonly string[], cwd: string, signal?: AbortSignal): Promise<GitRunResult>;
    lstat(path: string, signal?: AbortSignal): Promise<AuthorizedFileStat>;
    realpath(path: string, signal?: AbortSignal): Promise<string>;
    readFile(path: string, signal?: AbortSignal): Promise<Uint8Array>;
    readlink(path: string, signal?: AbortSignal): Promise<string>;
    readDirectory(path: string, signal?: AbortSignal): Promise<readonly string[]>;
}
export declare class GitCommandError extends Error {
    readonly argv: readonly string[];
    readonly result: GitRunResult;
    readonly name = "GitCommandError";
    constructor(argv: readonly string[], result: GitRunResult);
}
export declare function concreteGitAdapter(host: AuthorizedGitRunner): GitWorktreeAdapter;
