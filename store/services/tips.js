import { createSelector } from '@reduxjs/toolkit'

import { backendApi } from '../../backend/api.js'
import { LOCAL_AI_FEATURE } from './localAiCatalog.js'
import {
  getLocalAiConfig,
  getLocalAiIndex,
  getLocalAiOffloadServing,
  selectIsLocalAiFeatureReady
} from '../slices/localAiSlice.js'
import { getRemoteSyncedDevices } from '../slices/syncedDevicesSlice.js'

// Highest priority first: when several apply, the first one shows.
export const TIP = Object.freeze({
  SYNC_BLOCKED: 'syncBlocked',
  INDEX_CHARGING: 'indexCharging',
  USE_MAC: 'useMac',
  ALWAYS_ON_SYNC: 'alwaysOnSync',
  BACKGROUND_SYNC: 'backgroundSync',
  SERVE_PHONE: 'servePhone',
  REMINDERS_OFF: 'remindersOff',
  YEARLY_DATES: 'yearlyDates'
})
export const TIP_ORDER = Object.freeze(Object.values(TIP))

// About this device's own setup, so answers stay on the device instead of syncing.
export const DEVICE_TIPS = Object.freeze([
  TIP.SYNC_BLOCKED,
  TIP.ALWAYS_ON_SYNC,
  TIP.BACKGROUND_SYNC
])

export const TIP_ACTION = Object.freeze({ ACCEPT: 'accept', NOT_NOW: 'notNow', DISMISS: 'dismiss' })

const DAY_MS = 24 * 60 * 60 * 1000
export const TIP_SNOOZE_MS = 14 * DAY_MS
export const TIP_NEW_TIP_GAP_MS = DAY_MS
export const TIP_INSTALL_QUIET_MS = 10 * 60 * 1000
const MAX_NOT_NOW = 2
const TIP_PREFIX = 'tip/'
export const TIPS_SETTINGS_ID = 'tips'

const tipId = (tip) => TIP_PREFIX + tip

const isOpen = (record, now) =>
  !record?.retired && !(Number.isFinite(record?.snoozedUntil) && record.snoozedUntil > now)

const recordFor = (tip, records, local) =>
  DEVICE_TIPS.includes(tip) ? local.records?.[tip] : records[tipId(tip)]

/**
 * The tip to show now, or null. `eligible` lists tips whose condition holds
 * on this device. A tip already on screen stays while it still applies; a new
 * one waits a day after the last, and nothing shows in the first minutes.
 * `local` is per device: `{ firstSeenAt, lastShownAt, currentTip, records, catchUpDays }`.
 */
export function pickTip({ eligible, records = {}, local = {}, now = Date.now(), enabled = true }) {
  if (!enabled) return null
  const open = TIP_ORDER.filter(
    (tip) => eligible.includes(tip) && isOpen(recordFor(tip, records, local), now)
  )
  if (local.currentTip && open.includes(local.currentTip)) return local.currentTip
  if (!local.firstSeenAt || now - local.firstSeenAt < TIP_INSTALL_QUIET_MS) return null
  if (local.lastShownAt && now - local.lastShownAt < TIP_NEW_TIP_GAP_MS) return null
  return open[0] ?? null
}

/** The synced record after the user answers a tip. Two "Not now"s retire it. */
export function answerTip(record, action, now = Date.now()) {
  if (action !== TIP_ACTION.NOT_NOW) return { retired: true }
  const notNow = (record?.notNow || 0) + 1
  return notNow >= MAX_NOT_NOW
    ? { retired: true, notNow }
    : { notNow, snoozedUntil: now + TIP_SNOOZE_MS }
}

export async function loadTipRecords() {
  const [records, settings] = await Promise.all([
    backendApi.getSyncedPrefs(TIP_PREFIX),
    backendApi.getSyncedPrefs(TIPS_SETTINGS_ID)
  ])
  return { records, enabled: settings[TIPS_SETTINGS_ID]?.off !== true }
}

export const saveTipAnswer = (tip, record, action) =>
  backendApi.setSyncedPref(tipId(tip), answerTip(record, action))

export const setTipsEnabled = (enabled) =>
  backendApi.setSyncedPref(TIPS_SETTINGS_ID, enabled ? null : { off: true })

export const tipRecord = (records, tip, local = {}) => recordFor(tip, records, local)

