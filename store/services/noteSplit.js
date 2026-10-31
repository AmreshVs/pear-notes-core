import { MERGE_REFUSAL, checkMergeable } from './noteMerge.js'

export const SPLIT_REFUSAL = Object.freeze({
  NO_SECTIONS: 'no-sections',
  LOCKED: MERGE_REFUSAL.LOCKED,
  MISSING: MERGE_REFUSAL.MISSING
})

const HEADING_OPEN = /<h([1-3])\b[^>]*>/gi

const decode = (text) =>
  text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')

const headingText = (html, start, level) => {
  const close = '<' + `/h${level}>`
  const end = html.indexOf(close, start)
  if (end === -1) return { text: '', end: start }
  const inner = html.slice(html.indexOf('>', start) + 1, end)
  return {
    text: decode(inner.replace(/<[^>]+>/g, ''))
      .replace(/\s+/g, ' ')
      .trim(),
    end: end + close.length
  }
}

/**
 * Cuts a note at its top heading level (h1–h3, the highest one used at least
 * twice). Every byte of the body ends up in exactly one part, in order: text
 * before the first heading stays under the note's own title.
 */
export function splitNoteByHeadings(html, title = '') {
  const source = String(html ?? '')
  const found = [...source.matchAll(HEADING_OPEN)].map((match) => ({
    index: match.index,
    level: Number(match[1])
  }))
  const level = [1, 2, 3].find((l) => found.filter((h) => h.level === l).length >= 2)
  if (!level) return []
  const cuts = found.filter((h) => h.level === level)
  const parts = []
  const intro = source.slice(0, cuts[0].index)
  if (intro.replace(/<[^>]+>/g, '').trim()) parts.push({ title, note: intro })
  cuts.forEach((cut, i) => {
    const next = cuts[i + 1]?.index ?? source.length
    const { text, end } = headingText(source, cut.index, level)
    parts.push({
      title: text || title,
      note: source.slice(end, next),
      heading: source.slice(cut.index, end)
    })
  })
  return parts
}

/** Why a note can't be split, or null. */
export function checkSplittable(note) {
  if (!note) return SPLIT_REFUSAL.MISSING
  const refusal = checkMergeable([note, { note: '' }])
  if (refusal) return refusal
  return splitNoteByHeadings(note.note, note.title).length >= 2 ? null : SPLIT_REFUSAL.NO_SECTIONS
}
