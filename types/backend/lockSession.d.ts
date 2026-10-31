export function blobIdOf(url: any): string;
export function onLockSessionChange(cb: any): () => boolean;
export function openWithPassword(entries: any, password: any): Promise<boolean>;
export function openWithRootKey(entries: any, rootKey: any): boolean;
export function addRootKey(keyringId: any, rootKey: any): void;
export function closeLockSession(): void;
export function holdFileKey(link: any, key: any, id: any): boolean;
export function keepFileKey(link: any, key: any, id: any, keyringId: any): {
    blob: string;
    link: any;
    id: any;
    r: any;
    k: string;
};
export function restoreFileKeys(records: any): number;
export function openNoteFileKeys(noteKey: any, sealed: any): number;
export function sealingKeyringId(entries: any, previous?: string): any;
export function openNoteBody(noteKey: any, sealed: any): any;
export function readableNote(key: any, value: any): any;
export function isLockSessionOpen(): boolean;
export function fileKeyFor(blobId: any): any;
export function getRootKey(keyringId: any): any;
export function sealNoteBody(keyringId: any, noteKey: any, html: any, options: any): string;
//# sourceMappingURL=lockSession.d.ts.map