export function cleanPartialOutput(text: any): string;
export function createWorkProgress(kind: any, { input, targetRatio, startedAt }?: {
    input?: string;
    targetRatio?: number;
    startedAt?: number;
}): {
    kind: any;
    steps: any;
    activeIndex: number;
    model: any;
    startedAt: number;
    inputWords: number;
    inputTruncated: boolean;
    targetWords: number;
    preview: string;
    writtenWords: number;
    position: any;
    page: any;
    paragraphs: any;
};
export function reduceWorkProgress(progress: any, event: any): any;
export function formatClock(ms: any): string;
export function getWorkProgressView(progress: any, now?: number): {
    steps: any;
    fraction: number;
    detail: {
        key: string;
        params: {
            written?: undefined;
            target?: undefined;
            count?: undefined;
            page?: undefined;
            total?: undefined;
            done?: undefined;
            from?: undefined;
            to?: undefined;
        };
    } | {
        key: string;
        params: {
            written: any;
            target: any;
            count?: undefined;
            page?: undefined;
            total?: undefined;
            done?: undefined;
            from?: undefined;
            to?: undefined;
        };
    } | {
        key: string;
        params: {
            count: any;
            written?: undefined;
            target?: undefined;
            page?: undefined;
            total?: undefined;
            done?: undefined;
            from?: undefined;
            to?: undefined;
        };
    } | {
        key: string;
        params: {
            page: any;
            total: any;
            count: any;
            written?: undefined;
            target?: undefined;
            done?: undefined;
            from?: undefined;
            to?: undefined;
        };
    } | {
        key: string;
        params: {
            done: any;
            total: any;
            from: any;
            to: any;
            written?: undefined;
            target?: undefined;
            count?: undefined;
            page?: undefined;
        };
    } | {
        key: string;
        params: {
            done: any;
            total: any;
            written?: undefined;
            target?: undefined;
            count?: undefined;
            page?: undefined;
            from?: undefined;
            to?: undefined;
        };
    };
    elapsedSeconds: number;
    preview: any;
};
export const WORK_KIND: Readonly<{
    REWRITE: "rewrite";
    NOTE_TASK: "noteTask";
    TRANSCRIBE: "transcribe";
    EXTRACT_IMAGE: "extractImage";
    EXTRACT_PDF: "extractPdf";
    TRANSLATE: "translate";
    DESCRIBE: "describe";
}>;
export const WORK_STEP: Readonly<{
    PREPARE_AUDIO: "prepareAudio";
    PREPARE_PHOTO: "preparePhoto";
    LOAD_MODEL: "loadModel";
    READ_NOTE: "readNote";
    WRITE: "write";
    TRANSCRIBE: "transcribe";
    READ_TEXT: "readText";
    READ_PAGES: "readPages";
    TRANSLATE: "translate";
    LOOK: "look";
}>;
export const WORK_EVENT: Readonly<{
    STEP: "step";
    TEXT: "text";
    POSITION: "position";
    PAGE: "page";
    PARAGRAPHS: "paragraphs";
}>;
export const WORK_STEP_STATUS: Readonly<{
    DONE: "done";
    ACTIVE: "active";
    PENDING: "pending";
}>;
export const WORK_ELAPSED_AFTER_MS: 10000;
export const WORK_PREVIEW_MAX_CHARS: 280;
export const WORK_SHORTER_TARGET_RATIO: 0.6;
export function countWords(text: any): number;
//# sourceMappingURL=localAiWorkProgress.d.ts.map