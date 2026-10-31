import { gateStatus, openGate } from './featureGates.js'
import { createFileKey } from './fileCrypto.js'
import { createKeyring, currentKeyring, keyringPrefId, parseEnvelope, wipe } from './lockCrypto.js'
import {
  addRootKey,
  blobIdOf,
  fileKeyFor,
  getRootKey,
  holdFileKey,
  isLockSessionOpen,
  openNoteBody,
  sealNoteBody
} from './lockSession.js'
import {
  chainRelink,
  envelopeFiles,
  envelopeLinks,
  envelopeRelink,
  relinkHtml,
  withRelink
} from './sealedEnvelope.js'
import { linksIn, rangeOf } from './vault/media.js'
import { noteStamp } from './vault/ops.js'
import * as log from '../log.js'

// A note edited this recently may still be open in an editor on another device.
export const SEAL_QUIET_MS = 3 * 60 * 1000
const MIN_RETRY_MS = 1000
const RELINK_ATTEMPTS = 3
const HELD_SAVE_RETRY_MS = 10000

// Applying the previous envelope's relink here is what consumes it, so every seal path keeps it.
export function sealEnvelope(keyringId, key, html, previous) {
  const body = relinkHtml(html, envelopeRelink(previous))
  return sealNoteBody(keyringId, key, body, { previous, links: linksIn(body) })
}

// Old link to the copy that replaced it, so an editor still holding the old link saves the new one.
const MAX_COPIED_LINKS = 1000
const copiedLinks = new Map()

export function rememberCopies(replacements) {
  for (const [from, to] of Object.entries(replacements)) {
    copiedLinks.delete(from)
    copiedLinks.set(from, to)
  }
  for (const from of copiedLinks.keys()) {
    if (copiedLinks.size <= MAX_COPIED_LINKS) break
    copiedLinks.delete(from)
  }
}

export const relinkCopies = (html) =>
  copiedLinks.size ? relinkHtml(html, Object.fromEntries(copiedLinks)) : html

export const forgetCopies = () => copiedLinks.clear()

export function unkeyedLinks(sealed) {
  const files = envelopeFiles(sealed)
  return envelopeLinks(sealed).filter((link) => !files[link])
}

// Plain files linked from a sealed note get an encrypted copy in this device's drive.
async function sealNoteFiles(base, noteKey, html, previous, gate) {
  const keyed = envelopeFiles(previous)
  const out = { replacements: {}, waiting: 0, changed: false }
  if (!base.media) return out
  for (const link of linksIn(html)) {
    const range = rangeOf(link)
    if (keyed[link] || !range) continue
    const file = await base.media.sealedFile(range.id)
    if (file === false) continue
    // Already ciphertext, linked from another sealed note: the re-seal wraps its key here too.
    if (file) {
      out.changed = true
      continue
    }
    if (!(await gate.status())) return out
    if ((await base.media.missingUrls([link])).size) {
      out.waiting++
      continue
    }
    if (!(await gate.open())) return out
    const seal = createFileKey()
    try {
      const fileName = base.media.fileNameOf(html, link)
      const copy = await base.media.copyFile(noteKey, link, fileName, { seal })
      if (!holdFileKey(copy, seal.key, seal.id)) return out
      out.replacements[link] = copy
      out.changed = true
    } catch (e) {
      log.error('[lock] could not encrypt a file of a locked note', e?.message)
    } finally {
      wipe(seal.key)
    }
  }
  return out
}

function filesGate(base) {
  let status = null
  let opened = null
  return {
    status: async () => (status ??= (await gateStatus(base, 'sealedFiles')).open),
    open: async () => (opened ??= (await openGate(base, 'sealedFiles')).open)
  }
}

export const withoutVerifier = (settings) => {
  const rest = { ...settings, lockMethod: 'password' }
  delete rest.lockPasswordSalt
  delete rest.lockPasswordHash
  return rest
}

export async function createFirstKeyring(base, password, { legacy = false } = {}) {
  const { entry, rootKey } = await createKeyring(password, { legacy })
  try {
    await base.setSyncedPref(keyringPrefId(entry.id), entry)
    addRootKey(entry.id, rootKey)
  } finally {
    wipe(rootKey)
  }
  await base.updateSettings({ settings: withoutVerifier((await base.getSettings()) || {}) })
  return entry
}

function sealTask(value, currentId) {
  if (!value || value.locked !== true) return null
  if (!value.sealed) return 'seal'
  return parseEnvelope(value.sealed)?.r !== currentId ? 'rewrap' : null
}

async function resealRejectedSave(base, keyringId, key, save, now) {
  const row = await base.getNote(key)
  if (!row || (row.updatedAt || 0) >= (save.updatedAt || 0)) return false
  const value = { ...save, updatedAt: Math.max(now, (row.updatedAt || 0) + 1) }
  delete value.sealed
  if (value.locked !== true) {
    await base.addNote({ key, value, unseal: true })
    return true
  }
  value.sealed = sealEnvelope(keyringId, key, save.note || '', row.sealed || '')
  value.note = ''
  await base.addNote({ key, value })
  return true
}

