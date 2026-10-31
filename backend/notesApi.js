import b4a from 'b4a'
import crypto from 'bare-crypto'
import fs from 'bare-fs'
import { platform } from 'bare-os'
import path from 'bare-path'

import {
  BACKGROUND_SERVICE_FAILED_AT_KEY,
  BACKUP_ERROR,
  DEVICE_NAME_MAX_LENGTH,
  FOLDER_NAME_MAX_LENGTH,
  HELD_MERGE_CHANGED,
  LAST_SYNC_AT_KEY,
  LAST_SYNC_RECEIVED_KEY,
  LAST_WAKE_AT_KEY,
  LAST_WAKE_RESULT_KEY,
  LOCK_REFUSAL,
  MEDIA_SYNC_PAUSED_KEY,
  METERED_CONNECTION_KEY,
  RECENTLY_DELETED_KEY,
  SYNC_ACTIVITY_WRITE_INTERVAL_MS,
  UPDATE_CLEARED,
  VAULT_ERROR,
  sanitizeDeviceName
} from '../constant.js'
import { isValidBackupPassword, normalizeFolderIcon, normalizeFolderName } from '../utils.js'

import { backendBoot } from '../bootTimeline.js'

import { setChecklistItemChecked } from '../store/services/noteTasks.js'
import { blobRefFromUrl, isCancellation } from './backupManager.js'
import { NoteSearchIndex } from './noteSearch.js'
import {
  duplicatePairs,
  loadNoteVectors,
  relatedVectors,
  searchVectors,
  toQueryVector,
  updateDuplicates
} from './vectorSearch.js'
import NoteBase, { findLegacyStores, preserveLegacyVault } from './NoteBase.js'
import PreferenceBase from './PreferenceBase.js'
import {
  isSealedPreference,
  moveSealedPreferences,
  readSealedPreference,
  writeSealedPreference
} from './sealedPreferences.js'
import {
  deriveVerifier,
  getAttemptState,
  getRetryAfterMs,
  recordFailedAttempt,
  recordSuccessfulAttempt,
  restoreAttemptState,
  verifyPassword
} from './noteLockPassword.js'
import * as log from '../log.js'
import { errorLog } from './errorLog.js'
import {
  createKeyring,
  currentKeyring,
  keyringPrefId,
  retireKeyring,
  rootKeyFromHex,
  rootKeyOpens,
  rootKeyToHex,
  suggestsPasswordChange,
  wipe
} from './lockCrypto.js'
import { createFileKey } from './fileCrypto.js'
import { envelopeRelink, relinkHtml } from './sealedEnvelope.js'
import { linksIn, noteLinks, rangeOf } from './vault/media.js'
import {
  addRootKey,
  closeLockSession as closeSession,
  getRootKey,
  holdFileKey,
  isLockSessionOpen,
  keepFileKey,
  onLockSessionChange,
  openNoteBody,
  openWithPassword,
  openWithRootKey,
  readableNote,
  restoreFileKeys,
  sealingKeyringId
} from './lockSession.js'
import {
  SealingPass,
  createFirstKeyring,
  forgetCopies,
  rememberCopies,
  relinkCopies,
  sealEnvelope,
  unkeyedLinks,
  withoutVerifier
} from './lockRollout.js'
import { SEALED_NOTES_CAP } from './deviceCaps.js'
import { COMPAT_LEVEL, UPDATE_REQUIRED, gateStatus, openGate } from './featureGates.js'

export let notesBase = null
export let preferenceBase = null

const sealingPass = new SealingPass(() => notesBase)
export const whenSealingIdle = () => sealingPass.idle()
onLockSessionChange((open) => {
  if (!open) return sealingPass.stop()
  const held = notesBase?.heldFileKeys
  if (held?.size) {
    restoreFileKeys(held.list())
    notesBase.pruneHeldFileKeys().catch((e) => log.error('[lock] held file keys prune', e))
  }
  sealingPass.start()
})

const searchIndex = new NoteSearchIndex({
  sizeOf: (url) => (url.includes('blob=') ? blobRefFromUrl(url)?.byteLength || 0 : 0)
})

const baseReopenedListeners = new Set()

export const onBaseReopened = (cb) => {
  baseReopenedListeners.add(cb)
  return () => baseReopenedListeners.delete(cb)
}

function notifyBaseReopened() {
  for (const cb of baseReopenedListeners) {
    try {
      cb()
    } catch (e) {
      log.error('base-reopened listener', e)
    }
  }
}

const PREFERENCE_READY_TIMEOUT_MS = 15000

let isPreferenceReady = false
let preferenceReadyResolvers = []

const signalPreferenceReady = () => {
  isPreferenceReady = true
  const resolvers = preferenceReadyResolvers
  preferenceReadyResolvers = []
  for (const resolve of resolvers) resolve()
}

const waitForPreferenceBase = async () => {
  if (isPreferenceReady && preferenceBase) return preferenceBase
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, PREFERENCE_READY_TIMEOUT_MS)
    preferenceReadyResolvers.push(() => {
      clearTimeout(timer)
      resolve()
    })
  })
  return preferenceBase
}

let lastSyncWriteAt = 0
let pendingSyncReceived = 0

const recordSyncActivity = async ({ at, received }) => {
  pendingSyncReceived += received || 0
  if (at - lastSyncWriteAt < SYNC_ACTIVITY_WRITE_INTERVAL_MS) return
  lastSyncWriteAt = at
  try {
    const base = await waitForPreferenceBase()
    if (!base) return
    const carried = pendingSyncReceived
    pendingSyncReceived = 0
    await base.put(LAST_SYNC_AT_KEY, String(at))
    await base.put(LAST_SYNC_RECEIVED_KEY, String(carried))
  } catch (e) {
    log.error('recordSyncActivity', e)
  }
}

const isMediaHoldPreference = (key) =>
  key === MEDIA_SYNC_PAUSED_KEY || key === METERED_CONNECTION_KEY

const applyMediaSyncHold = async () => {
  if (!notesBase || !preferenceBase) return
  try {
    const [paused, metered] = await Promise.all([
      preferenceBase.get(MEDIA_SYNC_PAUSED_KEY),
      preferenceBase.get(METERED_CONNECTION_KEY)
    ])
    await notesBase.setMediaSyncHeld(paused === 'true' || metered === 'true')
  } catch (e) {
    log.error('applyMediaSyncHold', e)
  }
}

// A renderer reload sends `ready` again, possibly while the last one is still
// opening. `close()` waits for that open; `_close()` would miss the store it is
// about to lock and leave it held.
let readyChain = Promise.resolve()

export const ready = (options) => {
  const run = readyChain.then(() => openBases(options))
  readyChain = run.catch(() => {})
  return run
}

const ROCKSDB_OLD_INFO_LOG = /^LOG\.old\.\d+$/
const ROCKSDB_LOG_SCAN_DEPTH = 4

// rocksdb-native keeps up to 1000 rotated info logs per database and exposes no option to lower it.
async function pruneRocksdbInfoLogs(dir, depth = 0) {
  let entries
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true })
  } catch {
    return 0
  }
  const old = entries
    .filter((entry) => entry.isFile() && ROCKSDB_OLD_INFO_LOG.test(entry.name))
    .map((entry) => entry.name)
    .sort()
  let removed = 0
  for (const name of old.slice(0, -1)) {
    try {
      await fs.promises.unlink(path.join(dir, name))
      removed++
    } catch (err) {
      log.debug('[storage] could not prune a rocksdb info log', err?.message)
    }
  }
  if (depth >= ROCKSDB_LOG_SCAN_DEPTH) return removed
  for (const entry of entries) {
    if (entry.isDirectory())
      removed += await pruneRocksdbInfoLogs(path.join(dir, entry.name), depth + 1)
  }
  return removed
}

