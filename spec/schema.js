import HRPCBuilder from 'hrpc'
import Hyperschema from 'hyperschema'

const SCHEMA_DIR = './spec/hyperschema'
const HRPC_DIR = './spec/hrpc'

const NAMESPACE = 'notes'
const REQUEST = 'request'
const RESPONSE = 'response'

// register schema
const schema = Hyperschema.from(SCHEMA_DIR)
const schemaNs = schema.namespace(NAMESPACE)

const COMMAND_READY = 'command-ready'
const COMMAND_DESTROY = 'command-destroy'
const COMMAND_CLEAR_STORAGE = 'command-clear-storage'

const COMMAND_CHORE = 'command-chore'

const COMMAND_INSERT_FOLDER = 'command-insert-folder'
const COMMAND_UPDATE_FOLDER = 'command-update-folder'
const COMMAND_DELETE_FOLDER = 'command-delete-folder'
const COMMAND_GET_ALL_FOLDERS = 'command-get-all-folders'
const COMMAND_GET_SINGLE_FOLDER = 'command-get-single-folder'
const COMMAND_SUBSCRIBE_FOLDER = 'command-subscribe-folder'
const COMMAND_SUBSCRIBE_FOLDER_KEYS = 'command-subscribe-folder-keys'

const COMMAND_INSERT_NOTE = 'command-insert-note'
const COMMAND_UPDATE_NOTE = 'command-update-note'
const COMMAND_DELETE_NOTE = 'command-delete-note'
const COMMAND_TRASH_NOTE = 'command-trash-note'
const COMMAND_RESTORE_NOTE = 'command-restore-note'
const COMMAND_PURGE_EXPIRED_TRASH = 'command-purge-expired-trash'
const COMMAND_GET_ALL_NOTES = 'command-get-all-notes'
const COMMAND_GET_SINGLE_NOTE = 'command-get-single-note'
const COMMAND_SUBSCRIBE_NOTE = 'command-subscribe-note'
const COMMAND_SUBSCRIBE_NOTE_KEYS = 'command-subscribe-note-keys'

const COMMAND_INSERT_SYNCED_DEVICE = 'command-insert-synced-device'
const COMMAND_UPDATE_SYNCED_DEVICE = 'command-update-synced-device'
const COMMAND_DELETE_SYNCED_DEVICE = 'command-delete-synced-device'
const COMMAND_SUBSCRIBE_SYNCED_DEVICE = 'command-subscribe-synced-device'
const COMMAND_SUBSCRIBE_ALL_SYNCED_DEVICE_KEYS = 'command-subscribe-all-synced-device-keys'
const COMMAND_SUBSCRIBE_DEVICE_STATUS = 'command-subscribe-device-status'
const COMMAND_SET_DEVICE_INDEXER = 'command-set-device-indexer'

const COMMAND_INSERT_FILE = 'command-insert-file'
const COMMAND_INSERT_FILE_PROGRESS = 'command-insert-file-progress'
const COMMAND_DELETE_FILE = 'command-delete-file'
const COMMAND_DELETE_NOTE_FILE = 'command-delete-note-file'

const COMMAND_CREATE_INVITE = 'command-create-invite'
const COMMAND_SUBSCRIBE_PAIRING = 'command-subscribe-pairing'
const COMMAND_SUBSCRIBE_PAIR_USER = 'command-subscribe-pair-user'
const COMMAND_CONFIRM_PAIRING = 'command-confirm-pairing'
const COMMAND_REJECT_PAIRING = 'command-reject-pairing'
const COMMAND_UPDATE_SETTINGS = 'command-update-settings'
const COMMAND_GET_SETTINGS = 'command-get-settings'
const COMMAND_SUBSCRIBE_SETTINGS = 'command-subscribe-settings'

const COMMAND_UPDATE_PREFERENCE = 'command-update-preference'
const COMMAND_GET_PREFERENCE = 'command-get-preference'

const COMMAND_SET_NOTE_LOCK_PASSWORD = 'command-set-note-lock-password'
const COMMAND_VERIFY_NOTE_LOCK_PASSWORD = 'command-verify-note-lock-password'
const COMMAND_OPEN_LOCK_SESSION = 'command-open-lock-session'
const COMMAND_CLOSE_LOCK_SESSION = 'command-close-lock-session'

const COMMAND_CHECK_AND_INSERT_LOCAL_DEVICE = 'command-check-and-insert-local-device'
const COMMAND_EXPORT_BACKUP = 'command-export-backup'
const COMMAND_IMPORT_BACKUP = 'command-import-backup'
const COMMAND_SUBSCRIBE_STORAGE_INFO = 'command-subscribe-storage-info'
const COMMAND_RECLAIM_ORPHANED_BLOBS = 'command-reclaim-orphaned-blobs'
const COMMAND_RETRY_DOWNLOAD = 'command-retry-download'
const COMMAND_PAUSE_DOWNLOAD = 'command-pause-download'

const BACKUP_PROGRESS_SCHEMA = 'backup-progress-schema'
const NOTE_MEDIA_SCHEMA = 'note-media-schema'
const NOTE_STORAGE_INFO_SCHEMA = 'note-storage-info-schema'
const NOTE_DOWNLOAD_INFO_SCHEMA = 'note-download-info-schema'
const NOTE_UPLOAD_INFO_SCHEMA = 'note-upload-info-schema'
const NOTE_SEAL_WAITING_SCHEMA = 'note-seal-waiting-schema'
const FOLDERS_ARRAY_SCHEMA = 'folders-array-schema'
const FOLDER_SCHEMA = 'folder-schema'
const NOTES_ARRAY_SCHEMA = 'notes-array-schema'
const NOTE_SCHEMA = 'note-schema'
const PAIRING_SCHEMA = 'pairing-schema'
const SETTINGS_SCHEMA = 'settings-schema'
const SYNCED_DEVICE_SCHEMA = 'synced-device-schema'
const GATE_BLOCKING_DEVICE_SCHEMA = 'gate-blocking-device-schema'
const SYNCED_DEVICES_ARRAY_SCHEMA = 'synced-devices-array-schema'

const COMMAND_GET_ACTIVITY = 'command-get-activity'
const COMMAND_GET_ACTIVITY_DIFF = 'command-get-activity-diff'
const COMMAND_RECOVER_DISCARDED_WRITE = 'command-recover-discarded-write'
const COMMAND_GET_ACTIVITY_STATS = 'command-get-activity-stats'
const COMMAND_CLEAR_ACTIVITY = 'command-clear-activity'
const COMMAND_SUBSCRIBE_ACTIVITY = 'command-subscribe-activity'
const ACTIVITY_ENTRY_SCHEMA = 'activity-entry-schema'
const ACTIVITY_DIFF_SCHEMA = 'activity-diff-schema'
const ACTIVITY_STATS_SCHEMA = 'activity-stats-schema'

const COMMAND_BROADCAST_YJS_UPDATE = 'command-broadcast-yjs-update'
const COMMAND_SUBSCRIBE_YJS_UPDATE = 'command-subscribe-yjs-update'

const COMMAND_SUSPEND_SERVICES = 'command-suspend-services'
const COMMAND_RESUME_SERVICES = 'command-resume-services'
const YJS_UPDATE_SCHEMA = 'yjs-update-schema'

const COMMAND_GET_DEBUG_INFO = 'command-get-debug-info'
const COMMAND_RESET_STALLED_MEDIA = 'command-reset-stalled-media'
// LEGACY(hyperdb-migration): see docs/HYPERDB-VIEW-MIGRATION-PLAN-2026-09-23.md section 8
const COMMAND_START_FRESH_VAULT = 'command-start-fresh-vault'
const COMMAND_GET_ERROR_LOG = 'command-get-error-log'
const COMMAND_CLEAR_ERROR_LOG = 'command-clear-error-log'
const COMMAND_RECORD_LOGS = 'command-record-logs'

const VAULT_SCHEMA = 'vault-schema'
const COMMAND_LIST_VAULTS = 'command-list-vaults'
const COMMAND_CREATE_VAULT = 'command-create-vault'
const COMMAND_SWITCH_VAULT = 'command-switch-vault'
const COMMAND_RENAME_VAULT = 'command-rename-vault'
const COMMAND_REMOVE_VAULT = 'command-remove-vault'
const COMMAND_MOVE_TO_VAULT = 'command-move-to-vault'
const COMMAND_SET_ERROR_LOG_ENABLED = 'command-set-error-log-enabled'
const NOTE_SEARCH_RESULT_SCHEMA = 'note-search-result-schema'
const COMMAND_SEARCH_NOTES = 'command-search-notes'
const COMMAND_PREWARM_SEARCH = 'command-prewarm-search'
const DERIVED_ENTRY_SCHEMA = 'derived-entry-schema'
const DERIVED_COUNT_SCHEMA = 'derived-count-schema'
const COMMAND_DERIVED_PUT = 'command-derived-put'
const COMMAND_DERIVED_GET = 'command-derived-get'
const COMMAND_DERIVED_VERSIONS = 'command-derived-versions'
const COMMAND_DERIVED_CLEAR = 'command-derived-clear'
const COMMAND_DERIVED_STATS = 'command-derived-stats'
const COMMAND_DERIVED_SEARCH = 'command-derived-search'
const DERIVED_HIT_SCHEMA = 'derived-hit-schema'
const COMMAND_DERIVED_RELATED = 'command-derived-related'
const COMMAND_DERIVED_DUPLICATES = 'command-derived-duplicates'
const DERIVED_PAIR_SCHEMA = 'derived-pair-schema'
const COMMAND_AI_OFFLOAD_STATUS = 'command-ai-offload-status'
const COMMAND_AI_OFFLOAD_RUN = 'command-ai-offload-run'
const COMMAND_AI_OFFLOAD_CANCEL = 'command-ai-offload-cancel'
const COMMAND_AI_OFFLOAD_SERVE = 'command-ai-offload-serve'
const COMMAND_AI_OFFLOAD_JOBS = 'command-ai-offload-jobs'
const COMMAND_AI_OFFLOAD_REPLY = 'command-ai-offload-reply'
const COMMAND_UPCOMING_TASKS = 'command-upcoming-tasks'
const COMMAND_SET_SYNCED_PREF = 'command-set-synced-pref'
const COMMAND_GET_SYNCED_PREFS = 'command-get-synced-prefs'
const COMMAND_SET_TASK_CHECKED = 'command-set-task-checked'
const COMMAND_ATTACHMENTS = 'command-attachments'
const COMMAND_CHECK_BACKUP_RESTORE = 'command-check-backup-restore'
const COMMAND_GET_HELD_MERGE = 'command-get-held-merge'
const COMMAND_COMBINE_HELD_MERGE = 'command-combine-held-merge'

