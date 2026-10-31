// HyperDB's db.watch has no key or range filter; these watchers restore Hyperbee's per-key semantics.
import ReadyResource from 'ready-resource'
import * as log from '../log.js'

export const MAX_CHANGE_BLOCKS = 512
export const ALL_CHANGED = Object.freeze({ all: true, entries: [] })

function coalesce(fn) {
  let running = null
  let again = false
  const run = async () => {
    do {
      again = false
      await fn()
    } while (again)
  }
  const trigger = () => {
    if (running) {
      again = true
      return running
    }
    running = run().finally(() => {
      running = null
    })
    return running
  }
  trigger.settled = () => running || Promise.resolve()
  return trigger
}

function isShutdownError(err) {
  const code = err?.code
  return (
    code === 'SESSION_CLOSED' ||
    code === 'SNAPSHOT_NOT_AVAILABLE' ||
    /closed/i.test(err?.message || '')
  )
}

export class KeyWatcher extends ReadyResource {
  constructor(adapter) {
    super()
    this.adapter = adapter
    this.node = null
    this._last = null
    this._force = false
    this._unsubscribe = null
    this._readOnce = false
    this._process = coalesce(() => this._update(!this._readOnce))

    this._onchange = () => {
      if (!this.closing) this._process()
    }
    this._ontruncate = () => {
      this._force = true
      this._onchange()
    }
    this._oncoreclose = () => {
      this.close().catch(() => {})
    }
  }

  async _open() {
    // Subscribe before the first read so no change lands unseen.
    const { core } = this.adapter
    this._unsubscribe = this.adapter.subscribe(this._onchange)
    if (core) {
      core.on('truncate', this._ontruncate)
      core.on('close', this._oncoreclose)
    }
    try {
      await this._process()
    } catch (err) {
      // Nobody closes a watcher whose ready() rejected, so detach here.
      this._detach()
      throw err
    }
  }

  async _close() {
    this._detach()
    await this._process.settled().catch(() => {})
  }

  _detach() {
    if (this._unsubscribe) this._unsubscribe()
    this._unsubscribe = null
    const { core } = this.adapter
    if (core) {
      core.off('truncate', this._ontruncate)
      core.off('close', this._oncoreclose)
    }
  }

  async _update(initial) {
    const force = this._force
    this._force = false

    let next
    try {
      next = await this.adapter.read()
    } catch (err) {
      if (this.closing) return
      if (isShutdownError(err)) {
        this.close().catch(() => {})
        return
      }
      if (initial) throw err
      this.emit('error', err)
      return
    }
    if (this.closing) return

    this._readOnce = true
    const changed = force || !this.adapter.same(this._last, next)
    this._last = next
    const value = next == null ? null : this.adapter.valueOf(next)
    this.node = value == null ? null : { value }
    if (changed && !initial) this.emit('update')
  }
}

export class ChangeWatcher extends ReadyResource {
  constructor(adapter) {
    super()
    this.adapter = adapter
    this._unsubscribe = null
    this._emit = coalesce(async () => {
      if (!this.closing) this.emit('update')
    })
    this._onchange = () => {
      if (!this.closing) this._emit()
    }
    this._oncoreclose = () => {
      this.close().catch(() => {})
    }
  }

  async _open() {
    const { core } = this.adapter
    this._unsubscribe = this.adapter.subscribe(this._onchange)
    if (core) {
      core.on('truncate', this._onchange)
      core.on('close', this._oncoreclose)
    }
  }

  async _close() {
    if (this._unsubscribe) this._unsubscribe()
    this._unsubscribe = null
    const { core } = this.adapter
    if (core) {
      core.off('truncate', this._onchange)
      core.off('close', this._oncoreclose)
    }
    await this._emit.settled().catch(() => {})
  }
}

// null and undefined are equal: HyperDB returns an absent field as either.
export function sameRecord(a, b) {
  if (a === b) return true
  if (a == null || b == null) return a == null && b == null
  if (typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) {
    if (!sameRecord(a[key], b[key])) return false
  }
  return true
}

class ChangeFeed {
  constructor(db) {
    this.db = db
    this.indexes = new Set()
    this.listeners = new Set()
    this.length = 0
    this.fork = 0
    this.target = 0
    this.targetFork = 0
    this._process = coalesce(() => this._update())
    this._onwatch = () => {
      // Read here: the db snapshot was just taken at exactly this length, later reads may pass it.
      this.target = this.db.core.length
      this.targetFork = this.db.core.fork
      this._process().catch(() => {})
    }
  }

  get size() {
    return this.indexes.size + this.listeners.size
  }

  add(set, fn) {
    if (this.size === 0) {
      const { core } = this.db
      this.length = this.target = core.length
      this.fork = this.targetFork = core.fork
      this.db.watch(this._onwatch)
    }
    set.add(fn)
    return () => {
      if (!set.delete(fn)) return
      if (this.size === 0) this.db.unwatch(this._onwatch)
    }
  }

  async _update() {
    const from = this.length
    const to = this.target
    const fork = this.targetFork
    if (fork === this.fork && to === from) return
    const change = await this._read(from, to, fork)
    this.length = to
    this.fork = fork
    if (this.size === 0) return
    for (const fn of this.indexes) callSafely(fn, change)
    for (const fn of this.listeners) callSafely(fn, change)
  }

  async _read(from, to, fork) {
    if (fork !== this.fork || to < from || to - from > MAX_CHANGE_BLOCKS) return ALL_CHANGED
    try {
      // Never wait on a block this device does not hold: a sparse view would hang the read.
      if (!(await this.db.core.has(from, to))) return ALL_CHANGED
      const entries = []
      for await (const entry of this.db.changes({ gte: from, lt: to })) {
        if (entry) entries.push(entry)
      }
      return { all: false, entries }
    } catch {
      return ALL_CHANGED
    }
  }
}

function callSafely(fn, change) {
  try {
    fn(change)
  } catch (err) {
    log.error('[view] change subscriber failed', err)
  }
}

const feeds = new WeakMap()

function feedFor(db) {
  let feed = feeds.get(db)
  if (!feed) {
    feed = new ChangeFeed(db)
    feeds.set(db, feed)
  }
  return feed
}

// Indexes see each change before any watcher does, so a watcher reading an index reads it current.
export function onViewChanges(db, fn) {
  const feed = feedFor(db)
  return feed.add(feed.indexes, fn)
}

export function changeTouches(change, collection, query) {
  if (change.all) return true
  const fields = Object.entries(query)
  return change.entries.some(
    (entry) =>
      entry.collection === collection &&
      fields.every(([field, value]) => entry.value?.[field] === value)
  )
}

export function changeTouchesAny(change, collections) {
  if (change.all) return true
  return change.entries.some((entry) => collections.includes(entry.collection))
}

function subscribeChanges(db, matches) {
  return (fn) => {
    const feed = feedFor(db)
    return feed.add(feed.listeners, (change) => {
      if (matches(change)) fn()
    })
  }
}

export async function watchHyperdbKey(db, collection, query, valueOf = (record) => record) {
  const watcher = new KeyWatcher({
    core: db.core,
    read: () => db.get(collection, query),
    same: sameRecord,
    valueOf,
    subscribe: subscribeChanges(db, (change) => changeTouches(change, collection, query))
  })
  await watcher.ready()
  return watcher
}

export async function watchHyperdbChanges(db, collections = null) {
  const watcher = new ChangeWatcher({
    core: db.core,
    subscribe: subscribeChanges(db, (change) =>
      collections ? changeTouchesAny(change, collections) : true
    )
  })
  await watcher.ready()
  return watcher
}
