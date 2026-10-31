import test from 'brittle'
import b4a from 'b4a'
import {
  createKeyring,
  currentKeyring,
  isKeyringEntry,
  openBody,
  openKeyring,
  parseEnvelope,
  rewrapKeyring,
  rootKeyFromHex,
  rootKeyOpens,
  rootKeyToHex,
  sealBody
} from '../backend/lockCrypto.js'
import {
  closeLockSession,
  isLockSessionOpen,
  onLockSessionChange,
  openWithPassword,
  openWithRootKey,
  readableNote,
  sealNoteBody,
  sealingKeyringId
} from '../backend/lockSession.js'
import { extractReferencedUrls } from '../backend/backupManager.js'
import { envelopeLinks } from '../backend/sealedEnvelope.js'
import { noteLinks } from '../backend/vault/media.js'
import { OP, isValidOp } from '../backend/vault/ops.js'
import { decode, encode } from '../spec/hyperschema/index.js'

const FAST = { params: { ops: 1, mem: 8 * 1024 * 1024 } }
const HTML = '<p>bank PIN 0000</p><img src="http://hyperdrive/?key=abc&amp;blockOffset=0">'

test('lock crypto - keyring opens with the right password only', async (t) => {
  const { entry, rootKey } = await createKeyring('hunter2-long-pass', FAST)
  t.ok(isKeyringEntry(entry), 'entry has the stored shape')
  t.ok(rootKey.secure, 'root key lives in sodium_malloc memory')
  t.absent(JSON.stringify(entry).includes(rootKeyToHex(rootKey)), 'entry never holds R')

  const opened = await openKeyring('hunter2-long-pass', entry)
  t.ok(opened && b4a.equals(opened, rootKey), 'right password unwraps R')
  t.is(await openKeyring('hunter3-long-pass', entry), null, 'wrong password fails closed')

  const moved = { ...entry, id: 'f'.repeat(32) }
  t.is(await openKeyring('hunter2-long-pass', moved), null, 'wrapped R is bound to its keyring id')
  t.ok(rootKeyOpens(rootKey, entry), 'R passes the keyring check')
  t.absent(rootKeyOpens(rootKey, moved), 'check is bound to the keyring id')
  const other = await createKeyring('hunter2-long-pass', FAST)
  t.absent(rootKeyOpens(other.rootKey, entry), "another vault's R fails the check")
})

test('lock crypto - malformed entries are not keyrings', async (t) => {
  const { entry } = await createKeyring('pw-123456789', FAST)
  t.absent(isKeyringEntry({ ...entry, mem: 4 * 1024 * 1024 * 1024 }), 'absurd memory cost refused')
  t.absent(isKeyringEntry({ ...entry, id: 'not-hex' }), 'bad id refused')
  t.absent(isKeyringEntry({ ...entry, v: 2 }), 'unknown version refused')
  t.absent(isKeyringEntry(null), 'null refused')
})

test('lock crypto - current keyring is the lowest non-pending id', async (t) => {
  const { entry } = await createKeyring('pw-123456789', FAST)
  const low = { ...entry, id: '0'.repeat(32) }
  const high = { ...entry, id: 'f'.repeat(32) }
  t.is(currentKeyring([high, low]).id, low.id, 'lowest id wins on every device')
  t.is(currentKeyring([high, { ...low, pending: true }]).id, high.id, 'pending entries are skipped')
  t.is(currentKeyring([]), null, 'no keyring')
})

test('lock crypto - note bodies seal, open and stay bound to their note', async (t) => {
  const { entry, rootKey } = await createKeyring('pw-123456789', FAST)
  const roots = new Map([[entry.id, rootKey]])

  const a = sealBody(roots, entry.id, 'note-a', HTML, { links: ['http://hyperdrive/?key=abc'] })
  const b = sealBody(roots, entry.id, 'note-b', '<p>other</p>')
  t.absent(a.includes('bank PIN'), 'envelope holds no plaintext')
  t.alike(parseEnvelope(a).links, ['http://hyperdrive/?key=abc'], 'links stay readable')
  t.is(openBody(roots, 'note-a', a), HTML, 'round trip')
  t.is(openBody(roots, 'note-b', a), null, 'whole envelope moved to another note fails')

  const swapped = JSON.stringify({ ...parseEnvelope(b), b: parseEnvelope(a).b })
  t.is(openBody(roots, 'note-b', swapped), null, 'body moved to another note fails')

  const tampered = parseEnvelope(a)
  const bytes = b4a.from(tampered.b, 'base64')
  bytes[40] ^= 1
  tampered.b = b4a.toString(bytes, 'base64')
  t.is(openBody(roots, 'note-a', JSON.stringify(tampered)), null, 'tampered body fails')
  t.is(openBody(new Map(), 'note-a', a), null, 'no root key, no body')
  t.is(openBody(roots, 'note-a', 'not json'), null, 'garbage envelope fails closed')

  const resaved = sealBody(roots, entry.id, 'note-a', HTML + '<p>edit</p>', { previous: a })
  t.is(parseEnvelope(resaved).k, parseEnvelope(a).k, 're-save keeps the wrapped content key')
  t.not(parseEnvelope(resaved).b, parseEnvelope(a).b, 'with a fresh body')
  t.is(openBody(roots, 'note-a', resaved), HTML + '<p>edit</p>', 'and opens')
})

