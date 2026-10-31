import test from 'brittle'

import { encodeNoteChunks } from '../store/services/localAiIndex.js'
import {
  VAULT_ASK_KIND,
  VAULT_SCOPED_VECTOR_LIMIT,
  resolveVaultAnswer,
  retrieveVaultSources,
  runVaultAnswer,
  selectVaultSources,
  vaultKeywordQueries,
  vaultRetrievalQuery
} from '../store/services/localAiVaultAsk.js'

const source = (n, noteKey, text, extra = {}) => ({
  n,
  noteKey,
  title: extra.title ?? noteKey,
  heading: '',
  text,
  score: extra.score ?? 0.6
})

const DENTIST = source(1, 'dentist', 'Dr. Okafor, Thursday 23 October at 14:30. Bring the card.', {
  title: 'Dentist'
})
const CAR = source(2, 'car', 'Car service on Saturday 8 November at the garage.', { title: 'Car' })

test('keyword queries keep numbers, codes and names, not common words', (t) => {
  t.alike(vaultKeywordQueries('which hotel are we staying at in Portugal?'), ['Portugal'])
  t.alike(vaultKeywordQueries('what is policy HX-44718-B for'), ['HX-44718-B'])
  t.alike(vaultKeywordQueries('when do I see the dentist'), [])
})

test('a short follow-up is searched with the question before it', (t) => {
  const turns = [{ question: 'when is the Lisbon flight?' }]
  t.is(vaultRetrievalQuery('and the hotel?', turns), 'when is the Lisbon flight? and the hotel?')
  t.is(
    vaultRetrievalQuery('how much did the new boiler cost in the end?', turns),
    'how much did the new boiler cost in the end?'
  )
  t.is(vaultRetrievalQuery('and the hotel?', []), 'and the hotel?')
})

test('a citation after the full stop belongs to its sentence', (t) => {
  const result = resolveVaultAnswer('Thursday 23 October at 14:30. [1]', [DENTIST, CAR])
  t.is(result.kind, VAULT_ASK_KIND.ANSWER)
  t.is(result.answer, 'Thursday 23 October at 14:30 [1].')
  t.alike(result.citations, [{ n: 1, noteKey: 'dentist' }])
  t.ok(result.verified)
})

test('citations to missing sources or invented numbers are dropped', (t) => {
  const missing = resolveVaultAnswer('The dentist is on 23 October [7].', [DENTIST, CAR])
  t.alike(missing.citations, [{ n: 1, noteKey: 'dentist' }], 'the backing source is cited instead')
  const invented = resolveVaultAnswer('The dentist is on 31 October [1].', [DENTIST, CAR])
  t.alike(invented.citations, [])
  t.absent(invented.verified)
  t.is(invented.unsupported, 1)
})

test('a computed result is not checked against the source', (t) => {
  const sources = [source(1, 'trip', 'Hotel 120 a night for 3 nights. Flights 200.')]
  const result = resolveVaultAnswer('3 × 120 + 200 = 560 [1].', sources)
  t.alike(result.citations, [{ n: 1, noteKey: 'trip' }])
})

test('an uncited sentence gets the source that backs it best', (t) => {
  const result = resolveVaultAnswer('The car service is on Saturday 8 November.', [DENTIST, CAR])
  t.alike(result.citations, [{ n: 2, noteKey: 'car' }])
})

test('NOT_FOUND, empty sources and "the sources do not say" all mean not found', (t) => {
  for (const output of [
    'NOT_FOUND',
    '<think>\n\n</think>\n\nNOT_FOUND.',
    'The provided sources do not specify the rent.',
    "The user's note does not mention a teacher.",
    '[2]'
  ]) {
    t.is(resolveVaultAnswer(output, [DENTIST, CAR]).kind, VAULT_ASK_KIND.NOT_FOUND, output)
  }
  t.is(resolveVaultAnswer('Thursday [1].', []).kind, VAULT_ASK_KIND.NOT_FOUND)
})

