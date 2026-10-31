export function sealEnvelope(keyringId: any, key: any, html: any, previous: any): string;
export function rememberCopies(replacements: any): void;
export function unkeyedLinks(sealed: any): any[];
export function createFirstKeyring(base: any, password: any, { legacy }?: {
    legacy?: boolean;
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
export function runSealingPass(base: any, { now, quietMs, stopped }?: {
    now?: () => number;
    quietMs?: number;
    stopped?: () => boolean;
}): Promise<{
    sealed: number;
    rewrapped: number;
    resealed: number;
    encrypted: number;
    waiting: number;
    retryAt: number;
}>;
export const SEAL_QUIET_MS: number;
export function relinkCopies(html: any): any;
export function forgetCopies(): void;
export function withoutVerifier(settings: any): any;
export class SealingPass {
    constructor(getBase: any, options?: {});
    _getBase: any;
    _options: {};
    _running: any;
    _again: boolean;
    _timer: any;
    start(): any;
    _loop(): Promise<{
        sealed: number;
        rewrapped: number;
        resealed: number;
        encrypted: number;
        waiting: number;
        retryAt: number;
    }>;
    _retryAt(at: any): void;
    idle(): any;
    stop(): void;
}
//# sourceMappingURL=lockRollout.d.ts.map