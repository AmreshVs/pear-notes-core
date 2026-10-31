import test from 'brittle'

import { LOCAL_AI_ERROR } from '../store/services/localAiCatalog.js'
import {
  EMBEDDING_VECTOR_BYTES,
  embedDocuments,
  embedQuery,
  formatEmbeddingDocument,
  normalizeVector,
  packVector,
  scoreVector,
  unpackVector
} from '../store/services/localAiEmbedding.js'

const DIMS = 768

function fakeVector(seed) {
  const out = new Array(DIMS)
  for (let i = 0; i < DIMS; i++) out[i] = Math.sin(seed * 31 + i * 0.7) * (1 + (i % 5))
  return out
}

function cosine(a, b) {
  const x = normalizeVector(a)
  const y = normalizeVector(b)
  let dot = 0
  for (let i = 0; i < x.length; i++) dot += x[i] * y[i]
  return dot
}

test('packed vectors are 772 bytes and score close to float cosine', (t) => {
  const a = fakeVector(1)
  const b = fakeVector(2)
  const packed = packVector(b)
  t.is(packed.byteLength, EMBEDDING_VECTOR_BYTES)
  t.is(EMBEDDING_VECTOR_BYTES, 772)
  t.ok(Math.abs(scoreVector(normalizeVector(a), packed) - cosine(a, b)) < 0.01)
  t.ok(Math.abs(scoreVector(normalizeVector(b), packed) - 1) < 0.01)
  t.ok(Math.abs(cosine(unpackVector(packed), b) - 1) < 0.001)
})

test('packed vectors survive a copy at an odd offset', (t) => {
  const packed = packVector(fakeVector(3))
  const holder = new Uint8Array(packed.byteLength + 1)
  holder.set(packed, 1)
  const shifted = holder.subarray(1)
  const query = normalizeVector(fakeVector(3))
  t.ok(Math.abs(scoreVector(query, shifted) - scoreVector(query, packed)) < 1e-6)
})

test('embedDocuments batches, formats and reports progress', async (t) => {
  const calls = []
  const embed = async (texts) => {
    calls.push(texts)
    return texts.map((_, i) => fakeVector(i))
  }
  const progress = []
  const out = await embedDocuments({
    embed,
    texts: ['a', 'b', 'c', 'd', 'e'],
    title: (i) => (i === 0 ? 'Trip' : ''),
    textsPerCall: 2,
    onBatch: (done, total) => progress.push(`${done}/${total}`)
  })
  t.alike(
    calls.map((batch) => batch.length),
    [2, 2, 1]
  )
  t.is(calls[0][0], formatEmbeddingDocument('a', 'Trip'))
  t.is(calls[0][1], 'title: none | text: b')
  t.alike(
    out.map((item) => item.source),
    [0, 1, 2, 3, 4]
  )
  t.alike(progress, ['2/5', '4/5', '5/5'])
})

test('embedDocuments halves a text the model refuses as too long', async (t) => {
  const long = Array.from({ length: 200 }, (_, i) => `word${i}`).join(' ')
  const embed = async (texts) => {
    if (texts.some((text) => text.length > 700)) {
      throw Object.assign(new Error('x'), { code: LOCAL_AI_ERROR.INPUT_TOO_LONG })
    }
    return texts.map((_, i) => fakeVector(i))
  }
  const out = await embedDocuments({ embed, texts: ['short', long, 'tail'], textsPerCall: 3 })
  const pieces = out.filter((item) => item.source === 1)
  t.ok(pieces.length >= 2)
  t.is(out[0].source, 0)
  t.is(out.at(-1).source, 2)
  t.is(pieces.map((item) => item.text).join(' '), long)
})

test('embedDocuments rethrows other errors and stops on abort', async (t) => {
  await t.exception(
    embedDocuments({
      embed: async () => {
        throw new Error('boom')
      },
      texts: ['a']
    }),
    /boom/
  )
  const controller = new AbortController()
  let calls = 0
  const pending = embedDocuments({
    embed: async (texts) => {
      calls++
      controller.abort(new Error('paused'))
      return texts.map((_, i) => fakeVector(i))
    },
    texts: ['a', 'b', 'c'],
    textsPerCall: 1,
    signal: controller.signal
  })
  await t.exception(pending, /paused/)
  t.is(calls, 1)
})

test('embedQuery uses the query prompt and normalizes', async (t) => {
  let seen = null
  const vector = await embedQuery(async (texts) => {
    seen = texts
    return [fakeVector(9)]
  }, 'where did we eat')
  t.alike(seen, ['task: search result | query: where did we eat'])
  let sum = 0
  for (const value of vector) sum += value * value
  t.ok(Math.abs(sum - 1) < 1e-5)
})
