// Shape check for the "create from notes" and template tasks on a real model.
//
//   node evals/generateSmoke.mjs --model=QWEN3_1_7B_INST_Q4
import {
  buildNoteTaskMessages,
  getNoteTaskGenerationParams,
  NOTE_TASK
} from '../store/services/localAiPrompts.js'
import { buildGenerateInput, generatedToHtml } from '../store/services/noteGenerate.js'
import { loadQvac } from './qvacRuntime.mjs'

const TRIP = [
  {
    title: 'Lisbon flights',
    note: '<p>EK 2041 DXB to LIS on 12 Nov, departs 07:55, seat 34K. Return 16 Nov 14:20.</p>'
  },
  {
    title: 'Lisbon plans',
    note: '<p>13 Nov: Belém tower and pastéis. 14 Nov: Sintra day trip, train 9:10 from Rossio. 15 Nov: Alfama walk, fado dinner booked at 20:00.</p>'
  },
  { title: 'Hotel', note: '<p>Memmo Alfama, booking ref QX7LMN, check-in 12 Nov after 15:00.</p>' }
]
const WORK = [
  {
    title: 'Launch sync',
    note: '<p>Launch is 3 November. Priya drafts the press release by Friday. Ben books the venue. Price stays at 9 dollars.</p>'
  },
  {
    title: 'Standup',
    note: '<p>Ana starts the export screen. Sam asks platform for API keys. Question: do we support Android 9?</p>'
  }
]
const checks = {
  [NOTE_TASK.REPORT]: (html) => html.includes('<h2>') && html.includes('<li>'),
  [NOTE_TASK.ITINERARY]: (html) => (html.match(/<h2>/g) || []).length >= 2,
  [NOTE_TASK.FLASHCARDS]: (html) => (html.match(/<strong>Q:/g) || []).length >= 3,
  [NOTE_TASK.ACTION_LIST]: (html) => (html.match(/<li>/g) || []).length >= 3,
  [NOTE_TASK.TEMPLATE_MEETING]: (html) =>
    html.includes('Decisions') && html.includes('Action items')
}
const runs = [
  [NOTE_TASK.REPORT, WORK],
  [NOTE_TASK.ITINERARY, TRIP],
  [NOTE_TASK.FLASHCARDS, TRIP],
  [NOTE_TASK.ACTION_LIST, WORK],
  [NOTE_TASK.TEMPLATE_MEETING, [WORK[0]]]
]
const llm = await loadQvac('generate-smoke')
for (const [task, notes] of runs) {
  const started = Date.now()
  const raw = await llm.complete({
    history: buildNoteTaskMessages(task, buildGenerateInput(notes)),
    generationParams: getNoteTaskGenerationParams(task)
  })
  const html = generatedToHtml(task, raw)
  const keeps = ['QX7LMN', '07:55', 'Priya', 'Ben'].filter((fact) =>
    buildGenerateInput(notes).includes(fact)
  )
  const kept = keeps.filter((fact) => html.includes(fact))
  console.log(
    `${task}: ${checks[task](html) ? 'shape ok' : 'SHAPE FAIL'}  facts ${kept.length}/${keeps.length}  ${((Date.now() - started) / 1000).toFixed(1)}s`
  )
  if (!checks[task](html)) console.log('   ', raw.slice(0, 300).replace(/\n/g, ' | '))
}
await llm.close()
process.exit(0)
