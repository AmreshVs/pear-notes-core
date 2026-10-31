import test from 'brittle'
import { runSaga, stdChannel } from 'redux-saga'

import { setRPC } from '../rpc.js'
import { watchNotesSaga } from '../store/sagas/notesSaga.js'
import { setNoteKeys, subscribeAllNoteKeys, subscribeAllNotes } from '../store/slices/notesSlice.js'

class FakeStream {
  constructor(name) {
    this.name = name
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

const settle = () => new Promise((resolve) => setTimeout(resolve, 30))

function harness(initialKeys) {
  const keyStreams = []
  const noteStreams = {}
  setRPC({
    commandSubscribeNoteKeys: async () => {
      const s = new FakeStream('keys')
      keyStreams.push(s)
      return s
    },
    commandSubscribeNote: async ({ key }) => {
      const s = new FakeStream('note:' + key)
      noteStreams[key] = noteStreams[key] || []
      noteStreams[key].push(s)
      return s
    }
  })

  const channel = stdChannel()
  const state = { notes: { notesKeys: initialKeys, notesData: {} } }
  const dispatched = []

  const task = runSaga(
    {
      channel,
      dispatch: (action) => {
        dispatched.push(action)
        if (action.type === 'notes/setNoteKeys') state.notes.notesKeys = action.payload
        if (action.type === 'notes/setNotesDataBatch') {
          for (const { key, data } of action.payload) {
            state.notes.notesData = { ...state.notes.notesData, [key]: data }
          }
        }
        if (action.type === 'notes/setNoteData') {
          state.notes.notesData = {
            ...state.notes.notesData,
            [action.payload.key]: action.payload.data
          }
        }
        channel.put(action)
      },
      getState: () => state
    },
    watchNotesSaga
  )

  return { channel, keyStreams, noteStreams, state, dispatched, task }
}

test('a newly created note gets a body subscription and its content reaches the store', async (t) => {
  const h = harness([])
  h.channel.put(subscribeAllNoteKeys())
  h.channel.put(subscribeAllNotes())
  await settle()

  h.keyStreams[0].emit('data', { data: ['newnote'] })
  await settle()

  t.ok(h.noteStreams.newnote?.length, 'a body subscription was opened for the new key')

  h.noteStreams.newnote[0].emit('data', {
    data: { title: 'Hi', note: '<p>body</p>', updatedAt: 2 }
  })
  await settle()

  t.is(h.state.notes.notesData.newnote?.note, '<p>body</p>', 'the body reached the store')
  h.task.cancel()
})

test('after a resync the body subscriptions are re-established', async (t) => {
  const h = harness([])
  h.channel.put(subscribeAllNoteKeys())
  h.channel.put(subscribeAllNotes())
  await settle()

  h.keyStreams[0].emit('data', { data: ['n1'] })
  await settle()
  h.noteStreams.n1[0].emit('data', { data: { title: 'One', note: '<p>1</p>', updatedAt: 1 } })
  await settle()

  h.channel.put(subscribeAllNoteKeys())
  h.channel.put(subscribeAllNotes())
  await settle()

  t.is(h.keyStreams.length, 2, 'the key stream was re-opened')
  t.ok(h.noteStreams.n1.length >= 2, 'the body subscription for the existing note was re-opened')

  const latest = h.keyStreams[h.keyStreams.length - 1]
  latest.emit('data', { data: ['n2', 'n1'] })
  await settle()

  t.ok(h.noteStreams.n2?.length, 'a note created after the resync still gets a body subscription')
  h.noteStreams.n2[0].emit('data', { data: { title: 'Two', note: '<p>2</p>', updatedAt: 2 } })
  await settle()
  t.is(h.state.notes.notesData.n2?.note, '<p>2</p>', 'and its content reaches the store')
  h.task.cancel()
})

test('the subscription manager keeps accepting keys batch after batch', async (t) => {
  const h = harness(['n1'])
  h.channel.put(subscribeAllNotes())
  await settle()

  t.is(h.noteStreams.n1?.length, 1, 'the initial pass subscribed the existing note')

  h.channel.put(setNoteKeys(['n2', 'n1']))
  await settle()
  t.is(h.noteStreams.n2?.length, 1, 'a key arriving after a non-empty initial pass is picked up')

  h.channel.put(setNoteKeys(['n3', 'n2', 'n1']))
  await settle()
  t.is(h.noteStreams.n3?.length, 1, 'and so is the next one')

  t.is(h.noteStreams.n1.length, 1, 'already-subscribed keys are not re-forked')
  h.task.cancel()
})
