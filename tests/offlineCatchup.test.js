// A phone writes while the only sync leader is offline; the leader comes back
// and must pick those writes up without the phone writing again.
import test from 'brittle'
import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'

import NoteBase from '../backend/NoteBase.js'
import { withTestnet } from './helpers/testnet.js'

const encryption = b4a.toString(b4a.alloc(32).fill('offline-catchup'), 'hex')
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const tmp = (name) =>
  path.join(tmpdir(), 'pear-notes-catchup-' + name + '-' + Math.random().toString(36).slice(2))

async function until(predicate, timeoutMs) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return true
    await wait(250)
  }
  return false
}

async function pairDevices(t, host, joiner) {
  const invite = await host.createInvite()
  let hostDone = false
  let joinerDone = false
  host.subscribePairing((status) => {
    if (status.step === 'confirmation') host.confirmPairing()
    if (status.step === 'done') hostDone = true
  })
  const pairing = joiner.subscribePairUser((status) => {
    if (status.step === 'done') joinerDone = true
  }, invite.invite)
  t.ok(await until(() => hostDone && joinerDone, 120000), 'paired')
  await pairing
}

const note = (title) => ({
  title,
  note: `<p>${title}</p>`,
  addedAt: Date.now(),
  updatedAt: Date.now()
})

test(
  'the leader picks up a phone’s offline writes when it comes back',
  { timeout: 300000 },
  async (t) => {
    await withTestnet(t)
    const macStorage = tmp('mac')
    const phoneStorage = tmp('phone')
    let mac = new NoteBase({ storage: macStorage, encryption })
    const phone = new NoteBase({ storage: phoneStorage, encryption })
    t.teardown(async () => {
      await mac.destroy().catch(() => {})
      await phone.destroy().catch(() => {})
      for (const p of [macStorage, phoneStorage]) fs.rmSync(p, { recursive: true, force: true })
    })
    await mac.ready()
    await phone.ready()
    await pairDevices(t, mac, phone)

    await mac.addNote({ key: 'day', value: note('day') })
    t.ok(await until(async () => !!(await phone.getNote('day')), 60000), 'phone saw the day note')

    await mac._close()
    await phone.addNote({ key: 'night', value: note('night') })
    await wait(2000)

    mac = new NoteBase({ storage: macStorage, encryption })
    await mac.ready()
    const caughtUp = await until(async () => !!(await mac.getNote('night')), 60000)
    t.ok(caughtUp, 'the leader got the night note without a new phone write')
  }
)

for (const order of ['phone first', 'mac first']) {
  test(
    `offline phone writes reach the leader after both restart (${order})`,
    { timeout: 300000 },
    async (t) => {
      await withTestnet(t)
      const macStorage = tmp('mac')
      const phoneStorage = tmp('phone')
      let mac = new NoteBase({ storage: macStorage, encryption })
      let phone = new NoteBase({ storage: phoneStorage, encryption })
      t.teardown(async () => {
        await mac.destroy().catch(() => {})
        await phone.destroy().catch(() => {})
        for (const p of [macStorage, phoneStorage]) fs.rmSync(p, { recursive: true, force: true })
      })
      await mac.ready()
      await phone.ready()
      await pairDevices(t, mac, phone)
      await mac.addNote({ key: 'day', value: note('day') })
      t.ok(await until(async () => !!(await phone.getNote('day')), 60000), 'phone saw the day note')

      await mac._close()
      await phone.addNote({ key: 'night', value: note('night') })
      await phone.addNote({ key: 'night2', value: note('night2') })
      await wait(1000)
      await phone._close()

      const openMac = async () => {
        mac = new NoteBase({ storage: macStorage, encryption })
        await mac.ready()
      }
      const openPhone = async () => {
        phone = new NoteBase({ storage: phoneStorage, encryption })
        await phone.ready()
      }
      if (order === 'phone first') {
        await openPhone()
        await wait(3000)
        await openMac()
      } else {
        await openMac()
        await wait(3000)
        await openPhone()
      }
      const caughtUp = await until(async () => !!(await mac.getNote('night2')), 60000)
      t.ok(caughtUp, 'the leader got the night notes without a new phone write')
    }
  )
}
