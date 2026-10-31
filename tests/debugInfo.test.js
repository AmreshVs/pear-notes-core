import test from 'brittle'
import b4a from 'b4a'
import fs from 'bare-fs'
import path from 'bare-path'
import { tmpdir } from 'bare-os'
import FramedStream from 'framed-stream'
import { Duplex } from 'streamx'

import HRPC from '../spec/hrpc/index.js'
import { decode, encode } from '../spec/hyperschema/index.js'
import NoteBase from '../backend/NoteBase.js'
import { appBoot } from '../bootTimeline.js'
import * as log from '../log.js'
import { formatDebugReport, redactFileName, redactHomePath, shortenHex } from '../utils.js'

import { withTestnet } from './helpers/testnet.js'

const encryptionHex = b4a.toString(b4a.alloc(32).fill('debug-info-test-key'), 'hex')

const storagePath = (name) =>
  path.join(tmpdir(), 'pn-debug-' + name + '-' + Math.random().toString(36).slice(7))

const roundTrip = (name, value) => decode(name, encode(name, value))

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function settleIndexers(base) {
  const start = Date.now()
  while (base.getIndexerKeys().length === 0 && Date.now() - start < 5000) await wait(50)
}

async function seedWrite(base, title) {
  const folders = await base.getAllFolders()
  await base.addNote({
    key: `seed-${title}`,
    value: { title, note: 'seed', folderKey: folders.length ? folders[0].key : 'f', updatedAt: 1 }
  })
}

async function openBase(t, name, { seed = true } = {}) {
  const storage = storagePath(name)
  const base = new NoteBase({ storage, encryption: encryptionHex })
  await base.ready()
  if (seed) {
    await seedWrite(base, 'Seed note')
    await settleIndexers(base)
  }
  t.teardown(async () => {
    await base._close().catch(() => null)
    try {
      fs.rmSync(storage, { recursive: true, force: true })
    } catch (e) {
      console.error('debugInfo teardown', e.message)
    }
  })
  return base
}

test('debug info - reports the autobase numbers the boot cost depends on', async (t) => {
  await withTestnet(t)
  const base = await openBase(t, 'autobase')

  const info = await base.getDebugInfo(false)

  t.ok(info.capturedAt > 0, 'snapshot is stamped')
  t.is(info.heavy, false, 'light snapshot is flagged as such')
  t.is(typeof info.autobase.length, 'number', 'oplog length is reported')
  t.is(typeof info.autobase.indexedLength, 'number', 'indexed length is reported')
  t.is(
    info.autobase.backlog,
    info.autobase.length - info.autobase.indexedLength,
    'backlog is length minus indexedLength - the number that drives boot time'
  )
  t.is(info.autobase.writable, true, 'a fresh local base is writable')
  t.is(info.autobase.indexerCount, 1, 'a solo vault has exactly one indexer')
  t.is(info.autobase.majority, 1, 'majority for one indexer is one')
  t.ok(info.writers.some((writer) => writer.isIndexer), 'the only device is the sync leader')
  t.is(info.autobase.autobaseKey.length, 64, 'autobase key is full hex')
  t.is(info.autobase.localKey.length, 64, 'local writer key is full hex')
  t.ok(Number.isInteger(info.autobase.viewVersion), 'hyperbee view version is readable')
})

test('debug info - majority tracks the indexer count', async (t) => {
  await withTestnet(t)
  const base = await openBase(t, 'majority')

  const info = await base.getDebugInfo(false)
  const computed = (n) => (n >>> 1) + 1

  t.ok(info.autobase.indexerCount > 0, 'the indexer set is known')
  t.is(info.autobase.majority, computed(info.autobase.indexerCount), 'majority formula matches')
  t.is(computed(2), 2, 'two indexers need both online - the documented stall condition')
  t.is(computed(3), 2, 'three indexers tolerate one being offline')
})

test('debug info - never leaks the vault encryption key or note content', async (t) => {
  await withTestnet(t)
  const base = await openBase(t, 'redaction')

  const folders = await base.getAllFolders()
  await base.addNote({
    key: 'secret',
    value: {
      title: 'Supersecret launch plan',
      note: 'The body should never appear in diagnostics',
      folderKey: folders.length ? folders[0].key : ''
    }
  })

  const info = await base.getDebugInfo(true)
  const serialized = JSON.stringify(info)
  const report = formatDebugReport(info)

  t.absent(serialized.includes(encryptionHex), 'raw encryption key is absent from the snapshot')
  t.absent(
    serialized.includes(b4a.toString(base.autobase.encryptionKey, 'hex')),
    'the adopted vault key is absent too'
  )
  t.absent(serialized.includes('Supersecret launch plan'), 'note titles are absent')
  t.absent(serialized.includes('should never appear'), 'note bodies are absent')
  t.absent(report.includes(encryptionHex), 'the formatted report leaks no key either')
  t.absent(report.includes('Supersecret launch plan'), 'the formatted report leaks no titles')

  t.is(info.autobase.encryptionFingerprint.length, 8, 'a short fingerprint is reported instead')
  t.ok(info.storage.noteCount >= 1, 'the note is counted, not named')
})