schemaNs.register({
  name: BACKUP_PROGRESS_SCHEMA,
  compact: false,
  fields: [
    { name: 'step', type: 'string' },
    { name: 'progress', type: 'uint' },
    { name: 'message', type: 'string' },
    { name: 'current', type: 'uint' },
    { name: 'total', type: 'uint' }
  ]
})

schemaNs.register({
  name: NOTE_MEDIA_SCHEMA,
  compact: false,
  fields: [
    { name: 'path', type: 'string' },
    { name: 'name', type: 'string' },
    { name: 'size', type: 'uint' }
  ]
})

schemaNs.register({
  name: NOTE_STORAGE_INFO_SCHEMA,
  compact: false,
  fields: [
    { name: 'key', type: 'string' },
    { name: 'title', type: 'string' },
    { name: 'contentSize', type: 'uint' },
    { name: 'mediaSize', type: 'uint' },
    { name: 'totalSize', type: 'uint' },
    { name: 'media', type: `@${NAMESPACE}/${NOTE_MEDIA_SCHEMA}`, array: true }
  ]
})

schemaNs.register({
  name: NOTE_DOWNLOAD_INFO_SCHEMA,
  compact: false,
  fields: [
    { name: 'noteKey', type: 'string' },
    { name: 'url', type: 'string' },
    { name: 'fileName', type: 'string' },
    { name: 'totalBytes', type: 'uint' },
    { name: 'downloadedBytes', type: 'uint' },
    { name: 'status', type: 'string' },
    { name: 'sourceOnline', type: 'bool' },
    { name: 'stalled', type: 'bool' }
  ]
})

schemaNs.register({
  name: NOTE_UPLOAD_INFO_SCHEMA,
  compact: false,
  fields: [
    { name: 'noteKey', type: 'string' },
    { name: 'url', type: 'string' },
    { name: 'fileName', type: 'string' },
    { name: 'totalBytes', type: 'uint' },
    { name: 'uploadedBytes', type: 'uint' },
    { name: 'status', type: 'string' }
  ]
})

schemaNs.register({
  name: NOTE_SEAL_WAITING_SCHEMA,
  compact: false,
  fields: [
    { name: 'noteKey', type: 'string' },
    { name: 'link', type: 'string' },
    { name: 'fileName', type: 'string' },
    { name: 'size', type: 'uint' }
  ]
})

schemaNs.register({
  name: FOLDER_SCHEMA,
  compact: false,
  fields: [
    { name: 'title', type: 'string' },
    { name: 'addedAt', type: 'uint' },
    { name: 'updatedAt', type: 'uint' },
    { name: 'icon', type: 'string' }
  ]
})

schemaNs.register({
  name: FOLDERS_ARRAY_SCHEMA,
  compact: false,
  fields: [
    { name: 'seq', type: 'uint' },
    { name: 'key', type: 'string' },
    { name: 'value', type: `@${NAMESPACE}/${FOLDER_SCHEMA}` }
  ]
})

schemaNs.register({
  name: NOTE_SCHEMA,
  compact: false,
  fields: [
    { name: 'title', type: 'string' },
    { name: 'note', type: 'string' },
    { name: 'folderKey', type: 'string' },
    { name: 'addedAt', type: 'uint' },
    { name: 'updatedAt', type: 'uint' },
    { name: 'locked', type: 'bool' },
    { name: 'pinned', type: 'bool' },
    { name: 'deletedAt', type: 'uint' },
    { name: 'previousFolderKey', type: 'string' },
    { name: 'summary', type: 'string' },
    { name: 'bodyOmitted', type: 'bool' },
    { name: 'sealed', type: 'bool' }
  ]
})

schemaNs.register({
  name: NOTES_ARRAY_SCHEMA,
  compact: false,
  fields: [
    { name: 'seq', type: 'uint' },
    { name: 'key', type: 'string' },
    { name: 'value', type: `@${NAMESPACE}/${NOTE_SCHEMA}` }
  ]
})

schemaNs.register({
  name: GATE_BLOCKING_DEVICE_SCHEMA,
  fields: [
    { name: 'key', type: 'string' },
    { name: 'title', type: 'string' },
    { name: 'compatLevel', type: 'uint' },
    { name: 'appVersion', type: 'string' },
    { name: 'lastSeenAt', type: 'uint' }
  ]
})

schemaNs.register({
  name: PAIRING_SCHEMA,
  compact: false,
  fields: [
    { name: 'step', type: 'string' },
    { name: 'message', type: 'string' },
    { name: 'progress', type: 'uint' },
    { name: 'userData', type: 'string' },
    { name: 'localKey', type: 'string' },
    { name: 'encryptionKey', type: 'string' },
    { name: 'platform', type: 'string' },
    { name: 'reason', type: 'string' },
    { name: 'requestedAt', type: 'uint' },
    { name: 'deviceName', type: 'string' },
    { name: 'code', type: 'string' },
    { name: 'blocking', type: `@${NAMESPACE}/${GATE_BLOCKING_DEVICE_SCHEMA}`, array: true }
  ]
})

schemaNs.register({
  name: SETTINGS_SCHEMA,
  compact: false,
  fields: [
    { name: 'theme', type: 'string' },
    { name: 'fontFamily', type: 'string' },
    { name: 'editorFontSize', type: 'uint' },
    { name: 'sortBy', type: 'string' },
    { name: 'colorTheme', type: 'string' },
    { name: 'lockMethod', type: 'string' },
    { name: 'lockPasswordSalt', type: 'string' },
    { name: 'lockPasswordHash', type: 'string' },
    { name: 'lockPasswordIterations', type: 'uint' },
    { name: 'activityLogEnabled', type: 'bool' },
    { name: 'activityRetentionDays', type: 'uint' }
  ]
})

schemaNs.register({
  name: SYNCED_DEVICE_SCHEMA,
  compact: false,
  fields: [
    { name: 'title', type: 'string' },
    { name: 'deviceType', type: 'string' },
    { name: 'platform', type: 'string' },
    { name: 'isLocal', type: 'bool' },
    { name: 'addedAt', type: 'uint' },
    { name: 'updatedAt', type: 'uint' },
    { name: 'isOnline', type: 'bool' },
    { name: 'presenceKnown', type: 'bool' },
    { name: 'localKey', type: 'string' },
    { name: 'isIndexer', type: 'bool' },
    { name: 'sealedNotes', type: 'bool' },
    { name: 'compatLevel', type: 'uint' },
    { name: 'appVersion', type: 'string' },
    { name: 'lastSeenAt', type: 'uint' }
  ]
})

schemaNs.register({
  name: SYNCED_DEVICES_ARRAY_SCHEMA,
  compact: false,
  fields: [
    { name: 'seq', type: 'uint' },
    { name: 'key', type: 'string' },
    { name: 'value', type: `@${NAMESPACE}/${SYNCED_DEVICE_SCHEMA}` }
  ]
})

schemaNs.register({
  name: ACTIVITY_ENTRY_SCHEMA,
  compact: false,
  fields: [
    { name: 'id', type: 'string' },
    { name: 'event', type: 'string' },
    { name: 'device', type: 'string' },
    { name: 'at', type: 'uint' },
    { name: 'lastAt', type: 'uint' },
    { name: 'ops', type: 'uint' },
    { name: 'targetKind', type: 'string' },
    { name: 'targetKey', type: 'string' },
    { name: 'targetTitle', type: 'string' },
    { name: 'locked', type: 'bool' },
    { name: 'hasDiff', type: 'bool' },
    { name: 'meta', type: 'string' },
    { name: 'recoverable', type: 'bool' }
  ]
})

schemaNs.register({
  name: ACTIVITY_DIFF_SCHEMA,
  compact: false,
  fields: [
    { name: 'id', type: 'string' },
    { name: 'before', type: 'string' },
    { name: 'after', type: 'string' },
    { name: 'locked', type: 'bool' },
    { name: 'available', type: 'bool' }
  ]
})

schemaNs.register({
  name: `${COMMAND_RECOVER_DISCARDED_WRITE}-${REQUEST}`,
  compact: false,
  fields: [{ name: 'id', type: 'string', required: true }]
})

schemaNs.register({
  name: `${COMMAND_RECOVER_DISCARDED_WRITE}-${RESPONSE}`,
  compact: false,
  fields: [
    { name: 'done', type: 'bool', required: true },
    { name: 'noteKey', type: 'string' }
  ]
})

schemaNs.register({
  name: ACTIVITY_STATS_SCHEMA,
  compact: false,
  fields: [
    { name: 'count', type: 'uint' },
    { name: 'bytes', type: 'uint' },
    { name: 'oldestAt', type: 'uint' }
  ]
})

schemaNs.register({
  name: `${COMMAND_GET_ACTIVITY}-${REQUEST}`,
  fields: [
    { name: 'filter', type: 'string' },
    { name: 'deviceKey', type: 'string' },
    { name: 'noteKey', type: 'string' },
    { name: 'limit', type: 'uint' },
    { name: 'cursor', type: 'string' }
  ]
})
schemaNs.register({
  name: `${COMMAND_GET_ACTIVITY}-${RESPONSE}`,
  fields: [
    { name: 'entries', type: `@${NAMESPACE}/${ACTIVITY_ENTRY_SCHEMA}`, array: true, required: true },
    { name: 'cursor', type: 'string' },
    { name: 'hasMore', type: 'bool' }
  ]
})

schemaNs.register({
  name: `${COMMAND_GET_ACTIVITY_DIFF}-${REQUEST}`,
  fields: [{ name: 'id', type: 'string', required: true }]
})
schemaNs.register({
  name: `${COMMAND_GET_ACTIVITY_DIFF}-${RESPONSE}`,
  fields: [{ name: 'data', type: `@${NAMESPACE}/${ACTIVITY_DIFF_SCHEMA}`, required: true }]
})

schemaNs.register({
  name: `${COMMAND_GET_ACTIVITY_STATS}-${REQUEST}`,
  fields: []
})
schemaNs.register({
  name: `${COMMAND_GET_ACTIVITY_STATS}-${RESPONSE}`,
  fields: [{ name: 'data', type: `@${NAMESPACE}/${ACTIVITY_STATS_SCHEMA}`, required: true }]
})

