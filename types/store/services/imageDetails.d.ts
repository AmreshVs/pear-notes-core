/** Details from an image's transcription: a receipt, a contact card, or plain points. */
export function imageDetailsFromText(text: any): {
    type: "receipt";
    fields: any[][];
    items: any;
    check: {
        addsUp: boolean;
        itemsTotal: any;
    };
} | {
    type: "card";
    fields: any[][];
    items: any[];
    check: any;
} | {
    type: "notes";
    fields: any[];
    items: {
        label: any;
        amount: any;
        charge: boolean;
    }[];
    check: any;
};
/** The details as note text, with labels from the app's language. */
export function formatImageDetails(details: any, labels: any): string;
/** Editor blocks (Tiptap JSON) for the details, as text lines or as tables. */
export function imageDetailsContent(details: any, labels: any, { table }?: {
    table?: boolean;
}): ({
    type: string;
    content: {
        marks?: {
            type: string;
        }[];
        type: string;
        text: any;
    }[];
} | {
    type: string;
    content?: undefined;
})[];
export const IMAGE_DETAILS_TYPE: Readonly<{
    RECEIPT: "receipt";
    CARD: "card";
    NOTES: "notes";
}>;
export function canInsertImageDetailsTable(details: any): boolean;
//# sourceMappingURL=imageDetails.d.ts.map