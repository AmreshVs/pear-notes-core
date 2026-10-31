/**
 * Owns the lifetime of every streaming subscription the backend serves.
 *
 * hrpc awaits a stream handler and discards what it returns, so the cleanup each
 * subscription handler hands back was never run: every stream the frontend
 * closed (each resync, each retry) left its watcher alive. The server-side
 * RPCStream wrapper does not report the remote close either; only its inner
 * writeStream does, so that is what gets listened to.
 *
 * When the base is reopened (error recovery, pairing), every database watcher is
 * bound to the closed view and goes silent without closing its stream, which
 * left the frontend waiting forever. closeBaseBound() ends those streams so the
 * frontend's reconnect rebuilds them against the new base.
 */
export default class SubscriptionTracker {
    constructor(rpc: any);
    rpc: any;
    live: Set<any>;
    install(): void;
    track(command: any, stream: any, cleanup: any): void;
    closeBaseBound(): number;
    get size(): number;
}
//# sourceMappingURL=subscriptionTracker.d.ts.map