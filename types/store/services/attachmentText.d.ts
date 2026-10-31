/** The PDF attachments in a note's HTML, as written by the editor. */
export function pdfAttachmentsIn(html: any): {
    fileName: any;
    url: any;
    size: number;
}[];
/** Text of every PDF attached to the note, each under its file name; '' when none can be read. */
export function noteAttachmentText(value: any, { resolveUrl, readPdf, maxBytes }: {
    resolveUrl: any;
    readPdf: any;
    maxBytes?: number;
}): Promise<string>;
export function isPdfFile(fileName: any, fileType: any): boolean;
//# sourceMappingURL=attachmentText.d.ts.map