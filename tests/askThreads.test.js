import test from 'brittle'

import {
  ASK_NOTE_THREADS_MAX,
  askNoteThreadFromTurns,
  askThreadFromTurns,
  clearAskNoteThread,
  deleteAskThread,
  loadAskNoteThread,
  loadAskNoteThreads,
  parseAskNoteThreads,
  saveAskNoteThread,
  upsertAskNoteThread,
  loadAskThreads,
  loadVisibleAskThreads,
  parseAskThreads,
  saveAskThread,
  upsertAskThread
} from '../store/services/askThreads.js'

const turn = (question, noteKey = 'a') => ({
  id: 1,
  question,
  status: 'done',
  result: { kind: 'answer', answer: 'Monday [1]', citations: [{ n: 1, noteKey }], verified: true },
  sources: [{ n: 1, noteKey, title: 'Trip', heading: '', text: 'secret excerpt' }]
})

const memoryApi = () => {
  const prefs = {}
  return {
    prefs,
    getPreference: async ({ key }) => prefs[key] ?? null,
    updatePreference: async ({ key, value }) => {
      if (typeof value !== 'string') throw new Error('preference values are strings')
      prefs[key] = value
    }
  }
}

test('a saved thread keeps answers but not note excerpts', (t) => {
  const thread = askThreadFromTurns({
    id: 'x',
    turns: [turn('When do I fly?'), { id: 2, question: 'q', status: 'working' }],
    now: 5
  })
  t.is(thread.title, 'When do I fly?')
  t.is(thread.turns.length, 1)
  t.absent(JSON.stringify(thread).includes('secret excerpt'))
  t.is(askThreadFromTurns({ id: 'y', turns: [] }), null)
  t.alike(parseAskThreads('nope'), [])
})

test('threads upsert newest first, delete, and drop locked citations', async (t) => {
  const api = memoryApi()
  await saveAskThread(api, { ...askThreadFromTurns({ id: 'a', turns: [turn('one')], now: 1 }) })
  await saveAskThread(api, askThreadFromTurns({ id: 'b', turns: [turn('two', 'b')], now: 2 }))
  await saveAskThread(api, askThreadFromTurns({ id: 'a', turns: [turn('one')], now: 3 }))
  t.alike(
    (await loadAskThreads(api)).map((thread) => thread.id),
    ['a', 'b']
  )
  const visible = await loadVisibleAskThreads(api, (key) => key === 'b')
  t.alike(
    visible.map((thread) => thread.id),
    ['a']
  )
  t.alike(
    (await loadAskThreads(api)).map((thread) => thread.id),
    ['a'],
    'the locked thread is removed from disk'
  )
  await deleteAskThread(api, 'a')
  t.alike(await loadAskThreads(api), [])
  t.is(
    upsertAskThread(
      new Array(40).fill(0).map((_, i) => ({ id: i, updatedAt: i })),
      { id: 'n', updatedAt: 99 }
    ).length,
    30
  )
})

const noteTurn = (question, extra = {}) => ({
  id: 3,
  question,
  status: 'done',
  scope: 'note',
  kind: 'answer',
  answer: 'At 7pm.',
  error: null,
  reply: '{"kind":"answer"}',
  edits: [],
  diff: null,
  editedText: null,
  applied: false,
  ...extra
})

test('an in-note thread keeps answers, never edit text, and reopens read-only', async (t) => {
  const api = memoryApi()
  const thread = askNoteThreadFromTurns({
    noteKey: 'n1',
    turns: [
      noteTurn('When is dinner?'),
      noteTurn('Fix the typo', {
        kind: 'edits',
        answer: '',
        edits: [{ find: 'teh', replace: 'the' }],
        diff: [{ type: 'insert', text: 'secret note text' }],
        editedText: 'secret note text',
        applied: true
      }),
      { id: 9, question: 'pending', status: 'working' }
    ],
    now: 1
  })
  t.is(thread.turns.length, 2)
  await saveAskNoteThread(api, thread)
  t.absent(api.prefs.askNoteThreads.includes('secret'), 'no copy of the note is saved')
  const turns = await loadAskNoteThread(api, 'n1')
  t.alike(
    turns.map((item) => [item.question, item.kind, item.applied, item.readOnly, item.editedText]),
    [
      ['When is dinner?', 'answer', false, true, null],
      ['Fix the typo', 'edits', true, true, null]
    ]
  )
  t.absent('reply' in turns[0], 'saved turns stay out of the model history')
  t.alike(await loadAskNoteThread(api, 'other'), [])
  await clearAskNoteThread(api, 'n1')
  t.alike(await loadAskNoteThread(api, 'n1'), [])
})

test('locked notes never keep an in-note thread', async (t) => {
  const api = memoryApi()
  const locked = new Set(['secret'])
  const isLocked = (key) => locked.has(key)
  const thread = (noteKey) => askNoteThreadFromTurns({ noteKey, turns: [noteTurn('q')] })
  await saveAskNoteThread(api, thread('secret'), isLocked)
  t.alike(await loadAskNoteThreads(api), [], 'not saved while locked')
  await saveAskNoteThread(api, thread('open'))
  locked.add('open')
  t.alike(await loadAskNoteThread(api, 'open', isLocked), [], 'locked since: hidden')
  t.alike(await loadAskNoteThreads(api), [], 'and removed from disk')
})

test('in-note threads keep the most recent notes only', async (t) => {
  let threads = []
  for (let i = 0; i < ASK_NOTE_THREADS_MAX + 5; i++) {
    threads = upsertAskNoteThread(
      threads,
      askNoteThreadFromTurns({ noteKey: `n${i}`, turns: [noteTurn('q')], now: i })
    )
  }
  t.is(threads.length, ASK_NOTE_THREADS_MAX)
  t.is(threads[0].noteKey, `n${ASK_NOTE_THREADS_MAX + 4}`)
  t.is(askNoteThreadFromTurns({ noteKey: 'n', turns: [] }), null)
  t.alike(parseAskNoteThreads('nope'), [])
})
