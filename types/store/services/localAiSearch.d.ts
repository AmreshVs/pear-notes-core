/**
 * Reciprocal-rank fusion: each list adds weight / (k + rank) to its keys.
 * @param {{ keys: string[], weight?: number }[]} lists
 */
export function fuseRankings(lists: {
    keys: string[];
    weight?: number;
}[], { k }?: {
    k?: number;
}): {
    key: any;
    score: any;
}[];
/**
 * Substring hits + vector hits, with recency as a small tiebreaker among
 * notes one of the other two already found (recency alone never adds a note).
 *
 * @param {{ substringKeys?: string[], vectorHits?: { id: string, score: number }[], updatedAtOf?: (key: string) => number, weights?: typeof HYBRID_WEIGHTS, minVectorScore?: number }} options
 */
export function rankHybrid({ substringKeys, vectorHits, updatedAtOf, weights, minVectorScore }: {
    substringKeys?: string[];
    vectorHits?: {
        id: string;
        score: number;
    }[];
    updatedAtOf?: (key: string) => number;
    weights?: typeof HYBRID_WEIGHTS;
    minVectorScore?: number;
}): {
    key: any;
    score: any;
}[];
export function encodeQueryVector(vector: any): Uint8Array<ArrayBuffer>;
/** Embeds `query` on the host and brute-forces it against the vault's vectors in the backend. */
export function searchVaultVectors({ api, embed, query, limit }: {
    api: any;
    embed: any;
    query: any;
    limit?: number;
}): Promise<any>;
export function toMeaningSnippet(text: any, length?: number): string;
/**
 * Notes whose best chunk scores at least `minScore` for `query`, best first,
 * each with that chunk's text as its snippet. null when the store can't answer.
 */
export function findMeaningHits({ api, embed, query, limit, minScore }: {
    api: any;
    embed: any;
    query: any;
    limit?: number;
    minScore?: number;
}): Promise<any>;
/**
 * Notes whose best chunk pair with this note's chunks reaches `minScore`,
 * from stored vectors only (no model). The snippet is the matching chunk.
 */
export function findRelatedNotes({ api, noteKey, limit, minScore }: {
    api: any;
    noteKey: any;
    limit?: number;
    minScore?: number;
}): Promise<any>;
/** Stored possible duplicates, minus pairs marked "not a duplicate" on any device. Reads only. */
export function findDuplicatePairs({ api, threshold, overlap }: {
    api: any;
    threshold?: number;
    overlap?: number;
}): Promise<any>;
/**
 * Checks every note whose duplicate record is stale, one bounded backend
 * call at a time, with `checkpoint` (which throws to stop) between calls.
 * Returns how many notes were checked, or null when the store is unavailable.
 */
export function updateDuplicatePairs({ api, checkpoint, checkMs, threshold, overlap }: {
    api: any;
    checkpoint?: () => void;
    checkMs?: number;
    threshold?: number;
    overlap?: number;
}): Promise<number>;
export function dismissDuplicatePair({ api, a, b }: {
    api: any;
    a: any;
    b: any;
}): Promise<any>;
export const RRF_K: 60;
export namespace HYBRID_WEIGHTS {
    let substring: number;
    let vector: number;
    let recency: number;
}
/** Vector hits below this cosine only count when substring search also found the note. */
export const VECTOR_MIN_SCORE: 0.3;
export const MEANING_SNIPPET_LENGTH: 140;
/** Chunk-pair cosine; unrelated notes in the eval vault sit at 0.32–0.39. */
export const RELATED_MIN_SCORE: 0.45;
export const RELATED_FETCH_LIMIT: 20;
/** Both thresholds must pass: template-made notes embed alike but share little wording. */
export const DUPLICATE_MIN_SCORE: 0.85;
export const DUPLICATE_MIN_OVERLAP: 0.6;
export const DUPLICATES_DISMISSED_NAMESPACE: "duplicates-dismissed";
/** One record per note: the notes it duplicates, kept current by the index job. */
export const DUPLICATE_PAIRS_NAMESPACE: "duplicate-pairs";
/** Backend time per duplicate check call, so an abort waits at most about this long. */
export const DUPLICATE_CHECK_MS: 1000;
export function duplicatePairId(a: any, b: any): string;
//# sourceMappingURL=localAiSearch.d.ts.map