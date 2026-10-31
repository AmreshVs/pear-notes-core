import Autobase from 'autobase'
import b4a from 'b4a'
import crypto from 'bare-crypto'
import fs from 'bare-fs'
import { platform } from 'bare-os'
import barePath from 'bare-path'
import BlindEncryptionSodium from 'blind-encryption-sodium'
import BlindPairing from 'blind-pairing'
import Corestore from 'corestore'
import encryptionEncoding from 'encryption-encoding'
import HyperDB from 'hyperdb'
import Hyperswarm from 'hyperswarm'
import ProtomuxWakeup from 'protomux-wakeup'
import ReadyResource from 'ready-resource'

import viewDefinition from '../spec/db/index.js'
import {
  ACTIVITY_DEFAULT_RETENTION_DAYS,
  ACTIVITY_EVENT,
  ACTIVITY_FILTER,
  ACTIVITY_LOG_ENABLED_KEY,
  ACTIVITY_RETENTION_DAYS_KEY,
  ALL_NOTES_KEY,
  BACKUP_ERROR,
  DEFAULT_FOLDER_NAME,
  INDEXER_ERROR,
  MAX_SYNC_LEADERS,
  MAX_VAULTS,
  PAIRING_INVITE_VERSION,
  PAIRING_OUTDATED,
  VAULT_ERROR,
  sanitizeVaultName,
  RECENTLY_DELETED_KEY,
  SWARM_SEED_FILE,
  normalizeAttachmentUrls,
  TRASH_RETENTION_MS
} from '../constant.js'
import { isActivityRetentionForever, normalizeActivityRetentionDays } from '../activity.js'
import { backendBoot } from '../bootTimeline.js'
import * as log from '../log.js'
import { extractInvite, getInviteHostBox, getInviteVersion, isInviteLongExpired } from '../utils.js'
import {
  checkBackupRestore,
  exportBackup as buildBackup,
  importBackup as restoreBackup
} from './backupManager.js'
import { DERIVED_DIR, DerivedStore } from './derivedStore.js'
import { HELD_KEY_MAX_AGE_MS, HeldFileKeys } from './heldFileKeys.js'
import { envelopeFiles } from './sealedEnvelope.js'
import { ACTIVITY_SEQ_PAD, INVITE_KEY } from './viewKeys.js'
import * as viewStore from './viewStore.js'
import { activityDiff, activityStats, listActivity } from './vault/activity.js'
import { createApply } from './vault/apply.js'
import { SEALED_NOTES_CAP, withCap } from './deviceCaps.js'
import {
  COMPAT_LEVEL,
  DEVICE_REFRESH_MS,
  GATES,
  MIN_COMPAT_PREF,
  UPDATE_REQUIRED,
  adoptActiveGates,
  deviceCompatLevel,
  gatePrefId,
  gateStatus,
  minCompatLevelOf
} from './featureGates.js'
import { KEYRING_PREF_PREFIX, envelopeKeyringId, isKeyringEntry } from './lockCrypto.js'
import {
  findLegacyStores,
  findVaultEntry,
  isPreservedEntry,
  listVaultEntries,
  mergeFilePath,
  newVaultDir,
  preserveLegacyVault,
  readPointer,
  removeDir,
  isMarkedRemoved,
  markRemoved,
  resolveVaultDir,
  vaultIdOf,
  withReplacedVault,
  withVault,
  withVaultName,
  withoutVault,
  writePointer
} from './vault/layout.js'
import { MEDIA_RETENTION_MS, MediaStore } from './vault/media.js'
import { AiOffload } from './vault/aiOffload.js'
import { MemberGate, VERDICT } from './vault/memberGate.js'
import { OP } from './vault/ops.js'
import { HostPairing, localWriterKey, requestToJoin } from './vault/pairing.js'

const VIEW_CORE_NAME = 'notebase-db'
const TRASH_SWEEP_DELAY_MS = 5000
const ACTIVITY_SWEEP_DELAY_MS = 20000
const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000
const MEDIA_SWEEP_DEBOUNCE_MS = 2000
const REOPEN_BACKOFF_MS = [1000, 5000, 30000, 300000]
const WRITABLE_TIMEOUT_MS = 60000
const DATA_WAIT_MS = 30000
const LEAVE_TIMEOUT_MS = 10000
const VAULT_LEAVE_TIMEOUT_MS = 30000
const LEADER_HANDOFF_WAIT_MS = 10000
const VAULT_MOVE_FILE = 'vault-move.pnbk'
const MERGE_LOCKED = 'locked'
const MERGE_CONFIRMED = 'confirmed'
const MERGE_HELD = 'held'
const HELD_MERGE_RECHECK_MS = 2000
const RECONNECT_CHECK_MS = 60000
const SWARM_RESUME_TICK_GRACE_MS = 30000
const MEMBER_LOOKUP_TIMEOUT_MS = 5000
const SUSPEND_DEADLINE_MS = 3000
const SUSPEND_SETTLE_MS = 3000
const SWARM_DESTROY_DEADLINE_MS = 3000
const RESUME_RECONNECT_CHECK_MS = 15000
const SCAN_LIMIT = 2000

let defaultSwarmBootstrap = null

export function setDefaultSwarmBootstrap(bootstrap) {
  defaultSwarmBootstrap = bootstrap || null
}

export { MEDIA_RETENTION_MS, findLegacyStores, preserveLegacyVault }

const noop = () => {}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function withDeadline(label, fn, budgetMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(
      () => {
        log.error('[lifecycle] ' + label + ' exceeded its budget, moving on')
        resolve()
      },
      Math.max(budgetMs, 0)
    )
    Promise.resolve()
      .then(fn)
      .catch((e) => log.error('[lifecycle] ' + label + ' failed', e))
      .finally(() => {
        clearTimeout(timer)
        resolve()
      })
  })
}

function isSwarmStuck(swarm) {
  return !!(
    swarm.destroyed ||
    swarm.suspended ||
    swarm.dht?.destroyed ||
    swarm.dht?.suspended ||
    swarm.server?.suspended
  )
}

const hex = (value) => (value ? b4a.toString(value, 'hex') : null)
const numberOrNull = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null)

function decodeHexKey(value, bytes = 32) {
  if (typeof value !== 'string' || value.length !== bytes * 2) return null
  if (!/^[0-9a-fA-F]+$/.test(value)) return null
  return b4a.from(value, 'hex')
}

function vaultKeyFrom(encryption) {
  if (!encryption) return null
  return decodeHexKey(encryption) || b4a.from(encryption)
}

async function openView(store) {
  const core = store.get(VIEW_CORE_NAME)
  await core.ready()
  const db = HyperDB.bee(core, viewDefinition, { extension: false, autoUpdate: true })
  await db.ready()
  return db
}

function keysByUpdated(order) {
  return [...order]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([key]) => key)
}

function vaultError(code, cause) {
  return Object.assign(new Error(code), { code, cause })
}

function legacyVaultError() {
  return Object.assign(
    new Error(
      'this vault was written by an earlier version of Pear Notes; export it with that ' +
        'version and import the backup here'
    ),
    { code: 'LEGACY_VAULT' }
  )
}

// One vault = one Corestore directory + one Autobase on it + one swarm, wired the
// way autopass does it. Nothing here deletes a store to recreate it, and nothing
// closes the base to "repair" it except after autobase itself has failed.
class NoteBase extends ReadyResource {
  constructor({ storage, encryption, entropy = null, bootstrap = null, appVersion = '' } = {}) {
    super()
    this.appVersion = appVersion || ''
    this.updateRequired = false
    this._compatCheck = null
    this._devicePublishedAt = 0
    this._deviceRefreshTimer = null
    this.path = storage
    this.encryption = encryption || null
    this.encryptionKey = vaultKeyFrom(encryption)
    this.swarmBootstrap = bootstrap || defaultSwarmBootstrap
    this._entropy = decodeHexKey(entropy)
    this.corestore = null
    this.autobase = null
    this.media = null
    this.derived = null
    this.heldFileKeys = null
    this.swarm = null
    this.discovery = null
    this.memberGate = null
    this.localKey = null
    this.isClosing = false
    this.hostPairing = new HostPairing(this)
    this._wakeup = null
    this._localAnnounce = null
    this._vaultDir = null
    this._writeChain = Promise.resolve()
    this._lifecycle = Promise.resolve()
    this._suspended = false
    this._suspendSettled = null
    this._swarmSuspendDone = true
    this._swarmResumedAt = 0
    this._resumeReconnectTimer = null
    this._reopening = null
    this._reopenAttempts = 0
    this._remoteNodes = 0
    this._connectedSwarmKeys = new Set()
    this._swarmKeyHex = null
    this._indexerSnapshot = ''
    this._lastIndexerKeys = []
    this._lastFastForward = null
    this._timers = new Set()
    this._pairingInFlight = false
    this._vaultBusy = false
    this._leaving = false
    this._generation = 0
    this._maintaining = null
    this._merging = null
    this._departedWriters = new Set()
    this._removed = false
    this._trackedView = null
    this._untrackView = null
    this._noteOrder = null
    this._noteChangeSeq = 0
    this._rejectedSealedSaves = new Map()
    this._rejectedNotice = null
    this._apply = createApply({
      onNode: (writerKey) => {
        if (writerKey && writerKey !== this.localKeyHex) this._remoteNodes++
      },
      onDeviceRemoved: (writerKey, byItself) => {
        if (byItself) this._departedWriters.add(writerKey)
      },
      onSealedSaveRejected: (op, writerKey) => {
        if (!writerKey || writerKey !== this.localKeyHex) return
        const held = this._rejectedSealedSaves.get(op.key)
        if (held && (held.updatedAt || 0) > (op.value.updatedAt || 0)) return
        this._rejectedSealedSaves.set(op.key, op.value)
        if (!this._rejectedNotice) {
          this._rejectedNotice = setTimeout(() => {
            this._rejectedNotice = null
            this.emit('sealed-save-rejected')
          }, 0)
        }
      }
    })
  }

  get key() {
    return this.autobase?.key || null
  }

  get discoveryKey() {
    return this.autobase?.discoveryKey || null
  }

  get writable() {
    return !!this.autobase?.writable
  }

  get localKeyHex() {
    return hex(this.localKey) || ''
  }

  get hyperdrive() {
    return this.media?.drive || null
  }

  get blobServer() {
    return this.media?.server || null
  }

