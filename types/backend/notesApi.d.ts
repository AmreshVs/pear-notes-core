export let notesBase: any;
export let preferenceBase: any;
export function whenSealingIdle(): any;
export function onBaseReopened(cb: any): () => boolean;
export function ready(options: any): Promise<void>;
export function startFreshFromLegacyVault({ storage }: {
    storage: any;
}): Promise<{
    done: boolean;
    reason: string;
    preservedPath?: undefined;
} | {
    done: boolean;
    preservedPath: any;
    reason?: undefined;
}>;
export function destroy(): Promise<void>;
export function getChore(): Promise<any>;
export function insertFolder({ title, icon }: {
    title: any;
    icon: any;
}): Promise<string>;
export function updateFolder({ key, title, icon }: {
    key: any;
    title: any;
    icon: any;
}): Promise<void>;
export function deleteFolder(key: any): Promise<void>;
export function getAllFolders(): Promise<any>;
export function getSingleFolder({ key }: {
    key: any;
}): Promise<any>;
export function susbscribeFolder({ key }: {
    key: any;
}): Promise<any>;
export function susbscribeFolderKeys(): Promise<any>;
export function getAllFoldersKeys(): Promise<any>;
export function insertNote({ title, note, folderKey, locked, pinned }: {
    title: any;
    note: any;
    folderKey: any;
    locked: any;
    pinned: any;
}): Promise<string>;
export function updateNote(args: any): Promise<{
    done: boolean;
    reason: any;
} | {
    done: boolean;
    reason?: undefined;
}>;
export function trashNote(key: any): Promise<any>;
export function restoreNote(key: any): Promise<any>;
export function purgeExpiredTrash(): Promise<any>;
export function deleteNote(key: any): Promise<void>;
export function getAllNotes(): Promise<any>;
export function getUpcomingTasks(): Promise<any[]>;
export function getAttachmentCount(): Promise<number>;
export function getAttachments(): Promise<any[]>;
export function setSyncedPref({ id, value }: {
    id: any;
    value: any;
}): Promise<void>;
export function getSyncedPrefs({ prefix }: {
    prefix: any;
}): Promise<any>;
export function setTaskChecked({ noteKey, text, checked }: {
    noteKey: any;
    text: any;
    checked: any;
}): Promise<boolean>;
export function prewarmSearch(): Promise<any>;
export function derivedPut({ namespace, entries }: {
    namespace: any;
    entries: any;
}): Promise<{
    ok: boolean;
}>;
export function derivedGet({ namespace, ids }: {
    namespace: any;
    ids: any;
}): Promise<{
    entries: any[];
    ok: boolean;
}>;
export function derivedVersions({ namespace }: {
    namespace: any;
}): Promise<{
    entries: {
        id: any;
        version: any;
    }[];
    ok: boolean;
}>;
export function derivedSearch({ namespace, query, limit }: {
    namespace: any;
    query: any;
    limit: any;
}): Promise<{
    results: {
        id: string;
        score: number;
        chunk: number;
    }[];
    ok: boolean;
}>;
export function derivedRelated({ namespace, id, limit }: {
    namespace: any;
    id: any;
    limit: any;
}): Promise<{
    results: {
        id: any;
        score: number;
        chunk: number;
    }[];
    ok: boolean;
}>;
export function derivedDuplicates({ namespace, textNamespace, pairNamespace, threshold, overlap, checkMs, limit }: {
    namespace: any;
    textNamespace: any;
    pairNamespace: any;
    threshold: any;
    overlap: any;
    checkMs: any;
    limit: any;
}): Promise<{
    pairs: any[];
    checked: number;
    remaining: number;
    ok: boolean;
}>;
export function derivedClear({ namespace }: {
    namespace: any;
}): Promise<{
    ok: boolean;
}>;
export function derivedStats({ namespaces }: {
    namespaces: any;
}): Promise<{
    bytes: any;
    counts: {
        namespace: string;
        count: any;
    }[];
    ok: boolean;
}>;
export function searchNotes({ query, folderKey, includeLocked, limit }: {
    query: any;
    folderKey: any;
    includeLocked: any;
    limit: any;
}): Promise<{
    tookMs: number;
    results: {
        key: any;
        inTitle: boolean;
        snippet: string;
        ranges: any[];
    }[];
    total: number;
}>;
export function getSingleNote({ key }: {
    key: any;
}): Promise<any>;
export function getStoredNote({ key }: {
    key: any;
}): Promise<any>;
export function susbscribeNote({ key }: {
    key: any;
}): Promise<any>;
export function susbscribeNoteKeys(): Promise<any>;
export function getAllNoteKeys(): Promise<any>;
export function updateSettings({ settings }: {
    settings: any;
}): Promise<void>;
export function getSettings(): Promise<any>;
export function subscribeSettings(): Promise<any>;
export function updatePreference({ key, value }: {
    key: any;
    value: any;
}): Promise<void>;
export function getPreference({ key }: {
    key: any;
}): Promise<any>;
export function readKeyrings(): Promise<any>;
export function openLockSession({ password, rootKey, returnRootKey }?: {}): Promise<{
    ok: boolean;
    retryAfter: number;
    reason: string;
}>;
export function closeLockSession(): Promise<boolean>;
export function setNoteLockPassword({ password }: {
    password: any;
}): Promise<boolean>;
export function verifyNoteLockPassword({ password }: {
    password: any;
}): Promise<{
    valid: boolean;
    retryAfter: number;
}>;
export function insertFile({ key, fileName, buffer, path }: {
    key: any;
    fileName: any;
    buffer: any;
    path: any;
}): Promise<{
    link: any;
    combinedKey: string;
    reason?: undefined;
} | {
    reason: string;
    link?: undefined;
    combinedKey?: undefined;
}>;
export function insertFileWithProgress({ key, fileName, path }: {
    key: any;
    fileName: any;
    path: any;
}, onProgress: any, token: any): Promise<{
    link: any;
    combinedKey: string;
}>;
export function getFile({ key }: {
    key: any;
}): Promise<any>;
export function deleteFile(key: any): Promise<any>;
export function deleteNoteFile({ noteKey, mediaPath }: {
    noteKey: any;
    mediaPath: any;
}): Promise<boolean>;
export function reclaimOrphanedBlobs(): Promise<any>;
export function retryDownload({ url }: {
    url: any;
}): Promise<any>;
export function pauseDownload({ url }: {
    url: any;
}): Promise<any>;
export function close(): Promise<void>;
export function requestWriter(): Promise<void>;
export function getIndexerKeys(): Promise<any>;
export function setDeviceIndexer({ localKey, isIndexer }: {
    localKey: any;
    isIndexer: any;
}): Promise<any>;
export function createInvite(opts: any): any;
export function susbscribePairing(cb: any): Promise<any>;
export function susbscribePairUser(cb: any, invite: any, deviceName: any, options: any): Promise<any>;
export function listVaults(): any;
export function createVault({ name }: {
    name: any;
}): Promise<{
    done: boolean;
    code: any;
} | {
    done: boolean;
    id: any;
}>;
export function switchVault({ id }: {
    id: any;
}): Promise<{
    done: boolean;
    code: any;
} | {
    done: boolean;
}>;
export function renameVault({ id, name }: {
    id: any;
    name: any;
}): Promise<{
    done: boolean;
    code: any;
} | {
    done: boolean;
}>;
export function removeVault({ id, force }: {
    id: any;
    force?: boolean;
}): Promise<{
    done: boolean;
    code: any;
} | {
    done: boolean;
    left: any;
    replicated: any;
}>;
export function moveToVault({ targetId, noteKeys, folderKeys }: {
    targetId: any;
    noteKeys: any;
    folderKeys: any;
}): Promise<{
    done: boolean;
    code: any;
} | {
    done: boolean;
    moved: any;
}>;
export function confirmPairing(): any;
export function rejectPairing(): Promise<any>;
export function insertSyncedDevice({ title, deviceType, platform, localKey }: {
    title: any;
    deviceType: any;
    platform: any;
    localKey: any;
}): Promise<string>;
export function updateSyncedDevice({ key, title }: {
    key: any;
    title: any;
}): Promise<void>;
export function deleteSyncedDevice(key: any): Promise<void>;
export function getSyncedDevice({ key }: {
    key: any;
}): Promise<any>;
export function getAllSyncedDeviceKeys(): Promise<any>;
export function subscribeSyncedDevice({ key }: {
    key: any;
}): Promise<any>;
export function subscribeAllSyncedDeviceKeys(): Promise<any>;
export function checkAndInsertLocalDevice(deviceName: any): Promise<void>;
export function getHyperdriveAddress(): any;
export const SUSPEND_SAVE_GRACE_MS: 600;
export function suspendServices(): Promise<void>;
export function resumeServices(): Promise<void>;
export function subscribePresence(cb: any): Promise<() => void>;
export function subscribeDeviceStatus(cb: any): Promise<() => void>;
export function getFilesWaitingToSeal(): any;
export function getNotesStorageInfo(): Promise<any>;
export function subscribeStorageInfo(): Promise<any>;
export function getDownloadsInfo(): any;
export function getUploadsInfo(): any;
export function exportBackup(password: any, filePath: any, cb: any, signal: any, options: any): Promise<any>;
export function getHeldMerge(): Promise<any>;
export function combineHeldMerge(): Promise<any>;
export function checkBackupRestore({ buffer, filePath, password }: {
    buffer: any;
    filePath: any;
    password: any;
}): Promise<any>;
export function importBackup({ buffer, filePath, recoveryKey, password, signal, cb }: {
    buffer: any;
    filePath: any;
    recoveryKey: any;
    password: any;
    signal: any;
    cb: any;
}): Promise<void>;
export function clearStorage(): Promise<void>;
export function getActivity({ filter, deviceKey, noteKey, limit, cursor }?: {}): Promise<any>;
export function getActivityDiff({ id }: {
    id: any;
}): Promise<any>;
export function recoverDiscardedNoteWrite({ id }: {
    id: any;
}): Promise<any>;
export function getActivityStats(): Promise<any>;
export function clearActivity(): Promise<boolean>;
export function subscribeActivity(): Promise<any>;
export function purgeExpiredActivity(): Promise<any>;
export function getDebugInfo({ heavy }?: {}): Promise<any>;
export function getAiOffloadStatus(): Promise<any>;
export function setAiOffloadServing(serving: any): any;
export function subscribeAiOffload(listeners: any): () => void;
export function runAiOffload({ kind, payload, onText }: {
    kind: any;
    payload: any;
    onText: any;
}): any;
export function cancelAiOffload(id: any): any;
export function replyAiOffload(jobId: any, reply: any): any;
//# sourceMappingURL=notesApi.d.ts.map