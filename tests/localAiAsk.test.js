import test from 'brittle'

import {
  applyTextEdits,
  ASK_ANSWER_PARAMS,
  ASK_KIND,
  ASK_RESPONSE_FORMAT,
  ASK_THINK_BUDGET,
  ASK_THINK_PARAMS,
  ASK_TOOL_PARAMS,
  buildAskMessages,
  createAskTurn,
  deriveEditsFromRewrite,
  extractPartialAnswer,
  fitAskPredict,
  fitAskTurns,
  getAskFullTextParams,
  getAskGenerationParams,
  getAskHistory,
  getAskScopeInfo,
  hasDroppedAskTurns,
  isAskChangeRequest,
  isAskQuestion,
  parseAskAnswerOutput,
  runAsk,
  shouldAskThink,
  stripAskHedge,
  trimAskNote,
  parseAskOutput,
  pickAskReply,
  resolveAskReply,
  claimsAskChange,
  resolveAskTurn,
  restoreDroppedTail,
  shouldRetryAskForEdits,
  shouldTryAskFullText,
  toAskFullTextReply,
  validateAskEdits
} from '../store/services/localAiAsk.js'

const NOTE = 'Meeting notes\nWe met on Tuesday.\nBudget is 400 dollars.'

test('builds messages with the note, kept turns and the new question', (t) => {
  const { messages, dropped } = buildAskMessages({
    note: NOTE,
    turns: [{ question: 'When?', reply: '{"kind":"answer","answer":"Tuesday","edits":[]}' }],
    question: 'What is the budget?'
  })
  t.is(dropped, 0)
  t.is(messages.length, 4)
  t.ok(messages[0].content.includes('<note>\nMeeting notes'))
  t.is(messages[1].content, 'When?')
  t.is(messages[2].role, 'assistant')
  t.ok(messages[3].content.startsWith('What is the budget?'))
  t.ok(messages[3].content.endsWith('/no_think'))
  t.is(ASK_RESPONSE_FORMAT.type, 'json_schema')
})

test('drops the oldest turns when history is too long', (t) => {
  const turns = [
    { question: 'a'.repeat(50), reply: 'b'.repeat(50) },
    { question: 'c', reply: 'd' }
  ]
  const fitted = fitAskTurns(turns, 30)
  t.is(fitted.dropped, 1)
  t.is(fitted.turns[0].question, 'c')
})

test('parses answers, edits and not-found replies', (t) => {
  t.alike(parseAskOutput('{"kind":"answer","answer":"Tuesday.","edits":[]}'), {
    kind: ASK_KIND.ANSWER,
    answer: 'Tuesday.',
    edits: []
  })
  const edits = parseAskOutput(
    '{"kind":"answer","answer":"Updated.","edits":[{"find":"Tuesday","replace":"Wednesday"},{"find":"x","replace":"x"}]}'
  )
  t.is(edits.kind, ASK_KIND.EDITS)
  t.alike(edits.edits, [{ find: 'Tuesday', replace: 'Wednesday', all: false }])
  t.is(
    parseAskOutput('{"kind":"notFound","answer":"No price here.","edits":[]}').kind,
    ASK_KIND.NOT_FOUND
  )
})

test('salvages a cut-off reply and trims repeated sentences', (t) => {
  const parsed = parseAskOutput(
    '{"kind":"notFound","answer":"No price. It covers the review. No price. It covers the review. No pr'
  )
  t.is(parsed.kind, ASK_KIND.NOT_FOUND)
  t.is(parsed.answer, 'No price. It covers the review.')
})

test('extracts the answer while it streams', (t) => {
  t.is(extractPartialAnswer('{"kind":"answer","answer":"We met on \\"Tue'), 'We met on "Tue')
  t.is(extractPartialAnswer('{"kind":"ans'), '')
})

test('applies edits to every occurrence and reports skipped ones', (t) => {
  const result = applyTextEdits('a b a', [
    { find: 'a', replace: 'c', all: true },
    { find: 'zzz', replace: 'y' }
  ])
  t.is(result.after, 'c b c')
  t.is(result.applied[0].count, 2)
  t.alike(result.skipped, [{ find: 'zzz', replace: 'y', all: false }])
  t.is(applyTextEdits('a b a', [{ find: 'a', replace: 'c' }]).after, 'c b a')
})