const openBases = async ({ storage, encryption, entropy = null, appVersion = '' }) => {
  if (errorLog.filePath === null) {
    errorLog.open(storage)
    errorLog.note('[backend] started')
  }
  if (notesBase) {
    await notesBase.close().catch((e) => log.error('ready: closing the previous vault failed', e))
  }
  await preferenceBase?.close?.().catch(() => {})
  closeSession()
  notesBase = new NoteBase({ storage, encryption, entropy, appVersion: appVersion || '' })
  searchIndex.clear()
  notesBase.on('base-reopened', notifyBaseReopened)
  notesBase.on('notes-read', (notes) => searchIndex.sync(notes))
  notesBase.on('notes-changed', (ops) => searchIndex.apply(ops))
  notesBase.on('vault-closed', () => {
    searchIndex.clear()
    closeSession()
  })
  notesBase.on('sealed-save-rejected', () => sealingPass.start())
  notesBase.on('media-downloaded', () => {
    if (notesBase?.media?.sealWaiting.length) sealingPass.start()
  })
  for (const [event, cb] of aiOffloadListeners) notesBase.on(event, cb)
  notesBase.setAiOffloadServing(aiOffloadServing)
  notesBase.on('sync-activity', (info) => {
    recordSyncActivity(info).catch((e) => log.error('sync-activity', e))
  })
  preferenceBase = new PreferenceBase(storage)
  const pending = [notesBase.ready(), preferenceBase.ready()]
  for (const task of pending) task.catch(() => {})
  await Promise.all(pending)
  backendBoot.mark('notesApi.ready: bases ready')
  pruneRocksdbInfoLogs(storage)
    .then(
      (removed) => removed && log.info('[storage] removed ' + removed + ' old rocksdb info logs')
    )
    .catch(() => {})
  signalPreferenceReady()
  sealing = sealLegacyPreferences().catch((e) =>
    log.error('[prefs] could not seal stored preferences', e)
  )
  await applyMediaSyncHold()
  backendBoot.mark('notesApi.ready: media sync hold applied')
}

// LEGACY(hyperdb-migration): see docs/HYPERDB-VIEW-MIGRATION-PLAN-2026-09-23.md section 8
export const startFreshFromLegacyVault = async ({ storage }) => {
  if (findLegacyStores(storage).length === 0) return { done: false, reason: 'NOT_LEGACY' }
  await destroy()
  notesBase = null
  preferenceBase = null
  return preserveLegacyVault(storage)
}

export const destroy = async () => {
  sealingPass.stop()
  forgetCopies()
  searchIndex.clear()
  isPreferenceReady = false
  lastSyncWriteAt = 0
  pendingSyncReceived = 0
  const pending = [notesBase?.destroy(), preferenceBase?.destroy()].filter(Boolean)
  for (const task of pending) task.catch(() => {})
  await Promise.all(pending)
}

export const getChore = async () => {
  try {
    return await notesBase.getChore()
  } catch (e) {
    log.error('getChore api', e)
  }
}

export const insertFolder = async ({ title, icon }) => {
  try {
    const key = b4a.toString(crypto.randomBytes(32), 'hex')
    const data = {
      title: normalizeFolderName(title).slice(0, FOLDER_NAME_MAX_LENGTH),
      icon: normalizeFolderIcon(icon),
      addedAt: Date.now(),
      updatedAt: Date.now()
    }
    await notesBase.addFolder({ key, value: data })
    return key
  } catch (e) {
    log.error('insertFolder api', e)
  }
}

export const updateFolder = async ({ key, title, icon }) => {
  try {
    if (!key) return
    const folderFromDb = await notesBase.getFolder(key)

    const data = {
      ...folderFromDb,
      title: normalizeFolderName(title).slice(0, FOLDER_NAME_MAX_LENGTH),
      icon: icon == null ? normalizeFolderIcon(folderFromDb?.icon) : normalizeFolderIcon(icon),
      addedAt: folderFromDb.addedAt,
      updatedAt: Date.now()
    }
    await notesBase.updateFolder({ key, value: data })
  } catch (e) {
    log.error('updateFolder api', e)
  }
}

export const deleteFolder = async (key) => {
  try {
    if (!key) return
    await notesBase.removeFolder(key)
  } catch (e) {
    log.error('deleteFolder api', e)
  }
}

export const getAllFolders = async () => {
  try {
    return await notesBase.getAllFolders()
  } catch (e) {
    log.error('getAllFolders api', e)
  }
}

export const getSingleFolder = async ({ key }) => {
  try {
    return await notesBase.getFolder(key)
  } catch (e) {
    log.error('getSingleFolder api', e)
  }
}

export const susbscribeFolder = async ({ key }) => {
  try {
    return await notesBase.subscribeFolder(key)
  } catch (e) {
    log.error('subscribeFolder error', e)
  }
}

export const susbscribeFolderKeys = async () => {
  try {
    return await notesBase.subscribeAllFolderKeys()
  } catch (e) {
    log.error('susbscribeFolderKeys error', e)
  }
}

export const getAllFoldersKeys = async () => {
  try {
    return await notesBase.getAllFoldersKeys()
  } catch (e) {
    log.error('getAllFoldersKeys error', e)
  }
}

export const insertNote = async ({ title, note, folderKey, locked, pinned }) => {
  try {
    const key = b4a.toString(crypto.randomBytes(32), 'hex')
    let body = note
    let sealed = ''
    if (locked === true) {
      const keyrings = await readKeyrings()
      const keyringId = sealingKeyringId(keyrings)
      if (keyringId) {
        sealed = sealEnvelope(keyringId, key, note, '')
        body = ''
      } else if (keyrings.length) {
        return undefined
      }
    }
    const data = {
      title,
      note: body,
      folderKey,
      addedAt: Date.now(),
      updatedAt: Date.now(),
      locked: locked === true,
      pinned: pinned === true
    }
    if (sealed) data.sealed = sealed
    await notesBase.addNote({ key, value: data })
    return key
  } catch (e) {
    log.error('insertNote api', e)
  }
}

// Returns { done } truthfully. This used to swallow every failure and return
// undefined, which onCommandUpdateNote then reported to the frontend as
// { done: true } — a write that never reached the core looked like a save, and
// the editor advanced its base over content it had lost.
// Loud only when something is actually wrong, so it survives a release build
// (log.debug is suppressed there) without adding noise to a healthy save.
const SLOW_PHASE_MS = 1000

const timedPhase = async (phases, name, run) => {
  const started = Date.now()
  try {
    return await run()
  } finally {
    phases[name] = Date.now() - started
  }
}

const savesInFlight = new Set()

export const updateNote = (args) => {
  const save = saveNote(args)
  const settled = save.catch(() => {})
  savesInFlight.add(settled)
  settled.finally(() => savesInFlight.delete(settled))
  return save
}

