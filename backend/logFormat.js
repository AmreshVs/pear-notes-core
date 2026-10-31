const MAX_MESSAGE = 300
const MAX_DETAIL = 1500
const STACK_LINES = 6

const HEX_KEY_RE = /\b[0-9a-f]{64}\b/gi
const Z32_KEY_RE = /\b[ybndrfg8ejkmcpqxot1uwisza345h769]{52}\b/g
const HOME_RE = /(\/Users\/|\/home\/|[A-Za-z]:\\Users\\)[^/\\\s'"]+/g

function shortenKey(key) {
  return key.slice(0, 8) + '…'
}

export function scrub(text) {
  return String(text)
    .replace(HEX_KEY_RE, shortenKey)
    .replace(Z32_KEY_RE, shortenKey)
    .replace(HOME_RE, '$1~')
}

function clip(text, max) {
  return text.length > max ? text.slice(0, max) + '…' : text
}

function describeError(err) {
  const head = `${err.name || 'Error'}: ${err.message || ''}${err.code ? ` [${err.code}]` : ''}`
  const stack = typeof err.stack === 'string' ? err.stack.split('\n').slice(1, STACK_LINES + 1) : []
  return [head, ...stack.map((line) => line.trim())].join('\n')
}

function describeValue(value) {
  if (value instanceof Error) return describeError(value)
  if (typeof value === 'string') return value
  if (value === undefined) return 'undefined'
  try {
    const seen = new WeakSet()
    return JSON.stringify(value, (key, v) => {
      if (v instanceof Error) return describeError(v)
      if (v && typeof v === 'object') {
        if (seen.has(v)) return '[circular]'
        seen.add(v)
        if (v.type === 'Buffer' && Array.isArray(v.data)) return `<${v.data.length} bytes>`
        if (ArrayBuffer.isView(v)) return `<${v.byteLength} bytes>`
      }
      if (typeof v === 'string' && v.length > MAX_MESSAGE) return clip(v, MAX_MESSAGE)
      return v
    })
  } catch {
    return String(value)
  }
}

const PLACEHOLDER_RE = /%[sdifoOj]/g

function applyPlaceholders(args) {
  if (typeof args[0] !== 'string' || args.length < 2) return args
  const rest = args.slice(1)
  const message = args[0].replace(PLACEHOLDER_RE, (token) =>
    rest.length ? describeValue(rest.shift()) : token
  )
  return [message, ...rest]
}

export function formatLogArgs(args) {
  const parts = applyPlaceholders(args).map(describeValue)
  return {
    message: clip(scrub(parts[0] || ''), MAX_MESSAGE),
    detail: clip(scrub(parts.slice(1).join('\n')), MAX_DETAIL)
  }
}
