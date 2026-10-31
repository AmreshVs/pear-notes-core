import b4a from 'b4a'

export const VECTOR_SEARCH_LIMIT = 50
const RECORD_HEADER_BYTES = 3

export function toQueryVector(buffer) {
  if (!buffer || buffer.byteLength === 0 || buffer.byteLength % 4 !== 0) return null
  // A fresh copy: pooled buffers can sit at an offset Float32Array rejects.
  return new Float32Array(new Uint8Array(buffer).buffer)
}

/**
 * Best chunk per note for a normalized float query, over `vectors` records
 * (a format byte, a uint16 count, then count × (float32 scale + int8 dims)).
 * Records whose size doesn't fit the query's dims are skipped.
 */
export function scoreNoteVectors(query, value) {
  const stride = 4 + query.length
  if (!value || value.byteLength < RECORD_HEADER_BYTES) return null
  const view = new DataView(value.buffer, value.byteOffset, value.byteLength)
  const count = view.getUint16(1, true)
  if (count === 0 || value.byteLength !== RECORD_HEADER_BYTES + count * stride) return null
  const values = new Int8Array(value.buffer, value.byteOffset, value.byteLength)
  let best = -Infinity
  let bestChunk = 0
  for (let c = 0; c < count; c++) {
    const at = RECORD_HEADER_BYTES + c * stride
    const scale = view.getFloat32(at, true)
    let dot = 0
    for (let d = 0; d < query.length; d++) dot += query[d] * values[at + 4 + d]
    dot *= scale
    if (dot > best) {
      best = dot
      bestChunk = c
    }
  }
  return { score: best, chunk: bestChunk }
}

/** @param {AsyncIterable<{ id: string, value: Uint8Array }>} entries */
export async function searchVectors(entries, query, { limit = VECTOR_SEARCH_LIMIT } = {}) {
  const results = []
  for await (const { id, value } of entries) {
    const hit = scoreNoteVectors(query, value)
    if (hit) results.push({ id, score: hit.score, chunk: hit.chunk })
  }
  results.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return results.slice(0, Math.max(1, limit))
}

export const RELATED_LIMIT = 10
export const DUPLICATE_LIMIT = 100
const YIELD_EVERY_MS = 12
const yieldToLoop = () => new Promise((resolve) => setTimeout(resolve, 0))

/** A record's chunks kept as int8 plus one scale each, copied out of the store buffer. */
export function parseNoteVectors(value) {
  if (!value || value.byteLength < RECORD_HEADER_BYTES) return null
  const view = new DataView(value.buffer, value.byteOffset, value.byteLength)
  const count = view.getUint16(1, true)
  if (count === 0) return null
  const stride = (value.byteLength - RECORD_HEADER_BYTES) / count
  if (!Number.isInteger(stride) || stride <= 4) return null
  const dims = stride - 4
  const source = new Int8Array(value.buffer, value.byteOffset, value.byteLength)
  const scales = new Float32Array(count)
  const values = new Int8Array(count * dims)
  for (let c = 0; c < count; c++) {
    const at = RECORD_HEADER_BYTES + c * stride
    scales[c] = view.getFloat32(at, true)
    values.set(source.subarray(at + 4, at + stride), c * dims)
  }
  return { dims, count, scales, values }
}

function chunkDot(a, i, b, j) {
  const dims = a.dims
  const x = i * dims
  const y = j * dims
  let sum = 0
  for (let d = 0; d < dims; d++) sum += a.values[x + d] * b.values[y + d]
  return sum * a.scales[i] * b.scales[j]
}

function centroid(note) {
  const out = new Float32Array(note.dims)
  for (let c = 0; c < note.count; c++) {
    const at = c * note.dims
    for (let d = 0; d < note.dims; d++) out[d] += note.values[at + d] * note.scales[c]
  }
  let norm = 0
  for (let d = 0; d < out.length; d++) norm += out[d] * out[d]
  norm = Math.sqrt(norm) || 1
  for (let d = 0; d < out.length; d++) out[d] /= norm
  return out
}

function floatDot(a, b) {
  let sum = 0
  for (let d = 0; d < a.length; d++) sum += a[d] * b[d]
  return sum
}

/** Mean over `a`'s chunks of each chunk's best match in `b`. */
function coverage(a, b) {
  let total = 0
  for (let i = 0; i < a.count; i++) {
    let best = -Infinity
    for (let j = 0; j < b.count; j++) best = Math.max(best, chunkDot(a, i, b, j))
    total += best
  }
  return total / a.count
}

/**
 * Notes nearest to one note: each other note scores its best chunk pair, and
 * `chunk` is that note's matching chunk.
 */
export async function relatedVectors(entries, id, source, { limit = RELATED_LIMIT } = {}) {
  const own = parseNoteVectors(source)
  if (!own) return []
  const results = []
  for await (const entry of entries) {
    if (entry.id === id) continue
    const other = parseNoteVectors(entry.value)
    if (!other || other.dims !== own.dims) continue
    let best = -Infinity
    let bestChunk = 0
    for (let j = 0; j < other.count; j++) {
      for (let i = 0; i < own.count; i++) {
        const score = chunkDot(own, i, other, j)
        if (score > best) {
          best = score
          bestChunk = j
        }
      }
    }
    results.push({ id: entry.id, score: best, chunk: bestChunk })
  }
  results.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return results.slice(0, Math.max(1, limit))
}

