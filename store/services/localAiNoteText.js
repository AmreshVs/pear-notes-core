import { htmlToNoteLines } from './localAiPrompts.js'

export const CHUNK_MAX_TOKENS = 300
export const CHUNK_MIN_SECTION_TOKENS = 60
export const CHUNK_PROMPT_FRAME_TOKENS = 12
const CHUNK_MIN_BODY_TOKENS = 32

const DENSE_CHAR = /[฀-๿ᄀ-ᇿ぀-ヿ㐀-䶿一-鿿가-힯豈-﫿＀-￯]/gu
const NON_ASCII = /[^ -~\s]/gu

/**
 * Overestimates the embedding model's token count without its tokenizer.
 * CJK, kana, Hangul and Thai cost about one token per character, so a
 * character cap is not safe for them.
 */
export function estimateTokens(text) {
  const value = String(text ?? '')
  if (!value) return 0
  const dense = value.match(DENSE_CHAR)?.length ?? 0
  const otherWide = (value.match(NON_ASCII)?.length ?? 0) - dense
  const ascii = value.length - dense - otherWide
  return dense + Math.ceil(otherWide / 2) + Math.ceil(ascii / 3)
}

/**
 * The one note-to-model-text renderer for AI features. Keeps headings, lists,
 * task state and quotes, and includes attachments with any text derived from
 * them (OCR, transcripts, PDF text) through `attachmentText`.
 *
 * @param {string} html
 * @param {{ title?: string, attachmentText?: (info: { kind: string, name: string, type: string, url: string }) => string | null | undefined, maxLines?: number }} [options]
 * @returns {{ text: string, heading: number, attachment: boolean }[]}
 */
export function renderNoteLines(html, { title = '', attachmentText, maxLines = Infinity } = {}) {
  const lines = htmlToNoteLines(html, { attachments: true, attachmentText })
  const cleanTitle = String(title ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  const first = lines[0]
  const hasTitle = first?.heading > 0 && first.text.replace(/^#+ /, '') === cleanTitle
  if (cleanTitle && !hasTitle)
    lines.unshift({ text: `# ${cleanTitle}`, heading: 1, attachment: false })
  return lines.slice(0, maxLines)
}

export const renderNoteText = (html, options) =>
  renderNoteLines(html, options)
    .map((line) => line.text)
    .join('\n')

const SENTENCE_END = /(?<=[.!?;。！？；])\s*/u
const WORD_GAP = /(?<=\s)/u

function splitPieces(text, budget) {
  if (estimateTokens(text) <= budget) return [text]
  for (const separator of [SENTENCE_END, WORD_GAP]) {
    const parts = text.split(separator).filter(Boolean)
    if (parts.length > 1) return parts.flatMap((part) => splitPieces(part, budget))
  }
  const pieces = []
  let piece = ''
  for (const char of text) {
    if (piece && estimateTokens(piece + char) > budget) {
      pieces.push(piece)
      piece = ''
    }
    piece += char
  }
  if (piece) pieces.push(piece)
  return pieces
}

function splitLine(text, budget) {
  const out = []
  let current = ''
  for (const piece of splitPieces(text, budget)) {
    if (current && estimateTokens(current + piece) > budget) {
      out.push(current.trim())
      current = ''
    }
    current += piece
  }
  if (current.trim()) out.push(current.trim())
  return out
}

/**
 * Splits rendered note lines into embedding chunks. A heading or attachment
 * starts a new chunk once the current one has a section's worth of text, and
 * every chunk carries the heading it sits under. No chunk exceeds `maxTokens`
 * (estimated, title and prompt frame included): an oversized embedding input
 * throws `batch overflow` instead of being truncated.
 *
 * @param {{ text: string, heading: number, attachment: boolean }[]} lines
 * @param {{ title?: string, maxTokens?: number, minSectionTokens?: number }} [options]
 * @returns {{ index: number, heading: string, text: string, tokens: number }[]}
 */
export function chunkNoteLines(
  lines,
  { title = '', maxTokens = CHUNK_MAX_TOKENS, minSectionTokens = CHUNK_MIN_SECTION_TOKENS } = {}
) {
  const budget = Math.max(
    CHUNK_MIN_BODY_TOKENS,
    maxTokens - estimateTokens(title) - CHUNK_PROMPT_FRAME_TOKENS
  )
  const chunks = []
  let body = []
  let tokens = 0
  let section = ''
  let chunkSection = ''

  const flush = () => {
    if (body.length) {
      chunks.push({ index: chunks.length, heading: chunkSection, text: body.join('\n'), tokens })
    }
    body = []
    tokens = 0
    chunkSection = section
  }

  const add = (text) => {
    const cost = estimateTokens(text) + 1
    if (body.length && tokens + cost > budget) flush()
    body.push(text)
    tokens += cost
  }

  let headingSection = ''
  let inAttachment = false
  for (const line of lines) {
    const startsAttachment = line.attachment && !inAttachment
    if (inAttachment && !line.attachment) section = headingSection
    inAttachment = line.attachment
    if (line.heading > 0 || startsAttachment) {
      if (tokens >= minSectionTokens) flush()
      section = line.heading > 0 ? line.text.replace(/^#+ /, '') : line.text
      if (line.heading > 0) headingSection = section
      if (!body.length) chunkSection = section
    }
    for (const piece of splitLine(line.text, budget - 1)) add(piece)
  }
  flush()
  return chunks
}

/**
 * @param {string} html
 * @param {{ title?: string, attachmentText?: (info: { kind: string, name: string, type: string, url: string }) => string | null | undefined, maxTokens?: number, minSectionTokens?: number }} [options]
 */
export const chunkNote = (html, { title = '', attachmentText, maxTokens, minSectionTokens } = {}) =>
  chunkNoteLines(renderNoteLines(html, { attachmentText }), {
    title,
    maxTokens,
    minSectionTokens
  })
