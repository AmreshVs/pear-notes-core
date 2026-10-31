/** Why these notes can't be merged, or null when they can. */
export function checkMergeable(notes: any): "locked" | "missing" | "too-few";
/**
 * The first note's blocks stay as they are; each later note adds only the
 * paragraphs and list items no earlier note already has. Every removed line
 * is returned in `dropped`, and the result line list marks the added ones.
 */
export function planMerge(notes: any): {
    title: any;
    note: string;
    folderKey: any;
    result: any[];
    dropped: any[];
};
export function buildMergedNote(notes: any): {
    title: any;
    note: string;
    folderKey: any;
};
/** What a merge would produce, for the preview: each original's lines, the result and the removed lines. */
export function buildMergePreview(notes: any, keys?: any[]): {
    keys: any[];
    title: any;
    folderKey: any;
    sources: any;
    result: any[];
    dropped: any[];
};
export const MERGE_REFUSAL: Readonly<{
    TOO_FEW: "too-few";
    LOCKED: "locked";
    MISSING: "missing";
}>;
export const MERGE_LINE: Readonly<{
    HEADING: "heading";
    PARAGRAPH: "paragraph";
    BULLET: "bullet";
    NUMBER: "number";
    TASK: "task";
    ATTACHMENT: "attachment";
}>;
//# sourceMappingURL=noteMerge.d.ts.map