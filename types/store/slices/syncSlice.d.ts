export const createInvite: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"sync/createInvite">;
export const regenerateInvite: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"sync/regenerateInvite">;
export const createInviteSuccess: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "sync/createInviteSuccess">;
export const createInviteFailure: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "sync/createInviteFailure">;
export const clearInviteCode: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"sync/clearInviteCode">;
export const resetInvite: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"sync/resetInvite">;
export const resetReceiverStatus: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"sync/resetReceiverStatus">;
export const setInviterStatus: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "sync/setInviterStatus">;
export const setReceiverStatus: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "sync/setReceiverStatus">;
export const setShowPairingInput: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "sync/setShowPairingInput">;
export const setDeviceRemoved: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "sync/setDeviceRemoved">;
export const setNeedsReload: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "sync/setNeedsReload">;
export const setVaultUpdateRequired: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "sync/setVaultUpdateRequired">;
export const setHeldMerge: import("@reduxjs/toolkit").ActionCreatorWithPayload<any, "sync/setHeldMerge">;
export const dismissHeldMerge: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"sync/dismissHeldMerge">;
export const subscribePairing: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"sync/subscribe-pairing">;
/** @type {import('@reduxjs/toolkit').ActionCreatorWithPayload<{ invite: any, mode?: 'add' | 'replace', vaultName?: string }, 'sync/subscribe-pair-user'>} */
export const subscribePairUser: import("@reduxjs/toolkit").ActionCreatorWithPayload<{
    invite: any;
    mode?: "add" | "replace";
    vaultName?: string;
}, "sync/subscribe-pair-user">;
export const confirmPairing: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"sync/confirm-pairing">;
export const rejectPairing: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"sync/reject-pairing">;
export const subscribeDeviceStatus: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"sync/subscribe-device-status">;
export const clearStorage: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"sync/clear-storage">;
export const fetchHeldMerge: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"sync/fetch-held-merge">;
export const combineHeldMerge: import("@reduxjs/toolkit").ActionCreatorWithoutPayload<"sync/combine-held-merge">;
export function getSyncState(state: any): any;
export function getInvite(state: any): any;
export function getInviteExpiresAt(state: any): any;
export function getSyncIsLoading(state: any): any;
export function getInviterStatus(state: any): any;
export function getReceiverStatus(state: any): any;
export function getShowPairingInput(state: any): any;
export function getDeviceRemoved(state: any): any;
export function getVaultUpdateRequired(state: any): boolean;
export function getNeedsReload(state: any): any;
export function getHeldMerge(state: any): any;
declare const _default: import("redux").Reducer<{
    invite: any;
    inviteId: any;
    publicKey: any;
    expiresAt: any;
    isLoading: boolean;
    error: any;
    showPairingInput: boolean;
    inviterStatus: {
        step: string;
        message: string;
        progress: number;
    };
    receiverStatus: {
        step: string;
        message: string;
        progress: number;
    };
    deviceRemoved: boolean;
    needsReload: boolean;
    vaultUpdateRequired: boolean;
    heldMerge: any;
    heldMergeDismissed: boolean;
}>;
export default _default;
//# sourceMappingURL=syncSlice.d.ts.map