schemaNs.register({
  name: `${COMMAND_GET_DEBUG_INFO}-${REQUEST}`,
  fields: [{ name: 'heavy', type: 'bool' }]
})
schemaNs.register({
  name: `${COMMAND_GET_DEBUG_INFO}-${RESPONSE}`,
  fields: [{ name: 'json', type: 'string' }]
})

schemaNs.register({
  name: `${COMMAND_RESET_STALLED_MEDIA}-${REQUEST}`,
  fields: []
})
schemaNs.register({
  name: `${COMMAND_RESET_STALLED_MEDIA}-${RESPONSE}`,
  fields: [{ name: 'json', type: 'string' }]
})

schemaNs.register({
  name: `${COMMAND_CLEAR_ACTIVITY}-${REQUEST}`,
  fields: []
})
schemaNs.register({
  name: `${COMMAND_CLEAR_ACTIVITY}-${RESPONSE}`,
  fields: [{ name: 'success', type: 'bool' }]
})

schemaNs.register({
  name: `${COMMAND_SUBSCRIBE_ACTIVITY}-${REQUEST}`,
  fields: []
})
schemaNs.register({
  name: `${COMMAND_SUBSCRIBE_ACTIVITY}-${RESPONSE}`,
  fields: [{ name: 'changed', type: 'bool' }]
})

schemaNs.register({
  name: `${COMMAND_READY}-${REQUEST}`,
  fields: [
    { name: 'storage', type: 'string', required: true },
    { name: 'encryption', type: 'string', required: true },
    // Appended, and optional on purpose. Hyperschema only allows appending, and
    // a frontend that predates this simply does not send it - the backend then
    // opens the vault the old way instead of failing. Note an optional string
    // encodes '' as absent and decodes back as null, so treat both as "none".
    { name: 'entropy', type: 'string' },
    { name: 'appVersion', type: 'string' }
  ]
})
schemaNs.register({
  name: `${COMMAND_READY}-${RESPONSE}`,
  fields: [
    { name: 'done', type: 'bool', required: true },
    // Appended. A field the backend sets but the schema does not declare is
    // silently dropped by the encoder, so this has to be here for the frontends
    // to be able to tell a sealed vault from an ordinary failure.
    { name: 'reason', type: 'string' }
  ]
})

schemaNs.register({
  name: `${COMMAND_DESTROY}-${REQUEST}`,
  fields: []
})

schemaNs.register({
  name: `${COMMAND_CLEAR_STORAGE}-${REQUEST}`,
  fields: []
})
schemaNs.register({
  name: `${COMMAND_CLEAR_STORAGE}-${RESPONSE}`,
  fields: [{ name: 'done', type: 'bool', required: true }]
})

schemaNs.register({
  name: `${COMMAND_CHORE}-${REQUEST}`,
  fields: []
})
schemaNs.register({
  name: `${COMMAND_CHORE}-${RESPONSE}`,
  fields: [{ name: 'hyperdriveServerAddress', type: 'string', required: true }]
})

schemaNs.register({
  name: `${COMMAND_INSERT_FOLDER}-${REQUEST}`,
  fields: [
    { name: 'title', type: 'string', required: true },
    { name: 'icon', type: 'string' }
  ]
})
schemaNs.register({
  name: `${COMMAND_INSERT_FOLDER}-${RESPONSE}`,
  fields: [
    { name: 'done', type: 'bool', required: true },
    { name: 'key', type: 'string', required: true },
  ]
})

schemaNs.register({
  name: `${COMMAND_UPDATE_FOLDER}-${REQUEST}`,
  fields: [
    { name: 'key', type: 'string', required: true },
    { name: 'title', type: 'string', required: true },
    { name: 'icon', type: 'string' }
  ]
})
schemaNs.register({
  name: `${COMMAND_UPDATE_FOLDER}-${RESPONSE}`,
  fields: [{ name: 'done', type: 'bool', required: true }]
})

schemaNs.register({
  name: `${COMMAND_GET_ALL_FOLDERS}-${REQUEST}`,
  fields: []
})
schemaNs.register({
  name: `${COMMAND_GET_ALL_FOLDERS}-${RESPONSE}`,
  fields: [
    { name: 'data', type: `@${NAMESPACE}/${FOLDERS_ARRAY_SCHEMA}`, array: true, required: true }
  ]
})

schemaNs.register({
  name: `${COMMAND_GET_SINGLE_FOLDER}-${REQUEST}`,
  fields: [{ name: 'key', type: 'string', required: true }]
})
schemaNs.register({
  name: `${COMMAND_GET_SINGLE_FOLDER}-${RESPONSE}`,
  fields: [
    { name: 'key', type: 'string', required: true },
    { name: 'data', type: `@${NAMESPACE}/${FOLDER_SCHEMA}`, required: true }
  ]
})

schemaNs.register({
  name: `${COMMAND_SUBSCRIBE_FOLDER}-${REQUEST}`,
  fields: [{ name: 'key', type: 'string', required: true }]
})
schemaNs.register({
  name: `${COMMAND_SUBSCRIBE_FOLDER}-${RESPONSE}`,
  fields: [{ name: 'data', type: `@${NAMESPACE}/${FOLDER_SCHEMA}` }]
})

schemaNs.register({
  name: `${COMMAND_SUBSCRIBE_FOLDER_KEYS}-${REQUEST}`,
  fields: []
})
schemaNs.register({
  name: `${COMMAND_SUBSCRIBE_FOLDER_KEYS}-${RESPONSE}`,
  fields: [{ name: 'data', type: 'string', array: true, required: true }]
})

schemaNs.register({
  name: `${COMMAND_DELETE_FOLDER}-${REQUEST}`,
  fields: [{ name: 'key', type: 'string', required: true }]
})

schemaNs.register({
  name: `${COMMAND_INSERT_NOTE}-${REQUEST}`,
  fields: [
    { name: 'title', type: 'string', required: true },
    { name: 'note', type: 'string', required: true },
    { name: 'folderKey', type: 'string', required: true },
    { name: 'locked', type: 'bool' },
    { name: 'pinned', type: 'bool' }
  ]
})
schemaNs.register({
  name: `${COMMAND_INSERT_NOTE}-${RESPONSE}`,
  fields: [
    { name: 'done', type: 'bool', required: true },
    { name: 'key', type: 'string', required: true }
  ]
})

schemaNs.register({
  name: `${COMMAND_UPDATE_NOTE}-${REQUEST}`,
  fields: [
    { name: 'key', type: 'string', required: true },
    { name: 'title', type: 'string', required: true },
    { name: 'note', type: 'string', required: true },
    { name: 'folderKey', type: 'string' },
    { name: 'locked', type: 'bool' },
    { name: 'pinned', type: 'bool' }
  ]
})
schemaNs.register({
  name: `${COMMAND_UPDATE_NOTE}-${RESPONSE}`,
  fields: [
    { name: 'done', type: 'bool', required: true },
    { name: 'reason', type: 'string' }
  ]
})

schemaNs.register({
  name: `${COMMAND_GET_ALL_NOTES}-${REQUEST}`,
  fields: []
})
schemaNs.register({
  name: `${COMMAND_GET_ALL_NOTES}-${RESPONSE}`,
  fields: [
    { name: 'data', type: `@${NAMESPACE}/${NOTES_ARRAY_SCHEMA}`, array: true, required: true }
  ]
})

schemaNs.register({
  name: `${COMMAND_GET_SINGLE_NOTE}-${REQUEST}`,
  fields: [{ name: 'key', type: 'string', required: true }]
})
schemaNs.register({
  name: `${COMMAND_GET_SINGLE_NOTE}-${RESPONSE}`,
  fields: [
    { name: 'key', type: 'string', required: true },
    { name: 'data', type: `@${NAMESPACE}/${NOTE_SCHEMA}`, required: true }
  ]
})

schemaNs.register({
  name: `${COMMAND_SUBSCRIBE_NOTE}-${REQUEST}`,
  fields: [
    { name: 'key', type: 'string', required: true },
    { name: 'summary', type: 'bool' }
  ]
})
schemaNs.register({
  name: `${COMMAND_SUBSCRIBE_NOTE}-${RESPONSE}`,
  fields: [{ name: 'data', type: `@${NAMESPACE}/${NOTE_SCHEMA}` }]
})

schemaNs.register({
  name: `${COMMAND_SUBSCRIBE_NOTE_KEYS}-${REQUEST}`,
  fields: []
})
schemaNs.register({
  name: `${COMMAND_SUBSCRIBE_NOTE_KEYS}-${RESPONSE}`,
  fields: [{ name: 'data', type: 'string', array: true, required: true }]
})

schemaNs.register({
  name: `${COMMAND_TRASH_NOTE}-${REQUEST}`,
  fields: [{ name: 'key', type: 'string', required: true }]
})
schemaNs.register({
  name: `${COMMAND_TRASH_NOTE}-${RESPONSE}`,
  fields: [{ name: 'done', type: 'bool', required: true }]
})

schemaNs.register({
  name: `${COMMAND_RESTORE_NOTE}-${REQUEST}`,
  fields: [{ name: 'key', type: 'string', required: true }]
})
schemaNs.register({
  name: `${COMMAND_RESTORE_NOTE}-${RESPONSE}`,
  fields: [
    { name: 'done', type: 'bool', required: true },
    { name: 'folderKey', type: 'string' }
  ]
})

schemaNs.register({
  name: `${COMMAND_PURGE_EXPIRED_TRASH}-${REQUEST}`,
  fields: []
})
schemaNs.register({
  name: `${COMMAND_PURGE_EXPIRED_TRASH}-${RESPONSE}`,
  fields: [{ name: 'purged', type: 'uint' }]
})

schemaNs.register({
  name: `${COMMAND_DELETE_NOTE}-${REQUEST}`,
  fields: [{ name: 'key', type: 'string', required: true }]
})

schemaNs.register({
  name: `${COMMAND_INSERT_FILE}-${REQUEST}`,
  fields: [
    { name: 'key', type: 'string', required: true },
    { name: 'fileName', type: 'string', required: true },
    { name: 'buffer', type: 'buffer' },
    { name: 'path', type: 'string' }
  ]
})
schemaNs.register({
  name: `${COMMAND_INSERT_FILE}-${RESPONSE}`,
  fields: [
    { name: 'done', type: 'bool', required: true },
    { name: 'link', type: 'string', required: true },
    { name: 'reason', type: 'string' }
  ]
})

