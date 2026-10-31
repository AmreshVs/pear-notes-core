import test from 'brittle'
import { ALL_NOTES_KEY, RECENTLY_DELETED_KEY } from '../constant.js'
import {
  NoteSearchIndex,
  buildSnippet,
  findTermRanges,
  foldText,
  parseSearchQuery,
  toHighlightSegments,
  toSearchText
} from '../backend/noteSearch.js'
import { decode, encode } from '../spec/hyperschema/index.js'

const SEARCH_RESPONSE = '@notes/command-search-notes-response'
const searchNotesWire = (value) => decode(SEARCH_RESPONSE, encode(SEARCH_RESPONSE, value))

const FOLDER = 'folder-recipes'
const OTHER = 'folder-work'

const note = (key, title, html, extra = {}) => ({
  key,
  value: { title, note: html, folderKey: FOLDER, updatedAt: 1, version: 1, ...extra }
})

async function warmIndex(notes) {
  const index = new NoteSearchIndex({ chunkSize: 2 })
  await index.ensureWarm(async () => notes)
  return index
}

const keys = (found) => found.results.map((r) => r.key).sort()

test('fold keeps one code unit per input code unit', (t) => {
  for (const text of ['Café Résumé', 'İstanbul', 'Straße', 'ﬁle', 'naïve 東京 😀', 'ÅNGSTRÖM']) {
    t.is(foldText(text).length, text.length, text)
  }
  t.is(foldText('Café RÉSUMÉ'), 'cafe resume')
  t.is(foldText('İstanbul'), 'istanbul')
})

test('html becomes searchable text with block breaks, entities and attachment names', (t) => {
  const html =
    '<h1>Trip</h1><p>Fish&amp;chips&nbsp;at 7</p><ul><li><p>milk</p></li><li><p>eggs</p></li></ul>' +
    '<div data-file-attachment="" filename="Invoice March.pdf" url="hyperdrive://x"></div>' +
    '<p><img src="http://hyperdrive/secret-url.png">done</p>'
  const text = toSearchText(html)
  t.is(text, 'Trip Fish&chips at 7 milk eggs Invoice March.pdf done')
  t.absent(text.includes('secret-url'))
})

test('query parsing splits terms, keeps quoted phrases and folds them', (t) => {
  t.alike(parseSearchQuery('  Garlic   "Olive OIL" garlic '), ['garlic', 'olive oil'])
  t.alike(parseSearchQuery(''), [])
  t.alike(parseSearchQuery('"  "'), [])
})

test('every term must match, across title and body', async (t) => {
  const index = await warmIndex([
    note('a', 'Weeknight pasta', '<p>crush two cloves of garlic in olive oil</p>'),
    note('b', 'Garlic confit', '<p>Peel 3 heads, cover with oil</p>'),
    note('c', 'Shopping', '<p>tomatoes, basil</p>')
  ])
  t.alike(keys(index.search({ query: 'garlic' })), ['a', 'b'])
  t.alike(keys(index.search({ query: 'garlic oil' })), ['a', 'b'])
  t.alike(keys(index.search({ query: 'garlic basil' })), [])
  t.alike(keys(index.search({ query: '"olive oil"' })), ['a'])
  const titleHit = index.search({ query: 'confit' }).results[0]
  t.ok(titleHit.inTitle)
  t.is(titleHit.snippet, '')
})

test('accent, case, partial word and CJK matching', async (t) => {
  const index = await warmIndex([
    note('a', 'Résumé', '<p>Rendez-vous au CAFÉ à 9h</p>'),
    note('b', 'Japan', '<p>arrive 東京 station 14:20</p>')
  ])
  t.alike(keys(index.search({ query: 'cafe' })), ['a'])
  t.alike(keys(index.search({ query: 'RESUME' })), ['a'])
  t.alike(keys(index.search({ query: 'stat' })), ['b'])
  t.alike(keys(index.search({ query: '東' })), ['b'])
})

test('a one-letter latin query only matches titles', async (t) => {
  const index = await warmIndex([note('a', 'Xylophone', '<p>zebra</p>')])
  t.alike(keys(index.search({ query: 'x' })), ['a'])
  t.alike(keys(index.search({ query: 'z' })), [])
})

test('folder scope and trash', async (t) => {
  const index = await warmIndex([
    note('a', 'One', '<p>shared word</p>'),
    note('b', 'Two', '<p>shared word</p>', { folderKey: OTHER }),
    note('c', 'Three', '<p>shared word</p>', { folderKey: RECENTLY_DELETED_KEY })
  ])
  t.alike(keys(index.search({ query: 'shared', folderKey: ALL_NOTES_KEY })), ['a', 'b'])
  t.alike(keys(index.search({ query: 'shared', folderKey: FOLDER })), ['a'])
  t.alike(keys(index.search({ query: 'shared', folderKey: RECENTLY_DELETED_KEY })), ['c'])
})

