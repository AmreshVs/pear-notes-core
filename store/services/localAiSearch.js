import b4a from 'b4a'

import { formatEmbeddingQuery, normalizeVector } from './localAiEmbedding.js'
import { INDEX_NAMESPACE, decodeNoteChunks } from './localAiIndex.js'

export const RRF_K = 60
export const HYBRID_WEIGHTS = { substring: 0.5, vector: 1, recency: 0.2 }
/** Vector hits below this cosine only count when substring search also found the note. */
export const VECTOR_MIN_SCORE = 0.3
export const MEANING_SNIPPET_LENGTH = 140
/** Chunk-pair cosine; unrelated notes in the eval vault sit at 0.32–0.39. */
export const RELATED_MIN_SCORE = 0.45
export const RELATED_FETCH_LIMIT = 20
/** Both thresholds must pass: template-made notes embed alike but share little wording. */
export const DUPLICATE_MIN_SCORE = 0.85
export const DUPLICATE_MIN_OVERLAP = 0.6
export const DUPLICATES_DISMISSED_NAMESPACE = 'duplicates-dismissed'
/** One record per note: the notes it duplicates, kept current by the index job. */
export const DUPLICATE_PAIRS_NAMESPACE = 'duplicate-pairs'
/** Backend time per duplicate check call, so an abort waits at most about this long. */
export const DUPLICATE_CHECK_MS = 1000

/**
 * Reciprocal-rank fusion: each list adds weight / (k + rank) to its keys.
 * @param {{ keys: string[], weight?: number }[]} lists
 */
export function fuseRankings(lists, { k = RRF_K } = {}) {
  const scores = new Map()
  for (const { keys, weight = 1 } of lists) {
    keys.forEach((key, rank) => scores.set(key, (scores.get(key) || 0) + weight / (k + rank + 1)))
  }
  return [...scores]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([key, score]) => ({ key, score }))
}

/**
 * Substring hits + vector hits, with recency as a small tiebreaker among
 * notes one of the other two already found (recency alone never adds a note).
 *
 * @param {{ substringKeys?: string[], vectorHits?: { id: string, score: number }[], updatedAtOf?: (key: string) => number, weights?: typeof HYBRID_WEIGHTS, minVectorScore?: number }} options
 */
export function rankHybrid({
  substringKeys = [],
  vectorHits = [],
  updatedAtOf = () => 0,
  weights = HYBRID_WEIGHTS,
  minVectorScore = VECTOR_MIN_SCORE
}) {
  const substring = new Set(substringKeys)
  const vectorKeys = vectorHits
    .filter((hit) => hit.score >= minVectorScore || substring.has(hit.id))
    .map((hit) => hit.id)
  const candidates = [...new Set([...substringKeys, ...vectorKeys])]
  const byRecency = [...candidates].sort((a, b) => (updatedAtOf(b) || 0) - (updatedAtOf(a) || 0))
  return fuseRankings([
    { keys: substringKeys, weight: weights.substring },
    { keys: vectorKeys, weight: weights.vector },
    { keys: byRecency, weight: weights.recency }
  ])
}

export function encodeQueryVector(vector) {
  const normalized = normalizeVector(vector)
  return new Uint8Array(normalized.buffer, normalized.byteOffset, normalized.byteLength)
}

/** Embeds `query` on the host and brute-forces it against the vault's vectors in the backend. */
export async function searchVaultVectors({ api, embed, query, limit = 0 }) {
  const [vector] = await embed([formatEmbeddingQuery(query)])
  const response = await api.derivedSearch({
    namespace: INDEX_NAMESPACE.VECTORS,
    query: encodeQueryVector(vector),
    limit
  })
  if (!response?.ok) return null
  return response.results || []
}

export function toMeaningSnippet(text, length = MEANING_SNIPPET_LENGTH) {
  const flat = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  if (flat.length <= length) return flat
  const cut = flat.lastIndexOf(' ', length)
  return `${flat.slice(0, cut > length / 2 ? cut : length).trimEnd()}…`
}

/**
 * Notes whose best chunk scores at least `minScore` for `query`, best first,
 * each with that chunk's text as its snippet. null when the store can't answer.
 */
export async function findMeaningHits({
  api,
  embed,
  query,
  limit = 20,
  minScore = VECTOR_MIN_SCORE
}) {
  const hits = await searchVaultVectors({ api, embed, query, limit })
  if (!hits) return null
  return withChunkSnippets(
    api,
    hits.filter((hit) => hit.score >= minScore)
  )
}

