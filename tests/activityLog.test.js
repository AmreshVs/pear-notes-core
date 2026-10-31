import test from 'brittle'
import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'
import NoteBase from '../backend/NoteBase.js'
import * as viewStore from '../backend/viewStore.js'
import {
  ACTIVITY_EVENT,
  ACTIVITY_FILTER,
  ACTIVITY_LOG_ENABLED_KEY,
  ACTIVITY_RETENTION_DAYS_KEY,
  ACTIVITY_SESSION_WINDOW_MS,
  RECENTLY_DELETED_KEY
} from '../constant.js'
import { diffActivityText, getActivityMessage, htmlToActivityText } from '../activity.js'
import { withTestnet } from './helpers/testnet.js'

const encryption = b4a.toString(b4a.alloc(32).fill('activity-test-key'), 'hex')

const getStoragePath = () =>
  path.join(tmpdir(), 'pear-notes-activity-test-' + Math.random().toString(36).substring(7))

const newKey = (prefix) => prefix + Math.random().toString(36).substring(2, 10)

async function withBase(fn) {
  const storage = getStoragePath()
  const base = new NoteBase({ storage, encryption })
  await base.ready()
  try {
    await fn(base)
  } finally {
    await base.destroy().catch(() => {})
    try {
      if (fs.existsSync(storage)) fs.rmSync(storage, { recursive: true, force: true })
    } catch {
      // best effort cleanup
    }
  }
}

async function enableActivity(base, retentionDays = 90) {
  await base.updateSettings({
    settings: {
      [ACTIVITY_LOG_ENABLED_KEY]: true,
      [ACTIVITY_RETENTION_DAYS_KEY]: retentionDays
    }
  })
}

async function putNote(base, key, value) {
  const now = Date.now()
  await base.addNote({
    key,
    value: {
      title: '',
      note: '',
      folderKey: '',
      addedAt: now,
      updatedAt: now,
      locked: false,
      pinned: false,
      deletedAt: 0,
      previousFolderKey: '',
      ...value
    }
  })
}

const NOTE_DEFAULTS = {
  title: '',
  note: '',
  folderKey: '',
  locked: false,
  pinned: false,
  deletedAt: 0,
  previousFolderKey: ''
}

async function appendNoteAt(base, key, value, at) {
  await base.append({
    type: 'add_note',
    key,
    at,
    value: { ...NOTE_DEFAULTS, addedAt: at, updatedAt: at, ...value }
  })
}

const eventsOf = (entries) => entries.map((entry) => entry.event)

test('nothing is recorded while the switch is off', async (t) => {
  await withTestnet(t)
  await withBase(async (base) => {
    const key = newKey('n')
    await putNote(base, key, { title: 'Silent' })
    await putNote(base, key, { title: 'Silent', note: '<p>hello</p>' })

    const { entries } = await base.getActivity({})
    t.is(entries.length, 0, 'no entries recorded')
  })
})

