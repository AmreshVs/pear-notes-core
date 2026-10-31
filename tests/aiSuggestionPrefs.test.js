import test from 'brittle'

import {
  AI_SUGGESTION,
  AI_SUGGESTIONS_PREF_ID,
  aiSuggestionsRecord,
  loadAiSuggestions,
  normalizeAiSuggestions,
  saveAiSuggestions
} from '../store/services/aiSuggestionPrefs.js'
import localAiReducer, {
  selectAiSuggestionOn,
  setAiSuggestions
} from '../store/slices/localAiSlice.js'

test('switches default on and store only what is off', async (t) => {
  t.alike(normalizeAiSuggestions(null), {
    tasks: true,
    titles: true,
    folders: true,
    related: true
  })
  t.alike(normalizeAiSuggestions({ off: ['titles', 'unknown'] }).titles, false)
  t.is(aiSuggestionsRecord(normalizeAiSuggestions(null)), null)
  t.alike(aiSuggestionsRecord({ ...normalizeAiSuggestions(null), related: false }), {
    off: ['related']
  })
  const stored = {}
  const api = {
    getSyncedPrefs: async () => stored,
    setSyncedPref: async (id, value) => {
      stored[id] = value
    }
  }
  await saveAiSuggestions(api, { ...normalizeAiSuggestions(null), folders: false })
  t.alike(stored[AI_SUGGESTIONS_PREF_ID], { off: ['folders'] })
  t.is((await loadAiSuggestions(api)).folders, false)
})

test('slice selector reads the switches', (t) => {
  let state = localAiReducer(undefined, { type: 'init' })
  t.ok(selectAiSuggestionOn({ localAi: state }, AI_SUGGESTION.TASKS))
  state = localAiReducer(state, setAiSuggestions({ tasks: false }))
  t.absent(selectAiSuggestionOn({ localAi: state }, AI_SUGGESTION.TASKS))
  t.ok(selectAiSuggestionOn({ localAi: state }, AI_SUGGESTION.TITLES))
})
