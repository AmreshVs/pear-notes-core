import test from 'brittle'

import {
  htmlToNoteText,
  htmlToParagraphs,
  buildSummaryMessages,
  cleanImageDescription,
  cleanModelOutput,
  endsInRepeatLoop,
  findRepeatLoop,
  joinTextSlices,
  parseSummaryOutput,
  planTextSlices,
  readImageTextSlices,
  trimRepeatLoop,
  SUMMARY_MAX_TRANSCRIPT_CHARS
} from '../store/services/localAiPrompts.js'

test('cleanModelOutput strips reasoning blocks', (t) => {
  t.is(
    cleanModelOutput('<think>planning</think>\nA red bicycle by a wall.'),
    'A red bicycle by a wall.'
  )
  t.is(cleanModelOutput(null), '')
})

test('parseSummaryOutput splits summary and action items', (t) => {
  const parsed = parseSummaryOutput(
    'Summary: We agreed to ship on Friday.\nAction items:\n- Email the team\n2. Book the room'
  )
  t.is(parsed.summary, 'We agreed to ship on Friday.')
  t.alike(parsed.actionItems, ['Email the team', 'Book the room'])
})

test('parseSummaryOutput drops a none marker', (t) => {
  const parsed = parseSummaryOutput('Summary: Just a reminder.\nAction items: none')
  t.is(parsed.summary, 'Just a reminder.')
  t.alike(parsed.actionItems, [])
})

test('htmlToParagraphs splits blocks and decodes entities', (t) => {
  const html = ['<p>Hello &amp; welcome</p>', '<ul><li>One</li><li>Two</li></ul>', '<p></p>'].join(
    ''
  )
  t.alike(htmlToParagraphs(html), ['Hello & welcome', 'One', 'Two'])
  t.alike(htmlToParagraphs(''), [])
})

test('buildSummaryMessages caps the transcript', (t) => {
  const messages = buildSummaryMessages('a'.repeat(SUMMARY_MAX_TRANSCRIPT_CHARS + 50))
  t.is(messages.length, 2)
  t.is(messages[0].role, 'system')
  const note = messages[1].content.match(/<note>\n([\s\S]*)\n<\/note>/)[1]
  t.is(note.length, SUMMARY_MAX_TRANSCRIPT_CHARS)
})

test('htmlToNoteText keeps the structure a reader sees', (t) => {
  const html = [
    '<h1>Lisbon</h1>',
    '<h2>Packing</h2>',
    '<ul><li><p>Adapter</p></li><li><p>Sun cream</p><ul><li><p>factor 50</p></li></ul></li></ul>',
    '<h2>Bookings</h2>',
    '<ol><li><p>Hotel Baixa</p></li><li><p>Airport transfer</p></li></ol>',
    '<ul data-type="taskList">',
    '<li data-checked="true" data-type="taskItem"><label><input type="checkbox" checked></label><div><p>Book flights</p></div></li>',
    '<li data-checked="false" data-type="taskItem"><label><input type="checkbox"></label><div><p>Renew passport</p></div></li>',
    '</ul>',
    '<blockquote><p>Budget is 900 &euro;.</p></blockquote>',
    '<table><tbody><tr><td><p>Day</p></td><td><p>Plan</p></td></tr></tbody></table>'
  ].join('')
  t.alike(htmlToNoteText(html).split('\n'), [
    '# Lisbon',
    '## Packing',
    '- Adapter',
    '- Sun cream',
    '  - factor 50',
    '## Bookings',
    '1. Hotel Baixa',
    '2. Airport transfer',
    '- [x] Book flights',
    '- [ ] Renew passport',
    '> Budget is 900 €.',
    'Day | Plan'
  ])
})

test('htmlToNoteText drops empty blocks and scripts', (t) => {
  t.is(htmlToNoteText('<p></p><script>alert(1)</script><p>Kept</p>'), 'Kept')
  t.is(htmlToNoteText(''), '')
})

