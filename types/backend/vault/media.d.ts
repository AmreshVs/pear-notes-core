export function deriveMediaKey(vaultKey: any): string;
export function rangeOf(url: any): {
    blockOffset: number;
    blockLength: number;
    byteOffset: number;
    byteLength: number;
    id: string;
    core: string;
};
export function linksIn(html: any): any[];
export function noteLinks(value: any): any[];
export function attachmentName(html: any, url: any): string;
export const MEDIA_RETENTION_MS: number;
export const BLOB_ACCESS_SECRET: string;
export class GuardedBlobServer {
    constructor(store: any, opts?: {});
    secret: any;
    sealedFile: any;
    getLink(key: any, opts?: {}): any;
    _onrequest(req: any, res: any): Promise<void>;
    _onblob(info: any, res: any): Promise<void>;
    _onsealedblob(info: any, file: any, res: any): Promise<void>;
    _ondrive(info: any, res: any): Promise<void>;
    _onpointer(info: any, res: any): Promise<void>;
    _guard(handle: any, res: any): Promise<void>;
}
export class MediaStore {
    constructor(vault: any, store: any, vaultKey: any);
    vault: any;
    store: any;
    key: string;
    drive: any;
    server: GuardedBlobServer;
    sealedIndex: {
        keyed: Map<any, any>;
        unkeyed: Set<any>;
    };
    notesSeq: number;
    sealWaiting: any[];
    held: boolean;
    closed: boolean;
    writing: number;
    cores: Map<any, any>;
    downloads: Map<any, any>;
    uploads: Map<any, any>;
    files: any[];
    scanTimer: any;
    ticker: any;
    timersHeld: boolean;
    onUpload: (index: any, bytes: any) => void;
    onDriveChange: () => Promise<void>;
    ready(): Promise<void>;
    close(): Promise<void>;
    get blobCore(): any;
    get ownCore(): string;
    address(): string;
    publicAddress(): string;
    _link(blob: any): any;
    _ownId(file: any): string;
    suspend(): Promise<void>;
    holdTimers(held: any): void;
    _track(timer: any): any;
    resume(): Promise<void>;
    getFile({ key }: {
        key: any;
    }): Promise<any>;
    insertFile(args: any): Promise<any>;
    _writing(write: any): Promise<any>;
    _insertFile({ key, buffer, path, seal }: {
        key: any;
        buffer: any;
        path: any;
        seal?: any;
    }): Promise<any>;
    insertFileWithProgress(key: any, path: any, onProgress: any, token: any, seal: any): Promise<any>;
    _insertWithProgress(key: any, path: any, onProgress?: () => void, token?: any, seal?: any): Promise<any>;
    copyFile(noteKey: any, url: any, fileName: any, { open, seal }?: {
        open?: any;
        seal?: any;
    }): Promise<any>;
    fileNameOf(html: any, url: any): any;
    _ownPath(urlOrPath: any): any;
    _forget(url: any): Promise<void>;
    deleteFile(urlOrPath: any): Promise<void>;
    deleteNoteFile(noteKey: any, urlOrPath: any, reseal?: any): Promise<void>;
    pruneRemovedMedia(noteKey: any, before: any, after: any): Promise<void>;
    deleteNoteMedia(noteKey: any): Promise<void>;
    _usedRanges(): Promise<Set<any>>;
    sweep({ retain, now }?: {
        retain?: boolean;
        now?: number;
    }): Promise<number>;
    reclaim(): Promise<{
        reclaimedBytes: number;
    }>;
    _indexFiles(): Promise<void>;
    missingUrls(urls: any): Promise<Set<any>>;
    _core(coreHex: any): Promise<any>;
    _sealedFiles(): Promise<{
        keyed: Map<any, any>;
        unkeyed: Set<any>;
    }>;
    sealedFile(blobId: any): Promise<any>;
    refreshSealWaiting(notes?: any): Promise<void>;
    setSealWaiting(files: any): void;
    getSealWaitingInfo(): any[];
    scheduleScan(): void;
    scan(): Promise<void>;
    _pump(): void;
    _start(download: any): void;
    _stop(id: any): void;
    _downloaded(coreHex: any, index: any): void;
    setHeld(held: any): {
        held: boolean;
    };
    retryDownload(url: any): {
        done: boolean;
    };
    pauseDownload(url: any): {
        paused: boolean;
    };
    getDownloadsInfo(): {
        noteKey: any;
        url: any;
        fileName: any;
        totalBytes: any;
        downloadedBytes: number;
        status: any;
        stalled: boolean;
        sourceOnline: boolean;
    }[];
    _uploaded(index: any, bytes: any): void;
    getUploadsInfo(): {
        noteKey: any;
        url: any;
        fileName: any;
        totalBytes: any;
        uploadedBytes: number;
        status: string;
    }[];
    _tick(): void;
    storageInfo(notes: any): Promise<{
        downloads: {
            noteKey: any;
            url: any;
            fileName: any;
            totalBytes: any;
            downloadedBytes: number;
            status: any;
            stalled: boolean;
            sourceOnline: boolean;
        }[];
        uploads: {
            noteKey: any;
            url: any;
            fileName: any;
            totalBytes: any;
            uploadedBytes: number;
            status: string;
        }[];
        sealWaiting: any[];
        notes: any;
        totalBlobBytes: number;
        totalOnDiskBytes: number;
        reclaimableBytes: number;
    }>;
    subscribeStorageInfo(db: any): Promise<{
        on(event: any, cb: any): void;
        close: () => Promise<void>;
    }>;
}
//# sourceMappingURL=media.d.ts.map