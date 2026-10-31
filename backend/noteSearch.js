import { ALL_NOTES_KEY, RECENTLY_DELETED_KEY, SEARCH_QUERY_MAX_LENGTH } from '../constant.js'
import { ATTACHMENT_KIND, getNoteAttachments } from '../store/services/noteAttachments.js'
import { extractNoteTasks, resolveYearly } from '../store/services/noteTasks.js'
import { envelopeLinks } from './sealedEnvelope.js'

export const SEARCH_RESULT_LIMIT = 1000
export const SEARCH_SNIPPET_LENGTH = 140
export const SEARCH_IDLE_MS = 10 * 60 * 1000
export const SEARCH_BUILD_CHUNK = 200
export const SEARCH_HIGHLIGHT_MS = 4000

const COMBINING_MARKS = /\p{M}/gu
const NON_ASCII = /[\u0080-\uffff]/g
const CJK = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\uf900-\ufaff]/

const QUOTE_FOLDS = {
  '\u2018': "'",
  '\u2019': "'",
  '\u201a': "'",
  '\u201b': "'",
  '\u2032': "'",
  '\u201c': '"',
  '\u201d': '"',
  '\u201e': '"',
  '\u201f': '"',
  '\u2033': '"'
}

const foldCache = new Map()

function foldChar(char) {
  let folded = foldCache.get(char)
  if (folded !== undefined) return folded
  const quote = QUOTE_FOLDS[char]
  if (quote) {
    foldCache.set(char, quote)
    return quote
  }
  const stripped = char.normalize('NFKD').replace(COMBINING_MARKS, '').toLowerCase()
  if (stripped.length === 1) folded = stripped
  else {
    const lower = char.toLowerCase()
    folded = lower.length === 1 ? lower : char
  }
  foldCache.set(char, folded)
  return folded
}

// Keeps one output code unit per input code unit, so an offset in folded text is the same
// offset in the original and snippets need no remapping.
export function foldText(text) {
  if (!text) return ''
  return text.replace(NON_ASCII, foldChar).replace(/[A-Z]+/g, (s) => s.toLowerCase())
}

const BLOCK_BOUNDARY =
  /<\/?(?:p|div|h[1-6]|li|ul|ol|blockquote|pre|tr|td|th|table|figcaption|hr)\b[^>]*>|<br\s*\/?>/gi
const ATTACHMENT_TAG = /<div\b[^>]*\bdata-(?:file|audio)-attachment\b[^>]*>/gi
const FILENAME_ATTR = /\bfilename\s*=\s*"([^"]*)"/i
const NAMED_ENTITIES = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'"
}

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1))
      try {
        return Number.isFinite(code) ? String.fromCodePoint(code) : match
      } catch {
        return match
      }
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match
  })
}

export function toSearchText(html) {
  if (!html) return ''
  const withNames = html.replace(ATTACHMENT_TAG, (tag) => {
    const name = tag.match(FILENAME_ATTR)?.[1]
    return name ? ' ' + name + ' ' : ' '
  })
  const text = decodeEntities(withNames.replace(BLOCK_BOUNDARY, ' ').replace(/<[^>]*>/g, ''))
  return text.replace(/\s+/g, ' ').trim()
}

export function parseSearchQuery(query) {
  const raw = String(query || '')
    .slice(0, SEARCH_QUERY_MAX_LENGTH)
    .trim()
  if (!raw) return []
  const terms = []
  const pattern = /"([^"]+)"|(\S+)/g
  const folded = foldText(raw)
  let match
  while ((match = pattern.exec(folded))) {
    const term = (match[1] ?? match[2]).replace(/"/g, '').replace(/\s+/g, ' ').trim()
    if (term && !terms.includes(term)) terms.push(term)
  }
  return terms
}

export function isBodySearchable(terms) {
  return terms.some((term) => term.length >= 2 || CJK.test(term))
}

export function titleMatchesTerms(title, terms) {
  if (!terms.length) return false
  const folded = foldText(title || '')
  return terms.every((term) => folded.includes(term))
}

function collectRanges(foldedSlice, terms) {
  const ranges = []
  for (const term of terms) {
    let at = foldedSlice.indexOf(term)
    while (at !== -1) {
      ranges.push([at, at + term.length])
      at = foldedSlice.indexOf(term, at + term.length)
    }
  }
  ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1])
  const merged = []
  for (const range of ranges) {
    const last = merged[merged.length - 1]
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1])
    else merged.push(range)
  }
  return merged
}

const isLowSurrogate = (text, index) => {
  const code = text.charCodeAt(index)
  return code >= 0xdc00 && code <= 0xdfff
}

