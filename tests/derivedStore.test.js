import test from 'brittle'
import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'

import { DerivedStore } from '../backend/derivedStore.js'

const tmp = (t) => {
  const dir = path.join(tmpdir(), `pn-derived-${Math.random().toString(36).slice(2)}`)
  t.teardown(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

const KEY = b4a.alloc(32, 7)
const OTHER_KEY = b4a.alloc(32, 9)

async function allBytes(dir) {
  const parts = []
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name)
    if (fs.statSync(file).isFile()) parts.push(fs.readFileSync(file))
  }
  return b4a.concat(parts)
}

test('values round-trip, namespaced, with versions', async (t) => {
  const dir = tmp(t)
  const store = new DerivedStore(dir, KEY)
  await store.ready()
  await store.putMany('vectors', [
    { id: 'note-a', version: 1700000000123, value: b4a.from([1, 2, 3]) },
    { id: 'note-b', version: 5, value: b4a.from('bee') }
  ])
  await store.put('entities', 'note-a', 2, b4a.from('{"people":[]}'))
  t.alike((await store.get('vectors', 'note-a')).value, b4a.from([1, 2, 3]))
  t.is((await store.get('vectors', 'note-a')).version, 1700000000123)
  t.is(await store.get('vectors', 'missing'), null)
  const versions = await store.versions('vectors')
  t.alike([...versions.entries()].sort(), [
    ['note-a', 1700000000123],
    ['note-b', 5]
  ])
  await store.delete('vectors', 'note-b')
  t.is(await store.get('vectors', 'note-b'), null)
  await store.clear('vectors')
  t.is((await store.versions('vectors')).size, 0)
  t.ok(await store.get('entities', 'note-a'), 'other namespaces survive a namespace clear')
  await store.close()
})

test('data persists across reopen and is sealed on disk', async (t) => {
  const dir = tmp(t)
  const marker = 'DENTIST-APPOINTMENT-MARKER'
  const store = new DerivedStore(dir, KEY)
  await store.ready()
  await store.put('chunks', 'note-a', 1, b4a.from(marker.repeat(50)))
  await store.close()
  t.absent(b4a.includes(await allBytes(dir), b4a.from(marker)), 'plaintext never reaches disk')
  const again = new DerivedStore(dir, KEY)
  await again.ready()
  t.absent(again.wiped)
  t.is(b4a.toString((await again.get('chunks', 'note-a')).value), marker.repeat(50))
  await again.close()
})

test('a different vault key wipes instead of failing', async (t) => {
  const dir = tmp(t)
  const store = new DerivedStore(dir, KEY)
  await store.ready()
  await store.put('vectors', 'note-a', 1, b4a.from('x'))
  await store.close()
  const other = new DerivedStore(dir, OTHER_KEY)
  await other.ready()
  t.ok(other.wiped)
  t.is(await other.get('vectors', 'note-a'), null)
  await other.put('vectors', 'note-a', 2, b4a.from('y'))
  t.is(b4a.toString((await other.get('vectors', 'note-a')).value), 'y')
  await other.close()
})

test('a value moved to another record key does not open', async (t) => {
  const dir = tmp(t)
  const store = new DerivedStore(dir, KEY)
  await store.ready()
  await store.put('vectors', 'note-a', 1, b4a.from('secret a'))
  const sealed = await store._db.get(b4a.from('vectors\u0000note-a'))
  await store._db.put(b4a.from('vectors\u0000note-b'), sealed)
  t.is(await store.get('vectors', 'note-b'), null)
  t.is((await store.versions('vectors')).size, 1)
  await store.close()
})

test('namespaces are validated', async (t) => {
  const store = new DerivedStore(tmp(t), KEY)
  await store.ready()
  await t.exception(() => store.get('../x', 'a'))
  await store.close()
  t.exception(() => new DerivedStore(tmp(t), b4a.alloc(4)))
})

