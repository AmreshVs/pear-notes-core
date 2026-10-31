export const ALL_NOTES_KEY = '84296db76dde4da98c383168b905184d62c31ac117f8bfbc2b8c938cf2728322'
export const RECENTLY_DELETED_KEY =
  '84296db76dde4da98c383168b905184d62c31ac117f8bfbc2b8c938cf2728090'
export const LOCKED_NOTES_KEY = '84296db76dde4da98c383168b905184d62c31ac117f8bfbc2b8c938cf2728091'
export const DEFAULT_FOLDER_NAME = 'Untitled'
export const HYPERDRIVE_URL_PREFIX = 'http://hyperdrive'

const BLOB_URL_NORMALIZE_RE =
  /https?:\/\/[^/?\s"'<>]+(?:\/[0-9a-f]{32})?\/*(?=\?key=[^"'\s]*(?:&|&amp;)blob=)/gi

export const normalizeAttachmentUrls = (content) =>
  typeof content === 'string'
    ? content.replace(BLOB_URL_NORMALIZE_RE, HYPERDRIVE_URL_PREFIX + '/')
    : content
export const LAST_SYNC_AT_KEY = 'lastSyncAt'
export const LAST_SYNC_LENGTH_KEY = 'lastSyncLength'
export const LAST_SYNC_RECEIVED_KEY = 'lastSyncReceived'
export const LAST_WAKE_AT_KEY = 'lastWakeAt'
export const LAST_WAKE_RESULT_KEY = 'lastWakeResult'
export const BACKGROUND_SERVICE_FAILED_AT_KEY = 'backgroundServiceFailedAt'

export const SYNC_WAKE_RESULT = {
  OK: 'ok',
  NO_CHANGES: 'no-changes',
  NO_WORKLET: 'no-worklet',
  ERROR: 'error'
}

export const SYNC_ACTIVITY_WRITE_INTERVAL_MS = 5000

export const STORAGE_INFO_DEBOUNCE_MS = 1000
export const STORAGE_INFO_MAX_WAIT_MS = 5000
export const TRANSFER_INFO_DEBOUNCE_MS = 250
export const TRANSFER_INFO_MAX_WAIT_MS = 1000

export const EDITOR_SYNC = {
  NONE: 'none',
  ADOPT: 'adopt',
  CONFLICT: 'conflict'
}

export const MEDIA_SYNC_PAUSED_KEY = 'mediaSyncPaused'
export const METERED_CONNECTION_KEY = 'meteredConnection'
export const HOLD_MEDIA_ON_CELLULAR_KEY = 'holdMediaOnCellular'
export const LOCK_SCREENSHOT_PROTECTION_KEY = 'lockScreenshotProtection'
export const LOCK_SWITCHER_HIDE_KEY = 'lockSwitcherHide'

export const TRASH_RETENTION_DAYS = 30
export const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000

export const INVITE_EXPIRY_MINUTES = 10
export const INVITE_EXPIRY_MS = INVITE_EXPIRY_MINUTES * 60 * 1000
export const INVITE_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000

export const PAIRING_PROTOCOL = 'pear-notes://pairing/'
export const VAULT_INVITE_PROTOCOL = 'pear-notes://join-vault/'
export const INVITE_KIND = { DEVICE: 'device', VAULT: 'vault' }
export const PAIRING_INVITE_REMOVED = 'invite_removed'
export const PAIRING_INVITE_VERSION = 3
export const PAIRING_HOST_UNVERIFIED = 'host_unverified'
export const UPDATE_REQUIRED = 'UPDATE_REQUIRED'
export const UPDATE_CLEARED = 'UPDATE_CLEARED'
export const HELD_MERGE_CHANGED = 'HELD_MERGE_CHANGED'
export const LOCK_REFUSAL = {
  SESSION_CLOSED: 'LOCK_SESSION_CLOSED',
  FILES_MISSING: 'FILES_MISSING',
  FILES_SEALED: 'FILES_SEALED'
}

export const PAIRING_OUTDATED = {
  INVITE: 'invite_outdated',
  HOST: 'host_outdated',
  JOINER: 'joiner_outdated'
}
export const APP_UPDATE_MANIFEST_URL = 'https://amreshvs.github.io/pear-notes/version.json'

export const BACKUP_ERROR = {
  INVALID_FILE: 'BACKUP_ERROR_INVALID_FILE',
  INCORRECT_RECOVERY_KEY: 'BACKUP_ERROR_INCORRECT_RECOVERY_KEY',
  INCORRECT_PASSWORD: 'BACKUP_ERROR_INCORRECT_PASSWORD',
  UNSUPPORTED_VERSION: 'BACKUP_ERROR_UNSUPPORTED_VERSION',
  PASSWORD_REQUIRED: 'BACKUP_ERROR_PASSWORD_REQUIRED',
  CANCELLED: 'BACKUP_ERROR_CANCELLED',
  // Strict export only: something a note references could not be put in the backup.
  // The thrown error carries the full list on `.missing`.
  INCOMPLETE: 'BACKUP_ERROR_INCOMPLETE'
}

export const BACKUP_PASSWORD_MIN_LENGTH = 10

export const INDEXER_ERROR = {
  UNKNOWN_DEVICE: 'INDEXER_ERROR_UNKNOWN_DEVICE',
  LAST_INDEXER: 'INDEXER_ERROR_LAST_INDEXER',
  DEVICE_OFFLINE: 'INDEXER_ERROR_DEVICE_OFFLINE',
  LEADER_OFFLINE: 'INDEXER_ERROR_LEADER_OFFLINE',
  TRANSFER_TIMEOUT: 'INDEXER_ERROR_TRANSFER_TIMEOUT',
  MAX_LEADERS: 'INDEXER_ERROR_MAX_LEADERS'
}

export const MAX_SYNC_LEADERS = 3

export const INDEXER_TRANSFER_TIMEOUT_MS = 90 * 1000

export const INDEXER_TRANSFER_STEP = {
  SUBMITTING: 'submitting',
  CONFIRMING: 'confirming'
}

// Flip to true to see raw keys, paths and addresses on the debug screen. Off by default so a
// screenshot or a shoulder-surf cannot carry them away.
export const SHOW_SENSITIVE_DEBUG_INFO = false

// The debug snapshot fields that identify the vault, its media drive or the machine it runs on.
// The encryption fingerprint is deliberately absent - it is a digest, not a secret, and it is what
// tells two devices apart when a support request comes in.
export const SENSITIVE_DEBUG_KEYS = [
  'autobaseKey',
  'discoveryKey',
  'systemKey',
  'localKey',
  'indexerKeys',
  'publicKey',
  'connectedKeys',
  'driveKey',
  'driveDiscoveryKey',
  'driveContentKey',
  'corePath',
  'blobServerAddress',
  'swarmKey',
  'deviceName'
]

// Multiple vaults per device. Dev builds always have it; set to true to ship it.
export const MULTI_VAULT_RELEASED = true

export const isMultiVaultEnabled = () => MULTI_VAULT_RELEASED || globalThis.__PEAR_DEV__ === true

export const READ_ALOUD_RELEASED = false

export const isReadAloudEnabled = () => READ_ALOUD_RELEASED || globalThis.__PEAR_DEV__ === true

export const MAX_VAULTS = 10
export const VAULT_NAME_MAX_LENGTH = 40

export const VAULT_ERROR = {
  EMPTY_NAME: 'VAULT_ERROR_EMPTY_NAME',
  MAX_VAULTS: 'VAULT_ERROR_MAX_VAULTS',
  UNKNOWN_VAULT: 'VAULT_ERROR_UNKNOWN_VAULT',
  LAST_VAULT: 'VAULT_ERROR_LAST_VAULT',
  BUSY: 'VAULT_ERROR_BUSY',
  SYNC_LEADER: 'VAULT_ERROR_SYNC_LEADER',
  SAME_VAULT: 'VAULT_ERROR_SAME_VAULT',
  NOTHING_TO_MOVE: 'VAULT_ERROR_NOTHING_TO_MOVE',
  MISSING_MEDIA: 'VAULT_ERROR_MISSING_MEDIA',
  OPEN_FAILED: 'VAULT_ERROR_OPEN_FAILED'
}

export const sanitizeVaultName = (name) => {
  if (typeof name !== 'string') return ''
  return name.replace(/\s+/g, ' ').trim().slice(0, VAULT_NAME_MAX_LENGTH)
}

export const PREFERENCE_DIR = 'device-preferences'
export const PREFERENCE_LEGACY_DIR = 'preferences'

export const FOLDER_NAME_MAX_LENGTH = 50
export const DEVICE_NAME_MAX_LENGTH = 40

export const sanitizeDeviceName = (name) => {
  if (typeof name !== 'string') return ''
  return name.replace(/\s+/g, ' ').trim().slice(0, DEVICE_NAME_MAX_LENGTH)
}
export const NOTE_TITLE_MAX_LENGTH = 200
export const SEARCH_QUERY_MAX_LENGTH = 100
export const PASSWORD_MAX_LENGTH = 128

export const FOLDER_ERROR = {
  EMPTY_NAME: 'FOLDER_ERROR_EMPTY_NAME',
  DUPLICATE_NAME: 'FOLDER_ERROR_DUPLICATE_NAME'
}

export const DEFAULT_FOLDER_ICON = 'folder'
export const FOLDER_ICONS = [
  'folder',
  'briefcase',
  'home',
  'people',
  'idea',
  'tasks',
  'calendar',
  'book',
  'study',
  'code',
  'design',
  'project',
  'chart',
  'finance',
  'shopping',
  'recipes',
  'travel',
  'health',
  'star',
  'archive',
  'heart',
  'music',
  'camera',
  'film',
  'mic',
  'pets',
  'leaf',
  'coffee',
  'fitness',
  'target',
  'globe',
  'building',
  'gift',
  'map',
  'trophy'
]

export const SWARM_SEED_FILE = 'swarm-seed'

// Old vaults moved aside by a storage migration; nothing reads them again.
export const PRESERVED_VAULT_PREFIXES = ['pre-rewrite', 'pre-hyperdb']

export const ACTIVITY_LOG_ENABLED_KEY = 'activityLogEnabled'
export const ACTIVITY_RETENTION_DAYS_KEY = 'activityRetentionDays'
export const ACTIVITY_RETENTION_FOREVER = 36500
export const ACTIVITY_RETENTION_DAY_OPTIONS = [7, 30, 90, 180, 365, ACTIVITY_RETENTION_FOREVER]
export const ACTIVITY_DEFAULT_RETENTION_DAYS = 90
export const ACTIVITY_SESSION_WINDOW_MS = 5 * 60 * 1000
export const ACTIVITY_SNAPSHOT_MAX_BYTES = 128 * 1024
export const ACTIVITY_PAGE_SIZE = 40

export const ACTIVITY_FILTER = {
  ALL: 'all',
  NOTES: 'notes',
  FOLDERS: 'folders',
  DEVICES: 'devices'
}

export const ACTIVITY_TARGET = {
  NOTE: 'note',
  FOLDER: 'folder',
  DEVICE: 'device',
  SYSTEM: 'system'
}

export const ACTIVITY_EVENT = {
  NOTE_CREATED: 'note.created',
  NOTE_EDITED: 'note.edited',
  NOTE_EDIT_DISCARDED: 'note.edit_discarded',
  NOTE_RENAMED: 'note.renamed',
  NOTE_MOVED: 'note.moved',
  NOTE_TRASHED: 'note.trashed',
  NOTE_RESTORED: 'note.restored',
  NOTE_DELETED: 'note.deleted',
  NOTE_PINNED: 'note.pinned',
  NOTE_UNPINNED: 'note.unpinned',
  NOTE_LOCKED: 'note.locked',
  NOTE_UNLOCKED: 'note.unlocked',
  NOTE_ATTACHMENT_ADDED: 'note.attachment_added',
  NOTE_ATTACHMENT_REMOVED: 'note.attachment_removed',
  FOLDER_CREATED: 'folder.created',
  FOLDER_RENAMED: 'folder.renamed',
  FOLDER_DELETED: 'folder.deleted',
  INVITE_CREATED: 'invite.created',
  INVITE_EXPIRED: 'invite.expired',
  DEVICE_APPROVED: 'device.approved',
  DEVICE_REJECTED: 'device.rejected',
  DEVICE_RENAMED: 'device.renamed',
  DEVICE_REMOVED: 'device.removed',
  BACKUP_RESTORED: 'backup.restored'
}

export const ACTIVITY_EVENT_TARGETS = {
  [ACTIVITY_EVENT.NOTE_CREATED]: ACTIVITY_TARGET.NOTE,
  [ACTIVITY_EVENT.NOTE_EDITED]: ACTIVITY_TARGET.NOTE,
  [ACTIVITY_EVENT.NOTE_EDIT_DISCARDED]: ACTIVITY_TARGET.NOTE,
  [ACTIVITY_EVENT.NOTE_RENAMED]: ACTIVITY_TARGET.NOTE,
  [ACTIVITY_EVENT.NOTE_MOVED]: ACTIVITY_TARGET.NOTE,
  [ACTIVITY_EVENT.NOTE_TRASHED]: ACTIVITY_TARGET.NOTE,
  [ACTIVITY_EVENT.NOTE_RESTORED]: ACTIVITY_TARGET.NOTE,
  [ACTIVITY_EVENT.NOTE_DELETED]: ACTIVITY_TARGET.NOTE,
  [ACTIVITY_EVENT.NOTE_PINNED]: ACTIVITY_TARGET.NOTE,
  [ACTIVITY_EVENT.NOTE_UNPINNED]: ACTIVITY_TARGET.NOTE,
  [ACTIVITY_EVENT.NOTE_LOCKED]: ACTIVITY_TARGET.NOTE,
  [ACTIVITY_EVENT.NOTE_UNLOCKED]: ACTIVITY_TARGET.NOTE,
  [ACTIVITY_EVENT.NOTE_ATTACHMENT_ADDED]: ACTIVITY_TARGET.NOTE,
  [ACTIVITY_EVENT.NOTE_ATTACHMENT_REMOVED]: ACTIVITY_TARGET.NOTE,
  [ACTIVITY_EVENT.FOLDER_CREATED]: ACTIVITY_TARGET.FOLDER,
  [ACTIVITY_EVENT.FOLDER_RENAMED]: ACTIVITY_TARGET.FOLDER,
  [ACTIVITY_EVENT.FOLDER_DELETED]: ACTIVITY_TARGET.FOLDER,
  [ACTIVITY_EVENT.INVITE_CREATED]: ACTIVITY_TARGET.SYSTEM,
  [ACTIVITY_EVENT.INVITE_EXPIRED]: ACTIVITY_TARGET.SYSTEM,
  [ACTIVITY_EVENT.DEVICE_APPROVED]: ACTIVITY_TARGET.DEVICE,
  [ACTIVITY_EVENT.DEVICE_REJECTED]: ACTIVITY_TARGET.DEVICE,
  [ACTIVITY_EVENT.DEVICE_RENAMED]: ACTIVITY_TARGET.DEVICE,
  [ACTIVITY_EVENT.DEVICE_REMOVED]: ACTIVITY_TARGET.DEVICE,
  [ACTIVITY_EVENT.BACKUP_RESTORED]: ACTIVITY_TARGET.SYSTEM
}
