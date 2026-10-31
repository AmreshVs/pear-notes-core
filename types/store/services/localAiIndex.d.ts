/**
 * Diffs the vault's notes against the stored vector versions. Stale notes come
 * newest first, so a paused first index has covered recent notes. A key whose
 * data has not loaded yet is left alone: only a key that left the list, or a
 * note that is now locked or trashed, loses its vectors.
 *
 * `newNoteLimit` keeps a backlog for later (phones on battery): edited notes
 * and notes newer than everything indexed are upkeep and stay in `stale`, but
 * a first index takes only that many of the newest notes, and older notes
 * never indexed (a sync from another device) go to `deferred`.
 *
 * @param {{ key: string, value?: any }[]} notes every key in the vault's list
 * @param {Map<string, number>} versions
 * @param {{ newNoteLimit?: number }} [options]
 */
export function planIndex(notes: {
    key: string;
    value?: any;
}[], versions: Map<string, number>, { newNoteLimit }?: {
    newNoteLimit?: number;
}): {
    stale: any[];
    deferred: any[];
    removed: string[];
    total: number;
};
/** One record per note: a format byte, a uint16 count, then `count` packed vectors. */
export function encodeNoteVectors(vectors: any): Uint8Array<ArrayBuffer>;
export function decodeNoteVectors(value: any): any[];
export function decodeNoteChunks(value: any): {
    heading: any;
    text: any;
}[];
/**
 * Brings the vault's semantic index up to date: drops vectors of notes that
 * are gone, locked or trashed, and embeds every note whose `updatedAt`
 * differs from its stored version. Notes are embedded in groups and each
 * group is written before the next starts, so an abort loses at most one
 * group and the next run resumes from the stored versions.
 *
 * `isCurrent` must turn false once the vault changes: the derived store is
 * per vault, and a write after a switch would land in the wrong one.
 *
 * @param {{ api: { derivedGet: Function, derivedPut: Function, derivedVersions: Function, derivedClear: Function, getSingleNote: Function }, embed: (texts: string[]) => Promise<ArrayLike<number>[]>, notes: { key: string, value: any }[], signal: AbortSignal, progress?: (done: number, total: number) => void, isCurrent?: () => boolean, textsPerCall?: number, newNoteLimit?: number, now?: () => number }} options
 */
export function runVaultIndex({ api, embed, notes, signal, progress, isCurrent, textsPerCall, newNoteLimit, now, attachmentText }: {
    api: {
        derivedGet: Function;
        derivedPut: Function;
        derivedVersions: Function;
        derivedClear: Function;
        getSingleNote: Function;
    };
    embed: (texts: string[]) => Promise<ArrayLike<number>[]>;
    notes: {
        key: string;
        value: any;
    }[];
    signal: AbortSignal;
    progress?: (done: number, total: number) => void;
    isCurrent?: () => boolean;
    textsPerCall?: number;
    newNoteLimit?: number;
    now?: () => number;
}): Promise<{
    notes: number;
    chunks: number;
    removed: number;
    skipped: number;
    embedMs: number;
    firstEmbedMs: number;
    firstChunks: number;
    rebuilt: boolean;
}>;
export const INDEX_FORMAT: 2;
export namespace INDEX_NAMESPACE {
    let VECTORS: string;
    let CHUNKS: string;
    let META: string;
}
export const INDEX_META_ID: "format";
export const INDEX_JOB_KEY: "vault-index";
/** On battery, a first index takes this many of the newest notes; the rest wait for charging. */
export const INDEX_BATTERY_NEW_NOTES: 50;
export function indexVersion(value: any): number;
export function isIndexable(value: any): boolean;
export function encodeNoteChunks(chunks: any): Uint8Array<ArrayBufferLike>;
export function indexApiFrom(backendApi: any): {
    derivedGet: any;
    derivedPut: any;
    derivedVersions: any;
    derivedClear: any;
    getSingleNote: ({ key }: {
        key: any;
    }) => Promise<any>;
};
export function isIndexModelMissing(error: any): boolean;
//# sourceMappingURL=localAiIndex.d.ts.map