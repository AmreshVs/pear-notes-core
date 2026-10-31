export function captureLogs(): void;
export function captureDependencyConsole(target?: Console): void;
export function captureFatalErrors(runtime: any, rethrow?: typeof rethrowLater): void;
export class ErrorLog {
    constructor({ max }?: {
        max?: number;
    });
    max: number;
    list: any[];
    filePath: any;
    settingsPath: any;
    enabled: boolean;
    _timer: any;
    open(dir: any): void;
    record(level: any, args: any, source?: string): void;
    add({ at, level, source, message, detail }: {
        at: any;
        level: any;
        source: any;
        message: any;
        detail: any;
    }): void;
    _evict(): void;
    note(message: any, detail?: string): void;
    setEnabled(enabled: any): boolean;
    _readSettings(): any;
    _writeSettings(): void;
    entries(): any[];
    clear(): void;
    flushSync(): void;
    _schedulePersist(): void;
}
export const errorLog: ErrorLog;
declare function rethrowLater(err: any): void;
export {};
//# sourceMappingURL=errorLog.d.ts.map