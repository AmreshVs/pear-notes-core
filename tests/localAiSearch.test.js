import test from 'brittle'

import {
  containment,
  duplicatePairs,
  loadNoteVectors,
  relatedVectors,
  scoreNoteVectors,
  searchVectors,
  shingles,
  toQueryVector,
  updateDuplicates
} from '../backend/vectorSearch.js'
import { normalizeVector, packVector } from '../store/services/localAiEmbedding.js'
import { encodeNoteChunks, encodeNoteVectors } from '../store/services/localAiIndex.js'
import {
  DUPLICATE_PAIRS_NAMESPACE,
  DUPLICATES_DISMISSED_NAMESPACE,
  dismissDuplicatePair,
  duplicatePairId,
  encodeQueryVector,
  findDuplicatePairs,
  findRelatedNotes,
  fuseRankings,
  rankHybrid,
  searchVaultVectors,
  updateDuplicatePairs
} from '../store/services/localAiSearch.js'

const DIMS = 768
const axis = (i, j = i, mix = 0) => {
  const v = new Float32Array(DIMS)
  v[i] = 1
  v[j] += mix
  return normalizeVector(v)
}

test('backend vector search scores the index records the job writes', async (t) => {
  const records = [
    { id: 'a', value: encodeNoteVectors([packVector(axis(1)), packVector(axis(0, 2, 0.5))]) },
    { id: 'b', value: encodeNoteVectors([packVector(axis(0))]) },
    { id: 'c', value: encodeNoteVectors([packVector(axis(3))]) },
    { id: 'bad', value: new Uint8Array([2, 1, 0, 9]) }
  ]
  const query = toQueryVector(encodeQueryVector(axis(0)))
  const hits = await searchVectors(records, query, { limit: 2 })
  t.alike(
    hits.map((hit) => [hit.id, hit.chunk]),
    [
      ['b', 0],
      ['a', 1]
    ]
  )
  t.ok(Math.abs(hits[0].score - 1) < 0.01)
  t.ok(hits[1].score > 0.85 && hits[1].score < 0.92)
  t.is(scoreNoteVectors(query, records[3].value), null)
  t.is(toQueryVector(new Uint8Array(3)), null)
})

test('fuseRankings adds weight / (k + rank) per list', (t) => {
  const fused = fuseRankings(
    [
      { keys: ['x', 'y'], weight: 1 },
      { keys: ['y', 'z'], weight: 1 }
    ],
    { k: 0 }
  )
  t.alike(
    fused.map((hit) => hit.key),
    ['y', 'x', 'z']
  )
  t.is(fused[0].score, 1 / 2 + 1)
})

test('rankHybrid drops weak vector-only hits and recency never adds a note', (t) => {
  const ranked = rankHybrid({
    substringKeys: ['s'],
    vectorHits: [
      { id: 'v', score: 0.6 },
      { id: 'weak', score: 0.1 },
      { id: 's', score: 0.1 }
    ],
    updatedAtOf: (key) => ({ fresh: 9, weak: 8 })[key] || 0
  })
  t.alike(ranked.map((hit) => hit.key).sort(), ['s', 'v'])
  t.is(ranked[0].key, 's')
})

test('searchVaultVectors embeds a query prompt and sends float bytes', async (t) => {
  let sent = null
  const results = await searchVaultVectors({
    api: {
      derivedSearch: async (request) => {
        sent = request
        return { ok: true, results: [{ id: 'a', score: 0.5, chunk: 0 }] }
      }
    },
    embed: async (texts) => {
      t.ok(texts[0].startsWith('task: search result | query: '))
      return [Array.from(axis(4))]
    },
    query: 'trip'
  })
  t.is(sent.namespace, 'vectors')
  t.is(sent.query.byteLength, DIMS * 4)
  t.is(results.length, 1)
  const failed = await searchVaultVectors({
    api: { derivedSearch: async () => ({ ok: false, results: [] }) },
    embed: async () => [Array.from(axis(4))],
    query: 'trip'
  })
  t.is(failed, null)
})

