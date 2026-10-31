import b4a from 'b4a'

import { normalizeAttachmentUrls } from '../../constant.js'
import { GATE_PREF_PREFIX, MIN_COMPAT_PREF, isActivation, minCompatLevelOf } from '../featureGates.js'
import { KEYRING_PREF_PREFIX, isKeyringEntry } from '../lockCrypto.js'
import * as viewStore from '../viewStore.js'
import {
  clearAll,
  forgetNote,
  forgetSnapshots,
  isActivityEnabled,
  pruneBefore,
  recordOp
} from './activity.js'
import { OP, decodeWriterKey, isValidOp, noteStamp } from './ops.js'

// Autobase hands every device the same nodes in the same order, so applying each
// op as a plain upsert IS the conflict rule: the later node in that order wins.
// A throw here is left to autobase; the transaction makes sure nothing of a
// half-applied batch reaches the view.
export function createApply({
  onNode = () => {},
  onDeviceRemoved = () => {},
  onSealedSaveRejected = () => {}
} = {}) {
  return async function apply(nodes, view, host) {
    const db = (await view).transaction()
    try {
      for (const node of nodes) {
        const op = node.value
        if (!isValidOp(op)) continue
        const device = node.from?.key ? b4a.toString(node.from.key, 'hex') : ''
        onNode(device)
        const previous = await applyOp(db, host, op)
        if (previous === UNSEALED_OVER_SEALED) onSealedSaveRejected(op, device)
        if (previous === REJECTED || previous === UNSEALED_OVER_SEALED) continue
        if (op.type === OP.REMOVE_SYNCED_DEVICE && previous?.localKey) {
          onDeviceRemoved(previous.localKey, previous.localKey === device)
        }
        if (op.noActivity !== true && (await isActivityEnabled(db))) {
          await recordOp(db, op, previous, { device, seq: node.length || 0 })
        }
      }
      await db.flush()
    } finally {
      await db.close()
    }
  }
}

const REJECTED = Symbol('rejected')
const UNSEALED_OVER_SEALED = Symbol('unsealed-over-sealed')

function isKeyringWriteAllowed(id, value) {
  if (!id.startsWith(KEYRING_PREF_PREFIX)) return true
  return isKeyringEntry(value) && value.id === id.slice(KEYRING_PREF_PREFIX.length)
}

// Gate records are written once and the minimum level only rises, so neither can be undone.
async function isCompatWriteAllowed(db, id, value) {
  if (id === MIN_COMPAT_PREF) {
    const current = (await viewStore.syncedPrefs(db, id))[id]
    return minCompatLevelOf(value) > minCompatLevelOf(current)
  }
  if (!id.startsWith(GATE_PREF_PREFIX)) return true
  return isActivation(value) && !isActivation((await viewStore.syncedPrefs(db, id))[id])
}

// Returns the row as it was before the op, for the activity log.
async function applyOp(db, host, op) {
  switch (op.type) {
    case OP.ADD_WRITER: {
      const writer = decodeWriterKey(op.key)
      const indexer = op.indexer === true
      // Never demote the last sync leader; a vault with none can confirm nothing.
      if (!indexer && !host.removeable(writer)) return null
      await host.addWriter(writer, { indexer })
      return null
    }
    case OP.ADD_NOTE: {
      const previous = await viewStore.getNote(db, op.key)
      // A sealing-pass write applies only over the row it was built from.
      if (typeof op.basis === 'string' && op.basis !== noteStamp(previous)) return REJECTED
      // An old core rebuilds notes field by field and would wipe a sealed body.
      if (previous?.sealed && !op.value.sealed && op.unseal !== true) return UNSEALED_OVER_SEALED
      // Links are stored device-neutral; a node from a client that sent its own
      // server address would otherwise differ from the same content.
      if (typeof op.value.note === 'string') op.value.note = normalizeAttachmentUrls(op.value.note)
      await viewStore.putNote(db, op.key, op.value)
      if (op.value.sealed && !previous?.sealed) await forgetSnapshots(db, op.key)
      return previous
    }
    case OP.REMOVE_NOTE: {
      const previous = await viewStore.getNote(db, op.key)
      await viewStore.delNote(db, op.key)
      await forgetNote(db, op.key)
      return previous
    }
    case OP.ADD_FOLDER: {
      const previous = await viewStore.getFolder(db, op.key)
      await viewStore.putFolder(db, op.key, op.value)
      return previous
    }
    case OP.REMOVE_FOLDER: {
      const previous = await viewStore.getFolder(db, op.key)
      await viewStore.delFolder(db, op.key)
      return previous
    }
    case OP.ADD_SETTINGS:
      await viewStore.putSettings(db, op.value)
      return null
    case OP.ADD_SYNCED_DEVICE:
    case OP.UPDATE_SYNCED_DEVICE: {
      const previous = await viewStore.getSyncedDevice(db, op.key)
      await viewStore.putSyncedDevice(db, op.key, op.value)
      return previous
    }
    case OP.REMOVE_SYNCED_DEVICE: {
      const previous = await viewStore.getSyncedDevice(db, op.key)
      const writer = decodeWriterKey(previous?.localKey)
      // removeable() reads the shared system state, so every device agrees.
      if (writer && host.removeable(writer)) await host.removeWriter(writer)
      await viewStore.delSyncedDevice(db, op.key)
      return previous
    }
    case OP.DELETE_MEDIA:
      await viewStore.putMediaTombstone(db, op.refKey, { url: op.url || '', deletedAt: op.at })
      return null
    case OP.PRUNE_MEDIA_TOMBSTONES: {
      const expired = []
      for await (const { key, value } of viewStore.mediaTombstones(db)) {
        if (value?.deletedAt < op.cutoff) expired.push(key)
      }
      for (const refKey of expired) await viewStore.delMediaTombstone(db, refKey)
      return null
    }
    case OP.PRUNE_ACTIVITY:
      await pruneBefore(db, op.cutoff)
      return null
    case OP.CLEAR_ACTIVITY:
      await clearAll(db, op.at)
      return null
    case OP.SET_SYNCED_PREF:
      // Keyring entries form a set: never deleted, only rewritten under their own id.
      if (!isKeyringWriteAllowed(op.id, op.value)) return REJECTED
      if (!(await isCompatWriteAllowed(db, op.id, op.value))) return REJECTED
      await viewStore.putSyncedPref(db, op.id, op.value)
      return null
    default:
      return null
  }
}
