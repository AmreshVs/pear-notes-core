export function getAiJobScheduler(): any;
export function withAiJobHold(work: any): Promise<any>;
/**
 * A model-free background job for the M0 exit test: it steps once a second,
 * stops at every abort and resumes from its own progress, logging each turn.
 */
export function enqueueSchedulerProbe({ steps }?: {
    steps?: number;
}): any;
export function resetAiJobSchedulerForTests(): void;
export const AI_JOBS_IDLE_MS: 20000;
export const AI_SCHEDULER_PROBE_KEY: "scheduler-probe";
export const AI_SCHEDULER_PROBE_STEPS: 120;
export function abortableDelay(ms: any, signal: any): Promise<any>;
export function holdAiJobs(): any;
//# sourceMappingURL=localAiJobs.d.ts.map