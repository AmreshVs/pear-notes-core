import b4a from 'b4a'
import hypercoreCrypto from 'hypercore-crypto'

export const OP = {
  ADD_WRITER: 'add_writer',
  ADD_NOTE: 'add_note',
  REMOVE_NOTE: 'remove_note',
  ADD_FOLDER: 'add_folder',
  REMOVE_FOLDER: 'remove_folder',
  ADD_SETTINGS: 'add_settings',
  ADD_SYNCED_DEVICE: 'add_synced_device',
  UPDATE_SYNCED_DEVICE: 'update_synced_device',
  REMOVE_SYNCED_DEVICE: 'remove_synced_device',
  DELETE_MEDIA: 'delete_media',
  PRUNE_MEDIA_TOMBSTONES: 'prune_media_tombstones',
  LOG_EVENT: 'log_event',
  PRUNE_ACTIVITY: 'prune_activity',
  CLEAR_ACTIVITY: 'clear_activity',
  SET_SYNCED_PREF: 'set_synced_pref'
}

const KNOWN = new Set(Object.values(OP))

// Only fields every sealing-capable core stores, so each device computes the same stamp.
const STAMPED_NOTE_FIELDS = [
  'title',
  'note',
  'folderKey',
  'addedAt',
  'updatedAt',
  'deletedAt',
  'previousFolderKey',
  'locked',
  'pinned',
  'sealed'
]

export function noteStamp(value) {
  if (!value) return ''
  const fields = STAMPED_NOTE_FIELDS.map((name) => value[name] ?? null)
  return b4a.toString(hypercoreCrypto.hash(b4a.from(JSON.stringify(fields))), 'hex')
}

// 32 raw bytes as hex. b4a.from silently truncates bad hex, so check first.
export function decodeWriterKey(value) {
  if (typeof value !== 'string' || !/^[0-9a-fA-F]{64}$/.test(value)) return null
  return b4a.from(value, 'hex')
}

const isKey = (value) => typeof value === 'string' && value.length > 0
const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value)

// A node that fails this is skipped on every device alike, so the views match.
export function isValidOp(op) {
  if (!isObject(op) || !KNOWN.has(op.type) || !Number.isFinite(op.at)) return false
  switch (op.type) {
    case OP.ADD_WRITER:
      return !!decodeWriterKey(op.key)
    case OP.ADD_NOTE:
      return (
        isKey(op.key) &&
        isObject(op.value) &&
        (op.value.sealed == null || typeof op.value.sealed === 'string') &&
        (op.basis == null || typeof op.basis === 'string')
      )
    case OP.ADD_FOLDER:
    case OP.ADD_SYNCED_DEVICE:
    case OP.UPDATE_SYNCED_DEVICE:
      return isKey(op.key) && isObject(op.value)
    case OP.REMOVE_NOTE:
    case OP.REMOVE_FOLDER:
    case OP.REMOVE_SYNCED_DEVICE:
      return isKey(op.key)
    case OP.ADD_SETTINGS:
      return op.value === null || isObject(op.value)
    case OP.DELETE_MEDIA:
      return isKey(op.refKey) && isKey(op.url)
    case OP.PRUNE_MEDIA_TOMBSTONES:
    case OP.PRUNE_ACTIVITY:
      return Number.isFinite(op.cutoff) && op.cutoff > 0
    case OP.LOG_EVENT:
      return isKey(op.event)
    case OP.SET_SYNCED_PREF:
      return isKey(op.id) && (op.value === null || isObject(op.value))
    default:
      return true
  }
}