test('vector search runs over sealed records and survives the wire', async (t) => {
  const { searchVectors, toQueryVector } = await import('../backend/vectorSearch.js')
  const { decode, encode } = await import('../spec/hyperschema/index.js')
  const record = (dims, hot) => {
    const out = new Uint8Array(3 + 4 + dims)
    out[0] = 2
    new DataView(out.buffer).setUint16(1, 1, true)
    new DataView(out.buffer).setFloat32(3, 1 / 127, true)
    out[7 + hot] = 127
    return out
  }
  const store = new DerivedStore(tmp(t), KEY)
  await store.ready()
  await store.putMany('vectors', [
    { id: 'a', version: 1, value: record(8, 2) },
    { id: 'b', version: 1, value: record(8, 5) }
  ])
  const float = new Float32Array(8)
  float[5] = 1
  const request = decode(
    '@notes/command-derived-search-request',
    encode('@notes/command-derived-search-request', {
      namespace: 'vectors',
      query: b4a.from(float.buffer),
      limit: 1
    })
  )
  const results = await searchVectors(store.entries('vectors'), toQueryVector(request.query), {
    limit: request.limit
  })
  const response = decode(
    '@notes/command-derived-search-response',
    encode('@notes/command-derived-search-response', { results, ok: true })
  )
  t.is(response.results.length, 1)
  t.is(response.results[0].id, 'b')
  t.ok(Math.abs(response.results[0].score - 1) < 1e-6)
  await store.close()
})

test('related and duplicate search run over sealed records and survive the wire', async (t) => {
  const { duplicatePairs, loadNoteVectors, relatedVectors, updateDuplicates } =
    await import('../backend/vectorSearch.js')
  const { decode, encode } = await import('../spec/hyperschema/index.js')
  const roundTrip = (name, value) => decode(name, encode(name, value))
  const record = (dims, ...hots) => {
    const stride = 4 + dims
    const out = new Uint8Array(3 + hots.length * stride)
    out[0] = 2
    const view = new DataView(out.buffer)
    view.setUint16(1, hots.length, true)
    hots.forEach((hot, c) => {
      view.setFloat32(3 + c * stride, 1 / 127, true)
      out[3 + c * stride + 4 + hot] = 127
    })
    return out
  }
  const chunks = (text) => b4a.from(JSON.stringify([['', text]]))
  const store = new DerivedStore(tmp(t), KEY)
  await store.ready()
  await store.putMany('vectors', [
    { id: 'a', version: 1, value: record(8, 2, 5) },
    { id: 'b', version: 1, value: record(8, 5, 2) },
    { id: 'c', version: 1, value: record(8, 7) }
  ])
  await store.putMany('chunks', [
    { id: 'a', version: 1, value: chunks('pick up the keys from the blue pot') },
    { id: 'b', version: 1, value: chunks('pick up the keys from the blue pot') }
  ])

  const relatedRequest = roundTrip('@notes/command-derived-related-request', {
    namespace: 'vectors',
    id: 'a',
    limit: 1
  })
  const source = await store.get('vectors', relatedRequest.id)
  const related = roundTrip('@notes/command-derived-related-response', {
    results: await relatedVectors(store.entries('vectors'), 'a', source.value, {
      limit: relatedRequest.limit
    }),
    ok: true
  })
  t.alike(
    related.results.map((hit) => [hit.id, hit.chunk]),
    [['b', 0]]
  )

  const request = roundTrip('@notes/command-derived-duplicates-request', {
    namespace: 'vectors',
    textNamespace: 'chunks',
    pairNamespace: 'duplicate-pairs',
    threshold: 0.85,
    overlap: 0.6,
    checkMs: 1000,
    limit: 0
  })
  t.is(request.threshold, 0.85)
  t.is(request.checkMs, 1000)
  const textOf = async (id) => {
    const entry = await store.get(request.textNamespace, id)
    return entry ? JSON.parse(b4a.toString(entry.value))[0][1] : null
  }
  const records = async () => {
    const out = new Map()
    for await (const entry of store.entries(request.pairNamespace)) out.set(entry.id, entry)
    return out
  }
  const notes = await loadNoteVectors(store.entries('vectors'))
  const options = { threshold: request.threshold, overlap: request.overlap, textOf }
  const result = await updateDuplicates(notes, await records(), {
    ...options,
    checkMs: request.checkMs
  })
  await store.putMany(request.pairNamespace, result.writes)
  t.is(result.checked, 3)
  const reread = await updateDuplicates(notes, await records(), options)
  t.is(reread.remaining, 0, 'sealed pair records read back as current')
  const response = roundTrip('@notes/command-derived-duplicates-response', {
    pairs: duplicatePairs(notes, reread.current),
    checked: result.checked,
    remaining: reread.remaining,
    ok: true
  })
  t.is(response.checked, 3)
  t.alike(
    response.pairs.map((pair) => [pair.a, pair.b]),
    [['a', 'b']]
  )
  t.ok(Math.abs(response.pairs[0].score - 1) < 1e-6)
  await store.close()
})
