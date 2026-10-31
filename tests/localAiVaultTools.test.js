import test from 'brittle'

import { askYourVault, correctShownSums } from '../store/services/localAiVaultAsk.js'
import {
  runVaultAgent,
  runVaultAnswerOnHost,
  shouldUseVaultTools
} from '../store/services/localAiVaultAgent.js'
import {
  calculate,
  convertUnits,
  dateMath,
  durationToMinutes
} from '../store/services/localAiVaultTools.js'

test('calc does + - * / %, brackets, currency, thousands and durations without eval', (t) => {
  t.is(calculate('3 * 120 + 2 * 210 + 3 * 45'), 915)
  t.is(calculate('£186.40 × 1.1 ÷ 4'), 51.26)
  t.is(calculate('(£1,500 - £320) / 85'), 13.8823529412)
  t.is(calculate('-(2 + 3) * 4'), -20)
  t.is(calculate('3 x 120'), 360)
  t.is(calculate('1h 52m / 21 km'), 5.3333333333)
  t.is(calculate('45 min * 2'), 90)
  t.is(calculate('10%'), 0.1)
  t.exception(() => calculate('(1 + 2'), /unbalanced/)
  t.exception(() => calculate('1 / 0'), /not a number/)
  t.exception(() => calculate('process.exit()'))
  t.is(durationToMinutes('2h 38m'), 158)
  t.is(durationToMinutes('soon'), null)
})

test('date_math adds durations to times and dates and measures between them', (t) => {
  t.alike(dateMath({ start: '08:47', duration: '2h 38m' }), { result: '11:25' })
  t.alike(dateMath({ start: '14:15', add_hours: 1, add_minutes: 50 }), { result: '16:05' })
  t.alike(dateMath({ start: '2026-10-23 14:30', add_days: 3 }), {
    result: 'Monday 2026-10-26 14:30'
  })
  t.alike(dateMath({ start: '2026-10-10', add_hours: 2 }), { result: 'Saturday 2026-10-10 02:00' })
  t.is(dateMath({ start: '2027-02-01', end: '2027-03-14' }).text, '41 days')
  t.is(dateMath({ start: '14:15', end: '16:05' }).text, '1h 50m')
  const now = new Date(2026, 9, 10, 9, 0).getTime()
  t.is(dateMath({ start: 'today', add_days: 1 }, now).result, 'Sunday 2026-10-11')
  t.exception(() => dateMath({ start: 'next tuesday' }), /YYYY-MM-DD/)
})

