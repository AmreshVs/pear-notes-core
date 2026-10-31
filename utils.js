import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

import { backendApi } from './backend/api.js'

import {
  BACKGROUND_SERVICE_FAILED_AT_KEY,
  BACKUP_PASSWORD_MIN_LENGTH,
  DEFAULT_FOLDER_ICON,
  EDITOR_SYNC,
  FOLDER_ERROR,
  FOLDER_ICONS,
  INVITE_CLOCK_SKEW_MS,
  INVITE_KIND,
  LAST_SYNC_AT_KEY,
  LAST_SYNC_RECEIVED_KEY,
  LAST_WAKE_AT_KEY,
  LAST_WAKE_RESULT_KEY,
  PAIRING_INVITE_VERSION,
  PAIRING_PROTOCOL,
  VAULT_INVITE_PROTOCOL,
  normalizeAttachmentUrls
} from './constant.js'
import * as log from './log.js'

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export function getBackupPasswordChecks(password) {
  const value = password || ''
  return {
    length: value.length >= BACKUP_PASSWORD_MIN_LENGTH,
    lowercase: /[a-z]/.test(value),
    uppercase: /[A-Z]/.test(value),
    number: /[0-9]/.test(value),
    symbol: /[^A-Za-z0-9]/.test(value)
  }
}

export function getBackupPasswordStrength(password) {
  const checks = getBackupPasswordChecks(password)
  const score = Object.values(checks).filter(Boolean).length
  const valid = Object.values(checks).every(Boolean)
  return { checks, score, valid }
}

export function isValidBackupPassword(password) {
  return getBackupPasswordStrength(password).valid
}

const FINGERPRINT_EMOJIS = [
  '🥑',
  '🍐',
  '🍎',
  '🍊',
  '🍋',
  '🍌',
  '🍉',
  '🍇',
  '🍓',
  '🫐',
  '🍒',
  '🍑',
  '🥝',
  '🥥',
  '🍍',
  '🥭'
]

export function getFingerprint(hex) {
  if (!hex) return ''
  const hash = hex.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)

  let fingerprint = ''
  for (let i = 0; i < 3; i++) {
    const index = (hash + i * 7) % FINGERPRINT_EMOJIS.length
    fingerprint += FINGERPRINT_EMOJIS[index]
  }

  return `${fingerprint} (${hex.slice(0, 5)})`
}

export function formatPairingCode(bytes) {
  if (!bytes || bytes.length < 6) return ''
  let emojis = ''
  for (let i = 0; i < 3; i++) emojis += FINGERPRINT_EMOJIS[bytes[i] % FINGERPRINT_EMOJIS.length]
  let hex = ''
  for (let i = 3; i < 6; i++) hex += bytes[i].toString(16).padStart(2, '0')
  return `${emojis} (${hex.slice(0, 5)})`
}

export function debounce(fn, ms) {
  let timeoutId
  return function (...args) {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn.apply(this, args), ms)
  }
}

const elapsedSince = (timestamp) => Math.max(0, Date.now() - new Date(timestamp))

const getDayDiff = (timestamp) => {
  if (!timestamp) return Infinity
  return Math.floor(elapsedSince(timestamp) / (1000 * 60 * 60 * 24))
}

export const NOTES_LIST_GROUP = {
  PINNED: 'Pinned',
  TODAY: 'Today',
  YESTERDAY: 'Yesterday',
  L7DAYS: 'Last 7 Days',
  L30DAYS: 'Last 30 Days'
}

export const getGroupTitle = (note) => {
  const timestamp = note.value?.updatedAt || note.value?.createdAt
  if (!timestamp) return 'No Date'

  const diff = getDayDiff(timestamp)
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const currentYear = new Date().getFullYear()

  if (diff === 0) return NOTES_LIST_GROUP.TODAY
  if (diff === 1) return NOTES_LIST_GROUP.YESTERDAY
  if (diff < 7) return NOTES_LIST_GROUP.L7DAYS
  if (diff < 30) return NOTES_LIST_GROUP.L30DAYS
  if (year === currentYear) return date.toLocaleString('default', { month: 'long' })
  return year.toString()
}

export const formatDate = (timestamp) => {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const diff = elapsedSince(timestamp)
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (days === 0) {
    const hours = Math.floor(diff / (1000 * 60 * 60))
    if (hours === 0) {
      const minutes = Math.floor(diff / (1000 * 60))
      return minutes <= 1 ? 'Just now' : `${minutes}m ago`
    }
    return `${hours}h ago`
  } else if (days === 1) {
    return 'Yesterday'
  } else if (days < 7) {
    return `${days}d ago`
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
}

const PREVIEW_MAX_LENGTH = 100

const BLOCK_BOUNDARY_REGEX = /<\/(?:p|div|h[1-6]|li|blockquote|pre|tr|figcaption)>|<br\s*\/?>/gi

const NAMED_ENTITIES = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'"
}

