import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import sodium from 'sodium-universal'

import * as log from '../log.js'

export const HELD_KEYS_FILE = 'held-file-keys'
// Matches the media store's grace for unlinked uploads: after it, reclaim has removed the file.
export const HELD_KEY_MAX_AGE_MS = 24 * 60 * 60 * 1000

const KEY_CONTEXT = b4a.from('pear-notes/held-file-keys/v1')
const HEX_RE = /^[0-9a-f]+$/

const isRecord = (r) =>
  !!r &&
  typeof r.blob === 'string' &&
  typeof r.link === 'string' &&
  typeof r.note === 'string' &&
  typeof r.id === 'string' &&
  HEX_RE.test(r.id) &&
  typeof r.r === 'string' &&
  typeof r.k === 'string' &&
  Number.isFinite(r.at)

// Keys of files added to sealed notes and not saved yet, wrapped by R. Local, never synced.
export class HeldFileKeys {
  constructor(dir, vaultKey) {
    this.filePath = path.join(dir, HELD_KEYS_FILE)
    this._key = sodium.sodium_malloc(sodium.crypto_secretbox_KEYBYTES)
    sodium.crypto_generichash(this._key, KEY_CONTEXT, vaultKey)
    this.records = new Map()
    this._load()
  }

  get size() {
    return this.records.size
  }

  list() {
    return [...this.records.values()]
  }

  put(record) {
    if (!isRecord(record)) return false
    this.records.set(record.blob, record)
    return this._persist()
  }

  drop(blobIds) {
    let changed = false
    for (const blob of blobIds) changed = this.records.delete(blob) || changed
    if (changed) this._persist()
  }

  close() {
    sodium.sodium_memzero(this._key)
    this.records.clear()
  }

  _load() {
    let sealed
    try {
      if (!fs.existsSync(this.filePath)) return
      sealed = fs.readFileSync(this.filePath)
    } catch (e) {
      log.error('[lock] could not read held file keys', e?.message)
      return
    }
    const nonceBytes = sodium.crypto_secretbox_NONCEBYTES
    const macBytes = sodium.crypto_secretbox_MACBYTES
    if (sealed.byteLength < nonceBytes + macBytes) return
    const plain = b4a.alloc(sealed.byteLength - nonceBytes - macBytes)
    const nonce = sealed.subarray(0, nonceBytes)
    if (!sodium.crypto_secretbox_open_easy(plain, sealed.subarray(nonceBytes), nonce, this._key)) {
      log.warn('[lock] held file keys did not open, ignored')
      return
    }
    try {
      const list = JSON.parse(b4a.toString(plain))
      for (const record of Array.isArray(list) ? list : []) {
        if (isRecord(record)) this.records.set(record.blob, record)
      }
    } catch {
      log.warn('[lock] held file keys unreadable, ignored')
    }
  }

  _persist() {
    if (!this.records.size) {
      try {
        if (fs.existsSync(this.filePath)) fs.unlinkSync(this.filePath)
        return true
      } catch (e) {
        log.error('[lock] could not remove held file keys', e?.message)
        return false
      }
    }
    const plain = b4a.from(JSON.stringify(this.list()))
    const nonceBytes = sodium.crypto_secretbox_NONCEBYTES
    const out = b4a.alloc(nonceBytes + plain.byteLength + sodium.crypto_secretbox_MACBYTES)
    const nonce = out.subarray(0, nonceBytes)
    sodium.randombytes_buf(nonce)
    sodium.crypto_secretbox_easy(out.subarray(nonceBytes), plain, nonce, this._key)
    const tmp = this.filePath + '.tmp'
    try {
      fs.writeFileSync(tmp, out)
      fs.renameSync(tmp, this.filePath)
      return true
    } catch (e) {
      log.error('[lock] could not write held file keys', e?.message)
      return false
    }
  }
}
