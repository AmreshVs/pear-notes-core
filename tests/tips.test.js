import test from 'brittle'

test('tips: one at a time, quiet after install, a day apart, two not-nows retire', async (t) => {
  const { pickTip, answerTip, TIP, TIP_ACTION } = await import('../store/services/tips.js')
  const now = 10 * 24 * 60 * 60 * 1000
  const eligible = [TIP.REMINDERS_OFF, TIP.USE_MAC]
  const settled = { firstSeenAt: now - 3600000 }
  t.is(pickTip({ eligible, local: settled, now }), TIP.USE_MAC, 'priority order')
  t.is(pickTip({ eligible, local: { firstSeenAt: now - 60000 }, now }), null, 'install quiet')
  t.is(
    pickTip({ eligible, local: { ...settled, lastShownAt: now - 3600000 }, now }),
    null,
    'a day between new tips'
  )
  t.is(
    pickTip({
      eligible,
      local: { ...settled, lastShownAt: now, currentTip: TIP.REMINDERS_OFF },
      now
    }),
    TIP.REMINDERS_OFF,
    'the tip on screen stays'
  )
  const once = answerTip(undefined, TIP_ACTION.NOT_NOW, now)
  t.is(
    pickTip({ eligible: [TIP.USE_MAC], records: { 'tip/useMac': once }, local: settled, now }),
    null
  )
  t.ok(answerTip(once, TIP_ACTION.NOT_NOW, now).retired)
  t.ok(answerTip(undefined, TIP_ACTION.DISMISS, now).retired)
  t.is(pickTip({ eligible, local: settled, now, enabled: false }), null)
})

test('tips: device tips answer locally, not in the synced records', async (t) => {
  const { pickTip, answerDeviceTip, TIP, TIP_ACTION } = await import('../store/services/tips.js')
  const now = 10 * 24 * 60 * 60 * 1000
  const local = { firstSeenAt: now - 3600000 }
  const eligible = [TIP.BACKGROUND_SYNC]
  t.is(
    pickTip({ eligible, records: { 'tip/backgroundSync': { retired: true } }, local, now }),
    TIP.BACKGROUND_SYNC,
    'a synced record does not silence a device tip'
  )
  const answered = answerDeviceTip(local, TIP.BACKGROUND_SYNC, TIP_ACTION.DISMISS, now)
  t.is(pickTip({ eligible, local: answered, now }), null)
})

test('tips: background sync tips need evidence', async (t) => {
  const { backgroundSyncTips, addCatchUpDay, TIP } = await import('../store/services/tips.js')
  const DAY = 24 * 60 * 60 * 1000
  const now = Date.UTC(2026, 9, 15, 12)
  const phone = {
    key: 'p',
    isLocal: true,
    platform: 'android',
    deviceType: 'mobile',
    isIndexer: true
  }
  const iphone = { key: 'i', platform: 'ios', deviceType: 'mobile', isOnline: true }
  const mac = {
    key: 'm',
    platform: 'darwin',
    deviceType: 'desktop',
    isOnline: true,
    isIndexer: true
  }
  const base = { hasLinkedDevices: true, now }

  let days = []
  for (const back of [1, 3, 5]) days = addCatchUpDay(days, now - back * DAY)
  days = addCatchUpDay(days, now - 1 * DAY + 60000)
  t.is(days.length, 3, 'one entry per day')
  t.is(addCatchUpDay(days, now + 30 * DAY).length, 1, 'old days drop')

  const ios = { ...base, platform: 'ios', devices: [{ ...iphone, isLocal: true }, mac] }
  t.alike(backgroundSyncTips({ ...ios, mode: 'off', catchUpDays: days.slice(0, 2) }), [])
  t.alike(backgroundSyncTips({ ...ios, mode: 'off', catchUpDays: days }), [TIP.BACKGROUND_SYNC])
  t.alike(
    backgroundSyncTips({ ...ios, mode: 'off', catchUpDays: days, backgroundAllowed: false }),
    [],
    'no point suggesting periodic when iOS will not run it'
  )
  t.alike(backgroundSyncTips({ ...ios, mode: 'periodic', backgroundAllowed: false }), [
    TIP.SYNC_BLOCKED
  ])
  t.alike(
    backgroundSyncTips({ ...ios, mode: 'off', catchUpDays: days, hasLinkedDevices: false }),
    []
  )

  const android = { ...base, platform: 'android', devices: [phone, iphone] }
  t.alike(backgroundSyncTips({ ...android, mode: 'periodic' }), [TIP.ALWAYS_ON_SYNC])
  t.alike(backgroundSyncTips({ ...android, mode: 'always-on' }), [])
  t.alike(
    backgroundSyncTips({ ...android, devices: [{ ...phone, isIndexer: false }, mac], mode: 'off' }),
    [],
    'a computer is the better always-on device'
  )
  t.alike(
    backgroundSyncTips({
      ...android,
      mode: 'always-on',
      batteryRestricted: true,
      modeSince: now - 3600000
    }),
    [],
    'battery optimisation alone is not evidence'
  )
  t.alike(
    backgroundSyncTips({
      ...android,
      mode: 'always-on',
      batteryRestricted: true,
      modeSince: now - 3 * DAY,
      snapshot: { serviceFailedAt: now - DAY, lastWakeAt: now - 60000 }
    }),
    [TIP.SYNC_BLOCKED]
  )
  t.alike(
    backgroundSyncTips({
      ...android,
      devices: [{ ...phone, isIndexer: false }, mac],
      mode: 'periodic',
      batteryRestricted: true,
      modeSince: now - 3 * DAY,
      snapshot: { lastWakeAt: now - 2 * DAY }
    }),
    [TIP.SYNC_BLOCKED]
  )
})

test('tips: always-on only for a phone that is a sync leader', async (t) => {
  const { backgroundSyncTips } = await import('../store/services/tips.js')
  const phone = { key: 'p', isLocal: true, deviceType: 'mobile', isIndexer: false }
  const iphone = {
    key: 'i',
    platform: 'ios',
    deviceType: 'mobile',
    isOnline: true,
    isIndexer: true
  }
  t.alike(
    backgroundSyncTips({
      platform: 'android',
      mode: 'off',
      hasLinkedDevices: true,
      devices: [phone, iphone]
    }),
    []
  )
})
