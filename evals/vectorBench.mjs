// Times derived-store vector reads on a sealed store of synthetic notes.
// Usage: bare evals/vectorBench.mjs "$PWD" <empty scratch dir> <notes> [chunksPerNote=2.5]
const CORE = Bare.argv[2]
const DIR = Bare.argv[3]
const NOTES = Number(Bare.argv[4])
const PER = Number(Bare.argv[5] || 2.5)
const { DerivedStore } = await import(CORE + '/backend/derivedStore.js')
const vs = await import(CORE + '/backend/vectorSearch.js')
const { default: b4a } = await import(CORE + '/node_modules/b4a/index.js')
const DIMS = 768
let seed = 7
const rand = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand())
const randVec = () => { const v = new Float32Array(DIMS); for (let d = 0; d < DIMS; d++) v[d] = gauss() / Math.sqrt(DIMS); return v }
const global = randVec()
const clusters = Array.from({ length: 200 }, randVec)
const mix = (parts) => { const v = new Float32Array(DIMS); for (const [w, p] of parts) for (let d = 0; d < DIMS; d++) v[d] += w * p[d]; let n = 0; for (let d = 0; d < DIMS; d++) n += v[d] * v[d]; n = Math.sqrt(n); for (let d = 0; d < DIMS; d++) v[d] /= n; return v }
const pack = (vectors) => {
  const out = new Uint8Array(3 + vectors.length * (4 + DIMS)); const view = new DataView(out.buffer)
  out[0] = 1; view.setUint16(1, vectors.length, true)
  vectors.forEach((v, c) => { const at = 3 + c * (4 + DIMS); let max = 0; for (const x of v) max = Math.max(max, Math.abs(x)); const scale = max / 127; view.setFloat32(at, scale, true); for (let d = 0; d < DIMS; d++) out[at + 4 + d] = Math.round(v[d] / scale) & 0xff })
  return out
}
const key = new Uint8Array(32).fill(3)
const store = new DerivedStore(DIR, key)
await store.ready()
const ms = (t) => (Date.now() - t)
let t = Date.now(); let chunks = 0; let batch = []; let batchText = []
const text = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor '.repeat(14)
for (let i = 0; i < NOTES; i++) {
  const count = Math.max(1, Math.round(PER + (rand() - 0.5) * 2))
  const base = mix([[0.59, global], [0.5, clusters[i % 200]], [0.63, randVec()]])
  const vecs = Array.from({ length: count }, () => mix([[0.85, base], [0.53, randVec()]]))
  chunks += count
  batch.push({ id: 'note' + i, version: 1, value: pack(vecs) })
  batchText.push({ id: 'note' + i, version: 1, value: b4a.from(JSON.stringify(vecs.map((_, c) => ['', i + ' ' + c + ' ' + text]))) })
  if (batch.length === 500 || i === NOTES - 1) { await store.putMany('vectors', batch); await store.putMany('chunks', batchText); batch = []; batchText = [] }
}
const out = { notes: NOTES, chunks, writeMs: ms(t) }
t = Date.now(); const versions = await store.versions('vectors'); out.versionsMs = ms(t)
t = Date.now(); let n = 0; for await (const e of store.entries('vectors')) n += e.value.byteLength; out.decryptAllMs = ms(t); out.vectorMB = +(n / 1e6).toFixed(1)
const q = mix([[0.59, global], [0.5, clusters[5]], [0.63, randVec()]])
t = Date.now(); await vs.searchVectors(store.entries('vectors'), q, { limit: 50 }); out.searchMs = ms(t)
const src = await store.get('vectors', 'note5')
t = Date.now(); await vs.relatedVectors(store.entries('vectors'), 'note5', src.value, { limit: 10 }); out.relatedMs = ms(t)
const textOf = async (id) => { const e = await store.get('chunks', id); return e ? JSON.parse(b4a.toString(e.value)).map((c) => c[1]).join('\n') : null }
// Incremental duplicates: a full pass in 1 s calls, then the cost of one edited note.
const pairsOf = async () => { const m = new Map(); for await (const e of store.entries('duplicate-pairs')) m.set(e.id, e); return m }
t = Date.now(); const loaded = await vs.loadNoteVectors(store.entries('vectors')); out.dupLoadMs = ms(t)
const opts = { threshold: 0.85, overlap: 0.6, textOf, checkMs: 1000 }
t = Date.now(); const firstCall = await vs.updateDuplicates(loaded, await pairsOf(), opts)
await store.putMany('duplicate-pairs', firstCall.writes)
out.dupFirstCallChecked = firstCall.checked; out.dupFirstCallMs = ms(t)
if (NOTES <= 3000) {
  t = Date.now(); let r = firstCall
  while (r.remaining) { r = await vs.updateDuplicates(loaded, await pairsOf(), opts); await store.putMany('duplicate-pairs', r.writes) }
  out.dupFullPassMs = ms(t) + out.dupFirstCallMs; out.pairs = vs.duplicatePairs(loaded, r.current).length
} else {
  // Pretend every other note is current: give each a record, then edit note0.
  const all = [...loaded.values()].filter((n) => n.id !== 'note0').map((n) => ({ id: n.id, version: n.version, value: vs.encodePairRecord({ t: 0.85, o: 0.6, p: [] }) }))
  await store.putMany('duplicate-pairs', [...all, { id: 'note0', version: 0, value: null }])
  t = Date.now(); const edit = await vs.updateDuplicates(loaded, await pairsOf(), opts); out.dupEditMs = ms(t); out.dupEditChecked = edit.checked
}
t = Date.now(); await vs.updateDuplicates(new Map([...(await store.versions('vectors'))].map(([id, version]) => [id, { id, version }])), await pairsOf(), { ...opts, checkMs: 0 }); out.dupReadMs = ms(t)
t = Date.now(); await store.stats(['vectors', 'chunks']); out.statsMs = ms(t)
{ const a = vs.parseNoteVectors((await store.get("vectors","note1")).value), b = vs.parseNoteVectors((await store.get("vectors","note2")).value), c2 = vs.parseNoteVectors((await store.get("vectors","note201")).value); const dot=(x,y)=>{let s=0;for(let d=0;d<DIMS;d++)s+=x.values[d]*y.values[d];return s*x.scales[0]*y.scales[0]}; out.cosOther=+dot(a,b).toFixed(2); out.cosCluster=+dot(a,c2).toFixed(2) }
console.log(JSON.stringify(out))
await store.close()
