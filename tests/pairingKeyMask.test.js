import test from 'brittle'
import b4a from 'b4a'
import BlindPairingCore from 'blind-pairing-core'
import hypercoreCrypto from 'hypercore-crypto'
import sodium from 'sodium-universal'

import {
  PAIRING_HOST_UNVERIFIED,
  PAIRING_INVITE_VERSION,
  PAIRING_OUTDATED,
  PAIRING_PROTOCOL
} from '../constant.js'
import { inviteHostBox, maskedReply, pairingCode, unmaskReply } from '../backend/vault/pairing.js'
import {
  formatDeviceInvite,
  formatVaultInvite,
  getInviteHostBox,
  getInviteNameHint,
  getInviteVersion,
  isValidInvite
} from '../utils.js'

const vaultKey = hypercoreCrypto.randomBytes(32)
const encryptionKey = hypercoreCrypto.randomBytes(32)

function newInvite() {
  const created = BlindPairingCore.createInvite(vaultKey, { expires: Date.now() + 60000 })
  return { ...created, stored: PAIRING_PROTOCOL + b4a.toString(created.invite, 'hex') }
}

function box() {
  const publicKey = b4a.alloc(32)
  const secretKey = b4a.alloc(32)
  sodium.crypto_box_keypair(publicKey, secretKey)
  return { publicKey, secretKey }
}

function roundTrip(invite, { joiner, host = 'masked', swapBox = false } = {}) {
  const userData = b4a.from(
    JSON.stringify({ key: 'aa'.repeat(32), box: joiner && b4a.toString(joiner.publicKey, 'hex') })
  )
  const request = new BlindPairingCore.CandidateRequest(invite.invite, userData)
  const eavesdropper = new BlindPairingCore.CandidateRequest(invite.invite, userData)
  const member = BlindPairingCore.MemberRequest.from(request.encode())
  member.open(invite.publicKey)
  const sent = JSON.parse(b4a.toString(member.userData)).box
  const joinerBoxKey = swapBox ? hypercoreCrypto.randomBytes(32) : sent && b4a.from(sent, 'hex')
  const reply =
    host === 'masked' && joinerBoxKey
      ? maskedReply({
          encryptionKey,
          inviteId: member.inviteId,
          invite: invite.stored,
          joinerBox: joinerBoxKey
        })
      : { encryptionKey }
  member.confirm({ key: vaultKey, ...reply })
  request.handleResponse(member.response)
  eavesdropper.handleResponse(member.response)
  return {
    request,
    eavesdropper,
    inviteId: member.inviteId,
    expectedHostBox: inviteHostBox(encryptionKey, member.inviteId)
  }
}

test('key mask - the joiner reads the key, an invite holder watching the reply does not', (t) => {
  const invite = newInvite()
  const joiner = box()
  const { request, eavesdropper, inviteId, expectedHostBox } = roundTrip(invite, { joiner })
  const got = unmaskReply({ result: request.auth, inviteId, joinerBox: joiner, expectedHostBox })
  t.alike(got.encryptionKey, encryptionKey)
  t.alike(got.key, vaultKey)
  t.unlike(eavesdropper.auth.encryptionKey, encryptionKey)
  t.exception(
    () => unmaskReply({ result: eavesdropper.auth, inviteId, joinerBox: box(), expectedHostBox }),
    /does not match the invite/
  )
})

test('key mask - a box key swapped in transit leaves the joiner without the key', (t) => {
  const invite = newInvite()
  const joiner = box()
  const { request, inviteId, expectedHostBox } = roundTrip(invite, { joiner, swapBox: true })
  try {
    unmaskReply({ result: request.auth, inviteId, joinerBox: joiner, expectedHostBox })
    t.fail('expected an error')
  } catch (err) {
    t.is(err.code, PAIRING_HOST_UNVERIFIED)
  }
})

