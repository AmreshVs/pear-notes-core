import b4a from 'b4a'

import { RECENTLY_DELETED_KEY } from '../../constant.js'
import { LOCAL_AI_ERROR } from './localAiCatalog.js'
import { EMBEDDING_VECTOR_BYTES, embedDocuments } from './localAiEmbedding.js'
import { chunkNote } from './localAiNoteText.js'
import { LOCAL_AI_EMBEDDING_MODEL } from './localAiTiers.js'

export const INDEX_FORMAT = 2
export const INDEX_NAMESPACE = { VECTORS: 'vectors', CHUNKS: 'chunks', META: 'index-meta' }
export const INDEX_META_ID = 'format'
export const INDEX_JOB_KEY = 'vault-index'
/** On battery, a first index takes this many of the newest notes; the rest wait for charging. */
export const INDEX_BATTERY_NEW_NOTES = 50
const INDEX_FORMAT_ID = `${INDEX_FORMAT}:${LOCAL_AI_EMBEDDING_MODEL.model}:${LOCAL_AI_EMBEDDING_MODEL.dims}`
const GROUP_MAX_NOTES = 16
const HEADER_BYTES = 3

const P_CLOSE = '<' + '/p>'
const escapeText = (text) =>
  String(text).replace(/&/g, '&amp;').replace(/[<]/g, '&lt;').replace(/>/g, '&gt;')