  async _open() {
    backendBoot.mark('_open: entered')
    if (findLegacyStores(this.path).length > 0) throw legacyVaultError()
    let pointer = readPointer(this.path)
    if (!pointer) {
      pointer = { current: newVaultDir(), merge: null, retire: [] }
      writePointer(this.path, pointer)
    }
    try {
      await this._openVault(pointer.current)
    } catch (err) {
      await this.hostPairing.close()
      await this._closeVault()
      throw err
    }
    backendBoot.mark('_open: vault open')
    this._every(TRASH_SWEEP_DELAY_MS, () => this.purgeExpiredTrash())
    this._every(ACTIVITY_SWEEP_DELAY_MS, () => this.pruneActivity())
    this._every(RECONNECT_CHECK_MS, () => this._reconnectIfAlone(), RECONNECT_CHECK_MS)
  }

  // A resume refreshes discovery once; if the network was not back yet that
  // lookup fails and nothing retries it for a long time.
  async _reconnectIfAlone() {
    if (this._suspended || !this.swarm) return
    if (isSwarmStuck(this.swarm)) {
      await this._serialLifecycle(() => this._rebuildSwarmIfStuck('found stuck while idle'))
      return
    }
    if (this.swarm.connections.size > 0) return
    await this.discovery?.refresh({ client: true, server: true })
  }

  _serialLifecycle(task) {
    this._lifecycle = this._lifecycle.then(task).catch((e) => {
      log.error('[lifecycle] task failed', e)
    })
    return this._lifecycle
  }

  async _rebuildSwarmIfStuck(reason) {
    if (this._suspended || !this.swarm || !isSwarmStuck(this.swarm)) return
    await this._rebuildSwarm(reason)
  }

  // The same thing a cold start does for networking: a fresh swarm on the same
  // seed (so other devices still know this one), joined to the same topic.
  async _rebuildSwarm(reason) {
    const old = this.swarm
    if (!old || !this.autobase || this.isClosing || this.closing) return
    log.warn('[swarm] rebuilding the swarm: ' + reason)
    this.memberGate?.close()
    this.memberGate = null
    this.aiOffload?.close()
    this.aiOffload = null
    this.swarm = null
    this.discovery = null
    if (this._connectedSwarmKeys.size) {
      this._connectedSwarmKeys.clear()
      this.emit('presence-changed')
    }
    for (const connection of [...old.connections]) connection.destroy()
    await withDeadline(
      'destroying the old swarm',
      async () => {
        // A parked dht cannot unannounce or close what is still open on it.
        if (old.dht.suspended && !old.dht.destroyed) await old.dht.resume()
        await old.destroy()
      },
      SWARM_DESTROY_DEADLINE_MS
    )
    if (!this.autobase || this.isClosing || this.closing || this.swarm) return
    await this._startSwarm()
    this._swarmSuspendDone = true
    if (this.hostPairing.swarm) {
      this.hostPairing.swarm = this.swarm
      this.hostPairing
        .sync()
        .catch((e) => log.error('[pairing] could not move to the new swarm', e))
    }
  }

  async _close() {
    this.isClosing = true
    clearTimeout(this._resumeReconnectTimer)
    for (const timer of this._timers) clearTimeout(timer)
    this._timers.clear()
    await this.hostPairing.close()
    await this._closeVault()
    this.isClosing = false
  }

  async destroy() {
    await this.close()
  }

  _every(firstDelay, task, interval = SWEEP_INTERVAL_MS) {
    const run = (delay) => {
      const timer = setTimeout(() => {
        this._timers.delete(timer)
        Promise.resolve()
          .then(task)
          .catch((e) => log.error('[sweep] failed', e))
          .finally(() => {
            if (!this.isClosing && !this.closing) run(interval)
          })
      }, delay)
      if (this._suspended) timer.unref()
      this._timers.add(timer)
    }
    run(firstDelay)
  }

  _blindEncryption() {
    return this._entropy ? new BlindEncryptionSodium(this._entropy) : null
  }

  // Autobase's own boot dereferences the sealed key, and a failure there is not
  // catchable from here, so check before constructing it.
  async _canOpenSealedKey(store) {
    const core = store.get({ name: 'local', active: false })
    try {
      await core.ready()
      const sealed = await core.getUserData('autobase/blind-encryption')
      if (!sealed) return true
      if (!this._entropy) return false
      await encryptionEncoding.decrypt(sealed, this._blindEncryption().decrypt)
      return true
    } catch {
      return false
    } finally {
      await core.close().catch(noop)
    }
  }

  async _openVault(relativeDir, { key = null, encryptionKey = this.encryptionKey } = {}) {
    this._vaultDir = relativeDir
    const dir = resolveVaultDir(this.path, relativeDir)
    this._removed = isMarkedRemoved(dir)
    this.corestore = new Corestore(dir, platform() === 'android' ? { suspend: true } : undefined)
    await this.corestore.ready()
    if (!(await this._canOpenSealedKey(this.corestore))) {
      await this.corestore.close()
      this.corestore = null
      throw Object.assign(
        new Error('vault key is sealed and the device entropy does not open it'),
        {
          code: 'VAULT_KEY_SEALED'
        }
      )
    }
    this._wakeup = new ProtomuxWakeup()
    await this._startBase(key, encryptionKey)
    backendBoot.mark('initBase: autobase.ready')

    this.media = new MediaStore(this, this.corestore, this.autobase.encryptionKey)
    await this.media.ready()
    backendBoot.mark('initBase: media ready')

    await this._openDerived(dir)
    this.heldFileKeys = new HeldFileKeys(dir, this.autobase.encryptionKey)

    this._announceLocalWriter()
    await this._startSwarm()
    this._linearizeInBackground()
    this._generation++
    if (this._generation > 1) this.emit('base-reopened', this._generation)
    this.emit(this._removed ? 'device-removed' : 'vault-member')
  }

  async _startBase(key, encryptionKey) {
    // A session of its own: autobase closes the store it is given, and the
    // media drive and a later reopen still need this one.
    const base = new Autobase(this.corestore.session(), key, {
      encrypt: true,
      encryptionKey,
      blindEncryption: this._blindEncryption(),
      wakeup: this._wakeup,
      valueEncoding: 'json',
      fastForward: false,
      open: openView,
      apply: this._apply
    })
    base.on('error', (err) => this._onBaseError(base, err))
    base.on('warning', (err) => log.warn('[autobase] warning', err))
    // Off by configuration; autobase still forces one when its boot catch-up fails.
    base.on('fast-forward', (to, from) => {
      this._lastFastForward = { at: Date.now(), to, from }
      log.error('[autobase] fast-forwarded', { from, to })
    })
    base.on('update', () => this._onUpdate())
    base.on('writable', () => this._onWritable())
    base.on('unwritable', () => {
      if (!this._leaving) this._onUnwritable(base)
    })
    this.autobase = base
    await base.ready()
    this.localKey = base.local.key
    this._adoptVaultKey()
    await this._clearPlaintextKey()
  }

  _adoptVaultKey() {
    const vaultKey = this.autobase?.encryptionKey
    if (!vaultKey) return
    const vaultHex = hex(vaultKey)
    if (vaultHex === this.encryption) return
    this.encryption = vaultHex
    this.encryptionKey = vaultKey
    this.emit('encryption-key', vaultHex)
  }

  // Autobase seals the local copy but leaves the plaintext one it writes to the
  // bootstrap core for old readers.
  async _clearPlaintextKey() {
    if (!this._entropy) return
    for (const core of [this.autobase.local, this.autobase._primaryBootstrap]) {
      try {
        if (core && (await core.getUserData('autobase/encryption'))) {
          await core.setUserData('autobase/encryption', null)
        }
      } catch (e) {
        log.error('[encryption] could not clear a plaintext vault key', e)
      }
    }
  }

  _linearizeInBackground() {
    const base = this.autobase
    base
      .update()
      .then(() => {
        backendBoot.mark('initBase: linearized')
        this.emit('linearized')
        this.media?.scheduleScan()
        return this._startupMaintenance()
      })
      .catch((e) => {
        if (base === this.autobase && !this.isClosing) log.error('[vault] linearize failed', e)
      })
  }

  _startupMaintenance() {
    if (!this._maintaining) {
      this._maintaining = this._maintain().finally(() => {
        this._maintaining = null
      })
    }
    return this._maintaining
  }

  async _maintain() {
    await this._resumeMerge()
    await this.media?.sweep()
    await this.refreshCompatLock()
    await adoptActiveGates(this)
    await this.publishLocalSwarmKey()
    this._scheduleDeviceRefresh()
  }

  _scheduleDeviceRefresh() {
    clearTimeout(this._deviceRefreshTimer)
    this._deviceRefreshTimer = setTimeout(() => {
      this._deviceRefreshTimer = null
      if (!this.autobase || this.isClosing) return
      this.publishLocalSwarmKey()
        .then(() => this._resumeMerge())
        .catch((e) => log.debug('[vault] device refresh failed', e?.message))
        .finally(() => this._scheduleDeviceRefresh())
    }, DEVICE_REFRESH_MS)
    this._deviceRefreshTimer.unref?.()
  }

  refreshCompatLock() {
    if (!this._compatCheck) {
      this._compatCheck = this._checkCompatLock().finally(() => {
        this._compatCheck = null
      })
    }
    return this._compatCheck
  }

  async _checkCompatLock() {
    let pref
    try {
      if (!(await this.autobaseDb())) return this.updateRequired
      pref = await this.getSyncedPref(MIN_COMPAT_PREF)
    } catch (e) {
      log.debug('[vault] compat check failed', e?.message)
      return this.updateRequired
    }
    const required = minCompatLevelOf(pref) > COMPAT_LEVEL
    if (required === this.updateRequired) return required
    this.updateRequired = required
    if (required) log.warn('[vault] this build is older than the vault allows, opening read-only')
    this.emit(required ? 'update-required' : 'update-cleared')
    return required
  }

  // AI-derived data is rebuildable, so a store that will not open must never
  // stop the vault from opening.
  async _openDerived(dir) {
    const store = new DerivedStore(barePath.join(dir, DERIVED_DIR), this.autobase.encryptionKey)
    try {
      await store.ready()
      if (store.wiped) log.warn('[derived] key changed, derived data cleared for rebuild')
      this.derived = store
    } catch (e) {
      log.error('[derived] open failed', e)
      await store.close().catch(noop)
      this.derived = null
    }
  }

