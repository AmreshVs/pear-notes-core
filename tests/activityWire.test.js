import test from 'brittle'
import { decode, encode } from '../spec/hyperschema/index.js'
import { ACTIVITY_DEFAULT_RETENTION_DAYS, ACTIVITY_EVENT, ACTIVITY_TARGET } from '../constant.js'

const roundTrip = (name, value) => decode(name, encode(name, value))

test('activity entry wire - every field survives the round trip', async (t) => {
  const entry = {
    id: '00001756600000:aabbccddeeff:note.edited:n1234567890',
    event: ACTIVITY_EVENT.NOTE_EDITED,
    device: 'aa'.repeat(32),
    at: 1756600000000,
    lastAt: 1756600720000,
    ops: 14,
    targetKind: ACTIVITY_TARGET.NOTE,
    targetKey: 'n1234567890',
    targetTitle: 'Q3 Roadmap',
    locked: true,
    hasDiff: true,
    meta: JSON.stringify({ from: 'Roadmap', to: 'Q3 Roadmap' })
  }

  const decoded = roundTrip('@notes/activity-entry-schema', entry)

  t.is(decoded.id, entry.id, 'id survives')
  t.is(decoded.event, entry.event, 'event survives')
  t.is(decoded.device, entry.device, 'device key survives - the whole feature hangs off it')
  t.is(decoded.at, entry.at, 'start timestamp survives')
  t.is(decoded.lastAt, entry.lastAt, 'session end timestamp survives')
  t.is(decoded.ops, entry.ops, 'save count survives')
  t.is(decoded.targetKind, entry.targetKind, 'target kind survives')
  t.is(decoded.targetKey, entry.targetKey, 'target key survives')
  t.is(decoded.targetTitle, entry.targetTitle, 'target title survives')
  t.is(decoded.locked, true, 'locked flag survives')
  t.is(decoded.hasDiff, true, 'diff availability survives')
  t.alike(JSON.parse(decoded.meta), { from: 'Roadmap', to: 'Q3 Roadmap' }, 'meta survives')
})

test('activity entry wire - meta carries pairing detail', async (t) => {
  const decoded = roundTrip('@notes/activity-entry-schema', {
    id: 'x',
    event: ACTIVITY_EVENT.DEVICE_REJECTED,
    device: 'bb'.repeat(32),
    at: 1756600000000,
    targetKind: ACTIVITY_TARGET.DEVICE,
    meta: JSON.stringify({ platform: 'android', deviceKey: 'cc'.repeat(32) })
  })

  const meta = JSON.parse(decoded.meta)
  t.is(meta.platform, 'android', 'rejected platform survives')
  t.is(meta.deviceKey, 'cc'.repeat(32), 'rejected device key survives')
})

test('activity diff wire - both sides survive the round trip', async (t) => {
  const decoded = roundTrip('@notes/activity-diff-schema', {
    id: 'entry-id',
    before: 'alpha\nbeta',
    after: 'alpha\ngamma',
    locked: false,
    available: true
  })

  t.is(decoded.before, 'alpha\nbeta', 'before text survives newlines')
  t.is(decoded.after, 'alpha\ngamma', 'after text survives newlines')
  t.is(decoded.available, true, 'availability survives')
})

test('activity stats wire survives the round trip', async (t) => {
  const decoded = roundTrip('@notes/activity-stats-schema', {
    count: 1240,
    bytes: 943718,
    oldestAt: 1756600000000
  })

  t.is(decoded.count, 1240, 'count survives')
  t.is(decoded.bytes, 943718, 'byte total survives')
  t.is(decoded.oldestAt, 1756600000000, 'oldest timestamp survives')
})

test('settings wire carries the activity switch and retention', async (t) => {
  const decoded = roundTrip('@notes/settings-schema', {
    theme: 'dark',
    activityLogEnabled: true,
    activityRetentionDays: ACTIVITY_DEFAULT_RETENTION_DAYS
  })

  t.is(decoded.theme, 'dark', 'existing settings still survive')
  t.is(decoded.activityLogEnabled, true, 'the switch survives - it gates recording on every device')
  t.is(
    decoded.activityRetentionDays,
    ACTIVITY_DEFAULT_RETENTION_DAYS,
    'retention survives so the sweep cutoff matches everywhere'
  )
})

test('settings wire defaults the switch to off when absent', async (t) => {
  const decoded = roundTrip('@notes/settings-schema', { theme: 'light' })
  t.absent(decoded.activityLogEnabled, 'an older device sending no flag never turns recording on')
})

test('synced device wire carries localKey - the activity log resolves names through it', async (t) => {
  const localKey = 'ab'.repeat(32)
  const decoded = roundTrip('@notes/synced-device-schema', {
    title: 'MacBook Pro',
    deviceType: 'desktop',
    platform: 'darwin',
    isLocal: true,
    addedAt: 1756600000000,
    updatedAt: 1756600000000,
    isOnline: true,
    presenceKnown: true,
    localKey
  })

  t.is(decoded.title, 'MacBook Pro', 'title survives')
  t.is(
    decoded.localKey,
    localKey,
    'localKey survives - without it every activity row falls back to a raw hex key'
  )
})
