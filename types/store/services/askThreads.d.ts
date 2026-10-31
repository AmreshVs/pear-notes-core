/** Finished turns only; source excerpts are dropped so a saved thread keeps answers, not note text. */
export function askThreadFromTurns({ id, turns, now }: {
    id: any;
    turns: any;
    now?: number;
}): {
    id: any;
    title: string;
    updatedAt: number;
    turns: {
        answeredOn?: string;
        id: number;
        question: string;
        status: string;
        result: {
            kind: any;
            answer: string;
            citations: any;
            verified: boolean;
        };
        sources: any;
    }[];
};
export function parseAskThreads(raw: any): any[];
export function upsertAskThread(threads: any, thread: any): any[];
export function loadAskThreads(api: any): Promise<any[]>;
export function loadVisibleAskThreads(api: any, isLocked: any): Promise<any>;
export function askNoteThreadFromTurns({ noteKey, turns, now }: {
    noteKey: any;
    turns: any;
    now?: number;
}): {
    noteKey: any;
    updatedAt: number;
    turns: {
        id: number;
        question: string;
        status: string;
        scope: string;
        kind: string;
        answer: string;
        error: string;
        applied: boolean;
        edits: any[];
        diff: any;
        editedText: any;
        readOnly: boolean;
    }[];
};
export function parseAskNoteThreads(raw: any): any[];
export function loadAskNoteThreads(api: any): Promise<any[]>;
/**
 * A locked note shows no saved turns and loses its saved thread.
 * @param {any} api
 * @param {string | null} noteKey
 * @param {(noteKey: string) => boolean} [isLocked]
 */
export function loadAskNoteThread(api: any, noteKey: string | null, isLocked?: (noteKey: string) => boolean): Promise<any>;
export const ASK_THREADS_KEY: "askVaultThreads";
export const ASK_THREADS_MAX: 30;
export const ASK_NOTE_THREADS_KEY: "askNoteThreads";
export const ASK_NOTE_THREADS_MAX: 50;
export function withoutLockedAskThreads(threads: any, isLocked: any): any;
export function saveAskThread(api: any, thread: any): any;
export function deleteAskThread(api: any, id: any): any;
export function clearAskThreads(api: any): any;
export function savedAskNoteTurns(turns: any): {
    id: number;
    question: string;
    status: string;
    scope: string;
    kind: string;
    answer: string;
    error: string;
    applied: boolean;
    edits: any[];
    diff: any;
    editedText: any;
    readOnly: boolean;
}[];
export function upsertAskNoteThread(threads: any, thread: any): any[];
export function saveAskNoteThread(api: any, thread: {
    noteKey: string;
    updatedAt: number;
    turns: any[];
}, isLocked?: (noteKey: string) => boolean): any;
export function clearAskNoteThread(api: any, noteKey: any): any;
//# sourceMappingURL=askThreads.d.ts.map