test('debug info - heavy pass adds storage and activity totals', async (t) => {
  await withTestnet(t)
  const base = await openBase(t, 'heavy')

  const light = await base.getDebugInfo(false)
  t.is(light.storage.attachmentCount, undefined, 'light pass skips the disk walk')
  t.is(light.storage.activityCount, undefined, 'light pass skips the activity scan')

  const heavy = await base.getDebugInfo(true)
  t.is(heavy.heavy, true, 'heavy snapshot is flagged')
  t.absent('totalOnDiskBytes' in heavy.storage, 'byte totals are left to the Storage screen')
  t.is(typeof heavy.storage.activityCount, 'number', 'activity count is reported')
  t.is(typeof heavy.storage.folderCount, 'number', 'folder count is reported')
  t.ok(heavy.storage.noteCount > 0, 'the seed note is counted')
  t.is(heavy.storage.attachmentCount, 0, 'a note without attachments is not counted as one')
})

test('debug info - survives a base that is not open', async (t) => {
  await withTestnet(t)
  const base = await openBase(t, 'closed', { seed: false })
  await base._close()

  const info = await base.getDebugInfo(true)

  t.is(info.autobase.opened, false, 'a closed base reports itself closed rather than throwing')
  t.is(info.autobase.length, null, 'missing numbers come back null, not undefined')
  t.ok(formatDebugReport(info).length > 0, 'the report still formats')
})

test('debug info - the boot timeline goes to the log, not to diagnostics', async (t) => {
  await withTestnet(t)
  const base = await openBase(t, 'timeline')
  const info = await base.getDebugInfo(false)
  t.absent('backendBoot' in info, 'diagnostics no longer carries the timeline')

  const logged = []
  log.setSink((level, args) => logged.push({ level, text: String(args[0]) }))
  t.teardown(() => log.setSink(null))
  appBoot.start()
  appBoot.mark('first mark')
  appBoot.report()
  t.ok(
    logged.some(
      (entry) => entry.text.startsWith('[boot] app timeline') && entry.text.includes('first mark')
    ),
    'the timeline is written to the log, which the Logs screen records'
  )
})

test('debug info wire - the JSON payload survives the round trip', async (t) => {
  const request = roundTrip('@notes/command-get-debug-info-request', { heavy: true })
  t.is(request.heavy, true, 'heavy flag survives')

  const payload = JSON.stringify({ autobase: { length: 9501, indexedLength: 2685 } })
  const response = roundTrip('@notes/command-get-debug-info-response', { json: payload })
  t.is(response.json, payload, 'payload survives verbatim')
  t.is(JSON.parse(response.json).autobase.backlog, undefined, 'no fields are invented on the wire')
})

test('debug info rpc - the command travels over a real hrpc transport', async (t) => {
  const left = new Duplex({
    write(data, cb) {
      right.push(data)
      cb()
    }
  })
  const right = new Duplex({
    write(data, cb) {
      left.push(data)
      cb()
    }
  })

  const server = new HRPC(new FramedStream(left))
  const client = new HRPC(new FramedStream(right))

  let receivedHeavy = null
  server.onCommandGetDebugInfo(async ({ heavy }) => {
    receivedHeavy = heavy
    return { json: JSON.stringify({ autobase: { length: 9501, indexedLength: 2685 } }) }
  })

  const response = await client.commandGetDebugInfo({ heavy: true })
  const parsed = JSON.parse(response.json)

  t.is(receivedHeavy, true, 'the heavy flag reaches the worker handler')
  t.is(parsed.autobase.length, 9501, 'the payload survives the transport')
  t.is(parsed.autobase.indexedLength, 2685, 'every field survives, not just the first')
})

test('debug report - renders the sections a support request needs', async (t) => {
  const report = formatDebugReport({
    capturedAt: 1756600000000,
    app: { version: 'v1.0.0 (18)', platform: 'ios' },
    autobase: { length: 9501, indexedLength: 2685, backlog: 6816, indexerCount: 2, majority: 2 },
    swarm: { connections: 1, connectedKeys: ['aa'.repeat(32)], downloads: [], uploads: [] },
    devices: [
      {
        title: 'iPhone',
        platform: 'ios',
        isLocal: true,
        isOnline: true,
        isIndexer: false,
        localKey: 'bb'
      }
    ]
  })

  t.ok(report.includes('Autobase & indexer'), 'autobase section is titled')
  t.ok(report.includes('backlog'), 'the backlog line is present')
  t.ok(report.includes('iPhone'), 'devices are listed')
  t.absent(report.includes('downloads'), 'empty transfer arrays are not printed as noise')
})

