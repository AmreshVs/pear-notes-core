import {
  ACTIVITY_EVENT,
  ACTIVITY_FILTER,
  ACTIVITY_LOG_ENABLED_KEY,
  ACTIVITY_PAGE_SIZE,
  ACTIVITY_SESSION_WINDOW_MS,
  ACTIVITY_SNAPSHOT_MAX_BYTES,
  ACTIVITY_TARGET,
  RECENTLY_DELETED_KEY
} from '../../constant.js'
import { getActivityTargetKind, htmlToActivityText, listAttachmentNames } from '../../activity.js'
import * as log from '../../log.js'
import { envelopeLinks } from '../sealedEnvelope.js'
import { ACTIVITY_SEQ_PAD, INVITE_KEY } from '../viewKeys.js'
import * as viewStore from '../viewStore.js'
import { OP } from './ops.js'

// The activity log is derived inside apply, from the op and the view only, so
// every device derives the same log. One op makes at most one entry, and a run
// of the same change by the same device to the same note folds into one entry.
const FOLDS = new Set([ACTIVITY_EVENT.NOTE_EDITED, ACTIVITY_EVENT.NOTE_RENAMED])

export async function isActivityEnabled(db) {
  return !!(await viewStore.getSettings(db))?.[ACTIVITY_LOG_ENABLED_KEY]
}

const pad = (value, width) => String(value).padStart(width, '0')

async function latestFor(db, noteKey) {
  const [id] = await viewStore.activityIdsDescending(db, { noteKey, limit: 1 })
  return id ? viewStore.getActivityEntry(db, id) : null
}

async function record(db, change, ctx) {
  const { event, targetKey = '', snapshot = null } = change
  const at = ctx.at
  if (!event || !(at > (await viewStore.getActivityClearedAt(db)))) return

  if (FOLDS.has(event) && targetKey) {
    const last = await latestFor(db, targetKey)
    const recent = last?.device === ctx.device && at - last.lastAt <= ACTIVITY_SESSION_WINDOW_MS
    // A title typed right after creating the note is part of the creation.
    if (
      event === ACTIVITY_EVENT.NOTE_RENAMED &&
      recent &&
      last.event === ACTIVITY_EVENT.NOTE_CREATED
    ) {
      await viewStore.putActivityEntry(db, last.id, {
        ...last,
        lastAt: at,
        targetTitle: change.targetTitle || ''
      })
      return
    }
    const folds =
      last?.event === event &&
      last.device === ctx.device &&
      at >= last.lastAt &&
      at - last.lastAt <= ACTIVITY_SESSION_WINDOW_MS
    if (folds) {
      const meta =
        event === ACTIVITY_EVENT.NOTE_RENAMED ? { ...last.meta, to: change.meta.to } : last.meta
      if (event === ACTIVITY_EVENT.NOTE_RENAMED && meta.from === meta.to) {
        await viewStore.delActivityEntry(db, last.id)
        return
      }
      await viewStore.putActivityEntry(db, last.id, {
        ...last,
        lastAt: at,
        ops: (last.ops || 1) + 1,
        targetTitle: change.targetTitle ?? last.targetTitle,
        meta
      })
      return
    }
    if (event === ACTIVITY_EVENT.NOTE_EDITED) {
      log.info('[activity] edit not folded', {
        note: targetKey.slice(0, 8),
        last: last ? last.event : 'none',
        lastId: last?.id?.slice(0, 32) || '',
        sameDevice: last ? last.device === ctx.device : null,
        gapMs: last ? at - last.lastAt : null,
        lastOps: last?.ops ?? null
      })
    }
  }

  const id = `${pad(at, ACTIVITY_SEQ_PAD)}:${ctx.device.slice(0, 12)}:${pad(ctx.seq, 12)}:${pad(ctx.slot++, 3)}`
  await viewStore.putActivityEntry(db, id, {
    event,
    at,
    lastAt: at,
    device: ctx.device,
    targetKind: getActivityTargetKind(event),
    targetKey,
    targetTitle: change.targetTitle || '',
    ops: 1,
    meta: change.meta || {}
  })
  if (snapshot !== null && snapshot.length <= ACTIVITY_SNAPSHOT_MAX_BYTES) {
    await viewStore.putActivitySnapshot(db, id, { text: snapshot })
  }
}

