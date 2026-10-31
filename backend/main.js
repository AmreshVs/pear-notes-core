/* global Bare, BareKit */
import crypto from 'bare-crypto'
import FramedStream from 'framed-stream'

import { backendBoot } from '../bootTimeline.js'
import { HYPERDRIVE_URL_PREFIX, LOCK_REFUSAL, normalizeAttachmentUrls } from '../constant.js'
import HRPC from '../spec/hrpc/index.js'
import * as notesApi from './notesApi.js'
import { onLockSessionChange, readableNote } from './lockSession.js'
import { buildNoteSummary } from '../utils.js'
import SubscriptionTracker from './subscriptionTracker.js'
import * as log from '../log.js'
import { captureDependencyConsole, captureFatalErrors, captureLogs, errorLog } from './errorLog.js'
import { formatLogArgs } from './logFormat.js'

// The frontend's hrpc client gives short commands a 30s deadline (api.js
// `bounded`). A handler that outlives it leaves the caller with a timeout and no
// answer at all, and the write path is full of awaits that deadline nothing:
// notesApi.updateNote does two view reads (NoteBase.getNote -> autobase.view ->
// bee.get) before it reaches the append, and NoteBase.append resolves the whole
// serial chain, so a caller also waits behind every append already queued. The
// per-step budgets inside append bound one run, not the queue. Answering here
// within a smaller budget turns "no reply, ever" into a reported failure the
// frontend can retry, instead of a wedge that survives until restart.
const ANSWER_BUDGET_MS = 20000

const answerWithin = async (name, promise, onTimeout) => {
  let timer = null
  const timedOut = Symbol('timeout')
  try {
    const result = await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(timedOut), ANSWER_BUDGET_MS)
      })
    ])
    if (result !== timedOut) return result
    log.error(`[backend] ${name} did not finish within ${ANSWER_BUDGET_MS}ms, answering anyway`)
    return onTimeout
  } finally {
    clearTimeout(timer)
  }
}

captureLogs()
captureDependencyConsole()
captureFatalErrors(Bare)

const platform = Bare.platform
const isMobile = platform === 'android' || platform === 'ios'
const ipc = isMobile ? BareKit.IPC : Bare.IPC
const stream = new FramedStream(ipc)
const rpc = new HRPC(stream)

const SHUTDOWN_TIMEOUT = 5000

let shuttingDown = false

function shutdownOnHostExit() {
  if (shuttingDown) return
  shuttingDown = true
  setTimeout(() => Bare.exit(0), SHUTDOWN_TIMEOUT)
  notesApi
    .destroy()
    .catch(() => {})
    .finally(() => Bare.exit(0))
}

if (!isMobile) {
  ipc.on('end', shutdownOnHostExit)
  ipc.on('close', shutdownOnHostExit)
  ipc.on('error', shutdownOnHostExit)
}

function setIpcHoldingLoop(holding) {
  const targets = [ipc, stream]
  const applied = []
  for (const target of targets) {
    if (!target) continue
    const fn = holding ? target.ref : target.unref
    if (typeof fn !== 'function') continue
    try {
      fn.call(target)
      applied.push(target === ipc ? 'ipc' : 'stream')
    } catch (err) {
      log.error('[lifecycle] could not toggle ipc handle', err)
    }
  }
  return applied
}

// A background task's late suspendServices must not suspend a foregrounded app.
let runtimeActive = true

if (isMobile) {
  Bare.on('suspend', (linger) => {
    runtimeActive = false
    log.debug('[lifecycle] bare event: suspend linger=' + linger)
    notesApi
      .suspendServices()
      .then(() => {
        if (runtimeActive) return
        const released = setIpcHoldingLoop(false)
        log.debug(
          '[lifecycle] bare suspend handler finished, ipc released=[' + released.join(',') + ']'
        )
      })
      .catch((e) => log.error('[lifecycle] bare suspend handler failed', e))
  })

  Bare.on('idle', () => {
    log.debug('[lifecycle] bare event: idle (loop parked)')
    errorLog.flushSync()
  })

  // A parked loop never fires the log's persist timer, and an exiting one loses it.
  Bare.on('exit', () => errorLog.flushSync())
  Bare.on('teardown', () => errorLog.flushSync())

  Bare.on('wakeup', (deadline) => {
    const restored = setIpcHoldingLoop(true)
    log.debug(
      '[lifecycle] bare event: wakeup deadline=' +
        deadline +
        ', ipc restored=[' +
        restored.join(',') +
        ']'
    )
    notesApi
      .resumeServices()
      .then(() => log.debug('[lifecycle] bare wakeup handler finished'))
      .catch((e) => log.error('[lifecycle] bare wakeup handler failed', e))
  })

  Bare.on('resume', () => {
    runtimeActive = true
    const restored = setIpcHoldingLoop(true)
    log.debug('[lifecycle] bare event: resume, ipc restored=[' + restored.join(',') + ']')
    notesApi
      .resumeServices()
      .then(() => log.debug('[lifecycle] bare resume handler finished'))
      .catch((e) => log.error('[lifecycle] bare resume handler failed', e))
  })
}

log.debug('rpc ready')
backendBoot.mark('bundle evaluated')

