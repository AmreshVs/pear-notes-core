import * as log from './log.js'

const REPORT_DELAY_MS = 1500

class BootTimeline {
  constructor(scope) {
    this.scope = scope
    this.origin = Date.now()
    this.marks = []
    this.reportTimer = null
    this.reported = false
    this.continued = false
    this.lastReportedAt = 0
  }

  start(at = Date.now()) {
    this.origin = at
    this.marks = []
    this.reported = false
    this.continued = false
    this.lastReportedAt = 0
    clearTimeout(this.reportTimer)
    this.reportTimer = null
  }

  mark(label) {
    this._rearm()
    this.marks.push({ id: null, count: 1, label, at: Date.now() - this.origin })
    this._schedule()
  }

  markRolling(id, label) {
    this._rearm()
    const at = Date.now() - this.origin
    const existing = this.marks.find((mark) => mark.id === id)
    if (existing) {
      existing.count += 1
      existing.at = at
      existing.label = `${label} (${existing.count})`
      this._schedule()
      return
    }
    this.marks.push({ id, count: 1, label: `${label} (1)`, at })
    this._schedule()
  }

  report() {
    this.reportTimer = null
    if (this.reported || this.marks.length === 0) return
    this.reported = true
    const ordered = this.marks.slice().sort((a, b) => a.at - b.at)
    const width = ordered.reduce((max, mark) => Math.max(max, mark.label.length), 0)
    const suffix = this.continued ? ' (continued)' : ''
    const lines = [`[boot] ${this.scope} timeline${suffix}`]
    let previousAt = this.lastReportedAt
    for (const mark of ordered) {
      const label = mark.label.padEnd(width, ' ')
      const total = String(mark.at).padStart(6, ' ')
      const step = String(mark.at - previousAt).padStart(6, ' ')
      lines.push(`[boot]   ${label}  ${total}ms  (+${step}ms)`)
      previousAt = mark.at
    }
    this.lastReportedAt = previousAt
    log.debug(lines.join('\n'))
  }

  _rearm() {
    if (!this.reported) return
    this.reported = false
    this.continued = true
    this.marks = []
  }

  _schedule() {
    clearTimeout(this.reportTimer)
    this.reportTimer = setTimeout(() => this.report(), REPORT_DELAY_MS)
  }
}

export const backendBoot = new BootTimeline('backend')
export const appBoot = new BootTimeline('app')
