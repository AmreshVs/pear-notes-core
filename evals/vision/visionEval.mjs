// Offline vision eval (M3 step 6): OCR vs small VLMs on the rendered images.
//
//   node evals/vision/render.mjs   # once, writes evals/vision/images/
//   node evals/vision/visionEval.mjs --pipeline=ocr|visionpsy|gemma4-e2b|qwen35-08b [--only=id,id] [--out=file]
//
// Score = fraction of case facts found in the output (NFKC, lowercase, no whitespace).
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'

import { LOCAL_AI_OCR_LANGUAGES } from '../../store/services/localAiCatalog.js'
import { imageDetailsFromText } from '../../store/services/imageDetails.js'
import { EXTRACT_TEXT_PROMPT } from '../../store/services/localAiPrompts.js'
import { flag, HERE, importQvacSdk } from '../qvacRuntime.mjs'
import { CASES } from './cases.mjs'

const SPIKE_PROMPT =
  "Transcribe all the text in this image exactly, line by line, in its original language and script. Then add one line starting with 'Description:' that says what the image is."
const MAX_TOKENS = 400
// --prompt=app scores the Extract text prompt the apps ship.
const PROMPT_FLAG = flag('prompt', '')
// --prompt=details scores the Extract details fields instead of raw text.
const PROMPT =
  PROMPT_FLAG === 'app' || PROMPT_FLAG === 'details' ? EXTRACT_TEXT_PROMPT : SPIKE_PROMPT
const PASS_AT = 0.8
const OCR_MAG_RATIO = 1
const OCR_CANVAS_SIZE = 1600

const VLMS = {
  visionpsy: [
    'VISIONPSY_NANO_460M_MULTIMODAL_Q4_K_M',
    'MMPROJ_VISIONPSY_NANO_460M_MULTIMODAL_Q8_0',
    { image_no_upscale: 'on' },
    {}
  ],
  'gemma4-e2b': ['GEMMA4_2B_MULTIMODAL_Q4_K_M', 'MMPROJ_GEMMA4_2B_MULTIMODAL_Q8_0', {}, {}],
  'qwen35-08b': [
    'QWEN3_5_0_8B_MULTIMODAL_Q4_K_M',
    'MMPROJ_QWEN3_5_0_8B_MULTIMODAL_Q8_0',
    { reasoning_budget: 0 },
    { reasoning_budget: 0 }
  ]
}

const pipeline = flag('pipeline', 'ocr')
if (pipeline !== 'ocr' && !VLMS[pipeline]) {
  console.error(`Unknown --pipeline=${pipeline}. Use ocr, ${Object.keys(VLMS).join(', ')}.`)
  process.exit(1)
}
const only = flag('only', '')
const picked = only ? CASES.filter((c) => only.split(',').includes(c.id)) : CASES
const cases = PROMPT_FLAG === 'details' ? picked.filter((c) => c.details) : picked
const outPath = flag('out', path.join(HERE, 'out', 'm3', `vision-${pipeline}.json`))
const imagesDir = path.join(HERE, 'vision', 'images')

const norm = (s) => String(s).normalize('NFKC').toLowerCase().replace(/\s+/g, '')
const score = (output, facts) => {
  const hay = norm(output)
  return facts.filter((f) => hay.includes(norm(f))).length / facts.length
}
const scoreDetails = (output, expected) => {
  const details = imageDetailsFromText(output)
  const values = new Map(details.fields.map(([key, value]) => [key, norm(value)]))
  return (
    expected.filter(([key, value]) =>
      key === 'type'
        ? details.type === value
        : key === 'item'
          ? details.items.some((item) => norm(item).includes(norm(value)))
          : (values.get(key) ?? '').includes(norm(value))
    ).length / expected.length
  )
}
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0

const workerRss = () => {
  try {
    const pid = execFileSync('pgrep', ['-P', String(process.pid), 'bare'], { encoding: 'utf8' })
      .trim()
      .split('\n')[0]
    return Number(execFileSync('ps', ['-o', 'rss=', '-p', pid], { encoding: 'utf8' }).trim()) / 1024
  } catch {
    return null
  }
}

