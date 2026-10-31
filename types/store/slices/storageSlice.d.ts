export function mediaKind(name?: string): "image" | "video" | "audio" | "file";
export const setNotesStorageInfo: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "storage/setNotesStorageInfo">;
export const setStorageLoading: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "storage/setStorageLoading">;
export const setStorageError: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "storage/setStorageError">;
export const setReclaiming: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "storage/setReclaiming">;
export const removeMediaFromNote: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "storage/removeMediaFromNote">;
export const subscribeStorageInfo: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"storage/subscribe-storage-info">;
export const unsubscribeStorageInfo: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"storage/unsubscribe-storage-info">;
export const deleteNoteMedia: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"storage/delete-note-media">;
export const reclaimStorage: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"storage/reclaim-storage">;
export const retryDownload: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"storage/retry-download">;
export const pauseDownload: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"storage/pause-download">;
export function getStorageState(state: any): any;
export function getNotesStorageInfo(state: any): any;
export function getStorageIsLoading(state: any): any;
export function getStorageError(state: any): any;
export function getTotalBlobBytes(state: any): any;
export function getTotalOnDiskBytes(state: any): any;
export function getReclaimableBytes(state: any): any;
export function getIsReclaiming(state: any): any;
export function getActiveDownloads(state: any): any;
export function getActiveDownloadsCount(state: any): any;
export function getActiveUploads(state: any): any;
export function getActiveUploadsCount(state: any): any;
export function getFilesWaitingToSeal(state: any): any;
export function getTotalStorageSize(state: any): any;
export const selectStorageByKind: ((state: any) => {
    text: {
        count: any;
        size: number;
    };
    image: {
        count: number;
        size: number;
    };
    video: {
        count: number;
        size: number;
    };
    audio: {
        count: number;
        size: number;
    };
    file: {
        count: number;
        size: number;
    };
}) & {
    clearCache: () => void;
    resultsCount: () => number;
    resetResultsCount: () => void;
} & {
    resultFunc: (resultFuncArgs_0: any) => {
        text: {
            count: any;
            size: number;
        };
        image: {
            count: number;
            size: number;
        };
        video: {
            count: number;
            size: number;
        };
        audio: {
            count: number;
            size: number;
        };
        file: {
            count: number;
            size: number;
        };
    };
    memoizedResultFunc: ((resultFuncArgs_0: any) => {
        text: {
            count: any;
            size: number;
        };
        image: {
            count: number;
            size: number;
        };
        video: {
            count: number;
            size: number;
        };
        audio: {
            count: number;
            size: number;
        };
        file: {
            count: number;
            size: number;
        };
    }) & {
        clearCache: () => void;
        resultsCount: () => number;
        resetResultsCount: () => void;
    };
    lastResult: () => {
        text: {
            count: any;
            size: number;
        };
        image: {
            count: number;
            size: number;
        };
        video: {
            count: number;
            size: number;
        };
        audio: {
            count: number;
            size: number;
        };
        file: {
            count: number;
            size: number;
        };
    };
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
    notesStorageInfo: any[];
    totalBlobBytes: number;
    totalOnDiskBytes: number;
    reclaimableBytes: number;
    isReclaiming: boolean;
    downloads: any[];
    uploads: any[];
    sealWaiting: any[];
    isLoading: boolean;
    error: any;
}>;
export default _default;
//# sourceMappingURL=storageSlice.d.ts.map