// Stateless, so it resumes from the view: each note is one op, conditional on the row it read.
export async function runSealingPass(
  base,
  { now = Date.now, quietMs = SEAL_QUIET_MS, stopped = () => false } = {}
) {
  const result = { sealed: 0, rewrapped: 0, resealed: 0, encrypted: 0, waiting: 0, retryAt: 0 }
  const current = currentKeyring(await base.getLockKeyrings())
  if (!current || !getRootKey(current.id)) {
    if (base.rejectedSealedSaves().length) result.retryAt = now() + HELD_SAVE_RETRY_MS
    return result
  }

  for (const [key, save] of base.rejectedSealedSaves()) {
    if (stopped()) return result
    if (await resealRejectedSave(base, current.id, key, save, now())) result.resealed++
    else log.info('[lock] a save that raced the seal was superseded by a newer edit')
    base.dropRejectedSealedSave(key, save)
  }

  const gate = filesGate(base)
  await base.media?.refreshSealWaiting()
  for (const { key, value } of await base.getAllNotesStrict()) {
    if (stopped()) return result
    const task = sealTask(value, current.id)
    if (!task && !(value?.sealed && unkeyedLinks(value.sealed).length)) continue
    // Only sealing a plain note waits; a sealed note's file copies lose to a concurrent edit anyway.
    const quietUntil = (value.updatedAt || 0) + quietMs
    if (task === 'seal' && quietUntil > now()) {
      result.retryAt = result.retryAt ? Math.min(result.retryAt, quietUntil) : quietUntil
      continue
    }
    const body = value.sealed ? openNoteBody(key, value.sealed) : value.note || ''
    if (body === null) continue
    const files = await sealNoteFiles(base, key, body, value.sealed || '', gate)
    result.waiting += files.waiting
    if (!task && !files.changed) continue
    // A session closed and reopened during the copy lost their keys; sealing now would strand them.
    const copies = Object.values(files.replacements)
    if (!copies.every((copy) => fileKeyFor(blobIdOf(copy)))) return result
    const landed = await swapCopies(base, current.id, key, value, body, files.replacements)
    if (!landed) {
      result.retryAt = result.retryAt || now() + MIN_RETRY_MS
      continue
    }
    if (task) result[task === 'seal' ? 'sealed' : 'rewrapped']++
    if (!copies.length) continue
    result.encrypted += copies.length
    rememberCopies(landed.relink)
    await base.pruneRemovedMedia(key, landed.from, landed.to).catch((e) => {
      log.error('[lock] could not release the plain copies of a locked note', e?.message)
    })
  }
  await base.media?.refreshSealWaiting()
  return result
}

// Conditional on the row it read; a sealed note edited meanwhile gets the same copies again.
async function swapCopies(base, keyringId, key, value, body, replacements) {
  let row = value
  for (let attempt = 0; attempt < RELINK_ATTEMPTS; attempt++) {
    if (attempt) {
      row = await base.getNote(key)
      if (!value.sealed || !row?.sealed || row.locked !== true) return null
      body = openNoteBody(key, row.sealed)
      if (body === null) return null
    }
    const present = new Set(linksIn(body))
    const live = Object.fromEntries(Object.entries(replacements).filter(([l]) => present.has(l)))
    if (attempt && !Object.keys(live).length) return null
    const sealed = sealEnvelope(keyringId, key, relinkHtml(body, live), row.sealed || '')
    // The pass is not an edit, so it keeps the relink map for editors on older links.
    const relink = chainRelink(envelopeRelink(row.sealed || ''), live)
    const next = { ...row, note: '', sealed: withRelink(sealed, relink) }
    await base.addNote({ key, value: next, noActivity: true, basis: noteStamp(row) })
    if (noteStamp(await base.getNote(key)) === noteStamp(next)) {
      return { from: row, to: next, relink }
    }
  }
  return null
}

// Runs while the lock session is open; a note skipped as recently edited is retried later.
export class SealingPass {
  constructor(getBase, options = {}) {
    this._getBase = getBase
    this._options = options
    this._running = null
    this._again = false
    this._timer = null
  }

  start() {
    if (this._running) {
      this._again = true
      return this._running
    }
    clearTimeout(this._timer)
    this._timer = null
    this._running = this._loop().finally(() => {
      this._running = null
    })
    return this._running
  }

  async _loop() {
    let result = null
    do {
      this._again = false
      const base = this._getBase()
      if (!base || !isLockSessionOpen()) return result
      try {
        result = await runSealingPass(base, {
          ...this._options,
          stopped: () => this._getBase() !== base || !isLockSessionOpen()
        })
      } catch (e) {
        if (isLockSessionOpen()) log.error('[lock] sealing pass failed', e?.message)
        return result
      }
    } while (this._again)
    if (result?.retryAt && isLockSessionOpen()) this._retryAt(result.retryAt)
    return result
  }

  _retryAt(at) {
    clearTimeout(this._timer)
    this._timer = setTimeout(
      () => {
        this._timer = null
        this.start()
      },
      Math.max(at - Date.now(), MIN_RETRY_MS)
    )
    this._timer.unref?.()
  }

  idle() {
    return this._running || Promise.resolve(null)
  }

  stop() {
    clearTimeout(this._timer)
    this._timer = null
  }
}
