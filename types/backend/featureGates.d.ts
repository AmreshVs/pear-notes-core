export function deviceCompatLevel(device: any): any;
export function blockingDevices(base: any, name: any): Promise<any>;
export function gateStatus(base: any, name: any): Promise<{
    open: boolean;
    blocking: any;
}>;
export function openGate(base: any, name: any): Promise<{
    open: boolean;
    blocking: any;
}>;
export function adoptActiveGates(base: any): Promise<void>;
export { UPDATE_REQUIRED };
export const COMPAT_LEVEL: 2;
export const MIN_COMPAT_PREF: "compat:min";
export const GATE_PREF_PREFIX: "gate:";
export const DEVICE_REFRESH_MS: number;
export namespace GATES {
    namespace sealedNotes {
        export let minCompatLevel: number;
        export { SEALED_NOTES_CAP as legacyCap };
        export function alreadyActive(base: any): any;
    }
    namespace sealedFiles {
        let minCompatLevel_1: number;
        export { minCompatLevel_1 as minCompatLevel };
    }
}
export function gatePrefId(name: any): string;
export function minCompatLevelOf(pref: any): any;
export function isActivation(value: any): boolean;
import { UPDATE_REQUIRED } from '../constant.js';
import { SEALED_NOTES_CAP } from './deviceCaps.js';
//# sourceMappingURL=featureGates.d.ts.map