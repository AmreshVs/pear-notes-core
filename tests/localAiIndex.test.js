import test from 'brittle'

import { RECENTLY_DELETED_KEY } from '../constant.js'
import { LOCAL_AI_ERROR } from '../store/services/localAiCatalog.js'
import { EMBEDDING_VECTOR_BYTES } from '../store/services/localAiEmbedding.js'
import {
  INDEX_NAMESPACE,
  decodeNoteChunks,
  decodeNoteVectors,
  encodeNoteVectors,
  indexApiFrom,
  planIndex,
  runVaultIndex
} from '../store/services/localAiIndex.js'

const DIMS = 768

function fakeEmbed({ calls = [], failAfter = Infinity, error = null } = {}) {
  let done = 0
  const embed = async (texts) => {
    calls.push(texts.length)
    if (error) throw error
    if (done >= failAfter) throw Object.assign(new Error('boom'), { code: 'BOOM' })
    done += 1
    return texts.map((text) => {
      const out = new Array(DIMS).fill(0)
      for (let i = 0; i < text.length; i++) out[(text.charCodeAt(i) * 7 + i) % DIMS] += 1
      out[0] += 0.5
      return out
    })
  }
  return embed
}

function fakeApi(notes) {
  const stores = new Map()
  const ns = (namespace) => {
    if (!stores.has(namespace)) stores.set(namespace, new Map())
    return stores.get(namespace)
  }
  const api = {
    reads: [],
    stores,
    async derivedGet({ namespace, ids }) {
      return { ok: true, entries: ids.map((id) => ns(namespace).get(id)).filter(Boolean) }
    },
    async derivedPut({ namespace, entries }) {
      for (const { id, version, value } of entries) {
        if (value === null) ns(namespace).delete(id)
        else ns(namespace).set(id, { id, version, value })
      }
      return { ok: true }
    },
    async derivedVersions({ namespace }) {
      return {
        ok: true,
        entries: [...ns(namespace).values()].map(({ id, version }) => ({ id, version }))
      }
    },
    async derivedClear({ namespace }) {
      ns(namespace).clear()
      return { ok: true }
    },
    async getSingleNote({ key }) {
      api.reads.push(key)
      return notes.get(key) ?? null
    }
  }
  return api
}

const note = (title, body, updatedAt, extra = {}) => ({
  title,
  note: `<p>${body}</p>`,
  updatedAt,
  folderKey: 'f',
  ...extra
})

const listOf = (notes) => [...notes].map(([key, value]) => ({ key, value }))
const live = () => ({ signal: new AbortController().signal })

test('planIndex finds stale, removed and leaves unloaded keys alone', (t) => {
  const versions = new Map([
    ['same', 5],
    ['old', 1],
    ['gone', 3],
    ['locked', 2],
    ['trashed', 2],
    ['loading', 9]
  ])
  const plan = planIndex(
    [
      { key: 'same', value: { updatedAt: 5 } },
      { key: 'old', value: { updatedAt: 4 } },
      { key: 'new', value: { updatedAt: 8 } },
      { key: 'locked', value: { updatedAt: 2, locked: true } },
      { key: 'trashed', value: { updatedAt: 2, folderKey: RECENTLY_DELETED_KEY } },
      { key: 'loading', value: undefined }
    ],
    versions
  )
  t.alike(plan.stale, ['new', 'old'])
  t.alike(plan.removed.sort(), ['gone', 'locked', 'trashed'])
  t.is(plan.total, 3)
})

