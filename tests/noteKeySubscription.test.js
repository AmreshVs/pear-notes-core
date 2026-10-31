import test from 'brittle'
import { runSaga, stdChannel } from 'redux-saga'

import { setRPC } from '../rpc.js'
import { watchNotesSaga } from '../store/sagas/notesSaga.js'
import { subscribeAllNoteKeys } from '../store/slices/notesSlice.js'

class FakeStream {
  constructor() {
    this.handlers = {}
  }

  on(event, handler) {
    this.handlers[event] = handler
  }

  emit(event, payload) {
    this.handlers[event]?.(payload)
  }

  destroy() {
    this.emit('close')
  }
}

function runNoteKeysSaga(initialKeys) {
  const stream = new FakeStream()
  setRPC({
    commandSubscribeNoteKeys: async () => stream,
    commandSubscribeNote: async () => new FakeStream()
  })

  const channel = stdChannel()
  const dispatched = []
  let noteKeys = initialKeys

  const task = runSaga(
    {
      channel,
      dispatch: (action) => {
        dispatched.push(action)
        if (action.type === 'notes/setNoteKeys') noteKeys = action.payload
        channel.put(action)
      },
      getState: () => ({ notes: { notesKeys: noteKeys, notesData: {} } })
    },
    watchNotesSaga
  )

  channel.put(subscribeAllNoteKeys())
  return { stream, dispatched, task, getKeys: () => noteKeys }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

test('note keys - a key appended after the known ones still reaches the store', async (t) => {
  const { stream, task, getKeys } = runNoteKeysSaga(['a', 'b'])
  await settle()

  stream.emit('data', { data: ['a', 'b', 'c'] })
  await settle()

  t.alike(getKeys(), ['a', 'b', 'c'], 'the older replicated note is not dropped')
  task.cancel()
})

test('note keys - an unchanged list is not re-dispatched', async (t) => {
  const { stream, dispatched, task } = runNoteKeysSaga(['a', 'b'])
  await settle()

  stream.emit('data', { data: ['a', 'b'] })
  await settle()

  t.absent(
    dispatched.some((action) => action.type === 'notes/setNoteKeys'),
    'identical key lists are ignored'
  )
  task.cancel()
})