test('findMeaningHits keeps strong hits and shows the matched chunk', async (t) => {
  const { findMeaningHits, toMeaningSnippet } = await import('../store/services/localAiSearch.js')
  let asked = null
  const hits = await findMeaningHits({
    api: {
      derivedSearch: async () => ({
        ok: true,
        results: [
          { id: 'a', score: 0.7, chunk: 1 },
          { id: 'b', score: 0.5, chunk: 0 },
          { id: 'weak', score: 0.1, chunk: 0 }
        ]
      }),
      derivedGet: async (request) => {
        asked = request
        return {
          ok: true,
          entries: [
            {
              id: 'a',
              value: encodeNoteChunks([
                { heading: '', text: 'first' },
                { heading: 'Hotels', text: 'Ryokan   was\n38k yen' }
              ])
            }
          ]
        }
      }
    },
    embed: async () => [Array.from(axis(1))],
    query: 'where to stay'
  })
  t.alike(asked, { namespace: 'chunks', ids: ['a', 'b'] })
  t.alike(hits, [
    { key: 'a', score: 0.7, snippet: 'Ryokan was 38k yen' },
    { key: 'b', score: 0.5, snippet: '' }
  ])
  const long = toMeaningSnippet('word '.repeat(60))
  t.ok(long.length <= 141 && long.endsWith('…'))
})

test('getMeaningNotes scopes hits and leaves out exact, locked and trashed notes', async (t) => {
  const { getMeaningNotes } = await import('../store/slices/notesSlice.js')
  const { MEANING_STATUS, SEARCH_SCOPE } = await import('../store/slices/searchSlice.js')
  const { ALL_NOTES_KEY, RECENTLY_DELETED_KEY } = await import('../constant.js')
  const note = (title, folderKey, extra = {}) => ({ title, folderKey, note: '', ...extra })
  const state = (selectedFolder, scope = SEARCH_SCOPE.FOLDER, query = 'kyoto') => ({
    notes: {
      notesKeys: ['exact', 'f1', 'f2', 'locked', 'trash'],
      notesData: {
        exact: note('kyoto trip', 'f1'),
        f1: note('Hotels', 'f1'),
        f2: note('Flights', 'f2'),
        locked: note('Secret', 'f1', { locked: true }),
        trash: note('Old', RECENTLY_DELETED_KEY)
      }
    },
    folders: { selectedFolder },
    ui: { searchQuery: query },
    settings: { sortBy: 'updatedAt' },
    search: {
      scope,
      includeLocked: false,
      status: 'done',
      query,
      folderKey: selectedFolder,
      hits: {},
      total: 0,
      meaning: {
        status: MEANING_STATUS.DONE,
        query: 'kyoto',
        hits: ['exact', 'f2', 'locked', 'trash', 'f1', 'gone'].map((key) => ({ key, snippet: key }))
      }
    }
  })
  const keys = (s) => getMeaningNotes(s).map((n) => n.key)
  t.alike(keys(state(ALL_NOTES_KEY)), ['f2', 'f1'])
  t.alike(keys(state('f1')), ['f1'])
  t.alike(keys(state('f1', SEARCH_SCOPE.ALL)), ['f2', 'f1'])
  t.alike(keys(state(RECENTLY_DELETED_KEY)), [])
  t.alike(keys(state(ALL_NOTES_KEY, SEARCH_SCOPE.FOLDER, 'other')), [])
})

const record = (id, ...vectors) => ({ id, value: encodeNoteVectors(vectors.map(packVector)) })

test('related notes score each note by its best chunk pair and skip the note itself', async (t) => {
  const records = [
    record('open', axis(0), axis(5)),
    record('near', axis(9), axis(5, 6, 0.2)),
    record('far', axis(7)),
    { id: 'bad', value: new Uint8Array([2, 1, 0, 9]) }
  ]
  const hits = await relatedVectors(records, 'open', records[0].value, { limit: 5 })
  t.alike(
    hits.map((hit) => [hit.id, hit.chunk]),
    [
      ['near', 1],
      ['far', 0]
    ]
  )
  t.ok(hits[0].score > 0.95)
  t.alike(await relatedVectors(records, 'bad', records[3].value), [])
})

/** Runs one duplicate check over `records` (with versions) and applies its writes to `stored`. */
async function checkDuplicates(records, stored, options) {
  const notes = await loadNoteVectors(records)
  const result = await updateDuplicates(notes, stored, { checkMs: 1000, ...options })
  for (const { id, version, value } of result.writes) {
    if (value === null) stored.delete(id)
    else stored.set(id, { id, version, value })
  }
  const pairs = duplicatePairs(notes, result.current).map((pair) => [pair.a, pair.b])
  return { ...result, pairs }
}

