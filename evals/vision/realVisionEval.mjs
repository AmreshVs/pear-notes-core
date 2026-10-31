// Extract text and Describe image on real screenshots and photos, through the shipping pipeline
// (slices, loop guard, retry, caption cleanup). Images are not committed: see realCases.mjs.
//
//   node evals/vision/realVisionEval.mjs --task=extract|describe [--pipeline=after|before|ocr] [--repeat=3] [--only=ios,photo]
//
// --pipeline=ocr reads text with the QVAC OCR models (OCR_LATIN + OCR_CRAFT), as the apps do;
// add --ocr=doctr for the DocTR pipeline and --canvas=<px> for the detection canvas.
// --pipeline=before replays the 2026-10-15 shipped behaviour (old prompts, no slicing, no guard).
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'

import { LOCAL_AI_OCR_LANGUAGES } from '../../store/services/localAiCatalog.js'
import {
  cleanImageDescription,
  cleanModelOutput,
  DESCRIBE_IMAGE_MAX_SIDE,
  DESCRIBE_IMAGE_PROMPT,
  DESCRIBE_MAX_TOKENS,
  EXTRACT_IMAGE_MAX_SIDE,
  EXTRACT_SLICE_MAX_SIDE,
  EXTRACT_TEXT_MAX_TOKENS,
  EXTRACT_TEXT_PROMPT,
  LLM_CONTEXT_SIZE,
  LLM_TEMPERATURE,
  planTextSlices,
  readImageTextSlices,
  VISION_GENERATION_PARAMS
} from '../../store/services/localAiPrompts.js'
import { formatOcrBlocks } from '../../store/services/localAiText.js'
import { flag, HERE, importQvacSdk } from '../qvacRuntime.mjs'
import { REAL_CASES } from './realCases.mjs'

const BEFORE_EXTRACT_PROMPT =
  'Transcribe all the text in this image exactly as written, line by line, in its original language and script. Reply with the text only. If there is no text, reply with nothing.'
const BEFORE_DESCRIBE_PROMPT =
  'Describe this image for someone who cannot see it, in one or two short sentences. If it contains readable text, mention the key words. Do not start with "The image shows".'
const CAPTION_MAX_WORDS = 30
const NO_TEXT_MAX_WORDS = 3
const LOOP_LINE_REPEATS = 4

const task = flag('task', 'extract')
const pipeline = flag('pipeline', 'after')
const repeat = Number(flag('repeat', '1'))
const only = flag('only', '')
const imagesDir = flag('images', path.join(HERE, 'vision', 'real'))
const outPath = flag('out', path.join(HERE, 'out', 'vision-real', `${task}-${pipeline}.json`))
const workDir = path.join(HERE, 'out', 'vision-real', 'prepared')
const before = pipeline === 'before'
const useOcr = pipeline === 'ocr'
const ocrCanvas = Number(flag('canvas', '1280'))
const doctr = flag('ocr', 'easyocr') === 'doctr'
const sliceSide = Number(flag('slice-side', String(EXTRACT_SLICE_MAX_SIDE)))

const cases = REAL_CASES.filter(
  (c) => !only || only.split(',').some((prefix) => c.id.startsWith(prefix))
)
const missing = cases.filter((c) => !fs.existsSync(path.join(imagesDir, `${c.id}.png`)))
if (missing.length) {
  console.error(`Missing images in ${imagesDir}: ${missing.map((c) => c.id).join(', ')}`)
  process.exit(1)
}

const norm = (s) => String(s).normalize('NFKC').toLowerCase().replace(/\s+/g, '')
const words = (s) => String(s).split(/\s+/).filter(Boolean).length
const loops = (s) => {
  const lines = String(s)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  return lines.some(
    (line, i) =>
      i >= LOOP_LINE_REPEATS - 1 &&
      lines.slice(i - LOOP_LINE_REPEATS + 1, i + 1).every((l) => l === line)
  )
}

function imageSize(file) {
  const [width, height] = execFileSync('magick', ['identify', '-format', '%w %h', file], {
    encoding: 'utf8'
  })
    .trim()
    .split(' ')
    .map(Number)
  return { width, height }
}

// Same steps as the apps: crop each slice, then fit its long side as JPEG 90.
function prepare(id, wholeSide, slicePlan) {
  const source = path.join(imagesDir, `${id}.png`)
  const { width, height } = imageSize(source)
  const slices = slicePlan
    ? planTextSlices(width, height)
    : [{ originX: 0, originY: 0, width, height }]
  const maxSide = slices.length > 1 ? sliceSide : wholeSide
  fs.mkdirSync(workDir, { recursive: true })
  return slices.map((slice, index) => {
    const target = path.join(workDir, `${id}-${maxSide}-${slices.length}-${index}.jpg`)
    execFileSync('magick', [
      source,
      '-crop',
      `${slice.width}x${slice.height}+${slice.originX}+${slice.originY}`,
      '+repage',
      '-resize',
      `${maxSide}x${maxSide}>`,
      '-quality',
      '90',
      target
    ])
    return target
  })
}

