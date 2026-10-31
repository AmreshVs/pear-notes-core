export function foldText(text: any): any;
export function toSearchText(html: any): any;
export function parseSearchQuery(query: any): string[];
export function isBodySearchable(terms: any): any;
export function titleMatchesTerms(title: any, terms: any): any;
export function findTermRanges(text: any, terms: any): any[];
export function toHighlightSegments(text: any, flatRanges: any): {
    text: any;
    match: boolean;
}[];
export function buildSnippet(text: any, folded: any, terms: any, length?: number): {
    snippet: string;
    ranges: any[][];
};
export const SEARCH_RESULT_LIMIT: 1000;
export const SEARCH_SNIPPET_LENGTH: 140;
export const SEARCH_IDLE_MS: number;
export const SEARCH_BUILD_CHUNK: 200;
export const SEARCH_HIGHLIGHT_MS: 4000;
export class NoteSearchIndex {
    constructor({ idleMs, chunkSize, sizeOf }?: {
        idleMs?: number;
        chunkSize?: number;
        sizeOf?: () => number;
    });
    idleMs: number;
    sizeOf: () => number;
    chunkSize: number;
    entries: Map<any, any>;
    warm: boolean;
    building: any;
    pendingNotes: any[];
    pendingOps: any;
    generation: number;
    idleTimer: number;
    get size(): number;
    ensureWarm(readAll: any): Promise<any>;
    _build(readAll: any, generation: any): Promise<boolean>;
    sync(notes: any): void;
    apply(ops: any): void;
    search({ query, folderKey, includeLocked, limit }: {
        query: any;
        folderKey?: string;
        includeLocked?: boolean;
        limit?: number;
    }): {
        results: {
            key: any;
            inTitle: boolean;
            snippet: string;
            ranges: any[];
        }[];
        total: number;
    };
    /** Open dated tasks across notes, for the Upcoming view. Locked notes are skipped. */
    upcoming(): any[];
    /** Every attachment in visible notes, for the Attachments view. Locked notes are skipped. */
    attachments(): any[];
    attachmentCount(): number;
    clear(): void;
    _touch(): void;
}
//# sourceMappingURL=noteSearch.d.ts.map