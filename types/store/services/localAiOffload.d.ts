/** Called with the app's own cancel, so a job on the desktop stops too. */
export function cancelAiOffloadRuns(): void;
export function runOnLinkedDesktop({ kind, payload, onText }: {
    kind: any;
    payload: any;
    onText?: () => void;
}): Promise<{
    text: string;
    data: any;
}>;
/**
 * Phone side: an Ask job goes to a linked desktop when the switch is on and
 * one is serving; anything that fails before text arrives runs here instead.
 */
export function withAiOffload({ kind, payload, onProgress, local, localFirst }: {
    kind: any;
    payload: any;
    onProgress: any;
    local: any;
    localFirst?: boolean;
}): Promise<any>;
/**
 * The whole vault Ask on a linked desktop: it finds the sources in its own
 * index and answers. Returns the raw answer and the sources for this device
 * to check the citations against.
 */
export function askVaultOnLinkedDesktop({ question, turns, folderKey, onProgress }: {
    question: any;
    turns: any;
    folderKey: any;
    onProgress: any;
}): Promise<{
    raw: string;
    sources: any;
    toolNumbers: any;
}>;
/** Ask your vault through a linked desktop, with the answer checked here like a local one. */
export function askYourVaultViaDesktop({ question, turns, folderKey, onProgress }: {
    question: any;
    turns?: any[];
    folderKey: any;
    onProgress: any;
}): Promise<{
    sources: any;
    kind: "notFound";
    answer: string;
    citations: any[];
    verified: boolean;
    unsupported?: undefined;
    sumsCorrected?: undefined;
} | {
    sources: any;
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
/** The desktop's own task functions, called with what a phone may send. */
export function createAiOffloadRunner({ askVault, askAboutNote, runNoteTask, retrieveVaultSources, getFeatureConfig }: {
    askVault: any;
    askAboutNote: any;
    runNoteTask: any;
    retrieveVaultSources: any;
    getFeatureConfig: any;
}): ({ kind, payload, onProgress, signal }: {
    kind: any;
    payload: any;
    onProgress: any;
    signal: any;
}) => any;
/**
 * Desktop side: while `canServe()` returns null the backend tells linked
 * phones this device answers, and jobs run one at a time through `runJob`.
 * `canServe()` returns an error code ('not-serving', 'on-battery') otherwise.
 */
export function serveAiOffload({ runJob, canServe, onActivity }: {
    runJob: any;
    canServe: any;
    onActivity?: () => void;
}): {
    refresh: () => Promise<void>;
    stop(): void;
};
export const AI_OFFLOAD_KIND: Readonly<{
    VAULT_ANSWER: "vault-answer";
    VAULT_ASK: "vault-ask";
    ASK_NOTE: "ask-note";
    NOTE_TASK: "note-task";
}>;
export function setAiOffloadUseMac(enabled: any): void;
export function isAiOffloadEnabled(): boolean;
//# sourceMappingURL=localAiOffload.d.ts.map