test('turns a lightly corrected copy of the note into edits', (t) => {
  const note = 'We met the desgin team.\nThere was alot of feedback.'
  const edits = deriveEditsFromRewrite(
    note,
    'We met the design team.\nThere was a lot of feedback.'
  )
  t.alike(edits, [
    { find: 'the desgin team.', replace: 'the design team.', all: false },
    { find: 'was alot of', replace: 'was a lot of', all: false }
  ])
  t.alike(deriveEditsFromRewrite(note, 'Completely different words here.'), [])
})

test('resolveAskReply only converts answers that rewrite the note', (t) => {
  const note = 'We met the desgin team.'
  t.is(
    resolveAskReply(note, { kind: ASK_KIND.ANSWER, answer: 'We met the design team.', edits: [] })
      .kind,
    ASK_KIND.EDITS
  )
  t.is(
    resolveAskReply(note, { kind: ASK_KIND.ANSWER, answer: 'Tuesday.', edits: [] }).kind,
    ASK_KIND.ANSWER
  )
})

test('resolveAskTurn builds a reviewable edit turn and history entry', (t) => {
  const note = 'We met on Tuesday.'
  const turn = resolveAskTurn(
    createAskTurn(1, 'Change Tuesday to Wednesday'),
    note,
    '{"kind":"edits","answer":"Done","edits":[{"find":"Tuesday","replace":"Wednesday"}]}'
  )
  t.is(turn.status, 'done')
  t.is(turn.kind, ASK_KIND.EDITS)
  t.is(turn.editedText, 'We met on Wednesday.')
  t.is(turn.diff.fixes, 1)
  t.alike(getAskHistory([turn]), [{ question: 'Change Tuesday to Wednesday', reply: turn.reply }])

  const missing = resolveAskTurn(
    createAskTurn(2, 'Change Friday'),
    note,
    '{"kind":"edits","answer":"","edits":[{"find":"Friday","replace":"Monday"}]}'
  )
  t.is(missing.kind, ASK_KIND.NOT_FOUND)
  t.is(missing.error, 'noMatch')
  t.alike(getAskScopeInfo('note', note), { scope: 'note', words: 4, truncated: false })
})

test('retries change requests that came back without edits', (t) => {
  const note = 'Budget is 400 dollars.'
  const described = '{"kind":"answer","answer":"The budget is now 600.","edits":[]}'
  const edited =
    '{"kind":"edits","answer":"","edits":[{"find":"400 dollars","replace":"600 dollars"}]}'
  t.ok(isAskChangeRequest('Make the budget 600 dollars'))
  t.absent(isAskChangeRequest('What is the budget?'))
  t.ok(shouldRetryAskForEdits(note, 'Make the budget 600 dollars', described))
  t.absent(shouldRetryAskForEdits(note, 'Make the budget 600 dollars', edited))
  t.absent(shouldRetryAskForEdits(note, 'What is the budget?', described))
  t.is(pickAskReply(note, described, edited, 'Make the budget 600 dollars'), edited)
  t.is(pickAskReply(note, described, described, 'Make the budget 600 dollars'), described)
})

test('treats elaborate and rephrase requests as a rewrite of the text', (t) => {
  const source =
    'Mom and dad are unbearable and I am here alone. You should have told me about the truck.'
  t.ok(isAskChangeRequest('Ellaborate this paragarah to be more than 100 words'))
  t.ok(isAskChangeRequest('I mean add your own words and make it 100 words'))
  t.ok(isAskChangeRequest('Can you rephrase this'))
  t.absent(isAskChangeRequest('Who took the truck?'))
  const labelled = resolveAskTurn(
    createAskTurn(1, 'Elaborate this'),
    source,
    JSON.stringify({
      kind: 'rewrite',
      answer:
        'Honestly, my mom and dad are completely unbearable right now, and I am stuck here alone dealing with it. You really should have told me about the truck before you took it.',
      edits: []
    })
  )
  t.is(labelled.kind, ASK_KIND.REWRITE)
  t.ok(labelled.editedText.startsWith('Honestly'))
  t.ok(labelled.diff.mostlyChanged)
  const unlabelled = resolveAskTurn(
    createAskTurn(2, 'Elaborate this'),
    source,
    JSON.stringify({
      kind: 'answer',
      answer:
        'My mom and dad are truly unbearable, and I am here alone taking it all in. You should have told me you were planning to take the truck.',
      edits: []
    })
  )
  t.is(unlabelled.kind, ASK_KIND.REWRITE)
  const question = resolveAskTurn(
    createAskTurn(3, 'Who is alone?'),
    source,
    '{"kind":"answer","answer":"You are alone.","edits":[]}'
  )
  t.is(question.kind, ASK_KIND.ANSWER)
})