const versioned = (versions, ...records) =>
  records.map((entry) => ({ ...entry, version: versions[entry.id] ?? 1 }))

test('duplicates need both directions covered, and the wording check drops template twins', async (t) => {
  const records = versioned(
    {},
    record('copy-a', axis(0), axis(1)),
    record('copy-b', axis(1), axis(0)),
    record('part', axis(0)),
    record('other', axis(4))
  )
  t.alike(
    (await checkDuplicates(records, new Map(), { threshold: 0.9 })).pairs,
    [['copy-a', 'copy-b']],
    'a note that covers only half of another is not its duplicate'
  )
  const texts = {
    'copy-a': 'Train on Friday, staying with Kenji. Visit the castle in Leeds.',
    'copy-b': 'Train on Friday, staying with Kenji. Visit the castle in Leeds.'
  }
  const options = { threshold: 0.9, overlap: 0.6, textOf: async (id) => texts[id] ?? null }
  t.is((await checkDuplicates(records, new Map(), options)).pairs.length, 1)
  texts['copy-b'] = 'Bus on Monday, staying with Fatima. Book the market tour in York.'
  t.is((await checkDuplicates(records, new Map(), options)).pairs.length, 0)
})

test('duplicate records are rechecked only for edited notes, and removed notes drop out', async (t) => {
  const stored = new Map()
  const options = { threshold: 0.9 }
  let records = versioned(
    {},
    record('a', axis(0)),
    record('b', axis(0)),
    record('c', axis(3)),
    record('empty')
  )
  const first = await checkDuplicates(records, stored, options)
  t.is(first.checked, 4, 'every note gets a record, even one without chunks')
  t.alike(first.pairs, [['a', 'b']])

  const again = await checkDuplicates(records, stored, options)
  t.is(again.checked, 0)
  t.alike(again.pairs, [['a', 'b']], 'pairs are read back from the records')

  records = versioned({ b: 2 }, record('a', axis(0)), record('b', axis(3)), record('c', axis(3)))
  const edited = await checkDuplicates(records, stored, options)
  t.is(edited.checked, 1, 'only the edited note is checked')
  t.alike(edited.pairs, [['b', 'c']], 'the old pair is gone and the new one is found')
  t.absent(stored.has('empty'), 'a removed note loses its record')

  const changed = await checkDuplicates(records, stored, { threshold: 0.8 })
  t.is(changed.checked, 3, 'new thresholds make every record stale')
})

test('a time budget splits the duplicate check and the pairs still come out whole', async (t) => {
  const stored = new Map()
  const records = versioned(
    { a: 4, b: 3, c: 2, d: 1 },
    record('a', axis(0)),
    record('b', axis(1)),
    record('c', axis(0)),
    record('d', axis(1))
  )
  let clock = 0
  const now = () => (clock += 10)
  const calls = []
  let result
  do {
    result = await checkDuplicates(records, stored, { threshold: 0.9, checkMs: 5, now })
    calls.push(result.checked)
  } while (result.remaining)
  t.alike(calls, [1, 1, 1, 1], 'one note per call when the budget is spent')
  t.alike(result.pairs, [
    ['a', 'c'],
    ['b', 'd']
  ])
  const readOnly = await updateDuplicates(await loadNoteVectors(records), new Map(), {
    threshold: 0.9
  })
  t.is(readOnly.checked, 0)
  t.is(readOnly.remaining, 4)
})

test('containment compares word 3-grams and handles text without spaces', (t) => {
  const full = shingles('Hotel Baixa, three nights. Airport transfer booked.')
  t.is(containment(full, shingles('hotel baixa three nights')), 1)
  t.is(containment(full, shingles('')), 0)
  t.ok(containment(shingles('东京塔门票两张'), shingles('东京塔门票两张，周六上午')) === 1)
})

test('related notes come back with the matching chunk as the snippet', async (t) => {
  const api = {
    derivedRelated: async ({ namespace, id }) => {
      t.is(namespace, 'vectors')
      t.is(id, 'open')
      return {
        ok: true,
        results: [
          { id: 'near', score: 0.7, chunk: 1 },
          { id: 'weak', score: 0.3, chunk: 0 }
        ]
      }
    },
    derivedGet: async ({ ids }) => ({
      ok: true,
      entries: ids.map((id) => ({
        id,
        value: encodeNoteChunks([
          { heading: '', text: 'first' },
          { heading: '', text: 'second chunk' }
        ])
      }))
    })
  }
  t.alike(await findRelatedNotes({ api, noteKey: 'open' }), [
    { key: 'near', score: 0.7, snippet: 'second chunk' }
  ])
  t.is(
    await findRelatedNotes({ api: { derivedRelated: async () => ({ ok: false }) }, noteKey: 'x' }),
    null
  )
})

