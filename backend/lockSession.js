import {
  compareKeyrings,
  currentKeyring,
  envelopeKeyringId,
  isKeyringEntry,
  openBody,
  openFileKeys,
  openHeldFileKeyInto,
  openKeyring,
  rootKeyOpens,
  sealBody,
  secureBuffer,
  secureKey,
  wipe,
  wrapHeldFileKey
} from './lockCrypto.js'
import { blobCoreKeyHexFromUrl, blobRefFromUrl } from './backupManager.js'
import { envelopeFiles, envelopeRelink, relinkHtml } from './sealedEnvelope.js'
import * as log from '../log.js'

const roots = new Map()
const listeners = new Set()
let generation = 0

// File keys of sealed notes by blob id. Keys share a few slabs: sodium_malloc per key costs pages.
const FILE_KEY_BYTES = 32
const SLAB_KEYS = 128
const fileKeys = new Map()
const slabs = []
let slabUsed = SLAB_KEYS

function keySlot() {
  if (slabUsed === SLAB_KEYS) {
    slabs.push(secureBuffer(FILE_KEY_BYTES * SLAB_KEYS))
    slabUsed = 0
  }
  const start = FILE_KEY_BYTES * slabUsed++
  return slabs[slabs.length - 1].subarray(start, start + FILE_KEY_BYTES)
}

function dropFileKeys() {
  for (const slab of slabs) wipe(slab)
  slabs.length = 0
  slabUsed = SLAB_KEYS
  fileKeys.clear()
}

// Same shape as the media store's range id: `<core hex>:<blockOffset>:<blockLength>`.
export function blobIdOf(url) {
  const core = blobCoreKeyHexFromUrl(url)
  const ref = blobRefFromUrl(url)
  return core && ref?.blockLength ? `${core}:${ref.blockOffset}:${ref.blockLength}` : ''
}

function notify() {
  for (const cb of listeners) {
    try {
      cb(roots.size > 0)
    } catch (e) {
      log.error('lock session listener', e)
    }
  }
}

export function onLockSessionChange(cb) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export const isLockSessionOpen = () => roots.size > 0

const usable = (entries) => entries.filter(isKeyringEntry).sort(compareKeyrings)

export async function openWithPassword(entries, password) {
  const started = generation
  const opened = new Map()
  for (const entry of usable(entries)) {
    const rootKey = await openKeyring(password, entry)
    if (rootKey) opened.set(entry.id, rootKey)
  }
  return adopt(opened, started)
}

export function openWithRootKey(entries, rootKey) {
  const opened = new Map()
  for (const entry of usable(entries)) {
    if (rootKeyOpens(rootKey, entry)) opened.set(entry.id, secureKey(rootKey))
  }
  return adopt(opened, generation)
}

export function addRootKey(keyringId, rootKey) {
  wipe(roots.get(keyringId))
  roots.set(keyringId, secureKey(rootKey))
  notify()
}

// A close that lands while Argon2 runs wins: the app backgrounded or switched vaults.
function adopt(opened, started) {
  if (started !== generation) {
    for (const rootKey of opened.values()) wipe(rootKey)
    return false
  }
  if (!opened.size) return false
  for (const [id, rootKey] of opened) {
    wipe(roots.get(id))
    roots.set(id, rootKey)
  }
  notify()
  return true
}

export function closeLockSession() {
  generation++
  if (!roots.size) return
  for (const rootKey of roots.values()) wipe(rootKey)
  roots.clear()
  dropFileKeys()
  notify()
}

export const fileKeyFor = (blobId) => fileKeys.get(blobId) || null

export function holdFileKey(link, key, id) {
  const blobId = blobIdOf(link)
  if (!roots.size || !blobId) return false
  const slot = fileKeys.get(blobId)?.key || keySlot()
  slot.set(key)
  fileKeys.set(blobId, { key: slot, id })
  return true
}

// For the held-key store on disk, so a file inserted before a session close still saves after it.
export function keepFileKey(link, key, id, keyringId) {
  const blob = blobIdOf(link)
  const rootKey = roots.get(keyringId)
  if (!blob || !rootKey) return null
  return { blob, link, id, r: keyringId, k: wrapHeldFileKey(rootKey, blob, id, key) }
}

export function restoreFileKeys(records) {
  let count = 0
  for (const { blob, id, r, k } of records) {
    const rootKey = roots.get(r)
    if (!rootKey || fileKeys.has(blob)) continue
    const slot = keySlot()
    if (!openHeldFileKeyInto(slot, rootKey, blob, id, k)) continue
    fileKeys.set(blob, { key: slot, id })
    count++
  }
  return count
}

const isMapped = ([link, { id }]) => fileKeys.get(blobIdOf(link))?.id === id

export function openNoteFileKeys(noteKey, sealed) {
  if (!roots.size || Object.entries(envelopeFiles(sealed)).every(isMapped)) return 0
  return openFileKeys(
    roots,
    noteKey,
    sealed,
    (link, id) => {
      const blobId = blobIdOf(link)
      return blobId && fileKeys.get(blobId)?.id !== id ? keySlot() : null
    },
    (link, id, key) => fileKeys.set(blobIdOf(link), { key, id })
  )
}

function sealingFileKeys(links) {
  const files = new Map()
  for (const link of links) {
    const file = fileKeys.get(blobIdOf(link))
    if (file) files.set(link, file)
  }
  return files
}

export const getRootKey = (keyringId) => roots.get(keyringId) || null

// Only the old password of a restored note may be open; its saves stay under that entry.
export function sealingKeyringId(entries, previous = '') {
  const current = currentKeyring(entries)
  if (current && roots.has(current.id)) return current.id
  const id = usable(entries).find((entry) => entry.pending !== true && roots.has(entry.id))?.id
  if (id) return id
  const own = envelopeKeyringId(previous)
  return own && roots.has(own) ? own : ''
}

export function openNoteBody(noteKey, sealed) {
  const body = openBody(roots, noteKey, sealed)
  if (body === null) return null
  openNoteFileKeys(noteKey, sealed)
  return relinkHtml(body, envelopeRelink(sealed))
}

export const sealNoteBody = (keyringId, noteKey, html, options) =>
  sealBody(roots, keyringId, noteKey, html, {
    ...options,
    files: sealingFileKeys(options?.links || [])
  })

export function readableNote(key, value) {
  if (!value || !value.sealed) {
    if (!value || !('sealed' in value)) return value
    const rest = { ...value }
    delete rest.sealed
    return rest
  }
  const { sealed, ...rest } = value
  const body = openNoteBody(key, sealed)
  if (body === null) return { ...rest, note: '', sealed: true, bodyOmitted: true }
  return { ...rest, note: body, sealed: true }
}
