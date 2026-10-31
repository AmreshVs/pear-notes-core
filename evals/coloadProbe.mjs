// Worker RSS with an LLM and the embedding model loaded together, and the
// query-embed + first-token time of a vault Ask with no model switch.
//
//   node evals/coloadProbe.mjs --model=QWEN3_4B_INST_Q4_K_M
import { execFileSync } from 'child_process'

import { LLM_CONTEXT_SIZE } from '../store/services/localAiPrompts.js'
import { LOCAL_AI_EMBEDDING_MODEL } from '../store/services/localAiTiers.js'
import { importQvacSdk, MODEL } from './qvacRuntime.mjs'

const rss = () => {
  const pid = execFileSync('pgrep', ['-P', String(process.pid), 'bare'], { encoding: 'utf8' })
    .trim()
    .split('\n')[0]
  const kb = Number(execFileSync('ps', ['-o', 'rss=', '-p', pid], { encoding: 'utf8' }).trim())
  return `${(kb / 1024).toFixed(0)}M`
}

const sdk = await importQvacSdk('coload-probe-qvac')
const llm = await sdk.loadModel({
  modelSrc: sdk[MODEL],
  modelType: 'llm',
  modelConfig: { ctx_size: LLM_CONTEXT_SIZE, tools: true }
})
const embedder = await sdk.loadModel({
  modelSrc: sdk[LOCAL_AI_EMBEDDING_MODEL.model],
  modelType: 'embeddings',
  modelConfig: LOCAL_AI_EMBEDDING_MODEL.modelConfig
})
const started = performance.now()
await sdk.embed({ modelId: embedder, text: ['what did I spend on groceries in September'] })
const embedMs = performance.now() - started
const run = sdk.completion({
  modelId: llm,
  history: [{ role: 'user', content: 'Say hello. /no_think' }],
  generationParams: { predict: 20 },
  stream: true
})
let first = 0
for await (const event of run.events) if (event.type === 'contentDelta' && !first) first = performance.now()
await run.final
console.log(
  `${MODEL} + embedding  rss ${rss()}  query embed ${embedMs.toFixed(0)}ms  ` +
    `embed→first token ${((first - started) / 1000).toFixed(2)}s`
)
await sdk.unloadModel({ modelId: embedder })
await sdk.unloadModel({ modelId: llm })
await sdk.close()
process.exit(0)