  async _closeVault() {
    this.emit('vault-closed')
    this._trackView(null)
    clearTimeout(this._deviceRefreshTimer)
    this._deviceRefreshTimer = null
    clearTimeout(this._heldMergeTimer)
    this._heldMergeTimer = null
    this._mergeHeld = false
    this._devicePublishedAt = 0
    if (this.updateRequired) {
      this.updateRequired = false
      this.emit('update-cleared')
    }
    const base = this.autobase
    const store = this.corestore
    const media = this.media
    const swarm = this.swarm
    this.memberGate?.close()
    this.memberGate = null
    this.aiOffload?.close()
    this.aiOffload = null
    this.autobase = null
    const derived = this.derived
    this.derived = null
    this.heldFileKeys?.close()
    this.heldFileKeys = null
    this.media = null
    this.swarm = null
    this.discovery = null
    this.corestore = null
    this._connectedSwarmKeys.clear()
    await this._writeChain.catch(noop)
    await swarm?.destroy().catch((e) => log.error('[vault] swarm destroy failed', e))
    await media?.close()
    await derived?.close().catch((e) => log.error('[vault] derived store close failed', e))
    await base?.close().catch((e) => log.error('[vault] base close failed', e))
    this._localAnnounce?.destroy()
    this._localAnnounce = null
    this._wakeup?.destroy()
    this._wakeup = null
    await store?.close().catch((e) => log.error('[vault] store close failed', e))
  }

  // Autobase closes itself before it emits `error`. The store, swarm and media
  // are untouched; only a new base is started on the same store.
  _onBaseError(base, err) {
    log.error('[autobase] error, the base closed itself', err)
    this.emit('base-error', err)
    if (base !== this.autobase) return
    this._scheduleReopen(base)
  }

  _scheduleReopen(failed) {
    if (this.isClosing || this._reopening) return
    const delay = REOPEN_BACKOFF_MS[Math.min(this._reopenAttempts, REOPEN_BACKOFF_MS.length - 1)]
    this._reopenAttempts++
    this._reopening = wait(delay)
      .then(async () => {
        if (this.isClosing || !this.corestore) return
        await failed.close().catch(noop)
        await this._startBase(null, this.encryptionKey)
        this._linearizeInBackground()
        this._generation++
        this.emit('base-reopened', this._generation)
        this.emit('base-recovered')
        log.info('[autobase] reopened after an error')
      })
      .catch((e) => {
        log.error('[autobase] reopen failed, trying again', e)
        return 'retry'
      })
      .then((outcome) => {
        this._reopening = null
        if (outcome === 'retry' && this.autobase) this._scheduleReopen(this.autobase)
      })
  }

  _onUpdate() {
    if (this.isClosing) return
    this._reopenAttempts = 0
    this.refreshCompatLock().catch(noop)
    if (this._remoteNodes > 0 && this.swarm?.connections.size) {
      const received = this._remoteNodes
      this._remoteNodes = 0
      this.emit('sync-activity', { at: Date.now(), received })
    }
    const keys = this.getIndexerKeys()
    const snapshot = [...keys].sort().join(',')
    if (snapshot !== this._indexerSnapshot) {
      this._indexerSnapshot = snapshot
      this.emit('indexers-changed')
    }
    this.media?.scheduleScan()
    this._scheduleMediaSweep()
    this._scheduleHeldMergeCheck()
    this.memberGate?.recheck()
    this.aiOffload?.recheck()
    this.hostPairing.sync().catch((e) => log.error('[pairing] could not refresh the listener', e))
  }

  _onWritable() {
    this._startupMaintenance().catch((e) => log.error('[vault] maintenance after join failed', e))
  }

  _scheduleMediaSweep() {
    if (this._mediaSweepTimer) return
    this._mediaSweepTimer = setTimeout(() => {
      this._mediaSweepTimer = null
      this.media?.sweep().catch((e) => log.error('[media] sweep failed', e))
    }, MEDIA_SWEEP_DEBOUNCE_MS)
    if (this._suspended) this._mediaSweepTimer.unref()
  }

  _swarmSeed() {
    const seedPath = barePath.join(this.path, SWARM_SEED_FILE)
    try {
      const stored = fs.readFileSync(seedPath)
      if (stored?.length === 32) return stored
    } catch (err) {
      log.debug('[vault] ignored', err?.message || err)
    }
    const seed = crypto.randomBytes(32)
    try {
      fs.mkdirSync(this.path, { recursive: true })
      fs.writeFileSync(seedPath, seed)
    } catch (e) {
      log.error('[swarm] could not persist the swarm seed', e)
    }
    return seed
  }

  async _startSwarm() {
    const store = this.corestore
    const wakeup = this._wakeup
    const swarm = new Hyperswarm({
      seed: this._swarmSeed(),
      ...(this.swarmBootstrap ? { bootstrap: this.swarmBootstrap } : {})
    })
    this.swarm = swarm
    this._swarmKeyHex = hex(swarm.keyPair.publicKey)
    const offload = new AiOffload({
      discoveryKey: this.autobase.discoveryKey,
      verdict: (writer) => this._memberVerdict(writer),
      onJob: (job) =>
        this._emitOffloadInOrder(async () => {
          const device = await this.findDeviceByLocalKey(job.writer).catch(() => null)
          this.emit('ai-offload-job', { ...job, deviceTitle: device?.value?.title ?? '' })
        }),
      onJobCancel: (jobId) => this._emitOffloadInOrder(() => this.emit('ai-offload-cancel', jobId)),
      onStatus: () => this.emit('ai-offload-status')
    })
    offload.setServing(this._aiOffloadServing === true)
    this.aiOffload = offload
    const gate = new MemberGate({
      discoveryKey: this.autobase.discoveryKey,
      localCore: () => this.autobase?.local || null,
      verdict: (writer) => this._memberVerdict(writer),
      onRemoved: (writer) => this._onRemovedNotice(writer),
      admit: (connection, writer) => {
        store.replicate(connection)
        wakeup.addStream(connection)
        this.media?.scheduleScan()
        offload.attach(connection, writer).catch((e) => log.error('[ai-offload] attach failed', e))
      }
    })
    this.memberGate = gate
    swarm.on('error', (err) => log.error('[swarm] error', err))
    swarm.dht.on('wakeup', () => this._onProcessWoke(swarm))
    swarm.on('connection', (connection) => {
      connection.on('error', (err) => log.debug('[swarm] connection error', err?.code || err))
      const remote = hex(connection.remotePublicKey)
      if (remote) {
        this._connectedSwarmKeys.add(remote)
        this.emit('presence-changed')
        connection.once('close', () => {
          if (this._connectedSwarmKeys.delete(remote)) this.emit('presence-changed')
        })
      }
      gate.add(connection)
    })
    this.discovery = swarm.join(this.autobase.discoveryKey)
    swarm.flush().catch((e) => log.error('[swarm] flush failed', e))
  }

  // Autobase never announces our own entries, so writes made while a peer was away waited for the next append.
  _announceLocalWriter() {
    this._localAnnounce?.destroy()
    const capability = this.autobase?.wakeupCapability
    if (!capability || !this._wakeup) return
    this._localAnnounce = this._wakeup.session(capability.key, {
      discoveryKey: capability.discoveryKey || this.autobase.discoveryKey,
      onpeeradd: (peer, session) => {
        const local = this.isClosing ? null : this.autobase?.local
        if (!local?.length) return
        session.announce(peer, [{ key: local.key, length: local.length }])
      }
    })
  }

  // Frozen without our suspend, so swarm.resume() would no-op over dead sockets.
  _onProcessWoke(swarm) {
    if (swarm !== this.swarm || swarm.suspended || this._suspended || this.isClosing) return
    // dht-rpc keeps its pre-suspend tick time, so its first tick after our own resume reads as a sleep.
    const resumedAt = this._swarmResumedAt
    this._swarmResumedAt = 0
    if (Date.now() - resumedAt < SWARM_RESUME_TICK_GRACE_MS) return
    const connections = [...swarm.connections]
    log.info(
      '[swarm] process slept unsuspended, dropping ' + connections.length + ' stale connections'
    )
    for (const conn of connections) conn.destroy()
    this.discovery
      ?.refresh({ client: true, server: true })
      .catch((e) => log.error('[swarm] discovery refresh after sleep', e))
  }

  // Replication is only for current writers: a removed device keeps the vault key,
  // so refusing it new blocks is what actually revokes it.
  async _memberVerdict(writer) {
    const system = this.autobase?.system
    if (!system) return VERDICT.UNKNOWN
    if (system.members === 0) return VERDICT.OPEN
    const member = await system.get(writer, { timeout: MEMBER_LOOKUP_TIMEOUT_MS })
    if (!member) return VERDICT.UNKNOWN
    if (!member.isRemoved) return VERDICT.MEMBER
    return this._departedWriters.has(hex(writer)) ? VERDICT.DEPARTED : VERDICT.REMOVED
  }

  async _onUnwritable(base) {
    const record = await base.system?.get(base.local.key).catch(() => null)
    if (base !== this.autobase || this._leaving) return
    if (record?.isRemoved) this._markRemoved()
    else this.emit('device-removed')
  }

  // Only a current member's word counts; any member could have removed us anyway.
  async _onRemovedNotice(writer) {
    if (this._leaving || this._removed) return
    const vaultDir = this._vaultDir
    const verdict = await this._memberVerdict(writer).catch(() => VERDICT.UNKNOWN)
    if (vaultDir !== this._vaultDir) return
    if (verdict !== VERDICT.MEMBER) {
      log.warn('[member] ignored a removal notice from a non-member', { verdict })
      return
    }
    log.info('[member] a member device reports this device was removed from the vault')
    this._markRemoved()
  }

  _markRemoved() {
    if (this._leaving || this._removed) return
    this._removed = true
    try {
      markRemoved(resolveVaultDir(this.path, this._vaultDir))
    } catch (e) {
      log.error('[member] could not persist the removal', e)
    }
    this.emit('device-removed')
  }

  isRemovedFromVault() {
    return this._removed
  }

  isSwarmKeyOnline(swarmKey) {
    return !!swarmKey && this._connectedSwarmKeys.has(swarmKey)
  }

  getSwarmKeyHex() {
    return this._swarmKeyHex
  }

