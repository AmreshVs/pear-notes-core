/**
 * Ids of plain lines marked done on any device. Records for dates past the
 * Completed window are removed, so the synced list stays small.
 */
export function loadDoneIds(now?: number): Promise<Set<string>>;
/** Dated tasks from every visible note, grouped for the Upcoming view. */
export function loadUpcomingGroups(now?: number): Promise<{
    group: string;
    items: any[];
}[]>;
/**
 * Marks a task done or not done on every device: a checklist item is ticked
 * in its note, a plain line gets a synced done record.
 */
export function setTaskDone(task: any, done: any): Promise<boolean>;
export function loadReminderPrefs(): Promise<{
    offsets: any[];
    untimed: any;
}>;
export function saveReminderPrefs(prefs: any): Promise<boolean>;
//# sourceMappingURL=upcomingTasks.d.ts.map