schemaNs.register({
  name: `${COMMAND_INSERT_FILE_PROGRESS}-${REQUEST}`,
  fields: [
    { name: 'key', type: 'string', required: true },
    { name: 'fileName', type: 'string', required: true },
    { name: 'path', type: 'string', required: true }
  ]
})
schemaNs.register({
  name: `${COMMAND_INSERT_FILE_PROGRESS}-${RESPONSE}`,
  fields: [
    { name: 'transferred', type: 'uint' },
    { name: 'total', type: 'uint' },
    { name: 'done', type: 'bool', required: true },
    { name: 'link', type: 'string' },
    { name: 'reason', type: 'string' }
  ]
})

schemaNs.register({
  name: `${COMMAND_DELETE_FILE}-${REQUEST}`,
  fields: [{ name: 'key', type: 'string', required: true }]
})

schemaNs.register({
  name: `${COMMAND_DELETE_NOTE_FILE}-${REQUEST}`,
  fields: [
    { name: 'noteKey', type: 'string', required: true },
    { name: 'mediaPath', type: 'string', required: true }
  ]
})
schemaNs.register({
  name: `${COMMAND_DELETE_NOTE_FILE}-${RESPONSE}`,
  fields: [{ name: 'done', type: 'bool', required: true }]
})

schemaNs.register({
  name: `${COMMAND_CREATE_INVITE}-${REQUEST}`,
  fields: [{ name: 'regenerate', type: 'bool' }]
})
schemaNs.register({
  name: `${COMMAND_CREATE_INVITE}-${RESPONSE}`,
  fields: [
    { name: 'id', type: 'string', required: true },
    { name: 'invite', type: 'string', required: true },
    { name: 'publicKey', type: 'string', required: true },
    { name: 'expires', type: 'uint', required: true },
  ]
})

schemaNs.register({
  name: `${COMMAND_SUBSCRIBE_PAIRING}-${REQUEST}`,
  fields: []
})
schemaNs.register({
  name: `${COMMAND_SUBSCRIBE_PAIRING}-${RESPONSE}`,
  fields: [{ name: 'data', type: `@${NAMESPACE}/${PAIRING_SCHEMA}` }]
})

schemaNs.register({
  name: `${COMMAND_SUBSCRIBE_PAIR_USER}-${REQUEST}`,
  fields: [
    { name: 'invite', type: 'string', required: true },
    { name: 'deviceName', type: 'string' },
    { name: 'mode', type: 'string' },
    { name: 'vaultName', type: 'string' }
  ]
})
schemaNs.register({
  name: `${COMMAND_SUBSCRIBE_PAIR_USER}-${RESPONSE}`,
  fields: [{ name: 'data', type: `@${NAMESPACE}/${PAIRING_SCHEMA}` }]
})

schemaNs.register({
  name: `${COMMAND_CONFIRM_PAIRING}-${REQUEST}`,
  fields: []
})
schemaNs.register({
  name: `${COMMAND_CONFIRM_PAIRING}-${RESPONSE}`,
  fields: [{ name: 'done', type: 'bool', required: true }]
})

schemaNs.register({
  name: `${COMMAND_REJECT_PAIRING}-${REQUEST}`,
  fields: []
})
schemaNs.register({
  name: `${COMMAND_REJECT_PAIRING}-${RESPONSE}`,
  fields: [{ name: 'done', type: 'bool', required: true }]
})

schemaNs.register({
  name: `${COMMAND_UPDATE_SETTINGS}-${REQUEST}`,
  fields: [{ name: 'settings', type: `@${NAMESPACE}/${SETTINGS_SCHEMA}`, required: true }]
})
schemaNs.register({
  name: `${COMMAND_UPDATE_SETTINGS}-${RESPONSE}`,
  fields: [{ name: 'done', type: 'bool', required: true }]
})

schemaNs.register({
  name: `${COMMAND_GET_SETTINGS}-${REQUEST}`,
  fields: []
})
schemaNs.register({
  name: `${COMMAND_GET_SETTINGS}-${RESPONSE}`,
  fields: [{ name: 'data', type: `@${NAMESPACE}/${SETTINGS_SCHEMA}` }]
})

schemaNs.register({
  name: `${COMMAND_SUBSCRIBE_SETTINGS}-${REQUEST}`,
  fields: []
})
schemaNs.register({
  name: `${COMMAND_SUBSCRIBE_SETTINGS}-${RESPONSE}`,
  fields: [{ name: 'data', type: `@${NAMESPACE}/${SETTINGS_SCHEMA}` }]
})

schemaNs.register({
  name: `${COMMAND_UPDATE_PREFERENCE}-${REQUEST}`,
  fields: [
    { name: 'key', type: 'string', required: true },
    { name: 'value', type: 'string', required: true }
  ]
})
schemaNs.register({
  name: `${COMMAND_UPDATE_PREFERENCE}-${RESPONSE}`,
  fields: [{ name: 'done', type: 'bool', required: true }]
})

schemaNs.register({
  name: `${COMMAND_GET_PREFERENCE}-${REQUEST}`,
  fields: [{ name: 'key', type: 'string', required: true }]
})
schemaNs.register({
  name: `${COMMAND_GET_PREFERENCE}-${RESPONSE}`,
  fields: [{ name: 'data', type: 'string' }]
})

schemaNs.register({
  name: `${COMMAND_SET_NOTE_LOCK_PASSWORD}-${REQUEST}`,
  fields: [{ name: 'password', type: 'string', required: true }]
})
schemaNs.register({
  name: `${COMMAND_SET_NOTE_LOCK_PASSWORD}-${RESPONSE}`,
  fields: [{ name: 'done', type: 'bool', required: true }]
})

schemaNs.register({
  name: `${COMMAND_VERIFY_NOTE_LOCK_PASSWORD}-${REQUEST}`,
  fields: [{ name: 'password', type: 'string', required: true }]
})
schemaNs.register({
  name: `${COMMAND_VERIFY_NOTE_LOCK_PASSWORD}-${RESPONSE}`,
  fields: [
    { name: 'valid', type: 'bool', required: true },
    { name: 'retryAfter', type: 'uint' }
  ]
})

schemaNs.register({
  name: `${COMMAND_INSERT_SYNCED_DEVICE}-${REQUEST}`,
  fields: [
    { name: 'title', type: 'string', required: true },
    { name: 'deviceType', type: 'string', required: true },
    { name: 'platform', type: 'string', required: true },
    { name: 'localKey', type: 'string', required: true }
  ]
})
schemaNs.register({
  name: `${COMMAND_INSERT_SYNCED_DEVICE}-${RESPONSE}`,
  fields: [
    { name: 'done', type: 'bool', required: true },
    { name: 'key', type: 'string', required: true }
  ]
})

schemaNs.register({
  name: `${COMMAND_UPDATE_SYNCED_DEVICE}-${REQUEST}`,
  fields: [
    { name: 'key', type: 'string', required: true },
    { name: 'title', type: 'string', required: true },
  ]
})
schemaNs.register({
  name: `${COMMAND_UPDATE_SYNCED_DEVICE}-${RESPONSE}`,
  fields: [{ name: 'done', type: 'bool', required: true }]
})

schemaNs.register({
  name: `${COMMAND_DELETE_SYNCED_DEVICE}-${REQUEST}`,
  fields: [{ name: 'key', type: 'string', required: true }]
})

schemaNs.register({
  name: `${COMMAND_SET_DEVICE_INDEXER}-${REQUEST}`,
  fields: [
    { name: 'localKey', type: 'string', required: true },
    { name: 'isIndexer', type: 'bool', required: true }
  ]
})
schemaNs.register({
  name: `${COMMAND_SET_DEVICE_INDEXER}-${RESPONSE}`,
  fields: [
    { name: 'changed', type: 'bool', required: true },
    { name: 'error', type: 'string', required: true }
  ]
})

schemaNs.register({
  name: `${COMMAND_SUBSCRIBE_SYNCED_DEVICE}-${REQUEST}`,
  fields: [{ name: 'key', type: 'string', required: true }]
})
schemaNs.register({
  name: `${COMMAND_SUBSCRIBE_SYNCED_DEVICE}-${RESPONSE}`,
  fields: [{ name: 'data', type: `@${NAMESPACE}/${SYNCED_DEVICE_SCHEMA}` }]
})

schemaNs.register({
  name: `${COMMAND_SUBSCRIBE_DEVICE_STATUS}-${REQUEST}`,
  fields: []
})
schemaNs.register({
  name: `${COMMAND_SUBSCRIBE_DEVICE_STATUS}-${RESPONSE}`,
  fields: [{ name: 'data', type: 'string', required: true }]
})

schemaNs.register({
  name: `${COMMAND_CHECK_AND_INSERT_LOCAL_DEVICE}-${REQUEST}`,
  fields: [{ name: 'deviceName', type: 'string' }]
})
schemaNs.register({
  name: `${COMMAND_CHECK_AND_INSERT_LOCAL_DEVICE}-${RESPONSE}`,
  fields: [{ name: 'done', type: 'bool', required: true }]
})

schemaNs.register({
  name: `${COMMAND_SUBSCRIBE_ALL_SYNCED_DEVICE_KEYS}-${REQUEST}`,
  fields: []
})
schemaNs.register({
  name: `${COMMAND_SUBSCRIBE_ALL_SYNCED_DEVICE_KEYS}-${RESPONSE}`,
  fields: [{ name: 'data', type: 'string', array: true, required: true }]
})

schemaNs.register({
  name: `${COMMAND_SUBSCRIBE_STORAGE_INFO}-${REQUEST}`,
  fields: []
})
schemaNs.register({
  name: `${COMMAND_SUBSCRIBE_STORAGE_INFO}-${RESPONSE}`,
  fields: [
    { name: 'data', type: `@${NAMESPACE}/${NOTE_STORAGE_INFO_SCHEMA}`, array: true, required: true },
    { name: 'totalBlobBytes', type: 'uint' },
    { name: 'totalOnDiskBytes', type: 'uint' },
    { name: 'reclaimableBytes', type: 'uint' },
    { name: 'downloads', type: `@${NAMESPACE}/${NOTE_DOWNLOAD_INFO_SCHEMA}`, array: true },
    { name: 'uploads', type: `@${NAMESPACE}/${NOTE_UPLOAD_INFO_SCHEMA}`, array: true },
    { name: 'sealWaiting', type: `@${NAMESPACE}/${NOTE_SEAL_WAITING_SCHEMA}`, array: true }
  ]
})

