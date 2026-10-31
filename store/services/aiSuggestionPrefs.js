export const AI_SUGGESTION = Object.freeze({
  TASKS: 'tasks',
  TITLES: 'titles',
  FOLDERS: 'folders',
  RELATED: 'related'
})

export const AI_SUGGESTIONS_PREF_ID = 'ai-suggestions'

export const DEFAULT_AI_SUGGESTIONS = Object.freeze({
  [AI_SUGGESTION.TASKS]: true,
  [AI_SUGGESTION.TITLES]: true,
  [AI_SUGGESTION.FOLDERS]: true,
  [AI_SUGGESTION.RELATED]: true
})

/** Synced for the whole vault; only switched-off kinds are stored, so a new kind starts on. */
export function normalizeAiSuggestions(record) {
  const off = new Set(Array.isArray(record?.off) ? record.off : [])
  return Object.fromEntries(Object.values(AI_SUGGESTION).map((kind) => [kind, !off.has(kind)]))
}

export function aiSuggestionsRecord(prefs) {
  const off = Object.values(AI_SUGGESTION).filter((kind) => prefs?.[kind] === false)
  return off.length ? { off } : null
}

export async function loadAiSuggestions(api) {
  const records = await api.getSyncedPrefs(AI_SUGGESTIONS_PREF_ID)
  return normalizeAiSuggestions(records?.[AI_SUGGESTIONS_PREF_ID])
}

export const saveAiSuggestions = (api, prefs) =>
  api.setSyncedPref(AI_SUGGESTIONS_PREF_ID, aiSuggestionsRecord(prefs))
