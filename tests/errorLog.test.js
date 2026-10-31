import test from 'brittle'
import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'
import { EventEmitter } from 'bare-events'
import NoteBase from '../backend/NoteBase.js'
import {
  ErrorLog,
  captureDependencyConsole,
  captureFatalErrors,
  errorLog
} from '../backend/errorLog.js'
import * as log from '../log.js'
import { formatDebugReport, formatErrorLog } from '../utils.js'
import { backendApi } from '../backend/api.js'
import { setRPC } from '../rpc.js'
import { withTestnet } from './helpers/testnet.js'

const tempDir = () => path.join(tmpdir(), 'errlog-' + Math.random().toString(36).slice(2, 9))
const KEY = 'ab'.repeat(32)

test('every log level reaches the log even when nothing is printed', (t) => {
  const store = new ErrorLog()
  log.setSink((level, args) => store.record(level, args))
  t.teardown(() => log.setSink(null))
  log.setLevel('silent')
  t.teardown(() => log.setLevel(null))

  log.error('[view] backfill failed', new Error(`missing block on ${KEY}`))
  log.warn('[autobase] warning', { key: KEY })
  log.debug('[swarm] peer connected')

  const [debug, warning, error] = store.entries()
  t.is(error.level, 'error')
  t.is(error.message, '[view] backfill failed')
  t.ok(error.detail.includes('missing block on abababab…'), 'keys are shortened')
  t.absent(error.detail.includes(KEY), 'and never stored in full')
  t.is(warning.level, 'warn')
  t.is(debug.level, 'debug', 'debug output is recorded too')
  t.is(error.source, 'backend')
})

test('a repeating error is one entry with a count', (t) => {
  const store = new ErrorLog()
  for (let i = 0; i < 146; i++)
    store.record('error', ['[startup reclaim]', new Error('SESSION_CLOSED')])
  t.is(store.entries().length, 1)
  t.is(store.entries()[0].count, 146)
})

test('the log survives a restart and can be cleared', (t) => {
  const dir = tempDir()
  t.teardown(() => fs.rmSync(dir, { recursive: true, force: true }))

  const first = new ErrorLog()
  first.open(dir)
  first.setEnabled(true)
  first.record('error', ['before the restart'])
  first.flushSync()

  const second = new ErrorLog()
  second.record('error', ['during boot, before open'])
  second.open(dir)
  t.alike(
    second.entries().map((e) => e.message),
    ['during boot, before open', 'before the restart', '[log] recording turned on'],
    'entries from before the restart are kept, newest first'
  )

  second.clear()
  const third = new ErrorLog()
  third.open(dir)
  t.is(third.entries().length, 0, 'clearing empties the file too')
})

test('recording is off by default and nothing is kept', (t) => {
  const dir = tempDir()
  t.teardown(() => fs.rmSync(dir, { recursive: true, force: true }))

  const store = new ErrorLog()
  store.record('error', ['during boot, before open'])
  store.open(dir)
  t.is(store.enabled, false)
  t.is(store.entries().length, 0, 'what was held during boot is dropped')

  store.record('error', ['after open'])
  store.add({ at: 1, level: 'error', source: 'app', message: 'from the app', detail: '' })
  store.flushSync()
  t.is(store.entries().length, 0, 'backend and app entries are both ignored')

  const reopened = new ErrorLog()
  reopened.open(dir)
  t.is(reopened.entries().length, 0, 'and nothing reached the file')
})

test('logs from before the switch are cleared once on a device left off', (t) => {
  const legacy = JSON.stringify([
    { at: 1, lastAt: 1, count: 1, level: 'error', source: 'backend', message: 'old', detail: '' }
  ])
  const seed = (settings) => {
    const dir = tempDir()
    t.teardown(() => fs.rmSync(dir, { recursive: true, force: true }))
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'error-log.json'), legacy)
    if (settings) fs.writeFileSync(path.join(dir, 'error-log-settings.json'), JSON.stringify(settings))
    return dir
  }

  for (const settings of [null, { enabled: false }]) {
    const dir = seed(settings)
    const store = new ErrorLog()
    store.open(dir)
    t.is(store.entries().length, 0, 'the old entries are gone')
    t.absent(fs.existsSync(path.join(dir, 'error-log.json')), 'and so is the file')
  }

  const on = seed({ enabled: true })
  const kept = new ErrorLog()
  kept.open(on)
  t.is(kept.entries().length, 1, 'a device with recording on keeps its log')

  const once = seed({ enabled: true })
  const first = new ErrorLog()
  first.open(once)
  first.setEnabled(false)
  const second = new ErrorLog()
  second.open(once)
  t.is(second.entries().length, 1, 'it runs once: turning it off later keeps the log')
})

test('the switch survives a restart and turning it off stops recording', (t) => {
  const dir = tempDir()
  t.teardown(() => fs.rmSync(dir, { recursive: true, force: true }))

  const first = new ErrorLog()
  first.open(dir)
  t.is(first.setEnabled(true), true)
  first.record('error', ['while on'])
  first.flushSync()

  const second = new ErrorLog()
  second.open(dir)
  t.is(second.enabled, true, 'still on after a restart')
  second.setEnabled(false)
  second.record('error', ['while off'])
  t.alike(
    second.entries().map((e) => e.message),
    ['while on', '[log] recording turned on'],
    'turning it off keeps what was recorded and adds nothing new'
  )

  const third = new ErrorLog()
  third.open(dir)
  t.is(third.enabled, false, 'still off after a restart')
})

