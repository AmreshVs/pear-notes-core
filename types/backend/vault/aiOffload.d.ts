export const AI_OFFLOAD_PROTOCOL: "pear-notes/ai-offload/v1";
export const AI_OFFLOAD_VERSION: 1;
export const AI_OFFLOAD_KINDS: string[];
export const AI_OFFLOAD_MAX_BYTES: number;
export const AI_OFFLOAD_FIRST_REPLY_MS: 10000;
export const AI_OFFLOAD_STALL_MS: 60000;
export const AI_OFFLOAD_MAX_OUTSTANDING: 2;
export const AI_OFFLOAD_KEEPALIVE_MS: 5000;
export const AI_OFFLOAD_WAIT_MS: number;
export const AI_OFFLOAD_PROBE_EVERY_MS: 15000;
export const AI_OFFLOAD_PROBE_TIMEOUT_MS: 5000;
export const AI_OFFLOAD_ERROR: Readonly<{
    UNAVAILABLE: "unavailable";
    UNSUPPORTED: "unsupported";
    NOT_SERVING: "not-serving";
    BUSY: "busy";
    ON_BATTERY: "on-battery";
    TOO_LARGE: "too-large";
    NOT_MEMBER: "not-member";
    TIMEOUT: "timeout";
    OFFLINE: "offline";
    FAILED: "failed";
    CANCELLED: "cancelled";
}>;
/**
 * Ask jobs between devices of one vault. Opened only on connections whose
 * writer is a current member; the serving side checks again per job.
 */
export class AiOffload {
    constructor({ discoveryKey, verdict, onJob, onJobCancel, onStatus, firstReplyMs, stallMs, keepaliveMs, waitMs, probeEveryMs, probeTimeoutMs }: {
        discoveryKey: any;
        verdict: any;
        onJob?: () => void;
        onJobCancel?: () => void;
        onStatus?: () => void;
        firstReplyMs?: number;
        stallMs?: number;
        keepaliveMs?: number;
        waitMs?: number;
        probeEveryMs?: number;
        probeTimeoutMs?: number;
    });
    discoveryKey: any;
    verdict: any;
    onJob: () => void;
    onJobCancel: () => void;
    onStatus: () => void;
    firstReplyMs: number;
    stallMs: number;
    keepaliveMs: number;
    waitMs: number;
    probeEveryMs: number;
    probeTimeoutMs: number;
    probes: Map<any, any>;
    probeTimer: number;
    serving: boolean;
    closed: boolean;
    peers: Set<any>;
    waiting: Map<any, any>;
    paired: WeakSet<WeakKey>;
    jobs: Map<any, any>;
    runs: Map<any, any>;
    attach(stream: any, writer: any): Promise<void>;
    /** Tries connections that weren't members yet again, after the member list changes. */
    recheck(): void;
    setServing(serving: any): void;
    status(): {
        available: boolean;
        writer: any;
    };
    /** Sends a job to a serving member. Resolves `{ text, data }`; rejects with `code` and `started`. */
    run({ kind, payload, onText }: {
        kind: any;
        payload: any;
        onText?: () => void;
    }): {
        id: string;
        done: Promise<any>;
    };
    cancel(id: any): void;
    reply(jobId: any, { text, done, error, data }?: {}): void;
    /** Asks each serving member for a reply, so a connection that silently died stops counting. */
    probe(): void;
    close(): void;
    _servingPeer(): any;
    _setResponsive(peer: any, responsive: any): void;
    _syncProbing(): void;
    _stopProbing(): void;
    _send(peer: any, type: any, message: any): void;
    _sendHello(peer: any): void;
    _onHello(peer: any, message: any): void;
    _onRequest(peer: any, message: any): Promise<void>;
    _onReply(peer: any, message: any): void;
    _armTimer(id: any, entry: any, ms: any): void;
    _onCancel(peer: any, message: any): void;
    _dropJob(jobId: any): boolean;
    _failRun(id: any, code: any, notifyPeer: any): void;
    _forget(peer: any): void;
}
//# sourceMappingURL=aiOffload.d.ts.map