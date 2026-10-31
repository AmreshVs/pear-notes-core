/**
 * The tip to show now, or null. `eligible` lists tips whose condition holds
 * on this device. A tip already on screen stays while it still applies; a new
 * one waits a day after the last, and nothing shows in the first minutes.
 * `local` is per device: `{ firstSeenAt, lastShownAt, currentTip, records, catchUpDays }`.
 */
export function pickTip({ eligible, records, local, now, enabled }: {
    eligible: any;
    records?: {};
    local?: {};
    now?: number;
    enabled?: boolean;
}): any;
/** The synced record after the user answers a tip. Two "Not now"s retire it. */
export function answerTip(record: any, action: any, now?: number): {
    retired: boolean;
    notNow?: undefined;
    snoozedUntil?: undefined;
} | {
    retired: boolean;
    notNow: any;
    snoozedUntil?: undefined;
} | {
    notNow: any;
    snoozedUntil: number;
    retired?: undefined;
};
export function loadTipRecords(): Promise<{
    records: any;
    enabled: boolean;
}>;
/**
 * Days (local midnight) on which other devices' edits were still arriving
 * after the app opened, kept for two weeks.
 */
export function addCatchUpDay(days: any[], at: any): any[];
/**
 * Background sync tips for a phone. `mode` is 'off' | 'periodic' | 'always-on';
 * `backgroundAllowed` is false when the OS will never run the task (iOS Background
 * App Refresh off) and `batteryRestricted` is Android battery optimisation.
 * `modeSince` is when this device last changed mode.
 */
export function backgroundSyncTips({ platform, mode, hasLinkedDevices, devices, backgroundAllowed, batteryRestricted, snapshot, modeSince, catchUpDays, now }: {
    platform: any;
    mode: any;
    hasLinkedDevices: any;
    devices?: any[];
    backgroundAllowed?: boolean;
    batteryRestricted?: boolean;
    snapshot?: {};
    modeSince?: number;
    catchUpDays?: any[];
    now?: number;
}): string[];
export const TIP: Readonly<{
    SYNC_BLOCKED: "syncBlocked";
    INDEX_CHARGING: "indexCharging";
    USE_MAC: "useMac";
    ALWAYS_ON_SYNC: "alwaysOnSync";
    BACKGROUND_SYNC: "backgroundSync";
    SERVE_PHONE: "servePhone";
    REMINDERS_OFF: "remindersOff";
    YEARLY_DATES: "yearlyDates";
}>;
export const TIP_ORDER: readonly ("useMac" | "syncBlocked" | "indexCharging" | "alwaysOnSync" | "backgroundSync" | "servePhone" | "remindersOff" | "yearlyDates")[];
export const DEVICE_TIPS: readonly ("syncBlocked" | "alwaysOnSync" | "backgroundSync")[];
export const TIP_ACTION: Readonly<{
    ACCEPT: "accept";
    NOT_NOW: "notNow";
    DISMISS: "dismiss";
}>;
export const TIP_SNOOZE_MS: number;
export const TIP_NEW_TIP_GAP_MS: number;
export const TIP_INSTALL_QUIET_MS: number;
export const TIPS_SETTINGS_ID: "tips";
export function saveTipAnswer(tip: any, record: any, action: any): Promise<boolean>;
export function setTipsEnabled(enabled: any): Promise<boolean>;
export function tipRecord(records: any, tip: any, local?: {}): any;
export function isDeviceTip(tip: any): boolean;
export function answerDeviceTip(local: any, tip: any, action: any, now?: number): any;
export const CATCH_UP_WINDOW_MS: number;
/** Tips that apply from the store alone; apps add their own (reminders, yearly dates). */
export const selectStoreTips: ((state: any, isPhone: any) => string[]) & {
    clearCache: () => void;
    resultsCount: () => number;
    resetResultsCount: () => void;
} & {
    resultFunc: (resultFuncArgs_0: any, resultFuncArgs_1: boolean, resultFuncArgs_2: any, resultFuncArgs_3: any, resultFuncArgs_4: any, resultFuncArgs_5: any) => string[];
    memoizedResultFunc: ((resultFuncArgs_0: any, resultFuncArgs_1: boolean, resultFuncArgs_2: any, resultFuncArgs_3: any, resultFuncArgs_4: any, resultFuncArgs_5: any) => string[]) & {
        clearCache: () => void;
        resultsCount: () => number;
        resetResultsCount: () => void;
    };
    lastResult: () => string[];
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
    }, (state: any) => boolean, (state: any) => any, (state: any) => any, (state: any) => any, (_state: any, isPhone: any) => any];
    recomputations: () => number;
    resetRecomputations: () => void;
    dependencyRecomputations: () => number;
    resetDependencyRecomputations: () => void;
} & {
    memoize: typeof import("reselect").weakMapMemoize;
    argsMemoize: typeof import("reselect").weakMapMemoize;
};
//# sourceMappingURL=tips.d.ts.map