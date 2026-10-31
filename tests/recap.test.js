import test from 'brittle'

import { RECENTLY_DELETED_KEY } from '../constant.js'
import { buildRecap, isRecapEmpty, RECAP_DAYS } from '../store/services/recap.js'

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime()

test('the recap buckets notes edited this week by day', (t) => {
  const now = at(2026, 10, 14, 9)
  const recap = buildRecap({
    notes: [
      { key: 'pan', title: 'PAN', updatedAt: at(2026, 10, 14, 8), folderKey: 'f' },
      { key: 'dubai', title: 'Dubai', updatedAt: at(2026, 10, 13), folderKey: 'f' },
      { key: 'early', title: 'Early', updatedAt: at(2026, 10, 8, 0), folderKey: 'f' },
      { key: 'late', title: 'Late', updatedAt: at(2026, 10, 13, 23) },
      { key: 'old', title: 'Old', updatedAt: at(2026, 10, 7, 23), folderKey: 'f' },
      { key: 'future', title: 'Future', updatedAt: at(2026, 10, 14, 10), folderKey: 'f' },
      { key: 'secret', title: 'Secret', updatedAt: at(2026, 10, 12), locked: true },
      { key: 'gone', title: 'Gone', updatedAt: at(2026, 10, 12), folderKey: RECENTLY_DELETED_KEY }
    ],
    now
  })
  t.is(recap.days.length, RECAP_DAYS)
  t.is(recap.from, at(2026, 10, 8, 0), 'starts at midnight six days back')
  t.is(recap.days.at(-1).start, at(2026, 10, 14, 0), 'ends on today')
  t.alike(
    recap.days.map((day) => day.notes.map((note) => note.key)),
    [['early'], [], [], [], [], ['late', 'dubai'], ['pan']],
    'each note lands on its local day, newest first'
  )
  t.is(recap.editedCount, 4)
  t.absent(isRecapEmpty(recap))
  t.ok(isRecapEmpty(buildRecap({ now })))
})
