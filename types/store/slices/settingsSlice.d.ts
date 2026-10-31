export const loadSettings: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"settings/loadSettings">;
export const loadSettingsSuccess: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "settings/loadSettingsSuccess">;
export const updateSetting: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "settings/updateSetting">;
export const setTheme: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "settings/setTheme">;
export const clearLockPassword: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"settings/clearLockPassword">;
export const subscribeSettings: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"settings/subscribeSettings">;
export function getSettings(state: any): any;
export function getTheme(state: any): any;
export function getFontFamily(state: any): any;
export function getEditorFontSize(state: any): number;
export function getSortBy(state: any): any;
export function getLockMethod(state: any): any;
export function hasCustomLockPassword(state: any): boolean;
export function getActivityLogEnabled(state: any): boolean;
export function getActivityRetentionDays(state: any): number;
declare const _default: import("redux").Reducer<{
    theme: string;
    fontFamily: string;
    editorFontSize: number;
    sortBy: string;
    lockMethod: string;
    lockPasswordSalt: string;
    lockPasswordHash: string;
    activityLogEnabled: boolean;
    activityRetentionDays: number;
    isLoading: boolean;
}>;
export default _default;
//# sourceMappingURL=settingsSlice.d.ts.map