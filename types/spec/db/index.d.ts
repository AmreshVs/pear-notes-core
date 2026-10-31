declare namespace _default {
    export { versions };
    export { collections };
    export { indexes };
    export { resolveCollection };
    export { resolveIndex };
}
export default _default;
declare namespace versions {
    export { version as schema };
    export let db: number;
}
declare const collections: ({
    name: string;
    id: number;
    version: number;
    encodeKey(record: any): any;
    encodeKeyRange({ gt, lt, gte, lte }?: {}): any;
    encodeValue(schemaVersion: any, collectionVersion: any, record: any): any;
    trigger: any;
    reconstruct: typeof collection0_reconstruct;
    reconstructKey: typeof collection0_reconstruct_key;
    indexes: any[];
    decodedVersion: number;
} | {
    name: string;
    id: number;
    version: number;
    encodeKey(record: any): any;
    encodeKeyRange({ gt, lt, gte, lte }?: {}): any;
    encodeValue(schemaVersion: any, collectionVersion: any, record: any): any;
    trigger: any;
    reconstruct: typeof collection2_reconstruct;
    reconstructKey: typeof collection2_reconstruct_key;
    indexes: any[];
    decodedVersion: number;
} | {
    name: string;
    id: number;
    version: number;
    encodeKey(record: any): any;
    encodeKeyRange({ gt, lt, gte, lte }?: {}): any;
    encodeValue(schemaVersion: any, collectionVersion: any, record: any): any;
    trigger: any;
    reconstruct: typeof collection3_reconstruct;
    reconstructKey: typeof collection3_reconstruct_key;
    indexes: any[];
    decodedVersion: number;
} | {
    name: string;
    id: number;
    version: number;
    encodeKey(record: any): any;
    encodeKeyRange({ gt, lt, gte, lte }?: {}): any;
    encodeValue(schemaVersion: any, collectionVersion: any, record: any): any;
    trigger: any;
    reconstruct: typeof collection5_reconstruct;
    reconstructKey: typeof collection5_reconstruct_key;
    indexes: any[];
    decodedVersion: number;
} | {
    name: string;
    id: number;
    version: number;
    encodeKey(record: any): any;
    encodeKeyRange({ gt, lt, gte, lte }?: {}): any;
    encodeValue(schemaVersion: any, collectionVersion: any, record: any): any;
    trigger: any;
    reconstruct: typeof collection6_reconstruct;
    reconstructKey: typeof collection6_reconstruct_key;
    indexes: any[];
    decodedVersion: number;
} | {
    name: string;
    id: number;
    version: number;
    encodeKey(record: any): any;
    encodeKeyRange({ gt, lt, gte, lte }?: {}): any;
    encodeValue(schemaVersion: any, collectionVersion: any, record: any): any;
    trigger: any;
    reconstruct: typeof collection10_reconstruct;
    reconstructKey: typeof collection10_reconstruct_key;
    indexes: any[];
    decodedVersion: number;
})[];
declare const indexes: {
    name: string;
    version: number;
    id: number;
    encodeKey(record: any): any;
    encodeKeyRange({ gt, lt, gte, lte }?: {}): any;
    encodeValue: (record: any) => any;
    encodeIndexKeys(record: any, context: any): any[];
    reconstruct: (keyBuf: any, valueBuf: any) => any;
    offset: number;
    collection: {
        name: string;
        id: number;
        version: number;
        encodeKey(record: any): any;
        encodeKeyRange({ gt, lt, gte, lte }?: {}): any;
        encodeValue(schemaVersion: any, collectionVersion: any, record: any): any;
        trigger: any;
        reconstruct: typeof collection7_reconstruct;
        reconstructKey: typeof collection7_reconstruct_key;
        indexes: any[];
        decodedVersion: number;
    };
}[];
declare function resolveCollection(name: any): {
    name: string;
    id: number;
    version: number;
    encodeKey(record: any): any;
    encodeKeyRange({ gt, lt, gte, lte }?: {}): any;
    encodeValue(schemaVersion: any, collectionVersion: any, record: any): any;
    trigger: any;
    reconstruct: typeof collection0_reconstruct;
    reconstructKey: typeof collection0_reconstruct_key;
    indexes: any[];
    decodedVersion: number;
} | {
    name: string;
    id: number;
    version: number;
    encodeKey(record: any): any;
    encodeKeyRange({ gt, lt, gte, lte }?: {}): any;
    encodeValue(schemaVersion: any, collectionVersion: any, record: any): any;
    trigger: any;
    reconstruct: typeof collection2_reconstruct;
    reconstructKey: typeof collection2_reconstruct_key;
    indexes: any[];
    decodedVersion: number;
} | {
    name: string;
    id: number;
    version: number;
    encodeKey(record: any): any;
    encodeKeyRange({ gt, lt, gte, lte }?: {}): any;
    encodeValue(schemaVersion: any, collectionVersion: any, record: any): any;
    trigger: any;
    reconstruct: typeof collection3_reconstruct;
    reconstructKey: typeof collection3_reconstruct_key;
    indexes: any[];
    decodedVersion: number;
} | {
    name: string;
    id: number;
    version: number;
    encodeKey(record: any): any;
    encodeKeyRange({ gt, lt, gte, lte }?: {}): any;
    encodeValue(schemaVersion: any, collectionVersion: any, record: any): any;
    trigger: any;
    reconstruct: typeof collection5_reconstruct;
    reconstructKey: typeof collection5_reconstruct_key;
    indexes: any[];
    decodedVersion: number;
} | {
    name: string;
    id: number;
    version: number;
    encodeKey(record: any): any;
    encodeKeyRange({ gt, lt, gte, lte }?: {}): any;
    encodeValue(schemaVersion: any, collectionVersion: any, record: any): any;
    trigger: any;
    reconstruct: typeof collection6_reconstruct;
    reconstructKey: typeof collection6_reconstruct_key;
    indexes: any[];
    decodedVersion: number;
} | {
    name: string;
    id: number;
    version: number;
    encodeKey(record: any): any;
    encodeKeyRange({ gt, lt, gte, lte }?: {}): any;
    encodeValue(schemaVersion: any, collectionVersion: any, record: any): any;
    trigger: any;
    reconstruct: typeof collection10_reconstruct;
    reconstructKey: typeof collection10_reconstruct_key;
    indexes: any[];
    decodedVersion: number;
};
declare function resolveIndex(name: any): {
    name: string;
    version: number;
    id: number;
    encodeKey(record: any): any;
    encodeKeyRange({ gt, lt, gte, lte }?: {}): any;
    encodeValue: (record: any) => any;
    encodeIndexKeys(record: any, context: any): any[];
    reconstruct: (keyBuf: any, valueBuf: any) => any;
    offset: number;
    collection: {
        name: string;
        id: number;
        version: number;
        encodeKey(record: any): any;
        encodeKeyRange({ gt, lt, gte, lte }?: {}): any;
        encodeValue(schemaVersion: any, collectionVersion: any, record: any): any;
        trigger: any;
        reconstruct: typeof collection7_reconstruct;
        reconstructKey: typeof collection7_reconstruct_key;
        indexes: any[];
        decodedVersion: number;
    };
};
import { version } from './messages.js';
declare function collection0_reconstruct(schemaVersion: any, keyBuf: any, valueBuf: any): {
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
} | {
    id: any;
    clearedAt: any;
};
declare function collection0_reconstruct_key(keyBuf: any): {
    key: any;
};
declare function collection2_reconstruct(schemaVersion: any, keyBuf: any, valueBuf: any): {
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
} | {
    id: any;
    clearedAt: any;
};
declare function collection2_reconstruct_key(keyBuf: any): {
    slot: any;
};
declare function collection3_reconstruct(schemaVersion: any, keyBuf: any, valueBuf: any): {
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
} | {
    id: any;
    clearedAt: any;
};
declare function collection3_reconstruct_key(keyBuf: any): {
    id: any;
};
declare function collection5_reconstruct(schemaVersion: any, keyBuf: any, valueBuf: any): {
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
} | {
    id: any;
    clearedAt: any;
};
declare function collection5_reconstruct_key(keyBuf: any): {
    refKey: any;
};
declare function collection6_reconstruct(schemaVersion: any, keyBuf: any, valueBuf: any): {
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
} | {
    id: any;
    clearedAt: any;
};
declare function collection6_reconstruct_key(keyBuf: any): {
    coreKey: any;
};
declare function collection10_reconstruct(schemaVersion: any, keyBuf: any, valueBuf: any): {
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
} | {
    id: any;
    clearedAt: any;
};
declare function collection10_reconstruct_key(keyBuf: any): {
    noteKey: any;
    writer: any;
};
declare function collection7_reconstruct(schemaVersion: any, keyBuf: any, valueBuf: any): {
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
} | {
    id: any;
    clearedAt: any;
};
declare function collection7_reconstruct_key(keyBuf: any): {
    id: any;
};
//# sourceMappingURL=index.d.ts.map