rpc.onCommandReady(async ({ storage, encryption, entropy, appVersion }) => {
  try {
    backendBoot.mark('ready command received')
    await notesApi.ready({ storage, encryption, entropy, appVersion })
    backendBoot.mark('ready command answered')
    return { done: true }
  } catch (e) {
    // A sealed vault is not a crash - the data is intact and the device's
    // keychain entry is what went missing. It has to be reported distinctly so
    // the app can say "restore a backup or re-link this device" instead of
    // opening an empty vault, which is indistinguishable from losing everything.
    if (e?.code === 'VAULT_KEY_SEALED') {
      log.error('onCommandReady: vault key is sealed, device entropy missing', e)
      return { done: false, reason: 'VAULT_KEY_SEALED' }
    }
    // LEGACY(hyperdb-migration): see docs/HYPERDB-VIEW-MIGRATION-PLAN-2026-09-23.md section 8
    if (e?.code === 'LEGACY_VAULT') {
      log.error('onCommandReady: vault predates the HyperDB view, refusing to open it', e)
      return { done: false, reason: 'LEGACY_VAULT' }
    }
    log.error('onCommandReady', e)
    return { done: false }
  }
})

// LEGACY(hyperdb-migration): see docs/HYPERDB-VIEW-MIGRATION-PLAN-2026-09-23.md section 8
rpc.onCommandStartFreshVault(async ({ storage }) => {
  try {
    const result = await notesApi.startFreshFromLegacyVault({ storage })
    if (result.done)
      log.info('onCommandStartFreshVault: legacy vault preserved at', result.preservedPath)
    return {
      done: !!result.done,
      reason: result.reason || '',
      preservedPath: result.preservedPath || ''
    }
  } catch (e) {
    log.error('onCommandStartFreshVault', e)
    return { done: false, reason: 'FAILED' }
  }
})

rpc.onCommandDestroy(async () => {
  try {
    await notesApi.destroy()
    return { done: true }
  } catch (e) {
    log.error('onCommandDestroy', e)
    return { done: false }
  }
})

rpc.onCommandChore(async () => {
  try {
    const data = await notesApi.getChore()
    return { hyperdriveServerAddress: data?.hyperdriveServerAddress || '' }
  } catch (e) {
    log.error('onCommandGetChore', e)
    return { hyperdriveServerAddress: '' }
  }
})

rpc.onCommandSuspendServices(async () => {
  if (isMobile && runtimeActive) {
    log.info('[lifecycle] suspendServices ignored, the app is in the foreground')
    return { done: false }
  }
  try {
    await notesApi.suspendServices()
    if (isMobile) {
      setImmediate(() => {
        if (!runtimeActive) setIpcHoldingLoop(false)
      })
    }
    return { done: true }
  } catch (e) {
    log.error('onCommandSuspendServices', e)
    return { done: false }
  }
})

rpc.onCommandResumeServices(async () => {
  try {
    await notesApi.resumeServices()
    return { hyperdriveServerAddress: notesApi.getHyperdriveAddress() }
  } catch (e) {
    log.error('onCommandResumeServices', e)
    return { hyperdriveServerAddress: '' }
  }
})

rpc.onCommandInsertNote(async ({ title, note, folderKey, locked, pinned }) => {
  try {
    const key = await notesApi.insertNote({ title, note, folderKey, locked, pinned })
    return key ? { done: true, key } : { done: false }
  } catch (e) {
    log.error('onCommandInsertNote', e)
    return { done: false }
  }
})

rpc.onCommandUpdateNote(async ({ key, title, note, folderKey, locked, pinned }) => {
  try {
    log.debug('RPC onCommandUpdateNote', { key, folderKey })
    const result = await answerWithin(
      'updateNote',
      notesApi.updateNote({ key, title, note, folderKey, locked, pinned }),
      { done: false, reason: 'BACKEND_BUSY' }
    )
    if (result?.done !== true)
      log.error('onCommandUpdateNote not saved', { key, reason: result?.reason })
    return { done: result?.done === true, reason: result?.reason || '' }
  } catch (e) {
    log.error('onCommandUpdateNote', e)
    return { done: false }
  }
})

rpc.onCommandDeleteNote(async ({ key }) => {
  try {
    await notesApi.deleteNote(key)
    return { done: true }
  } catch (e) {
    log.error('onCommandDeleteNote', e)
    return { done: false }
  }
})

rpc.onCommandTrashNote(async ({ key }) => {
  try {
    const done = await notesApi.trashNote(key)
    return { done: !!done }
  } catch (e) {
    log.error('onCommandTrashNote', e)
    return { done: false }
  }
})

rpc.onCommandRestoreNote(async ({ key }) => {
  try {
    const result = await notesApi.restoreNote(key)
    return { done: !!result?.done, folderKey: result?.folderKey || '' }
  } catch (e) {
    log.error('onCommandRestoreNote', e)
    return { done: false, folderKey: '' }
  }
})

rpc.onCommandPurgeExpiredTrash(async () => {
  try {
    const purged = await notesApi.purgeExpiredTrash()
    return { purged: purged || 0 }
  } catch (e) {
    log.error('onCommandPurgeExpiredTrash', e)
    return { purged: 0 }
  }
})

rpc.onCommandGetActivity(async ({ filter, deviceKey, noteKey, limit, cursor }) => {
  try {
    const result = await notesApi.getActivity({ filter, deviceKey, noteKey, limit, cursor })
    return {
      entries: (result.entries || []).map((entry) => ({
        ...entry,
        meta: JSON.stringify(entry.meta || {})
      })),
      cursor: result.cursor || '',
      hasMore: !!result.hasMore
    }
  } catch (e) {
    log.error('onCommandGetActivity', e)
    return { entries: [], cursor: '', hasMore: false }
  }
})

rpc.onCommandGetActivityDiff(async ({ id }) => {
  try {
    const data = await notesApi.getActivityDiff({ id })
    return { data }
  } catch (e) {
    log.error('onCommandGetActivityDiff', e)
    return { data: { id: '', before: '', after: '', locked: false, available: false } }
  }
})

rpc.onCommandGetErrorLog(async () => {
  return {
    json: JSON.stringify({
      capturedAt: Date.now(),
      enabled: errorLog.enabled,
      entries: errorLog.entries()
    })
  }
})

