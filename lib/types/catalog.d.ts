export interface CatalogInvocation {
    readonly modelInvocable: boolean;
    readonly userInvocable: boolean;
}
export interface CatalogSkill {
    readonly name: string;
    readonly description: string;
    readonly whenToUse?: string;
    readonly metadata?: Readonly<Record<string, unknown>>;
    readonly frontmatterExtensions?: Readonly<Record<string, unknown>>;
    readonly invocation: CatalogInvocation;
    readonly channels: readonly ('stable' | 'beta')[];
    readonly directory: string;
    readonly skillPath: string;
    readonly bodyByteOffset: number;
    readonly sha256: string;
}
export interface SkillCatalog {
    readonly schemaVersion: 1;
    readonly distribution: Readonly<{
        repository: string;
        tag: string;
        tagObject: string;
        commit: string;
        upstreamCommit: string;
    }>;
    readonly channels: Readonly<{
        stable: readonly string[];
        beta: readonly string[];
    }>;
    readonly skills: readonly CatalogSkill[];
}
export declare function parseCatalog(text: string): SkillCatalog;
export declare const CATALOG_URL: URL;
export declare const CATALOG: SkillCatalog;
