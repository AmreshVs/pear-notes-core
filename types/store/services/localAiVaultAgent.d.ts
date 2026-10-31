export function buildVaultAgentMessages({ question, sources, turns, now }: {
    question: any;
    sources: any;
    turns?: any[];
    now?: number;
}): {
    role: string;
    content: string;
}[];
/**
 * Ask your vault with tools, for models that can route them (M2: large and XL).
 * `step` runs one model turn on the host and returns its text and tool calls;
 * `search` and `getNoteText` reach the user's notes from the frontend. Write
 * tools never write: they only add a proposal the user confirms later.
 *
 * @param {{ question: string, sources: any[], turns?: any[], step: (input: { messages: any[], tools?: any[], generationParams: any }) => Promise<{ text: string, toolCalls?: { name: string, arguments: Record<string, any> }[] }>, search?: (query: string) => Promise<any[]>, getNoteText?: (noteKey: string) => Promise<string>, now?: number, maxCalls?: number }} options
 */
export function runVaultAgent({ question, sources: initial, turns, step, search, getNoteText, now, maxCalls }: {
    question: string;
    sources: any[];
    turns?: any[];
    step: (input: {
        messages: any[];
        tools?: any[];
        generationParams: any;
    }) => Promise<{
        text: string;
        toolCalls?: {
            name: string;
            arguments: Record<string, any>;
        }[];
    }>;
    search?: (query: string) => Promise<any[]>;
    getNoteText?: (noteKey: string) => Promise<string>;
    now?: number;
    maxCalls?: number;
}): Promise<{
    raw: string;
    result: {
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
    };
    proposals: any[];
    toolsUsed: string[];
    calls: {
        name: string;
        arguments: Record<string, any>;
        output: {
            days: number;
            hours: number;
            minutes: number;
            text: string;
            result?: undefined;
        } | {
            result: string;
            days?: undefined;
            hours?: undefined;
            minutes?: undefined;
            text?: undefined;
        } | {
            result: number;
            unit: string;
        } | {
            result: number;
            results?: undefined;
            note?: undefined;
            error?: undefined;
            n?: undefined;
            text?: undefined;
            status?: undefined;
        } | {
            results: any[];
            note: string;
            result?: undefined;
            error?: undefined;
            n?: undefined;
            text?: undefined;
            status?: undefined;
        } | {
            results: {
                n: any;
                note: any;
                text: string;
            }[];
            result?: undefined;
            note?: undefined;
            error?: undefined;
            n?: undefined;
            text?: undefined;
            status?: undefined;
        } | {
            error: string;
            result?: undefined;
            results?: undefined;
            note?: undefined;
            n?: undefined;
            text?: undefined;
            status?: undefined;
        } | {
            n: any;
            note: any;
            text: string;
            result?: undefined;
            results?: undefined;
            error?: undefined;
            status?: undefined;
        } | {
            status: string;
            note: string;
            result?: undefined;
            results?: undefined;
            error?: undefined;
            n?: undefined;
            text?: undefined;
        };
    }[];
    toolNumbers: string[];
}>;
/**
 * Tool loop for calculation questions on a tool-calling model, else the fixed pipeline; `toolNumbers` back computed numbers.
 * @param {{ question: string, sources: any[], turns?: any[], modelName: string, complete: (params: any, onText?: (text: string) => void) => Promise<string>, step: (input: { messages: any[], tools?: any[], generationParams: any }) => Promise<{ text: string, toolCalls?: any[] }>, onText?: (text: string) => void, now?: number }} options
 */
export function runVaultAnswerOnHost({ question, sources, turns, modelName, complete, step, onText, now }: {
    question: string;
    sources: any[];
    turns?: any[];
    modelName: string;
    complete: (params: any, onText?: (text: string) => void) => Promise<string>;
    step: (input: {
        messages: any[];
        tools?: any[];
        generationParams: any;
    }) => Promise<{
        text: string;
        toolCalls?: any[];
    }>;
    onText?: (text: string) => void;
    now?: number;
}): Promise<{
    text: string;
    toolNumbers: string[];
}>;
/** Tool calls per question; the last step then has to answer. */
export const VAULT_AGENT_MAX_CALLS: 4;
export function shouldUseVaultTools(modelName: any, question: any, turns?: any[]): boolean;
//# sourceMappingURL=localAiVaultAgent.d.ts.map