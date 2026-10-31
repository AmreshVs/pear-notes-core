import test from 'brittle'
import b4a from 'b4a'
import http from 'bare-http1'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'
import Corestore from 'corestore'
import Hyperblobs from 'hyperblobs'
import { Readable, pipelinePromise, Writable } from 'streamx'
import {
  CHUNK_CIPHER_BYTES,
  CHUNK_PLAIN_BYTES,
  chunkRange,
  cipherLength,
  createDecryptStream,
  createEncryptStream,
  createFileKey,
  decryptBuffer,
  encryptBuffer,
  plainLength
} from '../backend/fileCrypto.js'
import { createKeyring, parseEnvelope, sealBody } from '../backend/lockCrypto.js'
import {
  blobIdOf,
  closeLockSession,
  fileKeyFor,
  holdFileKey,
  openNoteBody,
  openWithRootKey,
  sealNoteBody
} from '../backend/lockSession.js'
import { envelopeFiles, relinkEnvelope } from '../backend/sealedEnvelope.js'
import { GuardedBlobServer } from '../backend/vault/media.js'
import { HYPERDRIVE_URL_PREFIX } from '../constant.js'

const FAST = { params: { ops: 1, mem: 8 * 1024 * 1024 } }
const SECRET = 'c'.repeat(32)

function bytes(length, seed = 1) {
  const out = b4a.alloc(length)
  for (let i = 0; i < length; i++) out[i] = (i * 31 + seed) & 0xff
  return out
}

async function collect(stream) {
  const chunks = []
  await pipelinePromise(
    stream,
    new Writable({
      write(data, cb) {
        chunks.push(data)
        cb(null)
      }
    })
  )
  return b4a.concat(chunks)
}

const streamOf = (buffer, piece = 10000) =>
  Readable.from(
    Array.from({ length: Math.ceil(buffer.byteLength / piece) }, (_, i) =>
      buffer.subarray(i * piece, (i + 1) * piece)
    )
  )

test('file crypto - lengths at chunk edges', (t) => {
  for (const plain of [
    0,
    1,
    CHUNK_PLAIN_BYTES - 1,
    CHUNK_PLAIN_BYTES,
    CHUNK_PLAIN_BYTES + 1,
    3 * CHUNK_PLAIN_BYTES
  ]) {
    t.is(plainLength(cipherLength(plain)), plain, `plain ${plain} round-trips its length`)
  }
  t.is(cipherLength(0), 16, 'an empty file is one 16 B chunk')
  t.is(cipherLength(CHUNK_PLAIN_BYTES), CHUNK_CIPHER_BYTES, 'a full chunk is one block')
  t.is(plainLength(15), -1, 'shorter than a tag is invalid')
  t.is(plainLength(CHUNK_CIPHER_BYTES + 8), -1, 'a final chunk shorter than a tag is invalid')
})

test('file crypto - buffer and stream round trip, same bytes', async (t) => {
  const { key, id } = createFileKey()
  t.ok(key.secure, 'file key lives in sodium_malloc memory')
  for (const length of [
    0,
    5,
    CHUNK_PLAIN_BYTES,
    CHUNK_PLAIN_BYTES + 1,
    2 * CHUNK_PLAIN_BYTES + 7
  ]) {
    const plain = bytes(length)
    const sealed = encryptBuffer(key, id, plain)
    t.is(sealed.byteLength, cipherLength(length), `${length}: sealed length`)
    const streamed = await collect(streamOf(plain).pipe(createEncryptStream(key, id)))
    t.is(streamed.byteLength, sealed.byteLength, `${length}: stream makes the same chunks`)
    t.alike(decryptBuffer(key, id, streamed), plain, `${length}: stream output decrypts`)
    const opened = await collect(
      streamOf(sealed, 7777).pipe(createDecryptStream(key, id, { cipherBytes: sealed.byteLength }))
    )
    t.alike(opened, plain, `${length}: decrypt stream round trip`)
  }
})