test('on battery a first index takes the newest notes and the backlog waits', (t) => {
  const list = Array.from({ length: 5 }, (_, i) => ({ key: `n${i}`, value: { updatedAt: i + 1 } }))
  const first = planIndex(list, new Map(), { newNoteLimit: 2 })
  t.alike(first.stale, ['n4', 'n3'])
  t.alike(first.deferred, ['n2', 'n1', 'n0'])

  const indexed = new Map([
    ['n4', 5],
    ['n3', 3]
  ])
  const later = planIndex([...list, { key: 'fresh', value: { updatedAt: 9 } }], indexed, {
    newNoteLimit: 2
  })
  t.alike(later.stale, ['fresh', 'n3'], 'a new note and an edit are upkeep')
  t.alike(later.deferred, ['n2', 'n1', 'n0'], 'older never-indexed notes keep waiting')

  const charging = planIndex(list, indexed)
  t.alike(charging.stale, ['n3', 'n2', 'n1', 'n0'])
  t.alike(charging.deferred, [])
})

test('vector records round-trip and reject other formats', (t) => {
  const a = new Uint8Array(EMBEDDING_VECTOR_BYTES).fill(1)
  const b = new Uint8Array(EMBEDDING_VECTOR_BYTES).fill(2)
  const decoded = decodeNoteVectors(encodeNoteVectors([a, b]))
  t.is(decoded.length, 2)
  t.alike([...decoded[1]], [...b])
  t.is(decodeNoteVectors(encodeNoteVectors([])).length, 0)
  const wrong = encodeNoteVectors([a])
  wrong[0] = 99
  t.is(decodeNoteVectors(wrong), null)
  t.is(decodeNoteVectors(encodeNoteVectors([a]).subarray(0, 10)), null)
})

test('indexes every note, batches across notes, then only what changed', async (t) => {
  const notes = new Map()
  for (let i = 0; i < 40; i++) notes.set(`n${i}`, note(`Note ${i}`, `body number ${i}`, 100 + i))
  const api = fakeApi(notes)
  const calls = []
  const progress = []
  const first = await runVaultIndex({
    api,
    embed: fakeEmbed({ calls }),
    notes: listOf(notes),
    ...live(),
    progress: (done, total) => progress.push([done, total])
  })
  t.is(first.notes, 40)
  t.is(first.chunks, 40)
  t.ok(first.rebuilt)
  t.ok(calls.length <= 4, `few embed calls (${calls.length})`)
  t.alike(progress.at(-1), [40, 40])
  const stored = api.stores.get(INDEX_NAMESPACE.VECTORS).get('n39')
  t.is(stored.version, 139)
  t.is(decodeNoteVectors(stored.value).length, 1)
  const chunks = decodeNoteChunks(api.stores.get(INDEX_NAMESPACE.CHUNKS).get('n39').value)
  t.ok(chunks[0].text.includes('body number 39'))
  t.is(api.reads[0], 'n39', 'newest first')

  notes.set('n3', note('Note 3', 'edited', 500))
  notes.delete('n4')
  notes.set('n5', { ...notes.get('n5'), locked: true })
  api.reads.length = 0
  const second = await runVaultIndex({
    api,
    embed: fakeEmbed(),
    notes: listOf(notes),
    ...live()
  })
  t.is(second.notes, 1)
  t.is(second.removed, 2)
  t.not(second.rebuilt)
  t.alike(api.reads, ['n3'])
  t.not(api.stores.get(INDEX_NAMESPACE.VECTORS).has('n4'))
  t.not(api.stores.get(INDEX_NAMESPACE.CHUNKS).has('n5'))

  const third = await runVaultIndex({ api, embed: fakeEmbed(), notes: listOf(notes), ...live() })
  t.is(third.notes, 0)
})

test('an aborted run keeps finished groups and the next run resumes', async (t) => {
  const notes = new Map()
  for (let i = 0; i < 64; i++) notes.set(`n${i}`, note(`T${i}`, `text ${i}`, i + 1))
  const api = fakeApi(notes)
  const controller = new AbortController()
  const reason = Object.assign(new Error('paused'), { code: 'paused' })
  let calls = 0
  const embed = async (texts) => {
    calls += 1
    if (calls === 2) controller.abort(reason)
    return fakeEmbed()(texts)
  }
  await t.exception(
    runVaultIndex({ api, embed, notes: listOf(notes), signal: controller.signal }),
    /paused/
  )
  const kept = api.stores.get(INDEX_NAMESPACE.VECTORS).size
  t.ok(kept > 0 && kept < 64, `kept ${kept}`)
  const rest = await runVaultIndex({ api, embed: fakeEmbed(), notes: listOf(notes), ...live() })
  t.is(rest.notes, 64 - kept)
  t.is(api.stores.get(INDEX_NAMESPACE.VECTORS).size, 64)
})

