export const backendBoot: BootTimeline;
export const appBoot: BootTimeline;
declare class BootTimeline {
    constructor(scope: any);
    scope: any;
    origin: number;
    marks: any[];
    reportTimer: number;
    reported: boolean;
    continued: boolean;
    lastReportedAt: number;
    start(at?: number): void;
    mark(label: any): void;
    markRolling(id: any, label: any): void;
    report(): void;
    _rearm(): void;
    _schedule(): void;
}
export {};
//# sourceMappingURL=bootTimeline.d.ts.map