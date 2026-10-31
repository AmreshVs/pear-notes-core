export function getNote(db: any, key: any): Promise<any>;
export function putNote(db: any, key: any, value: any): any;
export function delNote(db: any, key: any): any;
export function notes(db: any): AsyncGenerator<{
    key: any;
    value: any;
}, void, unknown>;
export function folders(db: any): AsyncGenerator<{
    key: any;
    value: any;
}, void, unknown>;
export function syncedPrefs(db: any, prefix?: string): Promise<{}>;
export function syncedDevices(db: any): AsyncGenerator<{
    key: any;
    value: any;
}, void, unknown>;
export function mediaTombstones(db: any): AsyncGenerator<{
    key: any;
    value: any;
}, void, unknown>;
export function encryptedMediaCores(db: any): AsyncGenerator<{
    key: any;
    value: any;
}, void, unknown>;
export function activityEntries(db: any): AsyncGenerator<{
    key: any;
    value: any;
}, void, unknown>;
export function hasActivityBefore(db: any, boundary: any): Promise<boolean>;
export function activityIdsDescending(db: any, { noteKey, cursor, limit }: {
    noteKey?: string;
    cursor?: string;
    limit: any;
}): Promise<any[]>;
export function activityIdsForNoteAfter(db: any, noteKey: any, afterId: any): AsyncGenerator<any, void, unknown>;
export function activitySnapshots(db: any): AsyncGenerator<{
    key: any;
    value: any;
}, void, unknown>;
export function activityDiscardedEntries(db: any): AsyncGenerator<{
    key: any;
    value: any;
}, void, unknown>;
export function delActivitySessionsForNote(db: any, noteKey: any): Promise<void>;
export function getActivityClearedAt(db: any): Promise<any>;
export function clearAllActivity(db: any): Promise<void>;
export function onNoteChanges(db: any, fn: any): any;
export function getFolder(db: any, key: any): Promise<any>;
export function putFolder(db: any, key: any, value: any): any;
export function delFolder(db: any, key: any): any;
export function getSettings(db: any): Promise<any>;
export function putSettings(db: any, value: any): any;
export function putSyncedPref(db: any, id: any, value: any): any;
export function getSyncedDevice(db: any, key: any): Promise<any>;
export function putSyncedDevice(db: any, key: any, value: any): any;
export function delSyncedDevice(db: any, key: any): any;
export function putMediaTombstone(db: any, refKey: any, value: any): any;
export function delMediaTombstone(db: any, refKey: any): any;
export function putEncryptedMediaCore(db: any, coreKeyHex: any, value: any): any;
export function hasEncryptedMediaCore(db: any, coreKeyHex: any): Promise<boolean>;
export function getActivityEntry(db: any, id: any): Promise<any>;
export function putActivityEntry(db: any, id: any, entry: any): any;
export function delActivityEntry(db: any, id: any): any;
export function activityValuesBefore(db: any, boundary: any): Promise<any[]>;
export function activityIdsForNote(db: any, noteKey: any): Promise<any[]>;
export function getActivitySnapshot(db: any, id: any): Promise<any>;
export function putActivitySnapshot(db: any, id: any, value: any): any;
export function delActivitySnapshot(db: any, id: any): any;
export function getActivityDiscarded(db: any, id: any): Promise<any>;
export function putActivityDiscarded(db: any, id: any, value: any): any;
export function delActivityDiscarded(db: any, id: any): any;
export const SESSION_EDIT: "@notes/activitySessions";
export const SESSION_TITLE: "@notes/activityTitleSessions";
export function getActivitySession(db: any, kind: any, noteKey: any, device: any): Promise<any>;
export function putActivitySession(db: any, kind: any, noteKey: any, device: any, value: any): any;
export function delActivitySession(db: any, kind: any, noteKey: any, device: any): any;
export function putActivityClearedAt(db: any, at: any): any;
export function watchNote(db: any, key: any): Promise<import("./viewWatch.js").KeyWatcher>;
export function watchFolder(db: any, key: any): Promise<import("./viewWatch.js").KeyWatcher>;
export function watchSettings(db: any): Promise<import("./viewWatch.js").KeyWatcher>;
export function watchSyncedDevice(db: any, key: any): Promise<import("./viewWatch.js").KeyWatcher>;
export function watchAll(db: any): Promise<import("./viewWatch.js").ChangeWatcher>;
export function watchNoteKeys(db: any): Promise<import("./viewWatch.js").ChangeWatcher>;
export function watchFolderKeys(db: any): Promise<import("./viewWatch.js").ChangeWatcher>;
export function watchSyncedDeviceKeys(db: any): Promise<import("./viewWatch.js").ChangeWatcher>;
export function watchActivity(db: any): Promise<import("./viewWatch.js").ChangeWatcher>;
//# sourceMappingURL=viewStore.d.ts.map