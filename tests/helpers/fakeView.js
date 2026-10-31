const COLLECTIONS = {
  '@notes/notes': { prefix: 'note:', key: ['key'] },
  '@notes/invites': { prefix: 'note:', key: ['slot'] },
  '@notes/folders': { prefix: 'folder:', key: ['key'] },
  '@notes/settings': { prefix: '', key: ['id'] },
  '@notes/syncedDevices': { prefix: 'syncedDevice:', key: ['key'] },
  '@notes/mediaTombstones': { prefix: 'mediaTombstone:', key: ['refKey'] },
  '@notes/encryptedMediaCores': { prefix: 'encMediaCore:', key: ['coreKey'] },
  '@notes/activity': { prefix: 'activity:', key: ['id'] },
  '@notes/activitySnapshots': { prefix: 'activitySnap:', key: ['id'] },
  '@notes/activityDiscarded': { prefix: 'activityDiscarded:', key: ['id'] },
  '@notes/activitySessions': { prefix: 'activityOpen:', key: ['noteKey', 'writer'] },
  '@notes/activityTitleSessions': { prefix: 'activityTitle:', key: ['noteKey', 'writer'] },
  '@notes/activityState': { prefix: 'activityState:', key: ['id'] }
}

function locate(collection, record) {
  const spec = COLLECTIONS[collection]
  if (!spec) throw new Error('fakeView: unknown collection ' + collection)
  return spec.prefix + spec.key.map((field) => record[field]).join(':')
}

function prefixOf(collection) {
  const spec = COLLECTIONS[collection]
  if (!spec) throw new Error('fakeView: unknown collection ' + collection)
  return spec.prefix
}

export function makeFakeView(store, { failOn = null, failWith = null } = {}) {
  const reader = (source) => ({
    async get(collection, query) {
      const key = locate(collection, query)
      if (failOn === key) throw failWith
      return key in source ? source[key] : null
    },
    find(collection) {
      const prefix = prefixOf(collection)
      const rows = Object.keys(source)
        .filter((key) => key.startsWith(prefix))
        .sort()
        .map((key) => source[key])
      return (async function* () {
        yield* rows
      })()
    }
  })

  return {
    ...reader(store),
    transaction() {
      const pending = { ...store }
      const deleted = new Set()
      return {
        ...reader(pending),
        async insert(collection, record) {
          const key = locate(collection, record)
          deleted.delete(key)
          pending[key] = record
        },
        async delete(collection, record) {
          const key = locate(collection, record)
          deleted.add(key)
          delete pending[key]
        },
        async flush() {
          for (const key of deleted) delete store[key]
          for (const key of Object.keys(pending)) store[key] = pending[key]
        },
        async close() {}
      }
    }
  }
}