async function withChunkSnippets(api, hits) {
  if (!hits.length) return []
  const response = await api.derivedGet({
    namespace: INDEX_NAMESPACE.CHUNKS,
    ids: hits.map((hit) => hit.id)
  })
  const chunksByKey = new Map(
    (response?.ok ? response.entries || [] : []).map((entry) => [
      entry.id,
      decodeNoteChunks(entry.value)
    ])
  )
  return hits.map((hit) => ({
    key: hit.id,
    score: hit.score,
    snippet: toMeaningSnippet(chunksByKey.get(hit.id)?.[hit.chunk]?.text)
  }))
}

/**
 * Notes whose best chunk pair with this note's chunks reaches `minScore`,
 * from stored vectors only (no model). The snippet is the matching chunk.
 */
export async function findRelatedNotes({
  api,
  noteKey,
  limit = RELATED_FETCH_LIMIT,
  minScore = RELATED_MIN_SCORE
}) {
  const response = await api.derivedRelated({
    namespace: INDEX_NAMESPACE.VECTORS,
    id: noteKey,
    limit
  })
  if (!response?.ok) return null
  return withChunkSnippets(
    api,
    (response.results || []).filter((hit) => hit.score >= minScore)
  )
}

export const duplicatePairId = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`)

const duplicatesRequest = ({ threshold, overlap }) => ({
  namespace: INDEX_NAMESPACE.VECTORS,
  textNamespace: INDEX_NAMESPACE.CHUNKS,
  pairNamespace: DUPLICATE_PAIRS_NAMESPACE,
  threshold,
  overlap
})

// "Not a duplicate" syncs to every device; older builds kept it in this device's derived store.
const NOT_DUPLICATE_PREFIX = 'notdup/'

async function loadNotDuplicateIds(api) {
  const [synced, local] = await Promise.all([
    api.getSyncedPrefs ? api.getSyncedPrefs(NOT_DUPLICATE_PREFIX).catch(() => ({})) : {},
    api.derivedVersions({ namespace: DUPLICATES_DISMISSED_NAMESPACE })
  ])
  const ids = new Set(Object.keys(synced).map((id) => id.slice(NOT_DUPLICATE_PREFIX.length)))
  for (const entry of local?.ok ? local.entries || [] : []) {
    if (ids.has(entry.id)) continue
    ids.add(entry.id)
    api.setSyncedPref?.(NOT_DUPLICATE_PREFIX + entry.id, { at: Date.now() })?.catch?.(() => {})
  }
  return ids
}

/** Stored possible duplicates, minus pairs marked "not a duplicate" on any device. Reads only. */
export async function findDuplicatePairs({
  api,
  threshold = DUPLICATE_MIN_SCORE,
  overlap = DUPLICATE_MIN_OVERLAP
}) {
  const [response, skip] = await Promise.all([
    api.derivedDuplicates({ ...duplicatesRequest({ threshold, overlap }), checkMs: 0 }),
    loadNotDuplicateIds(api)
  ])
  if (!response?.ok) return null
  return (response.pairs || [])
    .filter((pair) => !skip.has(duplicatePairId(pair.a, pair.b)))
    .map(({ a, b, score }) => ({ a, b, score }))
}

/**
 * Checks every note whose duplicate record is stale, one bounded backend
 * call at a time, with `checkpoint` (which throws to stop) between calls.
 * Returns how many notes were checked, or null when the store is unavailable.
 */
export async function updateDuplicatePairs({
  api,
  checkpoint = () => {},
  checkMs = DUPLICATE_CHECK_MS,
  threshold = DUPLICATE_MIN_SCORE,
  overlap = DUPLICATE_MIN_OVERLAP
}) {
  let checked = 0
  while (true) {
    checkpoint()
    const response = await api.derivedDuplicates({
      ...duplicatesRequest({ threshold, overlap }),
      checkMs,
      limit: 1
    })
    if (!response?.ok) return null
    checked += response.checked || 0
    if (!response.remaining || !response.checked) return checked
  }
}

export async function dismissDuplicatePair({ api, a, b }) {
  if (api.setSyncedPref) {
    return api.setSyncedPref(NOT_DUPLICATE_PREFIX + duplicatePairId(a, b), { at: Date.now() })
  }
  const response = await api.derivedPut({
    namespace: DUPLICATES_DISMISSED_NAMESPACE,
    entries: [{ id: duplicatePairId(a, b), version: 1, value: b4a.from('1') }]
  })
  return !!response?.ok
}
