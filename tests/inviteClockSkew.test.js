import test from 'brittle'
import { INVITE_CLOCK_SKEW_MS, INVITE_EXPIRY_MS } from '../constant.js'
import { isInviteExpired, isInviteLongExpired } from '../utils.js'

const MINUTE = 60 * 1000

test('a device with a fast clock is not locked out of pairing', (t) => {
  const now = Date.now()
  const issued = now + INVITE_EXPIRY_MS

  for (const skewMinutes of [11, 60, 6 * 60, 23 * 60]) {
    const joinerNow = now + skewMinutes * MINUTE
    t.ok(
      isInviteExpired(issued, joinerNow),
      `a clock ${skewMinutes} minutes fast still reads the invite as expired`
    )
    t.absent(
      isInviteLongExpired(issued, joinerNow),
      `but ${skewMinutes} minutes of skew does not abort the join - the inviter decides`
    )
  }
})

test('a genuinely stale invite is still refused before touching storage', (t) => {
  const now = Date.now()
  const issued = now - INVITE_CLOCK_SKEW_MS - MINUTE

  t.ok(isInviteExpired(issued, now), 'the invite is expired')
  t.ok(
    isInviteLongExpired(issued, now),
    'and stale beyond any believable clock skew, so the join aborts locally'
  )
})

test('a live invite is never treated as expired', (t) => {
  const now = Date.now()
  const issued = now + INVITE_EXPIRY_MS

  t.absent(isInviteExpired(issued, now), 'a fresh invite is valid')
  t.absent(isInviteLongExpired(issued, now), 'and nowhere near the skew allowance')
})

test('an invite without an expiry never expires', (t) => {
  t.absent(isInviteExpired(0), 'no expiry means no expiry')
  t.absent(isInviteLongExpired(0), 'and it is never long expired either')
})

test('second-precision expiry stamps are handled the same way', (t) => {
  const nowSeconds = Math.floor(Date.now() / 1000)
  const issuedSeconds = nowSeconds - 60

  t.ok(isInviteExpired(issuedSeconds), 'a seconds timestamp is normalised before comparing')
  t.absent(
    isInviteLongExpired(issuedSeconds),
    'and the skew allowance applies to it too, so it is not aborted locally'
  )
})
