/** @typedef {import('pear-interface')} PearInterface */
import Autobase from 'autobase'
import b4a from 'b4a'
import crypto from 'bare-crypto'
import fs from 'bare-fs'
import { platform } from 'bare-os'
import barePath from 'bare-path'
import BlindEncryptionSodium from 'blind-encryption-sodium'
import encryptionEncoding from 'encryption-encoding'
import BlindPairing from 'blind-pairing'
import cenc from 'compact-encoding'
import Corestore from 'corestore'
import HyperDB from 'hyperdb'
import viewDefinition from '../spec/db/index.js'
import Hypercore from 'hypercore'
import BlobServer from 'hypercore-blob-server'
import HypercoreID from 'hypercore-id-encoding'
import Hyperswarm from 'hyperswarm'
import ReadyResource from 'ready-resource'
import { pipelinePromise, Transform } from 'streamx'
import {
  ACTIVITY_DEFAULT_RETENTION_DAYS,
  ACTIVITY_EVENT,
  ACTIVITY_FILTER,
  ACTIVITY_LOG_ENABLED_KEY,
  ACTIVITY_PAGE_SIZE,
  ACTIVITY_RETENTION_DAYS_KEY,
  ACTIVITY_SESSION_WINDOW_MS,
  ACTIVITY_SNAPSHOT_MAX_BYTES,
  ACTIVITY_TARGET,
  ALL_NOTES_KEY,
  COLLABORATION_ENABLED,
  DEFAULT_FOLDER_NAME,
  HYPERDRIVE_URL_PREFIX,
  INDEXER_ERROR,
  INVITE_EXPIRY_MS,
  PAIRING_INVITE_REMOVED,
  PAIRING_PROTOCOL,
  PREFERENCE_DIR,
  PREFERENCE_LEGACY_DIR,
  RECENTLY_DELETED_KEY,
  STORAGE_INFO_DEBOUNCE_MS,
  STORAGE_INFO_MAX_WAIT_MS,
  SWARM_SEED_FILE,
  TRANSFER_INFO_DEBOUNCE_MS,
  TRANSFER_INFO_MAX_WAIT_MS,
  TRASH_RETENTION_MS,
  normalizeAttachmentUrls,
  sanitizeDeviceName
} from '../constant.js'
import {
  getActivityTargetKind,
  htmlToActivityText,
  isActivityRetentionForever,
  listAttachmentNames,
  normalizeActivityRetentionDays
} from '../activity.js'
import { backendBoot } from '../bootTimeline.js'
import { debounceWithMaxWait } from './debounceWithMaxWait.js'
import {
  canProveUpgradeFrom,
  composeMediaMap,
  emptyMediaStoreState,
  mediaRefKey,
  missingProofNodesForBlobs,
  openMediaDrive,
  readMediaStoreState,
  relinkMediaContent,
  writeMediaStoreState
} from './mediaStore.js'
import * as log from '../log.js'
import {
  extractInvite,
  isInviteExpired as inviteExpired,
  isInviteLongExpired as inviteLongExpired
} from '../utils.js'
import {
  blobCoreKeyHexFromUrl,
  blobRefFromUrl,
  blocksPresent,
  clearBlockRange,
  exportBackup as buildBackup,
  getNotesStorageInfo as computeStorageInfo,
  importBackup as restoreBackup,
  measureLocalBlobBytes
} from './backupManager.js'
import {
  admitDownload,
  nextScanDelay,
  presentBlockSet,
  recordBlockOnce
} from './transferProgress.js'
import { ACTIVITY_SEQ_PAD, INVITE_KEY } from './viewKeys.js'
import * as viewStore from './viewStore.js'
import { errorLog } from './errorLog.js'

const ATTACHMENT_TAG_RE =
  /<img\b[^>]*>|<div\b[^>]*\sdata-(?:file|audio)-attachment[^>]*>[\s\S]*?<\/div>/g
const ATTACHMENT_URL_ATTR_RE = /\s(?:src|url)="([^"]+)"/
const ATTACHMENT_FILENAME_ATTR_RE = /\sfileName="([^"]*)"/i

function decodeHtmlAmp(value) {
  return value.replace(/&amp;/g, '&')
}

function extractMediaUrls(html) {
  const urls = new Set()
  if (!html) return urls
  for (const tag of html.match(ATTACHMENT_TAG_RE) || []) {
    const match = ATTACHMENT_URL_ATTR_RE.exec(tag)
    if (match) urls.add(decodeHtmlAmp(match[1]))
  }
  return urls
}

function extractFileNameForUrl(html, url) {
  if (!html) return ''
  for (const tag of html.match(ATTACHMENT_TAG_RE) || []) {
    const urlMatch = ATTACHMENT_URL_ATTR_RE.exec(tag)
    if (!urlMatch || decodeHtmlAmp(urlMatch[1]) !== url) continue
    const nameMatch = ATTACHMENT_FILENAME_ATTR_RE.exec(tag)
    return nameMatch ? nameMatch[1] : ''
  }
  return ''
}

function stripMediaReferences(html, urlsToRemove) {
  if (!html || urlsToRemove.size === 0) return html
  const stripped = html.replace(ATTACHMENT_TAG_RE, (tag) => {
    const match = ATTACHMENT_URL_ATTR_RE.exec(tag)
    if (!match) return tag
    return urlsToRemove.has(decodeHtmlAmp(match[1])) ? '' : tag
  })
  return stripped.replace(/<figure[^>]*>\s*<\/figure>/g, '')
}

function noop() {}

// Past contiguousLength a non-indexer's view holds its unconfirmed changes, which
// are local but not counted as contiguous. Only blocks has() denies are missing.
async function countMissingBlocks(core) {
  let missing = 0
  for (let i = core.contiguousLength; i < core.length; i++) {
    if (!(await core.has(i))) missing++
  }
  return missing
}

// The 32-byte secret that wraps the vault key at rest. Strict on purpose: a
// short or malformed value must be treated as "no entropy" rather than silently
// producing a weak wrapper, because `blind-encryption-sodium` would reject it
// at encrypt time and take the whole base open down with it.
function decodeEntropy(value) {
  if (!value || typeof value !== 'string' || value.length !== 64) return null
  if (!/^[0-9a-fA-F]{64}$/.test(value)) return null
  try {
    const buf = b4a.from(value, 'hex')
    return buf.byteLength === 32 ? buf : null
  } catch {
    return null
  }
}

function hexOrNull(value) {
  if (!value) return null
  try {
    return b4a.toString(value, 'hex')
  } catch {
    return null
  }
}

// 32 raw bytes, hex encoded. b4a.from is lenient - it happily decodes a short
// or non-hex string into a truncated buffer - so the length is checked after.
function decodeWriterKey(value) {
  if (typeof value !== 'string' || value.length !== 64) return null
  if (!/^[0-9a-fA-F]{64}$/.test(value)) return null
  try {
    const buf = b4a.from(value, 'hex')
    return buf.byteLength === 32 ? buf : null
  } catch {
    return null
  }
}

function numberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function boolOrNull(value) {
  return typeof value === 'boolean' ? value : null
}

function insertedMetadata() {
  return { insertedAt: Date.now() }
}

// Every code hypercore/hyperbee can raise. None of them is a function of a
// node's CONTENT - they are storage, replication, session and proof failures,
// so whether one happens is a property of THIS device at THIS moment.
//
// That distinction is the whole safety rule for apply. Autobase replays the
// same log on every device and indexers sign the resulting view, so a node may
// only be skipped when every device would skip it for the same reason. A
// deterministic failure (bad data in the node itself) reproduces everywhere and
// is safe to skip. One of these is not: skipping it here and applying it on the
// next device forks the view, and the write is lost on this one for good.
const INFRASTRUCTURE_ERROR_CODES = new Set([
  'BAD_ARGUMENT',
  'BATCH_ALREADY_EXISTS',
  'BATCH_ALREADY_FLUSHED',
  'BATCH_UNFLUSHED',
  'BLOCK_NOT_AVAILABLE',
  'DECODING_ERROR',
  'INVALID_CAPABILITY',
  'INVALID_CHECKSUM',
  'INVALID_OPERATION',
  'INVALID_OPLOG_VERSION',
  'INVALID_PROOF',
  'INVALID_SIGNATURE',
  'OPLOG_CORRUPT',
  'OPLOG_HEADER_OVERFLOW',
  'REQUEST_CANCELLED',
  'REQUEST_TIMEOUT',
  'SESSION_CLOSED',
  'SESSION_MOVED',
  'SESSION_NOT_WRITABLE',
  'SNAPSHOT_NOT_AVAILABLE',
  'STORAGE_CONFLICT',
  'STORAGE_EMPTY',
  'WRITE_FAILED'
])

function isInfrastructureError(err) {
  return !!err && INFRASTRUCTURE_ERROR_CODES.has(err.code)
}

const DATA_TYPES = {
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
  LOG_EVENT: 'log_event',
  PRUNE_ACTIVITY: 'prune_activity',
  CLEAR_ACTIVITY: 'clear_activity',
  PRUNE_MEDIA_TOMBSTONES: 'prune_media_tombstones',
  ADD_ENCRYPTED_MEDIA_CORE: 'add_encrypted_media_core'
}
// Domain separation, so the blob cores never share key material with the
// autobase cores even though both are derived from the one vault key every
// device already has. No distribution problem: pairing hands over the vault key
// and every device computes the same media key from it.
const MEDIA_ENCRYPTION_NAMESPACE = 'pear-notes:media-encryption:v1'
const ENCRYPTED_CORE_REFRESH_MS = 500
const RECOVERED_WRITE_SEPARATOR = '<hr>'
const ACTIVITY_SWEEP_STARTUP_DELAY_MS = 20000
const ACTIVITY_SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000
const PAIRING_TIMEOUT_MS = 180000
let defaultSwarmBootstrap = null
const PAIRING_REPLICATION_TIMEOUT_MS = 5000
const BASE_ERROR_RECOVERY_LIMIT = 3
const BASE_ERROR_RECOVERY_WINDOW_MS = 5 * 60 * 1000
const PAIRING_NOT_REPLICATED = 'pairing_not_replicated'
const SWARM_RETRY_BASE_MS = 5000
const SWARM_RETRY_MAX_MS = 60000
const SWARM_HEALTH_CHECK_MS = 120000
const SERVER_SOCKET_CLOSE_TIMEOUT_MS = 2000
const LIFECYCLE_SETTLE_TIMEOUT_MS = 5000
const SUSPEND_DEADLINE_MS = 3000
const UPLOAD_STALE_MS = 10000
const DOWNLOAD_STALL_MS = 20000
const ACTIVITY_SLOW_RECORD_MS = 1000
const APPLY_STUCK_MS = 3000
// A Hyperbee write walks the B-tree, and every internal node it touches is a
// `core.get()`. Hypercore has NO deadline by default (`this.timeout = opts.timeout
// || 0`), so a get for a block this device does not hold waits on a peer forever -
// and it does so INSIDE apply, which wedges linearization and every read and write
// behind it. Measured in the field: apply stuck on `write:put-note-index` while the
// append burned its whole budget and the local writer was left stranded.
//
// A deadline converts that into a rejected get: the activity write fails, apply
// catches it and RETURNS, autobase reaches `_flushLocalHeads`, the writer stays
// healthy, and the note body - written earlier in the same apply - still lands.
// Must stay below APPEND_TIMEOUT_MS so apply can fail and return inside the append
// budget.
// Never `notebase`: that core holds a legacy vault's Hyperbee view.
const VIEW_CORE_NAME = 'notebase-db'
const VIEW_FORMAT_FILE = 'VIEW_FORMAT'
const VIEW_FORMAT = { view: 'hyperdb', version: 1 }
const VIEW_GET_TIMEOUT_MS = 5000
// Never enable this without reading `_applyFastForwardPolicy`. A fast-forward
// leaves the view core with one block out of `length`, and a Hyperbee put has
// to read the rest.
const VIEW_FAST_FORWARD_ENABLED = false
const VIEW_BACKFILL_DELAY_MS = 4000
const VIEW_BACKFILL_RETRY_MS = 10000
// How long one backfill pass waits for its download. The blocks may simply not
// be available from any connected peer; past this the pass gives up, releases
// `_viewBackfilling`, and schedules another attempt.
const VIEW_BACKFILL_WAIT_MS = 60000
// How long recovery waits for a view backfill before reopening anyway. The
// download keeps running in the background either way.
const VIEW_BACKFILL_RECOVERY_BUDGET_MS = 15000
const APPEND_LINEARIZE_WAIT_MS = 5000
const APPEND_TIMEOUT_MS = 10000
// How often an over-budget append re-checks the local writer. A healthy append
// is briefly indistinguishable from a wedged one, so this only starts counting
// once the append has already blown APPEND_TIMEOUT_MS - see
// `_waitForWedgedWriter`.
const WRITER_WEDGE_PROBE_MS = 2000
const APPEND_VIEW_UPDATE_TIMEOUT_MS = 5000
const CLOSE_SETTLE_WAIT_MS = 5000
const TRANSFER_TICK_MS = 1000
const LEAVE_CLUSTER_TIMEOUT_MS = 10000
const LEAVE_CLUSTER_POLL_MS = 250
const MAX_ACTIVE_BLOB_DOWNLOADS = 4
const EAGER_BLOB_DEBOUNCE_MS = 2000
const MEDIA_TOMBSTONE_DEBOUNCE_MS = 2000
const MEDIA_RETENTION_MS = 7 * 24 * 60 * 60 * 1000
// Long after retention every device has freed the bytes (and a device that was
// offline frees its own unreferenced files at startup), so the tombstone itself
// is dropped instead of being rescanned forever.
const MEDIA_TOMBSTONE_PRUNE_AGE_MS = 30 * 24 * 60 * 60 * 1000
// A freshly uploaded file is not in the saved note until the editor inserts the
// link and the note save lands, which can straddle a backgrounded app or a base
// reopen. Unreferenced files younger than this are never treated as orphans.
const ORPHAN_MEDIA_GRACE_MS = 24 * 60 * 60 * 1000
const MEDIA_HEALTH_CHECK_DEBOUNCE_MS = 30 * 1000
const MEDIA_RELINK_DEBOUNCE_MS = 2000
const MEDIA_REBUILD_MIN_INTERVAL_MS = 24 * 60 * 60 * 1000
const MEDIA_RETENTION_RECHECK_MIN_MS = 60 * 1000
const MEDIA_RETENTION_RECHECK_MAX_MS = 6 * 60 * 60 * 1000
const EAGER_BLOB_MIN_INTERVAL_MS = 30000
const BLOB_GC_POLICY_FORCE = 1
const BLOB_GC_AGE_CUTOFF_ALL = 1
const BOTTOMMOST_LEVEL_COMPACTION_FORCE = 2
const THOROUGH_COMPACTION_OPTS = {
  blobGarbageCollectionPolicy: BLOB_GC_POLICY_FORCE,
  blobGarbageCollectionAgeCutoff: BLOB_GC_AGE_CUTOFF_ALL,
  bottommostLevelCompaction: BOTTOMMOST_LEVEL_COMPACTION_FORCE
}
const COMPACTION_SPACE_AMP_RATIO = 1.5
const COMPACTION_MIN_EXCESS_BYTES = 256 * 1024 * 1024
const PAIRING_CANDIDATE_DIR = 'core-pairing-candidate'
const PAIRING_OLD_DIR = 'core-pairing-old'
const PAIRING_UNMERGED_DIR = 'core-unmerged-backup'
const PAIRING_MERGE_BACKUP_FILE = 'pairing-merge.pnbk'

// LEGACY(hyperdb-migration): through preserveLegacyVault, see plan section 8
const VAULT_STORE_DIRS = ['core', PAIRING_CANDIDATE_DIR, PAIRING_OLD_DIR, PAIRING_UNMERGED_DIR]
const VAULT_SIDECAR_FILES = [PAIRING_MERGE_BACKUP_FILE, 'media-store.json']
const PRESERVED_LEGACY_DIR = 'pre-hyperdb'

function legacyVaultError() {
  return Object.assign(
    new Error(
      'this vault was written by a version of Pear Notes before the HyperDB view; ' +
        'export it with that version and import the backup here'
    ),
    { code: 'LEGACY_VAULT' }
  )
}

function storeHoldsData(dir) {
  return fs.existsSync(barePath.join(dir, 'db')) || fs.existsSync(barePath.join(dir, 'CORESTORE'))
}

function storeIsLabelled(dir) {
  return fs.existsSync(barePath.join(dir, VIEW_FORMAT_FILE))
}

export function findLegacyStores(storage) {
  // A labelled core means any pairing leftovers beside it were made by this build.
  if (storeIsLabelled(barePath.join(storage, 'core'))) return []
  return VAULT_STORE_DIRS.map((name) => barePath.join(storage, name)).filter(
    (dir) => storeHoldsData(dir) && !storeIsLabelled(dir)
  )
}

export function preserveLegacyVault(storage) {
  if (findLegacyStores(storage).length === 0) return { done: false, reason: 'NOT_LEGACY' }

  const items = [...VAULT_SIDECAR_FILES, ...VAULT_STORE_DIRS].filter((name) =>
    fs.existsSync(barePath.join(storage, name))
  )
  let dest = barePath.join(storage, PRESERVED_LEGACY_DIR)
  for (let n = 2; items.some((name) => fs.existsSync(barePath.join(dest, name))); n++) {
    dest = barePath.join(storage, `${PRESERVED_LEGACY_DIR}-${n}`)
  }
  fs.mkdirSync(dest, { recursive: true })
  // `core` last, so a crash midway still leaves the vault reading as legacy.
  const order = [...items.filter((name) => name !== 'core'), ...items.filter((n) => n === 'core')]
  for (const name of order) {
    fs.renameSync(barePath.join(storage, name), barePath.join(dest, name))
  }
  return { done: true, preservedPath: dest }
}

const TRASH_SWEEP_STARTUP_DELAY_MS = 5000
const TRASH_SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000

const isInviteExpired = (invite) => !!invite?.expires && inviteExpired(invite.expires)

const isInviteLongExpired = (invite) => !!invite?.expires && inviteLongExpired(invite.expires)

const YJS_EXTENSION_NAME = 'pear-notes-yjs'
const yjsMessageEncoding = {
  preencode(state, m) {
    cenc.string.preencode(state, m.noteId)
    cenc.buffer.preencode(state, m.data)
  },
  encode(state, m) {
    cenc.string.encode(state, m.noteId)
    cenc.buffer.encode(state, m.data)
  },
  decode(state) {
    return {
      noteId: cenc.string.decode(state),
      data: cenc.buffer.decode(state)
    }
  }
}

// function cas(prev, next) {
//   log.debug({ prev: prev.key, next: next.key })
//   return prev.key !== next.key
// }

class NoteBase extends ReadyResource {
  constructor({ storage, encryption, entropy = null, bootstrap = null }, remoteKey) {
    super()
    this.path = storage
    this.encryption = encryption
    // Optional. Without it the vault key is written to the corestore in the
    // clear (`autobase/encryption` on BOTH the local and the bootstrap core -
    // see `lib/boot.js`), which means the blocks are encrypted and the key to
    // them sits in the same directory. With it, autobase stores the key sealed
    // under `autobase/blind-encryption` instead and the storage directory alone
    // is useless. The entropy itself never touches disk here - it comes from
    // the platform keychain on every open.
    this._blindEntropy = decodeEntropy(entropy)
    this.swarmBootstrap = bootstrap || defaultSwarmBootstrap
    let encKey = encryption ? b4a.from(encryption) : b4a.alloc(0)
    if (encryption && encKey.length === 64) {
      try {
        const hexBuf = b4a.from(encryption, 'hex')
        if (hexBuf.length === 32) encKey = hexBuf
      } catch (e) {
        log.error('NoteBase initBase error', e)
      }
    }
    this.encryptionKey = encKey
    this.corePath = barePath.join(storage, 'core')
    this.remoteKey = remoteKey
    this.swarm = null
    this.discovery = null
    this.corestore = null
    this.autobase = null
    this.hyperdrive = null
    this.blobServer = null
    this.localKey = null
    this._linearizing = null
    this._baseGeneration = 0
    this._pendingConfirm = null
    this._pendingCandidate = null
    this._pairingClaim = null
    this._pairingMember = null
    this._pairingCb = null
    this._lastPairingStatus = null
    this._pairingInFlight = false
    this._recoveringBase = false
    this._recovery = null
    this._baseFailedDuringRecovery = false
    this._readOnly = false
    this._shutDown = false
    this._shutdownRequested = new Promise((resolve) => {
      this._resolveShutdown = resolve
    })
    this._baseErrorRecoveries = 0
    this._lastBaseErrorAt = 0
    this._appendChain = Promise.resolve()
    this._recoveringInsideAppend = false
    this._viewBackfillTimer = null
    this._viewBackfilling = false
    this._lastViewBackfill = null
    this._lastFastForward = null
    this._autobaseWarnings = 0
    this._encryptedMediaCores = new Set()
    this._pendingEncryptedCoreAnnounce = null
    this._mediaEncryptionKeyCache = null
    this._encryptedCoreRefreshTimer = null
    this._eagerBlobTimer = null
    this._mediaTombstoneTimer = null
    this._mediaRetentionTimer = null
    this._mediaStore = emptyMediaStoreState()
    this._mediaStoreOwned = false
    this._mediaDriveUnbind = null
    this._mediaHealthTimer = null
    this._mediaRelinkTimer = null
    this._mediaRebuild = null
    this._mediaRebuilding = false
    this._mediaWriteGate = null
    this._activeMediaWrites = 0
    this._lastMediaHealth = null
    this._provenMediaScanKey = null
    this._trashSweepTimer = null
    this._activitySweepTimer = null
    this._lastBlobScanAt = 0
    this._mediaSyncHeld = false
    this._swarmRetryTimer = null
    this._swarmHealthCheckTimer = null
    this._swarmRetryDelay = SWARM_RETRY_BASE_MS
    this._yjsListeners = new Map()
    this._downloadRegistry = new Map()
    this._activeDownloadKeys = new Set()
    this._pendingDownloadKeys = []
    this._downloadCores = new Map()
    this._uploadRegistry = new Map()
    this._localBlobRangeIndex = []
    this._refreshingBlobIndex = false
    this._blobIndexRefreshPending = false
    this._connectedSwarmKeys = new Set()
    this._swarmKeyHex = null
    this._downloadTicker = null
    this._rejectedPairingKeys = new Set()
    this._leavingCluster = false
    this._localKeyHex = ''
    this._remoteNodesApplied = 0
    this._suspended = false
    this._suspending = null
    this._resuming = null
    this._applyNodesDuringBoot = 0
    this._applyBatchesDuringBoot = 0
    this._indexerKeysSnapshot = null
    this._lastKnownIndexerKeys = null
  }

  async _open() {
    backendBoot.mark('_open: entered')
    // LEGACY(hyperdb-migration): must run before _recoverPairingState moves store dirs
    if (findLegacyStores(this.path).length > 0) throw legacyVaultError()
    this._recoverPairingState()
    this._removePairingMergeBackup()
    backendBoot.mark('_open: pairing state recovered')
    await this.initBase()
    backendBoot.mark('_open: initBase returned')
    this._scheduleTrashSweep(TRASH_SWEEP_STARTUP_DELAY_MS)
    this._scheduleActivitySweep(ACTIVITY_SWEEP_STARTUP_DELAY_MS)
  }

  // A Hyperbee write walks the B-tree and every internal node it touches is a
  // `core.get()`. A get for a block this device does not hold goes to the
  // replicator, so on a view core with gaps a `put` whose traversal reaches a
  // missing block stalls until VIEW_GET_TIMEOUT_MS and then fails. Confirmed in
  // the field: REQUEST_TIMEOUT out of hypercore's replicator, every edit.
  //
  // Autobase leaves gaps legitimately - `fastForward` is on unless the host
  // passes `fastForward: false`, and a fast-forward adopts a signed view rather
  // than replaying it, so only the blocks that were read are local.
  //
  // Best-effort and never blocks boot. It must be scheduled, not called inline
  // after initBase: `autobase.view` does not exist until the first linearization,
  // so an immediate call silently found no core and did nothing.
  _scheduleViewBackfill(delay = VIEW_BACKFILL_DELAY_MS) {
    if (this._viewBackfilling || this.isClosing) return
    const due = Date.now() + delay
    if (this._viewBackfillTimer) {
      if (due >= this._viewBackfillDue) return
      clearTimeout(this._viewBackfillTimer)
    }
    this._viewBackfillDue = due
    this._viewBackfillTimer = setTimeout(() => {
      this._viewBackfillTimer = null
      this._fillViewCoreGaps().catch((e) => log.error('[view] backfill failed', e?.message || e))
    }, delay)
    if (this._viewBackfillTimer.unref) this._viewBackfillTimer.unref()
  }

  _recordViewBackfill(result, core) {
    this._lastViewBackfill = {
      at: Date.now(),
      result,
      length: core.length,
      contiguousLength: core.contiguousLength
    }
  }

  async _fillViewCoreGaps() {
    if (this._viewBackfilling || this.isClosing) return
    this._viewBackfilling = true
    let retry = false
    try {
      const db = await this.autobaseDb()
      const core = db?.core
      if (!core) {
        // No base at all means closed or closing - there is nothing to come
        // back for, and rescheduling would retry (and log) forever.
        if (!this.autobase || this.isClosing) return
        log.debug('[view] backfill: no view core yet, retrying')
        this._viewBackfilling = false
        this._scheduleViewBackfill(VIEW_BACKFILL_RETRY_MS)
        return
      }
      await core.ready()
      const { length, contiguousLength } = core
      if (!length || (await countMissingBlocks(core)) === 0) {
        log.debug('[view] backfill: nothing to do', { length, contiguousLength })
        this._recordViewBackfill('complete', core)
        return
      }

      log.error('[view] core has gaps, backfilling', {
        length,
        contiguousLength,
        peers: core.peers?.length ?? 0
      })
      // Bounded. `done()` only settles once every block has arrived, so with
      // no peer holding them it never did, and `_viewBackfilling` stayed true
      // for the life of the base - turning every later backfill, including
      // the one base-error recovery runs, into a silent no-op.
      const range = core.download({ start: 0, end: length })
      const done = range.done().then(() => false)
      done.catch(noop)
      let timer = null
      const gaveUp = new Promise((resolve) => {
        timer = setTimeout(() => resolve(true), VIEW_BACKFILL_WAIT_MS)
      })
      let timedOut
      try {
        timedOut = await Promise.race([done, gaveUp])
      } finally {
        clearTimeout(timer)
      }
      if (timedOut) {
        range.destroy()
        retry = true
        this._recordViewBackfill('timed-out', core)
        log.error('[view] backfill did not finish, retrying later', {
          length: core.length,
          contiguousLength: core.contiguousLength,
          peers: core.peers?.length ?? 0
        })
        return
      }
      log.error('[view] backfill finished', {
        length: core.length,
        contiguousLength: core.contiguousLength
      })
      this._recordViewBackfill('filled', core)
      // The view can grow new gaps while a download runs (a fast-forward mid-backfill).
      if (core.contiguousLength < core.length) retry = true
    } finally {
      this._viewBackfilling = false
      if (retry) this._scheduleViewBackfill(VIEW_BACKFILL_RETRY_MS)
    }
  }

  async _close() {
    this.isClosing = true
    await this._closePairingMember()
    if (this._eagerBlobTimer) {
      clearTimeout(this._eagerBlobTimer)
      this._eagerBlobTimer = null
    }
    if (this._mediaTombstoneTimer) {
      clearTimeout(this._mediaTombstoneTimer)
      this._mediaTombstoneTimer = null
    }
    if (this._mediaRetentionTimer) {
      clearTimeout(this._mediaRetentionTimer)
      this._mediaRetentionTimer = null
    }
    if (this._trashSweepTimer) {
      clearTimeout(this._trashSweepTimer)
      this._trashSweepTimer = null
    }
    if (this._activitySweepTimer) {
      clearTimeout(this._activitySweepTimer)
      this._activitySweepTimer = null
    }
    if (this._viewBackfillTimer) {
      clearTimeout(this._viewBackfillTimer)
      this._viewBackfillTimer = null
    }
    if (this._encryptedCoreRefreshTimer) {
      clearTimeout(this._encryptedCoreRefreshTimer)
      this._encryptedCoreRefreshTimer = null
    }
    if (this._swarmRetryTimer) {
      clearTimeout(this._swarmRetryTimer)
      this._swarmRetryTimer = null
    }
    if (this._swarmHealthCheckTimer) {
      clearTimeout(this._swarmHealthCheckTimer)
      this._swarmHealthCheckTimer = null
    }
    if (this._downloadTicker) {
      clearInterval(this._downloadTicker)
      this._downloadTicker = null
    }
    clearTimeout(this._mediaHealthTimer)
    this._mediaHealthTimer = null
    clearTimeout(this._mediaRelinkTimer)
    this._mediaRelinkTimer = null
    if (this._mediaDriveUnbind) this._mediaDriveUnbind()
    this._mediaDriveUnbind = null
    this._connectedSwarmKeys.clear()
    for (const { core } of this._downloadCores.values()) {
      await core.close().catch(() => {})
    }
    this._downloadCores.clear()
    this._downloadRegistry.clear()
    this._activeDownloadKeys.clear()
    this._pendingDownloadKeys = []
    for (const entry of this._uploadRegistry.values()) {
      clearTimeout(entry.staleTimer)
    }
    this._uploadRegistry.clear()
    if (this.blobServer) await this.blobServer.close()
    if (this.swarm) {
      try {
        await this.swarm.destroy()
      } catch (err) {
        log.error('[_close] swarm destroy failed', err)
      }
    }
    if (this.autobase) {
      // Closing autobase under an in-flight flush aborts Bare (hypercore null atom).
      if (!this.autobase.closing && !this._recoveringInsideAppend) {
        await this._withDeadline(
          Promise.all([this._appendChain, this._linearizing, this.autobase.update()]),
          CLOSE_SETTLE_WAIT_MS,
          'close waiting on in-flight writes'
        )
      }
      await this.autobase.close()
    }
    if (this.corestore) await this.corestore.close()

    this.blobServer = null
    this.swarm = null
    this.discovery = null
    this.autobase = null
    this.corestore = null
    this._linearizing = null
    this.isClosing = false
  }