test('a hypercore conflict printed to the console is recorded as an error', (t) => {
  const printed = []
  const target = { log: (...args) => printed.push(args) }
  captureDependencyConsole(target)
  const before = errorLog.list.length

  target.log('[hypercore] conflict detected in abcd (writable=false,quorum=1)')
  target.log('plain app output')

  t.is(printed.length, 2, 'everything still reaches the console')
  t.is(errorLog.list.length, before + 1, 'only the dependency line is recorded')
  const entry = errorLog.list[errorLog.list.length - 1]
  t.is(entry.level, 'error')
  t.ok(entry.message.includes('conflict detected'))
})

test('a fatal error is recorded and then re-raised unchanged', (t) => {
  const runtime = new EventEmitter()
  const rethrown = []
  const before = errorLog.list.length
  captureFatalErrors(runtime, (err) => rethrown.push(err))

  const boom = new Error('boom')
  runtime.emit('unhandledRejection', boom)

  t.is(errorLog.list.length, before + 1, 'recorded')
  t.is(errorLog.list[errorLog.list.length - 1].level, 'fatal')
  t.alike(rethrown, [boom], 're-raised')
  t.is(runtime.listenerCount('unhandledRejection'), 0, 'with our listeners removed')
  t.is(runtime.listenerCount('uncaughtException'), 0)
})

test('a fast-forward is recorded, and diagnostics show writers', async (t) => {
  await withTestnet(t)
  const storage = tempDir()
  const base = new NoteBase({
    storage,
    encryption: b4a.toString(b4a.alloc(32).fill('err-log'), 'hex')
  })
  await base.ready()
  t.teardown(async () => {
    await base.destroy().catch(() => {})
    fs.rmSync(storage, { recursive: true, force: true })
  })
  await base.addNote({
    key: 'n1',
    value: { title: 'T', note: '<p>x</p>', addedAt: 1, updatedAt: 1 }
  })

  base.autobase.emit('fast-forward', 20, 4)
  await new Promise((resolve) => setTimeout(resolve, 50))

  t.alike(
    { from: base._lastFastForward?.from, to: base._lastFastForward?.to },
    { from: 4, to: 20 },
    'the fast-forward is remembered'
  )

  const info = await base.getDebugInfo()
  t.is(info.autobase.lastFastForwardTo, 20)
  t.ok(info.writers.length >= 1, 'writers are listed')
  t.ok(Number.isFinite(info.writers[0].linearized), 'with how far each one has been applied')

  const report = formatDebugReport(info)
  t.ok(report.includes('## Writers'), 'the report has a writers section')
  t.ok(report.includes('lastFastForwardAt'), 'and the fast-forward time')

  const text = formatErrorLog({
    entries: [{ at: 1, lastAt: 2, count: 3, level: 'error', message: 'm', detail: 'd' }]
  })
  t.ok(text.includes('ERROR  backend  x3'), 'the report shows level, source and repeats')
})

test('a full log drops debug lines before errors', (t) => {
  const store = new ErrorLog({ max: 3 })
  store.record('error', ['first error'])
  store.record('debug', ['chatter 1'])
  store.record('debug', ['chatter 2'])
  store.record('error', ['second error'])
  t.alike(
    store.entries().map((e) => e.message),
    ['second error', 'chatter 2', 'first error'],
    'the oldest debug line went, the older error stayed'
  )
})

test('app logs are batched to the backend and tagged with their source', async (t) => {
  const sent = []
  setRPC({
    commandRecordLogs: async ({ json }) => {
      sent.push(...JSON.parse(json))
      return { done: true }
    },
    commandGetErrorLog: async () => ({ json: JSON.stringify({ entries: [] }) })
  })
  backendApi.captureAppLogs()
  t.teardown(() => log.setSink(null))

  log.error('updateNoteSaga: the backend did not save the note', { key: KEY })
  log.debug('[subscription] note keys received')
  await backendApi.getErrorLog()

  t.is(sent.length, 2, 'reading the log flushes what the app queued')
  t.is(sent[0].level, 'error')
  t.ok(sent[0].detail.includes('abababab…'), 'and app logs are scrubbed before they leave')

  const store = new ErrorLog()
  store.add({ at: 1, level: 'error', source: 'app', message: 'from the app', detail: '' })
  t.is(store.entries()[0].source, 'app')
})

test('printf-style placeholders are filled in', (t) => {
  const store = new ErrorLog()
  store.record('debug', ['[NoteBase] ready autobase=%s local=%s', 'aaa', 'bbb', { extra: 1 }])
  const [entry] = store.entries()
  t.is(entry.message, '[NoteBase] ready autobase=aaa local=bbb')
  t.is(entry.detail, '{"extra":1}', 'arguments left over stay in the detail')
})
