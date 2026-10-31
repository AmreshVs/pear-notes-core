/**
 * Deterministic tools for Ask your vault. The model decides when to call them;
 * the arithmetic, dates and unit conversions are done here, never by the model.
 */

const NUMBER = /\d[\d,]*(?:\.\d+)?|\.\d+/y
const OPERATORS = {
  '+': { precedence: 1, apply: (a, b) => a + b },
  '-': { precedence: 1, apply: (a, b) => a - b },
  '*': { precedence: 2, apply: (a, b) => a * b },
  '/': { precedence: 2, apply: (a, b) => (b === 0 ? NaN : a / b) },
  '%': { precedence: 2, apply: (a, b) => a % b }
}
const SYNONYMS = { '×': '*', '÷': '/', '−': '-', '–': '-' }
const MAX_EXPRESSION = 200

const DURATION =
  /(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?(?:\s*(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?)?(?![a-z])/gi
const MINUTES_ONLY = /(\d+(?:\.\d+)?)\s*min(?:ute)?s?\b/gi
const DURATION_ONLY =
  /^\s*(?:(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?)?\s*$/i

/** "1h 52m" → 112 and "45 min" → 45; null when it isn't a duration. */
export function durationToMinutes(text) {
  const match = String(text ?? '').match(DURATION_ONLY)
  if (!match || (match[1] === undefined && match[2] === undefined)) return null
  return (Number(match[1]) || 0) * 60 + (Number(match[2]) || 0)
}

// Durations become minutes, "3 x 120" becomes 3 * 120, and unit words ("21 km") are dropped.
const normalizeExpression = (expression) =>
  String(expression ?? '')
    .replace(DURATION, (all, hours, minutes) => String(Number(hours) * 60 + (Number(minutes) || 0)))
    .replace(MINUTES_ONLY, '$1')
    .replace(/[£$€¥₹]/g, '')
    .replace(/(?<=\d)\s*[xX](?=\s*[\d(])/g, ' * ')
    .replace(/[a-zA-Z]+/g, ' ')

function tokenize(expression) {
  const text = normalizeExpression(expression)
  const tokens = []
  let i = 0
  while (i < text.length) {
    const char = text[i]
    if (/\s/.test(char)) {
      i++
      continue
    }
    NUMBER.lastIndex = i
    const number = NUMBER.exec(text)
    if (number) {
      let value = Number(number[0].replace(/,/g, ''))
      i += number[0].length
      if (text[i] === '%' && !/[\d.(]/.test(text.slice(i + 1).trim()[0] ?? '')) {
        value /= 100
        i++
      }
      tokens.push({ type: 'number', value })
      continue
    }
    const op = SYNONYMS[char] ?? char
    if (op in OPERATORS || op === '(' || op === ')') {
      tokens.push({ type: 'op', value: op })
      i++
      continue
    }
    throw new Error(`unexpected "${char}"`)
  }
  return tokens
}

/** Evaluates + - * / % and brackets; `12%` alone means 0.12. No eval(). */
export function calculate(expression) {
  if (String(expression ?? '').length > MAX_EXPRESSION) throw new Error('expression too long')
  const tokens = tokenize(expression)
  const output = []
  const stack = []
  let expectOperand = true
  for (const token of tokens) {
    if (token.type === 'number') {
      output.push(token.value)
      expectOperand = false
    } else if (token.value === '(') {
      stack.push('(')
      expectOperand = true
    } else if (token.value === ')') {
      while (stack.length && stack.at(-1) !== '(') output.push(stack.pop())
      if (!stack.length) throw new Error('unbalanced brackets')
      stack.pop()
      expectOperand = false
    } else {
      const op = expectOperand && token.value === '-' ? 'neg' : token.value
      if (op !== 'neg') {
        while (
          stack.length &&
          stack.at(-1) !== '(' &&
          (stack.at(-1) === 'neg' || OPERATORS[stack.at(-1)].precedence >= OPERATORS[op].precedence)
        ) {
          output.push(stack.pop())
        }
      }
      stack.push(op)
      expectOperand = true
    }
  }
  while (stack.length) {
    const op = stack.pop()
    if (op === '(') throw new Error('unbalanced brackets')
    output.push(op)
  }
  const values = []
  for (const item of output) {
    if (typeof item === 'number') values.push(item)
    else if (item === 'neg') values.push(-values.pop())
    else {
      const b = values.pop()
      const a = values.pop()
      if (a === undefined || b === undefined) throw new Error('incomplete expression')
      values.push(OPERATORS[item].apply(a, b))
    }
  }
  if (values.length !== 1 || !Number.isFinite(values[0])) throw new Error('not a number')
  return Math.round(values[0] * 1e10) / 1e10
}

const DAY_MS = 86_400_000
const DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/
const TIME = /^(\d{1,2})[:.](\d{2})$/

const pad = (value) => String(value).padStart(2, '0')
const formatDate = (date) =>
  `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
const formatTime = (date) => `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function parseMoment(value, now) {
  const text = String(value ?? '').trim()
  if (!text || /^(today|now)$/i.test(text)) {
    const today = new Date(now)
    return {
      date: new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0)),
      hasDate: true,
      hasTime: false
    }
  }
  const date = text.match(DATE)
  if (date) {
    const [, y, m, d, h = '0', min = '0'] = date
    return {
      date: new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(h), Number(min))),
      hasDate: true,
      hasTime: date[4] !== undefined
    }
  }
  const time = text.match(TIME)
  if (time) {
    return {
      date: new Date(Date.UTC(2000, 0, 1, Number(time[1]), Number(time[2]))),
      hasDate: false,
      hasTime: true
    }
  }
  throw new Error(`can't read "${text}": use YYYY-MM-DD, YYYY-MM-DD HH:MM or HH:MM`)
}

const describe = ({ date, hasDate, hasTime }) =>
  [
    hasDate ? `${WEEKDAYS[date.getUTCDay()]} ${formatDate(date)}` : '',
    hasTime ? formatTime(date) : ''
  ]
    .filter(Boolean)
    .join(' ')

/**
 * Adds to a date or time, or measures between two. `start` and `end` are
 * YYYY-MM-DD, YYYY-MM-DD HH:MM, HH:MM or "today"; `duration` is like 2h 38m.
 *
 * @param {{ start?: string, end?: string, add_days?: number, add_weeks?: number, add_hours?: number, add_minutes?: number, duration?: string }} [args]
 * @param {number} [now]
 */
export function dateMath(
  { start, end, add_days, add_weeks, add_hours, add_minutes, duration } = {},
  now = Date.now()
) {
  const from = parseMoment(start, now)
  const extraMinutes = duration ? durationToMinutes(duration) : 0
  if (extraMinutes === null) throw new Error(`can't read duration "${duration}": use like 2h 38m`)
  if (end !== undefined && end !== null && end !== '') {
    const to = parseMoment(end, now)
    const minutes = Math.round((to.date.getTime() - from.date.getTime()) / 60_000)
    const sign = minutes < 0 ? '-' : ''
    const abs = Math.abs(minutes)
    return {
      days: Math.trunc(minutes / 1440),
      hours: Math.trunc(minutes / 60),
      minutes,
      text:
        from.hasTime || to.hasTime
          ? `${sign}${Math.floor(abs / 60)}h ${abs % 60}m`
          : `${sign}${Math.round(abs / 1440)} days`
    }
  }
  const total =
    (Number(add_weeks) || 0) * 7 * DAY_MS +
    (Number(add_days) || 0) * DAY_MS +
    (Number(add_hours) || 0) * 3_600_000 +
    ((Number(add_minutes) || 0) + extraMinutes) * 60_000
  const result = { ...from, date: new Date(from.date.getTime() + total) }
  if (total % DAY_MS !== 0) result.hasTime = true
  return { result: describe(result) }
}

const UNITS = {
  km: ['length', 1000],
  m: ['length', 1],
  cm: ['length', 0.01],
  mm: ['length', 0.001],
  mi: ['length', 1609.344],
  mile: ['length', 1609.344],
  miles: ['length', 1609.344],
  ft: ['length', 0.3048],
  feet: ['length', 0.3048],
  in: ['length', 0.0254],
  inch: ['length', 0.0254],
  kg: ['mass', 1],
  g: ['mass', 0.001],
  lb: ['mass', 0.45359237],
  lbs: ['mass', 0.45359237],
  oz: ['mass', 0.028349523125],
  l: ['volume', 1],
  ml: ['volume', 0.001],
  gal: ['volume', 3.785411784],
  cup: ['volume', 0.2365882365]
}
const TEMPERATURE = { c: 'c', celsius: 'c', f: 'f', fahrenheit: 'f' }

/** @param {{ value?: number, from?: string, to?: string }} [args] */
export function convertUnits({ value, from, to } = {}) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) throw new Error('value must be a number')
  const a = String(from ?? '')
    .toLowerCase()
    .replace(/[°.]/g, '')
    .trim()
  const b = String(to ?? '')
    .toLowerCase()
    .replace(/[°.]/g, '')
    .trim()
  if (TEMPERATURE[a] && TEMPERATURE[b]) {
    const celsius = TEMPERATURE[a] === 'c' ? amount : ((amount - 32) * 5) / 9
    const out = TEMPERATURE[b] === 'c' ? celsius : (celsius * 9) / 5 + 32
    return { result: Math.round(out * 100) / 100, unit: to }
  }
  const [kindA, factorA] = UNITS[a] ?? []
  const [kindB, factorB] = UNITS[b] ?? []
  if (!kindA || !kindB) throw new Error(`unknown unit: ${!kindA ? from : to}`)
  if (kindA !== kindB) throw new Error(`can't convert ${kindA} to ${kindB}`)
  return { result: Math.round(((amount * factorA) / factorB) * 1000) / 1000, unit: to }
}

