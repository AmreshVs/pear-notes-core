/**
 * The Recap view: notes edited over the last seven calendar days (today
 * included), bucketed by local day so the week can be drawn as a bar per day
 * and listed under day headings. Built from data only.
 * `notes` are `{ key, title, updatedAt, folderKey, locked }`.
 * `days` runs oldest to today; each holds its notes newest first.
 */
export function buildRecap({ notes, now }: {
    notes?: any[];
    now?: number;
}): {
    from: number;
    days: {
        start: number;
        notes: any[];
    }[];
    editedCount: number;
};
export const RECAP_DAYS: 7;
export function isRecapEmpty(recap: any): boolean;
//# sourceMappingURL=recap.d.ts.map