const decodeHtmlEntities = (text) =>
  text
    .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;|&apos;/g, (match) => NAMED_ENTITIES[match])
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))

export const htmlToPreviewText = (html) => {
  if (!html) return ''
  const stripped = decodeHtmlEntities(
    html.replace(BLOCK_BOUNDARY_REGEX, ' ').replace(/<[^>]*>/g, '')
  )
  return stripped.replace(/\s+/g, ' ').trim()
}

export const getPreview = (content, contentHtml) => {
  const text = htmlToPreviewText(contentHtml || content || '')
  if (!text) return ''
  return text.length > PREVIEW_MAX_LENGTH ? text.substring(0, PREVIEW_MAX_LENGTH) + '…' : text
}

const FILE_ATTACHMENT_TAG_REGEX = /<div\b[^>]*\bdata-file-attachment\b[^>]*>/gi
const FILETYPE_ATTR_REGEX = /\bfiletype\s*=\s*"([^"]*)"/i

export const getAttachmentInfo = (contentHtml) => {
  if (!contentHtml) return null

  let image = (contentHtml.match(/<img\b/gi) || []).length
  let video = 0
  let audio = (contentHtml.match(/\bdata-audio-attachment\b/gi) || []).length
  let file = 0

  const fileTags = contentHtml.match(FILE_ATTACHMENT_TAG_REGEX) || []
  for (const tag of fileTags) {
    const type = (tag.match(FILETYPE_ATTR_REGEX)?.[1] || '').toLowerCase()
    if (type.startsWith('image/')) image++
    else if (type.startsWith('video/')) video++
    else if (type.startsWith('audio/')) audio++
    else file++
  }

  const total = image + video + audio + file
  if (total === 0) return null

  const kindsPresent = [image, video, audio, file].filter((count) => count > 0).length
  if (kindsPresent > 1) return { kind: 'mixed', count: total }
  if (image) return { kind: 'image', count: image }
  if (video) return { kind: 'video', count: video }
  if (audio) return { kind: 'audio', count: audio }
  return { kind: 'file', count: file }
}

export const getFirstImage = (contentHtml) => {
  if (!contentHtml) return null

  const parser = new DOMParser()
  const doc = parser.parseFromString(contentHtml, 'text/html')

  const img = doc.querySelector('img')
  if (img?.src) return img.src

  const fileImage = doc.querySelector('div[data-file-attachment][filetype^="image/"]')
  return fileImage?.getAttribute('url') || null
}

export const inviteRegex = /^(?:[0-9a-fA-F]{2}){66,}$/

const INVITE_VERSION = 1
const INVITE_FLAG_DISCOVERY_KEY = 1
const INVITE_FLAG_EXPIRES = 2
const INVITE_FLAG_ADDITIONAL_NODES = 16
const INVITE_KNOWN_FLAGS = 31
const INVITE_KEY_BYTES = 32
const INVITE_EXPIRES_BYTES = 4
const INVITE_DHT_NODE_BYTES = 6
const VARINT_UINT16_MARKER = 0xfd
const VARINT_UINT16_BYTES = 2
const VARINT_SINGLE_BYTE_MAX = 0xfc

const hexToBytes = (hex) => {
  const bytes = new Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16)
  }
  return bytes
}

const readInviteVarint = (bytes, offset) => {
  const first = bytes[offset]
  if (first === undefined) return null
  if (first <= VARINT_SINGLE_BYTE_MAX) return { value: first, size: 1 }
  if (first !== VARINT_UINT16_MARKER || offset + VARINT_UINT16_BYTES >= bytes.length) return null
  return { value: bytes[offset + 1] | (bytes[offset + 2] << 8), size: 1 + VARINT_UINT16_BYTES }
}

const hasValidInviteLayout = (bytes) => {
  if (bytes[0] !== INVITE_VERSION) return false
  const flags = bytes[1]
  if (flags === undefined || flags > INVITE_KNOWN_FLAGS) return false
  if (!(flags & INVITE_FLAG_DISCOVERY_KEY)) return false

  let offset = 2 + INVITE_KEY_BYTES * 2
  if (flags & INVITE_FLAG_EXPIRES) offset += INVITE_EXPIRES_BYTES
  if (flags & INVITE_FLAG_ADDITIONAL_NODES) {
    const count = readInviteVarint(bytes, offset)
    if (!count) return false
    offset += count.size + count.value * INVITE_DHT_NODE_BYTES
  }
  return offset === bytes.length
}

const INVITE_PREFIXES = [
  [PAIRING_PROTOCOL, INVITE_KIND.DEVICE],
  [VAULT_INVITE_PROTOCOL, INVITE_KIND.VAULT]
]

