/** Synced for the whole vault; only switched-off kinds are stored, so a new kind starts on. */
export function normalizeAiSuggestions(record: any): {
    [k: string]: boolean;
};
export function aiSuggestionsRecord(prefs: any): {
    off: ("tasks" | "folders" | "titles" | "related")[];
};
export function loadAiSuggestions(api: any): Promise<{
    [k: string]: boolean;
}>;
export const AI_SUGGESTION: Readonly<{
    TASKS: "tasks";
    TITLES: "titles";
    FOLDERS: "folders";
    RELATED: "related";
}>;
export const AI_SUGGESTIONS_PREF_ID: "ai-suggestions";
export const DEFAULT_AI_SUGGESTIONS: Readonly<{
    tasks: true;
    titles: true;
    folders: true;
    related: true;
}>;
export function saveAiSuggestions(api: any, prefs: any): any;
//# sourceMappingURL=aiSuggestionPrefs.d.ts.map