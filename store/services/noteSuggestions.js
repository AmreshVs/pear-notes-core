import b4a from 'b4a'

import { ALL_NOTES_KEY, DEFAULT_FOLDER_NAME, RECENTLY_DELETED_KEY } from '../../constant.js'
import { normalizeFolderName } from '../../utils.js'
import { parseTitleOutput } from './localAiPrompts.js'

export const SUGGESTION_KIND = Object.freeze({ TITLE: 'title', FOLDER: 'folder' })
/** One record per dismissed suggestion on this device; dismissed ones never come back. */
export const SUGGESTIONS_DISMISSED_NAMESPACE = 'suggestions-dismissed'

export const FOLDER_SUGGEST_MIN_SCORE = 0.5
export const FOLDER_SUGGEST_MIN_VOTES = 2
export const FOLDER_SUGGEST_SHARE = 0.6
export const TITLE_SUGGEST_MIN_CHARS = 120
export const TITLE_MAX_CHARS = 80

export const suggestionId = (noteKey, kind) => `${noteKey}|${kind}`

/** Folders that hold notes nobody filed: the "Untitled" folder new notes land in, or a nameless one. */
export function defaultFolderKeys(folderData) {
  const keys = new Set()
  for (const [key, folder] of Object.entries(folderData ?? {})) {
    const name = normalizeFolderName(folder?.title)
    if (!name || name === DEFAULT_FOLDER_NAME) keys.add(key)
  }
  return keys
}

export const isUnfiled = (folderKey, defaultKeys = null) =>
  !folderKey || folderKey === ALL_NOTES_KEY || !!defaultKeys?.has(folderKey)

export const FOLDER_NAME_MAX_CHARS = 32
const FOLDER_NAME_MAX_WORDS = 4
const FOLDER_LABEL = /^\s*folder(?:\s+name)?\s*:\s*/i
const QUOTES = /^["“”'‘’]+|["“”'‘’]+$/g

/** A model folder name, or null when it is unusable or just "Untitled". */
export function cleanFolderName(raw) {
  const unlabelled = String(raw ?? '').replace(FOLDER_LABEL, '')
  const name = normalizeFolderName(parseTitleOutput(unlabelled).replace(QUOTES, ''))
  if (!name || name.length > FOLDER_NAME_MAX_CHARS) return null
  if (name.split(' ').length > FOLDER_NAME_MAX_WORDS) return null
  if (name.toLowerCase() === DEFAULT_FOLDER_NAME.toLowerCase()) return null
  return name
}

/** The existing folder whose name matches, ignoring case. */
export function findFolderByName(folderData, name) {
  const wanted = normalizeFolderName(name).toLowerCase()
  return (
    Object.entries(folderData ?? {}).find(
      ([, folder]) => normalizeFolderName(folder?.title).toLowerCase() === wanted
    )?.[0] ?? null
  )
}

/**
 * A folder for an unfiled note, voted by its nearest notes: at least two
 * close neighbours share it, and it holds most of the close neighbours' weight.
 */
export function pickFolderSuggestion(
  hits,
  folderOf,
  {
    minScore = FOLDER_SUGGEST_MIN_SCORE,
    minVotes = FOLDER_SUGGEST_MIN_VOTES,
    share = FOLDER_SUGGEST_SHARE,
    feedback = null,
    defaultKeys = null
  } = {}
) {
  const votes = new Map()
  let total = 0
  for (const hit of hits ?? []) {
    if (!(hit.score >= minScore)) continue
    total += hit.score
    const folderKey = folderOf(hit.key)
    if (isUnfiled(folderKey, defaultKeys) || folderKey === RECENTLY_DELETED_KEY) continue
    const vote = votes.get(folderKey) ?? { weight: 0, count: 0 }
    vote.weight += hit.score
    vote.count += 1
    votes.set(folderKey, vote)
  }
  let best = null
  for (const [folderKey, vote] of votes) {
    if (!best || vote.weight > best.weight) best = { folderKey, ...vote }
  }
  if (!best || isFolderMuted(feedback, best.folderKey)) return null
  const needed = isFolderTrusted(feedback, best.folderKey) ? share - FEEDBACK_SHARE_BONUS : share
  if (best.count < minVotes || best.weight < total * needed) return null
  return best.folderKey
}

/** A model title as the title tool parses it, or null when it is unusable. */
export function cleanTitleSuggestion(raw, note = null) {
  const title = parseTitleOutput(String(raw ?? ''), note)
  return title && title.length <= TITLE_MAX_CHARS ? title : null
}

export async function loadDismissedSuggestions(api) {
  const response = await api.derivedVersions({ namespace: SUGGESTIONS_DISMISSED_NAMESPACE })
  return new Set((response?.ok ? response.entries || [] : []).map((entry) => entry.id))
}

export async function dismissSuggestion(api, noteKey, kind) {
  const response = await api.derivedPut({
    namespace: SUGGESTIONS_DISMISSED_NAMESPACE,
    entries: [{ id: suggestionId(noteKey, kind), version: 1, value: b4a.from('1') }]
  })
  return response?.ok === true
}

export const SUGGESTION_FEEDBACK_KEY = 'suggestionFeedback'
const FEEDBACK_MUTE_AFTER = 3
const FEEDBACK_TRUST_AFTER = 2
const FEEDBACK_SHARE_BONUS = 0.1

const counts = (feedback, folderKey) =>
  feedback?.folders?.[folderKey] ?? { accepted: 0, dismissed: 0 }

/** A folder the user keeps turning down is not suggested again. */
export const isFolderMuted = (feedback, folderKey) => {
  const { accepted, dismissed } = counts(feedback, folderKey)
  return dismissed >= FEEDBACK_MUTE_AFTER && dismissed > accepted * 2
}

/** A folder the user has accepted before needs a little less agreement. */
export const isFolderTrusted = (feedback, folderKey) =>
  counts(feedback, folderKey).accepted >= FEEDBACK_TRUST_AFTER

export async function loadSuggestionFeedback(api) {
  try {
    const raw = await api.getPreference({ key: SUGGESTION_FEEDBACK_KEY })
    const parsed = typeof raw === 'string' && raw ? JSON.parse(raw) : raw
    return parsed && typeof parsed === 'object' ? parsed : { folders: {} }
  } catch {
    return { folders: {} }
  }
}

/** Remembers, on this device, whether a folder suggestion was taken or turned down. */
let feedbackWrites = Promise.resolve()

/** Counts an accept or dismiss for one folder key, or for several in one write. */
export function recordFolderFeedback(api, folderKeys, accepted) {
  const keys = (Array.isArray(folderKeys) ? folderKeys : [folderKeys]).filter(Boolean)
  if (!keys.length) return Promise.resolve()
  const write = feedbackWrites.then(async () => {
    const feedback = await loadSuggestionFeedback(api)
    const folders = { ...(feedback.folders ?? {}) }
    for (const folderKey of keys) {
      const current = counts({ folders }, folderKey)
      folders[folderKey] = {
        accepted: current.accepted + (accepted ? 1 : 0),
        dismissed: current.dismissed + (accepted ? 0 : 1)
      }
    }
    await api.updatePreference({ key: SUGGESTION_FEEDBACK_KEY, value: JSON.stringify({ folders }) })
  })
  feedbackWrites = write.catch(() => {})
  return write
}