test('planTextSlices cuts only tall images, with overlap', (t) => {
  t.is(planTextSlices(1600, 1131).length, 1)
  t.is(planTextSlices(1131, 1600).length, 1)
  const slices = planTextSlices(1290, 2796)
  t.is(slices.length, 2)
  t.is(slices[0].originY, 0)
  t.ok(slices[1].originY < slices[0].height)
  t.is(slices[1].originY + slices[1].height, 2796)
  t.is(planTextSlices(100, 10000).length, 8)
  t.is(planTextSlices(0, 0).length, 1)
})

test('joinTextSlices drops lines repeated across the overlap', (t) => {
  t.is(
    joinTextSlices(['Title\nLine one\nLine two', 'Line two\nLine three']),
    'Title\nLine one\nLine two\nLine three'
  )
  t.is(joinTextSlices(['A', '', 'B']), 'A\n\nB')
})

test('findRepeatLoop finds runaway lines and keeps the first copy', (t) => {
  const looped = '12:30\nActivity\n' + '<return>\n'.repeat(40)
  t.is(trimRepeatLoop(looped), '12:30\nActivity\n<return>')
  t.is(findRepeatLoop('Milk 2.49\nMilk 2.49\nBread 3.80'), -1)
  t.is(trimRepeatLoop('Total ' + 'ab '.repeat(30)), 'Total ab ')
  t.is(findRepeatLoop('----------------------\nTOTAL 12.73\n**** 4417 0000'), -1)
})

test('findRepeatLoop catches a repeating block of lines', (t) => {
  const cycle = 'Issue date\n01/02/2028\nIssue date\n02/02/2026\n'
  t.is(trimRepeatLoop('Card\nName\n' + cycle.repeat(10) + 'Iss'), 'Card\nName\n' + cycle.trim())
  t.is(trimRepeatLoop('Top\n' + 'Date\n12:00\n'.repeat(5)), 'Top\nDate\n12:00')
  t.is(findRepeatLoop('Milk\n2.49\nMilk\n2.49\nMilk\n2.49\nBread'), -1)
})

test('endsInRepeatLoop catches a block loop while streaming', (t) => {
  const cycle = 'Issue date\n01/02/2028\nIssue date\n02/02/2026\n'
  t.ok(endsInRepeatLoop('Card\n' + cycle.repeat(4) + 'Iss'))
  t.absent(endsInRepeatLoop('Card\n' + cycle.repeat(3) + 'Iss'))
  t.ok(endsInRepeatLoop('Top\n' + 'Date\n12:00\n'.repeat(4)))
})

test('endsInRepeatLoop only looks at the tail of the stream', (t) => {
  t.ok(endsInRepeatLoop('Title\n' + '<\n'.repeat(6)))
  t.ok(endsInRepeatLoop('Title\nab' + 'cd'.repeat(9)))
  t.absent(endsInRepeatLoop('Title\n' + '<\n'.repeat(5)))
  t.absent(endsInRepeatLoop('\n'.repeat(10)))
  t.absent(endsInRepeatLoop('Milk 2.49\nMilk 2.49\nBread'))
})

test('readImageTextSlices stops a looping slice and retries it with a penalty', async (t) => {
  const calls = []
  const text = await readImageTextSlices(
    [{ id: 0 }, { id: 1 }],
    async (slice, params, onStreamed) => {
      calls.push([slice.id, params.repeat_penalty ?? null])
      if (slice.id === 0) return 'Header\nShared'
      if (!params.repeat_penalty) {
        let streamed = 'Shared\n'
        for (let i = 0; i < 50; i++) {
          streamed += '<\n'
          if (onStreamed(streamed)) return streamed
        }
        return streamed
      }
      return 'Shared\nFooter'
    }
  )
  t.alike(calls, [
    [0, null],
    [1, null],
    [1, 1.1]
  ])
  t.is(text, 'Header\nShared\nFooter')
})

test('cleanImageDescription drops the "This image shows" opener', (t) => {
  t.is(cleanImageDescription('This image displays a misty waterfall.'), 'A misty waterfall.')
  t.is(
    cleanImageDescription('This is a beach scene with a flower.'),
    'A beach scene with a flower.'
  )
  t.is(cleanImageDescription('This screenshot shows the Activity tab.'), 'The Activity tab.')
  t.is(cleanImageDescription('The photo booth at a wedding.'), 'The photo booth at a wedding.')
})
