import { END, eventChannel } from 'redux-saga'
import { call, delay, fork, race, take } from 'redux-saga/effects'
import * as log from '../../log.js'

const STREAM_CLOSED = Symbol('stream-closed')
const SUBSCRIBE_SETUP_TIMEOUT_MS = 30000
const SUBSCRIBE_RETRY_BASE_MS = 2000
const SUBSCRIBE_RETRY_MAX_MS = 30000

let vaultEpoch = 0

// Streams opened before a vault switch must not write into the next vault's state.
export function nextVaultEpoch() {
  vaultEpoch++
}

// The backend worklet restarts on restore, clear storage and reload; every open stream then fails this way.
export function isChannelClosed(e) {
  return e?.code === 'CHANNEL_CLOSED'
}

export function* apiSubscribeCall(api, cb, options = {}) {
  const { retry = false } = options
  let attempt = 0

  while (true) {
    let streamChannel = null

    try {
      const { stream } = yield race({
        stream: call(api),
        timeout: delay(SUBSCRIBE_SETUP_TIMEOUT_MS)
      })
      if (!stream) throw new Error('SUBSCRIBE_SETUP_TIMEOUT')

      attempt = 0
      const epoch = vaultEpoch
      streamChannel = eventChannel((emitter) => {
        stream.on('data', (data) => {
          emitter(data)
        })
        stream.on('error', (e) => {
          if (isChannelClosed(e)) return
          log.error('stream emitter error', e)
        })
        stream.on('close', () => {
          emitter(STREAM_CLOSED)
        })
        return () => {
          stream.destroy()
        }
      })

      while (true) {
        const data = yield take(streamChannel)
        if (data === STREAM_CLOSED || data === END) break
        if (epoch !== vaultEpoch) break
        yield cb(data)
      }
    } catch (e) {
      log.error('apiSubscribeCall', e)
    } finally {
      streamChannel?.close()
    }

    if (!retry) return

    attempt++
    yield delay(Math.min(SUBSCRIBE_RETRY_BASE_MS * attempt, SUBSCRIBE_RETRY_MAX_MS))
  }
}

export function* forkItemSubscriptions(tasks, keys, subscribe) {
  for (const key of keys || []) {
    if (tasks[key] && tasks[key].isRunning()) continue
    tasks[key] = yield fork(subscribe, key)
  }
}
