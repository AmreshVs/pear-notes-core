import crypto from 'bare-crypto'
import fs from 'bare-fs'
import barePath from 'bare-path'
import { PRESERVED_VAULT_PREFIXES } from '../../constant.js'

// Every vault gets its own store directory with its own random primary key, so a
// writer key is never reused. A directory is never deleted and recreated in place:
// that is how one writer key once ended up with two different histories.
const POINTER_FILE = 'vault.json'
const VAULTS_DIR = 'vaults'
const MERGE_FILE = 'pairing-merge.pnbk'
const PRESERVED_DIR = 'pre-rewrite'
// Lives inside the vault's own directory, so it goes away with that vault.
const REMOVED_MARKER = 'removed-from-vault'

const LEGACY_ENTRIES = [
  'core',
  'core-pairing-candidate',
  'core-pairing-old',
  'core-unmerged-backup',
  'pairing-merge.pnbk',
  'media-store.json',
  'swarm-seed'
]

export function pointerPath(storage) {
  return barePath.join(storage, POINTER_FILE)
}

export function mergeFilePath(storage) {
  return barePath.join(storage, MERGE_FILE)
}

// Stored dirs are always '/'-separated. Windows builds before this wrote
// `vaults\<id>`, which the entry filter then dropped.
const toStoredDir = (dir) => (typeof dir === 'string' ? dir.replace(/\\/g, '/') : dir)

export function readPointer(storage) {
  try {
    const parsed = JSON.parse(fs.readFileSync(pointerPath(storage), 'utf-8'))
    if (typeof parsed?.current !== 'string' || !parsed.current) return null
    const pointer = {
      current: toStoredDir(parsed.current),
      merge: parsed.merge || null,
      retire: (parsed.retire || []).map(toStoredDir)
    }
    // Only written once a second vault exists, so single-vault files keep today's shape.
    if (Array.isArray(parsed.vaults)) {
      pointer.vaults = parsed.vaults
        .map((entry) => (entry ? { ...entry, dir: toStoredDir(entry.dir) } : entry))
        .filter(isVaultEntry)
    }
    return pointer
  } catch {
    return null
  }
}

const isVaultEntry = (entry) =>
  !!entry && typeof entry.dir === 'string' && entry.dir.startsWith(VAULTS_DIR + '/')

export function vaultIdOf(dir) {
  return barePath.basename(dir)
}

// `current` is always a vault, even in a file written before vaults were listed.
export function listVaultEntries(pointer) {
  if (!pointer) return []
  const byDir = new Map()
  for (const entry of pointer.vaults || []) {
    if (!entry) continue
    const kept = byDir.get(entry.dir)
    if (!kept || (!kept.name && entry.name)) byDir.set(entry.dir, entry)
  }
  const entries = [...byDir.values()]
  if (!entries.some((entry) => entry.dir === pointer.current)) {
    entries.unshift({ dir: pointer.current, name: '', addedAt: 0 })
  }
  return entries.map((entry) => ({
    id: vaultIdOf(entry.dir),
    dir: entry.dir,
    name: typeof entry.name === 'string' ? entry.name : '',
    addedAt: Number.isFinite(entry.addedAt) ? entry.addedAt : 0,
    current: entry.dir === pointer.current
  }))
}

export function findVaultEntry(pointer, id) {
  return listVaultEntries(pointer).find((entry) => entry.id === id) || null
}

const toStored = ({ dir, name, addedAt }) => ({ dir, name, addedAt })

export function withVault(pointer, entry) {
  const vaults = listVaultEntries(pointer).map(toStored)
  return { ...pointer, vaults: [...vaults.filter((v) => v.dir !== entry.dir), toStored(entry)] }
}

export function withoutVault(pointer, dir) {
  const vaults = listVaultEntries(pointer)
    .filter((entry) => entry.dir !== dir)
    .map(toStored)
  return { ...pointer, vaults }
}

export function withVaultName(pointer, dir, name) {
  const vaults = listVaultEntries(pointer).map((entry) =>
    entry.dir === dir ? { ...toStored(entry), name } : toStored(entry)
  )
  return { ...pointer, vaults }
}

// A joined vault takes the place of the one it replaces, name and position included.
export function withReplacedVault(pointer, fromDir, toDir) {
  if (!pointer.vaults) return pointer
  const vaults = listVaultEntries(pointer).map((entry) =>
    entry.dir === fromDir ? { ...toStored(entry), dir: toDir } : toStored(entry)
  )
  return { ...pointer, vaults }
}

export function writePointer(storage, pointer) {
  fs.mkdirSync(storage, { recursive: true })
  const target = pointerPath(storage)
  const temp = target + '.tmp'
  fs.writeFileSync(temp, JSON.stringify(pointer))
  fs.renameSync(temp, target)
}

export function newVaultDir() {
  const id = crypto.randomBytes(8).toString('hex')
  return `${VAULTS_DIR}/${id}`
}

export function resolveVaultDir(storage, relative) {
  return barePath.join(storage, relative)
}

export function isMarkedRemoved(vaultDir) {
  return fs.existsSync(barePath.join(vaultDir, REMOVED_MARKER))
}

export function markRemoved(vaultDir) {
  fs.writeFileSync(barePath.join(vaultDir, REMOVED_MARKER), String(Date.now()))
}

export function removeDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
}

export function findLegacyStores(storage) {
  if (readPointer(storage)) return []
  return ['core', 'core-pairing-candidate', 'core-pairing-old', 'core-unmerged-backup']
    .map((name) => barePath.join(storage, name))
    .filter((dir) => fs.existsSync(dir))
}

export function preserveLegacyVault(storage) {
  if (findLegacyStores(storage).length === 0) return { done: false, reason: 'NOT_LEGACY' }
  let dest = barePath.join(storage, PRESERVED_DIR)
  for (let n = 2; fs.existsSync(dest); n++) dest = barePath.join(storage, `${PRESERVED_DIR}-${n}`)
  fs.mkdirSync(dest, { recursive: true })
  const present = LEGACY_ENTRIES.filter((name) => fs.existsSync(barePath.join(storage, name)))
  // `core` last, so a crash midway still reads as legacy on the next start.
  const order = [
    ...present.filter((name) => name !== 'core'),
    ...present.filter((n) => n === 'core')
  ]
  for (const name of order) fs.renameSync(barePath.join(storage, name), barePath.join(dest, name))
  return { done: true, preservedPath: dest }
}

export function isPreservedEntry(name) {
  return PRESERVED_VAULT_PREFIXES.some((prefix) => name.startsWith(prefix))
}
