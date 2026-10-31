import test from 'brittle'
import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'
import NoteBase from '../backend/NoteBase.js'
import { withTestnet } from './helpers/testnet.js'

const encryption = b4a.toString(b4a.alloc(32).fill('synced-prefs'), 'hex')

test('synced prefs are stored apart from settings, listed by prefix and removed by null', async (t) => {
  await withTestnet(t)
  const storage = path.join(tmpdir(), 'syncedprefs-' + Math.random().toString(36).slice(2, 9))
  const base = new NoteBase({ storage, encryption })
  t.teardown(async () => {
    await base._close().catch(() => {})
    try {
      fs.rmSync(storage, { recursive: true, force: true })
    } catch {}
  })
  await base.ready()
  await base.updateSettings({ settings: { theme: 'dark' } })
  await base.setSyncedPref('reminders', { offsets: [0, 10] })
  await base.setSyncedPref('done/a', { at: 1 })
  await base.setSyncedPref('done/b', { at: 2 })

  t.alike(await base.getSyncedPrefs('done/'), { 'done/a': { at: 1 }, 'done/b': { at: 2 } })
  t.alike((await base.getSyncedPrefs('reminders'))['reminders'], { offsets: [0, 10] })
  t.is((await base.getSettings())?.theme, 'dark', 'settings untouched')

  await base.setSyncedPref('done/a', null)
  t.alike(Object.keys(await base.getSyncedPrefs('done/')), ['done/b'])
})
