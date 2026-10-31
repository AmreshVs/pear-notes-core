// Offline accuracy check for Ask a note.
//
// Runs the shipping pipeline — runAsk and resolveAskTurn — against a
// real on-device model, and scores the resulting turn. Unit tests pin the
// parsing and validation around the model; this is the only thing that tells
// you whether the feature actually answers and edits correctly.
//
// It needs the QVAC runtime and the downloaded models a desktop dev build
// installs, so it is not part of `npm test`.
//
//   node evals/askEval.mjs [--suite=cases-editor] [--best | --model=<registry name>]
//                          [--repeat=3] [--think=auto]
//                          [--only=id,id] [--out=report.json]
//                          [--runtime=<dir>] [--models=<dir>]
//
//   --best     run the best tier (Qwen3 1.7B) instead of standard (0.6B)
//   --model    any registry LLM, e.g. QWEN3_4B_INST_Q4_K_M
//   --think    on, off or auto (default): Qwen3 thinking for questions
//   --repeat   run every case N times; sampling is not deterministic
//   --flat     suite option: render notes the pre-2026-09 flat way
//   --conversation  ask each note's questions in order as one live thread (edit cases skipped)
//   --cache    pass cache: true to runAsk (KV cache plus exact replay of clean answers)
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

import {
  createAskTurn,
  getAskHistory,
  resolveAskTurn,
  runAsk
} from '../store/services/localAiAsk.js'
import { LLM_CONTEXT_SIZE } from '../store/services/localAiPrompts.js'
import { applyEvalSwitches } from './qvacRuntime.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const flag = (name, fallback) =>
  (process.argv.find((arg) => arg.startsWith(`--${name}=`)) ?? '').split('=')[1] ?? fallback

const RUNTIME_DIR = flag('runtime', path.join(HERE, '..', '..', 'pear-notes-desktop', 'local-ai'))
const MODELS_DIR = flag(
  'models',
  path.join(os.homedir(), 'Library', 'Application Support', 'PearNotes-dev-local-ai', 'models')
)
const SDK_ENTRY = path.join(RUNTIME_DIR, 'node_modules', '@qvac', 'sdk', 'dist', 'src', 'index.js')
const WORKER_ENTRY = path.join(RUNTIME_DIR, 'qvac', 'worker.entry.mjs')
const MODEL =
  flag('model', '') ||
  (process.argv.includes('--best') ? 'QWEN3_1_7B_INST_Q4' : 'QWEN3_600M_INST_Q4')
const SUITE = flag('suite', 'cases-editor')
const ONLY = flag('only', '')
const OUT = flag('out', '')
const REPEAT = Number(flag('repeat', '1'))
const THINK = { on: true, off: false }[flag('think', 'auto')] ?? 'auto'
const CONVERSATION = process.argv.includes('--conversation')
const CACHE = process.argv.includes('--cache')

if (!fs.existsSync(SDK_ENTRY)) {
  console.error(
    `No QVAC runtime at ${RUNTIME_DIR}.\n` +
      'Install the desktop local-ai runtime first, or pass --runtime=<dir>.'
  )
  process.exit(1)
}

const configPath = path.join(os.tmpdir(), 'pear-notes-ask-eval.json')
fs.writeFileSync(configPath, JSON.stringify({ cacheDirectory: MODELS_DIR }))
process.env.QVAC_CONFIG_PATH = configPath
process.env.QVAC_WORKER_PATH = WORKER_ENTRY

const sdk = await import(pathToFileURL(SDK_ENTRY).href)
const { CASES } = await import(pathToFileURL(path.join(HERE, `${SUITE}.mjs`)).href)

async function complete(params) {
  const run = sdk.completion({ ...applyEvalSwitches(params), stream: true })
  return String((await run.final).contentText ?? '')
}

const askAboutNote = (modelId, note, turns, question, trace) =>
  runAsk({
    note,
    turns,
    question,
    trace,
    think: THINK,
    cache: CACHE,
    complete: (params) => complete({ modelId, ...params })
  })

