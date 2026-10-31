/**
 * Distinctive terms for the substring index, which matches literal text:
 * numbers and codes, then capitalised names. Common words are left to the
 * vector search; as substring hits they outranked the right note.
 */
export function vaultKeywordQueries(question: any, max?: number): any[];
/** A short follow-up ("and the hotel?") is searched together with the question before it. */
export function vaultRetrievalQuery(question: any, turns?: any[]): string;
/**
 * Turns ranked notes into numbered sources within the token budget: the chunk
 * the vector search matched, or for a substring-only hit the chunk sharing most
 * words with the question. The best note may add a second chunk.
 *
 * @param {{ ranked: { key: string, chunk?: number, score?: number }[], chunksByNote: Map<string, { heading: string, text: string }[]>, titleOf: (key: string) => string, question: string, maxSources?: number, maxTokens?: number }} options
 */
export function selectVaultSources({ ranked, chunksByNote, titleOf, question, maxSources, maxTokens }: {
    ranked: {
        key: string;
        chunk?: number;
        score?: number;
    }[];
    chunksByNote: Map<string, {
        heading: string;
        text: string;
    }[]>;
    titleOf: (key: string) => string;
    question: string;
    maxSources?: number;
    maxTokens?: number;
}): any[];
/**
 * Finds the passages a vault question needs: vector hits from the index plus
 * substring hits for names and codes, fused with RRF, then cut to the budget.
 * Returns [] when nothing in the vault matches.
 *
 * @param {{ api: { derivedSearch: Function, derivedGet: Function }, embed: (texts: string[]) => Promise<ArrayLike<number>[]>, question: string, turns?: { question: string }[], searchSubstring?: (query: string) => Promise<string[]>, isAllowed?: (key: string) => boolean, scoped?: boolean, titleOf: (key: string) => string, updatedAtOf?: (key: string) => number }} options
 */
export function retrieveVaultSources({ api, embed, question, turns, searchSubstring, isAllowed, scoped, titleOf, updatedAtOf }: {
    api: {
        derivedSearch: Function;
        derivedGet: Function;
    };
    embed: (texts: string[]) => Promise<ArrayLike<number>[]>;
    question: string;
    turns?: {
        question: string;
    }[];
    searchSubstring?: (query: string) => Promise<string[]>;
    isAllowed?: (key: string) => boolean;
    scoped?: boolean;
    titleOf: (key: string) => string;
    updatedAtOf?: (key: string) => number;
}): Promise<any[]>;
export function formatVaultSources(sources: any): any;
export function buildVaultAskMessages({ question, sources, turns, think, reasoning }: {
    question: any;
    sources: any;
    turns?: any[];
    think?: boolean;
    reasoning?: string;
}): {
    role: string;
    content: string;
}[];
/** What the user sees while the answer streams: no reasoning, no NOT_FOUND marker. */
export function visibleVaultAnswer(output: any): any;
/**
 * A cited claim must be backed by its source: every number in it appears in
 * the source (no invented figures) and it shares at least one content word.
 * Computed results ("= 78") are exempt from the number check.
 */
export function claimSupportedBy(claim: any, source: any, toolNumbers?: any[]): boolean;
/**
 * Small models show their working and slip on the arithmetic. Every shown sum
 * is recomputed and its result corrected, and the same wrong value repeated
 * later in the answer is corrected too.
 */
export function correctShownSums(answer: any): {
    text: string;
    corrected: number;
};
/**
 * Parses and checks a vault answer. Citations to sources that don't exist or
 * don't back their sentence are removed; an uncited sentence that one source
 * clearly backs gets that source. `verified` is false when no citation survives.
 */
export function resolveVaultAnswer(output: any, sources: any, { question, toolNumbers }?: {
    question?: string;
    toolNumbers?: any[];
}): {
    kind: "notFound";
    answer: string;
    citations: any[];
    verified: boolean;
    unsupported?: undefined;
    sumsCorrected?: undefined;
} | {
    kind: "answer";
    answer: string;
    citations: {
        n: any;
        noteKey: any;
    }[];
    verified: boolean;
    unsupported: number;
    sumsCorrected: number;
};
/**
 * Answers a vault question from already-retrieved sources. Runs where the
 * model lives; returns the raw model output for `resolveVaultAnswer`.
 * No sources means no model call.
 */
/**
 * @param {{ question: string, sources: { n: number, noteKey: string, title: string, heading: string, text: string, score?: number | null }[], turns?: { question: string, result?: any }[], complete: (params: any, onText?: (text: string) => void) => Promise<string>, onText?: (text: string) => void, think?: boolean | 'auto', trace?: Record<string, string> }} options
 */
export function runVaultAnswer({ question, sources, turns, complete, onText, think, trace }: {
    question: string;
    sources: {
        n: number;
        noteKey: string;
        title: string;
        heading: string;
        text: string;
        score?: number | null;
    }[];
    turns?: {
        question: string;
        result?: any;
    }[];
    complete: (params: any, onText?: (text: string) => void) => Promise<string>;
    onText?: (text: string) => void;
    think?: boolean | "auto";
    trace?: Record<string, string>;
}): Promise<string>;
/**
 * One vault question end to end, the same on every host: `retrieve` finds the
 * sources (frontend, through the backend), `answer` runs the model where it
 * lives and returns its raw output, and the reply is checked here.
 */
/**
 * @param {{ question: string, turns?: any[], retrieve: (question: string, history: any[]) => Promise<any[]>, answer: (sources: any[], history: any[]) => Promise<string | { text: string, toolNumbers?: string[] }> }} options
 */
export function askYourVault({ question, turns, retrieve, answer }: {
    question: string;
    turns?: any[];
    retrieve: (question: string, history: any[]) => Promise<any[]>;
    answer: (sources: any[], history: any[]) => Promise<string | {
        text: string;
        toolNumbers?: string[];
    }>;
}): Promise<{
    sources: any[];
    kind: "notFound";
    answer: string;
    citations: any[];
    verified: boolean;
    unsupported?: undefined;
    sumsCorrected?: undefined;
} | {
    sources: any[];
    kind: "answer";
    answer: string;
    citations: {
        n: any;
        noteKey: any;
    }[];
    verified: boolean;
    unsupported: number;
    sumsCorrected: number;
}>;
/** A saved answer: the answer, then the sources it cites by note title. */
export function vaultAnswerNote({ question, result, sourcesLabel }: {
    question: any;
    result: any;
    sourcesLabel?: string;
}): {
    title: string;
    note: string;
};
export const VAULT_ASK_KIND: Readonly<{
    ANSWER: "answer";
    NOT_FOUND: "notFound";
}>;
export const VAULT_SOURCES_MAX: 5;
export const VAULT_SOURCES_MAX_TOKENS: 1500;
/** A NOT_FOUND is retried once with only the best sources; small models miss facts in long context. */
export const VAULT_RETRY_SOURCES: 2;
/** Below this cosine, a cited source must share a word with the question to count as being about it. */
export const VAULT_SUBJECT_MIN_SCORE: 0.35;
/** A scoped ask filters vector hits afterwards, so it reads past the default top 50. */
export const VAULT_SCOPED_VECTOR_LIMIT: 1000;
export function createVaultTurn(id: any, question: any): {
    id: any;
    question: any;
    status: string;
    result: any;
    sources: any[];
};
export function getVaultHistory(turns: any): {
    question: any;
    result: any;
}[];
//# sourceMappingURL=localAiVaultAsk.d.ts.map