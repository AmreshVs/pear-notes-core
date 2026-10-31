import test from 'brittle'
import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'
import { Duplex } from 'streamx'
import FramedStream from 'framed-stream'
import HRPC from '../spec/hrpc/index.js'
import * as notesApi from '../backend/notesApi.js'
import SubscriptionTracker from '../backend/subscriptionTracker.js'
import { withTestnet } from './helpers/testnet.js'

const encryption = b4a.toString(b4a.alloc(32).fill('subscription-recovery'), 'hex')
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function pipePair() {
  let a = null
  let b = null
  a = new Duplex({
    write(data, cb) {
      b.push(data)
      cb(null)
    }
  })
  b = new Duplex({
    write(data, cb) {
      a.push(data)
      cb(null)
    }
  })
  return [a, b]
}

async function waitFor(label, predicate, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return
    await sleep(100)
  }
  throw new Error('timed out waiting for ' + label)
}

// Mirrors onCommandSubscribeNote in backend/main.js.
function serveNoteSubscriptions(server) {
  const watchers = []
  server.onCommandSubscribeNote(async (stream) => {
    const key = stream.data.key
    const watcher = await notesApi.susbscribeNote({ key })
    watchers.push(watcher)
    if (watcher.node?.value) stream.write({ data: watcher.node.value })
    watcher.on('update', async () => {
      const data = await notesApi.getSingleNote({ key })
      if (data) stream.write({ data })
    })
    return async () => {
      stream.destroy()
      await watcher.close()
    }
  })
  return watchers
}

// Mirrors apiSubscribeCall(..., { retry: true }) on the frontend.
function subscribeWithRetry(client, key, onTitle) {
  let stopped = false
  let current = null
  let reconnects = 0
  const open = () => {
    if (stopped) return
    current = client.commandSubscribeNote({ key })
    current.on('data', ({ data }) => onTitle(data?.title))
    current.on('error', () => {})
    current.on('close', () => {
      if (stopped) return
      reconnects++
      setTimeout(open, 200)
    })
  }
  open()
  return {
    get reconnects() {
      return reconnects
    },
    stop() {
      stopped = true
      current?.destroy()
    }
  }
}

test('subscriptions survive the base being reopened after an autobase error', async (t) => {
  await withTestnet(t)
  const storage = path.join(
    tmpdir(),
    'pear-notes-sub-recovery-' + Math.random().toString(36).slice(2)
  )
  await notesApi.ready({ storage, encryption })
  t.teardown(async () => {
    await notesApi.notesBase?.destroy().catch(() => {})
    fs.rmSync(storage, { recursive: true, force: true })
  })
  notesApi.notesBase.on('base-error', () => {})

  const [left, right] = pipePair()
  const client = new HRPC(new FramedStream(left))
  const server = new HRPC(new FramedStream(right))
  serveNoteSubscriptions(server)
  const tracker = new SubscriptionTracker(server)
  tracker.install()
  let reopenedCloses = 0
  const stopListening = notesApi.onBaseReopened(() => {
    reopenedCloses += tracker.closeBaseBound()
  })
  t.teardown(stopListening)

  const key = await notesApi.insertNote({ title: 'v1', note: '<p>v1</p>', folderKey: 'f' })
  let lastTitle = null
  const sub = subscribeWithRetry(client, key, (title) => {
    lastTitle = title
  })
  t.teardown(() => sub.stop())

  await waitFor('initial value', () => lastTitle === 'v1')
  await notesApi.updateNote({ key, title: 'v2', note: '<p>v2</p>', folderKey: 'f' })
  await waitFor('edit before recovery', () => lastTitle === 'v2')
  t.pass('edit before recovery reaches the client')

  let recovered = false
  notesApi.notesBase.once('base-recovered', () => {
    recovered = true
  })
  notesApi.notesBase.autobase.emit('error', new Error('synthetic autobase failure'))
  await waitFor('base recovery', () => recovered)
  t.ok(reopenedCloses >= 1, 'the stale subscription was closed on reopen (' + reopenedCloses + ')')

  await waitFor('client reconnect', () => sub.reconnects >= 1)
  await sleep(500)
  await notesApi.updateNote({ key, title: 'v3', note: '<p>v3</p>', folderKey: 'f' })
  await waitFor('edit after recovery', () => lastTitle === 'v3', 15000)
  t.pass('edit after recovery reaches the client without a restart')
})

test('a subscription the client closes releases its backend watcher', async (t) => {
  await withTestnet(t)
  const storage = path.join(tmpdir(), 'pear-notes-sub-leak-' + Math.random().toString(36).slice(2))
  await notesApi.ready({ storage, encryption })
  t.teardown(async () => {
    await notesApi.notesBase?.destroy().catch(() => {})
    fs.rmSync(storage, { recursive: true, force: true })
  })

  const [left, right] = pipePair()
  const client = new HRPC(new FramedStream(left))
  const server = new HRPC(new FramedStream(right))
  const watchers = serveNoteSubscriptions(server)
  const tracker = new SubscriptionTracker(server)
  tracker.install()

  const key = await notesApi.insertNote({ title: 'leak', note: '<p>leak</p>', folderKey: 'f' })
  const streams = []
  for (let i = 0; i < 20; i++) {
    const stream = client.commandSubscribeNote({ key })
    stream.on('error', () => {})
    streams.push(stream)
  }
  await waitFor('all subscriptions served', () => tracker.size === 20)

  for (const stream of streams) stream.destroy()
  await waitFor('backend released every subscription', () => tracker.size === 0)
  await sleep(300)
  const stillOpen = watchers.filter((w) => !w.closed).length
  t.is(stillOpen, 0, 'every watcher was closed')
})