test('file crypto - ranges decrypt only the chunks they touch', async (t) => {
  const { key, id } = createFileKey()
  const plain = bytes(3 * CHUNK_PLAIN_BYTES + 100)
  const sealed = encryptBuffer(key, id, plain)
  const cases = [
    [0, 0],
    [plain.byteLength - 1, plain.byteLength - 1],
    [CHUNK_PLAIN_BYTES - 1, CHUNK_PLAIN_BYTES],
    [CHUNK_PLAIN_BYTES - 10, 2 * CHUNK_PLAIN_BYTES + 10],
    [2 * CHUNK_PLAIN_BYTES, plain.byteLength - 1]
  ]
  for (const [start, end] of cases) {
    const range = chunkRange(start, end, sealed.byteLength)
    const slice = sealed.subarray(range.cipherStart, range.cipherStart + range.cipherLength)
    const out = await collect(
      Readable.from([slice]).pipe(
        createDecryptStream(key, id, { cipherBytes: sealed.byteLength, ...range })
      )
    )
    t.alike(out, plain.subarray(start, end + 1), `bytes ${start}-${end}`)
  }
  t.is(
    chunkRange(0, 0, sealed.byteLength).cipherLength,
    CHUNK_CIPHER_BYTES,
    'first byte reads one chunk'
  )
})

test('file crypto - tampered, moved, reordered and truncated chunks fail', (t) => {
  const { key, id } = createFileKey()
  const other = createFileKey()
  const plain = bytes(2 * CHUNK_PLAIN_BYTES + 50)
  const sealed = encryptBuffer(key, id, plain)

  const tampered = b4a.from(sealed)
  tampered[CHUNK_CIPHER_BYTES + 3] ^= 1
  t.exception(() => decryptBuffer(key, id, tampered), /SEALED_FILE_CORRUPT/, 'flipped byte')

  const foreign = encryptBuffer(other.key, other.id, bytes(plain.byteLength, 9))
  const mixed = b4a.concat([
    sealed.subarray(0, CHUNK_CIPHER_BYTES),
    foreign.subarray(CHUNK_CIPHER_BYTES)
  ])
  t.exception(() => decryptBuffer(key, id, mixed), /SEALED_FILE_CORRUPT/, 'chunk from another file')

  const sameKey = encryptBuffer(key, other.id, plain)
  const spliced = b4a.concat([
    sameKey.subarray(0, CHUNK_CIPHER_BYTES),
    sealed.subarray(CHUNK_CIPHER_BYTES)
  ])
  t.exception(
    () => decryptBuffer(key, id, spliced),
    /SEALED_FILE_CORRUPT/,
    'other file id, same key'
  )

  const swapped = b4a.concat([
    sealed.subarray(CHUNK_CIPHER_BYTES, 2 * CHUNK_CIPHER_BYTES),
    sealed.subarray(0, CHUNK_CIPHER_BYTES),
    sealed.subarray(2 * CHUNK_CIPHER_BYTES)
  ])
  t.exception(() => decryptBuffer(key, id, swapped), /SEALED_FILE_CORRUPT/, 'reordered chunks')

  const cut = sealed.subarray(0, 2 * CHUNK_CIPHER_BYTES)
  t.exception(() => decryptBuffer(key, id, cut), /SEALED_FILE_CORRUPT/, 'dropped final chunk')

  t.exception(() => decryptBuffer(other.key, id, sealed), /SEALED_FILE_CORRUPT/, 'wrong key')
})

test('file crypto - decrypt stream errors on a tampered chunk', async (t) => {
  const { key, id } = createFileKey()
  const sealed = encryptBuffer(key, id, bytes(CHUNK_PLAIN_BYTES + 20))
  sealed[sealed.byteLength - 1] ^= 1
  await t.exception(
    collect(
      Readable.from([sealed]).pipe(createDecryptStream(key, id, { cipherBytes: sealed.byteLength }))
    ),
    /SEALED_FILE_CORRUPT/
  )
})

