export const BACKEND_TIMEOUT: "BACKEND_TIMEOUT";
export function setLocalDeviceName(name: any): void;
export function getLocalDeviceName(): string;
export namespace backendApi {
    function ready({ storage, encryption, entropy, appVersion }: {
        storage: any;
        encryption: any;
        entropy?: any;
        appVersion?: string;
    }): Promise<any>;
    function destroy(): any;
    function startFreshVault({ storage }: {
        storage: any;
    }): any;
    function getChore(): any;
    function suspendServices(): any;
    function resumeServices(): any;
    function insertNote({ title, note, folderKey, locked, pinned }: {
        title: any;
        note: any;
        folderKey: any;
        locked: any;
        pinned: any;
    }): Promise<any>;
    function updateNote({ key, title, note, folderKey, locked, pinned }: {
        key: any;
        title: any;
        note: any;
        folderKey: any;
        locked: any;
        pinned: any;
    }): Promise<any>;
    function deleteNote(key: any): Promise<any>;
    function trashNote(key: any): Promise<boolean>;
    function restoreNote(key: any): Promise<{
        done: boolean;
        folderKey: any;
    }>;
    function purgeExpiredTrash(): Promise<any>;
    function getActivity({ filter, deviceKey, noteKey, limit, cursor }?: {}): Promise<{
        entries: any;
        cursor: any;
        hasMore: boolean;
    }>;
    function getActivityDiff({ id }: {
        id: any;
    }): Promise<any>;
    function recoverDiscardedNoteWrite({ id }: {
        id: any;
    }): Promise<{
        done: boolean;
        noteKey: any;
    }>;
    function getActivityStats(): Promise<any>;
    function getDebugInfo({ heavy }?: {}): Promise<any>;
    function captureAppLogs(): void;
    function getErrorLog(): Promise<any>;
    function setErrorLogEnabled(enabled: any): Promise<boolean>;
    function clearErrorLog(): Promise<boolean>;
    function clearActivity(): Promise<boolean>;
    function subscribeActivity(): Promise<any>;
    function getAllNotes(): Promise<any>;
    function getSingleNote({ key }: {
        key: any;
    }): Promise<any>;
    function searchNotes({ query, folderKey, includeLocked, limit }: {
        query: any;
        folderKey: any;
        includeLocked?: boolean;
        limit?: number;
    }): Promise<any>;
    function derivedPut({ namespace, entries }: {
        namespace: any;
        entries: any;
    }): Promise<any>;
    function derivedGet({ namespace, ids }: {
        namespace: any;
        ids: any;
    }): Promise<any>;
    function derivedVersions({ namespace }: {
        namespace: any;
    }): Promise<any>;
    function derivedSearch({ namespace, query, limit }: {
        namespace: any;
        query: any;
        limit?: number;
    }): Promise<any>;
    function derivedRelated({ namespace, id, limit }: {
        namespace: any;
        id: any;
        limit?: number;
    }): Promise<any>;
    function derivedDuplicates({ namespace, textNamespace, pairNamespace, threshold, overlap, checkMs, limit }: {
        namespace: any;
        textNamespace?: string;
        pairNamespace: any;
        threshold: any;
        overlap?: number;
        checkMs?: number;
        limit?: number;
    }): Promise<any>;
    function derivedClear({ namespace }?: {
        namespace?: string;
    }): Promise<any>;
    function derivedStats({ namespaces }?: {
        namespaces?: any[];
    }): Promise<any>;
    function prewarmSearch(): Promise<boolean>;
    function subscribeNote({ key, summary }: {
        key: any;
        summary?: boolean;
    }): Promise<any>;
    function subscribeAllNoteKeys(): Promise<any>;
    function insertFolder({ title, icon }: {
        title: any;
        icon: any;
    }): Promise<any>;
    function updateFolder({ key, title, icon }: {
        key: any;
        title: any;
        icon: any;
    }): Promise<any>;
    function deleteFolder(key: any): Promise<any>;
    function getAllFolders(): Promise<any>;
    function getSingleFolder({ key }: {
        key: any;
    }): Promise<any>;
    function subscribeFolder({ key }: {
        key: any;
    }): Promise<any>;
    function subscribeFolders(): Promise<any>;
    function insertFile({ key, fileName, buffer, path }: {
        key: any;
        fileName: any;
        buffer: any;
        path: any;
    }): Promise<any>;
    function insertFileWithProgress({ key, fileName, path }: {
        key: any;
        fileName: any;
        path: any;
    }): any;
    function deleteFile(key: any): Promise<any>;
    function deleteNoteFile({ noteKey, mediaPath }: {
        noteKey: any;
        mediaPath: any;
    }): Promise<any>;
    function reclaimOrphanedBlobs(): Promise<any>;
    function retryDownload({ url }: {
        url: any;
    }): Promise<any>;
    function pauseDownload({ url }: {
        url: any;
    }): Promise<any>;
    function createInvite({ regenerate }?: {
        regenerate?: boolean;
    }): Promise<any>;
    function subscribePairing(): Promise<any>;
    function getHeldMerge(): Promise<{
        held: boolean;
        blocking: any;
    }>;
    function combineHeldMerge(): Promise<boolean>;
    function subscribePairUser({ invite, mode, vaultName }: {
        invite: any;
        mode: any;
        vaultName: any;
    }): Promise<any>;
    function listVaults(): Promise<any>;
    function createVault({ name }: {
        name: any;
    }): Promise<any>;
    function switchVault({ id }: {
        id: any;
    }): Promise<any>;
    function renameVault({ id, name }: {
        id: any;
        name: any;
    }): Promise<any>;
    function removeVault({ id, force }: {
        id: any;
        force?: boolean;
    }): Promise<any>;
    function moveToVault({ targetId, noteKeys, folderKeys }: {
        targetId: any;
        noteKeys?: any[];
        folderKeys?: any[];
    }): Promise<any>;
    function confirmPairing(): Promise<any>;
    function rejectPairing(): Promise<any>;
    function insertSyncedDevice({ title, deviceType, platform, localKey }: {
        title: any;
        deviceType: any;
        platform: any;
        localKey: any;
    }): Promise<any>;
    function updateSyncedDevice({ key, title }: {
        key: any;
        title: any;
    }): Promise<any>;
    function deleteSyncedDevice(key: any): Promise<any>;
    function setDeviceIndexer({ localKey, isIndexer }: {
        localKey: any;
        isIndexer: any;
    }): Promise<any>;
    function subscribeSyncedDevice({ key }: {
        key: any;
    }): Promise<any>;
    function subscribeAllSyncedDeviceKeys(): Promise<any>;
    function updateSettings({ settings }: {
        settings: any;
    }): Promise<any>;
    function getSettings(): Promise<any>;
    function subscribeSettings(): Promise<any>;
    function checkAndInsertLocalDevice(): Promise<any>;
    function updatePreference({ key, value }: {
        key: any;
        value: any;
    }): Promise<any>;
    function getPreference({ key }: {
        key: any;
    }): Promise<any>;
    function setNoteLockPassword({ password }: {
        password: any;
    }): Promise<any>;
    function verifyNoteLockPassword({ password }: {
        password: any;
    }): Promise<{
        valid: boolean;
        retryAfter: any;
    }>;
    function openLockSession({ password, rootKey, returnRootKey }?: {}): Promise<{
        ok: boolean;
        retryAfter: any;
        rootKey: any;
        reason: any;
    }>;
    function closeLockSession(): Promise<boolean>;
    function aiOffloadStatus(): any;
    function aiOffloadRun({ runId, kind, payload }: {
        runId: any;
        kind: any;
        payload: any;
    }): any;
    function aiOffloadCancel({ runId }: {
        runId: any;
    }): any;
    function aiOffloadServe({ serving }: {
        serving: any;
    }): Promise<any>;
    function aiOffloadJobs(): any;
    function aiOffloadReply({ jobId, text, done, error, data }: {
        jobId: any;
        text: any;
        done: any;
        error: any;
        data: any;
    }): any;
    function getUpcomingTasks(): Promise<any>;
    function getAttachmentCount(): Promise<any>;
    function getAttachments(): Promise<any>;
    function setSyncedPref(id: any, value: any): Promise<boolean>;
    function getSyncedPrefs(prefix?: string): Promise<any>;
    function setTaskChecked({ noteKey, text, checked }: {
        noteKey: any;
        text: any;
        checked: any;
    }): Promise<boolean>;
    function subscribeDeviceStatus(): Promise<any>;
    function clearStorage(): Promise<any>;
    function subscribeStorageInfo(): Promise<any>;
    function exportBackup({ password, filePath }: {
        password: any;
        filePath: any;
    }): Promise<any>;
    function checkBackupRestore({ buffer, filePath, password }: {
        buffer: any;
        filePath: any;
        password: any;
    }): Promise<{
        sealed: boolean;
        blocking: any;
    }>;
    function importBackup({ buffer, filePath, recoveryKey, password }: {
        buffer: any;
        filePath: any;
        recoveryKey: any;
        password: any;
    }): Promise<any>;
}
//# sourceMappingURL=api.d.ts.map