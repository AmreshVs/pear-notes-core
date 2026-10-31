import { SEALED_NOTES_CAP, hasCap } from './deviceCaps.js'
import { UPDATE_REQUIRED } from '../constant.js'
import * as log from '../log.js'

export { UPDATE_REQUIRED }

export const COMPAT_LEVEL = 2

export const MIN_COMPAT_PREF = 'compat:min'
export const GATE_PREF_PREFIX = 'gate:'
export const DEVICE_REFRESH_MS = 24 * 60 * 60 * 1000

export const GATES = {
  sealedNotes: {
    minCompatLevel: 1,
    legacyCap: SEALED_NOTES_CAP,
    alreadyActive: (base) => base.hasLockKeyring()
  },
  sealedFiles: { minCompatLevel: 2 }
}

export const gatePrefId = (name) => GATE_PREF_PREFIX + name

const levelOf = (value) => (Number.isInteger(value) && value > 0 ? value : 0)

export function deviceCompatLevel(device) {
  let level = levelOf(device?.compatLevel)
  for (const gate of Object.values(GATES)) {
    if (gate.legacyCap && hasCap(device?.caps, gate.legacyCap)) {
      level = Math.max(level, gate.minCompatLevel)
    }
  }
  return level
}

export const minCompatLevelOf = (pref) => levelOf(pref?.level)

export const isActivation = (value) =>
  !!value && Number.isFinite(value.activatedAt) && levelOf(value.compatLevel) > 0

function gateOf(name) {
  const gate = GATES[name]
  if (!gate) throw new Error('unknown gate ' + name)
  return gate
}

export async function blockingDevices(base, name) {
  const gate = gateOf(name)
  const devices = await base.listSyncedDevicesStrict()
  return devices
    .filter((device) => deviceCompatLevel(device.value) < gate.minCompatLevel)
    .map(({ key, value }) => ({
      key,
      title: value?.title || '',
      compatLevel: deviceCompatLevel(value),
      appVersion: value?.appVersion || '',
      lastSeenAt: value?.lastSeenAt || 0
    }))
}

export async function gateStatus(base, name) {
  gateOf(name)
  if (isActivation(await base.getSyncedPref(gatePrefId(name)))) return { open: true, blocking: [] }
  const blocking = await blockingDevices(base, name)
  return { open: blocking.length === 0, blocking }
}

export async function openGate(base, name) {
  const gate = gateOf(name)
  if (isActivation(await base.getSyncedPref(gatePrefId(name)))) return { open: true, blocking: [] }
  await base.publishLocalSwarmKey()
  if (!(gate.alreadyActive && (await gate.alreadyActive(base)))) {
    const blocking = await blockingDevices(base, name)
    if (blocking.length) return { open: false, blocking }
  }
  await base.activateGate(name, gate.minCompatLevel)
  return { open: true, blocking: [] }
}

export async function adoptActiveGates(base) {
  if (!base.writable || base.updateRequired) return
  for (const [name, gate] of Object.entries(GATES)) {
    if (!gate.alreadyActive) continue
    try {
      if (isActivation(await base.getSyncedPref(gatePrefId(name)))) continue
      if (await gate.alreadyActive(base)) await base.activateGate(name, gate.minCompatLevel)
    } catch (e) {
      log.error('[gates] could not record an active gate', name, e?.message)
    }
  }
}
