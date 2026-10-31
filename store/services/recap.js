import { RECENTLY_DELETED_KEY } from '../../constant.js'

export const RECAP_DAYS = 7

const byNewest = (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)

/**
 * The Recap view: notes edited over the last seven calendar days (today
 * included), bucketed by local day so the week can be drawn as a bar per day
 * and listed under day headings. Built from data only.
 * `notes` are `{ key, title, updatedAt, folderKey, locked }`.
 * `days` runs oldest to today; each holds its notes newest first.
 */
export function buildRecap({ notes = [], now = Date.now() }) {
  const days = []
  for (let back = RECAP_DAYS - 1; back >= 0; back--) {
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    start.setDate(start.getDate() - back)
    days.push({ start: start.getTime(), notes: [] })
  }
  const from = days[0].start
  const edited = notes
    .filter(
      (note) =>
        note?.key &&
        note.folderKey !== RECENTLY_DELETED_KEY &&
        !note.locked &&
        (note.updatedAt ?? 0) >= from &&
        (note.updatedAt ?? 0) <= now
    )
    .sort(byNewest)
  for (const note of edited) {
    let index = days.length - 1
    while (index > 0 && note.updatedAt < days[index].start) index--
    days[index].notes.push(note)
  }
  return { from, days, editedCount: edited.length }
}

export const isRecapEmpty = (recap) => !recap.editedCount
