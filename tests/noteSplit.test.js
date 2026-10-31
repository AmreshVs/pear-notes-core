import test from 'brittle'

import { SPLIT_REFUSAL, checkSplittable, splitNoteByHeadings } from '../store/services/noteSplit.js'

const HTML =
  '<p>Trip overview</p><h2>Flights</h2><p>EK 2041 on the <strong>12th</strong></p><h3>Seats</h3><p>34K</p><h2>Hotel &amp; food</h2><ul><li><p>Alfama</p></li></ul>'

test('a split keeps every byte, in order, across the parts', (t) => {
  const parts = splitNoteByHeadings(HTML, 'Lisbon')
  t.alike(
    parts.map((part) => part.title),
    ['Lisbon', 'Flights', 'Hotel & food']
  )
  t.is(
    parts[0].note +
      parts
        .slice(1)
        .map((part) => part.heading + part.note)
        .join(''),
    HTML
  )
  t.ok(parts[1].note.includes('<h3>Seats'), 'lower headings stay inside their section')
})

test('notes that cannot be split are refused', (t) => {
  t.is(
    checkSplittable({ title: 'x', note: '<p>one</p><h2>only one</h2>' }),
    SPLIT_REFUSAL.NO_SECTIONS
  )
  t.is(checkSplittable({ title: 'x', note: HTML, locked: true }), SPLIT_REFUSAL.LOCKED)
  t.is(checkSplittable({ title: 'x', note: HTML + '<img src="http://hyperdrive/a.jpg">' }), null)
  t.is(checkSplittable({ title: 'x', note: HTML }), null)
})
