export function pointerPath(storage: any): any;
export function mergeFilePath(storage: any): any;
export function readPointer(storage: any): {
    current: any;
    merge: any;
    retire: any;
};
export function vaultIdOf(dir: any): any;
export function listVaultEntries(pointer: any): {
    id: any;
    dir: any;
    name: any;
    addedAt: any;
    current: boolean;
}[];
export function findVaultEntry(pointer: any, id: any): {
    id: any;
    dir: any;
    name: any;
    addedAt: any;
    current: boolean;
};
export function withVault(pointer: any, entry: any): any;
export function withoutVault(pointer: any, dir: any): any;
export function withVaultName(pointer: any, dir: any, name: any): any;
export function withReplacedVault(pointer: any, fromDir: any, toDir: any): any;
export function writePointer(storage: any, pointer: any): void;
export function newVaultDir(): string;
export function resolveVaultDir(storage: any, relative: any): any;
export function isMarkedRemoved(vaultDir: any): boolean;
export function markRemoved(vaultDir: any): void;
export function removeDir(dir: any): void;
export function findLegacyStores(storage: any): any[];
export function preserveLegacyVault(storage: any): {
    done: boolean;
    reason: string;
    preservedPath?: undefined;
} | {
    done: boolean;
    preservedPath: any;
    reason?: undefined;
};
export function isPreservedEntry(name: any): boolean;
//# sourceMappingURL=layout.d.ts.map