rpc.onCommandSetErrorLogEnabled(async ({ enabled }) => {
  return { enabled: errorLog.setEnabled(enabled === true) }
})

const APP_LOG_LEVELS = new Set(['fatal', 'error', 'warn', 'info', 'debug'])
const APP_LOG_BATCH_MAX = 500

rpc.onCommandRecordLogs(async ({ json }) => {
  try {
    const entries = JSON.parse(json || '[]')
    if (!Array.isArray(entries)) return { done: false }
    for (const entry of entries.slice(-APP_LOG_BATCH_MAX)) {
      if (!entry || !APP_LOG_LEVELS.has(entry.level)) continue
      const args = [String(entry.message || '')]
      if (entry.detail) args.push(String(entry.detail))
      errorLog.add({
        at: Number.isFinite(entry.at) ? entry.at : Date.now(),
        level: entry.level,
        source: 'app',
        ...formatLogArgs(args)
      })
    }
    return { done: true }
  } catch {
    return { done: false }
  }
})

rpc.onCommandClearErrorLog(async () => {
  errorLog.clear()
  return { done: true }
})

rpc.onCommandGetDebugInfo(async ({ heavy }) => {
  try {
    return { json: JSON.stringify(await notesApi.getDebugInfo({ heavy })) }
  } catch (e) {
    log.error('onCommandGetDebugInfo', e)
    return { json: JSON.stringify({ error: String(e?.message || e), capturedAt: Date.now() }) }
  }
})

rpc.onCommandRecoverDiscardedWrite(async ({ id }) => {
  try {
    return await notesApi.recoverDiscardedNoteWrite({ id })
  } catch (e) {
    log.error('onCommandRecoverDiscardedWrite', e)
    return { done: false, noteKey: '' }
  }
})

rpc.onCommandGetActivityStats(async () => {
  try {
    const data = await notesApi.getActivityStats()
    return { data }
  } catch (e) {
    log.error('onCommandGetActivityStats', e)
    return { data: { count: 0, bytes: 0, oldestAt: 0 } }
  }
})

rpc.onCommandClearActivity(async () => {
  try {
    const success = await notesApi.clearActivity()
    return { success }
  } catch (e) {
    log.error('onCommandClearActivity', e)
    return { success: false }
  }
})

rpc.onCommandSubscribeActivity(async (stream) => {
  try {
    const watcher = await notesApi.subscribeActivity()
    if (!watcher) return
    stream.write({ changed: true })

    watcher.on('update', () => {
      stream.write({ changed: true })
    })

    watcher.on('error', (e) => {
      log.error('subscribe activity watcher error', e)
    })

    return async () => {
      stream.destroy()
      await watcher.close()
    }
  } catch (e) {
    log.error('onCommandSubscribeActivity', e)
  }
})

rpc.onCommandGetAllNotes(async () => {
  try {
    const data = (await notesApi.getAllNotes())?.map((item) => ({
      ...item,
      value: readableNote(item.key, item.value)
    }))
    return { data }
  } catch (e) {
    log.error('onCommandGetAllNotes', e)
    return { data: [] }
  }
})

rpc.onCommandSearchNotes(async ({ query, folderKey, includeLocked, limit }) => {
  const echo = query || ''
  try {
    const found = await notesApi.searchNotes({
      query: echo,
      folderKey: folderKey || '',
      includeLocked: includeLocked === true,
      limit: limit || undefined
    })
    return { query: echo, ...found, failed: false }
  } catch (e) {
    log.error('onCommandSearchNotes', e)
    return { query: echo, results: [], total: 0, tookMs: 0, failed: true }
  }
})

rpc.onCommandDerivedPut((request) => notesApi.derivedPut(request))
rpc.onCommandDerivedGet((request) => notesApi.derivedGet(request))
rpc.onCommandDerivedVersions((request) => notesApi.derivedVersions(request))
rpc.onCommandDerivedClear((request) => notesApi.derivedClear(request))
rpc.onCommandDerivedSearch((request) => notesApi.derivedSearch(request))
rpc.onCommandDerivedRelated((request) => notesApi.derivedRelated(request))
rpc.onCommandDerivedDuplicates((request) => notesApi.derivedDuplicates(request))
rpc.onCommandDerivedStats((request) => notesApi.derivedStats(request))

rpc.onCommandPrewarmSearch(async () => {
  return { ready: await notesApi.prewarmSearch() }
})

rpc.onCommandGetSingleNote(async ({ key }) => {
  try {
    const data = await notesApi.getSingleNote({ key })
    return { data: data || {}, key }
  } catch (e) {
    log.error('onCommandGetSingleNote', e)
    return { data: {}, key: '' }
  }
})

rpc.onCommandSubscribeNote(async (stream) => {
  try {
    const key = stream.data.key
    const summaryOnly = stream.data.summary === true
    const toWire = (stored) => {
      const value = readableNote(key, stored)
      const raw = value.note || ''
      const body = normalizeAttachmentUrls(raw)
      const hash = crypto.createHash('sha256').update(body).digest('hex')
      const summary = JSON.stringify({ ...buildNoteSummary(body), hash })
      if (summaryOnly) return { ...value, note: undefined, summary, bodyOmitted: true }
      const note = raw.replaceAll(
        HYPERDRIVE_URL_PREFIX,
        notesApi.getHyperdriveAddress().replace(/\/$/, '')
      )
      return { ...value, note, summary }
    }
    const watcher = await notesApi.susbscribeNote({ key })
    const currentValue = watcher.node?.value
    backendBoot.markRolling('subscribeNote', 'note body served')
    if (currentValue) stream.write({ data: toWire(currentValue) })

    const resend = async () => {
      try {
        const data = await notesApi.getStoredNote({ key })
        if (!data) return
        stream.write({ data: toWire(data) })
      } catch (e) {
        log.error('subscribe note update', e)
      }
    }
    watcher.on('update', resend)
    const offLockSession = onLockSessionChange(() => {
      if (watcher.node?.value?.sealed) resend()
    })

    watcher.on('error', async (e) => {
      log.error('subscribe note watcher error', e)
    })

    return async () => {
      offLockSession()
      stream.destroy()
      await watcher.close()
    }
  } catch (e) {
    log.error('onCommandSubscribeNote', e)
  }
})

