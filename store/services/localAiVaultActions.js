import { ALL_NOTES_KEY } from '../../constant.js'
import { isIndexable } from './localAiIndex.js'
import { taskDoneId } from './noteTasks.js'

const P_CLOSE = '<' + '/p>'
const LI_CLOSE = '<' + '/li>'
const UL_CLOSE = '<' + '/ul>'
const STRONG_CLOSE = '<' + '/strong>'

const SUGGESTION_TITLE_MAX = 40
const DRAFT_TITLE_MAX = 60
const DRAFT_PREFIX_WORDS = 3
const DRAFT_SPLIT_MIN = 3

const escapeHtml = (text) =>
  String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/[<]/g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const shortTitle = (title, max = SUGGESTION_TITLE_MAX) =>
  title.length > max ? `${title.slice(0, max - 1)}…` : title

const capitalize = (text) => (text ? text[0].toUpperCase() + text.slice(1) : text)

/** The indexable notes an Ask in `scope` (a folder key or All notes) searches. */
export function getVaultScopeNotes(notes, scope = ALL_NOTES_KEY) {
  return Object.entries(notes ?? {}).filter(
    ([, note]) => isIndexable(note) && (scope === ALL_NOTES_KEY || note.folderKey === scope)
  )
}

/**
 * "Try asking" from recent titles and the scope's folder (or the busiest one).
 * Returns `{ kind: 'note' | 'keyPoints', title }` or `{ kind: 'folder', folder }`.
 */
export function getVaultAskSuggestions({ notes, folders = [], scope = ALL_NOTES_KEY }) {
  const scoped = getVaultScopeNotes(notes, scope)
  const named = new Map(
    (folders ?? []).filter((folder) => !folder.isSystem).map((folder) => [folder.id, folder.name])
  )
  const titles = [
    ...new Set(
      scoped
        .filter(([, note]) => note.title?.trim())
        .sort(([, a], [, b]) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
        .map(([, note]) => shortTitle(note.title.trim()))
    )
  ]
  const counts = new Map()
  for (const [, note] of scoped) {
    if (named.has(note.folderKey)) counts.set(note.folderKey, (counts.get(note.folderKey) ?? 0) + 1)
  }
  const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1])
  const folder = named.get(scope) ?? named.get(top?.[0])
  return [
    titles[0] && { kind: 'note', title: titles[0] },
    titles[1] && { kind: 'keyPoints', title: titles[1] },
    folder ? { kind: 'folder', folder } : titles[2] && { kind: 'note', title: titles[2] }
  ].filter(Boolean)
}

export const isoDay = (date = new Date()) => {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** The earliest open task, today or later, in one of the cited notes; null when none. */
export function getVaultReminderTask({ citedKeys, tasks, doneIds, today = isoDay() }) {
  const keys = new Set(citedKeys ?? [])
  if (!keys.size) return null
  const [first] = (tasks ?? [])
    .filter(
      (task) =>
        keys.has(task.noteKey) &&
        !task.done &&
        task.date >= today &&
        !doneIds?.has?.(taskDoneId(task))
    )
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''))
  return first ?? null
}

const DRAFT_LEAD =
  /^\s*(?:(?:please|pls|can you|could you|would you|will you|help me|let'?s|now)\s+)*(?:make|create|draft|write|build|compile|put together)\b\s*(?:(?:me|us)\s+)?/i
const DRAFT_NOUN =
  /\b(?:check ?lists?|to-?do(?: lists?)?|lists?|plans?|outlines?|agendas?|itinerar(?:y|ies)|summary|summaries|recaps?|notes?)\b/i
const CHECKLIST_NOUN = /\b(?:check ?lists?|to-?do(?: lists?)?|lists?)\b/i
const DRAFT_LINK = /\s+(?:from|of|for|using|based on|out of|with|about|on)\s+/i
const LEADING_ARTICLE = /^(?:a|an|the|my|our|some)\s+/i
const TRAILING_NOTES = /\s+(?:notes?|pages?)$/i
const NOT_AN_OBJECT = /^(?:sure|what|how|when|where|why|who|which|whether|if|that|it)\b/i

const draftObject = (question) => {
  const text = String(question ?? '')
  const lead = text.match(DRAFT_LEAD)
  if (!lead) return null
  const object = text.slice(lead[0].length).split(DRAFT_LINK)[0].trim()
  return NOT_AN_OBJECT.test(object) ? null : object
}

/** "Make a packing list from my notes": a request to write something new, not a question. */
export function isVaultDraftRequest(question) {
  const object = draftObject(question)
  return !!object && DRAFT_NOUN.test(object)
}

/** "Make a packing list from my Lisbon notes" → "Lisbon packing list". */
export function vaultDraftTitle(question) {
  const asked = String(question ?? '')
    .trim()
    .replace(/[?.!]+$/, '')
  const lead = asked.match(DRAFT_LEAD)
  if (!lead) return shortTitle(asked, DRAFT_TITLE_MAX)
  const rest = asked.slice(lead[0].length)
  const link = rest.match(DRAFT_LINK)
  const object = (link ? rest.slice(0, link.index) : rest).replace(LEADING_ARTICLE, '').trim()
  const about = link
    ? rest
        .slice(link.index + link[0].length)
        .replace(LEADING_ARTICLE, '')
        .replace(TRAILING_NOTES, '')
        .trim()
    : ''
  const aboutWords = about.split(/\s+/).filter(Boolean).length
  const title = !about
    ? capitalize(object)
    : aboutWords <= DRAFT_PREFIX_WORDS
      ? capitalize(`${about} ${object}`)
      : `${capitalize(object)}: ${about}`
  return shortTitle(title || asked, DRAFT_TITLE_MAX)
}

const ITEM_CITATION = /\s*\[(\d{1,2})\]/g
const ITEM_BULLET = /^\s*(?:[-*•–]|\d{1,2}[.)]|\[[ x]\])\s+/i

const draftItem = (line, byNumber) => {
  const numbers = [...line.matchAll(ITEM_CITATION)].map((match) => Number(match[1]))
  const citations = [...new Set(numbers)].filter((n) => byNumber.has(n)).map((n) => byNumber.get(n))
  const text = line
    .replace(ITEM_CITATION, '')
    .replace(ITEM_BULLET, '')
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/[.;,]+$/, '')
    .trim()
  return { text, citations }
}

