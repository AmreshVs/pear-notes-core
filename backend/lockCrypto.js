import b4a from 'b4a'
import sodium from 'sodium-universal'
import { ENVELOPE_VERSION, envelopeFiles, parseEnvelope } from './sealedEnvelope.js'

export { parseEnvelope }

export const KEYRING_PREF_PREFIX = 'lockKeyrings/'
export const LOCK_KDF = 'argon2id13'
export const LOCK_KDF_PARAMS = { ops: 4, mem: 64 * 1024 * 1024 }

const KEYRING_VERSION = 1
const KEY_BYTES = 32
const ID_BYTES = 16
const NONCE_BYTES = sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES
const TAG_BYTES = sodium.crypto_aead_xchacha20poly1305_ietf_ABYTES
const SALT_BYTES = sodium.crypto_pwhash_SALTBYTES

const MIN_OPS = 1
const MAX_OPS = 10
const MIN_MEM = 8 * 1024 * 1024
const MAX_MEM = 1024 * 1024 * 1024
// Apply still accepts entries up to MAX_MEM; this device only runs Argon2 at sizes a phone can hold.
const MAX_OPEN_MEM = 2 * LOCK_KDF_PARAMS.mem

const adRoot = (keyringId) => b4a.from('pear-notes:lock-root:v1|' + keyringId)
const adCheck = (keyringId) => b4a.from('pear-notes:lock-check:v1|' + keyringId)
const adNoteKey = (noteKey) => b4a.from('pear-notes:note-key:v1|' + noteKey)
const adBody = (noteKey) => b4a.from('pear-notes:note-body:v1|' + noteKey + '|note')
const adFileKey = (noteKey, fileId) => b4a.from('pear-notes:file-key:v1|' + noteKey + '|' + fileId)
const adHeldFileKey = (blobId, fileId) =>
  b4a.from('pear-notes:held-file-key:v1|' + blobId + '|' + fileId)

const HEX_RE = /^[0-9a-f]+$/
const isHex = (value, bytes) =>
  typeof value === 'string' && value.length === bytes * 2 && HEX_RE.test(value)

export function secureKey(from = null) {
  const key = sodium.sodium_malloc(KEY_BYTES)
  if (from) key.set(from)
  else sodium.randombytes_buf(key)
  return key
}

export const secureBuffer = (bytes) => sodium.sodium_malloc(bytes)

export function wipe(key) {
  if (key && key.byteLength) sodium.sodium_memzero(key)
}

export function rootKeyFromHex(value) {
  if (!isHex(value, KEY_BYTES)) return null
  const raw = b4a.from(value, 'hex')
  const key = secureKey(raw)
  sodium.sodium_memzero(raw)
  return key
}

export const rootKeyToHex = (key) => b4a.toString(key, 'hex')

function seal(key, plaintext, ad) {
  const nonce = b4a.alloc(NONCE_BYTES)
  sodium.randombytes_buf(nonce)
  const out = b4a.alloc(plaintext.byteLength + TAG_BYTES)
  sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(out, plaintext, ad, null, nonce, key)
  return b4a.concat([nonce, out])
}

function open(key, sealed, ad, secure = false) {
  if (!key || !sealed || sealed.byteLength < NONCE_BYTES + TAG_BYTES) return null
  const nonce = sealed.subarray(0, NONCE_BYTES)
  const body = sealed.subarray(NONCE_BYTES)
  const length = body.byteLength - TAG_BYTES
  const out = secure ? sodium.sodium_malloc(length) : b4a.alloc(length)
  try {
    sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(out, null, body, ad, nonce, key)
    return out
  } catch {
    if (secure) sodium.sodium_memzero(out)
    return null
  }
}

function openInto(out, key, sealed, ad) {
  if (!sealed || sealed.byteLength !== NONCE_BYTES + out.byteLength + TAG_BYTES) return false
  try {
    sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      out,
      null,
      sealed.subarray(NONCE_BYTES),
      ad,
      sealed.subarray(0, NONCE_BYTES),
      key
    )
    return true
  } catch {
    sodium.sodium_memzero(out)
    return false
  }
}

