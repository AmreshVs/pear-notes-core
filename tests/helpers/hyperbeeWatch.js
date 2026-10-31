import { ChangeWatcher, KeyWatcher } from '../../backend/viewWatch.js'

function onCoreAppend(db) {
  return (fn) => {
    db.core.on('append', fn)
    return () => db.core.off('append', fn)
  }
}

export async function watchHyperbeeKey(db, key) {
  const watcher = new KeyWatcher({
    core: db.core,
    read: () => db.get(key),
    same: (a, b) => (a?.seq ?? null) === (b?.seq ?? null),
    valueOf: (node) => node.value,
    subscribe: onCoreAppend(db)
  })
  await watcher.ready()
  return watcher
}

export async function watchHyperbeeChanges(db) {
  const watcher = new ChangeWatcher({ core: db.core, subscribe: onCoreAppend(db) })
  await watcher.ready()
  return watcher
}
