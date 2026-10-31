import test from 'brittle'

import {
  buildNoteTaskMessages,
  getLanguageInstruction,
  NOTE_TASK,
  parseKeyPointsOutput,
  parseTitleOutput,
  TITLE_MAX_CHARS
} from '../store/services/localAiPrompts.js'

test('buildNoteTaskMessages uses a prompt per task and disables thinking', (t) => {
  const title = buildNoteTaskMessages(NOTE_TASK.TITLE, 'Groceries for the weekend')
  t.ok(title[0].content.includes('titles'))
  t.ok(title[1].content.endsWith('/no_think'))
  const points = buildNoteTaskMessages(NOTE_TASK.KEY_POINTS, 'Plan')
  t.ok(points[0].content.includes('main points'))
})

test('note task prompts name the detected note language', (t) => {
  const spanish =
    'Reunión con el equipo el martes. María preparará las pantallas y Juan revisará los textos.'
  t.is(
    getLanguageInstruction(spanish),
    'The text is written in Spanish. Write your whole reply in Spanish.'
  )
  t.ok(buildNoteTaskMessages(NOTE_TASK.NOTE_SUMMARY, spanish)[0].content.includes('in Spanish'))
  t.ok(buildNoteTaskMessages(NOTE_TASK.KEY_POINTS, 'Plan')[0].content.includes('same language'))
  t.absent(buildNoteTaskMessages(NOTE_TASK.TITLE, spanish)[0].content.includes('{{language}}'))
})

test('parseTitleOutput keeps a clean single line', (t) => {
  t.is(
    parseTitleOutput('<think>hmm</think>\nTitle: "Weekend grocery plan."'),
    'Weekend grocery plan'
  )
  t.is(parseTitleOutput('\n\n**Trip to Lisbon**\nextra'), 'Trip to Lisbon')
  t.is(parseTitleOutput('x'.repeat(200)).length, TITLE_MAX_CHARS)
})

test('parseKeyPointsOutput strips list markers and empty lines', (t) => {
  t.alike(parseKeyPointsOutput('- Book flights\n\n2. Pack light\n• Call Sam'), [
    'Book flights',
    'Pack light',
    'Call Sam'
  ])
})
