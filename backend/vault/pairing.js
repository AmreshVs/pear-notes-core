import Autobase from 'autobase'
import b4a from 'b4a'
import crypto from 'bare-crypto'
import { platform } from 'bare-os'
import BlindPairing from 'blind-pairing'
import Hypercore from 'hypercore'
import hypercoreCrypto from 'hypercore-crypto'
import Hyperswarm from 'hyperswarm'
import sodium from 'sodium-universal'

import {
  ACTIVITY_EVENT,
  INVITE_EXPIRY_MS,
  PAIRING_HOST_UNVERIFIED,
  PAIRING_INVITE_REMOVED,
  PAIRING_INVITE_VERSION,
  PAIRING_OUTDATED,
  sanitizeDeviceName
} from '../../constant.js'
import * as log from '../../log.js'
import {
  isInviteExpired as expiredAt,
  extractInvite,
  formatDeviceInvite,
  formatPairingCode,
  getInviteHostBox,
  getInviteVersion
} from '../../utils.js'
import { SEALED_NOTES_CAP, hasSealedNotesCap } from '../deviceCaps.js'
import {
  COMPAT_LEVEL,
  MIN_COMPAT_PREF,
  deviceCompatLevel,
  minCompatLevelOf
} from '../featureGates.js'
import { INVITE_KEY } from '../viewKeys.js'

const PAIRING_TIMEOUT_MS = 180000
const INVITE_POLL_MS = 800
const JOIN_PROOF_NAMESPACE = b4a.from('pear-notes/join-proof/v2')
const HOST_BOX_NAMESPACE = b4a.from('pear-notes/host-box/v1')
const KEY_MASK_NAMESPACE = b4a.from('pear-notes/key-mask/v1')
const PAIRING_CODE_NAMESPACE = b4a.from('pear-notes/pairing-code/v1')
const PAIRING_CODE_OPSLIMIT = 3
const PAIRING_CODE_MEMLIMIT = 32 * 1024 * 1024

export const isInviteExpired = (invite) => !!invite?.expires && expiredAt(invite.expires)

const isCurrentInvite = (invite) =>
  getInviteVersion(invite.invite) >= PAIRING_INVITE_VERSION && !!getInviteHostBox(invite.invite)

const joinSignable = (inviteId, key, box) =>
  hypercoreCrypto.hash([JOIN_PROOF_NAMESPACE, inviteId, key, box])

export function createJoinProof(core, inviteId, box) {
  const manifest = core.getManifest({ raw: true })
  const secretKey = core.keyPair?.secretKey
  if (!manifest || !secretKey) return null
  return {
    manifest: b4a.toString(manifest, 'hex'),
    signature: b4a.toString(
      hypercoreCrypto.sign(joinSignable(inviteId, core.key, box), secretKey),
      'hex'
    )
  }
}

// The writer key in userData is only a claim; a known one skips confirmation, so it must be proven.
export function provesWriterKey(inviteId, keyHex, box, proof) {
  try {
    if (!box || typeof proof?.manifest !== 'string' || typeof proof?.signature !== 'string')
      return false
    const manifest = Hypercore.parseManifest(b4a.from(proof.manifest, 'hex'))
    if (!manifest || manifest.signers.length !== 1 || manifest.quorum !== 1) return false
    const key = Hypercore.key(manifest)
    if (b4a.toString(key, 'hex') !== keyHex) return false
    return hypercoreCrypto.verify(
      joinSignable(inviteId, key, box),
      b4a.from(proof.signature, 'hex'),
      manifest.signers[0].publicKey
    )
  } catch {
    return false
  }
}

function boxKeyPair(seed) {
  const publicKey = b4a.alloc(sodium.crypto_box_PUBLICKEYBYTES)
  const secretKey = b4a.alloc(sodium.crypto_box_SECRETKEYBYTES)
  if (seed) sodium.crypto_box_seed_keypair(publicKey, secretKey, seed)
  else sodium.crypto_box_keypair(publicKey, secretKey)
  return { publicKey, secretKey }
}

const hostBoxKeyPair = (encryptionKey, inviteId) =>
  boxKeyPair(hypercoreCrypto.hash([HOST_BOX_NAMESPACE, encryptionKey, inviteId]))

export const inviteHostBox = (encryptionKey, inviteId) =>
  hostBoxKeyPair(encryptionKey, inviteId).publicKey

