// Cases built from real Tiptap editor HTML, rendered with the same
// htmlToNoteText() the apps feed to Ask. This is what the model actually sees.
// Pass --flat to render with the old flat htmlToParagraphs() instead, which is
// how the structure-preserving change was measured.
import { htmlToNoteText, htmlToParagraphs } from '../store/services/localAiPrompts.js'

const PROJECT_HTML = [
  '<h1>Website redesign — kickoff</h1>',
  '<p>Monday 14 April, 10:00 in the Oslo room.</p>',
  '<p>Attendees: Anna, Ben, Priya, Tom</p>',
  '<h2>Scope</h2>',
  '<ul><li><p>New landing page and pricing page</p></li>',
  '<li><p>Keep the existing blog templates</p></li>',
  '<li><p>Move the docs site to the new nav</p></li></ul>',
  '<h2>Budget and timeline</h2>',
  '<p>Budget is 12,000 EUR. Design phase runs for three weeks, build for five.</p>',
  '<p>We ship the beta on 2 June and the public launch on 20 June.</p>',
  '<h2>Actions</h2>',
  '<ul data-type="taskList">',
  '<li data-checked="true" data-type="taskItem"><label><input type="checkbox" checked><span></span></label><div><p>Anna sends the brief</p></div></li>',
  '<li data-checked="false" data-type="taskItem"><label><input type="checkbox"><span></span></label><div><p>Ben books the user tests for week two</p></div></li>',
  '<li data-checked="false" data-type="taskItem"><label><input type="checkbox"><span></span></label><div><p>Priya reviews the analytics before Friday</p></div></li>',
  '</ul>'
].join('')

const TRIP_HTML = [
  '<h1>Lisbon</h1>',
  '<h2>Flights</h2>',
  '<p>Out Tuesday 9am, back Sunday 6pm.</p>',
  '<h2>Packing</h2>',
  '<ul><li><p>Adapter</p></li><li><p>Sun cream</p></li><li><p>Running shoes</p></li></ul>',
  '<h2>Bookings</h2>',
  '<ol><li><p>Hotel Baixa, three nights</p></li><li><p>Airport transfer</p></li><li><p>Tram tour on Thursday</p></li></ol>'
].join('')

const RECIPE_HTML = [
  '<h1>Pancakes</h1>',
  '<h2>Ingredients</h2>',
  '<ul><li><p>2 eggs</p></li><li><p>300ml milk</p></li><li><p>200g plain flour</p></li><li><p>Pinch of salt</p></li></ul>',
  '<h2>Method</h2>',
  '<ol><li><p>Whisk the eggs and milk</p></li><li><p>Add the flour slowly</p></li><li><p>Rest the batter for 20 minutes</p></li><li><p>Cook 3 minutes a side on medium heat</p></li></ol>'
].join('')

const STRUCT = !process.argv.includes('--flat')
const asText = (html) => (STRUCT ? htmlToNoteText(html) : htmlToParagraphs(html).join('\n'))

export const PROJECT = asText(PROJECT_HTML)
export const TRIP = asText(TRIP_HTML)
export const RECIPE = asText(RECIPE_HTML)

export const CASES = [
  // structure-dependent questions — impossible once structure is stripped
  {
    id: 'r-tasks-left',
    group: 'structure',
    note: PROJECT,
    question: 'which tasks are still open?',
    expect: { kind: 'answer', answerIncludes: ['Ben'], answerExcludes: ['Anna sends the brief'] }
  },
  {
    id: 'r-tasks-done',
    group: 'structure',
    note: PROJECT,
    question: 'what have we finished already?',
    expect: { kind: 'answer', answerIncludes: ['brief'] }
  },
  {
    id: 'r-second-bullet',
    group: 'structure',
    note: TRIP,
    question: 'what is the second thing on the packing list?',
    expect: { kind: 'answer', answerIncludes: ['sun cream'] }
  },
  {
    id: 'r-step-three',
    group: 'structure',
    note: RECIPE,
    question: 'what is step 3 of the method?',
    expect: { kind: 'answer', answerIncludes: ['rest'] }
  },
  {
    id: 'r-section',
    group: 'structure',
    note: RECIPE,
    question: 'list the ingredients only',
    expect: { kind: 'answer', answerIncludes: ['eggs', 'flour'], answerExcludes: ['whisk'] }
  },
  {
    id: 'r-edit-bullet',
    group: 'structure',
    note: TRIP,
    question: 'add a towel to the packing list',
    expect: {
      kind: 'edits',
      textIncludes: ['owel'],
      keepsAll: ['Adapter', 'Sun cream', 'Running shoes', 'Hotel Baixa']
    }
  },
  {
    id: 'r-edit-remove-bullet',
    group: 'structure',
    note: TRIP,
    question: 'remove the tram tour from the bookings',
    expect: {
      kind: 'edits',
      textExcludes: ['Tram tour'],
      keepsAll: ['Hotel Baixa', 'Airport transfer', 'Adapter']
    }
  },
  {
    id: 'r-edit-step',
    group: 'structure',
    note: RECIPE,
    question: 'rest the batter for 30 minutes instead of 20',
    expect: {
      kind: 'edits',
      textIncludes: ['30 minutes'],
      keepsAll: ['Whisk the eggs', 'Cook 3 minutes']
    }
  },

  // ordinary content questions on the same real notes
  {
    id: 'r-q-launch',
    group: 'answer',
    note: PROJECT,
    question: 'when do we launch publicly?',
    expect: { kind: 'answer', answerIncludes: ['20 June'] }
  },
  {
    id: 'r-q-flour',
    group: 'answer',
    note: RECIPE,
    question: 'how much flour?',
    expect: { kind: 'answer', answerIncludes: ['200g'] }
  },
  {
    id: 'r-q-notfound',
    group: 'notFound',
    note: TRIP,
    question: 'what is the hotel wifi password?',
    expect: { kind: 'notFound' }
  },
  {
    id: 'r-e-budget',
    group: 'edits',
    note: PROJECT,
    question: 'budget is now 15,000 EUR',
    expect: { kind: 'edits', text: PROJECT.replace('12,000 EUR', '15,000 EUR') }
  },
  {
    id: 'r-e-room',
    group: 'edits',
    note: PROJECT,
    question: 'it was the Bergen room, not Oslo',
    expect: { kind: 'edits', text: PROJECT.replace('Oslo room', 'Bergen room') }
  },
  {
    id: 'r-e-flight',
    group: 'edits',
    note: TRIP,
    question: 'we fly back Saturday 6pm',
    expect: { kind: 'edits', text: TRIP.replace('back Sunday', 'back Saturday') }
  }
]
