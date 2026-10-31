/**
 * Folder suggestions for unfiled notes, from stored vectors only: each note
 * is voted into the folder its nearest notes share, as the folder chip does.
 */
export function suggestFolderMoves({ api, notes, folders, limit }: {
    api: any;
    notes: any;
    folders: any;
    limit?: number;
}): Promise<{
    key: string;
    title: any;
    from: any;
    to: any;
}[]>;
export const TIDY_NOTE_LIMIT: 60;
//# sourceMappingURL=noteTidy.d.ts.map