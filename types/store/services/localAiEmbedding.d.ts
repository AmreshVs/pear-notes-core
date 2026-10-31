export function normalizeVector(vector: any): Float32Array<ArrayBuffer>;
/**
 * Packs a vector as one little-endian float32 scale then one int8 per dim,
 * after normalizing, so `scoreVector` is a cosine.
 */
export function packVector(vector: any): Uint8Array<ArrayBuffer>;
export function unpackVector(packed: any): Float32Array<ArrayBuffer>;
/** Cosine between a normalized query and a packed vector. */
export function scoreVector(query: any, packed: any): number;
/**
 * Embeds document texts through a host's `embed(texts)`, `textsPerCall` at a
 * time, stopping at `signal` between calls. A text the model refuses as too
 * long is halved until it fits, so one input can yield several pieces:
 * `source` is its index in `texts`.
 *
 * @param {{ embed: (texts: string[]) => Promise<ArrayLike<number>[]>, texts: string[], title?: (index: number) => string, signal?: AbortSignal, textsPerCall?: number, onBatch?: (done: number, total: number) => void }} options
 * @returns {Promise<{ source: number, text: string, vector: Uint8Array }[]>}
 */
export function embedDocuments({ embed, texts, title, signal, textsPerCall, onBatch }: {
    embed: (texts: string[]) => Promise<ArrayLike<number>[]>;
    texts: string[];
    title?: (index: number) => string;
    signal?: AbortSignal;
    textsPerCall?: number;
    onBatch?: (done: number, total: number) => void;
}): Promise<{
    source: number;
    text: string;
    vector: Uint8Array;
}[]>;
/** Embeds one search query into a normalized vector for `scoreVector`. */
export function embedQuery(embed: any, query: any): Promise<Float32Array<ArrayBuffer>>;
export const EMBEDDING_VECTOR_BYTES: number;
export function formatEmbeddingDocument(text: any, title?: string): string;
export function formatEmbeddingQuery(query: any): string;
export function isEmbeddingOverflow(error: any): boolean;
//# sourceMappingURL=localAiEmbedding.d.ts.map