test('lock crypto - password change re-wraps R only', async (t) => {
  const { entry, rootKey } = await createKeyring('old-password-1', FAST)
  const roots = new Map([[entry.id, rootKey]])
  const sealed = sealBody(roots, entry.id, 'note-a', HTML)

  const next = await rewrapKeyring(rootKey, 'new-password-2', entry, FAST)
  t.is(next.id, entry.id, 'same keyring id')
  t.not(next.salt, entry.salt, 'fresh salt')
  t.is(await openKeyring('old-password-1', next), null, 'old password no longer opens it')
  const reopened = await openKeyring('new-password-2', next)
  t.is(openBody(new Map([[entry.id, reopened]]), 'note-a', sealed), HTML, 'old notes still open')
})

test('lock crypto - a note sealed under another keyring is re-wrapped under the current one', async (t) => {
  const first = await createKeyring('pw-123456789', FAST)
  const second = await createKeyring('pw-123456789', FAST)
  const roots = new Map([
    [first.entry.id, first.rootKey],
    [second.entry.id, second.rootKey]
  ])
  const sealed = sealBody(roots, second.entry.id, 'note-a', HTML)
  const resealed = sealBody(roots, first.entry.id, 'note-a', HTML, { previous: sealed })
  t.is(parseEnvelope(resealed).r, first.entry.id, 'moved to the sealing keyring')
  t.is(
    openBody(new Map([[first.entry.id, first.rootKey]]), 'note-a', resealed),
    HTML,
    'opens with that root alone'
  )
})

test('lock crypto - root key hex round trip', async (t) => {
  const { rootKey } = await createKeyring('pw-123456789', FAST)
  const back = rootKeyFromHex(rootKeyToHex(rootKey))
  t.ok(back.secure && b4a.equals(back, rootKey), 'hex form restores R into secure memory')
  t.is(rootKeyFromHex('zz'), null, 'bad hex refused')
})

test('lock session - open, read, close', async (t) => {
  closeLockSession()
  const { entry, rootKey } = await createKeyring('pw-123456789', FAST)
  const events = []
  const off = onLockSessionChange((open) => events.push(open))
  t.teardown(() => {
    off()
    closeLockSession()
  })

  t.absent(await openWithPassword([entry], 'wrong-password'), 'wrong password does not open')
  t.absent(isLockSessionOpen(), 'still closed')
  t.ok(await openWithPassword([entry], 'pw-123456789'), 'password opens')
  t.is(sealingKeyringId([entry]), entry.id, 'seals under the keyring')

  const sealed = sealNoteBody(entry.id, 'note-a', HTML)
  const stored = { title: 'T', note: '', locked: true, sealed }
  t.alike(
    readableNote('note-a', stored),
    { title: 'T', note: HTML, locked: true, sealed: true },
    'open session serves plaintext'
  )

  closeLockSession()
  t.alike(
    readableNote('note-a', stored),
    { title: 'T', note: '', locked: true, sealed: true, bodyOmitted: true },
    'closed session serves the omitted shape'
  )
  t.is(sealingKeyringId([entry]), '', 'nothing to seal with')
  t.alike(
    readableNote('note-b', { title: 'P', note: '<p>x</p>', sealed: '' }),
    { title: 'P', note: '<p>x</p>' },
    'plain notes pass through'
  )

  t.ok(openWithRootKey([entry], rootKey), 'the biometric path opens with R')
  t.alike(events, [true, false, true], 'listeners hear every open and close')
})

