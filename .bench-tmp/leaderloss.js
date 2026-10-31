import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'
import createTestnet from 'hyperdht/testnet.js'
import NoteBase, { setDefaultSwarmBootstrap } from '../backend/NoteBase.js'

const encryption = b4a.toString(b4a.alloc(32).fill('leader-loss-key'), 'hex')
const sp = (n) => path.join(tmpdir(), 'pn-ll-' + n + '-' + Math.random().toString(36).slice(7))
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const testnet = await createTestnet(4)
setDefaultSwarmBootstrap(testnet.bootstrap)

async function pair(host, cand, name) {
  const invite = await host.createInvite()
  let hd = false,
    cd = false
  const off = host.subscribePairing((s) => {
    if (s.step === 'confirmation') host.confirmPairing()
    if (s.step === 'done') hd = true
  })
  const p = cand.subscribePairUser(
    (s) => {
      if (s.step === 'done') cd = true
    },
    invite.invite,
    name
  )
  const t0 = Date.now()
  while (!(hd && cd) && Date.now() - t0 < 55000) await wait(500)
  await p
  await wait(4000)
  return off
}

const macS = sp('mac'),
  phoneS = sp('phone'),
  padS = sp('pad')
const mac = new NoteBase({ storage: macS, encryption })
const phone = new NoteBase({ storage: phoneS, encryption })
const pad = new NoteBase({ storage: padS, encryption })
await mac.ready()
await phone.ready()
await pad.ready()
await mac.addNote({ key: 'seed', value: { title: 'seed', note: 'x', folderKey: 'f' } })

await pair(mac, phone, 'iPhone')
await pair(mac, pad, 'iPad')
await wait(4000)
console.log(
  `SETUP indexers=${mac.getIndexerKeys().length} macIsLeader=${mac.isLocalIndexer()} phoneLeader=${phone.isLocalIndexer()} padLeader=${pad.isLocalIndexer()}`
)
console.log(
  `SETUP phone sees ${(await phone.getAllNoteKeys()).length} notes, pad sees ${(await pad.getAllNoteKeys()).length} notes`
)

console.log('--- THE MAC IS LOST FOREVER ---')
await mac._close()
await wait(2000)

await phone.addNote({
  key: 'after-loss-phone',
  value: { title: 'written on iPhone after the Mac died', note: 'p', folderKey: 'f' }
})
await wait(10000)
const onPad = await pad.getNote('after-loss-phone')
console.log(`Q1 iPhone -> iPad sync works without the leader: ${!!onPad} "${onPad?.title || ''}"`)

await pad.addNote({
  key: 'after-loss-pad',
  value: { title: 'written on iPad after the Mac died', note: 'd', folderKey: 'f' }
})
await wait(10000)
const onPhone = await phone.getNote('after-loss-pad')
console.log(
  `Q2 iPad -> iPhone sync works without the leader: ${!!onPhone} "${onPhone?.title || ''}"`
)

console.log(`Q3 phone writable=${phone.autobase.writable} pad writable=${pad.autobase.writable}`)
console.log(
  `Q4 phone reads ${(await phone.getAllNoteKeys()).length} notes, pad reads ${(await pad.getAllNoteKeys()).length} notes`
)
console.log(
  `Q5 phone backlog=${phone.autobase.length - phone.autobase.indexedLength} pad backlog=${pad.autobase.length - pad.autobase.indexedLength}`
)

await phone._close()
await pad._close()
await testnet.destroy()
for (const d of [macS, phoneS, padS]) fs.rmSync(d, { recursive: true, force: true })
Bare.exit(0)