test('key mask - a reply from an older host is refused, not read', (t) => {
  const invite = newInvite()
  const joiner = box()
  const { request, inviteId, expectedHostBox } = roundTrip(invite, { joiner, host: 'old' })
  t.is(request.auth.data, null)
  try {
    unmaskReply({ result: request.auth, inviteId, joinerBox: joiner, expectedHostBox })
    t.fail('expected an error')
  } catch (err) {
    t.is(err.code, PAIRING_OUTDATED.HOST)
  }
})

test('key mask - every vault device derives the same host box key', (t) => {
  const invite = newInvite()
  const joiner = box()
  const id = BlindPairingCore.decodeInvite(invite.invite).id
  const a = maskedReply({
    encryptionKey,
    inviteId: id,
    invite: invite.stored,
    joinerBox: joiner.publicKey
  })
  const b = maskedReply({
    encryptionKey: b4a.from(encryptionKey),
    inviteId: id,
    invite: invite.stored,
    joinerBox: joiner.publicKey
  })
  t.alike(a.additional.data, b.additional.data)
  t.alike(a.encryptionKey, b.encryptionKey)
  const other = maskedReply({
    encryptionKey,
    inviteId: newInvite().id,
    invite: invite.stored,
    joinerBox: joiner.publicKey
  })
  t.unlike(other.additional.data, a.additional.data)
})

test('key mask - a low-order box key is refused', (t) => {
  const invite = newInvite()
  t.exception(() =>
    maskedReply({
      encryptionKey,
      inviteId: invite.id,
      invite: invite.stored,
      joinerBox: b4a.alloc(32)
    })
  )
})

test('key mask - a malformed host box key in the reply is an error, not a wrong key', (t) => {
  t.exception(() =>
    unmaskReply({
      result: { key: vaultKey, encryptionKey, data: b4a.alloc(5) },
      inviteId: b4a.alloc(32),
      joinerBox: box(),
      expectedHostBox: b4a.alloc(32)
    })
  )
})

test('pairing code - both sides get the same code, and it changes with the box key', async (t) => {
  const id = hypercoreCrypto.randomBytes(32)
  const key = hypercoreCrypto.randomBytes(32)
  const joiner = box()
  const a = await pairingCode(id, key, joiner.publicKey)
  const b = await pairingCode(b4a.from(id), b4a.from(key), b4a.from(joiner.publicKey))
  t.is(a, b)
  t.ok(/^\S+ \([0-9a-f]{5}\)$/u.test(a), a)
  t.not(await pairingCode(id, key, box().publicKey), a)
  t.not(await pairingCode(hypercoreCrypto.randomBytes(32), key, joiner.publicKey), a)
})

test('invite links - new links carry the version, old ones read as version 1', (t) => {
  const { stored } = newInvite()
  const hostBox = 'ab'.repeat(32)
  const link = formatVaultInvite(formatDeviceInvite(stored, hostBox), 'Work')
  t.is(getInviteVersion(link), PAIRING_INVITE_VERSION)
  t.is(getInviteHostBox(link), hostBox)
  t.is(getInviteNameHint(link), 'Work')
  t.ok(isValidInvite(link))
  t.is(getInviteVersion(formatVaultInvite(stored)), PAIRING_INVITE_VERSION)
  t.is(getInviteVersion(stored), 1)
  t.is(
    getInviteVersion(stored.replace(PAIRING_PROTOCOL, 'pear-notes://join-vault/') + '?name=Work'),
    1
  )
})

test('invite links - the host box survives reformatting and a bad one reads as missing', (t) => {
  const { stored } = newInvite()
  t.is(getInviteHostBox(stored), '')
  const hostBox = 'cd'.repeat(32)
  const device = formatDeviceInvite(stored, hostBox)
  t.is(getInviteHostBox(device), hostBox)
  t.is(getInviteHostBox(formatDeviceInvite(device)), hostBox)
  t.is(getInviteHostBox(formatVaultInvite(device)), hostBox)
  t.is(getInviteHostBox(device.replace(hostBox, 'zz'.repeat(32))), '')
  t.is(getInviteHostBox(device.replace(hostBox, 'cd'.repeat(31))), '')
})
