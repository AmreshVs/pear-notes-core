// Never turn a failed read into null: apply treats null as "no such key".
// Every stored field must be declared in spec/build-db.js, or hyperschema drops it.
import { INVITE_KEY } from './viewKeys.js'
import { onViewChanges, watchHyperdbChanges, watchHyperdbKey } from './viewWatch.js'

const NOTES = '@notes/notes'
const INVITES = '@notes/invites'
const FOLDERS = '@notes/folders'
const SETTINGS = '@notes/settings'
const SYNCED_DEVICES = '@notes/syncedDevices'
const MEDIA_TOMBSTONES = '@notes/mediaTombstones'
const ENCRYPTED_MEDIA_CORES = '@notes/encryptedMediaCores'
const ACTIVITY = '@notes/activity'
const ACTIVITY_BY_NOTE = '@notes/activityByNote'
const ACTIVITY_SNAPSHOTS = '@notes/activitySnapshots'
const ACTIVITY_DISCARDED = '@notes/activityDiscarded'
const ACTIVITY_EDIT_SESSIONS = '@notes/activitySessions'
const ACTIVITY_TITLE_SESSIONS = '@notes/activityTitleSessions'
const ACTIVITY_STATE = '@notes/activityState'

const SETTINGS_ID = 'settings'
const CLEARED_AT_ID = 'clearedAt'

// HyperDB reads absent strings and '' as null; map them back to ''.
/** @returns {any} */
function fromRecord(record, ...keyFields) {
  if (record == null) return null
  /** @type {Record<string, any>} */
  const value = {}
  for (const [field, fieldValue] of Object.entries(record)) {
    if (keyFields.includes(field)) continue
    value[field] = fieldValue === null ? '' : fieldValue
  }
  return value
}

async function collect(stream, map) {
  const out = []
  for await (const record of stream) out.push(map(record))
  return out
}

async function deleteAll(db, collection, query = {}) {
  const rows = await collect(db.find(collection, query), (record) => record)
  for (const row of rows) await db.delete(collection, row)
}

// The pairing invite arrives as note '@invite' but lives in its own collection.
export async function getNote(db, key) {
  if (key === INVITE_KEY) return fromRecord(await db.get(INVITES, { slot: INVITE_KEY }), 'slot')
  return fromRecord(await db.get(NOTES, { key }), 'key')
}

export function putNote(db, key, value) {
  if (key === INVITE_KEY) return db.insert(INVITES, { ...value, slot: INVITE_KEY })
  return db.insert(NOTES, { ...value, key })
}

export function delNote(db, key) {
  if (key === INVITE_KEY) return db.delete(INVITES, { slot: INVITE_KEY })
  return db.delete(NOTES, { key })
}

export async function* notes(db) {
  for await (const record of db.find(NOTES, {})) {
    yield { key: record.key, value: fromRecord(record, 'key') }
  }
}

export const getFolder = async (db, key) => fromRecord(await db.get(FOLDERS, { key }), 'key')
export const putFolder = (db, key, value) => db.insert(FOLDERS, { ...value, key })
export const delFolder = (db, key) => db.delete(FOLDERS, { key })

export async function* folders(db) {
  for await (const record of db.find(FOLDERS, {})) {
    yield { key: record.key, value: fromRecord(record, 'key') }
  }
}

function settingsFrom(record) {
  if (!record?.json) return null
  return JSON.parse(record.json)
}

export const getSettings = async (db) => settingsFrom(await db.get(SETTINGS, { id: SETTINGS_ID }))
export const putSettings = (db, value) =>
  db.insert(SETTINGS, { id: SETTINGS_ID, json: JSON.stringify(value ?? null) })

// Synced preferences share the settings collection under their own id prefix.
const SYNCED_PREF_PREFIX = 'pref/'

export const putSyncedPref = (db, id, value) =>
  value === null
    ? db.delete(SETTINGS, { id: SYNCED_PREF_PREFIX + id })
    : db.insert(SETTINGS, { id: SYNCED_PREF_PREFIX + id, json: JSON.stringify(value) })

export async function syncedPrefs(db, prefix = '') {
  const from = SYNCED_PREF_PREFIX + prefix
  const prefs = {}
  for await (const record of db.find(SETTINGS, {
    gte: { id: from },
    lt: { id: from + '\uffff' }
  })) {
    const value = settingsFrom(record)
    if (value) prefs[record.id.slice(SYNCED_PREF_PREFIX.length)] = value
  }
  return prefs
}

