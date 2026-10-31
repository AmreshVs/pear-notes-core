// Everyday questions people ask about their own notes: totals, per-person
// splits, durations, conversions, follow-ups that lean on the previous answer,
// and general-knowledge questions the note itself does not answer.
import { htmlToNoteText } from '../store/services/localAiPrompts.js'

const list = (items) => `<ul>${items.map((item) => `<li><p>${item}</p></li>`).join('')}</ul>`
const tasks = (items) =>
  `<ul data-type="taskList">${items
    .map(
      ([done, text]) =>
        `<li data-checked="${done}" data-type="taskItem"><label><input type="checkbox"><span></span></label><div><p>${text}</p></div></li>`
    )
    .join('')}</ul>`

const TRIP = htmlToNoteText(
  [
    '<h1>Portugal trip with Maya and Leo</h1>',
    '<p>Dates: Friday 10 October to Sunday 19 October. Three of us travelling.</p>',
    '<h2>Flights</h2>',
    list([
      'London to Lisbon, TAP TP1351, 10 Oct 07:40, 3 tickets at 142 EUR each',
      'Porto to London, easyJet EZY8028, 19 Oct 18:15, 3 tickets at 96 EUR each',
      'Checked bag: 35 EUR per bag, we need 2 bags each way'
    ]),
    '<h2>Stays</h2>',
    list([
      'Lisbon, Casa Alfama apartment, 10–14 Oct, 4 nights at 165 EUR a night',
      'Porto, Ribeira Guesthouse, 14–19 Oct, 5 nights at 120 EUR a night, breakfast included'
    ]),
    '<h2>Getting between cities</h2>',
    '<p>Alfa Pendular train Lisbon to Porto on 14 Oct at 11:09, 2h 49m, 31.50 EUR per person in 2nd class. First class is 44 EUR.</p>',
    '<h2>Food</h2>',
    '<p>Leo is vegetarian. Maya wants to try pastel de nata at Manteigaria and a francesinha in Porto.</p>',
    '<h2>Things to do</h2>',
    list([
      'Tram 28 in Lisbon, 3 EUR a ride',
      'Livraria Lello in Porto, tickets 10 EUR, book online',
      'Douro valley tour on 17 Oct, 95 EUR per person with lunch'
    ]),
    '<h2>To do before leaving</h2>',
    tasks([
      ['true', 'Book flights'],
      ['true', 'Book Lisbon apartment'],
      ['false', 'Book Porto guesthouse'],
      ['false', 'Buy travel insurance (about 28 EUR each)'],
      ['false', 'Check passport expiry for Leo']
    ]),
    '<h2>Notes</h2>',
    '<p>Exchange rate last checked: 1 GBP = 1.17 EUR. Maya pays for the flights, Leo pays for the stays.</p>'
  ].join('')
)

const RENOVATION = htmlToNoteText(
  [
    '<h1>Home renovation</h1>',
    '<p>Contractor: Novak Builders, contact Petra Novak. Total quoted: 18,400 GBP.</p>',
    '<h2>Kitchen</h2>',
    '<p>New oak worktops 2,350 GBP. Plumber quoted 640 GBP to move the sink. Tiles: 14 square metres at 38 GBP per square metre.</p>',
    '<h2>Bathroom</h2>',
    '<p>Shower tray 410 GBP. Wall tiles 22 square metres at 29 GBP per square metre.</p>',
    '<h2>Garden</h2>',
    '<p>Patio: 12 square metres of sandstone at 45 GBP per square metre plus labour 900 GBP. Fence: 8 panels at 34 GBP each.</p>',
    '<h2>Payments so far</h2>',
    list([
      '2 Sep deposit 4,000 GBP',
      '30 Sep stage payment 5,500 GBP',
      '28 Oct stage payment 4,200 GBP'
    ])
  ].join('')
)

const RECIPE = htmlToNoteText(
  [
    '<h1>Pancakes</h1>',
    '<h2>Ingredients</h2>',
    list(['2 eggs', '300ml milk', '200g plain flour', 'Pinch of salt']),
    '<h2>Method</h2>',
    '<ol><li><p>Whisk the eggs and milk</p></li><li><p>Add the flour slowly</p></li><li><p>Rest the batter for 20 minutes</p></li><li><p>Cook 3 minutes a side on medium heat</p></li></ol>'
  ].join('')
)

const reply = (answer) => JSON.stringify({ kind: 'answer', answer, edits: [] })
const NO_HEDGE = ['does not mention', 'not mentioned', "doesn't mention", 'does not provide']