// Serial reads: two overlapping reads could otherwise send an older list after a newer one.
function streamKeyList(stream, watcher, read, label) {
  let last = null
  let chain = Promise.resolve()
  const send = async () => {
    let data = await read()
    if (stream.destroyed) return
    if (!Array.isArray(data)) {
      if (last !== null) return
      data = []
    }
    const signature = data.join(',')
    if (signature === last) return
    last = signature
    stream.write({ data })
  }
  const refresh = () => {
    chain = chain.then(send).catch((e) => log.error(`subscribe ${label} update`, e))
    return chain
  }
  watcher.on('update', refresh)
  return refresh
}

rpc.onCommandSubscribeNoteKeys(async (stream) => {
  try {
    const watcher = await notesApi.susbscribeNoteKeys()
    let served = false
    const read = async () => {
      const keys = await notesApi.getAllNoteKeys()
      if (!served && Array.isArray(keys)) {
        served = true
        backendBoot.mark(`note keys served (${keys.length})`)
      }
      return keys
    }
    await streamKeyList(stream, watcher, read, 'note keys')()

    watcher.on('error', async (e) => {
      log.error('subscribe note keys watcher error', e)
    })

    return async () => {
      stream.destroy()
      await watcher.close()
    }
  } catch (e) {
    log.error('onCommandSubscribeNoteKeys', e)
  }
})

rpc.onCommandInsertFolder(async ({ title, icon }) => {
  try {
    const key = await notesApi.insertFolder({ title, icon })
    return { done: true, key }
  } catch (e) {
    log.error('onCommandInsertFolder', e)
    return { done: false }
  }
})

rpc.onCommandUpdateFolder(async ({ key, title, icon }) => {
  try {
    await notesApi.updateFolder({ key, title, icon })
    return { done: true }
  } catch (e) {
    log.error('onCommandUpdateFolder', e)
    return { done: false }
  }
})

rpc.onCommandDeleteFolder(async ({ key }) => {
  try {
    await notesApi.deleteFolder(key)
    return { done: true }
  } catch (e) {
    log.error('onCommandDeleteFolder', e)
    return { done: false }
  }
})

rpc.onCommandGetAllFolders(async () => {
  try {
    const data = await notesApi.getAllFolders()
    return { data }
  } catch (e) {
    log.error('onCommandGetAllFolders', e)
    return { data: [] }
  }
})

rpc.onCommandGetSingleFolder(async ({ key }) => {
  try {
    const data = await notesApi.getSingleFolder({ key })
    return { data: data || {}, key }
  } catch (e) {
    log.error('onCommandGetSingleFolder', e)
    return { data: {}, key: '' }
  }
})

rpc.onCommandSubscribeFolder(async (stream) => {
  try {
    const key = stream.data.key
    const watcher = await notesApi.susbscribeFolder({ key })
    const currentValue = await notesApi.getSingleFolder({ key })
    if (currentValue) stream.write({ data: currentValue })

    watcher.on('update', async () => {
      try {
        const data = await notesApi.getSingleFolder({ key })
        if (!data) return
        stream.write({ data })
      } catch (e) {
        log.error('subscribe folder update', e)
      }
    })

    watcher.on('error', async (e) => {
      log.error('subscribe folder watcher error', e)
    })

    return async () => {
      stream.destroy()
      await watcher.close()
    }
  } catch (e) {
    log.error('onCommandSubscribeFolder', e)
  }
})

rpc.onCommandSubscribeFolderKeys(async (stream) => {
  try {
    const watcher = await notesApi.susbscribeFolderKeys()
    await streamKeyList(stream, watcher, () => notesApi.getAllFoldersKeys(), 'folder keys')()

    watcher.on('error', async (e) => {
      log.error('subscribe folder keys watcher error', e)
    })

    return async () => {
      stream.destroy()
      await watcher.close()
    }
  } catch (e) {
    log.error('onCommandSubscribeFolderKeys', e)
  }
})

rpc.onCommandInsertFile(async ({ key, fileName, buffer, path }) => {
  try {
    const result = await notesApi.insertFile({ key, fileName, buffer, path })
    if (!result?.link) return { done: false, link: '', reason: result?.reason || '' }
    return { done: true, link: result.link }
  } catch (e) {
    log.error('onCommandInsertFile', e)
    return { done: false }
  }
})

let activeUploads = 0

rpc.onCommandInsertFileProgress(async (stream) => {
  activeUploads++
  const token = { cancelled: false, destroy: null }
  const { key, fileName, path } = stream.data || {}
  let succeeded = false
  let settled = false

  const safeWrite = (data) => {
    if (token.cancelled) return
    try {
      stream.write(data)
    } catch (e) {
      log.error('onCommandInsertFileProgress write', e)
    }
  }

  const abort = () => {
    if (settled || token.cancelled) return
    token.cancelled = true
    if (token.destroy) token.destroy()
  }

  const clientStream = stream.writeStream
  if (clientStream) {
    clientStream.on('close', abort)
    clientStream.on('error', abort)
  }

  notesApi
    .insertFileWithProgress(
      { key, fileName, path },
      (transferred, total) => safeWrite({ transferred, total, done: false, link: '' }),
      token
    )
    .then(({ link }) => {
      succeeded = true
      safeWrite({ transferred: 0, total: 0, done: true, link: link || '' })
    })
    .catch((e) => {
      if (token.cancelled) return
      if (e?.message === LOCK_REFUSAL.SESSION_CLOSED) {
        safeWrite({ transferred: 0, total: 0, done: false, link: '', reason: e.message })
      } else {
        log.error('onCommandInsertFileProgress', e)
      }
    })
    .finally(() => {
      settled = true
      activeUploads = Math.max(0, activeUploads - 1)
      if (clientStream) {
        clientStream.removeListener('close', abort)
        clientStream.removeListener('error', abort)
      }
      try {
        stream.end()
      } catch (e) {
        log.error('onCommandInsertFileProgress end', e)
      }
      if (!succeeded && activeUploads === 0) {
        notesApi.reclaimOrphanedBlobs().catch((e) => log.error('reclaim after aborted upload', e))
      }
    })
})

