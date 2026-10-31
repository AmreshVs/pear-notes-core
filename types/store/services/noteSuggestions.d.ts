/** Folders that hold notes nobody filed: the "Untitled" folder new notes land in, or a nameless one. */
export function defaultFolderKeys(folderData: any): Set<any>;
/** A model folder name, or null when it is unusable or just "Untitled". */
export function cleanFolderName(raw: any): any;
/** The existing folder whose name matches, ignoring case. */
export function findFolderByName(folderData: any, name: any): string;
/**
 * A folder for an unfiled note, voted by its nearest notes: at least two
 * close neighbours share it, and it holds most of the close neighbours' weight.
 */
export function pickFolderSuggestion(hits: any, folderOf: any, { minScore, minVotes, share, feedback, defaultKeys }?: {
    minScore?: number;
    minVotes?: number;
    share?: number;
    feedback?: any;
    defaultKeys?: any;
}): any;
/** A model title as the title tool parses it, or null when it is unusable. */
export function cleanTitleSuggestion(raw: any, note?: any): any;
export function loadDismissedSuggestions(api: any): Promise<Set<any>>;
export function dismissSuggestion(api: any, noteKey: any, kind: any): Promise<boolean>;
export function loadSuggestionFeedback(api: any): Promise<any>;
/** Counts an accept or dismiss for one folder key, or for several in one write. */
export function recordFolderFeedback(api: any, folderKeys: any, accepted: any): Promise<void>;
export const SUGGESTION_KIND: Readonly<{
    TITLE: "title";
    FOLDER: "folder";
}>;
/** One record per dismissed suggestion on this device; dismissed ones never come back. */
export const SUGGESTIONS_DISMISSED_NAMESPACE: "suggestions-dismissed";
export const FOLDER_SUGGEST_MIN_SCORE: 0.5;
export const FOLDER_SUGGEST_MIN_VOTES: 2;
export const FOLDER_SUGGEST_SHARE: 0.6;
export const TITLE_SUGGEST_MIN_CHARS: 120;
export const TITLE_MAX_CHARS: 80;
export function suggestionId(noteKey: any, kind: any): string;
export function isUnfiled(folderKey: any, defaultKeys?: any): boolean;
export const FOLDER_NAME_MAX_CHARS: 32;
export const SUGGESTION_FEEDBACK_KEY: "suggestionFeedback";
export function isFolderMuted(feedback: any, folderKey: any): boolean;
export function isFolderTrusted(feedback: any, folderKey: any): boolean;
//# sourceMappingURL=noteSuggestions.d.ts.map