export const getSyncedDevice = async (db, key) =>
  fromRecord(await db.get(SYNCED_DEVICES, { key }), 'key')
export const putSyncedDevice = (db, key, value) => db.insert(SYNCED_DEVICES, { ...value, key })
export const delSyncedDevice = (db, key) => db.delete(SYNCED_DEVICES, { key })

export async function* syncedDevices(db) {
  for await (const record of db.find(SYNCED_DEVICES, {})) {
    yield { key: record.key, value: fromRecord(record, 'key') }
  }
}

export const putMediaTombstone = (db, refKey, value) =>
  db.insert(MEDIA_TOMBSTONES, { ...value, refKey })
export const delMediaTombstone = (db, refKey) => db.delete(MEDIA_TOMBSTONES, { refKey })

export async function* mediaTombstones(db) {
  for await (const record of db.find(MEDIA_TOMBSTONES, {})) {
    yield { key: record.refKey, value: fromRecord(record, 'refKey') }
  }
}

export const putEncryptedMediaCore = (db, coreKeyHex, value) =>
  db.insert(ENCRYPTED_MEDIA_CORES, { ...value, coreKey: coreKeyHex })
export const hasEncryptedMediaCore = async (db, coreKeyHex) =>
  !!(await db.get(ENCRYPTED_MEDIA_CORES, { coreKey: coreKeyHex }))

export async function* encryptedMediaCores(db) {
  for await (const record of db.find(ENCRYPTED_MEDIA_CORES, {})) {
    yield { key: record.coreKey, value: fromRecord(record, 'coreKey') }
  }
}

function toEntry(id, entry) {
  const { meta, ...rest } = entry
  return { ...rest, id, meta: JSON.stringify(meta ?? {}) }
}

function fromEntry(record) {
  if (record == null) return null
  const entry = fromRecord(record)
  entry.meta = record.meta ? JSON.parse(record.meta) : {}
  return entry
}

export const getActivityEntry = async (db, id) => fromEntry(await db.get(ACTIVITY, { id }))
export const putActivityEntry = (db, id, entry) => db.insert(ACTIVITY, toEntry(id, entry))
export const delActivityEntry = (db, id) => db.delete(ACTIVITY, { id })

export async function* activityEntries(db) {
  for await (const record of db.find(ACTIVITY, {})) {
    yield { key: record.id, value: fromEntry(record) }
  }
}

// Range bounds must be objects ({ lt: { id } }); a bare value matches nothing.
export const activityValuesBefore = (db, boundary) =>
  collect(db.find(ACTIVITY, { lt: { id: boundary } }), fromEntry)

export async function hasActivityBefore(db, boundary) {
  for await (const record of db.find(ACTIVITY, { lt: { id: boundary } }, { limit: 1 })) {
    if (record) return true
  }
  return false
}

export async function activityIdsDescending(db, { noteKey = '', cursor = '', limit }) {
  if (!noteKey) {
    const query = cursor ? { lt: { id: cursor } } : {}
    return collect(db.find(ACTIVITY, query, { reverse: true, limit }), (record) => record.id)
  }
  // Tuple index bounds match nothing, so the cursor is applied while walking.
  const ids = []
  for await (const record of db.find(
    ACTIVITY_BY_NOTE,
    { gte: noteKey, lte: noteKey },
    { reverse: true }
  )) {
    if (cursor && record.id >= cursor) continue
    ids.push(record.id)
    if (ids.length >= limit) break
  }
  return ids
}

export const activityIdsForNote = (db, noteKey) =>
  collect(db.find(ACTIVITY_BY_NOTE, { gte: noteKey, lte: noteKey }), (record) => record.id)

export async function* activityIdsForNoteAfter(db, noteKey, afterId) {
  for await (const record of db.find(ACTIVITY_BY_NOTE, { gte: noteKey, lte: noteKey })) {
    if (record.id > afterId) yield record.id
  }
}

export const getActivitySnapshot = async (db, id) =>
  fromRecord(await db.get(ACTIVITY_SNAPSHOTS, { id }), 'id')
export const putActivitySnapshot = (db, id, value) =>
  db.insert(ACTIVITY_SNAPSHOTS, { ...value, id })