rpc.onCommandDeleteFile(async ({ key }) => {
  try {
    await notesApi.deleteFile(key)
    return { done: true }
  } catch (e) {
    log.error('onCommandDeleteFile', e)
    return { done: false }
  }
})

rpc.onCommandReclaimOrphanedBlobs(async () => {
  try {
    return await notesApi.reclaimOrphanedBlobs()
  } catch (e) {
    log.error('onCommandReclaimOrphanedBlobs', e)
    return { reclaimedBytes: 0 }
  }
})

rpc.onCommandRetryDownload(async ({ url }) => {
  try {
    return await notesApi.retryDownload({ url })
  } catch (e) {
    log.error('onCommandRetryDownload', e)
    return { done: false }
  }
})

rpc.onCommandPauseDownload(async ({ url }) => {
  try {
    return await notesApi.pauseDownload({ url })
  } catch (e) {
    log.error('onCommandPauseDownload', e)
    return { paused: false }
  }
})

rpc.onCommandDeleteNoteFile(async ({ noteKey, mediaPath }) => {
  try {
    return { done: await notesApi.deleteNoteFile({ noteKey, mediaPath }) }
  } catch (e) {
    log.error('onCommandDeleteNoteFile', e)
    return { done: false }
  }
})

rpc.onCommandCreateInvite(async (req) => {
  try {
    const data = await notesApi.createInvite({ regenerate: !!req?.regenerate })
    return data
  } catch (e) {
    log.error('onCommandCreateInvite', e)
    return {}
  }
})

rpc.onCommandSubscribePairing(async (stream) => {
  try {
    const cb = (data) => {
      stream.write({ data })
    }

    await notesApi.susbscribePairing(cb)

    return async () => {
      stream.destroy()
    }
  } catch (e) {
    log.error('onCommandSubscribePairing', e)
  }
})

rpc.onCommandSubscribePairUser(async (stream) => {
  try {
    const invite = stream.data.invite
    const deviceName = stream.data.deviceName || ''
    const options = { mode: stream.data.mode || 'replace', name: stream.data.vaultName || '' }

    const cb = (data) => {
      stream.write({ data })
    }

    await notesApi.susbscribePairUser(cb, invite, deviceName, options)

    return async () => {
      stream.destroy()
    }
  } catch (e) {
    log.error('onCommandSubscribePairUser', e)
  }
})

rpc.onCommandGetHeldMerge(async () => {
  try {
    return await notesApi.getHeldMerge()
  } catch (e) {
    log.error('onCommandGetHeldMerge', e?.message)
    return { held: false, blocking: [] }
  }
})

rpc.onCommandCombineHeldMerge(async () => {
  try {
    return { done: await notesApi.combineHeldMerge() }
  } catch (e) {
    log.error('onCommandCombineHeldMerge', e?.message)
    return { done: false }
  }
})

rpc.onCommandConfirmPairing(async () => {
  try {
    notesApi.confirmPairing()
    return { done: true }
  } catch (e) {
    log.error('onCommandConfirmPairing', e)
    return { done: false }
  }
})

rpc.onCommandRejectPairing(async () => {
  try {
    await notesApi.rejectPairing()
    return { done: true }
  } catch (e) {
    log.error('onCommandRejectPairing', e)
    return { done: false }
  }
})

rpc.onCommandUpdateSettings(async (data) => {
  try {
    if (!data || typeof data !== 'object') return { done: false }
    const { settings } = data
    await notesApi.updateSettings({ settings })
    return { done: true }
  } catch (e) {
    log.error('onCommandUpdateSettings', e)
    return { done: false }
  }
})

rpc.onCommandGetSettings(async () => {
  try {
    const data = await notesApi.getSettings()
    return { data }
  } catch (e) {
    log.error('onCommandGetSettings', e)
    return { data: null }
  }
})

rpc.onCommandSubscribeSettings(async (stream) => {
  try {
    const watcher = await notesApi.subscribeSettings()
    const currentValue = await notesApi.getSettings()
    if (currentValue) {
      stream.write({ data: currentValue })
    }

    watcher.on('update', async () => {
      try {
        const data = await notesApi.getSettings()
        if (!data || stream.destroyed) return
        stream.write({ data })
      } catch (e) {
        log.error('subscribe settings update', e)
      }
    })

    watcher.on('error', async (e) => {
      log.error('subscribe settings watcher error', e)
    })

    return async () => {
      stream.destroy()
      await watcher.close()
    }
  } catch (e) {
    log.error('onCommandSubscribeSettings', e)
  }
})

rpc.onCommandUpdatePreference(async ({ key, value }) => {
  try {
    await notesApi.updatePreference({ key, value })
    return { done: true }
  } catch (e) {
    log.error('onCommandUpdatePreference', e)
    return { done: false }
  }
})

rpc.onCommandGetPreference(async ({ key }) => {
  try {
    const data = await notesApi.getPreference({ key })
    return { data: data || '' }
  } catch (e) {
    log.error('onCommandGetPreference', e)
    return { data: '' }
  }
})