const sdk = await importQvacSdk('vision-real-eval-qvac')
const modelId = useOcr
  ? await sdk.loadModel({
      modelSrc: doctr ? sdk.OCR_DOCTR : sdk.OCR_LATIN,
      modelType: 'ocr',
      modelConfig: doctr
        ? { detectorModelSrc: sdk.OCR_DOCTR_1, pipelineType: 'doctr', backendDevice: 'metal' }
        : {
            detectorModelSrc: sdk.OCR_CRAFT,
            langList: LOCAL_AI_OCR_LANGUAGES,
            magRatio: 1,
            canvasSize: ocrCanvas,
            defaultRotationAngles: [],
            recognizerBatchSize: 8,
            backendDevice: 'metal'
          }
    })
  : await sdk.loadModel({
      modelSrc: sdk.QWEN3_5_0_8B_MULTIMODAL_Q4_K_M,
      modelType: 'llm',
      modelConfig: {
        ctx_size: LLM_CONTEXT_SIZE,
        projectionModelSrc: sdk.MMPROJ_QWEN3_5_0_8B_MULTIMODAL_Q8_0,
        ...VISION_GENERATION_PARAMS
      }
    })

async function readOcr(file) {
  const { blockStream } = sdk.ocr({ modelId, image: file, stream: true })
  const blocks = []
  for await (const chunk of blockStream) blocks.push(...chunk)
  return formatOcrBlocks(blocks)
}

async function complete(file, prompt, generationParams, onStreamed) {
  const run = sdk.completion({
    modelId,
    history: [{ role: 'user', content: prompt, attachments: [{ path: file }] }],
    generationParams: { ...VISION_GENERATION_PARAMS, ...generationParams },
    stream: true
  })
  let streamed = ''
  for await (const event of run.events) {
    if (event.type !== 'contentDelta') continue
    streamed += event.text ?? ''
    if (onStreamed?.(streamed)) {
      await sdk.cancel({ requestId: run.requestId }).catch(() => {})
      await run.final.catch(() => {})
      return streamed
    }
  }
  return String((await run.final).contentText ?? '')
}

async function extract(id) {
  if (useOcr) return readOcr(prepare(id, EXTRACT_IMAGE_MAX_SIDE, false)[0])
  const files = prepare(id, EXTRACT_IMAGE_MAX_SIDE, !before)
  const params = { temp: 0, predict: EXTRACT_TEXT_MAX_TOKENS }
  if (before) return cleanModelOutput(await complete(files[0], BEFORE_EXTRACT_PROMPT, params))
  return readImageTextSlices(files, (file, extra, onStreamed) =>
    complete(file, EXTRACT_TEXT_PROMPT, { ...params, ...extra }, onStreamed)
  )
}

async function describe(id) {
  const [file] = prepare(id, DESCRIBE_IMAGE_MAX_SIDE, false)
  const params = { temp: LLM_TEMPERATURE, predict: DESCRIBE_MAX_TOKENS }
  const output = await complete(
    file,
    before ? BEFORE_DESCRIBE_PROMPT : DESCRIBE_IMAGE_PROMPT,
    params
  )
  return before ? cleanModelOutput(output) : cleanImageDescription(output)
}

function scoreExtract(c, output) {
  if (!c.facts.length) return words(output) <= NO_TEXT_MAX_WORDS ? 1 : 0
  return c.facts.filter((fact) => norm(output).includes(norm(fact))).length / c.facts.length
}

// A caption passes when it names the subject, stays short and skips the "This image" opener.
function scoreDescribe(c, output) {
  const lower = output.toLowerCase()
  const onTopic = c.about.some((word) => lower.includes(word))
  return onTopic &&
    words(output) <= CAPTION_MAX_WORDS &&
    !/^(this|the) (image|photo|screenshot)/i.test(output)
    ? 1
    : 0
}

const rows = []
for (const c of cases) {
  for (let run = 0; run < repeat; run++) {
    const started = performance.now()
    let output = ''
    let error = null
    try {
      output = task === 'describe' ? await describe(c.id) : await extract(c.id)
    } catch (err) {
      error = String(err?.message ?? err)
    }
    const score = task === 'describe' ? scoreDescribe(c, output) : scoreExtract(c, output)
    rows.push({
      id: c.id,
      run,
      score,
      loop: loops(output),
      words: words(output),
      ms: Math.round(performance.now() - started),
      error,
      output
    })
  }
}

fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, JSON.stringify(rows, null, 2))
const mean = (items, key) =>
  items.reduce((sum, item) => sum + Number(item[key]), 0) / (items.length || 1)
console.log(`${task} pipeline=${pipeline} repeat=${repeat}`)
for (const c of cases) {
  const items = rows.filter((row) => row.id === c.id)
  const passes = items.filter((row) => row.score >= 0.8).length
  console.log(
    `  ${c.id.padEnd(22)} ${mean(items, 'score').toFixed(2)}  pass ${passes}/${items.length}  loops ${items.filter((r) => r.loop).length}  words ${Math.round(mean(items, 'words'))}  ${Math.round(mean(items, 'ms'))} ms`
  )
}
console.log(
  `  MEAN ${mean(rows, 'score').toFixed(3)}  pass ${rows.filter((r) => r.score >= 0.8).length}/${rows.length}  loops ${rows.filter((r) => r.loop).length}  median ${[...rows.map((r) => r.ms)].sort((a, b) => a - b)[rows.length >> 1]} ms\n  full outputs: ${outPath}`
)
await sdk.unloadModel({ modelId })
await sdk.close()
process.exit(0)
