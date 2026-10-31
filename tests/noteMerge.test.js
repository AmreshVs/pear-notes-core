import test from 'brittle'

import {
  buildMergePreview,
  buildMergedNote,
  checkMergeable,
  MERGE_LINE,
  MERGE_REFUSAL,
  planMerge
} from '../store/services/noteMerge.js'

const note = (title, html, extra = {}) => ({ title, note: html, folderKey: 'f1', ...extra })

test('a merge keeps the first note and adds only lines no earlier note has', (t) => {
  const first =
    '<p>Flights Nov 6, back Nov 11.</p><ul><li><p>Tram 28 early morning</p></li><li><p>Pastéis de Belém</p></li></ul>'
  const originals = [
    note('Lisbon trip', first),
    note(
      'Lisbon ideas',
      '<ul><li><p>Past&#233;is</p></li><li><p>  pastéis de BELÉM </p></li><li><p>LX Factory on Sunday</p></li></ul><p>Flights Nov 6, back Nov 11.</p><p></p>'
    ),
    note('', '<p>LX Factory on Sunday</p><p>Fado night</p>')
  ]
  t.is(checkMergeable(originals), null)
  const plan = planMerge(originals)
  t.is(plan.title, 'Lisbon trip')
  t.is(plan.folderKey, 'f1')
  t.ok(plan.note.startsWith(first.slice(0, first.lastIndexOf('<'))), 'first note kept as it was')
  t.alike(
    plan.dropped.map((line) => [line.text, line.from]),
    [
      ['pastéis de BELÉM', 1],
      ['Flights Nov 6, back Nov 11.', 1],
      ['LX Factory on Sunday', 2]
    ],
    'every removed line is reported with the note it came from'
  )
  t.is(plan.note.match(/LX Factory/g).length, 1)
  t.ok(plan.note.includes('Past&#233;is'), 'a near match is kept')
  t.ok(plan.note.includes('Fado night'))
  t.is((plan.note.match(/[<]ul>/g) ?? []).length, 1, 'lists that meet at the join become one')
  t.alike(
    plan.result.filter((line) => line.added).map((line) => line.text),
    ['Pastéis', 'LX Factory on Sunday', 'Fado night']
  )
})

test('a merge never drops headings, media, or a task in another state', (t) => {
  const task = (checked, text) =>
    `<ul data-type="taskList"><li data-checked="${checked}" data-type="taskItem"><label><input type="checkbox"></label><div><p>${text}</p></div></li></ul>`
  const img = '<p><img src="http://hyperdrive/abc/photo.jpg"></p>'
  const plan = planMerge([
    note('A', `<h2>Packing</h2>${task(false, 'Book hotel')}${img}`),
    note('B', `<h2>Packing</h2>${task(true, 'Book hotel')}${img}${task(false, 'Book hotel')}`)
  ])
  t.is(plan.note.match(/Packing/g).length, 2)
  t.is(plan.note.match(/photo\.jpg/g).length, 2)
  t.is(plan.note.match(/data-checked="true"/g).length, 1)
  t.alike(plan.dropped, [{ text: 'Book hotel', from: 1 }])
})

test('a body that does not parse is kept whole', (t) => {
  const broken = '<p>unclosed <strong>bold</p><p>Shared line</p>'
  const plan = planMerge([note('A', '<p>Shared line</p>'), note('B', broken)])
  t.ok(plan.note.endsWith(broken))
  t.is(plan.dropped.length, 0)
})

test('the preview lists each original and the result', (t) => {
  const preview = buildMergePreview(
    [
      note('One', '<h1>Top</h1><ol><li><p>a</p></li></ol>', { updatedAt: 5 }),
      note('', '<p>b</p><div data-file-attachment="" url="x"></div>')
    ],
    ['k1', 'k2']
  )
  t.alike(preview.keys, ['k1', 'k2'])
  t.alike(
    preview.sources[0].lines.map((line) => line.kind),
    [MERGE_LINE.HEADING, MERGE_LINE.NUMBER]
  )
  t.is(preview.sources[0].updatedAt, 5)
  t.alike(
    preview.sources[1].lines.map((line) => line.kind),
    [MERGE_LINE.PARAGRAPH, MERGE_LINE.ATTACHMENT]
  )
  t.is(preview.result.filter((line) => line.added).length, 2)
  t.ok(buildMergedNote([note('A', '<p>x</p>'), note('B', '<p>y</p>')]).note.includes('y'))
})

test('merges that could lose data are refused', (t) => {
  t.is(checkMergeable([note('a', '<p>x</p>')]), MERGE_REFUSAL.TOO_FEW)
  t.is(checkMergeable([note('a', '<p>x</p>'), null]), MERGE_REFUSAL.MISSING)
  t.is(
    checkMergeable([note('a', '<p>x</p>'), note('b', '<p>y</p>', { locked: true })]),
    MERGE_REFUSAL.LOCKED
  )
  t.is(
    checkMergeable([
      note('a', '<p>x</p>'),
      note('b', '<img src="http://hyperdrive/abc/photo.jpg">')
    ]),
    null,
    'attachments merge: the copy keeps them after the original expires (mergedAttachmentSurvives)'
  )
})