schemaNs.register({
  name: `${COMMAND_RECLAIM_ORPHANED_BLOBS}-${REQUEST}`,
  fields: []
})
schemaNs.register({
  name: `${COMMAND_RECLAIM_ORPHANED_BLOBS}-${RESPONSE}`,
  fields: [{ name: 'reclaimedBytes', type: 'uint' }]
})

schemaNs.register({
  name: `${COMMAND_RETRY_DOWNLOAD}-${REQUEST}`,
  fields: [{ name: 'url', type: 'string', required: true }]
})
schemaNs.register({
  name: `${COMMAND_RETRY_DOWNLOAD}-${RESPONSE}`,
  fields: [{ name: 'done', type: 'bool' }]
})

schemaNs.register({
  name: `${COMMAND_PAUSE_DOWNLOAD}-${REQUEST}`,
  fields: [{ name: 'url', type: 'string', required: true }]
})
schemaNs.register({
  name: `${COMMAND_PAUSE_DOWNLOAD}-${RESPONSE}`,
  fields: [{ name: 'paused', type: 'bool' }]
})

schemaNs.register({
  name: `${COMMAND_EXPORT_BACKUP}-${REQUEST}`,
  fields: [
    { name: 'password', type: 'string' },
    { name: 'filePath', type: 'string' }
  ]
})
schemaNs.register({
  name: `${COMMAND_EXPORT_BACKUP}-${RESPONSE}`,
  fields: [
    { name: 'data', type: `@${NAMESPACE}/${BACKUP_PROGRESS_SCHEMA}` },
    { name: 'buffer', type: 'buffer' }
  ]
})

schemaNs.register({
  name: `${COMMAND_IMPORT_BACKUP}-${REQUEST}`,
  fields: [
    { name: 'buffer', type: 'buffer' },
    { name: 'filePath', type: 'string' },
    { name: 'recoveryKey', type: 'string' },
    { name: 'password', type: 'string' }
  ]
})
schemaNs.register({
  name: `${COMMAND_IMPORT_BACKUP}-${RESPONSE}`,
  fields: [
    { name: 'data', type: `@${NAMESPACE}/${BACKUP_PROGRESS_SCHEMA}` }
  ]
})

schemaNs.register({
  name: YJS_UPDATE_SCHEMA,
  compact: false,
  fields: [
    { name: 'noteId', type: 'string' },
    { name: 'data', type: 'buffer' }
  ]
})

schemaNs.register({
  name: `${COMMAND_BROADCAST_YJS_UPDATE}-${REQUEST}`,
  fields: [
    { name: 'noteId', type: 'string', required: true },
    { name: 'data', type: 'buffer', required: true }
  ]
})

schemaNs.register({
  name: `${COMMAND_SUBSCRIBE_YJS_UPDATE}-${REQUEST}`,
  fields: [
    { name: 'noteId', type: 'string', required: true }
  ]
})
schemaNs.register({
  name: `${COMMAND_SUBSCRIBE_YJS_UPDATE}-${RESPONSE}`,
  fields: [
    { name: 'data', type: `@${NAMESPACE}/${YJS_UPDATE_SCHEMA}`, required: true }
  ]
})

schemaNs.register({
  name: `${COMMAND_SUSPEND_SERVICES}-${REQUEST}`,
  fields: []
})
schemaNs.register({
  name: `${COMMAND_SUSPEND_SERVICES}-${RESPONSE}`,
  fields: [{ name: 'done', type: 'bool', required: true }]
})

schemaNs.register({
  name: `${COMMAND_RESUME_SERVICES}-${REQUEST}`,
  fields: []
})
schemaNs.register({
  name: `${COMMAND_RESUME_SERVICES}-${RESPONSE}`,
  fields: [{ name: 'hyperdriveServerAddress', type: 'string', required: true }]
})

schemaNs.register({
  name: `${COMMAND_START_FRESH_VAULT}-${REQUEST}`,
  fields: [{ name: 'storage', type: 'string', required: true }]
})
schemaNs.register({
  name: `${COMMAND_START_FRESH_VAULT}-${RESPONSE}`,
  fields: [
    { name: 'done', type: 'bool', required: true },
    { name: 'reason', type: 'string' },
    { name: 'preservedPath', type: 'string' }
  ]
})

schemaNs.register({
  name: `${COMMAND_GET_ERROR_LOG}-${REQUEST}`,
  fields: []
})
schemaNs.register({
  name: `${COMMAND_GET_ERROR_LOG}-${RESPONSE}`,
  fields: [{ name: 'json', type: 'string' }]
})

schemaNs.register({
  name: `${COMMAND_CLEAR_ERROR_LOG}-${REQUEST}`,
  fields: []
})
schemaNs.register({
  name: `${COMMAND_CLEAR_ERROR_LOG}-${RESPONSE}`,
  fields: [{ name: 'done', type: 'bool' }]
})

schemaNs.register({
  name: `${COMMAND_RECORD_LOGS}-${REQUEST}`,
  fields: [{ name: 'json', type: 'string' }]
})
schemaNs.register({
  name: `${COMMAND_RECORD_LOGS}-${RESPONSE}`,
  fields: [{ name: 'done', type: 'bool' }]
})

schemaNs.register({
  name: VAULT_SCHEMA,
  compact: false,
  fields: [
    { name: 'id', type: 'string', required: true },
    { name: 'name', type: 'string' },
    { name: 'addedAt', type: 'uint' },
    { name: 'current', type: 'bool' }
  ]
})

schemaNs.register({
  name: `${COMMAND_LIST_VAULTS}-${REQUEST}`,
  fields: []
})
schemaNs.register({
  name: `${COMMAND_LIST_VAULTS}-${RESPONSE}`,
  fields: [{ name: 'data', type: `@${NAMESPACE}/${VAULT_SCHEMA}`, array: true }]
})

schemaNs.register({
  name: `${COMMAND_CREATE_VAULT}-${REQUEST}`,
  fields: [{ name: 'name', type: 'string', required: true }]
})
schemaNs.register({
  name: `${COMMAND_CREATE_VAULT}-${RESPONSE}`,
  fields: [
    { name: 'done', type: 'bool', required: true },
    { name: 'id', type: 'string' },
    { name: 'code', type: 'string' }
  ]
})

schemaNs.register({
  name: `${COMMAND_SWITCH_VAULT}-${REQUEST}`,
  fields: [{ name: 'id', type: 'string', required: true }]
})
schemaNs.register({
  name: `${COMMAND_SWITCH_VAULT}-${RESPONSE}`,
  fields: [
    { name: 'done', type: 'bool', required: true },
    { name: 'code', type: 'string' }
  ]
})

schemaNs.register({
  name: `${COMMAND_RENAME_VAULT}-${REQUEST}`,
  fields: [
    { name: 'id', type: 'string', required: true },
    { name: 'name', type: 'string', required: true }
  ]
})
schemaNs.register({
  name: `${COMMAND_RENAME_VAULT}-${RESPONSE}`,
  fields: [
    { name: 'done', type: 'bool', required: true },
    { name: 'code', type: 'string' }
  ]
})

schemaNs.register({
  name: `${COMMAND_REMOVE_VAULT}-${REQUEST}`,
  fields: [
    { name: 'id', type: 'string', required: true },
    { name: 'force', type: 'bool' }
  ]
})
schemaNs.register({
  name: `${COMMAND_REMOVE_VAULT}-${RESPONSE}`,
  fields: [
    { name: 'done', type: 'bool', required: true },
    { name: 'code', type: 'string' },
    { name: 'left', type: 'bool' },
    { name: 'replicated', type: 'bool' }
  ]
})

schemaNs.register({
  name: `${COMMAND_MOVE_TO_VAULT}-${REQUEST}`,
  fields: [
    { name: 'targetId', type: 'string', required: true },
    { name: 'noteKeys', type: 'string', array: true },
    { name: 'folderKeys', type: 'string', array: true }
  ]
})
schemaNs.register({
  name: `${COMMAND_MOVE_TO_VAULT}-${RESPONSE}`,
  fields: [
    { name: 'done', type: 'bool', required: true },
    { name: 'code', type: 'string' },
    { name: 'moved', type: 'uint' }
  ]
})

schemaNs.register({
  name: `${COMMAND_SET_ERROR_LOG_ENABLED}-${REQUEST}`,
  fields: [{ name: 'enabled', type: 'bool' }]
})
schemaNs.register({
  name: `${COMMAND_SET_ERROR_LOG_ENABLED}-${RESPONSE}`,
  fields: [{ name: 'enabled', type: 'bool' }]
})

schemaNs.register({
  name: NOTE_SEARCH_RESULT_SCHEMA,
  fields: [
    { name: 'key', type: 'string', required: true },
    { name: 'inTitle', type: 'bool' },
    { name: 'snippet', type: 'string' },
    { name: 'ranges', type: 'uint', array: true }
  ]
})
schemaNs.register({
  name: `${COMMAND_SEARCH_NOTES}-${REQUEST}`,
  fields: [
    { name: 'query', type: 'string' },
    { name: 'folderKey', type: 'string' },
    { name: 'includeLocked', type: 'bool' },
    { name: 'limit', type: 'uint' }
  ]
})
schemaNs.register({
  name: `${COMMAND_SEARCH_NOTES}-${RESPONSE}`,
  fields: [
    { name: 'query', type: 'string' },
    { name: 'results', type: `@${NAMESPACE}/${NOTE_SEARCH_RESULT_SCHEMA}`, array: true },
    { name: 'total', type: 'uint' },
    { name: 'tookMs', type: 'uint' },
    { name: 'failed', type: 'bool' }
  ]
})

schemaNs.register({
  name: `${COMMAND_PREWARM_SEARCH}-${REQUEST}`,
  fields: []
})
schemaNs.register({
  name: `${COMMAND_PREWARM_SEARCH}-${RESPONSE}`,
  fields: [{ name: 'ready', type: 'bool' }]
})

