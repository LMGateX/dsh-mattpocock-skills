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
    readonly channels: readonly string[];
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
    /**
     * Channel name to the sorted Skill names it selects. The set is data-driven: it is
     * whatever channel manifests the vendored distribution ships, so a new upstream
     * channel needs no plugin change.
     */
    readonly channels: Readonly<Record<string, readonly string[]>>;
    readonly skills: readonly CatalogSkill[];
}
export declare function parseCatalog(text: string): SkillCatalog;
export declare const CATALOG_URL: URL;
export declare const CATALOG: SkillCatalog;
