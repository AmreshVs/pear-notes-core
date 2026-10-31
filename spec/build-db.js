// The view schema (npm run schema:db), not the wire schema. Undeclared fields are dropped silently.
import Hyperschema from 'hyperschema'
import HyperDB from 'hyperdb/builder'

const SCHEMA_DIR = './spec/db-schema'
const DB_DIR = './spec/db'
const NS = 'notes'

const schema = Hyperschema.from(SCHEMA_DIR)
const ns = schema.namespace(NS)

// version and versionBy exist only here; dropping them breaks last-write-wins.
ns.register({
  name: 'note',
  compact: false,
  fields: [
    { name: 'key', type: 'string', required: true },
    { name: 'title', type: 'string' },
    { name: 'note', type: 'string' },
    { name: 'folderKey', type: 'string' },
    { name: 'addedAt', type: 'uint' },
    { name: 'updatedAt', type: 'uint' },
    { name: 'deletedAt', type: 'uint' },
    { name: 'previousFolderKey', type: 'string' },
    { name: 'locked', type: 'bool' },
    { name: 'pinned', type: 'bool' },
    { name: 'version', type: 'uint' },
    { name: 'versionBy', type: 'string' },
    { name: 'sealed', type: 'string' }
  ]
})

ns.register({
  name: 'folder',
  compact: false,
  fields: [
    { name: 'key', type: 'string', required: true },
    { name: 'title', type: 'string' },
    { name: 'icon', type: 'string' },
    { name: 'addedAt', type: 'uint' },
    { name: 'updatedAt', type: 'uint' }
  ]
})

// Keyed by slot: the invite's own id is the blind-pairing id.
ns.register({
  name: 'invite',
  compact: false,
  fields: [
    { name: 'slot', type: 'string', required: true },
    { name: 'id', type: 'string' },
    { name: 'invite', type: 'string' },
    { name: 'publicKey', type: 'string' },
    { name: 'expires', type: 'uint' },
    { name: 'version', type: 'uint' },
    { name: 'versionBy', type: 'string' }
  ]
})

ns.register({
  name: 'settings',
  compact: false,
  fields: [
    { name: 'id', type: 'string', required: true },
    { name: 'json', type: 'string' }
  ]
})

// Presence fields are computed on read and must never be stored.
ns.register({
  name: 'syncedDevice',
  compact: false,
  fields: [
    { name: 'key', type: 'string', required: true },
    { name: 'title', type: 'string' },
    { name: 'deviceType', type: 'string' },
    { name: 'platform', type: 'string' },
    { name: 'localKey', type: 'string' },
    { name: 'swarmKey', type: 'string' },
    { name: 'addedAt', type: 'uint' },
    { name: 'updatedAt', type: 'uint' },
    { name: 'caps', type: 'string' },
    { name: 'compatLevel', type: 'uint' },
    { name: 'appVersion', type: 'string' },
    { name: 'lastSeenAt', type: 'uint' }
  ]
})

ns.register({
  name: 'mediaTombstone',
  compact: false,
  fields: [
    { name: 'refKey', type: 'string', required: true },
    { name: 'url', type: 'string' },
    { name: 'deletedAt', type: 'uint' }
  ]
})

ns.register({
  name: 'encryptedMediaCore',
  compact: false,
  fields: [
    { name: 'coreKey', type: 'string', required: true },
    { name: 'at', type: 'uint' }
  ]
})

// meta is a JSON string here but an object in NoteBase; viewStore converts it.
ns.register({
  name: 'activityEntry',
  compact: false,
  fields: [
    { name: 'id', type: 'string', required: true },
    { name: 'event', type: 'string' },
    { name: 'device', type: 'string' },
    { name: 'at', type: 'uint' },
    { name: 'lastAt', type: 'uint' },
    { name: 'ops', type: 'uint' },
    { name: 'targetKind', type: 'string' },
    { name: 'targetKey', type: 'string' },
    { name: 'targetTitle', type: 'string' },
    { name: 'locked', type: 'bool' },
    { name: 'hasDiff', type: 'bool' },
    { name: 'recoverable', type: 'bool' },
    { name: 'meta', type: 'string' }
  ]
})

ns.register({
  name: 'activitySnapshot',
  compact: false,
  fields: [
    { name: 'id', type: 'string', required: true },
    { name: 'text', type: 'string' }
  ]
})

ns.register({
  name: 'activityDiscarded',
  compact: false,
  fields: [
    { name: 'id', type: 'string', required: true },
    { name: 'json', type: 'string' }
  ]
})

ns.register({
  name: 'activitySession',
  compact: false,
  fields: [
    { name: 'noteKey', type: 'string', required: true },
    { name: 'writer', type: 'string', required: true },
    { name: 'id', type: 'string' },
    { name: 'at', type: 'uint' },
    { name: 'lastAt', type: 'uint' },
    { name: 'ops', type: 'uint' }
  ]
})

ns.register({
  name: 'activityState',
  compact: false,
  fields: [
    { name: 'id', type: 'string', required: true },
    { name: 'clearedAt', type: 'uint' }
  ]
})

Hyperschema.toDisk(schema)

const db = HyperDB.from(SCHEMA_DIR, DB_DIR)
const dbNs = db.namespace(NS)

// Resolved from the project root, so the path includes spec/.
dbNs.require('./spec/db-helpers.js')

const collection = (name, schemaName, key) =>
  dbNs.collections.register({ name, schema: `@${NS}/${schemaName}`, key })

collection('notes', 'note', ['key'])
collection('folders', 'folder', ['key'])
collection('invites', 'invite', ['slot'])
collection('settings', 'settings', ['id'])
collection('syncedDevices', 'syncedDevice', ['key'])
collection('mediaTombstones', 'mediaTombstone', ['refKey'])
collection('encryptedMediaCores', 'encryptedMediaCore', ['coreKey'])
collection('activity', 'activityEntry', ['id'])
collection('activitySnapshots', 'activitySnapshot', ['id'])
collection('activityDiscarded', 'activityDiscarded', ['id'])
collection('activitySessions', 'activitySession', ['noteKey', 'writer'])
collection('activityTitleSessions', 'activitySession', ['noteKey', 'writer'])
collection('activityState', 'activityState', ['id'])

dbNs.indexes.register({
  name: 'activityByNote',
  collection: `@${NS}/activity`,
  key: { type: 'string', map: 'mapActivityToNote' }
})

HyperDB.toDisk(db)
