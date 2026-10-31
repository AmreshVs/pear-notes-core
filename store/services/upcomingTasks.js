import { backendApi } from '../../backend/api.js'
import {
  PAST_DAYS,
  REMINDER_PREFS_ID,
  groupUpcoming,
  normalizeReminderPrefs,
  taskDoneId
} from './noteTasks.js'

const DONE_PREFIX = 'done/'
const DONE_KEEP_DAYS = PAST_DAYS + 1
const DONE_PRUNE_BATCH = 20

const isoDaysAgo = (days, now) => {
  const d = new Date(now)
  d.setDate(d.getDate() - days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Ids of plain lines marked done on any device. Records for dates past the
 * Completed window are removed, so the synced list stays small.
 */
export async function loadDoneIds(now = Date.now()) {
  const records = await backendApi.getSyncedPrefs(DONE_PREFIX)
  const cutoff = isoDaysAgo(DONE_KEEP_DAYS, now)
  const expired = Object.entries(records)
    .filter(([, value]) => typeof value?.date === 'string' && value.date < cutoff)
    .slice(0, DONE_PRUNE_BATCH)
  for (const [id] of expired) backendApi.setSyncedPref(id, null).catch(() => {})
  return new Set(Object.keys(records))
}

/** Dated tasks from every visible note, grouped for the Upcoming view. */
export async function loadUpcomingGroups(now = Date.now()) {
  const [tasks, doneIds] = await Promise.all([backendApi.getUpcomingTasks(), loadDoneIds()])
  return groupUpcoming(tasks, now, { doneIds })
}

/**
 * Marks a task done or not done on every device: a checklist item is ticked
 * in its note, a plain line gets a synced done record.
 */
export async function setTaskDone(task, done) {
  if (task.checklist) {
    return backendApi.setTaskChecked({ noteKey: task.noteKey, text: task.text, checked: done })
  }
  return backendApi.setSyncedPref(
    taskDoneId(task),
    done ? { at: Date.now(), date: task.date } : null
  )
}

export async function loadReminderPrefs() {
  const prefs = await backendApi.getSyncedPrefs(REMINDER_PREFS_ID)
  return normalizeReminderPrefs(prefs[REMINDER_PREFS_ID])
}

export const saveReminderPrefs = (prefs) =>
  backendApi.setSyncedPref(REMINDER_PREFS_ID, normalizeReminderPrefs(prefs))
