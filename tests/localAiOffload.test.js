import test from 'brittle'

import { backendApi } from '../backend/api.js'
import {
  AI_OFFLOAD_KIND,
  createAiOffloadRunner,
  serveAiOffload,
  setAiOffloadUseMac,
  withAiOffload
} from '../store/services/localAiOffload.js'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function patch(t, methods) {
  const saved = {}
  for (const [name, fn] of Object.entries(methods)) {
    saved[name] = backendApi[name]
    backendApi[name] = fn
  }
  t.teardown(() => Object.assign(backendApi, saved))
}

function withAbortController(t) {
  if (globalThis.AbortController) return
  globalThis.AbortController = class {
    signal = { aborted: false }
    abort() {
      this.signal.aborted = true
    }
  }
  t.teardown(() => {
    delete globalThis.AbortController
  })
}

function messages(list) {
  return (async function* () {
    for (const message of list) {
      await wait(1)
      yield message
    }
  })()
}

function pushStream() {
  const queue = []
  let wake = null
  let ended = false
  const stream = {
    push(message) {
      queue.push(message)
      wake?.()
    },
    destroy() {
      ended = true
      wake?.()
    },
    async *[Symbol.asyncIterator]() {
      while (!ended) {
        if (queue.length) yield queue.shift()
        else await new Promise((resolve) => (wake = resolve))
      }
    }
  }
  return stream
}

test('with the switch off, everything runs on this device', async (t) => {
  setAiOffloadUseMac(false)
  patch(t, { aiOffloadRun: () => t.fail('nothing should be sent') })
  t.is(await withAiOffload({ kind: 'ask-note', payload: {}, local: async () => 'local' }), 'local')
})

test('a desktop answer streams through, and an early failure falls back here', async (t) => {
  setAiOffloadUseMac(true)
  t.teardown(() => setAiOffloadUseMac(false))
  let reply = [{ text: 'Oct' }, { text: 'Oct 21', done: true }]
  patch(t, { aiOffloadRun: () => messages(reply) })
  const seen = []
  const answer = await withAiOffload({
    kind: 'vault-answer',
    payload: { question: 'q' },
    onProgress: (event) => seen.push(event.text),
    local: async () => 'local'
  })
  t.is(answer, 'Oct 21')
  t.alike(seen, ['Oct'])

  reply = [{ error: 'unavailable' }]
  t.is(await withAiOffload({ kind: 'ask-note', payload: {}, local: async () => 'local' }), 'local')

  reply = [{ error: 'on-battery' }]
  t.is(await withAiOffload({ kind: 'ask-note', payload: {}, local: async () => 'local' }), 'local')

  reply = [{ text: 'Half' }, { error: 'offline', started: true }]
  await t.exception(
    withAiOffload({ kind: 'ask-note', payload: {}, local: async () => 'local' }),
    /offline/,
    'once text has arrived, a failure is not retried locally'
  )

  reply = [{ text: 'Half' }, { error: 'cancelled', started: true }]
  t.is(
    await withAiOffload({ kind: 'ask-note', payload: {}, local: async () => 'local' }),
    'Half',
    'a cancel keeps what was written, like a local cancel'
  )
})