const saveNote = async ({ key, title, note, folderKey, locked, pinned }) => {
  if (!key) return { done: false, reason: 'MISSING_KEY' }

  const phases = {}
  const startedAt = Date.now()
  const noteFromDb = await timedPhase(phases, 'read', () => notesBase.getNote(key))
  if (!noteFromDb) return { done: false, reason: 'NOTE_NOT_FOUND' }

  const carriesFolderKey = folderKey !== undefined && folderKey !== null && folderKey !== ''
  const nextFolderKey = carriesFolderKey ? folderKey : noteFromDb.folderKey
  const leftTrash =
    noteFromDb.folderKey === RECENTLY_DELETED_KEY && nextFolderKey !== RECENTLY_DELETED_KEY

  const data = {
    title,
    note,
    folderKey: nextFolderKey,
    addedAt: noteFromDb.addedAt,
    updatedAt: Math.max(
      Date.now(),
      (Number.isFinite(noteFromDb.updatedAt) ? noteFromDb.updatedAt : 0) + 1
    ),
    locked: locked !== undefined ? locked : noteFromDb.locked === true,
    pinned: pinned !== undefined ? pinned : noteFromDb.pinned === true
  }

  if (!leftTrash) {
    if (noteFromDb.deletedAt) data.deletedAt = noteFromDb.deletedAt
    if (noteFromDb.previousFolderKey) data.previousFolderKey = noteFromDb.previousFolderKey
  }

  const sealing = await timedPhase(phases, 'seal', () => applySealing(key, noteFromDb, data))
  if (sealing.refused) return { done: false, reason: sealing.refused }

  // Deliberately not wrapped in try/catch: an append failure must reach the
  // caller. onCommandUpdateNote turns a throw into { done: false }.
  await timedPhase(phases, 'append', () =>
    notesBase.addNote({ key, value: data, unseal: sealing.unseal })
  )

  if (data.sealed) {
    const before = new Set(noteFromDb.sealed ? unkeyedLinks(noteFromDb.sealed) : [])
    if (unkeyedLinks(data.sealed).some((link) => !before.has(link))) sealingPass.start()
  }
  if (noteFromDb.sealed) {
    await notesBase.pruneHeldFileKeys(key).catch((e) => log.error('updateNote held keys', e))
  }

  // Secondary to the save: a prune failure must not report the note as unsaved.
  if (note !== undefined || sealing.unseal) {
    await timedPhase(phases, 'prune', async () => {
      try {
        await notesBase.pruneRemovedMedia(key, noteFromDb, data)
      } catch (e) {
        log.error('updateNote pruneRemovedMedia', e)
      }
    })
  }

  const total = Date.now() - startedAt
  if (total >= SLOW_PHASE_MS) {
    log.error('[slow] updateNote', {
      key,
      total,
      ...phases,
      bodyBytes: typeof note === 'string' ? note.length : 0
    })
  }

  return { done: true }
}

export const trashNote = async (key) => {
  try {
    if (!key) return false
    return await notesBase.trashNote(key)
  } catch (e) {
    log.error('trashNote api', e)
    return false
  }
}

export const restoreNote = async (key) => {
  try {
    if (!key) return { done: false, folderKey: '' }
    return await notesBase.restoreNote(key)
  } catch (e) {
    log.error('restoreNote api', e)
    return { done: false, folderKey: '' }
  }
}

export const purgeExpiredTrash = async () => {
  try {
    return await notesBase.purgeExpiredTrash()
  } catch (e) {
    log.error('purgeExpiredTrash api', e)
    return 0
  }
}

export const deleteNote = async (key) => {
  try {
    if (!key) return
    await notesBase.deleteNoteWithMedia(key)
  } catch (e) {
    log.error('deleteNote api', e)
  }
}

export const getAllNotes = async () => {
  try {
    return await notesBase.getAllNotes()
  } catch (e) {
    log.error('getAllNotes api', e)
  }
}

const readNotesForSearch = () => notesBase.getAllNotes()

export const getUpcomingTasks = async () => {
  if (!notesBase) return []
  if (!(await searchIndex.ensureWarm(readNotesForSearch))) {
    await searchIndex.ensureWarm(readNotesForSearch)
  }
  return searchIndex.upcoming()
}

const warmAttachmentIndex = async () => {
  if (!(await searchIndex.ensureWarm(readNotesForSearch))) {
    await searchIndex.ensureWarm(readNotesForSearch)
  }
}

export const getAttachmentCount = async () => {
  if (!notesBase) return 0
  await warmAttachmentIndex()
  return searchIndex.attachmentCount()
}

export const getAttachments = async () => {
  if (!notesBase) return []
  await warmAttachmentIndex()
  const items = searchIndex.attachments()
  let missing = new Set()
  try {
    missing = await notesBase.missingMediaUrls(items.map((item) => item.url))
  } catch (e) {
    log.error('getAttachments presence', e)
  }
  return items.map((item) => ({ ...item, local: !missing.has(item.url) }))
}

export const setSyncedPref = async ({ id, value }) => {
  if (!notesBase) throw new Error('no open vault')
  await notesBase.setSyncedPref(id, value)
}

export const getSyncedPrefs = async ({ prefix }) => {
  if (!notesBase) return {}
  return notesBase.getSyncedPrefs(prefix || '')
}

/** Ticks or unticks a checklist item in its note; false when the item is gone or the note is locked. */
export const setTaskChecked = async ({ noteKey, text, checked }) => {
  const current = notesBase ? await notesBase.getNote(noteKey) : null
  if (!current || current.locked === true) return false
  const html = setChecklistItemChecked(current.note, text, checked)
  if (html === null || html === current.note) return html !== null
  const result = await updateNote({ key: noteKey, title: current.title, note: html })
  return result.done === true
}

export const prewarmSearch = async () => {
  try {
    if (!notesBase) return false
    return await searchIndex.ensureWarm(readNotesForSearch)
  } catch (e) {
    log.error('prewarmSearch api', e)
    return false
  }
}

const DERIVED_UNAVAILABLE = { ok: false }

const derivedStore = () => notesBase?.derived ?? null

export const derivedPut = async ({ namespace, entries }) => {
  const store = derivedStore()
  if (!store) return DERIVED_UNAVAILABLE
  try {
    await store.putMany(
      namespace,
      (entries || []).map(({ id, version, value }) => ({
        id,
        version: version || 0,
        value: value && value.byteLength > 0 ? value : null
      }))
    )
    return { ok: true }
  } catch (e) {
    log.error('derivedPut api', e)
    return DERIVED_UNAVAILABLE
  }
}

export const derivedGet = async ({ namespace, ids }) => {
  const store = derivedStore()
  if (!store) return { entries: [], ok: false }
  try {
    const found = await Promise.all((ids || []).map((id) => store.get(namespace, id)))
    return { entries: found.filter(Boolean), ok: true }
  } catch (e) {
    log.error('derivedGet api', e)
    return { entries: [], ok: false }
  }
}

export const derivedVersions = async ({ namespace }) => {
  const store = derivedStore()
  if (!store) return { entries: [], ok: false }
  try {
    const versions = await store.versions(namespace)
    return { entries: [...versions].map(([id, version]) => ({ id, version })), ok: true }
  } catch (e) {
    log.error('derivedVersions api', e)
    return { entries: [], ok: false }
  }
}

export const derivedSearch = async ({ namespace, query, limit }) => {
  const store = derivedStore()
  const vector = toQueryVector(query)
  if (!store || !vector) return { results: [], ok: false }
  try {
    const results = await searchVectors(store.entries(namespace), vector, {
      limit: limit || undefined
    })
    return { results, ok: true }
  } catch (e) {
    log.error('derivedSearch api', e)
    return { results: [], ok: false }
  }
}

