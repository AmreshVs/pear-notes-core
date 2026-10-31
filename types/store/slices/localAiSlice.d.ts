export function computeFeatureStatus({ config, models, device }: {
    config: any;
    models: any;
    device: any;
}, feature: any): string;
export function computeFeatureProgress({ config, models }: {
    config: any;
    models: any;
}, feature: any): {
    downloadedBytes: number;
    totalBytes: number;
};
export function computeModelUsers(config: any, name: any, exceptFeature?: any): string[];
export function computeModelsStatus(models: any, names: any): {
    status: string;
    error: any;
    downloadedBytes: number;
    totalBytes: number;
    missingBytes: number;
    percent: number;
};
export function computeMissingNames({ config, models }: {
    config: any;
    models: any;
}, feature: any): any[];
export function computeReleasableNames({ config, models }: {
    config: any;
    models: any;
}, feature: any): any[];
export function computeBytesOnDisk(models: any): any;
export function computeFeatureRow(state: any, feature: any): {
    feature: any;
    enabled: boolean;
    onDemand: boolean;
    onDemandBytes: any;
    status: string;
    percent: number;
    downloadedBytes: number;
    totalBytes: number;
    missingBytes: any;
    activeModel: any;
};
export function computeReleasableBytes(state: any, feature: any): any;
export const setAiSuggestions: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "localAi/setAiSuggestions">;
export const setLocalAiLoaded: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "localAi/setLocalAiLoaded">;
export const setLocalAiDevice: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "localAi/setLocalAiDevice">;
export const setLocalAiNetwork: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "localAi/setLocalAiNetwork">;
export const setLocalAiOffloadStatus: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "localAi/setLocalAiOffloadStatus">;
export const setLocalAiOffloadServing: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "localAi/setLocalAiOffloadServing">;
export const setNoteSuggestions: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "localAi/setNoteSuggestions">;
export const clearNoteSuggestion: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "localAi/clearNoteSuggestion">;
export const setLocalAiConfig: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "localAi/setLocalAiConfig">;
export const setLocalAiModel: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "localAi/setLocalAiModel">;
export const setLocalAiModelsProgress: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "localAi/setLocalAiModelsProgress">;
export const removeLocalAiModel: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "localAi/removeLocalAiModel">;
export const setLocalAiNotice: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "localAi/setLocalAiNotice">;
export const clearLocalAiNotice: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"localAi/clearLocalAiNotice">;
export const setLocalAiIndexState: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "localAi/setLocalAiIndexState">;
export const openRelatedNotes: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "localAi/openRelatedNotes">;
export const closeRelatedNotes: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"localAi/closeRelatedNotes">;
export const relatedNotesLoading: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "localAi/relatedNotesLoading">;
export const relatedNotesLoaded: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "localAi/relatedNotesLoaded">;
export const relatedNotesFailed: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "localAi/relatedNotesFailed">;
export const duplicatesLoading: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"localAi/duplicatesLoading">;
export const duplicatesLoaded: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "localAi/duplicatesLoaded">;
export const duplicatesFailed: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"localAi/duplicatesFailed">;
export const duplicatePairDismissed: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "localAi/duplicatePairDismissed">;
export const setUpcomingTitle: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "localAi/setUpcomingTitle">;
export const snoozeUpcomingSuggestion: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "localAi/snoozeUpcomingSuggestion">;
export const clearVaultSimilarity: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"localAi/clearVaultSimilarity">;
export const resetLocalAi: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"localAi/resetLocalAi">;
export const initLocalAi: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"localAi/init">;
export const enableLocalAiFeature: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"localAi/enable-feature">;
export const disableLocalAiFeature: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"localAi/disable-feature">;
export const setLocalAiFeatureTier: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"localAi/set-feature-tier">;
export const setLocalAiFeatureModel: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"localAi/set-feature-model">;
export const setLocalAiOffload: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"localAi/set-offload">;
export const dismissNoteSuggestion: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"localAi/dismiss-note-suggestion">;
export const noteSuggestionAccepted: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"localAi/note-suggestion-accepted">;
export const acceptFolderSuggestion: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"localAi/accept-folder-suggestion">;
export const setLocalAiFeatureLanguage: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"localAi/set-feature-language">;
export const setLocalAiWifiOnly: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"localAi/set-wifi-only">;
export const pauseLocalAiDownload: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"localAi/pause-download">;
export const resumeLocalAiDownload: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"localAi/resume-download">;
export const downloadLocalAiModelNow: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"localAi/download-now">;
export const cancelLocalAiFeatureDownload: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"localAi/cancel-feature-download">;
export const deleteLocalAiModel: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"localAi/delete-model">;
export const deleteAllLocalAiModels: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"localAi/delete-all-models">;
export const localAiNetworkChanged: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"localAi/network-changed">;
export const localAiAppResumed: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"localAi/app-resumed">;
export const downloadLocalAiModels: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"localAi/download-models">;
export const setLocalAiTranslationTarget: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"localAi/set-translation-target">;
export const queueLocalAiDownload: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"localAi/queue-download">;
export const holdLocalAiDownload: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"localAi/hold-download">;
export const localAiConditionsChanged: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"localAi/conditions-changed">;
export const localAiUserActivity: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"localAi/user-activity">;
export const runLocalAiSchedulerProbe: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"localAi/run-scheduler-probe">;
export const enableLocalAiIndex: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"localAi/enable-index">;
export const rebuildLocalAiIndex: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"localAi/rebuild-index">;
export const indexLocalAiNow: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"localAi/index-now">;
export const indexLocalAiInBackground: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"localAi/index-in-background">;
export const loadRelatedNotes: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"localAi/load-related-notes">;
export const loadDuplicateNotes: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"localAi/load-duplicate-notes">;
export const dismissDuplicateNotes: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"localAi/dismiss-duplicate-notes">;
export const loadUpcomingSuggestions: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"localAi/load-upcoming-suggestions">;
export const acceptUpcomingTitle: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"localAi/accept-upcoming-title">;
export const setAiSuggestion: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"localAi/set-ai-suggestion">;
export const loadAiSuggestionPrefs: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"localAi/load-ai-suggestions">;
export function getLocalAiState(state: any): any;
export function getLocalAiLoaded(state: any): any;
export function getLocalAiDevice(state: any): any;
export function getLocalAiNetwork(state: any): any;
export function getLocalAiConfig(state: any): any;
export function getNoteSuggestions(state: any): any;
export function getLocalAiIndex(state: any): any;
export function getSearchByMeaningEnabled(state: any): boolean;
export function getLocalAiModels(state: any): any;
export function getLocalAiNotice(state: any): any;
export function getLocalAiIndexEnabled(state: any): any;
export function getRelatedNotesState(state: any): any;
export function getRelatedNotesKey(state: any): any;
export function getAiSuggestions(state: any): any;
export function getUpcomingSuggestionState(state: any): any;
export function selectAiSuggestionOn(state: any, kind: any): boolean;
export function getDuplicateNotesState(state: any): any;
export function getLocalAiOffloadServing(state: any): any;
export function getLinkedDesktopTitle(state: any): any;
export function selectIndexCoverage(state: any): {
    indexed: number;
    total: any;
};
export function getEmbeddingModelStatus(state: any): any;
export function getMeaningSearchReady(state: any): boolean;
export function getMeaningSearchNotice(state: any): {
    kind: string;
};
/**
 * Why Ask may miss notes: null once every note is indexed, else
 * `{ kind: 'indexing', done, total }`, `{ kind: 'charging', total }`,
 * `{ kind: 'waiting' }` (no index pass yet this session) or `{ kind: 'failed' }`.
 */
