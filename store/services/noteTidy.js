import { findRelatedNotes } from './localAiSearch.js'
import {
  defaultFolderKeys,
  isUnfiled,
  loadSuggestionFeedback,
  pickFolderSuggestion
} from './noteSuggestions.js'

export const TIDY_NOTE_LIMIT = 60
const TIDY_RELATED_LIMIT = 10

/**
 * Folder suggestions for unfiled notes, from stored vectors only: each note
 * is voted into the folder its nearest notes share, as the folder chip does.
 */
export async function suggestFolderMoves({ api, notes, folders, limit = TIDY_NOTE_LIMIT }) {
  const defaultKeys = defaultFolderKeys(folders)
  const unfiled = Object.entries(notes)
    .filter(([, note]) => note && !note.locked && isUnfiled(note.folderKey, defaultKeys))
    .sort(([, a], [, b]) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .slice(0, limit)
  const feedback = await loadSuggestionFeedback(api)
  const moves = []
  for (const [key, note] of unfiled) {
    const hits = await findRelatedNotes({ api, noteKey: key, limit: TIDY_RELATED_LIMIT })
    const folderKey = pickFolderSuggestion(hits, (other) => notes[other]?.folderKey, {
      feedback,
      defaultKeys
    })
    if (folderKey && folders[folderKey]) {
      moves.push({ key, title: note.title ?? '', from: note.folderKey ?? '', to: folderKey })
    }
  }
  return moves
}
