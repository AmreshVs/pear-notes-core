// Vision consolidation spike (M3 step 6). Synthetic images rendered by
// render.swift; `facts` are strings a correct reading must contain
// (case- and space-insensitive). `kind` picks the font and layout.
export const CASES = [
  {
    id: 'receipt-grocery',
    kind: 'receipt',
    lines: [
      'FRESHMART #0412',
      '12/09/2026 18:42',
      'Milk 2L        2.49',
      'Bread sourdough 3.80',
      'Eggs x12       4.15',
      'Bananas 1.2kg  1.68',
      'SUBTOTAL      12.12',
      'VAT 5%         0.61',
      'TOTAL         12.73',
      'VISA ****4417'
    ],
    facts: ['FRESHMART', '12.73', '4.15', 'sourdough', '4417'],
    details: [
      ['type', 'receipt'],
      ['merchant', 'freshmart'],
      ['total', '12.73'],
      ['date', '12/09/2026']
    ]
  },
  {
    id: 'receipt-cafe',
    kind: 'receipt',
    lines: [
      'Café Lumière',
      'Table 7  Server: Inès',
      '2 x Flat white   9.00',
      '1 x Croissant    3.50',
      '1 x Quiche       7.25',
      'Tip              2.00',
      'Total AED       21.75'
    ],
    facts: ['Lumière', '21.75', 'Croissant', 'Quiche', 'Inès'],
    details: [
      ['type', 'receipt'],
      ['merchant', 'lumière'],
      ['total', '21.75']
    ]
  },
  {
    id: 'card-contact',
    kind: 'printed',
    lines: [
      'Priya Raman',
      'Head of Product',
      'Northwind Labs',
      '+44 20 7946 0958',
      'priya@northwind.io',
      'northwind.io'
    ],
    facts: ['Priya Raman', 'Head of Product', 'Northwind', '7946 0958', 'priya@northwind.io'],
    details: [
      ['type', 'card'],
      ['name', 'priya raman'],
      ['company', 'northwind'],
      ['email', 'priya@northwind.io'],
      ['phone', '7946']
    ]
  },
  {
    id: 'whiteboard-sprint',
    kind: 'whiteboard',
    lines: [
      'Sprint 14 goals',
      '- ship offline sync fix',
      '- Q3 budget: $48,500',
      '- demo Friday 3pm',
      'Owner: Priya'
    ],
    facts: ['Sprint 14', '48,500', 'Friday', '3pm', 'Priya'],
    details: [
      ['type', 'notes'],
      ['item', '48,500'],
      ['item', 'priya']
    ]
  },
  {
    id: 'whiteboard-diagram',
    kind: 'whiteboard',
    lines: ['Login -> Verify OTP -> Home', 'retry max 3', 'timeout 30s'],
    facts: ['Login', 'Verify OTP', 'Home', '3', '30s']
  },
  {
    id: 'handwriting-shopping',
    kind: 'handwriting',
    lines: ['shopping list', 'tomatoes', 'olive oil', 'basil', 'parmesan 200g', 'call mum at 7'],
    facts: ['tomatoes', 'olive oil', 'basil', '200g', 'call mum']
  },
  {
    id: 'handwriting-note',
    kind: 'handwriting',
    lines: ['Dentist moved to Oct 21, 9:15', 'bring insurance card', 'Dr. Okafor, room 204'],
    facts: ['Oct 21', '9:15', 'insurance', 'Okafor', '204']
  },
  {
    id: 'screenshot-flight',
    kind: 'screenshot',
    lines: [
      'Boarding pass',
      'EK 2041  DXB → LHR',
      'Gate B17  Seat 34K',
      'Boards 07:55',
      'Booking ref QX7LMN'
    ],
    facts: ['EK 2041', 'B17', '34K', '07:55', 'QX7LMN']
  },
  {
    id: 'screenshot-chat',
    kind: 'screenshot',
    lines: [
      'Sam: are we still on for Saturday?',
      'Me: yes, 11am at the park',
      'Sam: I will bring the frisbee',
      'Me: wifi password is Kestrel-2291'
    ],
    facts: ['Saturday', '11am', 'frisbee', 'Kestrel-2291']
  },
  {
    id: 'non-latin-russian',
    kind: 'printed',
    lines: ['Список дел', 'Купить хлеб и молоко', 'Встреча в 14:30', 'Позвонить Ольге'],
    facts: ['Список дел', 'хлеб', 'молоко', '14:30', 'Ольге']
  },
  {
    id: 'non-latin-japanese',
    kind: 'printed',
    lines: ['会議メモ', '予算は120万円', '締め切りは金曜日', '担当：田中'],
    facts: ['会議', '120万円', '金曜日', '田中']
  },
  {
    id: 'non-latin-hindi',
    kind: 'printed',
    lines: ['खरीदारी की सूची', 'चावल 5 किलो', 'दूध 2 लीटर', 'शाम 6 बजे'],
    facts: ['चावल', '5', 'दूध', '6 बजे']
  },
  {
    id: 'non-latin-arabic',
    kind: 'printed',
    lines: ['قائمة المهام', 'اجتماع الساعة 10', 'شراء قهوة', 'الاتصال بأحمد'],
    facts: ['المهام', '10', 'قهوة', 'بأحمد']
  }
]
