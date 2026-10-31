export function attachmentKind(fileType: any, fileName: any): string;
/** Inline images, file attachments and recordings, in document order, one per url. */
export function getNoteAttachments(html: any): {
    kind: string;
    url: any;
    fileName: any;
    fileType: any;
    size: number;
    duration: number;
}[];
export function groupAttachments(items: any, { by, kind, query, folders, allNotesKey }?: {
    by?: string;
    kind?: string;
    query?: string;
    folders?: any[];
    allNotesKey?: string;
}): {
    total: number;
    bytes: number;
    missing: number;
    counts: {
        all: number;
    };
    sections: any[];
};
export namespace ATTACHMENT_KIND {
    let PHOTO: string;
    let PDF: string;
    let AUDIO: string;
    let FILE: string;
}
export const ATTACHMENT_KINDS: string[];
export namespace ATTACHMENT_GROUP {
    let FOLDER: string;
    let TYPE: string;
    let MONTH: string;
}
export const ATTACHMENT_FILTER_ALL: "all";
export function attachmentId(item: any): string;
//# sourceMappingURL=noteAttachments.d.ts.map