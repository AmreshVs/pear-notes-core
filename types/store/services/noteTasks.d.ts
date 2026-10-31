/**
 * The first date in `text`, resolved against `anchor` (ms), plus a time when
 * one is written. Returns null when there is no date.
 */
export function parseDue(text: any, anchor?: number): {
    date: string;
    time: string;
    span: number[];
    calendar: boolean;
    explicitYear: boolean;
};
/** Lines of a note's HTML; checklist items start with a marker for their state. */
export function noteLines(html: any): any;
/**
 * Tasks with a due date: checklist items with a date (ticked ones carry
 * `done`), and plain lines that read like a to-do with a date. Birthdays and
 * anniversaries recur yearly, even when written with the year they started:
 * by the line, the note title, or a note that is a list of old dates.
 */
export function extractNoteTasks(html: any, { anchor, title, maxTextLength }?: {
    anchor?: number;
    title?: string;
    maxTextLength?: number;
}): ({
    name?: string;
    yearly?: boolean;
    sinceYear?: number;
    text: any;
    date: string;
    time: any;
    checklist: boolean;
} | {
    done?: boolean;
    text: any;
    date: string;
    time: any;
    checklist: any;
})[];
/** A yearly task moved to its next occurrence on or after today; Feb 29 falls on Feb 28. */
export function resolveYearly(task: any, now?: number): any;
/**
 * Groups tasks for the Upcoming view. An undone checklist item past its day
 * or time is overdue; a dated line past its time moves to Past for a week.
 * Every yearly date shows; one more than a month away is marked `beyondWindow`
 * and left out of the count.
 */
export function groupUpcoming(tasks: any, now?: number, { doneIds }?: {
    doneIds?: any;
}): {
    group: string;
    items: any[];
}[];
/** Open dated tasks in one note from today on; `checklist: false` is a line that isn't a checklist item yet. */
export function getNoteFindings(html: any, { noteKey, title, anchor, now, doneIds }?: {
    noteKey?: string;
    title?: string;
    anchor?: number;
    now?: number;
    doneIds?: any;
}): any[];
/**
 * Upcoming groups for display: yearly dates after tomorrow leave the to-do
 * groups for one Birthdays group (next 30 days only), placed before Past.
 * `yearly` is every open yearly date, for the full list.
 */
export function splitYearly(groups: any): {
    groups: {
        group: any;
        items: any;
    }[];
    yearly: any[];
};
/**
 * Ticks or unticks the checklist item whose text is `text` (a long text may
 * arrive cut with an ellipsis). Returns null when no such item is found.
 */
export function setChecklistItemChecked(html: any, text: any, checked: any): string;
/** Synced reminder choices, with anything unknown or missing replaced by the default. */
export function normalizeReminderPrefs(value: any): {
    offsets: any[];
    untimed: any;
};
/**
 * When a task reminds: each chosen offset before its time. A task with no
 * time only takes the day-scale offsets, and always reminds on the day.
 */
export function reminderTimes(task: any, prefs?: Readonly<{
    offsets: number[];
    untimed: "09:00";
}>): {
    offset: any;
    atMs: number;
}[];
/**
 * Reminders whose time fell in (since, now], one per task and offset. Missed
 * reminders older than `graceMs` are skipped, so opening the app after a
 * week doesn't fire a backlog.
 */
export function dueReminders(tasks: any, { since, now, graceMs, prefs, doneIds }: {
    since: any;
    now?: number;
    graceMs?: number;
    prefs: any;
    doneIds?: any;
}): any;
/** Reminders to hand to the phone's scheduler: upcoming only, soonest first. */
export function buildReminderItems(tasks: any, { now, linkFor, bodyFor, prefs, doneIds }: {
    now?: number;
    linkFor: any;
    bodyFor: any;
    prefs: any;
    doneIds?: any;
}): any;
export const UPCOMING_GROUP: Readonly<{
    OVERDUE: "overdue";
    TODAY: "today";
    TOMORROW: "tomorrow";
    THIS_WEEK: "thisWeek";
    LATER: "later";
    PAST: "past";
    COMPLETED: "completed";
}>;
export function isFoldedGroup(group: any): boolean;
export function taskDoneId(task: any): string;
export const PAST_DAYS: 7;
export function isAppointment(task: any): boolean;
export const YEARLY_LOOKAHEAD_DAYS: 30;
export const NOTE_FINDINGS_MAX: 8;
export const BIRTHDAYS_GROUP: "birthdays";
export function countOpenUpcoming(groups: any): any;
export const REMINDER_DEFAULT_TIME: "09:00";
export const REMINDER_OFFSET_OPTIONS: readonly number[];
export const UNTIMED_TIME_OPTIONS: readonly string[];
export const REMINDER_PREFS_ID: "reminders";
export const DEFAULT_REMINDER_PREFS: Readonly<{
    offsets: number[];
    untimed: "09:00";
}>;
export function reminderAt(task: any, untimed?: string): number;
export function reminderKey(task: any, offset?: number): string;
export const REMINDER_HORIZON_DAYS: 14;
//# sourceMappingURL=noteTasks.d.ts.map