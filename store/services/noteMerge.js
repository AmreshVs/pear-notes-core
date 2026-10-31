export const MERGE_REFUSAL = Object.freeze({
  TOO_FEW: 'too-few',
  LOCKED: 'locked',
  MISSING: 'missing'
})

export const MERGE_LINE = Object.freeze({
  HEADING: 'heading',
  PARAGRAPH: 'paragraph',
  BULLET: 'bullet',
  NUMBER: 'number',
  TASK: 'task',
  ATTACHMENT: 'attachment'
})

const VOID_TAGS = new Set(['img', 'br', 'hr', 'input', 'source', 'wbr', 'col', 'area', 'embed'])
const TAG = /<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g
const LIST_TAGS = new Set(['ul', 'ol'])
const DEDUP_TAGS = new Set(['p', 'li', 'blockquote', 'pre'])
const MEDIA =
  /<(img|video|audio|iframe)\b|data-file-attachment|data-type="(image|file|audio|video)/i

const closeTag = (name) => '<' + '/' + name + '>'

const fromCode = (code) => (code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ' ')

const decode = (text) =>
  text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => fromCode(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => fromCode(parseInt(code, 16)))
    .replace(/&amp;/g, '&')

const textOf = (html) =>
  decode(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()

/** Top-level elements and text runs of an HTML fragment, or null when it doesn't parse cleanly. */
function topLevelNodes(html) {
  const nodes = []
  const stack = []
  let start = 0
  let last = 0
  const pushText = (end) => {
    if (end > last && html.slice(last, end).trim()) nodes.push({ html: html.slice(last, end) })
  }
  for (const match of html.matchAll(TAG)) {
    const [whole, closing, rawName, , selfClosing] = match
    const name = rawName.toLowerCase()
    const end = match.index + whole.length
    if (closing) {
      if (stack.pop() !== name) return null
      if (stack.length === 0) {
        nodes.push({ html: html.slice(start, end), name })
        last = end
      }
    } else if (VOID_TAGS.has(name) || selfClosing) {
      if (stack.length === 0) {
        pushText(match.index)
        nodes.push({ html: whole, name })
        last = end
      }
    } else {
      if (stack.length === 0) {
        pushText(match.index)
        start = match.index
      }
      stack.push(name)
    }
  }
  if (stack.length) return null
  pushText(html.length)
  return nodes
}

const openTagOf = (node) => node.html.slice(0, node.html.match(TAG)?.[0].length ?? 0)

const innerOf = (node) =>
  node.html.slice(openTagOf(node).length, node.html.length - closeTag(node.name).length)

const isTaskItem = (node) => /data-type="taskItem"/.test(openTagOf(node))
const isChecked = (node) => /data-checked="true"/.test(openTagOf(node))

function lineKey(node) {
  if (!DEDUP_TAGS.has(node.name) || MEDIA.test(node.html)) return null
  const text = textOf(node.html).toLowerCase()
  if (!text) return null
  return isTaskItem(node) ? `${isChecked(node) ? 'x' : 'o'}:${text}` : text
}

function linesOf(node) {
  const text = textOf(node.html)
  if (LIST_TAGS.has(node.name)) {
    const items = topLevelNodes(innerOf(node)) ?? []
    return items.flatMap((item) => {
      const itemText = textOf(item.html)
      if (!itemText) return MEDIA.test(item.html) ? [{ kind: MERGE_LINE.ATTACHMENT, text: '' }] : []
      if (isTaskItem(item))
        return [{ kind: MERGE_LINE.TASK, text: itemText, checked: isChecked(item) }]
      return [{ kind: node.name === 'ol' ? MERGE_LINE.NUMBER : MERGE_LINE.BULLET, text: itemText }]
    })
  }
  if (!text) return MEDIA.test(node.html) ? [{ kind: MERGE_LINE.ATTACHMENT, text: '' }] : []
  if (/^h[1-6]$/.test(node.name ?? '')) return [{ kind: MERGE_LINE.HEADING, text }]
  return [{ kind: MERGE_LINE.PARAGRAPH, text }]
}

/** Blocks of one later note with every line already seen removed, plus what was removed. */
function dedupNote(html, seen) {
  const nodes = topLevelNodes(html)
  if (!nodes) return { nodes: [{ html }], dropped: [], keys: [] }
  const kept = []
  const dropped = []
  const keys = []
  for (const node of nodes) {
    if (LIST_TAGS.has(node.name)) {
      const items = topLevelNodes(innerOf(node))
      if (!items) {
        kept.push(node)
        continue
      }
      const keptItems = []
      for (const item of items) {
        const key = lineKey(item)
        if (key && seen.has(key)) dropped.push(textOf(item.html))
        else {
          keptItems.push(item)
          if (key) keys.push(key)
        }
      }
      if (keptItems.length === items.length) kept.push(node)
      else if (keptItems.length)
        kept.push({
          name: node.name,
          html: openTagOf(node) + keptItems.map((item) => item.html).join('') + closeTag(node.name)
        })
      continue
    }
    const key = lineKey(node)
    if (key && seen.has(key)) dropped.push(textOf(node.html))
    else {
      kept.push(node)
      if (key) keys.push(key)
    }
  }
  return { nodes: kept, dropped, keys }
}

function seenKeys(html) {
  const keys = []
  for (const node of topLevelNodes(html) ?? []) {
    if (LIST_TAGS.has(node.name)) {
      for (const item of topLevelNodes(innerOf(node)) ?? []) {
        const key = lineKey(item)
        if (key) keys.push(key)
      }
    } else {
      const key = lineKey(node)
      if (key) keys.push(key)
    }
  }
  return keys
}

function joinBlocks(blocks, next) {
  const last = blocks[blocks.length - 1]
  if (
    last &&
    next.name &&
    LIST_TAGS.has(next.name) &&
    last.name === next.name &&
    openTagOf(last) === openTagOf(next)
  ) {
    blocks[blocks.length - 1] = {
      name: last.name,
      html: openTagOf(last) + innerOf(last) + innerOf(next) + closeTag(last.name)
    }
  } else blocks.push(next)
}

/** Why these notes can't be merged, or null when they can. */
export function checkMergeable(notes) {
  if (!Array.isArray(notes) || notes.length < 2) return MERGE_REFUSAL.TOO_FEW
  if (notes.some((note) => !note)) return MERGE_REFUSAL.MISSING
  if (notes.some((note) => note.locked)) return MERGE_REFUSAL.LOCKED
  return null
}

/**
 * The first note's blocks stay as they are; each later note adds only the
 * paragraphs and list items no earlier note already has. Every removed line
 * is returned in `dropped`, and the result line list marks the added ones.
 */
export function planMerge(notes) {
  const first = String(notes[0].note ?? '')
  const blocks = (topLevelNodes(first) ?? [{ html: first }]).slice()
  const seen = new Set(seenKeys(first))
  const result = blocks.flatMap(linesOf)
  const dropped = []
  notes.slice(1).forEach((note, i) => {
    const plan = dedupNote(String(note.note ?? ''), seen)
    for (const node of plan.nodes) {
      joinBlocks(blocks, node)
      for (const line of linesOf(node)) result.push({ ...line, added: true })
    }
    for (const text of plan.dropped) dropped.push({ text, from: i + 1 })
    for (const key of plan.keys) seen.add(key)
  })
  return {
    title: notes.find((note) => note.title?.trim())?.title?.trim() ?? '',
    note: blocks.map((block) => block.html).join(''),
    folderKey: notes[0].folderKey,
    result,
    dropped
  }
}

export function buildMergedNote(notes) {
  const { title, note, folderKey } = planMerge(notes)
  return { title, note, folderKey }
}

/** What a merge would produce, for the preview: each original's lines, the result and the removed lines. */
export function buildMergePreview(notes, keys = []) {
  const plan = planMerge(notes)
  return {
    keys,
    title: plan.title,
    folderKey: plan.folderKey,
    sources: notes.map((note, i) => ({
      key: keys[i] ?? null,
      title: note.title?.trim() ?? '',
      folderKey: note.folderKey ?? null,
      updatedAt: note.updatedAt ?? null,
      lines: (topLevelNodes(String(note.note ?? '')) ?? []).flatMap(linesOf)
    })),
    result: plan.result,
    dropped: plan.dropped
  }
}