  suspend() {
    this._suspended = true
    this._lifecycle = this._lifecycle
      .then(() => this._suspend())
      .catch((e) => {
        log.error('[lifecycle] suspend failed', e)
      })
    return this._lifecycle
  }

  resume() {
    this._suspended = false
    this._lifecycle = this._lifecycle
      .then(() => this._resume())
      .catch((e) => {
        log.error('[lifecycle] resume failed', e)
      })
    return this._lifecycle
  }

  _holdTimers(held) {
    for (const timer of [...this._timers, this._mediaSweepTimer]) {
      if (!timer) continue
      if (held) timer.ref()
      else timer.unref()
    }
    this.media?.holdTimers(held)
  }

  // A step that runs past its budget is not abandoned: it keeps running when the
  // process wakes, and _resume waits for it before undoing it.
  async _suspend() {
    if (!this._suspended || !this.corestore) return
    clearTimeout(this._resumeReconnectTimer)
    this._resumeReconnectTimer = null
    this._holdTimers(false)
    const deadline = Date.now() + SUSPEND_DEADLINE_MS
    const running = []
    const step = (label, fn) => {
      const run = Promise.resolve().then(fn)
      running.push(run.catch(noop))
      return withDeadline('suspend ' + label, () => run, deadline - Date.now())
    }
    this._suspendSettled = null
    await step('pairing', () => this.hostPairing.suspend())
    const swarm = this.swarm
    if (swarm) {
      this._swarmSuspendDone = false
      await step('swarm', () =>
        swarm.suspend().finally(() => {
          if (swarm === this.swarm) this._swarmSuspendDone = true
        })
      )
    }
    await step('media', () => this.media?.suspend())
    await step('corestore', () => this.corestore.suspend())
    this._suspendSettled = Promise.all(running)
    log.debug('[lifecycle] suspended')
  }

  async _resume() {
    if (this._suspended || !this.corestore) return
    this._holdTimers(true)
    const settled = this._suspendSettled
    this._suspendSettled = null
    if (settled) {
      const done = await Promise.race([
        settled.then(() => true),
        wait(SUSPEND_SETTLE_MS).then(() => false)
      ])
      if (!done) log.error('[lifecycle] the last suspend is still running, resuming anyway')
    }
    await this.corestore.resume()
    await this.media?.resume()
    // hyperswarm marks itself suspended before its dht is: resuming a swarm whose
    // suspend never finished resumes nothing, then the late suspend parks the dht
    // for good and the device stays offline until the app is killed.
    if (this.swarm && !this._swarmSuspendDone) {
      await this._rebuildSwarm('its suspend never finished')
    } else if (this.swarm) {
      if (this.swarm.suspended) this._swarmResumedAt = Date.now()
      await this.swarm.resume()
      if (isSwarmStuck(this.swarm)) await this._rebuildSwarm('still suspended after resume')
    }
    await this.hostPairing.resume()
    this._checkReconnectSoon()
    this.emit('services-resumed', this.getHyperdriveAddress())
    log.debug('[lifecycle] resumed')
  }

  // Discovery after a resume can fail while the network is still coming back.
  _checkReconnectSoon() {
    clearTimeout(this._resumeReconnectTimer)
    this._resumeReconnectTimer = setTimeout(() => {
      this._resumeReconnectTimer = null
      this._reconnectIfAlone().catch((e) => log.error('[swarm] reconnect after resume', e))
    }, RESUME_RECONNECT_CHECK_MS)
  }

  async getChore() {
    await this._lifecycle
    await this.media?.resume().catch((e) => log.error('[lifecycle] blob server', e))
    return { hyperdriveServerAddress: this.getHyperdriveAddress() }
  }

  getHyperdriveAddress() {
    return this.media ? this.media.address() : null
  }

  async update() {
    await this.autobase?.update()
  }

  async wait(ms = 1000) {
    await wait(ms)
  }

  // One serial chain for every write from this device.
  append(op) {
    const run = async () => {
      const base = this.autobase
      if (!base || this.isClosing) throw new Error('[append] no open vault')
      if (!base.writable) {
        throw Object.assign(new Error('[append] this device is not a writer'), {
          code: 'NOT_WRITABLE'
        })
      }
      if (this.updateRequired) {
        throw Object.assign(new Error('[append] this build is too old for the vault'), {
          code: UPDATE_REQUIRED
        })
      }
      const at = Date.now()
      await base.append(Array.isArray(op) ? op.map((o) => ({ at, ...o })) : { at, ...op })
    }
    const result = this._writeChain.then(run, run)
    this._writeChain = result.then(noop, noop)
    return result
  }

  async autobaseDb() {
    if (this.isClosing || !this.autobase) return null
    const db = await this.autobase.view
    if (db && db !== this._trackedView && !this.isClosing) this._trackView(db)
    return db
  }

  _trackView(db) {
    this._untrackView?.()
    this._untrackView = null
    this._trackedView = db
    this._noteOrder = null
    this._noteChangeSeq++
    if (!db) return
    this._untrackView = viewStore.onNoteChanges(db, (ops) => this._onNoteChanges(ops))
  }

  _onNoteChanges(ops) {
    this._noteChangeSeq++
    if (!ops) {
      this._noteOrder = null
      return
    }
    if (this._noteOrder) {
      for (const { key, value } of ops) {
        if (value) this._noteOrder.set(key, value.updatedAt || 0)
        else this._noteOrder.delete(key)
      }
    }
    this.emit('notes-changed', ops)
  }

  async addWriter(keyHex, { indexer = false } = {}) {
    await this.append({ type: OP.ADD_WRITER, key: keyHex, indexer })
  }

  async requestWriter(key, { isIndexer = false } = {}) {
    await this.addWriter(b4a.isBuffer(key) ? hex(key) : key || this.localKeyHex, {
      indexer: isIndexer
    })
  }

  getIndexerKeys() {
    const indexers = this.autobase?.system?.indexers || []
    const keys = indexers.map((indexer) => hex(indexer.key))
    if (keys.length) this._lastIndexerKeys = keys
    return keys.length ? keys : this._lastIndexerKeys
  }

  isIndexerKey(localKeyHex) {
    return !!localKeyHex && this.getIndexerKeys().includes(localKeyHex)
  }

  isLocalIndexer() {
    return this.isIndexerKey(this.localKeyHex)
  }

  _isSoleLeader() {
    return this.isLocalIndexer() && this.getIndexerKeys().length <= 1
  }

  async _isReachable(localKeyHex) {
    if (localKeyHex === this.localKeyHex) return true
    const device = await this.findDeviceByLocalKey(localKeyHex)
    return !!device && this.isSwarmKeyOnline(device.value.swarmKey)
  }

  // A leader change is only indexed by the current leaders, so every one of them
  // has to be online for it to land.
  async _requireLeadersOnline() {
    for (const key of this.getIndexerKeys()) {
      if (!(await this._isReachable(key))) throw new Error(INDEXER_ERROR.LEADER_OFFLINE)
    }
  }

  async setDeviceIndexer({ localKey, isIndexer }) {
    if (!localKey) throw new Error(INDEXER_ERROR.UNKNOWN_DEVICE)
    const indexers = this.getIndexerKeys()
    if (indexers.includes(localKey) === !!isIndexer) return { changed: false, indexers }
    if (!isIndexer && indexers.length <= 1) throw new Error(INDEXER_ERROR.LAST_INDEXER)
    if (isIndexer && indexers.length >= MAX_SYNC_LEADERS) throw new Error(INDEXER_ERROR.MAX_LEADERS)
    if (!(await this._isReachable(localKey))) throw new Error(INDEXER_ERROR.DEVICE_OFFLINE)
    await this._requireLeadersOnline()
    await this.addWriter(localKey, { indexer: !!isIndexer })
    return { changed: true, indexers: this.getIndexerKeys() }
  }

  async transferIndexer({ localKey }) {
    if (!localKey) throw new Error(INDEXER_ERROR.UNKNOWN_DEVICE)
    const indexers = this.getIndexerKeys()
    if (indexers.length === 1 && indexers[0] === localKey) return { changed: false, indexers }
    if (!(await this._isReachable(localKey))) throw new Error(INDEXER_ERROR.DEVICE_OFFLINE)
    await this._requireLeadersOnline()
    if (!indexers.includes(localKey)) await this.addWriter(localKey, { indexer: true })
    for (const key of indexers) {
      if (key !== localKey) await this.addWriter(key, { indexer: false })
    }
    return { changed: true, indexers: this.getIndexerKeys() }
  }

  async addNote({ key, value, noActivity = false, unseal = false, basis = null }) {
    const note =
      typeof value?.note === 'string'
        ? { ...value, note: normalizeAttachmentUrls(value.note) }
        : value
    const op = { type: OP.ADD_NOTE, key, value: note }
    if (noActivity) op.noActivity = true
    if (unseal) op.unseal = true
    if (basis !== null) op.basis = basis
    await this.append(op)
  }

  // Our plain saves dropped over a sealed note; memory only, re-sealed by lockRollout.js.
  rejectedSealedSaves() {
    return [...this._rejectedSealedSaves]
  }

  dropRejectedSealedSave(key, value) {
    if (this._rejectedSealedSaves.get(key) === value) this._rejectedSealedSaves.delete(key)
  }

  async removeNote(key) {
    await this.append({ type: OP.REMOVE_NOTE, key })
  }

  // A held key is done once its note's envelope lists the file, or reclaim has removed it.
  async pruneHeldFileKeys(noteKey = null) {
    const held = this.heldFileKeys
    if (!held?.size || !(await this.autobaseDb())) return
    const cutoff = Date.now() - HELD_KEY_MAX_AGE_MS
    const done = []
    for (const record of held.list()) {
      if (noteKey && record.note !== noteKey) continue
      const note = record.at > cutoff ? await this.getNote(record.note) : null
      if (!note?.sealed || envelopeFiles(note.sealed)[record.link]?.id === record.id) {
        done.push(record.blob)
      }
    }
    if (held === this.heldFileKeys) held.drop(done)
  }

  async getNote(key) {
    const db = await this.autobaseDb()
    return db ? viewStore.getNote(db, key) : null
  }

  async _collect(iterate, fallback = []) {
    try {
      const db = await this.autobaseDb()
      if (!db) return fallback
      const out = []
      for await (const entry of iterate(db)) out.push(entry)
      return out
    } catch (e) {
      log.error('[vault] read failed', e)
      return fallback
    }
  }

