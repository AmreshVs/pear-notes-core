import fs from 'bare-fs'
import path from 'bare-path'
import { setSink } from '../log.js'
import { formatLogArgs } from './logFormat.js'

const FILE_NAME = 'error-log.json'
const SETTINGS_FILE_NAME = 'error-log-settings.json'
const MAX_ENTRIES = 2000
const COALESCE_MS = 5 * 60 * 1000
const PERSIST_DELAY_MS = 2000
const LOW_PRIORITY = new Set(['debug', 'info'])

export class ErrorLog {
  constructor({ max = MAX_ENTRIES } = {}) {
    this.max = max
    this.list = []
    this.filePath = null
    this.settingsPath = null
    this.enabled = false
    this._timer = null
  }

  open(dir) {
    this.filePath = path.join(dir, FILE_NAME)
    this.settingsPath = path.join(dir, SETTINGS_FILE_NAME)
    const settings = this._readSettings()
    this.enabled = settings.enabled === true
    if (!this.enabled) this.list = []
    // One-time: logs recorded before the switch existed must not outlive it on a device left off.
    const clearLegacy = settings.legacyCleared !== true
    let stored = []
    try {
      if (clearLegacy && !this.enabled) {
        fs.rmSync(this.filePath, { force: true })
      } else if (fs.existsSync(this.filePath)) {
        const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'))
        if (Array.isArray(parsed)) stored = parsed
      }
      if (clearLegacy) this._writeSettings()
    } catch {
      stored = []
    }
    this.list = [...stored, ...this.list].slice(-this.max)
    this._schedulePersist()
  }

  record(level, args, source = 'backend') {
    const { message, detail } = formatLogArgs(args)
    this.add({ at: Date.now(), level, source, message, detail })
  }

  add({ at, level, source, message, detail }) {
    if (!this.enabled && this.filePath !== null) return
    const last = this.list[this.list.length - 1]
    if (
      last &&
      last.level === level &&
      last.source === source &&
      last.message === message &&
      at - last.lastAt < COALESCE_MS
    ) {
      last.count++
      last.lastAt = at
      if (detail) last.detail = detail
    } else {
      this.list.push({ at, lastAt: at, count: 1, level, source, message, detail })
      if (this.list.length > this.max) this._evict()
    }
    this._schedulePersist()
  }

  _evict() {
    const index = this.list.findIndex((entry) => LOW_PRIORITY.has(entry.level))
    this.list.splice(index === -1 ? 0 : index, 1)
  }

  note(message, detail = '') {
    this.record('info', detail ? [message, detail] : [message])
  }

  setEnabled(enabled) {
    this.enabled = !!enabled
    this._writeSettings()
    if (this.enabled) this.note('[log] recording turned on')
    return this.enabled
  }

  _readSettings() {
    try {
      if (!fs.existsSync(this.settingsPath)) return {}
      return JSON.parse(fs.readFileSync(this.settingsPath, 'utf-8')) || {}
    } catch {
      return {}
    }
  }

  _writeSettings() {
    if (!this.settingsPath) return
    try {
      fs.mkdirSync(path.dirname(this.settingsPath), { recursive: true })
      fs.writeFileSync(
        this.settingsPath,
        JSON.stringify({ enabled: this.enabled, legacyCleared: true })
      )
    } catch {
      // The error log must never become a source of errors itself.
    }
  }

  entries() {
    return this.list.slice().reverse()
  }

  clear() {
    this.list = []
    this.flushSync()
  }

  flushSync() {
    if (this._timer) {
      clearTimeout(this._timer)
      this._timer = null
    }
    if (!this.filePath) return
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
      const tmp = this.filePath + '.tmp'
      fs.writeFileSync(tmp, JSON.stringify(this.list))
      fs.renameSync(tmp, this.filePath)
    } catch {
      // The error log must never become a source of errors itself.
    }
  }

  _schedulePersist() {
    if (!this.filePath || this._timer) return
    this._timer = setTimeout(() => {
      this._timer = null
      this.flushSync()
    }, PERSIST_DELAY_MS)
    if (this._timer.unref) this._timer.unref()
  }
}

export const errorLog = new ErrorLog()

export function captureLogs() {
  setSink((level, args) => errorLog.record(level, args))
}

// Hypercore reports a signature conflict only through console.log, and a
// conflict freezes the core on every peer - the writer can never be served again.
const DEPENDENCY_LOG = /^\[(hypercore|autobase|corestore)\]/

export function captureDependencyConsole(target = console) {
  const original = target.log
  target.log = (...args) => {
    if (typeof args[0] === 'string' && DEPENDENCY_LOG.test(args[0])) errorLog.record('error', args)
    return original.apply(target, args)
  }
}

function rethrowLater(err) {
  setTimeout(() => {
    throw err
  }, 0)
}

// Records a fatal error, then re-raises it with our listeners removed so the
// runtime's default crash behaviour is unchanged.
export function captureFatalErrors(runtime, rethrow = rethrowLater) {
  if (!runtime || typeof runtime.on !== 'function') return
  const onFatal = (kind) => (err) => {
    errorLog.record('fatal', [`[${kind}]`, err])
    errorLog.flushSync()
    runtime.off('uncaughtException', onException)
    runtime.off('unhandledRejection', onRejection)
    rethrow(err)
  }
  const onException = onFatal('uncaughtException')
  const onRejection = onFatal('unhandledRejection')
  runtime.on('uncaughtException', onException)
  runtime.on('unhandledRejection', onRejection)
}
