export function getAskGenerationParams(sourceText: any): {
    predict: number;
    temp: 0.2;
    repeat_penalty: 1.15;
    frequency_penalty: 0.3;
};
export function estimateAskTokens(text: any): number;
export function trimAskNote(text: any): string;
export function fitAskTurns(turns: any, maxTokens?: number): {
    turns: any[];
    dropped: number;
};
export function getAskHistoryBudget(fixedMessages: any, predict: any): number;
export function validateAskEdits(question: any, edits: any): boolean;
export function shouldRetryAskForEdits(note: any, question: any, raw: any): boolean;
export function pickAskReply(note: any, first: any, retry: any, question: any): any;
export function fitAskPredict(messages: any, params: any): any;
export function buildAskMessages({ note, turns, question, forceEdits }: {
    note: any;
    turns?: any[];
    question: any;
    forceEdits?: boolean;
}): {
    messages: {
        role: string;
        content: string;
    }[];
    dropped: number;
};
export function shouldAskThink(question: any, turns?: any[]): boolean;
export function getUnfinishedAskReasoning(output: any): string;
export function buildAskAnswerMessages({ note, turns, question, think, reasoning, replay }: {
    note: any;
    turns?: any[];
    question: any;
    think?: boolean;
    reasoning?: string;
    replay?: boolean;
}): {
    messages: {
        role: string;
        content: string;
    }[];
    dropped: number;
};
export function stripAskHedge(answer: any): string;
export function visibleAskAnswer(output: any): any;
export function parseAskAnswerOutput(output: any): {
    kind: "notFound";
    answer: any;
} | {
    kind: string;
    answer: string;
};
export function parseAskOutput(text: any): {
    kind: "rewrite" | "answer" | "notFound";
    answer: any;
    edits: any[];
} | {
    kind: "edits";
    answer: string;
    edits: {
        find: string;
        replace: string;
        all: boolean;
    }[];
};
export function extractPartialAnswer(text: any): string;
export function applyTextEdits(text: any, edits: any): {
    after: string;
    applied: {
        count: number;
        find: string;
        replace: string;
        all: boolean;
    }[];
    skipped: {
        find: string;
        replace: string;
        all: boolean;
    }[];
};
export function deriveEditsFromRewrite(note: any, rewritten: any): {
    find: string;
    replace: string;
    all: boolean;
}[];
export function looksLikeRewrite(source: any, answer: any): boolean;
export function resolveAskReply(note: any, parsed: any, question?: string): any;
export function createAskTurn(id: any, question: any): {
    id: any;
    question: any;
    status: string;
    kind: any;
    answer: string;
    edits: any[];
    diff: any;
    editedText: any;
    applied: boolean;
    error: any;
    reply: string;
};
export function prepareAskEdits(question: any, sourceText: any, edits: any): {
    find: any;
    replace: any;
    all: boolean;
}[];
export function resolveAskTurn(turn: any, sourceText: any, raw: any): any;
export function getAskHistory(turns: any): {
    replay?: any;
    question: any;
    reply: any;
}[];
export function hasDroppedAskTurns(turns: any, note?: string): boolean;
export function getAskScopeInfo(scope: any, text: any): {
    scope: any;
    words: number;
    truncated: boolean;
};
export function shouldTryAskFullText(note: any, question: any, raw: any): boolean;
export function buildAskFullTextMessages({ note, question }: {
    note: any;
    question: any;
}): {
    role: string;
    content: string;
}[];
export function getAskFullTextParams(note: any): {
    predict: number;
    reasoning_budget: 0;
    temp: 0.1;
    repeat_penalty: 1.05;
};
export function restoreDroppedTail(note: any, output: any): string;
export function toAskFullTextReply(note: any, question: any, output: any): string;
/**
 * @param {{
 *   note: string,
 *   turns?: { question: string, reply: string }[],
 *   question: string,
 *   complete: (params: Record<string, any>, onText?: (text: string) => void) => Promise<string>,
 *   onText?: (text: string) => void,
 *   think?: boolean | 'auto',
 *   trace?: Record<string, string>,
 *   cache?: boolean
 * }} options
 * @returns {Promise<string>}
 */
