import b4a from 'b4a'
import crypto from 'bare-crypto'
import fs from 'bare-fs'
import BlobServer from 'hypercore-blob-server'
import Hyperblobs from 'hyperblobs'
import Hyperdrive from 'hyperdrive'
import { isEnded, pipelinePromise, Transform } from 'streamx'

import {
  HYPERDRIVE_URL_PREFIX,
  STORAGE_INFO_DEBOUNCE_MS,
  STORAGE_INFO_MAX_WAIT_MS,
  TRANSFER_INFO_DEBOUNCE_MS,
  TRANSFER_INFO_MAX_WAIT_MS,
  normalizeAttachmentUrls
} from '../../constant.js'
import * as log from '../../log.js'
import {
  blobCoreKeyHexFromUrl,
  blobRefFromUrl,
  blocksPresent,
  clearBlockRange,
  getNotesStorageInfo,
  measureLocalBlobBytes
} from '../backupManager.js'
import { debounceWithMaxWait } from '../debounceWithMaxWait.js'
import {
  chunkRange,
  createDecryptStream,
  createEncryptStream,
  encryptBuffer,
  plainLength
} from '../fileCrypto.js'
import { envelopeFiles, envelopeLinks, envelopeRelink } from '../sealedEnvelope.js'
import { gateStatus } from '../featureGates.js'
import { fileKeyFor, isLockSessionOpen, openNoteBody, openNoteFileKeys } from '../lockSession.js'
import * as viewStore from '../viewStore.js'
import { OP } from './ops.js'

// Each device keeps its attachments in its own drive and serves them from its
// blob core; other devices fetch the ranges their notes link to. Every blob
// core in a vault is encrypted with one key derived from the vault key.
export const MEDIA_RETENTION_MS = 7 * 24 * 60 * 60 * 1000
const FRESH_UPLOAD_MS = 24 * 60 * 60 * 1000
const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000
const MAX_DOWNLOADS = 4
const STALL_MS = 20000
const UPLOAD_IDLE_MS = 10000
const SCAN_DELAY_MS = 2000
const TICK_MS = 1000
const LINK_RE = /http:\/\/hyperdrive\/\?[^"'\s<>]*/g
const ATTACHMENT_RE =
  /<img\b[^>]*>|<div\b[^>]*\sdata-(?:file|audio)-attachment[^>]*>[\s\S]*?<\/div>/g
const URL_ATTR_RE = /\s(?:src|url)="([^"]+)"/
const NAME_ATTR_RE = /\sfileName="([^"]*)"/i

export function deriveMediaKey(vaultKey) {
  return crypto
    .createHash('sha256')
    .update(b4a.from('pear-notes:media-encryption:v1'))
    .update(vaultKey)
    .digest()
}

// Loopback is reachable by any web page, local process or Android app; the server decrypts for all of them.
export const BLOB_ACCESS_SECRET = b4a.toString(crypto.randomBytes(16), 'hex')

function endWith(res, statusCode) {
  try {
    if (!res.headersSent) res.statusCode = statusCode
    res.end()
  } catch {
    res.destroy?.()
  }
}

