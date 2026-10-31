export const ATTACHMENT_KIND = {
  PHOTO: 'photo',
  PDF: 'pdf',
  AUDIO: 'audio',
  FILE: 'file'
}

export const ATTACHMENT_KINDS = [
  ATTACHMENT_KIND.PHOTO,
  ATTACHMENT_KIND.PDF,
  ATTACHMENT_KIND.AUDIO,
  ATTACHMENT_KIND.FILE
]

export const ATTACHMENT_GROUP = { FOLDER: 'folder', TYPE: 'type', MONTH: 'month' }

export const ATTACHMENT_FILTER_ALL = 'all'

const ATTACHMENT_TAG = /<div\b[^>]*\bdata-(file|audio)-attachment\b[^>]*>|<img\b[^>]*>/gi
const attr = (tag, name) => {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i'))
  return match ? decodeAttr(match[1]) : ''
}

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }
const decodeAttr = (value) => value.replace(/&(?:amp|lt|gt|quot|#39);/g, (m) => ENTITIES[m])

const toNumber = (value) => {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : 0
}

export function attachmentKind(fileType, fileName) {
  const type = (fileType || '').toLowerCase()
  const name = (fileName || '').toLowerCase()
  if (type.startsWith('image/')) return ATTACHMENT_KIND.PHOTO
  if (type === 'application/pdf' || name.endsWith('.pdf')) return ATTACHMENT_KIND.PDF
  if (type.startsWith('audio/')) return ATTACHMENT_KIND.AUDIO
  return ATTACHMENT_KIND.FILE
}

/** Inline images, file attachments and recordings, in document order, one per url. */
export function getNoteAttachments(html) {
  if (!html) return []
  const found = []
  const seen = new Set()
  for (const match of html.matchAll(ATTACHMENT_TAG)) {
    const tag = match[0]
    let item
    if (match[1] === 'audio') {
      item = {
        kind: ATTACHMENT_KIND.AUDIO,
        url: attr(tag, 'url'),
        fileName: attr(tag, 'filename'),
        fileType: '',
        size: 0,
        duration: toNumber(attr(tag, 'duration'))
      }
    } else if (match[1] === 'file') {
      const fileName = attr(tag, 'filename')
      const fileType = attr(tag, 'filetype')
      item = {
        kind: attachmentKind(fileType, fileName),
        url: attr(tag, 'url'),
        fileName,
        fileType,
        size: toNumber(attr(tag, 'filesize')),
        duration: 0
      }
    } else {
      item = {
        kind: ATTACHMENT_KIND.PHOTO,
        url: attr(tag, 'src'),
        fileName: attr(tag, 'alt') || attr(tag, 'title'),
        fileType: '',
        size: 0,
        duration: 0
      }
    }
    if (!item.url || item.url.startsWith('data:') || seen.has(item.url)) continue
    seen.add(item.url)
    found.push(item)
  }
  return found
}

const COMBINING_MARKS = /\p{M}/gu
const fold = (text) => (text || '').normalize('NFKD').replace(COMBINING_MARKS, '').toLowerCase()

const monthKey = (time) => {
  const date = new Date(time || 0)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

const newestFirst = (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0) || a.order - b.order

function sectionKeyOf(item, by, unfiled) {
  if (by === ATTACHMENT_GROUP.TYPE) return item.kind
  if (by === ATTACHMENT_GROUP.MONTH) return monthKey(item.updatedAt)
  return unfiled.has(item.folderKey || '') ? '' : item.folderKey
}

// Kind counts follow the search but not the kind filter. Items outside `folders` (deleted
// folder, All notes) land in the unfiled section, keyed ''.
export function groupAttachments(
  items,
  {
    by = ATTACHMENT_GROUP.FOLDER,
    kind = ATTACHMENT_FILTER_ALL,
    query = '',
    folders = [],
    allNotesKey = ''
  } = {}
) {
  const list = Array.isArray(items) ? items : []
  const terms = fold(query).split(/\s+/).filter(Boolean)
  const matches = (item) => {
    if (!terms.length) return true
    const haystack = fold(`${item.fileName || ''} ${item.title || ''}`)
    return terms.every((term) => haystack.includes(term))
  }

  const counts = { [ATTACHMENT_FILTER_ALL]: 0 }
  for (const k of ATTACHMENT_KINDS) counts[k] = 0
  const seenUrls = new Set()
  let bytes = 0
  let missing = 0
  for (const item of list) {
    if (seenUrls.has(item.url)) continue
    seenUrls.add(item.url)
    bytes += item.size || 0
    if (item.local === false) missing++
  }

  const known = folders instanceof Set ? folders : new Set(folders)
  const unfiled = {
    has: (key) => !key || key === allNotesKey || !known.has(key)
  }

  const sections = new Map()
  list.forEach((item, order) => {
    if (!matches(item)) return
    counts[ATTACHMENT_FILTER_ALL]++
    counts[item.kind] = (counts[item.kind] || 0) + 1
    if (kind !== ATTACHMENT_FILTER_ALL && item.kind !== kind) return
    const key = sectionKeyOf(item, by, unfiled)
    if (!sections.has(key)) sections.set(key, { key, photos: [], files: [], count: 0 })
    const section = sections.get(key)
    const entry = { ...item, order }
    if (item.kind === ATTACHMENT_KIND.PHOTO) section.photos.push(entry)
    else section.files.push(entry)
    section.count++
  })

  const ordered = [...sections.values()]
  for (const section of ordered) {
    section.photos.sort(newestFirst)
    section.files.sort(newestFirst)
    section.newest = Math.max(section.photos[0]?.updatedAt || 0, section.files[0]?.updatedAt || 0)
  }
  if (by === ATTACHMENT_GROUP.TYPE) {
    ordered.sort((a, b) => ATTACHMENT_KINDS.indexOf(a.key) - ATTACHMENT_KINDS.indexOf(b.key))
  } else if (by === ATTACHMENT_GROUP.MONTH) {
    ordered.sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0))
  } else {
    ordered.sort((a, b) => b.newest - a.newest)
  }

  return { total: list.length, bytes, missing, counts, sections: ordered }
}

export const attachmentId = (item) => `${item.noteKey}|${item.url}`
