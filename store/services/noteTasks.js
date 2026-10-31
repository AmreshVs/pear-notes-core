// Tasks and due dates found in a note by code, for the Upcoming view (M4).
// Relative dates ("Friday", "tomorrow") resolve against when the note was
// last edited, since that is when they were written.

const TASK_MARK = '\u0001'
const DONE_MARK = '\u0002'

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december'
]
const MONTH_PATTERN =
  'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?'
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const WEEKDAY_PATTERN =
  'sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?'

const COUNT_WORDS = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10
}
const COUNT_PATTERN = `\\d{1,2}|${Object.keys(COUNT_WORDS).join('|')}`
const DATE_CUE_PATTERN = '(?:on|by|due(?:\\s+on)?|before|until|till|from)'

const DATE_RULES = [
  { re: /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/, kind: 'iso' },
  { re: /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b(?![/.-]\d)/, kind: 'numeric' },
  {
    re: new RegExp(
      `\\b${DATE_CUE_PATTERN}\\s+(?:the\\s+)?(\\d{1,2})/(\\d{1,2})\\b(?![/.-]\\d)`,
      'i'
    ),
    kind: 'numeric-short'
  },
  {
    re: new RegExp(
      `\\b(${MONTH_PATTERN})\\.?[\\s-]+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?[\\s-]+(\\d{4}))?`,
      'i'
    ),
    kind: 'month-day'
  },
  {
    re: new RegExp(
      `\\b(\\d{1,2})(?:st|nd|rd|th)?[\\s-]+(?:of\\s+)?(${MONTH_PATTERN})\\b\\.?(?:,?[\\s-]+(\\d{4}))?`,
      'i'
    ),
    kind: 'day-month'
  },
  {
    re: new RegExp(
      `\\b${DATE_CUE_PATTERN}\\s+the\\s+(\\d{1,2})(?:st|nd|rd|th)\\b(?![\\s-]+(?:of\\s+)?(?:${MONTH_PATTERN})\\b)`,
      'i'
    ),
    kind: 'day-of-month'
  },
  { re: /\b(today|tonight|this evening|this morning|this afternoon)\b/i, kind: 'today' },
  { re: /\b(?:the\s+)?day\s+after\s+(?:tomorrow|tmrw|tmr)\b/i, kind: 'day-after-tomorrow' },
  { re: /\b(?:tomorrow|tmrw|tmr)\b/i, kind: 'tomorrow' },
  {
    re: new RegExp(`\\bin\\s+(${COUNT_PATTERN})\\s+(days?|weeks?|months?)\\b`, 'i'),
    kind: 'in'
  },
  { re: /\bnext\s+week\b/i, kind: 'next-week' },
  {
    re: /\b(?:by\s+|before\s+)?(?:the\s+)?end\s+of\s+(?:the\s+|this\s+)?week\b/i,
    kind: 'end-of-week'
  },
  {
    re: /\b(?:by\s+|before\s+)?(?:the\s+)?end\s+of\s+(?:the\s+|this\s+)?month\b/i,
    kind: 'end-of-month'
  },
  { re: /\b(this\s+|next\s+)?weekend\b/i, kind: 'weekend' },
  {
    re: new RegExp(`\\b(next\\s+|this\\s+|on\\s+)?(${WEEKDAY_PATTERN})\\b\\.?`, 'i'),
    kind: 'weekday'
  }
]

const TIME_RULES = [
  { re: /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)(?![a-z])/i, kind: 'ampm' },
  { re: /\b(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/i, kind: '24h' },
  {
    re: /\bat\s+(\d{1,2})\b(?!\s*(?:%|:|\.\d|°|degrees?|minutes?|mins?|hours?|hrs?|people|percent|km|miles?|kg|g\b))/i,
    kind: 'at-hour'
  },
  { re: /\b(noon|midday)\b/i, kind: 'noon' }
]