function mediaLink(server, core, blob) {
  return server
    .getLink(core.key, { blob })
    .replace(/^http:\/\/[^/]+\/[0-9a-f]{32}\//, HYPERDRIVE_URL_PREFIX + '/')
}

async function blobStore(t) {
  const dir = path.join(tmpdir(), 'pear-notes-file-crypto-' + Math.random().toString(36).slice(2))
  const store = new Corestore(dir)
  const core = store.get({ name: 'blobs' })
  await core.ready()
  t.teardown(async () => {
    await core.close().catch(() => {})
    await store.close().catch(() => {})
    fs.rmSync(dir, { recursive: true, force: true })
  })
  return { store, core, blobs: new Hyperblobs(core) }
}

const img = (link) => `<img src="${link.replace(/&/g, '&amp;')}">`

test('file crypto - envelope f carries held keys through re-seal and relink', async (t) => {
  t.teardown(closeLockSession)
  const { entry, rootKey } = await createKeyring('pw-123456789', FAST)
  const roots = new Map([[entry.id, rootKey]])
  const { store, core, blobs } = await blobStore(t)
  const server = new GuardedBlobServer(store.session(), { port: 0, secret: SECRET })
  const file = createFileKey()
  const link = mediaLink(server, core, await blobs.put(encryptBuffer(file.key, file.id, bytes(10))))
  const plainLink = mediaLink(server, core, await blobs.put(bytes(10)))
  const html = img(link) + img(plainLink)

  closeLockSession()
  t.is(holdFileKey(link, file.key, file.id), false, 'nothing is held while closed')
  openWithRootKey([entry], rootKey)
  t.ok(holdFileKey(link, file.key, file.id), 'key held while the session is open')
  const first = sealNoteBody(entry.id, 'n', html, { previous: '', links: [link, plainLink] })
  const f = envelopeFiles(first)
  t.alike(Object.keys(f), [link], 'only the sealed file gets an f entry')
  t.is(f[link].id, file.id, 'f records the file id')
  t.absent(first.includes(b4a.toString(file.key, 'hex')), 'FK is not in the envelope as hex')
  t.absent(first.includes(b4a.toString(file.key, 'base64')), 'nor as base64')

  closeLockSession()
  t.is(fileKeyFor(blobIdOf(link)), null, 'closing drops the file keys')
  openWithRootKey([entry], rootKey)
  t.is(fileKeyFor(blobIdOf(link)), null, 'opening the session alone maps nothing')
  t.is(openNoteBody('n', first), html, 'body opens')
  const opened = fileKeyFor(blobIdOf(link))
  t.is(opened?.id, file.id, 'opening the note maps its file')
  t.alike(b4a.from(opened.key), b4a.from(file.key), 'with the same key')

  const again = sealBody(roots, entry.id, 'n', html, { previous: first, links: [link, plainLink] })
  t.alike(envelopeFiles(again), f, 'a re-seal keeps f from the previous envelope')
  const dropped = sealBody(roots, entry.id, 'n', img(plainLink), {
    previous: first,
    links: [plainLink]
  })
  t.absent(parseEnvelope(dropped).f, 'a removed file loses its entry')

  const other = await createKeyring('other-123456789', FAST)
  t.exception(
    () =>
      sealBody(new Map([[other.entry.id, other.rootKey]]), other.entry.id, 'n', html, {
        previous: first,
        links: [link]
      }),
    /previous content key/,
    'f is never dropped for want of the content key'
  )

  const moved = link.replace(/blob=[^&]+/, 'blob=moved')
  const relinked = relinkEnvelope(first, { [link]: moved })
  t.alike(Object.keys(envelopeFiles(relinked)), [moved], 'relink moves the f key')
  t.is(envelopeFiles(relinked)[moved].id, file.id, 'with its entry')
})

function get(port, requestPath, range = null) {
  return new Promise((resolve, reject) => {
    const headers = range ? { range } : {}
    const req = http.request(
      { host: '127.0.0.1', port, path: requestPath, method: 'GET', headers },
      (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () =>
          resolve({ status: res.statusCode, headers: res.headers, body: b4a.concat(chunks) })
        )
        res.on('error', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: b4a.concat(chunks),
            broken: true
          })
        )
        res.on('close', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: b4a.concat(chunks),
            broken: true
          })
        )
      }
    )
    req.on('error', (err) => resolve({ status: 0, error: err, broken: true }))
    req.end()
  })
}

