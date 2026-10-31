export function cn(...inputs: any[]): string;
export function getBackupPasswordChecks(password: any): {
    length: boolean;
    lowercase: boolean;
    uppercase: boolean;
    number: boolean;
    symbol: boolean;
};
export function getBackupPasswordStrength(password: any): {
    checks: {
        length: boolean;
        lowercase: boolean;
        uppercase: boolean;
        number: boolean;
        symbol: boolean;
    };
    score: number;
    valid: boolean;
};
export function isValidBackupPassword(password: any): boolean;
export function getFingerprint(hex: any): string;
export function formatPairingCode(bytes: any): string;
export function debounce(fn: any, ms: any): (...args: any[]) => void;
export function formatBytes(bytes: any): string;
export function groupTransfersByNote(items: any, noteTitles: any, untitledLabel: any): {
    noteKey: any;
    title: any;
    items: any;
}[];
export function isRawDeviceKey(value: any): boolean;
export function getDeviceShortKey(key: any): string;
export function getDeviceDisplayName(device: any): any;
export function getMediaSyncFlag(key: any): Promise<boolean>;
export function setMediaSyncFlag(key: any, enabled: any): Promise<void>;
export function getLockPrivacyPreference(key: any): Promise<boolean>;
export function setLockPrivacyPreference(key: any, enabled: any): Promise<void>;
export function getPdfAttachments(html: any): {
    url: any;
    fileName: any;
}[];
export function getFirstPdfAttachment(html: any): {
    url: any;
    fileName: any;
};
export function getImageAttachments(html: any): any[];
export function buildNoteSummary(html: any): {
    preview: any;
    attachment: {
        kind: string;
        count: any;
    };
    imageUrl: any;
    firstImage: any;
    pdfs: {
        url: any;
        fileName: any;
    }[];
    images: any[];
    isChecklist: any;
};
export function getNoteSummary(noteValue: any): any;
export function getFirstImageUrl(html: any): any;
export function toInviteExpiryMs(expiresAt: any): any;
export function getInviteRemainingMs(expiresAt: any, now?: number): number;
export function isInviteExpired(expiresAt: any, now?: number): boolean;
export function isInviteLongExpired(expiresAt: any, now?: number): boolean;
export function formatInviteCountdown(remainingMs: any): string;
export function normalizeFolderName(name: any): any;
export function findDuplicateFolder(folders: any, name: any, excludeKey?: any): any;
export function validateFolderName(folders: any, name: any, excludeKey?: any): {
    valid: boolean;
    error: string;
    name: any;
};
export function normalizeFolderIcon(icon: any): any;
export function truncateWithEllipsis(value: any, maxLength: any): string;
export function formatRelativeTime(timestamp: any, now?: number): string;
export function resolveEditorSync({ remoteTitle, remoteContent, baseTitle, baseContent, localTitle, localContent }?: {
    remoteTitle?: string;
    remoteContent?: string;
    baseTitle?: string;
    baseContent?: string;
    localTitle?: string;
    localContent?: string;
}): string;
export function getSyncStatusSnapshot(): Promise<{
    lastSyncAt: number;
    lastReceived: number;
    lastWakeAt: number;
    lastWakeResult: any;
    serviceFailedAt: number;
}>;
export function recordBackgroundWake(result: any, at?: number): Promise<void>;
export function recordBackgroundServiceFailure(at?: number): Promise<void>;
export function clearBackgroundServiceFailure(): Promise<void>;
export function shortenHex(value: any): any;
export function redactHomePath(value: any): any;
export function redactFileName(fileName: any, index: any): string;
export function assessSyncHealth(snapshot: any): {
    level: any;
    checks: any[];
};
export function formatHealthCheck(check: any): any;
export function formatDebugReport(snapshot: any, { redact }?: {
    redact?: boolean;
}): string;
export function formatErrorLog(errorLog: any): string;
export namespace NOTES_LIST_GROUP {
    let PINNED: string;
    let TODAY: string;
    let YESTERDAY: string;
    let L7DAYS: string;
    let L30DAYS: string;
}
export function getGroupTitle(note: any): string;
export function formatDate(timestamp: any): string;
export function htmlToPreviewText(html: any): any;
export function getPreview(content: any, contentHtml: any): any;
export function getAttachmentInfo(contentHtml: any): {
    kind: string;
    count: any;
};
export function getFirstImage(contentHtml: any): string;
export const inviteRegex: RegExp;
export function extractInvite(invite: any): string;
export function getInviteKind(invite: any): string;
export function isInviteForOtherKind(invite: any, kind: any): boolean;
export function getInviteNameHint(invite: any): string;
export function getInviteVersion(invite: any): number;
export function getInviteHostBox(invite: any): string;
export function formatDeviceInvite(invite: any, hostBox?: string): string;
export function formatVaultInvite(invite: any, name: any): string;
export function isValidInvite(invite: any, kind?: any): boolean;
export function compareVersions(a: any, b: any): 1 | 0 | -1;
export function getUpdateStatus({ currentVersion, latestVersion, minimumVersion }: {
    currentVersion: any;
    latestVersion: any;
    minimumVersion: any;
}): {
    updateAvailable: boolean;
    mandatory: boolean;
};
export namespace SYNC_HEALTH {
    let HEALTHY: string;
    let SYNCING: string;
    let ATTENTION: string;
    let PROBLEM: string;
}
export namespace SYNC_HEALTH_TEXT {
    let healthy: string;
    let syncing: string;
    let attention: string;
    let problem: string;
    let allGood: string;
    let notOpen: string;
    let writerRemoved: string;
    let quorumLost: string;
    let writerClosed: string;
    let reopening: string;
    let notWritable: string;
    let leaderOffline: string;
    let noConnections: string;
    let suspended: string;
    let pending: string;
    let stalled: string;
}
//# sourceMappingURL=utils.d.ts.map