// A plain line (not a checklist item) counts as a task only with one of these.
const ACTION_START =
  /^(?:(?:to\s?-?do|reminder|task):?\s*)?(?:(?:please|remember to|don'?t forget to|need to|have to|must|i need to|i have to)\s+)?(?:call|ring|phone|email|e-mail|text|message|send|pay|book|buy|get|pick up|drop off|collect|bring|submit|file|renew|cancel|return|finish|prepare|review|check|confirm|schedule|remind|meet|visit|order|fix|clean|update|ask|tell|follow up|sign|print|post|reply|write|read|call back|remember|don'?t forget|transfer|deposit|top up|recharge|register|apply|attend|complete|deliver|ship|plan|arrange)\b/i
const DUE_CUE =
  /\b(?:due|deadline|by|before|until|remind me|remind|reminder|appointment|meeting|interview|flight|dentist|doctor|pay|payment|bill|rent|emi|invoice|renewal|renew|expires?|expiry|expiring|exam|party|wedding|trip|checkup|check-up|vet|haircut)\b/i
const PAST_CUE = /\b(?:was|were|went|had|did|met|called|ago|last|yesterday|happened)\b/i
// A line, or a note titled, like this lists dates that come back every year.
const YEARLY_CUE =
  /\b(?:birthdays?|b-?days?|b'days?|anniversar(?:y|ies)|dob|d\.o\.b|date of birth|birth ?dates?)\b/i
const CALENDAR_KINDS = new Set([
  'iso',
  'numeric',
  'numeric-short',
  'month-day',
  'day-month',
  'day-of-month'
])
const YEAR_KINDS = new Set(['iso', 'numeric'])
const NUMERIC_KINDS = new Set(['iso', 'numeric'])

const pad = (n) => String(n).padStart(2, '0')
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const startOfDay = (ms) => {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d
}
const addDays = (d, n) => {
  const next = new Date(d)
  next.setDate(next.getDate() + n)
  return next
}
const monthIndex = (name) =>
  MONTHS.findIndex((month) => month.startsWith(name.toLowerCase().slice(0, 3)))
const weekdayIndex = (name) =>
  WEEKDAYS.findIndex((day) => day.startsWith(name.toLowerCase().slice(0, 3)))

function validDate(year, month, day) {
  const d = new Date(year, month, day)
  return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day ? d : null
}

function yearlessDate(base, month, day) {
  const sameYear = validDate(base.getFullYear(), month, day)
  if (!sameYear) return null
  // A date without a year that is well before the note was written means next year.
  return sameYear < addDays(base, -60) ? validDate(base.getFullYear() + 1, month, day) : sameYear
}

// 20/12: a part over 12 settles the order; otherwise the note's own habit, else day first.
function numericDayMonth(first, second, order) {
  if (first > 12) return [first, second]
  if (second > 12) return [second, first]
  return order === 'month-first' ? [second, first] : [first, second]
}

const fullYear = (text, base) => {
  const year = Number(text)
  if (text.length !== 2) return year
  const century = Math.floor(base.getFullYear() / 100) * 100
  return year > (base.getFullYear() % 100) + 20 ? century - 100 + year : century + year
}

const countOf = (text) => COUNT_WORDS[text.toLowerCase()] ?? Number(text)

function resolveDate(match, kind, anchor, order) {
  const base = startOfDay(anchor)
  if (kind === 'iso') return validDate(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  if (kind === 'numeric' || kind === 'numeric-short') {
    const [day, month] = numericDayMonth(Number(match[1]), Number(match[2]), order)
    if (kind === 'numeric-short') return yearlessDate(base, month - 1, day)
    return validDate(fullYear(match[3], base), month - 1, day)
  }
  if (kind === 'month-day' || kind === 'day-month') {
    const monthName = kind === 'month-day' ? match[1] : match[2]
    const day = Number(kind === 'month-day' ? match[2] : match[1])
    const month = monthIndex(monthName)
    if (month < 0) return null
    if (match[3]) return validDate(Number(match[3]), month, day)
    return yearlessDate(base, month, day)
  }
  if (kind === 'day-of-month') {
    for (let ahead = 0; ahead < 3; ahead++) {
      const month = new Date(base.getFullYear(), base.getMonth() + ahead, 1)
      const date = validDate(month.getFullYear(), month.getMonth(), Number(match[1]))
      if (date && date >= base) return date
    }
    return null
  }
  if (kind === 'today') return base
  if (kind === 'tomorrow') return addDays(base, 1)
  if (kind === 'day-after-tomorrow') return addDays(base, 2)
  if (kind === 'in') {
    const n = countOf(match[1])
    if (/month/i.test(match[2])) {
      const target = new Date(base.getFullYear(), base.getMonth() + n, 1)
      const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
      return validDate(target.getFullYear(), target.getMonth(), Math.min(base.getDate(), lastDay))
    }
    return addDays(base, /week/i.test(match[2]) ? n * 7 : n)
  }
  if (kind === 'next-week') return addDays(base, (8 - base.getDay()) % 7 || 7)
  if (kind === 'end-of-week') return addDays(base, (5 - base.getDay() + 7) % 7)
  if (kind === 'end-of-month') return new Date(base.getFullYear(), base.getMonth() + 1, 0)
  if (kind === 'weekend') {
    const delta = (6 - base.getDay() + 7) % 7
    const saturday = base.getDay() === 0 ? addDays(base, -1) : addDays(base, delta)
    if (/next/i.test(match[1] || '')) return addDays(saturday, 7)
    return saturday < base ? base : saturday
  }
  if (kind === 'weekday') {
    const target = weekdayIndex(match[2])
    if (target < 0) return null
    const delta = (target - base.getDay() + 7) % 7
    return addDays(base, delta === 0 && /next/i.test(match[1] || '') ? 7 : delta)
  }
  return null
}

function resolveTime(match, kind) {
  if (kind === 'noon') return '12:00'
  let hour = Number(match[1])
  const minute = Number(match[2] || 0)
  if (kind === 'ampm') {
    if (hour < 1 || hour > 12 || minute > 59) return null
    const pm = /p/i.test(match[3])
    if (pm && hour !== 12) hour += 12
    if (!pm && hour === 12) hour = 0
  }
  if (kind === 'at-hour') {
    if (hour < 1 || hour > 12) return null
    if (hour < 8) hour += 12
  }
  if (hour > 23 || minute > 59) return null
  return `${pad(hour)}:${pad(minute)}`
}

// 2.4.10 is a version number; 02.04.10 and 2.4.2010 are dates.
const looksLikeVersion = (match) =>
  match[0].includes('.') && match[3].length === 2 && (match[1].length < 2 || match[2].length < 2)

/**
 * The first date in `text`, resolved against `anchor` (ms), plus a time when
 * one is written. A written calendar date beats a weekday next to it
 * ("Monday, 20/12/2026"). `order` reads 05/06 as day first unless
 * 'month-first'. Returns null when there is no date.
 */
export function parseDue(text, anchor = Date.now(), { order = null } = {}) {
  const value = String(text ?? '')
  let best = null
  for (const rule of DATE_RULES) {
    const match = value.match(rule.re)
    if (!match) continue
    if (best && match.index >= best.index) continue
    if (best && CALENDAR_KINDS.has(best.kind) && rule.kind === 'weekday') continue
    if (NUMERIC_KINDS.has(rule.kind) && /[\d./-]/.test(value[match.index - 1] ?? '')) continue
    if (rule.kind === 'numeric' && looksLikeVersion(match)) continue
    const date = resolveDate(match, rule.kind, anchor, order)
    if (date) best = { index: match.index, length: match[0].length, date, kind: rule.kind, match }
  }
  if (!best) return null
  const rest =
    value.slice(0, best.index) + ' '.repeat(best.length) + value.slice(best.index + best.length)
  let time = null
  for (const rule of TIME_RULES) {
    const match = rest.match(rule.re)
    if (!match) continue
    time = resolveTime(match, rule.kind)
    if (time) break
  }
  const explicitYear =
    YEAR_KINDS.has(best.kind) || (CALENDAR_KINDS.has(best.kind) && !!best.match[3])
  return {
    date: isoDate(best.date),
    time,
    span: [best.index, best.index + best.length],
    calendar: CALENDAR_KINDS.has(best.kind),
    explicitYear
  }
}

function decode(text) {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
}

/** Lines of a note's HTML; checklist items start with a marker for their state. */
export function noteLines(html) {
  const marked = String(html ?? '')
    .replace(/<li\b[^>]*data-type="taskItem"[^>]*>/gi, (tag) =>
      /data-checked="true"/i.test(tag) ? `\n${DONE_MARK}` : `\n${TASK_MARK}`
    )
    .replace(
      /<\/?(?:p|div|h[1-6]|li|ul|ol|blockquote|pre|tr|td|th|table|hr)\b[^>]*>|<br\s*\/?>/gi,
      '\n'
    )
    .replace(/<[^>]+>/g, '')
  return decode(marked)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .reduce((lines, line) => {
      const mark = line[0] === TASK_MARK || line[0] === DONE_MARK ? line[0] : null
      if (mark) {
        lines.push({ checklist: true, checked: mark === DONE_MARK, text: line.slice(1).trim() })
        return lines
      }
      // A checklist item's text arrives on the line after its marker.
      const last = lines[lines.length - 1]
      if (last?.checklist && !last.text) last.text = line
      else lines.push(...typedLines(line))
      return lines
    }, [])
    .filter((line) => line.text)
}

const TYPED_BOX = /^\[([ xX]?)\]\s*/
const TYPED_BULLET = /^(?:[-*•·–—>]|\d{1,2}[.)])\s+/
const LONG_LINE = 160
const SENTENCE_END = /[.!?;]\s+(?=[A-Z])/

/** "- [ ] Pay rent 20/12" typed as plain text is a task even without a cue; a long paragraph as its sentences. */
function typedLines(line) {
  const text = line.replace(TYPED_BULLET, '')
  const box = text.match(TYPED_BOX)
  if (box) {
    const boxText = text.slice(box[0].length).trim()
    return [{ checklist: false, checked: /x/i.test(box[1]), typedBox: true, text: boxText }]
  }
  const parts = text.length > LONG_LINE ? text.split(SENTENCE_END) : [text]
  return parts.map((part) => ({ checklist: false, checked: false, text: part.trim() }))
}

const looksLikeTask = (text, due) => {
  const rest = text.slice(0, due.span[0]) + text.slice(due.span[1])
  if (PAST_CUE.test(text)) return false
  return ACTION_START.test(text.trim()) || DUE_CUE.test(rest) || due.time !== null
}

// 13/10/1962, 13.10.62, 10-13: read only where dates are known to be yearly,
// since elsewhere "3/11" is as likely a fraction or a score as a date.
const NUMERIC_DATE = /\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{4}|\d{2}))?\b/
const YEARLY_LIST_MIN_LINES = 3
const YEARLY_LIST_SHARE = 0.6
const YEARLY_LIST_MIN_AGE_YEARS = 5
const YEARLY_LIST_MAX_LINE = 80

