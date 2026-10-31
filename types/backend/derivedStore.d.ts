export function deriveStoreKey(vaultKey: any): Uint8Array<ArrayBufferLike>;
export const DERIVED_DIR: "derived";
/**
 * Local, sealed, rebuildable storage for AI-derived data (vectors, entities,
 * suggestions), one per vault. It lives beside the vault's Corestore, never
 * inside it, so nothing here can replicate. Every value is sealed with a key
 * derived from the vault key and carries its own record key, so a value
 * moved to another key fails to open. Anything that fails to open reads as
 * missing: the data is derived and is rebuilt.
 */
export class DerivedStore {
    constructor(dir: any, vaultKey: any);
    dir: any;
    _key: Uint8Array<ArrayBufferLike>;
    _db: any;
    opened: boolean;
    wiped: boolean;
    ready(): Promise<void>;
    close(): Promise<void>;
    _seal(namespace: any, id: any, version: any, value: any): Uint8Array<ArrayBufferLike>;
    _open(namespace: any, id: any, sealed: any): {
        id: string;
        version: number;
        value: Uint8Array<ArrayBufferLike>;
    };
    get(namespace: any, id: any): Promise<{
        id: string;
        version: number;
        value: Uint8Array<ArrayBufferLike>;
    }>;
    /** @param {string} namespace @param {{ id: string, version: number, value: Uint8Array | null }[]} entries */
    putMany(namespace: string, entries: {
        id: string;
        version: number;
        value: Uint8Array | null;
    }[]): Promise<void>;
    put(namespace: any, id: any, version: any, value: any): Promise<void>;
    delete(namespace: any, id: any): Promise<void>;
    entries(namespace: any): AsyncGenerator<{
        id: string;
        version: number;
        value: Uint8Array<ArrayBufferLike>;
    }, void, unknown>;
    /** Versions only, for deciding what to rebuild without opening every value. */
    versions(namespace: any): Promise<Map<any, any>>;
    clear(namespace?: any): Promise<void>;
    stats(namespaces?: any[]): Promise<{
        bytes: any;
        counts: {};
    }>;
}
//# sourceMappingURL=derivedStore.d.ts.map