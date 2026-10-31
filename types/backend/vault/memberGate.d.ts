export function createProof(stream: any, discoveryKey: any, core: any): {
    manifest: any;
    signature: any;
};
export function verifyProof(stream: any, discoveryKey: any, proof: any): any;
export const MEMBER_PROTOCOL: "pear-notes/member/v1";
export const EVICT_GRACE_MS: 3000;
export const DEPARTED_GRACE_MS: 60000;
export const NOTICE_FLUSH_MS: 1000;
export const VERDICT: Readonly<{
    MEMBER: "member";
    REMOVED: "removed";
    DEPARTED: "departed";
    UNKNOWN: "unknown";
    OPEN: "open";
}>;
export class MemberGate {
    constructor({ discoveryKey, localCore, verdict, admit, onRemoved, graceMs, departedGraceMs, noticeFlushMs }: {
        discoveryKey: any;
        localCore: any;
        verdict: any;
        admit: any;
        onRemoved?: () => void;
        graceMs?: number;
        departedGraceMs?: number;
        noticeFlushMs?: number;
    });
    discoveryKey: any;
    localCore: any;
    verdict: any;
    admit: any;
    onRemoved: () => void;
    graceMs: number;
    departedGraceMs: number;
    noticeFlushMs: number;
    peers: Set<any>;
    closed: boolean;
    add(stream: any): void;
    admitted(): any[];
    recheck(): void;
    close(): void;
    _sendProof(peer: any, message: any): void;
    _onProof(peer: any, proof: any): void;
    _evaluate(peer: any): Promise<void>;
    _apply(peer: any, verdict: any): void;
    _sendRemoved(peer: any): void;
    _onNotice(peer: any, code: any): void;
    _admit(peer: any): void;
    _scheduleEvict(peer: any, graceMs: any): void;
    _cancelEvict(peer: any): void;
    _forget(peer: any): void;
}
//# sourceMappingURL=memberGate.d.ts.map