  // Deliberately NOT `Autobase.getLocalCore`: that opens the core with
  // `exclusive: true`, and taking an exclusive lock on the local core moments
  // before autobase opens its own left a Writer asserting on `core.opened`
  // later in the run. We only need to read one user-data key, so open the same
  // core the plain way and close it again.
  async _readSealedVaultKey() {
    let core = null
    try {
      core = this.corestore.get({ name: 'local', active: false })
      await core.ready()
      return (await core.getUserData('autobase/blind-encryption')) || null
    } catch {
      return null
    } finally {
      if (core) await core.close().catch(() => {})
    }
  }

  // LEGACY(hyperdb-migration): see docs/HYPERDB-VIEW-MIGRATION-PLAN-2026-09-23.md section 8
  _refuseLegacyVault(corePath) {
    if (storeIsLabelled(corePath) || !storeHoldsData(corePath)) return

    throw legacyVaultError()
  }

  _labelViewFormat(corePath) {
    const marker = barePath.join(corePath, VIEW_FORMAT_FILE)
    if (fs.existsSync(marker)) return
    fs.writeFileSync(marker, JSON.stringify(VIEW_FORMAT))
  }

  // Answered BEFORE `new Autobase`, deliberately. Autobase's constructor starts
  // its own `ready()`, and a boot that cannot open the sealed key rejects a
  // promise we do not own - a null dereference in `lib/boot.js` with no
  // entropy, 'failed to rotate' with the wrong one - so neither is reliably
  // catchable from out here. Checking first means we never construct a base we
  // know cannot open.
  async _canOpenVaultKey() {
    const sealed = await this._readSealedVaultKey()
    if (!sealed) return true
    if (!this._blindEntropy) return false
    try {
      const blind = new BlindEncryptionSodium(this._blindEntropy)
      await encryptionEncoding.decrypt(sealed, blind.decrypt)
      return true
    } catch {
      return false
    }
  }

  // autobase seals the key and clears the LOCAL plaintext copy on boot, but it
  // never touches the one it wrote to the bootstrap core for legacy readers
  // (`lib/boot.js`: `result.bootstrap.setUserData('autobase/encryption', ...)`).
  // Leaving that behind would make the whole exercise pointless, so clear it
  // once the sealed copy is definitely in place.
  async _sealVaultKeyAtRest() {
    if (!this._blindEntropy || !this.autobase) return
    try {
      const local = this.autobase.local
      if (!local || !(await local.getUserData('autobase/blind-encryption'))) return
      for (const core of [local, this.autobase._primaryBootstrap]) {
        if (!core) continue
        if (!(await core.getUserData('autobase/encryption'))) continue
        await core.setUserData('autobase/encryption', null)
        log.debug('[encryption] cleared a plaintext vault key left on disk')
      }
    } catch (err) {
      // Best effort. A device that cannot clear the old copy is no worse off
      // than before this change, and failing the open would be far worse.
      log.error('[encryption] could not clear the plaintext vault key', err)
    }
  }

  _adoptVaultEncryptionKey() {
    const vaultKey = this.autobase?.encryptionKey
    if (!vaultKey) return
    const vaultKeyHex = b4a.toString(vaultKey, 'hex')
    if (vaultKeyHex === this.encryption) return
    log.debug('[NoteBase] Adopting vault encryption key from storage')
    this.encryption = vaultKeyHex
    this.encryptionKey = vaultKey
    this.emit('encryption-key', vaultKeyHex)
  }

  async initBase(key, primaryKey, corePath = this.corePath) {
    // Decided BEFORE anything is opened. A store directory that does not exist
    // yet can only produce a brand-new media drive, so that drive can be opened
    // encrypted on its very first open - no opening it plain, discovering it is
    // empty, then closing and reopening it with a key. That close/reopen is
    // what collided with pairing, which is itself tearing the store down and
    // rebuilding it.
    //
    // It is also how autopass works: `Autopass.pair(new Corestore(dir), ...)`
    // always hands the joiner a fresh directory, so its store is encrypted from
    // birth and never has to be converted in place.
    const freshStore = !fs.existsSync(corePath)

    // LEGACY(hyperdb-migration): see docs/HYPERDB-VIEW-MIGRATION-PLAN-2026-09-23.md section 8
    this._refuseLegacyVault(corePath)

    this.corestore = new Corestore(corePath, primaryKey ? { primaryKey, unsafe: true } : undefined)
    // Label only after ready(): hypercore-storage moves unknown root files into db/ on first open.
    await this.corestore.ready()
    this._labelViewFormat(corePath)

    // Before `new Autobase`, not after. Its constructor starts its own
    // `ready()` guarded by `safetyCatch`, and reading a sealed key with no
    // entropy dereferences null inside `lib/boot.js` - safetyCatch re-throws a
    // TypeError as an uncaught exception, which no try/catch of ours can see.
    if (!(await this._canOpenVaultKey())) {
      const sealed = new Error(
        this._blindEntropy
          ? 'vault key is sealed and the device entropy does not open it'
          : 'vault key is sealed and the device entropy is missing'
      )
      sealed.code = 'VAULT_KEY_SEALED'
      throw sealed
    }

    this.autobase = new Autobase(this.corestore, key || this.corestore.key, {
      encrypt: true,
      encryptionKey: this.encryptionKey,
      // null when the frontend supplied no entropy, which autobase reads as
      // "store the key in the clear" - the legacy behaviour, kept so an app
      // that has not been updated still opens its vault.
      blindEncryption: this._blindEntropy ? new BlindEncryptionSodium(this._blindEntropy) : null,
      valueEncoding: 'json',
      apply: this.apply.bind(this),
      open: this.open,
      optimistic: true,
      // Off, and `_applyFastForwardPolicy` keeps it off for the life of the
      // base. A fast-forward adopts a peer's signed view without replaying it,
      // which leaves the view core sparse and every later Hyperbee write
      // reaching for blocks no device in a small private fleet still holds.
      // See `_applyFastForwardPolicy`.
      fastForward: VIEW_FAST_FORWARD_ENABLED
    })
    // Read-only safe mode (see `_enterReadOnlyMode`): stop autobase before its
    // first bump, so `apply` never runs and the node it cannot get past stays
    // unapplied. `open` still runs, so the view it already has is readable.
    if (this._readOnly) this.autobase.pause()

    const yjsOnMessage = (msg) => {
      if (!msg || !msg.noteId) return
      const listeners = this._yjsListeners.get(msg.noteId)
      if (listeners) {
        for (const listener of listeners) listener(msg.data)
      }
    }

    if (COLLABORATION_ENABLED) {
      this.corestore.watch((core) => {
        if (core.key && this.autobase.local && b4a.equals(core.key, this.autobase.local.key)) return
        const session = new Hypercore({ core, weak: true })
        session.registerExtension(YJS_EXTENSION_NAME, {
          encoding: yjsMessageEncoding,
          onmessage: yjsOnMessage
        })
      })
    }

    this._mediaStoreOwned = corePath === this.corePath
    this._mediaStore = this._mediaStoreOwned
      ? readMediaStoreState(this.path)
      : emptyMediaStoreState()
    backendBoot.mark('initBase: constructed')
    await this.corestore.ready()
    backendBoot.mark('initBase: corestore.ready')
    await this.autobase.ready()
    backendBoot.mark('initBase: autobase.ready')
    this._adoptVaultEncryptionKey()
    await this._sealVaultKeyAtRest()

    // The media drive is opened AFTER the vault key is settled, because its
    // encryption key is derived from that key and `_adoptVaultEncryptionKey`
    // can replace the one the frontend supplied with the one on disk
    // (the on-disk key is authoritative). Hyperdrive reads `encryptionKey` in
    // its constructor, so building the drive any earlier would bake in the
    // wrong one.
    const wantsEncryptedMedia = this._mediaStore.encrypted || freshStore
    const mediaEncryptionKey = wantsEncryptedMedia ? this._mediaEncryptionKey() : null
    // Always this device's own drive. A `driveKey` parameter used to open some
    // other drive here, but nothing passed one, it never received the media
    // key, and `_readyMediaDrive`'s retry silently swapped it for this one.
    this.hyperdrive = openMediaDrive(
      this.corestore,
      this._mediaStore.generation,
      mediaEncryptionKey
    )

    // A session, not the main store: hypercore-blob-server closes the store it is given.
    this.blobServer = new BlobServer(this.corestore.session(), {
      token: null,
      resolve: this._resolveBlobCore.bind(this)
    })

    await this._readyMediaDrive(mediaEncryptionKey)
    backendBoot.mark('initBase: hyperdrive.ready')
    this._recordMediaEncryptionState()
    await this.blobServer.listen()
    backendBoot.mark('initBase: blobServer.listen')

    if (COLLABORATION_ENABLED) {
      this.yjsExtension = this.autobase.local.registerExtension(YJS_EXTENSION_NAME, {
        encoding: yjsMessageEncoding,
        onmessage: yjsOnMessage
      })
    }

    this._adoptMediaStoreState()
    this._bindMediaDrive()
    this._refreshLocalBlobRangeIndex().then(() =>
      backendBoot.mark('startup: blob range index built')
    )

    this.localKey = this.autobase.local.key
    this._localKeyHex = b4a.toString(this.localKey, 'hex')
    log.debug(
      '[NoteBase] ready autobase=%s local=%s drive=%s blob=%s',
      log.redact(this.autobase.key),
      log.redact(this.localKey),
      log.redact(this.hyperdrive.key),
      log.redact(this.hyperdrive.blobs.core.key)
    )
    log.debug('[NoteBase] hyperdrive server listening')

    this.autobase.on('error', (err) => {
      log.error('[NoteBase] Autobase error', err)
      this.emit('base-error', err)
      this._recoverFromBaseError().catch((recoverError) =>
        log.error('[NoteBase] Recovery after an autobase error failed', recoverError)
      )
    })

    this.autobase.on('warning', (err) => {
      this._autobaseWarnings++
      log.warn('[autobase] warning', err)
    })

    // A forced fast-forward ignores `fastForward: false` (autobase `_drain`, when
    // boot catchup fails) and leaves the view sparse, so repair it right away.
    this.autobase.on('fast-forward', (to, from) => {
      this._lastFastForward = { at: Date.now(), to, from }
      log.error('[autobase] fast-forwarded the view', { from, to })
      this._scheduleViewBackfill(0)
    })

    this.autobase.on('is-indexer', () => log.warn('[autobase] this device became a sync leader'))
    this.autobase.on('is-non-indexer', () =>
      log.warn('[autobase] this device stopped being a sync leader')
    )

    this.autobase.on('update', () => {
      log.debug('Autobase update detected')
      this._emitSyncActivity()
      this._emitIndexerChange()
      this._scheduleEagerBlobDownload()
      this._scheduleMediaTombstoneSweep()
      this._scheduleMediaRelink()
      this._scheduleEncryptedMediaCoreRefresh()
    })

    // A joiner's blob core is encrypted from birth but cannot be announced
    // until pairing makes this device a writer. This is that moment.
    this.autobase.on('writable', () => {
      const pending = this._pendingEncryptedCoreAnnounce
      if (!pending) return
      this._pendingEncryptedCoreAnnounce = null
      this._announceEncryptedMediaCore(pending).catch((e) =>
        log.error('[media] could not publish the encrypted blob core after becoming writable', e)
      )
    })

    this.autobase.on('unwritable', async () => {
      log.debug('Autobase unwritable detected')
      if (this._leavingCluster) {
        log.debug('[leaveSyncCluster] unwritable is self-inflicted, not reporting removal')
        return
      }
      this.emit('device-removed')
    })

    const backlog = this.autobase.length - this.autobase.indexedLength
    backendBoot.mark(
      `initBase: linearizing in background, length=${this.autobase.length} indexed=${this.autobase.indexedLength} backlog=${backlog}`
    )
    const nodesBefore = this._applyNodesDuringBoot
    const batchesBefore = this._applyBatchesDuringBoot
    this._linearizing = this._readOnly
      ? null
      : this.autobase
          .update()
          .then(() => {
            backendBoot.mark(
              `initBase: linearized, applied ${this._applyNodesDuringBoot - nodesBefore} nodes in ${this._applyBatchesDuringBoot - batchesBefore} batches`
            )
            this.emit('linearized')
          })
          .catch((err) => {
            log.error('[initBase] background linearization failed', err)
          })
          .finally(() => {
            this._linearizing = null
            this._downloadExternalBlobs()
              .catch((e) => log.error('[startup downloads] scan failed', e.message))
              .finally(() => {
                backendBoot.mark('startup: external blob scan')
                this._runStartupMediaMaintenance()
              })
            this._scheduleEagerBlobDownload()
          })

    this.startSwarm().catch((err) => log.error('[initBase] startSwarm failed', err))

    // Scheduled here rather than in `_open`, so EVERY way a base is opened gets
    // it - boot, a pairing promotion, and error recovery. It used to be in
    // `_open` alone, which meant a freshly paired device never backfilled until
    // its next app start.
    //
    // Measured: a joiner that replays the whole log still lands on
    // `length 1005 / contiguousLength 1004` and stays there. One tail block,
    // nothing like the 4/2600 of the field failure - but it is enough to make
    // `viewComplete` read false, and that field is the acceptance check for a
    // relink. The backfill closes it in one round trip.
    this._scheduleViewBackfill()

    // Anything watching the previous base (every frontend subscription) is now
    // bound to a closed view and will never fire again, so tell main.js to drop
    // those streams and let the frontend reconnect them against this one.
    this._baseGeneration++
    if (this._baseGeneration > 1) this.emit('base-reopened', this._baseGeneration)
  }

  // Fire-and-forget, so the base it started for can close underneath it - on
  // pairing, recovery, Clear storage, and in almost every test, which opens and
  // closes a base within ~100ms. Each step then fails against a closed core or a
  // missing view. That is harmless (every object it holds belongs to the closed
  // store, and reclaim reads notes strictly, so it aborts rather than clearing),
  // but it logged as an error: 146 stack traces in one suite run, burying the
  // real ones. So it stops at the first step after its base is gone, and a
  // failure caused by that close is logged at debug. Everything reruns on the
  // next open.
  async _runStartupMediaMaintenance() {
    const generation = this._baseGeneration
    const stale = () => this.isClosing || !this.autobase || this._baseGeneration !== generation
    const steps = [
      [
        '[media store] could not read the encrypted core list',
        () => this._loadEncryptedMediaCores()
      ],
      ['[media store] resume failed', () => this._resumeMediaRebuild()],
      [
        '[media store] could not publish the encrypted blob core',
        () => this._publishEncryptedMediaCore()
      ],
      ['[startup reclaim] tombstone sweep', () => this._applyMediaTombstones()],
      ['[startup reclaim]', () => this._reclaimOrphanedBlobsOnStartup()],
      ['[media store] startup maintenance failed', () => this._checkMediaStoreHealth()]
    ]
    for (const [label, step] of steps) {
      if (stale()) {
        log.debug('[media store] startup maintenance stopped: its base closed')
        return
      }
      try {
        await step()
      } catch (e) {
        if (stale()) {
          log.debug(label + ' interrupted by the base closing', e?.code || e?.message)
          return
        }
        log.error(label, e)
        // A failed reclaim must not skip the health check, and the other steps
        // were already independent of each other.
      }
    }
    backendBoot.mark('startup: reclaim sweeps')
  }

  // The live drive is the authority; the flag just records what it is so the
  // next open picks the same answer without having to probe.
  _recordMediaEncryptionState() {
    const encrypted = !!this.hyperdrive?.encryptionKey
    const coreKeyHex = this.hyperdrive?.blobs?.core
      ? b4a.toString(this.hyperdrive.blobs.core.key, 'hex')
      : this._mediaStore.blobCoreKeyHex
    if (
      this._mediaStore.encrypted === encrypted &&
      this._mediaStore.blobCoreKeyHex === coreKeyHex
    ) {
      return
    }
    this._mediaStore = { ...this._mediaStore, encrypted, blobCoreKeyHex: coreKeyHex }
    if (this._mediaStoreOwned) this._saveMediaStoreState()
  }

  // Peers cannot decrypt this device's attachments until they know its blob
  // core is encrypted, and that fact only reaches them through the view.
  async _publishEncryptedMediaCore() {
    if (this.isClosing || !this._mediaStore.encrypted) return
    const core = this.hyperdrive?.blobs?.core
    if (!core) return
    await this._announceEncryptedMediaCore(b4a.toString(core.key, 'hex'))
  }

  // A drive opened the wrong way cannot decode its own Hyperbee header. That is
  // the one reliable signal, it works in both directions, so a record that
  // disagrees with the drive on disk corrects itself here instead of failing
  // the whole open. Needed because a pairing promotion replaces the corestore
  // under a record written by the previous one.
  async _readyMediaDrive(encryptionKey) {
    try {
      await this.hyperdrive.ready()
      return
    } catch (err) {
      if (err?.code !== 'DECODING_ERROR') throw err
      log.debug('[media store] media drive encryption did not match, reopening the other way')
    }
    await this.hyperdrive.close().catch(() => {})
    const retryKey = encryptionKey ? null : this._mediaEncryptionKey()
    this.hyperdrive = openMediaDrive(this.corestore, this._mediaStore.generation, retryKey)
    await this.hyperdrive.ready()
  }

  async _reclaimOrphanedBlobsOnStartup() {
    const count = await this._pruneUnreferencedLocalMedia()
    if (count > 0) log.debug('[startup reclaim] removed', count, 'unreferenced files')
    const { reclaimedBytes } = await this.reclaimOrphanedBlobs()
    if (reclaimedBytes > 0) log.debug('[startup reclaim] freed', reclaimedBytes, 'bytes')
    await this._compactIfStoreBloated()
  }

  _saveMediaStoreState() {
    if (!this._mediaStoreOwned) return
    try {
      writeMediaStoreState(this.path, this._mediaStore)
    } catch (e) {
      log.error('[media store] could not save state', e)
    }
  }

  _adoptMediaStoreState() {
    const blobCoreKeyHex = b4a.toString(this.hyperdrive.blobs.core.key, 'hex')
    const state = this._mediaStore
    if (state.blobCoreKeyHex === blobCoreKeyHex) return
    // A different corestore owns this path now (a first run on this build, a
    // fresh install or a completed pairing), so links and retired drives recorded
    // for another store must not be applied here. A pairing candidate opened on
    // its own path never reaches this with owned state, so an abandoned pairing
    // leaves the real state untouched.
    this._mediaStore = {
      ...emptyMediaStoreState(),
      generation: state.generation,
      // `encrypted` describes how `initBase` ALREADY opened the live drive, so
      // it has to survive this reset. Dropping it made the state lie: the drive
      // on disk was encrypted while the flag said otherwise, so the migration
      // ran a second time and relinked notes against an empty map - leaving
      // freshly paired devices with attachment links pointing at a drive that
      // is no longer the live one.
      encrypted: state.encrypted,
      blobCoreKeyHex
    }
    this._saveMediaStoreState()
  }

  // Other devices' blob cores this device has downloaded from. Reclaim keeps
  // sweeping them until nothing is left locally, even after no note or tombstone
  // names them any more, so their bytes cannot be stranded on disk.
  _rememberExternalCore(coreKeyHex) {
    const known = this._mediaStore.externalCores || []
    if (known.includes(coreKeyHex)) return
    this._mediaStore = { ...this._mediaStore, externalCores: [...known, coreKeyHex] }
    this._saveMediaStoreState()
  }

  _forgetExternalCore(coreKeyHex) {
    const known = this._mediaStore.externalCores || []
    if (!known.includes(coreKeyHex)) return
    this._mediaStore = {
      ...this._mediaStore,
      externalCores: known.filter((key) => key !== coreKeyHex)
    }
    this._saveMediaStoreState()
  }

  // Derived, never stored. Every device already has the vault key (pairing
  // hands it over), so every device computes the same media key without any
  // extra distribution, and a peer outside the vault cannot.
  //
  // The cache remembers which vault key it came from, so it cannot outlive a
  // key change. Pairing and promotion swap the vault key across a close and
  // reopen; this used to stay correct only because `initBase` remembered to
  // clear the cache at the right moment.
  _mediaEncryptionKey() {
    const vaultKey = this.autobase?.encryptionKey || this.encryptionKey
    if (!vaultKey || !vaultKey.byteLength) return null
    const cached = this._mediaEncryptionKeyCache
    if (cached && b4a.equals(cached.vaultKey, vaultKey)) return cached.key
    const key = crypto
      .createHash('sha256')
      .update(b4a.from(MEDIA_ENCRYPTION_NAMESPACE))
      .update(vaultKey)
      .digest()
    this._mediaEncryptionKeyCache = { vaultKey: b4a.from(vaultKey), key }
    return key
  }

  _blobCoreKeyHex(key) {
    if (!key) return ''
    if (b4a.isBuffer(key)) return b4a.toString(key, 'hex')
    if (typeof key !== 'string') return ''
    if (/^[0-9a-f]{64}$/i.test(key)) return key.toLowerCase()
    try {
      return b4a.toString(HypercoreID.decode(key), 'hex')
    } catch {
      return ''
    }
  }

  // Handed to the blob server, which serves every attachment the UI renders.
  // Without it an encrypted blob core would stream ciphertext to the WebView.
  async _resolveBlobCore(key) {
    const hex = this._blobCoreKeyHex(key)
    if (!hex || !this._encryptedMediaCores.has(hex)) return { key, encryptionKey: null }
    const encryptionKey = this._mediaEncryptionKey()
    // The core is known to be encrypted, so no key means we cannot read it -
    // not that it is plaintext. A falsy result makes the blob server answer
    // not-found instead of streaming ciphertext into the WebView as an image.
    if (!encryptionKey) {
      log.error('[media] no media key for an encrypted blob core', { core: log.redact(hex) })
      return null
    }
    return { key, encryptionKey }
  }

  // A peer publishes its encrypted blob core through the view, so this device
  // only learns about it on an update. Without the refresh a freshly paired
  // device would open that core with no encryption key and read ciphertext.
  _scheduleEncryptedMediaCoreRefresh() {
    if (this._encryptedCoreRefreshTimer || this.isClosing) return
    this._encryptedCoreRefreshTimer = setTimeout(() => {
      this._encryptedCoreRefreshTimer = null
      this._loadEncryptedMediaCores().catch((e) =>
        log.error('[media store] could not refresh the encrypted core list', e?.message || e)
      )
    }, ENCRYPTED_CORE_REFRESH_MS)
    if (this._encryptedCoreRefreshTimer.unref) this._encryptedCoreRefreshTimer.unref()
  }

  async _loadEncryptedMediaCores() {
    const db = await this.autobaseDb()
    if (!db) return
    const known = new Set(this._encryptedMediaCores)
    for await (const { key } of viewStore.encryptedMediaCores(db)) known.add(key)
    this._encryptedMediaCores = known
  }

  // Added to the local set first so our own reads work immediately, then
  // written to the view for the other devices. A failed append is recovered on
  // the next boot, which re-announces anything missing from the view.
  async _announceEncryptedMediaCore(coreKeyHex) {
    if (!coreKeyHex) return
    this._encryptedMediaCores.add(coreKeyHex)
    // A device that is not a writer cannot publish anything, and a joiner
    // spends the whole of pairing in exactly that state. Appending regardless
    // threw `Not writable` on every such boot - logged three deep, by
    // `_awaitWithWarning`, by `append`, and here - for a write that was never
    // going to land. Hold it instead; the `writable` handler sends it the
    // moment this device becomes a writer, and a failed announcement is
    // re-sent on the next boot anyway.
    if (!this.autobase?.writable) {
      this._pendingEncryptedCoreAnnounce = coreKeyHex
      return
    }
    try {
      const db = await this.autobaseDb()
      if (db && (await viewStore.hasEncryptedMediaCore(db, coreKeyHex))) {
        this._pendingEncryptedCoreAnnounce = null
        return
      }
      await this.append({ type: DATA_TYPES.ADD_ENCRYPTED_MEDIA_CORE, coreKeyHex })
      this._pendingEncryptedCoreAnnounce = null
    } catch (err) {
      this._pendingEncryptedCoreAnnounce = coreKeyHex
      log.error('[media] could not publish the encrypted blob core', err)
    }
  }

  _bindMediaDrive() {
    if (this._mediaDriveUnbind) this._mediaDriveUnbind()
    const drive = this.hyperdrive
    const blobs = drive.blobs.core
    const onUpload = (index, byteLength) => this._onBlobUploaded(index, byteLength)
    const onAppend = () => this._refreshLocalBlobRangeIndex()
    const onPeerAdd = () => this._scheduleMediaHealthCheck()
    blobs.on('upload', onUpload)
    blobs.on('peer-add', onPeerAdd)
    drive.core.on('append', onAppend)
    this._mediaDriveUnbind = () => {
      blobs.off('upload', onUpload)
      blobs.off('peer-add', onPeerAdd)
      drive.core.off('append', onAppend)
    }
  }

  async _withMediaWrite(write) {
    while (this._mediaWriteGate) await this._mediaWriteGate
    this._activeMediaWrites++
    try {
      return await write()
    } finally {
      this._activeMediaWrites--
    }
  }

  _scheduleMediaHealthCheck() {
    if (this.isClosing || this._suspended) return
    clearTimeout(this._mediaHealthTimer)
    this._mediaHealthTimer = setTimeout(() => {
      this._mediaHealthTimer = null
      this._checkMediaStoreHealth().catch((e) => log.error('[media store] health check', e))
    }, MEDIA_HEALTH_CHECK_DEBOUNCE_MS)
  }

  _scheduleMediaRelink() {
    if (this.isClosing || Object.keys(this._mediaStore.map || {}).length === 0) return
    clearTimeout(this._mediaRelinkTimer)
    this._mediaRelinkTimer = setTimeout(() => {
      this._mediaRelinkTimer = null
      this._applyMediaRelink().catch((e) => log.error('[media store] relink', e))
    }, MEDIA_RELINK_DEBOUNCE_MS)
  }

  // Detects a blob core that can no longer serve its own media: a live file
  // with a block no fresh peer could verify, or a connected peer holding a
  // length this device can no longer prove an upgrade from. Either one is
  // permanent, so the files are moved to a new drive.
  async _checkMediaStoreHealth() {
    if (this.isClosing || this._suspended || this._mediaRebuild || !this.hyperdrive?.blobs) {
      return null
    }
    const core = this.hyperdrive.blobs.core
    // Blocks are only ever cleared with clearBlockRange, which keeps tree nodes,
    // so a scan that found nothing stays valid until the drive changes.
    const scanKey = `${b4a.toString(core.key, 'hex')}:${core.length}:${this.hyperdrive.version}`
    let missingNodes = 0
    if (this._provenMediaScanKey !== scanKey) {
      const present = (await this._localLiveBlobs()).filter(
        (blob) => blocksPresent(core, blob.blockOffset, blob.blockLength) >= blob.blockLength
      )
      missingNodes = await missingProofNodesForBlobs(core, present)
      if (!missingNodes) this._provenMediaScanKey = scanKey
    }
    let stalePeers = 0
    for (const peer of core.peers) {
      const length = peer.remoteLength
      if (length > 0 && length < core.length && !(await canProveUpgradeFrom(core, length))) {
        stalePeers++
      }
    }
    this._lastMediaHealth = { checkedAt: Date.now(), length: core.length, missingNodes, stalePeers }
    if (!missingNodes && !stalePeers) return this._lastMediaHealth

    log.error('[media store] blob core cannot serve its media', this._lastMediaHealth)
    if (this._activeMediaWrites > 0) {
      this._scheduleMediaHealthCheck()
      return this._lastMediaHealth
    }
    if (Date.now() - this._mediaStore.lastRebuildAt < MEDIA_REBUILD_MIN_INTERVAL_MS) {
      log.error('[media store] rebuilt recently, not rebuilding again yet')
      return this._lastMediaHealth
    }
    this.rebuildMediaStore().catch((e) => log.error('[media store] rebuild failed', e))
    return this._lastMediaHealth
  }

  rebuildMediaStore() {
    if (!this._mediaRebuild) {
      this._mediaRebuild = this._rebuildMediaStore().finally(() => {
        this._mediaRebuild = null
      })
    }
    return this._mediaRebuild
  }

  async _resumeMediaRebuild() {
    if (this._mediaStore.rebuildingTo) {
      await this.rebuildMediaStore()
      return
    }
    await this._applyMediaRelink()
    if (this._mediaStore.retired.some((retired) => !retired.cleared)) {
      await this._retireMediaDrives(null)
    }
  }