export const isDeviceTip = (tip) => DEVICE_TIPS.includes(tip)

/** `local` with a device tip's answer stored in it. */
export const answerDeviceTip = (local, tip, action, now = Date.now()) => ({
  ...local,
  records: { ...local.records, [tip]: answerTip(local.records?.[tip], action, now) }
})

export const CATCH_UP_WINDOW_MS = 30 * 1000
const CATCH_UP_SPAN_MS = 14 * DAY_MS
const CATCH_UP_MIN_DAYS = 3
const SYNC_STALE_MS = DAY_MS

const dayStart = (at) => {
  const date = new Date(at)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/**
 * Days (local midnight) on which other devices' edits were still arriving
 * after the app opened, kept for two weeks.
 */
export function addCatchUpDay(days = [], at) {
  const day = dayStart(at)
  const kept = days.filter((d) => at - d < CATCH_UP_SPAN_MS && d !== day)
  return [...kept, day].sort((a, b) => a - b)
}

const recentCatchUps = (days = [], now) => days.filter((d) => now - d < CATCH_UP_SPAN_MS).length

/**
 * Background sync tips for a phone. `mode` is 'off' | 'periodic' | 'always-on';
 * `backgroundAllowed` is false when the OS will never run the task (iOS Background
 * App Refresh off) and `batteryRestricted` is Android battery optimisation.
 * `modeSince` is when this device last changed mode.
 */
export function backgroundSyncTips({
  platform,
  mode,
  hasLinkedDevices,
  devices = [],
  backgroundAllowed = true,
  batteryRestricted = false,
  snapshot = {},
  modeSince = 0,
  catchUpDays = [],
  now = Date.now()
}) {
  if (!hasLinkedDevices) return []
  const tips = []
  const android = platform === 'android'
  if (mode !== 'off') {
    const settled = modeSince > 0 && now - modeSince > SYNC_STALE_MS
    const wakesStale = !snapshot.lastWakeAt || now - snapshot.lastWakeAt > SYNC_STALE_MS
    const serviceStopped =
      mode === 'always-on' && snapshot.serviceFailedAt > 0 && snapshot.serviceFailedAt > modeSince
    if (!android && !backgroundAllowed) tips.push(TIP.SYNC_BLOCKED)
    else if (android && batteryRestricted && (serviceStopped || (settled && wakesStale))) {
      tips.push(TIP.SYNC_BLOCKED)
    }
  }
  if (android && mode !== 'always-on') {
    const computerLinked = devices.some((d) => d.deviceType === 'desktop')
    const leader = devices.some((d) => d.isLocal && d.isIndexer === true)
    if (!computerLinked && leader) tips.push(TIP.ALWAYS_ON_SYNC)
  }
  if (
    mode === 'off' &&
    backgroundAllowed &&
    recentCatchUps(catchUpDays, now) >= CATCH_UP_MIN_DAYS
  ) {
    tips.push(TIP.BACKGROUND_SYNC)
  }
  return tips
}

const INDEX_TIP_MIN_NOTES = 10
const MAC_PLATFORM = 'darwin'
const MOBILE_DEVICE = 'mobile'

const selectTextAiReady = (state) =>
  selectIsLocalAiFeatureReady(state, LOCAL_AI_FEATURE.SUMMARIZE_RECORDINGS)

/** Tips that apply from the store alone; apps add their own (reminders, yearly dates). */
export const selectStoreTips = createSelector(
  [
    getRemoteSyncedDevices,
    selectTextAiReady,
    getLocalAiConfig,
    getLocalAiOffloadServing,
    getLocalAiIndex,
    (_state, isPhone) => isPhone
  ],
  (devices, aiReady, config, serving, index, isPhone) => {
    const tips = []
    if (isPhone && index.enabled && index.deferred >= INDEX_TIP_MIN_NOTES) {
      tips.push(TIP.INDEX_CHARGING)
    }
    const macOnline = devices.some((d) => d.platform === MAC_PLATFORM && d.isOnline === true)
    if (isPhone && aiReady && macOnline && config?.offload?.useMac !== true) tips.push(TIP.USE_MAC)
    const phoneLinked = devices.some((d) => d.deviceType === MOBILE_DEVICE)
    if (!isPhone && aiReady && phoneLinked && !serving.lastDevice) tips.push(TIP.SERVE_PHONE)
    return tips
  }
)
