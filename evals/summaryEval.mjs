// Recording summaries as meeting notes (M5): summary, decisions, action items
// with owners, open questions. Runs the shipping prompt and parser.
//
//   node evals/summaryEval.mjs [--model=<registry name> | --best] [--repeat=3] [--out=<json>]
import fs from 'fs'

import path from 'path'
import { pathToFileURL } from 'url'

import { flag, HERE, loadQvac, summarize } from './qvacRuntime.mjs'

// --prompts=<file> scores another version of localAiPrompts.js (e.g. the previous one).
const PROMPTS = flag('prompts', path.join(HERE, '..', 'store', 'services', 'localAiPrompts.js'))
const { buildNoteTaskMessages, getNoteTaskGenerationParams, NOTE_TASK, parseSummaryOutput } =
  await import(pathToFileURL(path.resolve(PROMPTS)).href)

const REPEAT = Number(flag('repeat', '1'))
const OUT = flag('out', '')

// Each expected item is a list of words that must all appear in one parsed item.
const CASES = [
  {
    id: 'launch-sync',
    group: 'meeting',
    text: "Okay so quick sync on the launch. We agreed the launch date is the third of November, that's final. Price stays at nine dollars, everyone was fine with that. Priya will draft the press release by Friday. Ben is going to book the venue. The thing we didn't settle is who presents the demo, we'll figure that out next week.",
    decisions: [['november'], ['nine|9', 'price']],
    actions: [
      ['priya', 'press release'],
      ['ben', 'venue']
    ],
    questions: [['demo']]
  },
  {
    id: 'kitchen-reno',
    group: 'meeting',
    text: 'Call with the builder about the kitchen. We decided to go with the oak worktop and keep the old sink. Marco will send the revised quote on Monday. I need to pick the tiles before the twentieth. Still not sure whether we move the fridge to the other wall.',
    decisions: [['oak'], ['sink']],
    actions: [['marco', 'quote'], ['tiles']],
    questions: [['fridge']]
  },
  {
    id: 'standup',
    group: 'meeting',
    text: 'Standup. Ana finished the login bug and will start on the export screen today. Leo is blocked on the API keys, Sam will ask the platform team for them. No decisions today. Question from Leo: do we still support Android nine? Nobody knew.',
    decisions: [],
    actions: [
      ['ana', 'export'],
      ['sam', 'keys']
    ],
    questions: [['android']]
  },
  {
    id: 'voice-memo-groceries',
    group: 'memo',
    text: 'Note to self, um, need to get milk, eggs and the bread from the bakery, and uh call mum about Sunday lunch.',
    decisions: [],
    actions: [['milk'], ['mum']],
    questions: []
  },
  {
    id: 'idea-memo',
    group: 'memo',
    text: "Just an idea I had on the walk. What if the newsletter had a short section on local history every month. Could be fun. I'm not sure people would read it though.",
    decisions: [],
    actions: [],
    questions: []
  },
  {
    id: 'trip-planning',
    group: 'meeting',
    text: "Trip planning with Jo. We're definitely doing Lisbon, flights on the twelfth. Jo books the flights tonight. I'll look for an apartment in Alfama. We haven't decided if we rent a car.",
    decisions: [['lisbon']],
    actions: [['jo', 'flights'], ['apartment']],
    questions: [['car']]
  }
]

const norm = (text) => String(text).toLowerCase()
// A word may list alternatives: 'nine|9'.
const matches = (item, words) =>
  words.every((word) => word.split('|').some((option) => norm(item).includes(option)))
const covered = (items, expected) =>
  expected.every((words) => items.some((item) => matches(item, words)))

const llm = await loadQvac('pear-notes-summary-eval')
console.log(`model loaded in ${llm.loadMs}ms`)
const results = []
for (let pass = 0; pass < REPEAT; pass++) {
  for (const testCase of CASES) {
    const raw = await llm.complete({
      history: buildNoteTaskMessages(NOTE_TASK.TRANSCRIPT_SUMMARY, testCase.text),
      generationParams: getNoteTaskGenerationParams(NOTE_TASK.TRANSCRIPT_SUMMARY)
    })
    const parsed = { decisions: [], openQuestions: [], ...parseSummaryOutput(raw) }
    const checks = {
      summary: parsed.summary.length > 0,
      decisions: covered(parsed.decisions, testCase.decisions),
      noExtraDecisions: testCase.decisions.length > 0 || parsed.decisions.length === 0,
      actions: covered(parsed.actionItems, testCase.actions),
      questions: covered(parsed.openQuestions, testCase.questions),
      noExtraQuestions: testCase.questions.length > 0 || parsed.openQuestions.length === 0
    }
    results.push({
      id: testCase.id,
      group: testCase.group,
      ok: Object.values(checks).every(Boolean),
      checks,
      parsed,
      raw
    })
  }
}
summarize(results, 'suite=meeting-notes')
const field = (name) => results.filter((item) => item.checks[name]).length
console.log(
  ['summary', 'decisions', 'noExtraDecisions', 'actions', 'questions', 'noExtraQuestions']
    .map((name) => `${name} ${field(name)}/${results.length}`)
    .join('  ')
)
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ results }, null, 2))
await llm.close()
process.exit(0)
