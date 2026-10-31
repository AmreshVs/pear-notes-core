/**
 * Category of one top-level entry of the backend's storage directory, or null for an
 * entry the backend does not own (the caller files those under its own rules).
 */
export function classifyVaultStorageEntry(name: any): string;
export function summarizeDeviceStorage(items: any): {
    total: number;
    byCategory: {
        [k: string]: number;
    };
};
/** The index sits inside the vault folders but is on-device AI data, so it moves from Notes to AI. */
export function countDerivedAsAi(summary: any, derivedBytes: any): any;
export function getVisibleDeviceStorageRows(summary: any, showAiModels: any): string[];
export namespace DEVICE_STORAGE {
    let APP: string;
    let NOTES: string;
    let OLD_VAULTS: string;
    let AI_MODELS: string;
    let CACHE: string;
    let PREVIEWS: string;
    let LOGS: string;
    let OTHER: string;
}
export const DEVICE_STORAGE_ORDER: string[];
export function isOldVaultEntry(name: any): boolean;
/** Each vault's AI index (backend DERIVED_DIR), at vaults/<id>/derived. */
export const VAULT_DERIVED_DIR: "derived";
export namespace DEVICE_STORAGE_ACTION {
    let CLEAR_CACHE: string;
    let DELETE_OLD_VAULTS: string;
    let OPEN_AI_MODELS: string;
}
/** @type {Record<string, { label: string, desc: string, action?: string }>} */
export const DEVICE_STORAGE_ROWS: Record<string, {
    label: string;
    desc: string;
    action?: string;
}>;
//# sourceMappingURL=deviceStorage.d.ts.map