test('an unchanged rewrite is retried and reported instead of offered', (t) => {
  const note = 'We met the design team on Tuesday.'
  const same = JSON.stringify({ kind: 'rewrite', answer: note, edits: [] })
  const longer = JSON.stringify({
    kind: 'rewrite',
    answer: 'On Tuesday we met the whole design team for a long review of the flow.',
    edits: []
  })
  t.ok(shouldRetryAskForEdits(note, 'Elaborate this', same))
  t.absent(shouldRetryAskForEdits(note, 'Elaborate this', longer))
  t.is(pickAskReply(note, same, longer, 'Elaborate this'), longer)
  const turn = resolveAskTurn(createAskTurn(1, 'Elaborate this'), note, same)
  t.is(turn.kind, ASK_KIND.NOT_FOUND)
  t.is(turn.error, 'unchanged')
})

test('rejects edits that do not match what was asked', (t) => {
  t.ok(
    validateAskEdits('Change the launch to 6 November', [
      { find: '30 October', replace: '6 November' }
    ])
  )
  t.absent(validateAskEdits('Remove Lena from the attendees', [{ find: 'Lena', replace: 'Priya' }]))
  t.ok(validateAskEdits('Remove Lena from the attendees', [{ find: ', Lena', replace: '' }]))
  t.absent(validateAskEdits('Add Omar to the attendees', [{ find: 'Marcus', replace: 'Omar' }]))
  t.ok(
    validateAskEdits('Add Omar to the attendees', [
      { find: 'Marcus, Lena', replace: 'Marcus, Lena, Omar' }
    ])
  )
  t.absent(validateAskEdits('Add butter and cheese', [{ find: 'coffee beans', replace: 'milk' }]))
  t.absent(
    validateAskEdits('Fix any spelling mistakes', [{ find: 'Q3 planning meeting', replace: '' }])
  )
  t.ok(validateAskEdits('Fix the typos', [{ find: 'desgin', replace: 'design' }]))
  t.ok(validateAskEdits('Cambia martes por miércoles', [{ find: 'martes', replace: 'miércoles' }]))
})

test('scopes edits the way the request asks', (t) => {
  const note =
    'Attendees: Priya, Lena.\nLena will draft the email.\nOpen questions: pricing for teams.'
  const once = resolveAskTurn(
    createAskTurn(1, 'Remove Lena from the attendees'),
    note,
    '{"kind":"edits","answer":"","edits":[{"find":", Lena","replace":""}]}'
  )
  t.is(
    once.editedText,
    'Attendees: Priya.\nLena will draft the email.\nOpen questions: pricing for teams.'
  )
  const everywhere = resolveAskTurn(
    createAskTurn(2, 'Rename Lena to Lee everywhere'),
    note,
    '{"kind":"edits","answer":"","edits":[{"find":"Lena","replace":"Lee"}]}'
  )
  t.is(
    everywhere.editedText,
    'Attendees: Priya, Lee.\nLee will draft the email.\nOpen questions: pricing for teams.'
  )
  const line = resolveAskTurn(
    createAskTurn(3, 'Delete the open questions line'),
    note,
    '{"kind":"edits","answer":"","edits":[{"find":"Open questions:","replace":""}]}'
  )
  t.is(line.editedText, 'Attendees: Priya, Lena.\nLena will draft the email.\n')
  const formatting = resolveAskTurn(
    createAskTurn(4, 'Turn this into a bulleted list'),
    note,
    '{"kind":"edits","answer":"","edits":[{"find":"teams.","replace":"teams"}]}'
  )
  t.is(formatting.error, 'formatting')
})

