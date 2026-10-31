export function createJoinProof(core: any, inviteId: any, box: any): {
    manifest: string;
    signature: string;
};
export function provesWriterKey(inviteId: any, keyHex: any, box: any, proof: any): any;
export function maskedReply({ encryptionKey, inviteId, invite, joinerBox }: {
    encryptionKey: any;
    inviteId: any;
    invite: any;
    joinerBox: any;
}): {
    encryptionKey: Uint8Array<ArrayBufferLike>;
    additional: {
        data: Uint8Array<ArrayBufferLike>;
        signature: any;
    };
};
export function pairingCode(inviteId: any, writerKey: any, joinerBox: any): Promise<string>;
export function unmaskReply({ result, inviteId, joinerBox, expectedHostBox }: {
    result: any;
    inviteId: any;
    joinerBox: any;
    expectedHostBox: any;
}): any;
export function joinerTooOld(vault: any, joiner: any): Promise<boolean>;
export function localWriterKey(store: any): Promise<any>;
export function requestToJoin({ store, bootstrap, invite, hostBox, deviceName, onCode }: {
    store: any;
    bootstrap: any;
    invite: any;
    hostBox: any;
    deviceName: any;
    onCode: any;
}): Promise<any>;
export function isInviteExpired(invite: any): boolean;
export function inviteHostBox(encryptionKey: any, inviteId: any): Uint8Array<ArrayBufferLike>;
export class HostPairing {
    constructor(vault: any);
    vault: any;
    pairing: any;
    member: any;
    cb: any;
    pending: {
        candidate: any;
        joiner: any;
        finish: (result: any) => void;
    };
    lastStatus: any;
    rejected: Set<any>;
    busy: string;
    swarm: any;
    memberSwarm: any;
    expiryTimer: number;
    syncing: Promise<void>;
    queued: Promise<void>;
    createInvite({ regenerate }?: {
        regenerate?: boolean;
    }): Promise<any>;
    _emit(status: any): void;
    subscribe(cb: any, swarm: any): Promise<void>;
    sync(): Promise<void>;
    _applyInviteState(): Promise<void>;
    _startMember(invite: any): Promise<void>;
    _stopMember(): Promise<void>;
    close(): Promise<void>;
    suspend(): any;
    resume(): Promise<void>;
    _onCandidate(candidate: any): Promise<void>;
    _handle(candidate: any): Promise<void>;
    _awaitConfirmation(candidate: any, joiner: any, invite: any, code: any): Promise<any>;
    confirm(): void;
    reject(): Promise<void>;
}
//# sourceMappingURL=pairing.d.ts.map