  async getAllNotesStrict() {
    const db = await this.autobaseDb()
    if (!db) throw new Error('view database not available')
    const out = []
    for await (const entry of viewStore.notes(db)) if (entry.key !== INVITE_KEY) out.push(entry)
    return out
  }

  async _readAllNotes() {
    const notes = (await this._collect(viewStore.notes, null))?.filter(
      (entry) => entry.key !== INVITE_KEY
    )
    if (!notes) return null
    this.emit('notes-read', notes)
    return notes
  }

  async getAllNotes() {
    return (await this._readAllNotes()) || []
  }

  _byUpdated(entries) {
    return entries.sort((a, b) => b.value.updatedAt - a.value.updatedAt).map((entry) => entry.key)
  }

  async getAllNoteKeys() {
    const db = await this.autobaseDb()
    if (!db) return []
    if (!this._noteOrder) {
      const seq = this._noteChangeSeq
      const notes = await this._readAllNotes()
      if (!notes) return []
      const order = new Map(notes.map((entry) => [entry.key, entry.value?.updatedAt || 0]))
      // A change that raced the scan may be missing from it: use it once, never cache it.
      if (this._trackedView !== db || this._noteChangeSeq !== seq) return keysByUpdated(order)
      this._noteOrder = order
    }
    return keysByUpdated(this._noteOrder)
  }

  async trashNote(key) {
    const note = await this.getNote(key)
    if (!note || note.folderKey === RECENTLY_DELETED_KEY) return false
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
    const folderKey = await this._restoreFolder(note.previousFolderKey)
    const value = { ...note, folderKey, updatedAt: Date.now() }
    delete value.previousFolderKey
    delete value.deletedAt
    await this.addNote({ key, value })
    return { done: true, folderKey }
  }

  async _restoreFolder(previousFolderKey) {
    const usable =
      previousFolderKey &&
      previousFolderKey !== RECENTLY_DELETED_KEY &&
      previousFolderKey !== ALL_NOTES_KEY
    if (usable && (await this.getFolder(previousFolderKey))) return previousFolderKey
    const existing = (await this.getAllFolders()).find(
      (folder) => folder.value?.title === DEFAULT_FOLDER_NAME
    )
    if (existing) return existing.key
    const key = hex(crypto.randomBytes(32))
    const now = Date.now()
    await this.addFolder({
      key,
      value: { title: DEFAULT_FOLDER_NAME, addedAt: now, updatedAt: now }
    })
    return key
  }

  async purgeExpiredTrash(now = Date.now()) {
    if (!this.writable) return 0
    let purged = 0
    for (const item of await this.getAllNotes()) {
      if (item.value?.folderKey !== RECENTLY_DELETED_KEY) continue
      if (!item.value.deletedAt) {
        await this.addNote({ key: item.key, value: { ...item.value, deletedAt: now } })
        continue
      }
      if (now - item.value.deletedAt < TRASH_RETENTION_MS) continue
      await this.deleteNoteWithMedia(item.key)
      purged++
    }
    return purged
  }

  async subscribeNote(key) {
    const db = await this.autobaseDb()
    return db ? viewStore.watchNote(db, key) : null
  }

  async subscribeAllNoteKeys() {
    const db = await this.autobaseDb()
    return db ? viewStore.watchNoteKeys(db) : null
  }

  async addFolder({ key, value, noActivity = false }) {
    const op = { type: OP.ADD_FOLDER, key, value }
    if (noActivity) op.noActivity = true
    await this.append(op)
  }

  async updateFolder(args) {
    await this.addFolder(args)
  }

  async removeFolder(key) {
    await this.append({ type: OP.REMOVE_FOLDER, key })
  }

  async getFolder(key) {
    const db = await this.autobaseDb()
    return db ? viewStore.getFolder(db, key) : null
  }

  async getAllFolders() {
    return this._collect(viewStore.folders)
  }

  async getAllFoldersKeys() {
    return this._byUpdated(await this.getAllFolders())
  }

  async subscribeFolder(key) {
    const db = await this.autobaseDb()
    return db ? viewStore.watchFolder(db, key) : null
  }

  async subscribeAllFolderKeys() {
    const db = await this.autobaseDb()
    return db ? viewStore.watchFolderKeys(db) : null
  }

  async updateSettings({ settings, noActivity = false }) {
    const op = { type: OP.ADD_SETTINGS, value: settings ?? null }
    if (noActivity) op.noActivity = true
    await this.append(op)
  }

  async getSettings() {
    const db = await this.autobaseDb()
    return db ? viewStore.getSettings(db) : null
  }

  async subscribeSettings() {
    const db = await this.autobaseDb()
    return db ? viewStore.watchSettings(db) : null
  }

  async addSyncedDevice({ key, value }) {
    await this.append({ type: OP.ADD_SYNCED_DEVICE, key, value })
  }

  async updateSyncedDevice({ key, value }) {
    await this.append({ type: OP.UPDATE_SYNCED_DEVICE, key, value })
  }

  async removeSyncedDevice(key) {
    if (!(await this.getRawSyncedDevice(key))) return
    await this.append({ type: OP.REMOVE_SYNCED_DEVICE, key })
  }

  async getRawSyncedDevice(key) {
    try {
      const db = await this.autobaseDb()
      return db ? await viewStore.getSyncedDevice(db, key) : null
    } catch (e) {
      log.error('[vault] device read failed', e)
      return null
    }
  }

  async getSyncedDevice(key) {
    const raw = await this.getRawSyncedDevice(key)
    return raw ? this._withPresence(raw) : null
  }

  _withPresence(device) {
    const isLocal = !!this.localKeyHex && device.localKey === this.localKeyHex
    return {
      ...device,
      isLocal,
      presenceKnown: isLocal || !!device.swarmKey,
      isOnline: isLocal || this.isSwarmKeyOnline(device.swarmKey),
      isIndexer: this.isIndexerKey(device.localKey),
      sealedNotes: deviceCompatLevel(device) >= GATES.sealedNotes.minCompatLevel
    }
  }

  async getAllSyncedDeviceKeys() {
    return this._byUpdated(await this._collect(viewStore.syncedDevices))
  }

  setAiOffloadServing(serving) {
    this._aiOffloadServing = !!serving
    this.aiOffload?.setServing(this._aiOffloadServing)
  }

  async getAiOffloadStatus() {
    const status = this.aiOffload?.status() ?? { available: false, writer: null }
    const device = status.available ? await this.findDeviceByLocalKey(status.writer) : null
    return { available: status.available, deviceTitle: device?.value?.title ?? '' }
  }

  _emitOffloadInOrder(emit) {
    this._offloadEmits = (this._offloadEmits ?? Promise.resolve())
      .then(emit)
      .catch((e) => log.debug('[ai-offload] emit failed', e?.message))
  }

  async findDeviceByLocalKey(localKeyHex) {
    if (!localKeyHex) return null
    const devices = await this._collect(viewStore.syncedDevices)
    return devices.find((device) => device.value?.localKey === localKeyHex) || null
  }

  async hasSyncedDeviceWithLocalKey(localKeyHex) {
    return !!(await this.findDeviceByLocalKey(localKeyHex))
  }

  async subscribeSyncedDevice(key) {
    const db = await this.autobaseDb()
    return db ? viewStore.watchSyncedDevice(db, key) : null
  }

  async subscribeAllSyncedDeviceKeys() {
    const db = await this.autobaseDb()
    return db ? viewStore.watchSyncedDeviceKeys(db) : null
  }

  // Also claims this core's caps and compat level on the device record, which the gates read.
  async publishLocalSwarmKey() {
    if (!this.writable || this.updateRequired) return
    const own = await this.findDeviceByLocalKey(this.localKeyHex)
    if (!own) return
    const now = Date.now()
    const swarmKey = this._swarmKeyHex || own.value.swarmKey
    const caps = withCap(own.value.caps, SEALED_NOTES_CAP)
    const appVersion = this.appVersion || own.value.appVersion || ''
    const unchanged =
      own.value.swarmKey === swarmKey &&
      own.value.caps === caps &&
      own.value.compatLevel === COMPAT_LEVEL &&
      (own.value.appVersion || '') === appVersion
    if (unchanged && now - this._devicePublishedAt < DEVICE_REFRESH_MS) return
    const value = { ...own.value, caps, compatLevel: COMPAT_LEVEL, lastSeenAt: now, updatedAt: now }
    if (appVersion) value.appVersion = appVersion
    if (swarmKey) value.swarmKey = swarmKey
    await this.updateSyncedDevice({ key: own.key, value })
    this._devicePublishedAt = now
  }

  async listSyncedDevicesStrict() {
    const devices = await this._collect(viewStore.syncedDevices, null)
    if (!devices) throw new Error('device list unreadable')
    return devices
  }

  async getSyncedPref(id) {
    return (await this.getSyncedPrefs(id))[id] ?? null
  }

  async activateGate(name, compatLevel) {
    const record = { activatedAt: Date.now(), byDevice: this.localKeyHex || '', compatLevel }
    const min = minCompatLevelOf(await this.getSyncedPref(MIN_COMPAT_PREF))
    if (compatLevel > min) await this.setSyncedPref(MIN_COMPAT_PREF, { level: compatLevel })
    await this.setSyncedPref(gatePrefId(name), record)
    log.info('[vault] gate opened', name)
  }

  async isActivityLogEnabled() {
    return !!(await this.getSettings().catch(() => null))?.[ACTIVITY_LOG_ENABLED_KEY]
  }

  async getActivityRetentionDays() {
    const raw = (await this.getSettings().catch(() => null))?.[ACTIVITY_RETENTION_DAYS_KEY]
    return normalizeActivityRetentionDays(raw ?? ACTIVITY_DEFAULT_RETENTION_DAYS)
  }

  async logActivityEvent(event, { targetKey = '', targetTitle = '', meta = {} } = {}) {
    if (!event || !this.writable || !(await this.isActivityLogEnabled())) return
    await this.append({ type: OP.LOG_EVENT, event, targetKey, targetTitle, meta })
  }

