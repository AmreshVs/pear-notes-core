import b4a from 'b4a'
import cenc from 'compact-encoding'
import crypto from 'bare-crypto'
import Hyperblobs from 'hyperblobs'
import HypercoreID from 'hypercore-id-encoding'
import z32 from 'z32'
import fs from 'bare-fs'
import { Readable, pipelinePromise } from 'streamx'
import { BACKUP_ERROR, HYPERDRIVE_URL_PREFIX, normalizeAttachmentUrls } from '../constant.js'
import { blobId } from './encodings.js'
import { gateStatus } from './featureGates.js'
import { isKeyringEntry, keyringPrefId } from './lockCrypto.js'
import { envelopeLinks, relinkEnvelope } from './sealedEnvelope.js'
import * as log from '../log.js'

const BACKUP_VERSION_LEGACY = 1
const BACKUP_VERSION_PASSWORD = 2
const PBKDF2_ITERATIONS = 210000
const PBKDF2_SALT_LENGTH = 16
const PBKDF2_KEY_LENGTH = 32
const PBKDF2_DIGEST = 'sha256'
const MEDIA_CHUNK_SIZE = 1 << 20

function deriveKeyFromPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_LENGTH, PBKDF2_DIGEST)
}

function deriveKeyFromRecoveryKey(recoveryKey) {
  return crypto.createHash('sha256').update(recoveryKey).digest()
}

// v3: every unit is one GCM frame bound to the header and its position, so frames
// cannot be reordered, dropped, spliced between files or truncated; paths are sealed too.
const BACKUP_VERSION_FRAMED = 3
const FRAMED_PBKDF2_ITERATIONS = 600000
const KEY_MODE_PASSWORD = 1
const KEY_MODE_VAULT = 2
const FRAMED_HEADER_LENGTH = 4 + 2 + 1 + PBKDF2_SALT_LENGTH
const MAX_FRAME_LENGTH = 1 << 30
const FRAME = { META: 1, FILE: 2, DATA: 3, FILE_END: 4, END: 5 }
const VAULT_KEY_LABEL = b4a.from('pear-notes:backup:v3')
// v4 is v3 framing; the bump makes an app that can't read sealed notes refuse the file.
const BACKUP_VERSION_SEALED = 4
const LOCK_SETTINGS = ['lockMethod', 'lockPasswordSalt', 'lockPasswordHash']

export const backupVersionFor = (notes) =>
  notes.some((note) => !!note.value?.sealed) ? BACKUP_VERSION_SEALED : BACKUP_VERSION_FRAMED

function framedHeader(keyMode, salt, version) {
  const header = b4a.alloc(FRAMED_HEADER_LENGTH)
  header.write('PNBK', 0)
  header.writeUInt16BE(version, 4)
  header[6] = keyMode
  salt.copy(header, 7)
  return header
}

function deriveFramedPasswordKey(password, salt) {
  return crypto.pbkdf2Sync(
    password,
    salt,
    FRAMED_PBKDF2_ITERATIONS,
    PBKDF2_KEY_LENGTH,
    PBKDF2_DIGEST
  )
}

function deriveFramedVaultKey(vaultKey, salt) {
  return crypto.createHash('sha256').update(VAULT_KEY_LABEL).update(salt).update(vaultKey).digest()
}

function frameAad(header, seq) {
  const position = b4a.alloc(8)
  position.writeUInt32BE(Math.floor(seq / 0x100000000), 0)
  position.writeUInt32BE(seq >>> 0, 4)
  return b4a.concat([header, position])
}

function sealFrame(aesKey, header, seq, type, payload) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv)
  cipher.setAAD(frameAad(header, seq))
  const encrypted = b4a.concat([
    cipher.update(b4a.from([type])),
    cipher.update(payload),
    cipher.final()
  ])
  const lenBuf = b4a.alloc(4)
  lenBuf.writeUInt32BE(encrypted.length, 0)
  return b4a.concat([lenBuf, iv, cipher.getAuthTag(), encrypted])
}

// Returns null when the frame does not authenticate.
function openFrame(aesKey, header, seq, iv, tag, encrypted) {
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv)
    decipher.setAAD(frameAad(header, seq))
    decipher.setAuthTag(tag)
    const plain = b4a.concat([decipher.update(encrypted), decipher.final()])
    if (plain.length < 1) return null
    return { type: plain[0], payload: plain.subarray(1) }
  } catch {
    return null
  }
}

export function isCancellation(error) {
  return error?.message === BACKUP_ERROR.CANCELLED
}

function throwIfCancelled(signal) {
  if (signal?.cancelled) throw new Error(BACKUP_ERROR.CANCELLED)
}

function tryDecryptMeta(aesKey, iv, tag, data) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv)
  decipher.setAuthTag(tag)
  try {
    return b4a.concat([decipher.update(data), decipher.final()])
  } catch {
    return null
  }
}

export function parseHyperdriveUrl(url) {
  const normalized = url.replace(/&amp;/g, '&')
  if (!normalized.startsWith(HYPERDRIVE_URL_PREFIX + '/')) return null
  const query = normalized.slice(HYPERDRIVE_URL_PREFIX.length + 2)
  const params = {}
  for (const part of query.split('&')) {
    const eq = part.indexOf('=')
    if (eq !== -1) params[part.slice(0, eq)] = part.slice(eq + 1)
  }
  if (!params.key || !params.blob) return null
  return params
}

export function blobRefFromUrl(url) {
  const params = parseHyperdriveUrl(url)
  if (!params) return null
  try {
    return cenc.decode(blobId, z32.decode(params.blob))
  } catch {
    return null
  }
}