export const selectAskIndexNotice: ((state: any) => {
    kind: string;
    done: any;
    total: any;
} | {
    kind: string;
    done?: undefined;
    total?: undefined;
} | {
    kind: string;
    total: any;
    done?: undefined;
}) & {
    clearCache: () => void;
    resultsCount: () => number;
    resetResultsCount: () => void;
} & {
    resultFunc: (resultFuncArgs_0: boolean, resultFuncArgs_1: any) => {
        kind: string;
        done: any;
        total: any;
    } | {
        kind: string;
        done?: undefined;
        total?: undefined;
    } | {
        kind: string;
        total: any;
        done?: undefined;
    };
    memoizedResultFunc: ((resultFuncArgs_0: boolean, resultFuncArgs_1: any) => {
        kind: string;
        done: any;
        total: any;
    } | {
        kind: string;
        done?: undefined;
        total?: undefined;
    } | {
        kind: string;
        total: any;
        done?: undefined;
    }) & {
        clearCache: () => void;
        resultsCount: () => number;
        resetResultsCount: () => void;
    };
    lastResult: () => {
        kind: string;
        done: any;
        total: any;
    } | {
        kind: string;
        done?: undefined;
        total?: undefined;
    } | {
        kind: string;
        total: any;
        done?: undefined;
    };
    dependencies: [(state: any) => boolean, (state: any) => any];
    recomputations: () => number;
    resetRecomputations: () => void;
    dependencyRecomputations: () => number;
    resetDependencyRecomputations: () => void;
} & {
    memoize: typeof import("reselect").weakMapMemoize;
    argsMemoize: typeof import("reselect").weakMapMemoize;
};
export function getLocalAiFeatureConfig(state: any, feature: any): any;
export function getLocalAiTranslationTarget(state: any): any;
export function selectLocalAiModelsStatus(state: any, names: any): {
    status: string;
    error: any;
    downloadedBytes: number;
    totalBytes: number;
    missingBytes: number;
    percent: number;
};
export function selectLocalAiFeatureDisplayNames(state: any, feature: any): any[];
export function selectLocalAiFeatureStatus(state: any, feature: any): string;
export function selectLocalAiFeatureProgress(state: any, feature: any): {
    downloadedBytes: number;
    totalBytes: number;
};
export function selectIsLocalAiFeatureReady(state: any, feature: any): boolean;
export function selectCanUseLinkedDesktop(state: any): boolean;
export function selectIsTextAiAvailable(state: any): boolean;
export function selectLocalAiFeatureModelNames(state: any, feature: any): any[];
export function selectLocalAiModelUsers(state: any, name: any): string[];
export function selectLocalAiBytesOnDisk(state: any): any;
declare const _default: import("redux").Reducer<{
    loaded: boolean;
    device: {
        status: string;
        reason: any;
        totalMemoryBytes: number;
        freeDiskBytes: number;
    };
    network: string;
    config: {
        version: number;
        wifiOnly: boolean;
        features: {
            [k: string]: {
                model?: any;
                enabled: boolean;
                tier: string;
                language: string;
            };
        };
        translation: {
            lastTarget: any;
        };
        offload: {
            useMac: boolean;
            serve: boolean;
        };
        downloaded: {};
    };
    models: {};
    notice: any;
    index: {
        enabled: boolean;
        waitForCharging: boolean;
        status: string;
        done: number;
        total: number;
        deferred: number;
        error: any;
        lastRun: any;
        changedAt: number;
    };
    related: {
        noteKey: any;
        status: string;
        forKey: any;
        hits: any[];
        indexAt: number;
    };
    duplicates: {
        status: string;
        pairs: any[];
        indexAt: number;
    };
    upcoming: {
        title: any;
        snoozed: any[];
    };
    offloadStatus: {
        available: boolean;
        deviceTitle: string;
    };
    offloadServing: {
        active: boolean;
        activeDevice: string;
        lastDevice: string;
        lastAt: number;
    };
    suggestions: {
        noteKey: any;
        title: any;
        folder: any;
    };
    aiSuggestions: Readonly<{
        tasks: true;
        titles: true;
        folders: true;
        related: true;
    }>;
}>;
export default _default;
//# sourceMappingURL=localAiSlice.d.ts.map