schemaNs.register({
  name: DERIVED_ENTRY_SCHEMA,
  fields: [
    { name: 'id', type: 'string', required: true },
    { name: 'version', type: 'uint' },
    { name: 'value', type: 'buffer' }
  ]
})
schemaNs.register({
  name: DERIVED_COUNT_SCHEMA,
  fields: [
    { name: 'namespace', type: 'string', required: true },
    { name: 'count', type: 'uint' }
  ]
})
schemaNs.register({
  name: `${COMMAND_DERIVED_PUT}-${REQUEST}`,
  fields: [
    { name: 'namespace', type: 'string' },
    { name: 'entries', type: `@${NAMESPACE}/${DERIVED_ENTRY_SCHEMA}`, array: true }
  ]
})
schemaNs.register({
  name: `${COMMAND_DERIVED_PUT}-${RESPONSE}`,
  fields: [{ name: 'ok', type: 'bool' }]
})
schemaNs.register({
  name: `${COMMAND_DERIVED_GET}-${REQUEST}`,
  fields: [
    { name: 'namespace', type: 'string' },
    { name: 'ids', type: 'string', array: true }
  ]
})
schemaNs.register({
  name: `${COMMAND_DERIVED_GET}-${RESPONSE}`,
  fields: [
    { name: 'entries', type: `@${NAMESPACE}/${DERIVED_ENTRY_SCHEMA}`, array: true },
    { name: 'ok', type: 'bool' }
  ]
})
schemaNs.register({
  name: `${COMMAND_DERIVED_VERSIONS}-${REQUEST}`,
  fields: [{ name: 'namespace', type: 'string' }]
})
schemaNs.register({
  name: `${COMMAND_DERIVED_VERSIONS}-${RESPONSE}`,
  fields: [
    { name: 'entries', type: `@${NAMESPACE}/${DERIVED_ENTRY_SCHEMA}`, array: true },
    { name: 'ok', type: 'bool' }
  ]
})
schemaNs.register({
  name: `${COMMAND_DERIVED_CLEAR}-${REQUEST}`,
  fields: [{ name: 'namespace', type: 'string' }]
})
schemaNs.register({
  name: `${COMMAND_DERIVED_CLEAR}-${RESPONSE}`,
  fields: [{ name: 'ok', type: 'bool' }]
})
schemaNs.register({
  name: `${COMMAND_DERIVED_STATS}-${REQUEST}`,
  fields: [{ name: 'namespaces', type: 'string', array: true }]
})
schemaNs.register({
  name: `${COMMAND_DERIVED_STATS}-${RESPONSE}`,
  fields: [
    { name: 'bytes', type: 'uint' },
    { name: 'counts', type: `@${NAMESPACE}/${DERIVED_COUNT_SCHEMA}`, array: true },
    { name: 'ok', type: 'bool' }
  ]
})

schemaNs.register({
  name: DERIVED_HIT_SCHEMA,
  fields: [
    { name: 'id', type: 'string', required: true },
    { name: 'score', type: 'float64' },
    { name: 'chunk', type: 'uint' }
  ]
})
schemaNs.register({
  name: `${COMMAND_DERIVED_SEARCH}-${REQUEST}`,
  fields: [
    { name: 'namespace', type: 'string' },
    { name: 'query', type: 'buffer' },
    { name: 'limit', type: 'uint' }
  ]
})
schemaNs.register({
  name: `${COMMAND_DERIVED_SEARCH}-${RESPONSE}`,
  fields: [
    { name: 'results', type: `@${NAMESPACE}/${DERIVED_HIT_SCHEMA}`, array: true },
    { name: 'ok', type: 'bool' }
  ]
})

schemaNs.register({
  name: `${COMMAND_DERIVED_RELATED}-${REQUEST}`,
  fields: [
    { name: 'namespace', type: 'string' },
    { name: 'id', type: 'string' },
    { name: 'limit', type: 'uint' }
  ]
})
schemaNs.register({
  name: `${COMMAND_DERIVED_RELATED}-${RESPONSE}`,
  fields: [
    { name: 'results', type: `@${NAMESPACE}/${DERIVED_HIT_SCHEMA}`, array: true },
    { name: 'ok', type: 'bool' }
  ]
})
schemaNs.register({
  name: DERIVED_PAIR_SCHEMA,
  fields: [
    { name: 'a', type: 'string', required: true },
    { name: 'b', type: 'string', required: true },
    { name: 'score', type: 'float64' }
  ]
})
schemaNs.register({
  name: `${COMMAND_DERIVED_DUPLICATES}-${REQUEST}`,
  fields: [
    { name: 'namespace', type: 'string' },
    { name: 'textNamespace', type: 'string' },
    { name: 'pairNamespace', type: 'string' },
    { name: 'threshold', type: 'float64' },
    { name: 'overlap', type: 'float64' },
    { name: 'checkMs', type: 'uint' },
    { name: 'limit', type: 'uint' }
  ]
})
schemaNs.register({
  name: `${COMMAND_DERIVED_DUPLICATES}-${RESPONSE}`,
  fields: [
    { name: 'pairs', type: `@${NAMESPACE}/${DERIVED_PAIR_SCHEMA}`, array: true },
    { name: 'checked', type: 'uint' },
    { name: 'remaining', type: 'uint' },
    { name: 'ok', type: 'bool' }
  ]
})

schemaNs.register({
  name: `${COMMAND_AI_OFFLOAD_STATUS}-${REQUEST}`,
  fields: [{ name: 'watch', type: 'bool' }]
})
schemaNs.register({
  name: `${COMMAND_AI_OFFLOAD_STATUS}-${RESPONSE}`,
  fields: [
    { name: 'available', type: 'bool' },
    { name: 'deviceTitle', type: 'string' }
  ]
})
schemaNs.register({
  name: `${COMMAND_AI_OFFLOAD_RUN}-${REQUEST}`,
  fields: [
    { name: 'runId', type: 'string', required: true },
    { name: 'kind', type: 'string', required: true },
    { name: 'payload', type: 'string' }
  ]
})
schemaNs.register({
  name: `${COMMAND_AI_OFFLOAD_RUN}-${RESPONSE}`,
  fields: [
    { name: 'text', type: 'string' },
    { name: 'done', type: 'bool' },
    { name: 'error', type: 'string' },
    { name: 'started', type: 'bool' },
    { name: 'data', type: 'string' }
  ]
})
schemaNs.register({
  name: `${COMMAND_AI_OFFLOAD_CANCEL}-${REQUEST}`,
  fields: [{ name: 'runId', type: 'string', required: true }]
})
schemaNs.register({
  name: `${COMMAND_AI_OFFLOAD_SERVE}-${REQUEST}`,
  fields: [{ name: 'serving', type: 'bool' }]
})
schemaNs.register({
  name: `${COMMAND_AI_OFFLOAD_SERVE}-${RESPONSE}`,
  fields: [{ name: 'done', type: 'bool' }]
})
schemaNs.register({
  name: `${COMMAND_AI_OFFLOAD_JOBS}-${REQUEST}`,
  fields: [{ name: 'watch', type: 'bool' }]
})
schemaNs.register({
  name: `${COMMAND_AI_OFFLOAD_JOBS}-${RESPONSE}`,
  fields: [
    { name: 'jobId', type: 'string', required: true },
    { name: 'kind', type: 'string' },
    { name: 'payload', type: 'string' },
    { name: 'cancel', type: 'bool' },
    { name: 'deviceTitle', type: 'string' }
  ]
})
schemaNs.register({
  name: `${COMMAND_AI_OFFLOAD_REPLY}-${REQUEST}`,
  fields: [
    { name: 'jobId', type: 'string', required: true },
    { name: 'text', type: 'string' },
    { name: 'done', type: 'bool' },
    { name: 'error', type: 'string' },
    { name: 'data', type: 'string' }
  ]
})

schemaNs.register({
  name: `${COMMAND_UPCOMING_TASKS}-${REQUEST}`,
  fields: [{ name: 'includeLocked', type: 'bool' }]
})
schemaNs.register({
  name: `${COMMAND_UPCOMING_TASKS}-${RESPONSE}`,
  fields: [
    { name: 'tasks', type: 'string' },
    { name: 'ok', type: 'bool' }
  ]
})

schemaNs.register({
  name: `${COMMAND_SET_SYNCED_PREF}-${REQUEST}`,
  fields: [
    { name: 'id', type: 'string', required: true },
    { name: 'json', type: 'string' }
  ]
})
schemaNs.register({
  name: `${COMMAND_SET_SYNCED_PREF}-${RESPONSE}`,
  fields: [{ name: 'ok', type: 'bool' }]
})

schemaNs.register({
  name: `${COMMAND_GET_SYNCED_PREFS}-${REQUEST}`,
  fields: [{ name: 'prefix', type: 'string' }]
})
schemaNs.register({
  name: `${COMMAND_GET_SYNCED_PREFS}-${RESPONSE}`,
  fields: [
    { name: 'json', type: 'string' },
    { name: 'ok', type: 'bool' }
  ]
})

schemaNs.register({
  name: `${COMMAND_SET_TASK_CHECKED}-${REQUEST}`,
  fields: [
    { name: 'noteKey', type: 'string', required: true },
    { name: 'text', type: 'string', required: true },
    { name: 'checked', type: 'bool' }
  ]
})
schemaNs.register({
  name: `${COMMAND_SET_TASK_CHECKED}-${RESPONSE}`,
  fields: [{ name: 'ok', type: 'bool' }]
})

schemaNs.register({
  name: `${COMMAND_ATTACHMENTS}-${REQUEST}`,
  fields: [
    { name: 'includeLocked', type: 'bool' },
    { name: 'countOnly', type: 'bool' }
  ]
})
schemaNs.register({
  name: `${COMMAND_ATTACHMENTS}-${RESPONSE}`,
  fields: [
    { name: 'items', type: 'string' },
    { name: 'ok', type: 'bool' },
    { name: 'count', type: 'uint' }
  ]
})

schemaNs.register({
  name: `${COMMAND_OPEN_LOCK_SESSION}-${REQUEST}`,
  fields: [
    { name: 'password', type: 'string' },
    { name: 'rootKey', type: 'string' },
    { name: 'returnRootKey', type: 'bool' }
  ]
})
schemaNs.register({
  name: `${COMMAND_OPEN_LOCK_SESSION}-${RESPONSE}`,
  fields: [
    { name: 'ok', type: 'bool', required: true },
    { name: 'retryAfter', type: 'uint' },
    { name: 'rootKey', type: 'string' },
    { name: 'reason', type: 'string' }
  ]
})

schemaNs.register({
  name: `${COMMAND_CLOSE_LOCK_SESSION}-${REQUEST}`,
  fields: []
})
schemaNs.register({
  name: `${COMMAND_CLOSE_LOCK_SESSION}-${RESPONSE}`,
  fields: [{ name: 'done', type: 'bool', required: true }]
})

