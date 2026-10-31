// Worker phys_footprint (vmmap) after load and after each embed batch size.
//
//   node evals/embedMemProbe.mjs --models=<cache dir> [--model=Q4] [--device=cpu] [--batch-size=512]
//
// macOS only. batchSize (tokens per llama.cpp batch) is what drives memory.
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { pathToFileURL } from 'url'

import { buildVault } from './embedCorpus.mjs'
import { flag, HERE } from './qvacRuntime.mjs'

const MODELS = { Q4: 'EMBEDDINGGEMMA_300M_Q4_0', Q8: 'EMBEDDINGGEMMA_300M_Q8_0' }
const runtimeDir = flag('runtime', path.join(HERE, '..', '..', 'pear-notes-desktop', 'local-ai'))
const modelsDir = flag('models')
if (!modelsDir) {
  console.error('Pass --models=<cache dir outside the dev app>')
  process.exit(1)
}
const configPath = path.join(os.tmpdir(), 'embed-mem-probe-qvac.json')
fs.writeFileSync(configPath, JSON.stringify({ cacheDirectory: modelsDir }))
process.env.QVAC_CONFIG_PATH = configPath
process.env.QVAC_WORKER_PATH = path.join(runtimeDir, 'qvac', 'worker.entry.mjs')
const sdk = await import(
  pathToFileURL(path.join(runtimeDir, 'node_modules', '@qvac', 'sdk', 'dist', 'src', 'index.js'))
    .href
)

const footprint = () => {
  const pid = execFileSync('pgrep', ['-P', String(process.pid), 'bare'], {
    encoding: 'utf8'
  }).trim()
  const out = execFileSync('vmmap', ['--summary', pid], { encoding: 'utf8' })
  return out.match(/Physical footprint \(peak\):\s*(\S+)/)[1]
}

const batchSize = flag('batch-size')
const device = flag('device', 'gpu')
const modelId = await sdk.loadModel({
  modelSrc: sdk[MODELS[flag('model', 'Q4')]],
  modelType: 'embeddings',
  modelConfig: { device, ...(batchSize ? { batchSize: Number(batchSize) } : {}) }
})
const line = [`${device} batchSize=${batchSize || 'default'}`, `loaded peak ${footprint()}`]
const docs = buildVault(400).chunks.map((chunk) => chunk.doc)
for (const n of [1, 8, 32, 64]) {
  const started = performance.now()
  for (let i = 0; i < 256; i += n)
    await sdk.embed({ modelId, text: n === 1 ? docs[i] : docs.slice(i, i + n) })
  line.push(
    `batch ${n}: ${(256 / ((performance.now() - started) / 1000)).toFixed(0)}/s peak ${footprint()}`
  )
}
console.log(line.join(' | '))
await sdk.unloadModel({ modelId })
await sdk.close()
process.exit(0)
