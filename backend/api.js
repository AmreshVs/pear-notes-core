import b4a from 'b4a'
import { sanitizeDeviceName } from '../constant.js'
import * as log from '../log.js'
import { getRPC } from '../rpc.js'
import { formatLogArgs } from './logFormat.js'

const APP_LOG_FLUSH_MS = 2000
const APP_LOG_QUEUE_MAX = 1000
let appLogQueue = []
let appLogTimer = null

async function flushAppLogs() {
  appLogTimer = null
  if (!appLogQueue.length) return
  const batch = appLogQueue
  appLogQueue = []
  try {
    await getRPC().commandRecordLogs({ json: JSON.stringify(batch) })
  } catch {
    // Reporting a failed log upload through the logger would feed this queue forever.
  }
}

function queueAppLog(level, args) {
  appLogQueue.push({ at: Date.now(), level, ...formatLogArgs(args) })
  if (appLogQueue.length > APP_LOG_QUEUE_MAX)
    appLogQueue.splice(0, appLogQueue.length - APP_LOG_QUEUE_MAX)
  if (!appLogTimer) appLogTimer = setTimeout(flushAppLogs, APP_LOG_FLUSH_MS)
}

export const BACKEND_TIMEOUT = 'BACKEND_TIMEOUT'
const COMMAND_TIMEOUT_MS = 30000

// hrpc requests never time out on their own, so a backend that has died or
// wedged leaves every caller pending forever - the UI then looks like the button
// simply does nothing, and one-shot guards such as the create-note latch are
// never released. Short commands get a deadline instead. It must stay above the
// worst case of a single NoteBase.append (5s + 10s + 5s), or a slow but healthy
// write reports failure and then lands anyway.
const bounded = (name, promise) => {
  let timer = null
  const timedOut = Symbol('timeout')
  return Promise.race([
    promise,
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(timedOut), COMMAND_TIMEOUT_MS)
    })
  ])
    .then((result) => {
      if (result !== timedOut) return result
      log.error(`[api] ${name} did not answer within ${COMMAND_TIMEOUT_MS}ms`)
      const error = new Error(`${name} timed out`)
      error.code = BACKEND_TIMEOUT
      throw error
    })
    .finally(() => clearTimeout(timer))
}

let localDeviceName = ''

export const setLocalDeviceName = (name) => {
  localDeviceName = sanitizeDeviceName(name)
}

export const getLocalDeviceName = () => localDeviceName