// Return the blob core key hex from a URL, or null on failure.
export function blobCoreKeyHexFromUrl(url) {
  const params = parseHyperdriveUrl(url)
  if (!params) return null
  try {
    const key = HypercoreID.decode(params.key)
    return b4a.toString(key, 'hex')
  } catch {
    return null
  }
}

// Return all unique media URLs referenced in a list of notes.
export function extractReferencedUrls(notes) {
  const urls = new Set()
  for (const note of notes) {
    for (const url of envelopeLinks(note.value?.sealed)) urls.add(url)
    if (!note.value?.note) continue
    const content = note.value.note.replace(/&amp;/g, '&')
    const re = /http:\/\/hyperdrive\/\?[^"'\s<>]*/g
    let match
    while ((match = re.exec(content)) !== null) urls.add(match[0])
  }
  return urls
}

export function blocksPresent(core, blockOffset, blockLength) {
  const bitfield = core?.core?.bitfield
  if (!bitfield || !blockLength) return 0
  return bitfield.count(blockOffset, blockLength, true)
}

// DO NOT call core.clear(), blobs.clear() or hyperdrive.clear() anywhere in this
// codebase. Always free blob bytes through clearBlockRange (or NoteBase's
// _clearDriveEntry for a drive path). A single direct clear can permanently stop
// other devices from receiving any new media from this device.
//
// Hypercore's clear() also drops merkle tree nodes, and it treats the subtree to
// the left of `start` as already cleared without checking. That deletes roots an
// older length still needs, so every peer holding that length can never be
// proven an upgrade again and stops receiving media from this core. The walk
// stops before deleting anything when the block right after `start` is still
// present, so only clear runs of present blocks that begin on an even index
// with a present successor. At most one block per run is left behind.
export async function clearBlockRange(core, start, end) {
  const bitfield = core?.core?.bitfield
  if (!bitfield) return 0
  end = Math.min(end, core.length)

  let cleared = 0
  let index = start
  while (index < end) {
    if (!bitfield.get(index)) {
      index++
      continue
    }
    let runEnd = index
    while (runEnd < end && bitfield.get(runEnd)) runEnd++

    const runStart = index % 2 === 0 ? index : index + 1
    if (runStart < runEnd && bitfield.get(runStart + 1)) {
      await core.clear(runStart, runEnd)
      cleared += runEnd - runStart
    }
    index = runEnd
  }
  return cleared
}

function presentBytesInRange(core, blockStart, blockEnd, byteLength) {
  const blockLength = blockEnd - blockStart
  if (blockLength <= 0 || byteLength <= 0) return 0
  const present = blocksPresent(core, blockStart, blockLength)
  if (!present) return 0
  if (present >= blockLength) return byteLength
  return Math.round(byteLength * (present / blockLength))
}

function mergeBlobRanges(blobs) {
  const ranges = blobs
    .filter((blob) => blob && blob.blockLength && Number.isFinite(blob.byteOffset))
    .map((blob) => ({
      blockStart: blob.blockOffset,
      blockEnd: blob.blockOffset + blob.blockLength,
      byteStart: blob.byteOffset,
      byteEnd: blob.byteOffset + (blob.byteLength || 0)
    }))
    .sort((a, b) => a.blockStart - b.blockStart)

  const merged = []
  for (const range of ranges) {
    const last = merged[merged.length - 1]
    if (last && range.blockStart < last.blockEnd) {
      last.blockEnd = Math.max(last.blockEnd, range.blockEnd)
      last.byteEnd = Math.max(last.byteEnd, range.byteEnd)
    } else {
      merged.push({ ...range })
    }
  }
  return merged
}

export function measureLocalBlobBytes(core, liveBlobs) {
  const length = core?.length || 0
  if (!length) return { presentBytes: 0, orphanBytes: 0 }

  let liveBytes = 0
  let orphanBytes = 0
  let blockCursor = 0
  let byteCursor = 0
  for (const range of mergeBlobRanges(liveBlobs)) {
    if (range.blockEnd > length) continue
    if (range.blockStart > blockCursor) {
      orphanBytes += presentBytesInRange(
        core,
        blockCursor,
        range.blockStart,
        range.byteStart - byteCursor
      )
    }
    liveBytes += presentBytesInRange(
      core,
      range.blockStart,
      range.blockEnd,
      range.byteEnd - range.byteStart
    )
    blockCursor = range.blockEnd
    byteCursor = range.byteEnd
  }
  if (length > blockCursor) {
    orphanBytes += presentBytesInRange(core, blockCursor, length, core.byteLength - byteCursor)
  }

  return { presentBytes: liveBytes + orphanBytes, orphanBytes }
}

async function hasIntactDriveEntry(base, path, expectedByteLength = null) {
  try {
    const entry = await base.hyperdrive.entry(path)
    const blob = entry?.value?.blob
    if (!blob) return false
    if (expectedByteLength !== null && blob.byteLength !== expectedByteLength) return false
    if (!blob.blockLength) return true
    const present = blocksPresent(base.hyperdrive.blobs.core, blob.blockOffset, blob.blockLength)
    return present >= blob.blockLength
  } catch {
    return false
  }
}

// Notes data counts each linked range once, so every device reports the same total;
// own files no note links are on disk but not notes data.
export async function getNotesStorageInfo(base, notes, { keepUnlinkedSince = 0 } = {}) {
  const localCore = base.hyperdrive.blobs.core
  const myBlobCoreKeyHex = b4a.toString(localCore.key, 'hex')
  const ownFiles = new Map()
  for await (const entry of base.hyperdrive.list('/', { recursive: true })) {
    const blob = entry.value?.blob
    if (!blob) continue
    const entryPath = entry.key.startsWith('/') ? entry.key.slice(1) : entry.key
    const slashIdx = entryPath.indexOf('/')
    if (slashIdx === -1) continue
    const fileSegment = entryPath.slice(slashIdx + 1)
    const underscoreIdx = fileSegment.indexOf('_')
    const name = underscoreIdx !== -1 ? fileSegment.slice(underscoreIdx + 1) : fileSegment
    const insertedAt = entry.value.metadata?.insertedAt || 0
    ownFiles.set(`${blob.blockOffset}:${blob.blockLength}`, {
      path: entryPath,
      name,
      blob,
      insertedAt
    })
  }

  const counted = new Set()
  const liveLocal = new Map()
  const externalRefsByCore = new Map()
  let referencedBytes = 0

  const notesList = notes
    .map(({ key, value }) => {
      const media = []
      const seenInNote = new Set()
      const content = normalizeAttachmentUrls(value?.note || '').replace(/&amp;/g, '&')
      const links = content.match(/http:\/\/hyperdrive\/\?[^"'\s<>]*/g) || []
      for (const rawUrl of [...links, ...envelopeLinks(value?.sealed)]) {
        const coreHex = blobCoreKeyHexFromUrl(rawUrl)
        const ref = blobRefFromUrl(rawUrl)
        const size = ref?.byteLength || 0
        if (!coreHex || !ref?.blockLength || !size) continue
        const refId = `${ref.blockOffset}:${ref.blockLength}`
        const id = `${coreHex}:${refId}`
        if (seenInNote.has(id)) continue
        seenInNote.add(id)
        const own = coreHex === myBlobCoreKeyHex ? ownFiles.get(refId) : null
        media.push(
          own ? { path: own.path, name: own.name, size } : { path: rawUrl, name: rawUrl, size }
        )
        if (counted.has(id)) continue
        counted.add(id)
        referencedBytes += size
        if (coreHex === myBlobCoreKeyHex) {
          liveLocal.set(refId, ref)
          continue
        }
        if (!externalRefsByCore.has(coreHex)) {
          externalRefsByCore.set(coreHex, { key: b4a.from(coreHex, 'hex'), refs: [] })
        }
        externalRefsByCore.get(coreHex).refs.push(ref)
      }
      const contentSize = b4a.from(JSON.stringify(value)).byteLength
      const mediaSize = media.reduce((sum, m) => sum + m.size, 0)
      return {
        key,
        title: value?.title || '',
        contentSize,
        mediaSize,
        totalSize: contentSize + mediaSize,
        media
      }
    })
    .sort((a, b) => b.totalSize - a.totalSize)

  // Reclaim frees unlinked files older than `keepUnlinkedSince`, so only newer ones stay live.
  for (const [refId, file] of ownFiles) {
    if (!liveLocal.has(refId) && file.insertedAt > keepUnlinkedSince)
      liveLocal.set(refId, file.blob)
  }

  let externalOnDiskBytes = 0
  for (const [, { key, refs }] of externalRefsByCore) {
    let core
    try {
      core = base.corestore.get({ key })
      await core.ready()
      for (const ref of refs) {
        const present = blocksPresent(core, ref.blockOffset, ref.blockLength)
        if (!present) continue
        if (present >= ref.blockLength) externalOnDiskBytes += ref.byteLength
        else externalOnDiskBytes += Math.round(ref.byteLength * (present / ref.blockLength))
      }
    } catch {
      continue
    } finally {
      if (core) await core.close().catch(() => {})
    }
  }

  const local = measureLocalBlobBytes(localCore, [...liveLocal.values()])
  const totalOnDiskBytes = local.presentBytes + externalOnDiskBytes
  const reclaimableBytes = local.orphanBytes

  return { notes: notesList, totalBlobBytes: referencedBytes, totalOnDiskBytes, reclaimableBytes }
}

export async function exportBackup(
  base,
  notes,
  folders,
  settings,
  password = null,
  filePath = null,
  cb = () => {},
  signal = null,
  { strict = false } = {}
) {
  log.debug(
    `[exportBackup] drive writable=${base.hyperdrive.core.writable}, version=${base.hyperdrive.version}`
  )

  // Every attachment this export could not include, with the reason. A normal
  // export skips them and carries on, which is fine for a routine backup and
  // wrong for a migration: the backup is the only copy that survives. In strict
  // mode this list is fatal at the end of the run, so the caller learns about
  // every missing file at once rather than one per attempt.
  const missing = []
  function recordMissing(path, reason) {
    missing.push({ path, reason })
    log.debug(`[exportBackup] missing ${path}: ${reason}`)
  }

  const myBlobCoreKeyHex = b4a.toString(base.hyperdrive.blobs.core.key, 'hex')

  const mediaEntries = []
  const mediaMap = {}
  for await (const entry of base.hyperdrive.list('/', { recursive: true })) {
    if (!entry.value?.blob) continue
    const entryPath = entry.key.startsWith('/') ? entry.key.slice(1) : entry.key
    if (!entryPath.includes('/')) continue
    mediaEntries.push(entry)
    try {
      const url = base.blobServer
        .getLink(base.hyperdrive.blobs.core.key, { blob: entry.value.blob })
        .replace(base.getHyperdriveAddress(), HYPERDRIVE_URL_PREFIX + '/')
      mediaMap[entry.key] = url
    } catch (e) {
      // The bytes still go in the backup, but with no URL there is nothing to
      // remap on import, so every note referencing it restores with a dead link.
      recordMissing(entry.key, `could not build URL: ${e.message}`)
    }
  }
  log.debug(`[exportBackup] Found ${mediaEntries.length} local drive entries to back up`)

  const referencedUrls = extractReferencedUrls(notes)
  const coveredUrls = new Set(Object.values(mediaMap))
  const extBlobs = []
  let extIndex = 0

  for (const rawUrl of referencedUrls) {
    if (coveredUrls.has(rawUrl)) continue
    const blobKeyHex = blobCoreKeyHexFromUrl(rawUrl)
    if (!blobKeyHex || blobKeyHex === myBlobCoreKeyHex) continue
    if (extBlobs.some((e) => e.originalUrl === rawUrl)) continue

    const params = parseHyperdriveUrl(rawUrl)
    if (!params) {
      recordMissing(rawUrl, 'referenced URL is not a parseable hyperdrive link')
      continue
    }
    try {
      const blobCoreKey = HypercoreID.decode(params.key)
      const blobRef = cenc.decode(blobId, z32.decode(params.blob))
      const path = `/_ext/${extIndex++}`
      extBlobs.push({ path, blobCoreKey, blobRef, originalUrl: rawUrl })
      mediaMap[path] = rawUrl
      coveredUrls.add(rawUrl)
    } catch (e) {
      recordMissing(rawUrl, `could not parse external URL: ${e.message}`)
    }
  }
  log.debug(`[exportBackup] Found ${extBlobs.length} external blobs`)

  const extCoreMap = new Map()
  for (const ext of extBlobs) {
    const keyHex = b4a.toString(ext.blobCoreKey, 'hex')
    if (!extCoreMap.has(keyHex)) {
      const core = base.corestore.get({ key: ext.blobCoreKey, encryptionKey: base.media?.key })
      await core.ready()
      extCoreMap.set(keyHex, { core, blobs: new Hyperblobs(core) })
      log.debug(
        `[exportBackup] External core ${keyHex.slice(0, 8)}: length=${core.length}, peers=${core.peers.length}`
      )
    }
  }

  cb({ step: 'encrypting_metadata', progress: 20, message: 'Encrypting data' })
  const keyMode = password ? KEY_MODE_PASSWORD : KEY_MODE_VAULT
  const salt = crypto.randomBytes(PBKDF2_SALT_LENGTH)
  const header = framedHeader(keyMode, salt, backupVersionFor(notes))
  const aesKey =
    keyMode === KEY_MODE_PASSWORD
      ? deriveFramedPasswordKey(password, salt)
      : deriveFramedVaultKey(base.encryption, salt)

  // How many attachment records the reader should find after the metadata.
  // Written before the media loop runs because the payload is sealed first;
  // both inputs are final by now. A strict export guarantees the file actually
  // contains this many - see the `missing` check at the end of the run.
  const attachmentCount = mediaEntries.length + extBlobs.length

  const metaPayload = b4a.from(
    JSON.stringify({
      version: 1,
      exportedAt: Date.now(),
      notes,
      folders,
      settings: settings || {},
      keyrings: await base.getLockKeyrings(),
      mediaMap,
      attachmentCount,
      strict
    })
  )

  let fd = null
  if (filePath) {
    fd = await fs.open(filePath, 'w')
  }

  const parts = []

  async function writeChunk(buf) {
    if (fd !== null) {
      await fs.write(fd, buf)
    } else {
      parts.push(buf)
    }
  }

  let frameSeq = 0
  async function writeFrame(type, payload) {
    await writeChunk(sealFrame(aesKey, header, frameSeq++, type, payload))
  }

  async function writeBufferRecord(itemPath, buf) {
    await writeFrame(FRAME.FILE, b4a.from(itemPath, 'utf-8'))
    for (let at = 0; at < buf.byteLength; at += MEDIA_CHUNK_SIZE) {
      await writeFrame(FRAME.DATA, buf.subarray(at, at + MEDIA_CHUNK_SIZE))
    }
    await writeFrame(FRAME.FILE_END, b4a.alloc(0))
  }

  async function writeChunkedMediaRecord(entryKey) {
    await writeFrame(FRAME.FILE, b4a.from(entryKey, 'utf-8'))

    let pending = []
    let pendingLen = 0
    for await (const data of base.hyperdrive.createReadStream(entryKey)) {
      throwIfCancelled(signal)
      pending.push(data)
      pendingLen += data.byteLength
      if (pendingLen >= MEDIA_CHUNK_SIZE) {
        await writeFrame(FRAME.DATA, pending.length === 1 ? pending[0] : b4a.concat(pending))
        pending = []
        pendingLen = 0
      }
    }
    if (pendingLen > 0) {
      await writeFrame(FRAME.DATA, pending.length === 1 ? pending[0] : b4a.concat(pending))
    }
    await writeFrame(FRAME.FILE_END, b4a.alloc(0))
  }

  const allMediaItems = [
    ...mediaEntries.map((entry) => ({ type: 'drive', entry })),
    ...extBlobs.map((ext) => ({ type: 'ext', ext }))
  ]

  async function closeExternalCores() {
    for (const [, { core }] of extCoreMap) {
      await core.close().catch(() => {})
    }
  }

  async function discardPartialFile() {
    if (fd === null) return
    await fs.close(fd).catch(() => {})
    fd = null
    await fs.promises.unlink(filePath).catch(() => {})
  }

  try {
    await writeChunk(header)
    await writeFrame(FRAME.META, metaPayload)

    const total = allMediaItems.length
    for (let i = 0; i < total; i++) {
      throwIfCancelled(signal)
      const item = allMediaItems[i]
      const current = i + 1
      const progress = 20 + Math.round((current / total) * 70)
      cb({ step: 'processing_media', progress, message: 'Processing media files', current, total })

      if (item.type === 'drive') {
        const blob = item.entry.value.blob
        const present = blocksPresent(
          base.hyperdrive.blobs.core,
          blob.blockOffset,
          blob.blockLength
        )
        if (present < blob.blockLength) {
          recordMissing(
            item.entry.key,
            `only ${present}/${blob.blockLength} blocks available locally`
          )
          continue
        }
      }

      if (item.type === 'drive' && fd !== null) {
        await writeChunkedMediaRecord(item.entry.key)
        continue
      }

      let buf
      let itemPath

      if (item.type === 'drive') {
        const { entry } = item
        itemPath = entry.key
        try {
          buf = await base.hyperdrive.get(entry.key)
        } catch (e) {
          recordMissing(entry.key, e.message)
          continue
        }
        if (!buf) {
          recordMissing(entry.key, 'drive returned no bytes')
          continue
        }
      } else {
        const { ext } = item
        itemPath = ext.path
        const keyHex = b4a.toString(ext.blobCoreKey, 'hex')
        const coreEntry = extCoreMap.get(keyHex)
        if (!coreEntry) {
          recordMissing(ext.path, 'external blob core could not be opened')
          continue
        }
        const { core, blobs } = coreEntry
        try {
          buf = await blobs.get(ext.blobRef, { wait: false })
          if (!buf) {
            if (core.peers.length === 0) {
              recordMissing(ext.path, 'not replicated locally and no peers to fetch it from')
              continue
            }
            const { blockOffset, blockLength } = ext.blobRef
            const range = core.download({ start: blockOffset, end: blockOffset + blockLength })
            try {
              buf = await Promise.race([
                blobs.get(ext.blobRef),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 60000))
              ])
            } finally {
              range.destroy()
            }
          }
        } catch (e) {
          recordMissing(ext.path, e.message === 'timeout' ? 'timed out after 60s' : e.message)
          continue
        }
        if (!buf) {
          recordMissing(ext.path, 'not available')
          continue
        }
      }

      await writeBufferRecord(itemPath, buf)
    }

    throwIfCancelled(signal)

    // Strict mode fails here rather than at the first skip, so the caller gets
    // the whole list in one run. The throw lands in the catch below, which
    // discards the partial file - a strict export either writes a complete
    // backup or writes nothing.
    if (strict && missing.length > 0) {
      const err = Object.assign(new Error(BACKUP_ERROR.INCOMPLETE), {
        missing,
        attachmentCount
      })
      log.error(
        `[exportBackup] strict export failed: ${missing.length}/${attachmentCount} attachments missing`
      )
      throw err
    }

    cb({ step: 'building_archive', progress: 95, message: 'Building archive' })
    await writeFrame(FRAME.END, b4a.alloc(0))
  } catch (e) {
    await discardPartialFile()
    throw e
  } finally {
    await closeExternalCores()
  }

  if (fd !== null) {
    await fs.close(fd)
    return null
  }
  return b4a.concat(parts)
}

export async function readBackupVersion({ buffer, filePath }) {
  let head = buffer ? buffer.subarray(0, 6) : null
  if (!head && filePath) {
    const fd = await fs.open(filePath, 'r')
    try {
      head = b4a.alloc(6)
      head = head.subarray(0, await fs.read(fd, head, 0, 6, 0))
    } finally {
      await fs.close(fd)
    }
  }
  if (!head || head.length < 6 || b4a.toString(head.subarray(0, 4)) !== 'PNBK') return 0
  return (head[4] << 8) | head[5]
}

async function openByteReader({ buffer, filePath }) {
  if (buffer) {
    return { read: async (at, len) => buffer.subarray(at, at + len), close: async () => {} }
  }
  const fd = await fs.open(filePath, 'r')
  return {
    read: async (at, len) => {
      const out = b4a.alloc(len)
      let got = 0
      while (got < len) {
        const n = await fs.read(fd, out, got, len - got, at + got)
        if (n === 0) break
        got += n
      }
      return out.subarray(0, got)
    },
    close: () => fs.close(fd)
  }
}

export async function readFramedMeta({ buffer, filePath, password, vaultKeys = [] }) {
  if (!buffer && !filePath) return null
  const reader = await openByteReader({ buffer, filePath })
  try {
    const header = await reader.read(0, FRAMED_HEADER_LENGTH)
    if (header.length < FRAMED_HEADER_LENGTH || b4a.toString(header.subarray(0, 4)) !== 'PNBK') {
      return null
    }
    const version = (header[4] << 8) | header[5]
    if (version !== BACKUP_VERSION_FRAMED && version !== BACKUP_VERSION_SEALED) return null
    const salt = header.subarray(7)
    const candidates =
      header[6] === KEY_MODE_PASSWORD
        ? password
          ? [deriveFramedPasswordKey(password, salt)]
          : []
        : header[6] === KEY_MODE_VAULT
          ? vaultKeys.filter(Boolean).map((key) => deriveFramedVaultKey(key, salt))
          : []
    const lenBytes = await reader.read(FRAMED_HEADER_LENGTH, 4)
    if (lenBytes.length < 4) return null
    const len = ((lenBytes[0] << 24) | (lenBytes[1] << 16) | (lenBytes[2] << 8) | lenBytes[3]) >>> 0
    if (len < 1 || len > MAX_FRAME_LENGTH) return null
    const at = FRAMED_HEADER_LENGTH + 4
    const iv = await reader.read(at, 12)
    const tag = await reader.read(at + 12, 16)
    const encrypted = await reader.read(at + 28, len)
    if (encrypted.length < len) return null
    for (const candidate of candidates) {
      const frame = openFrame(candidate, header, 0, iv, tag, encrypted)
      if (frame?.type === FRAME.META) return JSON.parse(b4a.toString(frame.payload, 'utf-8'))
    }
    return null
  } finally {
    await reader.close()
  }
}

const carriesLockState = (meta) =>
  (Array.isArray(meta?.keyrings) && meta.keyrings.some(isKeyringEntry)) ||
  (Array.isArray(meta?.notes) && meta.notes.some((note) => !!note?.value?.sealed))

// Restoring a keyring skips the sealedNotes gate, so an old device could wipe sealed notes.
export async function checkBackupRestore(base, { buffer, filePath, password, recoveryKey }) {
  const version = await readBackupVersion({ buffer, filePath })
  let sealed = version === BACKUP_VERSION_SEALED
  if (!sealed && version === BACKUP_VERSION_FRAMED && password) {
    const meta = await readFramedMeta({
      buffer,
      filePath,
      password,
      vaultKeys: [recoveryKey, base.encryption]
    })
    sealed = carriesLockState(meta)
  }
  if (!sealed || (await base.hasLockKeyring())) return { sealed, blocking: [] }
  const { blocking } = await gateStatus(base, 'sealedNotes')
  return { sealed, blocking }
}

export async function importBackup(
  base,
  { buffer, filePath, recoveryKey, password, signal = null },
  cb = () => {}
) {
  let fd = null
  let fileOffset = 0

  try {
    if (filePath) {
      cb({ step: 'loading', progress: 0, message: 'Opening backup file' })
      fd = await fs.open(filePath, 'r')
    }

    async function readExact(len) {
      if (fd !== null) {
        const b = b4a.alloc(len)
        let bytesReadTotal = 0
        while (bytesReadTotal < len) {
          const bytesRead = await fs.read(fd, b, bytesReadTotal, len - bytesReadTotal, fileOffset)
          if (bytesRead === 0) throw new Error('Unexpected EOF')
          bytesReadTotal += bytesRead
          fileOffset += bytesRead
        }
        return b
      } else {
        if (fileOffset + len > buffer.length) throw new Error('Unexpected EOF')
        const b = buffer.slice(fileOffset, fileOffset + len)
        fileOffset += len
        return b
      }
    }

    async function readUInt16() {
      const b = await readExact(2)
      return b.readUInt16BE(0)
    }

    async function readUInt32() {
      const b = await readExact(4)
      return b.readUInt32BE(0)
    }

    cb({ step: 'validating', progress: 5, message: 'Validating backup file' })
    const magicBuf = await readExact(4)
    if (b4a.toString(magicBuf) !== 'PNBK') {
      throw new Error(BACKUP_ERROR.INVALID_FILE)
    }

    cb({ step: 'decrypting', progress: 15, message: 'Decrypting backup' })
    const backupVersion = await readUInt16()
    let aesKey = null
    let metaDecrypted = null
    const framed =
      backupVersion === BACKUP_VERSION_FRAMED || backupVersion === BACKUP_VERSION_SEALED
    let header = null
    let frameSeq = 0

    async function readRawFrame() {
      try {
        const len = await readUInt32()
        if (len < 1 || len > MAX_FRAME_LENGTH) throw new Error(BACKUP_ERROR.INVALID_FILE)
        const iv = await readExact(12)
        const tag = await readExact(16)
        return { iv, tag, encrypted: await readExact(len) }
      } catch (e) {
        if (e.message === 'Unexpected EOF') throw new Error(BACKUP_ERROR.INVALID_FILE)
        throw e
      }
    }

    async function readFrame() {
      const { iv, tag, encrypted } = await readRawFrame()
      const frame = openFrame(aesKey, header, frameSeq++, iv, tag, encrypted)
      if (!frame) throw new Error(BACKUP_ERROR.INVALID_FILE)
      return frame
    }

    if (framed) {
      const keyMode = (await readExact(1))[0]
      const salt = await readExact(PBKDF2_SALT_LENGTH)
      header = framedHeader(keyMode, salt, backupVersion)
      let candidates
      if (keyMode === KEY_MODE_PASSWORD) {
        if (!password) throw new Error(BACKUP_ERROR.PASSWORD_REQUIRED)
        candidates = [deriveFramedPasswordKey(password, salt)]
      } else if (keyMode === KEY_MODE_VAULT) {
        candidates = [recoveryKey, base.encryption]
          .filter(Boolean)
          .map((key) => deriveFramedVaultKey(key, salt))
      } else {
        throw new Error(BACKUP_ERROR.INVALID_FILE)
      }
      const { iv, tag, encrypted } = await readRawFrame()
      for (const candidate of candidates) {
        const frame = openFrame(candidate, header, 0, iv, tag, encrypted)
        if (!frame) continue
        if (frame.type !== FRAME.META) throw new Error(BACKUP_ERROR.INVALID_FILE)
        aesKey = candidate
        metaDecrypted = frame.payload
        frameSeq = 1
        break
      }
      if (!metaDecrypted) {
        throw new Error(
          keyMode === KEY_MODE_PASSWORD
            ? BACKUP_ERROR.INCORRECT_PASSWORD
            : BACKUP_ERROR.INCORRECT_RECOVERY_KEY
        )
      }
    } else if (backupVersion === BACKUP_VERSION_PASSWORD) {
      if (!password) throw new Error(BACKUP_ERROR.PASSWORD_REQUIRED)
      const salt = await readExact(PBKDF2_SALT_LENGTH)
      const metaIv = await readExact(12)
      const metaTag = await readExact(16)
      const metaLen = await readUInt32()
      const metaEncrypted = await readExact(metaLen)

      const derived = deriveKeyFromPassword(password, salt)
      metaDecrypted = tryDecryptMeta(derived, metaIv, metaTag, metaEncrypted)
      if (!metaDecrypted) throw new Error(BACKUP_ERROR.INCORRECT_PASSWORD)
      aesKey = derived
    } else if (backupVersion === BACKUP_VERSION_LEGACY) {
      const metaIv = await readExact(12)
      const metaTag = await readExact(16)
      const metaLen = await readUInt32()
      const metaEncrypted = await readExact(metaLen)

      for (const key of [recoveryKey, base.encryption]) {
        if (!key) continue
        const derived = deriveKeyFromRecoveryKey(key)
        const dec = tryDecryptMeta(derived, metaIv, metaTag, metaEncrypted)
        if (dec) {
          metaDecrypted = dec
          aesKey = derived
          break
        }
      }
      if (!metaDecrypted) {
        throw new Error(BACKUP_ERROR.INCORRECT_RECOVERY_KEY)
      }
    } else {
      throw new Error(BACKUP_ERROR.UNSUPPORTED_VERSION)
    }

    const payload = JSON.parse(b4a.toString(metaDecrypted, 'utf-8'))

    cb({ step: 'restoring_settings', progress: 25, message: 'Restoring settings' })
    await restoreLockState(base, payload)

    // Every item is attempted even when one fails. `append` rejects on a
    // failed write now instead of pretending it landed, and a bare loop turned
    // that one rejection into a restore that stopped partway - with the rest of
    // the backup never written. For the pairing merge that is worse than a
    // failed restore: the captured copy of this device's notes is deleted
    // straight after. Failures are collected and reported once, at the end.
    const unsaved = []
    const totalFolders = (payload.folders || []).length
    for (let i = 0; i < totalFolders; i++) {
      throwIfCancelled(signal)
      const progress = 25 + Math.round(((i + 1) / totalFolders) * 10)
      cb({
        step: 'restoring_folders',
        progress,
        message: 'Restoring folders',
        current: i + 1,
        total: totalFolders
      })
      await restoreItem(unsaved, 'folder', payload.folders[i].key, () =>
        base.addFolder({
          key: payload.folders[i].key,
          value: payload.folders[i].value,
          noActivity: true
        })
      )
    }

    const totalNotes = (payload.notes || []).length
    for (let i = 0; i < totalNotes; i++) {
      throwIfCancelled(signal)
      const progress = 35 + Math.round(((i + 1) / totalNotes) * 30)
      cb({
        step: 'restoring_notes',
        progress,
        message: 'Restoring notes',
        current: i + 1,
        total: totalNotes
      })
      await restoreItem(unsaved, 'note', payload.notes[i].key, () =>
        base.addNote({
          key: payload.notes[i].key,
          value: payload.notes[i].value,
          noActivity: true
        })
      )
    }

    const restoredPaths = []
    let mediaCurrent = 0

    async function* framedData() {
      while (true) {
        const frame = await readFrame()
        if (frame.type === FRAME.FILE_END) return
        if (frame.type !== FRAME.DATA) throw new Error(BACKUP_ERROR.INVALID_FILE)
        yield frame.payload
      }
    }

    while (framed) {
      throwIfCancelled(signal)
      const frame = await readFrame()
      if (frame.type === FRAME.END) break
      if (frame.type !== FRAME.FILE) throw new Error(BACKUP_ERROR.INVALID_FILE)

      mediaCurrent++
      const extractedFilePath = b4a.toString(frame.payload, 'utf-8')
      cb({
        step: 'restoring_media',
        progress: Math.min(65 + mediaCurrent * 5, 95),
        message: 'Restoring media files',
        current: mediaCurrent
      })

      if (await hasIntactDriveEntry(base, extractedFilePath)) {
        const skipped = framedData()
        while (!(await skipped.next()).done);
      } else {
        await pipelinePromise(
          Readable.from(framedData()),
          base.hyperdrive.createWriteStream(extractedFilePath, {
            metadata: { insertedAt: Date.now() }
          })
        )
      }
      restoredPaths.push(extractedFilePath)
    }

    while (!framed) {
      throwIfCancelled(signal)
      let markerBuf
      try {
        markerBuf = await readExact(1)
      } catch (e) {
        if (e.message === 'Unexpected EOF') break // End of file reached safely
        throw e
      }
      const marker = markerBuf[0]
      if (marker === 0x00) break

      mediaCurrent++
      const pathLen = await readUInt16()
      const filePathBuf = await readExact(pathLen)
      const extractedFilePath = b4a.toString(filePathBuf, 'utf-8')

      cb({
        step: 'restoring_media',
        progress: Math.min(65 + mediaCurrent * 5, 95),
        message: 'Restoring media files',
        current: mediaCurrent
      })

      if (marker === 0x02) {
        if (await hasIntactDriveEntry(base, extractedFilePath)) {
          while (true) {
            const chunkLen = await readUInt32()
            if (chunkLen === 0) break
            await readExact(12)
            await readExact(16)
            await readExact(chunkLen)
          }
        } else {
          async function* chunkedPlaintexts() {
            while (true) {
              const chunkLen = await readUInt32()
              if (chunkLen === 0) break
              const chunkIv = await readExact(12)
              const chunkTag = await readExact(16)
              const chunkCipher = await readExact(chunkLen)
              const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, chunkIv)
              decipher.setAuthTag(chunkTag)
              yield b4a.concat([decipher.update(chunkCipher), decipher.final()])
            }
          }
          await pipelinePromise(
            Readable.from(chunkedPlaintexts()),
            base.hyperdrive.createWriteStream(extractedFilePath, {
              metadata: { insertedAt: Date.now() }
            })
          )
        }
      } else {
        const mediaIv = await readExact(12)
        const mediaTag = await readExact(16)
        const mediaLen = await readUInt32()
        const mediaEncrypted = await readExact(mediaLen)

        if (!(await hasIntactDriveEntry(base, extractedFilePath, mediaLen))) {
          const mediaDecipher = crypto.createDecipheriv('aes-256-gcm', aesKey, mediaIv)
          mediaDecipher.setAuthTag(mediaTag)
          const mediaDecrypted = b4a.concat([
            mediaDecipher.update(mediaEncrypted),
            mediaDecipher.final()
          ])
          await base.hyperdrive.put(extractedFilePath, mediaDecrypted, {
            metadata: { insertedAt: Date.now() }
          })
        }
      }

      restoredPaths.push(extractedFilePath)
    }

    if (payload.mediaMap && restoredPaths.length > 0) {
      cb({ step: 'remapping_media', progress: 96, message: 'Updating media links' })
      const urlReplacements = {}
      for (const extractedFilePath of restoredPaths) {
        const oldUrl = payload.mediaMap[extractedFilePath]
        if (!oldUrl) continue
        try {
          const newLink = await base.getFile({ key: extractedFilePath })
          const newUrl = newLink.replace(base.getHyperdriveAddress(), HYPERDRIVE_URL_PREFIX + '/')
          if (oldUrl !== newUrl) urlReplacements[oldUrl] = newUrl
        } catch {
          // skip
        }
      }

      if (Object.keys(urlReplacements).length > 0) {
        for (const note of payload.notes || []) {
          const sealed = note.value?.sealed && relinkEnvelope(note.value.sealed, urlReplacements)
          if (sealed) {
            await restoreItem(unsaved, 'note links', note.key, () =>
              base.addNote({ key: note.key, value: { ...note.value, sealed }, noActivity: true })
            )
            continue
          }
          if (!note.value?.note) continue
          let updatedNote = note.value.note
          for (const [oldUrl, newUrl] of Object.entries(urlReplacements)) {
            updatedNote = updatedNote.replaceAll(oldUrl, newUrl)
            updatedNote = updatedNote.replaceAll(
              oldUrl.replaceAll('&', '&amp;'),
              newUrl.replaceAll('&', '&amp;')
            )
          }
          if (updatedNote !== note.value.note) {
            await restoreItem(unsaved, 'note links', note.key, () =>
              base.addNote({
                key: note.key,
                value: { ...note.value, note: updatedNote },
                noActivity: true
              })
            )
          }
        }
      }
    }

    // What the caller needs to verify a restore without re-reading the file.
    // `attachmentsExpected` is null for any backup written before strict export
    // existed - those payloads have no count, and a missing count is not a
    // failure. Never make this field required: pre-migration backups must keep
    // restoring. See docs/HYPERDB-VIEW-MIGRATION-PLAN-2026-09-23.md section 2.1.
    const summary = {
      notes: (payload.notes || []).length,
      folders: (payload.folders || []).length,
      attachmentsExpected:
        typeof payload.attachmentCount === 'number' ? payload.attachmentCount : null,
      attachmentsRestored: restoredPaths.length,
      strictExport: payload.strict === true
    }

    if (unsaved.length > 0) {
      const notes = unsaved.filter((item) => item.kind === 'note').length
      const folders = unsaved.filter((item) => item.kind === 'folder').length
      const links = unsaved.filter((item) => item.kind === 'note links').length
      const parts = []
      if (notes) parts.push(notes + (notes === 1 ? ' note' : ' notes'))
      if (folders) parts.push(folders + (folders === 1 ? ' folder' : ' folders'))
      if (links) parts.push('media links in ' + links + (links === 1 ? ' note' : ' notes'))
      throw new Error('Restore incomplete: ' + parts.join(', ') + ' could not be saved')
    }

    return summary
  } finally {
    if (fd !== null) await fs.close(fd)
  }
}

