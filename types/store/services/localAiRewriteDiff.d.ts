export function diffRewriteText(beforeText: any, afterText: any): {
    paragraphs: any[];
    fixes: number;
    added: number;
    removed: number;
    changedRatio: number;
    unchanged: boolean;
    mostlyChanged: boolean;
};
export function groupRewriteParagraphs(paragraphs: any): ({
    type: string;
    paragraph: any;
    paragraphs?: undefined;
} | {
    type: string;
    paragraphs: any[];
    paragraph?: undefined;
})[];
export function getRewriteParagraphText(paragraph: any, { removed, added }?: {
    removed?: boolean;
    added?: boolean;
}): any;
export const REWRITE_HEAVY_CHANGE_RATIO: 0.6;
export const REWRITE_SEGMENT: Readonly<{
    EQUAL: "equal";
    REMOVED: "removed";
    ADDED: "added";
}>;
//# sourceMappingURL=localAiRewriteDiff.d.ts.map