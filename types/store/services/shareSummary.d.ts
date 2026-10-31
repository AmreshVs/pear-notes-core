/**
 * What the model reads for a share: shared text, link titles and PDF text.
 * A link's address is never fetched, so a bare link has nothing to summarize.
 */
export function shareSummaryInput(items: any, { fileTexts }?: {
    fileTexts?: {};
}): string;
export function parseShareSummary(summaryOutput: any, keyPointsOutput: any): {
    summary: string;
    keyPoints: any;
};
/** The folder the share's nearest notes share, by the same vote as unfiled notes; null if none. */
export function suggestShareFolder({ api, embed, text, notes, folderData, feedback }: {
    api: any;
    embed: any;
    text: any;
    notes: any;
    folderData: any;
    feedback?: any;
}): Promise<any>;
/** The summary as plain paragraphs, the shape shared items are appended to a note in. */
export function shareSummaryParagraphs({ summary, keyPoints }: {
    summary: any;
    keyPoints: any;
}, { summaryLabel, keyPointsLabel, bullet }?: {
    summaryLabel?: string;
    keyPointsLabel?: string;
    bullet?: string;
}): {
    text: any;
}[];
export const SHARE_SUMMARY_MIN_CHARS: 120;
export function canSummarizeShare(text: any): boolean;
//# sourceMappingURL=shareSummary.d.ts.map