  async pruneActivity(now = Date.now()) {
    if (!this.writable || !(await this.isActivityLogEnabled())) return 0
    const days = await this.getActivityRetentionDays()
    if (isActivityRetentionForever(days)) return 0
    const cutoff = now - days * 24 * 60 * 60 * 1000
    const db = await this.autobaseDb()
    if (cutoff <= 0 || !db) return 0
    const boundary = String(cutoff).padStart(ACTIVITY_SEQ_PAD, '0')
    if (!(await viewStore.hasActivityBefore(db, boundary))) return 0
    await this.append({ type: OP.PRUNE_ACTIVITY, cutoff })
    return 1
  }

  async clearActivity() {
    await this.append({ type: OP.CLEAR_ACTIVITY })
  }

  async setSyncedPref(id, value) {
    await this.append({ type: OP.SET_SYNCED_PREF, id, value, noActivity: true })
  }

  async setSyncedPrefs(entries) {
    await this.append(
      entries.map(([id, value]) => ({ type: OP.SET_SYNCED_PREF, id, value, noActivity: true }))
    )
  }

  async getSyncedPrefs(prefix = '') {
    const db = await this.autobaseDb()
    return db ? viewStore.syncedPrefs(db, prefix) : {}
  }

  async getLockKeyrings() {
    return Object.values(await this.getSyncedPrefs(KEYRING_PREF_PREFIX)).filter(isKeyringEntry)
  }

  async sealedKeyringIds() {
    const ids = new Set()
    for (const { value } of await this.getAllNotesStrict()) {
      const id = envelopeKeyringId(value?.sealed)
      if (id) ids.add(id)
    }
    return ids
  }

  async hasLockKeyring() {
    return (await this.getLockKeyrings()).length > 0
  }

  async getActivity({
    filter = ACTIVITY_FILTER.ALL,
    deviceKey = '',
    noteKey = '',
    limit,
    cursor = ''
  } = {}) {
    try {
      const db = await this.autobaseDb()
      if (!db) return { entries: [], cursor: '', hasMore: false }
      return await listActivity(db, { filter, deviceKey, noteKey, limit, cursor })
    } catch (e) {
      log.error('[activity] read failed', e)
      return { entries: [], cursor: '', hasMore: false }
    }
  }

  async getActivityDiff(id) {
    try {
      const db = await this.autobaseDb()
      return await activityDiff(db, id)
    } catch (e) {
      log.error('[activity] diff failed', e)
      return { id: id || '', before: '', after: '', locked: false, available: false }
    }
  }

  async getActivityStats() {
    try {
      const db = await this.autobaseDb()
      return db ? await activityStats(db) : { count: 0, bytes: 0, oldestAt: 0 }
    } catch (e) {
      log.error('[activity] stats failed', e)
      return { count: 0, bytes: 0, oldestAt: 0 }
    }
  }

  async subscribeActivity() {
    const db = await this.autobaseDb()
    return db ? viewStore.watchActivity(db) : null
  }

  // Writes are ordered, never discarded, so there is nothing to recover.
  async recoverDiscardedNoteWrite() {
    return { done: false, noteKey: '' }
  }

  insertFile(args) {
    return this.media.insertFile(args)
  }

  insertFileWithProgress(key, path, onProgress, token, seal = null) {
    return this.media.insertFileWithProgress(key, path, onProgress, token, seal)
  }

  getFile(args) {
    return this.media.getFile(args)
  }

  deleteFile(key) {
    return this.media.deleteFile(key)
  }

  deleteNoteFile(noteKey, mediaPath, reseal) {
    return this.media.deleteNoteFile(noteKey, mediaPath, reseal)
  }

  pruneRemovedMedia(noteKey, before, after) {
    return this.media.pruneRemovedMedia(noteKey, before, after)
  }

  async deleteNoteWithMedia(noteKey) {
    await this.media.deleteNoteMedia(noteKey)
    await this.removeNote(noteKey)
  }

  reclaimOrphanedBlobs() {
    return this.media.reclaim()
  }

  isMediaSyncHeld() {
    return !!this.media?.held
  }

  setMediaSyncHeld(held) {
    return this.media.setHeld(held)
  }

  retryDownload(url) {
    return this.media.retryDownload(url)
  }

  pauseDownload(url) {
    return this.media.pauseDownload(url)
  }

  getDownloadsInfo() {
    return this.media?.getDownloadsInfo() || []
  }

  getUploadsInfo() {
    return this.media?.getUploadsInfo() || []
  }

  async missingMediaUrls(urls) {
    return this.media ? this.media.missingUrls(urls) : new Set()
  }

  getFilesWaitingToSeal() {
    return this.media ? this.media.getSealWaitingInfo() : []
  }

  async getNotesStorageInfo() {
    return this.media.storageInfo(await this.getAllNotes())
  }

  async subscribeStorageInfo() {
    return this.media.subscribeStorageInfo(await this.autobaseDb())
  }