export const delActivitySnapshot = (db, id) => db.delete(ACTIVITY_SNAPSHOTS, { id })

export async function* activitySnapshots(db) {
  for await (const record of db.find(ACTIVITY_SNAPSHOTS, {})) {
    yield { key: record.id, value: fromRecord(record, 'id') }
  }
}

function discardedFrom(record) {
  if (!record?.json) return null
  return JSON.parse(record.json)
}

export const getActivityDiscarded = async (db, id) =>
  discardedFrom(await db.get(ACTIVITY_DISCARDED, { id }))
export const putActivityDiscarded = (db, id, value) =>
  db.insert(ACTIVITY_DISCARDED, { id, json: JSON.stringify(value) })
export const delActivityDiscarded = (db, id) => db.delete(ACTIVITY_DISCARDED, { id })

export async function* activityDiscardedEntries(db) {
  for await (const record of db.find(ACTIVITY_DISCARDED, {})) {
    yield { key: record.id, value: discardedFrom(record) }
  }
}

export const SESSION_EDIT = ACTIVITY_EDIT_SESSIONS
export const SESSION_TITLE = ACTIVITY_TITLE_SESSIONS

export const getActivitySession = async (db, kind, noteKey, device) =>
  fromRecord(await db.get(kind, { noteKey, writer: device }), 'noteKey', 'writer')
export const putActivitySession = (db, kind, noteKey, device, value) =>
  db.insert(kind, { ...value, noteKey, writer: device })
export const delActivitySession = (db, kind, noteKey, device) =>
  db.delete(kind, { noteKey, writer: device })

export async function delActivitySessionsForNote(db, noteKey) {
  for (const kind of [SESSION_EDIT, SESSION_TITLE]) {
    await deleteAll(db, kind, { gte: { noteKey }, lte: { noteKey } })
  }
}

export async function getActivityClearedAt(db) {
  const record = await db.get(ACTIVITY_STATE, { id: CLEARED_AT_ID })
  return Number.isFinite(record?.clearedAt) ? record.clearedAt : 0
}

export const putActivityClearedAt = (db, at) =>
  db.insert(ACTIVITY_STATE, { id: CLEARED_AT_ID, clearedAt: at })

// The ACTIVITY_STATE watermark must survive a clear.
export async function clearAllActivity(db) {
  for (const collection of [
    ACTIVITY,
    ACTIVITY_SNAPSHOTS,
    ACTIVITY_DISCARDED,
    ACTIVITY_EDIT_SESSIONS,
    ACTIVITY_TITLE_SESSIONS
  ]) {
    await deleteAll(db, collection)
  }
}

export const watchNote = (db, key) =>
  key === INVITE_KEY
    ? watchHyperdbKey(db, INVITES, { slot: INVITE_KEY }, (record) => fromRecord(record, 'slot'))
    : watchHyperdbKey(db, NOTES, { key }, (record) => fromRecord(record, 'key'))
export const watchFolder = (db, key) =>
  watchHyperdbKey(db, FOLDERS, { key }, (record) => fromRecord(record, 'key'))
export const watchSettings = (db) =>
  watchHyperdbKey(db, SETTINGS, { id: SETTINGS_ID }, settingsFrom)
export const watchSyncedDevice = (db, key) =>
  watchHyperdbKey(db, SYNCED_DEVICES, { key }, (record) => fromRecord(record, 'key'))

export const watchAll = (db) => watchHyperdbChanges(db)
export const watchNoteKeys = (db) => watchHyperdbChanges(db, [NOTES])
export const watchFolderKeys = (db) => watchHyperdbChanges(db, [FOLDERS])
export const watchSyncedDeviceKeys = (db) => watchHyperdbChanges(db, [SYNCED_DEVICES])

// fn(null) means the change could not be decoded; anything derived from notes must rescan.
export function onNoteChanges(db, fn) {
  return onViewChanges(db, (change) => {
    if (change.all) return fn(null)
    const ops = []
    for (const entry of change.entries) {
      if (entry.collection !== NOTES || !entry.value?.key) continue
      ops.push({
        key: entry.value.key,
        value: entry.type === 'insert' ? fromRecord(entry.value, 'key') : null
      })
    }
    if (ops.length) fn(ops)
  })
}

export const watchActivity = (db) => watchHyperdbChanges(db)