async function sealedServer(t, plain) {
  const { store, core, blobs } = await blobStore(t)
  const file = createFileKey()
  const sealed = await blobs.put(encryptBuffer(file.key, file.id, plain))
  const plainBlob = await blobs.put(b4a.from('plain bytes'))
  const tampered = encryptBuffer(file.key, file.id, plain)
  tampered[tampered.byteLength - 1] ^= 1
  const tamperedBlob = await blobs.put(tampered)
  const state = { open: true, keys: new Map() }
  const server = new GuardedBlobServer(store.session(), {
    port: 0,
    secret: SECRET,
    sealedFile: async (blobId) => {
      if (!state.keys.has(blobId)) return null
      return state.open ? state.keys.get(blobId) : false
    }
  })
  await server.listen()
  t.teardown(() => server.close().catch(() => {}))
  const idOf = (blob) => `${b4a.toString(core.key, 'hex')}:${blob.blockOffset}:${blob.blockLength}`
  state.keys.set(idOf(sealed), file)
  state.keys.set(idOf(tamperedBlob), file)
  const pathOf = (blob) => {
    const url = new URL(server.getLink(core.key, { blob }))
    return url.pathname + url.search
  }
  return {
    server,
    state,
    sealed: pathOf(sealed),
    plain: pathOf(plainBlob),
    tampered: pathOf(tamperedBlob)
  }
}

test('file crypto - blob server serves plaintext ranges of a sealed file', async (t) => {
  const plain = bytes(2 * CHUNK_PLAIN_BYTES + 1000)
  const size = plain.byteLength
  const { server, state, sealed, plain: plainPath } = await sealedServer(t, plain)
  const port = server.port

  const whole = await get(port, sealed)
  t.is(whole.status, 200)
  t.is(whole.headers['content-length'], String(size), 'plaintext length')
  t.alike(whole.body, plain, 'whole file decrypts')

  const ranges = [
    ['bytes=0-0', 0, 0],
    [`bytes=${size - 1}-${size - 1}`, size - 1, size - 1],
    [
      `bytes=${CHUNK_PLAIN_BYTES - 2}-${CHUNK_PLAIN_BYTES + 1}`,
      CHUNK_PLAIN_BYTES - 2,
      CHUNK_PLAIN_BYTES + 1
    ],
    [`bytes=${CHUNK_PLAIN_BYTES}-`, CHUNK_PLAIN_BYTES, size - 1],
    [`bytes=100-${size + 5000}`, 100, size - 1]
  ]
  for (const [header, start, end] of ranges) {
    const res = await get(port, sealed, header)
    t.is(res.status, 206, `${header}: partial`)
    t.is(
      res.headers['content-range'],
      `bytes ${start}-${end}/${size}`,
      `${header}: plaintext range`
    )
    t.is(res.headers['content-length'], String(end - start + 1), `${header}: length`)
    t.alike(res.body, plain.subarray(start, end + 1), `${header}: bytes`)
  }

  const past = await get(port, sealed, `bytes=${size}-`)
  t.is(past.status, 416, 'a range past the end')
  t.is(past.headers['content-range'], `bytes */${size}`, 'reports the plaintext size')

  const other = await get(port, plainPath)
  t.is(other.status, 200, 'a plain blob is served as stored')
  t.alike(other.body, b4a.from('plain bytes'))

  state.open = false
  t.is((await get(port, sealed)).status, 404, 'a sealed blob answers 404 while closed')
  t.is((await get(port, plainPath)).status, 200, 'plain blobs still serve while closed')
})

test('file crypto - blob server cuts a tampered sealed file short', async (t) => {
  const plain = bytes(CHUNK_PLAIN_BYTES + 10)
  const { server, tampered } = await sealedServer(t, plain)
  const res = await get(server.port, tampered)
  t.ok(res.broken, 'the response is broken off')
  t.ok((res.body?.byteLength || 0) < plain.byteLength, 'the tampered chunk is never served')
  const first = await get(server.port, tampered, 'bytes=0-9')
  t.alike(first.body, plain.subarray(0, 10), 'untouched chunks still read')
})

test('file crypto - blob server serves an empty sealed file', async (t) => {
  const { server, sealed } = await sealedServer(t, b4a.alloc(0))
  const res = await get(server.port, sealed)
  t.is(res.status, 200)
  t.is(res.headers['content-length'], '0', 'empty plaintext')
  t.is(res.body.byteLength, 0)
})
