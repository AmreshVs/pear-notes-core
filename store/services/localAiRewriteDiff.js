export const REWRITE_HEAVY_CHANGE_RATIO = 0.6

const PARAGRAPH_BREAK = '\n'
const MAX_DIFF_CELLS = 4_000_000

export const REWRITE_SEGMENT = Object.freeze({
  EQUAL: 'equal',
  REMOVED: 'removed',
  ADDED: 'added'
})

function tokenize(text) {
  const tokens = []
  for (const paragraph of String(text ?? '').split(/\n+/)) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (words.length === 0) continue
    if (tokens.length > 0) tokens.push(PARAGRAPH_BREAK)
    tokens.push(...words)
  }
  return tokens
}

function lcsOperations(before, after) {
  const n = before.length
  const m = after.length
  if (n * m > MAX_DIFF_CELLS) {
    return [
      ...before.map((token) => ({ type: REWRITE_SEGMENT.REMOVED, token })),
      ...after.map((token) => ({ type: REWRITE_SEGMENT.ADDED, token }))
    ]
  }
  const table = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] =
        before[i] === after[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }
  const operations = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (before[i] === after[j]) {
      operations.push({ type: REWRITE_SEGMENT.EQUAL, token: before[i] })
      i++
      j++
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      operations.push({ type: REWRITE_SEGMENT.REMOVED, token: before[i++] })
    } else {
      operations.push({ type: REWRITE_SEGMENT.ADDED, token: after[j++] })
    }
  }
  while (i < n) operations.push({ type: REWRITE_SEGMENT.REMOVED, token: before[i++] })
  while (j < m) operations.push({ type: REWRITE_SEGMENT.ADDED, token: after[j++] })
  return operations
}

function diffTokens(before, after) {
  let start = 0
  while (start < before.length && start < after.length && before[start] === after[start]) start++
  let endBefore = before.length
  let endAfter = after.length
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore--
    endAfter--
  }
  const equal = (token) => ({ type: REWRITE_SEGMENT.EQUAL, token })
  return [
    ...before.slice(0, start).map(equal),
    ...lcsOperations(before.slice(start, endBefore), after.slice(start, endAfter)),
    ...before.slice(endBefore).map(equal)
  ]
}

function appendSegment(paragraph, type, words) {
  if (words.length === 0) return
  const last = paragraph.segments[paragraph.segments.length - 1]
  if (last && last.type === type) last.text += ` ${words.join(' ')}`
  else paragraph.segments.push({ type, text: words.join(' ') })
  if (type !== REWRITE_SEGMENT.EQUAL) paragraph.changed = true
}

export function diffRewriteText(beforeText, afterText) {
  const before = tokenize(beforeText)
  const after = tokenize(afterText)
  const operations = diffTokens(before, after)

  const paragraphs = []
  let paragraph = { changed: false, segments: [] }
  let removedWords = []
  let addedWords = []
  let fixes = 0
  let added = 0
  let removed = 0

  const flushChange = () => {
    if (removedWords.length === 0 && addedWords.length === 0) return
    if (removedWords.length > 1 && removedWords.length === addedWords.length) {
      removedWords.forEach((word, index) => {
        appendSegment(paragraph, REWRITE_SEGMENT.REMOVED, [word])
        appendSegment(paragraph, REWRITE_SEGMENT.ADDED, [addedWords[index]])
      })
      fixes += removedWords.length
    } else {
      appendSegment(paragraph, REWRITE_SEGMENT.REMOVED, removedWords)
      appendSegment(paragraph, REWRITE_SEGMENT.ADDED, addedWords)
      fixes++
    }
    removedWords = []
    addedWords = []
  }

  const endParagraph = () => {
    flushChange()
    if (paragraph.segments.length > 0) paragraphs.push(paragraph)
    paragraph = { changed: false, segments: [] }
  }

  for (const { type, token } of operations) {
    if (token === PARAGRAPH_BREAK) {
      if (type !== REWRITE_SEGMENT.REMOVED) endParagraph()
      continue
    }
    if (type === REWRITE_SEGMENT.EQUAL) {
      flushChange()
      appendSegment(paragraph, REWRITE_SEGMENT.EQUAL, [token])
      continue
    }
    if (type === REWRITE_SEGMENT.REMOVED) {
      removedWords.push(token)
      removed++
    } else {
      addedWords.push(token)
      added++
    }
  }
  endParagraph()

  const beforeWords = before.filter((token) => token !== PARAGRAPH_BREAK).length
  const changedRatio = Math.max(added, removed) / Math.max(beforeWords, 1)

  return {
    paragraphs,
    fixes,
    added,
    removed,
    changedRatio,
    unchanged: added === 0 && removed === 0,
    mostlyChanged: changedRatio > REWRITE_HEAVY_CHANGE_RATIO
  }
}

export function groupRewriteParagraphs(paragraphs) {
  const list = Array.isArray(paragraphs) ? paragraphs : []
  if (list.length < 2 || !list.some((paragraph) => paragraph.changed)) {
    return list.map((paragraph) => ({ type: 'paragraph', paragraph }))
  }
  const items = []
  for (const paragraph of list) {
    const last = items[items.length - 1]
    if (paragraph.changed) items.push({ type: 'paragraph', paragraph })
    else if (last?.type === 'unchanged') last.paragraphs.push(paragraph)
    else items.push({ type: 'unchanged', paragraphs: [paragraph] })
  }
  return items
}

export function getRewriteParagraphText(paragraph, { removed = true, added = true } = {}) {
  return (paragraph?.segments ?? [])
    .filter(
      (segment) =>
        (removed || segment.type !== REWRITE_SEGMENT.REMOVED) &&
        (added || segment.type !== REWRITE_SEGMENT.ADDED)
    )
    .map((segment) => segment.text)
    .join(' ')
}