test('a vault change stops before writing', async (t) => {
  const notes = new Map([['a', note('A', 'alpha', 1)]])
  const api = fakeApi(notes)
  let current = true
  const embed = async (texts) => {
    current = false
    return fakeEmbed()(texts)
  }
  await t.exception(
    runVaultIndex({ api, embed, notes: listOf(notes), ...live(), isCurrent: () => current }),
    /vault changed/
  )
  t.is(api.stores.get(INDEX_NAMESPACE.VECTORS).size, 0)
})

test('a format change wipes the old index', async (t) => {
  const notes = new Map([['a', note('A', 'alpha', 1)]])
  const api = fakeApi(notes)
  await api.derivedPut({
    namespace: INDEX_NAMESPACE.VECTORS,
    entries: [{ id: 'a', version: 1, value: new Uint8Array([7]) }]
  })
  const stats = await runVaultIndex({ api, embed: fakeEmbed(), notes: listOf(notes), ...live() })
  t.ok(stats.rebuilt)
  t.is(stats.notes, 1)
  t.is(decodeNoteVectors(api.stores.get(INDEX_NAMESPACE.VECTORS).get('a').value).length, 1)
})

test('empty notes are recorded so they are not re-planned, and errors surface', async (t) => {
  const notes = new Map([['empty', { title: '', note: '', updatedAt: 3, folderKey: 'f' }]])
  const api = fakeApi(notes)
  const stats = await runVaultIndex({ api, embed: fakeEmbed(), notes: listOf(notes), ...live() })
  t.is(stats.notes, 1)
  t.is(stats.chunks, 0)
  t.is(api.stores.get(INDEX_NAMESPACE.VECTORS).get('empty').version, 3)

  const other = new Map([['x', note('X', 'text', 1)]])
  const missing = Object.assign(new Error('missing'), { code: LOCAL_AI_ERROR.MODEL_MISSING })
  await t.exception(
    runVaultIndex({
      api: fakeApi(other),
      embed: fakeEmbed({ error: missing }),
      notes: listOf(other),
      ...live()
    }),
    /missing/
  )
})

test('a note locked since the list was read loses its vectors', async (t) => {
  const notes = new Map([['a', note('A', 'alpha', 1)]])
  const api = fakeApi(notes)
  await runVaultIndex({ api, embed: fakeEmbed(), notes: listOf(notes), ...live() })
  const listed = listOf(new Map([['a', note('A', 'alpha', 2)]]))
  notes.set('a', note('A', 'alpha', 2, { locked: true }))
  const stats = await runVaultIndex({ api, embed: fakeEmbed(), notes: listed, ...live() })
  t.is(stats.skipped, 1)
  t.is(stats.removed, 0)
  t.not(api.stores.get(INDEX_NAMESPACE.VECTORS).has('a'))
  t.not(api.stores.get(INDEX_NAMESPACE.CHUNKS).has('a'))
})

test('the backend api adapter unwraps the note from its rpc response', async (t) => {
  const notes = new Map([['a', note('A', 'alpha beta', 7)]])
  const fake = fakeApi(notes)
  const rpcShaped = {
    ...fake,
    getSingleNote: async ({ key }) => ({ data: notes.get(key) })
  }
  const api = indexApiFrom(rpcShaped)
  const stats = await runVaultIndex({ api, embed: fakeEmbed(), notes: listOf(notes), ...live() })
  t.is(stats.chunks, 1)
  t.is(fake.stores.get(INDEX_NAMESPACE.VECTORS).get('a').version, 7)
  t.is(await api.getSingleNote({ key: 'missing' }), null)
})
