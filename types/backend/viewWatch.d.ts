export function sameRecord(a: any, b: any): boolean;
export function onViewChanges(db: any, fn: any): any;
export function changeTouches(change: any, collection: any, query: any): any;
export function changeTouchesAny(change: any, collections: any): any;
export function watchHyperdbKey(db: any, collection: any, query: any, valueOf?: (record: any) => any): Promise<KeyWatcher>;
export function watchHyperdbChanges(db: any, collections?: any): Promise<ChangeWatcher>;
export const MAX_CHANGE_BLOCKS: 512;
export const ALL_CHANGED: Readonly<{
    all: true;
    entries: any[];
}>;
export class KeyWatcher extends ReadyResource {
    constructor(adapter: any);
    adapter: any;
    node: {
        value: any;
    };
    _last: any;
    _force: boolean;
    _unsubscribe: any;
    _readOnce: boolean;
    _process: {
        (): any;
        settled(): any;
    };
    _onchange: () => void;
    _ontruncate: () => void;
    _oncoreclose: () => void;
    _detach(): void;
    _update(initial: any): Promise<void>;
}
export class ChangeWatcher extends ReadyResource {
    constructor(adapter: any);
    adapter: any;
    _unsubscribe: any;
    _emit: {
        (): any;
        settled(): any;
    };
    _onchange: () => void;
    _oncoreclose: () => void;
}
import ReadyResource from 'ready-resource';
//# sourceMappingURL=viewWatch.d.ts.map