export const derivedRelated = async ({ namespace, id, limit }) => {
  const store = derivedStore()
  if (!store || !id) return { results: [], ok: false }
  try {
    const source = await store.get(namespace, id)
    if (!source) return { results: [], ok: true }
    const results = await relatedVectors(store.entries(namespace), id, source.value, {
      limit: limit || undefined
    })
    return { results, ok: true }
  } catch (e) {
    log.error('derivedRelated api', e)
    return { results: [], ok: false }
  }
}

const chunkText = (value) => {
  try {
    const chunks = JSON.parse(b4a.toString(value))
    return Array.isArray(chunks) ? chunks.map((chunk) => chunk?.[1] ?? '').join('\n') : null
  } catch {
    return null
  }
}

const NO_DUPLICATES = { pairs: [], checked: 0, remaining: 0, ok: false }

/** Checks stale notes for up to `checkMs` (0 only reads), then returns the stored pairs. */
export const derivedDuplicates = async ({
  namespace,
  textNamespace,
  pairNamespace,
  threshold,
  overlap,
  checkMs,
  limit
}) => {
  const store = derivedStore()
  if (!store || !pairNamespace) return NO_DUPLICATES
  try {
    const records = new Map()
    for await (const entry of store.entries(pairNamespace)) records.set(entry.id, entry)
    const textOf = async (id) => {
      const entry = textNamespace ? await store.get(textNamespace, id) : null
      return entry ? chunkText(entry.value) : null
    }
    const options = { threshold, overlap: textNamespace ? overlap : 0, textOf, checkMs: 0 }
    // Versions alone tell what is stale; vectors are only opened when something is.
    let notes = new Map(
      [...(await store.versions(namespace))].map(([id, version]) => [id, { id, version }])
    )
    let result = await updateDuplicates(notes, records, options)
    if (checkMs && result.remaining) {
      notes = await loadNoteVectors(store.entries(namespace))
      result = await updateDuplicates(notes, records, { ...options, checkMs })
    }
    const { writes, current, checked, remaining } = result
    if (writes.length) await store.putMany(pairNamespace, writes)
    const pairs = duplicatePairs(notes, current, { limit: limit || undefined })
    return { pairs, checked, remaining, ok: true }
  } catch (e) {
    log.error('derivedDuplicates api', e)
    return NO_DUPLICATES
  }
}

export const derivedClear = async ({ namespace }) => {
  const store = derivedStore()
  if (!store) return DERIVED_UNAVAILABLE
  try {
    await store.clear(namespace || null)
    return { ok: true }
  } catch (e) {
    log.error('derivedClear api', e)
    return DERIVED_UNAVAILABLE
  }
}

export const derivedStats = async ({ namespaces }) => {
  const store = derivedStore()
  if (!store) return { bytes: 0, counts: [], ok: false }
  try {
    const { bytes, counts } = await store.stats(namespaces || [])
    return {
      bytes,
      counts: Object.entries(counts).map(([namespace, count]) => ({ namespace, count })),
      ok: true
    }
  } catch (e) {
    log.error('derivedStats api', e)
    return { bytes: 0, counts: [], ok: false }
  }
}

export const searchNotes = async ({ query, folderKey, includeLocked, limit }) => {
  const startedAt = Date.now()
  if (!notesBase) return { results: [], total: 0, tookMs: 0 }
  if (!(await searchIndex.ensureWarm(readNotesForSearch))) {
    await searchIndex.ensureWarm(readNotesForSearch)
  }
  const found = searchIndex.search({ query, folderKey, includeLocked, limit })
  return { ...found, tookMs: Date.now() - startedAt }
}

export const getSingleNote = async ({ key }) => {
  try {
    return readableNote(key, await notesBase.getNote(key))
  } catch (e) {
    log.error('getSingleNote api', e)
  }
}

export const getStoredNote = async ({ key }) => notesBase.getNote(key)

export const susbscribeNote = async ({ key }) => {
  try {
    return await notesBase.subscribeNote(key)
  } catch (e) {
    log.error('subscribeNote error', e)
  }
}

export const susbscribeNoteKeys = async () => {
  try {
    return await notesBase.subscribeAllNoteKeys()
  } catch (e) {
    log.error('susbscribeNoteKeys error', e)
  }
}

export const getAllNoteKeys = async () => {
  try {
    return await notesBase.getAllNoteKeys()
  } catch (e) {
    log.error('getAllNoteKeys error', e)
  }
}

export const updateSettings = async ({ settings }) => {
  try {
    await notesBase.updateSettings({ settings })
  } catch (e) {
    log.error('updateSettings api', e)
  }
}

export const getSettings = async () => {
  try {
    return await notesBase.getSettings()
  } catch (e) {
    log.error('getSettings api', e)
  }
}

export const subscribeSettings = async () => {
  try {
    return await notesBase.subscribeSettings()
  } catch (e) {
    log.error('subscribeSettings api', e)
  }
}

const VAULT_SCOPED_PREFERENCES = new Set([
  'selectedFolder',
  'selectedNote',
  'localDeviceInserted',
  'isSynced',
  'askNoteThreads'
])

// Each of these describes one vault, not the device.
const scopePreferenceKey = (key) => {
  if (!VAULT_SCOPED_PREFERENCES.has(key) || !notesBase) return { key, legacy: null }
  const vaults = notesBase.listVaults()
  if (vaults.length < 2) return { key, legacy: null }
  const current = vaults.find((vault) => vault.current)
  if (!current) return { key, legacy: null }
  // Values saved before vaults were listed belong to the original vault (addedAt 0).
  return { key: `${key}:${current.id}`, legacy: current.addedAt ? null : key }
}

const storedKeysOf = (key) => {
  const scoped = scopePreferenceKey(key)
  return [scoped.key, scoped.legacy, key].filter((k, i, all) => k && all.indexOf(k) === i)
}

let sealing = Promise.resolve()

const sealLegacyPreferences = async () => {
  const store = derivedStore()
  const base = await waitForPreferenceBase()
  if (!store || !base) return
  if (await moveSealedPreferences(store, base, storedKeysOf)) {
    log.info('[prefs] moved Ask history into the sealed store')
  }
}

export const updatePreference = async ({ key, value }) => {
  try {
    if (isSealedPreference(key)) {
      await sealing
      const store = derivedStore()
      if (store) await writeSealedPreference(store, key, value)
      return
    }
    const base = await waitForPreferenceBase()
    if (!base) return
    await base.put(scopePreferenceKey(key).key, value)
    if (isMediaHoldPreference(key)) await applyMediaSyncHold()
  } catch (e) {
    log.error('updatePreference api', e)
  }
}

export const getPreference = async ({ key }) => {
  try {
    if (isSealedPreference(key)) {
      await sealing
      const store = derivedStore()
      return store ? await readSealedPreference(store, key) : null
    }
    const base = await waitForPreferenceBase()
    if (!base) return null
    const scoped = scopePreferenceKey(key)
    const value = await base.get(scoped.key)
    if (value !== null || !scoped.legacy) return value
    return await base.get(scoped.legacy)
  } catch (e) {
    log.error('getPreference api', e)
  }
}

export const readKeyrings = async () => (notesBase ? notesBase.getLockKeyrings() : [])

const LOCK_REFUSED = LOCK_REFUSAL.SESSION_CLOSED
const FILES_SEALED = LOCK_REFUSAL.FILES_SEALED
const FILES_MISSING = LOCK_REFUSAL.FILES_MISSING

