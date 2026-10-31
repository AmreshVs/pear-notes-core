export function hasPendingNoteSaves(): boolean;
export function noteSavesSettled(): Promise<any>;
export function watchNotesSaga(): Generator<import("redux-saga/effects").ForkEffect<never>, void, unknown>;
export const EDITOR_SAVE_IDLE_MS: 1000;
export const EDITOR_SAVE_MAX_WAIT_MS: 5000;
//# sourceMappingURL=notesSaga.d.ts.map