export function batchWritingLines(lines: any, maxChars?: number): any[][];
export function buildWritingMessages(task: any, lines: any, options?: {}): {
    role: string;
    content: any;
}[];
export function getWritingParams(lines: any): {
    predict: number;
    reasoning_budget: 0;
    temp: 0.2;
    top_p: 0.8;
    top_k: 20;
    repeat_penalty: 1;
};
export function parseWritingOutput(output: any, count: any): {
    lines: any;
    aligned: boolean;
};
export function protectedTokens(line: any): any[];
export function checkWritingLine(task: any, before: any, after: any): "missing" | "dropped" | "invented" | "lost" | "grew" | "gutted" | "rewrote";
/**
 * Small models miss their/there, its/it's and similar mix-ups when they write
 * the line themselves, but judge two complete sentences well. A word only
 * changes when every comparison agrees in both orders, so a position bias can
 * never rewrite a correct word.
 */
export function fixConfusedWords(lines: any, { complete, english, sourceLines, budget, trace }: {
    complete: any;
    english?: boolean;
    sourceLines?: any;
    budget?: {
        used: number;
    };
    trace?: {};
}): Promise<any[]>;
/** Dictation filler and stutters, removed by code so the model only fixes punctuation. */
export function removeFillers(line: any): any;
/**
 * Rewrites text line by line and keeps the original wherever the model's line
 * would lose or invent a fact, so the result always lines up block for block
 * with what was sent.
 *
 * @param {{
 *   task: string,
 *   text: string,
 *   complete: (params: Record<string, any>, onText?: (text: string) => void) => Promise<string>,
 *   onText?: (text: string) => void,
 *   trace?: Record<string, any>,
 *   styleSamples?: string[]
 * }} options
 * @returns {Promise<string>}
 */
export function runNoteRewrite({ task, text, complete, onText, trace, styleSamples }: {
    task: string;
    text: string;
    complete: (params: Record<string, any>, onText?: (text: string) => void) => Promise<string>;
    onText?: (text: string) => void;
    trace?: Record<string, any>;
    styleSamples?: string[];
}): Promise<string>;
/**
 * A few sentences of the user's own prose for "Rewrite in my style": full
 * sentences only, no lists, headings or pasted text with links.
 */
export function collectStyleSamples(noteTexts: any, { limit }?: {
    limit?: number;
}): string[];
export const WRITING_BATCH_MAX_CHARS: 1200;
export const WRITING_PARAMS: Readonly<{
    reasoning_budget: 0;
    temp: 0.2;
    top_p: 0.8;
    top_k: 20;
    repeat_penalty: 1;
}>;
//# sourceMappingURL=localAiWritingTools.d.ts.map