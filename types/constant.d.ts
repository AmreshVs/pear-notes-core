export const ALL_NOTES_KEY: "84296db76dde4da98c383168b905184d62c31ac117f8bfbc2b8c938cf2728322";
export const RECENTLY_DELETED_KEY: "84296db76dde4da98c383168b905184d62c31ac117f8bfbc2b8c938cf2728090";
export const LOCKED_NOTES_KEY: "84296db76dde4da98c383168b905184d62c31ac117f8bfbc2b8c938cf2728091";
export const DEFAULT_FOLDER_NAME: "Untitled";
export const HYPERDRIVE_URL_PREFIX: "http://hyperdrive";
export function normalizeAttachmentUrls(content: any): any;
export const LAST_SYNC_AT_KEY: "lastSyncAt";
export const LAST_SYNC_LENGTH_KEY: "lastSyncLength";
export const LAST_SYNC_RECEIVED_KEY: "lastSyncReceived";
export const LAST_WAKE_AT_KEY: "lastWakeAt";
export const LAST_WAKE_RESULT_KEY: "lastWakeResult";
export const BACKGROUND_SERVICE_FAILED_AT_KEY: "backgroundServiceFailedAt";
export namespace SYNC_WAKE_RESULT {
    let OK: string;
    let NO_CHANGES: string;
    let NO_WORKLET: string;
    let ERROR: string;
}
export const SYNC_ACTIVITY_WRITE_INTERVAL_MS: 5000;
export const STORAGE_INFO_DEBOUNCE_MS: 1000;
export const STORAGE_INFO_MAX_WAIT_MS: 5000;
export const TRANSFER_INFO_DEBOUNCE_MS: 250;
export const TRANSFER_INFO_MAX_WAIT_MS: 1000;
export namespace EDITOR_SYNC {
    let NONE: string;
    let ADOPT: string;
    let CONFLICT: string;
}
export const MEDIA_SYNC_PAUSED_KEY: "mediaSyncPaused";
export const METERED_CONNECTION_KEY: "meteredConnection";
export const HOLD_MEDIA_ON_CELLULAR_KEY: "holdMediaOnCellular";
export const LOCK_SCREENSHOT_PROTECTION_KEY: "lockScreenshotProtection";
export const LOCK_SWITCHER_HIDE_KEY: "lockSwitcherHide";
export const TRASH_RETENTION_DAYS: 30;
export const TRASH_RETENTION_MS: number;
export const INVITE_EXPIRY_MINUTES: 10;
export const INVITE_EXPIRY_MS: number;
export const INVITE_CLOCK_SKEW_MS: number;
export const PAIRING_PROTOCOL: "pear-notes://pairing/";
export const VAULT_INVITE_PROTOCOL: "pear-notes://join-vault/";
export namespace INVITE_KIND {
    let DEVICE: string;
    let VAULT: string;
}
export const PAIRING_INVITE_REMOVED: "invite_removed";
export const PAIRING_INVITE_VERSION: 3;
export const PAIRING_HOST_UNVERIFIED: "host_unverified";
export const UPDATE_REQUIRED: "UPDATE_REQUIRED";
export const UPDATE_CLEARED: "UPDATE_CLEARED";
export const HELD_MERGE_CHANGED: "HELD_MERGE_CHANGED";
export namespace LOCK_REFUSAL {
    let SESSION_CLOSED: string;
    let FILES_MISSING: string;
    let FILES_SEALED: string;
}
export namespace PAIRING_OUTDATED {
    let INVITE: string;
    let HOST: string;
    let JOINER: string;
}
export const APP_UPDATE_MANIFEST_URL: "https://amreshvs.github.io/pear-notes/version.json";
export namespace BACKUP_ERROR {
    let INVALID_FILE: string;
    let INCORRECT_RECOVERY_KEY: string;
    let INCORRECT_PASSWORD: string;
    let UNSUPPORTED_VERSION: string;
    let PASSWORD_REQUIRED: string;
    let CANCELLED: string;
    let INCOMPLETE: string;
}
export const BACKUP_PASSWORD_MIN_LENGTH: 10;
export namespace INDEXER_ERROR {
    let UNKNOWN_DEVICE: string;
    let LAST_INDEXER: string;
    let DEVICE_OFFLINE: string;
    let LEADER_OFFLINE: string;
    let TRANSFER_TIMEOUT: string;
    let MAX_LEADERS: string;
}
export const MAX_SYNC_LEADERS: 3;
export const INDEXER_TRANSFER_TIMEOUT_MS: number;
export namespace INDEXER_TRANSFER_STEP {
    let SUBMITTING: string;
    let CONFIRMING: string;
}
export const SHOW_SENSITIVE_DEBUG_INFO: false;
export const SENSITIVE_DEBUG_KEYS: string[];
export const MULTI_VAULT_RELEASED: true;
export function isMultiVaultEnabled(): boolean;
export const READ_ALOUD_RELEASED: false;
export function isReadAloudEnabled(): boolean;
export const MAX_VAULTS: 10;
export const VAULT_NAME_MAX_LENGTH: 40;
export namespace VAULT_ERROR {
    let EMPTY_NAME: string;
    let MAX_VAULTS: string;
    let UNKNOWN_VAULT: string;
    let LAST_VAULT: string;
    let BUSY: string;
    let SYNC_LEADER: string;
    let SAME_VAULT: string;
    let NOTHING_TO_MOVE: string;
    let MISSING_MEDIA: string;
    let OPEN_FAILED: string;
}
export function sanitizeVaultName(name: any): string;
export const PREFERENCE_DIR: "device-preferences";
export const PREFERENCE_LEGACY_DIR: "preferences";
export const FOLDER_NAME_MAX_LENGTH: 50;
export const DEVICE_NAME_MAX_LENGTH: 40;
export function sanitizeDeviceName(name: any): string;
export const NOTE_TITLE_MAX_LENGTH: 200;
export const SEARCH_QUERY_MAX_LENGTH: 100;
export const PASSWORD_MAX_LENGTH: 128;
export namespace FOLDER_ERROR {
    let EMPTY_NAME_1: string;
    export { EMPTY_NAME_1 as EMPTY_NAME };
    export let DUPLICATE_NAME: string;
}
export const DEFAULT_FOLDER_ICON: "folder";
export const FOLDER_ICONS: string[];
export const SWARM_SEED_FILE: "swarm-seed";
export const PRESERVED_VAULT_PREFIXES: string[];
export const ACTIVITY_LOG_ENABLED_KEY: "activityLogEnabled";
export const ACTIVITY_RETENTION_DAYS_KEY: "activityRetentionDays";
export const ACTIVITY_RETENTION_FOREVER: 36500;
export const ACTIVITY_RETENTION_DAY_OPTIONS: number[];
export const ACTIVITY_DEFAULT_RETENTION_DAYS: 90;
export const ACTIVITY_SESSION_WINDOW_MS: number;
export const ACTIVITY_SNAPSHOT_MAX_BYTES: number;
export const ACTIVITY_PAGE_SIZE: 40;
export namespace ACTIVITY_FILTER {
    let ALL: string;
    let NOTES: string;
    let FOLDERS: string;
    let DEVICES: string;
}
export namespace ACTIVITY_TARGET {
    export let NOTE: string;
    export let FOLDER: string;
    let DEVICE_1: string;
    export { DEVICE_1 as DEVICE };
    export let SYSTEM: string;
}
export namespace ACTIVITY_EVENT {
    let NOTE_CREATED: string;
    let NOTE_EDITED: string;
    let NOTE_EDIT_DISCARDED: string;
    let NOTE_RENAMED: string;
    let NOTE_MOVED: string;
    let NOTE_TRASHED: string;
    let NOTE_RESTORED: string;
    let NOTE_DELETED: string;
    let NOTE_PINNED: string;
    let NOTE_UNPINNED: string;
    let NOTE_LOCKED: string;
    let NOTE_UNLOCKED: string;
    let NOTE_ATTACHMENT_ADDED: string;
    let NOTE_ATTACHMENT_REMOVED: string;
    let FOLDER_CREATED: string;
    let FOLDER_RENAMED: string;
    let FOLDER_DELETED: string;
    let INVITE_CREATED: string;
    let INVITE_EXPIRED: string;
    let DEVICE_APPROVED: string;
    let DEVICE_REJECTED: string;
    let DEVICE_RENAMED: string;
    let DEVICE_REMOVED: string;
    let BACKUP_RESTORED: string;
}
export const ACTIVITY_EVENT_TARGETS: {
    [ACTIVITY_EVENT.NOTE_CREATED]: string;
    [ACTIVITY_EVENT.NOTE_EDITED]: string;
    [ACTIVITY_EVENT.NOTE_EDIT_DISCARDED]: string;
    [ACTIVITY_EVENT.NOTE_RENAMED]: string;
    [ACTIVITY_EVENT.NOTE_MOVED]: string;
    [ACTIVITY_EVENT.NOTE_TRASHED]: string;
    [ACTIVITY_EVENT.NOTE_RESTORED]: string;
    [ACTIVITY_EVENT.NOTE_DELETED]: string;
    [ACTIVITY_EVENT.NOTE_PINNED]: string;
    [ACTIVITY_EVENT.NOTE_UNPINNED]: string;
    [ACTIVITY_EVENT.NOTE_LOCKED]: string;
    [ACTIVITY_EVENT.NOTE_UNLOCKED]: string;
    [ACTIVITY_EVENT.NOTE_ATTACHMENT_ADDED]: string;
    [ACTIVITY_EVENT.NOTE_ATTACHMENT_REMOVED]: string;
    [ACTIVITY_EVENT.FOLDER_CREATED]: string;
    [ACTIVITY_EVENT.FOLDER_RENAMED]: string;
    [ACTIVITY_EVENT.FOLDER_DELETED]: string;
    [ACTIVITY_EVENT.INVITE_CREATED]: string;
    [ACTIVITY_EVENT.INVITE_EXPIRED]: string;
    [ACTIVITY_EVENT.DEVICE_APPROVED]: string;
    [ACTIVITY_EVENT.DEVICE_REJECTED]: string;
    [ACTIVITY_EVENT.DEVICE_RENAMED]: string;
    [ACTIVITY_EVENT.DEVICE_REMOVED]: string;
    [ACTIVITY_EVENT.BACKUP_RESTORED]: string;
};
//# sourceMappingURL=constant.d.ts.map