  async exportBackup(password, filePath, cb = noop, signal = null, options = {}) {
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

  checkBackupRestore({ buffer, filePath, password }) {
    return checkBackupRestore(this, { buffer, filePath, password })
  }

  async importBackup({ buffer, filePath, recoveryKey, password, signal = null, cb = noop }) {
    const summary = await restoreBackup(
      this,
      { buffer, filePath, recoveryKey, password, signal },
      cb
    )
    await this.logActivityEvent(ACTIVITY_EVENT.BACKUP_RESTORED)
    return summary
  }

  // Pairing, inviting side.
  createInvite(opts) {
    return this.hostPairing.createInvite(opts)
  }

  subscribePairing(cb) {
    return this.hostPairing.subscribe(cb, this.swarm)
  }

  confirmPairing() {
    this.hostPairing.confirm()
  }

  rejectPairing() {
    return this.hostPairing.reject()
  }

  // Pairing, joining side. The current vault stays open and untouched until the
  // other device has accepted this one; only then does this device switch.
  // `mode: 'add'` keeps the current vault and adds the joined one beside it;
  // 'replace' is the original single-vault flow.
  async subscribePairUser(cb, invite, deviceName, { mode = 'replace', name = '' } = {}) {
    if (this._pairingInFlight) return
    if (this._vaultBusy) {
      cb({ step: 'error', progress: 0, reason: VAULT_ERROR.BUSY })
      return
    }
    const adding = mode === 'add'
    if (adding && listVaultEntries(readPointer(this.path)).length >= MAX_VAULTS) {
      cb({ step: 'error', progress: 0, reason: VAULT_ERROR.MAX_VAULTS })
      return
    }
    this._pairingInFlight = true
    const status = (value) => {
      try {
        cb(value)
      } catch (e) {
        log.error('[pairing] status listener failed', e)
      }
    }
    let joinRel = null
    let joinStore = null
    try {
      if (getInviteVersion(invite) < PAIRING_INVITE_VERSION) {
        status({ step: 'error', progress: 0, reason: PAIRING_OUTDATED.INVITE })
        return
      }
      const hostBox = getInviteHostBox(invite)
      if (!hostBox) {
        status({ step: 'error', progress: 0, reason: PAIRING_OUTDATED.INVITE })
        return
      }
      const inviteBuffer = b4a.from(extractInvite(invite), 'hex')
      const expires = this._inviteExpiry(inviteBuffer)
      if (expires && isInviteLongExpired(expires)) {
        status({ step: 'expired', progress: 0, reason: 'invite_expired' })
        return
      }

      status({ step: 'clearing_data', progress: 10 })
      joinRel = newVaultDir()
      joinStore = new Corestore(resolveVaultDir(this.path, joinRel))
      await joinStore.ready()
      const localKey = hex(await localWriterKey(joinStore))

      const outcome = await requestToJoin({
        store: joinStore,
        bootstrap: this.swarmBootstrap,
        invite: inviteBuffer,
        hostBox: b4a.from(hostBox, 'hex'),
        deviceName,
        onCode: (code) => status({ step: 'searching', progress: 20, localKey, code })
      })
      await joinStore.close()
      joinStore = null
      if (outcome.step !== 'added') {
        removeDir(resolveVaultDir(this.path, joinRel))
        status(
          outcome.step === 'rejected'
            ? { step: 'rejected', progress: 0 }
            : { step: 'error', progress: 0, reason: outcome.step }
        )
        return
      }

      const { key, encryptionKey } = outcome.result
      const encryption = hex(encryptionKey)
      status({ step: 'connected', progress: 30 })
      status({ step: 'authenticating', progress: 50, encryptionKey: encryption })

      const merge = adding ? false : await this._captureForMerge(encryption)
      const previous = this._vaultDir
      status({ step: 'initializing_storage', progress: 70, encryptionKey: encryption })
      await this.hostPairing.close()
      await this._closeVault()
      const pointer = readPointer(this.path)
      if (adding) {
        const entry = { dir: joinRel, name: sanitizeVaultName(name), addedAt: Date.now() }
        writePointer(this.path, { ...withVault(pointer, entry), current: joinRel })
      } else {
        writePointer(this.path, {
          ...withReplacedVault(pointer, previous, joinRel),
          current: joinRel,
          merge: merge || null,
          retire: [previous]
        })
      }
      this.encryption = encryption
      this.encryptionKey = encryptionKey
      joinRel = null
      await this._openVault(readPointer(this.path).current, { key, encryptionKey })

      status({ step: 'replicating_data', progress: 85, encryptionKey: encryption })
      const writable = await this._waitWritable(WRITABLE_TIMEOUT_MS)
      await this._waitForData(status)
      if (merge && !writable) {
        // Retried by maintenance the moment this device becomes a writer.
        status({ step: 'merge_failed', reason: 'not_writable', encryptionKey: encryption })
      } else if (merge) {
        const held = await this.heldMerge()
        if (held.held) {
          status({
            step: 'merge_needs_confirm',
            progress: 92,
            blocking: held.blocking,
            encryptionKey: encryption
          })
        } else {
          status({ step: 'restoring_local_data', progress: 92, encryptionKey: encryption })
        }
        if (!held.held && !(await this._finishMerge())) {
          status({ step: 'merge_failed', reason: 'restore_error', encryptionKey: encryption })
        }
      }
      await this._retireOldVaults()
      status({ step: 'done', progress: 100, encryptionKey: encryption })
    } catch (e) {
      log.error('[pairing] joining failed', e)
      status({ step: 'error', progress: 0 })
    } finally {
      await joinStore?.close().catch(noop)
      if (joinRel) removeDir(resolveVaultDir(this.path, joinRel))
      this._pairingInFlight = false
    }
  }

  _inviteExpiry(inviteBuffer) {
    try {
      return BlindPairing.decodeInvite(inviteBuffer)?.expires || 0
    } catch {
      return 0
    }
  }

  // Written with the joined vault's key as the password, so no other key has to
  // sit on disk beside it.
  async _captureForMerge(passwordHex) {
    const notes = await this.getAllNotes()
    const folders = await this.getAllFolders()
    if (!notes.length && !folders.length) return false
    const filePath = mergeFilePath(this.path)
    removeDir(filePath)
    await buildBackup(this, notes, folders, {}, passwordHex, filePath)
    return (await this.hasLockKeyring()) ? MERGE_LOCKED : true
  }

  // Merging a keyring into a vault with none skips the sealedNotes gate, so it waits for old devices.
  async heldMerge() {
    const pointer = readPointer(this.path)
    if (pointer?.merge !== MERGE_LOCKED || (await this.hasLockKeyring())) {
      this._mergeHeld = false
      return { held: false, blocking: [] }
    }
    const { blocking } = await gateStatus(this, 'sealedNotes')
    this._mergeHeld = blocking.length > 0
    return { held: this._mergeHeld, blocking }
  }

  _scheduleHeldMergeCheck() {
    if (!this._mergeHeld || this._heldMergeTimer) return
    this._heldMergeTimer = setTimeout(() => {
      this._heldMergeTimer = null
      this._recheckHeldMerge().catch((e) =>
        log.debug('[pairing] held merge check failed', e?.message)
      )
    }, HELD_MERGE_RECHECK_MS)
    this._heldMergeTimer.unref?.()
  }

  async _recheckHeldMerge() {
    if (this.isClosing || !this.writable || (await this.heldMerge()).held) return
    await this._resumeMerge()
    this.emit('held-merge-changed')
  }

  async combineHeldMerge() {
    if (!this.writable) return !readPointer(this.path)?.merge
    if (this._merging) await this._merging
    const pointer = readPointer(this.path)
    if (!pointer?.merge) return true
    if (pointer.merge === MERGE_LOCKED) {
      writePointer(this.path, { ...pointer, merge: MERGE_CONFIRMED })
    }
    const merged = (await this._finishMerge()) === true
    if (merged) await this._retireOldVaults()
    return merged
  }

  async _resumeMerge() {
    if (readPointer(this.path)?.merge && this.writable) await this._finishMerge()
    await this._retireOldVaults()
  }

  _finishMerge() {
    if (!this._merging) {
      this._merging = this._merge().finally(() => {
        this._merging = null
      })
    }
    return this._merging
  }

  async _merge() {
    const filePath = mergeFilePath(this.path)
    const pointer = readPointer(this.path)
    if (!fs.existsSync(filePath)) {
      writePointer(this.path, { ...pointer, merge: null })
      return true
    }
    try {
      if ((await this.heldMerge()).held) return MERGE_HELD
      await restoreBackup(this, { filePath, password: this.encryption }, noop)
      fs.rmSync(filePath, { force: true })
      writePointer(this.path, { ...readPointer(this.path), merge: null })
      return true
    } catch (e) {
      log.error("[pairing] merging this device's earlier notes failed", e)
      return false
    }
  }

  async _retireOldVaults() {
    const pointer = readPointer(this.path)
    if (!pointer?.retire?.length || pointer.merge || !this.writable) return
    for (const relative of pointer.retire) {
      if (relative && relative !== pointer.current) removeDir(resolveVaultDir(this.path, relative))
    }
    writePointer(this.path, { ...pointer, retire: [] })
  }

  listVaults() {
    return listVaultEntries(readPointer(this.path)).map(({ id, name, addedAt, current }) => ({
      id,
      name,
      addedAt,
      current
    }))
  }

  async createVault({ name } = {}) {
    const clean = sanitizeVaultName(name)
    if (!clean) throw vaultError(VAULT_ERROR.EMPTY_NAME)
    return this._vaultOp(async (pointer) => {
      if (listVaultEntries(pointer).length >= MAX_VAULTS) throw vaultError(VAULT_ERROR.MAX_VAULTS)
      const dir = newVaultDir()
      const key = crypto.randomBytes(32)
      const entry = { dir, name: clean, addedAt: Date.now() }
      try {
        await this._enterVault(dir, { ...withVault(pointer, entry), current: dir }, key)
      } catch (err) {
        removeDir(resolveVaultDir(this.path, dir))
        throw err
      }
      return vaultIdOf(dir)
    })
  }

  async switchVault(id) {
    return this._vaultOp(async (pointer) => {
      const entry = findVaultEntry(pointer, id)
      if (!entry) throw vaultError(VAULT_ERROR.UNKNOWN_VAULT)
      if (entry.current) return id
      await this._enterVault(entry.dir, { ...pointer, current: entry.dir }, this.encryptionKey)
      return id
    })
  }

  async renameVault(id, name) {
    const clean = sanitizeVaultName(name)
    if (!clean) throw vaultError(VAULT_ERROR.EMPTY_NAME)
    if (this._vaultBusy) throw vaultError(VAULT_ERROR.BUSY)
    const pointer = readPointer(this.path)
    const entry = findVaultEntry(pointer, id)
    if (!entry) throw vaultError(VAULT_ERROR.UNKNOWN_VAULT)
    writePointer(this.path, withVaultName(pointer, entry.dir, clean))
    return true
  }

  // Leaves the vault's device list, then deletes it from this device only.
  async removeVault(id, { timeoutMs = VAULT_LEAVE_TIMEOUT_MS, force = false } = {}) {
    return this._vaultOp(async (pointer) => {
      const entries = listVaultEntries(pointer)
      const entry = entries.find((v) => v.id === id)
      if (!entry) throw vaultError(VAULT_ERROR.UNKNOWN_VAULT)
      const fallback = entries.find((v) => v.id !== id)
      if (!fallback) throw vaultError(VAULT_ERROR.LAST_VAULT)
      const opened = entries.find((v) => v.current)
      if (isMarkedRemoved(resolveVaultDir(this.path, entry.dir))) {
        if (entry.current) {
          const next = withoutVault({ ...pointer, current: fallback.dir }, entry.dir)
          await this._enterVault(fallback.dir, next, this.encryptionKey)
        } else {
          writePointer(this.path, withoutVault(pointer, entry.dir))
        }
        removeDir(resolveVaultDir(this.path, entry.dir))
        return { left: true, replicated: true }
      }
      if (!entry.current) {
        await this._enterVault(entry.dir, { ...pointer, current: entry.dir }, this.encryptionKey)
      }
      // The other devices must not lose their only leader unless the user accepts it.
      const soleLeader = this._isSoleLeader() && (await this._hasOtherDevices())
      const handedOff =
        soleLeader && (await this._handOffLeadership(force ? 0 : LEADER_HANDOFF_WAIT_MS))
      if (soleLeader && !handedOff && !force) {
        if (!entry.current) {
          await this._enterVault(
            opened.dir,
            { ...readPointer(this.path), current: opened.dir },
            this.encryptionKey
          )
        }
        throw vaultError(VAULT_ERROR.SYNC_LEADER)
      }
      if (soleLeader && !handedOff)
        log.warn('[vault] removing the only sync leader of a shared vault')
      let result = { left: false, replicated: false }
      try {
        // The vault may have been opened just now; give its peers a moment to connect.
        if (!(soleLeader && !handedOff) && (await this._hasOtherDevices())) {
          await this._waitForPeer(timeoutMs)
        }
        result = await this.leaveSyncCluster({ timeoutMs })
      } catch (e) {
        log.error('[vault] leaving before removal failed, removing locally anyway', e)
      }
      const next = withoutVault({ ...readPointer(this.path), current: fallback.dir }, entry.dir)
      await this._enterVault(fallback.dir, next, this.encryptionKey)
      removeDir(resolveVaultDir(this.path, entry.dir))
      return result
    })
  }

  // Copies notes (and whole folders) into another vault through an encrypted
  // backup, then trashes the originals. Keys are kept, so a retry after a
  // failure overwrites the partial copy instead of duplicating it.
  async moveToVault({ targetId, noteKeys = [], folderKeys = [] } = {}) {
    return this._vaultOp(async (pointer) => {
      const entries = listVaultEntries(pointer)
      const target = entries.find((v) => v.id === targetId)
      if (!target) throw vaultError(VAULT_ERROR.UNKNOWN_VAULT)
      if (target.current) throw vaultError(VAULT_ERROR.SAME_VAULT)
      const source = entries.find((v) => v.current)
      const { notes, folders } = await this._collectForMove(noteKeys, folderKeys)
      if (!notes.length && !folders.length) throw vaultError(VAULT_ERROR.NOTHING_TO_MOVE)

      const filePath = barePath.join(this.path, VAULT_MOVE_FILE)
      const password = hex(crypto.randomBytes(32))
      removeDir(filePath)
      try {
        await buildBackup(this, notes, folders, {}, password, filePath, noop, null, {
          strict: true
        })
      } catch (err) {
        removeDir(filePath)
        if (err?.message === BACKUP_ERROR.INCOMPLETE)
          throw vaultError(VAULT_ERROR.MISSING_MEDIA, err)
        throw err
      }

      try {
        await this._enterVault(
          target.dir,
          { ...readPointer(this.path), current: target.dir },
          this.encryptionKey
        )
        try {
          await restoreBackup(this, { filePath, password }, noop)
        } finally {
          const back = { ...readPointer(this.path), current: source.dir }
          await this._enterVault(source.dir, back, this.encryptionKey)
        }
        for (const note of notes) await this.trashNote(note.key)
        for (const folder of folders) await this.removeFolder(folder.key)
        return { moved: notes.length, folders: folders.length }
      } finally {
        removeDir(filePath)
      }
    })
  }

  async _collectForMove(noteKeys, folderKeys) {
    const folderSet = new Set(folderKeys)
    const noteSet = new Set(noteKeys)
    const folders = (await this.getAllFolders()).filter((f) => folderSet.has(f.key))
    const movedFolders = new Set(folders.map((f) => f.key))
    const notes = (await this.getAllNotesStrict())
      .filter(({ key, value }) => {
        if (!value || value.folderKey === RECENTLY_DELETED_KEY) return false
        return noteSet.has(key) || movedFolders.has(value.folderKey)
      })
      .map(({ key, value }) => ({
        key,
        value: movedFolders.has(value.folderKey) ? value : { ...value, folderKey: ALL_NOTES_KEY }
      }))
    return { notes, folders }
  }

  async _handOffLeadership(waitMs) {
    await this._waitForPeer(waitMs)
    for (const device of await this._collect(viewStore.syncedDevices)) {
      const localKey = device.value?.localKey
      if (!localKey || localKey === this.localKeyHex) continue
      if (!(await this._isReachable(localKey))) continue
      try {
        await this.transferIndexer({ localKey })
        return true
      } catch (e) {
        log.warn('[vault] handing sync leadership to another device failed', e)
      }
    }
    return false
  }

  async _waitForPeer(timeoutMs) {
    const started = Date.now()
    while (!this.swarm?.connections.size && Date.now() - started < timeoutMs && !this.isClosing) {
      await wait(250)
    }
  }

  async _hasOtherDevices() {
    const own = await this.findDeviceByLocalKey(this.localKeyHex)
    return (await this.getAllSyncedDeviceKeys()).length - (own ? 1 : 0) > 0
  }

  // One vault is open at a time. A pending merge belongs to the open vault, so
  // nothing may leave it until the merge has been replayed.
  async _vaultOp(task) {
    if (this._vaultBusy || this._pairingInFlight || this.isClosing) {
      throw vaultError(VAULT_ERROR.BUSY)
    }
    const pointer = readPointer(this.path)
    if (!pointer || pointer.merge) throw vaultError(VAULT_ERROR.BUSY)
    this._vaultBusy = true
    try {
      return await task(pointer)
    } finally {
      this._vaultBusy = false
    }
  }

  // If the target cannot be opened, the vault that was open is opened again.
  async _enterVault(dir, pointer, encryptionKey) {
    const previous = readPointer(this.path)
    const previousKey = this.encryptionKey
    await this._writeChain.catch(noop)
    await this.hostPairing.close()
    await this._closeVault()
    this._leaving = false
    try {
      writePointer(this.path, pointer)
      this.encryptionKey = encryptionKey
      this.encryption = hex(encryptionKey)
      await this._openVault(dir, { encryptionKey })
    } catch (err) {
      log.error('[vault] opening a vault failed, reopening the previous one', err)
      await this._closeVault()
      writePointer(this.path, previous)
      this.encryptionKey = previousKey
      this.encryption = hex(previousKey)
      await this._openVault(previous.current, { encryptionKey: previousKey })
      throw vaultError(VAULT_ERROR.OPEN_FAILED, err)
    }
  }

  async _waitWritable(timeoutMs) {
    const started = Date.now()
    while (!this.writable && Date.now() - started < timeoutMs && !this.isClosing) {
      await this.autobase?.update().catch(noop)
      await wait(300)
    }
    return this.writable
  }

  async _waitForData(status) {
    const started = Date.now()
    while (Date.now() - started < DATA_WAIT_MS && !this.isClosing) {
      await this.autobase?.update().catch(noop)
      const notes = await this.getAllNoteKeys()
      status({ step: 'receiving_data', progress: 90, data: notes.length })
      if (notes.length || (await this.getAllSyncedDeviceKeys()).length) return
      await wait(1000)
    }
  }

  async waitForData(cb = noop) {
    await this._waitForData(cb)
  }

  // Waits until the departure is INDEXED, not merely uploaded somewhere: a
  // device may only wipe itself once nothing it wrote still depends on it.
  async leaveSyncCluster({ timeoutMs = LEAVE_TIMEOUT_MS } = {}) {
    const skipped = { left: false, replicated: false }
    if (!this.writable) return skipped
    const own = await this.findDeviceByLocalKey(this.localKeyHex)
    const others = (await this.getAllSyncedDeviceKeys()).length - (own ? 1 : 0)
    if (!own || others === 0) return skipped
    this._leaving = true
    try {
      await this.removeSyncedDevice(own.key)
    } catch (e) {
      this._leaving = false
      throw e
    }
    const target = this.autobase.length
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      if (this.autobase?.indexedLength >= target) return { left: true, replicated: true }
      await this.autobase?.update().catch(noop)
      await wait(250)
    }
    log.warn('[leave] departure not confirmed by a sync leader before the timeout')
    return { left: true, replicated: false }
  }

