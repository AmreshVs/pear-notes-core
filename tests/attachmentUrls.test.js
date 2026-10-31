import test from 'brittle'
import { normalizeAttachmentUrls, HYPERDRIVE_URL_PREFIX } from '../constant.js'

const maxSlashRun = (value) => Math.max(0, ...(value.match(/\/{2,}/g) ?? []).map((s) => s.length))

test('normalizeAttachmentUrls - strips resolved loopback address to prefix form', (t) => {
  const resolved =
    'http://127.0.0.1:59761///?key=abc&blob=eyJ4IjoxfQ&type=application%2Foctet-stream'
  const normalized = normalizeAttachmentUrls(resolved)

  t.is(
    normalized,
    `${HYPERDRIVE_URL_PREFIX}/?key=abc&blob=eyJ4IjoxfQ&type=application%2Foctet-stream`
  )
  t.absent(normalized.includes('127.0.0.1'), 'no loopback address persists')
  t.is(maxSlashRun(normalized), 2, 'only the scheme // remains')
})

test('normalizeAttachmentUrls - collapses runaway slash runs and is idempotent', (t) => {
  const nasty = 'http://127.0.0.1:1' + '/'.repeat(418) + '?key=k&blob=b'
  const once = normalizeAttachmentUrls(nasty)
  const twice = normalizeAttachmentUrls(once)

  t.is(once, twice, 'idempotent')
  t.is(maxSlashRun(once), 2, 'slash run collapsed back to the scheme //')
})

test('normalizeAttachmentUrls - leaves the prefix form and user links untouched', (t) => {
  const prefix = `${HYPERDRIVE_URL_PREFIX}/?key=abc&blob=zzz`
  t.is(normalizeAttachmentUrls(prefix), prefix, 'already-prefixed links unchanged')

  const html =
    '<img src="http://localhost:8080/?key=k&blob=b"> and ' +
    '<a href="https://example.com/page?key=x">link</a>'
  t.is(
    normalizeAttachmentUrls(html),
    `<img src="${HYPERDRIVE_URL_PREFIX}/?key=k&blob=b"> and ` +
      '<a href="https://example.com/page?key=x">link</a>',
    'only blob-server links (?key=...&blob=) are rewritten'
  )
})

test('normalizeAttachmentUrls - passes through non-strings', (t) => {
  t.is(normalizeAttachmentUrls(undefined), undefined)
  t.is(normalizeAttachmentUrls(null), null)
})

test('normalizeAttachmentUrls - handles HTML-escaped &amp;blob separators', (t) => {
  const corrupted = `<img src="${HYPERDRIVE_URL_PREFIX}//////?key=abc&amp;blob=xyz">`
  t.is(
    normalizeAttachmentUrls(corrupted),
    `<img src="${HYPERDRIVE_URL_PREFIX}/?key=abc&amp;blob=xyz">`,
    'escaped-entity links are healed, not skipped'
  )

  const resolved = '<img src="http://127.0.0.1:49833/////?key=abc&amp;blob=xyz">'
  t.is(
    normalizeAttachmentUrls(resolved),
    `<img src="${HYPERDRIVE_URL_PREFIX}/?key=abc&amp;blob=xyz">`,
    'resolved escaped-entity links collapse to the prefix form'
  )
})

test('normalizeAttachmentUrls - survives repeated address round-trips', (t) => {
  const address = 'http://127.0.0.1:49833'
  let stored = `<img src="${HYPERDRIVE_URL_PREFIX}/?key=abc&amp;blob=xyz">`
  for (let i = 0; i < 5; i++) {
    const toUi = stored.replaceAll(HYPERDRIVE_URL_PREFIX, address)
    stored = normalizeAttachmentUrls(toUi.replaceAll(address, HYPERDRIVE_URL_PREFIX))
  }
  t.is(
    stored,
    `<img src="${HYPERDRIVE_URL_PREFIX}/?key=abc&amp;blob=xyz">`,
    'no slash accumulation across open/save cycles'
  )
})
