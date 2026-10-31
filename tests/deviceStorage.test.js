import test from 'brittle'

import { isPreservedEntry } from '../backend/vault/layout.js'
import { DERIVED_DIR } from '../backend/derivedStore.js'
import {
  DEVICE_STORAGE,
  VAULT_DERIVED_DIR,
  classifyVaultStorageEntry,
  countDerivedAsAi,
  getVisibleDeviceStorageRows,
  isOldVaultEntry,
  summarizeDeviceStorage
} from '../store/services/deviceStorage.js'

test('every backend storage entry lands in a category', (t) => {
  t.is(classifyVaultStorageEntry('vaults'), DEVICE_STORAGE.NOTES)
  t.is(classifyVaultStorageEntry('vault.json.tmp'), DEVICE_STORAGE.NOTES)
  t.is(classifyVaultStorageEntry('device-preferences'), DEVICE_STORAGE.NOTES)
  t.is(classifyVaultStorageEntry('pre-hyperdb'), DEVICE_STORAGE.OLD_VAULTS)
  t.is(classifyVaultStorageEntry('pre-rewrite-2'), DEVICE_STORAGE.OLD_VAULTS)
  t.is(classifyVaultStorageEntry('error-log.json'), DEVICE_STORAGE.LOGS)
  t.is(classifyVaultStorageEntry('error-log-settings.json'), DEVICE_STORAGE.LOGS)
  t.is(classifyVaultStorageEntry('share-intake'), null, 'unknown entries are left to the caller')
})

test('the storage screen and Clear storage agree on what an old vault is', (t) => {
  for (const name of ['pre-hyperdb', 'pre-hyperdb-2', 'pre-rewrite', 'pre-rewrite-3', 'vaults']) {
    t.is(isOldVaultEntry(name), isPreservedEntry(name), name)
  }
})

test('the summary adds up to the total and unknown categories count as other', (t) => {
  const { total, byCategory } = summarizeDeviceStorage([
    { category: DEVICE_STORAGE.APP, bytes: 100 },
    { category: DEVICE_STORAGE.NOTES, bytes: 50 },
    { category: 'mystery', bytes: 7 },
    { category: DEVICE_STORAGE.CACHE, bytes: -3 }
  ])
  t.is(total, 157)
  t.is(byCategory.other, 7)
  t.is(byCategory.cache, 0)
  t.is(
    Object.values(byCategory).reduce((sum, bytes) => sum + bytes, 0),
    total,
    'rows add up to the total'
  )
})

test('old vault copies only show when there are some', (t) => {
  const empty = summarizeDeviceStorage([])
  t.absent(getVisibleDeviceStorageRows(empty, true).includes(DEVICE_STORAGE.OLD_VAULTS))
  t.absent(getVisibleDeviceStorageRows(empty, false).includes(DEVICE_STORAGE.AI_MODELS))
  const withOld = summarizeDeviceStorage([{ category: DEVICE_STORAGE.OLD_VAULTS, bytes: 1 }])
  t.ok(getVisibleDeviceStorageRows(withOld, false).includes(DEVICE_STORAGE.OLD_VAULTS))
  t.alike(getVisibleDeviceStorageRows(null, true), [])
})

test('the AI index inside vault folders counts as on-device AI, not notes', (t) => {
  t.is(VAULT_DERIVED_DIR, DERIVED_DIR)
  const summary = summarizeDeviceStorage([
    { category: DEVICE_STORAGE.NOTES, bytes: 100 },
    { category: DEVICE_STORAGE.AI_MODELS, bytes: 500 }
  ])
  const moved = countDerivedAsAi(summary, 30)
  t.is(moved.byCategory[DEVICE_STORAGE.NOTES], 70)
  t.is(moved.byCategory[DEVICE_STORAGE.AI_MODELS], 530)
  t.is(moved.total, summary.total, 'the total does not change')
  t.is(countDerivedAsAi(summary, 1000).byCategory[DEVICE_STORAGE.NOTES], 0, 'never below zero')
})