test('dismissed duplicate pairs stay hidden in either order', async (t) => {
  const store = new Map()
  const api = {
    derivedDuplicates: async ({ textNamespace, pairNamespace, checkMs }) => {
      t.is(textNamespace, 'chunks')
      t.is(pairNamespace, DUPLICATE_PAIRS_NAMESPACE)
      t.is(checkMs, 0, 'listing never checks')
      return {
        ok: true,
        pairs: [
          { a: 'a', b: 'b', score: 0.95 },
          { a: 'c', b: 'd', score: 0.9 }
        ]
      }
    },
    derivedVersions: async ({ namespace }) => {
      t.is(namespace, DUPLICATES_DISMISSED_NAMESPACE)
      return { ok: true, entries: [...store.keys()].map((id) => ({ id, version: 1 })) }
    },
    derivedPut: async ({ entries }) => {
      for (const entry of entries) store.set(entry.id, entry.value)
      return { ok: true }
    }
  }
  t.is((await findDuplicatePairs({ api })).length, 2)
  t.ok(await dismissDuplicatePair({ api, a: 'd', b: 'c' }))
  t.is(duplicatePairId('d', 'c'), 'c|d')
  t.alike(await findDuplicatePairs({ api }), [{ a: 'a', b: 'b', score: 0.95 }])
})

test('the duplicate update calls the backend until nothing is stale and stops on checkpoint', async (t) => {
  const remaining = [5, 2, 0]
  const api = {
    derivedDuplicates: async ({ checkMs }) => {
      t.ok(checkMs > 0)
      const left = remaining.shift()
      return { ok: true, pairs: [], checked: 3, remaining: left }
    }
  }
  t.is(await updateDuplicatePairs({ api }), 9)
  t.is(
    await updateDuplicatePairs({ api: { derivedDuplicates: async () => ({ ok: false }) } }),
    null
  )
  let calls = 0
  const stop = Object.assign(new Error('stop'), { code: 'cancelled' })
  await t.exception(
    updateDuplicatePairs({
      api: { derivedDuplicates: async () => ({ ok: true, checked: 1, remaining: 1 }) },
      checkpoint: () => {
        if (++calls > 2) throw stop
      }
    }),
    /stop/
  )
})

test('related and duplicate rows leave out locked, trashed and unloaded notes', async (t) => {
  const { RECENTLY_DELETED_KEY } = await import('../constant.js')
  const { getDuplicatePairRows, getRelatedNoteRows } = await import('../store/slices/notesSlice.js')
  const notesData = {
    open: { folderKey: 'f' },
    ok: { folderKey: 'f' },
    locked: { folderKey: 'f', locked: true },
    trashed: { folderKey: RECENTLY_DELETED_KEY },
    other: { folderKey: 'g' }
  }
  const state = {
    notes: { notesKeys: [...Object.keys(notesData), 'unloaded'], notesData },
    localAi: {
      related: {
        noteKey: 'open',
        forKey: 'open',
        status: 'done',
        indexAt: 1,
        hits: ['locked', 'ok', 'trashed', 'unloaded', 'other'].map((key) => ({
          key,
          snippet: key
        }))
      },
      duplicates: {
        status: 'done',
        indexAt: 1,
        pairs: [
          { a: 'ok', b: 'other', score: 0.9 },
          { a: 'ok', b: 'locked', score: 0.9 },
          { a: 'trashed', b: 'other', score: 0.9 }
        ]
      }
    }
  }
  t.alike(
    getRelatedNoteRows(state).map((row) => row.key),
    ['ok', 'other']
  )
  t.alike(getDuplicatePairRows(state), [{ a: 'ok', b: 'other', score: 0.9 }])
  const stale = {
    ...state,
    localAi: { ...state.localAi, related: { ...state.localAi.related, forKey: 'x' } }
  }
  t.is(getRelatedNoteRows(stale).length, 0)
})
