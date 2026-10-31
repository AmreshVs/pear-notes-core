import test from 'brittle'

import { NOTE_TASK } from '../store/services/localAiPrompts.js'
import {
  buildGenerateInput,
  buildGeneratedNote,
  generatedToHtml
} from '../store/services/noteGenerate.js'

test('every selected note gets a share of the input', (t) => {
  const input = buildGenerateInput(
    [
      { title: 'Long', note: `<p>${'a'.repeat(9000)}</p>` },
      { title: '', note: '<p>Short <b>one</b></p>' }
    ],
    { budget: 2000 }
  )
  t.ok(input.includes('Note: Long'))
  t.ok(input.includes('Note: Untitled\nShort one'))
  t.ok(input.length < 2200)
})

test('generated lines become headings, lists and cards', (t) => {
  t.is(
    generatedToHtml(NOTE_TASK.REPORT, '# Summary\nTrip is booked.\n- Flights <done>\n- Hotel'),
    '<h2>Summary</h2><p>Trip is booked.</p><ul><li><p>Flights &lt;done&gt;</p></li><li><p>Hotel</p></li></ul>'
  )
  t.is(
    generatedToHtml(NOTE_TASK.FLASHCARDS, 'Q: Capital of Portugal?\nA: Lisbon'),
    '<p><strong>Q:</strong> Capital of Portugal?</p><p>A: Lisbon</p>'
  )
  const draft = buildGeneratedNote({
    task: NOTE_TASK.ACTION_LIST,
    output: '- Ben books the venue',
    sources: ['Launch sync'],
    title: 'Action list',
    sourcesLabel: 'From these notes'
  })
  t.ok(draft.note.endsWith('<li><p>Launch sync</p></li></ul>'))
})
