export function migrateLegacyPreferences(root: any, prefPath: any): void;
export default class PreferenceBase extends ReadyResource {
    constructor(path: any);
    path: any;
    store: any;
    bee: any;
    _rewriting: Promise<void>;
    destroy(): Promise<void>;
    put(key: any, value: any): Promise<void>;
    get(key: any): Promise<any>;
    delete(key: any): Promise<void>;
    rewrite(keep: any): Promise<void>;
    _rewrite(keep: any): Promise<void>;
    watch(key: any, cb: any): any;
}
import ReadyResource from 'ready-resource';
//# sourceMappingURL=PreferenceBase.d.ts.map