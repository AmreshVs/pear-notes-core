export const setVaults: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "vaults/setVaults">;
export const setVaultPending: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "vaults/setVaultPending">;
export const setVaultError: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "vaults/setVaultError">;
export const setForceRemovalId: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "vaults/setForceRemovalId">;
export const clearVaultError: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"vaults/clearVaultError">;
export const vaultEntered: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"vaults/vaultEntered">;
export const loadVaults: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"vaults/load">;
/** @type {import('@reduxjs/toolkit').ActionCreatorWithPayload<{ name: string }, 'vaults/create'>} */
export const createVault: import("@reduxjs/toolkit").ActionCreatorWithPayload<{
    name: string;
}, "vaults/create">;
/** @type {import('@reduxjs/toolkit').ActionCreatorWithPayload<{ id: string }, 'vaults/switch'>} */
export const switchVault: import("@reduxjs/toolkit").ActionCreatorWithPayload<{
    id: string;
}, "vaults/switch">;
/** @type {import('@reduxjs/toolkit').ActionCreatorWithPayload<{ id: string, name: string }, 'vaults/rename'>} */
export const renameVault: import("@reduxjs/toolkit").ActionCreatorWithPayload<{
    id: string;
    name: string;
}, "vaults/rename">;
/** @type {import('@reduxjs/toolkit').ActionCreatorWithPayload<{ id: string, force?: boolean }, 'vaults/remove'>} */
export const removeVault: import("@reduxjs/toolkit").ActionCreatorWithPayload<{
    id: string;
    force?: boolean;
}, "vaults/remove">;
/** @type {import('@reduxjs/toolkit').ActionCreatorWithPayload<{ targetId: string, noteKeys?: string[], folderKeys?: string[] }, 'vaults/move'>} */
export const moveToVault: import("@reduxjs/toolkit").ActionCreatorWithPayload<{
    targetId: string;
    noteKeys?: string[];
    folderKeys?: string[];
}, "vaults/move">;
export function getVaults(state: any): any;
export function getVaultPending(state: any): any;
export function getVaultPendingId(state: any): any;
export function getVaultError(state: any): any;
export function getVaultFailedAction(state: any): any;
export function getVaultEnteredAt(state: any): any;
export function getForceRemovalId(state: any): any;
export const getCurrentVault: ((state: any) => any) & {
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
    dependencies: [(state: any) => any];
    recomputations: () => number;
    resetRecomputations: () => void;
    dependencyRecomputations: () => number;
    resetDependencyRecomputations: () => void;
} & {
    memoize: typeof import("reselect").weakMapMemoize;
    argsMemoize: typeof import("reselect").weakMapMemoize;
};
export const getHasMultipleVaults: ((state: any) => boolean) & {
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
    dependencies: [(state: any) => any];
    recomputations: () => number;
    resetRecomputations: () => void;
    dependencyRecomputations: () => number;
    resetDependencyRecomputations: () => void;
} & {
    memoize: typeof import("reselect").weakMapMemoize;
    argsMemoize: typeof import("reselect").weakMapMemoize;
};
export const getOtherVaults: ((state: any) => any) & {
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
    dependencies: [(state: any) => any];
    recomputations: () => number;
    resetRecomputations: () => void;
    dependencyRecomputations: () => number;
    resetDependencyRecomputations: () => void;
} & {
    memoize: typeof import("reselect").weakMapMemoize;
    argsMemoize: typeof import("reselect").weakMapMemoize;
};
export const getCanAddVault: ((state: any) => boolean) & {
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
    list: any[];
    pending: any;
    pendingId: any;
    error: any;
    failedAction: any;
    forceRemovalId: any;
    enteredAt: number;
}>;
export default _default;
//# sourceMappingURL=vaultsSlice.d.ts.map