function numericOrder(lines) {
  let dayFirst = 0
  let monthFirst = 0
  for (const { text } of lines) {
    const match = text.match(NUMERIC_DATE)
    if (!match) continue
    if (Number(match[1]) > 12) dayFirst++
    else if (Number(match[2]) > 12) monthFirst++
  }
  return monthFirst > dayFirst ? 'month-first' : 'day-first'
}

function parseNumericDate(text, anchorYear, order) {
  const match = text.match(NUMERIC_DATE)
  if (!match) return null
  const [first, second] = [Number(match[1]), Number(match[2])]
  const [day, month] =
    first > 12 || (order === 'day-first' && second <= 12) ? [first, second] : [second, first]
  let year = match[3] ? Number(match[3]) : anchorYear
  if (match[3]?.length === 2) year += year > anchorYear % 100 ? 1900 : 2000
  const date = validDate(year, month - 1, day)
  if (!date) return null
  return {
    date: isoDate(date),
    time: null,
    span: [match.index, match.index + match[0].length],
    calendar: true,
    explicitYear: !!match[3]
  }
}

// A written date wins over a relative word: "birthday tomorrow - 12/10/1997" is 12 Oct every year.
function yearlyDue(text, anchor, anchorYear, order) {
  const due = parseDue(text, anchor, { order })
  if (due?.calendar) return due
  return parseNumericDate(text, anchorYear, order) ?? due
}