const fromBase64 = (value) => (typeof value === 'string' ? b4a.from(value, 'base64') : null)
const toBase64 = (buffer) => b4a.toString(buffer, 'base64')

async function deriveKek(password, salt, { ops, mem }) {
  const kek = sodium.sodium_malloc(KEY_BYTES)
  const secret = b4a.from(String(password))
  try {
    await sodium.crypto_pwhash_async(
      kek,
      secret,
      salt,
      ops,
      mem,
      sodium.crypto_pwhash_ALG_ARGON2ID13
    )
    return kek
  } finally {
    sodium.sodium_memzero(secret)
  }
}

export function isKeyringEntry(entry) {
  return (
    !!entry &&
    typeof entry === 'object' &&
    isHex(entry.id, ID_BYTES) &&
    entry.v === KEYRING_VERSION &&
    entry.kdf === LOCK_KDF &&
    Number.isInteger(entry.ops) &&
    entry.ops >= MIN_OPS &&
    entry.ops <= MAX_OPS &&
    Number.isInteger(entry.mem) &&
    entry.mem >= MIN_MEM &&
    entry.mem <= MAX_MEM &&
    isHex(entry.salt, SALT_BYTES) &&
    typeof entry.wrapped === 'string' &&
    typeof entry.check === 'string'
  )
}

export const keyringPrefId = (keyringId) => KEYRING_PREF_PREFIX + keyringId