const tool = (name, description, properties, required = []) => ({
  type: 'function',
  name,
  description,
  parameters: { type: 'object', properties, required }
})

export const VAULT_TOOL = Object.freeze({
  SEARCH: 'search_notes',
  GET_NOTE: 'get_note',
  CALC: 'calc',
  DATE_MATH: 'date_math',
  CONVERT: 'convert_units',
  CREATE_NOTE: 'create_note',
  APPEND: 'append_to_note',
  ADD_TASK: 'add_task'
})

export const VAULT_WRITE_TOOLS = new Set([
  VAULT_TOOL.CREATE_NOTE,
  VAULT_TOOL.APPEND,
  VAULT_TOOL.ADD_TASK
])

export const VAULT_TOOLS = [
  tool(
    VAULT_TOOL.SEARCH,
    'Search the user’s notes. Returns numbered sources to cite.',
    {
      query: { type: 'string', description: 'What to look for' }
    },
    ['query']
  ),
  tool(
    VAULT_TOOL.GET_NOTE,
    'Read the whole note behind a source number.',
    {
      n: { type: 'integer', description: 'Source number, like 2' }
    },
    ['n']
  ),
  tool(
    VAULT_TOOL.CALC,
    'Exact arithmetic. Write the whole calculation in one expression with every number it needs. Copy durations as the note writes them, like 1h 52m; they count as minutes, so never convert them yourself.',
    {
      expression: {
        type: 'string',
        description:
          'Like 3 * 120 + 2 * 210 for a total, 186.40 * 1.1 / 4 for a split, (1500 - 320) / 85 for how many weeks'
      }
    },
    ['expression']
  ),
  tool(
    VAULT_TOOL.DATE_MATH,
    'Add a duration to a date or clock time, or measure between two. For a clock time plus a duration, start is the time and duration is the length.',
    {
      start: { type: 'string', description: 'Like 08:47, 2027-02-01, 2027-02-01 14:30 or today' },
      end: { type: 'string', description: 'Optional: measure from start to end' },
      duration: { type: 'string', description: 'Optional: like 2h 38m or 45 min' },
      add_days: { type: 'number' },
      add_weeks: { type: 'number' },
      add_hours: { type: 'number' },
      add_minutes: { type: 'number' }
    },
    ['start']
  ),
  tool(
    VAULT_TOOL.CONVERT,
    'Convert units of length, weight, volume or temperature.',
    {
      value: { type: 'number' },
      from: { type: 'string', description: 'Like km, lb, f' },
      to: { type: 'string', description: 'Like mi, kg, c' }
    },
    ['value', 'from', 'to']
  ),
  tool(
    VAULT_TOOL.CREATE_NOTE,
    'Propose a new note. The user must confirm it.',
    {
      title: { type: 'string' },
      text: { type: 'string' }
    },
    ['title', 'text']
  ),
  tool(
    VAULT_TOOL.APPEND,
    'Propose adding text to the note behind a source number. The user must confirm it.',
    {
      n: { type: 'integer' },
      text: { type: 'string' }
    },
    ['n', 'text']
  ),
  tool(
    VAULT_TOOL.ADD_TASK,
    'Propose a to-do item. The user must confirm it.',
    {
      text: { type: 'string' },
      n: { type: 'integer', description: 'Optional: source number of the note to add it to' }
    },
    ['text']
  )
]