const YEARLY_NAME_EDGE =
  /^(?:[\s\-–—:,.;·|/]|on\b)+|(?:[\s\-–—:,.;·|/]|\b(?:on|born|dob|d\.o\.b\.?|b\.))+$/gi

/** "Mum - 21 October 1962" → "Mum": the line without its date. */
function yearlyName(text, span) {
  const name = (text.slice(0, span[0]) + ' ' + text.slice(span[1]))
    .replace(/\(\s*\)|\[\s*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(YEARLY_NAME_EDGE, '')
    .trim()
  return name.length > 1 && name.length <= 80 ? name : ''
}

/**
 * A note made mostly of short lines with dates years in the past (a list of
 * birthdays under any title) is read as yearly dates.
 */
function looksLikeYearlyList(lines, anchor, anchorYear, order) {
  let dated = 0
  let old = 0
  for (const line of lines) {
    if (line.checklist || line.text.length > YEARLY_LIST_MAX_LINE) continue
    const due =
      parseDue(line.text, anchor, { order }) ?? parseNumericDate(line.text, anchorYear, order)
    if (!due?.calendar) continue
    dated++
    if (due.explicitYear && Number(due.date.slice(0, 4)) <= anchorYear - YEARLY_LIST_MIN_AGE_YEARS)
      old++
  }
  return old >= YEARLY_LIST_MIN_LINES && old >= dated * YEARLY_LIST_SHARE
}

/**
 * Tasks with a due date: checklist items with a date (ticked ones carry
 * `done`), and plain lines that read like a to-do with a date. Birthdays and
 * anniversaries recur yearly, even when written with the year they started:
 * by the line, the note title, or a note that is a list of old dates.
 */
export function extractNoteTasks(
  html,
  { anchor = Date.now(), title = '', maxTextLength = 200 } = {}
) {
  const tasks = []
  const lines = noteLines(html)
  const anchorYear = new Date(anchor).getFullYear()
  const order = numericOrder(lines)
  const yearlyNote = YEARLY_CUE.test(title) || looksLikeYearlyList(lines, anchor, anchorYear, order)
  for (const line of lines) {
    const text =
      line.text.length > maxTextLength ? `${line.text.slice(0, maxTextLength - 1)}…` : line.text
    const yearlyContext =
      !ACTION_START.test(line.text) &&
      line.text.length <= 160 &&
      (yearlyNote || YEARLY_CUE.test(line.text))
    const due = yearlyContext
      ? yearlyDue(line.text, anchor, anchorYear, order)
      : parseDue(line.text, anchor, { order })
    if (!due) continue
    const year = Number(due.date.slice(0, 4))
    const pastYear = due.explicitYear && year < anchorYear
    if (yearlyContext && due.calendar && (!line.checklist || pastYear)) {
      const recurs = !due.explicitYear || pastYear
      const name = recurs ? yearlyName(line.text, due.span) : ''
      tasks.push({
        text,
        date: due.date,
        time: due.time,
        checklist: false,
        ...(recurs ? { yearly: true, sinceYear: due.explicitYear ? year : null } : {}),
        ...(name ? { name } : {})
      })
      continue
    }
    if (
      !line.checklist &&
      !line.typedBox &&
      (line.text.length > 160 || !looksLikeTask(line.text, due))
    )
      continue
    tasks.push({
      text,
      date: due.date,
      time: due.time,
      checklist: line.checklist,
      ...(line.checked ? { done: true } : {})
    })
  }
  return tasks
}

/** A yearly task moved to its next occurrence on or after today; Feb 29 falls on Feb 28. */
export function resolveYearly(task, now = Date.now()) {
  if (!task.yearly) return task
  const [, month, day] = task.date.split('-').map(Number)
  const today = startOfDay(now)
  const on = (year) => validDate(year, month - 1, day) ?? new Date(year, month - 1, day - 1)
  const thisYear = on(today.getFullYear())
  const next = thisYear < today ? on(today.getFullYear() + 1) : thisYear
  return { ...task, date: isoDate(next) }
}

export const UPCOMING_GROUP = Object.freeze({
  OVERDUE: 'overdue',
  TODAY: 'today',
  TOMORROW: 'tomorrow',
  THIS_WEEK: 'thisWeek',
  LATER: 'later',
  PAST: 'past',
  COMPLETED: 'completed'
})

const FOLDED_GROUPS = new Set([UPCOMING_GROUP.PAST, UPCOMING_GROUP.COMPLETED])
export const isFoldedGroup = (group) => FOLDED_GROUPS.has(group)

const hashKey = (key) => {
  let hash = 0x811c9dc5
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 0x01000193)
  return (hash >>> 0).toString(36)
}

/** Synced id of a plain line marked done; a yearly date is done for that year only. */
export const taskDoneId = (task) =>
  `done/${hashKey(`${task.noteKey}|${task.date}|${task.text}`)}${hashKey(task.text)}`

export const PAST_DAYS = 7

/** A timed line that isn't an action ("Dentist, Dr. Okafor 8:30") reads as an appointment. */
export const isAppointment = (task) =>
  !!task?.time && !task.checklist && !task.yearly && !task.done && !ACTION_START.test(task.text)

export const YEARLY_LOOKAHEAD_DAYS = 30

/**
 * Groups tasks for the Upcoming view. An undone checklist item past its day
 * or time is overdue; a dated line past its time moves to Past for a week.
 * Every yearly date shows; one more than a month away is marked `beyondWindow`
 * and left out of the count.
 */
export function groupUpcoming(tasks, now = Date.now(), { doneIds = null } = {}) {
  const today = isoDate(startOfDay(now))
  const tomorrow = isoDate(addDays(startOfDay(now), 1))
  const weekEnd = isoDate(addDays(startOfDay(now), 7))
  const yearlyEnd = isoDate(addDays(startOfDay(now), YEARLY_LOOKAHEAD_DAYS))
  const pastStart = isoDate(addDays(startOfDay(now), -PAST_DAYS))
  const groups = Object.fromEntries(Object.values(UPCOMING_GROUP).map((group) => [group, []]))
  const sorted = tasks
    .map((task) => resolveYearly(task, now))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '99').localeCompare(b.time ?? '99'))
  for (const task of sorted) {
    if (task.done || doneIds?.has(taskDoneId(task))) {
      if (task.date >= pastStart) groups[UPCOMING_GROUP.COMPLETED].unshift({ ...task, done: true })
      continue
    }
    const timePassed = task.date === today && task.time !== null && reminderAt(task) <= now
    if (task.date < today || timePassed) {
      if (task.checklist) groups[UPCOMING_GROUP.OVERDUE].push(task)
      else if (task.date >= pastStart) groups[UPCOMING_GROUP.PAST].unshift(task)
      continue
    }
    const beyondWindow = !!task.yearly && task.date > yearlyEnd
    const item = beyondWindow ? { ...task, beyondWindow: true } : task
    if (task.date === today) groups[UPCOMING_GROUP.TODAY].push(item)
    else if (task.date === tomorrow) groups[UPCOMING_GROUP.TOMORROW].push(item)
    else if (task.date < weekEnd) groups[UPCOMING_GROUP.THIS_WEEK].push(item)
    else groups[UPCOMING_GROUP.LATER].push(item)
  }
  return Object.entries(groups)
    .filter(([, items]) => items.length)
    .map(([group, items]) => ({ group, items }))
}

