/**
 * The model is shown the note with its structure intact ("- ", "1. ", "# ",
 * "- [ ] "), so its edits carry those markers. The document itself stores the
 * markers as node types, not as text, so an edit that keeps them would never
 * match. Strip a marker the edit only carries because we showed it one.
 *
 * Returns null when the marker itself is what changed (ticking a task, turning
 * a bullet into a number). That is a node change, not a text change, and
 * quietly rewriting the text around it would corrupt the note.
 */
export function stripEditMarkers(edit: any): any;
export function findNoteEditRanges(doc: any, edits: any, range?: {}): {
    ranges: any[];
    missing: any[];
};
export function buildNoteEditsTransaction(state: any, edits: any, range?: {}): {
    tr: any;
    applied: number;
    missing: any[];
};
/**
 * Applies a line-for-line rewrite of a selection in place, word by word, so
 * marks, links, list items and inline nodes outside the changed words survive.
 * Returns null when the selection does not line up with the rewrite (a code
 * block or a soft break), so the caller can avoid flattening it.
 */
export function buildLineRewriteTransaction(state: any, range: any, beforeText: any, afterText: any): {
    tr: any;
    applied: number;
    skipped: number;
};
/** Top-level paragraphs with one of `texts` become unticked checklist items; null when none matched. */
export function buildMakeTasksTransaction(state: any, texts: any): {
    tr: any;
    applied: number;
};
/** Inserts `blocks` (Tiptap JSON) after the image with `src`, or at the end; drops the image unless `keepImage`. */
export function buildImageDetailsTransaction(state: any, { src, blocks, keepImage }: {
    src: any;
    blocks: any;
    keepImage?: boolean;
}): {
    tr: any;
    removedImage: boolean;
};
//# sourceMappingURL=localAiNoteEdits.d.ts.map