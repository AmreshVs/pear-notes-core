// Opt-in, slow: the field scenario end to end. A Mac restores a backup, four fresh
// devices with some local data pair to it, and everyone edits the same notes
// while devices restart, suspend, relink, and the Mac drops offline.
//   bare tests/fleet.test.js --seed=3 --rounds=40
import test from 'brittle'
import b4a from 'b4a'
import crypto from 'hypercore-crypto'
import path from 'bare-path'
import { tmpdir } from 'bare-os'

import NoteBase from '../backend/NoteBase.js'
import { withTestnet } from './helpers/testnet.js'

const arg = (name, fallback) =>
  Number(Bare.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback)
const SEED = arg('seed', Date.now() % 100000)
const ROUNDS = arg('rounds', 30)
const MAX_RELINKS = 2

let rng = SEED
const rand = () => (rng = (rng * 1103515245 + 12345) % 2147483648) / 2147483648
const pick = (list) => list[Math.floor(rand() * list.length)]
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const hex = (value) => b4a.toString(value, 'hex')
const say = (...args) => console.log('[fleet]', ...args)

class Device {
  constructor(name, platform) {
    this.name = name
    this.platform = platform
    this.encryption = hex(crypto.randomBytes(32))
    this.storage = path.join(tmpdir(), `pn-fleet-${name}-${Math.random().toString(36).slice(2)}`)
    this.base = null
  }

  async boot() {
    this.base = new NoteBase({ storage: this.storage, encryption: this.encryption })
    await this.base.ready()
  }

  async restart() {
    await this.base.close()
    await this.boot()
  }

  async wipe() {
    await this.base?.clearStorage().catch(() => {})
    this.encryption = hex(crypto.randomBytes(32))
  }

  // What the app does at first launch: record this device in its own vault.
  async insertLocalDevice() {
    if (await this.base.findDeviceByLocalKey(this.base.localKeyHex)) return
    await this.base.addSyncedDevice({
      key: hex(crypto.randomBytes(32)),
      value: {
        title: this.name,
        platform: this.platform,
        localKey: this.base.localKeyHex,
        addedAt: Date.now(),
        updatedAt: Date.now()
      }
    })
  }

  get awake() {
    return !this.base._suspended
  }
}

async function pair(host, device) {
  const invite = await host.base.createInvite()
  let hostDone = false
  let result = null
  await host.base.subscribePairing((status) => {
    if (status.step === 'confirmation') host.base.confirmPairing()
    if (status.step === 'done') hostDone = true
  })
  await device.base.subscribePairUser(
    (status) => {
      if (status.encryptionKey) device.encryption = status.encryptionKey
      if (['done', 'error', 'rejected', 'expired', 'merge_failed'].includes(status.step)) {
        result = status.step
      }
    },
    invite.invite,
    device.name
  )
  const started = Date.now()
  while (!hostDone && Date.now() - started < 60000) await wait(250)
  return result
}

async function snapshot(device) {
  const notes = {}
  for (const { key, value } of await device.base.getAllNotes()) notes[key] = value.note
  return JSON.stringify(notes)
}

test(
  'fleet - backup-restored leader, four fresh devices, concurrent edits',
  { timeout: 1800000 },
  async (t) => {
    await withTestnet(t)
    say('seed', SEED, 'rounds', ROUNDS)

    const source = new Device('Old Mac', 'darwin')
    await source.boot()
    const shared = []
    for (let i = 0; i < 6; i++) {
      shared.push('shared-' + i)
      await source.base.addNote({
        key: 'shared-' + i,
        value: { title: 'Note ' + i, note: 'from backup', folderKey: '', updatedAt: 1 }
      })
    }
    const backup = await source.base.exportBackup(null)
    const recoveryKey = source.encryption
    await source.wipe()

    const mac = new Device('MacBook Pro', 'darwin')
    const phones = [
      new Device('XCover6 Pro', 'android'),
      new Device('Vivo', 'android'),
      new Device('iPhone', 'ios'),
      new Device('Tab S7 FE', 'android')
    ]
    const all = [mac, ...phones]
    t.teardown(async () => {
      for (const device of all) await device.wipe()
    })

    await mac.boot()
    await mac.insertLocalDevice()
    await mac.base.addNote({ key: 'mac-local', value: { title: 'local', note: 'x', updatedAt: 1 } })
    await mac.base.importBackup({ buffer: backup, recoveryKey })

    const link = async (phone) => {
      await phone.boot()
      await phone.insertLocalDevice()
      if (rand() < 0.5) {
        await phone.base.addNote({
          key: 'local-' + phone.name + Date.now(),
          value: { title: 'pre-link', note: 'mine', updatedAt: Date.now() }
        })
      }
      const outcome = await pair(mac, phone)
      say('paired', phone.name, outcome)
      t.is(outcome, 'done', `${phone.name} paired`)
    }
    for (const phone of phones) await link(phone)

    const events = []
    let relinks = 0
    for (let round = 0; round < ROUNDS; round++) {
      const roll = rand()
      const awakePhones = phones.filter((p) => p.awake)
      if (roll < 0.1 && awakePhones.length) {
        const phone = pick(awakePhones)
        events.push(`r${round} restart ${phone.name}`)
        await phone.restart()
      } else if (roll < 0.18) {
        const device = pick(all.filter((d) => d.awake))
        if (device) {
          events.push(`r${round} suspend ${device.name}`)
          await device.base.suspend()
          device.resumeAt = round + 1 + Math.floor(rand() * 4)
        }
      } else if (roll < 0.26 && relinks < MAX_RELINKS && awakePhones.length) {
        const phone = pick(awakePhones)
        relinks++
        const left = await phone.base.leaveSyncCluster({ timeoutMs: 5000 })
        events.push(
          `r${round} relink ${phone.name} mac=${mac.awake ? 'on' : 'off'} left=${left.left}`
        )
        await phone.wipe()
        if (!mac.awake) {
          await mac.base.resume()
          mac.resumeAt = null
        }
        await link(phone)
      } else if (roll < 0.34 && mac.awake) {
        events.push(`r${round} mac offline`)
        await mac.base.suspend()
        mac.resumeAt = round + 3 + Math.floor(rand() * 5)
      }

      for (const device of all) {
        if (device.resumeAt !== round) continue
        device.resumeAt = null
        events.push(`r${round} resume ${device.name}`)
        await device.base.resume()
      }

      await Promise.all(
        all
          .filter((d) => d.awake)
          .map(async (device) => {
            const key = pick(shared)
            const current = await device.base.getNote(key)
            await device.base.addNote({
              key,
              value: { ...current, note: `${device.name} r${round}`, updatedAt: Date.now() }
            })
          })
      )
      await wait(300 + Math.floor(rand() * 900))
    }

    for (const device of all) if (!device.awake) await device.base.resume()
    say('events', events.join(' | '))

    let converged = false
    const deadline = Date.now() + 120000
    while (!converged && Date.now() < deadline) {
      await wait(3000)
      const pending = await Promise.all(all.map((d) => d.base.unconfirmedWrites()))
      const views = await Promise.all(all.map(snapshot))
      converged = pending.every((n) => n === 0) && views.every((v) => v === views[0])
      say('unconfirmed', pending.join(','), views.every((v) => v === views[0]) ? 'same' : 'differ')
    }
    t.ok(converged, 'every write is confirmed and every copy is identical')
  }
)
