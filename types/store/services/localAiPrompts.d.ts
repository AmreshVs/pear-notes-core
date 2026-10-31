export function planTextSlices(width: any, height: any): {
    originX: number;
    originY: number;
    width: any;
    height: any;
}[];
export function joinTextSlices(parts: any): string;
/** Where a decoding loop starts (keeping its first copy), or -1. */
export function findRepeatLoop(text: any): number;
/** Cheap per-token check: is the stream currently inside a loop? */
export function endsInRepeatLoop(text: any): boolean;
export function trimRepeatLoop(text: any): string;
/**
 * Reads text slice by slice. `complete` must stop and resolve with what it has once
 * onStreamed returns true. A looping slice is retried once with a penalty.
 * @template T
 * @param {T[]} slices
 * @param {(slice: T, params: Record<string, unknown>, onStreamed: (text: string) => boolean) => Promise<string>} complete
 * @param {(text: string) => void} [onText]
 * @returns {Promise<string>}
 */
export function readImageTextSlices<T>(slices: T[], complete: (slice: T, params: Record<string, unknown>, onStreamed: (text: string) => boolean) => Promise<string>, onText?: (text: string) => void): Promise<string>;
export function cleanImageDescription(text: any): any;
export function getNoteTaskMaxTokens(task: any): number;
export function getNoteTaskGenerationParams(task: any): {
    predict: number;
    reasoning_budget: 0;
    temp: number;
    repeat_penalty: number;
    frequency_penalty: number;
} | {
    predict: number;
    reasoning_budget: 0;
    temp: number;
    repeat_penalty: number;
    frequency_penalty: number;
} | {
    predict: number;
    reasoning_budget: 0;
    temp: number;
    repeat_penalty: number;
};
export function decodeHtmlEntities(text: any): string;
/**
 * Walks note HTML into lines that keep the structure a reader sees: headings,
 * bullets, numbering, task state, quotes and table rows. Each line records
 * its heading level, and attachment lines are marked, so callers can chunk on
 * sections. Attachments are left out unless `attachments` is set, because
 * Ask and the writing tools edit by line and cannot edit an attachment.
 *
 * @param {string} html
 * @param {{ attachments?: boolean, attachmentText?: (info: { kind: string, name: string, type: string, url: string }) => string | null | undefined }} [options]
 * @returns {{ text: string, heading: number, attachment: boolean }[]}
 */
export function htmlToNoteLines(html: string, { attachments, attachmentText }?: {
    attachments?: boolean;
    attachmentText?: (info: {
        kind: string;
        name: string;
        type: string;
        url: string;
    }) => string | null | undefined;
}): {
    text: string;
    heading: number;
    attachment: boolean;
}[];
/**
 * Renders note HTML as plain text that keeps the structure a reader sees.
 * The flat `htmlToParagraphs` output hides it, so a model asked about "the
 * second bullet" or "the tasks still open" cannot answer from it.
 */
export function htmlToNoteText(html: any): string;
export function htmlToParagraphs(html: any): string[];
export function getLanguageInstruction(text: any): string;
export function clampNoteText(text: any, maxChars: any): string;
export function buildNoteTaskMessages(task: any, text: any): {
    role: string;
    content: string;
}[];
export function cleanModelOutput(text: any): any;
export function parseSummaryOutput(text: any): {
    summary: string;
    actionItems: any;
    decisions: any;
    openQuestions: any;
};
/**
 * @param {string} text
 * @param {string | null} [note] the titled text; without it joined words are left as they are
 */
export function parseTitleOutput(text: string, note?: string | null): any;
export function parseKeyPointsOutput(text: any): any;
export const LLM_CONTEXT_SIZE: 4096;
export const LLM_TEMPERATURE: 0.2;
export const DESCRIBE_MAX_TOKENS: 160;
export const SUMMARY_MAX_TOKENS: 512;
export const SUMMARY_MAX_TRANSCRIPT_CHARS: 8000;
export const EXTRACT_TEXT_MAX_TOKENS: 1024;
export const EXTRACT_TEXT_PROMPT: "Transcribe all the text in this image exactly as written, line by line, in its original language and script. Skip icons, arrows and symbols that are not words. Reply with the text only. If there is no text, reply with nothing.";
export const EXTRACT_TEXT_RETRY_PARAMS: Readonly<{
    repeat_penalty: 1.1;
}>;
export const EXTRACT_IMAGE_MAX_SIDE: 1600;
export const EXTRACT_SLICE_MAX_SIDE: 768;
export const DESCRIBE_IMAGE_MAX_SIDE: 896;
export namespace VISION_GENERATION_PARAMS {
    let reasoning_budget: number;
}
export const NO_THINKING: Readonly<{
    reasoning_budget: 0;
}>;
export const DESCRIBE_IMAGE_PROMPT: "Write a one-sentence caption for this image, under 25 words. Say what it is and its main subject. If it has a title or heading, include it.";
export function getShorterWordBudget(text: any): number;
export const SUMMARY_SYSTEM_PROMPT: string;
export namespace NOTE_TASK {
    let TRANSCRIPT_SUMMARY: string;
    let NOTE_SUMMARY: string;
    let TITLE: string;
    let FOLDER_NAME: string;
    let KEY_POINTS: string;
    let FIX_GRAMMAR: string;
    let REWRITE: string;
    let MAKE_SHORTER: string;
    let MAKE_PROFESSIONAL: string;
    let MAKE_FRIENDLY: string;
    let CLEAN_UP: string;
    let MY_STYLE: string;
    let REPORT: string;
    let ITINERARY: string;
    let FLASHCARDS: string;
    let ACTION_LIST: string;
    let TEMPLATE_MEETING: string;
    let TEMPLATE_TRIP: string;
    let TEMPLATE_PROJECT: string;
}
/** Tasks that make a new draft note from one or more notes. */
export const GENERATE_TASKS: string[];
export const TEMPLATE_TASKS: string[];
export const REWRITE_TASKS: string[];
export const REWRITE_MAX_CHARS: 3000;
export function isRewriteTask(task: any): boolean;
export function keepsOriginalText(task: any): boolean;
export function isWritingNoteTask(task: any): boolean;
export const NOTE_TASK_MAX_TOKENS: {
    [NOTE_TASK.TRANSCRIPT_SUMMARY]: number;
    [NOTE_TASK.NOTE_SUMMARY]: number;
    [NOTE_TASK.TITLE]: number;
    [NOTE_TASK.FOLDER_NAME]: number;
    [NOTE_TASK.KEY_POINTS]: number;
    [NOTE_TASK.REPORT]: number;
    [NOTE_TASK.ITINERARY]: number;
    [NOTE_TASK.FLASHCARDS]: number;
    [NOTE_TASK.ACTION_LIST]: number;
    [NOTE_TASK.TEMPLATE_MEETING]: number;
    [NOTE_TASK.TEMPLATE_TRIP]: number;
    [NOTE_TASK.TEMPLATE_PROJECT]: number;
};
export const NOTE_TASK_MIN_CHARS: 20;
export const TITLE_MAX_CHARS: 80;
export const TITLE_MAX_WORDS: 8;
export const SUMMARY_MAX_ACTION_ITEMS: 10;
export function isNoteTask(task: any): boolean;
export const TRANSLATE_MAX_PARAGRAPHS: 400;
export const NOTE_TEXT_MAX_LINES: 400;
export const ATTACHMENT_END_LINE: "[End of attachment]";
export function buildSummaryMessages(transcript: any): {
    role: string;
    content: string;
}[];
//# sourceMappingURL=localAiPrompts.d.ts.map