// A sealed body is never snapshotted, and its file names are inside the ciphertext.
function sealedChanges(base, before, after) {
  const was = envelopeLinks(before)
  const now = envelopeLinks(after)
  const file = (event) => ({ ...base, event, meta: { kind: 'file', fileName: '' } })
  return [
    ...now
      .filter((url) => !was.includes(url))
      .slice(0, 5)
      .map(() => file(ACTIVITY_EVENT.NOTE_ATTACHMENT_ADDED)),
    ...was
      .filter((url) => !now.includes(url))
      .slice(0, 5)
      .map(() => file(ACTIVITY_EVENT.NOTE_ATTACHMENT_REMOVED)),
    { ...base, event: ACTIVITY_EVENT.NOTE_EDITED }
  ]
}

function noteChanges(key, previous, next, folderTitles) {
  const title = next.title || ''
  if (!previous) return [{ event: ACTIVITY_EVENT.NOTE_CREATED, targetKey: key, targetTitle: title }]
  const changes = []
  const base = { targetKey: key, targetTitle: title }
  if ((previous.title || '') !== title) {
    changes.push({
      ...base,
      event: ACTIVITY_EVENT.NOTE_RENAMED,
      meta: { from: previous.title || '', to: title }
    })
  }
  if ((previous.folderKey || '') !== (next.folderKey || '')) {
    const event =
      next.folderKey === RECENTLY_DELETED_KEY
        ? ACTIVITY_EVENT.NOTE_TRASHED
        : previous.folderKey === RECENTLY_DELETED_KEY
          ? ACTIVITY_EVENT.NOTE_RESTORED
          : ACTIVITY_EVENT.NOTE_MOVED
    changes.push({ ...base, event, meta: folderTitles })
  }
  if (!!previous.pinned !== !!next.pinned) {
    changes.push({
      ...base,
      event: next.pinned ? ACTIVITY_EVENT.NOTE_PINNED : ACTIVITY_EVENT.NOTE_UNPINNED
    })
  }
  if (!!previous.locked !== !!next.locked) {
    changes.push({
      ...base,
      event: next.locked ? ACTIVITY_EVENT.NOTE_LOCKED : ACTIVITY_EVENT.NOTE_UNLOCKED
    })
  }
  if (previous.sealed || next.sealed) {
    if (previous.sealed && next.sealed && previous.sealed !== next.sealed) {
      changes.push(...sealedChanges(base, previous.sealed, next.sealed))
    }
    return changes
  }
  const before = previous.note || ''
  const after = next.note || ''
  if (before !== after) {
    const names = (html) => listAttachmentNames(html).map((item) => `${item.kind}:${item.name}`)
    const was = names(before)
    const now = names(after)
    for (const name of now.filter((n) => !was.includes(n)).slice(0, 5)) {
      const [kind, ...rest] = name.split(':')
      changes.push({
        ...base,
        event: ACTIVITY_EVENT.NOTE_ATTACHMENT_ADDED,
        meta: { kind, fileName: rest.join(':') }
      })
    }
    for (const name of was.filter((n) => !now.includes(n)).slice(0, 5)) {
      const [kind, ...rest] = name.split(':')
      changes.push({
        ...base,
        event: ACTIVITY_EVENT.NOTE_ATTACHMENT_REMOVED,
        meta: { kind, fileName: rest.join(':') }
      })
    }
    changes.push({
      ...base,
      event: ACTIVITY_EVENT.NOTE_EDITED,
      snapshot: htmlToActivityText(before)
    })
  }
  return changes
}

async function folderTitle(db, key) {
  if (!key || key === RECENTLY_DELETED_KEY) return ''
  return (await viewStore.getFolder(db, key))?.title || ''
}