test('note lifecycle produces attributed entries', async (t) => {
  await withTestnet(t)
  await withBase(async (base) => {
    await enableActivity(base)

    const folderKey = newKey('f')
    await base.addFolder({
      key: folderKey,
      value: { title: 'Work', addedAt: Date.now(), updatedAt: Date.now() }
    })

    const key = newKey('n')
    await putNote(base, key, { title: 'Draft' })
    await putNote(base, key, { title: 'Roadmap' })
    await putNote(base, key, { title: 'Roadmap', folderKey })
    await putNote(base, key, { title: 'Roadmap', folderKey, pinned: true })
    await putNote(base, key, { title: 'Roadmap', folderKey, pinned: true, locked: true })

    const { entries } = await base.getActivity({})
    const events = eventsOf(entries)

    t.ok(events.includes(ACTIVITY_EVENT.FOLDER_CREATED), 'folder creation logged')
    t.ok(events.includes(ACTIVITY_EVENT.NOTE_CREATED), 'note creation logged')
    t.absent(
      events.includes(ACTIVITY_EVENT.NOTE_RENAMED),
      'titling a fresh note folds into its creation instead of logging a rename'
    )
    t.is(
      entries.find((entry) => entry.event === ACTIVITY_EVENT.NOTE_CREATED).targetTitle,
      'Roadmap',
      'the creation entry carries the final title'
    )
    t.ok(events.includes(ACTIVITY_EVENT.NOTE_MOVED), 'move logged')
    t.ok(events.includes(ACTIVITY_EVENT.NOTE_PINNED), 'pin logged')
    t.ok(events.includes(ACTIVITY_EVENT.NOTE_LOCKED), 'lock logged')

    const localKey = b4a.toString(base.autobase.local.key, 'hex')
    t.ok(
      entries.every((entry) => entry.device === localKey),
      'every entry is attributed to the writing device'
    )

    const moved = entries.find((entry) => entry.event === ACTIVITY_EVENT.NOTE_MOVED)
    t.is(moved.meta.toFolder, 'Work', 'move records the destination folder name')

    const locked = entries.find((entry) => entry.event === ACTIVITY_EVENT.NOTE_LOCKED)
    t.is(locked.locked, true, 'entries flag a currently locked note')
  })
})

test('trash and restore are distinguished from a move', async (t) => {
  await withTestnet(t)
  await withBase(async (base) => {
    await enableActivity(base)
    const folderKey = newKey('f')
    await base.addFolder({
      key: folderKey,
      value: { title: 'Work', addedAt: Date.now(), updatedAt: Date.now() }
    })

    const key = newKey('n')
    await putNote(base, key, { title: 'Ticket', folderKey })
    await putNote(base, key, { title: 'Ticket', folderKey: RECENTLY_DELETED_KEY })
    await putNote(base, key, { title: 'Ticket', folderKey })

    const { entries } = await base.getActivity({ noteKey: key })
    const events = eventsOf(entries)
    t.ok(events.includes(ACTIVITY_EVENT.NOTE_TRASHED), 'trash logged')
    t.ok(events.includes(ACTIVITY_EVENT.NOTE_RESTORED), 'restore logged')
  })
})

test('consecutive edits coalesce into one session entry', async (t) => {
  await withTestnet(t)
  await withBase(async (base) => {
    await enableActivity(base)
    const key = newKey('n')
    await putNote(base, key, { title: 'Notes' })

    for (let i = 1; i <= 8; i++) {
      await putNote(base, key, { title: 'Notes', note: `<p>line ${i}</p>` })
    }

    const { entries } = await base.getActivity({ noteKey: key })
    const edits = entries.filter((entry) => entry.event === ACTIVITY_EVENT.NOTE_EDITED)

    t.is(edits.length, 1, 'eight saves collapse to a single session')
    t.is(edits[0].ops, 8, 'the session counts every save')
    t.ok(edits[0].lastAt >= edits[0].at, 'the session carries a time range')
    t.ok(edits[0].hasDiff, 'the session has a snapshot to diff against')
  })
})

test('a gap longer than the session window starts a new entry', async (t) => {
  await withTestnet(t)
  await withBase(async (base) => {
    await enableActivity(base)
    const key = newKey('n')
    const start = Date.now()

    await appendNoteAt(base, key, { title: 'Notes' }, start)
    await appendNoteAt(base, key, { title: 'Notes', note: '<p>first</p>' }, start + 1000)
    await appendNoteAt(base, key, { title: 'Notes', note: '<p>first more</p>' }, start + 2000)
    await appendNoteAt(
      base,
      key,
      { title: 'Notes', note: '<p>second</p>' },
      start + ACTIVITY_SESSION_WINDOW_MS + 5000
    )

    const { entries } = await base.getActivity({ noteKey: key })
    const edits = entries.filter((entry) => entry.event === ACTIVITY_EVENT.NOTE_EDITED)
    t.is(edits.length, 2, 'the stale session is not reused')
    t.is(edits[1].ops, 2, 'the first session absorbed both of its saves')
    t.is(edits[0].ops, 1, 'the second session starts fresh')
  })
})