rpc.onCommandSetNoteLockPassword(async ({ password }) => {
  try {
    const done = await notesApi.setNoteLockPassword({ password })
    return { done }
  } catch (e) {
    log.error('onCommandSetNoteLockPassword', e?.message)
    return { done: false }
  }
})

rpc.onCommandVerifyNoteLockPassword(async ({ password }) => {
  try {
    const result = await notesApi.verifyNoteLockPassword({ password })
    return { valid: !!result?.valid, retryAfter: result?.retryAfter || 0 }
  } catch (e) {
    log.error('onCommandVerifyNoteLockPassword', e?.message)
    return { valid: false, retryAfter: 0 }
  }
})

rpc.onCommandOpenLockSession(async ({ password, rootKey, returnRootKey }) => {
  try {
    const result = await notesApi.openLockSession({
      password: password || '',
      rootKey: rootKey || '',
      returnRootKey: returnRootKey === true
    })
    return {
      ok: result.ok === true,
      retryAfter: result.retryAfter || 0,
      rootKey: result.rootKey || '',
      reason: result.reason || ''
    }
  } catch (e) {
    log.error('onCommandOpenLockSession', e?.message)
    return { ok: false, retryAfter: 0, rootKey: '', reason: 'FAILED' }
  }
})

rpc.onCommandCloseLockSession(async () => {
  try {
    return { done: await notesApi.closeLockSession() }
  } catch (e) {
    log.error('onCommandCloseLockSession', e?.message)
    return { done: false }
  }
})

rpc.onCommandInsertSyncedDevice(async (data) => {
  try {
    if (!data) return { done: false }
    const { title, deviceType, platform, localKey } = data
    const key = await notesApi.insertSyncedDevice({ title, deviceType, platform, localKey })
    return { done: true, key }
  } catch (e) {
    log.error('onCommandInsertSyncedDevice', e)
    return { done: false }
  }
})

rpc.onCommandUpdateSyncedDevice(async ({ key, title }) => {
  try {
    await notesApi.updateSyncedDevice({ key, title })
    return { done: true }
  } catch (e) {
    log.error('onCommandUpdateSyncedDevice', e)
    return { done: false }
  }
})

rpc.onCommandDeleteSyncedDevice(async ({ key }) => {
  try {
    await notesApi.deleteSyncedDevice(key)
    return { done: true }
  } catch (e) {
    log.error('onCommandDeleteSyncedDevice', e)
    return { done: false }
  }
})

rpc.onCommandSetDeviceIndexer(async ({ localKey, isIndexer }) => {
  try {
    const result = await notesApi.setDeviceIndexer({ localKey, isIndexer })
    return { changed: result.changed === true, error: result.error || '' }
  } catch (e) {
    log.error('onCommandSetDeviceIndexer', e)
    return { changed: false, error: e.message || '' }
  }
})

rpc.onCommandSubscribeSyncedDevice(async (stream) => {
  try {
    const key = stream.data.key
    const watcher = await notesApi.subscribeSyncedDevice({ key })
    const currentValue = await notesApi.getSyncedDevice({ key })
    stream.write({ data: currentValue })

    const push = async () => {
      if (stream.destroyed) return
      const data = await notesApi.getSyncedDevice({ key })
      stream.write({ data })
    }

    watcher.on('update', () => {
      push().catch((e) => log.error('subscribe synced device push', e))
    })

    const onPresenceChanged = () => {
      push().catch((e) => log.error('subscribe synced device presence push', e))
    }
    const unsubscribePresence = await notesApi.subscribePresence(onPresenceChanged)

    watcher.on('error', async (e) => {
      log.error('subscribe synced device watcher error', e)
    })

    return async () => {
      stream.destroy()
      if (unsubscribePresence) unsubscribePresence()
      await watcher.close()
    }
  } catch (e) {
    log.error('onCommandSubscribeSyncedDevice', e)
  }
})

rpc.onCommandSubscribeAllSyncedDeviceKeys(async (stream) => {
  try {
    const watcher = await notesApi.subscribeAllSyncedDeviceKeys()
    await streamKeyList(
      stream,
      watcher,
      () => notesApi.getAllSyncedDeviceKeys(),
      'synced device keys'
    )()

    watcher.on('error', async (e) => {
      log.error('subscribe synced device keys watcher error', e)
    })

    return async () => {
      stream.destroy()
      await watcher.close()
    }
  } catch (e) {
    log.error('onCommandSubscribeSyncedDeviceKeys', e)
  }
})

rpc.onCommandCheckAndInsertLocalDevice(async (req) => {
  try {
    await notesApi.checkAndInsertLocalDevice(req?.deviceName || '')
    return { done: true }
  } catch (e) {
    log.error('onCommandCheckAndInsertLocalDevice', e)
    return { done: false }
  }
})

rpc.onCommandSubscribeDeviceStatus(async (stream) => {
  try {
    const onDeviceStatus = (status) => {
      stream.write({ data: status })
    }

    const unsubscribe = await notesApi.subscribeDeviceStatus(onDeviceStatus)

    return async () => {
      if (unsubscribe) unsubscribe()
      stream.destroy()
    }
  } catch (e) {
    log.error('onCommandSubscribeDeviceStatus', e)
  }
})

rpc.onCommandClearStorage(async () => {
  try {
    await notesApi.clearStorage()
    return { done: true }
  } catch (e) {
    log.error('onCommandClearStorage', e)
    return { done: false }
  }
})

