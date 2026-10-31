export function htmlToActivityText(html: any): string;
export function splitActivityLines(text: any): any;
export function countAttachments(html: any): number;
export function listAttachmentNames(html: any): any[];
export function diffActivityText(beforeText: any, afterText: any, options?: {}): {
    rows: any;
    added: any;
    removed: any;
    unchanged: boolean;
    truncated: boolean;
};
export function countActivityChanges(beforeText: any, afterText: any): {
    added: any;
    removed: any;
    unchanged: boolean;
};
export function findDeviceByLocalKey(devices: any, localKey: any): any;
export function isNamedDevice(device: any): boolean;
export function getActivityDeviceLabel(localKey: any, devices: any, options?: {}): any;
export function isActivityRetentionForever(days: any): boolean;
export function normalizeActivityRetentionDays(days: any): number;
export function getActivityTargetKind(event: any): string;
export function isNoteActivity(event: any): boolean;
export function getActivityMessage(entry: any, t: any, options?: {}): any;
//# sourceMappingURL=activity.d.ts.map