export function resolveStruct(name: any, v?: number): {
    preencode(state: any, m: any): void;
    encode(state: any, m: any): void;
    decode(state: any): {
        key: any;
        title: any;
        note: any;
        folderKey: any;
        addedAt: any;
        updatedAt: any;
        deletedAt: any;
        previousFolderKey: any;
        locked: boolean;
        pinned: boolean;
        version: any;
        versionBy: any;
        sealed: any;
    } | {
        id: any;
        clearedAt: any;
    } | {
        key: any;
        title: any;
        icon: any;
        addedAt: any;
        updatedAt: any;
    } | {
        slot: any;
        id: any;
        invite: any;
        publicKey: any;
        expires: any;
        version: any;
        versionBy: any;
    } | {
        id: any;
        json: any;
    } | {
        key: any;
        title: any;
        deviceType: any;
        platform: any;
        localKey: any;
        swarmKey: any;
        addedAt: any;
        updatedAt: any;
        caps: any;
        compatLevel: any;
        appVersion: any;
        lastSeenAt: any;
    } | {
        refKey: any;
        url: any;
        deletedAt: any;
    } | {
        coreKey: any;
        at: any;
    } | {
        id: any;
        event: any;
        device: any;
        at: any;
        lastAt: any;
        ops: any;
        targetKind: any;
        targetKey: any;
        targetTitle: any;
        locked: boolean;
        hasDiff: boolean;
        recoverable: boolean;
        meta: any;
    } | {
        id: any;
        text: any;
    } | {
        noteKey: any;
        writer: any;
        id: any;
        at: any;
        lastAt: any;
        ops: any;
    };
};
export function getStruct(name: any, v?: number): {
    preencode(state: any, m: any): void;
    encode(state: any, m: any): void;
    decode(state: any): {
        key: any;
        title: any;
        note: any;
        folderKey: any;
        addedAt: any;
        updatedAt: any;
        deletedAt: any;
        previousFolderKey: any;
        locked: boolean;
        pinned: boolean;
        version: any;
        versionBy: any;
        sealed: any;
    } | {
        id: any;
        clearedAt: any;
    } | {
        key: any;
        title: any;
        icon: any;
        addedAt: any;
        updatedAt: any;
    } | {
        slot: any;
        id: any;
        invite: any;
        publicKey: any;
        expires: any;
        version: any;
        versionBy: any;
    } | {
        id: any;
        json: any;
    } | {
        key: any;
        title: any;
        deviceType: any;
        platform: any;
        localKey: any;
        swarmKey: any;
        addedAt: any;
        updatedAt: any;
        caps: any;
        compatLevel: any;
        appVersion: any;
        lastSeenAt: any;
    } | {
        refKey: any;
        url: any;
        deletedAt: any;
    } | {
        coreKey: any;
        at: any;
    } | {
        id: any;
        event: any;
        device: any;
        at: any;
        lastAt: any;
        ops: any;
        targetKind: any;
        targetKey: any;
        targetTitle: any;
        locked: boolean;
        hasDiff: boolean;
        recoverable: boolean;
        meta: any;
    } | {
        id: any;
        text: any;
    } | {
        noteKey: any;
        writer: any;
        id: any;
        at: any;
        lastAt: any;
        ops: any;
    };
};
export function getEnum(name: any): void;
export function getEncoding(name: any): {
    preencode(state: any, m: any): void;
    encode(state: any, m: any): void;
    decode(state: any): {
        key: any;
        title: any;
        note: any;
        folderKey: any;
        addedAt: any;
        updatedAt: any;
        deletedAt: any;
        previousFolderKey: any;
        locked: boolean;
        pinned: boolean;
        version: any;
        versionBy: any;
        sealed: any;
    };
} | {
    preencode(state: any, m: any): void;
    encode(state: any, m: any): void;
    decode(state: any): {
        key: any;
        title: any;
        icon: any;
        addedAt: any;
        updatedAt: any;
    };
} | {
    preencode(state: any, m: any): void;
    encode(state: any, m: any): void;
    decode(state: any): {
        slot: any;
        id: any;
        invite: any;
        publicKey: any;
        expires: any;
        version: any;
        versionBy: any;
    };
} | {
    preencode(state: any, m: any): void;
    encode(state: any, m: any): void;
    decode(state: any): {
        id: any;
        json: any;
    };
} | {
    preencode(state: any, m: any): void;
    encode(state: any, m: any): void;
    decode(state: any): {
        key: any;
        title: any;
        deviceType: any;
        platform: any;
        localKey: any;
        swarmKey: any;
        addedAt: any;
        updatedAt: any;
        caps: any;
        compatLevel: any;
        appVersion: any;
        lastSeenAt: any;
    };
} | {
    preencode(state: any, m: any): void;
    encode(state: any, m: any): void;
    decode(state: any): {
        refKey: any;
        url: any;
        deletedAt: any;
    };
} | {
    preencode(state: any, m: any): void;
    encode(state: any, m: any): void;
    decode(state: any): {
        coreKey: any;
        at: any;
    };
} | {
    preencode(state: any, m: any): void;
    encode(state: any, m: any): void;
    decode(state: any): {
        id: any;
        event: any;
        device: any;
        at: any;
        lastAt: any;
        ops: any;
        targetKind: any;
        targetKey: any;
        targetTitle: any;
        locked: boolean;
        hasDiff: boolean;
        recoverable: boolean;
        meta: any;
    };
} | {
    preencode(state: any, m: any): void;
    encode(state: any, m: any): void;
    decode(state: any): {
        id: any;
        text: any;
    };
} | {
    preencode(state: any, m: any): void;
    encode(state: any, m: any): void;
    decode(state: any): {
        noteKey: any;
        writer: any;
        id: any;
        at: any;
        lastAt: any;
        ops: any;
    };
} | {
    preencode(state: any, m: any): void;
    encode(state: any, m: any): void;
    decode(state: any): {
        id: any;
        clearedAt: any;
    };
};
export function encode(name: any, value: any, v?: number): any;
export function decode(name: any, buffer: any, v?: number): any;
export function setVersion(v: any): void;
export let version: number;
//# sourceMappingURL=index.d.ts.map