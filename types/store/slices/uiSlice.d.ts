export const setSearchQuery: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "ui/setSearchQuery">;
export const setShowSettings: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "ui/setShowSettings">;
export const openAskVault: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "ui/openAskVault">;
export const closeAskVault: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"ui/closeAskVault">;
export const setShouldAutoRenameNextFolder: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "ui/setShouldAutoRenameNextFolder">;
export const setEditor: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "ui/setEditor">;
export const setLoading: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "ui/setLoading">;
export const setHyperdriveServerAddress: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "ui/setHyperdriveServerAddress">;
export function getSearchQuery(state: any): any;
export function getShowSettings(state: any): any;
export function getAskVault(state: any): any;
export function getShouldAutoRenameNextFolder(state: any): any;
export function getIsLoading(state: any): any;
export function getHyperdriveServerAddress(state: any): any;
export const getHyperdriveAddress: ((state: any, url: any) => any) & {
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
    dependencies: [(state: any) => any, (_: any, url: any) => any];
    recomputations: () => number;
    resetRecomputations: () => void;
    dependencyRecomputations: () => number;
    resetDependencyRecomputations: () => void;
} & {
    memoize: typeof import("reselect").weakMapMemoize;
    argsMemoize: typeof import("reselect").weakMapMemoize;
};
export const initApp: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"ui/init-app">;
export const resyncApp: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"ui/resync-app">;
export const refreshHyperdriveAddress: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"ui/refresh-hyperdrive-address">;
export const appSuspended: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"ui/app-suspended">;
export const appResumed: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"ui/app-resumed">;
export const appReady: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"ui/app-ready">;
export const resetAppState: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"ui/reset-app-state">;
export const clearVaultState: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"ui/clear-vault-state">;
export const loadTheme: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"ui/load-theme">;
declare const _default: import("redux").Reducer<{
    searchQuery: string;
    showSettings: boolean;
    askVault: any;
    shouldAutoRenameNextFolder: boolean;
    editor: any;
    isLoading: boolean;
    error: any;
    hyperdriveServerAddress: string;
}>;
export default _default;
//# sourceMappingURL=uiSlice.d.ts.map