export function compareKeyrings(a, b) {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

export function currentKeyring(entries) {
  return (
    entries
      .filter((entry) => isKeyringEntry(entry) && entry.pending !== true)
      .sort(compareKeyrings)[0] || null
  )
}

async function wrapRoot(rootKey, password, id, params, createdAt, extra = {}) {
  const salt = b4a.alloc(SALT_BYTES)
  sodium.randombytes_buf(salt)
  const kek = await deriveKek(password, salt, params)
  try {
    return {
      id,
      v: KEYRING_VERSION,
      kdf: LOCK_KDF,
      ops: params.ops,
      mem: params.mem,
      salt: b4a.toString(salt, 'hex'),
      wrapped: toBase64(seal(kek, rootKey, adRoot(id))),
      check: toBase64(seal(rootKey, b4a.alloc(0), adCheck(id))),
      createdAt,
      ...extra
    }
  } finally {
    sodium.sodium_memzero(kek)
  }
}

// `legacy` marks a keyring made from a PBKDF2 password, whose verifier stays in the sync history.
export async function createKeyring(
  password,
  { params = LOCK_KDF_PARAMS, now = Date.now(), legacy = false } = {}
) {
  const id = b4a.toString(randomId(), 'hex')
  const rootKey = secureKey()
  const entry = await wrapRoot(rootKey, password, id, params, now, { legacy })
  return { entry, rootKey }
}

function randomId() {
  const id = b4a.alloc(ID_BYTES)
  sodium.randombytes_buf(id)
  return id
}

export async function rewrapKeyring(rootKey, password, entry, { params = LOCK_KDF_PARAMS } = {}) {
  return wrapRoot(rootKey, password, entry.id, params, entry.createdAt || Date.now(), {
    legacy: entry.legacy !== false
  })
}

// A retired entry still opens with the new password until its notes move to the current one.
export async function retireKeyring(rootKey, password, entry, { params = LOCK_KDF_PARAMS } = {}) {
  return wrapRoot(rootKey, password, entry.id, params, entry.createdAt || Date.now(), {
    legacy: entry.legacy !== false,
    pending: true,
    retired: true
  })
}

export const suggestsPasswordChange = (entry) => !!entry && entry.legacy !== false

export async function openKeyring(password, entry) {
  if (!isKeyringEntry(entry) || entry.mem > MAX_OPEN_MEM) return null
  const kek = await deriveKek(password, b4a.from(entry.salt, 'hex'), entry)
  try {
    const rootKey = open(kek, fromBase64(entry.wrapped), adRoot(entry.id), true)
    if (!rootKey || rootKey.byteLength !== KEY_BYTES) {
      wipe(rootKey)
      return null
    }
    return rootKey
  } finally {
    sodium.sodium_memzero(kek)
  }
}

export function rootKeyOpens(rootKey, entry) {
  if (!isKeyringEntry(entry) || !rootKey || rootKey.byteLength !== KEY_BYTES) return false
  return open(rootKey, fromBase64(entry.check), adCheck(entry.id)) !== null
}

function openContentKey(roots, noteKey, envelope) {
  const rootKey = roots.get(envelope.r)
  if (!rootKey) return null
  return open(rootKey, fromBase64(envelope.k), adNoteKey(noteKey), true)
}

export function openBody(roots, noteKey, sealed) {
  const envelope = parseEnvelope(sealed)
  if (!envelope) return null
  const contentKey = openContentKey(roots, noteKey, envelope)
  if (!contentKey) return null
  try {
    const body = open(contentKey, fromBase64(envelope.b), adBody(noteKey))
    return body ? b4a.toString(body) : null
  } finally {
    wipe(contentKey)
  }
}

export function sealBody(
  roots,
  keyringId,
  noteKey,
  html,
  { previous = '', links = [], files = new Map() } = {}
) {
  const rootKey = roots.get(keyringId)
  if (!rootKey) throw new Error('lock root key not open')
  const envelope = parseEnvelope(previous)
  const previousFiles = envelopeFiles(previous)
  const previousKey = envelope ? openContentKey(roots, noteKey, envelope) : null
  if (!previousKey && Object.keys(previousFiles).length) {
    throw new Error('file keys need the previous content key')
  }
  // Moving to another keyring also changes the content key, so an old root key can't read new saves.
  const keep = !!previousKey && envelope.r === keyringId
  const contentKey = keep ? previousKey : secureKey()
  try {
    const wrapped = keep ? envelope.k : toBase64(seal(rootKey, contentKey, adNoteKey(noteKey)))
    const body = seal(contentKey, b4a.from(html || ''), adBody(noteKey))
    const f = {}
    for (const link of links) {
      const held = files.get(link)
      if (previousFiles[link]) {
        f[link] = keep
          ? previousFiles[link]
          : rewrapFileKey(previousKey, contentKey, noteKey, previousFiles[link])
      } else if (held) {
        f[link] = {
          id: held.id,
          k: toBase64(seal(contentKey, held.key, adFileKey(noteKey, held.id)))
        }
      }
    }
    const next = { v: ENVELOPE_VERSION, r: keyringId, k: wrapped, b: toBase64(body), links }
    if (Object.keys(f).length) next.f = f
    return JSON.stringify(next)
  } finally {
    wipe(contentKey)
    if (!keep) wipe(previousKey)
  }
}

function rewrapFileKey(fromKey, toKey, noteKey, { id, k }) {
  const fileKey = secureBuffer(KEY_BYTES)
  try {
    if (!openInto(fileKey, fromKey, fromBase64(k), adFileKey(noteKey, id))) {
      throw new Error('a file key did not open')
    }
    return { id, k: toBase64(seal(toKey, fileKey, adFileKey(noteKey, id))) }
  } finally {
    wipe(fileKey)
  }
}

export function openFileKeys(roots, noteKey, sealed, slot, opened) {
  const files = Object.entries(envelopeFiles(sealed))
  if (!files.length) return 0
  const contentKey = openContentKey(roots, noteKey, parseEnvelope(sealed))
  if (!contentKey) return 0
  let count = 0
  try {
    for (const [link, { id, k }] of files) {
      const out = slot(link, id)
      if (!out || !openInto(out, contentKey, fromBase64(k), adFileKey(noteKey, id))) continue
      opened(link, id, out)
      count++
    }
    return count
  } finally {
    wipe(contentKey)
  }
}

export const wrapHeldFileKey = (rootKey, blobId, fileId, key) =>
  toBase64(seal(rootKey, key, adHeldFileKey(blobId, fileId)))

export const openHeldFileKeyInto = (out, rootKey, blobId, fileId, wrapped) =>
  openInto(out, rootKey, fromBase64(wrapped), adHeldFileKey(blobId, fileId))

export function envelopeKeyringId(sealed) {
  return parseEnvelope(sealed)?.r || ''
}
