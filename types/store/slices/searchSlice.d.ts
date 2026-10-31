export namespace SEARCH_SCOPE {
    let FOLDER: string;
    let ALL: string;
}
export namespace SEARCH_STATUS {
    let IDLE: string;
    let PENDING: string;
    let DONE: string;
    let FAILED: string;
}
export namespace MEANING_STATUS {
    let IDLE_1: string;
    export { IDLE_1 as IDLE };
    let PENDING_1: string;
    export { PENDING_1 as PENDING };
    let DONE_1: string;
    export { DONE_1 as DONE };
    export let UNAVAILABLE: string;
}
export const setSearchScope: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "search/setSearchScope">;
export const setSearchIncludeLocked: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "search/setSearchIncludeLocked">;
export const searchStarted: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "search/searchStarted">;
export const searchResultsReceived: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "search/searchResultsReceived">;
export const searchFailed: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"search/searchFailed">;
export const meaningSearchStarted: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "search/meaningSearchStarted">;
export const meaningResultsReceived: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "search/meaningResultsReceived">;
export const meaningSearchUnavailable: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "search/meaningSearchUnavailable">;
export const clearSearchResults: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"search/clearSearchResults">;
export const prewarmSearch: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"search/prewarm">;
export const refreshSearch: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"search/refresh">;
export function getSearchScope(state: any): any;
export function getSearchIncludeLocked(state: any): any;
export function getSearchStatus(state: any): any;
export function getSearchTotal(state: any): any;
export function getMeaningSearch(state: any): any;
export const getSearchTerms: ((state: any) => string[]) & {
    clearCache: () => void;
    resultsCount: () => number;
    resetResultsCount: () => void;
} & {
    resultFunc: (resultFuncArgs_0: any) => string[];
    memoizedResultFunc: ((resultFuncArgs_0: any) => string[]) & {
        clearCache: () => void;
        resultsCount: () => number;
        resetResultsCount: () => void;
    };
    lastResult: () => string[];
    dependencies: [(state: any) => any];
    recomputations: () => number;
    resetRecomputations: () => void;
    dependencyRecomputations: () => number;
    resetDependencyRecomputations: () => void;
} & {
    memoize: typeof import("reselect").weakMapMemoize;
    argsMemoize: typeof import("reselect").weakMapMemoize;
};
export const getActiveSearchHits: ((state: any) => any) & {
    clearCache: () => void;
    resultsCount: () => number;
    resetResultsCount: () => void;
} & {
    resultFunc: (resultFuncArgs_0: any, resultFuncArgs_1: any) => any;
    memoizedResultFunc: ((resultFuncArgs_0: any, resultFuncArgs_1: any) => any) & {
        clearCache: () => void;
        resultsCount: () => number;
        resetResultsCount: () => void;
    };
    lastResult: () => any;
    dependencies: [(state: any) => any, (state: any) => any];
    recomputations: () => number;
    resetRecomputations: () => void;
    dependencyRecomputations: () => number;
    resetDependencyRecomputations: () => void;
} & {
    memoize: typeof import("reselect").weakMapMemoize;
    argsMemoize: typeof import("reselect").weakMapMemoize;
};
export function getSearchHit(state: any, key: any): any;
export function getTitleHighlight(title: any, terms: any): string;
export function parseHighlight(highlight: any): any;
export function getSearchSettled(state: any): boolean;
declare const _default: import("redux").Reducer<{
    scope: string;
    includeLocked: boolean;
    status: string;
    pendingQuery: string;
    query: string;
    folderKey: string;
    hits: {};
    total: number;
    meaning: {
        status: string;
        query: string;
        indexAt: number;
        hits: any[];
    };
}>;
export default _default;
//# sourceMappingURL=searchSlice.d.ts.map