// `previous` is the row as it was before this op was applied.
export async function recordOp(db, op, previous, { device, seq }) {
  const ctx = { device, seq, at: Number.isFinite(op.at) ? op.at : 0, slot: 0 }
  let changes = []
  switch (op.type) {
    case OP.ADD_NOTE:
      if (op.key === INVITE_KEY) {
        if (!previous)
          changes = [
            { event: ACTIVITY_EVENT.INVITE_CREATED, meta: { expires: op.value.expires || 0 } }
          ]
        break
      }
      if (op.key.startsWith('@')) break
      changes = noteChanges(op.key, previous, op.value, {
        fromFolder: await folderTitle(db, previous?.folderKey),
        toFolder: await folderTitle(db, op.value.folderKey)
      })
      break
    case OP.REMOVE_NOTE:
      changes = [
        { event: ACTIVITY_EVENT.NOTE_DELETED, targetKey: op.key, targetTitle: previous?.title }
      ]
      break
    case OP.ADD_FOLDER:
      if (!previous) {
        changes = [
          { event: ACTIVITY_EVENT.FOLDER_CREATED, targetKey: op.key, targetTitle: op.value.title }
        ]
      } else if (previous.title !== op.value.title) {
        changes = [
          {
            event: ACTIVITY_EVENT.FOLDER_RENAMED,
            targetKey: op.key,
            targetTitle: op.value.title,
            meta: { from: previous.title || '', to: op.value.title || '' }
          }
        ]
      }
      break
    case OP.REMOVE_FOLDER:
      changes = [
        { event: ACTIVITY_EVENT.FOLDER_DELETED, targetKey: op.key, targetTitle: previous?.title }
      ]
      break
    case OP.ADD_SYNCED_DEVICE:
      changes = [
        {
          event: ACTIVITY_EVENT.DEVICE_APPROVED,
          targetKey: op.key,
          targetTitle: op.value.title,
          meta: { platform: op.value.platform || '', deviceKey: op.value.localKey || '' }
        }
      ]
      break
    case OP.UPDATE_SYNCED_DEVICE:
      if (previous && previous.title !== op.value.title) {
        changes = [
          {
            event: ACTIVITY_EVENT.DEVICE_RENAMED,
            targetKey: op.key,
            targetTitle: op.value.title,
            meta: { from: previous.title || '', to: op.value.title || '' }
          }
        ]
      }
      break
    case OP.REMOVE_SYNCED_DEVICE:
      changes = [
        {
          event: ACTIVITY_EVENT.DEVICE_REMOVED,
          targetKey: op.key,
          targetTitle: previous?.title,
          meta: { platform: previous?.platform || '', deviceKey: previous?.localKey || '' }
        }
      ]
      break
    case OP.LOG_EVENT:
      changes = [
        {
          event: op.event,
          targetKey: op.targetKey,
          targetTitle: op.targetTitle,
          meta: op.meta || {}
        }
      ]
      break
  }
  for (const change of changes) await record(db, change, ctx)
}

async function removeEntry(db, id) {
  await viewStore.delActivityEntry(db, id)
  await viewStore.delActivitySnapshot(db, id)
}

export async function forgetSnapshots(db, noteKey) {
  for (const id of await viewStore.activityIdsForNote(db, noteKey)) {
    await viewStore.delActivitySnapshot(db, id)
  }
}

export async function forgetNote(db, noteKey) {
  for (const id of await viewStore.activityIdsForNote(db, noteKey)) await removeEntry(db, id)
}

export async function pruneBefore(db, cutoff) {
  for (const entry of await viewStore.activityValuesBefore(db, pad(cutoff, ACTIVITY_SEQ_PAD))) {
    if (entry?.id) await removeEntry(db, entry.id)
  }
}

export async function clearAll(db, at) {
  await viewStore.clearAllActivity(db)
  if (at > (await viewStore.getActivityClearedAt(db))) await viewStore.putActivityClearedAt(db, at)
}

