import { cleanModelOutput, htmlToNoteText, NOTE_TASK } from './localAiPrompts.js'

const P_CLOSE = '<' + '/p>'
const H2_CLOSE = '<' + '/h2>'
const LI_CLOSE = '<' + '/li>'
const UL_CLOSE = '<' + '/ul>'
const STRONG_CLOSE = '<' + '/strong>'

export const GENERATE_SOURCE_CHARS = 7600

const escapeHtml = (text) =>
  String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/[<]/g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/**
 * The notes as one input, each under "Note: <title>", sharing the budget so
 * every note gets a fair slice instead of the first one filling it.
 */
export function buildGenerateInput(
  notes,
  { untitled = 'Untitled', budget = GENERATE_SOURCE_CHARS } = {}
) {
  const texts = notes.map((note) => ({
    title: note.title?.trim() || untitled,
    text: htmlToNoteText(String(note.note ?? '')).trim()
  }))
  const share = Math.max(300, Math.floor(budget / Math.max(1, texts.length)))
  return texts
    .map(
      ({ title, text }) =>
        `Note: ${title}\n${text.length > share ? `${text.slice(0, share)}…` : text}`
    )
    .join('\n\n')
}

/** Model lines ("# " headings, "- " points, "Q:"/"A:" cards) as note HTML. */
export function generatedToHtml(task, output) {
  const lines = cleanModelOutput(String(output ?? ''))
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const html = []
  let list = []
  const flush = () => {
    if (list.length)
      html.push(
        `<ul>${list.map((item) => `<li><p>${item}${P_CLOSE}${LI_CLOSE}`).join('')}${UL_CLOSE}`
      )
    list = []
  }
  for (const line of lines) {
    if (task === NOTE_TASK.FLASHCARDS && /^q\s*[:.]/i.test(line)) {
      flush()
      html.push(
        `<p><strong>Q:${STRONG_CLOSE} ${escapeHtml(line.replace(/^q\s*[:.]\s*/i, ''))}${P_CLOSE}`
      )
    } else if (task === NOTE_TASK.FLASHCARDS && /^a\s*[:.]/i.test(line)) {
      html.push(`<p>A: ${escapeHtml(line.replace(/^a\s*[:.]\s*/i, ''))}${P_CLOSE}`)
    } else if (/^#{1,3}\s+/.test(line)) {
      flush()
      html.push(`<h2>${escapeHtml(line.replace(/^#{1,3}\s+/, ''))}${H2_CLOSE}`)
    } else if (/^[-*•]\s*\S/.test(line) && !/^-\d/.test(line)) {
      list.push(escapeHtml(line.replace(/^[-*•]\s*/, '')))
    } else {
      flush()
      html.push(`<p>${escapeHtml(line.replace(/\*\*/g, ''))}${P_CLOSE}`)
    }
  }
  flush()
  return html.join('')
}

/** A draft note: the generated content, then the notes it came from. */
export function buildGeneratedNote({ task, output, sources, title, sourcesLabel }) {
  const body = generatedToHtml(task, output)
  const from = sources.length
    ? `<p><strong>${escapeHtml(sourcesLabel)}${STRONG_CLOSE}${P_CLOSE}<ul>${sources
        .map((source) => `<li><p>${escapeHtml(source)}${P_CLOSE}${LI_CLOSE}`)
        .join('')}${UL_CLOSE}`
    : ''
  return { title, note: `${body}${from}` }
}