/** Text read from a note's attachments, as paragraphs the chunker indexes with the note. */
const attachmentHtml = (text) =>
  String(text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeText(line)}${P_CLOSE}`)
    .join('')

export const indexVersion = (value) =>
  Math.max(0, Math.floor(value?.updatedAt || value?.addedAt || 0))

/** Locked and trashed notes stay out of the index: vectors reveal what a note says. */
export const isIndexable = (value) =>
  !!value && value.locked !== true && value.folderKey !== RECENTLY_DELETED_KEY && !value.deletedAt

/**
 * Diffs the vault's notes against the stored vector versions. Stale notes come
 * newest first, so a paused first index has covered recent notes. A key whose
 * data has not loaded yet is left alone: only a key that left the list, or a
 * note that is now locked or trashed, loses its vectors.
 *
 * `newNoteLimit` keeps a backlog for later (phones on battery): edited notes
 * and notes newer than everything indexed are upkeep and stay in `stale`, but
 * a first index takes only that many of the newest notes, and older notes
 * never indexed (a sync from another device) go to `deferred`.
 *
 * @param {{ key: string, value?: any }[]} notes every key in the vault's list
 * @param {Map<string, number>} versions
 * @param {{ newNoteLimit?: number }} [options]
 */
export function planIndex(notes, versions, { newNoteLimit = Infinity } = {}) {
  const live = new Map()
  const unknown = new Set()
  for (const { key, value } of notes) {
    if (!key) continue
    if (!value) unknown.add(key)
    else if (isIndexable(value)) live.set(key, indexVersion(value))
  }
  let newest = -1
  for (const version of versions.values()) newest = Math.max(newest, version)
  let allowance = versions.size === 0 || newNoteLimit === Infinity ? newNoteLimit : 0
  const stale = []
  const deferred = []
  const changed = [...live]
    .filter(([key, version]) => versions.get(key) !== version)
    .sort((a, b) => b[1] - a[1])
  for (const [key, version] of changed) {
    if (versions.has(key) || (newest >= 0 && version > newest) || allowance-- > 0) stale.push(key)
    else deferred.push(key)
  }
  const removed = [...versions.keys()].filter((key) => !live.has(key) && !unknown.has(key))
  return { stale, deferred, removed, total: live.size }
}

/** One record per note: a format byte, a uint16 count, then `count` packed vectors. */
export function encodeNoteVectors(vectors) {
  const out = new Uint8Array(HEADER_BYTES + vectors.length * EMBEDDING_VECTOR_BYTES)
  out[0] = INDEX_FORMAT
  new DataView(out.buffer).setUint16(1, vectors.length, true)
  vectors.forEach((vector, i) => out.set(vector, HEADER_BYTES + i * EMBEDDING_VECTOR_BYTES))
  return out
}

export function decodeNoteVectors(value) {
  if (!value || value.byteLength < HEADER_BYTES || value[0] !== INDEX_FORMAT) return null
  const count = new DataView(value.buffer, value.byteOffset, value.byteLength).getUint16(1, true)
  if (value.byteLength !== HEADER_BYTES + count * EMBEDDING_VECTOR_BYTES) return null
  return Array.from({ length: count }, (_, i) =>
    value.subarray(
      HEADER_BYTES + i * EMBEDDING_VECTOR_BYTES,
      HEADER_BYTES + (i + 1) * EMBEDDING_VECTOR_BYTES
    )
  )
}

/** The chunk texts, in vector order, for showing and citing a hit. */
export const encodeNoteChunks = (chunks) =>
  b4a.from(JSON.stringify(chunks.map(({ heading, text }) => [heading, text])))

export function decodeNoteChunks(value) {
  try {
    const parsed = JSON.parse(b4a.toString(value))
    return Array.isArray(parsed) ? parsed.map(([heading, text]) => ({ heading, text })) : null
  } catch {
    return null
  }
}

const indexError = (code, message = code) => Object.assign(new Error(message), { code })

const assertOk = (response, what) => {
  if (!response?.ok) throw indexError('DERIVED_UNAVAILABLE', `derived store unavailable (${what})`)
  return response
}

async function ensureFormat(api) {
  const { entries } = assertOk(
    await api.derivedGet({ namespace: INDEX_NAMESPACE.META, ids: [INDEX_META_ID] }),
    'meta'
  )
  const stored = entries[0]?.value ? b4a.toString(entries[0].value) : null
  if (stored === INDEX_FORMAT_ID) return false
  assertOk(await api.derivedClear({ namespace: INDEX_NAMESPACE.VECTORS }), 'clear')
  assertOk(await api.derivedClear({ namespace: INDEX_NAMESPACE.CHUNKS }), 'clear')
  assertOk(
    await api.derivedPut({
      namespace: INDEX_NAMESPACE.META,
      entries: [{ id: INDEX_META_ID, version: INDEX_FORMAT, value: b4a.from(INDEX_FORMAT_ID) }]
    }),
    'meta'
  )
  return true
}

/**
 * Brings the vault's semantic index up to date: drops vectors of notes that
 * are gone, locked or trashed, and embeds every note whose `updatedAt`
 * differs from its stored version. Notes are embedded in groups and each
 * group is written before the next starts, so an abort loses at most one
 * group and the next run resumes from the stored versions.
 *
 * `isCurrent` must turn false once the vault changes: the derived store is
 * per vault, and a write after a switch would land in the wrong one.
 *
 * @param {{ api: { derivedGet: Function, derivedPut: Function, derivedVersions: Function, derivedClear: Function, getSingleNote: Function }, embed: (texts: string[]) => Promise<ArrayLike<number>[]>, notes: { key: string, value: any }[], signal: AbortSignal, progress?: (done: number, total: number) => void, isCurrent?: () => boolean, textsPerCall?: number, newNoteLimit?: number, now?: () => number }} options
 */
export async function runVaultIndex({
  api,
  embed,
  notes,
  signal,
  progress = () => {},
  isCurrent = () => true,
  textsPerCall = LOCAL_AI_EMBEDDING_MODEL.textsPerCall,
  newNoteLimit = Infinity,
  now = Date.now,
  attachmentText = null
}) {
  const startedAt = now()
  const stats = {
    notes: 0,
    chunks: 0,
    removed: 0,
    skipped: 0,
    embedMs: 0,
    firstEmbedMs: 0,
    firstChunks: 0,
    rebuilt: false
  }
  const checkpoint = () => {
    if (signal.aborted) throw signal.reason ?? indexError('aborted')
    if (!isCurrent()) throw indexError('VAULT_CHANGED', 'vault changed during indexing')
  }

  stats.rebuilt = await ensureFormat(api)
  checkpoint()
  const { entries } = assertOk(
    await api.derivedVersions({ namespace: INDEX_NAMESPACE.VECTORS }),
    'versions'
  )
  const plan = planIndex(notes, new Map(entries.map(({ id, version }) => [id, version])), {
    newNoteLimit
  })
  stats.pending = plan.stale.length
  stats.deferred = plan.deferred.length
  stats.total = plan.total

  // Chunks go first: a vectors record is what the plan sees, so an orphan chunk would never be found.
  const drop = async (ids) => {
    checkpoint()
    const gone = ids.map((id) => ({ id, version: 0, value: null }))
    assertOk(await api.derivedPut({ namespace: INDEX_NAMESPACE.CHUNKS, entries: gone }), 'remove')
    assertOk(await api.derivedPut({ namespace: INDEX_NAMESPACE.VECTORS, entries: gone }), 'remove')
    stats.removed += gone.length
  }
  if (plan.removed.length) await drop(plan.removed)

  progress(0, plan.stale.length)
  let cursor = 0
  while (cursor < plan.stale.length) {
    const group = []
    const skipped = []
    let texts = 0
    while (cursor < plan.stale.length && group.length < GROUP_MAX_NOTES && texts < textsPerCall) {
      checkpoint()
      const key = plan.stale[cursor++]
      const value = await api.getSingleNote({ key })
      if (!isIndexable(value)) {
        skipped.push(key)
        continue
      }
      const title = String(value.title ?? '')
      const extra = attachmentText ? await attachmentText(value).catch(() => '') : ''
      const chunks = chunkNote(`${value.note || ''}${attachmentHtml(extra)}`, { title })
      group.push({ key, version: indexVersion(value), title, chunks })
      texts += chunks.length
    }
    if (skipped.length) {
      await drop(skipped)
      stats.removed -= skipped.length
      stats.skipped += skipped.length
    }
    if (!group.length) continue

    const flat = group.flatMap((note, n) => note.chunks.map((chunk) => ({ n, chunk })))
    const embedStarted = now()
    const pieces = await embedDocuments({
      embed,
      texts: flat.map(({ chunk }) => chunk.text),
      title: (source) => group[flat[source].n].title,
      signal,
      textsPerCall
    })
    const groupMs = now() - embedStarted
    // The first group also pays the model load, so it is reported apart from the steady rate.
    if (!stats.embedMs) {
      stats.firstEmbedMs = groupMs
      stats.firstChunks = pieces.length
    }
    stats.embedMs += groupMs
    checkpoint()

    const perNote = group.map(() => ({ vectors: [], chunks: [] }))
    for (const piece of pieces) {
      const { n, chunk } = flat[piece.source]
      perNote[n].vectors.push(piece.vector)
      perNote[n].chunks.push({ heading: chunk.heading, text: piece.text })
    }
    const vectorEntries = group.map((note, n) => ({
      id: note.key,
      version: note.version,
      value: encodeNoteVectors(perNote[n].vectors)
    }))
    const chunkEntries = group.map((note, n) => ({
      id: note.key,
      version: note.version,
      value: encodeNoteChunks(perNote[n].chunks)
    }))
    assertOk(
      await api.derivedPut({ namespace: INDEX_NAMESPACE.CHUNKS, entries: chunkEntries }),
      'put'
    )
    assertOk(
      await api.derivedPut({ namespace: INDEX_NAMESPACE.VECTORS, entries: vectorEntries }),
      'put'
    )
    stats.notes += group.length
    stats.chunks += pieces.length
    progress(cursor, plan.stale.length)
  }
  stats.ms = now() - startedAt
  return stats
}

/** Adapts `backendApi`, whose `getSingleNote` response wraps the note in `data`. */
export const indexApiFrom = (backendApi) => ({
  derivedGet: backendApi.derivedGet,
  derivedPut: backendApi.derivedPut,
  derivedVersions: backendApi.derivedVersions,
  derivedClear: backendApi.derivedClear,
  getSingleNote: async ({ key }) => (await backendApi.getSingleNote({ key }))?.data ?? null
})

export const isIndexModelMissing = (error) => error?.code === LOCAL_AI_ERROR.MODEL_MISSING
