const INLINE_PLACEHOLDER = String.fromCharCode(0xfffc)
const NO_BREAK_SPACE = new RegExp(String.fromCharCode(0xa0), 'g')
const LINE_MARKER =
  /^[ \t]*(?:#{1,6}[ \t]+|>[ \t]+|(?:[-*\u2022]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?)/

/**
 * The model is shown the note with its structure intact ("- ", "1. ", "# ",
 * "- [ ] "), so its edits carry those markers. The document itself stores the
 * markers as node types, not as text, so an edit that keeps them would never
 * match. Strip a marker the edit only carries because we showed it one.
 *
 * Returns null when the marker itself is what changed (ticking a task, turning
 * a bullet into a number). That is a node change, not a text change, and
 * quietly rewriting the text around it would corrupt the note.
 */
export function stripEditMarkers(edit) {
  const find = String(edit?.find ?? '')
  const replace = String(edit?.replace ?? '')
  const findMarker = find.match(LINE_MARKER)?.[0] ?? ''
  if (!findMarker) return edit
  const replaceMarker = replace.match(LINE_MARKER)?.[0] ?? ''
  if (replaceMarker && replaceMarker.trim() !== findMarker.trim()) return null
  return {
    ...edit,
    find: find.slice(findMarker.length),
    replace: replaceMarker ? replace.slice(replaceMarker.length) : replace
  }
}

/**
 * Where to cut when an edit empties a whole block. Deleting only the text
 * leaves an empty bullet or paragraph behind, so walk up through any parent
 * the block is the sole child of (a paragraph inside a list item inside a
 * one-item list) and remove that instead.
 */
function blockDeleteRange(doc, pos, node) {
  const fallback = { from: pos, to: pos + node.nodeSize }
  if (typeof doc.resolve !== 'function') return fallback
  let resolved
  try {
    resolved = doc.resolve(pos)
  } catch {
    return fallback
  }
  let range = fallback
  for (let depth = resolved.depth; depth > 0; depth--) {
    if (resolved.node(depth).childCount !== 1) break
    range = { from: resolved.before(depth), to: resolved.after(depth) }
  }
  return range
}

function blockText(node, blockStart) {
  let text = ''
  const positions = []
  node.forEach((child, offset) => {
    const childStart = blockStart + offset
    if (child.isText) {
      for (let index = 0; index < child.text.length; index++) positions.push(childStart + index)
      text += child.text.replace(NO_BREAK_SPACE, ' ')
      return
    }
    positions.push(childStart)
    text += INLINE_PLACEHOLDER
  })
  return { text, positions }
}

function narrowEdit(find, replace) {
  let start = 0
  const limit = Math.min(find.length, replace.length)
  while (start < limit && find[start] === replace[start]) start++
  let end = 0
  while (end < limit - start && find[find.length - 1 - end] === replace[replace.length - 1 - end]) {
    end++
  }
  return {
    offset: start,
    length: find.length - start - end,
    text: replace.slice(start, replace.length - end)
  }
}

export function findNoteEditRanges(doc, edits, range = {}) {
  const given = Array.isArray(edits) ? edits.filter((edit) => edit?.find) : []
  const stripped = given.map(stripEditMarkers)
  const list = stripped.filter((edit) => edit !== null && edit.find !== edit.replace)
  const structural = given.filter((edit, index) => stripped[index] === null)
  const from = Math.max(0, range.from ?? 0)
  const to = Math.min(doc.content.size, range.to ?? doc.content.size)
  const matches = []
  const counts = list.map(() => 0)
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    const blockStart = pos + 1
    const blockEnd = pos + node.nodeSize - 1
    if (blockEnd < from || blockStart > to) return false
    const { text, positions } = blockText(node, blockStart)
    list.forEach((edit, index) => {
      let at = text.indexOf(edit.find)
      while (at !== -1 && (edit.all || counts[index] === 0)) {
        const start = positions[at]
        const end = positions[at + edit.find.length - 1] + 1
        if (start >= from && end <= to) {
          const narrowed = narrowEdit(edit.find, edit.replace ?? '')
          const changeStart = positions[at + narrowed.offset] ?? end
          const changeEnd =
            narrowed.length > 0
              ? positions[at + narrowed.offset + narrowed.length - 1] + 1
              : changeStart
          const emptiesBlock =
            !narrowed.text &&
            changeStart <= blockStart &&
            changeEnd >= blockEnd &&
            blockEnd > blockStart
          matches.push({
            from: changeStart,
            to: changeEnd,
            text: narrowed.text,
            ...(emptiesBlock ? { block: blockDeleteRange(doc, pos, node) } : {})
          })
          counts[index]++
        }
        at = text.indexOf(edit.find, at + edit.find.length)
      }
    })
    return false
  })
  matches.sort((a, b) => a.from - b.from)
  const ranges = []
  let lastEnd = -1
  for (const match of matches) {
    if (match.from < lastEnd || (match.from === match.to && !match.text)) continue
    ranges.push(match)
    lastEnd = match.to
  }
  const removed = ranges.filter((match) => match.block)
  const kept = ranges.filter(
    (match) =>
      match.block || !removed.some((block) => match.from >= block.from && match.to <= block.to)
  )
  return {
    ranges: kept,
    missing: [...list.filter((_, index) => counts[index] === 0), ...structural]
  }
}