// Plain copies of the encrypted files among `links`; `strict` refuses when one can't be made.
async function plainFiles(noteKey, html, links, strict) {
  const replacements = {}
  for (const link of links) {
    const range = rangeOf(link)
    const file = range ? await notesBase.media.sealedFile(range.id) : null
    if (file === null) continue
    let refused = file === false ? FILES_SEALED : null
    if (!refused && (await notesBase.media.missingUrls([link])).size) refused = FILES_MISSING
    if (!refused) {
      try {
        const fileName = notesBase.media.fileNameOf(html, link)
        replacements[link] = await notesBase.media.copyFile(noteKey, link, fileName, { open: file })
      } catch (e) {
        log.error('could not decrypt a file of a locked note', e?.message)
        refused = FILES_SEALED
      }
    }
    if (refused && strict) return { refused }
  }
  rememberCopies(replacements)
  return { replacements }
}

async function plainPastedFiles(key, noteFromDb, data) {
  if (typeof data.note !== 'string' || !isLockSessionOpen()) return {}
  const known = new Set(noteLinks(noteFromDb))
  const added = linksIn(data.note).filter((link) => !known.has(link))
  if (!added.length) return {}
  const { replacements } = await plainFiles(key, data.note, added, false)
  data.note = relinkHtml(data.note, replacements)
  return {}
}

async function applySealing(key, noteFromDb, data) {
  if (typeof data.note === 'string') data.note = relinkCopies(data.note)
  const wasSealed = !!noteFromDb.sealed
  const keyrings = wasSealed || data.locked ? await readKeyrings() : []
  if (!wasSealed && (!data.locked || !keyrings.length)) {
    return plainPastedFiles(key, noteFromDb, data)
  }
  const keyringId = sealingKeyringId(keyrings, noteFromDb.sealed)
  const keepEnvelope = wasSealed && !data.note

  if (wasSealed && !data.locked) {
    if (!isLockSessionOpen()) return { refused: LOCK_REFUSED }
    const body = data.note
      ? relinkHtml(data.note, envelopeRelink(noteFromDb.sealed))
      : openNoteBody(key, noteFromDb.sealed)
    if (body === null) return { refused: LOCK_REFUSED }
    const plain = await plainFiles(key, body, linksIn(body), true)
    if (plain.refused) return plain
    data.note = relinkHtml(body, plain.replacements)
    return { unseal: true }
  }
  if (keepEnvelope) {
    data.note = ''
    data.sealed = noteFromDb.sealed
    return {}
  }
  if (keyringId) {
    data.sealed = sealEnvelope(keyringId, key, data.note || '', noteFromDb.sealed || '')
    data.note = ''
    return {}
  }
  if (wasSealed || !noteFromDb.locked) return { refused: LOCK_REFUSED }
  return {}
}

const LOCK_ATTEMPTS_PREFERENCE = 'noteLockAttempts'
let lockAttemptsLoaded = false

const loadLockAttempts = async () => {
  if (lockAttemptsLoaded) return
  const base = await waitForPreferenceBase()
  if (!base) return
  restoreAttemptState(await base.get(LOCK_ATTEMPTS_PREFERENCE))
  lockAttemptsLoaded = true
}

const saveLockAttempts = async () => {
  const base = await waitForPreferenceBase()
  if (base) await base.put(LOCK_ATTEMPTS_PREFERENCE, getAttemptState())
}

export const openLockSession = async ({ password, rootKey, returnRootKey } = {}) => {
  const keyrings = await readKeyrings()
  if (!keyrings.length) return openWithLegacyPassword(password, returnRootKey)

  if (rootKey) {
    const key = rootKeyFromHex(rootKey)
    if (!key) return { ok: false, retryAfter: 0, reason: 'WRONG_KEY' }
    try {
      const current = currentKeyring(keyrings)
      // A stored key from before a password change opens only retired entries; ask for the password.
      const ok = !!current && rootKeyOpens(key, current) && openWithRootKey(keyrings, key)
      return ok
        ? sessionOpened(keyrings, returnRootKey)
        : { ok: false, retryAfter: 0, reason: 'WRONG_KEY' }
    } finally {
      wipe(key)
    }
  }

  await loadLockAttempts()
  const retryMs = getRetryAfterMs()
  if (retryMs > 0) return { ok: false, retryAfter: Math.ceil(retryMs / 1000), reason: 'THROTTLED' }
  if (!password || !(await openWithPassword(await keyringsInUse(keyrings), password))) {
    recordFailedAttempt()
    await saveLockAttempts()
    return { ok: false, retryAfter: Math.ceil(getRetryAfterMs() / 1000), reason: 'WRONG_PASSWORD' }
  }
  recordSuccessfulAttempt()
  await saveLockAttempts()
  return sessionOpened(keyrings, returnRootKey)
}

async function openWithLegacyPassword(password, returnRootKey) {
  const settings = (await notesBase.getSettings()) || {}
  if (!password || !settings.lockPasswordHash) {
    return { ok: false, retryAfter: 0, reason: 'NO_KEYRING' }
  }
  const verified = await verifyLegacyPassword(password, settings)
  if (!verified.valid) {
    const reason = verified.throttled ? 'THROTTLED' : 'WRONG_PASSWORD'
    return { ok: false, retryAfter: verified.retryAfter, reason }
  }
  if (!(await migrateLegacyPassword(password))) {
    return { ok: false, retryAfter: 0, reason: 'DEVICES_OUTDATED' }
  }
  return sessionOpened(await readKeyrings(), returnRootKey)
}

async function verifyLegacyPassword(password, settings) {
  await loadLockAttempts()
  const retryMs = getRetryAfterMs()
  if (retryMs > 0) return { valid: false, throttled: true, retryAfter: Math.ceil(retryMs / 1000) }
  const valid = verifyPassword(password, {
    salt: settings.lockPasswordSalt,
    hash: settings.lockPasswordHash
  })
  if (!valid) {
    recordFailedAttempt()
    await saveLockAttempts()
    return { valid: false, retryAfter: Math.ceil(getRetryAfterMs() / 1000) }
  }
  recordSuccessfulAttempt()
  await saveLockAttempts()
  return { valid: true, retryAfter: 0 }
}

// The first PBKDF2 unlock after the gate opens turns the password into a keyring.
async function migrateLegacyPassword(password) {
  try {
    if ((await readKeyrings()).length) return false
    if (!(await openGate(notesBase, 'sealedNotes')).open) return false
    await createFirstKeyring(notesBase, password, { legacy: true })
    log.info('[lock] moved the note lock password to a keyring')
    return true
  } catch (e) {
    log.error('[lock] could not move the note lock password to a keyring', e?.message)
    return false
  }
}

// Each entry costs one Argon2 run, so skip restored entries no note is sealed under any more.
async function keyringsInUse(keyrings) {
  const current = currentKeyring(keyrings)
  try {
    const used = await notesBase.sealedKeyringIds()
    return keyrings.filter((entry) => entry === current || used.has(entry.id))
  } catch {
    return keyrings
  }
}

// Only the current entry's root, so a stored biometric key keeps opening what new locks use.
function sessionOpened(keyrings, returnRootKey) {
  const current = currentKeyring(keyrings)
  const root = returnRootKey && current ? getRootKey(current.id) : null
  const reason = suggestsPasswordChange(current) ? LOCK_CHANGE_SUGGESTED : ''
  return { ok: true, retryAfter: 0, rootKey: root ? rootKeyToHex(root) : '', reason }
}

export const LOCK_CHANGE_SUGGESTED = 'CHANGE_SUGGESTED'

