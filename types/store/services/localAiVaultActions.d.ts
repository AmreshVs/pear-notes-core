/** The indexable notes an Ask in `scope` (a folder key or All notes) searches. */
export function getVaultScopeNotes(notes: any, scope?: string): [string, any][];
/**
 * "Try asking" from recent titles and the scope's folder (or the busiest one).
 * Returns `{ kind: 'note' | 'keyPoints', title }` or `{ kind: 'folder', folder }`.
 */
export function getVaultAskSuggestions({ notes, folders, scope }: {
    notes: any;
    folders?: any[];
    scope?: string;
}): ({
    kind: string;
    title: any;
    folder?: undefined;
} | {
    kind: string;
    folder: any;
    title?: undefined;
})[];
/** The earliest open task, today or later, in one of the cited notes; null when none. */
export function getVaultReminderTask({ citedKeys, tasks, doneIds, today }: {
    citedKeys: any;
    tasks: any;
    doneIds: any;
    today?: string;
}): any;
/** "Make a packing list from my notes": a request to write something new, not a question. */
export function isVaultDraftRequest(question: any): boolean;
/** "Make a packing list from my Lisbon notes" → "Lisbon packing list". */
export function vaultDraftTitle(question: any): any;
/**
 * The answer to a draft request as items: one per line, or one comma or
 * semicolon list split up. Null when it isn't a draft request or has no items.
 */
export function getVaultDraft({ question, result }: {
    question: any;
    result: any;
}): {
    title: any;
    items: {
        text: any;
        citations: any[];
    }[];
    checklist: boolean;
};
/** The draft's items as a checklist or bullet list, optionally under its title in bold. */
export function vaultDraftHtml(draft: any, { heading }?: {
    heading?: boolean;
}): string;
/** A new note from the draft: its list, then the notes it came from. */
export function vaultDraftNote({ draft, sources, sourcesLabel }: {
    draft: any;
    sources?: any[];
    sourcesLabel?: string;
}): {
    title: any;
    note: string;
};
/** "Add to <note>": the first cited note that isn't open in the editor. */
export function getVaultDraftTarget({ draft, openNoteKey, notes }: {
    draft: any;
    openNoteKey?: any;
    notes?: {};
}): any;
export function isoDay(date?: Date): string;
//# sourceMappingURL=localAiVaultActions.d.ts.map