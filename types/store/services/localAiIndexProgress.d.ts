/** The index bar: percent done and, once a run has gone long enough to measure, time left. */
export function getIndexProgress({ index, coverage, sample, now }: {
    index: any;
    coverage: any;
    sample?: any;
    now?: number;
}): {
    running: boolean;
    done: any;
    total: any;
    percent: number;
    remainingMs: number;
};
/** Starts or keeps the rate sample for one index run. */
export function nextIndexSample(sample: any, index: any, now?: number): any;
export function loadIndexBytes(api: any): Promise<any>;
//# sourceMappingURL=localAiIndexProgress.d.ts.map