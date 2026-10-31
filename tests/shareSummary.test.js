import test from 'brittle'

import {
  canSummarizeShare,
  parseShareSummary,
  shareSummaryInput,
  shareSummaryParagraphs,
  suggestShareFolder
} from '../store/services/shareSummary.js'

const long = 'The lease runs for twelve months and rent is due on the first of each month. '.repeat(
  2
)

test('share input uses text, link titles and PDF text, never a bare link', (t) => {
  const items = [
    { kind: 'url', id: '1', url: 'https://example.com/a' },
    { kind: 'url', id: '2', url: 'https://example.com/b', title: 'Flat to rent' },
    { kind: 'text', id: '3', text: long },
    { kind: 'file', id: '4', name: 'Lease.pdf' }
  ]
  const input = shareSummaryInput(items, { fileTexts: { 4: 'Deposit 1500' } })
  t.absent(input.includes('example.com'))
  t.ok(input.includes('Flat to rent'))
  t.ok(input.includes('Lease.pdf\nDeposit 1500'))
  t.ok(canSummarizeShare(input))
  t.absent(canSummarizeShare('https://example.com/a-very-long-path-that-is-just-an-address'))
})

test('parses model output into paragraphs', (t) => {
  const parsed = parseShareSummary(
    'Summary: A one-year lease.\nAction items: none',
    '- Rent due monthly\n- Deposit 1500'
  )
  t.is(parsed.summary, 'A one-year lease.')
  t.alike(parsed.keyPoints, ['Rent due monthly', 'Deposit 1500'])
  t.alike(shareSummaryParagraphs(parsed), [
    { text: 'Summary' },
    { text: 'A one-year lease.' },
    { text: 'Key points' },
    { text: '• Rent due monthly' },
    { text: '• Deposit 1500' }
  ])
  t.alike(shareSummaryParagraphs({ summary: '', keyPoints: [] }), [])
})

test('folder comes from the nearest notes', async (t) => {
  const api = {
    derivedSearch: async () => ({
      ok: true,
      results: [
        { id: 'a', score: 0.7, chunk: 0 },
        { id: 'b', score: 0.6, chunk: 0 }
      ]
    }),
    derivedGet: async () => ({ ok: true, entries: [] })
  }
  const embed = async () => [new Float32Array(768)]
  const notes = { a: { folderKey: 'home' }, b: { folderKey: 'home' } }
  const folderData = { home: { title: 'Home' } }
  t.is(await suggestShareFolder({ api, embed, text: long, notes, folderData }), 'home')
  t.is(await suggestShareFolder({ api, embed, text: long, notes, folderData: {} }), null)
})