const parseInvite = (invite) => {
  if (!invite || typeof invite !== 'string') return { code: '', kind: null, query: '' }
  const trimmed = invite.trim()
  const match = INVITE_PREFIXES.find(([prefix]) => trimmed.toLowerCase().startsWith(prefix))
  if (!match) return { code: trimmed, kind: null, query: '' }
  const rest = trimmed.slice(match[0].length)
  const queryIndex = rest.indexOf('?')
  if (queryIndex === -1) return { code: rest, kind: match[1], query: '' }
  return { code: rest.slice(0, queryIndex), kind: match[1], query: rest.slice(queryIndex + 1) }
}

export const extractInvite = (invite) => parseInvite(invite).code

export const getInviteKind = (invite) => parseInvite(invite).kind

export const isInviteForOtherKind = (invite, kind) => {
  const inviteKind = getInviteKind(invite)
  return !!inviteKind && inviteKind !== kind
}

export const getInviteNameHint = (invite) => {
  const { kind, query } = parseInvite(invite)
  if (kind !== INVITE_KIND.VAULT || !query) return ''
  for (const pair of query.split('&')) {
    const [key, value = ''] = pair.split('=')
    if (key !== 'name') continue
    try {
      return decodeURIComponent(value.replace(/\+/g, ' ')).trim()
    } catch {
      return ''
    }
  }
  return ''
}

const getInviteParam = (invite, name) => {
  const { query } = parseInvite(invite)
  for (const pair of query ? query.split('&') : []) {
    const [key, value = ''] = pair.split('=')
    if (key === name) return value
  }
  return null
}

export const getInviteVersion = (invite) => {
  const value = getInviteParam(invite, 'v')
  return value === null ? 1 : Number.parseInt(value, 10) || 1
}

export const getInviteHostBox = (invite) => {
  const value = getInviteParam(invite, 'h')
  return value && /^[0-9a-f]{64}$/i.test(value) ? value.toLowerCase() : ''
}

const inviteQuery = (hostBox) => `?v=${PAIRING_INVITE_VERSION}${hostBox ? `&h=${hostBox}` : ''}`

export const formatDeviceInvite = (invite, hostBox = getInviteHostBox(invite)) => {
  const code = extractInvite(invite)
  return code ? `${PAIRING_PROTOCOL}${code}${inviteQuery(hostBox)}` : ''
}

export const formatVaultInvite = (invite, name) => {
  const code = extractInvite(invite)
  if (!code) return ''
  const link = `${VAULT_INVITE_PROTOCOL}${code}${inviteQuery(getInviteHostBox(invite))}`
  const trimmed = (name || '').trim()
  return trimmed ? `${link}&name=${encodeURIComponent(trimmed)}` : link
}

export const isValidInvite = (invite, kind = null) => {
  if (kind && isInviteForOtherKind(invite, kind)) return false
  const rawInvite = extractInvite(invite)
  if (!inviteRegex.test(rawInvite)) return false
  return hasValidInviteLayout(hexToBytes(rawInvite))
}

export const compareVersions = (a, b) => {
  const partsA = String(a || '0')
    .split('.')
    .map(Number)
  const partsB = String(b || '0')
    .split('.')
    .map(Number)
  const length = Math.max(partsA.length, partsB.length)

  for (let i = 0; i < length; i++) {
    const numA = partsA[i] || 0
    const numB = partsB[i] || 0
    if (numA > numB) return 1
    if (numA < numB) return -1
  }

  return 0
}

export const getUpdateStatus = ({ currentVersion, latestVersion, minimumVersion }) => {
  const updateAvailable = !!latestVersion && compareVersions(currentVersion, latestVersion) < 0
  const mandatory = !!minimumVersion && compareVersions(currentVersion, minimumVersion) < 0
  return { updateAvailable, mandatory }
}

export function formatBytes(bytes) {
  if (!bytes || bytes < 1) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1000)), units.length - 1)
  return `${(bytes / Math.pow(1000, i)).toFixed(units[i] === 'GB' ? 2 : 1)} ${units[i]}`
}

export function groupTransfersByNote(items, noteTitles, untitledLabel) {
  const order = []
  const byNote = new Map()
  for (const item of items) {
    if (!byNote.has(item.noteKey)) {
      byNote.set(item.noteKey, [])
      order.push(item.noteKey)
    }
    byNote.get(item.noteKey).push(item)
  }
  return order.map((noteKey) => ({
    noteKey,
    title: noteTitles[noteKey] || untitledLabel,
    items: byNote.get(noteKey) || []
  }))
}

const RAW_KEY_REGEX = /^[0-9a-f]{32,}$/i

export function isRawDeviceKey(value) {
  return typeof value === 'string' && RAW_KEY_REGEX.test(value)
}

export function getDeviceShortKey(key) {
  if (!key || typeof key !== 'string') return ''
  if (key.length <= 12) return key
  return `${key.slice(0, 6)}…${key.slice(-5)}`
}

export function getDeviceDisplayName(device) {
  if (!device) return ''
  const { title, key } = device
  if (title) return title
  return key || 'Unnamed Device'
}