async function restoreLockState(base, payload) {
  const incoming = Array.isArray(payload.keyrings) ? payload.keyrings.filter(isKeyringEntry) : []
  const existing = await base.getLockKeyrings()
  const known = new Set(existing.map((entry) => entry.id))
  for (const entry of incoming) {
    if (known.has(entry.id)) continue
    const value = existing.length ? { ...entry, pending: true } : entry
    await base.setSyncedPref(keyringPrefId(entry.id), value)
  }

  const restored =
    payload.settings && Object.keys(payload.settings).length > 0 ? payload.settings : null
  let settings = restored
  if (existing.length) {
    if (restored) settings = withLockSettings(restored, (await base.getSettings()) || {})
  } else if (incoming.length) {
    settings = { ...(restored || (await base.getSettings()) || {}), lockMethod: 'password' }
    delete settings.lockPasswordSalt
    delete settings.lockPasswordHash
  }
  if (settings) await base.updateSettings({ settings, noActivity: true })
}

function withLockSettings(settings, current) {
  const next = { ...settings }
  for (const name of LOCK_SETTINGS) {
    if (name in current) next[name] = current[name]
    else delete next[name]
  }
  return next
}

async function restoreItem(unsaved, kind, key, write) {
  try {
    await write()
  } catch (err) {
    if (isCancellation(err)) throw err
    log.error('[restore] could not save a ' + kind, { key, error: err?.message || err })
    unsaved.push({ kind, key })
  }
}
