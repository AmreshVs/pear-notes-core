// Harder, more realistic Ask-AI cases: longer notes, repeated tokens,
// vague references, multi-part requests, follow-up turns.

const PROJECT = [
  'Website redesign — kickoff',
  '',
  'Attendees: Anna, Ben, Priya, Tom',
  'Date: Monday 14 April, 10:00 in the Oslo room',
  '',
  'Scope',
  '- New landing page and pricing page',
  '- Keep the existing blog templates',
  '- Move the docs site to the new nav',
  '',
  'Budget and timeline',
  'Budget is 12,000 EUR. Design phase runs for three weeks, build for five.',
  'We ship the beta on 2 June and the public launch on 20 June.',
  '',
  'Open questions',
  '- Do we need a separate mobile design?',
  '- Who signs off the copy, Priya or Tom?',
  '',
  'Actions',
  '- Anna sends the brief on Tuesday',
  '- Ben books the user tests for week two',
  '- Priya reviews the analytics before Friday'
].join('\n')

const SHOPPING = [
  'Weekend',
  'Shopping: milk, eggs, bread, coffee, olive oil, tomatoes',
  'Call the plumber about the kitchen tap',
  'Book the car service for Thursday',
  'Dinner with Sam and Lena on Saturday at 8pm'
].join('\n')

const INTERVIEW = [
  'Interview debrief — backend role',
  'Candidate: Julia Novak',
  'Interviewers: Ben, Tom',
  'Julia has six years of experience, mostly Go and Postgres.',
  'She walked through a queue design and handled the failure modes well.',
  'Weak on the frontend questions, which is fine for this role.',
  'Ben rated her a strong hire. Tom rated her a hire.',
  'Next step: reference check, then an offer at the senior band.'
].join('\n')

const MEDS = [
  'Health',
  'Dr Patel appointment on 12 May at 3pm',
  'Take the blue tablet twice a day, morning and evening',
  'Blood test results due on 20 May',
  'Ask about the shoulder pain'
].join('\n')