const REPORT_SNAPSHOT = {
  capturedAt: 1756600000000,
  app: { version: 'v1.0.0 (18)', platform: 'ios' },
  autobase: {
    length: 9501,
    indexedLength: 2685,
    backlog: 6816,
    autobaseKey: 'ab'.repeat(32),
    encryptionFingerprint: 'deadbeef',
    indexerKeys: ['cc'.repeat(32), 'dd'.repeat(32)]
  },
  swarm: {
    connections: 1,
    connectedKeys: ['aa'.repeat(32)],
    downloads: [
      {
        fileName: 'Tax return 2025.pdf',
        downloadedBytes: 10,
        totalBytes: 100,
        status: 'downloading',
        stalled: true
      }
    ],
    uploads: [{ fileName: 'passport.jpg', uploadedBytes: 5, totalBytes: 50, status: 'uploading' }]
  },
  storage: {
    driveKey: 'ee'.repeat(32),
    corePath: '/Users/someone/Library/Application Support/pear-notes/cores'
  },
  devices: [
    {
      title: 'iPhone',
      platform: 'ios',
      isLocal: true,
      isOnline: true,
      localKey: 'bb'.repeat(32),
      swarmKey: 'ff'.repeat(32)
    }
  ]
}

test('debug report - redacts keys, paths and file names by default', async (t) => {
  const report = formatDebugReport(REPORT_SNAPSHOT)

  t.absent(report.includes('ab'.repeat(32)), 'the autobase key is not printed in full')
  t.absent(report.includes('ee'.repeat(32)), 'the drive key is not printed in full')
  t.absent(report.includes('cc'.repeat(32)), 'indexer keys inside an array are shortened too')
  t.absent(report.includes('bb'.repeat(32)), 'a device local key is not printed in full')
  t.absent(report.includes('ff'.repeat(32)), 'a device swarm key is not printed in full')
  t.absent(
    report.includes('Tax return 2025'),
    'a download file name is user content, not diagnostics'
  )
  t.absent(report.includes('passport'), 'an upload file name is redacted as well')
  t.absent(report.includes('/Users/someone'), 'the home directory carries the account name')

  t.ok(report.includes('abababab\u2026'), 'the key prefix is kept so two reports can be matched up')
  t.ok(
    report.includes('file 1.pdf'),
    'the extension survives - it is what a stalled transfer is diagnosed by'
  )
  t.ok(report.includes('10/100'), 'byte counts survive redaction')
  t.ok(report.includes('STALLED'), 'transfer status survives redaction')
  t.ok(report.includes('deadbeef'), 'the encryption fingerprint is already a digest, not a secret')
  t.ok(report.includes('6816'), 'the numbers a support request needs are untouched')
})

test('debug report - the full report is opt-in and holds nothing back', async (t) => {
  const report = formatDebugReport(REPORT_SNAPSHOT, { redact: false })

  t.ok(report.includes('ab'.repeat(32)), 'the full autobase key is present when asked for')
  t.ok(report.includes('cc'.repeat(32)), 'array keys are full too')
  t.ok(report.includes('bb'.repeat(32)), 'device keys are full too')
  t.ok(report.includes('Tax return 2025.pdf'), 'file names come back')
  t.ok(report.includes('/Users/someone'), 'the real core path comes back')
  t.absent(report.includes('are shortened in this report'), 'the redaction banner is not claimed')
})

test('debug report - redaction helpers only touch what they should', async (t) => {
  t.is(shortenHex('ab'.repeat(32)), 'abababab\u2026', 'a 64-byte key is cut to its prefix')
  t.is(shortenHex('deadbeef'), 'deadbeef', 'a short digest is left alone')
  t.is(shortenHex('downloading'), 'downloading', 'a non-hex word is left alone')
  t.is(shortenHex('Recently Deleted'), 'Recently Deleted', 'a long non-hex string is left alone')
  t.is(shortenHex(null), null, 'a non-string passes through')

  t.is(redactHomePath('/Users/someone/pear'), '/Users/\u2026/pear', 'macOS home is collapsed')
  t.is(redactHomePath('/home/someone/pear'), '/home/\u2026/pear', 'linux home is collapsed')
  t.is(
    redactHomePath('/data/user/0/com.example/files'),
    '/data/user/0/com.example/files',
    'an android sandbox path carries no account name'
  )

  t.is(redactFileName('photo.HEIC', 1), 'file 1.heic', 'the extension is kept and normalised')
  t.is(redactFileName('notes', 2), 'file 2', 'a name with no extension still gets a position')
  t.is(redactFileName(undefined, 3), 'file 3', 'a missing name does not become "undefined"')
})
