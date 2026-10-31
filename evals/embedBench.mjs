// Embeddings spike: EmbeddingGemma throughput, memory, index size, query
// latency and retrieval quality on a synthetic vault. Desktop runtime only.
//
//   node evals/embedBench.mjs --model=Q4 --models=<cache dir> --out=<file.json>
//
// --models must NOT be the dev app's model dir (a running app locks it).
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'

import { ALL_NOTES_KEY } from '../constant.js'
import { NoteSearchIndex } from '../backend/noteSearch.js'
import { buildVault, QUESTIONS, queryPrompt } from './embedCorpus.mjs'
import { flag, HERE } from './qvacRuntime.mjs'

const MODELS = { Q4: 'EMBEDDINGGEMMA_300M_Q4_0', Q8: 'EMBEDDINGGEMMA_300M_Q8_0' }
const MODEL = MODELS[flag('model', 'Q4')]
const BUDGETS = flag('budgets', '1000,3000,10000').split(',').map(Number)
const MAX_CHUNKS = Math.max(...BUDGETS)
const BATCH = Number(flag('batch', '32'))
const DIMS = [768, 512, 256]
const DEVICE = flag('device', 'gpu')
const BATCH_SIZE = flag('batch-size')
const MODEL_CONFIG = { device: DEVICE, ...(BATCH_SIZE ? { batchSize: Number(BATCH_SIZE) } : {}) }
const TOP_K = 5
const RRF_K = 60

const runtimeDir = flag('runtime', path.join(HERE, '..', '..', 'pear-notes-desktop', 'local-ai'))
const modelsDir = flag('models')
const outPath = flag('out')
if (!modelsDir || !outPath) {
  console.error('Pass --models=<cache dir outside the dev app> and --out=<report.json>')
  process.exit(1)
}
fs.mkdirSync(modelsDir, { recursive: true })
const configPath = path.join(path.dirname(outPath), 'embed-bench-qvac.json')
fs.writeFileSync(configPath, JSON.stringify({ cacheDirectory: modelsDir }))
process.env.QVAC_CONFIG_PATH = configPath
process.env.QVAC_WORKER_PATH = path.join(runtimeDir, 'qvac', 'worker.entry.mjs')
const sdk = await import(
  pathToFileURL(path.join(runtimeDir, 'node_modules', '@qvac', 'sdk', 'dist', 'src', 'index.js'))
    .href
)

const report = {
  model: MODEL,
  device: DEVICE,
  batchSize: BATCH_SIZE ?? 'default',
  batch: BATCH,
  host: `${process.platform}-${process.arch}`
}
const log = (...args) => console.log(...args)

// Peak RSS of the bare worker. It counts the mmapped weights; embedMemProbe.mjs
// measures the real phys_footprint.
let workerPid = null
let peakRssMb = 0
const findWorker = () => {
  const rows = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,comm='], { encoding: 'utf8' }).split(
    '\n'
  )
  for (const row of rows) {
    const [pid, ppid, ...comm] = row.trim().split(/\s+/)
    if (Number(ppid) === process.pid && comm.join(' ').endsWith('/bare')) return Number(pid)
  }
  return null
}
const sampleRss = () => {
  workerPid ??= findWorker()
  if (!workerPid) return 0
  try {
    const mb =
      Number(execFileSync('ps', ['-o', 'rss=', '-p', String(workerPid)], { encoding: 'utf8' })) /
      1024
    if (!mb) workerPid = null
    peakRssMb = Math.max(peakRssMb, mb)
    return mb
  } catch {
    return 0
  }
}
const sampler = setInterval(sampleRss, 200)

const normalize = (vec) => {
  let norm = 0
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i]
  norm = Math.sqrt(norm) || 1
  const out = new Float32Array(vec.length)
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] / norm
  return out
}

async function embedMany(modelId, texts, batch) {
  const out = []
  for (let i = 0; i < texts.length; i += batch) {
    const slice = texts.slice(i, i + batch)
    const result = await sdk.embed({ modelId, text: batch === 1 ? slice[0] : slice })
    if (batch === 1) out.push(result.embedding)
    else out.push(...result.embedding)
  }
  return out
}

// --- load ---
sampleRss()
let t = performance.now()
const modelId = await sdk.loadModel({
  modelSrc: sdk[MODEL],
  modelType: 'embeddings',
  modelConfig: MODEL_CONFIG
})
const firstLoadMs = performance.now() - t
sampleRss()
const rssAfterLoad = sampleRss()
await sdk.unloadModel({ modelId })
t = performance.now()
const id = await sdk.loadModel({
  modelSrc: sdk[MODEL],
  modelType: 'embeddings',
  modelConfig: MODEL_CONFIG
})
report.load = {
  firstLoadMs: Math.round(firstLoadMs),
  reloadMs: Math.round(performance.now() - t),
  rssAfterLoadMb: Math.round(rssAfterLoad)
}
log(
  `load: first ${report.load.firstLoadMs} ms (incl. download if not cached), reload ${report.load.reloadMs} ms, worker RSS ${report.load.rssAfterLoadMb} MB`
)

