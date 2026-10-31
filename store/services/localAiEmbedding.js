import { LOCAL_AI_ERROR } from './localAiCatalog.js'
import { estimateTokens } from './localAiNoteText.js'
import { LOCAL_AI_EMBEDDING_MODEL } from './localAiTiers.js'

export const EMBEDDING_VECTOR_BYTES = 4 + LOCAL_AI_EMBEDDING_MODEL.dims
const MIN_SPLIT_TOKENS = 16

/** EmbeddingGemma's document prompt. */
export const formatEmbeddingDocument = (text, title = '') =>
  `title: ${String(title ?? '').trim() || 'none'} | text: ${String(text ?? '')}`

/** EmbeddingGemma's retrieval query prompt. */
export const formatEmbeddingQuery = (query) => `task: search result | query: ${String(query ?? '')}`

export const isEmbeddingOverflow = (error) =>
  error?.code === LOCAL_AI_ERROR.INPUT_TOO_LONG ||
  /(batch|context) overflow/i.test(String(error?.message ?? ''))

export function normalizeVector(vector) {
  let sum = 0
  for (let i = 0; i < vector.length; i++) sum += vector[i] * vector[i]
  const norm = Math.sqrt(sum) || 1
  return Float32Array.from(vector, (value) => value / norm)
}

/**
 * Packs a vector as one little-endian float32 scale then one int8 per dim,
 * after normalizing, so `scoreVector` is a cosine.
 */
export function packVector(vector) {
  const unit = normalizeVector(vector)
  let max = 0
  for (const value of unit) max = Math.max(max, Math.abs(value))
  const scale = max / 127 || 1
  const out = new Uint8Array(4 + unit.length)
  new DataView(out.buffer).setFloat32(0, scale, true)
  const values = new Int8Array(out.buffer, 4)
  for (let i = 0; i < unit.length; i++) values[i] = Math.round(unit[i] / scale)
  return out
}

export function unpackVector(packed) {
  const view = new DataView(packed.buffer, packed.byteOffset, packed.byteLength)
  const values = new Int8Array(packed.buffer, packed.byteOffset + 4, packed.byteLength - 4)
  return Float32Array.from(values, (value) => value * view.getFloat32(0, true))
}

/** Cosine between a normalized query and a packed vector. */
export function scoreVector(query, packed) {
  const scale = new DataView(packed.buffer, packed.byteOffset, 4).getFloat32(0, true)
  const values = new Int8Array(packed.buffer, packed.byteOffset + 4, packed.byteLength - 4)
  let dot = 0
  for (let i = 0; i < values.length; i++) dot += query[i] * values[i]
  return dot * scale
}

function splitInHalf(text) {
  const middle = Math.floor(text.length / 2)
  const before = text.lastIndexOf('\n', middle)
  const space = text.lastIndexOf(' ', middle)
  const cut = before > middle / 2 ? before : space > middle / 2 ? space : middle
  return [text.slice(0, cut).trim(), text.slice(cut).trim()].filter(Boolean)
}

const abortedError = (signal) =>
  signal.reason ?? Object.assign(new Error('aborted'), { name: 'AbortError' })

/**
 * Embeds document texts through a host's `embed(texts)`, `textsPerCall` at a
 * time, stopping at `signal` between calls. A text the model refuses as too
 * long is halved until it fits, so one input can yield several pieces:
 * `source` is its index in `texts`.
 *
 * @param {{ embed: (texts: string[]) => Promise<ArrayLike<number>[]>, texts: string[], title?: (index: number) => string, signal?: AbortSignal, textsPerCall?: number, onBatch?: (done: number, total: number) => void }} options
 * @returns {Promise<{ source: number, text: string, vector: Uint8Array }[]>}
 */
export async function embedDocuments({
  embed,
  texts,
  title = () => '',
  signal,
  textsPerCall = LOCAL_AI_EMBEDDING_MODEL.textsPerCall,
  onBatch
}) {
  const out = []
  const run = async (items) => {
    if (signal?.aborted) throw abortedError(signal)
    try {
      const vectors = await embed(
        items.map((item) => formatEmbeddingDocument(item.text, title(item.source)))
      )
      if (vectors?.length !== items.length) throw new Error('embedding count mismatch')
      items.forEach((item, i) => out.push({ ...item, vector: packVector(vectors[i]) }))
    } catch (error) {
      if (!isEmbeddingOverflow(error) || signal?.aborted) throw error
      if (items.length > 1) {
        for (const item of items) await run([item])
        return
      }
      const [item] = items
      const halves = estimateTokens(item.text) > MIN_SPLIT_TOKENS ? splitInHalf(item.text) : []
      if (halves.length < 2) throw error
      for (const half of halves) await run([{ source: item.source, text: half }])
    }
  }
  const items = texts.map((text, source) => ({ source, text: String(text ?? '') }))
  for (let start = 0; start < items.length; start += textsPerCall) {
    await run(items.slice(start, start + textsPerCall))
    onBatch?.(Math.min(start + textsPerCall, items.length), items.length)
  }
  return out
}

/** Embeds one search query into a normalized vector for `scoreVector`. */
export async function embedQuery(embed, query) {
  const [vector] = await embed([formatEmbeddingQuery(query)])
  return normalizeVector(vector)
}
