import test from 'brittle'
import b4a from 'b4a'
import BlindPairing from 'blind-pairing'
import { isValidInvite, extractInvite } from '../utils.js'
import { INVITE_EXPIRY_MS, PAIRING_PROTOCOL } from '../constant.js'

const KEY = b4a.alloc(32).fill('a')

const realInviteHex = (opts) => b4a.toString(BlindPairing.createInvite(KEY, opts).invite, 'hex')

test('invite validation - raw hex', (t) => {
  const hex = realInviteHex({ expires: Date.now() + INVITE_EXPIRY_MS })

  t.ok(isValidInvite(hex), 'a real invite is valid')
  t.ok(isValidInvite(hex.toUpperCase()), 'uppercase hex is valid')
  t.absent(isValidInvite(hex.slice(0, -1)), 'a truncated odd-length invite is invalid')
  t.absent(isValidInvite(''), 'empty string is invalid')
  t.absent(isValidInvite(null), 'null is invalid')
})

test('invite validation - pear-notes URI', (t) => {
  const hex = realInviteHex({ expires: Date.now() + INVITE_EXPIRY_MS })
  const uri = `${PAIRING_PROTOCOL}${hex}`

  t.ok(isValidInvite(uri), `${PAIRING_PROTOCOL} URI with a real invite is valid`)
  t.is(extractInvite(uri), hex, 'extractInvite returns raw hex from URI')
  t.absent(isValidInvite(`${PAIRING_PROTOCOL}${hex.slice(0, -2)}`), 'a truncated URI is invalid')
})

test('invite validation - other URIs are rejected', (t) => {
  const hex = realInviteHex({ expires: Date.now() + INVITE_EXPIRY_MS })

  t.absent(isValidInvite(`https://example.com/${hex}`), 'a foreign URL is invalid')
  t.absent(isValidInvite(`something://else/${hex}`), 'a foreign scheme is invalid')
})

test('invite validation - whitespace', (t) => {
  const hex = realInviteHex({ expires: Date.now() + INVITE_EXPIRY_MS })

  t.ok(isValidInvite(`  ${hex}  `), 'padded invite is valid')
  t.is(extractInvite(`  ${hex}  `), hex, 'extractInvite trims whitespace')
})

test('invite validation - accepts a real invite that carries an expiry', (t) => {
  const withoutExpiry = realInviteHex()
  const withExpiry = realInviteHex({ expires: Date.now() + INVITE_EXPIRY_MS })

  t.ok(withExpiry.length > withoutExpiry.length, 'an expiry makes the encoded invite longer')
  t.ok(isValidInvite(withoutExpiry), 'a never-expiring invite is accepted')
  t.ok(
    isValidInvite(withExpiry),
    'an expiring invite is accepted - a fixed-length check would silently reject it'
  )
  t.ok(isValidInvite(PAIRING_PROTOCOL + withExpiry), 'the same invite is accepted through the URI')
})

test('invite validation - rejects well-shaped hex that is not an invite', (t) => {
  const hex = realInviteHex({ expires: Date.now() + INVITE_EXPIRY_MS })

  t.absent(isValidInvite('a'.repeat(132)), 'repeated hex of an invite length is invalid')
  t.absent(isValidInvite('0'.repeat(140)), 'all-zero hex is invalid')
  t.absent(isValidInvite(`02${hex.slice(2)}`), 'an unknown version is invalid')
  t.absent(isValidInvite(`${hex}00`), 'trailing bytes are invalid')
  t.absent(isValidInvite(hex.slice(0, -2)), 'a missing byte is invalid')
  t.absent(isValidInvite('z'.repeat(140)), 'non-hex characters are invalid')
  t.absent(isValidInvite('hello world'), 'arbitrary text is invalid')
})