// A new root key, so the old password, which history keeps a wrap for, opens nothing written after.
async function rotateLockPassword(keyrings, password) {
  const held = keyrings.filter((entry) => getRootKey(entry.id))
  if (!held.length) return false
  const { entry, rootKey } = await createKeyring(password)
  try {
    const retired = []
    for (const old of held) {
      retired.push([keyringPrefId(old.id), await retireKeyring(getRootKey(old.id), password, old)])
    }
    await notesBase.setSyncedPrefs([...retired, [keyringPrefId(entry.id), entry]])
    addRootKey(entry.id, rootKey)
  } finally {
    wipe(rootKey)
  }
  sealingPass.start()
  return true
}

export const closeLockSession = async () => {
  closeSession()
  return true
}

export const setNoteLockPassword = async ({ password }) => {
  try {
    if (!isValidBackupPassword(password)) return false
    const current = (await notesBase.getSettings()) || {}
    const keyrings = await readKeyrings()

    if (!keyrings.length) {
      if ((await openGate(notesBase, 'sealedNotes')).open) {
        await createFirstKeyring(notesBase, password)
        return true
      }
      const verifier = deriveVerifier(password)
      await notesBase.updateSettings({
        settings: {
          ...current,
          lockMethod: 'password',
          lockPasswordSalt: verifier.salt,
          lockPasswordHash: verifier.hash
        }
      })
      return true
    }

    if (!(await rotateLockPassword(keyrings, password))) return false
    if (current.lockPasswordSalt || current.lockPasswordHash || current.lockMethod !== 'password') {
      await notesBase.updateSettings({ settings: withoutVerifier(current) })
    }
    return true
  } catch (e) {
    log.error('setNoteLockPassword api', e?.message)
    return false
  }
}

export const verifyNoteLockPassword = async ({ password }) => {
  try {
    if ((await readKeyrings()).length) {
      const opened = await openLockSession({ password })
      return { valid: opened.ok, retryAfter: opened.retryAfter }
    }
    const settings = (await notesBase.getSettings()) || {}
    const verified = await verifyLegacyPassword(password, settings)
    if (verified.valid) await migrateLegacyPassword(password)
    return { valid: verified.valid, retryAfter: verified.retryAfter }
  } catch (e) {
    log.error('verifyNoteLockPassword api', e?.message)
    return { valid: false, retryAfter: 0 }
  }
}

// While the gate is closed, files of sealed notes stay plain, as before files were encrypted.
async function fileSealFor(noteKey) {
  if (!(await notesBase.getNote(noteKey))?.sealed) return null
  if (!(await gateStatus(notesBase, 'sealedFiles')).open) return null
  if (!isLockSessionOpen()) throw new Error(LOCK_REFUSED)
  if (!(await openGate(notesBase, 'sealedFiles')).open) return null
  return createFileKey()
}

async function holdSealedFile(seal, combinedKey, link, noteKey) {
  const note = await notesBase.getNote(noteKey)
  const keyringId = sealingKeyringId(await readKeyrings(), note?.sealed || '')
  if (holdFileKey(link, seal.key, seal.id)) {
    const record = keyringId && keepFileKey(link, seal.key, seal.id, keyringId)
    if (record) notesBase.heldFileKeys?.put({ ...record, note: noteKey, at: Date.now() })
    return
  }
  await notesBase.deleteFile(combinedKey).catch(() => {})
  throw new Error(LOCK_REFUSED)
}

// The drive index is readable with the vault key, so an encrypted file's name stays in the note body only.
const drivePath = (key, fileName, seal) =>
  `${key}/${b4a.toString(crypto.randomBytes(32), 'hex')}_${seal ? '' : fileName}`

export const insertFile = async ({ key, fileName, buffer, path }) => {
  let seal = null
  try {
    seal = await fileSealFor(key)
    const combinedKey = drivePath(key, fileName, seal)
    const link = await notesBase.insertFile({ key: combinedKey, buffer, path, seal })
    if (seal) await holdSealedFile(seal, combinedKey, link, key)
    return { link, combinedKey }
  } catch (e) {
    if (e?.message === LOCK_REFUSED) return { reason: LOCK_REFUSED }
    log.error('insertFile api', e)
  } finally {
    wipe(seal?.key)
  }
}

export const insertFileWithProgress = async ({ key, fileName, path }, onProgress, token) => {
  const seal = await fileSealFor(key)
  const combinedKey = drivePath(key, fileName, seal)
  try {
    const link = await notesBase.insertFileWithProgress(combinedKey, path, onProgress, token, seal)
    if (seal) await holdSealedFile(seal, combinedKey, link, key)
    return { link, combinedKey }
  } finally {
    wipe(seal?.key)
  }
}

export const getFile = async ({ key }) => {
  try {
    const link = await notesBase.getFile({ key })
    return link
  } catch (e) {
    log.error('getFile api', e)
  }
}

export const deleteFile = async (key) => {
  try {
    const link = await notesBase.deleteFile(key)
    return link
  } catch (e) {
    log.error('deleteFile api', e)
  }
}

export const deleteNoteFile = async ({ noteKey, mediaPath }) => {
  try {
    let reseal = null
    const sealed = (await notesBase.getNote(noteKey))?.sealed
    if (sealed) {
      const keyringId = sealingKeyringId(await readKeyrings(), sealed)
      if (!keyringId) return false
      reseal = (html, previous) => sealEnvelope(keyringId, noteKey, html, previous)
    }
    await notesBase.deleteNoteFile(noteKey, mediaPath, reseal)
    return true
  } catch (e) {
    log.error('deleteNoteFile api', e?.message)
    return false
  }
}

export const reclaimOrphanedBlobs = async () => {
  try {
    return await notesBase.reclaimOrphanedBlobs(true, true)
  } catch (e) {
    log.error('reclaimOrphanedBlobs api', e)
    return { reclaimedBytes: 0 }
  }
}

export const retryDownload = async ({ url }) => {
  try {
    return await notesBase.retryDownload(url)
  } catch (e) {
    log.error('retryDownload api', e)
    return { done: false }
  }
}

export const pauseDownload = async ({ url }) => {
  try {
    return notesBase.pauseDownload(url)
  } catch (e) {
    log.error('pauseDownload api', e)
    return { paused: false }
  }
}

export const close = async () => {
  try {
    await notesBase.close()
  } catch (e) {
    log.error('close error', e)
  }
}

export const requestWriter = async () => {
  try {
    await notesBase.requestWriter()
  } catch (e) {
    log.error('requestWriter error', e)
  }
}

export const getIndexerKeys = async () => {
  try {
    return notesBase.getIndexerKeys()
  } catch (e) {
    log.error('getIndexerKeys error', e)
    return []
  }
}

export const setDeviceIndexer = async ({ localKey, isIndexer }) => {
  try {
    const result = await notesBase.setDeviceIndexer({ localKey, isIndexer })
    return { ...result, error: '' }
  } catch (e) {
    return { changed: false, indexers: [], error: e.message || 'INDEXER_ERROR_UNKNOWN_DEVICE' }
  }
}

export const createInvite = (opts) => {
  try {
    return notesBase.createInvite(opts)
  } catch (e) {
    log.error('createInvite error', e)
  }
}

export const susbscribePairing = async (cb) => {
  try {
    return await notesBase.subscribePairing(cb)
  } catch (e) {
    log.error('subscribePairing error', e)
  }
}

