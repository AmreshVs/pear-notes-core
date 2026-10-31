export const ASK_THREADS_KEY = 'askVaultThreads'
export const ASK_THREADS_MAX = 30
export const ASK_NOTE_THREADS_KEY = 'askNoteThreads'
export const ASK_NOTE_THREADS_MAX = 50
const ASK_NOTE_ANSWER_MAX = 3000
const ASK_THREAD_TURNS_MAX = 20
const ASK_THREAD_TITLE_MAX = 80

const savedSource = (source) => ({
  n: source.n,
  noteKey: source.noteKey,
  title: String(source.title ?? '')
})

const savedResult = (result) =>
  result && {
    kind: result.kind,
    answer: String(result.answer ?? ''),
    citations: (result.citations ?? []).map((c) => ({ n: c.n, noteKey: c.noteKey })),
    verified: result.verified !== false
  }

/** Finished turns only; source excerpts are dropped so a saved thread keeps answers, not note text. */
export function askThreadFromTurns({ id, turns, now = Date.now() }) {
  const done = (Array.isArray(turns) ? turns : [])
    .filter((turn) => turn.status === 'done' && turn.result)
    .slice(-ASK_THREAD_TURNS_MAX)
  if (!done.length) return null
  const title = String(done[0].question ?? '').trim()
  return {
    id,
    title:
      title.length > ASK_THREAD_TITLE_MAX ? `${title.slice(0, ASK_THREAD_TITLE_MAX - 1)}…` : title,
    updatedAt: now,
    turns: done.map((turn, index) => ({
      id: index + 1,
      question: String(turn.question ?? ''),
      status: 'done',
      result: savedResult(turn.result),
      sources: (turn.sources ?? []).map(savedSource),
      ...(turn.answeredOn ? { answeredOn: String(turn.answeredOn) } : {})
    }))
  }
}

export function parseAskThreads(raw) {
  try {
    const list = JSON.parse(raw || '[]')
    return Array.isArray(list) ? list.filter((thread) => thread?.id && thread.turns?.length) : []
  } catch {
    return []
  }
}

export function upsertAskThread(threads, thread) {
  const rest = (threads ?? []).filter((item) => item.id !== thread.id)
  return [thread, ...rest].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, ASK_THREADS_MAX)
}

const citesLocked = (thread, isLocked) =>
  thread.turns.some((turn) => (turn.sources ?? []).some((source) => isLocked(source.noteKey)))

/** A thread that cites a note locked since is never shown again, and is removed from disk. */
export const withoutLockedAskThreads = (threads, isLocked) =>
  (threads ?? []).filter((thread) => !citesLocked(thread, isLocked))

export async function loadAskThreads(api) {
  return parseAskThreads(await api.getPreference({ key: ASK_THREADS_KEY }))
}

const writeChains = new Map()

const queueWriteOf = (key, load) => (api, change) => {
  const run = (writeChains.get(key) ?? Promise.resolve()).then(async () => {
    const next = change(await load(api))
    await api.updatePreference({ key, value: JSON.stringify(next) })
    return next
  })
  writeChains.set(
    key,
    run.catch(() => {})
  )
  return run
}

const queueWrite = queueWriteOf(ASK_THREADS_KEY, loadAskThreads)

export const saveAskThread = (api, thread) =>
  queueWrite(api, (threads) => upsertAskThread(threads, thread))

export const deleteAskThread = (api, id) =>
  queueWrite(api, (threads) => threads.filter((thread) => thread.id !== id))

export const clearAskThreads = (api) => queueWrite(api, () => [])

export async function loadVisibleAskThreads(api, isLocked) {
  const threads = await loadAskThreads(api)
  const visible = withoutLockedAskThreads(threads, isLocked)
  if (visible.length < threads.length) {
    await queueWrite(api, (current) => withoutLockedAskThreads(current, isLocked))
  }
  return visible
}

const savedNoteTurn = (turn) => ({
  id: turn.id,
  question: String(turn.question ?? ''),
  status: 'done',
  scope: turn.scope === 'selection' ? 'selection' : 'note',
  kind: String(turn.kind ?? ''),
  answer: String(turn.answer ?? '').slice(0, ASK_NOTE_ANSWER_MAX),
  error: turn.error ? String(turn.error) : null,
  applied: turn.applied === true,
  edits: [],
  diff: null,
  editedText: null,
  readOnly: true
})

/** Questions and answers only: no diff or edited text, so a reopened thread can't apply edits or copy the note. */
export const savedAskNoteTurns = (turns) =>
  (Array.isArray(turns) ? turns : [])
    .filter((turn) => turn.status === 'done')
    .slice(-ASK_THREAD_TURNS_MAX)
    .map((turn, index) => ({ ...savedNoteTurn(turn), id: index + 1 }))

export function askNoteThreadFromTurns({ noteKey, turns, now = Date.now() }) {
  const saved = savedAskNoteTurns(turns)
  if (!noteKey || !saved.length) return null
  return { noteKey, updatedAt: now, turns: saved }
}

export function parseAskNoteThreads(raw) {
  try {
    const list = JSON.parse(raw || '[]')
    return Array.isArray(list)
      ? list.filter((thread) => thread?.noteKey && thread.turns?.length)
      : []
  } catch {
    return []
  }
}

export async function loadAskNoteThreads(api) {
  return parseAskNoteThreads(await api.getPreference({ key: ASK_NOTE_THREADS_KEY }))
}

const queueNoteWrite = queueWriteOf(ASK_NOTE_THREADS_KEY, loadAskNoteThreads)

export const upsertAskNoteThread = (threads, thread) =>
  [thread, ...(threads ?? []).filter((item) => item.noteKey !== thread.noteKey)]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, ASK_NOTE_THREADS_MAX)

/**
 * Never saves for a locked note; `isLocked` is checked when the write runs.
 * @param {any} api
 * @param {{ noteKey: string, updatedAt: number, turns: any[] }} thread
 * @param {(noteKey: string) => boolean} [isLocked]
 */
export const saveAskNoteThread = (api, thread, isLocked = () => false) =>
  queueNoteWrite(api, (threads) =>
    isLocked(thread.noteKey)
      ? threads.filter((item) => item.noteKey !== thread.noteKey)
      : upsertAskNoteThread(threads, thread)
  )

export const clearAskNoteThread = (api, noteKey) =>
  queueNoteWrite(api, (threads) => threads.filter((thread) => thread.noteKey !== noteKey))

/**
 * A locked note shows no saved turns and loses its saved thread.
 * @param {any} api
 * @param {string | null} noteKey
 * @param {(noteKey: string) => boolean} [isLocked]
 */
export async function loadAskNoteThread(api, noteKey, isLocked = () => false) {
  const threads = await loadAskNoteThreads(api)
  const locked = threads.filter((thread) => isLocked(thread.noteKey))
  if (locked.length) {
    await queueNoteWrite(api, (current) => current.filter((thread) => !isLocked(thread.noteKey)))
  }
  if (!noteKey || isLocked(noteKey)) return []
  return threads.find((thread) => thread.noteKey === noteKey)?.turns.map(savedNoteTurn) ?? []
}