const sdk = await importQvacSdk('vision-eval-qvac')
const loadedAt = performance.now()
let modelId
if (pipeline === 'ocr') {
  modelId = await sdk.loadModel({
    modelSrc: sdk.OCR_LATIN,
    modelType: 'ocr',
    modelConfig: {
      detectorModelSrc: sdk.OCR_CRAFT,
      langList: LOCAL_AI_OCR_LANGUAGES,
      magRatio: OCR_MAG_RATIO,
      canvasSize: OCR_CANVAS_SIZE,
      defaultRotationAngles: [],
      backendDevice: process.platform === 'darwin' ? 'metal' : 'cpu'
    }
  })
} else {
  const [model, projection, loadExtra] = VLMS[pipeline]
  if (!sdk[model] || !sdk[projection]) {
    console.error(`SDK lacks ${model} or ${projection}`)
    process.exit(1)
  }
  modelId = await sdk.loadModel({
    modelSrc: sdk[model],
    modelType: 'llm',
    modelConfig: { ctx_size: 4096, projectionModelSrc: sdk[projection], ...loadExtra }
  })
}
const loadMs = Math.round(performance.now() - loadedAt)

async function recognize(file) {
  if (pipeline === 'ocr') {
    const { blockStream } = sdk.ocr({ modelId, image: fs.readFileSync(file), stream: true })
    const blocks = []
    for await (const chunk of blockStream) blocks.push(...chunk)
    return blocks.map((b) => b.text ?? '').join('\n')
  }
  const run = sdk.completion({
    modelId,
    history: [{ role: 'user', content: PROMPT, attachments: [{ path: file }] }],
    generationParams: { predict: MAX_TOKENS, ...VLMS[pipeline][3] },
    stream: true
  })
  return String((await run.final).contentText ?? '')
}

const results = []
for (const c of cases) {
  const file = path.join(imagesDir, `${c.id}.png`)
  if (!fs.existsSync(file)) {
    console.error(`missing ${file}; run evals/vision/render.mjs`)
    process.exit(1)
  }
  const started = performance.now()
  let output = ''
  let error = null
  try {
    output = await recognize(file)
  } catch (err) {
    error = String(err?.message ?? err)
  }
  const ms = Math.round(performance.now() - started)
  const s = PROMPT_FLAG === 'details' ? scoreDetails(output, c.details) : score(output, c.facts)
  results.push({ id: c.id, kind: c.kind, score: s, ok: s >= PASS_AT, ms, error, output })
  if (!results.at(-1).ok) {
    console.log(
      `  fail ${c.id} ${s.toFixed(2)}: ${(error ?? output).replace(/\s+/g, ' ').slice(0, 80)}`
    )
  }
}
const rssMb = workerRss()

const summary = {
  pipeline,
  passed: results.filter((r) => r.ok).length,
  total: results.length,
  meanScore: results.reduce((a, r) => a + r.score, 0) / (results.length || 1),
  perKind: {},
  loadMs,
  medianMsPerImage: median(results.map((r) => r.ms)),
  rssMb: rssMb && Math.round(rssMb)
}
for (const kind of new Set(results.map((r) => r.kind))) {
  const items = results.filter((r) => r.kind === kind)
  summary.perKind[kind] = Number((items.reduce((a, r) => a + r.score, 0) / items.length).toFixed(2))
}
fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, JSON.stringify({ summary, results }, null, 2))

console.log(
  `\n${pipeline}: ${summary.passed}/${summary.total} passed  mean ${summary.meanScore.toFixed(3)}\n` +
    `  per kind: ${Object.entries(summary.perKind)
      .map(([k, v]) => `${k} ${v}`)
      .join('  ')}\n` +
    `  load ${loadMs} ms  median ${summary.medianMsPerImage} ms/image  rss ${summary.rssMb ?? '?'} MB\n` +
    `  full outputs: ${outPath}`
)
await sdk.unloadModel({ modelId })
await sdk.close()
process.exit(0)