export const susbscribePairUser = async (cb, invite, deviceName, options) => {
  try {
    return await notesBase.subscribePairUser(cb, invite, deviceName, options)
  } catch (e) {
    log.error('subscribePairUser error', e)
  }
}

const vaultFailure = (name, e) => {
  log.error(`${name} api`, e)
  return { done: false, code: e?.code || VAULT_ERROR.OPEN_FAILED }
}

export const listVaults = () => {
  try {
    return notesBase?.listVaults() || []
  } catch (e) {
    log.error('listVaults api', e)
    return []
  }
}

export const createVault = async ({ name }) => {
  try {
    const id = await notesBase.createVault({ name })
    await applyMediaSyncHold()
    return { done: true, id }
  } catch (e) {
    return vaultFailure('createVault', e)
  }
}

export const switchVault = async ({ id }) => {
  try {
    await notesBase.switchVault(id)
    await applyMediaSyncHold()
    return { done: true }
  } catch (e) {
    return vaultFailure('switchVault', e)
  }
}

export const renameVault = async ({ id, name }) => {
  try {
    await notesBase.renameVault(id, name)
    return { done: true }
  } catch (e) {
    return vaultFailure('renameVault', e)
  }
}

export const removeVault = async ({ id, force = false }) => {
  try {
    const { left, replicated } = await notesBase.removeVault(id, { force })
    await applyMediaSyncHold()
    return { done: true, left, replicated }
  } catch (e) {
    return vaultFailure('removeVault', e)
  }
}

export const moveToVault = async ({ targetId, noteKeys, folderKeys }) => {
  try {
    const { moved } = await notesBase.moveToVault({ targetId, noteKeys, folderKeys })
    await applyMediaSyncHold()
    return { done: true, moved }
  } catch (e) {
    return vaultFailure('moveToVault', e)
  }
}

export const confirmPairing = () => {
  try {
    return notesBase.confirmPairing()
  } catch (e) {
    log.error('confirmPairing error', e)
  }
}

export const rejectPairing = async () => {
  try {
    return await notesBase.rejectPairing()
  } catch (e) {
    log.error('rejectPairing error', e)
  }
}

export const insertSyncedDevice = async ({ title, deviceType, platform, localKey }) => {
  try {
    const key = b4a.toString(crypto.randomBytes(32), 'hex')
    const value = {
      title,
      deviceType,
      platform,
      localKey,
      caps: SEALED_NOTES_CAP,
      compatLevel: COMPAT_LEVEL,
      appVersion: notesBase.appVersion,
      lastSeenAt: Date.now(),
      addedAt: Date.now(),
      updatedAt: Date.now()
    }
    await notesBase.addSyncedDevice({ key, value })
    return key
  } catch (e) {
    log.error('addSyncedDevice error', e)
  }
}

export const updateSyncedDevice = async ({ key, title }) => {
  try {
    if (!key) return
    const syncedDeviceFromDb = await notesBase.getRawSyncedDevice(key)
    if (!syncedDeviceFromDb) return
    const value = {
      ...syncedDeviceFromDb,
      title: (title || '').slice(0, DEVICE_NAME_MAX_LENGTH),
      updatedAt: Date.now()
    }
    await notesBase.updateSyncedDevice({ key, value })
  } catch (e) {
    log.error('updateSyncedDevice error', e)
  }
}

export const deleteSyncedDevice = async (key) => {
  try {
    if (!key) return
    await notesBase.removeSyncedDevice(key)
  } catch (e) {
    log.error('deleteSyncedDevice error', e)
  }
}

export const getSyncedDevice = async ({ key }) => {
  try {
    return await notesBase.getSyncedDevice(key)
  } catch (e) {
    log.error('getSyncedDevice api', e)
  }
}

export const getAllSyncedDeviceKeys = async () => {
  try {
    return await notesBase.getAllSyncedDeviceKeys()
  } catch (e) {
    log.error('getAllSyncedDeviceKeys error', e)
  }
}

export const subscribeSyncedDevice = async ({ key }) => {
  try {
    return await notesBase.subscribeSyncedDevice(key)
  } catch (e) {
    log.error('subscribeSyncedDevice error', e)
  }
}

export const subscribeAllSyncedDeviceKeys = async () => {
  try {
    return await notesBase.subscribeAllSyncedDeviceKeys()
  } catch (e) {
    log.error('subscribeAllSyncedDeviceKeys error', e)
  }
}

export const checkAndInsertLocalDevice = async (deviceName) => {
  try {
    const title = sanitizeDeviceName(deviceName)
    const isInserted = await getPreference({ key: 'localDeviceInserted' })
    if (isInserted === 'true') return

    const { localKey } = notesBase
    const localKeyHex = b4a.toString(localKey, 'hex')

    const deviceKeys = await notesBase.getAllSyncedDeviceKeys()
    if (deviceKeys?.length > 0) {
      for (const key of deviceKeys) {
        const device = await notesBase.getSyncedDevice(key)
        if (device?.localKey === localKeyHex) {
          await updatePreference({ key: 'localDeviceInserted', value: 'true' })
          await notesBase.publishLocalSwarmKey()
          return
        }
      }
    }

    const deviceData = {
      title,
      deviceType: platform() === 'ios' || platform() === 'android' ? 'mobile' : 'desktop',
      platform: platform(),
      localKey: localKeyHex
    }
    await insertSyncedDevice(deviceData)
    await updatePreference({ key: 'localDeviceInserted', value: 'true' })
    await notesBase.publishLocalSwarmKey()
  } catch (e) {
    log.error('checkAndInsertLocalDevice error', e)
  }
}

export const getHyperdriveAddress = () => {
  return notesBase.getHyperdriveAddress()
}

// The editor flushes its last save as the app goes to the background; let it land sealed.
export const SUSPEND_SAVE_GRACE_MS = 600
let lifecycleGeneration = 0

export const suspendServices = async () => {
  const generation = ++lifecycleGeneration
  try {
    if (isLockSessionOpen()) {
      await new Promise((resolve) => setTimeout(resolve, SUSPEND_SAVE_GRACE_MS))
      await Promise.all(savesInFlight)
      if (generation !== lifecycleGeneration) return
    }
    searchIndex.clear()
    closeSession()
    if (!notesBase) return
    await notesBase.suspend()
  } catch (e) {
    log.error('suspendServices error', e)
  }
}

export const resumeServices = async () => {
  lifecycleGeneration++
  try {
    if (!notesBase) return
    await notesBase.resume()
  } catch (e) {
    log.error('resumeServices error', e)
  }
}

export const subscribePresence = async (cb) => {
  try {
    notesBase.on('presence-changed', cb)
    notesBase.on('indexers-changed', cb)
    return () => {
      notesBase.off('presence-changed', cb)
      notesBase.off('indexers-changed', cb)
    }
  } catch (e) {
    log.error('subscribePresence error', e)
    return null
  }
}

export const subscribeDeviceStatus = async (cb) => {
  try {
    const onRemoved = () => cb('removed')
    const onMember = () => cb('member')
    const onUnrecoverable = () => cb('unrecoverable')
    const onUpdateRequired = () => cb(UPDATE_REQUIRED)
    const onUpdateCleared = () => cb(UPDATE_CLEARED)
    const onHeldMergeChanged = () => cb(HELD_MERGE_CHANGED)
    notesBase.on('device-removed', onRemoved)
    notesBase.on('vault-member', onMember)
    notesBase.on('base-unrecoverable', onUnrecoverable)
    notesBase.on('update-required', onUpdateRequired)
    notesBase.on('update-cleared', onUpdateCleared)
    notesBase.on('held-merge-changed', onHeldMergeChanged)
    if (notesBase.isRemovedFromVault()) onRemoved()
    if (notesBase.updateRequired) onUpdateRequired()
    return () => {
      notesBase.off('device-removed', onRemoved)
      notesBase.off('vault-member', onMember)
      notesBase.off('base-unrecoverable', onUnrecoverable)
      notesBase.off('update-required', onUpdateRequired)
      notesBase.off('update-cleared', onUpdateCleared)
      notesBase.off('held-merge-changed', onHeldMergeChanged)
    }
  } catch (e) {
    log.error('subscribeDeviceStatus error', e)
  }
}

