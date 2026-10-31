import test from 'brittle'
import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'
import NoteBase from '../backend/NoteBase.js'
import { INVITE_KEY } from '../backend/viewKeys.js'
import { withTestnet } from './helpers/testnet.js'

const encryption = b4a.toString(b4a.alloc(32).fill('listener-key'), 'hex')
const storagePath = () =>
  path.join(tmpdir(), 'pear-notes-pairing-listener-' + Math.random().toString(36).slice(2, 9))

async function until(predicate, timeoutMs = 5000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return predicate()
}

test('the pairing listener only runs while an invite can be used', async (t) => {
  await withTestnet(t)
  const storage = storagePath()
  const base = new NoteBase({ storage, encryption })
  t.teardown(async () => {
    await base.close().catch(() => {})
    fs.rmSync(storage, { recursive: true, force: true })
  })
  await base.ready()

  await base.subscribePairing(() => {})
  t.is(base.hostPairing.member, null, 'subscribing with no invite polls nothing')

  await base.createInvite()
  t.ok(await until(() => base.hostPairing.member !== null), 'an invite starts the listener')

  await base.removeNote(INVITE_KEY)
  t.ok(await until(() => base.hostPairing.member === null), 'removing the invite stops it')

  await base.subscribePairing(() => {})
  t.is(base.hostPairing.member, null, 'subscribing again does not restart it')
})
