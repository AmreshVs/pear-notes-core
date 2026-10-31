import test from 'brittle'

import {
  canAddSyncLeader,
  canRemoveSyncLeader,
  planSyncLeaders
} from '../store/slices/syncedDevicesSlice.js'

const device = (key, extra = {}) => ({
  key,
  isOnline: true,
  deviceType: 'mobile',
  platform: 'android',
  ...extra
})
const mac = (key, extra = {}) =>
  device(key, { deviceType: 'desktop', platform: 'darwin', ...extra })
const iphone = (key, extra = {}) => device(key, { platform: 'ios', ...extra })

test('sync leaders - one always-on leader is the recommendation', (t) => {
  const plan = planSyncLeaders([
    mac('mac', { isIndexer: true, isLocal: true }),
    device('android'),
    device('tab'),
    iphone('iphone')
  ])
  t.is(plan.recommended, 1)
  t.is(plan.suggested, null, 'nothing to suggest with a desktop leader')
  t.is(plan.max, 3)
  t.ok(canAddSyncLeader(device('android'), plan), 'more leaders can be added by hand')
  t.absent(canRemoveSyncLeader(plan.leaders[0], plan), 'the last leader cannot be removed')
})

test('sync leaders - an iPhone can be made a leader by hand', (t) => {
  const plan = planSyncLeaders([mac('mac', { isIndexer: true, isLocal: true }), iphone('iphone')])
  t.ok(canAddSyncLeader(iphone('iphone'), plan))
})

test('sync leaders - an iPhone leader gets an always-on replacement suggested', (t) => {
  const withDesktop = planSyncLeaders([
    iphone('iphone', { isIndexer: true, isLocal: true }),
    device('android', { addedAt: 0 }),
    mac('mac', { addedAt: 5 })
  ])
  t.is(withDesktop.suggested.key, 'mac', 'desktops first')

  const androidOnly = planSyncLeaders([
    iphone('iphone', { isIndexer: true, isLocal: true }),
    device('android'),
    iphone('ipad')
  ])
  t.is(androidOnly.suggested.key, 'android', 'then Android, which has Always-on sync')
})

test('sync leaders - never more than three, and two warns', (t) => {
  const devices = [
    mac('a', { isIndexer: true, isLocal: true }),
    device('b', { isIndexer: true }),
    device('c', { isIndexer: true }),
    device('d')
  ]
  const full = planSyncLeaders(devices)
  t.absent(full.canAdd)
  t.absent(canAddSyncLeader(devices[3], full), 'a fourth leader is refused')
  t.ok(canRemoveSyncLeader(devices[1], full))
  t.ok(planSyncLeaders(devices.slice(0, 2)).needsBothOnline)
})

test('sync leaders - an offline leader blocks every change', (t) => {
  const devices = [
    iphone('a', { isIndexer: true, isLocal: true }),
    device('b', { isIndexer: true, isOnline: false }),
    device('c')
  ]
  const plan = planSyncLeaders(devices)
  t.is(plan.offlineLeaders.length, 1)
  t.absent(canAddSyncLeader(devices[2], plan))
  t.absent(canRemoveSyncLeader(devices[0], plan))
  t.is(plan.suggested, null)
})

test('sync leaders - offline devices are never suggested or promoted', (t) => {
  const devices = [
    iphone('a', { isIndexer: true, isLocal: true }),
    mac('b', { isOnline: false }),
    device('c')
  ]
  const plan = planSyncLeaders(devices)
  t.is(plan.suggested.key, 'c')
  t.absent(canAddSyncLeader(devices[1], plan))
})
