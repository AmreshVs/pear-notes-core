/**
 * Cuts a note at its top heading level (h1–h3, the highest one used at least
 * twice). Every byte of the body ends up in exactly one part, in order: text
 * before the first heading stays under the note's own title.
 */
export function splitNoteByHeadings(html: any, title?: string): {
    title: string;
    note: string;
}[];
/** Why a note can't be split, or null. */
export function checkSplittable(note: any): "locked" | "missing" | "too-few" | "no-sections";
export const SPLIT_REFUSAL: Readonly<{
    NO_SECTIONS: "no-sections";
    LOCKED: "locked";
    MISSING: "missing";
}>;
//# sourceMappingURL=noteSplit.d.ts.map