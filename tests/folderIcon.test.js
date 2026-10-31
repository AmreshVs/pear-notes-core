import test from 'brittle'
import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'

import * as notesApi from '../backend/notesApi.js'
import { DEFAULT_FOLDER_ICON, FOLDER_ICONS } from '../constant.js'
import { normalizeFolderIcon } from '../utils.js'
import { withTestnet } from './helpers/testnet.js'

const encryption = b4a.toString(b4a.alloc(32).fill('folder-icon-key!'), 'hex')

const getStoragePath = () =>
  path.join(tmpdir(), 'pear-notes-folder-icon-' + Math.random().toString(36).substring(7))

async function withBase(fn) {
  const storage = getStoragePath()
  if (fs.existsSync(storage)) fs.rmSync(storage, { recursive: true, force: true })
  await notesApi.ready({ storage, encryption })
  try {
    await fn(notesApi.notesBase)
  } finally {
    await notesApi.destroy().catch(() => {})
    try {
      if (fs.existsSync(storage)) fs.rmSync(storage, { recursive: true, force: true })
    } catch {
      // best effort cleanup
    }
  }
}

test('normalizeFolderIcon - only accepts tokens from the catalogue', (t) => {
  t.is(normalizeFolderIcon('briefcase'), 'briefcase', 'a catalogue token passes through')
  t.is(normalizeFolderIcon('allNotes'), DEFAULT_FOLDER_ICON, 'reserved system tokens are rejected')
  t.is(normalizeFolderIcon('Folder'), DEFAULT_FOLDER_ICON, 'the old lucide name is rejected')
  t.is(normalizeFolderIcon(undefined), DEFAULT_FOLDER_ICON, 'undefined falls back to the default')
  t.is(normalizeFolderIcon(null), DEFAULT_FOLDER_ICON, 'null falls back to the default')
  t.is(normalizeFolderIcon(''), DEFAULT_FOLDER_ICON, 'an empty string falls back to the default')
})

test('FOLDER_ICONS - is a unique catalogue led by the default', (t) => {
  t.is(FOLDER_ICONS[0], DEFAULT_FOLDER_ICON, 'the default is the first token offered')
  t.is(new Set(FOLDER_ICONS).size, FOLDER_ICONS.length, 'no token appears twice')
  t.absent(FOLDER_ICONS.includes('allNotes'), 'the All Notes system token is not offered')
  t.absent(FOLDER_ICONS.includes('trash'), 'the trash system token is not offered')
})

test('insertFolder - stores the chosen icon and defaults when absent', async (t) => {
  await withTestnet(t)
  await withBase(async (base) => {
    const withIcon = await notesApi.insertFolder({ title: 'Ideas', icon: 'idea' })
    t.is((await base.getFolder(withIcon)).icon, 'idea', 'the chosen icon is persisted')

    const withoutIcon = await notesApi.insertFolder({ title: 'Plain' })
    t.is((await base.getFolder(withoutIcon)).icon, DEFAULT_FOLDER_ICON, 'absent icon defaults')

    const bogus = await notesApi.insertFolder({ title: 'Bogus', icon: 'not-a-token' })
    t.is((await base.getFolder(bogus)).icon, DEFAULT_FOLDER_ICON, 'an unknown token defaults')
  })
})

test('updateFolder - renaming preserves the icon', async (t) => {
  await withTestnet(t)
  await withBase(async (base) => {
    const key = await notesApi.insertFolder({ title: 'Work', icon: 'briefcase' })

    await notesApi.updateFolder({ key, title: 'Day Job' })
    const renamed = await base.getFolder(key)
    t.is(renamed.title, 'Day Job', 'the title is updated')
    t.is(renamed.icon, 'briefcase', 'the icon survives a rename')

    await notesApi.updateFolder({ key, title: 'Day Job', icon: null })
    t.is((await base.getFolder(key)).icon, 'briefcase', 'a null icon over the wire keeps the icon')

    await notesApi.updateFolder({ key, title: 'Day Job', icon: 'archive' })
    t.is((await base.getFolder(key)).icon, 'archive', 'an explicit icon is applied')
  })
})

test('updateFolder - a legacy folder without an icon reads as the default', async (t) => {
  await withTestnet(t)
  await withBase(async (base) => {
    const key = 'legacy-folder'
    const now = Date.now()
    await base.addFolder({ key, value: { title: 'Legacy', addedAt: now, updatedAt: now } })

    await notesApi.updateFolder({ key, title: 'Legacy Renamed' })
    const updated = await base.getFolder(key)
    t.is(updated.title, 'Legacy Renamed', 'the legacy folder renames')
    t.is(updated.icon, DEFAULT_FOLDER_ICON, 'it gains the default icon rather than undefined')
  })
})
