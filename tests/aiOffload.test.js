import test from 'brittle'
import NoiseSecretStream from '@hyperswarm/secret-stream'
import b4a from 'b4a'

import { AI_OFFLOAD_ERROR, AiOffload } from '../backend/vault/aiOffload.js'
import { VERDICT } from '../backend/vault/memberGate.js'

const discoveryKey = b4a.alloc(32, 9)
const phoneWriter = b4a.alloc(32, 1)
const macWriter = b4a.alloc(32, 2)
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function until(predicate, timeoutMs = 3000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true
    await wait(20)
  }
  return false
}

async function linked({
  macVerdict = VERDICT.MEMBER,
  phoneVerdict = VERDICT.MEMBER,
  ...options
} = {}) {
  const a = new NoiseSecretStream(true)
  const b = new NoiseSecretStream(false)
  a.rawStream.pipe(b.rawStream).pipe(a.rawStream)
  await Promise.all([a.opened, b.opened])
  const jobs = []
  const cancelled = []
  const statuses = []
  const mac = new AiOffload({
    discoveryKey,
    verdict: async () => macVerdict,
    onJob: (job) => jobs.push(job),
    onJobCancel: (jobId) => cancelled.push(jobId)
  })
  const phone = new AiOffload({
    discoveryKey,
    verdict: async () => phoneVerdict,
    onStatus: (status) => statuses.push(status),
    ...options
  })
  await Promise.all([mac.attach(a, phoneWriter), phone.attach(b, macWriter)])
  const close = () => {
    a.destroy()
    b.destroy()
  }
  return { mac, phone, jobs, cancelled, statuses, a, b, close }
}

test('a serving desktop streams an answer back to a member phone', async (t) => {
  const { mac, phone, jobs, close } = await linked()
  t.teardown(close)
  mac.setServing(true)
  t.ok(await until(() => phone.status().available), 'phone sees the desktop')

  const texts = []
  const { done } = phone.run({
    kind: 'vault-answer',
    payload: { question: 'when is the dentist?', sources: [] },
    onText: (text) => texts.push(text)
  })
  t.ok(await until(() => jobs.length === 1))
  t.is(jobs[0].kind, 'vault-answer')
  t.is(jobs[0].payload.question, 'when is the dentist?')
  mac.reply(jobs[0].jobId, { text: 'Oct 21' })
  mac.reply(jobs[0].jobId, { text: 'Oct 21 at 9:15 [1]', done: true })
  t.is((await done).text, 'Oct 21 at 9:15 [1]')
  t.alike(texts, ['Oct 21', 'Oct 21 at 9:15 [1]'])
})

test('nothing is offered to a peer that is not a current member', async (t) => {
  const { mac, phone, close } = await linked({
    macVerdict: VERDICT.OPEN,
    phoneVerdict: VERDICT.OPEN
  })
  t.teardown(close)
  mac.setServing(true)
  await wait(200)
  t.absent(phone.status().available)
  const { done } = phone.run({ kind: 'vault-answer', payload: {} })
  await t.exception(done, /unavailable/)
})

test('the desktop refuses unknown kinds, oversize jobs and too many at once', async (t) => {
  const { mac, phone, jobs, close } = await linked()
  t.teardown(close)
  mac.setServing(true)
  await until(() => phone.status().available)

  const codeOf = (promise) =>
    promise.then(
      () => null,
      (error) => error.code
    )
  t.is(
    await codeOf(phone.run({ kind: 'write-note', payload: {} }).done),
    AI_OFFLOAD_ERROR.UNSUPPORTED
  )
  t.is(
    await codeOf(phone.run({ kind: 'ask-note', payload: { note: 'x'.repeat(300 * 1024) } }).done),
    AI_OFFLOAD_ERROR.TOO_LARGE
  )
  phone.run({ kind: 'ask-note', payload: {} }).done.catch(() => {})
  phone.run({ kind: 'ask-note', payload: {} }).done.catch(() => {})
  await until(() => jobs.length === 2)
  t.is(await codeOf(phone.run({ kind: 'ask-note', payload: {} }).done), AI_OFFLOAD_ERROR.BUSY)

  mac.setServing(false)
  await until(() => !phone.status().available)
  t.absent(phone.status().available, 'turning the switch off is seen at once')
})

test('a cancel, a dropped connection and a silent desktop each end the run', async (t) => {
  const { mac, phone, jobs, cancelled, a } = await linked({
    firstReplyMs: 300,
    keepaliveMs: 100,
    waitMs: 600
  })
  mac.setServing(true)
  await until(() => phone.status().available)

  const first = phone.run({ kind: 'note-task', payload: { task: 'noteSummary' } })
  await until(() => jobs.length === 1)
  phone.cancel(first.id)
  await t.exception(first.done, /cancelled/)
  t.ok(await until(() => cancelled.length === 1), 'the desktop hears the cancel')

  const askedAt = Date.now()
  const silent = phone.run({ kind: 'note-task', payload: {} })
  const timedOut = await silent.done.catch((error) => error)
  t.is(timedOut.code, AI_OFFLOAD_ERROR.TIMEOUT)
  t.is(timedOut.started, false, 'no text yet, so the phone can fall back')
  t.ok(Date.now() - askedAt >= 550, 'acks kept it alive past the first-reply timeout')

  const dropped = phone.run({ kind: 'note-task', payload: {} })
  await until(() => jobs.length === 3)
  mac.reply(jobs[2].jobId, { text: 'Half an answer' })
  await wait(50)
  a.destroy()
  const offline = await dropped.done.catch((error) => error)
  t.is(offline.code, AI_OFFLOAD_ERROR.OFFLINE)
  t.is(offline.started, true, 'text had arrived, so the phone must not restart locally')
  t.ok(await until(() => !phone.status().available))
})

test('a desktop that stops answering probes is no longer offered', async (t) => {
  const { mac, phone, statuses, close } = await linked({ probeEveryMs: 60000, probeTimeoutMs: 100 })
  t.teardown(close)
  mac.setServing(true)
  t.ok(await until(() => phone.status().available), 'phone sees the desktop')

  const answer = mac._onRequest
  mac._onRequest = () => {}
  phone.probe()
  t.ok(await until(() => !phone.status().available), 'silent desktop drops out')
  t.is(statuses.at(-1).available, false)
  const { done } = phone.run({ kind: 'vault-answer', payload: {} })
  await t.exception(done, /unavailable/)

  mac._onRequest = answer
  phone.probe()
  t.ok(await until(() => phone.status().available), 'answering desktop comes back')
})
