import test from 'brittle'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'

import {
  listVaultEntries,
  newVaultDir,
  pointerPath,
  readPointer,
  withReplacedVault,
  withVault,
  writePointer
} from '../backend/vault/layout.js'

const storageDir = () => {
  const dir = path.join(tmpdir(), `pn-layout-${Math.random().toString(36).slice(2)}`)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

test('vault layout - new vault dirs are stored with forward slashes', (t) => {
  t.ok(/^vaults\/[0-9a-f]{16}$/.test(newVaultDir()))
})

test('vault layout - a pointer written by Windows with backslashes keeps every vault', (t) => {
  const storage = storageDir()
  t.teardown(() => fs.rmSync(storage, { recursive: true, force: true }))
  fs.writeFileSync(
    pointerPath(storage),
    JSON.stringify({
      current: 'vaults\\bbbb',
      merge: null,
      retire: ['vaults\\cccc'],
      vaults: [
        { dir: 'vaults\\aaaa', name: 'First', addedAt: 1 },
        { dir: 'vaults\\bbbb', name: 'Second', addedAt: 2 }
      ]
    })
  )

  const pointer = readPointer(storage)
  t.alike(
    listVaultEntries(pointer).map(({ id, name, current }) => [id, name, current]),
    [
      ['aaaa', 'First', false],
      ['bbbb', 'Second', true]
    ]
  )
  t.alike(pointer.retire, ['vaults/cccc'])

  writePointer(storage, withVault(pointer, { dir: newVaultDir(), name: 'Third', addedAt: 3 }))
  t.is(listVaultEntries(readPointer(storage)).length, 3)
  t.absent(fs.readFileSync(pointerPath(storage), 'utf-8').includes('\\\\'))
})

test('vault layout - combining replaces the open vault without listing it twice', (t) => {
  const pointer = {
    current: 'vaults/aaaa',
    vaults: [{ dir: 'vaults/aaaa', name: 'My vault', addedAt: 1 }]
  }
  const next = { ...withReplacedVault(pointer, 'vaults/aaaa', 'vaults/bbbb'), current: 'vaults/bbbb' }
  t.alike(
    listVaultEntries(next).map(({ id, name, current }) => [id, name, current]),
    [['bbbb', 'My vault', true]]
  )
})

test('vault layout - a pointer that lists a vault twice shows it once', (t) => {
  const pointer = {
    current: 'vaults/bbbb',
    vaults: [
      { dir: 'vaults/bbbb', name: '', addedAt: 0 },
      { dir: 'vaults/bbbb', name: 'My vault', addedAt: 1 }
    ]
  }
  t.alike(
    listVaultEntries(pointer).map(({ id, name, current }) => [id, name, current]),
    [['bbbb', 'My vault', true]]
  )
  t.is(withVault(pointer, { dir: 'vaults/cccc', name: 'Work', addedAt: 2 }).vaults.length, 2)
})