test('locked note bodies only match when the lock session is open', async (t) => {
  const index = await warmIndex([
    note('a', 'Dentist claim', '<p>policy number 4411</p>', { locked: true })
  ])
  t.alike(keys(index.search({ query: '4411' })), [])
  const titleOnly = index.search({ query: 'dentist' })
  t.alike(keys(titleOnly), ['a'])
  t.is(titleOnly.results[0].snippet, '', 'no body text leaks into a locked result')
  const unlocked = index.search({ query: '4411', includeLocked: true })
  t.alike(keys(unlocked), ['a'])
  t.ok(unlocked.results[0].snippet.includes('4411'))
})

test('snippet ranges point at the matches in the snippet', (t) => {
  const text = 'A '.repeat(200) + 'Crush the Garlic now and more garlic later ' + 'B '.repeat(200)
  const { snippet, ranges } = buildSnippet(text, foldText(text), ['garlic'])
  t.ok(snippet.startsWith('…') && snippet.endsWith('…'))
  t.is(ranges.length, 2)
  for (const [from, to] of ranges) t.is(snippet.slice(from, to).toLowerCase(), 'garlic')
})

test('sync re-folds changed notes, keeps unchanged ones and drops deleted ones', async (t) => {
  const a = note('a', 'Alpha', '<p>old text</p>')
  const b = note('b', 'Beta', '<p>beta text</p>')
  const index = await warmIndex([a, b])
  const kept = index.entries.get('b')
  index.sync([
    note('a', 'Alpha', '<p>new words</p>', { version: 2, updatedAt: 2 }),
    { key: 'b', value: { ...b.value, folderKey: OTHER } }
  ])
  t.is(index.entries.get('b'), kept, 'an unchanged note is not rebuilt')
  t.is(kept.folderKey, OTHER, 'a move is still picked up')
  t.alike(keys(index.search({ query: 'new' })), ['a'])
  t.alike(keys(index.search({ query: 'old' })), [])
  index.sync([a])
  t.is(index.size, 1)
})

test('a sync that lands while the index builds is applied after it', async (t) => {
  const index = new NoteSearchIndex({ chunkSize: 1 })
  let release
  const gate = new Promise((resolve) => (release = resolve))
  const building = index.ensureWarm(async () => {
    await gate
    return [note('a', 'First', '<p>one</p>'), note('b', 'Second', '<p>two</p>')]
  })
  index.sync([note('c', 'Third', '<p>three</p>')])
  release()
  await building
  t.alike(keys(index.search({ query: 'three' })), ['c'])
})

test('clear during a build discards it, and nothing searches until warmed again', async (t) => {
  const index = new NoteSearchIndex()
  const building = index.ensureWarm(async () => [note('a', 'A', '<p>alpha</p>')])
  index.clear()
  t.is(await building, false)
  t.is(index.size, 0)
  index.sync([note('a', 'A', '<p>alpha</p>')])
  t.is(index.size, 0, 'a cold index ignores reads')
})

test('results respect the limit but report the total', async (t) => {
  const notes = Array.from({ length: 5 }, (_, i) => note('k' + i, 'N' + i, '<p>common</p>'))
  const index = await warmIndex(notes)
  const found = index.search({ query: 'common', limit: 2 })
  t.is(found.results.length, 2)
  t.is(found.total, 5)
})

test('search results survive the wire round trip', (t) => {
  const response = {
    query: 'garlic',
    results: [
      { key: 'a', inTitle: false, snippet: '…two garlic cloves…', ranges: [5, 11] },
      { key: 'b', inTitle: true, snippet: '', ranges: [] }
    ],
    total: 2,
    tookMs: 1,
    failed: false
  }
  const decoded = searchNotesWire(response)
  t.is(decoded.query, 'garlic')
  t.alike(decoded.results[0].ranges, [5, 11])
  t.is(decoded.results[1].inTitle, true)
  t.is(decoded.total, 2)
  t.is(searchNotesWire({ ...response, query: '' }).query || '', '')
})

test('highlight segments for titles and snippets', (t) => {
  const ranges = findTermRanges('Garlic and more GARLIC', ['garlic'])
  t.alike(ranges, [0, 6, 16, 22])
  t.alike(toHighlightSegments('Garlic and more GARLIC', ranges), [
    { text: 'Garlic', match: true },
    { text: ' and more ', match: false },
    { text: 'GARLIC', match: true }
  ])
  t.alike(toHighlightSegments('plain', []), [{ text: 'plain', match: false }])
  t.alike(toHighlightSegments('ab', [1, 99]), [
    { text: 'a', match: false },
    { text: 'b', match: true }
  ])
})

