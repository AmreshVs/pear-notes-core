import test from 'brittle'
import b4a from 'b4a'

import { HostPairing } from '../backend/vault/pairing.js'

function setup(lookup) {
  const statuses = []
  const vault = {
    localKeyHex: 'aa'.repeat(32),
    getNote: async () => ({ id: 'x' }),
    removeNote: async () => {},
    logActivityEvent: async () => {},
    findDeviceByLocalKey: lookup
  }
  const host = new HostPairing(vault)
  host.cb = (status) => statuses.push(status)
  const candidate = { inviteId: b4a.alloc(32, 1) }
  const joiner = { keyHex: 'bb'.repeat(32), box: b4a.alloc(32, 2), proof: null }
  const invite = { expires: Date.now() + 60000 }
  const outcome = host._awaitConfirmation(candidate, joiner, invite, 'CODE')
  return { host, statuses, outcome }
}

const settledWithin = (promise, ms) =>
  Promise.race([
    promise.then((value) => value),
    new Promise((resolve) => setTimeout(() => resolve('pending'), ms))
  ])

test('pairing - accepting before the code is shown does not release the key', async (t) => {
  let release
  const { host, statuses, outcome } = setup(() => new Promise((resolve) => (release = resolve)))
  host.confirm()
  t.is(await settledWithin(outcome, 100), 'pending', 'early accept ignored')
  release(null)
  await new Promise((resolve) => setTimeout(resolve, 10))
  t.is(statuses.at(-1)?.step, 'confirmation')
  t.is(statuses.at(-1)?.code, 'CODE')
  host.confirm()
  t.alike(await outcome, { ok: true })
})

test('pairing - a failed device lookup still asks the user', async (t) => {
  const { host, statuses, outcome } = setup(() => Promise.reject(new Error('view closed')))
  await new Promise((resolve) => setTimeout(resolve, 10))
  t.is(statuses.at(-1)?.step, 'confirmation')
  await host.reject()
  t.is((await outcome).ok, false)
})

test('pairing - no confirmation prompt after the request already ended', async (t) => {
  let release
  const { host, statuses, outcome } = setup(() => new Promise((resolve) => (release = resolve)))
  host.pending.finish({ ok: false, status: { step: 'idle' } })
  await outcome
  release(null)
  await new Promise((resolve) => setTimeout(resolve, 10))
  t.absent(statuses.some((s) => s.step === 'confirmation'))
})
