// "Use my Mac" between two real devices of one vault, over the gated peer link.
import test from 'brittle'
import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'

import NoteBase from '../backend/NoteBase.js'
import { withTestnet } from './helpers/testnet.js'

const encryption = b4a.toString(b4a.alloc(32).fill('ai-offload-key'), 'hex')
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const tmp = (name) =>
  path.join(tmpdir(), 'pear-notes-offload-' + name + '-' + Math.random().toString(36).slice(2))

function cleanup(...paths) {
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true })
    } catch {}
  }
}

async function until(predicate, timeoutMs) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return true
    await wait(200)
  }
  return false
}

async function pairDevices(t, host, joiner) {
  await host.addSyncedDevice({
    key: 'host-device',
    value: {
      title: 'Studio Mac',
      deviceType: 'desktop',
      platform: 'darwin',
      localKey: host.localKeyHex,
      addedAt: Date.now(),
      updatedAt: Date.now()
    }
  })
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

test('a phone asks a linked desktop and gets the answer back', { timeout: 240000 }, async (t) => {
  await withTestnet(t)
  const hostStorage = tmp('host')
  const joinerStorage = tmp('joiner')
  const host = new NoteBase({ storage: hostStorage, encryption })
  const joiner = new NoteBase({ storage: joinerStorage, encryption })
  t.teardown(async () => {
    await host.destroy().catch(() => {})
    await joiner.destroy().catch(() => {})
    cleanup(hostStorage, joinerStorage)
  })
  await host.ready()
  await joiner.ready()
  await pairDevices(t, host, joiner)

  host.on('ai-offload-job', (job) => {
    host.aiOffload.reply(job.jobId, { text: `Answer to: ${job.payload.question}` })
    host.aiOffload.reply(job.jobId, { text: `Answer to: ${job.payload.question} [1]`, done: true })
  })
  t.absent((await joiner.getAiOffloadStatus()).available, 'nothing is offered before the switch')
  host.setAiOffloadServing(true)
  t.ok(
    await until(async () => (await joiner.getAiOffloadStatus()).available, 30000),
    'phone sees it'
  )
  await until(async () => (await joiner.getAiOffloadStatus()).deviceTitle, 15000)
  t.is((await joiner.getAiOffloadStatus()).deviceTitle, 'Studio Mac')

  const started = Date.now()
  const texts = []
  const { done } = joiner.aiOffload.run({
    kind: 'vault-answer',
    payload: { question: 'when is the dentist?', sources: [] },
    onText: (text) => texts.push(text)
  })
  t.is((await done).text, 'Answer to: when is the dentist? [1]')
  t.comment(`round trip ${Date.now() - started} ms on the local testnet`)
  t.ok(texts.length >= 1)

  host.setAiOffloadServing(false)
  t.ok(
    await until(async () => !(await joiner.getAiOffloadStatus()).available, 15000),
    'turning the switch off is seen by the phone'
  )
})
