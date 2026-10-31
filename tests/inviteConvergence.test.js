import test from 'brittle'
import b4a from 'b4a'
import BlindPairing from 'blind-pairing'
import { HostPairing, inviteHostBox } from '../backend/vault/pairing.js'
import { INVITE_EXPIRY_MS, PAIRING_PROTOCOL } from '../constant.js'
import { formatDeviceInvite } from '../utils.js'

const INVITE_KEY = '@invite'
const autobaseKey = b4a.alloc(32).fill('vault')
const encryptionKey = b4a.alloc(32).fill('encryption')

function peerInvite(expires = Date.now() + INVITE_EXPIRY_MS) {
  const { id, invite, publicKey } = BlindPairing.createInvite(autobaseKey, { expires })
  return {
    id: b4a.toString(id, 'hex'),
    invite: formatDeviceInvite(
      b4a.toString(invite, 'hex'),
      b4a.toString(inviteHostBox(encryptionKey, id), 'hex')
    ),
    publicKey: b4a.toString(publicKey, 'hex'),
    expires
  }
}

function makeBase({ before = null, afterAppend = null } = {}) {
  const vault = { key: autobaseKey, encryptionKey }
  const base = new HostPairing(vault)
  const calls = { updates: 0, appends: 0, removals: 0 }
  let current = before
  let appended = false

  vault.update = async () => {
    calls.updates++
  }
  vault.getNote = async (key) => {
    if (key !== INVITE_KEY) return null
    if (appended && afterAppend) return afterAppend
    return current
  }
  vault.removeNote = async () => {
    calls.removals++
    current = null
  }
  vault.addNote = async ({ value }) => {
    calls.appends++
    appended = true
    current = value
  }

  return { base, calls }
}

test('createInvite - refreshes before deciding, so a peer invite is not clobbered', async (t) => {
  const existing = peerInvite()
  const { base, calls } = makeBase({ before: existing })

  const result = await base.createInvite()

  t.is(calls.updates, 1, 'the vault is refreshed before the invite is read')
  t.is(calls.appends, 0, 'no second invite is written over the live one')
  t.is(result.id, existing.id, 'the device shows the invite that already exists')
})

test('createInvite - returns the invite that actually won the write', async (t) => {
  const winner = peerInvite()
  const { base, calls } = makeBase({ afterAppend: winner })

  const result = await base.createInvite()

  t.is(calls.appends, 1, 'this device did write its own invite')
  t.is(
    result.id,
    winner.id,
    'but it shows the invite that won, so both devices display one working code'
  )
  t.is(result.invite, winner.invite, 'and the code shown is the winning one')
})

test('createInvite - keeps its own invite when nothing raced it', async (t) => {
  const { base, calls } = makeBase()

  const result = await base.createInvite()

  t.is(calls.appends, 1, 'a fresh invite is written')
  t.ok(result.invite.startsWith(PAIRING_PROTOCOL), 'the invite is returned to the caller')
  t.ok(result.expires > Date.now(), 'and it is live')
})

test('createInvite - replaces a stored invite that has expired', async (t) => {
  const stale = peerInvite(Date.now() - 1000)
  const { base, calls } = makeBase({ before: stale })

  const result = await base.createInvite()

  t.is(calls.removals, 1, 'the expired invite is cleared')
  t.is(calls.appends, 1, 'and a fresh one is written')
  t.not(result.id, stale.id, 'the caller gets the new invite')
})

test('createInvite - ignores an expired invite that won the write', async (t) => {
  const staleWinner = peerInvite(Date.now() - 1000)
  const { base } = makeBase({ afterAppend: staleWinner })

  const result = await base.createInvite()

  t.not(result.id, staleWinner.id, 'an expired winner is not shown to the user')
  t.ok(result.expires > Date.now(), 'the live invite is shown instead')
})
