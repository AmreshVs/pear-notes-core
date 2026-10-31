import test from 'brittle'

import { assessSyncHealth, formatDebugReport, SYNC_HEALTH } from '../utils.js'

const healthy = () => ({
  autobase: { opened: true, writable: true, backlog: 0, localUnconfirmed: 0, majority: 2 },
  swarm: { connections: 2, suspended: false, downloads: [] },
  devices: [
    { title: 'Mac', isLocal: true, isIndexer: true, isOnline: true, presenceKnown: true },
    { title: 'XCover', isIndexer: true, isOnline: true, presenceKnown: true },
    { title: 'iPhone', isOnline: true, presenceKnown: true }
  ],
  writers: [{ coreOpen: true }]
})

const ids = (health) => health.checks.map((check) => check.id)

test('sync health - the reported vault is healthy', (t) => {
  const health = assessSyncHealth(healthy())
  t.is(health.level, SYNC_HEALTH.HEALTHY)
  t.alike(ids(health), ['allGood'])
})

test('sync health - pending writes are syncing, not a problem', (t) => {
  const snapshot = healthy()
  snapshot.autobase.backlog = 3
  const health = assessSyncHealth(snapshot)
  t.is(health.level, SYNC_HEALTH.SYNCING)
  t.alike(ids(health), ['pending'])
})

test('sync health - one of three leaders offline needs attention', (t) => {
  const snapshot = healthy()
  snapshot.devices[2].isIndexer = true
  snapshot.devices[1].isOnline = false
  const health = assessSyncHealth(snapshot)
  t.is(health.level, SYNC_HEALTH.ATTENTION)
  t.alike(ids(health), ['leaderOffline'])
  t.is(health.checks[0].params.names, 'XCover')
})

test('sync health - losing the leader majority needs attention, not a problem', (t) => {
  const snapshot = healthy()
  snapshot.devices[1].isOnline = false
  snapshot.autobase.backlog = 1
  const health = assessSyncHealth(snapshot)
  t.is(health.level, SYNC_HEALTH.ATTENTION)
  t.alike(ids(health), ['quorumLost', 'pending'], 'most severe first')

  const soleLeader = healthy()
  soleLeader.autobase.majority = 1
  soleLeader.devices = [
    { title: 'Mac', isIndexer: true, isOnline: false, presenceKnown: true },
    { title: 'iPhone', isLocal: true, isOnline: true, presenceKnown: true }
  ]
  t.is(assessSyncHealth(soleLeader).level, SYNC_HEALTH.ATTENTION, 'sole leader asleep')
})

test('sync health - unknown presence is not counted as offline', (t) => {
  const snapshot = healthy()
  snapshot.devices[1] = { ...snapshot.devices[1], isOnline: false, presenceKnown: false }
  t.is(assessSyncHealth(snapshot).level, SYNC_HEALTH.HEALTHY)
})

test('sync health - closed writer history, removal and a closed vault', (t) => {
  const closed = healthy()
  closed.writers.push({ coreOpen: false })
  t.alike(ids(assessSyncHealth(closed)), ['writerClosed'])

  const removed = healthy()
  removed.autobase.localWriterRemoved = true
  t.is(assessSyncHealth(removed).level, SYNC_HEALTH.PROBLEM)

  t.alike(ids(assessSyncHealth({ autobase: { opened: false } })), ['notOpen'])
})

test('sync health - no connections needs attention, background pause does not', (t) => {
  const alone = healthy()
  alone.swarm.connections = 0
  t.alike(ids(assessSyncHealth(alone)), ['noConnections'])

  const paused = healthy()
  paused.swarm = { connections: 0, suspended: true }
  t.is(assessSyncHealth(paused).level, SYNC_HEALTH.SYNCING)
})

test('sync health - the copied report leads with the status', (t) => {
  const snapshot = healthy()
  snapshot.devices[1].isOnline = false
  const report = formatDebugReport(snapshot)
  t.ok(report.includes('## Status: Needs attention'))
  t.ok(report.includes('[Needs attention] Too many sync leaders are offline (1 of 2).'))
})
