import {
  ACTIVITY_DEFAULT_RETENTION_DAYS,
  HYPERDRIVE_URL_PREFIX,
  ACTIVITY_RETENTION_DAY_OPTIONS,
  ACTIVITY_RETENTION_FOREVER,
  ACTIVITY_TARGET,
  ACTIVITY_EVENT_TARGETS
} from './constant.js'

const BLOCK_END_RE = /<\/(?:p|div|h[1-6]|li|blockquote|pre|tr|figure|figcaption)\s*>/gi
const BREAK_RE = /<br\s*\/?>/gi
const LIST_ITEM_RE = /<li\b[^>]*>/gi
const IMG_RE = /<img\b[^>]*>/gi
const FILE_ATTACHMENT_RE = /<div\b[^>]*\bdata-file-attachment\b[^>]*>/gi
const AUDIO_ATTACHMENT_RE = /<div\b[^>]*\bdata-audio-attachment\b[^>]*>/gi
const TAG_RE = /<[^>]*>/g
const ATTR_RE = /\b(filename|filetype|url|src|alt|name)\s*=\s*"([^"]*)"/gi
const NAME_PARAM_RE = /[?&]name=([^&"'\s]+)/i
const TRAILING_SPACE_RE = /[ \t]+$/gm
const EXTRA_BLANK_RE = /\n{3,}/g

const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'",
  nbsp: ' '
}

const MAX_DIFF_LINES = 800
const DIFF_CONTEXT_LINES = 3

function decodeEntities(value) {
  return value.replace(/&(#?[a-z0-9]+);/gi, (match, name) => {
    const key = name.toLowerCase()
    if (ENTITIES[key] !== undefined) return ENTITIES[key]
    if (key.startsWith('#')) {
      const code = key.startsWith('#x') ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10)
      if (Number.isFinite(code) && code > 0 && code < 1114112) return String.fromCodePoint(code)
    }
    return match
  })
}

function readAttrs(tag) {
  const attrs = {}
  ATTR_RE.lastIndex = 0
  let match = ATTR_RE.exec(tag)
  while (match) {
    attrs[match[1].toLowerCase()] = decodeEntities(match[2])
    match = ATTR_RE.exec(tag)
  }
  return attrs
}

const FILENAME_RE = /^[^/\\?#]+\.[A-Za-z0-9]{1,8}$/

function attachmentName(attrs) {
  if (attrs.filename) return attrs.filename
  if (attrs.alt) return attrs.alt
  const source = attrs.url || attrs.src || ''
  const fromParam = source.match(NAME_PARAM_RE)
  if (fromParam) {
    try {
      return decodeURIComponent(fromParam[1])
    } catch {
      return fromParam[1]
    }
  }
  const path = source.split('?')[0].replace(/^[a-z]+:\/\//i, '')
  const segments = path.split('/').filter(Boolean)
  if (segments.length < 2) return ''
  const last = segments[segments.length - 1]
  return FILENAME_RE.test(last) ? last : ''
}

function attachmentKind(attrs) {
  const type = (attrs.filetype || '').toLowerCase()
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('audio/')) return 'audio'
  return 'file'
}

function placeholder(kind, name) {
  return name ? `[${kind}: ${name}]` : `[${kind}]`
}

export function htmlToActivityText(html) {
  if (!html || typeof html !== 'string') return ''
  let text = html
    .replace(FILE_ATTACHMENT_RE, (tag) => {
      const attrs = readAttrs(tag)
      return `\n${placeholder(attachmentKind(attrs), attachmentName(attrs))}\n`
    })
    .replace(
      AUDIO_ATTACHMENT_RE,
      (tag) => `\n${placeholder('audio', attachmentName(readAttrs(tag)))}\n`
    )
    .replace(IMG_RE, (tag) => `\n${placeholder('image', attachmentName(readAttrs(tag)))}\n`)
    .replace(BREAK_RE, '\n')
    .replace(LIST_ITEM_RE, '- ')
    .replace(BLOCK_END_RE, '\n')
    .replace(TAG_RE, '')

  text = decodeEntities(text).replace(/\r\n?/g, '\n').replace(TRAILING_SPACE_RE, '')
  return text.replace(EXTRA_BLANK_RE, '\n\n').trim()
}

export function splitActivityLines(text) {
  if (!text) return []
  return text.split('\n')
}

export function countAttachments(html) {
  if (!html || typeof html !== 'string') return 0
  const files = html.match(FILE_ATTACHMENT_RE) || []
  const audio = html.match(AUDIO_ATTACHMENT_RE) || []
  const images = html.match(IMG_RE) || []
  return files.length + audio.length + images.length
}

export function listAttachmentNames(html) {
  if (!html || typeof html !== 'string') return []
  const names = []
  const collect = (regex, fallbackKind) => {
    const tags = html.match(regex) || []
    for (const tag of tags) {
      const attrs = readAttrs(tag)
      names.push({ kind: fallbackKind || attachmentKind(attrs), name: attachmentName(attrs) })
    }
  }
  collect(FILE_ATTACHMENT_RE, null)
  collect(AUDIO_ATTACHMENT_RE, 'audio')
  collect(IMG_RE, 'image')
  return names
}

function buildLcsTable(a, b) {
  const rows = a.length + 1
  const cols = b.length + 1
  const table = new Uint32Array(rows * cols)
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      const index = i * cols + j
      if (a[i] === b[j]) {
        table[index] = table[(i + 1) * cols + (j + 1)] + 1
      } else {
        const down = table[(i + 1) * cols + j]
        const right = table[index + 1]
        table[index] = down > right ? down : right
      }
    }
  }
  return { table, cols }
}

