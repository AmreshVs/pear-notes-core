export const setLoading: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "folders/setLoading">;
export const setFolderKeys: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "folders/setFolderKeys">;
export const setFolderData: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "folders/setFolderData">;
export const setFoldersData: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "folders/setFoldersData">;
export const setSelectedFolder: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "folders/setSelectedFolder">;
export const clearState: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"folders/clearState">;
export function getFolderKeys(state: any): any;
export function getFoldersData(state: any): any;
export function getSelectedFolder(state: any): any;
export function getFoldersLoading(state: any): any;
export const getFolders: ((state: any) => any[]) & {
    clearCache: () => void;
    resultsCount: () => number;
    resetResultsCount: () => void;
} & {
    resultFunc: (resultFuncArgs_0: any, resultFuncArgs_1: any) => any[];
    memoizedResultFunc: ((resultFuncArgs_0: any, resultFuncArgs_1: any) => any[]) & {
        clearCache: () => void;
        resultsCount: () => number;
        resetResultsCount: () => void;
    };
    lastResult: () => any[];
    dependencies: [(state: any) => any, (state: any) => any];
    recomputations: () => number;
    resetRecomputations: () => void;
    dependencyRecomputations: () => number;
    resetDependencyRecomputations: () => void;
} & {
    memoize: typeof import("reselect").weakMapMemoize;
    argsMemoize: typeof import("reselect").weakMapMemoize;
};
export const createFolder: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"folders/create-folder">;
export const updateFolder: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"folders/update-folder">;
export const deleteFolder: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"folders/delete-folder">;
export const subscribeAllFolderKeys: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"folders/subscribe-all-folder-keys">;
export const subscribeAllFolders: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"folders/subscribe-all-folders">;
declare const _default: import("redux").Reducer<{
    folderKeys: any[];
    folderData: {};
    selectedFolder: string;
    isLoading: boolean;
    error: any;
}>;
export default _default;
//# sourceMappingURL=foldersSlice.d.ts.map