test('reads edits hidden in the answer and long not-found replies', (t) => {
  const hidden = parseAskOutput(
    '{"kind":"answer","answer":"{ \\"find\\": \\"4,000 dollars\\", \\"replace\\": \\"5,000 dollars\\" }","edits":[]}'
  )
  t.is(hidden.kind, ASK_KIND.EDITS)
  t.alike(hidden.edits, [{ find: '4,000 dollars', replace: '5,000 dollars', all: false }])
  const summary = parseAskOutput(
    JSON.stringify({ kind: 'notFound', answer: 'word '.repeat(45).trim(), edits: [] })
  )
  t.is(summary.kind, ASK_KIND.ANSWER)
})

test('keeps sentences, commas and punctuation intact', (t) => {
  t.absent(
    validateAskEdits('Increase the marketing budget to 5,000 dollars', [
      { find: 'Budget for marketing is 4,000 dollars.', replace: '5,000 dollars' }
    ])
  )
  t.ok(
    validateAskEdits('Increase the marketing budget to 5,000 dollars', [
      { find: '4,000', replace: '5,000' }
    ])
  )
  t.absent(
    validateAskEdits('Add oat milk to the list', [{ find: 'Milk,', replace: 'Milk and oat milk' }])
  )
  t.ok(
    validateAskEdits('Add oat milk to the list', [{ find: 'Milk,', replace: 'Milk, oat milk,' }])
  )
  const removed = resolveAskTurn(
    createAskTurn(1, 'Remove coffee beans'),
    'Milk, eggs, coffee beans, olive oil',
    '{"kind":"edits","answer":"","edits":[{"find":"coffee beans","replace":""}]}'
  )
  t.is(removed.editedText, 'Milk, eggs, olive oil')
  const newItem = resolveAskTurn(
    createAskTurn(2, 'Add an action item for Omar'),
    'Action items:\n- Priya: redesign',
    '{"kind":"edits","answer":"","edits":[{"find":"Action items:\\n- Priya","replace":"x"}]}'
  )
  t.is(newItem.error, 'newBlock')
})

test('falls back to a full updated copy for short notes and checks it', (t) => {
  const note = 'Groceries\nMilk, eggs, coffee beans, olive oil\nPay the bill'
  const refusal = '{"kind":"answer","answer":"Done.","edits":[]}'
  t.ok(shouldTryAskFullText(note, 'Remove coffee beans', refusal))
  t.absent(shouldTryAskFullText(note, 'What should I buy?', refusal))
  t.absent(shouldTryAskFullText(note, 'Make it shorter', refusal))
  t.is(
    restoreDroppedTail(note, 'Groceries\nMilk, eggs, olive oil'),
    'Groceries\nMilk, eggs, olive oil'
  )
  t.is(restoreDroppedTail(note, 'Groceries\nMilk, eggs, coffee beans, olive oil'), note)
  const reply = toAskFullTextReply(
    note,
    'Remove coffee beans',
    'Groceries\nMilk, eggs, olive oil\nPay the bill'
  )
  const turn = resolveAskTurn(createAskTurn(1, 'Remove coffee beans'), note, reply)
  t.is(turn.editedText, 'Groceries\nMilk, eggs, olive oil\nPay the bill')
  t.is(
    toAskFullTextReply(
      note,
      'Remove coffee beans',
      'Groceries\nMilk, tea, olive oil\nPay the bill'
    ),
    null
  )
})

test('cleans stray instruction words and retries replies that contain edits', (t) => {
  const note = 'Priya owns it. Lena will draft the launch email by Friday.'
  const renamed = resolveAskTurn(
    createAskTurn(1, 'Rename Priya to Pri everywhere'),
    note,
    '{"kind":"edits","answer":"","edits":[{"find":"Priya","replace":"Pri everywhere"}]}'
  )
  t.is(renamed.editedText, 'Pri owns it. Lena will draft the launch email by Friday.')
  const wrongFind =
    '{"kind":"edits","answer":"","edits":[{"find":"Lena will draft it by Friday","replace":"Monday"}]}'
  t.ok(shouldRetryAskForEdits(note, 'Lena will draft it by Monday, not Friday', wrongFind))
  t.ok(shouldTryAskFullText(note, 'Lena will draft it by Monday, not Friday', wrongFind))
  t.absent(
    validateAskEdits('Add butter and cheese', [
      { find: 'apples, coffee beans', replace: 'apples, coffee beans butter cheese' }
    ])
  )
  t.ok(
    validateAskEdits('Add butter and cheese', [
      { find: 'apples, coffee beans', replace: 'apples, coffee beans, butter, cheese' }
    ])
  )
})

