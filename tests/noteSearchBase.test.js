import test from 'brittle'
import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'
import NoteBase from '../backend/NoteBase.js'
import { NoteSearchIndex } from '../backend/noteSearch.js'
import { withTestnet } from './helpers/testnet.js'

const encryption = b4a.toString(b4a.alloc(32).fill('search-test-key'), 'hex')
const FOLDER = 'folder-search'

const keys = (found) => found.results.map((r) => r.key).sort()

async function putNote(base, key, title, html, version = 0) {
  const now = Date.now()
  await base.addNote({
    key,
    value: { title, note: html, folderKey: FOLDER, addedAt: now, updatedAt: now + version }
  })
}

test('the index follows the reads the note list already makes', async (t) => {
  await withTestnet(t)
  const storage = path.join(tmpdir(), 'pear-notes-search-' + Math.random().toString(36).slice(2))
  const base = new NoteBase({ storage, encryption })
  await base.ready()
  t.teardown(async () => {
    await base.destroy().catch(() => {})
    fs.rmSync(storage, { recursive: true, force: true })
  })

  const index = new NoteSearchIndex()
  base.on('notes-read', (notes) => index.sync(notes))
  base.on('vault-closed', () => index.clear())

  await putNote(base, 'a', 'Pasta', '<p>two cloves of garlic</p>')
  await putNote(base, 'b', 'Groceries', '<p>milk, eggs</p>')
  await index.ensureWarm(() => base.getAllNotes())
  t.alike(keys(index.search({ query: 'garlic' })), ['a'])

  await putNote(base, 'b', 'Groceries', '<p>milk, eggs, garlic</p>', 1)
  t.alike(keys(index.search({ query: 'garlic' })), ['a'], 'no read yet, so no new work')
  await base.getAllNotes()
  t.alike(keys(index.search({ query: 'garlic' })), ['a', 'b'])

  await base.deleteNoteWithMedia('a')
  await base.getAllNotes()
  t.alike(keys(index.search({ query: 'garlic' })), ['b'])
})
