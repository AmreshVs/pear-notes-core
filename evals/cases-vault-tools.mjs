// M2 tool cases: each question needs arithmetic, a date or time, or a unit
// conversion over one note. The exit is 100% correct with the work done by a
// tool (calc, date_math or convert_units), not by the model.
export const TOOL_NOTES = [
  [
    't-lisbon-budget',
    'Lisbon budget',
    'Hotel Baixa: 3 nights at €120 a night.\nFlights: €210 each, 2 of us.\nFood: about €45 a day for 3 days.'
  ],
  [
    't-dinner',
    'Dinner at Bocca',
    'Bill came to £186.40 for the four of us. We agreed a 10% tip on top.'
  ],
  [
    't-train',
    'Train to Edinburgh',
    'Departs London Kings Cross 08:47. Journey time 2h 38m. Coach C, seat 41.'
  ],
  ['t-cake', 'Lemon drizzle', 'Bake for 45 minutes at 180°C. Cool in the tin for 10 minutes.'],
  ['t-run', 'Sunday long run', 'Ran 21 km in 1h 52m. Felt good after 15 km.'],
  [
    't-passport',
    'Passport',
    'Passport number 552841907. Expires 2027-03-14. Renewal takes about 3 weeks.'
  ],
  [
    't-meeting',
    'Quarterly review',
    'Starts 14:15 in room 4B. Planned length 1h 50m. Bring the Q3 figures.'
  ],
  [
    't-deposit',
    'Flat in Leith',
    'Rent £950 a month. Deposit is 5 weeks of rent. Available from 1 November.'
  ],
  [
    't-parcel',
    'Parcel to Mum',
    'The box weighs 6.5 kg. Courier limit is 15 lb for the cheap rate.'
  ],
  ['t-savings', 'Holiday fund', 'Saving £85 a week. Target is £1,500. Started with £320.']
]

export const TOOL_CASES = [
  {
    id: 'tc-budget',
    note: 't-lisbon-budget',
    q: 'what will the Lisbon trip cost in total?',
    answer: [/915/]
  },
  {
    id: 'tc-dinner',
    note: 't-dinner',
    q: 'how much does each of us pay for the dinner with the tip?',
    answer: [/51\.26/]
  },
  {
    id: 'tc-train',
    note: 't-train',
    q: 'what time does the Edinburgh train arrive?',
    answer: [/11[:.]25/]
  },
  {
    id: 'tc-cake',
    note: 't-cake',
    q: 'what temperature is the lemon drizzle in fahrenheit?',
    answer: [/356/]
  },
  {
    id: 'tc-pace',
    note: 't-run',
    q: 'what was my average pace per km on the long run, in minutes?',
    answer: [/5[.:]3|5:2\d|5 ?min(?:ute)?s? ?(?:and )?2\d ?s/i]
  },
  {
    id: 'tc-passport',
    note: 't-passport',
    q: 'how many days from 2027-02-01 until my passport expires?',
    answer: [/41/]
  },
  {
    id: 'tc-meeting',
    note: 't-meeting',
    q: 'when does the quarterly review finish?',
    answer: [/16[:.]05/]
  },
  {
    id: 'tc-deposit',
    note: 't-deposit',
    q: 'how much is the deposit on the Leith flat?',
    answer: [/1,?096/]
  },
  {
    id: 'tc-parcel',
    note: 't-parcel',
    q: "is Mum's parcel under the courier's cheap rate limit?",
    answer: [/no|over|above|exceed|heavier/i]
  },
  {
    id: 'tc-savings',
    note: 't-savings',
    q: 'how many more weeks until the holiday fund reaches its target?',
    answer: [/14|13\.9/]
  }
]