test('the desktop runner passes sanitised input and answers vault Asks itself', async (t) => {
  const calls = []
  const run = createAiOffloadRunner({
    askVault: async (...args) => calls.push(['vault', ...args]) && 'v [1]',
    askAboutNote: async (...args) => calls.push(['note', ...args]) && 'n',
    runNoteTask: async (...args) => calls.push(['task', ...args]) && 's',
    retrieveVaultSources: async (question, turns, folderKey) =>
      calls.push(['retrieve', folderKey]) && question === 'nothing'
        ? []
        : [{ n: 1, noteKey: 'k', title: 'Dentist', text: 'Oct 21' }],
    getFeatureConfig: () => ({ tier: 'best' })
  })
  await run({ kind: AI_OFFLOAD_KIND.VAULT_ANSWER, payload: { question: 5, sources: 'x' } })
  t.alike(calls[0].slice(0, 5), ['vault', '', [], [], { tier: 'best' }])
  await run({ kind: AI_OFFLOAD_KIND.NOTE_TASK, payload: { task: 'rewrite', text: 'hi' } })
  t.is(calls[1][1], 'rewrite', 'a phone without a model can borrow the writing tools too')
  const asked = await run({ kind: AI_OFFLOAD_KIND.VAULT_ASK, payload: { question: 'dentist?' } })
  t.is(asked.text, 'v [1]')
  t.alike(calls[2], ['retrieve', ''], 'no folderKey asks the whole vault')
  await run({ kind: AI_OFFLOAD_KIND.VAULT_ASK, payload: { question: 'nothing', folderKey: 'f1' } })
  t.alike(calls[4], ['retrieve', 'f1'])
  t.is(asked.data.sources[0].title, 'Dentist')
  t.alike(await run({ kind: AI_OFFLOAD_KIND.VAULT_ASK, payload: { question: 'nothing' } }), {
    text: '',
    data: { sources: [] }
  })
  await t.exception(run({ kind: 'paint', payload: {} }), /unsupported/)
})

test('computed numbers from a tool-calling desktop reach the phone in the reply data', async (t) => {
  const run = createAiOffloadRunner({
    askVault: async () => ({ text: 'Each pays £51.26 [1].', toolNumbers: ['51', '26'] }),
    askAboutNote: async () => '',
    runNoteTask: async () => '',
    retrieveVaultSources: async () => [{ n: 1, noteKey: 'k', title: 'Dinner', text: '£186.40' }],
    getFeatureConfig: () => ({})
  })
  const asked = await run({ kind: AI_OFFLOAD_KIND.VAULT_ASK, payload: { question: 'each?' } })
  t.is(asked.text, 'Each pays £51.26 [1].')
  t.alike(asked.data.toolNumbers, ['51', '26'])
  t.is(
    await run({ kind: AI_OFFLOAD_KIND.VAULT_ANSWER, payload: { question: 'each?' } }),
    'Each pays £51.26 [1].',
    'the phone-retrieved path still gets plain text'
  )
})

test('the desktop serves jobs one at a time and reports when it cannot', async (t) => {
  withAbortController(t)
  const jobs = pushStream()
  const replies = []
  const serving = []
  const activities = []
  let onBattery = false
  patch(t, {
    aiOffloadJobs: () => jobs,
    aiOffloadServe: async ({ serving: value }) => serving.push(value),
    aiOffloadReply: (reply) => replies.push(reply)
  })
  let release = null
  const handle = serveAiOffload({
    runJob: ({ onProgress }) =>
      new Promise((resolve) => {
        onProgress({ type: 'text', text: 'partial' })
        release = () => resolve('full answer')
      }),
    canServe: async () => (onBattery ? 'on-battery' : null),
    onActivity: (activity) => activities.push(activity)
  })
  t.teardown(() => handle.stop())
  await wait(20)
  t.alike(serving, [true])

  jobs.push({ jobId: 'a', kind: 'ask-note', payload: '{}', deviceTitle: 'iPhone' })
  jobs.push({ jobId: 'b', kind: 'ask-note', payload: '{}' })
  await wait(150)
  t.alike(replies, [{ jobId: 'a', text: 'partial' }], 'b waits while a runs')
  release()
  await wait(20)
  t.alike(replies[1], { jobId: 'a', text: 'full answer', done: true, data: undefined })
  t.alike(activities[0], { active: true, activeDevice: 'iPhone' }, 'the Mac shows who it answers')
  t.is(activities[1].lastDevice, 'iPhone')
  t.is(activities[1].active, false)

  onBattery = true
  release()
  jobs.push({ jobId: 'c', kind: 'ask-note', payload: '{}' })
  await wait(50)
  t.alike(replies.at(-1), { jobId: 'c', error: 'on-battery' })
  t.is(serving.at(-1), false, 'and tells phones it stopped serving')
  t.is(
    activities.filter((activity) => activity.active).length,
    2,
    'a refused job is not reported as answered'
  )
})