test('smart quotes from phone keyboards act like straight quotes', async (t) => {
  t.alike(parseSearchQuery('“olive oil” garlic'), ['olive oil', 'garlic'])
  t.alike(parseSearchQuery('“unfinished phrase'), ['unfinished', 'phrase'])
  const index = await warmIndex([note('a', 'Plans', "<p>don't forget the olive oil</p>")])
  t.alike(keys(index.search({ query: 'don’t' })), ['a'])
  t.alike(keys(index.search({ query: '“olive oil”' })), ['a'])
})

test('snippets never split a surrogate pair', (t) => {
  const emoji = '😀'
  const text = emoji.repeat(120) + ' needle ' + emoji.repeat(120)
  const { snippet } = buildSnippet(text, foldText(text), ['needle'])
  const body = snippet.replace(/^…|…$/g, '')
  t.absent(/^[\udc00-\udfff]/.test(body), 'no orphan low surrogate at the start')
  t.absent(/[\ud800-\udbff]$/.test(body), 'no orphan high surrogate at the end')
})

test('a search that lands while the index is cleared rebuilds instead of answering empty', async (t) => {
  const index = new NoteSearchIndex()
  const notes = [note('a', 'A', '<p>alpha</p>')]
  const first = index.ensureWarm(async () => notes)
  index.clear()
  t.is(await first, false)
  t.ok(await index.ensureWarm(async () => notes))
  t.alike(keys(index.search({ query: 'alpha' })), ['a'])
})

test('note writes arriving mid-build replay after it', async (t) => {
  const index = new NoteSearchIndex()
  let release
  const building = index.ensureWarm(async () => {
    await new Promise((resolve) => (release = resolve))
    return [note('a', 'A', '<p>alpha</p>'), note('b', 'B', '<p>beta</p>')]
  })
  index.apply([
    { key: 'a', value: note('a', 'A', '<p>alpha gamma</p>', { updatedAt: 9 }).value },
    { key: 'b', value: null }
  ])
  release()
  await building
  t.alike(keys(index.search({ query: 'gamma' })), ['a'], 'the newer body replaced the build read')
  t.alike(keys(index.search({ query: 'beta' })), [], 'the delete replayed too')
})

test('note writes apply in place once warm, and are ignored while cold', async (t) => {
  const index = new NoteSearchIndex()
  index.apply([{ key: 'x', value: note('x', 'X', '<p>cold</p>').value }])
  t.is(index.size, 0, 'nothing indexed before a build')

  await index.ensureWarm(async () => [note('a', 'A', '<p>alpha</p>')])
  index.apply([{ key: 'c', value: note('c', 'C', '<p>alpha again</p>').value }])
  t.alike(keys(index.search({ query: 'alpha' })), ['a', 'c'])
  index.apply([{ key: 'a', value: null }])
  t.alike(keys(index.search({ query: 'alpha' })), ['c'])
})

test('upcoming lists dated tasks from visible notes and follows edits', async (t) => {
  const at = new Date(2026, 9, 10, 9).getTime()
  const note = (key, html, extra = {}) => ({
    key,
    value: { title: key, note: html, updatedAt: at, version: 1, folderKey: '', ...extra }
  })
  const index = new NoteSearchIndex({ chunkSize: 2 })
  await index.ensureWarm(async () => [
    note('a', '<p>Call Sam Friday 5pm</p>'),
    note('b', '<p>Pay rent tomorrow</p>', { locked: true }),
    note('c', '<p>Book dentist tomorrow</p>', { folderKey: RECENTLY_DELETED_KEY })
  ])
  t.alike(
    index.upcoming().map((task) => [task.noteKey, task.date, task.time]),
    [['a', '2026-10-16', '17:00']]
  )
  index.apply([note('a', '<p>Called Sam already</p>', { version: 2 })])
  t.alike(index.upcoming(), [])
  index.clear()
})

test('a sealed note indexes its title and envelope links only', async (t) => {
  const link = 'http://hyperdrive/?key=abc&blob=1-2-3-4'
  const sealed = JSON.stringify({ v: 1, r: 'ring', k: 'key', b: 'body', links: [link] })
  const index = await warmIndex([
    note('s', 'Plans', '', { sealed, locked: true }),
    note('p', 'Open', '<p>plans for saffron</p><ul data-type="taskList"></ul>')
  ])
  t.alike(keys(index.search({ query: 'plans', includeLocked: true })), ['p', 's'], 'title matches')
  t.alike(keys(index.search({ query: 'ring', includeLocked: true })), [], 'envelope not searched')
  const entry = index.entries.get('s')
  t.alike(
    entry.attachments.map((item) => item.url),
    [link],
    'attachments come from the envelope'
  )
  t.alike(entry.tasks, [], 'no tasks')
  const resealed = JSON.stringify({ v: 1, r: 'ring', k: 'key', b: 'body2', links: [] })
  index.apply([note('s', 'Plans', '', { sealed: resealed, locked: true, version: 2 })])
  t.alike(index.entries.get('s').attachments, [], 'a re-sealed envelope re-indexes')
  index.clear()
})