function wordStart(text, index) {
  if (index <= 0) return 0
  const space = text.lastIndexOf(' ', index)
  if (space !== -1 && index - space <= 20) return space + 1
  return isLowSurrogate(text, index) ? index - 1 : index
}

function wordEnd(text, index) {
  if (index >= text.length) return text.length
  const space = text.indexOf(' ', index)
  if (space !== -1 && space - index <= 20) return space
  return isLowSurrogate(text, index) ? index + 1 : index
}

export function findTermRanges(text, terms) {
  if (!text || !terms?.length) return []
  return collectRanges(foldText(text), terms).flat()
}

export function toHighlightSegments(text, flatRanges) {
  const value = text || ''
  if (!flatRanges?.length) return value ? [{ text: value, match: false }] : []
  const segments = []
  let at = 0
  for (let i = 0; i + 1 < flatRanges.length; i += 2) {
    const from = Math.max(at, Math.min(flatRanges[i], value.length))
    const to = Math.max(from, Math.min(flatRanges[i + 1], value.length))
    if (from > at) segments.push({ text: value.slice(at, from), match: false })
    if (to > from) segments.push({ text: value.slice(from, to), match: true })
    at = to
  }
  if (at < value.length) segments.push({ text: value.slice(at), match: false })
  return segments
}

export function buildSnippet(text, folded, terms, length = SEARCH_SNIPPET_LENGTH) {
  let first = -1
  for (const term of terms) {
    const at = folded.indexOf(term)
    if (at !== -1 && (first === -1 || at < first)) first = at
  }
  if (first === -1) return null
  let start = wordStart(text, Math.max(0, first - Math.floor(length / 4)))
  let end = wordEnd(text, Math.min(text.length, start + length))
  if (end - start < length && start > 0) start = wordStart(text, Math.max(0, end - length))
  const prefix = start > 0 ? '…' : ''
  const suffix = end < text.length ? '…' : ''
  const ranges = collectRanges(folded.slice(start, end), terms).map(([from, to]) => [
    from + prefix.length,
    to + prefix.length
  ])
  return { snippet: prefix + text.slice(start, end) + suffix, ranges }
}

function inScope(entry, folderKey) {
  if (folderKey === RECENTLY_DELETED_KEY) return entry.folderKey === RECENTLY_DELETED_KEY
  if (entry.folderKey === RECENTLY_DELETED_KEY) return false
  if (!folderKey || folderKey === ALL_NOTES_KEY) return true
  return entry.folderKey === folderKey
}

const textStamp = (value) =>
  `${value.version || 0}:${value.updatedAt || 0}:${(value.sealed || value.note || '').length}:${value.title || ''}`

const sealedAttachments = (sealed) =>
  envelopeLinks(sealed).map((url) => ({
    kind: ATTACHMENT_KIND.FILE,
    url,
    fileName: '',
    fileType: '',
    size: 0,
    duration: 0
  }))

function toEntry(value, sizeOf) {
  const sealed = !!value.sealed
  const text = sealed ? '' : toSearchText(value.note)
  const attachments = sealed ? sealedAttachments(value.sealed) : getNoteAttachments(value.note)
  return {
    stamp: textStamp(value),
    updatedAt: value.updatedAt || 0,
    attachments: attachments.map((item) => ({
      ...item,
      size: sizeOf(item.url) || item.size
    })),
    tasks: sealed
      ? []
      : extractNoteTasks(value.note, {
          anchor: value.updatedAt || Date.now(),
          title: value.title || ''
        }),
    title: value.title || '',
    foldedTitle: foldText(value.title || ''),
    text,
    foldedText: foldText(text),
    folderKey: value.folderKey || '',
    locked: value.locked === true
  }
}

const noSize = () => 0

const yieldToLoop = () => new Promise((resolve) => setTimeout(resolve, 0))

export class NoteSearchIndex {
  constructor({ idleMs = SEARCH_IDLE_MS, chunkSize = SEARCH_BUILD_CHUNK, sizeOf = noSize } = {}) {
    this.idleMs = idleMs
    this.sizeOf = sizeOf
    this.chunkSize = chunkSize
    this.entries = new Map()
    this.warm = false
    this.building = null
    this.pendingNotes = null
    this.pendingOps = null
    this.generation = 0
    this.idleTimer = null
  }

  get size() {
    return this.entries.size
  }

  async ensureWarm(readAll) {
    this._touch()
    if (this.warm) return true
    if (!this.building) {
      const generation = this.generation
      this.building = this._build(readAll, generation).finally(() => {
        if (this.generation === generation) this.building = null
      })
    }
    return this.building
  }