export const NOTE_FINDINGS_MAX = 8

/** Open dated tasks in one note from today on; `checklist: false` is a line that isn't a checklist item yet. */
export function getNoteFindings(
  html,
  { noteKey = '', title = '', anchor = Date.now(), now = Date.now(), doneIds = null } = {}
) {
  const today = isoDate(startOfDay(now))
  return extractNoteTasks(html, { anchor, title })
    .map((task) => resolveYearly({ ...task, noteKey }, now))
    .filter((task) => !task.done && !doneIds?.has(taskDoneId(task)) && task.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '99').localeCompare(b.time ?? '99'))
    .slice(0, NOTE_FINDINGS_MAX)
}

export const BIRTHDAYS_GROUP = 'birthdays'
const SPLIT_FROM = new Set([UPCOMING_GROUP.THIS_WEEK, UPCOMING_GROUP.LATER])
const OPEN_GROUPS = new Set([UPCOMING_GROUP.TODAY, UPCOMING_GROUP.TOMORROW, ...SPLIT_FROM])

/**
 * Upcoming groups for display: yearly dates after tomorrow leave the to-do
 * groups for one Birthdays group (next 30 days only), placed before Past.
 * `yearly` is every open yearly date, for the full list.
 */
export function splitYearly(groups) {
  const birthdays = []
  const yearly = []
  const rest = []
  for (const { group, items } of groups) {
    if (OPEN_GROUPS.has(group)) yearly.push(...items.filter((item) => item.yearly))
    if (!SPLIT_FROM.has(group)) {
      rest.push({ group, items })
      continue
    }
    birthdays.push(...items.filter((item) => item.yearly && !item.beyondWindow))
    const kept = items.filter((item) => !item.yearly)
    if (kept.length) rest.push({ group, items: kept })
  }
  if (!yearly.length) return { groups: rest, yearly }
  const at = rest.findIndex(({ group }) => isFoldedGroup(group))
  rest.splice(at < 0 ? rest.length : at, 0, { group: BIRTHDAYS_GROUP, items: birthdays })
  return { groups: rest, yearly }
}

