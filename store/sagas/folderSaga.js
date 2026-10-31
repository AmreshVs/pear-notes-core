import { call, delay, put, race, takeEvery, takeLatest, take, all, select } from 'redux-saga/effects'
import {
  setLoading,
  createFolder,
  deleteFolder,
  subscribeAllFolderKeys,
  setFolderKeys,
  subscribeAllFolders,
  setFolderData,
  setFoldersData,
  updateFolder,
  getFolderKeys,
  getFoldersData,
  getSelectedFolder,
  setSelectedFolder
} from '../slices/foldersSlice.js'
import { backendApi } from '../../backend/api.js'
import { apiSubscribeCall, forkItemSubscriptions } from './utils.js'
import { ALL_NOTES_KEY } from '../../constant.js'

import { getNotes } from '../slices/notesSlice.js'
import * as log from '../../log.js'

const CREATE_DEBOUNCE_MS = 700
const FOLDER_SEED_TIMEOUT_MS = 2000
let isCreatingFolder = false
let lastFolderCreatedAt = 0

function checkDataOrder(prevData, newData) {
  if (prevData.length === 0) return false
  if (prevData.length !== newData.length) return false
  for (let i = 0; i < prevData.length; i++) {
    if (prevData[i] !== newData[i]) {
      return false
    }
  }
  return true
}

function* createFolderSaga({ payload: { name, icon } }) {
  const now = Date.now()
  if (isCreatingFolder || now - lastFolderCreatedAt < CREATE_DEBOUNCE_MS) return
  isCreatingFolder = true
  lastFolderCreatedAt = now
  try {
    yield call(backendApi.insertFolder, { title: name, icon })
  } catch (error) {
    log.error('Error in createFolderSaga:', error)
  } finally {
    isCreatingFolder = false
    lastFolderCreatedAt = Date.now()
  }
}

function* updateFolderSaga({ payload: { id, name, icon } }) {
  try {
    const data = yield select(getFoldersData)
    const title = name === undefined ? data?.[id]?.title || '' : name
    yield call(backendApi.updateFolder, { key: id, title, icon })
  } catch (error) {
    log.error('Error in updateFolderSaga:', error)
  }
}

function* deleteFolderSaga({ payload: key }) {
  try {
    if (!key) return
    const allNotes = yield select(getNotes)
    const folderNotes = allNotes.filter((n) => n.value?.folderKey === key)

    if (folderNotes.length > 0) {
      yield all(folderNotes.map((note) => call(backendApi.trashNote, note.key)))
    }

    yield call(backendApi.deleteFolder, key)

    const selectedFolder = yield select(getSelectedFolder)
    if (selectedFolder === key) yield put(setSelectedFolder(ALL_NOTES_KEY))
  } catch (error) {
    log.error('Error in deleteFolderSaga:', error)
  }
}

function* seedFolderData() {
  try {
    const { result } = yield race({
      result: call(backendApi.getAllFolders),
      timeout: delay(FOLDER_SEED_TIMEOUT_MS)
    })
    if (!result) return
    const { data } = result
    const known = yield select(getFoldersData)
    const seeded = {}
    for (const entry of data || []) {
      if (entry.key && entry.value && !known[entry.key]) seeded[entry.key] = entry.value
    }
    if (Object.keys(seeded).length > 0) yield put(setFoldersData(seeded))
  } catch (error) {
    log.error('Error seeding folder data:', error)
  }
}

function* subscribeAllFolderKeysSaga() {
  try {
    yield call(seedFolderData)
    yield apiSubscribeCall(
      backendApi.subscribeFolders,
      function* ({ data }) {
        const folderKeys = yield select(getFolderKeys)
        if (checkDataOrder(folderKeys, data)) {
          return
        }
        yield put(setFolderKeys(data))
        yield put(setLoading(false))
      },
      { retry: true }
    )
  } catch (error) {
    log.error('Error in subscribeAllFolderKeysSaga:', error)
  }
}

function* subscribeFolder(key) {
  try {
    return yield apiSubscribeCall(
      () => backendApi.subscribeFolder({ key }),
      function* ({ data }) {
        yield put(setFolderData({ key, data }))
      },
      { retry: true }
    )
  } catch (error) {
    log.error('Error in subscribeFolder:', error)
  }
}

function* subscribeAllFoldersSaga() {
  try {
    const folderTasks = {}

    const initialKeys = yield select(getFolderKeys)
    if (initialKeys?.length > 0) {
      yield* forkItemSubscriptions(folderTasks, initialKeys, subscribeFolder)
    }

    while (true) {
      const action = yield take(setFolderKeys)
      const keys = action.payload
      yield* forkItemSubscriptions(folderTasks, keys, subscribeFolder)
    }
  } catch (error) {
    log.error('Error in subscribeAllFoldersSaga:', error)
  }
}

export function* watchFolderSaga() {
  yield takeEvery(createFolder, createFolderSaga)
  yield takeEvery(updateFolder, updateFolderSaga)
  yield takeEvery(deleteFolder, deleteFolderSaga)
  yield takeLatest(subscribeAllFolderKeys, subscribeAllFolderKeysSaga)
  yield takeLatest(subscribeAllFolders, subscribeAllFoldersSaga)
}