function matches(entry, filter, deviceKey) {
  if (deviceKey && entry.device !== deviceKey) return false
  switch (filter) {
    case ACTIVITY_FILTER.NOTES:
      return entry.targetKind === ACTIVITY_TARGET.NOTE
    case ACTIVITY_FILTER.FOLDERS:
      return entry.targetKind === ACTIVITY_TARGET.FOLDER
    case ACTIVITY_FILTER.DEVICES:
      return (
        entry.targetKind === ACTIVITY_TARGET.DEVICE || entry.targetKind === ACTIVITY_TARGET.SYSTEM
      )
    default:
      return true
  }
}

async function present(db, entry) {
  const out = {
    id: entry.id,
    event: entry.event,
    device: entry.device || '',
    at: entry.at || 0,
    lastAt: entry.lastAt || entry.at || 0,
    ops: entry.ops || 1,
    targetKind: entry.targetKind || ACTIVITY_TARGET.SYSTEM,
    targetKey: entry.targetKey || '',
    targetTitle: entry.targetTitle || '',
    locked: false,
    added: 0,
    removed: 0,
    hasDiff: false,
    recoverable: false,
    meta: entry.meta || {}
  }
  if (out.targetKind === ACTIVITY_TARGET.NOTE && out.targetKey) {
    const note = await viewStore.getNote(db, out.targetKey)
    out.locked = !!note?.locked
    if (note?.title) out.targetTitle = note.title
    out.hasDiff =
      entry.event === ACTIVITY_EVENT.NOTE_EDITED &&
      !!(await viewStore.getActivitySnapshot(db, entry.id))
  } else if (out.targetKind === ACTIVITY_TARGET.FOLDER && out.targetKey) {
    const folder = await viewStore.getFolder(db, out.targetKey)
    if (folder?.title) out.targetTitle = folder.title
  }
  return out
}

export async function listActivity(db, { filter, deviceKey, noteKey, limit, cursor }) {
  const want = limit || ACTIVITY_PAGE_SIZE
  const entries = []
  let next = cursor || ''
  for (let page = 0; entries.length < want && page < 20; page++) {
    const ids = await viewStore.activityIdsDescending(db, {
      noteKey,
      cursor: next,
      limit: want * 2
    })
    if (!ids.length) return { entries, cursor: '', hasMore: false }
    next = ids[ids.length - 1]
    for (const id of ids) {
      const entry = await viewStore.getActivityEntry(db, id)
      if (entry && matches(entry, filter, deviceKey)) entries.push(await present(db, entry))
      if (entries.length >= want) break
    }
  }
  return { entries, cursor: next, hasMore: !!next }
}

// An edit entry keeps the text from before its run; the text after it is the
// next edit's "before", or the note as it is now.
export async function activityDiff(db, id) {
  const empty = { id: id || '', before: '', after: '', locked: false, available: false }
  const entry = id ? await viewStore.getActivityEntry(db, id) : null
  const before = entry ? await viewStore.getActivitySnapshot(db, id) : null
  if (!entry || !before) return empty
  const note = await viewStore.getNote(db, entry.targetKey)
  if (note?.sealed) return { ...empty, locked: true }
  let after = null
  for await (const laterId of viewStore.activityIdsForNoteAfter(db, entry.targetKey, id)) {
    const later = await viewStore.getActivitySnapshot(db, laterId)
    if (later) {
      after = later.text || ''
      break
    }
  }
  return {
    id,
    before: before.text || '',
    after: after ?? htmlToActivityText(note?.note || ''),
    locked: !!note?.locked,
    available: true
  }
}

export async function activityStats(db) {
  let count = 0
  let bytes = 0
  let oldestAt = 0
  for await (const { value } of viewStore.activityEntries(db)) {
    count++
    bytes += JSON.stringify(value || {}).length
    if (!oldestAt && value?.at) oldestAt = value.at
  }
  for await (const { value } of viewStore.activitySnapshots(db)) bytes += (value?.text || '').length
  return { count, bytes, oldestAt }
}
