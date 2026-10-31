import b4a from 'b4a'
import sodium from 'sodium-universal'
import { Transform } from 'streamx'

export const CHUNK_CIPHER_BYTES = 65536
const TAG_BYTES = sodium.crypto_aead_xchacha20poly1305_ietf_ABYTES
export const CHUNK_PLAIN_BYTES = CHUNK_CIPHER_BYTES - TAG_BYTES
const KEY_BYTES = 32
const FILE_ID_BYTES = 16
const NONCE_BYTES = sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES

export function createFileKey() {
  const key = sodium.sodium_malloc(KEY_BYTES)
  sodium.randombytes_buf(key)
  const id = b4a.alloc(FILE_ID_BYTES)
  sodium.randombytes_buf(id)
  return { key, id: b4a.toString(id, 'hex') }
}

const chunkCount = (cipherLength) => Math.max(1, Math.ceil(cipherLength / CHUNK_CIPHER_BYTES))

export function plainLength(cipherLength) {
  if (!Number.isInteger(cipherLength) || cipherLength < TAG_BYTES) return -1
  const tail = cipherLength % CHUNK_CIPHER_BYTES
  if (tail !== 0 && tail < TAG_BYTES) return -1
  return cipherLength - TAG_BYTES * chunkCount(cipherLength)
}

export function cipherLength(plain) {
  return plain + TAG_BYTES * Math.max(1, Math.ceil(plain / CHUNK_PLAIN_BYTES))
}

export function chunkRange(start, end, cipherBytes) {
  const first = Math.floor(start / CHUNK_PLAIN_BYTES)
  const last = Math.floor(end / CHUNK_PLAIN_BYTES)
  const cipherStart = first * CHUNK_CIPHER_BYTES
  const cipherEnd = Math.min((last + 1) * CHUNK_CIPHER_BYTES, cipherBytes)
  return {
    first,
    cipherStart,
    cipherLength: cipherEnd - cipherStart,
    skip: start - first * CHUNK_PLAIN_BYTES,
    length: end - start + 1
  }
}

function nonceFor(fileId, index) {
  const nonce = b4a.alloc(NONCE_BYTES)
  nonce.set(b4a.from(fileId, 'hex'))
  const view = new DataView(nonce.buffer, nonce.byteOffset, NONCE_BYTES)
  view.setUint32(FILE_ID_BYTES, index % 0x100000000, true)
  view.setUint32(FILE_ID_BYTES + 4, Math.floor(index / 0x100000000), true)
  return nonce
}

const adChunk = (fileId, index, final) =>
  b4a.from(`pear-notes:file:v1|${fileId}|${index}|${final ? 1 : 0}`)

export function encryptChunk(key, fileId, index, final, plain) {
  const out = b4a.alloc(plain.byteLength + TAG_BYTES)
  sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    out,
    plain,
    adChunk(fileId, index, final),
    null,
    nonceFor(fileId, index),
    key
  )
  return out
}

export function decryptChunk(key, fileId, index, final, cipher) {
  if (cipher.byteLength < TAG_BYTES) throw new Error('SEALED_FILE_CORRUPT')
  const out = b4a.alloc(cipher.byteLength - TAG_BYTES)
  try {
    sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      out,
      null,
      cipher,
      adChunk(fileId, index, final),
      nonceFor(fileId, index),
      key
    )
  } catch {
    throw new Error('SEALED_FILE_CORRUPT')
  }
  return out
}

class ByteQueue {
  constructor() {
    this.parts = []
    this.length = 0
  }

  push(data) {
    if (!data.byteLength) return
    this.parts.push(data)
    this.length += data.byteLength
  }

  take(n) {
    const out = b4a.alloc(n)
    let filled = 0
    while (filled < n) {
      const part = this.parts[0]
      const used = Math.min(part.byteLength, n - filled)
      out.set(part.subarray(0, used), filled)
      filled += used
      if (used === part.byteLength) this.parts.shift()
      else this.parts[0] = part.subarray(used)
    }
    this.length -= n
    return out
  }
}

// The last chunk is held back until the end, since only then is it known to be final.
export function createEncryptStream(key, fileId) {
  const queue = new ByteQueue()
  let index = 0
  return new Transform({
    transform(data, cb) {
      queue.push(data)
      try {
        while (queue.length > CHUNK_PLAIN_BYTES) {
          this.push(encryptChunk(key, fileId, index++, false, queue.take(CHUNK_PLAIN_BYTES)))
        }
        cb(null)
      } catch (err) {
        cb(err)
      }
    },
    flush(cb) {
      try {
        this.push(encryptChunk(key, fileId, index, true, queue.take(queue.length)))
        cb(null)
      } catch (err) {
        cb(err)
      }
    }
  })
}

// Takes ciphertext from the start of chunk `first` and yields `length` plaintext bytes after `skip`.
export function createDecryptStream(
  key,
  fileId,
  { cipherBytes, first = 0, skip = 0, length = plainLength(cipherBytes) - skip }
) {
  const total = chunkCount(cipherBytes)
  const queue = new ByteQueue()
  let index = first
  let toSkip = skip
  let left = length

  function emit(stream, cipher) {
    let plain = decryptChunk(key, fileId, index, index === total - 1, cipher)
    index++
    if (toSkip) {
      const dropped = Math.min(toSkip, plain.byteLength)
      plain = plain.subarray(dropped)
      toSkip -= dropped
    }
    if (plain.byteLength > left) plain = plain.subarray(0, left)
    left -= plain.byteLength
    if (plain.byteLength) stream.push(plain)
  }

  return new Transform({
    transform(data, cb) {
      queue.push(data)
      try {
        while (left > 0 && queue.length >= CHUNK_CIPHER_BYTES) {
          emit(this, queue.take(CHUNK_CIPHER_BYTES))
        }
        cb(null)
      } catch (err) {
        cb(err)
      }
    },
    flush(cb) {
      try {
        if (queue.length && (left > 0 || index === first)) emit(this, queue.take(queue.length))
        cb(left > 0 ? new Error('SEALED_FILE_CORRUPT') : null)
      } catch (err) {
        cb(err)
      }
    }
  })
}

export function encryptBuffer(key, fileId, plain) {
  const chunks = []
  let index = 0
  let offset = 0
  do {
    const end = Math.min(offset + CHUNK_PLAIN_BYTES, plain.byteLength)
    chunks.push(
      encryptChunk(key, fileId, index++, end === plain.byteLength, plain.subarray(offset, end))
    )
    offset = end
  } while (offset < plain.byteLength)
  return b4a.concat(chunks)
}

export function decryptBuffer(key, fileId, cipher) {
  if (plainLength(cipher.byteLength) < 0) throw new Error('SEALED_FILE_CORRUPT')
  const total = chunkCount(cipher.byteLength)
  const chunks = []
  for (let index = 0; index < total; index++) {
    const start = index * CHUNK_CIPHER_BYTES
    const end = Math.min(start + CHUNK_CIPHER_BYTES, cipher.byteLength)
    chunks.push(decryptChunk(key, fileId, index, index === total - 1, cipher.subarray(start, end)))
  }
  return b4a.concat(chunks)
}