/**
 * The answer to a draft request as items: one per line, or one comma or
 * semicolon list split up. Null when it isn't a draft request or has no items.
 */
export function getVaultDraft({ question, result }) {
  if (!isVaultDraftRequest(question) || !result?.answer) return null
  const byNumber = new Map((result.citations ?? []).map((citation) => [citation.n, citation]))
  let lines = String(result.answer)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length > 1 && /:$/.test(lines[0].replace(ITEM_CITATION, '').trim())) {
    lines = lines.slice(1)
  }
  let items = lines.map((line) => draftItem(line, byNumber)).filter((item) => item.text)
  if (items.length === 1) {
    const [only] = items
    const body = only.text.replace(/^[^:]{0,60}:\s+/, '')
    const parts = body
      .split(/\s*;\s*|\s*,\s*(?:and\s+)?|\s+and\s+(?=[^,]*$)/i)
      .map((part) => part.trim())
      .filter(Boolean)
    if (parts.length >= DRAFT_SPLIT_MIN) {
      items = parts.map((text) => ({ text, citations: only.citations }))
    }
  }
  if (!items.length) return null
  const checklist = CHECKLIST_NOUN.test(draftObject(question))
  return { title: vaultDraftTitle(question), items, checklist }
}

/** The draft's items as a checklist or bullet list, optionally under its title in bold. */
export function vaultDraftHtml(draft, { heading = false } = {}) {
  const items = (draft?.items ?? []).map((item) => escapeHtml(item.text))
  if (!items.length) return ''
  const list = draft.checklist
    ? `<ul data-type="taskList">${items
        .map(
          (text) => `<li data-type="taskItem" data-checked="false"><p>${text}${P_CLOSE}${LI_CLOSE}`
        )
        .join('')}${UL_CLOSE}`
    : `<ul>${items.map((text) => `<li><p>${text}${P_CLOSE}${LI_CLOSE}`).join('')}${UL_CLOSE}`
  const title = heading ? `<p><strong>${escapeHtml(draft.title)}${STRONG_CLOSE}${P_CLOSE}` : ''
  return `${title}${list}`
}

/** A new note from the draft: its list, then the notes it came from. */
export function vaultDraftNote({ draft, sources = [], sourcesLabel = 'Sources' }) {
  const cited = new Set(draft.items.flatMap((item) => item.citations.map((c) => c.n)))
  const names = sources
    .filter((source) => cited.has(source.n))
    .map((source) => `<li><p>${escapeHtml(source.title || source.noteKey)}${P_CLOSE}${LI_CLOSE}`)
    .join('')
  const list = names
    ? `<p><strong>${escapeHtml(sourcesLabel)}${STRONG_CLOSE}${P_CLOSE}<ul>${names}${UL_CLOSE}`
    : ''
  return { title: draft.title, note: `${vaultDraftHtml(draft)}${list}` }
}

/** "Add to <note>": the first cited note that isn't open in the editor. */
export function getVaultDraftTarget({ draft, openNoteKey = null, notes = {} }) {
  for (const item of draft?.items ?? []) {
    for (const citation of item.citations) {
      if (citation.noteKey !== openNoteKey && isIndexable(notes?.[citation.noteKey])) {
        return citation.noteKey
      }
    }
  }
  return null
}