export async function getMediaSyncFlag(key) {
  try {
    const value = await backendApi.getPreference({ key })
    return value === 'true'
  } catch {
    return false
  }
}

export async function setMediaSyncFlag(key, enabled) {
  try {
    await backendApi.updatePreference({ key, value: enabled ? 'true' : 'false' })
  } catch (e) {
    log.error('setMediaSyncFlag failed', e)
  }
}

export async function getLockPrivacyPreference(key) {
  try {
    const value = await backendApi.getPreference({ key })
    return value !== 'false'
  } catch {
    return true
  }
}

export async function setLockPrivacyPreference(key, enabled) {
  try {
    await backendApi.updatePreference({ key, value: enabled ? 'true' : 'false' })
  } catch (e) {
    log.error('setLockPrivacyPreference failed', e)
  }
}

const FILENAME_ATTR_REGEX = /\bfilename\s*=\s*"([^"]*)"/i
const URL_ATTR_REGEX = /\burl\s*=\s*"([^"]*)"/i
const PDF_MIME_TYPE = 'application/pdf'

const decodeAttr = (value) => (value || '').replace(/&amp;/g, '&')

// Every PDF attachment in a note, in document order. Callers key caches off `url`, so it is
// unescaped here the same way getFirstImageUrl does — a `&amp;` left in place produces a
// different cache identity for the same attachment.
export function getPdfAttachments(html) {
  if (!html) return []
  const found = []
  const tags = html.match(FILE_ATTACHMENT_TAG_REGEX) || []
  for (const tag of tags) {
    const fileType = (tag.match(FILETYPE_ATTR_REGEX)?.[1] || '').toLowerCase()
    const fileName = decodeAttr(tag.match(FILENAME_ATTR_REGEX)?.[1])
    const isPdf = fileType === PDF_MIME_TYPE || fileName.toLowerCase().endsWith('.pdf')
    if (!isPdf) continue
    const url = decodeAttr(tag.match(URL_ATTR_REGEX)?.[1])
    if (!url) continue
    found.push({ url, fileName })
  }
  return found
}

export function getFirstPdfAttachment(html) {
  return getPdfAttachments(html)[0] || null
}

const IMG_SRC_REGEX = /<img\b[^>]*\bsrc\s*=\s*"([^"]*)"[^>]*>/gi

// Every image attachment url in a note — inline <img> tags plus file attachments carrying an
// image mime type. Used to work out which cached thumbnails are still referenced.
export function getImageAttachments(html) {
  if (!html) return []
  const urls = []
  const seen = new Set()
  const push = (value) => {
    const url = decodeAttr(value)
    if (!url || seen.has(url)) return
    seen.add(url)
    urls.push(url)
  }

  for (const tag of html.match(IMG_SRC_REGEX) || []) {
    push(tag.match(/\bsrc\s*=\s*"([^"]*)"/i)?.[1])
  }
  for (const tag of html.match(FILE_ATTACHMENT_TAG_REGEX) || []) {
    const fileType = (tag.match(FILETYPE_ATTR_REGEX)?.[1] || '').toLowerCase()
    if (!fileType.startsWith('image/')) continue
    push(tag.match(URL_ATTR_REGEX)?.[1])
  }
  return urls
}

function getFirstInlineImage(html) {
  const img = html.match(/<img\b[^>]*\bsrc\s*=\s*"([^"]*)"/i)?.[1]
  if (img) return decodeAttr(img)
  for (const tag of html.match(FILE_ATTACHMENT_TAG_REGEX) || []) {
    const fileType = (tag.match(FILETYPE_ATTR_REGEX)?.[1] || '').toLowerCase()
    if (!fileType.startsWith('image/')) continue
    const url = tag.match(URL_ATTR_REGEX)?.[1]
    if (url) return decodeAttr(url)
  }
  return null
}

// What a notes-list row needs from a body, so the list never has to hold the bodies themselves.
export function buildNoteSummary(html) {
  const body = html || ''
  return {
    preview: getPreview(body),
    attachment: getAttachmentInfo(body),
    imageUrl: getFirstImageUrl(body) || null,
    firstImage: body ? getFirstInlineImage(body) : null,
    pdfs: getPdfAttachments(body),
    images: getImageAttachments(body),
    isChecklist: body.includes('data-type="taskItem"')
  }
}

const noteSummaryCache = new WeakMap()

export function getNoteSummary(noteValue) {
  if (!noteValue || typeof noteValue !== 'object') return buildNoteSummary('')
  if (noteValue.summary && typeof noteValue.summary === 'object') return noteValue.summary
  const cached = noteSummaryCache.get(noteValue)
  if (cached) return cached
  const summary = buildNoteSummary(noteValue.note)
  noteSummaryCache.set(noteValue, summary)
  return summary
}