export const getFilesWaitingToSeal = () => (notesBase ? notesBase.getFilesWaitingToSeal() : [])

export const getNotesStorageInfo = async () => {
  try {
    return await notesBase.getNotesStorageInfo()
  } catch (e) {
    log.error('getNotesStorageInfo api', e)
    return {
      notes: [],
      totalBlobBytes: 0,
      totalOnDiskBytes: 0,
      reclaimableBytes: 0,
      downloads: [],
      uploads: [],
      sealWaiting: []
    }
  }
}

export const subscribeStorageInfo = async () => {
  try {
    return await notesBase.subscribeStorageInfo()
  } catch (e) {
    log.error('subscribeStorageInfo api', e)
  }
}

export const getDownloadsInfo = () => {
  try {
    return notesBase.getDownloadsInfo()
  } catch (e) {
    log.error('getDownloadsInfo api', e)
    return []
  }
}

export const getUploadsInfo = () => {
  try {
    return notesBase.getUploadsInfo()
  } catch (e) {
    log.error('getUploadsInfo api', e)
    return []
  }
}

export const exportBackup = async (password, filePath, cb, signal, options) => {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error(BACKUP_ERROR.PASSWORD_REQUIRED)
  }
  try {
    return await notesBase.exportBackup(password, filePath, cb, signal, options)
  } catch (e) {
    if (!isCancellation(e)) log.error('exportBackup api', e)
    throw e
  }
}

export const getHeldMerge = async () => notesBase.heldMerge()

export const combineHeldMerge = async () => notesBase.combineHeldMerge()

export const checkBackupRestore = async ({ buffer, filePath, password }) =>
  notesBase.checkBackupRestore({ buffer, filePath, password })

export const importBackup = async ({ buffer, filePath, recoveryKey, password, signal, cb }) => {
  try {
    await notesBase.importBackup({ buffer, filePath, recoveryKey, password, signal, cb })
  } catch (e) {
    if (!isCancellation(e)) log.error('importBackup api', e)
    throw e
  }
}

export const clearStorage = async () => {
  try {
    try {
      await notesBase.leaveSyncCluster()
    } catch (e) {
      log.error('clearStorage - leaving the sync cluster failed', e)
    }
    if (preferenceBase) {
      isPreferenceReady = false
      await preferenceBase.destroy()
    }
    await notesBase.clearStorage()
  } catch (e) {
    log.error('clearStorage error', e)
  }
}

export const getActivity = async ({ filter, deviceKey, noteKey, limit, cursor } = {}) => {
  try {
    return await notesBase.getActivity({ filter, deviceKey, noteKey, limit, cursor })
  } catch (e) {
    log.error('getActivity api', e)
    return { entries: [], cursor: '', hasMore: false }
  }
}

export const getActivityDiff = async ({ id }) => {
  try {
    return await notesBase.getActivityDiff(id)
  } catch (e) {
    log.error('getActivityDiff api', e)
    return { id: id || '', before: '', after: '', locked: false, available: false }
  }
}

export const recoverDiscardedNoteWrite = async ({ id }) => {
  try {
    return await notesBase.recoverDiscardedNoteWrite(id)
  } catch (e) {
    log.error('recoverDiscardedNoteWrite api', e)
    return { done: false, noteKey: '' }
  }
}

export const getActivityStats = async () => {
  try {
    return await notesBase.getActivityStats()
  } catch (e) {
    log.error('getActivityStats api', e)
    return { count: 0, bytes: 0, oldestAt: 0 }
  }
}

export const clearActivity = async () => {
  try {
    await notesBase.clearActivity()
    return true
  } catch (e) {
    log.error('clearActivity api', e)
    return false
  }
}

export const subscribeActivity = async () => {
  try {
    return await notesBase.subscribeActivity()
  } catch (e) {
    log.error('subscribeActivity api', e)
    return null
  }
}

export const purgeExpiredActivity = async () => {
  try {
    return await notesBase.pruneActivity()
  } catch (e) {
    log.error('purgeExpiredActivity api', e)
    return 0
  }
}

const readSyncPreferences = async () => {
  const empty = {
    lastSyncAt: 0,
    lastSyncReceived: 0,
    lastWakeAt: 0,
    lastWakeResult: '',
    backgroundServiceFailedAt: 0
  }
  try {
    if (!preferenceBase) return empty
    const [at, received, wakeAt, wakeResult, failedAt] = await Promise.all([
      preferenceBase.get(LAST_SYNC_AT_KEY),
      preferenceBase.get(LAST_SYNC_RECEIVED_KEY),
      preferenceBase.get(LAST_WAKE_AT_KEY),
      preferenceBase.get(LAST_WAKE_RESULT_KEY),
      preferenceBase.get(BACKGROUND_SERVICE_FAILED_AT_KEY)
    ])
    return {
      lastSyncAt: Number(at) || 0,
      lastSyncReceived: Number(received) || 0,
      lastWakeAt: Number(wakeAt) || 0,
      lastWakeResult: wakeResult || '',
      backgroundServiceFailedAt: Number(failedAt) || 0
    }
  } catch (e) {
    log.error('readSyncPreferences', e)
    return empty
  }
}

export const getDebugInfo = async ({ heavy } = {}) => {
  try {
    if (!notesBase) return { error: 'base_not_ready', capturedAt: Date.now() }
    const info = await notesBase.getDebugInfo(!!heavy)
    return { ...info, sync: await readSyncPreferences() }
  } catch (e) {
    log.error('getDebugInfo api', e)
    return { error: String(e?.message || e), capturedAt: Date.now() }
  }
}

export const getAiOffloadStatus = async () =>
  notesBase ? notesBase.getAiOffloadStatus() : { available: false, deviceTitle: '' }

let aiOffloadServing = false
const aiOffloadListeners = new Set()

export const setAiOffloadServing = (serving) => {
  aiOffloadServing = !!serving
  return notesBase?.setAiOffloadServing(aiOffloadServing)
}

export const subscribeAiOffload = (listeners) => {
  const entries = Object.entries(listeners)
  for (const entry of entries) {
    aiOffloadListeners.add(entry)
    notesBase?.on(entry[0], entry[1])
  }
  return () => {
    for (const entry of entries) {
      aiOffloadListeners.delete(entry)
      notesBase?.off(entry[0], entry[1])
    }
  }
}

export const runAiOffload = ({ kind, payload, onText }) => {
  if (!notesBase?.aiOffload) {
    return {
      id: null,
      done: Promise.reject(Object.assign(new Error('unavailable'), { code: 'unavailable' }))
    }
  }
  return notesBase.aiOffload.run({ kind, payload, onText })
}

export const cancelAiOffload = (id) => notesBase?.aiOffload?.cancel(id)

export const replyAiOffload = (jobId, reply) => notesBase?.aiOffload?.reply(jobId, reply)