schemaNs.register({
  name: `${COMMAND_CHECK_BACKUP_RESTORE}-${REQUEST}`,
  fields: [
    { name: 'buffer', type: 'buffer' },
    { name: 'filePath', type: 'string' },
    { name: 'password', type: 'string' }
  ]
})
schemaNs.register({
  name: `${COMMAND_CHECK_BACKUP_RESTORE}-${RESPONSE}`,
  fields: [
    { name: 'sealed', type: 'bool' },
    { name: 'blocking', type: `@${NAMESPACE}/${GATE_BLOCKING_DEVICE_SCHEMA}`, array: true }
  ]
})
schemaNs.register({
  name: `${COMMAND_GET_HELD_MERGE}-${REQUEST}`,
  fields: []
})
schemaNs.register({
  name: `${COMMAND_GET_HELD_MERGE}-${RESPONSE}`,
  fields: [
    { name: 'held', type: 'bool' },
    { name: 'blocking', type: `@${NAMESPACE}/${GATE_BLOCKING_DEVICE_SCHEMA}`, array: true }
  ]
})
schemaNs.register({
  name: `${COMMAND_COMBINE_HELD_MERGE}-${REQUEST}`,
  fields: []
})
schemaNs.register({
  name: `${COMMAND_COMBINE_HELD_MERGE}-${RESPONSE}`,
  fields: [{ name: 'done', type: 'bool' }]
})

Hyperschema.toDisk(schema)

const builder = HRPCBuilder.from(SCHEMA_DIR, HRPC_DIR)
const ns = builder.namespace(NAMESPACE)

ns.register({
  name: COMMAND_READY,
  request: { name: `@${NAMESPACE}/${COMMAND_READY}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_READY}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_DESTROY,
  request: { name: `@${NAMESPACE}/${COMMAND_DESTROY}-${REQUEST}`, send: true }
})

ns.register({
  name: COMMAND_CHORE,
  request: { name: `@${NAMESPACE}/${COMMAND_CHORE}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_CHORE}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_CLEAR_STORAGE,
  request: { name: `@${NAMESPACE}/${COMMAND_CLEAR_STORAGE}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_CLEAR_STORAGE}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_RECLAIM_ORPHANED_BLOBS,
  request: { name: `@${NAMESPACE}/${COMMAND_RECLAIM_ORPHANED_BLOBS}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_RECLAIM_ORPHANED_BLOBS}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_RETRY_DOWNLOAD,
  request: { name: `@${NAMESPACE}/${COMMAND_RETRY_DOWNLOAD}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_RETRY_DOWNLOAD}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_PAUSE_DOWNLOAD,
  request: { name: `@${NAMESPACE}/${COMMAND_PAUSE_DOWNLOAD}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_PAUSE_DOWNLOAD}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_INSERT_FOLDER,
  request: { name: `@${NAMESPACE}/${COMMAND_INSERT_FOLDER}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_INSERT_FOLDER}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_UPDATE_FOLDER,
  request: { name: `@${NAMESPACE}/${COMMAND_UPDATE_FOLDER}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_UPDATE_FOLDER}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_GET_ALL_FOLDERS,
  request: { name: `@${NAMESPACE}/${COMMAND_GET_ALL_FOLDERS}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_GET_ALL_FOLDERS}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_GET_SINGLE_FOLDER,
  request: { name: `@${NAMESPACE}/${COMMAND_GET_SINGLE_FOLDER}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_GET_SINGLE_FOLDER}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_SUBSCRIBE_FOLDER,
  request: { name: `@${NAMESPACE}/${COMMAND_SUBSCRIBE_FOLDER}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_SUBSCRIBE_FOLDER}-${RESPONSE}`, stream: true }
})

ns.register({
  name: COMMAND_SUBSCRIBE_FOLDER_KEYS,
  request: { name: `@${NAMESPACE}/${COMMAND_SUBSCRIBE_FOLDER_KEYS}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_SUBSCRIBE_FOLDER_KEYS}-${RESPONSE}`, stream: true }
})

ns.register({
  name: COMMAND_DELETE_FOLDER,
  request: { name: `@${NAMESPACE}/${COMMAND_DELETE_FOLDER}-${REQUEST}`, send: true },
})

ns.register({
  name: COMMAND_INSERT_NOTE,
  request: { name: `@${NAMESPACE}/${COMMAND_INSERT_NOTE}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_INSERT_NOTE}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_UPDATE_NOTE,
  request: { name: `@${NAMESPACE}/${COMMAND_UPDATE_NOTE}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_UPDATE_NOTE}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_GET_ALL_NOTES,
  request: { name: `@${NAMESPACE}/${COMMAND_GET_ALL_NOTES}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_GET_ALL_NOTES}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_GET_SINGLE_NOTE,
  request: { name: `@${NAMESPACE}/${COMMAND_GET_SINGLE_NOTE}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_GET_SINGLE_NOTE}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_SUBSCRIBE_NOTE,
  request: { name: `@${NAMESPACE}/${COMMAND_SUBSCRIBE_NOTE}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_SUBSCRIBE_NOTE}-${RESPONSE}`, stream: true }
})

ns.register({
  name: COMMAND_SUBSCRIBE_NOTE_KEYS,
  request: { name: `@${NAMESPACE}/${COMMAND_SUBSCRIBE_NOTE_KEYS}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_SUBSCRIBE_NOTE_KEYS}-${RESPONSE}`, stream: true }
})

ns.register({
  name: COMMAND_DELETE_NOTE,
  request: { name: `@${NAMESPACE}/${COMMAND_DELETE_NOTE}-${REQUEST}`, send: true },
})

ns.register({
  name: COMMAND_TRASH_NOTE,
  request: { name: `@${NAMESPACE}/${COMMAND_TRASH_NOTE}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_TRASH_NOTE}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_RESTORE_NOTE,
  request: { name: `@${NAMESPACE}/${COMMAND_RESTORE_NOTE}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_RESTORE_NOTE}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_PURGE_EXPIRED_TRASH,
  request: { name: `@${NAMESPACE}/${COMMAND_PURGE_EXPIRED_TRASH}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_PURGE_EXPIRED_TRASH}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_INSERT_FILE,
  request: { name: `@${NAMESPACE}/${COMMAND_INSERT_FILE}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_INSERT_FILE}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_INSERT_FILE_PROGRESS,
  request: { name: `@${NAMESPACE}/${COMMAND_INSERT_FILE_PROGRESS}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_INSERT_FILE_PROGRESS}-${RESPONSE}`, stream: true }
})

ns.register({
  name: COMMAND_DELETE_FILE,
  request: { name: `@${NAMESPACE}/${COMMAND_DELETE_FILE}-${REQUEST}`, send: true },
})

ns.register({
  name: COMMAND_DELETE_NOTE_FILE,
  request: { name: `@${NAMESPACE}/${COMMAND_DELETE_NOTE_FILE}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_DELETE_NOTE_FILE}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_CREATE_INVITE,
  request: { name: `@${NAMESPACE}/${COMMAND_CREATE_INVITE}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_CREATE_INVITE}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_SUBSCRIBE_PAIRING,
  request: { name: `@${NAMESPACE}/${COMMAND_SUBSCRIBE_PAIRING}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_SUBSCRIBE_PAIRING}-${RESPONSE}`, stream: true }
})

ns.register({
  name: COMMAND_SUBSCRIBE_PAIR_USER,
  request: { name: `@${NAMESPACE}/${COMMAND_SUBSCRIBE_PAIR_USER}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_SUBSCRIBE_PAIR_USER}-${RESPONSE}`, stream: true }
})

ns.register({
  name: COMMAND_CONFIRM_PAIRING,
  request: { name: `@${NAMESPACE}/${COMMAND_CONFIRM_PAIRING}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_CONFIRM_PAIRING}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_REJECT_PAIRING,
  request: { name: `@${NAMESPACE}/${COMMAND_REJECT_PAIRING}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_REJECT_PAIRING}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_UPDATE_SETTINGS,
  request: { name: `@${NAMESPACE}/${COMMAND_UPDATE_SETTINGS}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_UPDATE_SETTINGS}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_GET_SETTINGS,
  request: { name: `@${NAMESPACE}/${COMMAND_GET_SETTINGS}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_GET_SETTINGS}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_SUBSCRIBE_SETTINGS,
  request: { name: `@${NAMESPACE}/${COMMAND_SUBSCRIBE_SETTINGS}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_SUBSCRIBE_SETTINGS}-${RESPONSE}`, stream: true }
})

ns.register({
  name: COMMAND_UPDATE_PREFERENCE,
  request: { name: `@${NAMESPACE}/${COMMAND_UPDATE_PREFERENCE}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_UPDATE_PREFERENCE}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_GET_PREFERENCE,
  request: { name: `@${NAMESPACE}/${COMMAND_GET_PREFERENCE}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_GET_PREFERENCE}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_SET_NOTE_LOCK_PASSWORD,
  request: { name: `@${NAMESPACE}/${COMMAND_SET_NOTE_LOCK_PASSWORD}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_SET_NOTE_LOCK_PASSWORD}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_VERIFY_NOTE_LOCK_PASSWORD,
  request: { name: `@${NAMESPACE}/${COMMAND_VERIFY_NOTE_LOCK_PASSWORD}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_VERIFY_NOTE_LOCK_PASSWORD}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_INSERT_SYNCED_DEVICE,
  request: { name: `@${NAMESPACE}/${COMMAND_INSERT_SYNCED_DEVICE}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_INSERT_SYNCED_DEVICE}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_UPDATE_SYNCED_DEVICE,
  request: { name: `@${NAMESPACE}/${COMMAND_UPDATE_SYNCED_DEVICE}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_UPDATE_SYNCED_DEVICE}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_DELETE_SYNCED_DEVICE,
  request: { name: `@${NAMESPACE}/${COMMAND_DELETE_SYNCED_DEVICE}-${REQUEST}`, send: true },
})