export const CASES = [
  // --- answers over a long note ---
  {
    id: 'h-q-launch',
    group: 'answer',
    note: PROJECT,
    question: 'When is the public launch?',
    expect: { kind: 'answer', answerIncludes: ['20 June'] }
  },
  {
    id: 'h-q-budget',
    group: 'answer',
    note: PROJECT,
    question: 'How much is the budget?',
    expect: { kind: 'answer', answerIncludes: ['12,000'] }
  },
  {
    id: 'h-q-actions',
    group: 'answer',
    note: PROJECT,
    question: 'What does Ben need to do?',
    expect: { kind: 'answer', answerIncludes: ['user test'] }
  },
  {
    id: 'h-q-signoff',
    group: 'answer',
    note: PROJECT,
    question: 'Who signs off the copy?',
    expect: { kind: 'answer', answerIncludes: ['Priya', 'Tom'] }
  },
  {
    id: 'h-q-rating',
    group: 'answer',
    note: INTERVIEW,
    question: 'What did Tom rate her?',
    expect: { kind: 'answer', answerIncludes: ['hire'], answerExcludes: ['strong hire'] }
  },
  {
    id: 'h-q-experience',
    group: 'answer',
    note: INTERVIEW,
    question: 'How many years of experience does she have?',
    expect: { kind: 'answer', answerIncludes: ['six'] }
  },
  {
    id: 'h-q-notfound',
    group: 'notFound',
    note: INTERVIEW,
    question: 'What salary did she ask for?',
    expect: { kind: 'notFound' }
  },
  {
    id: 'h-q-notfound2',
    group: 'notFound',
    note: MEDS,
    question: 'What is the pharmacy phone number?',
    expect: { kind: 'notFound' }
  },

  // --- edits inside a long note ---
  {
    id: 'h-e-budget',
    group: 'edits',
    note: PROJECT,
    question: 'change the budget to 15,000 EUR',
    expect: { kind: 'edits', text: PROJECT.replace('12,000 EUR', '15,000 EUR') }
  },
  {
    id: 'h-e-launch',
    group: 'edits',
    note: PROJECT,
    question: 'the public launch moved to 27 June',
    expect: { kind: 'edits', text: PROJECT.replace('20 June', '27 June') }
  },
  {
    id: 'h-e-room',
    group: 'edits',
    note: PROJECT,
    question: 'the kickoff was in the Bergen room, not Oslo',
    expect: { kind: 'edits', text: PROJECT.replace('Oslo room', 'Bergen room') }
  },
  {
    id: 'h-e-weeks',
    group: 'edits',
    note: PROJECT,
    question: 'design phase is four weeks now',
    expect: { kind: 'edits', text: PROJECT.replace('three weeks', 'four weeks') }
  },
  {
    id: 'h-e-attendee',
    group: 'edits',
    note: PROJECT,
    question: 'add Lena to the attendees',
    expect: {
      kind: 'edits',
      textIncludes: ['Lena'],
      keepsAll: ['Anna, Ben, Priya, Tom', '12,000 EUR', '20 June']
    }
  },
  {
    id: 'h-e-remove-action',
    group: 'edits',
    note: PROJECT,
    question: 'remove the line about the analytics review',
    expect: {
      kind: 'edits',
      textExcludes: ['analytics'],
      keepsAll: ['Anna sends the brief', 'Ben books']
    }
  },
  {
    id: 'h-e-name',
    group: 'edits',
    note: INTERVIEW,
    question: 'her name is spelled Julija',
    expect: { kind: 'edits', textIncludes: ['Julija'], keepsAll: ['six years', 'Postgres'] }
  },
  {
    id: 'h-e-shopping-add',
    group: 'edits',
    note: SHOPPING,
    question: 'add butter and rice to the shopping list',
    expect: {
      kind: 'edits',
      textIncludes: ['butter', 'rice'],
      keepsAll: ['milk', 'eggs', 'bread', 'coffee', 'olive oil', 'tomatoes', 'plumber']
    }
  },
  {
    id: 'h-e-shopping-remove',
    group: 'edits',
    note: SHOPPING,
    question: 'take coffee off the shopping list',
    expect: {
      kind: 'edits',
      textExcludes: ['coffee'],
      keepsAll: ['milk', 'eggs', 'bread', 'olive oil', 'tomatoes']
    }
  },
  {
    id: 'h-e-time',
    group: 'edits',
    note: SHOPPING,
    question: 'dinner is at 7pm',
    expect: { kind: 'edits', text: SHOPPING.replace('8pm', '7pm') }
  },
  {
    id: 'h-e-day',
    group: 'edits',
    note: SHOPPING,
    question: 'move the car service to Friday',
    expect: { kind: 'edits', text: SHOPPING.replace('Thursday', 'Friday') }
  },
  {
    id: 'h-e-dose',
    group: 'edits',
    note: MEDS,
    question: 'the tablet is once a day now',
    expect: { kind: 'edits', textIncludes: ['once a day'], keepsAll: ['Dr Patel', '20 May'] }
  },
  {
    id: 'h-e-appointment',
    group: 'edits',
    note: MEDS,
    question: 'the appointment moved to 14 May at 4pm',
    expect: { kind: 'edits', textIncludes: ['14 May', '4pm'], keepsAll: ['Blood test', 'shoulder'] }
  },
  {
    id: 'h-e-two-changes',
    group: 'edits',
    note: PROJECT,
    question: 'change the beta to 9 June and the launch to 27 June',
    expect: {
      kind: 'edits',
      text: PROJECT.replace('2 June', '9 June').replace('20 June', '27 June')
    }
  },

  // --- rewrites ---
  {
    id: 'h-rw-shorter',
    group: 'rewrite',
    note: INTERVIEW,
    question: 'make this shorter',
    expect: { kind: 'anyChange', keepsAll: ['Julia'] }
  },
  {
    id: 'h-rw-tone',
    group: 'rewrite',
    note: 'ugh the build broke again, third time this week. someone needs to look at CI before the demo on thursday.',
    question: 'rewrite this politely for the team channel',
    expect: { kind: 'anyChange', textIncludes: ['CI'] }
  },

  // --- follow-up conversation ---
  {
    id: 'h-turn-followup',
    group: 'answer',
    note: PROJECT,
    turns: [
      {
        question: 'When is the beta?',
        reply: '{"kind":"answer","answer":"The beta ships on 2 June.","edits":[]}'
      }
    ],
    question: 'and the public launch?',
    expect: { kind: 'answer', answerIncludes: ['20 June'] }
  },
  {
    id: 'h-turn-edit-after-answer',
    group: 'edits',
    note: SHOPPING,
    turns: [
      {
        question: 'when is dinner?',
        reply: '{"kind":"answer","answer":"Dinner is on Saturday at 8pm.","edits":[]}'
      }
    ],
    question: 'change it to 9pm',
    expect: { kind: 'edits', text: SHOPPING.replace('8pm', '9pm') }
  },

  // --- chit chat / no-op ---
  {
    id: 'h-c-thanks',
    group: 'answer',
    note: PROJECT,
    question: 'thanks, that helps',
    expect: { kind: 'answer' }
  },
  {
    id: 'h-c-summary',
    group: 'answer',
    note: PROJECT,
    question: 'summarise this note in two sentences',
    expect: { kind: 'answer', answerIncludes: ['redesign'] }
  }
]
