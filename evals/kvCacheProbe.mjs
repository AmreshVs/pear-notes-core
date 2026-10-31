// Follow-up time to first token for in-note Ask with and without the SDK's auto KV cache.
//
//   node evals/kvCacheProbe.mjs [--best] [--note-chars=6000] [--turns=3]
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

import { flag, importQvacSdk, MODEL } from './qvacRuntime.mjs'
import {
  createAskTurn,
  getAskHistory,
  resolveAskTurn,
  runAsk
} from '../store/services/localAiAsk.js'
import { LLM_CONTEXT_SIZE } from '../store/services/localAiPrompts.js'

const NOTE_CHARS = Number(flag('note-chars', '6000'))
const TURNS = Number(flag('turns', '3'))
const KV_DIR = path.join(process.env.QVAC_HOME_DIR ?? os.homedir(), '.qvac', 'kv-cache')
const QUESTIONS = [
  'Who writes the press release?',
  'When is the launch?',
  'What did we decide about the venue?',
  'Who presents the demo?'
]
const PARAGRAPH =
  'Launch planning. The launch is on 3 November. Priya owns the budget review and will send it by Friday. Ben booked the venue in Shoreditch for 120 people. Tom presents the demo; Anna writes the press release. Catering is from the deli on Brick Lane. '
const note = PARAGRAPH.repeat(Math.ceil(NOTE_CHARS / PARAGRAPH.length)).slice(0, NOTE_CHARS)

const sdk = await importQvacSdk('pear-notes-kv-probe')
const modelId = await sdk.loadModel({
  modelSrc: sdk[MODEL],
  modelType: 'llm',
  modelConfig: { ctx_size: LLM_CONTEXT_SIZE }
})

const peakFootprint = () => {
  try {
    const pid = execFileSync('pgrep', ['-P', String(process.pid), 'bare'], { encoding: 'utf8' })
      .trim()
      .split('\n')[0]
    const out = execFileSync('vmmap', ['--summary', pid], { encoding: 'utf8' })
    return out.match(/Physical footprint \(peak\):\s*(\S+)/)[1]
  } catch {
    return '?'
  }
}

async function complete(params, onText = () => {}) {
  const started = performance.now()
  const run = sdk.completion({ modelId, ...params, stream: true })
  let streamed = ''
  for await (const event of run.events) {
    if (event.type !== 'contentDelta') continue
    if (!streamed) firstTokens.push(performance.now() - started)
    streamed += event.text
    onText(streamed)
  }
  const text = String((await run.final).contentText ?? '')
  totals.push(performance.now() - started)
  return text
}

const dirBytes = (dir) => {
  if (!fs.existsSync(dir)) return 0
  let total = 0
  for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) total += fs.statSync(path.join(entry.parentPath, entry.name)).size
  }
  return total
}

let firstTokens = []
let totals = []
for (const cache of [false, true, false, true]) {
  await sdk.deleteCache({ all: true }).catch(() => {})
  let turns = []
  const rows = []
  for (let index = 0; index < TURNS; index++) {
    firstTokens = []
    totals = []
    const question = QUESTIONS[index]
    const raw = await runAsk({ note, turns: getAskHistory(turns), question, complete, cache })
    const turn = resolveAskTurn(createAskTurn(index + 1, question), note, raw)
    turns = [...turns, turn]
    rows.push(
      `${(firstTokens[0] / 1000).toFixed(2)}/${(totals.at(-1) / 1000).toFixed(2)}s${turn.replay ? '' : '*'}`
    )
  }
  console.log(
    `cache=${cache}  first token/total per turn: ${rows.join('  ')}  kv on disk ${(dirBytes(KV_DIR) / 1e6).toFixed(0)} MB  peak footprint ${peakFootprint()}  (* = not replayable)`
  )
}
await sdk.deleteCache({ all: true }).catch(() => {})
await sdk.unloadModel({ modelId })
await sdk.close()
