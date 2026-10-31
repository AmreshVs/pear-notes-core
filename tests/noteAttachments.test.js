import test from 'brittle'
import { ALL_NOTES_KEY, RECENTLY_DELETED_KEY } from '../constant.js'
import { NoteSearchIndex } from '../backend/noteSearch.js'
import {
  ATTACHMENT_GROUP,
  ATTACHMENT_KIND,
  getNoteAttachments,
  groupAttachments
} from '../store/services/noteAttachments.js'
import { decode, encode } from '../spec/hyperschema/index.js'

const BODY =
  '<p>Trip</p><img src="http://hyperdrive/?key=k&amp;blob=img1" alt="beach.jpg">' +
  '<div data-file-attachment="" filename="Invoice &amp; tax.pdf" filesize="2048" filetype="application/pdf" url="http://hyperdrive/?key=k&amp;blob=pdf1"></div>' +
  '<div data-file-attachment="" filename="scan.png" filesize="10" filetype="image/png" url="http://hyperdrive/?key=k&amp;blob=png1"></div>' +
  '<div data-audio-attachment="" filename="Standup" duration="62" url="http://hyperdrive/?key=k&amp;blob=aud1"></div>' +
  '<div data-file-attachment="" filename="Budget.xlsx" filesize="88" filetype="application/vnd.ms-excel" url="http://hyperdrive/?key=k&amp;blob=xls1"></div>' +
  '<img src="http://hyperdrive/?key=k&amp;blob=img1"><img src="data:image/png;base64,AAAA">'

test('every attachment kind is found once, in document order, with attributes decoded', (t) => {
  const found = getNoteAttachments(BODY)
  t.alike(
    found.map((item) => [item.kind, item.fileName, item.size]),
    [
      [ATTACHMENT_KIND.PHOTO, 'beach.jpg', 0],
      [ATTACHMENT_KIND.PDF, 'Invoice & tax.pdf', 2048],
      [ATTACHMENT_KIND.PHOTO, 'scan.png', 10],
      [ATTACHMENT_KIND.AUDIO, 'Standup', 0],
      [ATTACHMENT_KIND.FILE, 'Budget.xlsx', 88]
    ]
  )
  t.is(found[0].url, 'http://hyperdrive/?key=k&blob=img1')
  t.is(found[3].duration, 62)
  t.alike(getNoteAttachments(''), [])
})

const item = (fileName, kind, extra = {}) => ({
  url: `u-${fileName}`,
  fileName,
  kind,
  size: 100,
  noteKey: 'n',
  title: 'Note',
  folderKey: 'work',
  updatedAt: 1,
  ...extra
})

test('grouping by folder orders sections by their newest item and files newest first', (t) => {
  const items = [
    item('old.pdf', ATTACHMENT_KIND.PDF, { updatedAt: 1 }),
    item('new.pdf', ATTACHMENT_KIND.PDF, { updatedAt: 5 }),
    item('pic.jpg', ATTACHMENT_KIND.PHOTO, { folderKey: 'receipts', updatedAt: 9 }),
    item('gone.pdf', ATTACHMENT_KIND.PDF, { folderKey: 'deleted-folder', updatedAt: 3 }),
    item('loose.pdf', ATTACHMENT_KIND.PDF, { folderKey: ALL_NOTES_KEY, updatedAt: 2, local: false })
  ]
  const grouped = groupAttachments(items, {
    folders: ['work', 'receipts'],
    allNotesKey: ALL_NOTES_KEY
  })
  t.alike(
    grouped.sections.map((s) => [s.key, s.count]),
    [
      ['receipts', 1],
      ['work', 2],
      ['', 2]
    ]
  )
  t.alike(
    grouped.sections[1].files.map((f) => f.fileName),
    ['new.pdf', 'old.pdf']
  )
  t.is(grouped.sections[0].photos.length, 1)
  t.is(grouped.total, 5)
  t.is(grouped.bytes, 500)
  t.is(grouped.missing, 1)
})

test('search narrows counts; the kind filter narrows sections but not counts', (t) => {
  const items = [
    item('Invoice.pdf', ATTACHMENT_KIND.PDF),
    item('photo.jpg', ATTACHMENT_KIND.PHOTO, { title: 'Invoice trip' }),
    item('song.m4a', ATTACHMENT_KIND.AUDIO)
  ]
  const grouped = groupAttachments(items, {
    query: 'INVOICE',
    kind: ATTACHMENT_KIND.PDF,
    folders: ['work']
  })
  t.is(grouped.counts.all, 2)
  t.is(grouped.counts.pdf, 1)
  t.is(grouped.counts.photo, 1)
  t.is(grouped.counts.audio, 0)
  t.alike(
    grouped.sections.flatMap((s) => s.files.map((f) => f.fileName)),
    ['Invoice.pdf']
  )
})

test('grouping by type and by month', (t) => {
  const oct = new Date(2026, 9, 3).getTime()
  const sep = new Date(2026, 8, 20).getTime()
  const items = [
    item('a.zip', ATTACHMENT_KIND.FILE, { updatedAt: sep }),
    item('b.jpg', ATTACHMENT_KIND.PHOTO, { updatedAt: oct }),
    item('c.pdf', ATTACHMENT_KIND.PDF, { updatedAt: sep })
  ]
  t.alike(
    groupAttachments(items, { by: ATTACHMENT_GROUP.TYPE }).sections.map((s) => s.key),
    [ATTACHMENT_KIND.PHOTO, ATTACHMENT_KIND.PDF, ATTACHMENT_KIND.FILE]
  )
  t.alike(
    groupAttachments(items, { by: ATTACHMENT_GROUP.MONTH }).sections.map((s) => s.key),
    ['2026-10', '2026-09']
  )
})

test('index lists attachments from visible notes with sizes and follows edits', async (t) => {
  const note = (key, html, extra = {}) => ({
    key,
    value: { title: key, note: html, updatedAt: 7, version: 1, folderKey: 'work', ...extra }
  })
  const index = new NoteSearchIndex({
    chunkSize: 2,
    sizeOf: (url) => (url.endsWith('img1') ? 4096 : 0)
  })
  await index.ensureWarm(async () => [
    note('a', BODY),
    note('b', BODY, { locked: true }),
    note('c', BODY, { folderKey: RECENTLY_DELETED_KEY })
  ])
  const items = index.attachments()
  t.is(items.length, 5)
  t.alike(
    items.map((i) => i.size),
    [4096, 2048, 10, 0, 88]
  )
  t.alike(
    [items[0].noteKey, items[0].title, items[0].folderKey, items[0].updatedAt],
    ['a', 'a', 'work', 7]
  )
  index.apply([note('a', '<p>nothing</p>', { version: 2 })])
  t.alike(index.attachments(), [])
  index.clear()
})

test('attachments response survives the wire', (t) => {
  const name = '@notes/command-attachments-response'
  const value = { items: JSON.stringify([{ url: 'x' }]), ok: true, count: 3 }
  t.alike(decode(name, encode(name, value)), value)
})