/** Tasks still ahead or overdue; Past, Completed and far-off yearly dates don't count. */
export const countOpenUpcoming = (groups) =>
  groups.reduce(
    (sum, { group, items }) =>
      isFoldedGroup(group) ? sum : sum + items.filter((item) => !item.beyondWindow).length,
    0
  )

const CHECKLIST_ITEM_TAG = /<li\b[^>]*data-type="taskItem"[^>]*>/gi
const LIST_ITEM_END = new RegExp('[<]/li>|<li\\b', 'i')

/**
 * Ticks or unticks the checklist item whose text is `text` (a long text may
 * arrive cut with an ellipsis). Returns null when no such item is found.
 */
export function setChecklistItemChecked(html, text, checked) {
  const source = String(html ?? '')
  const wanted = String(text ?? '').replace(/…$/, '')
  if (!wanted) return null
  for (const match of source.matchAll(CHECKLIST_ITEM_TAG)) {
    const start = match.index + match[0].length
    const rest = source.slice(start)
    const end = rest.search(LIST_ITEM_END)
    const body = decode((end < 0 ? rest : rest.slice(0, end)).replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim()
    if (body !== wanted && !(text.endsWith('…') && body.startsWith(wanted))) continue
    const tag = /data-checked="(?:true|false)"/i.test(match[0])
      ? match[0].replace(/data-checked="(?:true|false)"/i, `data-checked="${checked}"`)
      : match[0].replace(/^<li\b/i, `<li data-checked="${checked}"`)
    return source.slice(0, match.index) + tag + source.slice(start)
  }
  return null
}

export const REMINDER_DEFAULT_TIME = '09:00'
export const REMINDER_OFFSET_OPTIONS = Object.freeze([0, 5, 10, 30, 60, 1440])
export const UNTIMED_TIME_OPTIONS = Object.freeze([
  '07:00',
  '08:00',
  '09:00',
  '10:00',
  '12:00',
  '18:00'
])
export const REMINDER_PREFS_ID = 'reminders'
export const DEFAULT_REMINDER_PREFS = Object.freeze({
  offsets: [0],
  untimed: REMINDER_DEFAULT_TIME
})
const DAY_MINUTES = 1440

/** Synced reminder choices, with anything unknown or missing replaced by the default. */
export function normalizeReminderPrefs(value) {
  const offsets = Array.isArray(value?.offsets)
    ? [...new Set(value.offsets.filter((n) => REMINDER_OFFSET_OPTIONS.includes(n)))].sort(
        (a, b) => a - b
      )
    : []
  const untimed = UNTIMED_TIME_OPTIONS.includes(value?.untimed)
    ? value.untimed
    : REMINDER_DEFAULT_TIME
  return { offsets: offsets.length ? offsets : [...DEFAULT_REMINDER_PREFS.offsets], untimed }
}

export const reminderAt = (task, untimed = REMINDER_DEFAULT_TIME) => {
  const [year, month, day] = task.date.split('-').map(Number)
  const [hour, minute] = (task.time ?? untimed).split(':').map(Number)
  return new Date(year, month - 1, day, hour, minute).getTime()
}

/**
 * When a task reminds: each chosen offset before its time. A task with no
 * time only takes the day-scale offsets, and always reminds on the day.
 */
export function reminderTimes(task, prefs = DEFAULT_REMINDER_PREFS) {
  const { offsets, untimed } = normalizeReminderPrefs(prefs)
  const at = reminderAt(task, untimed)
  const chosen = task.time ? offsets : [0, ...offsets.filter((n) => n >= DAY_MINUTES)]
  return [...new Set(chosen)].map((offset) => ({ offset, atMs: at - offset * 60 * 1000 }))
}

export const reminderKey = (task, offset = 0) =>
  `${task.noteKey}|${task.date}|${task.time ?? ''}|${task.text}${offset ? `|-${offset}` : ''}`

const reminderId = (key) => `${key.replace(/[^\w-]/g, '_').slice(0, 100)}_${hashKey(key)}`

const remindable = (task, doneIds) => !task.done && !doneIds?.has(taskDoneId(task))

/**
 * Reminders whose time fell in (since, now], one per task and offset. Missed
 * reminders older than `graceMs` are skipped, so opening the app after a
 * week doesn't fire a backlog.
 */
export function dueReminders(
  tasks,
  { since, now = Date.now(), graceMs = 60 * 60 * 1000, prefs, doneIds = null }
) {
  const from = Math.max(since, now - graceMs)
  return tasks
    .filter((task) => remindable(task, doneIds))
    .flatMap((task) =>
      reminderTimes(task, prefs)
        .filter(({ atMs }) => atMs > from && atMs <= now)
        .map(({ offset }) => ({ ...task, offset, key: reminderKey(task, offset) }))
    )
}

export const REMINDER_HORIZON_DAYS = 14

/** Reminders to hand to the phone's scheduler: upcoming only, soonest first. */
export function buildReminderItems(
  tasks,
  { now = Date.now(), linkFor, bodyFor, prefs, doneIds = null }
) {
  const until = now + REMINDER_HORIZON_DAYS * 24 * 60 * 60 * 1000
  return tasks
    .filter((task) => remindable(task, doneIds))
    .flatMap((task) => reminderTimes(task, prefs).map((time) => ({ task, ...time })))
    .filter(({ atMs }) => atMs > now && atMs <= until)
    .sort((a, b) => a.atMs - b.atMs)
    .map(({ task, atMs, offset }) => ({
      id: reminderId(reminderKey(task, offset)),
      title: task.text,
      body: bodyFor(task, offset),
      atMs,
      url: linkFor(task)
    }))
}