function keyMask(secretKey, remotePublicKey, inviteId, hostBoxPublicKey, joinerBoxPublicKey) {
  const shared = b4a.alloc(sodium.crypto_scalarmult_BYTES)
  sodium.crypto_scalarmult(shared, secretKey, remotePublicKey)
  return hypercoreCrypto.hash([
    KEY_MASK_NAMESPACE,
    inviteId,
    shared,
    hostBoxPublicKey,
    joinerBoxPublicKey
  ])
}

const xor = (a, b) => b4a.from(a.map((byte, i) => byte ^ b[i]))

export function maskedReply({ encryptionKey, inviteId, invite, joinerBox }) {
  const host = hostBoxKeyPair(encryptionKey, inviteId)
  const mask = keyMask(host.secretKey, joinerBox, inviteId, host.publicKey, joinerBox)
  const { seed } = BlindPairing.decodeInvite(b4a.from(extractInvite(invite), 'hex'))
  return {
    encryptionKey: xor(encryptionKey, mask),
    additional: {
      data: host.publicKey,
      signature: hypercoreCrypto.sign(host.publicKey, hypercoreCrypto.keyPair(seed).secretKey)
    }
  }
}

export async function pairingCode(inviteId, writerKey, joinerBox) {
  const seed = hypercoreCrypto.hash([PAIRING_CODE_NAMESPACE, inviteId, writerKey, joinerBox])
  const out = b4a.alloc(32)
  await sodium.crypto_pwhash_async(
    out,
    seed,
    seed.subarray(0, sodium.crypto_pwhash_SALTBYTES),
    PAIRING_CODE_OPSLIMIT,
    PAIRING_CODE_MEMLIMIT,
    sodium.crypto_pwhash_ALG_ARGON2ID13
  )
  return formatPairingCode(out)
}

function unverifiedHost(message) {
  const err = new Error(message)
  err.code = PAIRING_HOST_UNVERIFIED
  return err
}

// Anyone holding the invite can answer; only a vault device can derive the host box in the link.
export function unmaskReply({ result, inviteId, joinerBox, expectedHostBox }) {
  const hostBox = result?.data
  if (!hostBox) {
    const err = new Error('The answering device runs an older version')
    err.code = PAIRING_OUTDATED.HOST
    throw err
  }
  if (hostBox.byteLength !== sodium.crypto_box_PUBLICKEYBYTES)
    throw new Error('Invalid host box key')
  if (!expectedHostBox || !b4a.equals(hostBox, expectedHostBox))
    throw unverifiedHost('The answering device is not the one in the invite')
  const mask = keyMask(joinerBox.secretKey, hostBox, inviteId, hostBox, joinerBox.publicKey)
  const encryptionKey = xor(result.encryptionKey, mask)
  if (!b4a.equals(inviteHostBox(encryptionKey, inviteId), expectedHostBox))
    throw unverifiedHost('The answering device sent a key that does not match the invite')
  return { ...result, encryptionKey }
}

function parseUserData(buffer) {
  try {
    const parsed = JSON.parse(b4a.toString(buffer))
    if (typeof parsed?.key === 'string' && /^[0-9a-f]{64}$/i.test(parsed.key)) {
      const box =
        typeof parsed.box === 'string' && /^[0-9a-f]{64}$/i.test(parsed.box) ? parsed.box : null
      return {
        keyHex: parsed.key.toLowerCase(),
        platform: parsed.platform || '',
        deviceName: sanitizeDeviceName(parsed.deviceName),
        proof: parsed.proof || null,
        box: box ? b4a.from(box, 'hex') : null,
        caps: typeof parsed.caps === 'string' ? parsed.caps.slice(0, 256) : '',
        compatLevel:
          Number.isInteger(parsed.compatLevel) && parsed.compatLevel > 0 ? parsed.compatLevel : 0
      }
    }
  } catch (err) {
    log.debug('[vault] ignored', err?.message || err)
  }
  return null
}

// An old core would wipe sealed notes, so once a keyring exists it may not join. Nor may a
// core below the vault's minimum level, which could only open it read-only.
export async function joinerTooOld(vault, joiner) {
  if (!hasSealedNotesCap(joiner.caps) && (await vault.hasLockKeyring())) return true
  const min = minCompatLevelOf(await vault.getSyncedPref(MIN_COMPAT_PREF))
  return deviceCompatLevel(joiner) < min
}

