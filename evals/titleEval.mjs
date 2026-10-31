// Note titles: the shipping prompt, params and parser on every note in the Ask suites.
//
//   node evals/titleEval.mjs [--model=<registry name> | --best] [--repeat=3] [--predict=<n>] [--out=<json>]
//
// --reasoning-budget=unset reproduces the pre-2026-10-14 params (thinking off by /no_think only).
// --no-think-switch=off drops /no_think from the prompt.
import fs from 'fs'

import { CASES as EDITOR_CASES } from './cases-editor.mjs'
import { CASES as NOTE_CASES } from './cases-notes.mjs'
import { CASES as REASONING_CASES } from './cases-reasoning.mjs'
import { flag, loadQvac, summarize } from './qvacRuntime.mjs'
import {
  buildNoteTaskMessages,
  getNoteTaskGenerationParams,
  NOTE_TASK,
  parseTitleOutput
} from '../store/services/localAiPrompts.js'

const REPEAT = Number(flag('repeat', '1'))
const PREDICT = Number(flag('predict', '0'))
const OUT = flag('out', '')

// List-shaped notes, as htmlToNoteText renders them, made 0.6B deliberate before reasoning_budget.
const LISTS = [
  '- milk\n- eggs\n- sourdough\n- 2 lemons\n- coffee beans',
  '- [ ] renew passport\n- [ ] book dentist\n- [x] pay council tax\n- [ ] call Sam about the car',
  'Packing\n- charger\n- swimsuit\n- sunscreen\n- passport\n- adapter plug',
  '1. Preheat oven to 200C\n2. Chop the squash\n3. Roast 40 minutes\n4. Blend with stock',
  'Books to read\n- The Overstory\n- Piranesi\n- Klara and the Sun',
  'Ideas\n- weekly newsletter\n- referral codes\n- dark mode',
  'Lista de la compra\n- tomates\n- pan\n- aceite de oliva\n- queso manchego',
  'wifi password is on the router, guest network is Pear-Guest'
]
const notes = [
  ...new Set([...EDITOR_CASES, ...NOTE_CASES, ...REASONING_CASES].map((item) => item.note)),
  ...LISTS
]
const words = (text) =>
  new Set(
    String(text)
      .toLowerCase()
      .match(/\p{L}{4,}/gu) ?? []
  )
const THOUGHT = /<think>\s*[^<\s]/i

const llm = await loadQvac('pear-notes-title-eval')
console.log(`model loaded in ${llm.loadMs}ms, ${notes.length} notes`)
const params = getNoteTaskGenerationParams(NOTE_TASK.TITLE)
if (PREDICT) params.predict = PREDICT
const results = []
for (let pass = 0; pass < REPEAT; pass++) {
  for (const [index, note] of notes.entries()) {
    const started = Date.now()
    const raw = await llm.complete({
      history: buildNoteTaskMessages(NOTE_TASK.TITLE, note),
      generationParams: params
    })
    const title = parseTitleOutput(raw, note)
    const noteWords = words(note)
    const checks = {
      title: title.length > 0,
      fromNote: [...words(title)].some((word) => noteWords.has(word)),
      notJoined: !/[a-z][A-Z]|_/.test(title)
    }
    results.push({
      id: `note-${index}`,
      group: 'title',
      ok: Object.values(checks).every(Boolean),
      checks,
      title,
      thought: THOUGHT.test(raw),
      rawChars: raw.length,
      ms: Date.now() - started,
      raw
    })
  }
}
await llm.close()

summarize(results, `title predict=${params.predict}`)
const sorted = (values) => values.sort((a, b) => a - b)
const chars = sorted(results.map((item) => item.rawChars))
const ms = sorted(results.map((item) => item.ms))
console.log(
  `thought: ${results.filter((item) => item.thought).length}/${results.length}  ` +
    `raw chars median ${chars[chars.length >> 1]} max ${chars.at(-1)}  ` +
    `ms median ${ms[ms.length >> 1]} max ${ms.at(-1)}`
)
if (OUT) fs.writeFileSync(OUT, JSON.stringify(results, null, 2))