export function buildNoteEditsTransaction(state, edits, range = {}) {
  const { ranges, missing } = findNoteEditRanges(state.doc, edits, range)
  if (ranges.length === 0) return { tr: null, applied: 0, missing }
  const tr = state.tr
  for (const match of [...ranges].reverse()) {
    if (match.text) tr.insertText(match.text, match.from, match.to)
    else if (match.block) tr.delete(match.block.from, match.block.to)
    else if (match.to > match.from) tr.delete(match.from, match.to)
  }
  return { tr, applied: ranges.length, missing }
}

const WORD_RUN = /[^\s\uFFFC]+/g

function wordSpans(text) {
  return [...text.matchAll(WORD_RUN)].map((match) => ({
    word: match[0],
    start: match.index,
    end: match.index + match[0].length
  }))
}

function matchWords(before, after) {
  const n = before.length
  const m = after.length
  const table = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] =
        before[i].word === after[j].word
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }
  const pairs = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (before[i].word === after[j].word) pairs.push([i++, j++])
    else if (table[i + 1][j] >= table[i][j + 1]) i++
    else j++
  }
  return pairs
}

function selectedSegments(doc, from, to) {
  const segments = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    const blockStart = pos + 1
    const blockEnd = pos + node.nodeSize - 1
    if (blockEnd < from || blockStart > to) return false
    const { text, positions } = blockText(node, blockStart)
    let first = 0
    while (first < positions.length && positions[first] < from) first++
    let last = positions.length
    while (last > first && positions[last - 1] >= to) last--
    const raw = text.slice(first, last)
    const lead = raw.length - raw.trimStart().length
    const trimmed = raw.trim()
    if (!trimmed) return false
    segments.push({
      node,
      pos,
      text: trimmed,
      positions: positions.slice(first + lead, first + lead + trimmed.length),
      whole: trimmed.length === text.trim().length
    })
    return false
  })
  return segments
}

const comparable = (text) => text.split(INLINE_PLACEHOLDER).join(' ').trim()

function lineChanges(segment, line) {
  const before = wordSpans(segment.text)
  const after = wordSpans(line)
  const pairs = matchWords(before, after)
  const anchors = [...pairs, [before.length, after.length]]
  const changes = []
  let oldFrom = 0
  let newFrom = 0
  for (const [i, j] of anchors) {
    const oldTo = i < before.length ? before[i].start : segment.text.length
    const newTo = j < after.length ? after[j].start : line.length
    const oldGap = segment.text.slice(oldFrom, oldTo)
    const newGap = line.slice(newFrom, newTo)
    const spacingOnly = !oldGap.split(INLINE_PLACEHOLDER).join('').trim() && !newGap.trim()
    if (oldGap !== newGap && !spacingOnly) {
      const narrowed = narrowEdit(oldGap, newGap)
      const start = oldFrom + narrowed.offset
      const end = start + narrowed.length
      if (segment.text.slice(start, end).includes(INLINE_PLACEHOLDER)) return null
      const at =
        start < segment.positions.length
          ? segment.positions[start]
          : segment.positions[segment.positions.length - 1] + 1
      const until = end > start ? segment.positions[end - 1] + 1 : at
      changes.push({ from: at, to: until, text: narrowed.text })
    }
    if (i < before.length) {
      oldFrom = before[i].end
      newFrom = after[j].end
    }
  }
  return changes
}

