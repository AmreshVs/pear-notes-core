import { HYPERDRIVE_URL_PREFIX, normalizeAttachmentUrls } from '../constant.js'

export const ENVELOPE_VERSION = 1

export function parseEnvelope(sealed) {
  if (typeof sealed !== 'string' || !sealed) return null
  try {
    const envelope = JSON.parse(sealed)
    if (
      envelope?.v !== ENVELOPE_VERSION ||
      typeof envelope.r !== 'string' ||
      typeof envelope.k !== 'string' ||
      typeof envelope.b !== 'string'
    ) {
      return null
    }
    return envelope
  } catch {
    return null
  }
}

export function envelopeLinks(sealed) {
  const links = parseEnvelope(sealed)?.links
  return Array.isArray(links) ? links.filter((link) => typeof link === 'string' && link) : []
}

const isMediaUrl = (url) => typeof url === 'string' && url.startsWith(HYPERDRIVE_URL_PREFIX + '/')

const FILE_ID_RE = /^[0-9a-f]{32}$/

export function envelopeFiles(sealed) {
  const files = parseEnvelope(sealed)?.f
  if (!files || typeof files !== 'object' || Array.isArray(files)) return {}
  const out = {}
  for (const [link, entry] of Object.entries(files)) {
    if (isMediaUrl(link) && FILE_ID_RE.test(entry?.id) && typeof entry.k === 'string') {
      out[link] = { id: entry.id, k: entry.k }
    }
  }
  return out
}

export function envelopeRelink(sealed) {
  const relink = parseEnvelope(sealed)?.relink
  if (!relink || typeof relink !== 'object' || Array.isArray(relink)) return {}
  const out = {}
  for (const [from, to] of Object.entries(relink)) {
    if (from !== to && isMediaUrl(from) && isMediaUrl(to)) out[from] = to
  }
  return out
}

export function relinkHtml(html, relink) {
  const pairs = Object.entries(relink || {})
  if (!html || !pairs.length) return html
  let out = normalizeAttachmentUrls(html)
  for (const [from, to] of pairs) {
    out = out
      .replaceAll(from, to)
      .replaceAll(from.replaceAll('&', '&amp;'), to.replaceAll('&', '&amp;'))
  }
  return out
}

export function withRelink(sealed, relink) {
  const envelope = parseEnvelope(sealed)
  if (!envelope || !Object.keys(relink).length) return sealed
  return JSON.stringify({ ...envelope, relink: { ...envelopeRelink(sealed), ...relink } })
}

// Older links keep pointing at the newest copy, so any stale editor's save still lands on it.
export function chainRelink(relink, replacements) {
  const out = {}
  for (const [from, to] of Object.entries(relink)) out[from] = replacements[to] || to
  for (const [from, to] of Object.entries(replacements)) if (from !== to) out[from] = to
  return out
}

export function relinkEnvelope(sealed, replacements) {
  const envelope = parseEnvelope(sealed)
  if (!envelope) return null
  const links = envelopeLinks(sealed)
  const moved = links.filter((url) => replacements[url] && replacements[url] !== url)
  if (!moved.length) return null
  const relink = chainRelink(
    envelopeRelink(sealed),
    Object.fromEntries(moved.map((url) => [url, replacements[url]]))
  )
  const next = {
    ...envelope,
    links: [...new Set(links.map((url) => replacements[url] || url))],
    relink
  }
  const files = Object.entries(envelopeFiles(sealed))
  if (files.length) {
    next.f = Object.fromEntries(files.map(([url, entry]) => [replacements[url] || url, entry]))
  } else {
    delete next.f
  }
  return JSON.stringify(next)
}
