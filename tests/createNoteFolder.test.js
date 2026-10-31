import test from 'brittle'
import { runSaga, stdChannel } from 'redux-saga'

import { setRPC } from '../rpc.js'
import { ALL_NOTES_KEY, RECENTLY_DELETED_KEY } from '../constant.js'
import { watchNotesSaga } from '../store/sagas/notesSaga.js'
import { createNote } from '../store/slices/notesSlice.js'

class FakeStream {
  on() {}
  destroy() {}
}

const SETTLE_MS = 60
const DEBOUNCE_CLEAR_MS = 750

function foldersState(selectedFolder, folders, isLoading = false) {
  const folderKeys = folders.map((folder) => folder.key)
  const folderData = {}
  for (const folder of folders) {
    folderData[folder.key] = { title: folder.title, addedAt: 1, updatedAt: 1 }
  }
  return { folderKeys, folderData, selectedFolder, isLoading }
}

async function createNoteWith(folders) {
  const inserted = []
  const createdFolders = []
  setRPC({
    commandSubscribeNoteKeys: async () => new FakeStream(),
    commandSubscribeNote: async () => new FakeStream(),
    commandInsertNote: async (args) => {
      inserted.push(args)
      return { done: true, key: 'newnotekey' }
    },
    commandInsertFolder: async (args) => {
      createdFolders.push(args)
      return { done: true, key: 'createdfolderkey' }
    }
  })

  const channel = stdChannel()
  const state = { notes: { notesKeys: [], notesData: {} }, folders }

  const task = runSaga(
    {
      channel,
      dispatch: (action) => {
        if (action.type === 'folders/setSelectedFolder') {
          state.folders.selectedFolder = action.payload
        }
        channel.put(action)
      },
      getState: () => state
    },
    watchNotesSaga
  )

  channel.put(createNote({ title: '', note: '' }))
  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS))
  task.cancel()
  await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_CLEAR_MS))
  return { inserted, createdFolders, selectedFolder: state.folders.selectedFolder }
}

test('a note created inside a folder is stored in that folder', async (t) => {
  const { inserted } = await createNoteWith(
    foldersState('folderaaa', [{ key: 'folderaaa', title: 'Work' }])
  )

  t.is(inserted.length, 1, 'one note was inserted')
  t.is(inserted[0].folderKey, 'folderaaa', 'it carries the folder the user was in')
})

test('a selected folder that no longer exists never reaches the note', async (t) => {
  const { inserted, selectedFolder } = await createNoteWith(
    foldersState('deletedfolderkey', [{ key: 'realfolder', title: 'Untitled' }])
  )

  t.is(inserted.length, 1, 'one note was inserted')
  t.is(inserted[0].folderKey, 'realfolder', 'the note falls back to a folder that exists')
  t.is(selectedFolder, 'deletedfolderkey', 'creating a note never re-navigates the user')
})

test('the all-notes and trash sentinels are never stored as a folder', async (t) => {
  for (const sentinel of [ALL_NOTES_KEY, RECENTLY_DELETED_KEY, '']) {
    const { inserted } = await createNoteWith(
      foldersState(sentinel, [{ key: 'realfolder', title: 'Untitled' }])
    )
    t.is(inserted[0]?.folderKey, 'realfolder', `sentinel ${sentinel || 'empty'} falls back`)
  }
})

test('with no folder to fall back to, one is created', async (t) => {
  const { inserted, createdFolders } = await createNoteWith(foldersState(ALL_NOTES_KEY, []))

  t.is(createdFolders.length, 1, 'a default folder was created')
  t.is(inserted[0]?.folderKey, 'createdfolderkey', 'and the note goes into it')
})

test('a selection is trusted while the folder list is still loading', async (t) => {
  const { inserted } = await createNoteWith(foldersState('folderaaa', [], true))

  t.is(inserted[0]?.folderKey, 'folderaaa', 'no re-homing before folders have loaded')
})

test('creating from All Notes leaves the view on All Notes', async (t) => {
  const { inserted, selectedFolder } = await createNoteWith(
    foldersState(ALL_NOTES_KEY, [
      { key: 'untitledfolder', title: 'Untitled' },
      { key: 'workfolder', title: 'Work' }
    ])
  )

  t.is(inserted[0].folderKey, 'untitledfolder', 'the note is stored in the default folder')
  t.is(
    selectedFolder,
    ALL_NOTES_KEY,
    'but the selection stays on All Notes, so the list is not narrowed to one folder'
  )
})

test('creating inside a folder leaves that folder selected', async (t) => {
  const { inserted, selectedFolder } = await createNoteWith(
    foldersState('workfolder', [
      { key: 'untitledfolder', title: 'Untitled' },
      { key: 'workfolder', title: 'Work' }
    ])
  )

  t.is(inserted[0].folderKey, 'workfolder', 'the note lands in the folder the user is in')
  t.is(selectedFolder, 'workfolder', 'and the selection is untouched')
})