  async clearStorage() {
    await this.close()
    for (const name of fs.existsSync(this.path) ? fs.readdirSync(this.path) : []) {
      if (!isPreservedEntry(name))
        fs.rmSync(barePath.join(this.path, name), { recursive: true, force: true })
    }
    if (fs.existsSync(this.path) && fs.readdirSync(this.path).length === 0) {
      fs.rmSync(this.path, { recursive: true })
    }
  }

  // Leaders ack each other's nodes, and the last acks are only confirmed by the
  // next real write, so `length - indexedLength` stays above 0 with 2+ leaders.
  // Count only the nodes that carry a write.
  async _countWrites(core, from, to) {
    const start = Math.max(from, to - SCAN_LIMIT)
    let pending = start - from
    for (let i = start; i < to; i++) {
      const block = await core.get(i, { wait: false }).catch(() => null)
      if (!block || block.node?.value) pending++
    }
    return pending
  }

  async unconfirmedWrites() {
    const writer = this.autobase?.localWriter
    if (!writer) return null
    return this._countWrites(this.autobase.local, writer.indexed, this.autobase.local.length)
  }

  async pendingWrites() {
    const base = this.autobase
    if (!base) return null
    let pending = 0
    for (const w of base.activeWriters || []) {
      if (!w.core) continue
      const to = w === base.localWriter ? Math.max(w.length, base.local.length) : w.length
      pending += await this._countWrites(w.core, w.indexed, to)
    }
    return pending
  }

  _encryptionFingerprint() {
    const key = this.autobase?.encryptionKey || this.encryptionKey
    if (!key?.length) return null
    return crypto.createHash('sha256').update(key).digest('hex').slice(0, 8)
  }

  async getDebugInfo(heavy = false) {
    const base = this.autobase
    const indexerKeys = this.getIndexerKeys()
    const writer = base?.localWriter
    const autobase = {
      opened: !!base,
      autobaseKey: hex(base?.key),
      discoveryKey: hex(base?.discoveryKey),
      systemKey: hex(base?.core?.key),
      length: numberOrNull(base?.length),
      indexedLength: numberOrNull(base?.indexedLength),
      signedLength: numberOrNull(base?.signedLength),
      backlog: await this.pendingWrites(),
      writable: base ? !!base.writable : null,
      localKey: hex(base?.local?.key),
      localWriterLength: numberOrNull(writer?.length),
      localWriterCoreLength: numberOrNull(writer?.core?.length),
      localWriterRemoved: writer ? !!writer.isRemoved : null,
      localUnconfirmed: await this.unconfirmedWrites(),
      systemMembers: numberOrNull(base?.system?.members),
      heads: numberOrNull(base?.system?.heads?.length),
      indexerKeys,
      indexerCount: indexerKeys.length,
      majority: indexerKeys.length ? (indexerKeys.length >>> 1) + 1 : null,
      reopening: !!this._reopening,
      reopenAttempts: this._reopenAttempts,
      encryptionFingerprint: this._encryptionFingerprint(),
      lastFastForwardAt: this._lastFastForward?.at ?? null,
      lastFastForwardFrom: this._lastFastForward?.from ?? null,
      lastFastForwardTo: this._lastFastForward?.to ?? null
    }
    try {
      const db = await this.autobaseDb()
      const view = db?.core
      autobase.viewVersion = numberOrNull(db?.db?.version)
      autobase.viewCoreLength = numberOrNull(view?.length)
      autobase.viewContiguousLength = numberOrNull(view?.contiguousLength)
    } catch (err) {
      log.debug('[vault] ignored', err?.message || err)
    }

    const writers = []
    for (const w of base?.activeWriters || []) {
      writers.push({
        key: hex(w.core?.key),
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

    const devices = []
    for (const key of await this.getAllSyncedDeviceKeys()) {
      const device = await this.getSyncedDevice(key)
      if (!device) continue
      devices.push({
        title: device.title || '',
        deviceType: device.deviceType || '',
        platform: device.platform || '',
        localKey: device.localKey || '',
        swarmKey: device.swarmKey || '',
        isLocal: device.isLocal,
        isOnline: device.isOnline,
        presenceKnown: device.presenceKnown,
        isIndexer: device.isIndexer
      })
    }

    const drive = this.hyperdrive
    const storage = {
      driveKey: hex(drive?.key),
      driveVersion: numberOrNull(drive?.version),
      blobsCoreLength: numberOrNull(drive?.blobs?.core?.length),
      blobsPeers: numberOrNull(drive?.blobs?.core?.peers?.length),
      blobServerAddress: this.media ? this.media.publicAddress() : null,
      corePath: this._vaultDir ? resolveVaultDir(this.path, this._vaultDir) : null
    }
    if (heavy) {
      try {
        const notes = await this.getAllNotes()
        const info = await this.media.storageInfo(notes)
        storage.noteCount = notes.filter((n) => n.value?.folderKey !== RECENTLY_DELETED_KEY).length
        storage.trashedCount = notes.length - storage.noteCount
        storage.folderCount = (await this.getAllFolders()).length
        storage.attachmentCount = (info.notes || []).reduce(
          (sum, note) => sum + note.media.length,
          0
        )
        const stats = await this.getActivityStats()
        storage.activityCount = stats.count
        storage.activityBytes = stats.bytes
        storage.activityOldestAt = stats.oldestAt
      } catch (e) {
        storage.heavyError = String(e?.message || e)
      }
    }

    return {
      capturedAt: Date.now(),
      heavy: !!heavy,
      autobase,
      swarm: {
        started: !!this.swarm,
        joined: !!this.discovery,
        publicKey: this._swarmKeyHex,
        connections: numberOrNull(this.swarm?.connections?.size),
        peers: numberOrNull(this.swarm?.peers?.size),
        connectedKeys: [...this._connectedSwarmKeys],
        suspended: this._suspended,
        mediaSyncHeld: this.isMediaSyncHeld(),
        activeDownloads: this.getDownloadsInfo().length,
        activeUploads: this.getUploadsInfo().length,
        downloads: this.getDownloadsInfo(),
        uploads: this.getUploadsInfo()
      },
      devices,
      writers,
      storage,
      runtime: { bareVersion: globalThis.Bare?.version || null }
    }
  }
}

export default NoteBase