export const CASES = [
  {
    id: 'm-flights-total',
    group: 'math',
    note: TRIP,
    question: 'How much do the flight tickets cost in total for the three of us?',
    expect: { kind: 'answer', answerIncludes: ['714'], answerExcludes: NO_HEDGE }
  },
  {
    id: 'm-bags',
    group: 'math',
    note: TRIP,
    question: 'How much will the checked bags cost?',
    expect: { kind: 'answer', answerIncludes: ['140'] }
  },
  {
    id: 'm-stays-total',
    group: 'math',
    note: TRIP,
    question: "What's the total for both stays?",
    expect: { kind: 'answer', answerIncludes: ['1260'], answerExcludes: NO_HEDGE }
  },
  {
    id: 'm-train-group',
    group: 'math',
    note: TRIP,
    question: 'What do the train tickets to Porto cost for all of us in 2nd class?',
    expect: { kind: 'answer', answerIncludesAny: ['94.5', '94,5'] }
  },
  {
    id: 'm-trip-days',
    group: 'math',
    note: TRIP,
    question: 'How many days is the whole trip?',
    expect: { kind: 'answer', answerIncludes: ['10'], answerExcludes: NO_HEDGE }
  },
  {
    id: 'm-convert',
    group: 'math',
    note: TRIP,
    question: "What's 1,200 EUR in pounds at the rate in the note?",
    expect: { kind: 'answer', answerIncludesAny: ['1025', '1026'], answerExcludes: NO_HEDGE }
  },
  {
    id: 'm-arrival',
    group: 'math',
    note: TRIP,
    question: 'What time does the train get to Porto?',
    expect: { kind: 'answer', answerIncludesAny: ['13:58', '1:58'] }
  },
  {
    id: 'm-paid',
    group: 'math',
    note: RENOVATION,
    question: 'How much have we paid so far?',
    expect: { kind: 'answer', answerIncludes: ['13700'] }
  },
  {
    id: 'm-left',
    group: 'math',
    note: RENOVATION,
    question: 'How much is left to pay on the quote?',
    expect: { kind: 'answer', answerIncludes: ['4700'], answerExcludes: NO_HEDGE }
  },
  {
    id: 'm-garden',
    group: 'math',
    note: RENOVATION,
    question: 'What will the garden cost altogether?',
    expect: { kind: 'answer', answerIncludes: ['1712'] }
  },
  {
    id: 'm-tiles',
    group: 'math',
    note: RENOVATION,
    question: 'How much are the tiles for the kitchen and bathroom together?',
    expect: { kind: 'answer', answerIncludes: ['1170'] }
  },
  {
    id: 'm-double',
    group: 'math',
    note: RECIPE,
    question: 'How much flour and milk do I need for a double batch?',
    expect: { kind: 'answer', answerIncludes: ['400', '600'] }
  },
  {
    id: 'f-per-person',
    group: 'follow-up',
    note: TRIP,
    turns: [
      {
        question: "What's the total for both stays?",
        reply: reply('4 × 165 + 5 × 120 = 1,260 EUR for both stays.')
      }
    ],
    question: 'How much is that per person?',
    expect: { kind: 'answer', answerIncludes: ['420'], answerExcludes: NO_HEDGE }
  },
  {
    id: 'f-and-porto',
    group: 'follow-up',
    note: TRIP,
    turns: [
      {
        question: 'How many nights are we in Lisbon?',
        reply: reply('4 nights, 10 to 14 October.')
      }
    ],
    question: 'And in Porto?',
    expect: { kind: 'answer', answerIncludes: ['5'] }
  },
  {
    id: 'f-after-notfound',
    group: 'follow-up',
    note: TRIP,
    turns: [
      {
        question: 'What is the hotel wifi password?',
        reply: JSON.stringify({
          kind: 'notFound',
          answer: 'The note does not include a wifi password. It covers flights, stays and plans.',
          edits: []
        })
      }
    ],
    question: 'Which tasks are still open?',
    expect: {
      kind: 'answer',
      answerIncludes: ['Porto guesthouse', 'insurance', 'passport'],
      answerExcludes: ['Book flights', ...NO_HEDGE]
    }
  },
  {
    id: 'g-pastel',
    group: 'general',
    note: TRIP,
    question: 'What is pastel de nata?',
    expect: { kind: 'answer', answerIncludes: ['custard'], answerExcludes: NO_HEDGE }
  },
  {
    id: 'g-francesinha',
    group: 'general',
    note: TRIP,
    question: 'Is a francesinha OK for Leo?',
    expect: { kind: 'answer', answerIncludesAny: ['meat', 'not vegetarian', 'no,', 'not suitable'] }
  },
  {
    id: 'g-oat-milk',
    group: 'general',
    note: RECIPE,
    question: 'Can I use oat milk instead?',
    expect: { kind: 'answer', answerIncludesAny: ['yes', 'you can'] }
  },
  {
    id: 'g-tip',
    group: 'general',
    note: RENOVATION,
    question: "What's 15% of the plumber's quote?",
    expect: { kind: 'answer', answerIncludes: ['96'] }
  },
  {
    id: 'n-wifi',
    group: 'notFound',
    note: TRIP,
    question: 'what is the hotel wifi password?',
    expect: { kind: 'notFound' }
  },
  {
    id: 'n-petra-phone',
    group: 'notFound',
    note: RENOVATION,
    question: "What's Petra's phone number?",
    expect: { kind: 'notFound' }
  }
]
