export function noteStamp(value: any): string;
export function decodeWriterKey(value: any): Uint8Array<ArrayBufferLike>;
export function isValidOp(op: any): boolean;
export namespace OP {
    let ADD_WRITER: string;
    let ADD_NOTE: string;
    let REMOVE_NOTE: string;
    let ADD_FOLDER: string;
    let REMOVE_FOLDER: string;
    let ADD_SETTINGS: string;
    let ADD_SYNCED_DEVICE: string;
    let UPDATE_SYNCED_DEVICE: string;
    let REMOVE_SYNCED_DEVICE: string;
    let DELETE_MEDIA: string;
    let PRUNE_MEDIA_TOMBSTONES: string;
    let LOG_EVENT: string;
    let PRUNE_ACTIVITY: string;
    let CLEAR_ACTIVITY: string;
    let SET_SYNCED_PREF: string;
}
//# sourceMappingURL=ops.d.ts.map