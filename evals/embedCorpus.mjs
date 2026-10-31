// Synthetic vault for the embeddings spike: hand-written target notes in real
// Tiptap HTML (rendered with htmlToNoteText, as the apps do), questions with
// known answer notes, and seeded filler notes that scale the vault to a chunk
// budget. No real user data.
import { htmlToNoteText } from '../store/services/localAiPrompts.js'

const p = (text) => `<p>${text}</p>`
const h = (level, text) => `<h${level}>${text}</h${level}>`
const ul = (items) => `<ul>${items.map((item) => `<li><p>${item}</p></li>`).join('')}</ul>`
const ol = (items) => `<ol>${items.map((item) => `<li><p>${item}</p></li>`).join('')}</ol>`
const tasks = (items) =>
  `<ul data-type="taskList">${items
    .map(
      ([done, text]) =>
        `<li data-checked="${done}" data-type="taskItem"><label><input type="checkbox"${done ? ' checked' : ''}><span></span></label><div><p>${text}</p></div></li>`
    )
    .join('')}</ul>`

export const TARGETS = [
  [
    'dentist',
    'Dental check-up',
    [
      p('Dr. Okafor at Smile Dental, 12 Harbour Street.'),
      p('Thursday 23 October at 14:30. Check-up plus scale and polish.'),
      p('Bring the insurance card. Ask about the sensitive molar on the left.')
    ]
  ],
  [
    'car',
    'Garage booking',
    [
      p('Oil and filter change booked at Kwik Motors for Saturday 8 November, 9am drop-off.'),
      p('Also ask them to look at the rattle from the rear wheel. MOT is due in January.')
    ]
  ],
  [
    'wifi',
    "Mum's place",
    [
      h(2, 'Network'),
      p('Name: TALKTALK-4F21'),
      p('Password: purple-otter-71'),
      h(2, 'Other'),
      p('The router is behind the TV. Spare keys in the blue pot by the door.')
    ]
  ],
  [
    'passport',
    'Passport renewal',
    [
      ol([
        'Fill the online form',
        'New photo (no glasses)',
        'Pay the £88.50 fee',
        'Post the old passport'
      ]),
      p('Current one expires 14 March 2027. Renew before booking the summer trip.')
    ]
  ],
  [
    'project',
    'Website redesign — kickoff',
    [
      p('Monday 14 April, 10:00 in the Oslo room.'),
      p('Attendees: Anna, Ben, Priya, Tom'),
      h(2, 'Budget and timeline'),
      p('Budget is 12,000 EUR. Design phase runs for three weeks, build for five.'),
      p('We ship the beta on 2 June and the public launch on 20 June.')
    ]
  ],
  [
    'lisbon',
    'Lisbon',
    [
      h(2, 'Flights'),
      p('Out Tuesday 9am, back Sunday 6pm.'),
      h(2, 'Bookings'),
      ol(['Hotel Baixa, three nights', 'Airport transfer', 'Tram tour on Thursday'])
    ]
  ],
  [
    'pancakes',
    'Pancakes',
    [
      h(2, 'Ingredients'),
      ul(['2 eggs', '300ml milk', '200g plain flour', 'Pinch of salt']),
      h(2, 'Method'),
      ol([
        'Whisk the eggs and milk',
        'Add the flour slowly',
        'Rest the batter for 20 minutes',
        'Cook 3 minutes a side on medium heat'
      ])
    ]
  ],
  [
    'crepes',
    'Crêpes',
    [
      h(2, 'Ingredients'),
      ul(['3 eggs', '500ml milk', '250g flour', '50g melted butter']),
      h(2, 'Method'),
      ol([
        'Whisk everything until smooth',
        'Rest the batter in the fridge for 1 hour',
        'Very thin layer in a hot pan, 1 minute a side'
      ])
    ]
  ],
  [
    'q3eng',
    'Q3 planning — engineering',
    [
      p('Attendees: Priya, Marco, Lena'),
      h(2, 'Decisions'),
      ul([
        'Release freeze starts 1 September, two weeks before launch',
        'Migrate CI to the new runners',
        'On-call rota goes to weekly'
      ])
    ]
  ],
  [
    'q3mkt',
    'Q3 planning — marketing',
    [
      p('Attendees: Sofia, Jonas, Lena'),
      h(2, 'Decisions'),
      ul([
        'Campaign launch moves to 15 September',
        'Freeze new ad spend until the brand refresh lands',
        'Weekly newsletter goes fortnightly'
      ])
    ]
  ],
  [
    'flat',
    'Wohnungsbesichtigung Kreuzberg',
    [
      p('Samstag 11:00, Oranienstraße 34, 3. OG.'),
      p('Kaltmiete 950 €, Nebenkosten 210 €. Kaution drei Monatsmieten.'),
      p('Balkon nach Süden, Altbau, Einbauküche vorhanden.')
    ]
  ],
  [
    'lucia',
    'Cumpleaños de Lucía',
    [
      p('La fiesta es el sábado a las 17:00 en casa de Marta.'),
      p('Regalo: una bicicleta azul con cesta. Ya pagamos la mitad.')
    ]
  ],
  [
    'catvet',
    'Rendez-vous vétérinaire',
    [
      p('Minou : rappel de vaccin le mercredi 29 octobre à 9h15.'),
      p('Clinique des Lilas. Ne pas lui donner à manger le matin.')
    ]
  ],
  [
    'dogvet',
    "Rex's booster",
    [
      p('Rex has his booster shots on 5 November at the Parkside vet, 4pm.'),
      p('Bring his worming tablets record.')
    ]
  ],
  [
    'gym',
    'Gym membership',
    [
      p('PureFit, £35 a month, direct debit on the 1st.'),
      p('To cancel: give 30 days notice in writing, before 30 November to avoid December.')
    ]
  ],
  [
    'delhi',
    'Flight to Delhi',
    [
      p('Air India AI162, London Heathrow → Delhi, departs 19 December 21:05.'),
      p('Booking reference QK7Z2P. Seat 32A. 2 x 23kg bags.')
    ]
  ],
  [
    'books',
    'Books people recommended',
    [
      ul([
        'Piranesi — from Ana',
        'The Overstory — from Dev',
        'Klara and the Sun — book club',
        'A Psalm for the Wild-Built — from Tom'
      ])
    ]
  ],
  [
    'plants',
    'Plant care',
    [
      ul([
        'Monstera: water every 10 days, likes the bright corner',
        'Snake plant: once a month',
        'Fiddle leaf fig: hates being moved'
      ])
    ]
  ],
  [
    'insurance',
    'Home insurance',
    [
      p('Aviva, policy number HX-44718-B. Renews 1 January.'),
      p('Premium £312 a year. Covers contents up to £40,000. Excess £250.')
    ]
  ],
  [
    'school',
    'Parents evening',
    [
      p('Tuesday 18:00 with Mrs Patel (Year 4).'),
      p('Ask about reading level and the maths homework club.')
    ]
  ],
  [
    'laptop',
    'Laptop receipt',
    [
      p('MacBook Air bought 3 March 2026 at John Lewis for £1,099.'),
      p('Two-year guarantee included, receipt number JL-55120.')
    ]
  ],
  [
    'legs',
    'Workout plan',
    [
      h(2, 'Monday — upper'),
      ul(['Bench 4x8', 'Rows 4x10', 'Overhead press 3x8']),
      h(2, 'Thursday — lower'),
      ul(['Squats 5x5', 'Romanian deadlifts 3x10', 'Walking lunges 3x12', 'Calf raises'])
    ]
  ],
  [
    'giftdad',
    'Gift ideas — Dad',
    [
      ul([
        'Noise-cancelling headphones for the train',
        'Whisky tasting voucher',
        'New gardening gloves'
      ])
    ]
  ],
  [
    'giftmum',
    'Gift ideas — Mum',
    [ul(['Pottery class', 'Silk scarf', 'Kindle with the large font'])]
  ],
  [
    'bike',
    'Bike fixes',
    [
      p(
        'Rear derailleur kept skipping: turned the barrel adjuster half a turn anticlockwise, fixed.'
      ),
      p('Chain lubed with the wet lube. Brake pads still fine.')
    ]
  ],
  [
    'meter',
    'Meter readings',
    [
      ul([
        'August: electricity 41822, gas 9031',
        'September: electricity 42107, gas 9055',
        'October: electricity 42390, gas 9102'
      ])
    ]
  ],
  [
    'wedding',
    'Sam & Priya wedding',
    [
      p('Saturday 14 June, Barnsley House, Cotswolds.'),
      p('Dress code: garden formal, no stilettos on the lawn. RSVP by 1 May.')
    ]
  ],
  [
    'kyoto',
    '京都旅行',
    [
      p('一日目：清水寺と伏見稲荷大社。'),
      p('二日目：金閣寺、それから嵐山の竹林。'),
      p('ホテルは京都駅の近く。')
    ]
  ],
  [
    'oneonone',
    '1:1 with Ben',
    [
      p('Ben wants to go for senior engineer this cycle.'),
      p('Agreed: he writes the promotion case by end of the month, I review it before calibration.')
    ]
  ],
  [
    'gp',
    'GP results',
    [
      p('Blood test came back normal apart from vitamin D, which is low.'),
      p('Doctor said take 1000 IU of vitamin D daily through winter and retest in March.')
    ]
  ],
  [
    'bins',
    'Bins',
    [
      p(
        'General waste every Tuesday. Recycling every other Wednesday (next one 22 October). Garden waste stops in December.'
      )
    ]
  ],
  [
    'neighbour',
    'Neighbours',
    [
      p('Greta in flat 4 has a spare key to ours. Her number is in contacts.'),
      p('Mr Hughes downstairs takes parcels.')
    ]
  ]
]

