import test from 'brittle'
import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'

import { DerivedStore } from '../backend/derivedStore.js'
import PreferenceBase from '../backend/PreferenceBase.js'
import {
  isSealedPreference,
  moveSealedPreferences,
  readSealedPreference,
  writeSealedPreference
} from '../backend/sealedPreferences.js'

const SECRET = 'ask-answer-quoting-a-private-note'

function filesContaining(dir, needle) {
  let hits = 0
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    if (fs.statSync(p).isDirectory()) hits += filesContaining(p, needle)
    else if (b4a.toString(fs.readFileSync(p)).includes(needle)) hits++
  }
  return hits
}

async function setup(t) {
  const dir = path.join(tmpdir(), 'pear-notes-sealed-prefs-' + Math.random().toString(36).slice(2))
  const prefs = new PreferenceBase(dir)
  await prefs.ready()
  const store = new DerivedStore(path.join(dir, 'derived'), b4a.alloc(32, 7))
  await store.ready()
  t.teardown(async () => {
    await prefs.close().catch(() => {})
    await store.close().catch(() => {})
    fs.rmSync(dir, { recursive: true, force: true })
  })
  return { dir, prefs, store }
}

test('sealed preferences - Ask history keys are sealed, others are not', (t) => {
  t.ok(isSealedPreference('askVaultThreads'))
  t.ok(isSealedPreference('askNoteThreads'))
  t.absent(isSealedPreference('selectedNote'))
})

test('sealed preferences - round trip through the derived store', async (t) => {
  const { dir, store } = await setup(t)
  const value = JSON.stringify([{ id: 'a', title: SECRET }])
  await writeSealedPreference(store, 'askVaultThreads', value)
  t.is(await readSealedPreference(store, 'askVaultThreads'), value)
  t.is(filesContaining(dir, SECRET), 0, 'nothing readable on disk')
  await writeSealedPreference(store, 'askVaultThreads', null)
  t.is(await readSealedPreference(store, 'askVaultThreads'), null, 'null deletes')
})

test('sealed preferences - plaintext history is moved and erased from disk', async (t) => {
  const { dir, prefs, store } = await setup(t)
  for (let i = 0; i < 5; i++) {
    await prefs.put('askVaultThreads', JSON.stringify([{ title: `${SECRET} ${i}` }]))
  }
  await prefs.put('askNoteThreads', JSON.stringify([{ answer: SECRET }]))
  await prefs.put('selectedNote', 'note-1')
  await prefs.put('askVaultThreads:vault-2', JSON.stringify([{ title: SECRET }]))
  t.ok(filesContaining(dir, SECRET) > 0, 'control: plaintext was on disk')

  t.ok(await moveSealedPreferences(store, prefs, (key) => [key]))
  t.ok(
    (await readSealedPreference(store, 'askVaultThreads')).includes(`${SECRET} 4`),
    'latest kept'
  )
  t.ok((await readSealedPreference(store, 'askNoteThreads')).includes(SECRET))
  t.is(await prefs.get('askVaultThreads'), null)
  t.is(await prefs.get('askVaultThreads:vault-2'), null, 'scoped copies are dropped too')
  t.is(await prefs.get('selectedNote'), 'note-1', 'other preferences survive')

  await prefs.close()
  await store.close()
  t.is(filesContaining(dir, SECRET), 0, 'no plaintext left anywhere')
})

test('sealed preferences - nothing to move leaves the log alone', async (t) => {
  const { prefs, store } = await setup(t)
  await prefs.put('selectedNote', 'note-1')
  const length = prefs.bee.core.length
  t.absent(await moveSealedPreferences(store, prefs, (key) => [key]))
  t.is(prefs.bee.core.length, length)
})
