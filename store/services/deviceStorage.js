import {
  PREFERENCE_DIR,
  PREFERENCE_LEGACY_DIR,
  PRESERVED_VAULT_PREFIXES,
  SWARM_SEED_FILE
} from '../../constant.js'

export const DEVICE_STORAGE = {
  APP: 'app',
  NOTES: 'notes',
  OLD_VAULTS: 'oldVaults',
  AI_MODELS: 'aiModels',
  CACHE: 'cache',
  PREVIEWS: 'previews',
  LOGS: 'logs',
  OTHER: 'other'
}

export const DEVICE_STORAGE_ORDER = [
  DEVICE_STORAGE.APP,
  DEVICE_STORAGE.NOTES,
  DEVICE_STORAGE.OLD_VAULTS,
  DEVICE_STORAGE.AI_MODELS,
  DEVICE_STORAGE.CACHE,
  DEVICE_STORAGE.PREVIEWS,
  DEVICE_STORAGE.LOGS,
  DEVICE_STORAGE.OTHER
]

const LOG_ENTRIES = ['error-log.json', 'error-log-settings.json']

const NOTES_ENTRIES = [
  'vault.json',
  'vaults',
  'pairing-merge.pnbk',
  SWARM_SEED_FILE,
  PREFERENCE_DIR,
  PREFERENCE_LEGACY_DIR,
  'core',
  'core-pairing-candidate',
  'core-pairing-old',
  'core-unmerged-backup',
  'media-store.json'
]

export const isOldVaultEntry = (name) =>
  PRESERVED_VAULT_PREFIXES.some((prefix) => String(name).startsWith(prefix))

/**
 * Category of one top-level entry of the backend's storage directory, or null for an
 * entry the backend does not own (the caller files those under its own rules).
 */
export function classifyVaultStorageEntry(name) {
  if (isOldVaultEntry(name)) return DEVICE_STORAGE.OLD_VAULTS
  if (LOG_ENTRIES.some((entry) => name === entry || name === `${entry}.tmp`)) {
    return DEVICE_STORAGE.LOGS
  }
  if (NOTES_ENTRIES.some((entry) => name === entry || name === `${entry}.tmp`)) {
    return DEVICE_STORAGE.NOTES
  }
  return null
}

export function summarizeDeviceStorage(items) {
  const byCategory = Object.fromEntries(DEVICE_STORAGE_ORDER.map((category) => [category, 0]))
  let total = 0
  for (const { category, bytes } of items || []) {
    const size = Math.max(0, Number(bytes) || 0)
    const key = category in byCategory ? category : DEVICE_STORAGE.OTHER
    byCategory[key] += size
    total += size
  }
  return { total, byCategory }
}

/** Each vault's AI index (backend DERIVED_DIR), at vaults/<id>/derived. */
export const VAULT_DERIVED_DIR = 'derived'

/** The index sits inside the vault folders but is on-device AI data, so it moves from Notes to AI. */
export function countDerivedAsAi(summary, derivedBytes) {
  const notes = summary.byCategory[DEVICE_STORAGE.NOTES] ?? 0
  const bytes = Math.min(notes, Math.max(0, Number(derivedBytes) || 0))
  return {
    ...summary,
    byCategory: {
      ...summary.byCategory,
      [DEVICE_STORAGE.NOTES]: notes - bytes,
      [DEVICE_STORAGE.AI_MODELS]: (summary.byCategory[DEVICE_STORAGE.AI_MODELS] ?? 0) + bytes
    }
  }
}

export const DEVICE_STORAGE_ACTION = {
  CLEAR_CACHE: 'clearCache',
  DELETE_OLD_VAULTS: 'deleteOldVaults',
  OPEN_AI_MODELS: 'openAiModels'
}

/** @type {Record<string, { label: string, desc: string, action?: string }>} */
export const DEVICE_STORAGE_ROWS = {
  [DEVICE_STORAGE.APP]: { label: 'storage.device.app', desc: 'storage.device.appDesc' },
  [DEVICE_STORAGE.NOTES]: { label: 'storage.device.notes', desc: 'storage.device.notesDesc' },
  [DEVICE_STORAGE.OLD_VAULTS]: {
    label: 'storage.device.oldVaults',
    desc: 'storage.device.oldVaultsDesc',
    action: DEVICE_STORAGE_ACTION.DELETE_OLD_VAULTS
  },
  [DEVICE_STORAGE.AI_MODELS]: {
    label: 'settings.onDeviceAi.storageRow',
    desc: 'settings.onDeviceAi.storageRowDesc',
    action: DEVICE_STORAGE_ACTION.OPEN_AI_MODELS
  },
  [DEVICE_STORAGE.CACHE]: {
    label: 'storage.cache',
    desc: 'storage.cacheDesc',
    action: DEVICE_STORAGE_ACTION.CLEAR_CACHE
  },
  [DEVICE_STORAGE.PREVIEWS]: {
    label: 'storage.device.previews',
    desc: 'storage.device.previewsDesc'
  },
  [DEVICE_STORAGE.LOGS]: { label: 'storage.device.logs', desc: 'storage.device.logsDesc' },
  [DEVICE_STORAGE.OTHER]: { label: 'storage.device.other', desc: 'storage.device.otherDesc' }
}

export function getVisibleDeviceStorageRows(summary, showAiModels) {
  if (!summary) return []
  return DEVICE_STORAGE_ORDER.filter((category) => {
    const bytes = summary.byCategory[category] ?? 0
    if (category === DEVICE_STORAGE.OLD_VAULTS) return bytes > 0
    if (category === DEVICE_STORAGE.AI_MODELS) return showAiModels || bytes > 0
    return true
  })
}
