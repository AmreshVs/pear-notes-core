import b4a from 'b4a'
import crypto from 'bare-crypto'

const PBKDF2_ITERATIONS = 600000
const PBKDF2_SALT_LENGTH = 16
const PBKDF2_KEY_LENGTH = 32
const PBKDF2_DIGEST = 'sha256'

const MAX_FREE_ATTEMPTS = 5
const BASE_LOCK_MS = 30000
const MAX_LOCK_MS = 900000

let failedAttempts = 0
let lockUntil = 0

export function deriveVerifier(password) {
  const salt = crypto.randomBytes(PBKDF2_SALT_LENGTH)
  const hash = crypto.pbkdf2Sync(
    password,
    salt,
    PBKDF2_ITERATIONS,
    PBKDF2_KEY_LENGTH,
    PBKDF2_DIGEST
  )
  return {
    salt: b4a.toString(salt, 'hex'),
    hash: b4a.toString(hash, 'hex')
  }
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

export function verifyPassword(password, verifier) {
  if (!verifier || !verifier.salt || !verifier.hash) return false
  const salt = b4a.from(verifier.salt, 'hex')
  const hash = crypto.pbkdf2Sync(
    password,
    salt,
    PBKDF2_ITERATIONS,
    PBKDF2_KEY_LENGTH,
    PBKDF2_DIGEST
  )
  const expected = b4a.from(verifier.hash, 'hex')
  return constantTimeEqual(hash, expected)
}

export function getRetryAfterMs(now = Date.now()) {
  return Math.max(0, lockUntil - now)
}

export function recordFailedAttempt(now = Date.now()) {
  failedAttempts++
  if (failedAttempts >= MAX_FREE_ATTEMPTS) {
    const exponent = failedAttempts - MAX_FREE_ATTEMPTS
    const lockMs = Math.min(BASE_LOCK_MS * 2 ** exponent, MAX_LOCK_MS)
    lockUntil = now + lockMs
  }
}

export function recordSuccessfulAttempt() {
  failedAttempts = 0
  lockUntil = 0
}

export function getAttemptState() {
  return { failedAttempts, lockUntil }
}

export function restoreAttemptState(state, now = Date.now()) {
  const attempts = Number(state?.failedAttempts)
  const until = Number(state?.lockUntil)
  if (Number.isFinite(attempts) && attempts > failedAttempts) failedAttempts = Math.floor(attempts)
  if (Number.isFinite(until) && until > now) {
    lockUntil = Math.max(lockUntil, Math.min(until, now + MAX_LOCK_MS))
  }
}

export function resetAttemptState() {
  failedAttempts = 0
  lockUntil = 0
}