function lcsOperations(a, b) {
  const operations = []
  if (a.length > MAX_DIFF_LINES || b.length > MAX_DIFF_LINES) {
    for (const line of a) operations.push({ type: 'del', text: line })
    for (const line of b) operations.push({ type: 'add', text: line })
    return operations
  }
  const { table, cols } = buildLcsTable(a, b)
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      operations.push({ type: 'ctx', text: a[i] })
      i++
      j++
    } else if (table[(i + 1) * cols + j] >= table[i * cols + (j + 1)]) {
      operations.push({ type: 'del', text: a[i] })
      i++
    } else {
      operations.push({ type: 'add', text: b[j] })
      j++
    }
  }
  while (i < a.length) operations.push({ type: 'del', text: a[i++] })
  while (j < b.length) operations.push({ type: 'add', text: b[j++] })
  return operations
}

function withLineNumbers(operations) {
  let before = 0
  let after = 0
  return operations.map((operation) => {
    if (operation.type === 'del') {
      before++
      return { ...operation, before, after: null }
    }
    if (operation.type === 'add') {
      after++
      return { ...operation, before: null, after }
    }
    before++
    after++
    return { ...operation, before, after }
  })
}

function collapseContext(rows, context) {
  const keep = new Array(rows.length).fill(false)
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].type === 'ctx') continue
    const from = Math.max(0, i - context)
    const to = Math.min(rows.length - 1, i + context)
    for (let j = from; j <= to; j++) keep[j] = true
  }

  const output = []
  let skipped = 0
  for (let i = 0; i < rows.length; i++) {
    if (keep[i]) {
      if (skipped > 0) {
        output.push({ type: 'gap', count: skipped, text: '', before: null, after: null })
        skipped = 0
      }
      output.push(rows[i])
    } else {
      skipped++
    }
  }
  if (skipped > 0) output.push({ type: 'gap', count: skipped, text: '', before: null, after: null })
  return output
}

export function diffActivityText(beforeText, afterText, options = {}) {
  const context = options.context === undefined ? DIFF_CONTEXT_LINES : options.context
  const before = splitActivityLines(beforeText || '')
  const after = splitActivityLines(afterText || '')

  let start = 0
  while (start < before.length && start < after.length && before[start] === after[start]) start++

  let endBefore = before.length
  let endAfter = after.length
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore--
    endAfter--
  }

  const head = before.slice(0, start).map((text) => ({ type: 'ctx', text }))
  const middle = lcsOperations(before.slice(start, endBefore), after.slice(start, endAfter))
  const tail = before.slice(endBefore).map((text) => ({ type: 'ctx', text }))

  const rows = withLineNumbers([...head, ...middle, ...tail])
  const added = rows.filter((row) => row.type === 'add').length
  const removed = rows.filter((row) => row.type === 'del').length

  return {
    rows: context === null ? rows : collapseContext(rows, context),
    added,
    removed,
    unchanged: added === 0 && removed === 0,
    truncated: before.length - start > MAX_DIFF_LINES || after.length - start > MAX_DIFF_LINES
  }
}

export function countActivityChanges(beforeText, afterText) {
  const { added, removed, unchanged } = diffActivityText(beforeText, afterText, { context: 0 })
  return { added, removed, unchanged }
}

export function findDeviceByLocalKey(devices, localKey) {
  if (!localKey || !devices) return null
  const list = Array.isArray(devices) ? devices : Object.values(devices)
  return list.find((device) => device && device.localKey === localKey) || null
}

const RAW_DEVICE_KEY_RE = /^[0-9a-f]{32,}$/i

export function isNamedDevice(device) {
  return !!device?.title && !RAW_DEVICE_KEY_RE.test(device.title)
}

export function getActivityDeviceLabel(localKey, devices, options = {}) {
  const { platformNames = {}, unknownLabel = '' } = options
  const device = findDeviceByLocalKey(devices, localKey)
  if (!device) return unknownLabel
  if (isNamedDevice(device)) return device.title
  return platformNames[device.platform] || unknownLabel
}

export function isActivityRetentionForever(days) {
  return normalizeActivityRetentionDays(days) >= ACTIVITY_RETENTION_FOREVER
}

export function normalizeActivityRetentionDays(days) {
  const value = Number(days)
  if (!Number.isFinite(value) || value <= 0) return ACTIVITY_DEFAULT_RETENTION_DAYS
  return ACTIVITY_RETENTION_DAY_OPTIONS.includes(value) ? value : ACTIVITY_DEFAULT_RETENTION_DAYS
}

export function getActivityTargetKind(event) {
  return ACTIVITY_EVENT_TARGETS[event] || ACTIVITY_TARGET.SYSTEM
}

export function isNoteActivity(event) {
  return getActivityTargetKind(event) === ACTIVITY_TARGET.NOTE
}

const HYPERDRIVE_HOST = HYPERDRIVE_URL_PREFIX.replace(/^[a-z]+:\/\//i, '')

export function getActivityMessage(entry, t, options = {}) {
  const { hidden = false, showTarget = true } = options
  const target = hidden
    ? t('activity.lockedNote')
    : entry?.targetTitle || t('activity.untitledNote')

  const meta = entry?.meta || {}
  const storedName = meta.fileName && meta.fileName !== HYPERDRIVE_HOST ? meta.fileName : ''
  const fileName =
    storedName ||
    (meta.kind ? t(`activity.attachmentKinds.${meta.kind}`, { defaultValue: '' }) : '')

  const params = {
    target,
    from: meta.from || meta.fromFolder || '',
    to: meta.to || meta.toFolder || '',
    fileName,
    platform: meta.platform || t('activity.unknownPlatform')
  }

  const full = t(`activity.events.${entry?.event}`, { ...params, defaultValue: entry?.event || '' })
  if (showTarget) return full
  return t(`activity.eventsShort.${entry?.event}`, { ...params, defaultValue: full })
}