function check(testCase, turn) {
  const want = testCase.expect
  const text = turn.editedText ?? null
  const normalize = (value) =>
    String(value ?? '')
      .toLowerCase()
      .replace(/(\d)[,\u202f ](?=\d{3}\b)/g, '$1')
  const answer = normalize(turn.answer)
  const fails = []
  if (want.kind === 'anyChange') {
    if (!text || text === testCase.note) {
      fails.push(`no change applied (kind=${turn.kind}, error=${turn.error})`)
    }
  } else if (turn.kind !== want.kind) {
    fails.push(`kind=${turn.kind} want=${want.kind}${turn.error ? ` error=${turn.error}` : ''}`)
  }
  if (want.text !== undefined && text !== want.text) {
    fails.push(`text mismatch:\n--- got ---\n${text}\n--- want ---\n${want.text}`)
  }
  for (const needle of want.textIncludes ?? []) {
    if (!String(text ?? '').includes(needle)) fails.push(`text missing "${needle}"`)
  }
  for (const needle of want.textExcludes ?? []) {
    if (String(text ?? '').includes(needle)) fails.push(`text still has "${needle}"`)
  }
  for (const needle of want.keepsAll ?? []) {
    if (!String(text ?? '').includes(needle)) fails.push(`lost "${needle}" from the note`)
  }
  for (const needle of want.answerIncludes ?? []) {
    if (!answer.includes(normalize(needle))) fails.push(`answer missing "${needle}"`)
  }
  const alternatives = want.answerIncludesAny ?? []
  if (alternatives.length && !alternatives.some((item) => answer.includes(normalize(item)))) {
    fails.push(`answer has none of ${alternatives.map((item) => `"${item}"`).join(', ')}`)
  }
  for (const needle of want.answerExcludes ?? []) {
    if (answer.includes(normalize(needle))) fails.push(`answer has "${needle}"`)
  }
  return fails
}

const loadedAt = Date.now()
const modelId = await sdk.loadModel({
  modelSrc: sdk[MODEL],
  modelType: 'llm',
  modelConfig: { ctx_size: LLM_CONTEXT_SIZE }
})
console.log(`${MODEL} loaded in ${Date.now() - loadedAt}ms — suite ${SUITE}, repeat ${REPEAT}`)

const selected = ONLY ? CASES.filter((item) => ONLY.split(',').includes(item.id)) : CASES
const isQuestionCase = (item) =>
  !item.turns?.length && (item.expect.kind === 'answer' || item.expect.kind === 'notFound')
const threads = new Map()
for (const item of CONVERSATION ? selected.filter(isQuestionCase) : selected) {
  const key = CONVERSATION ? item.note : item.id
  threads.set(key, [...(threads.get(key) ?? []), item])
}
const results = []
for (const [, thread] of threads) {
  for (let pass = 0; pass < REPEAT; pass++) {
    const asked = []
    for (const testCase of thread) {
      results.push(await runCase(testCase, asked))
    }
  }
}

async function runCase(testCase, asked) {
  const started = Date.now()
  const trace = {}
  let turn
  let crash = null
  try {
    const raw = await askAboutNote(
      modelId,
      testCase.note,
      CONVERSATION ? getAskHistory(asked) : (testCase.turns ?? []),
      testCase.question,
      trace
    )
    turn = resolveAskTurn(createAskTurn(asked.length + 1, testCase.question), testCase.note, raw)
    asked.push(turn)
  } catch (error) {
    crash = String(error?.stack ?? error)
    turn = { kind: null, answer: '', error: 'crash', editedText: null }
  }
  const fails = crash ? [crash] : check(testCase, turn)
  const result = {
    id: testCase.id,
    group: testCase.group,
    question: testCase.question,
    note: testCase.note,
    ok: fails.length === 0,
    ms: Date.now() - started,
    fails,
    turn,
    trace
  }
  console.log(
    `${fails.length === 0 ? 'PASS' : 'FAIL'} ${testCase.id} (${Date.now() - started}ms) ` +
      fails.join(' | ').slice(0, 300)
  )
  return result
}

const passed = results.filter((item) => item.ok).length
console.log(`\n${passed}/${results.length} passed  model=${MODEL}  suite=${SUITE}`)
const groups = new Map()
const perCase = new Map()
for (const item of results) {
  for (const [map, key] of [
    [groups, item.group],
    [perCase, item.id]
  ]) {
    const entry = map.get(key) ?? { pass: 0, total: 0 }
    entry.total++
    if (item.ok) entry.pass++
    map.set(key, entry)
  }
}
for (const [group, score] of groups) console.log(`  ${group}: ${score.pass}/${score.total}`)
const shaky = [...perCase].filter(([, score]) => score.pass < score.total)
if (shaky.length) {
  console.log('\nfailing or flaky:')
  for (const [id, score] of shaky) console.log(`  ${id}: ${score.pass}/${score.total}`)
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify({ model: MODEL, suite: SUITE, results }, null, 2))
await sdk.unloadModel({ modelId })
await sdk.close()
process.exit(passed === results.length ? 0 : 1)
