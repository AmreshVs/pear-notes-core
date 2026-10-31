export function isActivityEnabled(db: any): Promise<boolean>;
export function recordOp(db: any, op: any, previous: any, { device, seq }: {
    device: any;
    seq: any;
}): Promise<void>;
export function forgetSnapshots(db: any, noteKey: any): Promise<void>;
export function forgetNote(db: any, noteKey: any): Promise<void>;
export function pruneBefore(db: any, cutoff: any): Promise<void>;
export function clearAll(db: any, at: any): Promise<void>;
export function listActivity(db: any, { filter, deviceKey, noteKey, limit, cursor }: {
    filter: any;
    deviceKey: any;
    noteKey: any;
    limit: any;
    cursor: any;
}): Promise<{
    entries: {
        id: any;
        event: any;
        device: any;
        at: any;
        lastAt: any;
        ops: any;
        targetKind: any;
        targetKey: any;
        targetTitle: any;
        locked: boolean;
        added: number;
        removed: number;
        hasDiff: boolean;
        recoverable: boolean;
        meta: any;
    }[];
    cursor: any;
    hasMore: boolean;
}>;
export function activityDiff(db: any, id: any): Promise<{
    id: any;
    before: any;
    after: any;
    locked: boolean;
    available: boolean;
}>;
export function activityStats(db: any): Promise<{
    count: number;
    bytes: number;
    oldestAt: number;
}>;
//# sourceMappingURL=activity.d.ts.map