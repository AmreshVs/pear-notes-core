// Load time, first-token time, decode speed and worker phys_footprint for one LLM.
//
//   node evals/llmProbe.mjs --model=QWEN3_4B_INST_Q4_K_M [--ctx=4096] [--runs=3]
//
// macOS only (vmmap). RSS counts the mapped weights; phys_footprint does not.
// The prompt is about the size of a vault Ask (1,500 tokens of sources).
import { execFileSync } from 'child_process'

import { buildVault } from './embedCorpus.mjs'
import { flag, importQvacSdk, MODEL } from './qvacRuntime.mjs'

const footprint = () => {
  const pid = execFileSync('pgrep', ['-P', String(process.pid), 'bare'], {
    encoding: 'utf8'
  })
    .trim()
    .split('\n')[0]
  const out = execFileSync('vmmap', ['--summary', pid], { encoding: 'utf8' })
  const rssKb = Number(execFileSync('ps', ['-o', 'rss=', '-p', pid], { encoding: 'utf8' }).trim())
  return {
    rss: `${(rssKb / 1024).toFixed(0)}M`,
    now: out.match(/Physical footprint:\s*(\S+)/)[1],
    peak: out.match(/Physical footprint \(peak\):\s*(\S+)/)[1]
  }
}

const ctx = Number(flag('ctx', '4096'))
const runs = Number(flag('runs', '3'))
const sdk = await importQvacSdk('llm-probe-qvac')

const loadedAt = performance.now()
const modelId = await sdk.loadModel({
  modelSrc: sdk[MODEL],
  modelType: 'llm',
  modelConfig: { ctx_size: ctx, tools: true }
})
const loadMs = performance.now() - loadedAt
const afterLoad = footprint()

const sources = buildVault(40)
  .chunks.slice(0, 12)
  .map((chunk, i) => `[${i + 1}] ${chunk.doc}`)
  .join('\n\n')
  .slice(0, 6000)
const history = [
  { role: 'system', content: 'Answer from the sources only, with [n] citations. /no_think' },
  { role: 'user', content: `${sources}\n\nQuestion: what are the main plans mentioned?` }
]

const rows = []
for (let i = 0; i < runs; i++) {
  const started = performance.now()
  let first = 0
  let tokens = 0
  const run = sdk.completion({ modelId, history, generationParams: { predict: 200 }, stream: true })
  for await (const event of run.events) {
    if (event.type !== 'contentDelta') continue
    if (!first) first = performance.now()
    tokens++
  }
  await run.final
  const end = performance.now()
  rows.push({
    ttftMs: first - started,
    tokPerS: (tokens - 1) / ((end - first) / 1000)
  })
}
const peak = footprint()
const median = (key) => rows.map((row) => row[key]).sort((a, b) => a - b)[Math.floor(rows.length / 2)]
console.log(
  `${MODEL} ctx=${ctx}  load ${(loadMs / 1000).toFixed(1)}s  ` +
    `first token ${(median('ttftMs') / 1000).toFixed(2)}s  ${median('tokPerS').toFixed(1)} tok/s  ` +
    `rss ${peak.rss}  footprint after load ${afterLoad.now}, after runs ${peak.now}, peak ${peak.peak}`
)
await sdk.unloadModel({ modelId })
await sdk.close()
process.exit(0)