rpc.onCommandSubscribeStorageInfo(async (stream) => {
  try {
    const watcher = await notesApi.subscribeStorageInfo()
    const {
      notes,
      totalBlobBytes,
      totalOnDiskBytes,
      reclaimableBytes,
      downloads,
      uploads,
      sealWaiting
    } = await notesApi.getNotesStorageInfo()
    backendBoot.mark('storage scan served')

    let lastScan = { notes, totalBlobBytes, totalOnDiskBytes, reclaimableBytes, sealWaiting }

    stream.write({
      data: notes,
      totalBlobBytes,
      totalOnDiskBytes,
      reclaimableBytes,
      downloads,
      uploads,
      sealWaiting
    })

    let scanning = false
    let rescanQueued = false

    const recompute = async () => {
      if (stream.destroyed) return
      if (scanning) {
        rescanQueued = true
        return
      }
      scanning = true
      try {
        const {
          notes,
          totalBlobBytes,
          totalOnDiskBytes,
          reclaimableBytes,
          downloads,
          uploads,
          sealWaiting
        } = await notesApi.getNotesStorageInfo()
        backendBoot.markRolling('storageRescan', 'storage scan recomputed')
        lastScan = { notes, totalBlobBytes, totalOnDiskBytes, reclaimableBytes, sealWaiting }
        if (!stream.destroyed) {
          stream.write({
            data: notes,
            totalBlobBytes,
            totalOnDiskBytes,
            reclaimableBytes,
            downloads,
            uploads,
            sealWaiting
          })
        }
      } catch (e) {
        log.error('subscribe storage info watcher update', e)
      } finally {
        scanning = false
        if (rescanQueued) {
          rescanQueued = false
          recompute()
        }
      }
    }

    // Transfer ticks carry bytes-moved only. Rescanning every note and the whole
    // drive at that rate is far too expensive, so the last scan is replayed with
    // fresh transfer numbers instead.
    const pushTransfers = () => {
      if (stream.destroyed || scanning) return
      try {
        stream.write({
          data: lastScan.notes,
          totalBlobBytes: lastScan.totalBlobBytes,
          totalOnDiskBytes: lastScan.totalOnDiskBytes,
          reclaimableBytes: lastScan.reclaimableBytes,
          downloads: notesApi.getDownloadsInfo(),
          uploads: notesApi.getUploadsInfo(),
          sealWaiting: lastScan.sealWaiting
        })
      } catch (e) {
        log.error('subscribe storage info transfer update', e)
      }
    }

    watcher.on('update', () => {
      recompute()
    })

    watcher.on('transfers', () => {
      pushTransfers()
    })

    return async () => {
      stream.destroy()
      await watcher.close()
    }
  } catch (e) {
    log.error('onCommandSubscribeStorageInfo', e)
  }
})

function watchStreamCancellation(stream) {
  const signal = { cancelled: false }
  const cancel = () => {
    signal.cancelled = true
  }
  stream.on('close', cancel)
  stream.on('error', cancel)
  return signal
}

function streamWriter(stream) {
  return (data) => {
    if (!stream.destroyed) stream.write({ data })
  }
}

rpc.onCommandExportBackup(async (stream) => {
  const signal = watchStreamCancellation(stream)
  try {
    const { password, filePath } = stream.data || {}
    const buffer = await notesApi.exportBackup(password, filePath, streamWriter(stream), signal)
    if (!stream.destroyed) {
      stream.write({ data: { step: 'done', progress: 100, message: 'Export complete' }, buffer })
    }
  } catch (e) {
    if (signal.cancelled) {
      log.debug('onCommandExportBackup cancelled')
      return
    }
    log.error('onCommandExportBackup', e)
    streamWriter(stream)({ step: 'error', progress: 0, message: e.message })
  }
})

rpc.onCommandCheckBackupRestore(async ({ buffer, filePath, password }) => {
  try {
    return await notesApi.checkBackupRestore({ buffer, filePath, password })
  } catch (e) {
    log.error('onCommandCheckBackupRestore', e?.message)
    return { sealed: false, blocking: [] }
  }
})

rpc.onCommandImportBackup(async (stream) => {
  const signal = watchStreamCancellation(stream)
  try {
    const { buffer, filePath, recoveryKey, password } = stream.data
    await notesApi.importBackup({
      buffer,
      filePath,
      recoveryKey,
      password,
      signal,
      cb: streamWriter(stream)
    })
    if (!stream.destroyed) {
      stream.write({ data: { step: 'done', progress: 100, message: 'Import complete' } })
    }
  } catch (e) {
    if (signal.cancelled) {
      log.debug('onCommandImportBackup cancelled')
      return
    }
    log.error('onCommandImportBackup', e)
    streamWriter(stream)({ step: 'error', progress: 0, message: e.message })
  }
})

rpc.onCommandListVaults(() => ({ data: notesApi.listVaults() }))

rpc.onCommandCreateVault(({ name }) => notesApi.createVault({ name }))

rpc.onCommandSwitchVault(({ id }) => notesApi.switchVault({ id }))

rpc.onCommandRenameVault(({ id, name }) => notesApi.renameVault({ id, name }))

rpc.onCommandRemoveVault(({ id, force }) => notesApi.removeVault({ id, force: !!force }))

rpc.onCommandMoveToVault(({ targetId, noteKeys, folderKeys }) =>
  notesApi.moveToVault({ targetId, noteKeys: noteKeys || [], folderKeys: folderKeys || [] })
)

const aiOffloadRuns = new Map()
const aiOffloadJobStreams = []
let aiOffloadWanted = false

const syncAiOffloadServing = () =>
  notesApi.setAiOffloadServing(aiOffloadWanted && aiOffloadJobStreams.length > 0)

const onClientClose = (stream, cb) => {
  let fired = false
  const once = () => {
    if (fired) return
    fired = true
    cb()
  }
  const transport = stream.writeStream || stream
  transport.on('close', once)
  transport.on('error', once)
}

