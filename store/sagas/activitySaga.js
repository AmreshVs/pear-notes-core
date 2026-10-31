import { call, put, race, select, take, takeEvery, takeLatest } from 'redux-saga/effects'
import { backendApi } from '../../backend/api.js'
import { ACTIVITY_PAGE_SIZE } from '../../constant.js'
import {
  clearActivity,
  fetchActivity,
  fetchActivityDiff,
  fetchActivityStats,
  fetchMoreActivity,
  fetchNoteActivity,
  getActivityCursor,
  getActivityDeviceFilter,
  getActivityFilter,
  recoverDiscardedWrite,
  setActivityClearing,
  setActivityDiff,
  setActivityEntries,
  setActivityError,
  setActivityLoading,
  setActivityLoadingMore,
  setActivityRecovering,
  setActivityStats,
  setNoteActivityEntries,
  subscribeActivity,
  unsubscribeActivity
} from '../slices/activitySlice.js'
import { apiSubscribeCall } from './utils.js'
import * as log from '../../log.js'

function* handleFetchActivity() {
  try {
    yield put(setActivityLoading(true))
    const filter = yield select(getActivityFilter)
    const deviceKey = yield select(getActivityDeviceFilter)
    const result = yield call(backendApi.getActivity, {
      filter,
      deviceKey,
      limit: ACTIVITY_PAGE_SIZE
    })
    yield put(
      setActivityEntries({
        entries: result.entries,
        cursor: result.cursor,
        hasMore: result.hasMore,
        append: false
      })
    )
  } catch (error) {
    log.error('Error in handleFetchActivity:', error)
    yield put(setActivityError(error.message))
  }
}

function* handleFetchMoreActivity() {
  try {
    const cursor = yield select(getActivityCursor)
    if (!cursor) return
    yield put(setActivityLoadingMore(true))
    const filter = yield select(getActivityFilter)
    const deviceKey = yield select(getActivityDeviceFilter)
    const result = yield call(backendApi.getActivity, {
      filter,
      deviceKey,
      cursor,
      limit: ACTIVITY_PAGE_SIZE
    })
    yield put(
      setActivityEntries({
        entries: result.entries,
        cursor: result.cursor,
        hasMore: result.hasMore,
        append: true
      })
    )
  } catch (error) {
    log.error('Error in handleFetchMoreActivity:', error)
    yield put(setActivityError(error.message))
  }
}

function* handleFetchNoteActivity({ payload: { noteKey } }) {
  try {
    if (!noteKey) return
    yield put(setActivityLoading(true))
    const result = yield call(backendApi.getActivity, { noteKey, limit: ACTIVITY_PAGE_SIZE })
    yield put(setNoteActivityEntries({ noteKey, entries: result.entries }))
  } catch (error) {
    log.error('Error in handleFetchNoteActivity:', error)
    yield put(setActivityError(error.message))
  }
}

function* handleFetchActivityDiff({ payload: { id } }) {
  try {
    if (!id) return
    const data = yield call(backendApi.getActivityDiff, { id })
    yield put(setActivityDiff({ id, data }))
  } catch (error) {
    log.error('Error in handleFetchActivityDiff:', error)
    yield put(setActivityError(error.message))
  }
}

function* handleRecoverDiscardedWrite({ payload: { id } }) {
  try {
    if (!id) return
    yield put(setActivityRecovering({ id, value: true }))
    const result = yield call(backendApi.recoverDiscardedNoteWrite, { id })
    if (result?.done) {
      yield put(fetchActivity())
      if (result.noteKey) yield put(fetchNoteActivity(result.noteKey))
    }
  } catch (error) {
    log.error('Error in handleRecoverDiscardedWrite:', error)
    yield put(setActivityError(error.message))
  } finally {
    yield put(setActivityRecovering({ id, value: false }))
  }
}

function* handleFetchActivityStats() {
  try {
    const stats = yield call(backendApi.getActivityStats)
    yield put(setActivityStats(stats))
  } catch (error) {
    log.error('Error in handleFetchActivityStats:', error)
  }
}

function* handleClearActivity() {
  try {
    yield put(setActivityClearing(true))
    yield call(backendApi.clearActivity)
    yield put(setActivityEntries({ entries: [], cursor: '', hasMore: false, append: false }))
    yield put(setActivityStats({ count: 0, bytes: 0, oldestAt: 0 }))
  } catch (error) {
    log.error('Error in handleClearActivity:', error)
    yield put(setActivityError(error.message))
  } finally {
    yield put(setActivityClearing(false))
  }
}

function* handleSubscribeActivity() {
  try {
    yield race({
      stream: call(apiSubscribeCall, backendApi.subscribeActivity, function* () {
        yield put(fetchActivity())
        yield put(fetchActivityStats())
      }),
      cancelled: take(unsubscribeActivity)
    })
  } catch (error) {
    log.error('Error in handleSubscribeActivity:', error)
  }
}

export function* watchActivitySaga() {
  yield takeLatest(fetchActivity, handleFetchActivity)
  yield takeLatest(fetchMoreActivity, handleFetchMoreActivity)
  yield takeLatest(fetchNoteActivity, handleFetchNoteActivity)
  yield takeEvery(fetchActivityDiff, handleFetchActivityDiff)
  yield takeLatest(fetchActivityStats, handleFetchActivityStats)
  yield takeEvery(recoverDiscardedWrite, handleRecoverDiscardedWrite)
  yield takeLatest(clearActivity, handleClearActivity)
  yield takeLatest(subscribeActivity, handleSubscribeActivity)
}