// Same topic, wrong answer: these are what make retrieval hard in a real vault.
export const HARD_NEGATIVES = [
  [
    'optician',
    'Optician',
    [
      p(
        'Eye test at Vision Express, Friday 31 October 11:00. New prescription for reading glasses.'
      )
    ]
  ],
  [
    'physio',
    'Physio',
    [
      p(
        'Knee physio with Dr. Adeyemi on Mondays at 8am for six weeks. Exercises: wall sits, step-downs.'
      )
    ]
  ],
  [
    'carins',
    'Car insurance',
    [p('Direct Line, policy DL-90233. Renews 12 August, £540 a year, fully comprehensive.')]
  ],
  [
    'bikeins',
    'Bike insurance quote',
    [p('Quote from Cycleplan: £9 a month for the road bike, theft and accidental damage.')]
  ],
  [
    'officewifi',
    'Office wifi',
    [p('Guest network: ACME-GUEST, password changes every Monday, ask reception.')]
  ],
  [
    'cafewifi',
    'Café list',
    [
      ul([
        'Fernhill Café — good wifi, plugs at the back',
        'Bean There — quiet upstairs',
        'Lantern — closes at 4'
      ])
    ]
  ],
  [
    'visa',
    'US visa (ESTA)',
    [p('ESTA approved, valid two years until 2 May 2027. Application number 4F7GH2.')]
  ],
  [
    'driving',
    'Driving licence',
    [p('Photocard needs renewing every 10 years; mine expires 2031. Address updated in June.')]
  ],
  [
    'porto',
    'Porto weekend',
    [
      h(2, 'Bookings'),
      ol(['Guesthouse near Ribeira, two nights', 'Port tasting at Graham’s']),
      p('Flights out Friday evening.')
    ]
  ],
  [
    'madrid',
    'Madrid conference',
    [p('Hotel Regina, four nights, paid by work. Talk on Wednesday afternoon.')]
  ],
  [
    'waffles',
    'Waffles',
    [
      h(2, 'Ingredients'),
      ul(['2 eggs', '350ml milk', '250g flour', '2 tsp baking powder']),
      h(2, 'Method'),
      ol(['Mix wet then dry', 'Rest 10 minutes', 'Cook in the iron until golden'])
    ]
  ],
  [
    'yorkshire',
    'Yorkshire puddings',
    [
      ul([
        'Batter: eggs, milk, flour in equal volume',
        'Rest the batter at least 30 minutes, ideally overnight',
        'Smoking hot oil, 220°C, 20 minutes'
      ])
    ]
  ],
  [
    'q2eng',
    'Q2 planning — engineering',
    [
      p('Attendees: Priya, Marco'),
      ul([
        'No release freeze this quarter',
        'Hire two backend engineers',
        'Deprecate the old API in July'
      ])
    ]
  ],
  [
    'q3sales',
    'Q3 planning — sales',
    [
      p('Attendees: Omar, Lena'),
      ul([
        'Ad budget for events goes up 20%',
        'New territory: Benelux',
        'Weekly pipeline review on Mondays'
      ])
    ]
  ],
  [
    'flatberlin2',
    'Wohnung Neukölln',
    [p('Besichtigung abgesagt. Kaltmiete wäre 1.150 € gewesen, zu teuer, kein Balkon.')]
  ],
  [
    'flatlondon',
    'Flat hunting London',
    [p('Viewed 2-bed in Hackney: £2,100 a month, available December. Landlord seemed fine.')]
  ],
  [
    'birthdaytom',
    'Tom’s birthday',
    [p('Turning 40 on 3 December. Gift: vinyl record player. Dinner at Dishoom booked for 8.')]
  ],
  [
    'catfood',
    'Cat stuff',
    [
      ul([
        'Minou only eats the salmon pouches',
        'Flea treatment every month',
        'Litter: the clumping one'
      ])
    ]
  ],
  [
    'dogwalk',
    'Dog walker',
    [p('Hannah walks Rex on Tuesdays and Thursdays, £15 a walk. Key in the lockbox.')]
  ],
  [
    'swim',
    'Swimming pool',
    [p('Council pool: £5.20 a swim, lane swimming 7–9am. Annual pass £320.')]
  ],
  [
    'flightnyc',
    'Flight to New York',
    [p('BA117, Heathrow → JFK, 4 February 08:25. Booking reference ZT4M9Q.')]
  ],
  [
    'trainedi',
    'Train to Edinburgh',
    [p('LNER, King’s Cross 10:00 on 18 December, coach C seat 42. Ticket in the app.')]
  ],
  [
    'podcasts',
    'Podcasts to try',
    [ul(['Hardcore History', 'The Rest Is History', 'Search Engine'])]
  ],
  [
    'films',
    'Films to watch',
    [ul(['Past Lives', 'Perfect Days', 'Anatomy of a Fall', 'Aftersun'])]
  ],
  [
    'garden',
    'Garden jobs',
    [
      ul([
        'Water the tomatoes daily in summer',
        'Prune the apple tree in February',
        'Mow fortnightly'
      ])
    ]
  ],
  [
    'phone',
    'Phone receipt',
    [p('iPhone bought 20 September 2025 at the Apple Store, £799. AppleCare not taken.')]
  ],
  [
    'tvwarranty',
    'TV warranty',
    [p('Sony TV from Currys, five-year guarantee registered online, expires 2028.')]
  ],
  [
    'runplan',
    'Running plan',
    [ul(['Tuesday intervals 6x800m', 'Thursday tempo 5k', 'Sunday long run 14k'])]
  ],
  [
    'giftsis',
    'Gift ideas — sister',
    [ul(['Climbing shoes voucher', 'Cookbook: Ottolenghi Simple', 'Concert tickets'])]
  ],
  [
    'carfix',
    'Car fixes',
    [p('Replaced the wiper blades myself (Bosch, 24 and 19 inch). Tyre pressure 35 psi front.')]
  ],
  [
    'waterbill',
    'Water bill',
    [p('Thames Water: £42 a month, meter read every six months. Last reading 1203 m³.')]
  ],
  [
    'wedding2',
    'Ana & Joe wedding',
    [p('Saturday 6 September in Bath. Dress code: black tie. Gift list at John Lewis.')]
  ],
  ['tokyo', '東京メモ', [p('浅草寺に行きたい。築地でお寿司。ホテルは新宿。')]],
  [
    'oneononepriya',
    '1:1 with Priya',
    [
      p(
        'Priya wants to move into the platform team next quarter. I will talk to Marco about headcount.'
      )
    ]
  ],
  [
    'gpkid',
    'Kids doctor',
    [
      p(
        'Nurse said give children’s paracetamol for the fever, plenty of fluids, come back if it lasts 3 days.'
      )
    ]
  ],
  ['council', 'Council tax', [p('Band C, £1,890 a year, paid in 10 instalments from April.')]],
  [
    'keysafe',
    'Holiday checklist',
    [
      tasks([
        [false, 'Leave the spare key with the cat sitter'],
        [false, 'Stop the post'],
        [true, 'Timer on the lamp']
      ])
    ]
  ]
]