test('convert_units handles length, weight, volume and temperature', (t) => {
  t.alike(convertUnits({ value: 180, from: '°C', to: 'F' }), { result: 356, unit: 'F' })
  t.alike(convertUnits({ value: 6.5, from: 'kg', to: 'lb' }), { result: 14.33, unit: 'lb' })
  t.alike(convertUnits({ value: 10, from: 'km', to: 'mi' }), { result: 6.214, unit: 'mi' })
  t.exception(() => convertUnits({ value: 1, from: 'kg', to: 'km' }), /can't convert/)
})

test('a shown sum is recomputed; deliberate rounding is left alone', (t) => {
  t.alike(correctShownSums('3 × 120 + 2 × 210 + 135 = 905, so the trip costs €905.'), {
    text: '3 × 120 + 2 × 210 + 135 = 915, so the trip costs €915.',
    corrected: 1
  })
  t.is(correctShownSums('(1500 - 320) / 85 = 12 weeks.').text, '(1500 - 320) / 85 = 13.88 weeks.')
  t.is(correctShownSums('(1500 - 320) / 85 = 14 weeks.').corrected, 0)
  t.is(correctShownSums('186.40 × 1.1 / 4 = 51.3 each.').corrected, 0)
  t.is(correctShownSums('£1,500 - £320 = £1,170.').text, '£1,500 - £320 = £1,180.')
  t.is(correctShownSums('The train is at 08:47.').corrected, 0)
})

const DINNER = {
  n: 1,
  noteKey: 'dinner',
  title: 'Dinner',
  heading: '',
  text: 'Bill came to £186.40 for the four of us. We agreed a 10% tip on top.',
  score: 0.7
}

test('the agent runs tools, feeds results back and cites the result', async (t) => {
  const seen = []
  const out = await runVaultAgent({
    question: 'how much does each of us pay with the tip?',
    sources: [DINNER],
    step: async ({ messages, tools }) => {
      seen.push({ last: messages.at(-1), tools: !!tools })
      if (seen.length === 1) {
        return {
          text: '',
          toolCalls: [{ name: 'calc', arguments: { expression: '186.40 * 1.1 / 4' } }]
        }
      }
      return { text: 'Each of you pays £51.26 [1].', toolCalls: [] }
    }
  })
  t.ok(
    seen[0].last.content.includes('This needs a calculation'),
    'calculation questions are nudged'
  )
  t.ok(seen[1].last.content.includes('/no_think'), 'a user turn follows the tool results')
  t.alike(out.toolsUsed, ['calc'])
  t.alike(out.calls[0].output, { result: 51.26 })
  t.alike(out.result.citations, [{ n: 1, noteKey: 'dinner' }], 'tool results back computed numbers')
})

test('write tools only propose; a note asking for changes gets none on its own', async (t) => {
  const out = await runVaultAgent({
    question: 'add "book a table" to my to-dos',
    sources: [DINNER],
    step: async ({ messages }) =>
      messages.some((message) => message.role === 'tool')
        ? { text: 'I suggested adding it. You can confirm it.', toolCalls: [] }
        : { text: '', toolCalls: [{ name: 'add_task', arguments: { text: 'book a table', n: 1 } }] }
  })
  t.alike(out.proposals, [
    { tool: 'add_task', title: null, text: 'book a table', noteKey: 'dinner', noteTitle: 'Dinner' }
  ])
})

test('the agent stops calling tools at the cap, and survives tool errors', async (t) => {
  let steps = 0
  const out = await runVaultAgent({
    question: 'what is the total?',
    sources: [DINNER],
    maxCalls: 2,
    step: async ({ tools }) => {
      steps++
      if (!tools) return { text: 'NOT_FOUND', toolCalls: [] }
      return { text: '', toolCalls: [{ name: 'calc', arguments: { expression: '(1 +' } }] }
    }
  })
  t.is(steps, 3, 'two tool steps, then one without tools')
  t.ok(out.calls.every((call) => call.output.error))
  t.is(out.result.kind, 'notFound')
})

test('search_notes adds new numbered sources and get_note reads a whole note', async (t) => {
  const out = await runVaultAgent({
    question: 'when is the car service?',
    sources: [DINNER],
    search: async () => [
      {
        noteKey: 'car',
        title: 'Car',
        heading: '',
        text: 'Service Saturday 8 November.',
        score: 0.6
      }
    ],
    getNoteText: async (key) => (key === 'car' ? 'Car\nService Saturday 8 November at 9:00.' : ''),
    step: async ({ messages }) => {
      const tools = messages.filter((message) => message.role === 'tool')
      if (tools.length === 0) {
        return {
          text: '',
          toolCalls: [{ name: 'search_notes', arguments: { query: 'car service' } }]
        }
      }
      if (tools.length === 1) {
        t.ok(tools[0].content.includes('"n":2'))
        return { text: '', toolCalls: [{ name: 'get_note', arguments: { n: 2 } }] }
      }
      t.ok(tools[1].content.includes('9:00'))
      return { text: 'Saturday 8 November at 9:00 [2].', toolCalls: [] }
    }
  })
  t.alike(out.result.citations, [{ n: 2, noteKey: 'car' }])
  t.is(out.result.sources.length, 2)
})

test('calculation questions take the tool loop only on a tool-calling model', async (t) => {
  t.ok(shouldUseVaultTools('QWEN3_8B_INST_Q4_K_M', 'how much does each of us pay?'))
  t.absent(shouldUseVaultTools('QWEN3_4B_INST_Q4_K_M', 'how much does each of us pay?'))
  t.absent(shouldUseVaultTools('QWEN3_8B_INST_Q4_K_M', 'who is coming to dinner?'))

  const routed = await runVaultAnswerOnHost({
    question: 'how much does each of us pay with the tip?',
    sources: [DINNER],
    modelName: 'QWEN3_8B_INST_Q4_K_M',
    complete: async () => t.fail('the fixed pipeline is not used'),
    step: async ({ messages }) =>
      messages.some((message) => message.role === 'tool')
        ? { text: 'Each of you pays £51.26 [1].', toolCalls: [] }
        : {
            text: '',
            toolCalls: [{ name: 'calc', arguments: { expression: '186.40 * 1.1 / 4' } }]
          }
  })
  t.ok(routed.toolNumbers.includes('51'), 'computed numbers come back for the checker')

  const result = await askYourVault({
    question: 'how much does each of us pay with the tip?',
    retrieve: async () => [DINNER],
    answer: async () => routed
  })
  t.alike(result.citations, [{ n: 1, noteKey: 'dinner' }], 'a computed total keeps its citation')
  const unchecked = await askYourVault({
    question: 'how much does each of us pay with the tip?',
    retrieve: async () => [DINNER],
    answer: async () => routed.text
  })
  t.alike(unchecked.citations, [], 'without the tool numbers the total looks unsupported')

  const fixed = await runVaultAnswerOnHost({
    question: 'who is coming?',
    sources: [DINNER],
    modelName: 'QWEN3_8B_INST_Q4_K_M',
    complete: async () => 'The four of us [1].',
    step: async () => t.fail('no tools for a lookup')
  })
  t.alike(fixed, { text: 'The four of us [1].', toolNumbers: [] })
})