test('the diff walks from one snapshot to the next', async (t) => {
  await withTestnet(t)
  await withBase(async (base) => {
    await enableActivity(base)
    const key = newKey('n')
    const start = Date.now()

    await appendNoteAt(base, key, { title: 'Roadmap' }, start)
    await appendNoteAt(
      base,
      key,
      { title: 'Roadmap', note: '<p>alpha</p><p>beta</p>' },
      start + 1000
    )
    await appendNoteAt(
      base,
      key,
      { title: 'Roadmap', note: '<p>alpha</p><p>gamma</p><p>delta</p>' },
      start + ACTIVITY_SESSION_WINDOW_MS + 5000
    )

    const { entries } = await base.getActivity({ noteKey: key })
    const edits = entries.filter((entry) => entry.event === ACTIVITY_EVENT.NOTE_EDITED)
    t.is(edits.length, 2, 'two sessions recorded')

    const newest = await base.getActivityDiff(edits[0].id)
    t.is(newest.available, true, 'newest session resolves a diff')
    t.is(newest.before, 'alpha\nbeta', 'newest before is the previous snapshot')
    t.is(newest.after, 'alpha\ngamma\ndelta', 'newest after is the current note text')

    const oldest = await base.getActivityDiff(edits[1].id)
    t.is(oldest.before, '', 'first session started from an empty note')
    t.is(oldest.after, 'alpha\nbeta', 'first session ends where the next one starts')

    const counts = diffActivityText(newest.before, newest.after)
    t.is(counts.added, 2, 'two lines added')
    t.is(counts.removed, 1, 'one line removed')
  })
})

test('attachments are logged by name', async (t) => {
  await withTestnet(t)
  await withBase(async (base) => {
    await enableActivity(base)
    const key = newKey('n')
    await putNote(base, key, { title: 'Shots' })
    await putNote(base, key, {
      title: 'Shots',
      note: '<div data-file-attachment filename="whiteboard.jpg" filetype="image/jpeg"></div>'
    })

    const { entries } = await base.getActivity({ noteKey: key })
    const attachment = entries.find((entry) => entry.event === ACTIVITY_EVENT.NOTE_ATTACHMENT_ADDED)
    t.ok(attachment, 'attachment addition logged')
    t.is(attachment.meta.fileName, 'whiteboard.jpg', 'file name captured')
    t.is(attachment.meta.kind, 'image', 'attachment kind captured')
  })
})

test('deleting a note removes its history and snapshots', async (t) => {
  await withTestnet(t)
  await withBase(async (base) => {
    await enableActivity(base)
    const key = newKey('n')
    await putNote(base, key, { title: 'Secret' })
    await putNote(base, key, { title: 'Secret', note: '<p>sensitive</p>' })

    const before = await base.getActivity({ noteKey: key })
    t.ok(before.entries.length > 0, 'history exists before deletion')

    await base.removeNote(key)

    const after = await base.getActivity({ noteKey: key })
    t.is(after.entries.length, 0, 'per-note history is gone')

    const db = await base.autobaseDb()
    let snapshots = 0
    for await (const item of viewStore.activitySnapshots(db)) {
      if (item) snapshots++
    }
    t.is(snapshots, 0, 'no snapshot survives the delete')

    const { entries } = await base.getActivity({})
    t.ok(
      entries.some((entry) => entry.event === ACTIVITY_EVENT.NOTE_DELETED),
      'the deletion itself is still logged'
    )
  })
})

