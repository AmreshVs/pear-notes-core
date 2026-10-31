export function isCancellation(error: any): boolean;
export function parseHyperdriveUrl(url: any): {};
export function blobRefFromUrl(url: any): {
    blockOffset: number;
    blockLength: number;
    byteOffset: number;
    byteLength: number;
};
export function blobCoreKeyHexFromUrl(url: any): string;
export function extractReferencedUrls(notes: any): Set<any>;
export function blocksPresent(core: any, blockOffset: any, blockLength: any): any;
export function clearBlockRange(core: any, start: any, end: any): Promise<number>;
export function measureLocalBlobBytes(core: any, liveBlobs: any): {
    presentBytes: number;
    orphanBytes: number;
};
export function getNotesStorageInfo(base: any, notes: any, { keepUnlinkedSince }?: {
    keepUnlinkedSince?: number;
}): Promise<{
    notes: any;
    totalBlobBytes: number;
    totalOnDiskBytes: number;
    reclaimableBytes: number;
}>;
export function exportBackup(base: any, notes: any, folders: any, settings: any, password?: any, filePath?: any, cb?: () => void, signal?: any, { strict }?: {
    strict?: boolean;
}): Promise<Uint8Array<ArrayBufferLike>>;
export function readBackupVersion({ buffer, filePath }: {
    buffer: any;
    filePath: any;
}): Promise<number>;
export function readFramedMeta({ buffer, filePath, password, vaultKeys }: {
    buffer: any;
    filePath: any;
    password: any;
    vaultKeys?: any[];
}): Promise<any>;
export function checkBackupRestore(base: any, { buffer, filePath, password, recoveryKey }: {
    buffer: any;
    filePath: any;
    password: any;
    recoveryKey: any;
}): Promise<{
    sealed: boolean;
    blocking: any[];
} | {
    sealed: true;
    blocking: any;
}>;
export function importBackup(base: any, { buffer, filePath, recoveryKey, password, signal }: {
    buffer: any;
    filePath: any;
    recoveryKey: any;
    password: any;
    signal?: any;
}, cb?: () => void): Promise<{
    notes: any;
    folders: any;
    attachmentsExpected: any;
    attachmentsRestored: number;
    strictExport: boolean;
}>;
export function backupVersionFor(notes: any): 3 | 4;
//# sourceMappingURL=backupManager.d.ts.map