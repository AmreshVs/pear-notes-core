export function toQueryVector(buffer: any): Float32Array<any>;
/**
 * Best chunk per note for a normalized float query, over `vectors` records
 * (a format byte, a uint16 count, then count × (float32 scale + int8 dims)).
 * Records whose size doesn't fit the query's dims are skipped.
 */
export function scoreNoteVectors(query: any, value: any): {
    score: number;
    chunk: number;
};
/** @param {AsyncIterable<{ id: string, value: Uint8Array }>} entries */
export function searchVectors(entries: AsyncIterable<{
    id: string;
    value: Uint8Array;
}>, query: any, { limit }?: {
    limit?: number;
}): Promise<{
    id: string;
    score: number;
    chunk: number;
}[]>;
/** A record's chunks kept as int8 plus one scale each, copied out of the store buffer. */
export function parseNoteVectors(value: any): {
    dims: number;
    count: number;
    scales: Float32Array<ArrayBuffer>;
    values: Int8Array<ArrayBuffer>;
};
/**
 * Notes nearest to one note: each other note scores its best chunk pair, and
 * `chunk` is that note's matching chunk.
 */
export function relatedVectors(entries: any, id: any, source: any, { limit }?: {
    limit?: number;
}): Promise<{
    id: any;
    score: number;
    chunk: number;
}[]>;
export function shingles(text: any): Set<any>;
/** Share of the smaller note's word 3-grams found in the other note. */
export function containment(a: any, b: any): number;
/** Every note's vectors and centroid by id; a note without chunks has `count` 0. */
export function loadNoteVectors(entries: any): Promise<Map<any, any>>;
export function encodePairRecord(record: any): Uint8Array<ArrayBufferLike>;
export function decodePairRecord(value: any): any;
/**
 * Brings the stored duplicate pairs up to date. Each note has one record,
 * versioned like its vectors, listing `[otherId, otherVersion, score]` for
 * the notes it covers: the lower of the two directions' mean best-chunk
 * match reaches `threshold` and, with `overlap`, the smaller note's word
 * 3-grams are that much contained in the other (notes made from one template
 * embed alike but aren't copies). A pair stays valid while the other note
 * keeps that version, so either side's record can carry it.
 *
 * Stale notes are checked newest first for up to `checkMs` (0 only reads).
 * A stale note is compared with every note except stale ones still waiting
 * their turn, which compare with it later, so a full pass is n²/2 and an
 * edit costs one pass over the vault.
 *
 * @param {Map<string, any>} notes from `loadNoteVectors`, or ids and versions alone when `checkMs` is 0
 * @param {Map<string, { version: number, value: Uint8Array }>} records the stored pair records
 */
export function updateDuplicates(notes: Map<string, any>, records: Map<string, {
    version: number;
    value: Uint8Array;
}>, { threshold, overlap, margin, textOf, checkMs, now }: {
    threshold: any;
    overlap?: number;
    margin?: number;
    textOf: any;
    checkMs?: number;
    now?: () => number;
}): Promise<{
    writes: {
        id: string;
        version: number;
        value: any;
    }[];
    current: Map<any, any>;
    checked: number;
    remaining: number;
}>;
/** Valid pairs from current records, best score per pair, strongest first. */
export function duplicatePairs(notes: any, current: any, { limit }?: {
    limit?: number;
}): any[];
export const VECTOR_SEARCH_LIMIT: 50;
export const RELATED_LIMIT: 10;
export const DUPLICATE_LIMIT: 100;
//# sourceMappingURL=vectorSearch.d.ts.map