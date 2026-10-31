import test from 'brittle'
import {
  deriveVerifier,
  getAttemptState,
  getRetryAfterMs,
  recordFailedAttempt,
  recordSuccessfulAttempt,
  resetAttemptState,
  restoreAttemptState,
  verifyPassword
} from '../backend/noteLockPassword.js'

test('deriveVerifier produces a salted verifier and verifyPassword matches', (t) => {
  const verifier = deriveVerifier('Str0ng!Pass99')
  t.ok(verifier.salt && verifier.salt.length > 0, 'salt present')
  t.ok(verifier.hash && verifier.hash.length > 0, 'hash present')
  t.ok(verifyPassword('Str0ng!Pass99', verifier), 'correct password verifies')
})

test('verifyPassword rejects an incorrect password', (t) => {
  const verifier = deriveVerifier('Str0ng!Pass99')
  t.absent(verifyPassword('wrong-password', verifier), 'wrong password rejected')
})

test('two verifiers for the same password use different salts', (t) => {
  const a = deriveVerifier('Str0ng!Pass99')
  const b = deriveVerifier('Str0ng!Pass99')
  t.not(a.salt, b.salt, 'salts differ')
  t.not(a.hash, b.hash, 'hashes differ')
})

test('verifyPassword handles an empty verifier safely', (t) => {
  t.absent(verifyPassword('anything', null), 'null verifier rejected')
  t.absent(verifyPassword('anything', { salt: '', hash: '' }), 'empty verifier rejected')
})

test('attempt throttling backs off exponentially after five failures', (t) => {
  resetAttemptState()
  const now = 1000000
  for (let i = 0; i < 4; i++) recordFailedAttempt(now)
  t.is(getRetryAfterMs(now), 0, 'no lock before fifth failure')
  recordFailedAttempt(now)
  t.is(getRetryAfterMs(now), 30000, 'fifth failure locks for 30s')
  recordFailedAttempt(now)
  t.is(getRetryAfterMs(now), 60000, 'sixth failure locks for 60s')
  recordFailedAttempt(now)
  t.is(getRetryAfterMs(now), 120000, 'seventh failure locks for 120s')
  for (let i = 0; i < 10; i++) recordFailedAttempt(now)
  t.is(getRetryAfterMs(now), 900000, 'lock capped at 15 minutes')
  t.is(getRetryAfterMs(now + 900001), 0, 'lock expires after the window')
  recordSuccessfulAttempt()
  t.is(getRetryAfterMs(now), 0, 'success resets the lock')
  recordFailedAttempt(now)
  t.is(getRetryAfterMs(now), 0, 'failure counter also reset by success')
  resetAttemptState()
})

test('attempt state survives a restart and cannot be stretched by a clock change', (t) => {
  resetAttemptState()
  const now = 1000000
  for (let i = 0; i < 6; i++) recordFailedAttempt(now)
  const saved = getAttemptState()
  resetAttemptState()
  t.is(getRetryAfterMs(now), 0, 'a restart forgets the lock in memory')
  restoreAttemptState(saved, now)
  t.is(getRetryAfterMs(now), 60000, 'restored lock still applies')
  recordFailedAttempt(now)
  t.is(getRetryAfterMs(now), 120000, 'the backoff continues from the saved count')

  resetAttemptState()
  restoreAttemptState({ failedAttempts: 9, lockUntil: now + 10 * 24 * 3600 * 1000 }, now)
  t.is(getRetryAfterMs(now), 900000, 'a far-future lock is capped at 15 minutes')

  resetAttemptState()
  restoreAttemptState({ failedAttempts: 'x', lockUntil: null }, now)
  t.alike(getAttemptState(), { failedAttempts: 0, lockUntil: 0 }, 'garbage restores to nothing')
  resetAttemptState()
})