test('sealed note wire - sealed flag and lock session messages round trip', (t) => {
  const note = decode(
    '@notes/note-schema',
    encode('@notes/note-schema', {
      title: 'T',
      note: '',
      locked: true,
      sealed: true,
      bodyOmitted: true
    })
  )
  t.is(note.sealed, true, 'sealed survives')
  t.is(note.bodyOmitted, true, 'bodyOmitted survives')

  const request = { password: 'pw', rootKey: 'ab'.repeat(32), returnRootKey: true }
  t.alike(
    decode(
      '@notes/command-open-lock-session-request',
      encode('@notes/command-open-lock-session-request', request)
    ),
    request,
    'open request survives'
  )
  const response = { ok: true, retryAfter: 30, rootKey: 'cd'.repeat(32), reason: 'THROTTLED' }
  t.alike(
    decode(
      '@notes/command-open-lock-session-response',
      encode('@notes/command-open-lock-session-response', response)
    ),
    response,
    'open response survives'
  )
})

test('lock session - a close during Argon2 wins over the open', async (t) => {
  closeLockSession()
  const { entry } = await createKeyring('pw-123456789', FAST)
  const pending = openWithPassword([entry], 'pw-123456789')
  closeLockSession()
  t.absent(await pending, 'the open reports failure')
  t.absent(isLockSessionOpen(), 'and the session stays closed')
})

test('sealed note ops - a non-string envelope is not a valid op', (t) => {
  const op = (value) => ({ type: OP.ADD_NOTE, key: 'k', at: 1, value })
  t.ok(isValidOp(op({ note: '', sealed: '{}' })), 'string envelope')
  t.ok(isValidOp(op({ note: '<p>x</p>' })), 'no envelope')
  t.ok(isValidOp(op({ note: '<p>x</p>', sealed: null })), 'null envelope')
  t.absent(isValidOp(op({ note: '', sealed: 42 })), 'number refused')
  t.absent(isValidOp(op({ note: '', sealed: { v: 1 } })), 'object refused')
})

test('sealed note links - readers take links from the envelope', (t) => {
  const a = 'http://hyperdrive/?key=abc&blob=1-2-3-4'
  const b = 'http://hyperdrive/?key=abc&blob=5-6-7-8'
  const sealed = JSON.stringify({ v: 1, r: 'ring', k: 'key', b: 'body', links: [a, 7, ''] })
  t.alike(envelopeLinks(sealed), [a], 'only non-empty strings')
  t.alike(envelopeLinks('not json'), [], 'bad envelope has none')
  t.alike(envelopeLinks(JSON.stringify({ v: 1, r: 'r', k: 'k', b: 'b' })), [], 'no links field')
  t.alike(noteLinks({ note: '', sealed }), [a], 'sealed note')
  t.alike(noteLinks({ note: `<img src="${b.replace('&', '&amp;')}">` }), [b], 'plain note')
  t.alike(
    [
      ...extractReferencedUrls([
        { value: { note: '', sealed } },
        { value: { note: `<img src="${b}">` } }
      ])
    ],
    [a, b],
    'backup scan includes envelope links'
  )
})

test('lock crypto - an entry asking for more memory than a phone holds is not opened', async (t) => {
  const { entry } = await createKeyring('hunter2-long-pass', FAST)
  const huge = { ...entry, mem: 512 * 1024 * 1024 }
  t.ok(isKeyringEntry(huge), 'apply still accepts the entry')
  t.is(await openKeyring('hunter2-long-pass', huge), null, 'but Argon2 never runs at that size')
})

test('lock crypto - moving a body to another keyring changes its content key', async (t) => {
  const a = await createKeyring('first-long-pass', FAST)
  const b = await createKeyring('second-long-pass', FAST)
  const roots = new Map([
    [a.entry.id, a.rootKey],
    [b.entry.id, b.rootKey]
  ])
  const first = sealBody(roots, a.entry.id, 'n1', HTML)
  const same = sealBody(roots, a.entry.id, 'n1', HTML, { previous: first })
  t.is(parseEnvelope(same).k, parseEnvelope(first).k, 'a save under the same keyring keeps it')
  const moved = sealBody(roots, b.entry.id, 'n1', HTML, { previous: first })
  t.is(openBody(roots, 'n1', moved), HTML, 'the moved body opens')
  t.is(openBody(new Map([[a.entry.id, a.rootKey]]), 'n1', moved), null, 'not with the old root')
  t.is(a.entry.legacy, false, 'a new keyring is not marked as made from a PBKDF2 password')
})