function sameSecret(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// `type=` from the URL goes straight into Content-Type; bare-http1 does not reject CR/LF.
function safeType(info) {
  if (typeof info.type !== 'string' || /[^\x20-\x7e]/.test(info.type)) {
    info.type = 'application/octet-stream'
  }
  return info
}

export class GuardedBlobServer extends BlobServer {
  constructor(store, opts = {}) {
    super(store, { ...opts, token: null })
    this.secret = opts.secret || BLOB_ACCESS_SECRET
    // (blobId) => { key, id } to decrypt, false to refuse, null to serve as stored.
    this.sealedFile = opts.sealedFile || (async () => null)
  }

  getLink(key, opts = {}) {
    const link = super.getLink(key, opts)
    const slash = link.startsWith('/') ? 0 : link.indexOf('/', link.indexOf('://') + 3)
    if (slash === -1) return link
    return link.slice(0, slash + 1) + this.secret + '/' + link.slice(slash + 1)
  }

  _onrequest(req, res) {
    const prefix = '/' + this.secret
    const url = req.url || ''
    const rest = url.slice(prefix.length)
    if (!sameSecret(url.slice(0, prefix.length), prefix) || !/^[/?]/.test(rest)) {
      endWith(res, 404)
      return
    }
    req.url = rest.startsWith('/') ? rest : '/' + rest
    res.setHeader('Cache-Control', 'no-store')
    return this._guard(() => super._onrequest(req, res), res)
  }

  _onblob(info, res) {
    return this._guard(async () => {
      const { blockOffset, blockLength } = info.blob
      const file = await this.sealedFile(
        `${b4a.toString(info.key, 'hex')}:${blockOffset}:${blockLength}`
      )
      if (file === false) endWith(res, 404)
      else if (file) await this._onsealedblob(safeType(info), file, res)
      else await super._onblob(safeType(info), res)
    }, res)
  }

  async _onsealedblob(info, file, res) {
    const cipherBytes = info.blob.byteLength
    const size = plainLength(cipherBytes)
    if (size < 0) {
      endWith(res, 404)
      return
    }
    const core = await this._getCore(info.key, info, true)
    if (core === null) {
      endWith(res, 404)
      return
    }
    const close = () => core.close().catch(() => {})

    if (this.sandbox) res.setHeader('Content-Security-Policy', 'sandbox')
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Content-Type', info.type)

    let start = 0
    let end = size - 1
    if (info.range && size > 0) {
      start = info.range.start
      end = info.range.end === -1 ? size - 1 : Math.min(info.range.end, size - 1)
      if (start >= size || start > end) {
        res.statusCode = 416
        res.setHeader('Content-Range', 'bytes */' + size)
        close()
        res.end()
        return
      }
      res.statusCode = 206
      res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`)
    }
    res.setHeader('Content-Length', '' + (size ? end - start + 1 : 0))

    if (info.head || size === 0) {
      close()
      res.end()
      return
    }

    const range = chunkRange(start, end, cipherBytes)
    const read = new Hyperblobs(core).createReadStream(info.blob, {
      start: range.cipherStart,
      length: range.cipherLength
    })
    const decrypt = createDecryptStream(file.key, file.id, { cipherBytes, ...range })
    const teardown = (err) => {
      if (err) log.debug('[media] sealed blob read failed', err?.message || err)
      if (isEnded(decrypt)) return
      read.destroy()
      decrypt.destroy()
      res.destroy()
    }
    read.on('error', teardown)
    decrypt.on('error', teardown)
    res.on('error', teardown)
    res.on('close', () => {
      teardown()
      close()
    })
    read.pipe(decrypt).pipe(res)
  }

  _ondrive(info, res) {
    return this._guard(() => super._ondrive(info, res), res)
  }

  _onpointer(info, res) {
    return this._guard(() => super._onpointer(safeType(info), res), res)
  }

  async _guard(handle, res) {
    try {
      await handle()
    } catch (err) {
      log.debug('[media] blob request failed', err?.message || err)
      endWith(res, 400)
    }
  }
}

const decode = (value) => value.replace(/&amp;/g, '&')

// A link names a range of one blob core: `<core>:<blockOffset>:<blockLength>`.
export function rangeOf(url) {
  const core = blobCoreKeyHexFromUrl(url)
  const ref = blobRefFromUrl(url)
  if (!core || !ref?.blockLength) return null
  return { id: `${core}:${ref.blockOffset}:${ref.blockLength}`, core, ...ref }
}

export function linksIn(html) {
  if (!html) return []
  return [...new Set(decode(normalizeAttachmentUrls(html)).match(LINK_RE) || [])]
}

export function noteLinks(value) {
  const body = linksIn(value?.note)
  if (!value?.sealed) return body
  return [...new Set([...body, ...envelopeLinks(value.sealed)])]
}

const readableBody = (key, value) =>
  value?.sealed ? openNoteBody(key, value.sealed) || '' : value?.note || ''

export function attachmentName(html, url) {
  for (const tag of (html || '').match(ATTACHMENT_RE) || []) {
    if (decode(URL_ATTR_RE.exec(tag)?.[1] || '') === url) return NAME_ATTR_RE.exec(tag)?.[1] || ''
  }
  return ''
}

function withoutAttachment(html, url) {
  return html
    .replace(ATTACHMENT_RE, (tag) => (decode(URL_ATTR_RE.exec(tag)?.[1] || '') === url ? '' : tag))
    .replace(/<figure[^>]*>\s*<\/figure>/g, '')
}

function pathInfo(path) {
  const clean = path.replace(/^\//, '')
  const slash = clean.indexOf('/')
  if (slash === -1) return null
  const file = clean.slice(slash + 1)
  const underscore = file.indexOf('_')
  return {
    path: clean,
    noteKey: clean.slice(0, slash),
    fileName: underscore === -1 ? file : file.slice(underscore + 1)
  }
}

const FULL_COMPACTION = {
  blobGarbageCollectionPolicy: 1,
  blobGarbageCollectionAgeCutoff: 1,
  bottommostLevelCompaction: 2
}

async function compact(core, opts) {
  try {
    const storage = core.state?.storage
    if (storage?.store?.compact) await storage.store.compact(opts)
    else if (storage?.compact) await storage.compact()
  } catch (err) {
    log.debug('[media] compaction failed', err?.message)
  }
}

// Frees every present block outside `keep`, only through clearBlockRange, which
// keeps the merkle nodes other devices still need to verify this core.
async function keepOnly(core, keep) {
  let cursor = 0
  let freed = 0
  for (const [start, end] of keep.sort((a, b) => a[0] - b[0])) {
    if (start > cursor) freed += await clearBlockRange(core, cursor, start)
    cursor = Math.max(cursor, end)
  }
  if (cursor < core.length) freed += await clearBlockRange(core, cursor, core.length)
  if (freed) await compact(core)
  return freed
}

export class MediaStore {
  constructor(vault, store, vaultKey) {
    this.vault = vault
    this.store = store
    this.key = deriveMediaKey(vaultKey)
    this.drive = new Hyperdrive(store.namespace('pear-notes-media'), { encryptionKey: this.key })
    // Its own session: the blob server closes whatever store it is given.
    this.server = new GuardedBlobServer(store.session(), {
      resolve: async (key) => ({ key, encryptionKey: this.key }),
      sealedFile: (blobId) => this.sealedFile(blobId)
    })
    this.sealedIndex = null
    this.notesSeq = 0
    this.sealWaiting = []
    this.held = false
    this.closed = false
    this.writing = 0
    this.cores = new Map()
    this.downloads = new Map()
    this.uploads = new Map()
    this.files = []
    this.scanTimer = null
    this.ticker = null
    this.timersHeld = true
    this.onUpload = (index, bytes) => this._uploaded(index, bytes)
    this.onDriveChange = () => this._indexFiles().catch(() => {})
  }

  async ready() {
    await this.drive.ready()
    await this.server.listen()
    this.blobCore.on('upload', this.onUpload)
    this.drive.core.on('append', this.onDriveChange)
    await this._indexFiles()
  }

  async close() {
    this.closed = true
    clearTimeout(this.scanTimer)
    clearInterval(this.ticker)
    this.drive.blobs?.core.off('upload', this.onUpload)
    this.drive.core.off('append', this.onDriveChange)
    for (const download of this.downloads.values()) download.handle?.destroy()
    for (const upload of this.uploads.values()) clearTimeout(upload.idle)
    for (const core of this.cores.values()) await core.close().catch(() => {})
    await this.server.close().catch(() => {})
    await this.drive.close().catch(() => {})
  }

  get blobCore() {
    return this.drive.blobs.core
  }

  get ownCore() {
    return b4a.toString(this.blobCore.key, 'hex')
  }

  address() {
    const { protocol, host, port, secret } = this.server
    return `${protocol}://${host}:${port}/${secret}/`
  }

  publicAddress() {
    const { protocol, host, port } = this.server
    return `${protocol}://${host}:${port}/`
  }

  _link(blob) {
    return this.server
      .getLink(this.blobCore.key, { blob })
      .replace(this.address(), HYPERDRIVE_URL_PREFIX + '/')
  }

  _ownId(file) {
    return `${this.ownCore}:${file.blockOffset}:${file.blockLength}`
  }

  // The blob server drops its socket on suspend without closing it, so resume
  // could not bind the same port again and every attachment link would break.
  async suspend() {
    const socket = this.server.server
    await this.server.suspend()
    if (!socket?.listening) return
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 2000)
      socket.close(() => {
        clearTimeout(timer)
        resolve()
      })
    })
  }

  holdTimers(held) {
    this.timersHeld = held
    const timers = [this.scanTimer, this.ticker, ...[...this.uploads.values()].map((u) => u.idle)]
    for (const timer of timers) {
      if (!timer) continue
      if (held) timer.ref()
      else timer.unref()
    }
  }

  _track(timer) {
    if (!this.timersHeld) timer.unref()
    return timer
  }

  async resume() {
    const socket = this.server.server
    if (!this.server.suspending && socket?.listening && !socket.closing) return
    await this.server.suspend()
    await this.server.resume()
  }

  async getFile({ key }) {
    const entry = await this.drive.entry(key)
    return this.server.getLink(this.blobCore.key, { blob: entry.value.blob })
  }

  async insertFile(args) {
    return this._writing(() => this._insertFile(args))
  }

  // Blocks of a file still being written belong to no index yet; nothing may
  // free own-core blocks by "not referenced" while one is in flight.
  async _writing(write) {
    this.writing++
    try {
      return await write()
    } finally {
      this.writing--
      await this._indexFiles().catch(() => {})
    }
  }

  async _insertFile({ key, buffer, path, seal = null }) {
    const metadata = { insertedAt: Date.now() }
    if (path) {
      const streams = [fs.createReadStream(path)]
      if (seal) streams.push(createEncryptStream(seal.key, seal.id))
      await pipelinePromise(...streams, this.drive.createWriteStream(key, { metadata }))
    } else {
      await this.drive.put(key, seal ? encryptBuffer(seal.key, seal.id, buffer) : buffer, {
        metadata
      })
    }
    return this._link((await this.drive.entry(key)).value.blob)
  }

  insertFileWithProgress(key, path, onProgress, token, seal) {
    return this._writing(() => this._insertWithProgress(key, path, onProgress, token, seal))
  }

  async _insertWithProgress(key, path, onProgress = () => {}, token = null, seal = null) {
    let total = 0
    try {
      total = fs.statSync(path).size
    } catch (err) {
      log.debug('[media] could not stat the upload', err?.message)
    }
    let sent = 0
    const read = fs.createReadStream(path)
    const count = new Transform({
      transform(chunk, cb) {
        sent += chunk.length
        onProgress(sent, total)
        cb(null, chunk)
      }
    })
    const encrypt = seal ? createEncryptStream(seal.key, seal.id) : null
    const write = this.drive.createWriteStream(key, { metadata: { insertedAt: Date.now() } })
    if (token) {
      token.destroy = () => {
        read.destroy()
        count.destroy()
        encrypt?.destroy()
        write.destroy()
      }
    }
    onProgress(0, total)
    await pipelinePromise(...[read, count, encrypt, write].filter(Boolean))
    if (token?.cancelled) throw new Error('UPLOAD_CANCELLED')
    return this._link((await this.drive.entry(key)).value.blob)
  }

  // A new file in this device's drive from any linked blob: decrypted with `open`, encrypted with `seal`.
  copyFile(noteKey, url, fileName, { open = null, seal = null } = {}) {
    return this._writing(async () => {
      const range = rangeOf(url)
      if (!range) throw new Error('not a media link')
      const core = range.core === this.ownCore ? this.blobCore : await this._core(range.core)
      const blob = blobRefFromUrl(normalizeAttachmentUrls(url))
      const path = `${noteKey}/${b4a.toString(crypto.randomBytes(32), 'hex')}_${seal ? '' : fileName}`
      const streams = [
        new Hyperblobs(core).createReadStream(blob, { wait: false }),
        open && createDecryptStream(open.key, open.id, { cipherBytes: blob.byteLength }),
        seal && createEncryptStream(seal.key, seal.id),
        this.drive.createWriteStream(path, { metadata: { insertedAt: Date.now() } })
      ]
      await pipelinePromise(...streams.filter(Boolean))
      return this._link((await this.drive.entry(path)).value.blob)
    })
  }

  fileNameOf(html, url) {
    const own = this.files.find((file) => this._ownId(file) === rangeOf(url)?.id)
    return own?.fileName || attachmentName(html, url) || 'file'
  }

  _ownPath(urlOrPath) {
    if (!urlOrPath.includes('blob=')) return urlOrPath
    const id = rangeOf(normalizeAttachmentUrls(urlOrPath))?.id
    return this.files.find((file) => this._ownId(file) === id)?.path || null
  }

  async _forget(url) {
    const range = rangeOf(url)
    if (range) await this.vault.append({ type: OP.DELETE_MEDIA, refKey: range.id, url })
  }

  async deleteFile(urlOrPath) {
    const path = this._ownPath(urlOrPath)
    const entry = path ? await this.drive.entry(path) : null
    if (!entry) return
    if (entry.value?.blob) await this._forget(this._link(entry.value.blob))
    await this.drive.del(path)
    this.vault.emit('storage-changed')
  }

  async deleteNoteFile(noteKey, urlOrPath, reseal = null) {
    const note = await this.vault.getNote(noteKey)
    const html = note?.sealed ? reseal && openNoteBody(noteKey, note.sealed) : note?.note
    if (note?.sealed && typeof html !== 'string') throw new Error('LOCK_SESSION_CLOSED')
    const path = this._ownPath(urlOrPath)
    const entry = path ? await this.drive.entry(path) : null
    const url = entry?.value?.blob ? this._link(entry.value.blob) : urlOrPath
    if (path) await this.drive.del(path)
    if (html) {
      const stripped = withoutAttachment(html, url)
      if (stripped !== html) {
        const value = note.sealed
          ? { ...note, sealed: reseal(stripped, note.sealed), updatedAt: Date.now() }
          : { ...note, note: stripped, updatedAt: Date.now() }
        await this.vault.addNote({ key: noteKey, value })
      }
    }
    await this._forget(url)
    await this.sweep()
  }

  async pruneRemovedMedia(noteKey, before, after) {
    const kept = new Set(noteLinks(after))
    const removed = noteLinks(before).filter((url) => !kept.has(url))
    if (!removed.length) return
    const used = await this._usedRanges()
    for (const url of removed) if (!used.has(rangeOf(url)?.id)) await this._forget(url)
    await this.sweep()
  }

  async deleteNoteMedia(noteKey) {
    for (const file of this.files.filter((f) => f.noteKey === noteKey)) {
      await this._forget(file.url)
      await this.drive.del(file.path)
    }
  }

  async _usedRanges() {
    const used = new Set()
    for (const { value } of await this.vault.getAllNotesStrict()) {
      for (const url of noteLinks(value)) {
        const range = rangeOf(url)
        if (range) used.add(range.id)
      }
    }
    return used
  }

  // Frees deleted media. Other devices' cached copies keep only what a note
  // links to. This device's own blob core only ever loses ranges that were
  // explicitly deleted, no note uses, and whose retention has passed; Reclaim
  // passes `retain: false` to skip the wait.
  async sweep({ retain = true, now = Date.now() } = {}) {
    const db = await this.vault.autobaseDb()
    if (!db || this.closed) return 0
    const used = await this._usedRanges()
    const deletedAt = new Map()
    for await (const { key, value } of viewStore.mediaTombstones(db)) {
      deletedAt.set(key, value.deletedAt || 0)
    }

    let freed = 0
    let ownFreed = 0
    for (const [id, at] of deletedAt) {
      const [core, offset, length] = id.split(':')
      if (core !== this.ownCore || used.has(id)) continue
      if (retain && now - at < MEDIA_RETENTION_MS) continue
      const start = Number(offset)
      ownFreed += await clearBlockRange(this.blobCore, start, start + Number(length))
    }
    if (ownFreed) await compact(this.blobCore)
    freed += ownFreed

    const external = new Set(this.cores.keys())
    for (const id of deletedAt.keys()) external.add(id.split(':')[0])
    external.delete(this.ownCore)
    for (const core of external) {
      const keep = []
      for (const id of used) {
        const [key, offset, length] = id.split(':')
        if (key === core) keep.push([Number(offset), Number(offset) + Number(length)])
      }
      for (const [id, download] of this.downloads) {
        if (download.core === core && !used.has(id)) this._stop(id)
      }
      freed += await keepOnly(await this._core(core), keep).catch(() => 0)
    }

    for (const file of this.files) {
      const unlinked = !used.has(this._ownId(file)) && file.insertedAt <= now - FRESH_UPLOAD_MS
      if (unlinked && blocksPresent(this.blobCore, file.blockOffset, file.blockLength) === 0) {
        await this.drive.del(file.path)
      }
    }

    const stale = [...deletedAt.values()].some((at) => now - at > TOMBSTONE_TTL_MS)
    if (stale && this.vault.writable) {
      await this.vault.append({ type: OP.PRUNE_MEDIA_TOMBSTONES, cutoff: now - TOMBSTONE_TTL_MS })
    }
    if (freed) this.vault.emit('storage-changed')
    return freed
  }

  // Also frees own-core blocks no note links: a cancelled upload, or a file that
  // lost its link without a delete. Uploads under a day old and everything past
  // the last indexed file are left alone.
  async reclaim() {
    const live = this.files.map((file) => file.blob)
    const before = measureLocalBlobBytes(this.blobCore, live).presentBytes
    await this.sweep({ retain: false })
    if (this.writing === 0) {
      await this._indexFiles()
      const used = await this._usedRanges()
      const cutoff = Date.now() - FRESH_UPLOAD_MS
      const unlinked = this.files.filter(
        (file) => !used.has(this._ownId(file)) && file.insertedAt <= cutoff
      )
      const keep = this.files
        .filter((file) => !unlinked.includes(file))
        .map((f) => [f.blockOffset, f.blockOffset + f.blockLength])
      for (const id of used) {
        const [core, offset, length] = id.split(':')
        if (core === this.ownCore) keep.push([Number(offset), Number(offset) + Number(length)])
      }
      const end = Math.max(
        ...keep.map(([, e]) => e),
        ...this.files.map((f) => f.blockOffset + f.blockLength),
        0
      )
      keep.push([end, Math.max(end, this.blobCore.length)])
      await keepOnly(this.blobCore, keep)
      for (const file of unlinked) await this.drive.del(file.path)
      if (unlinked.length) await this._indexFiles()
    }
    await compact(this.blobCore, FULL_COMPACTION)
    const after = measureLocalBlobBytes(this.blobCore, live).presentBytes
    this.vault.emit('storage-changed')
    return { reclaimedBytes: Math.max(0, before - after) }
  }

  async _indexFiles() {
    const files = []
    for await (const entry of this.drive.list('/', { recursive: true })) {
      const blob = entry.value?.blob
      const info = pathInfo(entry.key)
      if (!blob?.blockLength || !info) continue
      files.push({
        ...info,
        blob,
        blockOffset: blob.blockOffset,
        blockLength: blob.blockLength,
        byteLength: blob.byteLength || 0,
        insertedAt: entry.value.metadata?.insertedAt || 0,
        url: this._link(blob)
      })
    }
    this.files = files
  }

  async missingUrls(urls) {
    const missing = new Set()
    for (const url of new Set(urls)) {
      if (this.closed) break
      const normalized = normalizeAttachmentUrls(url)
      const ref = blobRefFromUrl(normalized)
      const coreHex = blobCoreKeyHexFromUrl(normalized)
      if (!ref?.blockLength || !coreHex) continue
      try {
        const core = coreHex === this.ownCore ? this.blobCore : await this._core(coreHex)
        if (blocksPresent(core, ref.blockOffset, ref.blockLength) < ref.blockLength) {
          missing.add(url)
        }
      } catch {
        missing.add(url)
      }
    }
    return missing
  }

  async _core(coreHex) {
    let core = this.cores.get(coreHex)
    if (!core) {
      core = this.store.get({ key: b4a.from(coreHex, 'hex'), encryptionKey: this.key })
      this.cores.set(coreHex, core)
      core.on('download', (index) => this._downloaded(coreHex, index))
      core.on('peer-add', () => this.vault.emit('storage-changed'))
      core.on('peer-remove', () => this.vault.emit('storage-changed'))
    }
    await core.ready()
    return core
  }

  async _sealedFiles() {
    if (this.sealedIndex) return this.sealedIndex
    const seq = this.notesSeq
    const keyed = new Map()
    const unkeyed = new Set()
    const open = new Set()
    for (const { key, value } of await this.vault.getAllNotes()) {
      if (!value?.sealed) {
        for (const link of linksIn(value?.note || '')) open.add(rangeOf(link)?.id ?? '')
        continue
      }
      const files = envelopeFiles(value.sealed)
      for (const link of Object.keys(files)) {
        const id = rangeOf(link)?.id
        if (id) keyed.set(id, key)
      }
      const plain = [...envelopeLinks(value.sealed), ...Object.keys(envelopeRelink(value.sealed))]
      for (const link of plain) if (!files[link]) unkeyed.add(rangeOf(link)?.id ?? '')
    }
    for (const id of open) unkeyed.delete(id)
    unkeyed.delete('')
    const index = { keyed, unkeyed }
    if (seq === this.notesSeq) this.sealedIndex = index
    return index
  }

  // A sealed note's files not encrypted yet are refused too while the session is closed.
  async sealedFile(blobId) {
    const known = fileKeyFor(blobId)
    if (known) return known
    const index = await this._sealedFiles()
    const noteKey = index.keyed.get(blobId)
    if (noteKey === undefined) {
      if (this.vault.heldFileKeys?.records.has(blobId)) return false
      return index.unkeyed.has(blobId) && !isLockSessionOpen() ? false : null
    }
    if (isLockSessionOpen()) {
      const note = await this.vault.getNote(noteKey)
      if (note?.sealed) openNoteFileKeys(noteKey, note.sealed)
    }
    return fileKeyFor(blobId) || false
  }

  // Unkeyed links of sealed notes: still downloading, or on this device and not copied yet.
  async refreshSealWaiting(notes = null) {
    const names = new Map(this.sealWaiting.map((file) => [file.link, file.fileName]))
    const waiting = []
    for (const { key, value } of notes || (await this.vault.getAllNotes())) {
      if (!value?.sealed) continue
      const files = envelopeFiles(value.sealed)
      const links = envelopeLinks(value.sealed).filter((link) => !files[link] && rangeOf(link))
      if (!links.length) continue
      const body = isLockSessionOpen() ? openNoteBody(key, value.sealed) : null
      for (const link of links) {
        waiting.push({
          noteKey: key,
          link,
          fileName: body === null ? names.get(link) || '' : attachmentName(body, link),
          size: rangeOf(link).byteLength || 0
        })
      }
    }
    if (waiting.length && !(await gateStatus(this.vault, 'sealedFiles')).open) waiting.length = 0
    if (!this.closed) this.setSealWaiting(waiting)
  }

  setSealWaiting(files) {
    const changed = JSON.stringify(files) !== JSON.stringify(this.sealWaiting)
    this.sealWaiting = files
    if (changed) this.vault.emit('storage-changed')
  }

  getSealWaitingInfo() {
    return this.sealWaiting.map((file) => ({ ...file }))
  }

  scheduleScan() {
    this.notesSeq++
    this.sealedIndex = null
    if (this.scanTimer || this.closed) return
    this.scanTimer = this._track(
      setTimeout(() => {
        this.scanTimer = null
        this.scan().catch((e) => log.error('[media] scan failed', e))
      }, SCAN_DELAY_MS)
    )
  }

  // Every link to another device's file is downloaded until it is local.
  async scan() {
    const notes = await this.vault.getAllNotes()
    await this.refreshSealWaiting(notes).catch((e) => log.error('[media] seal waiting list', e))
    for (const { key, value } of notes) {
      for (const url of noteLinks(value)) {
        const range = rangeOf(url)
        if (!range || range.core === this.ownCore || this.downloads.has(range.id)) continue
        const core = await this._core(range.core)
        if (blocksPresent(core, range.blockOffset, range.blockLength) >= range.blockLength) continue
        this.downloads.set(range.id, {
          ...range,
          noteKey: key,
          url,
          fileName: attachmentName(readableBody(key, value), url),
          status: this.held ? 'paused' : 'queued',
          handle: null,
          progressAt: Date.now()
        })
        this.vault.emit('storage-changed')
      }
    }
    this._pump()
  }

  _pump() {
    if (this.held || this.closed) return
    let active = [...this.downloads.values()].filter((d) => d.status === 'downloading').length
    for (const download of this.downloads.values()) {
      if (active >= MAX_DOWNLOADS) break
      if (download.status !== 'queued') continue
      active++
      this._start(download)
    }
    this._tick()
  }

  _start(download) {
    const handle = this.cores.get(download.core).download({
      start: download.blockOffset,
      end: download.blockOffset + download.blockLength
    })
    Object.assign(download, { handle, status: 'downloading', progressAt: Date.now() })
    const current = () => this.downloads.get(download.id)?.handle === handle
    handle
      .done()
      .then(() => {
        if (!current()) return
        this.downloads.delete(download.id)
        this.vault.emit('media-downloaded', download.url)
      })
      .catch(() => {
        if (current()) download.status = 'error'
      })
      .finally(() => {
        this.vault.emit('storage-changed')
        this._pump()
      })
  }

  _stop(id) {
    this.downloads.get(id)?.handle?.destroy()
    this.downloads.delete(id)
  }

  _downloaded(coreHex, index) {
    for (const download of this.downloads.values()) {
      const end = download.blockOffset + download.blockLength
      if (download.core === coreHex && index >= download.blockOffset && index < end) {
        download.progressAt = Date.now()
      }
    }
    this.vault.emit('transfer-progress')
  }

  setHeld(held) {
    this.held = !!held
    for (const download of this.downloads.values()) {
      if (this.held && download.status !== 'error') {
        download.handle?.destroy()
        Object.assign(download, { handle: null, status: 'paused' })
      } else if (!this.held && download.status === 'paused') {
        download.status = 'queued'
      }
    }
    this._pump()
    this.vault.emit('storage-changed')
    return { held: this.held }
  }

  retryDownload(url) {
    const download = this.downloads.get(rangeOf(url)?.id)
    if (!download) return { done: false }
    download.handle?.destroy()
    Object.assign(download, { handle: null, status: 'queued' })
    this._pump()
    return { done: true }
  }

  pauseDownload(url) {
    const download = this.downloads.get(rangeOf(url)?.id)
    if (!download) return { paused: false }
    download.handle?.destroy()
    Object.assign(download, { handle: null, status: 'paused' })
    this._pump()
    this.vault.emit('storage-changed')
    return { paused: true }
  }

  getDownloadsInfo() {
    return [...this.downloads.values()].map((download) => {
      const core = this.cores.get(download.core)
      const present = core ? blocksPresent(core, download.blockOffset, download.blockLength) : 0
      return {
        noteKey: download.noteKey,
        url: download.url,
        fileName: download.fileName,
        totalBytes: download.byteLength,
        downloadedBytes: Math.round(download.byteLength * (present / download.blockLength)),
        status: download.status,
        stalled: download.status === 'downloading' && Date.now() - download.progressAt > STALL_MS,
        sourceOnline: (core?.peers?.length ?? 0) > 0
      }
    })
  }

  _uploaded(index, bytes) {
    const file = this.files.find(
      (f) => index >= f.blockOffset && index < f.blockOffset + f.blockLength
    )
    if (!file) return
    let upload = this.uploads.get(file.path)
    if (!upload) {
      upload = { file, blocks: new Set(), bytes: 0, idle: null }
      this.uploads.set(file.path, upload)
      this.vault.emit('storage-changed')
    }
    if (!upload.blocks.has(index)) {
      upload.blocks.add(index)
      upload.bytes += bytes
    }
    clearTimeout(upload.idle)
    upload.idle = this._track(
      setTimeout(() => {
        this.uploads.delete(file.path)
        this.vault.emit('storage-changed')
      }, UPLOAD_IDLE_MS)
    )
    this.vault.emit('transfer-progress')
    this._tick()
  }

  getUploadsInfo() {
    return [...this.uploads.values()].map(({ file, bytes }) => ({
      noteKey: file.noteKey,
      url: file.url,
      fileName: file.fileName,
      totalBytes: file.byteLength,
      uploadedBytes: Math.min(bytes, file.byteLength),
      status: 'uploading'
    }))
  }

  _tick() {
    if (this.ticker || this.closed || this.downloads.size + this.uploads.size === 0) return
    this.ticker = this._track(
      setInterval(() => {
        if (this.closed || this.downloads.size + this.uploads.size === 0) {
          clearInterval(this.ticker)
          this.ticker = null
          return
        }
        this.vault.emit('transfer-progress')
      }, TICK_MS)
    )
  }

  async storageInfo(notes) {
    const info = await getNotesStorageInfo(this.vault, notes, {
      keepUnlinkedSince: Date.now() - FRESH_UPLOAD_MS
    })
    return {
      ...info,
      downloads: this.getDownloadsInfo(),
      uploads: this.getUploadsInfo(),
      sealWaiting: this.getSealWaitingInfo()
    }
  }

  async subscribeStorageInfo(db) {
    const watcher = await viewStore.watchAll(db)
    const listeners = { update: [], transfers: [] }
    const fire = (name) => () => listeners[name].forEach((cb) => cb())
    const onUpdate = debounceWithMaxWait(
      fire('update'),
      STORAGE_INFO_DEBOUNCE_MS,
      STORAGE_INFO_MAX_WAIT_MS
    )
    const onTransfer = debounceWithMaxWait(
      fire('transfers'),
      TRANSFER_INFO_DEBOUNCE_MS,
      TRANSFER_INFO_MAX_WAIT_MS
    )
    watcher.on('update', onUpdate)
    this.drive.core.on('append', onUpdate)
    this.blobCore.on('append', onUpdate)
    this.vault.on('storage-changed', onUpdate)
    this.vault.on('transfer-progress', onTransfer)
    return {
      on(event, cb) {
        listeners[event]?.push(cb)
      },
      close: async () => {
        onUpdate.cancel()
        onTransfer.cancel()
        await watcher.close()
        this.drive.core.off('append', onUpdate)
        this.blobCore.off('append', onUpdate)
        this.vault.off('storage-changed', onUpdate)
        this.vault.off('transfer-progress', onTransfer)
      }
    }
  }
}