const WORD = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|[\p{L}\p{N}]+/gu
const SHINGLE = 3

export function shingles(text) {
  const words = (text || '').toLowerCase().normalize('NFKC').match(WORD) || []
  const out = new Set()
  for (let i = 0; i + SHINGLE <= words.length; i++) out.add(words.slice(i, i + SHINGLE).join(' '))
  if (out.size === 0 && words.length) out.add(words.join(' '))
  return out
}

/** Share of the smaller note's word 3-grams found in the other note. */
export function containment(a, b) {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a]
  if (small.size === 0) return 0
  let shared = 0
  for (const gram of small) if (large.has(gram)) shared++
  return shared / small.size
}

function shinglesCache(textOf) {
  const cache = new Map()
  return async (id) => {
    if (!cache.has(id)) {
      const text = await textOf(id)
      cache.set(id, text == null ? null : shingles(text))
    }
    return cache.get(id)
  }
}

/** Every note's vectors and centroid by id; a note without chunks has `count` 0. */
export async function loadNoteVectors(entries) {
  const notes = new Map()
  for await (const { id, version, value } of entries) {
    const parsed = parseNoteVectors(value)
    notes.set(
      id,
      parsed ? { id, version, ...parsed, centroid: centroid(parsed) } : { id, version, count: 0 }
    )
  }
  return notes
}

export function encodePairRecord(record) {
  return b4a.from(JSON.stringify(record))
}

export function decodePairRecord(value) {
  try {
    const record = JSON.parse(b4a.toString(value))
    return Array.isArray(record?.p) ? record : null
  } catch {
    return null
  }
}

/**
 * Brings the stored duplicate pairs up to date. Each note has one record,
 * versioned like its vectors, listing `[otherId, otherVersion, score]` for
 * the notes it covers: the lower of the two directions' mean best-chunk
 * match reaches `threshold` and, with `overlap`, the smaller note's word
 * 3-grams are that much contained in the other (notes made from one template
 * embed alike but aren't copies). A pair stays valid while the other note
 * keeps that version, so either side's record can carry it.
 *
 * Stale notes are checked newest first for up to `checkMs` (0 only reads).
 * A stale note is compared with every note except stale ones still waiting
 * their turn, which compare with it later, so a full pass is n²/2 and an
 * edit costs one pass over the vault.
 *
 * @param {Map<string, any>} notes from `loadNoteVectors`, or ids and versions alone when `checkMs` is 0
 * @param {Map<string, { version: number, value: Uint8Array }>} records the stored pair records
 */
export async function updateDuplicates(
  notes,
  records,
  { threshold, overlap = 0, margin = 0.1, textOf, checkMs = 0, now = Date.now }
) {
  const current = new Map()
  const stale = []
  for (const note of notes.values()) {
    const stored = records.get(note.id)
    const record = stored?.version === note.version ? decodePairRecord(stored.value) : null
    if (record && record.t === threshold && record.o === overlap) current.set(note.id, record)
    else stale.push(note)
  }
  const writes = [...records.keys()]
    .filter((id) => !notes.has(id))
    .map((id) => ({ id, version: 0, value: null }))
  stale.sort((a, b) => b.version - a.version || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const waiting = new Set(stale.map((note) => note.id))
  const wordsOf = overlap ? shinglesCache(textOf) : null
  const startedAt = now()
  let lastYield = startedAt
  let checked = 0
  for (const a of stale) {
    if (checkMs <= 0 || (checked > 0 && now() - startedAt >= checkMs)) break
    waiting.delete(a.id)
    const pairs = []
    for (const b of a.count ? notes.values() : []) {
      if (b === a || !b.count || waiting.has(b.id) || b.dims !== a.dims) continue
      if (floatDot(a.centroid, b.centroid) < threshold - margin) continue
      const score = Math.min(coverage(a, b), coverage(b, a))
      if (score < threshold) continue
      if (wordsOf) {
        const [wordsA, wordsB] = [await wordsOf(a.id), await wordsOf(b.id)]
        if (!wordsA || !wordsB || containment(wordsA, wordsB) < overlap) continue
      }
      pairs.push([b.id, b.version, score])
    }
    const record = { t: threshold, o: overlap, p: pairs }
    current.set(a.id, record)
    writes.push({ id: a.id, version: a.version, value: encodePairRecord(record) })
    checked++
    if (now() - lastYield > YIELD_EVERY_MS) {
      await yieldToLoop()
      lastYield = now()
    }
  }
  return { writes, current, checked, remaining: waiting.size }
}

/** Valid pairs from current records, best score per pair, strongest first. */
export function duplicatePairs(notes, current, { limit = DUPLICATE_LIMIT } = {}) {
  const best = new Map()
  for (const [id, record] of current) {
    for (const [other, version, score] of record.p) {
      if (notes.get(other)?.version !== version) continue
      const [a, b] = id < other ? [id, other] : [other, id]
      const key = `${a}\0${b}`
      if (!(best.get(key)?.score >= score)) best.set(key, { a, b, score })
    }
  }
  return [...best.values()]
    .sort((x, y) => y.score - x.score || (x.a < y.a ? -1 : x.a > y.a ? 1 : 0))
    .slice(0, Math.max(1, limit))
}
