/**
 * The notes as one input, each under "Note: <title>", sharing the budget so
 * every note gets a fair slice instead of the first one filling it.
 */
export function buildGenerateInput(notes: any, { untitled, budget }?: {
    untitled?: string;
    budget?: number;
}): any;
/** Model lines ("# " headings, "- " points, "Q:"/"A:" cards) as note HTML. */
export function generatedToHtml(task: any, output: any): string;
/** A draft note: the generated content, then the notes it came from. */
export function buildGeneratedNote({ task, output, sources, title, sourcesLabel }: {
    task: any;
    output: any;
    sources: any;
    title: any;
    sourcesLabel: any;
}): {
    title: any;
    note: string;
};
export const GENERATE_SOURCE_CHARS: 7600;
//# sourceMappingURL=noteGenerate.d.ts.map