export function getFirstImageUrl(html) {
  if (!html) return undefined
  const divMatch =
    html.match(/<div[^>]*filetype="image\/[^"]*"[^>]*url="([^"]+)"[^>]*>/) ||
    html.match(/<div[^>]*url="([^"]+)"[^>]*filetype="image\/[^"]*"[^>]*>/)
  if (divMatch?.[1]) return divMatch[1].replace(/&amp;/g, '&')
  const imgMatch = html.match(/<img[^>]+src="([^"]+)"/)
  if (imgMatch?.[1]) return imgMatch[1].replace(/&amp;/g, '&')
  return undefined
}

const SECONDS_IN_MINUTE = 60
const MS_IN_SECOND = 1000
const SECONDS_TIMESTAMP_CEILING = 10000000000

export function toInviteExpiryMs(expiresAt) {
  if (!expiresAt) return 0
  return expiresAt < SECONDS_TIMESTAMP_CEILING ? expiresAt * MS_IN_SECOND : expiresAt
}

export function getInviteRemainingMs(expiresAt, now = Date.now()) {
  const expiryMs = toInviteExpiryMs(expiresAt)
  if (!expiryMs) return 0
  return Math.max(expiryMs - now, 0)
}

export function isInviteExpired(expiresAt, now = Date.now()) {
  const expiryMs = toInviteExpiryMs(expiresAt)
  if (!expiryMs) return false
  return expiryMs <= now
}

export function isInviteLongExpired(expiresAt, now = Date.now()) {
  const expiryMs = toInviteExpiryMs(expiresAt)
  if (!expiryMs) return false
  return expiryMs + INVITE_CLOCK_SKEW_MS <= now
}