// keyword = what someone would plausibly type into the search box for this.
export const QUESTIONS = [
  {
    id: 'q-dentist',
    note: 'dentist',
    q: 'when do I see the tooth doctor?',
    keyword: 'teeth',
    kind: 'synonym'
  },
  {
    id: 'q-car',
    note: 'car',
    q: 'when is the vehicle getting its oil changed?',
    keyword: 'car service',
    kind: 'synonym'
  },
  {
    id: 'q-wifi',
    note: 'wifi',
    q: "what's the internet login at my mother's house?",
    keyword: 'wifi password',
    kind: 'paraphrase'
  },
  {
    id: 'q-passport',
    note: 'passport',
    q: 'when does my travel document run out?',
    keyword: 'passport',
    kind: 'paraphrase'
  },
  {
    id: 'q-budget',
    note: 'project',
    q: 'how much money do we have for the website project?',
    keyword: 'budget',
    kind: 'paraphrase'
  },
  {
    id: 'q-hotel',
    note: 'lisbon',
    q: 'which hotel are we staying at in Portugal?',
    keyword: 'hotel',
    kind: 'world'
  },
  {
    id: 'q-pancake',
    note: 'pancakes',
    q: 'how long should the pancake batter rest?',
    keyword: 'pancake',
    kind: 'near-dup'
  },
  {
    id: 'q-crepe',
    note: 'crepes',
    q: 'how long does crepe batter need to rest?',
    keyword: 'crepe',
    kind: 'near-dup'
  },
  {
    id: 'q-freeze',
    note: 'q3eng',
    q: 'when did engineering decide the release freeze starts?',
    keyword: 'release freeze',
    kind: 'near-dup'
  },
  {
    id: 'q-adspend',
    note: 'q3mkt',
    q: 'what did marketing decide about advertising budget?',
    keyword: 'ad spend',
    kind: 'near-dup'
  },
  {
    id: 'q-rent',
    note: 'flat',
    q: 'how much is the rent for the apartment we viewed in Berlin?',
    keyword: 'rent',
    kind: 'cross-lingual'
  },
  {
    id: 'q-lucia',
    note: 'lucia',
    q: 'what present are we getting Lucia for her birthday?',
    keyword: 'Lucia',
    kind: 'cross-lingual'
  },
  {
    id: 'q-cat',
    note: 'catvet',
    q: "when is the cat's vaccination?",
    keyword: 'cat vaccine',
    kind: 'cross-lingual'
  },
  {
    id: 'q-dog',
    note: 'dogvet',
    q: 'when does the dog get his jabs?',
    keyword: 'dog',
    kind: 'near-dup'
  },
  {
    id: 'q-gym',
    note: 'gym',
    q: '¿cuánto cuesta el gimnasio al mes?',
    keyword: 'gimnasio',
    kind: 'cross-lingual'
  },
  {
    id: 'q-delhi',
    note: 'delhi',
    q: 'मेरी दिल्ली की उड़ान कब है?',
    keyword: 'flight',
    kind: 'cross-lingual'
  },
  {
    id: 'q-books',
    note: 'books',
    q: 'novels friends told me to read',
    keyword: 'books',
    kind: 'synonym'
  },
  {
    id: 'q-plants',
    note: 'plants',
    q: 'how often do I water the big leafy houseplant?',
    keyword: 'water',
    kind: 'paraphrase'
  },
  {
    id: 'q-insurer',
    note: 'insurance',
    q: 'who covers my house and contents?',
    keyword: 'insurance',
    kind: 'synonym'
  },
  { id: 'q-policy', note: 'insurance', q: 'HX-44718-B', keyword: 'HX-44718-B', kind: 'exact' },
  {
    id: 'q-teacher',
    note: 'school',
    q: "when do I meet my kid's teacher?",
    keyword: 'parents evening',
    kind: 'paraphrase'
  },
  {
    id: 'q-warranty',
    note: 'laptop',
    q: 'is my computer still under warranty?',
    keyword: 'laptop',
    kind: 'synonym'
  },
  {
    id: 'q-legday',
    note: 'legs',
    q: "what's my leg day routine?",
    keyword: 'squats',
    kind: 'paraphrase'
  },
  {
    id: 'q-dad',
    note: 'giftdad',
    q: 'what could I get my father for Christmas?',
    keyword: 'gift dad',
    kind: 'near-dup'
  },
  {
    id: 'q-gears',
    note: 'bike',
    q: 'how did I fix the gears on my bicycle?',
    keyword: 'bike',
    kind: 'synonym'
  },
  {
    id: 'q-meter',
    note: 'meter',
    q: 'what was the power meter reading in September?',
    keyword: 'electricity',
    kind: 'paraphrase'
  },
  {
    id: 'q-wear',
    note: 'wedding',
    q: 'what should I wear to the wedding?',
    keyword: 'wedding',
    kind: 'paraphrase'
  },
  {
    id: 'q-kyoto',
    note: 'kyoto',
    q: 'which temples did I plan to visit in Kyoto?',
    keyword: 'Kyoto',
    kind: 'cross-lingual'
  },
  {
    id: 'q-promo',
    note: 'oneonone',
    q: 'what did Ben and I agree about his career?',
    keyword: 'Ben',
    kind: 'paraphrase'
  },
  {
    id: 'q-supplement',
    note: 'gp',
    q: 'what supplement did the doctor tell me to take?',
    keyword: 'vitamin',
    kind: 'paraphrase'
  },
  {
    id: 'q-bins',
    note: 'bins',
    q: 'which day does the rubbish get collected?',
    keyword: 'bins',
    kind: 'synonym'
  },
  {
    id: 'q-key',
    note: 'neighbour',
    q: 'who has a spare key to my place?',
    keyword: 'spare key',
    kind: 'paraphrase'
  }
]

