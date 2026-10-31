import test from 'brittle'
import { encode, decode } from '../spec/hyperschema/index.js'

function roundTrip(name, value) {
  return decode(name, encode(name, value))
}

test('locked flag round-trips through note-schema', (t) => {
  const locked = roundTrip('@notes/note-schema', {
    title: 'T',
    note: 'N',
    folderKey: 'F',
    addedAt: 1,
    updatedAt: 2,
    locked: true
  })
  t.is(locked.locked, true, 'note-schema preserves locked=true')

  const unlocked = roundTrip('@notes/note-schema', {
    title: 'T',
    note: 'N',
    folderKey: 'F',
    addedAt: 1,
    updatedAt: 2,
    locked: false
  })
  t.is(unlocked.locked, false, 'note-schema decodes locked=false')
})

test('locked flag round-trips through insert/update note requests', (t) => {
  const update = roundTrip('@notes/command-update-note-request', {
    key: 'k',
    title: 'T',
    note: 'N',
    folderKey: 'F',
    locked: true
  })
  t.is(update.locked, true, 'update-note-request preserves locked=true')

  const insert = roundTrip('@notes/command-insert-note-request', {
    title: 'T',
    note: 'N',
    folderKey: 'F',
    locked: true
  })
  t.is(insert.locked, true, 'insert-note-request preserves locked=true')
})

test('legacy notes without locked decode as false-ish', (t) => {
  const legacy = roundTrip('@notes/note-schema', {
    title: 'T',
    note: 'N',
    folderKey: 'F',
    addedAt: 1,
    updatedAt: 2
  })
  t.absent(legacy.locked, 'missing locked decodes as falsy for old notes')
})