export function runAsk({ note, turns, question, complete, onText, think, trace, cache }: {
    note: string;
    turns?: {
        question: string;
        reply: string;
    }[];
    question: string;
    complete: (params: Record<string, any>, onText?: (text: string) => void) => Promise<string>;
    onText?: (text: string) => void;
    think?: boolean | "auto";
    trace?: Record<string, string>;
    cache?: boolean;
}): Promise<string>;
export const ASK_KIND: Readonly<{
    ANSWER: "answer";
    EDITS: "edits";
    REWRITE: "rewrite";
    NOT_FOUND: "notFound";
}>;
/** Ask's KV cache and answer replay; off while cached runs cost best-tier accuracy (QVAC plan session 4). */
export const ASK_KV_CACHE_ENABLED: false;
export const ASK_MAX_TOKENS: 500;
export const ASK_QUESTION_MAX_CHARS: 500;
export const ASK_ANSWER_MAX_CHARS: 3000;
export const ASK_EDIT_TEXT_MAX_CHARS: 300;
export const ASK_MAX_EDITS: 20;
export const ASK_REWRITE_MAX_CHANGED_RATIO: 0.35;
export const ASK_REWRITE_MIN_LENGTH_RATIO: 0.6;
export const ASK_GENERATION_PARAMS: Readonly<{
    temp: 0.2;
    repeat_penalty: 1.15;
    frequency_penalty: 0.3;
    predict: 500;
}>;
export const ASK_RESPONSE_FORMAT: Readonly<{
    type: "json_schema";
    json_schema: {
        name: string;
        schema: {
            type: string;
            properties: {
                kind: {
                    type: string;
                    enum: ("rewrite" | "answer" | "edits" | "notFound")[];
                };
                answer: {
                    type: string;
                    maxLength: number;
                };
                edits: {
                    type: string;
                    maxItems: number;
                    items: {
                        type: string;
                        properties: {
                            find: {
                                type: string;
                                minLength: number;
                                maxLength: number;
                            };
                            replace: {
                                type: string;
                                maxLength: number;
                            };
                        };
                        required: string[];
                    };
                };
            };
            required: string[];
        };
    };
}>;
export function isAskQuestion(question: any): boolean;
export function isAskRewriteRequest(question: any): boolean;
export function isAskChangeRequest(question: any): boolean;
export function claimsAskChange(answer: any): boolean;
export function isAskFormattingRequest(question: any): boolean;
export const ASK_ANSWER_MAX_TOKENS: 400;
export const ASK_TOOL_PARAMS: Readonly<{
    temp: 0.2;
    top_p: 0.8;
    top_k: 20;
    repeat_penalty: 1;
    predict: 400;
}>;
export const ASK_ANSWER_PARAMS: Readonly<{
    reasoning_budget: 0;
    temp: 0.2;
    top_p: 0.8;
    top_k: 20;
    repeat_penalty: 1;
    predict: 400;
}>;
export const ASK_THINK_BUDGET: 640;
export const ASK_THINK_PARAMS: Readonly<{
    temp: 0.6;
    top_p: 0.95;
    top_k: 20;
    repeat_penalty: 1;
    reasoning_budget: 640;
    predict: number;
}>;
export function isAskCalculationQuestion(question: any): boolean;
export const ASK_ANSWER_CHANGE: "change";
export const ASK_FULL_TEXT_MAX_CHARS: 1500;
export const ASK_FULL_TEXT_PARAMS: Readonly<{
    reasoning_budget: 0;
    temp: 0.1;
    repeat_penalty: 1.05;
}>;
//# sourceMappingURL=localAiAsk.d.ts.map