// The inviting side. One member per vault; the frontend drives confirmation.
export class HostPairing {
  constructor(vault) {
    this.vault = vault
    this.pairing = null
    this.member = null
    this.cb = null
    this.pending = null
    this.lastStatus = null
    this.rejected = new Set()
    this.busy = null
    this.swarm = null
    this.memberSwarm = null
    this.expiryTimer = null
    this.syncing = Promise.resolve()
    this.queued = null
  }

  async createInvite({ regenerate = false } = {}) {
    await this.vault.update()
    const existing = await this.vault.getNote(INVITE_KEY)
    if (existing && !regenerate && !isInviteExpired(existing) && isCurrentInvite(existing))
      return existing
    if (existing) await this.vault.removeNote(INVITE_KEY)

    const expiresAt = Date.now() + INVITE_EXPIRY_MS
    const { id, invite, publicKey, expires } = BlindPairing.createInvite(this.vault.key, {
      expires: expiresAt
    })
    const value = {
      id: b4a.toString(id, 'hex'),
      invite: formatDeviceInvite(
        b4a.toString(invite, 'hex'),
        b4a.toString(inviteHostBox(this.vault.encryptionKey, id), 'hex')
      ),
      publicKey: b4a.toString(publicKey, 'hex'),
      expires: expires || expiresAt
    }
    await this.vault.addNote({ key: INVITE_KEY, value })
    const stored = await this.vault.getNote(INVITE_KEY)
    this.sync().catch((err) => log.error('[pairing] could not start listening', err))
    return stored && stored.id !== value.id && !isInviteExpired(stored) ? stored : value
  }

  _emit(status) {
    this.lastStatus = status
    try {
      this.cb?.(status)
    } catch (err) {
      log.error('[pairing] status listener failed', err)
    }
  }

  async subscribe(cb, swarm) {
    this.cb = cb
    this.swarm = swarm
    const step = this.lastStatus?.step
    if ((step === 'confirmation' && this.pending) || step === 'idle') this._emit(this.lastStatus)
    await this.sync()
  }

  // The member polls the DHT every ~600ms, so it only runs while an invite can be used.
  sync() {
    if (this.queued) return this.queued
    const run = this.syncing.then(() => {
      this.queued = null
      return this._applyInviteState()
    })
    this.queued = run
    this.syncing = run.catch(() => {})
    return run
  }

  async _applyInviteState() {
    if (!this.swarm || this.busy) return
    let invite
    try {
      invite = await this.vault.getNote(INVITE_KEY)
    } catch (err) {
      log.debug('[pairing] invite unreadable, leaving the listener as is', err?.message || err)
      return
    }
    const usable = !!invite && !isInviteExpired(invite)
    if (usable && this.member && this.memberSwarm === this.swarm) return
    if (this.member) await this._stopMember()
    if (usable) await this._startMember(invite)
  }

  async _startMember(invite) {
    this.pairing = new BlindPairing(this.swarm, { poll: 500 })
    this.memberSwarm = this.swarm
    await this.pairing.ready()
    this.member = this.pairing.addMember({
      discoveryKey: this.vault.discoveryKey,
      onadd: (candidate) => this._onCandidate(candidate)
    })
    if (invite.expires) {
      this.expiryTimer = setTimeout(
        () => this.sync().catch(() => {}),
        invite.expires - Date.now() + 1000
      )
      this.expiryTimer.unref?.()
    }
    log.debug('[pairing] listening for a joining device')
    await this.member.flushed()
  }

  async _stopMember() {
    const { member, pairing } = this
    clearTimeout(this.expiryTimer)
    if (!member && !pairing) return
    this.expiryTimer = null
    this.member = null
    this.pairing = null
    this.memberSwarm = null
    await member?.close().catch(() => {})
    await pairing?.close().catch(() => {})
    log.debug('[pairing] stopped listening, no usable invite')
  }

  async close() {
    this.swarm = null
    await this._stopMember()
  }

  suspend() {
    return this.pairing?.suspend()
  }

  async resume() {
    // A pairing on a swarm that was since rebuilt is replaced by sync(), not resumed.
    if (this.pairing && this.memberSwarm === this.swarm) await this.pairing.resume()
    this.sync().catch((err) => log.error('[pairing] could not refresh the listener', err))
  }