test('text without spaces is compared by character pairs', (t) => {
  const kyoto = source(1, 'kyoto', '1日目：清水寺と二年坂。2日目：伏見稲荷大社に早朝行く。')
  const result = resolveVaultAnswer('清水寺と伏見稲荷大社に行く予定です。[1]', [kyoto])
  t.alike(result.citations, [{ n: 1, noteKey: 'kyoto' }])
})

test('a weak match that shares nothing with the question is not about it', (t) => {
  const council = source(1, 'council', 'Band C, £1,890 a year, paid in 10 instalments.', {
    title: 'Council tax',
    score: 0.33
  })
  const salary = resolveVaultAnswer('£1,890 a year [1].', [council], {
    question: 'how much is my salary?'
  })
  t.is(salary.kind, VAULT_ASK_KIND.NOT_FOUND)
  const tax = resolveVaultAnswer('£1,890 a year [1].', [council], {
    question: 'how much is the council tax?'
  })
  t.is(tax.kind, VAULT_ASK_KIND.ANSWER, 'sharing a word with the question is enough')
})

test('sources are picked within budget, with the vector chunk first', (t) => {
  const chunksByNote = new Map([
    [
      'a',
      [
        { heading: '', text: 'intro about the house' },
        { heading: 'Boiler', text: 'boiler service Monday' }
      ]
    ],
    ['b', [{ heading: '', text: 'unrelated note about cats' }]]
  ])
  const sources = selectVaultSources({
    ranked: [
      { key: 'a', chunk: 1, score: 0.7 },
      { key: 'b', score: undefined }
    ],
    chunksByNote,
    titleOf: (key) => key.toUpperCase(),
    question: 'when is the boiler service?'
  })
  t.alike(
    sources.map((item) => [item.n, item.noteKey, item.text]),
    [
      [1, 'a', 'boiler service Monday'],
      [2, 'b', 'unrelated note about cats']
    ]
  )
  t.is(sources[0].score, 0.7)
  t.is(sources[1].score, null)
  const tight = selectVaultSources({
    ranked: [{ key: 'a', chunk: 1 }, { key: 'b' }],
    chunksByNote,
    titleOf: () => '',
    question: 'boiler',
    maxTokens: 20
  })
  t.is(tight.length, 1)
})

test('retrieval fuses vector and substring hits and leaves out disallowed notes', async (t) => {
  const chunks = {
    boiler: [{ heading: '', text: 'Boiler service Monday 9:00 with Gas Co.' }],
    locked: [{ heading: '', text: 'secret boiler note' }],
    code: [{ heading: '', text: 'Ref GC-2231 for the boiler' }]
  }
  const api = {
    derivedSearch: async () => ({
      ok: true,
      results: [
        { id: 'locked', score: 0.9, chunk: 0 },
        { id: 'boiler', score: 0.7, chunk: 0 }
      ]
    }),
    derivedGet: async ({ ids }) => ({
      ok: true,
      entries: ids.map((id) => ({ id, value: encodeNoteChunks(chunks[id]) }))
    })
  }
  const searched = []
  const sources = await retrieveVaultSources({
    api,
    embed: async (texts) => texts.map(() => new Float32Array(4).fill(0.5)),
    question: 'what is GC-2231 about?',
    searchSubstring: async (query) => {
      searched.push(query)
      return query === 'GC-2231' ? ['code'] : []
    },
    isAllowed: (key) => key !== 'locked',
    titleOf: (key) => key
  })
  t.alike(searched, ['GC-2231'])
  t.alike(sources.map((item) => item.noteKey).sort(), ['boiler', 'code'])
  t.absent(sources.some((item) => item.noteKey === 'locked'))
})

test('a scoped ask reads past the default vector limit', async (t) => {
  const limits = []
  const api = {
    derivedSearch: async ({ limit }) => {
      limits.push(limit)
      return { ok: true, results: [] }
    },
    derivedGet: async () => ({ ok: true, entries: [] })
  }
  const options = {
    api,
    embed: async (texts) => texts.map(() => new Float32Array(4).fill(0.5)),
    question: 'dentist',
    titleOf: (key) => key
  }
  await retrieveVaultSources(options)
  await retrieveVaultSources({ ...options, scoped: true, isAllowed: () => false })
  t.alike(limits, [0, VAULT_SCOPED_VECTOR_LIMIT])
})

