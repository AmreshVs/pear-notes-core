export function createFileKey(): {
    key: any;
    id: string;
};
export function plainLength(cipherLength: any): number;
export function cipherLength(plain: any): any;
export function chunkRange(start: any, end: any, cipherBytes: any): {
    first: number;
    cipherStart: number;
    cipherLength: number;
    skip: number;
    length: number;
};
export function encryptChunk(key: any, fileId: any, index: any, final: any, plain: any): Uint8Array<ArrayBufferLike>;
export function decryptChunk(key: any, fileId: any, index: any, final: any, cipher: any): Uint8Array<ArrayBufferLike>;
export function createEncryptStream(key: any, fileId: any): Transform<import("streamx").TransformEvents>;
export function createDecryptStream(key: any, fileId: any, { cipherBytes, first, skip, length }: {
    cipherBytes: any;
    first?: number;
    skip?: number;
    length?: number;
}): Transform<import("streamx").TransformEvents>;
export function encryptBuffer(key: any, fileId: any, plain: any): Uint8Array<ArrayBufferLike>;
export function decryptBuffer(key: any, fileId: any, cipher: any): Uint8Array<ArrayBufferLike>;
export const CHUNK_CIPHER_BYTES: 65536;
export const CHUNK_PLAIN_BYTES: number;
import { Transform } from 'streamx';
//# sourceMappingURL=fileCrypto.d.ts.map