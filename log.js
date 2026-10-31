/**
 * Level-gated logging for Pear Notes core.
 *
 * Production builds must not print key material, invite codes, note contents or
 * user file paths. Two mechanisms cover that:
 *
 *   1. Level gating (this module) - `info`/`debug` are silent unless the host
 *      frontend opts in, so anything diagnostic is dev-only by construction.
 *   2. Build-time stripping (babel-plugin-transform-remove-console on mobile,
 *      esbuild `drop` on desktop, terser `drop_console` on the bundled core).
 *
 * The second is a safety net, not a licence to log secrets at `error` level -
 * `error` survives every strip. Anything sensitive goes through `debug`, or
 * through `progress()` / `redact()` below.
 *
 * Bare-safe: no node builtins, no dependencies.
 */

const LEVELS = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 }

let override = null

/**
 * Frontends flip this on at entry: `import.meta.env.DEV` (desktop),
 * `__DEV__` (mobile), or the boot payload inside the worklet.
 */
function devEnabled() {
  return globalThis.__PEAR_DEV__ === true
}

function threshold() {
  if (override !== null) return override
  return devEnabled() ? LEVELS.debug : LEVELS.error
}

/**
 * Force a level regardless of the dev flag. Pass null to go back to automatic.
 * @param {'silent'|'error'|'warn'|'info'|'debug'|null} level
 */
export function setLevel(level) {
  if (level === null) {
    override = null
    return
  }
  if (level in LEVELS === false) throw new Error(`Unknown log level '${level}'`)
  override = LEVELS[level]
}

export function getLevel() {
  for (const name of Object.keys(LEVELS)) {
    if (LEVELS[name] === threshold()) return name
  }
  return 'error'
}

let sink = null

/**
 * Receives every log call regardless of the print threshold, so a production
 * build can keep them (see backend/errorLog.js). Pass null to detach.
 * @param {((level: 'error'|'warn'|'info'|'debug', args: unknown[]) => void) | null} fn
 */
export function setSink(fn) {
  sink = typeof fn === 'function' ? fn : null
}

function toSink(level, args) {
  if (sink === null) return
  try {
    sink(level, args)
  } catch {
    // A failing sink must never break the caller's own log call.
  }
}

export function error(...args) {
  toSink('error', args)
  if (threshold() >= LEVELS.error) console.error(...args)
}

export function warn(...args) {
  toSink('warn', args)
  if (threshold() >= LEVELS.warn) console.warn(...args)
}

export function info(...args) {
  toSink('info', args)
  if (threshold() >= LEVELS.info) console.log(...args)
}

export function debug(...args) {
  toSink('debug', args)
  if (threshold() >= LEVELS.debug) console.log(...args)
}

/**
 * Reduce a pairing/progress payload to the fields that are safe to print.
 *
 * The full payload carries `encryptionKey` (the vault key), `localKey`,
 * `userData` (a peer public key) and `deviceName`. Both frontends genuinely
 * consume `encryptionKey`, so it cannot be dropped from the wire - it just must
 * never reach a log. Always log `progress(data)`, never `data`.
 */
export function progress(data) {
  if (!data || typeof data !== 'object') return data
  const safe = { step: data.step }
  if ('progress' in data) safe.progress = data.progress
  if ('reason' in data) safe.reason = data.reason
  return safe
}

/**
 * Placeholder for a value that must never be printed. In dev it yields a short
 * prefix so peers stay distinguishable across a trace; in production it yields
 * nothing identifying.
 */
export function redact(value) {
  if (value === null || value === undefined) return '<none>'
  if (!devEnabled()) return '<redacted>'
  const hex = typeof value === 'string' ? value : safeHex(value)
  if (!hex) return '<redacted>'
  return `${hex.slice(0, 8)}…`
}

function safeHex(value) {
  try {
    if (typeof value.toString === 'function') return value.toString('hex')
  } catch {
    // fall through
  }
  return null
}
