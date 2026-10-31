import test from 'brittle'

import { formatOcrBlocks } from '../store/services/localAiText.js'

test('local ai text - blocks on the same row join left to right', (t) => {
  const text = formatOcrBlocks([
    { text: '9.00', bbox: [200, 40, 240, 60] },
    { text: 'Flat white', bbox: [10, 42, 120, 62] },
    { text: 'CORNER CAFE', bbox: [10, 5, 160, 25] }
  ])
  t.is(text, 'CORNER CAFE\nFlat white 9.00')
})

test('local ai text - empty and malformed blocks are ignored', (t) => {
  t.is(formatOcrBlocks([{ text: '  ' }, { text: 'Total' }, null, { bbox: [0, 0, 1, 1] }]), 'Total')
  t.is(formatOcrBlocks(undefined), '')
})
