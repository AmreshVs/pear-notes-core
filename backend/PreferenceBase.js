import Hyperbee from 'hyperbee'
import Corestore from 'corestore'
import ReadyResource from 'ready-resource'
import fs from 'bare-fs'
import path from 'bare-path'

import { PREFERENCE_DIR, PREFERENCE_LEGACY_DIR } from '../constant.js'
import * as log from '../log.js'

export default class PreferenceBase extends ReadyResource {
  constructor(path) {
    super()
    this.path = path
    this.store = null
    this.bee = null
    this._rewriting = null
  }

  async _open() {
    const prefPath = path.join(this.path, PREFERENCE_DIR)
    migrateLegacyPreferences(this.path, prefPath)

    this.store = new Corestore(prefPath)
    const core = this.store.get({ name: 'preferences' })

    this.bee = new Hyperbee(core, {
      extension: false,
      keyEncoding: 'utf-8',
      valueEncoding: 'json'
    })

    try {
      await this.bee.ready()
    } catch (e) {
      this.bee = null
      log.error(
        `[PreferenceBase] could not open "${prefPath}" — device preferences will not persist`,
        e
      )
      throw e
    }
  }

  async _close() {
    if (this.store) await this.store.close()
  }

  async destroy() {
    await this.close()
  }

  async put(key, value) {
    if (!this.bee) return
    await this._rewriting
    await this.bee.put(key, value)
  }

  async get(key) {
    if (!this.bee) return null
    await this._rewriting
    const node = await this.bee.get(key)
    return node ? node.value : null
  }

  async delete(key) {
    if (!this.bee) return
    await this._rewriting
    await this.bee.del(key)
  }

  // Truncating and compacting is what removes dropped values from disk; a del alone keeps them in the log.
  async rewrite(keep) {
    if (!this.bee) return
    await this._rewriting
    const run = this._rewrite(keep)
    const guard = run.catch(() => {})
    this._rewriting = guard
    try {
      await run
    } finally {
      if (this._rewriting === guard) this._rewriting = null
    }
  }

  async _rewrite(keep) {
    const live = []
    for await (const { key, value } of this.bee.createReadStream()) {
      if (keep(key)) live.push([key, value])
    }
    await this.bee.core.truncate(0)
    for (const [key, value] of live) await this.bee.put(key, value)
    const storage = this.bee.core.state?.storage
    if (storage?.store?.compact) await storage.store.compact()
  }

  watch(key, cb) {
    if (!this.bee) return null
    const watcher = this.bee.watch({ gte: key, lte: key })
    watcher.on('data', () => {
      this.get(key).then(cb)
    })
    return watcher
  }
}

export function migrateLegacyPreferences(root, prefPath) {
  const legacyPath = path.join(root, PREFERENCE_LEGACY_DIR)
  if (prefPath === legacyPath) return
  if (fs.existsSync(prefPath)) return

  let legacy
  try {
    legacy = fs.statSync(legacyPath)
  } catch {
    return
  }
  if (!legacy.isDirectory()) return

  try {
    fs.renameSync(legacyPath, prefPath)
  } catch (e) {
    log.error('[PreferenceBase] could not migrate legacy preference store', e)
  }
}