ns.register({
  name: COMMAND_SET_DEVICE_INDEXER,
  request: { name: `@${NAMESPACE}/${COMMAND_SET_DEVICE_INDEXER}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_SET_DEVICE_INDEXER}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_SUBSCRIBE_SYNCED_DEVICE,
  request: { name: `@${NAMESPACE}/${COMMAND_SUBSCRIBE_SYNCED_DEVICE}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_SUBSCRIBE_SYNCED_DEVICE}-${RESPONSE}`, stream: true }
})

ns.register({
  name: COMMAND_SUBSCRIBE_ALL_SYNCED_DEVICE_KEYS,
  request: { name: `@${NAMESPACE}/${COMMAND_SUBSCRIBE_ALL_SYNCED_DEVICE_KEYS}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_SUBSCRIBE_ALL_SYNCED_DEVICE_KEYS}-${RESPONSE}`, stream: true }
})

ns.register({
  name: COMMAND_SUBSCRIBE_DEVICE_STATUS,
  request: { name: `@${NAMESPACE}/${COMMAND_SUBSCRIBE_DEVICE_STATUS}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_SUBSCRIBE_DEVICE_STATUS}-${RESPONSE}`, stream: true }
})

ns.register({
  name: COMMAND_CHECK_AND_INSERT_LOCAL_DEVICE,
  request: { name: `@${NAMESPACE}/${COMMAND_CHECK_AND_INSERT_LOCAL_DEVICE}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_CHECK_AND_INSERT_LOCAL_DEVICE}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_SUBSCRIBE_STORAGE_INFO,
  request: { name: `@${NAMESPACE}/${COMMAND_SUBSCRIBE_STORAGE_INFO}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_SUBSCRIBE_STORAGE_INFO}-${RESPONSE}`, stream: true }
})

ns.register({
  name: COMMAND_EXPORT_BACKUP,
  request: { name: `@${NAMESPACE}/${COMMAND_EXPORT_BACKUP}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_EXPORT_BACKUP}-${RESPONSE}`, stream: true }
})

ns.register({
  name: COMMAND_IMPORT_BACKUP,
  request: { name: `@${NAMESPACE}/${COMMAND_IMPORT_BACKUP}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_IMPORT_BACKUP}-${RESPONSE}`, stream: true }
})

ns.register({
  name: COMMAND_GET_ACTIVITY,
  request: { name: `@${NAMESPACE}/${COMMAND_GET_ACTIVITY}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_GET_ACTIVITY}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_GET_ACTIVITY_DIFF,
  request: { name: `@${NAMESPACE}/${COMMAND_GET_ACTIVITY_DIFF}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_GET_ACTIVITY_DIFF}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_RECOVER_DISCARDED_WRITE,
  request: { name: `@${NAMESPACE}/${COMMAND_RECOVER_DISCARDED_WRITE}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_RECOVER_DISCARDED_WRITE}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_GET_ACTIVITY_STATS,
  request: { name: `@${NAMESPACE}/${COMMAND_GET_ACTIVITY_STATS}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_GET_ACTIVITY_STATS}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_CLEAR_ACTIVITY,
  request: { name: `@${NAMESPACE}/${COMMAND_CLEAR_ACTIVITY}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_CLEAR_ACTIVITY}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_SUBSCRIBE_ACTIVITY,
  request: { name: `@${NAMESPACE}/${COMMAND_SUBSCRIBE_ACTIVITY}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_SUBSCRIBE_ACTIVITY}-${RESPONSE}`, stream: true }
})

ns.register({
  name: COMMAND_BROADCAST_YJS_UPDATE,
  request: { name: `@${NAMESPACE}/${COMMAND_BROADCAST_YJS_UPDATE}-${REQUEST}`, send: true }
})

ns.register({
  name: COMMAND_SUBSCRIBE_YJS_UPDATE,
  request: { name: `@${NAMESPACE}/${COMMAND_SUBSCRIBE_YJS_UPDATE}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_SUBSCRIBE_YJS_UPDATE}-${RESPONSE}`, stream: true }
})

ns.register({
  name: COMMAND_SUSPEND_SERVICES,
  request: { name: `@${NAMESPACE}/${COMMAND_SUSPEND_SERVICES}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_SUSPEND_SERVICES}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_RESUME_SERVICES,
  request: { name: `@${NAMESPACE}/${COMMAND_RESUME_SERVICES}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_RESUME_SERVICES}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_GET_DEBUG_INFO,
  request: { name: `@${NAMESPACE}/${COMMAND_GET_DEBUG_INFO}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_GET_DEBUG_INFO}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_RESET_STALLED_MEDIA,
  request: { name: `@${NAMESPACE}/${COMMAND_RESET_STALLED_MEDIA}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_RESET_STALLED_MEDIA}-${RESPONSE}`, stream: false }
})

// Appended last: hrpc numbers commands in registration order.
ns.register({
  name: COMMAND_START_FRESH_VAULT,
  request: { name: `@${NAMESPACE}/${COMMAND_START_FRESH_VAULT}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_START_FRESH_VAULT}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_GET_ERROR_LOG,
  request: { name: `@${NAMESPACE}/${COMMAND_GET_ERROR_LOG}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_GET_ERROR_LOG}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_CLEAR_ERROR_LOG,
  request: { name: `@${NAMESPACE}/${COMMAND_CLEAR_ERROR_LOG}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_CLEAR_ERROR_LOG}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_RECORD_LOGS,
  request: { name: `@${NAMESPACE}/${COMMAND_RECORD_LOGS}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_RECORD_LOGS}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_LIST_VAULTS,
  request: { name: `@${NAMESPACE}/${COMMAND_LIST_VAULTS}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_LIST_VAULTS}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_CREATE_VAULT,
  request: { name: `@${NAMESPACE}/${COMMAND_CREATE_VAULT}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_CREATE_VAULT}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_SWITCH_VAULT,
  request: { name: `@${NAMESPACE}/${COMMAND_SWITCH_VAULT}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_SWITCH_VAULT}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_RENAME_VAULT,
  request: { name: `@${NAMESPACE}/${COMMAND_RENAME_VAULT}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_RENAME_VAULT}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_REMOVE_VAULT,
  request: { name: `@${NAMESPACE}/${COMMAND_REMOVE_VAULT}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_REMOVE_VAULT}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_MOVE_TO_VAULT,
  request: { name: `@${NAMESPACE}/${COMMAND_MOVE_TO_VAULT}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_MOVE_TO_VAULT}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_SET_ERROR_LOG_ENABLED,
  request: { name: `@${NAMESPACE}/${COMMAND_SET_ERROR_LOG_ENABLED}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_SET_ERROR_LOG_ENABLED}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_SEARCH_NOTES,
  request: { name: `@${NAMESPACE}/${COMMAND_SEARCH_NOTES}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_SEARCH_NOTES}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_PREWARM_SEARCH,
  request: { name: `@${NAMESPACE}/${COMMAND_PREWARM_SEARCH}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_PREWARM_SEARCH}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_DERIVED_PUT,
  request: { name: `@${NAMESPACE}/${COMMAND_DERIVED_PUT}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_DERIVED_PUT}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_DERIVED_GET,
  request: { name: `@${NAMESPACE}/${COMMAND_DERIVED_GET}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_DERIVED_GET}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_DERIVED_VERSIONS,
  request: { name: `@${NAMESPACE}/${COMMAND_DERIVED_VERSIONS}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_DERIVED_VERSIONS}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_DERIVED_CLEAR,
  request: { name: `@${NAMESPACE}/${COMMAND_DERIVED_CLEAR}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_DERIVED_CLEAR}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_DERIVED_STATS,
  request: { name: `@${NAMESPACE}/${COMMAND_DERIVED_STATS}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_DERIVED_STATS}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_DERIVED_SEARCH,
  request: { name: `@${NAMESPACE}/${COMMAND_DERIVED_SEARCH}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_DERIVED_SEARCH}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_DERIVED_RELATED,
  request: { name: `@${NAMESPACE}/${COMMAND_DERIVED_RELATED}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_DERIVED_RELATED}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_DERIVED_DUPLICATES,
  request: { name: `@${NAMESPACE}/${COMMAND_DERIVED_DUPLICATES}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_DERIVED_DUPLICATES}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_AI_OFFLOAD_STATUS,
  request: { name: `@${NAMESPACE}/${COMMAND_AI_OFFLOAD_STATUS}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_AI_OFFLOAD_STATUS}-${RESPONSE}`, stream: true }
})

ns.register({
  name: COMMAND_AI_OFFLOAD_RUN,
  request: { name: `@${NAMESPACE}/${COMMAND_AI_OFFLOAD_RUN}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_AI_OFFLOAD_RUN}-${RESPONSE}`, stream: true }
})

ns.register({
  name: COMMAND_AI_OFFLOAD_CANCEL,
  request: { name: `@${NAMESPACE}/${COMMAND_AI_OFFLOAD_CANCEL}-${REQUEST}`, send: true }
})

ns.register({
  name: COMMAND_AI_OFFLOAD_SERVE,
  request: { name: `@${NAMESPACE}/${COMMAND_AI_OFFLOAD_SERVE}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_AI_OFFLOAD_SERVE}-${RESPONSE}`, stream: false }
})

ns.register({
  name: COMMAND_AI_OFFLOAD_JOBS,
  request: { name: `@${NAMESPACE}/${COMMAND_AI_OFFLOAD_JOBS}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_AI_OFFLOAD_JOBS}-${RESPONSE}`, stream: true }
})

ns.register({
  name: COMMAND_AI_OFFLOAD_REPLY,
  request: { name: `@${NAMESPACE}/${COMMAND_AI_OFFLOAD_REPLY}-${REQUEST}`, send: true }
})

ns.register({
  name: COMMAND_UPCOMING_TASKS,
  request: { name: `@${NAMESPACE}/${COMMAND_UPCOMING_TASKS}-${REQUEST}`, stream: false },
  response: { name: `@${NAMESPACE}/${COMMAND_UPCOMING_TASKS}-${RESPONSE}`, stream: false }
})

for (const command of [
  COMMAND_SET_SYNCED_PREF,
  COMMAND_GET_SYNCED_PREFS,
  COMMAND_SET_TASK_CHECKED,
  COMMAND_ATTACHMENTS,
  COMMAND_OPEN_LOCK_SESSION,
  COMMAND_CLOSE_LOCK_SESSION,
  COMMAND_CHECK_BACKUP_RESTORE,
  COMMAND_GET_HELD_MERGE,
  COMMAND_COMBINE_HELD_MERGE
]) {
  ns.register({
    name: command,
    request: { name: `@${NAMESPACE}/${command}-${REQUEST}`, stream: false },
    response: { name: `@${NAMESPACE}/${command}-${RESPONSE}`, stream: false }
  })
}

HRPCBuilder.toDisk(builder)
