import test from 'brittle'

import { ALL_NOTES_KEY } from '../constant.js'
import {
  getVaultAskSuggestions,
  getVaultDraft,
  getVaultDraftTarget,
  getVaultReminderTask,
  isVaultDraftRequest,
  vaultDraftHtml,
  vaultDraftNote,
  vaultDraftTitle
} from '../store/services/localAiVaultActions.js'
import { buildVaultAskMessages } from '../store/services/localAiVaultAsk.js'
import { taskDoneId } from '../store/services/noteTasks.js'

const notes = {
  a: { title: 'Lisbon trip', folderKey: 'travel', updatedAt: 3 },
  b: { title: 'Packing ideas', folderKey: 'travel', updatedAt: 2 },
  c: { title: 'Budget', folderKey: 'money', updatedAt: 1 },
  d: { title: 'Secret', folderKey: 'travel', updatedAt: 9, locked: true }
}
const folders = [
  { id: 'travel', name: 'Travel' },
  { id: 'money', name: 'Money' },
  { id: 'sys', name: 'Untitled', isSystem: true }
]

test('suggestions come from recent titles and the busiest folder', (t) => {
  t.alike(getVaultAskSuggestions({ notes, folders }), [
    { kind: 'note', title: 'Lisbon trip' },
    { kind: 'keyPoints', title: 'Packing ideas' },
    { kind: 'folder', folder: 'Travel' }
  ])
  t.alike(getVaultAskSuggestions({ notes, folders, scope: 'money' }), [
    { kind: 'note', title: 'Budget' },
    { kind: 'folder', folder: 'Money' }
  ])
  t.alike(getVaultAskSuggestions({ notes: {}, folders, scope: ALL_NOTES_KEY }), [])
})

test('reminder task is the earliest open future task in a cited note', (t) => {
  const tasks = [
    { noteKey: 'a', date: '2026-10-20', text: 'Flight' },
    { noteKey: 'a', date: '2026-10-15', text: 'Book' },
    { noteKey: 'a', date: '2026-10-01', text: 'Past' },
    { noteKey: 'b', date: '2026-10-12', text: 'Other note' }
  ]
  const today = '2026-10-11'
  t.is(getVaultReminderTask({ citedKeys: ['a'], tasks, today }).text, 'Book')
  const doneIds = new Set([taskDoneId(tasks[1])])
  t.is(getVaultReminderTask({ citedKeys: ['a'], tasks, doneIds, today }).text, 'Flight')
  t.is(getVaultReminderTask({ citedKeys: [], tasks, today }), null)
})

test('draft requests are told apart from questions', (t) => {
  t.ok(isVaultDraftRequest('Make a packing list from my Lisbon notes'))
  t.ok(isVaultDraftRequest('Can you create a checklist for the move?'))
  t.ok(isVaultDraftRequest('Write me a summary of the budget notes'))
  t.absent(isVaultDraftRequest('What did I write in my note about Lisbon?'))
  t.absent(isVaultDraftRequest('When is my flight?'))
  t.absent(isVaultDraftRequest('Write me what my notes say about Lisbon'))
  t.absent(isVaultDraftRequest('Make sure my notes list the dates'))
  t.absent(isVaultDraftRequest('Write about the hotel from my notes'))
  t.absent(isVaultDraftRequest('Make sure the flight is booked'))
})

test('draft title reads like a note title', (t) => {
  t.is(vaultDraftTitle('Make a packing list from my Lisbon notes'), 'Lisbon packing list')
  t.is(vaultDraftTitle('Make me a checklist for the Berlin move?'), 'Berlin move checklist')
  t.is(vaultDraftTitle('Create an agenda'), 'Agenda')
  t.is(vaultDraftTitle('Draft a plan for the trip to Lisbon in May'), 'Plan: trip to Lisbon in May')
})

test('draft items come from lines or one comma list', (t) => {
  const citations = [
    { n: 1, noteKey: 'a' },
    { n: 2, noteKey: 'b' }
  ]
  const lines = getVaultDraft({
    question: 'Make a packing list from my Lisbon notes',
    result: {
      answer: 'Here is your list:\n- Passport [1]\n- Sunscreen [2].\n2. Charger [1][2]',
      citations
    }
  })
  t.is(lines.title, 'Lisbon packing list')
  t.ok(lines.checklist)
  t.alike(
    lines.items.map((item) => [item.text, item.citations.map((c) => c.n)]),
    [
      ['Passport', [1]],
      ['Sunscreen', [2]],
      ['Charger', [1, 2]]
    ]
  )
  const split = getVaultDraft({
    question: 'Write an outline of the talk',
    result: { answer: 'Intro, the problem, our fix and next steps [1].', citations }
  })
  t.absent(split.checklist)
  t.alike(
    split.items.map((item) => item.text),
    ['Intro', 'the problem', 'our fix', 'next steps']
  )
  t.is(getVaultDraft({ question: 'When is my flight?', result: { answer: 'Monday [1]' } }), null)
})

test('draft html and note', (t) => {
  const draft = {
    title: 'Lisbon packing list',
    checklist: true,
    items: [{ text: 'Passport <id>', citations: [{ n: 1, noteKey: 'a' }] }]
  }
  const html = vaultDraftHtml(draft, { heading: true })
  t.ok(html.startsWith('<p><strong>Lisbon packing list'))
  t.ok(html.includes('data-type="taskItem" data-checked="false"><p>Passport &lt;id&gt;'))
  const note = vaultDraftNote({
    draft,
    sources: [
      { n: 1, noteKey: 'a', title: 'Lisbon trip' },
      { n: 2, noteKey: 'b', title: 'Unused' }
    ]
  })
  t.is(note.title, 'Lisbon packing list')
  t.ok(note.note.includes('Lisbon trip'))
  t.absent(note.note.includes('Unused'))
  t.absent(vaultDraftHtml({ ...draft, checklist: false }).includes('taskItem'))
})

test('add-to target skips the open note and locked notes', (t) => {
  const draft = {
    items: [
      {
        text: 'x',
        citations: [
          { n: 4, noteKey: 'd' },
          { n: 1, noteKey: 'a' }
        ]
      },
      { text: 'y', citations: [{ n: 2, noteKey: 'b' }] }
    ]
  }
  t.is(getVaultDraftTarget({ draft, notes }), 'a')
  t.is(getVaultDraftTarget({ draft, notes, openNoteKey: 'a' }), 'b')
  t.is(getVaultDraftTarget({ draft: { items: [] }, notes }), null)
})

test('only draft questions get the list rule', (t) => {
  const sources = [{ n: 1, noteKey: 'a', title: 'A', heading: '', text: 'x' }]
  const draft = buildVaultAskMessages({ question: 'Make a packing list', sources })
  const plain = buildVaultAskMessages({ question: 'When is my flight?', sources })
  t.ok(draft[0].content.includes('each item on its own line'))
  t.absent(plain[0].content.includes('each item on its own line'))
})