  // One joiner at a time. The same joiner re-sending on a new session is not a
  // second device: denying it would reject the pairing the user is confirming.
  async _onCandidate(candidate) {
    const who = `${b4a.toString(candidate.inviteId, 'hex')}:${b4a.toString(candidate.userData || b4a.alloc(0), 'hex')}`
    if (this.busy) {
      if (who === this.busy) return
      try {
        candidate.deny()
      } catch (err) {
        log.debug('[vault] ignored', err?.message || err)
      }
      return
    }
    this.busy = who
    try {
      await this._handle(candidate)
    } catch (err) {
      log.error('[pairing] handling a candidate failed', err)
    } finally {
      this.busy = null
      this.pending = null
      this.sync().catch((err) => log.error('[pairing] could not refresh the listener', err))
    }
  }

  async _handle(candidate) {
    const invite = await this.vault.getNote(INVITE_KEY)
    if (!invite) {
      this._emit({ step: 'idle', reason: PAIRING_INVITE_REMOVED })
      return
    }
    if (b4a.toString(candidate.inviteId, 'hex') !== invite.id) return
    if (isInviteExpired(invite)) {
      candidate.deny()
      await this.vault.removeNote(INVITE_KEY)
      await this.vault.logActivityEvent(ACTIVITY_EVENT.INVITE_EXPIRED)
      this._emit({ step: 'expired', progress: 0, reason: 'invite_expired' })
      return
    }

    this._emit({ step: 'connected', progress: 30 })
    await candidate.open(b4a.from(invite.publicKey, 'hex'))
    this._emit({ step: 'authenticating', progress: 50 })

    const joiner = parseUserData(candidate.userData)
    if (!joiner || this.rejected.has(joiner.keyHex)) {
      candidate.deny()
      this._emit({ step: 'idle' })
      return
    }

    if (!joiner.box || (await joinerTooOld(this.vault, joiner))) {
      candidate.deny()
      this._emit({ step: 'error', progress: 0, reason: PAIRING_OUTDATED.JOINER })
      return
    }

    let reply
    let code
    try {
      reply = maskedReply({
        encryptionKey: this.vault.encryptionKey,
        inviteId: candidate.inviteId,
        invite: invite.invite,
        joinerBox: joiner.box
      })
      code = await pairingCode(candidate.inviteId, b4a.from(joiner.keyHex, 'hex'), joiner.box)
    } catch (err) {
      log.warn('[pairing] refused a joiner with an unusable box key', err?.message || err)
      candidate.deny()
      this._emit({ step: 'idle' })
      return
    }

    const confirmed = await this._awaitConfirmation(candidate, joiner, invite, code)
    if (!confirmed.ok) {
      this._emit(confirmed.status)
      return
    }

    this._emit({ step: 'authorizing', progress: 80 })
    await this.vault.addWriter(joiner.keyHex, { indexer: false })
    candidate.confirm({ key: this.vault.key, ...reply })
    if (!(await this.vault.findDeviceByLocalKey(joiner.keyHex))) {
      await this.vault.addSyncedDevice({
        key: b4a.toString(crypto.randomBytes(32), 'hex'),
        value: {
          title: joiner.deviceName,
          deviceType:
            joiner.platform === 'ios' || joiner.platform === 'android' ? 'mobile' : 'desktop',
          platform: joiner.platform || platform(),
          localKey: joiner.keyHex,
          ...(hasSealedNotesCap(joiner.caps) ? { caps: SEALED_NOTES_CAP } : {}),
          ...(joiner.compatLevel ? { compatLevel: joiner.compatLevel } : {}),
          addedAt: Date.now(),
          updatedAt: Date.now()
        }
      })
    }
    await this.vault.removeNote(INVITE_KEY)
    this._emit({ step: 'syncing', progress: 90 })
    await this.vault.update()
    this._emit({ step: 'done', progress: 100 })
  }

  _awaitConfirmation(candidate, joiner, invite, code) {
    return new Promise((resolve) => {
      let settled = false
      const finish = (result) => {
        if (settled) return
        settled = true
        clearInterval(poll)
        clearTimeout(expiry)
        this.pending = null
        resolve(result)
      }
      this.pending = { candidate, joiner, finish }

      // Another device may take the invite first; it deletes it when it does.
      const poll = setInterval(async () => {
        try {
          if (!(await this.vault.getNote(INVITE_KEY))) {
            finish({ ok: false, status: { step: 'idle', reason: PAIRING_INVITE_REMOVED } })
          }
        } catch (err) {
          log.debug('[vault] ignored', err?.message || err)
        }
      }, INVITE_POLL_MS)
      const expiry = setTimeout(
        () =>
          finish({ ok: false, status: { step: 'expired', progress: 0, reason: 'invite_expired' } }),
        Math.max((invite.expires || 0) - Date.now(), 1000)
      )

      const pending = this.pending
      this.vault
        .findDeviceByLocalKey(joiner.keyHex)
        .catch(() => null)
        .then((known) => {
          if (settled) return
          if (
            known &&
            provesWriterKey(candidate.inviteId, joiner.keyHex, joiner.box, joiner.proof)
          ) {
            return finish({ ok: true })
          }
          pending.shown = true
          this._emit({
            step: 'confirmation',
            userData: joiner.keyHex,
            localKey: this.vault.localKeyHex,
            code,
            platform: joiner.platform,
            deviceName: joiner.deviceName,
            requestedAt: Date.now(),
            progress: 70
          })
        })
    })
  }

