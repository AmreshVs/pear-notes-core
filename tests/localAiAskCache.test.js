import test from 'brittle'

import { RECENTLY_DELETED_KEY } from '../constant.js'
import { clearsAskCache } from '../store/sagas/localAiAskCacheSaga.js'
import { deleteNote, moveNotes, updateNote } from '../store/slices/notesSlice.js'
import { switchVault } from '../store/slices/vaultsSlice.js'

test('Ask caches are dropped when a note is locked, trashed, deleted or the vault changes', (t) => {
  t.ok(clearsAskCache(updateNote({ key: 'a', locked: true })))
  t.ok(clearsAskCache(updateNote({ key: 'a', folderKey: RECENTLY_DELETED_KEY })))
  t.ok(clearsAskCache(moveNotes({ keys: ['a'], folderKey: RECENTLY_DELETED_KEY })))
  t.ok(clearsAskCache(deleteNote('a')))
  t.ok(clearsAskCache(switchVault('v2')))
  t.absent(clearsAskCache(updateNote({ key: 'a', note: '<p>hi</p>', fromEditor: true })))
  t.absent(clearsAskCache(updateNote({ key: 'a', locked: false })))
  t.absent(clearsAskCache(moveNotes({ keys: ['a'], folderKey: 'work' })))
})