export function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const NAMES = [
  'Alex',
  'Jamie',
  'Noor',
  'Kenji',
  'Fatima',
  'Olu',
  'Ines',
  'Mateo',
  'Hana',
  'Rory',
  'Zara',
  'Yusuf',
  'Clara',
  'Theo',
  'Mia',
  'Arjun'
]
const PLACES = [
  'Leeds',
  'Porto',
  'Valencia',
  'Krakow',
  'Ghent',
  'Bristol',
  'Lyon',
  'Bologna',
  'Galway',
  'Tallinn',
  'Seville',
  'Utrecht'
]
const TOPICS = [
  'onboarding',
  'pricing page',
  'search revamp',
  'mobile release',
  'data export',
  'billing',
  'accessibility audit',
  'Q4 roadmap',
  'support backlog',
  'analytics',
  'design system',
  'partner API'
]
const DISHES = [
  'lentil soup',
  'banana bread',
  'chicken curry',
  'risotto',
  'shakshuka',
  'focaccia',
  'chili',
  'tomato salad',
  'flapjacks',
  'ramen',
  'gnocchi',
  'granola'
]
const FOODS = [
  'onions',
  'garlic',
  'olive oil',
  'rice',
  'butter',
  'tinned tomatoes',
  'stock',
  'oats',
  'honey',
  'chickpeas',
  'spinach',
  'lemons',
  'parmesan',
  'yoghurt'
]
const VERBS = [
  'finish',
  'review',
  'draft',
  'send',
  'book',
  'call',
  'sort out',
  'clean',
  'order',
  'reply to',
  'plan',
  'tidy'
]
const OBJECTS = [
  'the slides',
  'the quarterly report',
  'the garden shed',
  'the attic',
  'the conference tickets',
  'the invoice for March',
  'the team offsite',
  'the photo album',
  'the shelves',
  'the newsletter',
  'the spreadsheet',
  'the hiring plan'
]
const MOODS = [
  'tired but okay',
  'great day',
  'quiet, mostly reading',
  'stressful at work',
  'long walk by the river',
  'rain all day',
  'productive morning',
  'slow and lazy'
]
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export function fillerNote(rand, i) {
  const pick = (list) => list[Math.floor(rand() * list.length)]
  const some = (list, n) => Array.from({ length: n }, () => pick(list))
  const day = () => `${pick(DAYS)} ${1 + Math.floor(rand() * 28)}`
  const kind = Math.floor(rand() * 6)
  const para = (n) =>
    Array.from({ length: n }, () =>
      p(
        `${pick(NAMES)} said we should ${pick(VERBS)} ${pick(OBJECTS)} before ${day()}. ${pick(NAMES)} will follow up on the ${pick(TOPICS)} work and share notes with ${pick(NAMES)}.`
      )
    ).join('')
  if (kind === 0) {
    const topic = pick(TOPICS)
    return [
      `Meeting: ${topic} #${i}`,
      [
        p(`Attendees: ${some(NAMES, 3).join(', ')}`),
        h(2, 'Notes'),
        para(2 + Math.floor(rand() * 5)),
        h(2, 'Actions'),
        tasks(
          Array.from({ length: 3 }, () => [
            rand() < 0.4,
            `${pick(NAMES)} to ${pick(VERBS)} ${pick(OBJECTS)}`
          ])
        ),
        h(2, 'Follow-up'),
        para(1 + Math.floor(rand() * 4))
      ].join('')
    ]
  }
  if (kind === 1) {
    const dish = pick(DISHES)
    return [
      `${dish[0].toUpperCase()}${dish.slice(1)} (${pick(NAMES)}'s version)`,
      [
        h(2, 'Ingredients'),
        ul(
          some(FOODS, 5 + Math.floor(rand() * 4)).map(
            (food) => `${50 + Math.floor(rand() * 400)}g ${food}`
          )
        ),
        h(2, 'Method'),
        ol(
          Array.from(
            { length: 4 + Math.floor(rand() * 4) },
            () =>
              `${pick(['Chop', 'Stir', 'Simmer', 'Bake', 'Mix', 'Season', 'Fry'])} the ${pick(FOODS)} for ${2 + Math.floor(rand() * 30)} minutes`
          )
        )
      ].join('')
    ]
  }
  if (kind === 2) {
    const place = pick(PLACES)
    return [
      `Weekend in ${place}`,
      [
        h(2, 'Plan'),
        p(`Train on ${day()}, staying with ${pick(NAMES)}.`),
        ul(
          Array.from(
            { length: 4 },
            () =>
              `Visit the ${pick(['market', 'old town', 'museum', 'harbour', 'cathedral', 'park', 'castle'])} in ${place}`
          )
        ),
        h(2, 'Notes'),
        para(2 + Math.floor(rand() * 3))
      ].join('')
    ]
  }
  if (kind === 3) {
    return [
      `To do — ${day()}`,
      tasks(
        Array.from({ length: 4 + Math.floor(rand() * 6) }, () => [
          rand() < 0.5,
          `${pick(VERBS)} ${pick(OBJECTS)}`
        ])
      )
    ]
  }
  if (kind === 4) {
    return [`Journal ${day()}`, [p(`${pick(MOODS)}.`), para(2 + Math.floor(rand() * 6))].join('')]
  }
  return [
    `Reading notes: ${pick(TOPICS)}`,
    [
      h(2, 'Key ideas'),
      ul(
        Array.from(
          { length: 3 + Math.floor(rand() * 3) },
          () => `The ${pick(TOPICS)} depends on how we ${pick(VERBS)} ${pick(OBJECTS)}`
        )
      ),
      h(2, 'Quotes'),
      para(3 + Math.floor(rand() * 6))
    ].join('')
  ]
}