const safeStreamWrite = (stream, data, label) => {
  try {
    if (!stream.destroyed) stream.write(data)
  } catch (e) {
    log.error(label, e)
  }
}

rpc.onCommandAiOffloadStatus(async (stream) => {
  let closed = false
  const push = () =>
    notesApi
      .getAiOffloadStatus()
      .then((status) => {
        if (!closed) safeStreamWrite(stream, status, 'onCommandAiOffloadStatus write')
      })
      .catch((e) => log.error('onCommandAiOffloadStatus', e))
  const off = notesApi.subscribeAiOffload({ 'ai-offload-status': push, 'presence-changed': push })
  onClientClose(stream, () => {
    closed = true
    off()
  })
  push()
})

rpc.onCommandAiOffloadRun(async (stream) => {
  const { runId, kind, payload } = stream.data || {}
  let parsed = null
  try {
    parsed = JSON.parse(payload || 'null')
  } catch (e) {
    log.debug('onCommandAiOffloadRun bad payload', e?.message)
  }
  const run = notesApi.runAiOffload({
    kind,
    payload: parsed,
    onText: (text) => safeStreamWrite(stream, { text }, 'onCommandAiOffloadRun write')
  })
  aiOffloadRuns.set(runId, run.id)
  onClientClose(stream, () => {
    if (aiOffloadRuns.get(runId) === run.id && run.id) notesApi.cancelAiOffload(run.id)
    aiOffloadRuns.delete(runId)
  })
  run.done
    .then(({ text, data }) => {
      aiOffloadRuns.delete(runId)
      safeStreamWrite(
        stream,
        { text, done: true, data: data === null ? '' : JSON.stringify(data) },
        'onCommandAiOffloadRun done'
      )
    })
    .catch((e) => {
      aiOffloadRuns.delete(runId)
      safeStreamWrite(
        stream,
        { error: e?.code || 'failed', started: !!e?.started },
        'onCommandAiOffloadRun error'
      )
    })
    .finally(() => {
      try {
        stream.end()
      } catch (e) {
        log.debug('onCommandAiOffloadRun end', e?.message)
      }
    })
})

rpc.onCommandAiOffloadCancel(({ runId }) => {
  const id = aiOffloadRuns.get(runId)
  if (id) notesApi.cancelAiOffload(id)
})

rpc.onCommandAiOffloadServe(async ({ serving }) => {
  aiOffloadWanted = !!serving
  syncAiOffloadServing()
  return { done: true }
})

rpc.onCommandAiOffloadJobs(async (stream) => {
  const isLatest = () => aiOffloadJobStreams.at(-1) === stream
  const off = notesApi.subscribeAiOffload({
    'ai-offload-job': (job) => {
      if (!isLatest()) return
      safeStreamWrite(
        stream,
        {
          jobId: job.jobId,
          kind: job.kind,
          payload: JSON.stringify(job.payload ?? null),
          deviceTitle: job.deviceTitle || ''
        },
        'onCommandAiOffloadJobs write'
      )
    },
    'ai-offload-cancel': (jobId) => {
      if (isLatest())
        safeStreamWrite(stream, { jobId, cancel: true }, 'onCommandAiOffloadJobs cancel')
    }
  })
  aiOffloadJobStreams.push(stream)
  syncAiOffloadServing()
  onClientClose(stream, () => {
    off()
    const index = aiOffloadJobStreams.indexOf(stream)
    if (index !== -1) aiOffloadJobStreams.splice(index, 1)
    syncAiOffloadServing()
  })
})

rpc.onCommandAiOffloadReply(({ jobId, text, done, error, data }) => {
  let parsed
  try {
    parsed = data ? JSON.parse(data) : undefined
  } catch (e) {
    log.debug('onCommandAiOffloadReply bad data', e?.message)
  }
  notesApi.replyAiOffload(jobId, {
    text: typeof text === 'string' ? text : undefined,
    done: !!done,
    error: error || undefined,
    data: parsed
  })
})

rpc.onCommandUpcomingTasks(async () => {
  try {
    return { tasks: JSON.stringify(await notesApi.getUpcomingTasks()), ok: true }
  } catch (e) {
    log.error('onCommandUpcomingTasks', e)
    return { tasks: '[]', ok: false }
  }
})

rpc.onCommandAttachments(async ({ countOnly }) => {
  try {
    if (countOnly) return { count: await notesApi.getAttachmentCount(), ok: true }
    return { items: JSON.stringify(await notesApi.getAttachments()), ok: true }
  } catch (e) {
    log.error('onCommandAttachments', e)
    return { items: '[]', ok: false }
  }
})

rpc.onCommandSetSyncedPref(async ({ id, json }) => {
  try {
    await notesApi.setSyncedPref({ id, value: json ? JSON.parse(json) : null })
    return { ok: true }
  } catch (e) {
    log.error('onCommandSetSyncedPref', e)
    return { ok: false }
  }
})

rpc.onCommandGetSyncedPrefs(async ({ prefix }) => {
  try {
    return { json: JSON.stringify(await notesApi.getSyncedPrefs({ prefix })), ok: true }
  } catch (e) {
    log.error('onCommandGetSyncedPrefs', e)
    return { json: '{}', ok: false }
  }
})

rpc.onCommandSetTaskChecked(async ({ noteKey, text, checked }) => {
  try {
    return { ok: await notesApi.setTaskChecked({ noteKey, text, checked: checked === true }) }
  } catch (e) {
    log.error('onCommandSetTaskChecked', e)
    return { ok: false }
  }
})

const subscriptions = new SubscriptionTracker(rpc)
subscriptions.install()

notesApi.onBaseReopened(() => {
  const closed = subscriptions.closeBaseBound()
  log.debug('[subscriptions] base reopened, closed ' + closed + ' stale subscriptions')
})