test('never shows raw edit code as an answer', (t) => {
  const turn = resolveAskTurn(
    createAskTurn(1, 'Add an action item for Omar'),
    'Action items: Priya',
    JSON.stringify({ kind: 'answer', answer: '{ "find": "Omar", "replace": "Omar" }', edits: [] })
  )
  t.is(turn.error, 'newBlock')
})

test('treats corrections as change requests and never shows a false claim', (t) => {
  const note = 'Anna is moving to Berlin in June.'
  t.ok(isAskChangeRequest('Anna is moving in July, not June'))
  t.ok(isAskChangeRequest('It should say July'))
  t.absent(isAskChangeRequest('Is Anna not moving?'))
  const claim = JSON.stringify({
    kind: 'answer',
    answer: 'Anna is moving in July. The note was corrected.',
    edits: []
  })
  t.ok(claimsAskChange('The budget has been increased to 5,000.'))
  t.ok(shouldRetryAskForEdits(note, 'Update it please', claim))
  const turn = resolveAskTurn(createAskTurn(1, 'Anna is moving in July, not June'), note, claim)
  t.is(turn.error, 'unreliable')
})

test('an instruction that only got an answer is reported, not shown as an answer', (t) => {
  const note = 'Need to call the dentist and book the car service.'
  const echo = JSON.stringify({ kind: 'answer', answer: 'The dentist is in the note.', edits: [] })
  t.is(resolveAskTurn(createAskTurn(1, 'Remove the dentist'), note, echo).error, 'unreliable')
  t.is(resolveAskTurn(createAskTurn(2, 'Remove the dentist?'), note, echo).kind, ASK_KIND.ANSWER)
  t.is(resolveAskTurn(createAskTurn(3, 'Who do I need to call?'), note, echo).kind, ASK_KIND.ANSWER)
})

test('drops an edit that only replays a worked example from the prompt', (t) => {
  const attendees = 'Actions\nAnna, Ben, Cara reviewed the analytics.'
  const echoed = JSON.stringify({
    kind: 'edits',
    answer: 'remove Ben from Anna, Ben, Cara',
    edits: [{ find: 'Ben, ', replace: '' }]
  })
  const turn = resolveAskTurn(
    createAskTurn(1, 'remove the line about the analytics review'),
    attendees,
    echoed
  )
  t.is(turn.kind, ASK_KIND.NOT_FOUND)
  t.is(turn.editedText, null)
  t.is(turn.answer, '')
})

test('keeps an example-shaped edit the user actually asked for', (t) => {
  const note = 'We meet on Monday.'
  const raw = JSON.stringify({
    kind: 'edits',
    answer: 'Changed the day.',
    edits: [{ find: 'Monday', replace: 'Friday' }]
  })
  const turn = resolveAskTurn(createAskTurn(1, 'change Monday to Friday'), note, raw)
  t.is(turn.kind, ASK_KIND.EDITS)
  t.is(turn.editedText, 'We meet on Friday.')
})

test('a deletion has to touch text the user named', (t) => {
  t.ok(
    validateAskEdits('remove the tram tour', [{ find: '3. Tram tour on Thursday', replace: '' }])
  )
  t.absent(
    validateAskEdits('remove the line about the analytics', [{ find: 'Ben, ', replace: '' }])
  )
})

test('keeps only the paragraph an answer commits to', (t) => {
  const note = 'Ben rated her a strong hire. Tom rated her a hire.'
  const padded = JSON.stringify({
    kind: 'answer',
    answer: 'Tom rated her a hire.\n\nThe note says Ben rated her a strong hire.',
    edits: []
  })
  t.is(
    resolveAskTurn(createAskTurn(1, 'What did Tom rate her?'), note, padded).answer,
    'Tom rated her a hire.'
  )
  const rewritten = JSON.stringify({ kind: 'answer', answer: 'One.\n\nTwo.', edits: [] })
  t.is(resolveAskTurn(createAskTurn(2, 'rewrite this'), note, rewritten).answer, 'One.\n\nTwo.')
})