  async _build(readAll, generation) {
    const notes = (await readAll()) || []
    if (generation !== this.generation) return false
    const entries = new Map()
    for (let i = 0; i < notes.length; i += this.chunkSize) {
      for (const { key, value } of notes.slice(i, i + this.chunkSize)) {
        if (key && value) entries.set(key, toEntry(value, this.sizeOf))
      }
      if (i + this.chunkSize < notes.length) await yieldToLoop()
      if (generation !== this.generation) return false
    }
    this.entries = entries
    this.warm = true
    const pending = this.pendingNotes
    const pendingOps = this.pendingOps
    this.pendingNotes = null
    this.pendingOps = null
    if (pending) this.sync(pending)
    if (pendingOps) this.apply(pendingOps)
    return true
  }

  sync(notes) {
    if (!Array.isArray(notes)) return
    if (!this.warm) {
      if (this.building) this.pendingNotes = notes
      return
    }
    const seen = new Set()
    for (const { key, value } of notes) {
      if (!key || !value) continue
      seen.add(key)
      const current = this.entries.get(key)
      if (current && current.stamp === textStamp(value)) {
        current.folderKey = value.folderKey || ''
        current.locked = value.locked === true
      } else {
        this.entries.set(key, toEntry(value, this.sizeOf))
      }
    }
    for (const key of this.entries.keys()) if (!seen.has(key)) this.entries.delete(key)
  }

  apply(ops) {
    if (!Array.isArray(ops)) return
    if (!this.warm) {
      // The build's read may predate these writes, so they replay after it.
      if (this.building) this.pendingOps = [...(this.pendingOps || []), ...ops]
      return
    }
    for (const { key, value } of ops) {
      if (!key) continue
      if (!value) {
        this.entries.delete(key)
        continue
      }
      const current = this.entries.get(key)
      if (current && current.stamp === textStamp(value)) {
        current.folderKey = value.folderKey || ''
        current.locked = value.locked === true
      } else {
        this.entries.set(key, toEntry(value, this.sizeOf))
      }
    }
  }

  search({ query, folderKey = ALL_NOTES_KEY, includeLocked = false, limit = SEARCH_RESULT_LIMIT }) {
    this._touch()
    const terms = parseSearchQuery(query)
    if (!terms.length) return { results: [], total: 0 }
    const searchBody = isBodySearchable(terms)
    const results = []
    let total = 0
    for (const [key, entry] of this.entries) {
      if (!inScope(entry, folderKey)) continue
      const bodyVisible = searchBody && (includeLocked || !entry.locked)
      let inTitle = true
      let all = true
      for (const term of terms) {
        if (entry.foldedTitle.includes(term)) continue
        inTitle = false
        if (!bodyVisible || !entry.foldedText.includes(term)) {
          all = false
          break
        }
      }
      if (!all) continue
      total++
      if (results.length >= limit) continue
      const snip = bodyVisible ? buildSnippet(entry.text, entry.foldedText, terms) : null
      results.push({
        key,
        inTitle,
        snippet: snip?.snippet || '',
        ranges: snip ? snip.ranges.flat() : []
      })
    }
    return { results, total }
  }

  /** Open dated tasks across notes, for the Upcoming view. Locked notes are skipped. */
  upcoming() {
    this._touch()
    const tasks = []
    const now = Date.now()
    for (const [key, entry] of this.entries) {
      if (entry.locked || entry.folderKey === RECENTLY_DELETED_KEY) continue
      for (const task of entry.tasks) {
        tasks.push({ ...resolveYearly(task, now), noteKey: key, title: entry.title })
      }
    }
    return tasks
  }

  /** Every attachment in visible notes, for the Attachments view. Locked notes are skipped. */
  attachments() {
    this._touch()
    const items = []
    for (const [key, entry] of this.entries) {
      if (entry.locked || entry.folderKey === RECENTLY_DELETED_KEY) continue
      for (const item of entry.attachments) {
        items.push({
          ...item,
          noteKey: key,
          title: entry.title,
          folderKey: entry.folderKey,
          updatedAt: entry.updatedAt
        })
      }
    }
    return items
  }

  attachmentCount() {
    this._touch()
    let count = 0
    for (const entry of this.entries.values()) {
      if (entry.locked || entry.folderKey === RECENTLY_DELETED_KEY) continue
      count += entry.attachments.length
    }
    return count
  }

  clear() {
    this.generation++
    this.entries = new Map()
    this.warm = false
    this.building = null
    this.pendingNotes = null
    this.pendingOps = null
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = null
  }

  _touch() {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => this.clear(), this.idleMs)
    this.idleTimer.unref?.()
  }
}