test('filters narrow the timeline', async (t) => {
  await withTestnet(t)
  await withBase(async (base) => {
    await enableActivity(base)
    const folderKey = newKey('f')
    await base.addFolder({
      key: folderKey,
      value: { title: 'Work', addedAt: Date.now(), updatedAt: Date.now() }
    })
    await putNote(base, newKey('n'), { title: 'A' })

    const folders = await base.getActivity({ filter: ACTIVITY_FILTER.FOLDERS })
    t.ok(
      folders.entries.every((entry) => entry.targetKind === 'folder'),
      'folder filter returns only folder events'
    )

    const notes = await base.getActivity({ filter: ACTIVITY_FILTER.NOTES })
    t.ok(
      notes.entries.every((entry) => entry.targetKind === 'note'),
      'note filter returns only note events'
    )

    const other = await base.getActivity({ deviceKey: 'deadbeef' })
    t.is(other.entries.length, 0, 'filtering by another device returns nothing')
  })
})

test('retention prunes entries older than the cutoff', async (t) => {
  await withTestnet(t)
  await withBase(async (base) => {
    await enableActivity(base, 7)
    const key = newKey('n')
    await putNote(base, key, { title: 'Old' })

    const db = await base.autobaseDb()
    const stale = []
    for await (const item of viewStore.activityEntries(db)) {
      stale.push(item)
    }
    t.ok(stale.length > 0, 'entries exist before pruning')

    const future = Date.now() + 8 * 24 * 60 * 60 * 1000
    await base.pruneActivity(future)

    const { entries } = await base.getActivity({})
    t.is(entries.length, 0, 'everything older than the cutoff is pruned')
  })
})

test('clearing removes every activity key', async (t) => {
  await withTestnet(t)
  await withBase(async (base) => {
    await enableActivity(base)
    const key = newKey('n')
    await putNote(base, key, { title: 'Temp' })
    await putNote(base, key, { title: 'Temp', note: '<p>body</p>' })

    await base.clearActivity()

    const { entries } = await base.getActivity({})
    t.is(entries.length, 0, 'timeline is empty')

    const db = await base.autobaseDb()
    let leftovers = 0
    for (const collection of [
      '@notes/activity',
      '@notes/activitySnapshots',
      '@notes/activityDiscarded',
      '@notes/activitySessions',
      '@notes/activityTitleSessions'
    ]) {
      for await (const item of db.find(collection, {})) {
        if (item) leftovers++
      }
    }
    leftovers += (await viewStore.activityIdsForNote(db, key)).length
    t.is(leftovers, 0, 'no activity keys remain')
  })
})

test('recording stays deterministic across a replay', async (t) => {
  await withTestnet(t)
  await withBase(async (base) => {
    await enableActivity(base)
    const key = newKey('n')
    await putNote(base, key, { title: 'Deterministic' })
    await putNote(base, key, { title: 'Deterministic', note: '<p>one</p>' })

    const db = await base.autobaseDb()
    const snapshot = []
    for await (const item of viewStore.activityEntries(db)) {
      snapshot.push(JSON.stringify(item.value))
    }

    const replay = []
    for await (const item of viewStore.activityEntries(db)) {
      replay.push(JSON.stringify(item.value))
    }

    t.alike(replay, snapshot, 'entries are byte-identical on re-read')
    t.ok(
      snapshot.every((line) => !line.includes('"at":0')),
      'every entry carries a payload timestamp'
    )
  })
})

test('text extraction keeps structure and names attachments', (t) => {
  const text = htmlToActivityText(
    '<h1>Title</h1><p>First</p><ul><li>one</li><li>two</li></ul>' +
      '<img src="http://hyperdrive/x?key=a&blob=b&name=shot.png">'
  )
  t.is(text, 'Title\nFirst\n- one\n- two\n\n[image: shot.png]', 'structure preserved')
})

test('typing a title on a new note produces exactly one entry', async (t) => {
  await withTestnet(t)
  await withBase(async (base) => {
    await enableActivity(base)
    const key = newKey('n')

    await putNote(base, key, { title: '' })
    for (const title of ['A', 'Ac', 'Act', 'Acti', 'Activ', 'Active']) {
      await putNote(base, key, { title })
    }

    const { entries } = await base.getActivity({ noteKey: key })
    t.is(entries.length, 1, 'six keystrokes plus the creation collapse to one entry')
    t.is(entries[0].event, ACTIVITY_EVENT.NOTE_CREATED, 'the surviving entry is the creation')
    t.is(entries[0].targetTitle, 'Active', 'it carries the final title')
  })
})