const fakeModel = (replies) => {
  const calls = []
  const complete = async (params) => {
    calls.push(params)
    return replies.shift() ?? ''
  }
  return { calls, complete }
}

test('questions get a plain-text answer without the edit format', async (t) => {
  const { calls, complete } = fakeModel(['<think>\n\n</think>\n\nThe budget is 400 dollars.'])
  const raw = await runAsk({ note: NOTE, question: 'Who chose the venue?', complete })
  t.is(calls.length, 1)
  t.absent(calls[0].responseFormat)
  t.ok(calls[0].history.at(-1).content.endsWith('/no_think'))
  t.alike(JSON.parse(raw), {
    kind: ASK_KIND.ANSWER,
    answer: 'The budget is 400 dollars.',
    edits: []
  })
})

test('calculations think first and fall back when thinking never ends', async (t) => {
  const thought = fakeModel(['<think>400 + 0</think>\n\n400 dollars.'])
  const raw = await runAsk({
    note: NOTE,
    question: 'How much is the budget in total?',
    complete: thought.complete
  })
  t.is(thought.calls.length, 1)
  t.absent(thought.calls[0].history.at(-1).content.includes('/no_think'))
  t.is(JSON.parse(raw).answer, '400 dollars.')

  const cut = fakeModel(['<think>400 + 0 and then', 'About 400 dollars.'])
  const fallback = await runAsk({
    note: NOTE,
    question: 'How much is the budget in total?',
    complete: cut.complete
  })
  t.is(cut.calls.length, 2)
  t.ok(cut.calls[1].history.at(-1).content.includes('400 + 0 and then'))
  t.is(JSON.parse(fallback).answer, 'About 400 dollars.')

  t.ok(shouldAskThink('And for two?', [{ question: 'How much per person?', reply: '' }]))
  t.ok(shouldAskThink('Add those two together.'))
  t.ok(isAskQuestion('Add those two together.'))
  t.absent(isAskQuestion('add Sam to the attendees'))
  t.absent(isAskQuestion('dinner is at 7pm'))
  t.absent(shouldAskThink('Who is coming?', [{ question: 'How much per person?', reply: '' }]))
})

test('answers mark missing details and hand change requests to the edit path', async (t) => {
  t.alike(parseAskAnswerOutput('NOT_FOUND: The note covers the meeting and budget.'), {
    kind: ASK_KIND.NOT_FOUND,
    answer: 'The note covers the meeting and budget.'
  })
  t.is(parseAskAnswerOutput('CHANGE_NOTE').kind, 'change')
  t.is(parseAskAnswerOutput('<think>still going'), null)
  t.alike(parseAskAnswerOutput('Open tasks:\n\n- [ ] Book the hotel\n- **Pack**'), {
    kind: ASK_KIND.ANSWER,
    answer: 'Open tasks:\n- Book the hotel\n- Pack'
  })

  const { calls, complete } = fakeModel([
    'CHANGE_NOTE',
    '{"kind":"edits","answer":"","edits":[{"find":"400","replace":"500"}]}'
  ])
  const raw = await runAsk({ note: NOTE, question: 'Can the budget be 500 dollars?', complete })
  t.is(calls.length, 2)
  t.ok(calls[1].responseFormat)
  t.is(JSON.parse(raw).kind, ASK_KIND.EDITS)

  const statement = fakeModel([
    '{"kind":"edits","answer":"","edits":[{"find":"400","replace":"500"}]}'
  ])
  await runAsk({
    note: NOTE,
    question: 'the budget is 500 dollars now',
    complete: statement.complete
  })
  t.is(statement.calls.length, 1)
  t.ok(statement.calls[0].responseFormat)
})

test('keeps list lines and an unpunctuated last line in an answer', (t) => {
  const answer = 'Open:\n- Who removes the boiler?\n- Can the electrician move the bell?\nTotal 2'
  t.is(parseAskOutput(JSON.stringify({ kind: 'answer', answer, edits: [] })).answer, answer)
})

test('drops a hedge only when an answer follows it', (t) => {
  t.is(
    stripAskHedge('The note does not mention the total. However, 3 × 142 = 426 EUR.'),
    '3 × 142 = 426 EUR.'
  )
  const honest = 'The note does not mention a wifi password.'
  t.is(stripAskHedge(honest), honest)
})

