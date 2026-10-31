import test from 'brittle'
import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'
import BlindPairing from 'blind-pairing'
import NoteBase from '../backend/NoteBase.js'
import { INVITE_CLOCK_SKEW_MS, INVITE_EXPIRY_MS, PAIRING_PROTOCOL } from '../constant.js'
import { extractInvite, formatDeviceInvite } from '../utils.js'
import { withTestnet } from './helpers/testnet.js'

const INVITE_KEY = '@invite'
const encryption = b4a.toString(b4a.alloc(32).fill('invite-test-key'), 'hex')

const getStoragePath = () =>
  path.join(tmpdir(), 'pear-notes-invite-test-' + Math.random().toString(36).substring(7))

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

test('createInvite stamps a bounded expiry', { timeout: 60000 }, async (t) => {
  await withTestnet(t)
  await withBase(async (base) => {
    const before = Date.now()
    const invite = await base.createInvite()
    const after = Date.now()

    t.ok(invite.invite.startsWith(PAIRING_PROTOCOL), 'invite is protocol prefixed')
    t.ok(invite.expires >= before + INVITE_EXPIRY_MS, 'expiry is at least the configured window')
    t.ok(invite.expires <= after + INVITE_EXPIRY_MS, 'expiry is not further out than configured')

    const raw = extractInvite(invite.invite)
    const decoded = BlindPairing.decodeInvite(b4a.from(raw, 'hex'))
    t.ok(decoded.expires > 0, 'the joiner can read the expiry out of the invite itself')
  })
})

test('createInvite is stable while the invite is still valid', { timeout: 60000 }, async (t) => {
  await withTestnet(t)
  await withBase(async (base) => {
    const first = await base.createInvite()
    const second = await base.createInvite()

    t.is(second.invite, first.invite, 'same invite returned')
    t.is(second.expires, first.expires, 'same expiry returned')
  })
})

test('createInvite replaces an expired invite', { timeout: 60000 }, async (t) => {
  await withTestnet(t)
  await withBase(async (base) => {
    const first = await base.createInvite()

    const stored = await base.getNote(INVITE_KEY)
    await base.addNote({
      key: INVITE_KEY,
      value: { ...stored, expires: Date.now() - 1000 }
    })

    const second = await base.createInvite()
    t.not(second.invite, first.invite, 'a fresh invite was generated')
    t.not(second.id, first.id, 'the invite id rotated')
    t.ok(second.expires > Date.now(), 'the replacement is valid')
  })
})

test(
  'joining with a long expired invite leaves local data intact',
  { timeout: 60000 },
  async (t) => {
    await withTestnet(t)
    await withBase(async (host) => {
      await withBase(async (joiner) => {
        const noteKey = 'local-note'
        await joiner.addNote({
          key: noteKey,
          value: {
            title: 'mine',
            note: '<p>keep me</p>',
            folderKey: 'somewhere',
            addedAt: Date.now(),
            updatedAt: Date.now(),
            locked: false,
            pinned: false
          }
        })

        const invite = await host.createInvite()
        const stored = await host.getNote(INVITE_KEY)
        const raw = extractInvite(stored.invite)

        const expiredInvite = BlindPairing.createInvite(host.autobase.key, {
          expires: Date.now() - INVITE_CLOCK_SKEW_MS - 1000
        })
        t.ok(invite.expires > Date.now(), 'the live invite is still valid')
        t.ok(raw.length > 0, 'stored invite is hex encoded')

        const statuses = []
        await joiner.subscribePairUser(
          (status) => statuses.push(status),
          formatDeviceInvite(b4a.toString(expiredInvite.invite, 'hex'), 'ab'.repeat(32))
        )

        const steps = statuses.map((s) => s.step)
        t.ok(steps.includes('expired'), 'joiner reports the invite as expired')
        t.absent(steps.includes('clearing_data'), 'joiner never started clearing local storage')

        const survived = await joiner.getNote(noteKey)
        t.ok(survived, 'local note survived the failed join')
        t.is(survived.title, 'mine', 'local note is unchanged')
      })
    })
  }
)
