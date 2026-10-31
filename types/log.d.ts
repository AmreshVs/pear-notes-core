/**
 * Force a level regardless of the dev flag. Pass null to go back to automatic.
 * @param {'silent'|'error'|'warn'|'info'|'debug'|null} level
 */
export function setLevel(level: "silent" | "error" | "warn" | "info" | "debug" | null): void;
export function getLevel(): string;
/**
 * Receives every log call regardless of the print threshold, so a production
 * build can keep them (see backend/errorLog.js). Pass null to detach.
 * @param {((level: 'error'|'warn'|'info'|'debug', args: unknown[]) => void) | null} fn
 */
export function setSink(fn: ((level: "error" | "warn" | "info" | "debug", args: unknown[]) => void) | null): void;
export function error(...args: any[]): void;
export function warn(...args: any[]): void;
export function info(...args: any[]): void;
export function debug(...args: any[]): void;
/**
 * Reduce a pairing/progress payload to the fields that are safe to print.
 *
 * The full payload carries `encryptionKey` (the vault key), `localKey`,
 * `userData` (a peer public key) and `deviceName`. Both frontends genuinely
 * consume `encryptionKey`, so it cannot be dropped from the wire - it just must
 * never reach a log. Always log `progress(data)`, never `data`.
 */
export function progress(data: any): any;
/**
 * Placeholder for a value that must never be printed. In dev it yields a short
 * prefix so peers stay distinguishable across a trace; in production it yields
 * nothing identifying.
 */
export function redact(value: any): string;
//# sourceMappingURL=log.d.ts.map