export function secureKey(from?: any): any;
export function wipe(key: any): void;
export function rootKeyFromHex(value: any): any;
export function isKeyringEntry(entry: any): boolean;
export function compareKeyrings(a: any, b: any): 1 | 0 | -1;
export function currentKeyring(entries: any): any;
export function createKeyring(password: any, { params, now }?: {
    params?: {
        ops: number;
        mem: number;
    };
    now?: number;
}): Promise<{
    entry: {
        id: any;
        v: number;
        kdf: string;
        ops: any;
        mem: any;
        salt: string;
        wrapped: string;
        check: string;
        createdAt: any;
    };
    rootKey: any;
}>;
export function rewrapKeyring(rootKey: any, password: any, entry: any, { params }?: {
    params?: {
        ops: number;
        mem: number;
    };
}): Promise<{
    id: any;
    v: number;
    kdf: string;
    ops: any;
    mem: any;
    salt: string;
    wrapped: string;
    check: string;
    createdAt: any;
}>;
export function openKeyring(password: any, entry: any): Promise<any>;
export function rootKeyOpens(rootKey: any, entry: any): boolean;
export function openBody(roots: any, noteKey: any, sealed: any): string;
export function sealBody(roots: any, keyringId: any, noteKey: any, html: any, { previous, links, files }?: {
    previous?: string;
    links?: any[];
    files?: Map<any, any>;
}): string;
export function openFileKeys(roots: any, noteKey: any, sealed: any, slot: any, opened: any): number;
export function envelopeKeyringId(sealed: any): any;
export { parseEnvelope };
export const KEYRING_PREF_PREFIX: "lockKeyrings/";
export const LOCK_KDF: "argon2id13";
export namespace LOCK_KDF_PARAMS {
    let ops: number;
    let mem: number;
}
export function secureBuffer(bytes: any): any;
export function rootKeyToHex(key: any): string;
export function keyringPrefId(keyringId: any): string;
export function wrapHeldFileKey(rootKey: any, blobId: any, fileId: any, key: any): string;
export function openHeldFileKeyInto(out: any, rootKey: any, blobId: any, fileId: any, wrapped: any): boolean;
import { parseEnvelope } from './sealedEnvelope.js';
//# sourceMappingURL=lockCrypto.d.ts.map