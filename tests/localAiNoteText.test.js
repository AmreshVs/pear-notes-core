import test from 'brittle'

import {
  chunkNote,
  chunkNoteLines,
  estimateTokens,
  renderNoteLines,
  renderNoteText
} from '../store/services/localAiNoteText.js'
import { htmlToNoteText } from '../store/services/localAiPrompts.js'

const ATTACHED = [
  '<h2>Receipts</h2>',
  '<p>March costs</p>',
  '<div data-file-attachment="" filename="Invoice March.pdf" filetype="application/pdf" url="hyperdrive://pdf"></div>',
  '<img src="http://127.0.0.1:5001/?key=a&amp;blob=b&amp;name=shot.png">',
  '<div data-audio-attachment="" filename="memo.m4a" url="hyperdrive://audio"></div>',
  '<p>After</p>'
].join('')

test('htmlToNoteText still leaves attachments out', (t) => {
  t.is(htmlToNoteText(ATTACHED), '## Receipts\nMarch costs\nAfter')
})

test('renderNoteText includes attachments and their derived text', (t) => {
  const seen = []
  const text = renderNoteText(ATTACHED, {
    title: 'Expenses',
    attachmentText: (info) => {
      seen.push(info)
      return info.kind === 'pdf' ? 'Total due: 120 EUR\n\nPaid by card' : ''
    }
  })
  t.alike(text.split('\n'), [
    '# Expenses',
    '## Receipts',
    'March costs',
    '[PDF: Invoice March.pdf]',
    'Total due: 120 EUR',
    'Paid by card',
    '[End of attachment]',
    '[Image: shot.png]',
    '[Audio: memo.m4a]',
    'After'
  ])
  t.alike(
    seen.map((info) => [info.kind, info.name, info.url]),
    [
      ['pdf', 'Invoice March.pdf', 'hyperdrive://pdf'],
      ['image', 'shot.png', 'http://127.0.0.1:5001/?key=a&blob=b&name=shot.png'],
      ['audio', 'memo.m4a', 'hyperdrive://audio']
    ]
  )
})

test('renderNoteLines does not repeat a title the note already starts with', (t) => {
  const lines = renderNoteLines('<h1>Lisbon</h1><p>Trip</p>', { title: 'Lisbon' })
  t.alike(
    lines.map((line) => line.text),
    ['# Lisbon', 'Trip']
  )
  t.is(lines[0].heading, 1)
})

test('estimateTokens counts dense scripts per character', (t) => {
  t.is(estimateTokens(''), 0)
  t.is(estimateTokens('abcdef'), 2)
  t.is(estimateTokens('東京駅'), 3)
  t.ok(estimateTokens('नमस्ते दुनिया') >= 6)
})

test('chunkNote splits on headings and keeps the heading on each chunk', (t) => {
  const long = 'word '.repeat(120).trim()
  const html = `<h2>Packing</h2><p>${long}</p><h2>Bookings</h2><p>Hotel Baixa</p>`
  const chunks = chunkNote(html, { title: 'Lisbon' })
  t.is(chunks.length, 2)
  t.is(chunks[0].heading, 'Packing')
  t.ok(chunks[0].text.startsWith('## Packing\n'))
  t.is(chunks[1].heading, 'Bookings')
  t.is(chunks[1].text, '## Bookings\nHotel Baixa')
  t.alike(
    chunks.map((chunk) => chunk.index),
    [0, 1]
  )
})

test('chunkNote merges short sections', (t) => {
  const chunks = chunkNote('<h2>A</h2><p>one</p><h2>B</h2><p>two</p>')
  t.is(chunks.length, 1)
  t.is(chunks[0].heading, 'A')
})

test('no chunk exceeds the token cap, in any script', (t) => {
  const cases = [
    `<p>${'Sentence number one is here. '.repeat(200)}</p>`,
    `<p>${'x'.repeat(5000)}</p>`,
    `<p>${'東京で会議があります。'.repeat(150)}</p>`,
    `<ul>${'<li><p>milk and bread and eggs</p></li>'.repeat(200)}</ul>`
  ]
  const title = 'A fairly long note title for budgeting'
  for (const html of cases) {
    const chunks = chunkNote(html, { title, maxTokens: 120 })
    t.ok(chunks.length > 1)
    const worst = Math.max(...chunks.map((chunk) => estimateTokens(chunk.text)))
    t.ok(worst + estimateTokens(title) + 12 <= 120, `max ${worst}`)
  }
})

test('attachment text forms its own section', (t) => {
  const pdf = 'Line of invoice text. '.repeat(20)
  const html = ATTACHED.replace('March costs', 'March costs were higher than planned. '.repeat(8))
  const chunks = chunkNote(html, {
    attachmentText: (info) => (info.kind === 'pdf' ? pdf : '')
  })
  const attachment = chunks.find((chunk) => chunk.heading === '[PDF: Invoice March.pdf]')
  t.ok(attachment)
  t.ok(attachment.text.includes('Line of invoice text.'))
  t.is(chunks[0].heading, 'Receipts')
  t.absent(chunks[0].text.includes('invoice text'))
})

test('chunkNoteLines of nothing is empty', (t) => {
  t.alike(chunkNoteLines([]), [])
  t.alike(chunkNote(''), [])
})
