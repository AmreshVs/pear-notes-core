export const setExportStatus: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "backup/setExportStatus">;
export const setImportStatus: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "backup/setImportStatus">;
export const setExportBuffer: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "backup/setExportBuffer">;
export const resetExport: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"backup/resetExport">;
export const resetImport: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"backup/resetImport">;
export const startExportBackup: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"backup/start-export">;
export const startImportBackup: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"backup/start-import">;
export const cancelExportBackup: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"backup/cancel-export">;
export const cancelImportBackup: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"backup/cancel-import">;
export function getBackupState(state: any): any;
export function getExportStatus(state: any): any;
export function getImportStatus(state: any): any;
export function getExportBuffer(state: any): any;
declare const _default: import("redux").Reducer<{
    exportStatus: {
        step: string;
        message: string;
        progress: number;
        current: number;
        total: number;
    };
    importStatus: {
        step: string;
        message: string;
        progress: number;
        current: number;
        total: number;
    };
    exportBuffer: any;
}>;
export default _default;
//# sourceMappingURL=backupSlice.d.ts.map