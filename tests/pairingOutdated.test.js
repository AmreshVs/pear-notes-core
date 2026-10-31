import test from 'brittle'
import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'
import BlindPairing from 'blind-pairing'
import hypercoreCrypto from 'hypercore-crypto'
import Hyperswarm from 'hyperswarm'

import NoteBase from '../backend/NoteBase.js'
import { MIN_COMPAT_PREF } from '../backend/featureGates.js'
import { PAIRING_OUTDATED, PAIRING_PROTOCOL } from '../constant.js'
import { extractInvite } from '../utils.js'
import { withTestnet } from './helpers/testnet.js'

const encryptionFor = (label) => b4a.toString(b4a.alloc(32).fill(label), 'hex')

async function openBase(t, label) {
  const storage = path.join(
    tmpdir(),
    `pear-notes-outdated-${label}-${Math.random().toString(36).slice(2, 9)}`
  )
  const base = new NoteBase({ storage, encryption: encryptionFor(label) })
  t.teardown(async () => {
    await base.close().catch(() => {})
    fs.rmSync(storage, { recursive: true, force: true })
  })
  await base.ready()
  return base
}

async function until(predicate, timeoutMs = 30000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return predicate()
}

test('pairing - a link without the invite version asks for an update and touches nothing', async (t) => {
  await withTestnet(t)
  const host = await openBase(t, 'old-link-host')
  const joiner = await openBase(t, 'old-link-joiner')
  const invite = await host.createInvite()
  const statuses = []
  await joiner.subscribePairUser(
    (status) => statuses.push(status),
    PAIRING_PROTOCOL + extractInvite(invite.invite),
    'Phone'
  )
  t.is(statuses.length, 1)
  t.is(statuses[0].step, 'error')
  t.is(statuses[0].reason, PAIRING_OUTDATED.INVITE)
})

test('pairing - the host refuses a joiner that sends no box key', { timeout: 60000 }, async (t) => {
  const { bootstrap } = await withTestnet(t)
  const host = await openBase(t, 'old-joiner-host')
  const invite = await host.createInvite()
  const hostStatuses = []
  await host.subscribePairing((status) => hostStatuses.push(status))

  const swarm = new Hyperswarm({ bootstrap })
  const pairing = new BlindPairing(swarm, { poll: 500 })
  t.teardown(async () => {
    await pairing.close().catch(() => {})
    await swarm.destroy().catch(() => {})
  })
  let rejected = false
  const candidate = pairing.addCandidate({
    invite: b4a.from(extractInvite(invite.invite), 'hex'),
    userData: b4a.from(
      JSON.stringify({
        key: b4a.toString(hypercoreCrypto.randomBytes(32), 'hex'),
        platform: 'ios',
        deviceName: 'Old phone'
      })
    ),
    onadd: () => t.fail('an old joiner must not be added')
  })
  candidate.request?.on('rejected', () => {
    rejected = true
  })
  Promise.resolve(candidate.pairing).catch(() => {
    rejected = true
  })

  t.ok(
    await until(() => hostStatuses.some((s) => s.reason === PAIRING_OUTDATED.JOINER)),
    'host says the joiner is outdated'
  )
  t.absent(
    hostStatuses.some((s) => s.step === 'confirmation'),
    'never asked the user to confirm'
  )
  t.ok(await until(() => rejected), 'joiner was denied')
  await candidate.close().catch(() => {})
})

test(
  'pairing - both screens show the same code, and the joiner gets the vault',
  { timeout: 60000 },
  async (t) => {
    await withTestnet(t)
    const host = await openBase(t, 'code-host')
    const joiner = await openBase(t, 'code-joiner')
    const invite = await host.createInvite()

    let hostCode = null
    await host.subscribePairing((status) => {
      if (status.step === 'confirmation') {
        hostCode = status.code
        host.confirmPairing()
      }
    })
    let joinerCode = null
    let done = false
    await joiner.subscribePairUser(
      (status) => {
        if (status.code) joinerCode = status.code
        if (status.step === 'done') done = true
      },
      invite.invite,
      'Phone'
    )

    t.ok(joinerCode, 'joiner shows a code')
    t.is(hostCode, joinerCode, 'host shows the same code')
    t.ok(done, 'pairing finished')
    t.is(b4a.toString(joiner.encryptionKey, 'hex'), b4a.toString(host.encryptionKey, 'hex'))
  }
)

test(
  'pairing - once files are sealed, a level-1 joiner is refused and a level-2 one joins',
  { timeout: 90000 },
  async (t) => {
    const { bootstrap } = await withTestnet(t)
    const host = await openBase(t, 'level-host')
    await host.setSyncedPref(MIN_COMPAT_PREF, { level: 2 })
    const hostStatuses = []
    await host.subscribePairing((status) => {
      hostStatuses.push(status)
      if (status.step === 'confirmation') host.confirmPairing()
    })
    const invite = await host.createInvite()

    const swarm = new Hyperswarm({ bootstrap })
    const pairing = new BlindPairing(swarm, { poll: 500 })
    t.teardown(async () => {
      await pairing.close().catch(() => {})
      await swarm.destroy().catch(() => {})
    })
    const candidate = pairing.addCandidate({
      invite: b4a.from(extractInvite(invite.invite), 'hex'),
      userData: b4a.from(
        JSON.stringify({
          key: b4a.toString(hypercoreCrypto.randomBytes(32), 'hex'),
          platform: 'ios',
          deviceName: 'Level 1 phone',
          box: b4a.toString(hypercoreCrypto.randomBytes(32), 'hex'),
          caps: 'sealedNotes1'
        })
      ),
      onadd: () => t.fail('a level-1 joiner must not be added')
    })
    Promise.resolve(candidate.pairing).catch(() => {})
    t.ok(
      await until(() => hostStatuses.some((s) => s.reason === PAIRING_OUTDATED.JOINER)),
      'host says the joiner is outdated'
    )
    t.absent(
      hostStatuses.some((s) => s.step === 'confirmation'),
      'never asked to confirm'
    )
    await candidate.close().catch(() => {})

    const joiner = await openBase(t, 'level-joiner')
    let done = false
    await joiner.subscribePairUser(
      (status) => {
        if (status.step === 'done') done = true
      },
      (await host.createInvite()).invite,
      'Phone'
    )
    t.ok(done, 'a current joiner pairs')
    const record = (await host.listSyncedDevicesStrict()).find((d) => d.value?.title === 'Phone')
    t.is(record?.value?.compatLevel, 2, 'its level is on the new record')
  }
)
