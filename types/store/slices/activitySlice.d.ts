export const setActivityLoading: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "activity/setActivityLoading">;
export const setActivityLoadingMore: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "activity/setActivityLoadingMore">;
export const setActivityEntries: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "activity/setActivityEntries">;
export const setNoteActivityEntries: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "activity/setNoteActivityEntries">;
export const setActivityFilter: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "activity/setActivityFilter">;
export const setActivityDeviceFilter: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "activity/setActivityDeviceFilter">;
export const openNoteHistory: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "activity/openNoteHistory">;
export const closeNoteHistory: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"activity/closeNoteHistory">;
export const setActivityDiff: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "activity/setActivityDiff">;
export const setActivityRecovering: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "activity/setActivityRecovering">;
export const setActivityStats: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "activity/setActivityStats">;
export const setActivityClearing: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "activity/setActivityClearing">;
export const setActivityError: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "activity/setActivityError">;
export const resetActivity: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"activity/resetActivity">;
export const fetchActivity: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"activity/fetch">;
export const fetchMoreActivity: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"activity/fetch-more">;
export const fetchNoteActivity: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"activity/fetch-note">;
export const fetchActivityDiff: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"activity/fetch-diff">;
export const fetchActivityStats: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"activity/fetch-stats">;
export const recoverDiscardedWrite: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"activity/recover-discarded-write">;
export const clearActivity: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"activity/clear">;
export const subscribeActivity: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"activity/subscribe">;
export const unsubscribeActivity: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"activity/unsubscribe">;
export function getActivityEntries(state: any): any;
export function getActivityCursor(state: any): any;
export function getActivityHasMore(state: any): any;
export function getActivityFilter(state: any): any;
export function getActivityDeviceFilter(state: any): any;
export function getActivityIsLoading(state: any): any;
export function getActivityIsLoadingMore(state: any): any;
export function getActivityIsClearing(state: any): any;
export function getActivityError(state: any): any;
export function getActivityStats(state: any): any;
export function getActivityDiffs(state: any): any;
export function getHistoryNoteKey(state: any): any;
export function getActivityDiff(id: any): (state: any) => any;
export function getIsRecoveringWrite(id: any): (state: any) => boolean;
export function getNoteActivityEntries(noteKey: any): (state: any) => any;
export const getActivityDayGroups: ((state: any) => {
    day: string;
    at: any;
    entries: any[];
}[]) & {
    clearCache: () => void;
    resultsCount: () => number;
    resetResultsCount: () => void;
} & {
    resultFunc: (resultFuncArgs_0: any) => {
        day: string;
        at: any;
        entries: any[];
    }[];
    memoizedResultFunc: ((resultFuncArgs_0: any) => {
        day: string;
        at: any;
        entries: any[];
    }[]) & {
        clearCache: () => void;
        resultsCount: () => number;
        resetResultsCount: () => void;
    };
    lastResult: () => {
        day: string;
        at: any;
        entries: any[];
    }[];
    dependencies: [(state: any) => any];
    recomputations: () => number;
    resetRecomputations: () => void;
    dependencyRecomputations: () => number;
    resetDependencyRecomputations: () => void;
} & {
    memoize: typeof import("reselect").weakMapMemoize;
    argsMemoize: typeof import("reselect").weakMapMemoize;
};
declare const _default: import("redux").Reducer<{
    entries: any[];
    cursor: string;
    hasMore: boolean;
    filter: string;
    deviceKey: string;
    noteKey: string;
    historyNoteKey: any;
    noteEntries: {};
    diffs: {};
    recovering: {};
    stats: {
        count: number;
        bytes: number;
        oldestAt: number;
    };
    isLoading: boolean;
    isLoadingMore: boolean;
    isClearing: boolean;
    error: any;
}>;
export default _default;
//# sourceMappingURL=activitySlice.d.ts.map