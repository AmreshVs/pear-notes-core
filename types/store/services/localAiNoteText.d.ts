/**
 * Overestimates the embedding model's token count without its tokenizer.
 * CJK, kana, Hangul and Thai cost about one token per character, so a
 * character cap is not safe for them.
 */
export function estimateTokens(text: any): number;
/**
 * The one note-to-model-text renderer for AI features. Keeps headings, lists,
 * task state and quotes, and includes attachments with any text derived from
 * them (OCR, transcripts, PDF text) through `attachmentText`.
 *
 * @param {string} html
 * @param {{ title?: string, attachmentText?: (info: { kind: string, name: string, type: string, url: string }) => string | null | undefined, maxLines?: number }} [options]
 * @returns {{ text: string, heading: number, attachment: boolean }[]}
 */
export function renderNoteLines(html: string, { title, attachmentText, maxLines }?: {
    title?: string;
    attachmentText?: (info: {
        kind: string;
        name: string;
        type: string;
        url: string;
    }) => string | null | undefined;
    maxLines?: number;
}): {
    text: string;
    heading: number;
    attachment: boolean;
}[];
/**
 * Splits rendered note lines into embedding chunks. A heading or attachment
 * starts a new chunk once the current one has a section's worth of text, and
 * every chunk carries the heading it sits under. No chunk exceeds `maxTokens`
 * (estimated, title and prompt frame included): an oversized embedding input
 * throws `batch overflow` instead of being truncated.
 *
 * @param {{ text: string, heading: number, attachment: boolean }[]} lines
 * @param {{ title?: string, maxTokens?: number, minSectionTokens?: number }} [options]
 * @returns {{ index: number, heading: string, text: string, tokens: number }[]}
 */
export function chunkNoteLines(lines: {
    text: string;
    heading: number;
    attachment: boolean;
}[], { title, maxTokens, minSectionTokens }?: {
    title?: string;
    maxTokens?: number;
    minSectionTokens?: number;
}): {
    index: number;
    heading: string;
    text: string;
    tokens: number;
}[];
export const CHUNK_MAX_TOKENS: 300;
export const CHUNK_MIN_SECTION_TOKENS: 60;
export const CHUNK_PROMPT_FRAME_TOKENS: 12;
export function renderNoteText(html: any, options: any): string;
export function chunkNote(html: string, { title, attachmentText, maxTokens, minSectionTokens }?: {
    title?: string;
    attachmentText?: (info: {
        kind: string;
        name: string;
        type: string;
        url: string;
    }) => string | null | undefined;
    maxTokens?: number;
    minSectionTokens?: number;
}): {
    index: number;
    heading: string;
    text: string;
    tokens: number;
}[];
//# sourceMappingURL=localAiNoteText.d.ts.map