test('renaming an existing note coalesces into one entry', async (t) => {
  await withTestnet(t)
  await withBase(async (base) => {
    await enableActivity(base)
    const key = newKey('n')
    const start = Date.now()

    await appendNoteAt(base, key, { title: 'Active' }, start)
    const later = start + ACTIVITY_SESSION_WINDOW_MS + 5000
    for (const [index, title] of ['Active t', 'Active te', 'Active test'].entries()) {
      await appendNoteAt(base, key, { title }, later + index * 500)
    }

    const { entries } = await base.getActivity({ noteKey: key })
    const renames = entries.filter((entry) => entry.event === ACTIVITY_EVENT.NOTE_RENAMED)

    t.is(renames.length, 1, 'three keystrokes collapse to one rename')
    t.is(renames[0].meta.from, 'Active', 'the original title is preserved as the from side')
    t.is(renames[0].meta.to, 'Active test', 'the latest title is the to side')
  })
})

test('renaming back to the original leaves no entry behind', async (t) => {
  await withTestnet(t)
  await withBase(async (base) => {
    await enableActivity(base)
    const key = newKey('n')
    const start = Date.now()

    await appendNoteAt(base, key, { title: 'Active' }, start)
    const later = start + ACTIVITY_SESSION_WINDOW_MS + 5000
    await appendNoteAt(base, key, { title: 'Activex' }, later)
    await appendNoteAt(base, key, { title: 'Active' }, later + 500)

    const { entries } = await base.getActivity({ noteKey: key })
    const renames = entries.filter((entry) => entry.event === ACTIVITY_EVENT.NOTE_RENAMED)
    t.is(renames.length, 0, 'a rename that ends where it started is discarded')
  })
})

test('two entries from one op do not collide', async (t) => {
  await withTestnet(t)
  await withBase(async (base) => {
    await enableActivity(base)
    const folderKey = newKey('f')
    await base.addFolder({
      key: folderKey,
      value: { title: 'Work', addedAt: Date.now(), updatedAt: Date.now() }
    })

    const key = newKey('n')
    const at = Date.now()
    await appendNoteAt(base, key, { title: 'One' }, at)
    await appendNoteAt(
      base,
      key,
      { title: 'One', folderKey, pinned: true, locked: true, note: '<p>body</p>' },
      at + ACTIVITY_SESSION_WINDOW_MS + 5000
    )

    const { entries } = await base.getActivity({ noteKey: key })
    const events = eventsOf(entries)
    t.ok(events.includes(ACTIVITY_EVENT.NOTE_MOVED), 'move survived')
    t.ok(events.includes(ACTIVITY_EVENT.NOTE_PINNED), 'pin survived')
    t.ok(events.includes(ACTIVITY_EVENT.NOTE_LOCKED), 'lock survived')
    t.ok(events.includes(ACTIVITY_EVENT.NOTE_EDITED), 'edit survived')
    t.is(new Set(entries.map((entry) => entry.id)).size, entries.length, 'every id is unique')
  })
})

test('a blob attachment with no filename records its kind instead of the host', async (t) => {
  await withTestnet(t)
  await withBase(async (base) => {
    await enableActivity(base)
    const key = newKey('n')
    await putNote(base, key, { title: 'Shots' })
    await putNote(base, key, {
      title: 'Shots',
      note: '<img src="http://hyperdrive/?key=abc&blob=xyz&type=image%2Fjpeg">'
    })

    const { entries } = await base.getActivity({ noteKey: key })
    const attachment = entries.find((entry) => entry.event === ACTIVITY_EVENT.NOTE_ATTACHMENT_ADDED)
    t.ok(attachment, 'attachment logged')
    t.is(attachment.meta.fileName, '', 'no bogus filename is invented from the URL host')
    t.is(attachment.meta.kind, 'image', 'the kind is still recorded for a readable label')
  })
})