export function formatInviteCountdown(remainingMs) {
  const totalSeconds = Math.ceil(remainingMs / MS_IN_SECOND)
  const minutes = Math.floor(totalSeconds / SECONDS_IN_MINUTE)
  const seconds = totalSeconds % SECONDS_IN_MINUTE
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function normalizeFolderName(name) {
  return (name || '').trim().replace(/\s+/g, ' ')
}

export function findDuplicateFolder(folders, name, excludeKey = null) {
  const target = normalizeFolderName(name).toLowerCase()
  if (!target) return null
  return (
    (folders || []).find((folder) => {
      const key = folder?.key ?? folder?.id
      if (excludeKey && key === excludeKey) return false
      const label = folder?.name ?? folder?.title
      return normalizeFolderName(label).toLowerCase() === target
    }) || null
  )
}

export function validateFolderName(folders, name, excludeKey = null) {
  const value = normalizeFolderName(name)
  if (!value) return { valid: false, error: FOLDER_ERROR.EMPTY_NAME, name: value }
  if (findDuplicateFolder(folders, value, excludeKey)) {
    return { valid: false, error: FOLDER_ERROR.DUPLICATE_NAME, name: value }
  }
  return { valid: true, error: null, name: value }
}

export function normalizeFolderIcon(icon) {
  return FOLDER_ICONS.includes(icon) ? icon : DEFAULT_FOLDER_ICON
}

export function truncateWithEllipsis(value, maxLength) {
  const text = value == null ? '' : String(value)
  if (!maxLength || text.length <= maxLength) return text
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

export function formatRelativeTime(timestamp, now = Date.now()) {
  if (!timestamp) return ''
  const diff = Math.max(0, now - timestamp)
  const seconds = Math.floor(diff / MS_IN_SECOND)
  if (seconds < 60) return 'justNow'
  const minutes = Math.floor(seconds / SECONDS_IN_MINUTE)
  if (minutes < 60) return `minutes:${minutes}`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hours:${hours}`
  return `days:${Math.floor(hours / 24)}`
}

export function resolveEditorSync({
  remoteTitle = '',
  remoteContent = '',
  baseTitle = '',
  baseContent = '',
  localTitle = '',
  localContent = ''
} = {}) {
  const remote = {
    title: remoteTitle || '',
    content: normalizeAttachmentUrls(remoteContent || '')
  }
  const base = { title: baseTitle || '', content: normalizeAttachmentUrls(baseContent || '') }
  const local = { title: localTitle || '', content: normalizeAttachmentUrls(localContent || '') }

  if (remote.title === base.title && remote.content === base.content) return EDITOR_SYNC.NONE
  if (remote.title === local.title && remote.content === local.content) return EDITOR_SYNC.ADOPT
  if (local.title === base.title && local.content === base.content) return EDITOR_SYNC.ADOPT
  return EDITOR_SYNC.CONFLICT
}

const readNumericPreference = async (key) => {
  try {
    const value = await backendApi.getPreference({ key })
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  } catch {
    return 0
  }
}

export async function getSyncStatusSnapshot() {
  try {
    const [lastSyncAt, lastReceived, lastWakeAt, serviceFailedAt, lastWakeResult] =
      await Promise.all([
        readNumericPreference(LAST_SYNC_AT_KEY),
        readNumericPreference(LAST_SYNC_RECEIVED_KEY),
        readNumericPreference(LAST_WAKE_AT_KEY),
        readNumericPreference(BACKGROUND_SERVICE_FAILED_AT_KEY),
        backendApi.getPreference({ key: LAST_WAKE_RESULT_KEY })
      ])
    return {
      lastSyncAt,
      lastReceived,
      lastWakeAt,
      lastWakeResult: lastWakeResult || '',
      serviceFailedAt
    }
  } catch {
    return { lastSyncAt: 0, lastReceived: 0, lastWakeAt: 0, lastWakeResult: '', serviceFailedAt: 0 }
  }
}

export async function recordBackgroundWake(result, at = Date.now()) {
  try {
    await backendApi.updatePreference({ key: LAST_WAKE_AT_KEY, value: String(at) })
    await backendApi.updatePreference({ key: LAST_WAKE_RESULT_KEY, value: result })
  } catch (e) {
    log.error('recordBackgroundWake failed', e)
  }
}

export async function recordBackgroundServiceFailure(at = Date.now()) {
  try {
    await backendApi.updatePreference({
      key: BACKGROUND_SERVICE_FAILED_AT_KEY,
      value: String(at)
    })
  } catch (e) {
    log.error('recordBackgroundServiceFailure failed', e)
  }
}

export async function clearBackgroundServiceFailure() {
  try {
    await backendApi.updatePreference({ key: BACKGROUND_SERVICE_FAILED_AT_KEY, value: '0' })
  } catch (e) {
    log.error('clearBackgroundServiceFailure failed', e)
  }
}

const DEBUG_SECTION_ORDER = [
  ['app', 'App'],
  ['autobase', 'Autobase & indexer'],
  ['swarm', 'Swarm & transfers'],
  ['sync', 'Sync telemetry'],
  ['storage', 'Storage & hyperdrive'],
  ['runtime', 'Runtime']
]

const DEBUG_TIMESTAMP_KEYS = new Set([
  'lastBaseErrorAt',
  'lastSyncAt',
  'lastWakeAt',
  'backgroundServiceFailedAt',
  'activityOldestAt',
  'mediaLastRebuildAt',
  'mediaHealthCheckedAt',
  'lastViewBackfillAt',
  'lastFastForwardAt',
  'lastErrorAt'
])

function formatDebugTimestamp(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '-'
  return new Date(value).toISOString()
}

const HEX_PREVIEW_LENGTH = 8
const HEX_PATTERN = /^[0-9a-f]+$/i

// Keys and paths are the values a diagnostics report should not carry verbatim into a public
// bug tracker - the screen already truncates them, so the report does the same by default.
export function shortenHex(value) {
  if (typeof value !== 'string') return value
  if (value.length <= HEX_PREVIEW_LENGTH * 2) return value
  if (!HEX_PATTERN.test(value)) return value
  return `${value.slice(0, HEX_PREVIEW_LENGTH)}\u2026`
}

export function redactHomePath(value) {
  if (typeof value !== 'string' || !value) return value
  return value
    .replace(/^(\/Users|\/home)\/[^/]+/, '$1/\u2026')
    .replace(/^([A-Za-z]:\\Users)\\[^\\]+/, '$1\\\u2026')
}

// A file name is user content - the byte counts and the status are what diagnose a stalled
// transfer, so the name is replaced by its position and extension.
export function redactFileName(fileName, index) {
  const name = typeof fileName === 'string' ? fileName : ''
  const dot = name.lastIndexOf('.')
  const extension = dot > 0 && dot < name.length - 1 ? name.slice(dot).toLowerCase() : ''
  return `file ${index}${extension}`
}

const DEBUG_PATH_KEYS = new Set(['corePath', 'storagePath', 'path'])

function redactDebugValue(value, key) {
  if (typeof value === 'string') {
    return key && DEBUG_PATH_KEYS.has(key) ? redactHomePath(value) : shortenHex(value)
  }
  if (Array.isArray(value)) return value.map((item) => redactDebugValue(item))
  if (value && typeof value === 'object') {
    const out = {}
    for (const [nestedKey, nestedValue] of Object.entries(value)) {
      out[nestedKey] = redactDebugValue(nestedValue, nestedKey)
    }
    return out
  }
  return value
}

function formatDebugValue(value, key, redact = false) {
  if (key && DEBUG_TIMESTAMP_KEYS.has(key)) return formatDebugTimestamp(value)
  const shown = redact ? redactDebugValue(value, key) : value
  if (shown === null || shown === undefined) return '-'
  if (Array.isArray(shown)) return shown.length ? shown.join(', ') : '-'
  if (typeof shown === 'object') return JSON.stringify(shown)
  return String(shown)
}

const DEBUG_SECTION_SKIP = new Set(['downloads', 'uploads'])

function formatDebugSection(title, data, redact) {
  if (!data || typeof data !== 'object') return []
  const entries = Object.entries(data).filter(
    ([key, value]) => !DEBUG_SECTION_SKIP.has(key) && (!Array.isArray(value) || value.length)
  )
  if (!entries.length) return []
  const width = entries.reduce((max, [key]) => Math.max(max, key.length), 0)
  const lines = [`## ${title}`]
  for (const [key, value] of entries) {
    lines.push(`  ${key.padEnd(width, ' ')}  ${formatDebugValue(value, key, redact)}`)
  }
  lines.push('')
  return lines
}

export const SYNC_HEALTH = {
  HEALTHY: 'healthy',
  SYNCING: 'syncing',
  ATTENTION: 'attention',
  PROBLEM: 'problem'
}

const HEALTH_RANK = { healthy: 0, syncing: 1, attention: 2, problem: 3 }

export const SYNC_HEALTH_TEXT = {
  healthy: 'Healthy',
  syncing: 'Syncing',
  attention: 'Needs attention',
  problem: 'Problem',
  allGood: 'Every change is confirmed and this device is connected.',
  notOpen: 'The vault is not open on this device.',
  writerRemoved: 'This device was removed from the vault. Link it again to keep syncing.',
  quorumLost:
    'Too many sync leaders are offline ({{offline}} of {{leaders}}). Changes are saved but cannot be confirmed until one comes back.',
  writerClosed:
    'History from {{count}} device(s) is closed on this device, so changes that depend on it cannot be confirmed.',
  reopening: 'Recovering from an error. Retry {{attempts}}.',
  notWritable: 'This device cannot write yet. It is waiting to be accepted by a sync leader.',
  leaderOffline:
    'Sync leader offline: {{names}}. Changes still sync, but one more leader going offline stops confirmation.',
  noConnections: 'Not connected to any other device.',
  suspended: 'Sync is paused while the app is in the background.',
  pending: '{{count}} changes waiting to be confirmed by the sync leaders.',
  stalled: '{{count}} attachment downloads are stalled.'
}

// A snapshot of `getDebugInfo()` + app extras, read the way a person would read the
// diagnostics screen: what is wrong, how bad, and in order of severity.
export function assessSyncHealth(snapshot) {
  const checks = []
  const add = (level, id, params = {}) => checks.push({ level, id, params })
  const base = snapshot?.autobase || {}
  const swarm = snapshot?.swarm || {}
  const devices = Array.isArray(snapshot?.devices) ? snapshot.devices : []
  const writers = Array.isArray(snapshot?.writers) ? snapshot.writers : []

  if (!snapshot || base.opened === false) {
    add(SYNC_HEALTH.PROBLEM, 'notOpen')
    return { level: SYNC_HEALTH.PROBLEM, checks }
  }
  if (base.localWriterRemoved) add(SYNC_HEALTH.PROBLEM, 'writerRemoved')

  const leaders = devices.filter((device) => device.isIndexer)
  const offline = leaders.filter(
    (device) => !device.isLocal && device.presenceKnown !== false && device.isOnline === false
  )
  const majority = base.majority || (leaders.length >>> 1) + 1
  if (leaders.length && leaders.length - offline.length < majority) {
    add(SYNC_HEALTH.ATTENTION, 'quorumLost', { offline: offline.length, leaders: leaders.length })
  } else if (offline.length) {
    add(SYNC_HEALTH.ATTENTION, 'leaderOffline', {
      names: offline.map((device) => device.title || 'Untitled').join(', ')
    })
  }

  const closed = writers.filter((writer) => writer.coreOpen === false && !writer.isRemoved)
  if (closed.length) add(SYNC_HEALTH.PROBLEM, 'writerClosed', { count: closed.length })

  if (base.reopening)
    add(SYNC_HEALTH.ATTENTION, 'reopening', { attempts: base.reopenAttempts || 1 })
  if (base.writable === false) add(SYNC_HEALTH.ATTENTION, 'notWritable')
  if (swarm.suspended) add(SYNC_HEALTH.SYNCING, 'suspended')
  else if (swarm.connections === 0 && devices.length > 1)
    add(SYNC_HEALTH.ATTENTION, 'noConnections')

  const stalled = (swarm.downloads || []).filter((item) => item.stalled).length
  if (stalled) add(SYNC_HEALTH.ATTENTION, 'stalled', { count: stalled })

  const pending = Math.max(base.backlog || 0, base.localUnconfirmed || 0)
  if (pending > 0) add(SYNC_HEALTH.SYNCING, 'pending', { count: pending })

  checks.sort((a, b) => HEALTH_RANK[b.level] - HEALTH_RANK[a.level])
  const level = checks.length ? checks[0].level : SYNC_HEALTH.HEALTHY
  if (!checks.length) add(SYNC_HEALTH.HEALTHY, 'allGood')
  return { level, checks }
}

export function formatHealthCheck(check) {
  const template = SYNC_HEALTH_TEXT[check.id] || check.id
  return template.replace(/{{(\w+)}}/g, (_, name) => String(check.params?.[name] ?? ''))
}

export function formatDebugReport(snapshot, { redact = true } = {}) {
  if (!snapshot || typeof snapshot !== 'object') return 'No diagnostics captured.'
  const lines = [
    'Pear Notes diagnostics',
    `Captured ${new Date(snapshot.capturedAt || Date.now()).toISOString()}`
  ]
  if (redact) lines.push('Keys, paths and file names are shortened in this report.')
  lines.push('')

  if (snapshot.error) lines.push(`ERROR: ${snapshot.error}`, '')

  const health = assessSyncHealth(snapshot)
  lines.push(`## Status: ${SYNC_HEALTH_TEXT[health.level]}`)
  for (const check of health.checks) {
    lines.push(`  [${SYNC_HEALTH_TEXT[check.level]}] ${formatHealthCheck(check)}`)
  }
  lines.push('')

  for (const [key, title] of DEBUG_SECTION_ORDER) {
    lines.push(...formatDebugSection(title, snapshot[key], redact))
  }

  const devices = Array.isArray(snapshot.devices) ? snapshot.devices : []
  if (devices.length) {
    lines.push('## Devices')
    for (const device of devices) {
      const flags = [
        device.isLocal ? 'local' : null,
        device.isIndexer ? 'sync-leader' : null,
        device.isOnline ? 'online' : 'offline',
        device.presenceKnown ? null : 'presence-unknown'
      ]
        .filter(Boolean)
        .join(', ')
      const localKey = redact ? shortenHex(device.localKey) : device.localKey
      const swarmKey = redact ? shortenHex(device.swarmKey) : device.swarmKey
      lines.push(`  ${device.title || 'Untitled'} [${device.platform || 'unknown'}] (${flags})`)
      lines.push(`    localKey  ${localKey || '-'}`)
      lines.push(`    swarmKey  ${swarmKey || '-'}`)
    }
    lines.push('')
  }

  const writers = Array.isArray(snapshot.writers) ? snapshot.writers : []
  if (writers.length) {
    const titles = new Map(devices.map((device) => [device.localKey, device.title]))
    lines.push('## Writers')
    for (const writer of writers) {
      const key = redact ? shortenHex(writer.key) : writer.key
      const flags = [
        writer.isIndexer ? 'sync-leader' : null,
        writer.isRemoved ? 'removed' : null,
        writer.coreOpen === false ? 'core closed' : null
      ]
        .filter(Boolean)
        .join(', ')
      lines.push(
        `  ${titles.get(writer.key) || 'Unknown device'} ${key || '-'}${flags ? ` (${flags})` : ''}`
      )
      lines.push(
        `    linearized ${writer.linearized ?? '-'}  indexed ${writer.indexed ?? '-'}  core ${writer.contiguousLength ?? '-'}/${writer.coreLength ?? '-'}  peers ${writer.peers ?? '-'}  seen ${writer.seenLength ?? '-'}`
      )
    }
    lines.push('')
  }

  const downloads = snapshot.swarm?.downloads || []
  const uploads = snapshot.swarm?.uploads || []
  if (downloads.length || uploads.length) {
    lines.push('## Transfers')
    downloads.forEach((item, index) => {
      const name = redact ? redactFileName(item.fileName, index + 1) : item.fileName || '-'
      lines.push(
        `  down  ${name}  ${item.downloadedBytes}/${item.totalBytes}  ${item.status}${item.stalled ? ' STALLED' : ''}`
      )
    })
    uploads.forEach((item, index) => {
      const name = redact ? redactFileName(item.fileName, index + 1) : item.fileName || '-'
      lines.push(`  up    ${name}  ${item.uploadedBytes}/${item.totalBytes}  ${item.status}`)
    })
    lines.push('')
  }

  return lines.join('\n')
}

export function formatErrorLog(errorLog) {
  const entries = Array.isArray(errorLog?.entries) ? errorLog.entries : []
  const lines = [
    `## Logs (${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}, newest first)`
  ]
  if (errorLog?.error) lines.push(`  could not read the logs: ${errorLog.error}`)
  if (!entries.length) lines.push('  Nothing recorded.')
  for (const entry of entries) {
    const repeated =
      entry.count > 1 ? `  x${entry.count}, last ${formatDebugTimestamp(entry.lastAt)}` : ''
    const level = String(entry.level || 'error').toUpperCase()
    const source = entry.source || 'backend'
    lines.push(
      `${formatDebugTimestamp(entry.at)}  ${level}  ${source}${repeated}  ${entry.message || ''}`
    )
    if (entry.detail) {
      for (const line of String(entry.detail).split('\n')) lines.push(`    ${line}`)
    }
  }
  lines.push('')
  return lines.join('\n')
}