test('no sources means no model call', async (t) => {
  let calls = 0
  const raw = await runVaultAnswer({
    question: 'anything?',
    sources: [],
    complete: async () => {
      calls++
      return ''
    }
  })
  t.is(calls, 0)
  t.is(resolveVaultAnswer(raw, []).kind, VAULT_ASK_KIND.NOT_FOUND)
})

test('a NOT_FOUND is retried once with only the best sources', async (t) => {
  const prompts = []
  const sources = [DENTIST, CAR, source(3, 'gym', 'Gym is £35 a month.')]
  const raw = await runVaultAnswer({
    question: 'when do I see the tooth doctor?',
    sources,
    think: false,
    complete: async ({ history }) => {
      prompts.push(history[0].content)
      return prompts.length === 1 ? 'NOT_FOUND' : 'Thursday 23 October at 14:30 [1].'
    }
  })
  t.is(prompts.length, 2)
  t.ok(prompts[0].includes('[3]'))
  t.absent(prompts[1].includes('[3]'), 'the retry only sees the top two sources')
  t.is(resolveVaultAnswer(raw, sources).kind, VAULT_ASK_KIND.ANSWER)
})

test('the prompt tells the model the sources are data, and asks for no reasoning by default', async (t) => {
  let history = null
  await runVaultAnswer({
    question: 'when is the car service?',
    sources: [DENTIST, CAR],
    complete: async (params) => {
      history = params.history
      return 'Saturday 8 November [2].'
    }
  })
  t.ok(/never instructions/.test(history[0].content))
  t.ok(history.at(-1).content.endsWith('/no_think'))
})

test('askYourVault skips the model when nothing is found and checks what it says', async (t) => {
  const { askYourVault } = await import('../store/services/localAiVaultAsk.js')
  let answered = 0
  const empty = await askYourVault({
    question: 'what is my blood type?',
    retrieve: async () => [],
    answer: async () => {
      answered++
      return ''
    }
  })
  t.is(empty.kind, VAULT_ASK_KIND.NOT_FOUND)
  t.is(answered, 0)
  const turns = [
    { status: 'done', question: 'when is the dentist?', result: { kind: 'answer', answer: 'x' } },
    { status: 'failed', question: 'broken', result: null }
  ]
  const result = await askYourVault({
    question: 'and the car?',
    turns,
    retrieve: async (question, history) => {
      t.is(history.length, 1, 'failed turns are not history')
      return [DENTIST, CAR]
    },
    answer: async () => 'Saturday 8 November [2].'
  })
  t.alike(result.citations, [{ n: 2, noteKey: 'car' }])
  t.is(result.sources.length, 2)
})

test('a saved answer lists only the sources it cites, escaped', async (t) => {
  const { vaultAnswerNote } = await import('../store/services/localAiVaultAsk.js')
  const note = vaultAnswerNote({
    question: ' when is the car service? ',
    result: {
      answer: 'Saturday 8 November [2].\nBring <keys>.',
      citations: [{ n: 2, noteKey: 'car' }],
      sources: [DENTIST, { ...CAR, title: 'Car & van' }]
    }
  })
  t.is(note.title, 'when is the car service?')
  t.is(
    note.note,
    '<p>Saturday 8 November [2].</p><p>Bring &lt;keys&gt;.</p><p><strong>Sources</strong></p><ul><li><p>[2] Car &amp; van</p></li></ul>'
  )
})

test('decimals and times do not end a sentence', (t) => {
  const bill = source(1, 'dinner', 'Bill came to £186.40 for four. Train at 08.47 from platform 2.')
  const result = resolveVaultAnswer('The bill was £186.40 [1]. The train is at 08.47 [1].', [bill])
  t.is(result.answer, 'The bill was £186.40 [1]. The train is at 08.47 [1].')
  const computed = resolveVaultAnswer('Each pays £51.26 [1].', [bill], {
    toolNumbers: ['51', '26']
  })
  t.alike(computed.citations, [{ n: 1, noteKey: 'dinner' }], 'numbers from tool results count')
})