test('resolved attachment urls do not fake a content change', async (t) => {
  await withTestnet(t)
  await withBase(async (base) => {
    await enableActivity(base)
    const key = newKey('n')
    const start = Date.now()

    const stored = '<p>body</p><img src="http://hyperdrive/?key=abc&blob=xyz">'
    const resolved = '<p>body</p><img src="http://127.0.0.1:5001/?key=abc&blob=xyz">'

    await appendNoteAt(base, key, { title: 'Media', note: stored }, start)

    const later = start + ACTIVITY_SESSION_WINDOW_MS + 5000
    await appendNoteAt(base, key, { title: 'Media', note: resolved }, later)

    const { entries } = await base.getActivity({ noteKey: key })
    const edits = entries.filter((entry) => entry.event === ACTIVITY_EVENT.NOTE_EDITED)
    t.is(
      edits.length,
      0,
      'the same content sent with a device-resolved url is not logged as an edit'
    )
  })
})

test('the short message form still interpolates its values', (t) => {
  const strings = {
    'activity.events.note.attachment_added': 'attached {{fileName}} to {{target}}',
    'activity.eventsShort.note.attachment_added': 'attached {{fileName}}',
    'activity.events.note.renamed': 'renamed {{from}} to {{to}}',
    'activity.eventsShort.note.renamed': 'renamed this note from {{from}} to {{to}}',
    'activity.attachmentKinds.image': 'an image',
    'activity.untitledNote': 'Untitled'
  }
  const translate = (key, options = {}) => {
    let value = strings[key]
    if (value === undefined) return options.defaultValue !== undefined ? options.defaultValue : key
    for (const [name, replacement] of Object.entries(options)) {
      value = value.split(`{{${name}}}`).join(String(replacement))
    }
    return value
  }

  const attachment = {
    event: 'note.attachment_added',
    targetTitle: 'Baba',
    meta: { kind: 'image' }
  }
  const renamed = { event: 'note.renamed', targetTitle: 'Baba', meta: { from: 'Bab', to: 'Baba' } }

  t.is(
    getActivityMessage(attachment, translate, { showTarget: false }),
    'attached an image',
    'the note-history form substitutes fileName instead of printing {{fileName}}'
  )
  t.is(
    getActivityMessage(attachment, translate, { showTarget: true }),
    'attached an image to Baba',
    'the timeline form substitutes both values'
  )
  t.is(
    getActivityMessage(renamed, translate, { showTarget: false }),
    'renamed this note from Bab to Baba',
    'rename placeholders are substituted in the short form too'
  )
})

test('an entry recorded before the filename fix no longer prints the url host', (t) => {
  const strings = {
    'activity.events.note.attachment_added': 'attached {{fileName}} to {{target}}',
    'activity.eventsShort.note.attachment_added': 'attached {{fileName}}',
    'activity.attachmentKinds.image': 'an image'
  }
  const translate = (key, options = {}) => {
    let value = strings[key]
    if (value === undefined) return options.defaultValue !== undefined ? options.defaultValue : key
    for (const [name, replacement] of Object.entries(options)) {
      value = value.split(`{{${name}}}`).join(String(replacement))
    }
    return value
  }

  const legacy = {
    event: 'note.attachment_added',
    targetTitle: 'Baba',
    meta: { kind: 'image', fileName: 'hyperdrive' }
  }

  t.is(
    getActivityMessage(legacy, translate, { showTarget: false }),
    'attached an image',
    'the stale hyperdrive host is replaced by the attachment kind at render time'
  )
  t.is(
    getActivityMessage({ ...legacy, meta: { kind: 'image', fileName: 'photo.png' } }, translate, {
      showTarget: false
    }),
    'attached photo.png',
    'a real filename is still shown'
  )
})
