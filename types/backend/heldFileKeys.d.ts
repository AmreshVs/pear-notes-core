export const HELD_KEYS_FILE: "held-file-keys";
export const HELD_KEY_MAX_AGE_MS: number;
export class HeldFileKeys {
    constructor(dir: any, vaultKey: any);
    filePath: any;
    _key: any;
    records: Map<any, any>;
    get size(): number;
    list(): any[];
    put(record: any): boolean;
    drop(blobIds: any): void;
    close(): void;
    _load(): void;
    _persist(): boolean;
}
//# sourceMappingURL=heldFileKeys.d.ts.map