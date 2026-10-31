export function deriveVerifier(password: any): {
    salt: string;
    hash: string;
};
export function verifyPassword(password: any, verifier: any): boolean;
export function getRetryAfterMs(now?: number): number;
export function recordFailedAttempt(now?: number): void;
export function recordSuccessfulAttempt(): void;
export function getAttemptState(): {
    failedAttempts: number;
    lockUntil: number;
};
export function restoreAttemptState(state: any, now?: number): void;
export function resetAttemptState(): void;
//# sourceMappingURL=noteLockPassword.d.ts.map