// --- corpus ---
const vault = buildVault(MAX_CHUNKS)
const docs = vault.chunks.map((chunk) => chunk.doc)

// --- single vs batch on a sample ---
const sample = docs.slice(0, 256)
await embedMany(id, sample.slice(0, 16), 16) // warm-up
report.throughput = {}
for (const batch of [1, 8, 32, 64]) {
  t = performance.now()
  await embedMany(id, sample, batch)
  const rate = sample.length / ((performance.now() - t) / 1000)
  report.throughput[`batch${batch}`] = Number(rate.toFixed(1))
}
log(`throughput (chunks/s, 256-chunk sample): ${JSON.stringify(report.throughput)}`)

// --- full index ---
const vectors = []
report.index = {}
t = performance.now()
for (let i = 0; i < docs.length; i += BATCH) {
  vectors.push(...(await embedMany(id, docs.slice(i, i + BATCH), BATCH)))
  for (const budget of BUDGETS) {
    if (vectors.length >= budget && !report.index[budget]) {
      const seconds = (performance.now() - t) / 1000
      report.index[budget] = {
        seconds: Number(seconds.toFixed(1)),
        chunksPerSec: Number((budget / seconds).toFixed(1)),
        notes: new Set(vault.chunks.slice(0, budget).map((c) => c.noteKey)).size
      }
      log(
        `indexed ${budget} chunks in ${report.index[budget].seconds}s (${report.index[budget].chunksPerSec}/s, ${report.index[budget].notes} notes)`
      )
    }
  }
}
report.dims = vectors[0].length

// --- queries ---
const qTexts = QUESTIONS.map((q) => queryPrompt(q.q))
const kTexts = QUESTIONS.map((q) => queryPrompt(q.keyword))
t = performance.now()
const qVecs = await embedMany(id, qTexts, 1)
report.queryEmbedMs = Number(((performance.now() - t) / qTexts.length).toFixed(1))
const kVecs = await embedMany(id, kTexts, 1)
sampleRss()
report.memory = { peakRssMb: Math.round(peakRssMb) }
log(`query embed ${report.queryEmbedMs} ms each; worker peak RSS ${report.memory.peakRssMb} MB`)
clearInterval(sampler)
await sdk.unloadModel({ modelId: id })
await sdk.close()

// --- stores ---
function buildStore(raw, dims, format) {
  const n = raw.length
  if (format === 'f32') {
    const data = new Float32Array(n * dims)
    raw.forEach((vec, i) => data.set(normalize(vec.slice(0, dims)), i * dims))
    return { dims, format, n, data, bytes: n * dims * 4 }
  }
  const data = new Int8Array(n * dims)
  const scales = new Float32Array(n)
  raw.forEach((vec, i) => {
    const unit = normalize(vec.slice(0, dims))
    let max = 0
    for (const value of unit) max = Math.max(max, Math.abs(value))
    const scale = max / 127 || 1
    scales[i] = scale
    for (let d = 0; d < dims; d++) data[i * dims + d] = Math.round(unit[d] / scale)
  })
  return { dims, format, n, data, scales, bytes: n * (dims + 4) }
}

function scoreAll(store, query, limit = store.n) {
  const q = normalize(query.slice(0, store.dims))
  const { data, dims } = store
  const scores = new Float32Array(limit)
  if (store.format === 'f32') {
    for (let i = 0; i < limit; i++) {
      let dot = 0
      const base = i * dims
      for (let d = 0; d < dims; d++) dot += data[base + d] * q[d]
      scores[i] = dot
    }
  } else {
    for (let i = 0; i < limit; i++) {
      let dot = 0
      const base = i * dims
      for (let d = 0; d < dims; d++) dot += data[base + d] * q[d]
      scores[i] = dot * store.scales[i]
    }
  }
  return scores
}

function topK(scores, k) {
  const best = []
  for (let i = 0; i < scores.length; i++) {
    if (best.length < k) {
      best.push(i)
      if (best.length === k) best.sort((a, b) => scores[b] - scores[a])
    } else if (scores[i] > scores[best[k - 1]]) {
      let at = k - 1
      while (at > 0 && scores[i] > scores[best[at - 1]]) at--
      best.splice(at, 0, i)
      best.pop()
    }
  }
  return best.sort((a, b) => scores[b] - scores[a])
}

// Note ranking = best chunk per note.
function vectorNoteRanking(store, query, budget) {
  const scores = scoreAll(store, query, budget)
  const order = topK(scores, 200)
  const seen = []
  for (const i of order) {
    const key = vault.chunks[i].noteKey
    if (!seen.includes(key)) seen.push(key)
  }
  return seen
}

const keyHash = (key) => {
  let hash = 2166136261
  for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  return hash >>> 0
}