const parseActivityMeta = (meta) => {
  if (!meta) return {}
  try {
    const parsed = JSON.parse(meta)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export const backendApi = {
  ready: async ({ storage, encryption, entropy = null, appVersion = '' }) => {
    return await getRPC().commandReady({ storage, encryption, entropy, appVersion })
  },
  destroy: () => {
    return getRPC().commandDestroy()
  },
  // LEGACY(hyperdb-migration): see docs/HYPERDB-VIEW-MIGRATION-PLAN-2026-09-23.md section 8
  startFreshVault: ({ storage }) => {
    return getRPC().commandStartFreshVault({ storage })
  },
  getChore: () => {
    return getRPC().commandChore()
  },
  suspendServices: () => {
    return getRPC().commandSuspendServices({})
  },
  resumeServices: () => {
    return getRPC().commandResumeServices({})
  },
  insertNote: ({ title, note, folderKey, locked, pinned }) => {
    return bounded(
      'insertNote',
      getRPC().commandInsertNote({
        title: title || '',
        note: note || '',
        folderKey,
        locked,
        pinned
      })
    )
  },
  updateNote: ({ key, title, note, folderKey, locked, pinned }) => {
    return bounded(
      'updateNote',
      getRPC().commandUpdateNote({
        key,
        title: title || '',
        note: note || '',
        folderKey,
        locked,
        pinned
      })
    )
  },
  deleteNote: (key) => {
    return bounded('deleteNote', getRPC().commandDeleteNote({ key }))
  },
  trashNote: async (key) => {
    const response = await bounded('trashNote', getRPC().commandTrashNote({ key }))
    return !!response?.done
  },
  restoreNote: async (key) => {
    const response = await bounded('restoreNote', getRPC().commandRestoreNote({ key }))
    return { done: !!response?.done, folderKey: response?.folderKey || '' }
  },
  purgeExpiredTrash: async () => {
    const response = await getRPC().commandPurgeExpiredTrash()
    return response?.purged || 0
  },
  getActivity: async ({ filter, deviceKey, noteKey, limit, cursor } = {}) => {
    const response = await getRPC().commandGetActivity({
      filter: filter || '',
      deviceKey: deviceKey || '',
      noteKey: noteKey || '',
      limit: limit || 0,
      cursor: cursor || ''
    })
    return {
      entries: (response?.entries || []).map((entry) => ({
        ...entry,
        meta: parseActivityMeta(entry.meta)
      })),
      cursor: response?.cursor || '',
      hasMore: !!response?.hasMore
    }
  },
  getActivityDiff: async ({ id }) => {
    const response = await getRPC().commandGetActivityDiff({ id })
    return response?.data || { id, before: '', after: '', locked: false, available: false }
  },
  recoverDiscardedNoteWrite: async ({ id }) => {
    const response = await getRPC().commandRecoverDiscardedWrite({ id })
    return { done: !!response?.done, noteKey: response?.noteKey || '' }
  },
  getActivityStats: async () => {
    const response = await getRPC().commandGetActivityStats()
    return response?.data || { count: 0, bytes: 0, oldestAt: 0 }
  },
  getDebugInfo: async ({ heavy } = {}) => {
    const response = await getRPC().commandGetDebugInfo({ heavy: !!heavy })
    try {
      return JSON.parse(response?.json || '{}')
    } catch (e) {
      return { error: String(e?.message || e), capturedAt: Date.now() }
    }
  },
  captureAppLogs: () => {
    log.setSink(queueAppLog)
  },
  getErrorLog: async () => {
    clearTimeout(appLogTimer)
    await flushAppLogs()
    const response = await getRPC().commandGetErrorLog()
    try {
      return JSON.parse(response?.json || '{}')
    } catch (e) {
      return { error: String(e?.message || e), capturedAt: Date.now(), entries: [] }
    }
  },
  setErrorLogEnabled: async (enabled) => {
    const response = await getRPC().commandSetErrorLogEnabled({ enabled: !!enabled })
    return response?.enabled === true
  },
  clearErrorLog: async () => {
    const response = await getRPC().commandClearErrorLog()
    return !!response?.done
  },
  clearActivity: async () => {
    const response = await getRPC().commandClearActivity()
    return !!response?.success
  },
  subscribeActivity: async () => {
    return await getRPC().commandSubscribeActivity()
  },
  getAllNotes: async () => {
    return await getRPC().commandGetAllNotes()
  },
  getSingleNote: async ({ key }) => {
    return await bounded('getSingleNote', getRPC().commandGetSingleNote({ key }))
  },
  searchNotes: async ({ query, folderKey, includeLocked = false, limit = 0 }) => {
    return await bounded(
      'searchNotes',
      getRPC().commandSearchNotes({ query, folderKey, includeLocked, limit })
    )
  },
  derivedPut: async ({ namespace, entries }) =>
    await bounded('derivedPut', getRPC().commandDerivedPut({ namespace, entries })),
  derivedGet: async ({ namespace, ids }) =>
    await bounded('derivedGet', getRPC().commandDerivedGet({ namespace, ids })),
  derivedVersions: async ({ namespace }) =>
    await bounded('derivedVersions', getRPC().commandDerivedVersions({ namespace })),
  derivedSearch: async ({ namespace, query, limit = 0 }) =>
    await bounded('derivedSearch', getRPC().commandDerivedSearch({ namespace, query, limit })),
  derivedRelated: async ({ namespace, id, limit = 0 }) =>
    await bounded('derivedRelated', getRPC().commandDerivedRelated({ namespace, id, limit })),
  derivedDuplicates: async ({
    namespace,
    textNamespace = '',
    pairNamespace,
    threshold,
    overlap = 0,
    checkMs = 0,
    limit = 0
  }) =>
    await bounded(
      'derivedDuplicates',
      getRPC().commandDerivedDuplicates({
        namespace,
        textNamespace,
        pairNamespace,
        threshold,
        overlap,
        checkMs,
        limit
      })
    ),
  derivedClear: async ({ namespace = '' } = {}) =>
    await bounded('derivedClear', getRPC().commandDerivedClear({ namespace })),
  derivedStats: async ({ namespaces = [] } = {}) =>
    await bounded('derivedStats', getRPC().commandDerivedStats({ namespaces })),
  prewarmSearch: async () => {
    const response = await bounded('prewarmSearch', getRPC().commandPrewarmSearch({}))
    return !!response?.ready
  },
  subscribeNote: async ({ key, summary = false }) => {
    return await getRPC().commandSubscribeNote({ key, summary })
  },
  subscribeAllNoteKeys: async () => {
    return await getRPC().commandSubscribeNoteKeys()
  },
  insertFolder: async ({ title, icon }) => {
    return await bounded(
      'insertFolder',
      getRPC().commandInsertFolder({ title: title || '', icon: icon || '' })
    )
  },
  updateFolder: async ({ key, title, icon }) => {
    return await bounded(
      'updateFolder',
      getRPC().commandUpdateFolder({ key, title: title || '', icon: icon || '' })
    )
  },
  deleteFolder: async (key) => {
    return await bounded('deleteFolder', getRPC().commandDeleteFolder({ key }))
  },
  getAllFolders: async () => {
    return await getRPC().commandGetAllFolders()
  },
  getSingleFolder: async ({ key }) => {
    return await bounded('getSingleFolder', getRPC().commandGetSingleFolder({ key }))
  },
  subscribeFolder: async ({ key }) => {
    return await getRPC().commandSubscribeFolder({ key })
  },
  subscribeFolders: async () => {
    return await getRPC().commandSubscribeFolderKeys()
  },
  insertFile: async ({ key, fileName, buffer, path }) => {
    return await getRPC().commandInsertFile({
      key,
      fileName,
      buffer: buffer ? b4a.from(buffer) : null,
      path
    })
  },
  insertFileWithProgress: ({ key, fileName, path }) => {
    return getRPC().commandInsertFileProgress({ key, fileName, path })
  },
  deleteFile: async (key) => {
    return await getRPC().commandDeleteFile({ key })
  },
  deleteNoteFile: async ({ noteKey, mediaPath }) => {
    return await bounded('deleteNoteFile', getRPC().commandDeleteNoteFile({ noteKey, mediaPath }))
  },
  reclaimOrphanedBlobs: async () => {
    return await getRPC().commandReclaimOrphanedBlobs()
  },
  retryDownload: async ({ url }) => {
    return await getRPC().commandRetryDownload({ url })
  },
  pauseDownload: async ({ url }) => {
    return await getRPC().commandPauseDownload({ url })
  },
  createInvite: async ({ regenerate = false } = {}) => {
    return await getRPC().commandCreateInvite({ regenerate })
  },
  subscribePairing: async () => {
    return await getRPC().commandSubscribePairing()
  },
  getHeldMerge: async () => {
    const response = await getRPC().commandGetHeldMerge({})
    return { held: response.held === true, blocking: response.blocking || [] }
  },
  combineHeldMerge: async () => {
    const response = await getRPC().commandCombineHeldMerge({})
    return response.done === true
  },
  subscribePairUser: async ({ invite, mode, vaultName }) => {
    return await getRPC().commandSubscribePairUser({
      invite,
      deviceName: localDeviceName,
      ...(mode ? { mode, vaultName: vaultName || '' } : {})
    })
  },
  listVaults: async () => {
    return (await bounded('listVaults', getRPC().commandListVaults({})))?.data || []
  },
  createVault: async ({ name }) => {
    return await getRPC().commandCreateVault({ name })
  },
  switchVault: async ({ id }) => {
    return await getRPC().commandSwitchVault({ id })
  },
  renameVault: async ({ id, name }) => {
    return await bounded('renameVault', getRPC().commandRenameVault({ id, name }))
  },
  removeVault: async ({ id, force = false }) => {
    return await getRPC().commandRemoveVault({ id, force })
  },
  moveToVault: async ({ targetId, noteKeys = [], folderKeys = [] }) => {
    return await getRPC().commandMoveToVault({ targetId, noteKeys, folderKeys })
  },
  confirmPairing: async () => {
    return await getRPC().commandConfirmPairing()
  },
  rejectPairing: async () => {
    return await getRPC().commandRejectPairing()
  },
  insertSyncedDevice: async ({ title, deviceType, platform, localKey }) => {
    return await getRPC().commandInsertSyncedDevice({ title, deviceType, platform, localKey })
  },
  updateSyncedDevice: async ({ key, title }) => {
    return await getRPC().commandUpdateSyncedDevice({ key, title })
  },
  deleteSyncedDevice: async (key) => {
    return await getRPC().commandDeleteSyncedDevice({ key })
  },
  setDeviceIndexer: async ({ localKey, isIndexer }) => {
    return await getRPC().commandSetDeviceIndexer({ localKey, isIndexer: isIndexer === true })
  },
  subscribeSyncedDevice: async ({ key }) => {
    return await getRPC().commandSubscribeSyncedDevice({ key })
  },
  subscribeAllSyncedDeviceKeys: async () => {
    return await getRPC().commandSubscribeAllSyncedDeviceKeys()
  },
  updateSettings: async ({ settings }) => {
    return await bounded('updateSettings', getRPC().commandUpdateSettings({ settings }))
  },
  getSettings: async () => {
    return await getRPC().commandGetSettings()
  },
  subscribeSettings: async () => {
    return await getRPC().commandSubscribeSettings()
  },
  checkAndInsertLocalDevice: async () => {
    return await getRPC().commandCheckAndInsertLocalDevice({ deviceName: localDeviceName })
  },
  updatePreference: async ({ key, value }) => {
    return await bounded('updatePreference', getRPC().commandUpdatePreference({ key, value }))
  },
  getPreference: async ({ key }) => {
    const response = await getRPC().commandGetPreference({ key })
    return response.data
  },
  setNoteLockPassword: async ({ password }) => {
    const response = await getRPC().commandSetNoteLockPassword({ password })
    return response.done
  },
  verifyNoteLockPassword: async ({ password }) => {
    const response = await getRPC().commandVerifyNoteLockPassword({ password })
    return { valid: !!response.valid, retryAfter: response.retryAfter || 0 }
  },
  openLockSession: async ({ password, rootKey, returnRootKey } = {}) => {
    const response = await getRPC().commandOpenLockSession({
      password: password || '',
      rootKey: rootKey || '',
      returnRootKey: returnRootKey === true
    })
    return {
      ok: response.ok === true,
      retryAfter: response.retryAfter || 0,
      rootKey: response.rootKey || '',
      reason: response.reason || ''
    }
  },
  closeLockSession: async () => {
    const response = await getRPC().commandCloseLockSession({})
    return response.done === true
  },
  aiOffloadStatus: () => getRPC().commandAiOffloadStatus({ watch: true }),
  aiOffloadRun: ({ runId, kind, payload }) =>
    getRPC().commandAiOffloadRun({ runId, kind, payload: JSON.stringify(payload ?? null) }),
  aiOffloadCancel: ({ runId }) => getRPC().commandAiOffloadCancel({ runId }),
  aiOffloadServe: async ({ serving }) =>
    await bounded('aiOffloadServe', getRPC().commandAiOffloadServe({ serving: serving === true })),
  aiOffloadJobs: () => getRPC().commandAiOffloadJobs({ watch: true }),
  aiOffloadReply: ({ jobId, text, done, error, data }) =>
    getRPC().commandAiOffloadReply({
      jobId,
      text,
      done: done === true,
      error,
      data: data === undefined ? undefined : JSON.stringify(data)
    }),
  getUpcomingTasks: async () => {
    const response = await getRPC().commandUpcomingTasks({ includeLocked: false })
    try {
      return response?.ok ? JSON.parse(response.tasks || '[]') : []
    } catch {
      return []
    }
  },
  getAttachmentCount: async () => {
    const response = await getRPC().commandAttachments({ includeLocked: false, countOnly: true })
    if (!response?.ok) return 0
    if (!response.items) return response.count || 0
    try {
      return JSON.parse(response.items).length
    } catch {
      return 0
    }
  },
  getAttachments: async () => {
    const response = await getRPC().commandAttachments({ includeLocked: false })
    try {
      return response?.ok ? JSON.parse(response.items || '[]') : []
    } catch {
      return []
    }
  },
  setSyncedPref: async (id, value) => {
    const response = await getRPC().commandSetSyncedPref({
      id,
      json: value === null ? '' : JSON.stringify(value)
    })
    return response?.ok === true
  },
  getSyncedPrefs: async (prefix = '') => {
    const response = await getRPC().commandGetSyncedPrefs({ prefix })
    try {
      return response?.ok ? JSON.parse(response.json || '{}') : {}
    } catch {
      return {}
    }
  },
  setTaskChecked: async ({ noteKey, text, checked }) => {
    const response = await getRPC().commandSetTaskChecked({ noteKey, text, checked })
    return response?.ok === true
  },
  subscribeDeviceStatus: async () => {
    return await getRPC().commandSubscribeDeviceStatus()
  },
  clearStorage: async () => {
    return await getRPC().commandClearStorage()
  },
  subscribeCrash: async () => {
    return await getRPC().commandSubscribeCrash()
  },
  subscribeStorageInfo: async () => {
    return await getRPC().commandSubscribeStorageInfo()
  },
  exportBackup: async ({ password, filePath }) => {
    return await getRPC().commandExportBackup({ password, filePath })
  },
  checkBackupRestore: async ({ buffer, filePath, password }) => {
    const response = await getRPC().commandCheckBackupRestore({
      buffer: buffer ? b4a.from(buffer) : null,
      filePath,
      password
    })
    return { sealed: response.sealed === true, blocking: response.blocking || [] }
  },
  importBackup: async ({ buffer, filePath, recoveryKey, password }) => {
    return await getRPC().commandImportBackup({
      buffer: buffer ? b4a.from(buffer) : null,
      filePath,
      recoveryKey,
      password
    })
  }
}