  async _rebuildMediaStore() {
    const state = this._mediaStore
    const from = state.generation
    const to = state.rebuildingTo || from + 1
    const oldDrive = this.hyperdrive
    const oldCore = oldDrive.blobs.core
    const oldCoreKeyHex = b4a.toString(oldCore.key, 'hex')

    // Uploads and restores can run for minutes. Gating new writes while waiting
    // for them would stall every attachment the user adds, so the rebuild only
    // starts when nothing is being written and otherwise retries later. The
    // check and the gate happen in the same tick, so no write slips in between.
    if (this._activeMediaWrites > 0) {
      this._scheduleMediaHealthCheck()
      throw new Error('media writes in progress, rebuild deferred')
    }
    let releaseWrites = null
    this._mediaWriteGate = new Promise((resolve) => {
      releaseWrites = resolve
    })
    this._mediaRebuilding = true
    let newDrive = null
    try {
      this._mediaStore = { ...state, rebuildingTo: to }
      this._saveMediaStoreState()

      // A damage rebuild keeps whatever the drive already was. It never
      // converts an unencrypted drive: that would be the migration this design
      // deliberately does not do.
      const encryptionKey = state.encrypted ? this._mediaEncryptionKey() : null

      newDrive = openMediaDrive(this.corestore, to, encryptionKey)
      await newDrive.ready()
      const newCoreKeyHex = b4a.toString(newDrive.blobs.core.key, 'hex')
      if (encryptionKey) this._encryptedMediaCores.add(newCoreKeyHex)

      const map = {}
      let copied = 0
      let skipped = 0
      for await (const entry of oldDrive.list('/', { recursive: true })) {
        if (this.isClosing) throw new Error('closing during media rebuild')
        const blob = entry.value?.blob
        if (!blob) continue
        if (blocksPresent(oldCore, blob.blockOffset, blob.blockLength) < blob.blockLength) {
          skipped++
          continue
        }
        try {
          const copy = await this._copyMediaEntry(oldDrive, newDrive, entry)
          if (blob.blockLength) {
            map[mediaRefKey(oldCoreKeyHex, blob)] = {
              coreKeyHex: newCoreKeyHex,
              blockOffset: copy.blockOffset,
              blockLength: copy.blockLength,
              byteOffset: copy.byteOffset,
              byteLength: copy.byteLength
            }
          }
          copied++
        } catch (e) {
          skipped++
          log.error('[media store] could not copy a file', e)
        }
      }

      this._mediaStore = {
        ...this._mediaStore,
        generation: to,
        encrypted: !!encryptionKey,
        blobCoreKeyHex: newCoreKeyHex,
        rebuildingTo: null,
        map: composeMediaMap(state.map, map),
        retired: [
          ...state.retired.filter((retired) => !retired.cleared),
          {
            generation: from,
            coreKeyHex: oldCoreKeyHex,
            cleared: false,
            encrypted: !!state.encrypted
          }
        ],
        lastRebuildAt: Date.now()
      }
      this._saveMediaStoreState()

      this.hyperdrive = newDrive
      this._bindMediaDrive()
      this._localBlobRangeIndex = []
      this._refreshLocalBlobRangeIndex().catch((e) => log.error('[media store] blob index', e))
      if (encryptionKey) {
        this._announceEncryptedMediaCore(newCoreKeyHex).catch((e) =>
          log.error('[media store] could not publish the new blob core', e)
        )
      }
      log.debug('[media store] moved media to a new drive', {
        from,
        to,
        copied,
        skipped,
        encrypted: !!encryptionKey
      })
    } catch (e) {
      if (newDrive && this.hyperdrive !== newDrive) await newDrive.close().catch(() => {})
      throw e
    } finally {
      this._mediaRebuilding = false
      this._mediaWriteGate = null
      releaseWrites()
    }

    // Storage subscriptions watch the drive they were opened on, so reconnect
    // them against the new one.
    this.emit('base-reopened', this._baseGeneration)
    this.emit('storage-changed')
    await this._applyMediaRelink()
    await this._retireMediaDrives(oldDrive)
    this.emit('storage-changed')
  }

  async _copyMediaEntry(oldDrive, newDrive, entry) {
    const blob = entry.value.blob
    const existing = (await newDrive.entry(entry.key))?.value?.blob
    if (
      existing &&
      existing.byteLength === blob.byteLength &&
      blocksPresent(newDrive.blobs.core, existing.blockOffset, existing.blockLength) >=
        existing.blockLength
    ) {
      return existing
    }

    const options = {
      executable: !!entry.value.executable,
      metadata: { ...(entry.value.metadata || {}), ...insertedMetadata() }
    }
    if (!blob.blockLength) {
      await newDrive.put(entry.key, b4a.alloc(0), options)
    } else {
      await pipelinePromise(
        oldDrive.createReadStream(entry.key, { wait: false }),
        newDrive.createWriteStream(entry.key, options)
      )
    }
    return (await newDrive.entry(entry.key)).value.blob
  }

  // Points every note at the copies made by a rebuild. Runs after each rebuild,
  // at startup and after base updates, because a device that was offline can
  // still write a note with the old links later.
  async _applyMediaRelink() {
    const map = this._mediaStore.map
    if (this.isClosing || !map || Object.keys(map).length === 0) return 0
    let relinked = 0
    for (const { key, value } of await this.getAllNotes()) {
      if (typeof value?.note !== 'string') continue
      if (relinkMediaContent(value.note, map) === value.note) continue
      if (this.isClosing) break
      // Re-read right before writing so an edit that arrived during this pass is
      // relinked rather than overwritten by the snapshot taken above. The write
      // keeps the note's updatedAt, so a concurrent edit with the same version
      // still wins and the next pass relinks it.
      const current = await this.getNote(key)
      if (typeof current?.note !== 'string') continue
      const note = relinkMediaContent(current.note, map)
      if (note === current.note) continue
      await this.addNote({ key, value: { ...current, note } })
      relinked++
    }
    if (relinked > 0) log.debug('[media store] relinked notes', relinked)
    return relinked
  }

  async _retireMediaDrives(openDrive) {
    for (const retired of this._mediaStore.retired) {
      if (retired.cleared || this.isClosing) continue
      const reuse =
        openDrive && b4a.toString(openDrive.blobs.core.key, 'hex') === retired.coreKeyHex
      // A retired drive has to be reopened the way it was written, or `ready()`
      // cannot even read its header.
      const drive = reuse
        ? openDrive
        : openMediaDrive(
            this.corestore,
            retired.generation,
            retired.encrypted ? this._mediaEncryptionKey() : null
          )
      try {
        await drive.ready()
        const core = drive.blobs?.core
        if (core && b4a.toString(core.key, 'hex') === retired.coreKeyHex) {
          await clearBlockRange(core, 0, core.length)
          await this._compactStorage(core, true)
        }
        retired.cleared = true
        this._saveMediaStoreState()
      } catch (e) {
        log.error('[media store] could not free a retired drive', e)
      } finally {
        await drive.close().catch(() => {})
      }
    }
  }