async function substringIndex(budget) {
  const keys = new Set(vault.chunks.slice(0, budget).map((c) => c.noteKey))
  const notes = vault.notes.filter((note) => keys.has(note.key))
  const index = new NoteSearchIndex()
  await index.ensureWarm(async () =>
    notes.map((note) => ({
      key: note.key,
      value: { note: note.html, title: note.title, updatedAt: note.updatedAt }
    }))
  )
  // The index returns matches unranked; title hits first, then a neutral order.
  return (query) =>
    index
      .search({ query, folderKey: ALL_NOTES_KEY })
      .results.sort((a, b) => b.inTitle - a.inTitle || keyHash(a.key) - keyHash(b.key))
      .map((r) => r.key)
}

const rrf = (...rankings) => {
  const scores = new Map()
  for (const ranking of rankings)
    ranking
      .slice(0, 100)
      .forEach((key, rank) => scores.set(key, (scores.get(key) ?? 0) + 1 / (RRF_K + rank + 1)))
  return [...scores].sort((a, b) => b[1] - a[1]).map(([key]) => key)
}

function score(rankingFor) {
  let hits = 0
  let mrr = 0
  const misses = []
  const byKind = {}
  QUESTIONS.forEach((question, i) => {
    const ranking = rankingFor(question, i)
    const rank = ranking.indexOf(question.note)
    const hit = rank !== -1 && rank < TOP_K
    if (hit) hits++
    if (rank !== -1) mrr += 1 / (rank + 1)
    if (!hit) misses.push(`${question.id}${rank === -1 ? '' : `@${rank + 1}`}`)
    const kind = (byKind[question.kind] ??= [0, 0])
    kind[1]++
    if (hit) kind[0]++
  })
  return {
    recall5: Number((hits / QUESTIONS.length).toFixed(3)),
    mrr: Number((mrr / QUESTIONS.length).toFixed(3)),
    misses,
    byKind
  }
}

report.quality = []
const stores = {}
for (const dims of DIMS)
  for (const format of ['f32', 'int8'])
    stores[`${dims}-${format}`] = buildStore(vectors, dims, format)

for (const budget of BUDGETS) {
  const substring = await substringIndex(budget)
  for (const [name, store] of Object.entries(stores)) {
    const row = { budget, store: name }
    row.vectorQ = score((_, i) => vectorNoteRanking(store, qVecs[i], budget))
    row.vectorKw = score((_, i) => vectorNoteRanking(store, kVecs[i], budget))
    if (name === '768-f32') {
      row.substringQ = score((q) => substring(q.q))
      row.substringKw = score((q) => substring(q.keyword))
    }
    row.rrfQ = score((q, i) => rrf(vectorNoteRanking(store, qVecs[i], budget), substring(q.q)))
    row.rrfKw = score((q, i) =>
      rrf(vectorNoteRanking(store, kVecs[i], budget), substring(q.keyword))
    )
    report.quality.push(row)
  }
}

// --- latency: brute force over 10k and 50k (10k tiled with noise) ---
report.latency = {}
for (const name of ['768-f32', '768-int8', '512-int8', '256-f32', '256-int8']) {
  const [dims, format] = name.split('-')
  for (const n of [10000, 50000]) {
    const raw = Array.from({ length: n }, (_, i) => {
      const base = vectors[i % vectors.length]
      return i < vectors.length ? base : base.map((v) => v + (Math.random() - 0.5) * 0.02)
    })
    const store = buildStore(raw, Number(dims), format)
    for (let w = 0; w < 3; w++) topK(scoreAll(store, qVecs[w]), 50)
    const started = performance.now()
    for (const q of qVecs) topK(scoreAll(store, q), 50)
    report.latency[`${name}@${n}`] = {
      ms: Number(((performance.now() - started) / qVecs.length).toFixed(2)),
      mb: Number((store.bytes / 1e6).toFixed(1))
    }
  }
}

fs.writeFileSync(outPath, JSON.stringify(report, null, 2))

const fmt = (s) => `${s.recall5.toFixed(2)}/${s.mrr.toFixed(2)}`
log('\nrecall@5 / MRR (note level)')
for (const row of report.quality) {
  const sub = row.substringQ ? `  substr q ${fmt(row.substringQ)} kw ${fmt(row.substringKw)}` : ''
  log(
    `  ${String(row.budget).padStart(5)} ${row.store.padEnd(8)} vec q ${fmt(row.vectorQ)} kw ${fmt(row.vectorKw)}  rrf q ${fmt(row.rrfQ)} kw ${fmt(row.rrfKw)}${sub}`
  )
}
log('latency per query (ms) / store size (MB):')
log(
  '  ' +
    Object.entries(report.latency)
      .map(([k, v]) => `${k} ${v.ms}ms ${v.mb}MB`)
      .join(' | ')
)
log(`full report: ${outPath}`)
process.exit(0)