const CHUNK_CHARS = 1000 // ~250 tokens at ~4 chars/token
const MIN_SECTION_CHARS = 200

// Heading-aware block chunking of the htmlToNoteText output. Each chunk keeps
// the heading it sits under; the title is added by the document prompt.
export function chunkNote(text) {
  const chunks = []
  let lines = []
  let size = 0
  let heading = ''
  let chunkHeading = ''
  const flush = () => {
    if (lines.length) chunks.push({ heading: chunkHeading, text: lines.join('\n') })
    lines = []
    size = 0
    chunkHeading = heading
  }
  for (const line of text.split('\n')) {
    if (/^#{1,6} /.test(line)) {
      if (size >= MIN_SECTION_CHARS) flush()
      heading = line.replace(/^#+ /, '')
      if (!lines.length) chunkHeading = heading
      lines.push(line)
      size += line.length + 1
      continue
    }
    if (size + line.length > CHUNK_CHARS && lines.length) flush()
    lines.push(line)
    size += line.length + 1
  }
  flush()
  return chunks
}

export const docPrompt = (title, chunk) => `title: ${title || 'none'} | text: ${chunk.text}`
export const queryPrompt = (q) => `task: search result | query: ${q}`

function toNote(key, title, html, updatedAt) {
  const fullHtml = `<h1>${title}</h1>${html}`
  return { key, title, html: fullHtml, text: htmlToNoteText(fullHtml), updatedAt }
}

// Targets always come first; filler is a deterministic stream, so a smaller
// budget is a prefix of a larger one.
export function buildVault(chunkBudget, seed = 7) {
  const notes = [...TARGETS, ...HARD_NEGATIVES].map(([key, title, blocks], i) =>
    toNote(key, title, blocks.join(''), 1_700_000_000_000 + i)
  )
  const rand = rng(seed)
  const chunks = []
  const addChunks = (note) => {
    const body = note.text.split('\n').slice(1).join('\n')
    for (const chunk of chunkNote(body))
      chunks.push({
        noteKey: note.key,
        title: note.title,
        ...chunk,
        doc: docPrompt(note.title, chunk)
      })
  }
  notes.forEach(addChunks)
  let i = 0
  while (chunks.length < chunkBudget) {
    const [title, html] = fillerNote(rand, i)
    const note = toNote(`filler-${i}`, title, html, 1_690_000_000_000 + i)
    notes.push(note)
    addChunks(note)
    i++
  }
  return { notes, chunks: chunks.slice(0, chunkBudget) }
}