  async _storeBytesOnDisk(dir = this.corePath) {
    let entries = []
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true })
    } catch {
      return 0
    }

    let total = 0
    for (const entry of entries) {
      const entryPath = barePath.join(dir, entry.name)
      if (entry.isDirectory()) {
        total += await this._storeBytesOnDisk(entryPath)
        continue
      }
      try {
        total += (await fs.promises.stat(entryPath)).size
      } catch {
        continue
      }
    }
    return total
  }

  async _localLiveBlobs() {
    const blobs = []
    for await (const entry of this.hyperdrive.list('/', { recursive: true })) {
      const blob = entry.value?.blob
      if (blob && blob.blockLength) blobs.push(blob)
    }
    return blobs
  }

  async _compactIfStoreBloated() {
    const core = this.hyperdrive.blobs?.core
    if (!core) return
    const logicalBytes = measureLocalBlobBytes(core, await this._localLiveBlobs()).presentBytes
    const physicalBytes = await this._storeBytesOnDisk()

    if (physicalBytes - logicalBytes < COMPACTION_MIN_EXCESS_BYTES) return
    if (physicalBytes < logicalBytes * COMPACTION_SPACE_AMP_RATIO) return

    log.debug('[startup reclaim] compacting bloated store', physicalBytes, logicalBytes)
    await this._compactStorage(core, true)
    this.emit('storage-changed')
  }

  _scheduleMediaTombstoneSweep() {
    clearTimeout(this._mediaTombstoneTimer)
    this._mediaTombstoneTimer = setTimeout(() => {
      this._applyMediaTombstones().catch((e) => log.error('[tombstone] sweep failed', e))
    }, MEDIA_TOMBSTONE_DEBOUNCE_MS)
  }

  _scheduleRetentionSweep(earliestExpiryAt) {
    if (this.isClosing || !earliestExpiryAt) return
    const delay = Math.min(
      Math.max(earliestExpiryAt - Date.now(), MEDIA_RETENTION_RECHECK_MIN_MS),
      MEDIA_RETENTION_RECHECK_MAX_MS
    )
    clearTimeout(this._mediaRetentionTimer)
    this._mediaRetentionTimer = setTimeout(() => {
      this._applyMediaTombstones().catch((e) => log.error('[tombstone] retention sweep', e))
    }, delay)
  }

  async _retainedMediaRefs() {
    const retained = new Map()
    const db = await this.autobaseDb()
    if (!db) return retained

    const now = Date.now()
    for await (const { key: refKey, value } of viewStore.mediaTombstones(db)) {
      const deletedAt = value?.deletedAt
      if (!deletedAt) continue
      const expiresAt = deletedAt + MEDIA_RETENTION_MS
      if (expiresAt <= now) continue
      const [coreKeyHex, blockOffset, blockLength] = refKey.split(':')
      if (!coreKeyHex || !blockLength) continue
      if (!retained.has(coreKeyHex)) retained.set(coreKeyHex, [])
      retained.get(coreKeyHex).push({
        expiresAt,
        range: [Number(blockOffset), Number(blockOffset) + Number(blockLength)]
      })
    }

    return retained
  }

  async _retainedRangesForCore(coreKeyHex) {
    const retained = await this._retainedMediaRefs()
    return (retained.get(coreKeyHex) || []).map((entry) => entry.range)
  }

  _swarmSeedPath() {
    return barePath.join(this.path, SWARM_SEED_FILE)
  }

  _loadOrCreateSwarmSeed() {
    const seedPath = this._swarmSeedPath()
    try {
      const stored = fs.readFileSync(seedPath)
      if (stored && stored.length === 32) return stored
    } catch {
      // no seed yet
    }
    const seed = crypto.randomBytes(32)
    try {
      fs.mkdirSync(this.path, { recursive: true })
      fs.writeFileSync(seedPath, seed)
    } catch (err) {
      log.error(
        '[startSwarm] could not persist swarm seed, presence will be unstable',
        err?.message
      )
    }
    return seed
  }

  getSwarmKeyHex() {
    return this._swarmKeyHex
  }

  _emitSyncActivity() {
    if (this.isClosing) return
    if (!this.swarm || this.swarm.connections.size === 0) return
    const received = this._remoteNodesApplied
    this._remoteNodesApplied = 0
    this.emit('sync-activity', { at: Date.now(), received })
  }

  isSwarmKeyOnline(swarmKey) {
    if (!swarmKey) return false
    return this._connectedSwarmKeys.has(swarmKey)
  }

  _trackSwarmConnection(connection) {
    const remote = connection.remotePublicKey
    if (!remote) return
    const remoteHex = b4a.toString(remote, 'hex')
    this._connectedSwarmKeys.add(remoteHex)
    this.emit('presence-changed')
    const forget = () => {
      if (!this._connectedSwarmKeys.delete(remoteHex)) return
      this.emit('presence-changed')
    }
    connection.once('close', forget)
  }

  async startSwarm() {
    if (this.swarm) await this.swarm.destroy()
    this._connectedSwarmKeys.clear()
    this.swarm = new Hyperswarm({
      seed: this._loadOrCreateSwarmSeed(),
      ...(this.swarmBootstrap ? { bootstrap: this.swarmBootstrap } : {})
    })
    this._swarmKeyHex = b4a.toString(this.swarm.keyPair.publicKey, 'hex')

    this.swarm.on('error', (err) => log.error('[startSwarm] swarm error', err))

    this.swarm.on('connection', (connection) => {
      connection.on('error', (err) => log.error('[startSwarm] connection error', err))

      try {
        log.debug('got swarm connection, replicating')
        this._trackSwarmConnection(connection)
        this.corestore.replicate(connection)
        this._scheduleEagerBlobDownload()
      } catch (err) {
        log.error('[startSwarm] replicate failed', err)
      }
    })

    this.discovery = this.swarm.join(this.autobase.discoveryKey)
    this._swarmRetryDelay = SWARM_RETRY_BASE_MS
    await this._flushSwarm()
    this._scheduleSwarmHealthCheck()
    this.publishLocalSwarmKey().catch((err) =>
      log.error('[startSwarm] publish swarm key failed', err)
    )
  }

  async _flushSwarm() {
    try {
      await this.swarm.flush()
      log.debug('swarm connection done')
      this._swarmRetryDelay = SWARM_RETRY_BASE_MS
    } catch (err) {
      log.error('[startSwarm] flush failed, will retry', err)
      this._scheduleSwarmRetry()
    }
  }

  _scheduleSwarmRetry() {
    if (this.isClosing || this._swarmRetryTimer) return
    const delay = this._swarmRetryDelay
    this._swarmRetryTimer = setTimeout(() => {
      this._swarmRetryTimer = null
      this._swarmRetryDelay = Math.min(delay * 2, SWARM_RETRY_MAX_MS)
      if (this.isClosing || !this.swarm) return
      this._flushSwarm().catch((err) => log.error('[startSwarm] retry failed', err))
    }, delay)
  }

  _scheduleSwarmHealthCheck() {
    if (this.isClosing) return
    clearTimeout(this._swarmHealthCheckTimer)
    this._swarmHealthCheckTimer = setTimeout(() => {
      this._runSwarmHealthCheck().finally(() => this._scheduleSwarmHealthCheck())
    }, SWARM_HEALTH_CHECK_MS)
  }

  async _runSwarmHealthCheck({ force = false } = {}) {
    if (this.isClosing || !this.swarm || !this.discovery) return
    if (!force && this.swarm.connections.size > 0) return
    try {
      await this.discovery.refresh({ client: true, server: true })
      log.debug(
        '[startSwarm] health check: refreshed discovery, connections=' +
          this.swarm.connections.size +
          ' force=' +
          force
      )
    } catch (err) {
      log.error('[startSwarm] health check refresh failed', err)
    }
  }

  _scheduleEagerBlobDownload() {
    if (this._eagerBlobTimer) return
    const delay = nextScanDelay(
      this._lastBlobScanAt,
      Date.now(),
      EAGER_BLOB_DEBOUNCE_MS,
      EAGER_BLOB_MIN_INTERVAL_MS
    )
    this._eagerBlobTimer = setTimeout(() => {
      this._eagerBlobTimer = null
      this._lastBlobScanAt = Date.now()
      this._downloadExternalBlobs().catch((e) => log.error('[eagerBlobs] Error:', e.message))
    }, delay)
  }

  async _downloadExternalBlobs() {
    const notes = await this.getAllNotes()
    const myBlobCoreKeyHex = b4a.toString(this.hyperdrive.blobs.core.key, 'hex')

    for (const { key: noteKey, value } of notes) {
      if (!value?.note) continue
      const content = value.note.replace(/&amp;/g, '&')
      const urlRe = /http:\/\/hyperdrive\/\?[^"'\s<>]*/g
      const seen = new Set()
      let match
      while ((match = urlRe.exec(content)) !== null) {
        const url = match[0]
        if (seen.has(url)) continue
        seen.add(url)
        const coreKeyHex = blobCoreKeyHexFromUrl(url)
        if (!coreKeyHex || coreKeyHex === myBlobCoreKeyHex) continue
        const ref = blobRefFromUrl(url)
        if (!ref || !ref.byteLength) continue
        await this._queueBlobDownload({ noteKey, url, coreKeyHex, ref, content })
      }
    }
  }

  async _getExternalCore(coreKeyHex) {
    const existing = this._downloadCores.get(coreKeyHex)
    if (existing) return existing.core

    // A peer's blob core is encrypted with the same derived key, so it has to
    // be opened with it or every block reads as ciphertext.
    const encryptionKey = this._encryptedMediaCores.has(coreKeyHex)
      ? this._mediaEncryptionKey()
      : null
    const core = this.corestore.get({
      key: b4a.from(coreKeyHex, 'hex'),
      ...(encryptionKey ? { encryptionKey } : {})
    })
    await core.ready()
    this._downloadCores.set(coreKeyHex, { core })
    this._rememberExternalCore(coreKeyHex)
    core.on('download', (index, byteLength) =>
      this._onExternalBlockDownloaded(coreKeyHex, index, byteLength)
    )
    core.on('peer-add', () => this.emit('storage-changed'))
    core.on('peer-remove', () => this.emit('storage-changed'))
    return core
  }

  async _queueBlobDownload({ noteKey, url, coreKeyHex, ref, content }) {
    const registryKey = `${coreKeyHex}:${ref.blockOffset}:${ref.blockLength}`
    if (this._downloadRegistry.has(registryKey)) return

    let core
    try {
      core = await this._getExternalCore(coreKeyHex)
    } catch (e) {
      log.error('[downloads] failed to open external core', log.redact(coreKeyHex), e.message)
      return
    }

    const present = blocksPresent(core, ref.blockOffset, ref.blockLength)
    if (present >= ref.blockLength) return

    const entry = {
      noteKey,
      url,
      fileName: extractFileNameForUrl(content, url),
      coreKeyHex,
      blockOffset: ref.blockOffset,
      blockLength: ref.blockLength,
      totalBytes: ref.byteLength,
      downloadedBytes: Math.round(ref.byteLength * (present / ref.blockLength)),
      countedBlocks: presentBlockSet(core?.core?.bitfield, ref.blockOffset, ref.blockLength),
      status: this._mediaSyncHeld ? 'paused' : 'downloading',
      lastProgressAt: Date.now(),
      handle: null
    }
    this._downloadRegistry.set(registryKey, entry)
    this.emit('storage-changed')

    if (this._mediaSyncHeld) return
    this._startDownload(registryKey, core, ref, entry)
  }

  isMediaSyncHeld() {
    return this._mediaSyncHeld
  }

  async setMediaSyncHeld(held) {
    const next = !!held
    if (this._mediaSyncHeld === next) return { held: next }
    this._mediaSyncHeld = next

    if (next) {
      for (const [registryKey, entry] of this._downloadRegistry.entries()) {
        if (entry.status !== 'downloading' && entry.status !== 'queued') continue
        if (entry.handle) entry.handle.destroy()
        entry.handle = null
        entry.status = 'paused'
        this._activeDownloadKeys.delete(registryKey)
        this._dropPendingDownload(registryKey)
      }
      this.emit('storage-changed')
      return { held: true }
    }

    for (const [registryKey, entry] of this._downloadRegistry.entries()) {
      if (entry.status !== 'paused') continue
      let core
      try {
        core = await this._getExternalCore(entry.coreKeyHex)
      } catch (e) {
        log.error('[downloads] resume failed to open core', log.redact(entry.coreKeyHex), e.message)
        continue
      }
      const ref = {
        blockOffset: entry.blockOffset,
        blockLength: entry.blockLength,
        byteLength: entry.totalBytes
      }
      entry.status = 'downloading'
      entry.lastProgressAt = Date.now()
      this._startDownload(registryKey, core, ref, entry)
    }
    this.emit('storage-changed')
    this._scheduleEagerBlobDownload()
    return { held: false }
  }

  _startDownload(registryKey, core, ref, entry) {
    if (!admitDownload(this._activeDownloadKeys.size, MAX_ACTIVE_BLOB_DOWNLOADS)) {
      entry.status = 'queued'
      entry.handle = null
      if (!this._pendingDownloadKeys.includes(registryKey)) {
        this._pendingDownloadKeys.push(registryKey)
      }
      return
    }
    this._beginDownload(registryKey, core, ref, entry)
  }

  _beginDownload(registryKey, core, ref, entry) {
    const handle = core.download({ start: ref.blockOffset, end: ref.blockOffset + ref.blockLength })
    entry.handle = handle
    entry.status = 'downloading'
    this._activeDownloadKeys.add(registryKey)
    handle
      .done()
      .then(() => {
        const current = this._downloadRegistry.get(registryKey)
        if (current && current.handle === handle) this._downloadRegistry.delete(registryKey)
        this.emit('storage-changed')
      })
      .catch((e) => {
        log.error('[downloads] download failed', registryKey, e.message)
        const current = this._downloadRegistry.get(registryKey)
        if (current && current.handle === handle) current.status = 'error'
        this.emit('storage-changed')
      })
      .finally(() => {
        this._activeDownloadKeys.delete(registryKey)
        this._pumpDownloadQueue()
      })
  }

  _pumpDownloadQueue() {
    if (this.isClosing || this._mediaSyncHeld) return
    while (
      this._activeDownloadKeys.size < MAX_ACTIVE_BLOB_DOWNLOADS &&
      this._pendingDownloadKeys.length > 0
    ) {
      const registryKey = this._pendingDownloadKeys.shift()
      const entry = this._downloadRegistry.get(registryKey)
      if (!entry || entry.status !== 'queued') continue
      const core = this._downloadCores.get(entry.coreKeyHex)?.core
      if (!core) continue
      const ref = {
        blockOffset: entry.blockOffset,
        blockLength: entry.blockLength,
        byteLength: entry.totalBytes
      }
      entry.lastProgressAt = Date.now()
      this._beginDownload(registryKey, core, ref, entry)
    }
  }

  _dropPendingDownload(registryKey) {
    const index = this._pendingDownloadKeys.indexOf(registryKey)
    if (index !== -1) this._pendingDownloadKeys.splice(index, 1)
  }

  async retryDownload(url) {
    const ref = blobRefFromUrl(url)
    const coreKeyHex = blobCoreKeyHexFromUrl(url)
    if (!ref || !coreKeyHex) return { done: false }

    const registryKey = `${coreKeyHex}:${ref.blockOffset}:${ref.blockLength}`
    const entry = this._downloadRegistry.get(registryKey)
    if (!entry) return { done: false }

    if (entry.handle) entry.handle.destroy()

    if (this._reconcileDownloadRegistry() && !this._downloadRegistry.has(registryKey)) {
      this.emit('storage-changed')
      return { done: true }
    }

    let core
    try {
      core = await this._getExternalCore(coreKeyHex)
    } catch (e) {
      log.error('[downloads] retry failed to open external core', log.redact(coreKeyHex), e.message)
      return { done: false }
    }

    entry.downloadedBytes = Math.round(
      ref.byteLength * (blocksPresent(core, ref.blockOffset, ref.blockLength) / ref.blockLength)
    )
    entry.countedBlocks = presentBlockSet(core?.core?.bitfield, ref.blockOffset, ref.blockLength)
    entry.status = 'downloading'
    entry.lastProgressAt = Date.now()
    this.emit('storage-changed')

    this._startDownload(registryKey, core, ref, entry)
    this._runSwarmHealthCheck().catch(() => {})
    return { done: true }
  }

  pauseDownload(url) {
    const ref = blobRefFromUrl(url)
    const coreKeyHex = blobCoreKeyHexFromUrl(url)
    if (!ref || !coreKeyHex) return { paused: false }

    const registryKey = `${coreKeyHex}:${ref.blockOffset}:${ref.blockLength}`
    const entry = this._downloadRegistry.get(registryKey)
    if (!entry) return { paused: false }

    if (entry.handle) entry.handle.destroy()
    entry.handle = null
    entry.status = 'paused'
    this._activeDownloadKeys.delete(registryKey)
    this._dropPendingDownload(registryKey)
    this.emit('storage-changed')
    this._pumpDownloadQueue()
    return { paused: true }
  }

  _onExternalBlockDownloaded(coreKeyHex, index, byteLength) {
    let changed = false
    for (const entry of this._downloadRegistry.values()) {
      if (entry.coreKeyHex !== coreKeyHex) continue
      if (index < entry.blockOffset || index >= entry.blockOffset + entry.blockLength) continue
      if (!recordBlockOnce(entry, index, byteLength, 'downloadedBytes')) continue
      entry.lastProgressAt = Date.now()
      changed = true
    }
    if (changed) this.emit('storage-changed')
  }

  _reconcileDownloadRegistry() {
    let changed = false
    for (const [registryKey, entry] of this._downloadRegistry.entries()) {
      const core = this._downloadCores.get(entry.coreKeyHex)?.core
      if (!core) continue
      const present = blocksPresent(core, entry.blockOffset, entry.blockLength)
      if (present < entry.blockLength) continue
      if (entry.handle) entry.handle.destroy()
      this._activeDownloadKeys.delete(registryKey)
      this._dropPendingDownload(registryKey)
      this._downloadRegistry.delete(registryKey)
      changed = true
    }
    return changed
  }

  _syncDownloadedBytesFromBitfield(entry) {
    const core = this._downloadCores.get(entry.coreKeyHex)?.core
    if (!core || !entry.blockLength || !entry.totalBytes) return entry.downloadedBytes || 0
    const present = blocksPresent(core, entry.blockOffset, entry.blockLength)
    const fromBlocks = Math.min(
      entry.totalBytes,
      Math.round(entry.totalBytes * (present / entry.blockLength))
    )
    if (fromBlocks > (entry.downloadedBytes || 0)) {
      entry.downloadedBytes = fromBlocks
      entry.lastProgressAt = Date.now()
    }
    return entry.downloadedBytes
  }

  getDownloadsInfo() {
    this._reconcileDownloadRegistry()
    const downloads = []
    for (const entry of this._downloadRegistry.values()) {
      const coreEntry = this._downloadCores.get(entry.coreKeyHex)
      downloads.push({
        noteKey: entry.noteKey,
        url: entry.url,
        fileName: entry.fileName || '',
        totalBytes: entry.totalBytes,
        downloadedBytes: this._syncDownloadedBytesFromBitfield(entry),
        status: entry.status,
        stalled:
          entry.status === 'downloading' && Date.now() - entry.lastProgressAt > DOWNLOAD_STALL_MS,
        sourceOnline: (coreEntry?.core?.peers?.length ?? 0) > 0
      })
    }
    this._syncTransferTicker()
    return downloads
  }

  _hasTransferWatchers() {
    return this.listenerCount('transfer-progress') > 0 || this.listenerCount('storage-changed') > 0
  }

  _syncTransferTicker() {
    const hasActive = this._downloadRegistry.size > 0 || this._uploadRegistry.size > 0
    if (!hasActive || this.isClosing || !this._hasTransferWatchers()) {
      if (this._downloadTicker) {
        clearInterval(this._downloadTicker)
        this._downloadTicker = null
      }
      return
    }
    if (this._downloadTicker) return
    this._downloadTicker = setInterval(() => {
      if (
        this.isClosing ||
        this._downloadRegistry.size + this._uploadRegistry.size === 0 ||
        !this._hasTransferWatchers()
      ) {
        clearInterval(this._downloadTicker)
        this._downloadTicker = null
        return
      }
      this.emit('transfer-progress')
    }, TRANSFER_TICK_MS)
  }

  async _refreshLocalBlobRangeIndex() {
    if (this._refreshingBlobIndex) {
      this._blobIndexRefreshPending = true
      return
    }
    this._refreshingBlobIndex = true
    try {
      const index = []
      for await (const entry of this.hyperdrive.list('/', { recursive: true })) {
        const blob = entry.value?.blob
        if (!blob || !blob.blockLength) continue
        const entryPath = entry.key.startsWith('/') ? entry.key.slice(1) : entry.key
        const slashIdx = entryPath.indexOf('/')
        if (slashIdx === -1) continue
        const noteKey = entryPath.slice(0, slashIdx)
        const fileSegment = entryPath.slice(slashIdx + 1)
        const underscoreIdx = fileSegment.indexOf('_')
        const fileName = underscoreIdx !== -1 ? fileSegment.slice(underscoreIdx + 1) : fileSegment
        let url = ''
        try {
          url = this.blobServer
            .getLink(this.hyperdrive.blobs.core.key, { blob })
            .replace(this.getHyperdriveAddress(), HYPERDRIVE_URL_PREFIX + '/')
        } catch (e) {
          log.error('[uploads] failed to build blob link', e.message)
        }
        index.push({
          path: entryPath,
          noteKey,
          fileName,
          url,
          blockOffset: blob.blockOffset,
          blockLength: blob.blockLength,
          totalBytes: blob.byteLength || 0
        })
      }
      index.sort((a, b) => a.blockOffset - b.blockOffset)
      this._localBlobRangeIndex = index
    } catch (e) {
      log.error('[uploads] refresh blob index failed', e.message)
    } finally {
      this._refreshingBlobIndex = false
      if (this._blobIndexRefreshPending) {
        this._blobIndexRefreshPending = false
        this._refreshLocalBlobRangeIndex()
      }
    }
  }

  _findLocalBlobEntryForIndex(index) {
    const list = this._localBlobRangeIndex
    let lo = 0
    let hi = list.length - 1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      const item = list[mid]
      if (index < item.blockOffset) hi = mid - 1
      else if (index >= item.blockOffset + item.blockLength) lo = mid + 1
      else return item
    }
    return null
  }

  _onBlobUploaded(index, byteLength) {
    const info = this._findLocalBlobEntryForIndex(index)
    if (!info) return

    let entry = this._uploadRegistry.get(info.path)
    const isNew = !entry
    if (!entry) {
      entry = {
        noteKey: info.noteKey,
        url: info.url,
        fileName: info.fileName,
        totalBytes: info.totalBytes,
        uploadedBytes: 0,
        countedBlocks: new Set(),
        status: 'uploading',
        staleTimer: null
      }
      this._uploadRegistry.set(info.path, entry)
    }

    recordBlockOnce(entry, index, byteLength, 'uploadedBytes')

    clearTimeout(entry.staleTimer)
    entry.staleTimer = setTimeout(() => {
      this._uploadRegistry.delete(info.path)
      this.emit('storage-changed')
    }, UPLOAD_STALE_MS)

    // Every block would otherwise trigger a full storage rescan, and the scan is
    // a read of every note plus a drive listing. The row appearing is structural,
    // the bytes moving inside it are not.
    if (isNew) this.emit('storage-changed')
    else this.emit('transfer-progress')
    this._syncTransferTicker()
  }

  getUploadsInfo() {
    const uploads = []
    for (const entry of this._uploadRegistry.values()) {
      uploads.push({
        noteKey: entry.noteKey,
        url: entry.url,
        fileName: entry.fileName || '',
        totalBytes: entry.totalBytes,
        uploadedBytes: entry.uploadedBytes,
        status: entry.status
      })
    }
    return uploads
  }

  async apply(nodes, view, host) {
    this._applyNodesDuringBoot += nodes.length
    this._applyBatchesDuringBoot += 1
    // Watchdogs, not elapsed-time logging. A `finally` cannot report a call that
    // never returns, and that is exactly the failure being chased here: apply is
    // entered, `_applyState.update` never resolves, so autobase never reaches
    // `_flushLocalHeads` and the local writer is left ahead of its core.
    this._applyStage = 'entering'
    const applyWatchdog = setTimeout(() => {
      // A Hyperbee put has to walk the B-tree, and every internal node it needs
      // is a `core.get()`. A hypercore get for a block that is not present
      // locally waits for a peer indefinitely - which is what a stuck put with a
      // live event loop looks like. contiguousLength < length means this view
      // core has holes, so a traversal can reach a block we simply do not have.
      const core = this._viewCore
      log.error('[stuck] apply has not returned', {
        stage: this._applyStage,
        nodes: nodes.length,
        viewGetTimeout: core?.timeout ?? null,
        viewLength: core?.length ?? null,
        viewContiguousLength: core?.contiguousLength ?? null,
        viewHasHoles: core ? core.contiguousLength !== core.length : null,
        viewPeers: core?.peers?.length ?? null,
        viewWritable: core?.writable ?? null
      })
    }, APPLY_STUCK_MS)
    let batch = null
    let flushed = false
    try {
      const bee = await view
      // Returning here would let autobase record these nodes as applied against
      // a view that never saw them. There is no view without a bug, so fail.
      if (!bee) throw new Error('[apply] view database not available')
      this._viewCore = bee.core || null

      // A transaction, never the shared view: an aborted apply's writes would stay in its overlay and fork.
      batch = bee.transaction()
      const db = batch

      let activityEnabled = null

      for (const node of nodes) {
        // A node that throws is skipped on its own; the rest of the batch still
        // applies instead of silently never reaching this device's view.
        try {
          const raw = node.value
          let data = raw
          if (b4a.isBuffer(raw)) {
            try {
              data = JSON.parse(b4a.toString(raw))
            } catch {
              data = b4a.toString(raw)
            }
          }

          if (!data || typeof data !== 'object') continue

          if (activityEnabled === null) activityEnabled = await this._readActivityEnabled(db)

          const writerKey = node.from?.key ? b4a.toString(node.from.key, 'hex') : ''
          if (writerKey && writerKey !== this._localKeyHex) this._remoteNodesApplied++
          let previous = null

          this._applyStage = `switch:${data?.type}`
          switch (data.type) {
            case DATA_TYPES.ADD_WRITER: {
              // Validated up front. `b4a.from` does NOT throw on bad hex - it
              // returns a short or empty buffer - so without this a malformed
              // key reached `host.addWriter` as garbage.
              //
              // This changes the SYSTEM core's outcome for such a node versus
              // older builds, so it is part of why every device must update
              // together. Only malformed nodes are affected: `requestWriter`,
              // the one producer, always writes 64-char hex.
              const writerKeyBuffer = decodeWriterKey(data.key)
              if (!writerKeyBuffer) {
                log.error('[apply] ignoring an add_writer node with an unusable key', {
                  key: typeof data.key === 'string' ? data.key.length + ' chars' : typeof data.key
                })
                break
              }
              await host.addWriter(writerKeyBuffer, { isIndexer: data.isIndexer !== false })
              break
            }
            case DATA_TYPES.ADD_NOTE: {
              const { key, value } = data
              previous = await viewStore.getNote(db, key)
              const normalized =
                value && typeof value.note === 'string'
                  ? { ...value, note: normalizeAttachmentUrls(value.note) }
                  : value
              const resolved = this._resolveNoteWrite(previous, normalized, writerKey)
              if (!resolved) {
                log.warn('[notes] write discarded', {
                  key,
                  incomingAt: normalized?.updatedAt,
                  previousAt: previous?.updatedAt,
                  incomingVersion: normalized?.version,
                  previousVersion: previous?.version
                })
                if (activityEnabled) {
                  try {
                    await this._recordDiscardedNoteWrite(db, key, normalized, previous, {
                      writerKey,
                      seq: node.length || 0,
                      slot: 0
                    })
                  } catch (err) {
                    // Same rule as the activity record below: a failure that is
                    // not shared by every device must abort, or this device
                    // flushes a view without the entry that the others have.
                    if (isInfrastructureError(err)) throw err
                    log.error('[activity] discarded write not recorded', err)
                  }
                }
                continue
              }
              await viewStore.putNote(db, key, resolved)
              data = { ...data, value: resolved }
              break
            }
            case DATA_TYPES.REMOVE_NOTE: {
              const { key } = data
              previous = await viewStore.getNote(db, key)
              await viewStore.delNote(db, key)
              await this._purgeNoteActivity(db, key)
              break
            }
            case DATA_TYPES.ADD_FOLDER: {
              const { key, value } = data
              previous = await viewStore.getFolder(db, key)
              await viewStore.putFolder(db, key, value)
              break
            }
            case DATA_TYPES.REMOVE_FOLDER: {
              const { key } = data
              previous = await viewStore.getFolder(db, key)
              await viewStore.delFolder(db, key)
              break
            }
            case DATA_TYPES.ADD_SETTINGS: {
              const { value } = data
              await viewStore.putSettings(db, value)
              activityEnabled = !!value?.[ACTIVITY_LOG_ENABLED_KEY]
              break
            }
            case DATA_TYPES.ADD_SYNCED_DEVICE: {
              const { key, value } = data
              await viewStore.putSyncedDevice(db, key, value)
              break
            }
            case DATA_TYPES.REMOVE_SYNCED_DEVICE: {
              const { key, localKey } = data
              previous = await viewStore.getSyncedDevice(db, key)
              const removedWriterKey = decodeWriterKey(localKey)
              if (removedWriterKey) {
                try {
                  await host.removeWriter(removedWriterKey)
                } catch (err) {
                  // "Not allowed to remove the last indexer" is a property of
                  // the system state, which every device shares - so every
                  // device drops the row and keeps the writer, and the views
                  // still match. An infrastructure failure is not shared, so it
                  // has to abort like any other.
                  if (isInfrastructureError(err)) throw err
                  log.error('[apply] Could not remove the writer, dropping the device anyway', err)
                }
              }
              await viewStore.delSyncedDevice(db, key)
              break
            }
            case DATA_TYPES.UPDATE_SYNCED_DEVICE: {
              const { key, value } = data
              previous = await viewStore.getSyncedDevice(db, key)
              await viewStore.putSyncedDevice(db, key, value)
              break
            }
            case DATA_TYPES.DELETE_MEDIA: {
              const { refKey, url, deletedAt } = data
              await viewStore.putMediaTombstone(db, refKey, { url, deletedAt })
              break
            }
            case DATA_TYPES.PRUNE_ACTIVITY: {
              await this._pruneActivityEntries(db, data.cutoff)
              break
            }
            case DATA_TYPES.CLEAR_ACTIVITY: {
              await this._clearActivityEntries(db, this._activityTimestamp(data, null))
              break
            }
            case DATA_TYPES.PRUNE_MEDIA_TOMBSTONES: {
              await this._pruneMediaTombstoneEntries(db, data.cutoff)
              break
            }
            case DATA_TYPES.ADD_ENCRYPTED_MEDIA_CORE: {
              const coreKeyHex = typeof data.coreKeyHex === 'string' ? data.coreKeyHex : ''
              if (!/^[0-9a-f]{64}$/.test(coreKeyHex)) break
              await viewStore.putEncryptedMediaCore(db, coreKeyHex, { at: data.at || 0 })
              break
            }
          }

          // `noActivity` is carried ON THE OP, not in local state, precisely so
          // this stays deterministic: every device reads the same byte and skips
          // the same entry. A "we are restoring" flag held on the instance would
          // make one device write an entry another device skips, and the views
          // would diverge. See docs/HYPERDB-VIEW-MIGRATION-PLAN-2026-09-23.md
          // section 9 and constraint 1.
          if (activityEnabled && data.noActivity !== true) {
            // Exactly what the activity setting gates, and it runs inside apply.
            this._applyStage = `activity:${data?.type}:${data?.key || ''}`
            const activityWatchdog = setTimeout(() => {
              log.error('[stuck] activity record has not returned', {
                type: data?.type,
                key: data?.key,
                previousBytes: typeof previous?.note === 'string' ? previous.note.length : 0,
                nextBytes: typeof data?.value?.note === 'string' ? data.value.note.length : 0
              })
            }, ACTIVITY_SLOW_RECORD_MS)
            try {
              await this._recordActivity(db, data, writerKey, previous, node.length || 0)
            } catch (err) {
              // A replicator timeout here means the view B-tree reached a block
              // we do not hold. Repair it in the background - and then rethrow,
              // because the note body was written into the SAME batch: letting
              // this one through would flush a batch that some other device
              // flushed with an activity entry in it, and the two views would
              // no longer match.
              if (isInfrastructureError(err)) {
                if (err.code === 'REQUEST_TIMEOUT') this._scheduleViewBackfill(0)
                throw err
              }
              log.error('[activity] record failed', err)
            } finally {
              clearTimeout(activityWatchdog)
            }
          }
          this._applyStage = 'node-done'
        } catch (err) {
          // See INFRASTRUCTURE_ERROR_CODES. A deterministic failure is skipped
          // - every device skips it identically, so the views still match. An
          // infrastructure failure must abort the whole apply instead.
          if (isInfrastructureError(err)) throw err
          log.error('[apply] skipping a node that failed deterministically', {
            type: node?.value?.type,
            error: err?.message || String(err)
          })
        }
      }
      this._applyStage = 'flush'
      await batch.flush()
      flushed = true
    } catch (e) {
      // Do NOT swallow. Autobase treats a returning apply as a successful one:
      // it advances the view, records its length in the system core and lets
      // the indexers sign it. Catching here meant a failed flush was reported
      // as a clean apply - the nodes were gone from the view for good on this
      // device while every other device still had them. That is the
      // "changes do not persist" report, and the fork behind the stalls.
      //
      // Throwing is the safe half of the trade: autobase does not advance, the
      // write stays in the log, and `base-error` drives `_recoverFromBaseError`,
      // which reopens and replays. Same shape as autopass, whose apply has no
      // try/catch at all.
      log.error('[apply] aborted, autobase will not advance past these nodes', e)
      throw e
    } finally {
      if (batch && !flushed) {
        try {
          await batch.close()
        } catch (closeError) {
          log.error('[apply] could not close the view batch', closeError)
        }
      }
      clearTimeout(applyWatchdog)
    }
  }

  _resolveNoteWrite(previous, incoming, writerKey) {
    if (!incoming || typeof incoming !== 'object') return incoming

    const writer = writerKey || ''
    const incomingVersion = Number.isFinite(incoming.version) ? incoming.version : null

    if (!previous) {
      return {
        ...incoming,
        version: incomingVersion === null ? 1 : incomingVersion,
        versionBy: writer
      }
    }

    const previousVersion = Number.isFinite(previous.version) ? previous.version : 0
    const previousBy = previous.versionBy || ''

    if (incomingVersion === null) {
      const previousAt = Number.isFinite(previous.updatedAt) ? previous.updatedAt : 0
      const incomingAt = Number.isFinite(incoming.updatedAt) ? incoming.updatedAt : 0
      if (incomingAt < previousAt) return null
      if (incomingAt === previousAt && writer < previousBy) return null
      return { ...incoming, version: previousVersion + 1, versionBy: writer }
    }

    if (incomingVersion < previousVersion) return null
    if (incomingVersion === previousVersion) {
      const previousAt = Number.isFinite(previous.updatedAt) ? previous.updatedAt : 0
      const incomingAt = Number.isFinite(incoming.updatedAt) ? incoming.updatedAt : 0
      if (incomingAt < previousAt) return null
      if (incomingAt === previousAt && writer < previousBy) return null
    }
    return { ...incoming, version: incomingVersion, versionBy: writer }
  }

  async _readActivityEnabled(db) {
    const settings = await viewStore.getSettings(db)
    return !!settings?.[ACTIVITY_LOG_ENABLED_KEY]
  }

  _activityTimestamp(data, value) {
    if (Number.isFinite(data?.at) && data.at > 0) return data.at
    if (Number.isFinite(value?.updatedAt) && value.updatedAt > 0) return value.updatedAt
    if (Number.isFinite(value?.addedAt) && value.addedAt > 0) return value.addedAt
    return 0
  }

  _activityEntryId(at, ctx) {
    const stamp = String(at).padStart(ACTIVITY_SEQ_PAD, '0')
    const writer = (ctx?.writerKey || 'local').slice(0, 12)
    const seq = String(ctx?.seq || 0).padStart(12, '0')
    const slot = String(ctx ? ctx.slot++ : 0).padStart(3, '0')
    return `${stamp}:${writer}:${seq}:${slot}`
  }

  async _writeActivityEntry(db, entry, ctx) {
    // Anything from before the last clear stays cleared, however late its node
    // arrives. Only `>` so an edit made in the same millisecond as the clear is
    // kept rather than silently dropped.
    this._applyStage = 'write:get-watermark'
    const clearedAt = await this._readActivityClearedAt(db)
    if (clearedAt > 0 && !(entry.at > clearedAt)) return null

    const id = this._activityEntryId(entry.at, ctx)
    const stored = { ...entry, id }
    this._applyStage = 'write:put-entry'
    await viewStore.putActivityEntry(db, id, stored)
    return stored
  }

  async _recordActivity(db, data, writerKey, previous, seq) {
    const ctx = { writerKey, seq, slot: 0 }
    switch (data.type) {
      case DATA_TYPES.ADD_NOTE:
        return this._recordNoteActivity(db, data, writerKey, previous, ctx)
      case DATA_TYPES.REMOVE_NOTE:
        return this._recordSimpleActivity(
          db,
          {
            event: ACTIVITY_EVENT.NOTE_DELETED,
            at: this._activityTimestamp(data, previous),
            device: writerKey,
            targetKey: data.key,
            targetTitle: previous?.title || ''
          },
          ctx
        )
      case DATA_TYPES.ADD_FOLDER:
        return this._recordFolderActivity(db, data, writerKey, previous, ctx)
      case DATA_TYPES.REMOVE_FOLDER:
        return this._recordSimpleActivity(
          db,
          {
            event: ACTIVITY_EVENT.FOLDER_DELETED,
            at: this._activityTimestamp(data, previous),
            device: writerKey,
            targetKey: data.key,
            targetTitle: previous?.title || ''
          },
          ctx
        )
      case DATA_TYPES.ADD_SYNCED_DEVICE:
        return this._recordSimpleActivity(
          db,
          {
            event: ACTIVITY_EVENT.DEVICE_APPROVED,
            at: this._activityTimestamp(data, data.value),
            device: writerKey,
            targetKey: data.key,
            targetTitle: data.value?.title || '',
            meta: {
              platform: data.value?.platform || '',
              deviceKey: data.value?.localKey || ''
            }
          },
          ctx
        )
      case DATA_TYPES.UPDATE_SYNCED_DEVICE: {
        if (!previous || previous.title === data.value?.title) return null
        return this._recordSimpleActivity(
          db,
          {
            event: ACTIVITY_EVENT.DEVICE_RENAMED,
            at: this._activityTimestamp(data, data.value),
            device: writerKey,
            targetKey: data.key,
            targetTitle: data.value?.title || '',
            meta: { from: previous.title || '', to: data.value?.title || '' }
          },
          ctx
        )
      }
      case DATA_TYPES.REMOVE_SYNCED_DEVICE:
        return this._recordSimpleActivity(
          db,
          {
            event: ACTIVITY_EVENT.DEVICE_REMOVED,
            at: this._activityTimestamp(data, previous),
            device: writerKey,
            targetKey: data.key,
            targetTitle: previous?.title || '',
            meta: {
              platform: previous?.platform || '',
              deviceKey: previous?.localKey || ''
            }
          },
          ctx
        )
      case DATA_TYPES.LOG_EVENT:
        return this._recordSimpleActivity(
          db,
          {
            event: data.event,
            at: this._activityTimestamp(data, null),
            device: writerKey,
            targetKey: data.targetKey || '',
            targetTitle: data.targetTitle || '',
            meta: data.meta || {}
          },
          ctx
        )
      default:
        return null
    }
  }

  async _recordSimpleActivity(db, entry, ctx) {
    if (!entry.event) return null
    return this._writeActivityEntry(
      db,
      {
        event: entry.event,
        at: entry.at || 0,
        lastAt: entry.at || 0,
        device: entry.device || '',
        targetKind: getActivityTargetKind(entry.event),
        targetKey: entry.targetKey || '',
        targetTitle: entry.targetTitle || '',
        ops: 1,
        meta: entry.meta || {}
      },
      ctx
    )
  }

  async _recordFolderActivity(db, data, writerKey, previous, ctx) {
    const at = this._activityTimestamp(data, data.value)
    if (!previous) {
      return this._recordSimpleActivity(
        db,
        {
          event: ACTIVITY_EVENT.FOLDER_CREATED,
          at,
          device: writerKey,
          targetKey: data.key,
          targetTitle: data.value?.title || ''
        },
        ctx
      )
    }
    if (previous.title === data.value?.title) return null
    return this._recordSimpleActivity(
      db,
      {
        event: ACTIVITY_EVENT.FOLDER_RENAMED,
        at,
        device: writerKey,
        targetKey: data.key,
        targetTitle: data.value?.title || '',
        meta: { from: previous.title || '', to: data.value?.title || '' }
      },
      ctx
    )
  }

  async _recordNoteActivity(db, data, writerKey, previous, ctx) {
    const key = data.key
    const value = data.value
    if (!key || !value) return null

    if (key === INVITE_KEY) {
      if (previous) return null
      return this._recordSimpleActivity(
        db,
        {
          event: ACTIVITY_EVENT.INVITE_CREATED,
          at: this._activityTimestamp(data, value),
          device: writerKey,
          targetKey: '',
          meta: { expires: value.expires || 0 }
        },
        ctx
      )
    }

    if (key.startsWith('@')) return null

    const at = this._activityTimestamp(data, value)
    const base = { at, device: writerKey, targetKey: key, targetTitle: value.title || '' }

    if (!previous) {
      const created = await this._recordSimpleActivity(
        db,
        { ...base, event: ACTIVITY_EVENT.NOTE_CREATED },
        ctx
      )
      if (created) {
        await viewStore.putActivitySession(db, viewStore.SESSION_TITLE, key, writerKey, {
          id: created.id,
          lastAt: at
        })
      }
      return created
    }

    if ((previous.title || '') !== (value.title || '')) {
      await this._recordTitleActivity(db, base, previous.title || '', value.title || '', ctx)
    }

    if ((previous.folderKey || '') !== (value.folderKey || '')) {
      const toTrash = value.folderKey === RECENTLY_DELETED_KEY
      const fromTrash = previous.folderKey === RECENTLY_DELETED_KEY
      const event = toTrash
        ? ACTIVITY_EVENT.NOTE_TRASHED
        : fromTrash
          ? ACTIVITY_EVENT.NOTE_RESTORED
          : ACTIVITY_EVENT.NOTE_MOVED
      await this._recordSimpleActivity(
        db,
        {
          ...base,
          event,
          meta: {
            fromFolder: await this._folderTitle(db, previous.folderKey),
            toFolder: await this._folderTitle(db, value.folderKey)
          }
        },
        ctx
      )
    }

    if (!!previous.pinned !== !!value.pinned) {
      await this._recordSimpleActivity(
        db,
        {
          ...base,
          event: value.pinned ? ACTIVITY_EVENT.NOTE_PINNED : ACTIVITY_EVENT.NOTE_UNPINNED
        },
        ctx
      )
    }

    if (!!previous.locked !== !!value.locked) {
      await this._recordSimpleActivity(
        db,
        {
          ...base,
          event: value.locked ? ACTIVITY_EVENT.NOTE_LOCKED : ACTIVITY_EVENT.NOTE_UNLOCKED
        },
        ctx
      )
    }

    const previousContent = previous.note || ''
    const nextContent = value.note || ''
    if (previousContent === nextContent) return null

    await this._recordAttachmentActivity(db, base, previousContent, nextContent, ctx)
    return this._recordEditActivity(db, base, previousContent, ctx)
  }

  async _recordDiscardedNoteWrite(db, key, incoming, previous, ctx) {
    if (!key || key.startsWith('@') || !incoming || !previous) return null

    const discardedContent = incoming.note || ''
    const winningContent = previous.note || ''
    if (discardedContent === winningContent) return null

    const entry = await this._recordSimpleActivity(
      db,
      {
        event: ACTIVITY_EVENT.NOTE_EDIT_DISCARDED,
        at: this._activityTimestamp({}, incoming),
        device: ctx.writerKey,
        targetKey: key,
        targetTitle: incoming.title || previous.title || '',
        meta: { keptFrom: previous.versionBy || '' }
      },
      ctx
    )
    if (!entry) return null

    const text = htmlToActivityText(discardedContent)
    if (
      text.length <= ACTIVITY_SNAPSHOT_MAX_BYTES &&
      discardedContent.length <= ACTIVITY_SNAPSHOT_MAX_BYTES
    ) {
      await viewStore.putActivityDiscarded(db, entry.id, {
        text,
        html: discardedContent,
        title: incoming.title || ''
      })
    }
    return entry
  }

  async _recordTitleActivity(db, base, fromTitle, toTitle, ctx) {
    const kind = viewStore.SESSION_TITLE
    const session = await viewStore.getActivitySession(db, kind, base.targetKey, base.device)

    if (session && base.at - session.lastAt <= ACTIVITY_SESSION_WINDOW_MS) {
      const existing = await viewStore.getActivityEntry(db, session.id)
      if (existing) {
        if (existing.event === ACTIVITY_EVENT.NOTE_CREATED) {
          await viewStore.putActivityEntry(db, session.id, {
            ...existing,
            targetTitle: toTitle,
            lastAt: base.at
          })
        } else {
          const originalFrom = existing.meta?.from || fromTitle
          if (originalFrom === toTitle) {
            await viewStore.delActivityEntry(db, session.id)
            await viewStore.delActivitySession(db, kind, base.targetKey, base.device)
            return null
          }
          await viewStore.putActivityEntry(db, session.id, {
            ...existing,
            targetTitle: toTitle,
            lastAt: base.at,
            ops: (existing.ops || 1) + 1,
            meta: { ...existing.meta, from: originalFrom, to: toTitle }
          })
        }
        await viewStore.putActivitySession(db, kind, base.targetKey, base.device, {
          id: session.id,
          lastAt: base.at
        })
        return existing
      }
    }

    const entry = await this._recordSimpleActivity(
      db,
      {
        ...base,
        targetTitle: toTitle,
        event: ACTIVITY_EVENT.NOTE_RENAMED,
        meta: { from: fromTitle, to: toTitle }
      },
      ctx
    )
    if (entry) {
      await viewStore.putActivitySession(db, kind, base.targetKey, base.device, {
        id: entry.id,
        lastAt: base.at
      })
    }
    return entry
  }

  async _folderTitle(db, folderKey) {
    if (!folderKey) return ''
    if (folderKey === RECENTLY_DELETED_KEY) return ''
    const folder = await viewStore.getFolder(db, folderKey)
    return folder?.title || ''
  }

  async _recordAttachmentActivity(db, base, previousContent, nextContent, ctx) {
    this._applyStage = 'attachment:list-names'
    const before = listAttachmentNames(previousContent)
    const after = listAttachmentNames(nextContent)
    if (before.length === after.length) return

    const beforeNames = before.map((item) => `${item.kind}:${item.name}`)
    const afterNames = after.map((item) => `${item.kind}:${item.name}`)

    if (after.length > before.length) {
      const added = afterNames.filter((name) => !beforeNames.includes(name))
      for (const name of added.slice(0, 5)) {
        const [kind, ...rest] = name.split(':')
        await this._recordSimpleActivity(
          db,
          {
            ...base,
            event: ACTIVITY_EVENT.NOTE_ATTACHMENT_ADDED,
            meta: { kind, fileName: rest.join(':') }
          },
          ctx
        )
      }
      return
    }

    const removed = beforeNames.filter((name) => !afterNames.includes(name))
    for (const name of removed.slice(0, 5)) {
      const [kind, ...rest] = name.split(':')
      await this._recordSimpleActivity(
        db,
        {
          ...base,
          event: ACTIVITY_EVENT.NOTE_ATTACHMENT_REMOVED,
          meta: { kind, fileName: rest.join(':') }
        },
        ctx
      )
    }
  }

  async _recordEditActivity(db, base, previousContent, ctx) {
    const kind = viewStore.SESSION_EDIT
    this._applyStage = 'edit:get-session'
    const session = await viewStore.getActivitySession(db, kind, base.targetKey, base.device)

    if (session && base.at - session.lastAt <= ACTIVITY_SESSION_WINDOW_MS) {
      this._applyStage = 'edit:get-existing-entry'
      const existing = await viewStore.getActivityEntry(db, session.id)
      if (existing) {
        const updated = {
          ...existing,
          lastAt: Math.max(existing.lastAt || existing.at, base.at),
          ops: (existing.ops || 1) + 1,
          targetTitle: base.targetTitle
        }
        this._applyStage = 'edit:put-coalesced-entry'
        await viewStore.putActivityEntry(db, session.id, updated)
        this._applyStage = 'edit:put-session'
        await viewStore.putActivitySession(db, kind, base.targetKey, base.device, {
          id: session.id,
          lastAt: updated.lastAt
        })
        return updated
      }
    }

    const entry = await this._recordSimpleActivity(
      db,
      { ...base, event: ACTIVITY_EVENT.NOTE_EDITED },
      ctx
    )
    if (!entry) return null

    this._applyStage = 'edit:html-to-text'
    const snapshot = htmlToActivityText(previousContent)
    if (snapshot.length <= ACTIVITY_SNAPSHOT_MAX_BYTES) {
      this._applyStage = `edit:put-snapshot:${snapshot.length}`
      await viewStore.putActivitySnapshot(db, entry.id, { text: snapshot })
    }
    this._applyStage = 'edit:put-new-session'
    await viewStore.putActivitySession(db, kind, base.targetKey, base.device, {
      id: entry.id,
      lastAt: entry.at
    })
    return entry
  }

  async _purgeNoteActivity(db, noteKey) {
    if (!noteKey) return
    for (const id of await viewStore.activityIdsForNote(db, noteKey)) {
      await viewStore.delActivityEntry(db, id)
      await viewStore.delActivitySnapshot(db, id)
      await viewStore.delActivityDiscarded(db, id)
    }
    await viewStore.delActivitySessionsForNote(db, noteKey)
  }

  async _pruneActivityEntries(db, cutoff) {
    if (!Number.isFinite(cutoff) || cutoff <= 0) return
    const boundary = String(cutoff).padStart(ACTIVITY_SEQ_PAD, '0')
    const expired = await viewStore.activityValuesBefore(db, boundary)

    for (const entry of expired) {
      if (!entry?.id) continue
      await viewStore.delActivityEntry(db, entry.id)
      await viewStore.delActivitySnapshot(db, entry.id)
      await viewStore.delActivityDiscarded(db, entry.id)
    }
  }

  async logActivityEvent(event, { targetKey = '', targetTitle = '', meta = {} } = {}) {
    if (!event) return
    if (!(await this.isActivityLogEnabled())) return
    await this.append({ type: DATA_TYPES.LOG_EVENT, event, targetKey, targetTitle, meta })
  }

  async isActivityLogEnabled() {
    try {
      const settings = await this.getSettings()
      return !!settings?.[ACTIVITY_LOG_ENABLED_KEY]
    } catch {
      return false
    }
  }

  async getActivityRetentionDays() {
    try {
      const settings = await this.getSettings()
      const raw = settings?.[ACTIVITY_RETENTION_DAYS_KEY]
      return normalizeActivityRetentionDays(
        raw === undefined || raw === null ? ACTIVITY_DEFAULT_RETENTION_DAYS : raw
      )
    } catch {
      return ACTIVITY_DEFAULT_RETENTION_DAYS
    }
  }

  _scheduleActivitySweep(delay = ACTIVITY_SWEEP_INTERVAL_MS) {
    if (this.isClosing) return
    clearTimeout(this._activitySweepTimer)
    this._activitySweepTimer = setTimeout(() => {
      this.pruneActivity()
        .catch((e) => log.error('[activity] retention sweep', e))
        .then(() => this._scheduleActivitySweep())
    }, delay)
  }

  async pruneActivity(now = Date.now()) {
    if (this.isClosing) return 0
    if (!(await this.isActivityLogEnabled())) return 0
    const days = await this.getActivityRetentionDays()
    if (isActivityRetentionForever(days)) return 0
    const cutoff = now - days * 24 * 60 * 60 * 1000
    if (cutoff <= 0) return 0

    const db = await this.autobaseDb()
    if (!db) return 0
    const boundary = String(cutoff).padStart(ACTIVITY_SEQ_PAD, '0')
    const pending = (await viewStore.hasActivityBefore(db, boundary)) ? 1 : 0
    if (!pending) return 0

    await this.append({ type: DATA_TYPES.PRUNE_ACTIVITY, cutoff })
    return pending
  }

  async clearActivity() {
    await this.append({ type: DATA_TYPES.CLEAR_ACTIVITY })
  }

  async _readActivityIds(db, { noteKey, limit, cursor }) {
    return viewStore.activityIdsDescending(db, { noteKey, cursor, limit })
  }

  _matchesActivityFilter(entry, filter, deviceKey) {
    if (deviceKey && entry.device !== deviceKey) return false
    if (!filter || filter === ACTIVITY_FILTER.ALL) return true
    if (filter === ACTIVITY_FILTER.NOTES) return entry.targetKind === ACTIVITY_TARGET.NOTE
    if (filter === ACTIVITY_FILTER.FOLDERS) return entry.targetKind === ACTIVITY_TARGET.FOLDER
    if (filter === ACTIVITY_FILTER.DEVICES) {
      return (
        entry.targetKind === ACTIVITY_TARGET.DEVICE || entry.targetKind === ACTIVITY_TARGET.SYSTEM
      )
    }
    return true
  }

  async getActivity({
    filter = ACTIVITY_FILTER.ALL,
    deviceKey = '',
    noteKey = '',
    limit = ACTIVITY_PAGE_SIZE,
    cursor = ''
  } = {}) {
    try {
      const db = await this.autobaseDb()
      if (!db) return { entries: [], cursor: '', hasMore: false }

      const entries = []
      let nextCursor = cursor
      let hasMore = false
      let guard = 0

      while (entries.length < limit && guard < 20) {
        guard++
        const ids = await this._readActivityIds(db, {
          noteKey,
          limit: Math.max(limit * 2, ACTIVITY_PAGE_SIZE),
          cursor: nextCursor
        })
        if (!ids.length) {
          nextCursor = ''
          break
        }
        nextCursor = ids[ids.length - 1]
        hasMore = true

        for (const id of ids) {
          const entry = await viewStore.getActivityEntry(db, id)
          if (!entry) continue
          if (!this._matchesActivityFilter(entry, filter, deviceKey)) continue
          entries.push(await this._decorateActivityEntry(db, entry))
          if (entries.length >= limit) break
        }
      }

      return { entries, cursor: nextCursor, hasMore: hasMore && !!nextCursor }
    } catch (e) {
      log.error('NoteBase - getActivity', e)
      return { entries: [], cursor: '', hasMore: false }
    }
  }

  async _decorateActivityEntry(db, entry) {
    const decorated = {
      id: entry.id,
      event: entry.event,
      device: entry.device || '',
      at: entry.at || 0,
      lastAt: entry.lastAt || entry.at || 0,
      ops: entry.ops || 1,
      targetKind: entry.targetKind || ACTIVITY_TARGET.SYSTEM,
      targetKey: entry.targetKey || '',
      targetTitle: entry.targetTitle || '',
      locked: false,
      added: 0,
      removed: 0,
      hasDiff: false,
      recoverable: false,
      meta: entry.meta || {}
    }

    if (decorated.targetKind === ACTIVITY_TARGET.NOTE && decorated.targetKey) {
      const note = await viewStore.getNote(db, decorated.targetKey)
      if (note) {
        decorated.locked = !!note.locked
        decorated.targetTitle = note.title || decorated.targetTitle
      }
      if (entry.event === ACTIVITY_EVENT.NOTE_EDITED) {
        const snapshot = await viewStore.getActivitySnapshot(db, entry.id)
        decorated.hasDiff = !!snapshot
      }
      if (entry.event === ACTIVITY_EVENT.NOTE_EDIT_DISCARDED) {
        const discarded = await viewStore.getActivityDiscarded(db, entry.id)
        decorated.hasDiff = !!discarded
        decorated.recoverable =
          !!discarded?.html && !!note && !(note.note || '').includes(discarded.html)
      }
    }

    if (decorated.targetKind === ACTIVITY_TARGET.FOLDER && decorated.targetKey) {
      const folder = await viewStore.getFolder(db, decorated.targetKey)
      if (folder?.title) decorated.targetTitle = folder.title
    }

    return decorated
  }

  async _resolveActivityTexts(db, entry) {
    if (entry.event === ACTIVITY_EVENT.NOTE_EDIT_DISCARDED) {
      const discarded = await viewStore.getActivityDiscarded(db, entry.id)
      if (!discarded) return null
      const note = await viewStore.getNote(db, entry.targetKey)
      return { before: htmlToActivityText(note?.note || ''), after: discarded.text || '' }
    }

    const before = await viewStore.getActivitySnapshot(db, entry.id)
    if (!before) return null

    let after = null
    for await (const nextId of viewStore.activityIdsForNoteAfter(db, entry.targetKey, entry.id)) {
      const snapshot = await viewStore.getActivitySnapshot(db, nextId)
      if (snapshot) {
        after = snapshot.text || ''
        break
      }
    }

    if (after === null) {
      const note = await viewStore.getNote(db, entry.targetKey)
      after = htmlToActivityText(note?.note || '')
    }

    return { before: before.text || '', after }
  }

  async getActivityDiff(id) {
    try {
      const db = await this.autobaseDb()
      if (!db || !id)
        return { id: id || '', before: '', after: '', locked: false, available: false }

      const entry = await viewStore.getActivityEntry(db, id)
      if (!entry) return { id, before: '', after: '', locked: false, available: false }

      const note = entry.targetKey ? await viewStore.getNote(db, entry.targetKey) : null

      const texts = await this._resolveActivityTexts(db, entry)
      if (!texts) {
        return { id, before: '', after: '', locked: !!note?.locked, available: false }
      }

      return {
        id,
        before: texts.before,
        after: texts.after,
        locked: !!note?.locked,
        available: true
      }
    } catch (e) {
      log.error('NoteBase - getActivityDiff', e)
      return { id: id || '', before: '', after: '', locked: false, available: false }
    }
  }

  async recoverDiscardedNoteWrite(id) {
    try {
      const db = await this.autobaseDb()
      if (!db || !id) return { done: false, noteKey: '' }

      const entry = await viewStore.getActivityEntry(db, id)
      if (!entry || entry.event !== ACTIVITY_EVENT.NOTE_EDIT_DISCARDED) {
        return { done: false, noteKey: '' }
      }

      const discarded = await viewStore.getActivityDiscarded(db, id)
      if (!discarded?.html) return { done: false, noteKey: entry.targetKey || '' }

      const note = await this.getNote(entry.targetKey)
      if (!note) return { done: false, noteKey: entry.targetKey || '' }

      const current = note.note || ''
      if (current.includes(discarded.html)) return { done: true, noteKey: entry.targetKey }

      const merged = current
        ? `${current}${RECOVERED_WRITE_SEPARATOR}${discarded.html}`
        : discarded.html
      await this.addNote({
        key: entry.targetKey,
        value: { ...note, note: merged, updatedAt: Date.now() }
      })
      return { done: true, noteKey: entry.targetKey }
    } catch (e) {
      log.error('NoteBase - recoverDiscardedNoteWrite', e)
      return { done: false, noteKey: '' }
    }
  }

  async getActivityStats() {
    try {
      const db = await this.autobaseDb()
      if (!db) return { count: 0, bytes: 0, oldestAt: 0 }

      let count = 0
      let bytes = 0
      let oldestAt = 0

      for await (const { value } of viewStore.activityEntries(db)) {
        count++
        bytes += JSON.stringify(value || {}).length
        if (!oldestAt && value?.at) oldestAt = value.at
      }
      for await (const { value } of viewStore.activitySnapshots(db)) {
        bytes += (value?.text || '').length
      }
      for await (const { value } of viewStore.activityDiscardedEntries(db)) {
        bytes += (value?.text || '').length + (value?.html || '').length
      }

      return { count, bytes, oldestAt }
    } catch (e) {
      log.error('NoteBase - getActivityStats', e)
      return { count: 0, bytes: 0, oldestAt: 0 }
    }
  }

  async subscribeActivity() {
    try {
      const db = await this.autobaseDb()
      if (!db) return null
      return viewStore.watchActivity(db)
    } catch (e) {
      log.error('NoteBase - subscribeActivity', e)
      return null
    }
  }

  async _readActivityClearedAt(db) {
    return viewStore.getActivityClearedAt(db)
  }

  async _clearActivityEntries(db, clearedAt = 0) {
    await viewStore.clearAllActivity(db)

    // Taken from the node, never from Date.now(), so every device computes the
    // same view. Monotonic, so a replayed clear cannot move it backwards.
    if (clearedAt > 0) {
      const previous = await this._readActivityClearedAt(db)
      if (clearedAt > previous) await viewStore.putActivityClearedAt(db, clearedAt)
    }
  }

  async open(store) {
    const viewCore = store.get(VIEW_CORE_NAME)
    // Every get on the view inherits this, so no B-tree traversal can hang apply.
    viewCore.timeout = VIEW_GET_TIMEOUT_MS
    await viewCore.ready()
    const db = HyperDB.bee(viewCore, viewDefinition, { extension: false, autoUpdate: true })
    await db.ready()
    return db
  }

  async destroy() {
    await this._shutdown()
  }

  getHyperdriveAddress() {
    const { protocol, host, port } = this.blobServer
    return `${protocol}://${host}:${port}/`
  }

  async getChore() {
    await this._settleLifecycle()
    try {
      await this._ensureBlobServerListening()
    } catch (err) {
      log.error('[lifecycle] could not restore the hyperdrive server', err)
    }
    return {
      hyperdriveServerAddress: this.getHyperdriveAddress()
    }
  }

  async _settleLifecycle() {
    if (this._suspending) await this._settled(this._suspending)
    if (this._resuming) await this._settled(this._resuming)
  }

  _settled(promise) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        log.error('[lifecycle] a transition did not settle in time, continuing')
        resolve()
      }, LIFECYCLE_SETTLE_TIMEOUT_MS)
      const done = () => {
        clearTimeout(timer)
        resolve()
      }
      promise.then(done, (err) => {
        log.error('[lifecycle] transition failed', err)
        done()
      })
    })
  }

  suspend() {
    if (this.isClosing || this._suspended) {
      log.debug(
        '[lifecycle] core suspend IGNORED closing=' +
          this.isClosing +
          ' alreadySuspended=' +
          this._suspended
      )
      return this._suspending || Promise.resolve()
    }
    this._suspended = true
    this._suspending = this._suspend().finally(() => {
      this._suspending = null
    })
    return this._suspending
  }

  _lifecycleTimers() {
    return [
      this._eagerBlobTimer,
      this._mediaTombstoneTimer,
      this._mediaRetentionTimer,
      this._trashSweepTimer,
      this._activitySweepTimer,
      this._downloadTicker,
      this._mediaHealthTimer,
      this._mediaRelinkTimer,
      ...[...this._uploadRegistry.values()].map((entry) => entry && entry.staleTimer)
    ]
  }

  _setTimersHoldingLoop(holding) {
    let changed = 0
    for (const timer of this._lifecycleTimers()) {
      if (!timer) continue
      try {
        if (holding) timer.ref()
        else timer.unref()
        changed++
      } catch (err) {
        log.error('[lifecycle] could not toggle a timer', err)
      }
    }
    return changed
  }

  _withDeadline(promise, budgetMs, label) {
    return new Promise((resolve) => {
      let settled = false
      const finish = (timedOut) => {
        if (settled) return
        settled = true
        if (timedOut) log.error('[lifecycle] ' + label + ' exceeded its budget, moving on')
        resolve()
      }
      const timer = setTimeout(() => finish(true), Math.max(budgetMs, 0))
      promise.then(
        () => {
          clearTimeout(timer)
          finish(false)
        },
        (err) => {
          clearTimeout(timer)
          log.error('[lifecycle] ' + label + ' failed', err)
          finish(false)
        }
      )
    })
  }

  async _suspend() {
    const startedAt = Date.now()
    const remaining = () => SUSPEND_DEADLINE_MS - (Date.now() - startedAt)
    await this._settleLifecycle()
    log.debug(
      '[lifecycle] core suspend START connections=' +
        (this.swarm ? this.swarm.connections.size : 0) +
        ' address=' +
        this.getHyperdriveAddress()
    )

    if (this._swarmRetryTimer) {
      clearTimeout(this._swarmRetryTimer)
      this._swarmRetryTimer = null
    }
    if (this._swarmHealthCheckTimer) {
      clearTimeout(this._swarmHealthCheckTimer)
      this._swarmHealthCheckTimer = null
    }
    const released = this._setTimersHoldingLoop(false)
    log.debug('[lifecycle] core suspend timers cleared, released ' + released + ' pending timers')

    const blindPairing = this._pairingMember && this._pairingMember.blindPairing
    if (blindPairing) {
      log.debug('[lifecycle] core suspend blind pairing... budget=' + remaining() + 'ms')
      await this._withDeadline(blindPairing.suspend(), remaining(), 'blind pairing suspend')
      log.debug('[lifecycle] core suspend blind pairing returned')
    }

    if (this.swarm) {
      log.debug('[lifecycle] core suspend swarm... budget=' + remaining() + 'ms')
      await this._withDeadline(this.swarm.suspend(), remaining(), 'swarm suspend')
      log.debug('[lifecycle] core suspend swarm returned suspended=' + this.swarm.suspended)
    }

    if (this.blobServer) {
      const socket = this.blobServer.server
      log.debug('[lifecycle] core suspend blob server... budget=' + remaining() + 'ms')
      await this._withDeadline(this.blobServer.suspend(), remaining(), 'blob server suspend')
      await this._releaseServerSocket(socket)
      log.debug('[lifecycle] core suspend blob server returned')
    }

    log.debug('[lifecycle] core suspend DONE in ' + (Date.now() - startedAt) + 'ms')
  }

  _releaseServerSocket(socket) {
    if (!socket || socket.closing) return Promise.resolve()
    return new Promise((resolve) => {
      const done = setTimeout(resolve, SERVER_SOCKET_CLOSE_TIMEOUT_MS)
      socket.close(() => {
        clearTimeout(done)
        resolve()
      })
    })
  }

  resume() {
    if (this.isClosing) {
      log.debug('[lifecycle] core resume IGNORED, base is closing')
      return Promise.resolve()
    }
    if (this._resuming) {
      log.debug('[lifecycle] core resume already in flight, joining it')
      return this._resuming
    }
    this._suspended = false
    this._resuming = this._resume().finally(() => {
      this._resuming = null
    })
    return this._resuming
  }

  async _resume() {
    const startedAt = Date.now()
    await this._settleLifecycle()
    const addressBefore = this.getHyperdriveAddress()
    const restored = this._setTimersHoldingLoop(true)
    log.debug(
      '[lifecycle] core resume START addressBefore=' +
        addressBefore +
        ' restored ' +
        restored +
        ' timers'
    )

    try {
      await this._ensureBlobServerListening()
    } catch (err) {
      log.error('[lifecycle] core resume blob server FAILED', err)
    }

    const addressAfter = this.getHyperdriveAddress()
    log.debug(
      '[lifecycle] core resume blob server OK address=' +
        addressAfter +
        (addressBefore === addressAfter ? ' (port preserved)' : ' (PORT CHANGED)')
    )

    const blindPairing = this._pairingMember && this._pairingMember.blindPairing
    if (blindPairing) {
      try {
        blindPairing.resume()
        log.debug('[lifecycle] core resume blind pairing OK')
      } catch (err) {
        log.error('[lifecycle] core resume blind pairing FAILED', err)
      }
    }

    this.emit('services-resumed', addressAfter)
    log.debug('[lifecycle] core resume DONE in ' + (Date.now() - startedAt) + 'ms, swarm follows')

    this._resumeSwarm().catch((err) => log.error('[lifecycle] core resume swarm FAILED', err))
  }

  async _resumeSwarm() {
    if (this.isClosing || !this.swarm) {
      log.debug('[lifecycle] core resume swarm SKIPPED closing=' + this.isClosing)
      return
    }
    const startedAt = Date.now()
    log.debug('[lifecycle] core resume swarm... suspended=' + this.swarm.suspended)
    await this.swarm.resume()
    this._swarmRetryDelay = SWARM_RETRY_BASE_MS
    this._scheduleSwarmHealthCheck()
    await this._runSwarmHealthCheck({ force: true })
    log.debug(
      '[lifecycle] core resume swarm DONE in ' +
        (Date.now() - startedAt) +
        'ms connections=' +
        this.swarm.connections.size
    )
  }

  async _ensureBlobServerListening() {
    const server = this.blobServer
    if (!server) return
    const socket = server.server
    const alive = socket !== null && socket.listening && !socket.closing
    if (!server.suspending && alive) {
      log.debug('[lifecycle] blob server already healthy, nothing to do')
      return
    }
    log.debug(
      '[lifecycle] blob server needs relisten suspending=' +
        !!server.suspending +
        ' socket=' +
        (socket === null ? 'null' : 'listening=' + socket.listening + ' closing=' + socket.closing)
    )
    await server.suspend()
    await server.resume()
  }

  async createInvite() {
    try {
      await this.autobase.update()
    } catch (err) {
      log.error('[createInvite] Could not refresh before reading the invite', err)
    }

    const inviteFromDb = await this.getNote(INVITE_KEY)

    if (inviteFromDb && !isInviteExpired(inviteFromDb)) {
      return inviteFromDb
    }

    if (inviteFromDb) {
      await this.removeNote(INVITE_KEY)
    }

    const expiresAt = Date.now() + INVITE_EXPIRY_MS
    const { id, invite, publicKey, expires } = BlindPairing.createInvite(this.autobase.key, {
      expires: expiresAt
    })
    const value = {
      id: b4a.toString(id, 'hex'),
      invite: PAIRING_PROTOCOL + b4a.toString(invite, 'hex'),
      publicKey: b4a.toString(publicKey, 'hex'),
      expires: expires || expiresAt
    }
    await this.addNote({ key: INVITE_KEY, value })

    const stored = await this.getNote(INVITE_KEY)
    if (stored && stored.id !== value.id && !isInviteExpired(stored)) {
      log.debug('[createInvite] Another device published an invite first, showing that one')
      return stored
    }

    return value
  }

  async subscribePairing(cb = (status) => status) {
    this._pairingCb = cb
    await this._closePairingMember()

    const blindPairing = new BlindPairing(this.swarm, { poll: 500 })
    await blindPairing.ready()

    const that = this
    const emit = (status) => that._emitPairing(status)

    const addMember = blindPairing.addMember({
      discoveryKey: this.autobase.discoveryKey,
      async onadd(candidate) {
        log.debug('[subscribePairing] onadd fired')
        if (!that._claimCandidate(candidate)) return
        try {
          await that._handleCandidate(candidate, emit)
        } finally {
          that._releaseCandidate(candidate)
        }
      }
    })

    this._pairingMember = { blindPairing, addMember }

    const replayStep = this._lastPairingStatus?.step
    const replayConfirmation = replayStep === 'confirmation' && !!this._pendingConfirm
    if (replayConfirmation || replayStep === 'idle') {
      log.debug(`[subscribePairing] Replaying last pairing status to new subscriber: ${replayStep}`)
      this._emitPairing(this._lastPairingStatus)
    }

    await addMember.flushed()
    log.debug('[subscribePairing] Member added to swarm')
  }

  _emitPairing(status) {
    this._lastPairingStatus = status
    const cb = this._pairingCb
    if (!cb) return
    try {
      cb(status)
    } catch (err) {
      log.error('[subscribePairing] Delivering pairing status failed', err)
    }
  }

  _candidateFingerprint(candidate) {
    const inviteId = candidate?.inviteId ? b4a.toString(candidate.inviteId, 'hex') : ''
    const userData = candidate?.userData ? b4a.toString(candidate.userData, 'hex') : ''
    return `${inviteId}:${userData}`
  }

  _claimCandidate(candidate) {
    const fingerprint = this._candidateFingerprint(candidate)
    if (!this._pairingClaim) {
      this._pairingClaim = { fingerprint, candidates: new Set([candidate]) }
      return true
    }
    if (this._pairingClaim.fingerprint === fingerprint) {
      log.debug('[subscribePairing] Duplicate handler for the candidate already in flight')
      this._pairingClaim.candidates.add(candidate)
      return false
    }
    log.debug('[subscribePairing] Another candidate is being handled, denying')
    try {
      candidate.deny()
    } catch (err) {
      log.error('[subscribePairing] Deny of concurrent candidate failed', err)
    }
    return false
  }

  _releaseCandidate(candidate) {
    if (this._pairingClaim?.candidates.has(candidate)) this._pairingClaim = null
  }

  async _closePairingMember() {
    const current = this._pairingMember
    if (!current) return
    this._pairingMember = null
    try {
      await current.addMember.close()
    } catch (err) {
      log.error('[subscribePairing] Closing the previous member failed', err)
    }
    try {
      await current.blindPairing.close()
    } catch (err) {
      log.error('[subscribePairing] Closing the previous pairing session failed', err)
    }
  }

  async _handleCandidate(candidate, cb) {
    const that = this
    const inviteFromDb = await that.getNote(INVITE_KEY)
    // The vault drops the invite as soon as any device uses it, so tell the
    // frontend to stop offering a code this vault no longer honours.
    if (!inviteFromDb) {
      cb({ step: 'idle', reason: PAIRING_INVITE_REMOVED })
      return
    }

    const inviteId = b4a.toString(candidate.inviteId, 'hex')
    if (inviteId !== inviteFromDb.id) {
      log.debug(
        `[subscribePairing] Candidate is using a superseded invite ${inviteId}, this device now holds ${inviteFromDb.id}`
      )
      return
    }

    if (isInviteExpired(inviteFromDb)) {
      log.debug('[subscribePairing] Invite expired, denying candidate')
      try {
        candidate.deny()
      } catch (err) {
        log.error('[subscribePairing] Deny of expired invite failed', err)
      }
      await that.removeNote(INVITE_KEY)
      await that.logActivityEvent(ACTIVITY_EVENT.INVITE_EXPIRED)
      cb({ step: 'expired', progress: 0, reason: 'invite_expired' })
      return
    }

    if (that._pendingConfirm) {
      log.debug('[subscribePairing] Another confirmation is pending, denying candidate')
      try {
        candidate.deny()
      } catch (err) {
        log.error('[subscribePairing] Deny of concurrent candidate failed', err)
      }
      return
    }

    cb({ step: 'connected', progress: 30 })
    await candidate.open(b4a.from(inviteFromDb.publicKey, 'hex'))
    cb({ step: 'authenticating', progress: 50 })

    let otherKey = candidate.userData
    let otherPlatform = platform()
    let otherDeviceName = ''

    try {
      const parsed = JSON.parse(b4a.toString(candidate.userData))
      if (parsed.key && parsed.platform) {
        otherKey = b4a.from(parsed.key, 'hex')
        otherPlatform = parsed.platform
        // Absent when the joiner runs a build from before device names were sent.
        otherDeviceName = sanitizeDeviceName(parsed.deviceName)
      }
    } catch {
      otherKey = candidate.userData
    }

    const otherKeyHex = b4a.toString(otherKey, 'hex')

    if (that._rejectedPairingKeys.has(otherKeyHex)) {
      log.debug('[subscribePairing] Candidate was already rejected, denying without prompt')
      try {
        candidate.deny()
      } catch (err) {
        log.error('[subscribePairing] Deny of rejected candidate failed', err)
      }
      cb({ step: 'idle' })
      return
    }

    that._pendingConfirm = {
      resolve: null,
      reject: null,
      promise: null
    }
    that._pendingConfirm.promise = new Promise((resolve, reject) => {
      that._pendingConfirm.resolve = resolve
      that._pendingConfirm.reject = reject
    })
    that._pendingCandidate = candidate

    const alreadyVerified = await that.hasSyncedDeviceWithLocalKey(otherKeyHex)

    if (alreadyVerified) {
      log.debug('[subscribePairing] Candidate is an already verified device, auto-confirming')
      that._pendingConfirm.resolve(true)
    } else {
      cb({
        step: 'confirmation',
        userData: otherKeyHex,
        localKey: b4a.toString(that.autobase.local.key, 'hex'),
        platform: otherPlatform,
        deviceName: otherDeviceName,
        requestedAt: Date.now(),
        progress: 70
      })
    }

    let inviteWatchSettled = false
    let inviteRemovedElsewhere = false
    const checkInviteRemoved = async (source) => {
      if (inviteWatchSettled || !that._pendingConfirm) return
      try {
        await that.autobase.update()
      } catch (err) {
        log.error(`[subscribePairing] ${source} update error:`, err)
        return
      }
      const inviteStillExists = await that.getNote(INVITE_KEY)
      log.debug(
        `[subscribePairing] ${source} invite check for ${inviteId}: exists=${!!inviteStillExists}`
      )
      if (!inviteStillExists && !inviteWatchSettled) {
        inviteWatchSettled = true
        inviteRemovedElsewhere = true
        log.debug(
          `[subscribePairing] Invite removed by another device (via ${source}), dismissing confirmation for ${inviteId}`
        )
        // Don't deny the local candidate here: every member shares the same DHT
        // reply slot per session, so denying on a non-acting device races the
        // acting device's real confirm/deny response.
        if (that._pendingConfirm) that._pendingConfirm.resolve(false)
      }
    }

    const onAutobaseUpdate = () => {
      checkInviteRemoved('update-event').catch(() => {})
    }
    that.autobase.on('update', onAutobaseUpdate)

    const checkInviteInterval = setInterval(() => {
      if (inviteWatchSettled || !that._pendingConfirm) {
        clearInterval(checkInviteInterval)
        return
      }
      checkInviteRemoved('poll').catch(() => {})
    }, 800)

    const expiryTimer = setTimeout(
      () => {
        if (inviteWatchSettled || !that._pendingConfirm) return
        inviteWatchSettled = true
        log.debug('[subscribePairing] Invite expired while awaiting confirmation')
        cb({ step: 'expired', progress: 0, reason: 'invite_expired' })
        that._pendingConfirm.resolve(false)
      },
      Math.max((inviteFromDb.expires || 0) - Date.now(), 1000)
    )

    try {
      const confirmed = await that._pendingConfirm.promise
      inviteWatchSettled = true
      clearInterval(checkInviteInterval)
      clearTimeout(expiryTimer)
      that.autobase.off('update', onAutobaseUpdate)
      if (confirmed) {
        cb({ step: 'authorizing', progress: 80 })
        await that.requestWriter(otherKey, { isIndexer: false })

        await candidate.confirm({
          key: that.autobase.key,
          driveKey: that.hyperdrive.key,
          encryptionKey: that.autobase.encryptionKey || that.encryptionKey
        })

        const deviceType =
          otherPlatform === 'ios' || otherPlatform === 'android' ? 'mobile' : 'desktop'
        if (!(await that.hasSyncedDeviceWithLocalKey(otherKeyHex))) {
          await that.addSyncedDevice({
            key: b4a.toString(crypto.randomBytes(32), 'hex'),
            value: {
              title: otherDeviceName,
              deviceType,
              platform: otherPlatform,
              localKey: otherKeyHex,
              addedAt: Date.now(),
              updatedAt: Date.now()
            }
          })
        }

        await that.removeNote(INVITE_KEY)

        cb({ step: 'syncing', progress: 90 })
        await that.autobase.update()

        cb({ step: 'done', progress: 100 })
      } else {
        cb(
          inviteRemovedElsewhere
            ? { step: 'idle', reason: PAIRING_INVITE_REMOVED }
            : { step: 'idle' }
        )
      }
    } catch (err) {
      inviteWatchSettled = true
      clearInterval(checkInviteInterval)
      clearTimeout(expiryTimer)
      that.autobase.off('update', onAutobaseUpdate)
      log.error('[subscribePairing] Confirmation error:', err)
    } finally {
      that._pendingConfirm = null
      that._pendingCandidate = null
    }
  }

  confirmPairing() {
    if (this._pendingConfirm) {
      this._pendingConfirm.resolve(true)
    }
  }

  async hasSyncedDeviceWithLocalKey(localKeyHex) {
    if (!localKeyHex) return false
    try {
      const keys = await this.getAllSyncedDeviceKeys()
      for (const key of keys) {
        const device = await this.getRawSyncedDevice(key)
        if (device?.localKey === localKeyHex) return true
      }
    } catch (e) {
      log.error('[hasSyncedDeviceWithLocalKey] lookup failed', e)
    }
    return false
  }

  async rejectPairing() {
    if (this._pendingCandidate) {
      let rejectedPlatform = ''
      try {
        const userData = this._pendingCandidate.userData
        let rejectedKey = b4a.toString(userData, 'hex')
        try {
          const parsed = JSON.parse(b4a.toString(userData))
          if (parsed.key) rejectedKey = parsed.key
          if (parsed.platform) rejectedPlatform = parsed.platform
        } catch {
          // userData was a raw key
        }
        this._rejectedPairingKeys.add(rejectedKey)
        await this.logActivityEvent(ACTIVITY_EVENT.DEVICE_REJECTED, {
          meta: { platform: rejectedPlatform, deviceKey: rejectedKey }
        })
      } catch (err) {
        log.error('[rejectPairing] could not record rejected key', err)
      }
      try {
        this._pendingCandidate.deny()
      } catch (err) {
        log.error('[rejectPairing] error', err)
      }
      this._pendingCandidate = null
    }
    if (this._pendingConfirm) {
      this._pendingConfirm.resolve(false)
    }
    try {
      await this.removeNote(INVITE_KEY)
    } catch (err) {
      log.error('[rejectPairing] Failed to remove invite', err)
    }
  }

  async subscribePairUser(cb, invite, deviceName) {
    if (this._pairingInFlight) {
      log.debug('[subscribePairUser] A pairing attempt is already running, ignoring this one')
      return
    }
    this._pairingInFlight = true
    let candidateSession = null
    const candidatePath = this._candidateCorePath()
    const originalEncryption = this.encryption
    const originalEncryptionKey = this.encryptionKey
    let connectionEstablished = false
    let failureHandled = false
    let looksExpired = false
    let pairingTimeoutTimer = null
    try {
      const rawInvite = extractInvite(invite)
      const inviteBuffer = b4a.from(rawInvite, 'hex')

      let decodedInvite = null
      try {
        decodedInvite = BlindPairing.decodeInvite(inviteBuffer)
      } catch (err) {
        log.error('[subscribePairUser] Could not decode invite', err)
      }
      if (isInviteLongExpired(decodedInvite)) {
        log.debug('[subscribePairUser] Invite expired, aborting before touching storage')
        failureHandled = true
        cb({ step: 'expired', progress: 0, reason: 'invite_expired' })
        return
      }

      looksExpired = isInviteExpired(decodedInvite)
      if (looksExpired) {
        log.debug(
          '[subscribePairUser] Invite looks expired by this clock but is within the skew allowance, letting the inviter decide'
        )
      }

      const mergeData = await this._captureLocalDataForMerge()
      cb({
        step: 'clearing_data',
        progress: 10
      })
      await this._close()
      if (fs.existsSync(candidatePath)) fs.rmSync(candidatePath, { recursive: true, force: true })

      const candidatePrimaryKey = crypto.randomBytes(32)

      await this.initBase(null, candidatePrimaryKey, candidatePath)

      // Sent to the inviter so it can store this device under its real name instead of a
      // placeholder. Free-form JSON rather than a schema-encoded message, so an older
      // inviter simply ignores the extra key.
      const userData = b4a.from(
        JSON.stringify({
          key: b4a.toString(this.autobase.local.key, 'hex'),
          platform: platform(),
          deviceName: sanitizeDeviceName(deviceName)
        })
      )

      const blindPairing = new BlindPairing(this.swarm, { poll: 500 })
      await blindPairing.ready()
      candidateSession = blindPairing

      const that = this
      // Never log `invite` - it is the bearer credential that grants a new
      // device write access to the vault.
      log.debug('[subscribePairUser] Attempting to pair')
      cb({
        step: 'searching',
        localKey: b4a.toString(this.autobase.local.key, 'hex'),
        progress: 20
      })

      const candidate = blindPairing.addCandidate({
        invite: inviteBuffer,
        userData,
        async onadd(result) {
          if (failureHandled) return
          connectionEstablished = true
          log.debug('[subscribePairUser] Connection established')
          try {
            cb({ step: 'connected', progress: 30 })

            const key = b4a.toString(result.key, 'hex')
            if (result.encryptionKey) {
              that.encryption = b4a.toString(result.encryptionKey, 'hex')
              that.encryptionKey = result.encryptionKey
            }

            const candidatePrimaryKeyInner = that.corestore.primaryKey

            cb({ step: 'authenticating', progress: 50 })
            await that._close()

            try {
              if (fs.existsSync(candidatePath))
                fs.rmSync(candidatePath, { recursive: true, force: true })
            } catch (e) {
              log.error('[subscribePairUser] Failed to reset pairing candidate', e)
            }

            cb({ step: 'initializing_storage', progress: 70 })
            await that.initBase(key, candidatePrimaryKeyInner, candidatePath)

            cb({ step: 'replicating_data', progress: 85, encryptionKey: that.encryption })
            await that.autobase.update()
            await that.waitForData(cb)

            if (!(await that._hasJoinedVault())) {
              throw new Error(PAIRING_NOT_REPLICATED)
            }

            const merged = await that._restoreCapturedData(mergeData, cb)

            await that._promoteCandidateToPrimary({ preserveOld: !!mergeData && !merged })
            await that.initBase(key, candidatePrimaryKeyInner, that.corePath)
            await that.autobase.update()

            cb({ step: 'done', progress: 100, encryptionKey: that.encryption })
          } catch (e) {
            if (failureHandled) return
            failureHandled = true
            log.error('[subscribePairUser] Post-connection pairing failed, recovering', e)
            try {
              await that._recoverAfterFailedPromotion(originalEncryption, originalEncryptionKey)
            } catch (recoverError) {
              log.error(
                '[subscribePairUser] Recovery after post-connection failure failed',
                recoverError
              )
            }
            cb({
              step: 'error',
              progress: 0,
              reason:
                e?.message === PAIRING_NOT_REPLICATED
                  ? PAIRING_NOT_REPLICATED
                  : 'post_connection_failure'
            })
          }
        }
      })

      if (candidate.request) {
        candidate.request.on('rejected', (err) => {
          if (failureHandled || connectionEstablished) return
          if (err?.code !== 'PAIRING_REJECTED') {
            log.debug(
              '[subscribePairUser] Transient response error, retrying:',
              err?.code || err?.message
            )
            return
          }
          failureHandled = true
          log.debug('[subscribePairUser] Pairing rejected by inviter')
          candidate.close().catch(() => {})
          that
            ._abandonPairingCandidate(originalEncryption, originalEncryptionKey)
            .catch((restoreError) =>
              log.error('[subscribePairUser] Restore after rejection failed', restoreError)
            )
            .then(() =>
              cb(
                looksExpired
                  ? { step: 'expired', progress: 0, reason: 'invite_expired' }
                  : { step: 'rejected', progress: 0 }
              )
            )
        })
      }

      await candidate.ready()

      const outcome = await Promise.race([
        Promise.resolve(candidate.pairing).then(
          () => 'paired',
          () => 'failed'
        ),
        new Promise((resolve) => {
          pairingTimeoutTimer = setTimeout(() => resolve('timeout'), PAIRING_TIMEOUT_MS)
        })
      ])

      if (outcome === 'paired') {
        log.debug('[subscribePairUser] Pairing handshake complete')
        return
      }
      if (failureHandled || connectionEstablished) return
      failureHandled = true
      log.error('[subscribePairUser] Pairing did not complete:', outcome)
      await candidate.close().catch(() => {})
      await this._abandonPairingCandidate(originalEncryption, originalEncryptionKey)
      cb({ step: 'error', progress: 0, reason: outcome })
    } catch (e) {
      log.error('NoteBase - subscribePairUser', e)
      if (failureHandled || connectionEstablished) return
      failureHandled = true
      try {
        await this._abandonPairingCandidate(originalEncryption, originalEncryptionKey)
      } catch (restoreError) {
        log.error('[subscribePairUser] Restore after failure failed', restoreError)
      }
      cb({ step: 'error', progress: 0 })
    } finally {
      clearTimeout(pairingTimeoutTimer)
      this._pairingInFlight = false
      if (candidateSession) {
        try {
          await candidateSession.close()
        } catch (err) {
          log.error('[subscribePairUser] Closing the pairing session failed', err)
        }
      }
    }
  }

  _candidateCorePath() {
    return barePath.join(this.path, PAIRING_CANDIDATE_DIR)
  }

  _pairingMergeBackupPath() {
    return barePath.join(this.path, PAIRING_MERGE_BACKUP_FILE)
  }

  _removePairingMergeBackup() {
    try {
      fs.rmSync(this._pairingMergeBackupPath(), { force: true })
    } catch (e) {
      log.error('[subscribePairUser] Could not remove the merge backup', e)
    }
  }

  _oldCorePath() {
    return barePath.join(this.path, PAIRING_OLD_DIR)
  }

  _unmergedBackupPath() {
    return barePath.join(this.path, PAIRING_UNMERGED_DIR)
  }

  async _recoverFromBaseError() {
    // Autobase closes ITSELF before it emits `error` (`_onError` in
    // autobase/index.js). So an error that lands while a recovery is running is
    // not noise to drop: it means the base that recovery just reopened is
    // already dead. Dropping it left the app holding a closed base that it
    // believed was live - every read failed with SESSION_CLOSED and every core
    // length read 0 (field report: backlog -1856). Record it; the running
    // recovery checks the flag before it reports success.
    if (this._recoveringBase) {
      this._baseFailedDuringRecovery = true
      return
    }
    if (this.isClosing || this._shutDown || this._readOnly) return

    const now = Date.now()
    if (now - this._lastBaseErrorAt > BASE_ERROR_RECOVERY_WINDOW_MS) this._baseErrorRecoveries = 0
    this._lastBaseErrorAt = now

    if (this._baseErrorRecoveries >= BASE_ERROR_RECOVERY_LIMIT) {
      log.error('[NoteBase] Autobase keeps failing, opening the vault read-only')
      this._recoveringBase = true
      try {
        await this._enterReadOnlyMode()
      } finally {
        this._recoveringBase = false
      }
      return
    }

    this._recoveringBase = true
    this._baseErrorRecoveries++
    const recovery = this._closeAndReopenBase()
    this._recovery = recovery
    try {
      await recovery
    } finally {
      this._recovery = null
      this._recoveringBase = false
    }
  }

  async _closeAndReopenBase() {
    try {
      await this._close()
    } catch (e) {
      log.error('[NoteBase] Close before autobase recovery failed', e)
    }
    const reopened = await this._reopenBaseWithRetry()
    // A shutdown that arrived mid-recovery is not a failure to report.
    if (this._shutDown) return
    if (reopened) {
      log.debug('[NoteBase] Reopened the base after an autobase error')
      this.emit('base-recovered')
      return
    }
    await this._enterReadOnlyMode()
  }

  // The last resort when apply cannot get past a node - in the field, a view
  // block no connected device still holds. Every reopen replays that node, hits
  // the same block and closes the base again, and `base-unrecoverable` makes the
  // frontend reload the app, which does it all over again. The user could not
  // even export a backup to escape to a fresh vault.
  //
  // So reopen with autobase paused: `apply` never runs, the unapplied node stays
  // in the log untouched, and the view this device already has is readable -
  // enough to browse and to export. Writes are refused (see `append`), and
  // `readOnly` in the debug report says why. Only if even this fails is the
  // base unrecoverable.
  async _enterReadOnlyMode() {
    if (this._shutDown) return
    log.error('[NoteBase] apply cannot make progress, reopening the vault read-only')
    try {
      await this._close()
    } catch (e) {
      log.error('[NoteBase] Close before read-only reopen failed', e)
    }
    this._readOnly = true
    try {
      await this.initBase()
    } catch (e) {
      log.error('[NoteBase] Read-only reopen failed', e)
      if (!this._shutDown) this.emit('base-unrecoverable')
      return
    }
    if (!this._shutDown) this.emit('base-read-only')
  }

  // True when the base this instance holds can no longer serve anything: gone,
  // closing, or closed by autobase itself after an error.
  _baseIsDead() {
    const base = this.autobase
    return !base || !!base.closing || !!base.closed
  }

  // For closes that must stay closed: destroy, and Clear storage, which then
  // deletes the vault from disk. A recovery that is mid-reopen was racing both.
  // It created a corestore, the close shut it underneath `initBase`, and
  // autobase's constructor then ran our `open` against the closed store - an
  // unhandled rejection that takes the worklet down. After a Clear storage it
  // could also recreate `core/` once the vault had been deleted. So stop
  // recovery from starting again, let the one in flight finish its current
  // step (it checks `_shutDown` between steps), and only then close.
  async _shutdown() {
    this._shutDown = true
    this._resolveShutdown()
    const recovery = this._recovery
    if (recovery) await recovery.catch(noop)
    await this._close()
  }

  async _reopenBaseWithRetry(attempts = 5, delayMs = 500) {
    let lastError
    for (let attempt = 1; attempt <= attempts; attempt++) {
      if (this._shutDown) return false
      this._baseFailedDuringRecovery = false
      try {
        await this.initBase()
        if (this._shutDown) return false
        const baseFailed = new Promise((resolve) => this.autobase.once('error', resolve))
        // The usual reason apply aborted is a view block this device does not
        // hold. Reopening replays the same nodes into the same gap, so pull the
        // missing blocks rather than burning the recovery budget on the
        // identical failure. Bounded: the download keeps going in the
        // background, we just stop waiting on it.
        // Raced with shutdown so a quit or Clear storage never sits out the
        // backfill budget.
        await Promise.race([
          this._withDeadline(
            this._fillViewCoreGaps().catch((e) =>
              log.error('[NoteBase] view backfill during recovery failed', e?.message || e)
            ),
            VIEW_BACKFILL_RECOVERY_BUDGET_MS,
            'view backfill during recovery'
          ),
          this._shutdownRequested,
          baseFailed
        ])
        // Success means the reopened base got through the replay, not merely
        // that it opened: the node that failed before is re-applied during this
        // linearization, and it is exactly what fails again when the cause is
        // still there.
        if (this._linearizing && !this._baseIsDead()) {
          await Promise.race([this._linearizing, this._shutdownRequested, baseFailed])
        }
        if (this._shutDown) return false
        if (this._baseFailedDuringRecovery || this._baseIsDead()) {
          throw new Error('[NoteBase] the reopened base failed again while replaying')
        }
        return true
      } catch (e) {
        lastError = e
        log.error(`[NoteBase] Reopen attempt ${attempt}/${attempts} failed`, e)
        try {
          await this._close()
        } catch (closeError) {
          log.error('[NoteBase] Close between reopen attempts failed', closeError)
        }
        if (attempt < attempts && !this._shutDown) await this.wait(delayMs)
      }
    }
    log.error('[NoteBase] Failed to reopen base after retries', lastError)
    return false
  }

  async _abandonPairingCandidate(encryption, encryptionKey) {
    this._removePairingMergeBackup()
    try {
      await this._close()
    } catch (e) {
      log.error('[subscribePairUser] Close during abandon failed', e)
    }
    const candidatePath = this._candidateCorePath()
    try {
      if (fs.existsSync(candidatePath)) fs.rmSync(candidatePath, { recursive: true, force: true })
    } catch (e) {
      log.error('[subscribePairUser] Failed to remove candidate during abandon', e)
    }
    this.encryption = encryption
    this.encryptionKey = encryptionKey
    return this._reopenBaseWithRetry()
  }

  async _recoverAfterFailedPromotion(originalEncryption, originalEncryptionKey) {
    this._removePairingMergeBackup()
    try {
      await this._close()
    } catch (e) {
      log.error('[subscribePairUser] Close during post-connection recovery failed', e)
    }
    this._recoverPairingState()
    if (await this._reopenBaseWithRetry(3, 500)) return true
    log.error('[subscribePairUser] Reopen with paired identity failed, restoring original')
    this.encryption = originalEncryption
    this.encryptionKey = originalEncryptionKey
    return this._reopenBaseWithRetry(3, 500)
  }

  async _promoteCandidateToPrimary({ preserveOld = false } = {}) {
    const candidatePath = this._candidateCorePath()
    const oldPath = this._oldCorePath()
    await this._close()
    if (fs.existsSync(oldPath)) fs.rmSync(oldPath, { recursive: true, force: true })
    if (fs.existsSync(this.corePath)) fs.renameSync(this.corePath, oldPath)
    // The corestore under `core/` is the candidate's now, and media-store.json
    // describes the one that was just replaced. `initBase` reads its
    // `encrypted` flag to decide whether to open the media drive with a key, so
    // a stale flag here means opening a drive the wrong way and failing on
    // DECODING_ERROR while reading its header. Reset it: the promoted store
    // starts with a fresh, empty drive, which `_encryptFreshMediaDrive` then
    // opens encrypted.
    if (this._mediaStoreOwned) {
      // `core/` is the candidate's store now. It was created fresh by this
      // build, so its media drive was opened encrypted on its first open -
      // record that, or the next `initBase` opens it the wrong way.
      this._mediaStore = { ...emptyMediaStoreState(), encrypted: !!this._mediaEncryptionKey() }
      writeMediaStoreState(this.path, this._mediaStore)
    }
    fs.renameSync(candidatePath, this.corePath)
    if (fs.existsSync(oldPath)) {
      if (preserveOld) {
        const keepPath = this._unmergedBackupPath()
        if (fs.existsSync(keepPath)) fs.rmSync(keepPath, { recursive: true, force: true })
        fs.renameSync(oldPath, keepPath)
      } else {
        fs.rmSync(oldPath, { recursive: true, force: true })
      }
    }
  }

  _recoverPairingState() {
    try {
      const candidatePath = this._candidateCorePath()
      const oldPath = this._oldCorePath()
      const unmergedPath = this._unmergedBackupPath()
      const core = this.corePath
      if (fs.existsSync(oldPath)) {
        if (!fs.existsSync(core)) {
          if (fs.existsSync(candidatePath)) fs.renameSync(candidatePath, core)
          else fs.renameSync(oldPath, core)
        }
        if (fs.existsSync(oldPath) && fs.existsSync(core)) {
          fs.rmSync(oldPath, { recursive: true, force: true })
        }
      }
      if (fs.existsSync(candidatePath)) {
        if (fs.existsSync(core)) {
          log.debug('[NoteBase] Discarding interrupted pairing candidate, original data intact')
          fs.rmSync(candidatePath, { recursive: true, force: true })
        } else {
          log.debug('[NoteBase] Promoting completed pairing candidate after interrupted swap')
          fs.renameSync(candidatePath, core)
        }
      }
      if (!fs.existsSync(core) && fs.existsSync(unmergedPath)) {
        log.debug('[NoteBase] Restoring unmerged local backup after interrupted pairing')
        fs.renameSync(unmergedPath, core)
      }
      if (fs.existsSync(core) && fs.existsSync(unmergedPath)) {
        log.warn(
          '[NoteBase] Unmerged local backup present (core-unmerged-backup) — pre-pairing notes were preserved but not merged; left intact for manual recovery'
        )
      }
    } catch (e) {
      log.error('[NoteBase] Failed to recover pairing state', e)
    }
  }

  async _captureLocalDataForMerge() {
    try {
      const allNotes = await this.getAllNotes()
      const notes = allNotes.filter((n) => n.key !== INVITE_KEY)
      const folders = await this.getAllFolders()
      if (notes.length === 0 && folders.length === 0) return null
      const filePath = this._pairingMergeBackupPath()
      if (fs.existsSync(filePath)) fs.rmSync(filePath, { force: true })
      await buildBackup(this, notes, folders, {}, null, filePath)
      return { filePath, recoveryKey: this.encryption }
    } catch (e) {
      log.error('[subscribePairUser] Failed to capture local data for merge', e)
      return null
    }
  }

  async _hasJoinedVault(timeoutMs = PAIRING_REPLICATION_TIMEOUT_MS) {
    try {
      const notes = await this.getAllNoteKeys()
      const folders = await this.getAllFoldersKeys()
      const devices = await this.getAllSyncedDeviceKeys()
      if (notes.length > 0 || folders.length > 0 || devices.length > 0) return true
    } catch (e) {
      log.error('[subscribePairUser] Could not read the paired vault', e)
    }
    return this._waitForWritable(timeoutMs)
  }

  async _waitForWritable(timeoutMs = 30000) {
    const start = Date.now()
    while (!this.isClosing && this.autobase && !this.autobase.writable) {
      if (Date.now() - start > timeoutMs) break
      try {
        await this.autobase.update()
      } catch (err) {
        log.debug('[legacy] update while waiting for writable failed', err?.message)
      }
      await this.wait(300)
    }
    return !!(this.autobase && this.autobase.writable)
  }

  async _restoreCapturedData(captured, cb = (status) => status) {
    if (!captured) return true
    const writable = await this._waitForWritable(60000)
    if (!writable) {
      log.error('[subscribePairUser] Merge skipped: device did not become writable in time')
      cb({ step: 'merge_failed', reason: 'not_writable', encryptionKey: this.encryption })
      return false
    }
    cb({ step: 'restoring_local_data', progress: 92, encryptionKey: this.encryption })
    try {
      await this._withMediaWrite(() =>
        restoreBackup(
          this,
          { filePath: captured.filePath, recoveryKey: captured.recoveryKey },
          () => {}
        )
      )
      this._removePairingMergeBackup()
      return true
    } catch (e) {
      this._removePairingMergeBackup()
      log.error('[subscribePairUser] Failed to restore local data after merge', e)
      cb({ step: 'merge_failed', reason: 'restore_error', encryptionKey: this.encryption })
      return false
    }
  }

  async autobaseDb() {
    if (this.isClosing || !this.autobase) return null
    return await this.autobase.view
  }

  folderDb() {
    return null
  }

  async requestWriter(keyFromParam, { isIndexer = true } = {}) {
    const key = keyFromParam || this.autobase.local.key
    const keyHex = b4a.toString(key, 'hex')

    await this.append({ type: DATA_TYPES.ADD_WRITER, key: keyHex, isIndexer })
  }

  // Fast-forward lets a device adopt a peer's signed view instead of replaying
  // the log. Autobase implements that by fetching ONE block of each view - see
  // `lib/fast-forward.js`: `core.get(v.length - 1)` and nothing else. The view
  // core is then `length` long with a single block present, and every later
  // Hyperbee write walks the B-tree into blocks this device does not hold.
  //
  // In a big public swarm those blocks are always somewhere. In a private
  // fleet of two or three devices they are not: once every device has
  // fast-forwarded, the old view blocks exist NOWHERE, a put's traversal asks
  // the replicator for a block no peer can serve, and apply stalls inside the
  // get. Measured in the field: viewLength 2600, contiguousLength 4, two peers
  // connected, neither able to answer.
  //
  // So it is off on every device, not just the sync leader. A leader-only
  // policy still leaves followers with a sparse view - and a follower's own
  // writes go through the same B-tree - so it only narrows the window instead
  // of closing it. Replaying the log is the cost, and for a notes vault that is
  // seconds; a vault that cannot save is not worth the seconds.
  //
  // `_scheduleViewBackfill` stays: it repairs vaults that are ALREADY sparse
  // from before this policy.
  _applyFastForwardPolicy() {
    if (!this.autobase) return
    if (this.autobase.fastForwardEnabled === VIEW_FAST_FORWARD_ENABLED) return
    this.autobase.fastForwardEnabled = VIEW_FAST_FORWARD_ENABLED
    log.debug('[view] fast-forward disabled, this device always replays the log')
  }

  _emitIndexerChange() {
    this._applyFastForwardPolicy()
    const keys = this.getIndexerKeys()
    const snapshot = keys.slice().sort().join(',')
    if (snapshot === this._indexerKeysSnapshot) return
    this._indexerKeysSnapshot = snapshot
    this.emit('indexers-changed')
  }

  getIndexerKeys() {
    const indexers = this.autobase?.system?.indexers || []
    const keys = indexers.map((indexer) => b4a.toString(indexer.key, 'hex'))
    if (keys.length === 0 && this._lastKnownIndexerKeys) return this._lastKnownIndexerKeys
    if (keys.length > 0) this._lastKnownIndexerKeys = keys
    return keys
  }

  isIndexerKey(localKeyHex) {
    if (!localKeyHex) return false
    return this.getIndexerKeys().includes(localKeyHex)
  }

  isLocalIndexer() {
    return this.isIndexerKey(this._localKeyHex)
  }

  async setDeviceIndexer({ localKey, isIndexer }) {
    if (!localKey) throw new Error(INDEXER_ERROR.UNKNOWN_DEVICE)

    const indexers = this.getIndexerKeys()
    const alreadyIndexer = indexers.includes(localKey)
    if (alreadyIndexer === isIndexer) return { changed: false, indexers }

    if (!isIndexer && indexers.length <= 1) {
      throw new Error(INDEXER_ERROR.LAST_INDEXER)
    }

    if (!(await this._isWriterReachable(localKey))) {
      throw new Error(INDEXER_ERROR.DEVICE_OFFLINE)
    }

    await this.requestWriter(b4a.from(localKey, 'hex'), { isIndexer })
    return { changed: true, indexers: this.getIndexerKeys() }
  }

  async transferIndexer({ localKey }) {
    if (!localKey) throw new Error(INDEXER_ERROR.UNKNOWN_DEVICE)

    const indexers = this.getIndexerKeys()
    if (indexers.length === 1 && indexers[0] === localKey) {
      return { changed: false, indexers }
    }

    if (!(await this._isWriterReachable(localKey))) {
      throw new Error(INDEXER_ERROR.DEVICE_OFFLINE)
    }

    const outgoing = indexers.filter((key) => key !== localKey)
    for (const key of outgoing) {
      if (!(await this._isWriterReachable(key))) {
        throw new Error(INDEXER_ERROR.LEADER_OFFLINE)
      }
    }

    if (!indexers.includes(localKey)) {
      await this.requestWriter(b4a.from(localKey, 'hex'), { isIndexer: true })
    }

    for (const key of outgoing) {
      await this.requestWriter(b4a.from(key, 'hex'), { isIndexer: false })
    }

    return { changed: true, indexers: this.getIndexerKeys() }
  }

  async _isWriterReachable(localKeyHex) {
    if (localKeyHex === this._localKeyHex) return true
    const keys = await this.getAllSyncedDeviceKeys()
    for (const key of keys) {
      const device = await this.getRawSyncedDevice(key)
      if (!device || device.localKey !== localKeyHex) continue
      return this.isSwarmKeyOnline(device.swarmKey)
    }
    return false
  }

  // Logs when a step blows its budget but still waits for it to finish.
  //
  // `_withDeadline` RESOLVES on timeout without cancelling the work, which is
  // right for shutdown but wrong here: `_appendChain` exists to serialise
  // writes, and moving on early breaks exactly that. The next `autobase.append`
  // then starts on top of one that is still running and every caller waits for
  // both. Measured on a note that reproduced it: 15003ms, then 29726ms for the
  // identical 24KB body - the deadline meant to stop a pile-up was causing it.
  async _awaitWithWarning(promise, budgetMs, label) {
    const started = Date.now()
    const timer = setTimeout(
      () => {
        // autobase can only flush a local append while its writer is idle, and
        // the loop's own safety break needs idle() too - so when an append is
        // over budget, the writer's state is the thing that explains it.
        const writer = this.autobase?.localWriter
        log.error('[lifecycle] ' + label + ' is over its budget, still waiting', {
          budgetMs,
          writerIdle: writer ? writer.idle() : null,
          writerLength: writer?.length ?? null,
          writerAvailable: writer?.available ?? null,
          writerCoreLength: writer?.core?.length ?? null,
          writerRemoved: writer?.isRemoved ?? null,
          baseWritable: this.autobase?.writable ?? null,
          appendingQueued: this.autobase?._appending?.length ?? null,
          appended: this.autobase?._appended ?? null,
          baseLength: this.autobase?.length ?? null,
          indexedLength: this.autobase?.indexedLength ?? null
        })
      },
      Math.max(budgetMs, 0)
    )
    try {
      return await promise
    } catch (err) {
      // Logged and rethrown. Returning undefined here made a failed append look
      // like a completed one to `append`, and from there to notesApi, which
      // answers `{ done: true }` and lets the editor mark the note saved.
      log.error('[lifecycle] ' + label + ' failed', err)
      throw err
    } finally {
      clearTimeout(timer)
      const took = Date.now() - started
      if (took >= budgetMs) log.error('[lifecycle] ' + label + ' took ' + took + 'ms')
    }
  }

  // autobase's localWriter bumps `length`/`available` in memory the moment
  // `_addLocalHeads` accepts a node; only `_flushLocalHeads` reconciles that
  // with the core. In `_advance` those two are separated by an `if
  // (this._interrupting) return` and an `await this._applyState.update(...)`,
  // so anything that leaves in between strands the writer ahead of its core.
  //
  // Nothing in autobase heals it, and the damage is total rather than local:
  // `_addLocalHeads` starts with `if (!this.localWriter.idle()) return null`, so
  // no node ever flushes again, and `_appendBatch`'s own escape hatch
  // (`runs >= 16 && localWriter.idle()`) needs the same idle() that is stuck
  // false. Every write from this device hangs until the base is reopened, which
  // rebuilds the writer from its core. Seen in the field on a healthy, fully
  // indexed base: writerLength 3, writerCoreLength 2, appended 0.
  _isWriterWedged() {
    const writer = this.autobase?.localWriter
    if (!writer || !writer.core?.opened) return false
    return writer.length > writer.core.length && !writer.idle()
  }

  // The wedged append is the chain task `_close` would wait on, so it must not.
  async _recoverFromInsideAppend() {
    this._recoveringInsideAppend = true
    try {
      await this._recoverFromBaseError()
    } finally {
      this._recoveringInsideAppend = false
    }
  }

  // The check in `append` only sees the writer as it was when the write
  // started. The wedge can also appear once the append is already in flight:
  // `_advance` runs on remote updates too, and any early return between
  // `_addLocalHeads` and `_flushLocalHeads` strands the writer. `_appendBatch`
  // is then in `while (this._appended < target) await this._bump()`, whose only
  // escape (`runs >= 16 && localWriter.idle()`) needs the idle() that is stuck
  // false - so it spins forever, the append never settles, and every write
  // queued behind it on `_appendChain` stops with it. That is the field
  // symptom: nothing saves, New note does nothing, and no error is reported.
  //
  // Reopening rebuilds the writer from its core, which both interrupts the spin
  // and discards the stranded node - so resending the payload lands it once,
  // rather than duplicating it.
  async _appendGuardingWedge(payload, optimistic) {
    let pending = this.autobase.append(payload, { optimistic })
    for (let attempt = 0; ; attempt++) {
      const wedged = await Promise.race([
        pending.then(() => false),
        this._waitForWedgedWriter(pending)
      ])
      if (!wedged) return
      if (attempt > 0) throw new Error('[append] the local writer wedged again after reopening')
      // Abandoned on purpose: the close below is what settles it, and its
      // rejection has no other handler once we stop awaiting it.
      pending.catch(noop)
      log.error('[append] the local writer wedged mid-append, reopening the base')
      await this._recoverFromInsideAppend()
      if (!this.autobase || this.isClosing) throw new Error('[append] base did not reopen')
      pending = this.autobase.append(payload, { optimistic })
    }
  }

  // Resolves only when the writer has been stranded, without moving, across two
  // probes AND the append has already blown its budget. A healthy append is
  // briefly indistinguishable from a wedged one - `_addLocalHeads` bumps
  // `length` before `_flushLocalHeads` moves the core - so a single sample
  // would reopen the base underneath perfectly good writes.
  _waitForWedgedWriter(pending) {
    return new Promise((resolve) => {
      const started = Date.now()
      let seen = null
      let timer = null
      const stop = () => {
        if (timer) clearInterval(timer)
        timer = null
      }
      timer = setInterval(() => {
        if (Date.now() - started < APPEND_TIMEOUT_MS) return
        if (this.isClosing || !this._isWriterWedged()) {
          seen = null
          return
        }
        const writer = this.autobase.localWriter
        const mark = writer.length + ':' + writer.core.length
        if (seen !== mark) {
          seen = mark
          return
        }
        stop()
        resolve(true)
      }, WRITER_WEDGE_PROBE_MS)
      if (timer.unref) timer.unref()
      pending.then(stop, stop)
    })
  }

  // Every write in the app funnels through one serial chain. The steps below
  // are awaited to completion so the chain stays genuinely serial; callers are
  // protected from a stuck backend by the RPC-level budget in backend/main.js
  // (`answerWithin`), which answers `{ done: false }` and lets the frontend
  // retry, rather than by abandoning work that is still in flight here.
  //
  // `prepare` runs INSIDE the chain, immediately before the append. Any
  // read-modify-write step belongs there: `addNote` derives the next version
  // from the stored one, and doing that at call time meant every save in a
  // burst read the same version, appended the same version+1, and `apply`
  // resolved the tie by `updatedAt`/writer key - discarding all but one of
  // them. Inside the chain each save sees the previous one's result.
  async append(data, prepare = null) {
    const stamped = data && typeof data === 'object' ? { at: Date.now(), ...data } : data
    const run = async () => {
      try {
        if (this._linearizing) {
          await this._awaitWithWarning(
            this._linearizing,
            APPEND_LINEARIZE_WAIT_MS,
            'append waiting on background linearization'
          )
        }
        // Throw, never return. A silent return is indistinguishable from a
        // successful write to every caller above this, and notesApi turns that
        // into `{ done: true }` - the editor then clears its dirty buffer and
        // the edit is gone.
        if (!this.autobase || this.isClosing) throw new Error('[append] no open base')
        // A paused base never flushes an append, so waiting would hang the whole
        // chain. Refusing keeps the editor's buffer dirty and its retry going.
        if (this._readOnly) {
          const readOnly = new Error('[append] the vault is open read-only, see _enterReadOnlyMode')
          readOnly.code = 'VAULT_READ_ONLY'
          throw readOnly
        }
        if (this._isWriterWedged()) {
          const writer = this.autobase.localWriter
          log.error('[append] local writer is ahead of its core, reopening the base', {
            writerLength: writer.length,
            writerCoreLength: writer.core.length
          })
          await this._recoverFromInsideAppend()
          if (!this.autobase || this.isClosing) {
            throw new Error('[append] base did not reopen')
          }
        }
        // ONLY the joiner's ADD_WRITER request may go out optimistically.
        //
        // autobase routes an optimistic node from a removed/unknown writer to
        // `_optimisticApply`, which snapshots the system, runs apply, and then
        // REQUIRES that apply acked the writer:
        //
        //   if (!post || preLength === post.length) failed = true   // -> rollback
        //
        // Our apply only acks in the ADD_WRITER case (`host.addWriter`), which
        // is exactly why pairing works. Any other node sent optimistically can
        // never satisfy that check, so it is always rolled back - yet
        // `_addLocalHeads` has already incremented `localWriter.length`, and the
        // rollback does not undo that. The writer is then permanently ahead of
        // its core, `idle()` can never be true again, and every subsequent write
        // on the device hangs (see `_isWriterWedged`). Observed in the field as
        // writerLength 3 / writerCoreLength 2 on a fully indexed base.
        //
        // `!this.autobase.writable` was too coarse: a removed writer is also
        // non-writable, so it kept sending ordinary note writes down this path.
        // autopass (the Holepunch reference app) passes no `optimistic` at all.
        const optimistic = data?.type === DATA_TYPES.ADD_WRITER
        const payload = prepare ? await prepare(stamped) : stamped
        await this._awaitWithWarning(
          this._appendGuardingWedge(payload, optimistic),
          APPEND_TIMEOUT_MS,
          'autobase append'
        )
        await this._awaitWithWarning(
          this.autobase.update(),
          APPEND_VIEW_UPDATE_TIMEOUT_MS,
          'autobase update after append'
        )
      } catch (e) {
        // Rethrown on purpose. notesApi.updateNote is deliberately not wrapped
        // in a try/catch so that an append failure reaches the RPC layer as
        // `{ done: false }`, and updateNoteSaga leaves the editor buffer dirty
        // so the next save resends the same body. Swallowing here defeated all
        // of that: the write vanished and the UI reported it saved.
        log.error('[append] write failed', e)
        throw e
      }
    }

    const settled = this._appendChain.then(run, run)
    // The tail must not carry this write's rejection: it exists only to
    // serialise, and a rejected tail with no handler of its own is an unhandled
    // rejection that can take the worklet down.
    this._appendChain = settled.then(noop, noop)
    return settled
  }

  async addFolder({ key, value, noActivity = false }) {
    const op = { type: DATA_TYPES.ADD_FOLDER, key, value }
    if (noActivity) op.noActivity = true
    await this.append(op)
  }

  async updateFolder({ key, value, noActivity = false }) {
    const op = { type: DATA_TYPES.ADD_FOLDER, key, value }
    if (noActivity) op.noActivity = true
    await this.append(op)
  }

  async removeFolder(key) {
    await this.append({ type: DATA_TYPES.REMOVE_FOLDER, key })
  }

  async getFolder(key) {
    const db = await this.autobaseDb()
    if (!db) return null
    return viewStore.getFolder(db, key)
  }

  async getAllFolders() {
    try {
      const db = await this.autobaseDb()
      if (!db) return []
      const data = []
      for await (const entry of viewStore.folders(db)) data.push(entry)
      return data
    } catch (e) {
      log.error('NoteBase - getAllFolders', e)
      return []
    }
  }

  async getAllFoldersKeys() {
    try {
      const db = await this.autobaseDb()
      if (!db) return []
      const keys = []
      for await (const entry of viewStore.folders(db)) keys.push(entry)

      return keys.sort((a, b) => b.value.updatedAt - a.value.updatedAt).map((data) => data.key)
    } catch (e) {
      log.error('NoteBase - getAllFoldersKeys', e)
      return []
    }
  }

  async subscribeFolder(key) {
    try {
      const db = await this.autobaseDb()
      const watcher = await viewStore.watchFolder(db, key)
      return watcher
    } catch (e) {
      log.error('NoteBase - subscribeFolder', e)
    }
  }

  async subscribeAllFolderKeys() {
    try {
      const db = await this.autobaseDb()
      const watcher = await viewStore.watchAll(db)

      return watcher
    } catch (e) {
      log.error('NoteBase - subscribeAllFolderKeys', e)
    }
  }

  // `noActivity` marks a write that should not appear in the activity log:
  // a backup restore and the pairing merge replay notes that already existed,
  // and recording them as freshly created would fabricate a history. The flag
  // travels on the op so every device skips identically - never make this a
  // local flag read inside apply. See section 9 of the migration plan.
  async addNote({ key, value, noActivity = false }) {
    // The version is read inside the append chain, not here - see `append`.
    const op = { type: DATA_TYPES.ADD_NOTE, key }
    if (noActivity) op.noActivity = true
    await this.append(op, async (staged) => {
      const current = await this.getNote(key)
      const currentVersion = Number.isFinite(current?.version) ? current.version : 0
      const carriedVersion = Number.isFinite(value?.version) ? value.version : 0
      const next = { ...value, version: Math.max(currentVersion, carriedVersion) + 1 }
      delete next.versionBy
      return { ...staged, value: next }
    })
  }

  async removeNote(key) {
    await this.append({ type: DATA_TYPES.REMOVE_NOTE, key })
  }

  async getNote(key) {
    const db = await this.autobaseDb()
    if (!db) return null
    return viewStore.getNote(db, key)
  }

  async trashNote(key) {
    const note = await this.getNote(key)
    if (!note) return false
    if (note.folderKey === RECENTLY_DELETED_KEY) return false

    const now = Date.now()
    await this.addNote({
      key,
      value: {
        ...note,
        folderKey: RECENTLY_DELETED_KEY,
        previousFolderKey: note.folderKey || '',
        deletedAt: now,
        pinned: false,
        updatedAt: now
      }
    })
    return true
  }

  async restoreNote(key) {
    const note = await this.getNote(key)
    if (!note) return { done: false, folderKey: '' }

    const folderKey = await this._resolveRestoreFolder(note.previousFolderKey)
    const value = { ...note, folderKey, updatedAt: Date.now() }
    delete value.previousFolderKey
    delete value.deletedAt

    await this.addNote({ key, value })
    return { done: true, folderKey }
  }

  async _resolveRestoreFolder(previousFolderKey) {
    if (
      previousFolderKey &&
      previousFolderKey !== RECENTLY_DELETED_KEY &&
      previousFolderKey !== ALL_NOTES_KEY
    ) {
      const folder = await this.getFolder(previousFolderKey)
      if (folder) return previousFolderKey
    }
    return this._defaultFolderKey()
  }

  async _defaultFolderKey() {
    const folders = await this.getAllFolders()
    const existing = folders.find((folder) => folder.value?.title === DEFAULT_FOLDER_NAME)
    if (existing) return existing.key

    const key = b4a.toString(crypto.randomBytes(32), 'hex')
    const now = Date.now()
    await this.addFolder({
      key,
      value: { title: DEFAULT_FOLDER_NAME, addedAt: now, updatedAt: now }
    })
    return key
  }

  _scheduleTrashSweep(delay = TRASH_SWEEP_INTERVAL_MS) {
    if (this.isClosing) return
    clearTimeout(this._trashSweepTimer)
    this._trashSweepTimer = setTimeout(() => {
      this.purgeExpiredTrash()
        .catch((e) => log.error('[trash] retention sweep', e))
        .then(() => this._scheduleTrashSweep())
    }, delay)
  }

  async purgeExpiredTrash(now = Date.now()) {
    const notes = await this.getAllNotes()
    let purged = 0

    for (const item of notes) {
      if (item.value?.folderKey !== RECENTLY_DELETED_KEY) continue

      const deletedAt = item.value.deletedAt
      if (!deletedAt) {
        await this.addNote({ key: item.key, value: { ...item.value, deletedAt: now } })
        continue
      }

      if (now - deletedAt < TRASH_RETENTION_MS) continue

      await this.deleteNoteWithMedia(item.key)
      purged++
    }

    return purged
  }

  // Same read, but a failure comes back as a throw instead of an empty list.
  // Anything that DELETES based on "no note references this" has to use it: a
  // swallowed read answers "nothing is referenced", and the caller then clears
  // or tombstones every blob in the vault. Display paths keep `getAllNotes`,
  // where an empty list is only a blank screen until the next update.
  async getAllNotesStrict() {
    const db = await this.autobaseDb()
    if (!db) throw new Error('view database not available')
    const data = []
    for await (const entry of viewStore.notes(db)) {
      if (entry.key === INVITE_KEY) continue
      data.push(entry)
    }
    return data
  }

  async getAllNotes() {
    try {
      const db = await this.autobaseDb()
      if (!db) return []
      const data = []
      for await (const entry of viewStore.notes(db)) {
        if (entry.key === INVITE_KEY) continue
        data.push(entry)
      }
      return data
    } catch (e) {
      log.error('NoteBase - getAllNotes', e)
      return []
    }
  }

  async getAllNoteKeys() {
    try {
      const db = await this.autobaseDb()
      if (!db) return []
      const keys = []
      for await (const entry of viewStore.notes(db)) {
        if (entry.key === INVITE_KEY) continue
        keys.push(entry)
      }

      return keys.sort((a, b) => b.value.updatedAt - a.value.updatedAt).map((data) => data.key)
    } catch (e) {
      log.error('NoteBase - getAllNoteKeys', e)
      return []
    }
  }

  async subscribeAllNoteKeys() {
    try {
      const db = await this.autobaseDb()
      const watcher = await viewStore.watchAll(db)

      return watcher
    } catch (e) {
      log.error('NoteBase - subscribeAllNoteKeys', e)
    }
  }

  async subscribeNote(key) {
    try {
      const db = await this.autobaseDb()
      const watcher = await viewStore.watchNote(db, key)
      return watcher
    } catch (e) {
      log.error('NoteBase - subscribeNote', e)
    }
  }

  async updateSettings({ settings, noActivity = false }) {
    const op = { type: DATA_TYPES.ADD_SETTINGS, value: settings }
    if (noActivity) op.noActivity = true
    await this.append(op)
  }

  async getSettings() {
    const db = await this.autobaseDb()
    if (!db) return null
    return viewStore.getSettings(db)
  }

  async subscribeSettings() {
    try {
      const db = await this.autobaseDb()
      const watcher = await viewStore.watchSettings(db)
      return watcher
    } catch (e) {
      log.error('NoteBase - subscribeSettings', e)
    }
  }

  async addSyncedDevice({ key, value }) {
    await this.append({ type: DATA_TYPES.ADD_SYNCED_DEVICE, key, value })
  }

  async updateSyncedDevice({ key, value }) {
    await this.append({ type: DATA_TYPES.UPDATE_SYNCED_DEVICE, key, value })
  }

  async removeSyncedDevice(key) {
    const db = await this.autobaseDb()
    const device = await viewStore.getSyncedDevice(db, key)
    if (!device) return
    await this.append({
      type: DATA_TYPES.REMOVE_SYNCED_DEVICE,
      key,
      localKey: device.localKey
    })
  }

  async getRawSyncedDevice(key) {
    try {
      const db = await this.autobaseDb()
      if (!db) return null
      return await viewStore.getSyncedDevice(db, key)
    } catch (e) {
      log.error('NoteBase - getRawSyncedDevice', e)
      return null
    }
  }

  async getSyncedDevice(key) {
    const raw = await this.getRawSyncedDevice(key)
    if (!raw) return null
    return this._withPresence(raw)
  }

  _withPresence(device) {
    const localKeyHex = this.localKey ? b4a.toString(this.localKey, 'hex') : null
    const isLocal = !!localKeyHex && device.localKey === localKeyHex
    return {
      ...device,
      isLocal,
      presenceKnown: isLocal || !!device.swarmKey,
      isOnline: isLocal || this.isSwarmKeyOnline(device.swarmKey),
      isIndexer: this.isIndexerKey(device.localKey)
    }
  }

  async publishLocalSwarmKey() {
    const swarmKey = this._swarmKeyHex
    if (!swarmKey || !this.localKey) return
    try {
      const localKeyHex = b4a.toString(this.localKey, 'hex')
      const keys = await this.getAllSyncedDeviceKeys()
      for (const key of keys) {
        const device = await this.getRawSyncedDevice(key)
        if (!device || device.localKey !== localKeyHex) continue
        if (device.swarmKey === swarmKey) return
        await this.updateSyncedDevice({
          key,
          value: { ...device, swarmKey, updatedAt: Date.now() }
        })
        return
      }
    } catch (e) {
      log.error('NoteBase - publishLocalSwarmKey', e)
    }
  }

  async getAllSyncedDeviceKeys() {
    try {
      const db = await this.autobaseDb()
      if (!db) return []
      const keys = []
      for await (const entry of viewStore.syncedDevices(db)) keys.push(entry)

      return keys.sort((a, b) => b.value.updatedAt - a.value.updatedAt).map((data) => data.key)
    } catch (e) {
      log.error('NoteBase - getAllSyncedDeviceKeys', e)
      return []
    }
  }

  async subscribeSyncedDevice(key) {
    try {
      const db = await this.autobaseDb()
      const watcher = await viewStore.watchSyncedDevice(db, key)
      return watcher
    } catch (e) {
      log.error('NoteBase - subscribeSyncedDevice', e)
      return null
    }
  }

  async subscribeAllSyncedDeviceKeys() {
    try {
      const db = await this.autobaseDb()
      const watcher = await viewStore.watchAll(db)

      return watcher
    } catch (e) {
      log.error('NoteBase - subscribeAllSyncedDeviceKeys', e)
      return null
    }
  }

  async wait(ms = 1000) {
    return new Promise((r) => setTimeout(() => r(), ms))
  }

  async _streamFileToDrive(path, key) {
    const readStream = fs.createReadStream(path)
    const writeStream = this.hyperdrive.createWriteStream(key, { metadata: insertedMetadata() })
    await pipelinePromise(readStream, writeStream)
  }

  async insertFileWithProgress(key, path, onProgress, token) {
    return this._withMediaWrite(() => this._insertFileWithProgress(key, path, onProgress, token))
  }

  async _insertFileWithProgress(key, path, onProgress, token) {
    let total = 0
    try {
      total = fs.statSync(path).size
    } catch {
      total = 0
    }
    const readStream = fs.createReadStream(path)
    const writeStream = this.hyperdrive.createWriteStream(key, { metadata: insertedMetadata() })
    let transferred = 0
    const counter = new Transform({
      transform(chunk, cb) {
        transferred += chunk.length
        if (onProgress) onProgress(transferred, total)
        cb(null, chunk)
      }
    })
    if (token) {
      token.destroy = () => {
        readStream.destroy()
        counter.destroy()
        writeStream.destroy()
      }
    }
    if (onProgress) onProgress(0, total)
    await pipelinePromise(readStream, counter, writeStream)
    if (token && token.cancelled) throw new Error('UPLOAD_CANCELLED')
    const link = await this.getFile({ key })
    return link.replace(`${this.getHyperdriveAddress()}`, HYPERDRIVE_URL_PREFIX + '/')
  }

  async insertFile(args) {
    return this._withMediaWrite(() => this._insertFile(args))
  }

  async _insertFile({ key, buffer, path }) {
    try {
      if (path) {
        await this._streamFileToDrive(path, key)
      } else {
        log.debug(`[insertFile] buffer-based: key=${key}, bytes=${buffer ? buffer.length : 'null'}`)
        await this.hyperdrive.put(key, buffer, { metadata: insertedMetadata() })
      }
    } catch (e) {
      log.error(`[insertFile] hyperdrive.put failed for key=${key}:`, e)
      throw e
    }
    const entry = await this.hyperdrive.entry(key)
    log.debug(
      `[insertFile] entry after put: ${entry ? 'found, blob=' + JSON.stringify(entry.value?.blob) : 'NOT FOUND'}`
    )
    const link = await this.getFile({ key })
    return link.replace(`${this.getHyperdriveAddress()}`, HYPERDRIVE_URL_PREFIX + '/')
  }

  async getFile({ key }) {
    const uploaded = await this.hyperdrive.entry(key)
    const link = this.blobServer.getLink(this.hyperdrive.blobs.core.key, {
      blob: uploaded.value.blob
    })
    return link
  }

  async _resolveMediaPath(key) {
    if (!key) return null
    if (!key.includes('blob=')) return key
    const url = key.startsWith(HYPERDRIVE_URL_PREFIX)
      ? key
      : HYPERDRIVE_URL_PREFIX + '/' + key.replace(/^\/+/, '')
    const ref = blobRefFromUrl(url)
    if (!ref) return null
    return await this._localEntryForRef(ref.blockOffset, ref.blockLength)
  }

  async _compactStorage(core = this.hyperdrive.blobs?.core, thorough = true) {
    if (!core) return
    try {
      const storage = core.state?.storage
      const opts = thorough ? THOROUGH_COMPACTION_OPTS : {}
      if (storage?.store?.compact) await storage.store.compact(opts)
      else if (storage?.compact) await storage.compact(opts)
    } catch (e) {
      log.error('_compactStorage', e)
    }
  }

  _cancelExternalDownload(coreKeyHex, url) {
    const ref = blobRefFromUrl(url)
    if (!ref) return
    const registryKey = `${coreKeyHex}:${ref.blockOffset}:${ref.blockLength}`
    const entry = this._downloadRegistry.get(registryKey)
    if (!entry) return
    if (entry.handle) entry.handle.destroy()
    this._activeDownloadKeys.delete(registryKey)
    this._dropPendingDownload(registryKey)
    this._downloadRegistry.delete(registryKey)
    this._pumpDownloadQueue()
  }

  // Strict on purpose: the return value decides which blocks survive a reclaim,
  // so a read that failed must not be read as "nothing is referenced".
  async _keepRangesForCore(coreKeyHex, dropRetained = false) {
    const notes = await this.getAllNotesStrict()
    const map = this._mediaStore.map || {}
    const ranges = []
    for (const { value } of notes) {
      if (!value?.note) continue
      const content = normalizeAttachmentUrls(value.note).replace(/&amp;/g, '&')
      const re = /http:\/\/hyperdrive\/\?[^"'\s<>]*/g
      let match
      while ((match = re.exec(content)) !== null) {
        const url = match[0]
        const ref = blobRefFromUrl(url)
        if (!ref || !ref.blockLength) continue
        const urlCoreKeyHex = blobCoreKeyHexFromUrl(url)
        if (urlCoreKeyHex === coreKeyHex) {
          ranges.push([ref.blockOffset, ref.blockOffset + ref.blockLength])
        }
        const target = urlCoreKeyHex && map[mediaRefKey(urlCoreKeyHex, ref)]
        if (target && target.coreKeyHex === coreKeyHex) {
          ranges.push([target.blockOffset, target.blockOffset + target.blockLength])
        }
      }
    }
    if (!dropRetained) ranges.push(...(await this._retainedRangesForCore(coreKeyHex)))
    return ranges
  }

  _mergeRanges(ranges) {
    const sorted = [...ranges].sort((a, b) => a[0] - b[0])
    const merged = []
    for (const range of sorted) {
      const last = merged[merged.length - 1]
      if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1])
      else merged.push([range[0], range[1]])
    }
    return merged
  }

  async _clearUnreferencedRanges(core, keep) {
    const len = core.length
    if (!len) return false

    const merged = this._mergeRanges(keep)

    let cursor = 0
    let cleared = 0
    for (const [start, end] of merged) {
      if (start > cursor) cleared += await clearBlockRange(core, cursor, start)
      if (end > cursor) cursor = end
    }
    if (cursor < len) cleared += await clearBlockRange(core, cursor, len)
    return cleared > 0
  }

  // Use this instead of hyperdrive.clear(path), which must never be called
  // directly: see clearBlockRange in backupManager.js.
  async _clearDriveEntry(path) {
    const entry = await this.hyperdrive.entry(path)
    const blob = entry?.value?.blob
    if (!blob || !blob.blockLength) return 0
    return clearBlockRange(
      this.hyperdrive.blobs.core,
      blob.blockOffset,
      blob.blockOffset + blob.blockLength
    )
  }

  async _tombstonedExternalCoreKeys() {
    const keys = new Set()
    const db = await this.autobaseDb()
    if (!db) return keys

    const myBlobCoreKeyHex = b4a.toString(this.hyperdrive.blobs.core.key, 'hex')
    for await (const { key: refKey } of viewStore.mediaTombstones(db)) {
      const [coreKeyHex] = refKey.split(':')
      if (!coreKeyHex || coreKeyHex === myBlobCoreKeyHex) continue
      keys.add(coreKeyHex)
    }
    return keys
  }

  async _sweepExternalCore(coreKeyHex, dropRetained = false) {
    let core
    try {
      core = await this._getExternalCore(coreKeyHex)
    } catch (e) {
      log.error('[downloads] sweep failed to open external core', log.redact(coreKeyHex), e.message)
      return false
    }

    const keep = await this._keepRangesForCore(coreKeyHex, dropRetained)
    const cleared = await this._clearUnreferencedRanges(core, keep)
    if (cleared) await this._compactStorage(core)
    return cleared
  }

  async deleteFile(key) {
    const path = await this._resolveMediaPath(key)
    if (!path) return
    await this._tombstoneDrivePath(path)
    await this.hyperdrive.del(path)
    await this._compactStorage()
    this.emit('storage-changed')
  }

  _contentUrlForBlob(blob) {
    const serverUrl = this.blobServer.getLink(this.hyperdrive.blobs.core.key, { blob })
    return serverUrl.replace(this.getHyperdriveAddress(), HYPERDRIVE_URL_PREFIX + '/')
  }

  async _tombstoneDrivePath(path) {
    const entry = await this.hyperdrive.entry(path)
    const blob = entry?.value?.blob
    if (!blob) return false
    await this._appendMediaTombstone(this._contentUrlForBlob(blob))
    return true
  }

  _mediaRefKey(url) {
    const coreKeyHex = blobCoreKeyHexFromUrl(url)
    const ref = blobRefFromUrl(url)
    if (!coreKeyHex || !ref || !ref.blockLength) return null
    return `${coreKeyHex}:${ref.blockOffset}:${ref.blockLength}`
  }

  async _appendMediaTombstone(url) {
    const refKey = this._mediaRefKey(url)
    if (!refKey) return
    await this.append({
      type: DATA_TYPES.DELETE_MEDIA,
      refKey,
      url,
      deletedAt: Date.now()
    })
  }

  _mediaRefKeysFromNotes(notes) {
    const refKeys = new Set()
    const map = this._mediaStore.map || {}
    for (const { value } of notes) {
      if (!value?.note) continue
      const content = normalizeAttachmentUrls(value.note).replace(/&amp;/g, '&')
      const re = /http:\/\/hyperdrive\/\?[^"'\s<>]*/g
      let match
      while ((match = re.exec(content)) !== null) {
        const refKey = this._mediaRefKey(match[0])
        if (!refKey) continue
        refKeys.add(refKey)
        // A note still carrying a link from before a media rebuild references the
        // copy, which the relink pass will point it at.
        const target = map[refKey]
        if (target) refKeys.add(mediaRefKey(target.coreKeyHex, target))
      }
    }
    return refKeys
  }

  async _localEntryForRef(blockOffset, blockLength) {
    for await (const entry of this.hyperdrive.list('/', { recursive: true })) {
      const blob = entry.value?.blob
      if (blob && blob.blockOffset === blockOffset && blob.blockLength === blockLength) {
        return entry.key
      }
    }
    return null
  }

  async _applyMediaTombstones() {
    if (this._mediaRebuilding) return
    const db = await this.autobaseDb()
    if (!db) return

    const notes = await this.getAllNotes()
    if (!notes.length) return

    const myBlobCoreKeyHex = b4a.toString(this.hyperdrive.blobs.core.key, 'hex')
    const referenced = this._mediaRefKeysFromNotes(notes)
    const externalCores = new Set()
    const now = Date.now()
    let localCleared = false
    let earliestExpiryAt = 0
    let prunable = false
    let localEntries = null

    for await (const { key: refKey, value } of viewStore.mediaTombstones(db)) {
      if (referenced.has(refKey)) continue
      const deletedAt = value?.deletedAt || 0
      if (deletedAt && now - deletedAt > MEDIA_TOMBSTONE_PRUNE_AGE_MS) prunable = true
      const [coreKeyHex, blockOffset, blockLength] = refKey.split(':')
      if (coreKeyHex === myBlobCoreKeyHex) {
        if (!localEntries) localEntries = await this._localEntriesByRefKey(myBlobCoreKeyHex)
        const path = localEntries.get(refKey)
        if (path) {
          await this.hyperdrive.del(path)
          localEntries.delete(refKey)
          localCleared = true
        }
        const expiresAt = deletedAt + MEDIA_RETENTION_MS
        if (expiresAt > now) {
          if (!earliestExpiryAt || expiresAt < earliestExpiryAt) earliestExpiryAt = expiresAt
          continue
        }
        const start = Number(blockOffset)
        const end = start + Number(blockLength)
        if ((await clearBlockRange(this.hyperdrive.blobs.core, start, end)) > 0) {
          localCleared = true
        }
      } else if (value?.url) {
        this._cancelExternalDownload(coreKeyHex, value.url)
        externalCores.add(coreKeyHex)
      }
    }

    this._scheduleRetentionSweep(earliestExpiryAt)

    let externalCleared = false
    for (const coreKeyHex of externalCores) {
      externalCleared =
        (await this._sweepExternalCore(coreKeyHex).catch((e) => {
          log.error('[tombstone] external sweep failed', log.redact(coreKeyHex), e.message)
          return false
        })) || externalCleared
    }

    if (localCleared) await this._compactStorage()
    if (localCleared || externalCleared) this.emit('storage-changed')

    if (prunable && this.autobase?.writable && !this.isClosing) {
      await this.append({
        type: DATA_TYPES.PRUNE_MEDIA_TOMBSTONES,
        cutoff: now - MEDIA_TOMBSTONE_PRUNE_AGE_MS
      })
    }
  }

  async _localEntriesByRefKey(coreKeyHex) {
    const entries = new Map()
    for await (const entry of this.hyperdrive.list('/', { recursive: true })) {
      const blob = entry.value?.blob
      if (!blob || !blob.blockLength) continue
      entries.set(mediaRefKey(coreKeyHex, blob), entry.key)
    }
    return entries
  }

  async _pruneMediaTombstoneEntries(db, cutoff) {
    if (!Number.isFinite(cutoff) || cutoff <= 0) return
    const expired = []
    for await (const { key: refKey, value } of viewStore.mediaTombstones(db)) {
      const deletedAt = value?.deletedAt
      if (Number.isFinite(deletedAt) && deletedAt < cutoff) expired.push(refKey)
    }
    for (const refKey of expired) await viewStore.delMediaTombstone(db, refKey)
  }

  async _pruneUnreferencedLocalMedia() {
    if (this._mediaRebuilding) return 0
    const notes = await this.getAllNotes()
    if (!notes.length) return 0

    const referenced = this._mediaRefKeysFromNotes(notes)
    const myBlobCoreKeyHex = b4a.toString(this.hyperdrive.blobs.core.key, 'hex')
    const inFlight = new Set()
    for (const entry of this._uploadRegistry.values()) {
      if (entry.url) inFlight.add(entry.url)
    }

    const retained = new Set(
      ((await this._retainedMediaRefs()).get(myBlobCoreKeyHex) || []).map(
        (entry) => `${myBlobCoreKeyHex}:${entry.range[0]}:${entry.range[1] - entry.range[0]}`
      )
    )
    const graceCutoff = Date.now() - ORPHAN_MEDIA_GRACE_MS
    const orphaned = []
    for await (const entry of this.hyperdrive.list('/', { recursive: true })) {
      const blob = entry.value?.blob
      if (!blob || !blob.blockLength) continue
      const refKey = `${myBlobCoreKeyHex}:${blob.blockOffset}:${blob.blockLength}`
      if (referenced.has(refKey) || retained.has(refKey)) continue
      if (inFlight.has(this._contentUrlForBlob(blob))) continue
      const insertedAt = entry.value?.metadata?.insertedAt
      if (Number.isFinite(insertedAt) && insertedAt > graceCutoff) continue
      orphaned.push(entry.key)
    }

    for (const path of orphaned) {
      await this._clearDriveEntry(path)
      await this.hyperdrive.del(path)
    }

    if (orphaned.length) {
      await this._compactStorage()
      this.emit('storage-changed')
    }
    return orphaned.length
  }

  async deleteNoteFile(noteKey, mediaPath) {
    const myBlobCoreKeyHex = b4a.toString(this.hyperdrive.blobs.core.key, 'hex')
    const externalCoreKeyHex = mediaPath.includes('blob=') ? blobCoreKeyHexFromUrl(mediaPath) : null
    const isExternal = !!externalCoreKeyHex && externalCoreKeyHex !== myBlobCoreKeyHex

    let contentUrl = null
    if (isExternal) {
      contentUrl = mediaPath
    } else {
      const drivePath = await this._resolveMediaPath(mediaPath)
      const entry = drivePath ? await this.hyperdrive.entry(drivePath) : null
      if (entry?.value?.blob) contentUrl = this._contentUrlForBlob(entry.value.blob)
      else if (externalCoreKeyHex === myBlobCoreKeyHex) contentUrl = mediaPath
      if (drivePath) {
        await this.hyperdrive.del(drivePath)
      }
    }

    if (contentUrl) {
      const note = await this.getNote(noteKey)
      if (note?.note) {
        const updatedContent = stripMediaReferences(note.note, new Set([contentUrl]))
        if (updatedContent !== note.note) {
          await this.addNote({
            key: noteKey,
            value: { ...note, note: updatedContent, updatedAt: Date.now() }
          })
        }
      }
      await this._appendMediaTombstone(contentUrl)
    }

    if (isExternal) {
      this._cancelExternalDownload(externalCoreKeyHex, mediaPath)
      await this._sweepExternalCore(externalCoreKeyHex)
    } else {
      await this._compactStorage()
    }
    this.emit('storage-changed')
  }

  // Media that leaves one note is not necessarily gone: another note may still
  // use it, the user may undo, or an editor holding stale content may have just
  // saved over a relinked note. So nothing is cleared here; removed files are
  // tombstoned and the tombstone sweep frees them once no note references them
  // and the retention window has passed.
  async pruneRemovedMedia(noteKey, oldContent, newContent) {
    const before = extractMediaUrls(oldContent)
    const after = extractMediaUrls(newContent)
    const removed = [...before].filter((url) => !after.has(url))
    if (!removed.length) return

    // Strict: an empty list here tombstones attachments that other notes still
    // use, and the retention window is the only thing standing between that and
    // deleted bytes.
    const referenced = this._mediaRefKeysFromNotes(await this.getAllNotesStrict())
    const myBlobCoreKeyHex = b4a.toString(this.hyperdrive.blobs.core.key, 'hex')
    let tombstoned = false
    for (const url of removed) {
      const refKey = this._mediaRefKey(url)
      if (!refKey || referenced.has(refKey)) continue
      const coreKeyHex = blobCoreKeyHexFromUrl(url)
      if (coreKeyHex && coreKeyHex !== myBlobCoreKeyHex) {
        this._cancelExternalDownload(coreKeyHex, url)
      }
      await this._appendMediaTombstone(url)
      tombstoned = true
    }

    if (!tombstoned) return
    await this._applyMediaTombstones()
    this.emit('storage-changed')
  }

  async deleteNoteWithMedia(noteKey) {
    const mediaKeys = []
    for await (const entry of this.hyperdrive.list('/', { recursive: true })) {
      const entryPath = entry.key.startsWith('/') ? entry.key.slice(1) : entry.key
      if (entryPath.startsWith(noteKey + '/')) {
        mediaKeys.push(entry.key)
      }
    }
    for (const key of mediaKeys) {
      await this._tombstoneDrivePath(key)
      await this.hyperdrive.del(key)
    }
    await this.removeNote(noteKey)
    if (mediaKeys.length) await this._compactStorage()
  }

  async reclaimOrphanedBlobs(thorough = false, dropRetained = false) {
    if (this._mediaRebuilding) return { reclaimedBytes: 0 }
    const core = this.hyperdrive.blobs?.core
    if (!core) return { reclaimedBytes: 0 }
    await core.ready()
    const liveBlobs = await this._localLiveBlobs()
    const before = measureLocalBlobBytes(core, liveBlobs).presentBytes

    const keep = liveBlobs.map((blob) => [blob.blockOffset, blob.blockOffset + blob.blockLength])
    const myBlobCoreKeyHex = b4a.toString(core.key, 'hex')
    keep.push(...(await this._keepRangesForCore(myBlobCoreKeyHex, dropRetained)))

    const cleared = await this._clearUnreferencedRanges(core, keep)

    const after = measureLocalBlobBytes(core, liveBlobs).presentBytes

    await this._compactStorage(core, thorough || cleared)

    const externalCoreKeys = new Set(this._downloadCores.keys())
    for (const coreKeyHex of this._mediaStore.externalCores || []) externalCoreKeys.add(coreKeyHex)
    for (const coreKeyHex of await this._tombstonedExternalCoreKeys()) {
      externalCoreKeys.add(coreKeyHex)
    }
    externalCoreKeys.delete(myBlobCoreKeyHex)
    for (const coreKeyHex of externalCoreKeys) {
      await this._sweepExternalCore(coreKeyHex, dropRetained).catch((e) =>
        log.error('[reclaim] external sweep failed', log.redact(coreKeyHex), e.message)
      )
      const core = this._downloadCores.get(coreKeyHex)?.core
      const stillReferenced = (await this._keepRangesForCore(coreKeyHex, dropRetained)).length > 0
      if (core && !stillReferenced && blocksPresent(core, 0, core.length) === 0) {
        this._forgetExternalCore(coreKeyHex)
      }
    }

    this.emit('storage-changed')

    return { reclaimedBytes: Math.max(0, before - after) }
  }

  async waitForData(cb = (status) => status) {
    const pollInterval = 1000
    const minWaitTime = 2000
    const maxWaitTime = 30000
    let lastNotesCount = -1
    const startTime = Date.now()

    await this.wait(minWaitTime)

    while (true) {
      if (this.isClosing || !this.autobase) return
      const elapsed = Date.now() - startTime
      try {
        log.debug('[waitForData] Updating local heads...')
        await this.autobase.update()

        const notes = await this.getAllNoteKeys()
        const folders = await this.getAllFoldersKeys()
        const syncedDevices = await this.getAllSyncedDeviceKeys()
        const userNotes = notes.filter((key) => key !== INVITE_KEY)

        if (userNotes.length !== lastNotesCount) {
          log.debug(
            `[waitForData] Current state - User Notes: ${userNotes.length}, Folders: ${folders.length}, Devices: ${syncedDevices.length}, Total Notes: ${notes.length}`
          )
          cb({ step: 'receiving_data', progress: 90, data: userNotes.length })
          lastNotesCount = userNotes.length
        }

        if (userNotes.length > 0 || folders.length > 0 || syncedDevices.length > 0) {
          log.debug(
            `[waitForData] Found ${userNotes.length} user notes, ${folders.length} folders, and ${syncedDevices.length} devices`
          )
          await this.autobase.update()
          return
        }

        if (elapsed >= maxWaitTime) {
          log.debug('[waitForData] Max wait time reached, proceeding with empty state')
          return
        }

        await this.wait(pollInterval)
      } catch (e) {
        log.error('[waitForData] Error checking for data:', e)
        if (Date.now() - startTime >= maxWaitTime) return
        await this.wait(pollInterval)
      }
    }
  }

  async getNotesStorageInfo() {
    const notes = await this.getAllNotes()
    const info = await computeStorageInfo(this, notes)
    return { ...info, downloads: this.getDownloadsInfo(), uploads: this.getUploadsInfo() }
  }

  async getDebugInfo(heavy = false) {
    const base = this.autobase
    const system = base?.system || null
    const indexerKeys = this.getIndexerKeys()
    const indexerCount = indexerKeys.length

    const autobase = {
      opened: !!base,
      autobaseKey: hexOrNull(base?.key),
      discoveryKey: hexOrNull(base?.discoveryKey),
      systemKey: hexOrNull(base?.core?.key),
      length: numberOrNull(base?.length),
      indexedLength: numberOrNull(base?.indexedLength),
      signedLength: numberOrNull(base?.signedLength),
      backlog:
        typeof base?.length === 'number' && typeof base?.indexedLength === 'number'
          ? base.length - base.indexedLength
          : null,
      writable: boolOrNull(base?.writable),
      ackable: boolOrNull(base?.ackable),
      flushing: boolOrNull(base?.flushing),
      linearizing: !!this._linearizing,
      linearizerSize: numberOrNull(base?.linearizer?.size),
      linearizerUpdated: boolOrNull(base?.linearizer?.updated),
      activeWriters: numberOrNull(base?.activeWriters?.size),
      localKey: hexOrNull(base?.local?.key),
      // autobase's _appendBatch spins `while (this._appended < target)` and its
      // only escape hatch is `runs >= 16 && localWriter.idle()`. _addLocalHeads
      // also refuses to flush unless the writer is idle - so a writer that is
      // persistently non-idle makes that loop unbounded, which is what a single
      // multi-second autobase.append looks like from the outside.
      localWriterLength: numberOrNull(base?.localWriter?.length),
      localWriterAvailable: numberOrNull(base?.localWriter?.available),
      localWriterCoreLength: numberOrNull(base?.localWriter?.core?.length),
      localWriterIdle: base?.localWriter ? !!base.localWriter.idle() : null,
      localWriterRemoved: boolOrNull(base?.localWriter?.isRemoved),
      appendingQueued: numberOrNull(base?._appending?.length),
      appendedCount: numberOrNull(base?._appended),
      localLength: numberOrNull(base?.local?.length),
      localFork: numberOrNull(base?.local?.fork),
      systemVersion: numberOrNull(system?.version),
      systemMembers: numberOrNull(system?.members),
      pendingIndexers: numberOrNull(system?.pendingIndexers?.length),
      heads: numberOrNull(system?.heads?.length),
      views: numberOrNull(system?.views?.length),
      indexerKeys,
      indexerCount,
      majority: indexerCount ? (indexerCount >>> 1) + 1 : null,
      isLocalIndexer: this.isLocalIndexer(),
      applyNodesSinceBoot: this._applyNodesDuringBoot,
      applyBatchesSinceBoot: this._applyBatchesDuringBoot,
      baseErrorRecoveries: this._baseErrorRecoveries,
      lastBaseErrorAt: this._lastBaseErrorAt,
      recoveringBase: !!this._recoveringBase,
      readOnly: !!this._readOnly,
      isClosing: !!this.isClosing,
      encryptionFingerprint: this._encryptionFingerprint()
    }

    try {
      const db = await this.autobaseDb()
      autobase.viewVersion = numberOrNull(db?.version)
      autobase.viewCoreLength = numberOrNull(db?.core?.length)
      // THE health check to look at after a restore or a relink. The view is a
      // B-tree: a write walks it, every internal node it touches is a
      // `core.get()`, and a get for a block this device does not hold waits on a
      // peer. So a view that is not fully local is a device that will eventually
      // fail to save. A device that replayed the log has viewComplete true; one
      // that adopted a peer's view (pairing, fast-forward) may not.
      const viewCore = db?.core || null
      autobase.viewContiguousLength = numberOrNull(viewCore?.contiguousLength)
      autobase.viewMissingBlocks = viewCore ? await countMissingBlocks(viewCore) : null
      autobase.viewComplete = viewCore ? autobase.viewMissingBlocks === 0 : null
      autobase.viewSignedLength = numberOrNull(viewCore?.signedLength)
    } catch (e) {
      autobase.viewVersion = null
      autobase.viewCoreLength = null
      autobase.viewContiguousLength = null
      autobase.viewMissingBlocks = null
      autobase.viewComplete = null
      autobase.viewError = String(e?.message || e)
    }

    autobase.viewBackfilling = !!this._viewBackfilling
    autobase.lastViewBackfillAt = this._lastViewBackfill?.at ?? null
    autobase.lastViewBackfillResult = this._lastViewBackfill?.result ?? null
    autobase.lastFastForwardAt = this._lastFastForward?.at ?? null
    autobase.lastFastForwardFrom = this._lastFastForward?.from ?? null
    autobase.lastFastForwardTo = this._lastFastForward?.to ?? null
    autobase.autobaseWarnings = this._autobaseWarnings
    const loggedErrors = errorLog.list.filter((e) => e.level === 'error' || e.level === 'fatal')
    autobase.errorLogEntries = errorLog.list.length
    autobase.lastErrorAt = loggedErrors.length ? loggedErrors[loggedErrors.length - 1].lastAt : null

    const writers = []
    try {
      for (const w of base?.activeWriters || []) {
        writers.push({
          key: hexOrNull(w.core?.key),
          linearized: numberOrNull(w.length),
          indexed: numberOrNull(w.indexed),
          coreLength: numberOrNull(w.core?.length),
          contiguousLength: numberOrNull(w.core?.contiguousLength),
          peers: numberOrNull(w.core?.peers?.length),
          isIndexer: !!w.isActiveIndexer,
          isRemoved: !!w.isRemoved,
          coreOpen: !!w.core?.opened,
          seenLength: numberOrNull(w.seenLength)
        })
      }
    } catch (e) {
      autobase.writersError = String(e?.message || e)
    }

    const swarm = {
      started: !!this.swarm,
      joined: !!this.discovery,
      publicKey: this._swarmKeyHex || null,
      connections: numberOrNull(this.swarm?.connections?.size),
      peers: numberOrNull(this.swarm?.peers?.size),
      connecting: numberOrNull(this.swarm?.connecting),
      connectedKeys: [...this._connectedSwarmKeys],
      retryDelayMs: this._swarmRetryDelay,
      suspended: !!this._suspended,
      suspending: !!this._suspending,
      resuming: !!this._resuming,
      mediaSyncHeld: !!this._mediaSyncHeld,
      activeDownloads: this._downloadRegistry.size,
      activeUploads: this._uploadRegistry.size,
      downloads: this.getDownloadsInfo(),
      uploads: this.getUploadsInfo()
    }

    let devices = []
    try {
      const keys = await this.getAllSyncedDeviceKeys()
      for (const key of keys) {
        const raw = await this.getRawSyncedDevice(key)
        if (!raw) continue
        const withPresence = this._withPresence(raw)
        devices.push({
          title: withPresence.title || '',
          deviceType: withPresence.deviceType || '',
          platform: withPresence.platform || '',
          localKey: withPresence.localKey || '',
          swarmKey: withPresence.swarmKey || '',
          isLocal: withPresence.isLocal,
          isOnline: withPresence.isOnline,
          presenceKnown: withPresence.presenceKnown,
          isIndexer: withPresence.isIndexer
        })
      }
    } catch (e) {
      devices = []
      swarm.devicesError = String(e?.message || e)
    }

    const drive = this.hyperdrive
    const storage = {
      driveKey: hexOrNull(drive?.key),
      driveDiscoveryKey: hexOrNull(drive?.discoveryKey),
      driveContentKey: hexOrNull(drive?.contentKey),
      driveVersion: numberOrNull(drive?.version),
      driveCoreLength: numberOrNull(drive?.core?.length),
      blobsCoreLength: numberOrNull(drive?.blobs?.core?.length),
      blobsBlockSize: numberOrNull(drive?.blobs?.blockSize),
      blobsPeers: numberOrNull(drive?.blobs?.core?.peers?.length),
      blobServerAddress: this.blobServer ? this.getHyperdriveAddress() : null,
      corePath: this.corePath,
      localBlobRanges: this._localBlobRangeIndex.length,
      mediaStoreGeneration: this._mediaStore.generation,
      mediaRebuildRunning: !!this._mediaRebuild,
      mediaLastRebuildAt: this._mediaStore.lastRebuildAt || null,
      mediaRelinkEntries: Object.keys(this._mediaStore.map || {}).length,
      mediaRetiredPending: this._mediaStore.retired.filter((retired) => !retired.cleared).length,
      mediaHealthCheckedAt: this._lastMediaHealth?.checkedAt || null,
      mediaMissingProofNodes: this._lastMediaHealth ? this._lastMediaHealth.missingNodes : null,
      mediaStalePeers: this._lastMediaHealth ? this._lastMediaHealth.stalePeers : null
    }

    if (heavy) {
      try {
        const notes = await this.getAllNotes()
        const folders = await this.getAllFolders()
        const info = await computeStorageInfo(this, notes)
        storage.noteCount = notes.filter(
          (note) => note.value?.folderKey !== RECENTLY_DELETED_KEY
        ).length
        storage.trashedCount = notes.filter(
          (note) => note.value?.folderKey === RECENTLY_DELETED_KEY
        ).length
        storage.folderCount = folders.length
        storage.totalBlobBytes = info.totalBlobBytes
        storage.totalOnDiskBytes = info.totalOnDiskBytes
        storage.reclaimableBytes = info.reclaimableBytes
        storage.attachmentCount = info.notes?.length ?? null
      } catch (e) {
        storage.heavyError = String(e?.message || e)
      }

      try {
        const stats = await this.getActivityStats()
        storage.activityCount = stats.count
        storage.activityBytes = stats.bytes
        storage.activityOldestAt = stats.oldestAt
      } catch (e) {
        storage.activityError = String(e?.message || e)
      }
    }

    return {
      capturedAt: Date.now(),
      heavy: !!heavy,
      autobase,
      swarm,
      devices,
      writers,
      storage,
      runtime: {
        platform: platform(),
        bareVersion: globalThis.Bare?.version || null,
        collaborationEnabled: COLLABORATION_ENABLED
      },
      backendBoot: backendBoot.snapshot()
    }
  }

  _encryptionFingerprint() {
    const key = this.autobase?.encryptionKey || this.encryptionKey
    if (!key || key.length === 0) return null
    try {
      return crypto.createHash('sha256').update(key).digest('hex').slice(0, 8)
    } catch (e) {
      log.error('NoteBase - _encryptionFingerprint', e)
      return null
    }
  }

  async subscribeStorageInfo() {
    const db = await this.autobaseDb()
    const autobaseWatcher = await viewStore.watchAll(db)

    const updateListeners = []
    const transferListeners = []
    const notify = (listeners) => () => {
      for (const cb of listeners) cb()
    }

    // The transfer ticker fires every second, which used to reset a one-second
    // debounce forever - the frontend never saw a single update while a transfer
    // was running. The max wait is what bounds that.
    const schedule = debounceWithMaxWait(
      notify(updateListeners),
      STORAGE_INFO_DEBOUNCE_MS,
      STORAGE_INFO_MAX_WAIT_MS
    )
    const scheduleTransfers = debounceWithMaxWait(
      notify(transferListeners),
      TRANSFER_INFO_DEBOUNCE_MS,
      TRANSFER_INFO_MAX_WAIT_MS
    )

    autobaseWatcher.on('update', schedule)
    this.hyperdrive.core.on('append', schedule)
    this.hyperdrive.blobs.core.on('append', schedule)
    this.on('storage-changed', schedule)
    this.on('transfer-progress', scheduleTransfers)

    return {
      on(event, cb) {
        if (event === 'update') updateListeners.push(cb)
        if (event === 'transfers') transferListeners.push(cb)
      },
      close: async () => {
        schedule.cancel()
        scheduleTransfers.cancel()
        await autobaseWatcher.close()
        this.hyperdrive.core.removeListener('append', schedule)
        this.hyperdrive.blobs.core.removeListener('append', schedule)
        this.removeListener('storage-changed', schedule)
        this.removeListener('transfer-progress', scheduleTransfers)
        updateListeners.length = 0
        transferListeners.length = 0
      }
    }
  }

  // `strict` refuses to write a backup that is missing any attachment a note
  // references, instead of skipping it quietly. Use it whenever the backup is
  // the only copy that survives - migrating to a fresh vault, most of all.
  async exportBackup(password, filePath, cb = (status) => status, signal = null, options = {}) {
    if (typeof filePath === 'function') {
      cb = filePath
      filePath = null
    }
    cb({ step: 'reading_data', progress: 5, message: 'Reading notes and folders' })
    const notes = await this.getAllNotes()
    const folders = await this.getAllFolders()
    const settings = await this.getSettings()
    return buildBackup(this, notes, folders, settings, password, filePath, cb, signal, options)
  }

  async importBackup({
    buffer,
    filePath,
    recoveryKey,
    password,
    signal = null,
    cb = (status) => status
  }) {
    const summary = await this._withMediaWrite(() =>
      restoreBackup(this, { buffer, filePath, recoveryKey, password, signal }, cb)
    )
    await this.logActivityEvent(ACTIVITY_EVENT.BACKUP_RESTORED)
    cb({ step: 'reclaiming_storage', progress: 98, message: 'Reclaiming storage' })
    await this.reclaimOrphanedBlobs(true).catch((e) =>
      log.error('[importBackup] reclaim after restore failed', e)
    )
    return summary
  }

  async clearStorage() {
    await this._shutdown()
    if (fs.existsSync(this.corePath)) {
      fs.rmSync(this.corePath, { recursive: true, force: true })
    }
    const seedPath = this._swarmSeedPath()
    if (fs.existsSync(seedPath)) {
      fs.rmSync(seedPath, { force: true })
    }
    this._swarmKeyHex = null
    for (const dir of [PREFERENCE_DIR, PREFERENCE_LEGACY_DIR]) {
      const prefPath = barePath.join(this.path, dir)
      if (fs.existsSync(prefPath)) {
        fs.rmSync(prefPath, { recursive: true, force: true })
      }
    }
    if (fs.existsSync(this.path)) {
      // LEGACY(hyperdb-migration): keep the vault start-fresh preserved, see plan section 8
      for (const name of fs.readdirSync(this.path)) {
        if (name.startsWith(PRESERVED_LEGACY_DIR)) continue
        fs.rmSync(barePath.join(this.path, name), { recursive: true, force: true })
      }
      if (fs.readdirSync(this.path).length === 0) fs.rmSync(this.path, { recursive: true })
    }
  }

  async _syncClusterMembership() {
    const empty = { ownKey: null, otherDevices: 0 }
    if (!this.localKey) return empty
    const localKeyHex = b4a.toString(this.localKey, 'hex')
    const keys = await this.getAllSyncedDeviceKeys()
    let ownKey = null
    let otherDevices = 0
    for (const key of keys) {
      const device = await this.getRawSyncedDevice(key)
      if (!device) continue
      if (device.localKey === localKeyHex) ownKey = key
      else otherDevices += 1
    }
    return { ownKey, otherDevices }
  }

  _waitForLocalReplication(targetLength, timeoutMs) {
    const core = this.autobase?.local
    if (!core) return Promise.resolve(false)

    const isReplicated = () =>
      core.peers.some((peer) => (peer.remoteContiguousLength ?? 0) >= targetLength)

    if (isReplicated()) return Promise.resolve(true)

    return new Promise((resolve) => {
      let settled = false
      const finish = (ok) => {
        if (settled) return
        settled = true
        clearInterval(poll)
        clearTimeout(timer)
        core.off('upload', onUpload)
        resolve(ok)
      }
      const onUpload = (index) => {
        if (index >= targetLength - 1) finish(true)
      }
      const poll = setInterval(() => {
        if (isReplicated()) finish(true)
      }, LEAVE_CLUSTER_POLL_MS)
      const timer = setTimeout(() => finish(false), timeoutMs)
      core.on('upload', onUpload)
    })
  }

  async leaveSyncCluster({ timeoutMs = LEAVE_CLUSTER_TIMEOUT_MS } = {}) {
    const skipped = { left: false, replicated: false }
    if (!this.autobase || this.isClosing) return skipped
    if (!this.autobase.writable) {
      log.debug('[leaveSyncCluster] base is no longer writable, nothing to announce')
      return skipped
    }

    let membership
    try {
      membership = await this._syncClusterMembership()
    } catch (e) {
      log.error('[leaveSyncCluster] could not look up this device', e)
      return skipped
    }

    if (!membership.ownKey || membership.otherDevices === 0) return skipped

    this._leavingCluster = true
    try {
      await this.removeSyncedDevice(membership.ownKey)
    } catch (e) {
      log.error('[leaveSyncCluster] could not announce departure', e)
      return skipped
    }

    const targetLength = this.autobase.local?.length ?? 0
    const replicated = await this._waitForLocalReplication(targetLength, timeoutMs)
    if (!replicated) {
      log.warn(
        '[leaveSyncCluster] departure was not replicated before the timeout, other devices may still list this one'
      )
    }
    return { left: true, replicated }
  }

  broadcastYjsUpdate(noteId, data) {
    if (!COLLABORATION_ENABLED) return
    if (this.yjsExtension && noteId) {
      this.yjsExtension.broadcast({ noteId, data })
    }
  }

  subscribeYjsUpdate(noteId, cb) {
    if (!COLLABORATION_ENABLED) return () => {}
    if (!this._yjsListeners.has(noteId)) {
      this._yjsListeners.set(noteId, new Set())
    }
    this._yjsListeners.get(noteId).add(cb)
    return () => {
      const listeners = this._yjsListeners.get(noteId)
      if (listeners) {
        listeners.delete(cb)
        if (listeners.size === 0) {
          this._yjsListeners.delete(noteId)
        }
      }
    }
  }
}

export { MEDIA_RETENTION_MS }

export function setDefaultSwarmBootstrap(bootstrap) {
  defaultSwarmBootstrap = bootstrap || null
}

export default NoteBase
