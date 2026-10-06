/**
 * Bounded public Loader composition for the pinned 0.2.1-alpha.1 topology.
 * These patches are data, not a live service replacement or an SDK disk patch.
 * The original stock row/config remains available to the compatibility bridge.
 *
 * Supported: exactly one ungrouped, unisolated stock row and one compatibility
 * sibling in the same EntryTree root, with the pinned peer resolved from public
 * launch metadata. Unrelated plugins are not blanket-rejected. Arbitrary custom
 * modules which also provide subagents, removed/replaced guards, and alternate
 * resolvers are outside this proof; native duplicate-service refusal still owns
 * those conflicts. Later stock-row boolean overlays remain authoritative.
 */
export declare const STOCK_SUBAGENT_ID = "subagent";
export declare const STOCK_SUBAGENT_NAME = "@deepseek-ai/dsh-subagent";
export declare const COMPAT_SUBAGENT_ID = "mattpocock-native-subagent";
export declare const COMPAT_SUBAGENT_NAME = "@lmgatex/dsh-mattpocock-skills/native-subagent";
export declare function createCompatibilityCompositionExpressions(): {
    stock: {
        __jsExpr: string;
    };
    compat: {
        __jsExpr: string;
    };
};
export declare function createCompatibilityCompositionPatches(): ({
    id: string;
    name: string;
    disabled: {
        __jsExpr: string;
    };
    insert?: never;
} | {
    insert: {
        id: string;
        name: string;
        disabled: {
            __jsExpr: string;
        };
    }[];
    id?: never;
    name?: never;
    disabled?: never;
})[];
