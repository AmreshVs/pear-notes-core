export function planSyncLeaders(devices?: any[]): {
    leaders: any[];
    leaderCount: number;
    offlineLeaders: any[];
    max: number;
    recommended: number;
    leadersOnline: boolean;
    canAdd: boolean;
    canRemove: boolean;
    needsBothOnline: boolean;
    suggested: any;
};
export const setLoading: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "syncedDevices/setLoading">;
export const setDevicesKeys: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "syncedDevices/setDevicesKeys">;
export const setDeviceData: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "syncedDevices/setDeviceData">;
export const setLocalPreference: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "syncedDevices/setLocalPreference">;
export const setError: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "syncedDevices/setError">;
export const setIndexerPending: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "syncedDevices/setIndexerPending">;
export const setIndexerError: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "syncedDevices/setIndexerError">;
export const clearIndexerError: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"syncedDevices/clearIndexerError">;
export function getDevicesKeys(state: any): any;
export function getDevicesData(state: any): any;
export function getLocalPreferences(state: any): any;
export function getIsLoading(state: any): any;
export const getSyncedDevices: ((state: any) => any) & {
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
export const getRemoteSyncedDevices: ((state: any) => any) & {
    clearCache: () => void;
    resultsCount: () => number;
    resetResultsCount: () => void;
} & {
    resultFunc: (resultFuncArgs_0: any) => any;
    memoizedResultFunc: ((resultFuncArgs_0: any) => any) & {
        clearCache: () => void;
        resultsCount: () => number;
        resetResultsCount: () => void;
    };
    lastResult: () => any;
    dependencies: [((state: any) => any) & {
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
    }];
    recomputations: () => number;
    resetRecomputations: () => void;
    dependencyRecomputations: () => number;
    resetDependencyRecomputations: () => void;
} & {
    memoize: typeof import("reselect").weakMapMemoize;
    argsMemoize: typeof import("reselect").weakMapMemoize;
};
export const getLinkedDeviceCount: ((state: any) => any) & {
    clearCache: () => void;
    resultsCount: () => number;
    resetResultsCount: () => void;
} & {
    resultFunc: (resultFuncArgs_0: any) => any;
    memoizedResultFunc: ((resultFuncArgs_0: any) => any) & {
        clearCache: () => void;
        resultsCount: () => number;
        resetResultsCount: () => void;
    };
    lastResult: () => any;
    dependencies: [((state: any) => any) & {
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
    }];
    recomputations: () => number;
    resetRecomputations: () => void;
    dependencyRecomputations: () => number;
    resetDependencyRecomputations: () => void;
} & {
    memoize: typeof import("reselect").weakMapMemoize;
    argsMemoize: typeof import("reselect").weakMapMemoize;
};
export const getHasLinkedDevices: ((state: any) => boolean) & {
    clearCache: () => void;
    resultsCount: () => number;
    resetResultsCount: () => void;
} & {
    resultFunc: (resultFuncArgs_0: any) => boolean;
    memoizedResultFunc: ((resultFuncArgs_0: any) => boolean) & {
        clearCache: () => void;
        resultsCount: () => number;
        resetResultsCount: () => void;
    };
    lastResult: () => boolean;
    dependencies: [((state: any) => any) & {
        clearCache: () => void;
        resultsCount: () => number;
        resetResultsCount: () => void;
    } & {
        resultFunc: (resultFuncArgs_0: any) => any;
        memoizedResultFunc: ((resultFuncArgs_0: any) => any) & {
            clearCache: () => void;
            resultsCount: () => number;
            resetResultsCount: () => void;
        };
        lastResult: () => any;
        dependencies: [((state: any) => any) & {
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
        }];
        recomputations: () => number;
        resetRecomputations: () => void;
        dependencyRecomputations: () => number;
        resetDependencyRecomputations: () => void;
    } & {
        memoize: typeof import("reselect").weakMapMemoize;
        argsMemoize: typeof import("reselect").weakMapMemoize;
    }];
    recomputations: () => number;
    resetRecomputations: () => void;
    dependencyRecomputations: () => number;
    resetDependencyRecomputations: () => void;
} & {
    memoize: typeof import("reselect").weakMapMemoize;
    argsMemoize: typeof import("reselect").weakMapMemoize;
};
export function getIndexerPendingKey(state: any): any;
export function getIndexerPendingStep(state: any): any;
export function getIndexerError(state: any): any;
export function getIndexerErrorDeviceKey(state: any): any;
export function canAddSyncLeader(device: any, plan: any): boolean;
export function canRemoveSyncLeader(device: any, plan: any): any;
export const getSyncLeaderPlan: ((state: any) => {
    leaders: any[];
    leaderCount: number;
    offlineLeaders: any[];
    max: number;
    recommended: number;
    leadersOnline: boolean;
    canAdd: boolean;
    canRemove: boolean;
    needsBothOnline: boolean;
    suggested: any;
}) & {
    clearCache: () => void;
    resultsCount: () => number;
    resetResultsCount: () => void;
} & {
    resultFunc: (resultFuncArgs_0: any) => {
        leaders: any[];
        leaderCount: number;
        offlineLeaders: any[];
        max: number;
        recommended: number;
        leadersOnline: boolean;
        canAdd: boolean;
        canRemove: boolean;
        needsBothOnline: boolean;
        suggested: any;
    };
    memoizedResultFunc: ((resultFuncArgs_0: any) => {
        leaders: any[];
        leaderCount: number;
        offlineLeaders: any[];
        max: number;
        recommended: number;
        leadersOnline: boolean;
        canAdd: boolean;
        canRemove: boolean;
        needsBothOnline: boolean;
        suggested: any;
    }) & {
        clearCache: () => void;
        resultsCount: () => number;
        resetResultsCount: () => void;
    };
    lastResult: () => {
        leaders: any[];
        leaderCount: number;
        offlineLeaders: any[];
        max: number;
        recommended: number;
        leadersOnline: boolean;
        canAdd: boolean;
        canRemove: boolean;
        needsBothOnline: boolean;
        suggested: any;
    };
    dependencies: [((state: any) => any) & {
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
    }];
    recomputations: () => number;
    resetRecomputations: () => void;
    dependencyRecomputations: () => number;
    resetDependencyRecomputations: () => void;
} & {
    memoize: typeof import("reselect").weakMapMemoize;
    argsMemoize: typeof import("reselect").weakMapMemoize;
};
export const getIsLocalDeviceIndexer: ((state: any) => any) & {
    clearCache: () => void;
    resultsCount: () => number;
    resetResultsCount: () => void;
} & {
    resultFunc: (resultFuncArgs_0: any) => any;
    memoizedResultFunc: ((resultFuncArgs_0: any) => any) & {
        clearCache: () => void;
        resultsCount: () => number;
        resetResultsCount: () => void;
    };
    lastResult: () => any;
    dependencies: [((state: any) => any) & {
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
    }];
    recomputations: () => number;
    resetRecomputations: () => void;
    dependencyRecomputations: () => number;
    resetDependencyRecomputations: () => void;
} & {
    memoize: typeof import("reselect").weakMapMemoize;
    argsMemoize: typeof import("reselect").weakMapMemoize;
};
export const fetchSyncedDevices: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"syncedDevices/fetch-all">;
export const updateSyncedDevice: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"syncedDevices/update">;
/** @type {import('@reduxjs/toolkit').ActionCreatorWithPayload<{ key: string }, 'syncedDevices/delete'>} */
export const deleteSyncedDevice: import("@reduxjs/toolkit").ActionCreatorWithPayload<{
    key: string;
}, "syncedDevices/delete">;
export const subscribeAllSyncedDevicesKeys: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"syncedDevices/subscribe-all-synced-device-keys">;
export const subscribeAllSyncedDevices: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"syncedDevices/subscribe-all-synced-device">;
export const fetchLocalPreference: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"syncedDevices/fetch-preference">;
export const saveLocalPreference: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"syncedDevices/save-preference">;
export const checkAndInsertLocalDevice: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"syncedDevices/check-and-insert-local">;
/** @type {import('@reduxjs/toolkit').ActionCreatorWithPayload<{ key: string, localKey: string, isIndexer: boolean }, 'syncedDevices/set-indexer'>} */
export const setDeviceIndexer: import("@reduxjs/toolkit").ActionCreatorWithPayload<{
    key: string;
    localKey: string;
    isIndexer: boolean;
}, "syncedDevices/set-indexer">;
declare const _default: import("redux").Reducer<{
    devicesKeys: any[];
    devicesData: {};
    localPreferences: {};
    isLoading: boolean;
    error: any;
    indexerPendingKey: any;
    indexerPendingStep: any;
    indexerError: any;
    indexerErrorDeviceKey: any;
}>;
export default _default;
//# sourceMappingURL=syncedDevicesSlice.d.ts.map