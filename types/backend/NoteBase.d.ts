export function setDefaultSwarmBootstrap(bootstrap: any): void;
export default NoteBase;
import { MEDIA_RETENTION_MS } from './vault/media.js';
import { findLegacyStores } from './vault/layout.js';
import { preserveLegacyVault } from './vault/layout.js';
declare class NoteBase extends ReadyResource {
    constructor({ storage, encryption, entropy, bootstrap, appVersion }?: {
        entropy?: any;
        bootstrap?: any;
        appVersion?: string;
    });
    appVersion: string;
    updateRequired: boolean;
    _compatCheck: any;
    _devicePublishedAt: number;
    _deviceRefreshTimer: any;
    path: any;
    encryption: any;
    encryptionKey: Uint8Array<ArrayBufferLike>;
    swarmBootstrap: any;
    _entropy: Uint8Array<ArrayBufferLike>;
    corestore: any;
    autobase: any;
    media: MediaStore;
    derived: DerivedStore;
    heldFileKeys: HeldFileKeys;
    swarm: any;
    discovery: any;
    memberGate: MemberGate;
    localKey: any;
    isClosing: boolean;
    hostPairing: HostPairing;
    _wakeup: any;
    _localAnnounce: any;
    _vaultDir: any;
    _writeChain: Promise<void>;
    _lifecycle: Promise<void>;
    _suspended: boolean;
    _suspendSettled: Promise<any[]>;
    _swarmSuspendDone: boolean;
    _swarmResumedAt: number;
    _resumeReconnectTimer: any;
    _reopening: any;
    _reopenAttempts: number;
    _remoteNodes: number;
    _connectedSwarmKeys: Set<any>;
    _swarmKeyHex: string;
    _indexerSnapshot: string;
    _lastIndexerKeys: any[];
    _lastFastForward: {
        at: number;
        to: any;
        from: any;
    };
    _timers: Set<any>;
    _pairingInFlight: boolean;
    _vaultBusy: boolean;
    _leaving: boolean;
    _generation: number;
    _maintaining: any;
    _merging: any;
    _departedWriters: Set<any>;
    _removed: boolean;
    _trackedView: any;
    _untrackView: any;
    _noteOrder: Map<any, any>;
    _noteChangeSeq: number;
    _rejectedSealedSaves: Map<any, any>;
    _rejectedNotice: any;
    _apply: (nodes: any, view: any, host: any) => Promise<void>;
    get key(): any;
    get discoveryKey(): any;
    get writable(): boolean;
    get localKeyHex(): string;
    get hyperdrive(): any;
    get blobServer(): import("./vault/media.js").GuardedBlobServer;
    _reconnectIfAlone(): Promise<void>;
    _serialLifecycle(task: any): Promise<void>;
    _rebuildSwarmIfStuck(reason: any): Promise<void>;
    _rebuildSwarm(reason: any): Promise<void>;
    aiOffload: AiOffload;
    destroy(): Promise<void>;
    _every(firstDelay: any, task: any, interval?: number): void;
    _blindEncryption(): BlindEncryptionSodium;
    _canOpenSealedKey(store: any): Promise<boolean>;
    _openVault(relativeDir: any, { key, encryptionKey }?: {
        key?: any;
        encryptionKey?: Uint8Array<ArrayBufferLike>;
    }): Promise<void>;
    _startBase(key: any, encryptionKey: any): Promise<void>;
    _adoptVaultKey(): void;
    _clearPlaintextKey(): Promise<void>;
    _linearizeInBackground(): void;
    _startupMaintenance(): any;
    _maintain(): Promise<void>;
    _scheduleDeviceRefresh(): void;
    refreshCompatLock(): any;
    _checkCompatLock(): Promise<boolean>;
    _openDerived(dir: any): Promise<void>;
    _closeVault(): Promise<void>;
    _heldMergeTimer: any;
    _mergeHeld: boolean;
    _onBaseError(base: any, err: any): void;
    _scheduleReopen(failed: any): void;
    _onUpdate(): void;
    _onWritable(): void;
    _scheduleMediaSweep(): void;
    _mediaSweepTimer: any;
    _swarmSeed(): any;
    _startSwarm(): Promise<void>;
    _announceLocalWriter(): void;
    _onProcessWoke(swarm: any): void;
    _memberVerdict(writer: any): Promise<"removed" | "unknown" | "open" | "member" | "departed">;
    _onUnwritable(base: any): Promise<void>;
    _onRemovedNotice(writer: any): Promise<void>;
    _markRemoved(): void;
    isRemovedFromVault(): boolean;
    isSwarmKeyOnline(swarmKey: any): boolean;
    getSwarmKeyHex(): string;
    suspend(): Promise<void>;
    resume(): Promise<void>;
    _holdTimers(held: any): void;
    _suspend(): Promise<void>;
    _resume(): Promise<void>;
    _checkReconnectSoon(): void;
    getChore(): Promise<{
        hyperdriveServerAddress: string;
    }>;
    getHyperdriveAddress(): string;
    update(): Promise<void>;
    wait(ms?: number): Promise<void>;
    append(op: any): Promise<void>;
    autobaseDb(): Promise<any>;
    _trackView(db: any): void;
    _onNoteChanges(ops: any): void;
    addWriter(keyHex: any, { indexer }?: {
        indexer?: boolean;
    }): Promise<void>;
    requestWriter(key: any, { isIndexer }?: {
        isIndexer?: boolean;
    }): Promise<void>;
    getIndexerKeys(): any;
    isIndexerKey(localKeyHex: any): any;
    isLocalIndexer(): any;
    _isSoleLeader(): boolean;
    _isReachable(localKeyHex: any): Promise<boolean>;
    _requireLeadersOnline(): Promise<void>;
    setDeviceIndexer({ localKey, isIndexer }: {
        localKey: any;
        isIndexer: any;
    }): Promise<{
        changed: boolean;
        indexers: any;
    }>;
    transferIndexer({ localKey }: {
        localKey: any;
    }): Promise<{
        changed: boolean;
        indexers: any;
    }>;
    addNote({ key, value, noActivity, unseal, basis }: {
        key: any;
        value: any;
        noActivity?: boolean;
        unseal?: boolean;
        basis?: any;
    }): Promise<void>;
    rejectedSealedSaves(): [any, any][];
    dropRejectedSealedSave(key: any, value: any): void;
    removeNote(key: any): Promise<void>;
    pruneHeldFileKeys(noteKey?: any): Promise<void>;
    getNote(key: any): Promise<any>;
    _collect(iterate: any, fallback?: any[]): Promise<any[]>;
    getAllNotesStrict(): Promise<{
        key: any;
        value: any;
    }[]>;
    _readAllNotes(): Promise<any[]>;
    getAllNotes(): Promise<any[]>;
    _byUpdated(entries: any): any;
    getAllNoteKeys(): Promise<any[]>;
    trashNote(key: any): Promise<boolean>;
    restoreNote(key: any): Promise<{
        done: boolean;
        folderKey: any;
    }>;
    _restoreFolder(previousFolderKey: any): Promise<any>;
    purgeExpiredTrash(now?: number): Promise<number>;
    subscribeNote(key: any): Promise<import("./viewWatch.js").KeyWatcher>;
    subscribeAllNoteKeys(): Promise<import("./viewWatch.js").ChangeWatcher>;
    addFolder({ key, value, noActivity }: {
        key: any;
        value: any;
        noActivity?: boolean;
    }): Promise<void>;
    updateFolder(args: any): Promise<void>;
    removeFolder(key: any): Promise<void>;
    getFolder(key: any): Promise<any>;
    getAllFolders(): Promise<any[]>;
    getAllFoldersKeys(): Promise<any>;
    subscribeFolder(key: any): Promise<import("./viewWatch.js").KeyWatcher>;
    subscribeAllFolderKeys(): Promise<import("./viewWatch.js").ChangeWatcher>;
    updateSettings({ settings, noActivity }: {
        settings: any;
        noActivity?: boolean;
    }): Promise<void>;
    getSettings(): Promise<any>;
    subscribeSettings(): Promise<import("./viewWatch.js").KeyWatcher>;
    addSyncedDevice({ key, value }: {
        key: any;
        value: any;
    }): Promise<void>;
    updateSyncedDevice({ key, value }: {
        key: any;
        value: any;
    }): Promise<void>;
    removeSyncedDevice(key: any): Promise<void>;
    getRawSyncedDevice(key: any): Promise<any>;
    getSyncedDevice(key: any): Promise<any>;
    _withPresence(device: any): any;
    getAllSyncedDeviceKeys(): Promise<any>;
    setAiOffloadServing(serving: any): void;
    _aiOffloadServing: boolean;
    getAiOffloadStatus(): Promise<{
        available: boolean;
        deviceTitle: any;
    }>;
    _emitOffloadInOrder(emit: any): void;
    _offloadEmits: any;
    findDeviceByLocalKey(localKeyHex: any): Promise<any>;
    hasSyncedDeviceWithLocalKey(localKeyHex: any): Promise<boolean>;
    subscribeSyncedDevice(key: any): Promise<import("./viewWatch.js").KeyWatcher>;
    subscribeAllSyncedDeviceKeys(): Promise<import("./viewWatch.js").ChangeWatcher>;
    publishLocalSwarmKey(): Promise<void>;
    listSyncedDevicesStrict(): Promise<any[]>;
    getSyncedPref(id: any): Promise<any>;
    activateGate(name: any, compatLevel: any): Promise<void>;
    isActivityLogEnabled(): Promise<boolean>;
    getActivityRetentionDays(): Promise<number>;
    logActivityEvent(event: any, { targetKey, targetTitle, meta }?: {
        targetKey?: string;
        targetTitle?: string;
        meta?: {};
    }): Promise<void>;
    pruneActivity(now?: number): Promise<1 | 0>;
    clearActivity(): Promise<void>;
    setSyncedPref(id: any, value: any): Promise<void>;
    getSyncedPrefs(prefix?: string): Promise<{}>;
    getLockKeyrings(): Promise<any[]>;
    sealedKeyringIds(): Promise<Set<any>>;
    hasLockKeyring(): Promise<boolean>;
    getActivity({ filter, deviceKey, noteKey, limit, cursor }?: {
        filter?: string;
        deviceKey?: string;
        noteKey?: string;
        cursor?: string;
    }): Promise<{
        entries: {
            id: any;
            event: any;
            device: any;
            at: any;
            lastAt: any;
            ops: any;
            targetKind: any;
            targetKey: any;
            targetTitle: any;
            locked: boolean;
            added: number;
            removed: number;
            hasDiff: boolean;
            recoverable: boolean;
            meta: any;
        }[];
        cursor: any;
        hasMore: boolean;
    }>;
    getActivityDiff(id: any): Promise<{
        id: any;
        before: any;
        after: any;
        locked: boolean;
        available: boolean;
    }>;
    getActivityStats(): Promise<{
        count: number;
        bytes: number;
        oldestAt: number;
    }>;
    subscribeActivity(): Promise<import("./viewWatch.js").ChangeWatcher>;
    recoverDiscardedNoteWrite(): Promise<{
        done: boolean;
        noteKey: string;
    }>;
    insertFile(args: any): Promise<any>;
    insertFileWithProgress(key: any, path: any, onProgress: any, token: any, seal?: any): Promise<any>;
    getFile(args: any): Promise<any>;
    deleteFile(key: any): Promise<void>;
    deleteNoteFile(noteKey: any, mediaPath: any, reseal: any): Promise<void>;
    pruneRemovedMedia(noteKey: any, before: any, after: any): Promise<void>;
    deleteNoteWithMedia(noteKey: any): Promise<void>;
    reclaimOrphanedBlobs(): Promise<{
        reclaimedBytes: number;
    }>;
    isMediaSyncHeld(): boolean;
    setMediaSyncHeld(held: any): {
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
    getUploadsInfo(): {
        noteKey: any;
        url: any;
        fileName: any;
        totalBytes: any;
        uploadedBytes: number;
        status: string;
    }[];
    missingMediaUrls(urls: any): Promise<Set<any>>;
    getFilesWaitingToSeal(): any[];
    getNotesStorageInfo(): Promise<{
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
    subscribeStorageInfo(): Promise<{
        on(event: any, cb: any): void;
        close: () => Promise<void>;
    }>;
    exportBackup(password: any, filePath: any, cb?: () => void, signal?: any, options?: {}): Promise<Uint8Array<ArrayBufferLike>>;
    checkBackupRestore({ buffer, filePath, password }: {
        buffer: any;
        filePath: any;
        password: any;
    }): Promise<{
        sealed: boolean;
        blocking: any[];
    } | {
        sealed: true;
        blocking: any;
    }>;
    importBackup({ buffer, filePath, recoveryKey, password, signal, cb }: {
        buffer: any;
        filePath: any;
        recoveryKey: any;
        password: any;
        signal?: any;
        cb?: () => void;
    }): Promise<{
        notes: any;
        folders: any;
        attachmentsExpected: any;
        attachmentsRestored: number;
        strictExport: boolean;
    }>;
    createInvite(opts: any): Promise<any>;
    subscribePairing(cb: any): Promise<void>;
    confirmPairing(): void;
    rejectPairing(): Promise<void>;
    subscribePairUser(cb: any, invite: any, deviceName: any, { mode, name }?: {
        mode?: string;
        name?: string;
    }): Promise<void>;
    _inviteExpiry(inviteBuffer: any): any;
    _captureForMerge(passwordHex: any): Promise<boolean | "locked">;
    heldMerge(): Promise<{
        held: boolean;
        blocking: any;
    }>;
    _scheduleHeldMergeCheck(): void;
    _recheckHeldMerge(): Promise<void>;
    combineHeldMerge(): Promise<boolean>;
    _resumeMerge(): Promise<void>;
    _finishMerge(): any;
    _merge(): Promise<boolean | "held">;
    _retireOldVaults(): Promise<void>;
    listVaults(): {
        id: any;
        name: any;
        addedAt: any;
        current: boolean;
    }[];
    createVault({ name }?: {}): Promise<any>;
    switchVault(id: any): Promise<any>;
    renameVault(id: any, name: any): Promise<boolean>;
    removeVault(id: any, { timeoutMs, force }?: {
        timeoutMs?: number;
        force?: boolean;
    }): Promise<any>;
    moveToVault({ targetId, noteKeys, folderKeys }?: {
        noteKeys?: any[];
        folderKeys?: any[];
    }): Promise<any>;
    _collectForMove(noteKeys: any, folderKeys: any): Promise<{
        notes: {
            key: any;
            value: any;
        }[];
        folders: any[];
    }>;
    _handOffLeadership(waitMs: any): Promise<boolean>;
    _waitForPeer(timeoutMs: any): Promise<void>;
    _hasOtherDevices(): Promise<boolean>;
    _vaultOp(task: any): Promise<any>;
    _enterVault(dir: any, pointer: any, encryptionKey: any): Promise<void>;
    _waitWritable(timeoutMs: any): Promise<boolean>;
    _waitForData(status: any): Promise<void>;
    waitForData(cb?: () => void): Promise<void>;
    leaveSyncCluster({ timeoutMs }?: {
        timeoutMs?: number;
    }): Promise<{
        left: boolean;
        replicated: boolean;
    }>;
    clearStorage(): Promise<void>;
    _countWrites(core: any, from: any, to: any): Promise<number>;
    unconfirmedWrites(): Promise<number>;
    pendingWrites(): Promise<number>;
    _encryptionFingerprint(): string;
    getDebugInfo(heavy?: boolean): Promise<{
        capturedAt: number;
        heavy: boolean;
        autobase: {
            opened: boolean;
            autobaseKey: string;
            discoveryKey: string;
            systemKey: string;
            length: number;
            indexedLength: number;
            signedLength: number;
            backlog: number;
            writable: boolean;
            localKey: string;
            localWriterLength: number;
            localWriterCoreLength: number;
            localWriterRemoved: boolean;
            localUnconfirmed: number;
            systemMembers: number;
            heads: number;
            indexerKeys: any;
            indexerCount: any;
            majority: number;
            reopening: boolean;
            reopenAttempts: number;
            encryptionFingerprint: string;
            lastFastForwardAt: number;
            lastFastForwardFrom: any;
            lastFastForwardTo: any;
        };
        swarm: {
            started: boolean;
            joined: boolean;
            publicKey: string;
            connections: number;
            peers: number;
            connectedKeys: any[];
            suspended: boolean;
            mediaSyncHeld: boolean;
            activeDownloads: number;
            activeUploads: number;
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
        };
        devices: {
            title: any;
            deviceType: any;
            platform: any;
            localKey: any;
            swarmKey: any;
            isLocal: any;
            isOnline: any;
            presenceKnown: any;
            isIndexer: any;
        }[];
        writers: {
            key: string;
            linearized: number;
            indexed: number;
            coreLength: number;
            contiguousLength: number;
            peers: number;
            isIndexer: boolean;
            isRemoved: boolean;
            coreOpen: boolean;
            seenLength: number;
        }[];
        storage: {
            driveKey: string;
            driveVersion: number;
            blobsCoreLength: number;
            blobsPeers: number;
            blobServerAddress: string;
            corePath: any;
        };
        runtime: {
            bareVersion: any;
        };
    }>;
}
import ReadyResource from 'ready-resource';
import { MediaStore } from './vault/media.js';
import { DerivedStore } from './derivedStore.js';
import { HeldFileKeys } from './heldFileKeys.js';
import { MemberGate } from './vault/memberGate.js';
import { HostPairing } from './vault/pairing.js';
import { AiOffload } from './vault/aiOffload.js';
import BlindEncryptionSodium from 'blind-encryption-sodium';
export { MEDIA_RETENTION_MS, findLegacyStores, preserveLegacyVault };
//# sourceMappingURL=NoteBase.d.ts.map