test('history fits the context left after the note, not a fixed size', (t) => {
  const turns = Array.from({ length: 12 }, (_, index) => ({
    id: index,
    question: `Question ${index}?`,
    status: 'done',
    reply: JSON.stringify({
      kind: 'answer',
      answer: 'An answer of a few words. '.repeat(8),
      edits: []
    })
  }))
  t.absent(hasDroppedAskTurns(turns, NOTE))
  t.ok(hasDroppedAskTurns(turns, 'Long note line.\n'.repeat(500)))
  t.ok(trimAskNote('字'.repeat(8000)).length < 4000)
})

test('thinking is off through the SDK except on thinking turns, json_schema and tool requests', (t) => {
  for (const params of [ASK_ANSWER_PARAMS, getAskFullTextParams(NOTE)]) {
    t.is(params.reasoning_budget, 0)
  }
  t.absent('reasoning_budget' in getAskGenerationParams(NOTE), 'json_schema requests break with it')
  t.absent('reasoning_budget' in ASK_TOOL_PARAMS, 'tool calls break with it')
  const short = [{ role: 'user', content: 'What is 2 + 2?' }]
  const roomy = fitAskPredict(short, ASK_THINK_PARAMS)
  t.is(roomy.reasoning_budget, ASK_THINK_BUDGET)
  t.ok(roomy.predict > ASK_THINK_BUDGET)

  const tight = fitAskPredict([{ role: 'user', content: 'x'.repeat(10500) }], ASK_THINK_PARAMS)
  t.ok(tight.predict < ASK_THINK_PARAMS.predict)
  t.ok(tight.reasoning_budget > 0 && tight.reasoning_budget < ASK_THINK_BUDGET)
  t.ok(tight.reasoning_budget < tight.predict)

  const full = fitAskPredict([{ role: 'user', content: 'x'.repeat(11700) }], ASK_THINK_PARAMS)
  t.is(full.reasoning_budget, 0)
  t.is(fitAskPredict(short, ASK_ANSWER_PARAMS).reasoning_budget, 0)
})

test('a cached Ask replays clean answers exactly as sent, so the next turn extends the cache', async (t) => {
  const first = fakeModel(['Priya chose it.'])
  const raw = await runAsk({
    note: NOTE,
    question: 'Who chose the venue?',
    complete: first.complete,
    cache: true
  })
  t.is(first.calls[0].kvCache, true)
  const sent = first.calls[0].history
  const turn = resolveAskTurn(createAskTurn(1, 'Who chose the venue?'), NOTE, raw)
  t.alike(turn.replay, { question: sent.at(-1).content, reply: 'Priya chose it.' })

  const second = fakeModel(['On Tuesday.'])
  await runAsk({
    note: NOTE,
    turns: getAskHistory([turn]),
    question: 'When did we meet?',
    complete: second.complete,
    cache: true
  })
  t.alike(second.calls[0].history.slice(0, -1), [
    ...sent,
    { role: 'assistant', content: 'Priya chose it.' }
  ])

  const uncached = fakeModel(['On Tuesday.'])
  await runAsk({
    note: NOTE,
    turns: getAskHistory([turn]),
    question: 'When did we meet?',
    complete: uncached.complete
  })
  t.absent('kvCache' in uncached.calls[0])
  t.is(uncached.calls[0].history[1].content, 'Who chose the venue?')
})

test('hedged, not-found and thinking answers are never replayed', async (t) => {
  for (const [question, output] of [
    ['Who chose the venue?', "The note doesn't mention it. However, Priya did."],
    ['Who chose the venue?', 'NOT_FOUND: The note does not say.']
  ]) {
    const { complete } = fakeModel([output])
    const raw = await runAsk({ note: NOTE, question, complete, cache: true })
    t.absent(JSON.parse(raw).replay, output)
  }
  const thought = fakeModel(['<think>400</think>\n\n400 dollars.'])
  const raw = await runAsk({
    note: NOTE,
    question: 'How much is the budget in total?',
    complete: thought.complete,
    cache: true
  })
  t.absent('kvCache' in thought.calls[0])
  t.absent(JSON.parse(raw).replay)
})
