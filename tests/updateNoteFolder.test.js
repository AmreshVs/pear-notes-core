import test from 'brittle'
import { runSaga, stdChannel } from 'redux-saga'

import { decode, encode } from '../spec/hyperschema/index.js'
import { setRPC } from '../rpc.js'
import { watchNotesSaga } from '../store/sagas/notesSaga.js'
import { updateNote, flushNoteSaves } from '../store/slices/notesSlice.js'

const UPDATE_REQUEST = '@notes/command-update-note-request'
const roundTrip = (value) => decode(UPDATE_REQUEST, encode(UPDATE_REQUEST, value))

class FakeStream {
  on() {}
  destroy() {}
}

const SETTLE_MS = 60

async function editNote({ notesData, stored }) {
  const sent = []
  setRPC({
    commandSubscribeNoteKeys: async () => new FakeStream(),
    commandSubscribeNote: async () => new FakeStream(),
    commandGetSingleNote: async ({ key }) => ({ data: stored || {}, key }),
    commandUpdateNote: async (args) => {
      sent.push(args)
      return { done: true }
    }
  })

  const channel = stdChannel()
  const state = {
    notes: { notesKeys: ['n1'], notesData },
    folders: { folderKeys: [], folderData: {}, selectedFolder: '', isLoading: false },
    editor: { baseKey: 'n1', conflict: null }
  }

  const task = runSaga(
    { channel, dispatch: (action) => channel.put(action), getState: () => state },
    watchNotesSaga
  )

  channel.put(updateNote({ key: 'n1', title: 'Typed', note: '<p>body</p>', fromEditor: true }))
  channel.put(flushNoteSaves())
  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS))
  task.cancel()
  return sent
}

test('an omitted folderKey comes back as null, never undefined', (t) => {
  const decoded = roundTrip({ key: 'n1', title: 'T', note: '<p>b</p>' })

  t.is(decoded.folderKey, null, 'absent optional strings decode as null')
  t.not(decoded.folderKey, undefined, 'so an undefined-guard on the receiving side does not fire')
  t.is(roundTrip({ key: 'n1', title: 'T', note: '', folderKey: '' }).folderKey, null, 'as does ""')
  t.is(
    roundTrip({ key: 'n1', title: 'T', note: '', folderKey: 'f1' }).folderKey,
    'f1',
    'a real key survives'
  )
})

test('editing a note whose data has not reached the store keeps its folder', async (t) => {
  const sent = await editNote({
    notesData: {},
    stored: { title: '', note: '', folderKey: 'workfolder', locked: false, pinned: true }
  })

  t.is(sent.length, 1, 'one update was sent')
  t.is(sent[0].folderKey, 'workfolder', 'the stored folder is carried, not dropped')
  t.is(sent[0].pinned, true, 'and the pinned flag survives the same window')
})

test('a note already in the store is unaffected', async (t) => {
  const sent = await editNote({
    notesData: {
      n1: { title: '', note: '', folderKey: 'homefolder', locked: false, pinned: false }
    },
    stored: { title: '', note: '', folderKey: 'shouldnotbeused' }
  })

  t.is(sent.length, 1, 'one update was sent')
  t.is(sent[0].folderKey, 'homefolder', 'the store value wins when it is present')
})

test('notesApi.updateNote treats a null folderKey as "keep what is stored"', (t) => {
  const noteFromDb = { folderKey: 'workfolder', addedAt: 1, locked: true, pinned: true }
  const resolve = (folderKey) => {
    const carries = folderKey !== undefined && folderKey !== null && folderKey !== ''
    return carries ? folderKey : noteFromDb.folderKey
  }

  t.is(resolve(null), 'workfolder', 'a null off the wire does not clear the folder')
  t.is(resolve(undefined), 'workfolder', 'nor does undefined')
  t.is(resolve(''), 'workfolder', 'nor an empty string')
  t.is(resolve('other'), 'other', 'a real move still works')
})