  // Accepting before the code is on screen would release the key unseen.
  confirm() {
    if (this.pending?.shown) this.pending.finish({ ok: true })
  }

  async reject() {
    const pending = this.pending
    if (pending) {
      this.rejected.add(pending.joiner.keyHex)
      try {
        pending.candidate.deny()
      } catch (err) {
        log.debug('[vault] ignored', err?.message || err)
      }
      await this.vault
        .logActivityEvent(ACTIVITY_EVENT.DEVICE_REJECTED, {
          meta: { platform: pending.joiner.platform, deviceKey: pending.joiner.keyHex }
        })
        .catch(() => {})
      pending.finish({ ok: false, status: { step: 'idle' } })
    }
    await this.vault.removeNote(INVITE_KEY).catch(() => {})
  }
}

// The joining side, the autopass way: a brand-new store, its local key sent as
// the writer key, and nothing written to that store until the vault says yes.
export async function localWriterKey(store) {
  const local = Autobase.getLocalCore(store)
  await local.ready()
  const key = local.key
  await local.close()
  return key
}

async function localWriterProof(store, inviteId, box) {
  const local = Autobase.getLocalCore(store)
  await local.ready()
  try {
    return { key: local.key, proof: createJoinProof(local, inviteId, box) }
  } finally {
    await local.close()
  }
}

export async function requestToJoin({ store, bootstrap, invite, hostBox, deviceName, onCode }) {
  if (hostBox?.byteLength !== sodium.crypto_box_PUBLICKEYBYTES)
    throw new Error('The invite carries no host box key')
  const inviteId = BlindPairing.decodeInvite(invite).id
  const joinerBox = boxKeyPair()
  const { key: localKey, proof } = await localWriterProof(store, inviteId, joinerBox.publicKey)
  onCode?.(await pairingCode(inviteId, localKey, joinerBox.publicKey))

  const swarm = new Hyperswarm({
    keyPair: await store.createKeyPair('pear-notes-pairing'),
    ...(bootstrap ? { bootstrap } : {})
  })
  swarm.on('connection', (connection) => {
    connection.on('error', () => {})
    store.replicate(connection)
  })
  const pairing = new BlindPairing(swarm, { poll: 500 })
  let candidate = null
  let timer = null

  try {
    const outcome = await new Promise((resolve) => {
      candidate = pairing.addCandidate({
        invite,
        userData: b4a.from(
          JSON.stringify({
            key: b4a.toString(localKey, 'hex'),
            platform: platform(),
            deviceName: sanitizeDeviceName(deviceName),
            proof,
            box: b4a.toString(joinerBox.publicKey, 'hex'),
            caps: SEALED_NOTES_CAP,
            compatLevel: COMPAT_LEVEL
          })
        ),
        onadd: (result) => {
          try {
            resolve({
              step: 'added',
              result: unmaskReply({ result, inviteId, joinerBox, expectedHostBox: hostBox })
            })
          } catch (err) {
            log.error('[pairing] could not read the vault reply', err)
            const known =
              err?.code === PAIRING_OUTDATED.HOST || err?.code === PAIRING_HOST_UNVERIFIED
            resolve({ step: known ? err.code : 'error' })
          }
        }
      })
      candidate.request?.on('rejected', (err) => {
        if (err?.code === 'PAIRING_REJECTED') resolve({ step: 'rejected' })
      })
      Promise.resolve(candidate.pairing).catch(() => resolve({ step: 'error' }))
      timer = setTimeout(() => resolve({ step: 'timeout' }), PAIRING_TIMEOUT_MS)
    })
    return { ...outcome, localKey }
  } finally {
    clearTimeout(timer)
    await candidate?.close().catch(() => {})
    await pairing.close().catch(() => {})
    await swarm.destroy().catch(() => {})
  }
}
