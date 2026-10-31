/**
 * One queue for all AI work in the app, so two models are never loaded at
 * once. User jobs run whenever the app is not suspended. Background jobs
 * (enrichment, indexing) never compete with the user: in the foreground
 * they wait for idle, in the background they need charging, and nothing
 * may hold the scheduler. A job can also require charging outright. They
 * are aborted and requeued when a user job arrives or the conditions end, so
 * `run` must check `signal` often and keep its own resumable progress.
 *
 * @param {{ totalMemoryBytes?: number, canRunModels?: (names: string[], totalMemoryBytes: number) => boolean, maxAttempts?: number, retryDelayMs?: number, abortGraceMs?: number, now?: () => number, log?: (...args: any[]) => void }} [options]
 */
export function createAiJobScheduler({ totalMemoryBytes, canRunModels, maxAttempts, retryDelayMs, abortGraceMs, now, log }?: {
    totalMemoryBytes?: number;
    canRunModels?: (names: string[], totalMemoryBytes: number) => boolean;
    maxAttempts?: number;
    retryDelayMs?: number;
    abortGraceMs?: number;
    now?: () => number;
    log?: (...args: any[]) => void;
}): {
    enqueue: ({ key, priority, label, models, requiresCharging, run }: {
        key: string;
        priority?: number;
        label?: string;
        models?: string[];
        requiresCharging?: boolean;
        run: (ctx: {
            signal: AbortSignal;
            progress: (done: number, total: number) => void;
        }) => Promise<any>;
    }) => any;
    cancel: (key: any) => void;
    setConditions: (next: any) => void;
    setTotalMemory: (bytes: any) => void;
    hold: () => () => void;
    suspend: (timeoutMs?: number) => Promise<any>;
    resume: () => void;
    subscribe: (listener: any) => () => boolean;
    snapshot: () => {
        running: {
            key: any;
            label: any;
            priority: any;
            attempts: any;
            progress: any;
        };
        queued: {
            key: any;
            label: any;
            priority: any;
            attempts: any;
            progress: any;
        }[];
        conditions: {
            foreground: boolean;
            idle: boolean;
            charging: boolean;
            suspended: boolean;
        };
        held: boolean;
    };
    destroy: () => void;
};
export namespace AI_JOB_PRIORITY {
    let USER: number;
    let ENRICHMENT: number;
    let INDEXING: number;
}
export namespace AI_JOB_ERROR {
    let CANCELLED: string;
    let MEMORY: string;
    let DESTROYED: string;
}
export const AI_JOB_MAX_ATTEMPTS: 3;
export const AI_JOB_RETRY_DELAY_MS: 30000;
export const AI_JOB_ABORT_GRACE_MS: 5000;
//# sourceMappingURL=localAiScheduler.d.ts.map