/**
 * Applies a line-for-line rewrite of a selection in place, word by word, so
 * marks, links, list items and inline nodes outside the changed words survive.
 * Returns null when the selection does not line up with the rewrite (a code
 * block or a soft break), so the caller can avoid flattening it.
 */
export function buildLineRewriteTransaction(state, range, beforeText, afterText) {
  const doc = state.doc
  const from = Math.max(0, range?.from ?? 0)
  const to = Math.min(doc.content.size, range?.to ?? doc.content.size)
  const beforeLines = String(beforeText ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const afterLines = String(afterText ?? '').split('\n')
  const segments = selectedSegments(doc, from, to)
  if (segments.length !== beforeLines.length) return null
  if (segments.some((segment, index) => comparable(segment.text) !== beforeLines[index]))
    return null
  const editedLines = beforeLines.length === afterLines.length ? afterLines : null
  if (!editedLines) return null

  const changes = []
  let skipped = 0
  segments.forEach((segment, index) => {
    const line = editedLines[index].trim()
    if (line === beforeLines[index]) return
    if (!line) {
      if (segment.text.includes(INLINE_PLACEHOLDER)) {
        skipped++
        return
      }
      const span = segment.whole
        ? blockDeleteRange(doc, segment.pos, segment.node)
        : { from: segment.positions[0], to: segment.positions[segment.positions.length - 1] + 1 }
      changes.push({ ...span, text: '' })
      return
    }
    const lineEdits = lineChanges(segment, line)
    if (lineEdits === null) skipped++
    else changes.push(...lineEdits)
  })
  const tr = state.tr
  for (const change of changes.sort((a, b) => b.from - a.from)) {
    if (change.text) tr.insertText(change.text, change.from, change.to)
    else if (change.to > change.from) tr.delete(change.from, change.to)
  }
  return { tr, applied: changes.length, skipped }
}

const plainLine = (text) =>
  String(text ?? '')
    .replace(NO_BREAK_SPACE, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const isTaskListAt = (doc, pos, taskList) => {
  const $pos = doc.resolve(pos)
  return $pos.nodeBefore?.type === taskList && $pos.nodeAfter?.type === taskList
}

/** Top-level paragraphs with one of `texts` become unticked checklist items; null when none matched. */
export function buildMakeTasksTransaction(state, texts) {
  const { taskList, taskItem } = state.schema.nodes
  if (!taskList || !taskItem) return null
  const wanted = new Set((Array.isArray(texts) ? texts : []).map(plainLine).filter(Boolean))
  const targets = []
  state.doc.forEach((node, offset) => {
    if (node.type.name === 'paragraph' && wanted.has(plainLine(node.textContent))) {
      targets.push({ node, offset })
    }
  })
  if (!targets.length) return null
  const tr = state.tr
  for (const { node, offset } of targets.reverse()) {
    const list = taskList.create(null, taskItem.create({ checked: false }, node))
    tr.replaceWith(offset, offset + node.nodeSize, list)
    if (isTaskListAt(tr.doc, offset + list.nodeSize, taskList)) tr.join(offset + list.nodeSize)
    if (isTaskListAt(tr.doc, offset, taskList)) tr.join(offset)
  }
  return { tr, applied: targets.length }
}

/** Inserts `blocks` (Tiptap JSON) after the image with `src`, or at the end; drops the image unless `keepImage`. */
export function buildImageDetailsTransaction(state, { src, blocks, keepImage = true }) {
  let nodes
  try {
    nodes = (Array.isArray(blocks) ? blocks : []).map((json) => state.schema.nodeFromJSON(json))
  } catch {
    return null
  }
  if (!nodes.length) return null
  let image = null
  if (src) {
    state.doc.descendants((node, pos) => {
      if (image) return false
      if (node.type.name === 'image' && node.attrs.src === src) {
        image = { pos, end: pos + node.nodeSize }
        return false
      }
    })
  }
  const tr = state.tr
  if (!image) {
    tr.insert(state.doc.content.size, nodes)
    return { tr, removedImage: false }
  }
  const $image = state.doc.resolve(image.pos)
  const insertAt = $image.depth ? $image.after(1) : image.end
  tr.insert(insertAt, nodes)
  if (!keepImage) tr.delete(image.pos, image.end)
  return { tr, removedImage: !keepImage }
}
