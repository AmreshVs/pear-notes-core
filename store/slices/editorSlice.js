import { createSlice } from '@reduxjs/toolkit'

const initialState = {
  title: '',
  content: '',
  contentText: '',
  editorInstance: null,
  isFocused: false,
  baseKey: null,
  baseTitle: '',
  baseContent: '',
  conflict: null,
  recentLocalWrites: [],
  syncToken: 0,
  lastResolution: null
}

const RECENT_LOCAL_WRITE_LIMIT = 10

function rememberLocalWrite(entries, write) {
  const kept = entries.filter((entry) => entry.key === write.key)
  // A write is registered twice — once before the RPC, once on its ack — so drop
  // the duplicate rather than spending two of the ten slots on one save.
  const last = kept[kept.length - 1]
  if (last && last.title === write.title && last.content === write.content) return kept
  return [...kept, write].slice(-RECENT_LOCAL_WRITE_LIMIT)
}

const editorSlice = createSlice({
  name: 'editor',
  initialState,
  reducers: {
    setEditorTitle: (state, action) => {
      state.title = action.payload
    },
    setEditorContent: (state, action) => {
      state.content = action.payload.html
      state.contentText = action.payload.text
    },
    setEditorInstance: (state, action) => {
      state.editorInstance = action.payload
    },
    setEditorFocused: (state, action) => {
      state.isFocused = action.payload
    },
    syncEditorWithNote: (state, action) => {
      const { key = null, data } = action.payload || {}
      const note = data || {}
      state.title = note.title || ''
      state.content = note.note || ''
      state.contentText = ''
      state.baseKey = key
      state.baseTitle = note.title || ''
      state.baseContent = note.note || ''
      state.conflict = null
      state.recentLocalWrites = []
      state.syncToken += 1
    },
    // Registers a write we are about to send so its echo is recognised as ours
    // even if the backend acks after the echo has already come back.
    recordLocalWrite: (state, action) => {
      const { key = null, title = '', content = '' } = action.payload || {}
      state.recentLocalWrites = rememberLocalWrite(state.recentLocalWrites, { key, title, content })
    },
    setEditorBase: (state, action) => {
      const { key = null, title = '', content = '' } = action.payload || {}
      state.baseKey = key
      state.baseTitle = title
      state.baseContent = content
      state.recentLocalWrites = rememberLocalWrite(state.recentLocalWrites, { key, title, content })
    },
    setEditorConflict: (state, action) => {
      state.conflict = action.payload || null
    },
    clearEditorConflict: (state) => {
      state.conflict = null
    },
    resolveEditorConflict: (state, action) => {
      state.lastResolution = action.payload || null
    },
    clearEditor: (state) => {
      state.title = ''
      state.content = ''
      state.contentText = ''
      state.baseKey = null
      state.baseTitle = ''
      state.baseContent = ''
      state.conflict = null
      state.recentLocalWrites = []
      state.syncToken += 1
    }
  }
})

export const {
  setEditorTitle,
  setEditorContent,
  setEditorInstance,
  setEditorFocused,
  syncEditorWithNote,
  recordLocalWrite,
  setEditorBase,
  setEditorConflict,
  clearEditorConflict,
  resolveEditorConflict,
  clearEditor
} = editorSlice.actions

const editorState = (state) => state.editor
export const getEditorTitle = (state) => editorState(state).title
export const getEditorContent = (state) => editorState(state).content
export const getEditorContentText = (state) => editorState(state).contentText
export const getEditorInstance = (state) => editorState(state).editorInstance
export const getIsFocused = (state) => editorState(state).isFocused
export const getEditorBaseKey = (state) => editorState(state).baseKey
export const getEditorBaseTitle = (state) => editorState(state).baseTitle
export const getEditorBaseContent = (state) => editorState(state).baseContent
export const getEditorConflict = (state) => editorState(state).conflict
export const getRecentLocalWrites = (state) => editorState(state).recentLocalWrites
export const getEditorSyncToken = (state) => editorState(state).syncToken
export const getEditorLastResolution = (state) => editorState(state).lastResolution

export default editorSlice.reducer
