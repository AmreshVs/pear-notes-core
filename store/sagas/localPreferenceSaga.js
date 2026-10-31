import { call, put, takeEvery, all } from 'redux-saga/effects'
import { backendApi } from '../../backend/api.js'
import { setSelectedFolder } from '../slices/foldersSlice.js'
import { setSelectedNote } from '../slices/notesSlice.js'
import * as log from '../../log.js'

function* saveSelectedFolderSaga(action) {
  try {
    yield call(backendApi.updatePreference, { key: 'selectedFolder', value: action.payload })
  } catch (error) {
    log.error('Error saving selected folder preference:', error)
  }
}

function* saveSelectedNoteSaga(action) {
  try {
    yield call(backendApi.updatePreference, { key: 'selectedNote', value: action.payload })
  } catch (error) {
    log.error('Error saving selected note preference:', error)
  }
}

export function* restoreSelectionsSaga() {
  try {
    const [savedFolder, savedNote] = yield all([
      call(backendApi.getPreference, { key: 'selectedFolder' }),
      call(backendApi.getPreference, { key: 'selectedNote' })
    ])

    if (savedFolder?.data) {
      yield put(setSelectedFolder(savedFolder.data))
    }
    if (savedNote?.data) {
      yield put(setSelectedNote(savedNote.data))
    }
  } catch (error) {
    log.error('Error restoring local selection preferences:', error)
  }
}

export function* watchLocalPreferenceSaga() {
  yield takeEvery(setSelectedFolder, saveSelectedFolderSaga)
  yield takeEvery(setSelectedNote, saveSelectedNoteSaga)
}
