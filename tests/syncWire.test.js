import test from 'brittle'
import b4a from 'b4a'
import BlindPairing from 'blind-pairing'
import { decode, encode } from '../spec/hyperschema/index.js'
import { INVITE_EXPIRY_MS, PAIRING_PROTOCOL } from '../constant.js'

const roundTrip = (name, value) => decode(name, encode(name, value))

test('pairing status wire - encryption key survives the round trip', async (t) => {
  const encryptionKey = b4a.toString(b4a.alloc(32).fill('k'), 'hex')

  const decoded = roundTrip('@notes/pairing-schema', {
    step: 'replicating_data',
    progress: 85,
    encryptionKey
  })

  t.is(decoded.step, 'replicating_data', 'step survives')
  t.is(decoded.progress, 85, 'progress survives')
  t.is(
    decoded.encryptionKey,
    encryptionKey,
    'encryptionKey survives - a joiner that loses this cannot reopen its base after restart'
  )
})

test('pairing status wire - platform and reason survive the round trip', async (t) => {
  const confirmation = roundTrip('@notes/pairing-schema', {
    step: 'confirmation',
    progress: 70,
    userData: 'aa'.repeat(32),
    localKey: 'bb'.repeat(32),
    platform: 'ios',
    code: '🥑🍐🍎 (1a2b3)'
  })

  t.is(confirmation.platform, 'ios', 'platform survives so the inviter can label the device')
  t.is(confirmation.code, '🥑🍐🍎 (1a2b3)', 'pairing code survives so both screens can show it')
  t.is(confirmation.userData, 'aa'.repeat(32), 'userData survives')
  t.is(confirmation.localKey, 'bb'.repeat(32), 'localKey survives')

  const failure = roundTrip('@notes/pairing-schema', {
    step: 'error',
    progress: 0,
    reason: 'joiner_outdated'
  })

  t.is(failure.reason, 'joiner_outdated', 'failure reason survives')
})

test('pairing status wire - requestedAt survives the round trip', async (t) => {
  const requestedAt = Date.now()

  const decoded = roundTrip('@notes/pairing-schema', {
    step: 'confirmation',
    progress: 70,
    userData: 'aa'.repeat(32),
    localKey: 'bb'.repeat(32),
    platform: 'android',
    requestedAt
  })

  t.is(
    decoded.requestedAt,
    requestedAt,
    'requestedAt survives - without it the verify prompt cannot show how old a request is'
  )

  const withoutStamp = roundTrip('@notes/pairing-schema', { step: 'confirmation', progress: 70 })
  t.is(withoutStamp.requestedAt, 0, 'an unstamped request decodes as 0 rather than throwing')
})

test('synced device wire - presence flags survive the round trip', async (t) => {
  const online = roundTrip('@notes/synced-device-schema', {
    title: 'My laptop',
    deviceType: 'desktop',
    platform: 'darwin',
    isLocal: false,
    addedAt: 1,
    updatedAt: 2,
    isOnline: true,
    presenceKnown: true
  })

  t.ok(online.isOnline, 'isOnline survives')
  t.ok(online.presenceKnown, 'presenceKnown survives')

  const legacy = roundTrip('@notes/synced-device-schema', {
    title: 'Old phone',
    deviceType: 'mobile',
    platform: 'ios',
    isLocal: false,
    addedAt: 1,
    updatedAt: 2
  })

  t.absent(legacy.isOnline, 'a device without presence decodes as offline')
  t.absent(legacy.presenceKnown, 'a device without presence decodes as unknown')
})

test('create invite wire - response encodes without throwing', async (t) => {
  const expires = Date.now() + INVITE_EXPIRY_MS

  const decoded = roundTrip('@notes/command-create-invite-response', {
    id: 'aa'.repeat(32),
    invite: PAIRING_PROTOCOL + 'bb'.repeat(64),
    publicKey: 'cc'.repeat(32),
    expires
  })

  t.is(decoded.expires, expires, 'expiry timestamp survives')
  t.ok(decoded.invite.startsWith(PAIRING_PROTOCOL), 'invite keeps its protocol prefix')
})

test('note wire - trash metadata survives the round trip', async (t) => {
  const deletedAt = Date.now()
  const previousFolderKey = 'dd'.repeat(32)

  const decoded = roundTrip('@notes/note-schema', {
    title: 'trashed',
    note: '<p>body</p>',
    folderKey: 'ee'.repeat(32),
    addedAt: 1,
    updatedAt: 2,
    locked: false,
    pinned: false,
    deletedAt,
    previousFolderKey
  })

  t.is(decoded.deletedAt, deletedAt, 'deletedAt survives')
  t.is(decoded.previousFolderKey, previousFolderKey, 'previousFolderKey survives')

  const live = roundTrip('@notes/note-schema', {
    title: 'live',
    note: '',
    folderKey: 'ee'.repeat(32),
    addedAt: 1,
    updatedAt: 2,
    locked: false,
    pinned: false
  })

  t.is(live.deletedAt, 0, 'a live note decodes deletedAt as 0')
  t.absent(live.previousFolderKey, 'a live note decodes previousFolderKey as empty')
})

test('blind pairing invites carry the expiry we set', async (t) => {
  const key = b4a.alloc(32).fill('a')
  const expiresAt = Date.now() + INVITE_EXPIRY_MS

  const created = BlindPairing.createInvite(key, { expires: expiresAt })
  t.ok(created.expires > Date.now(), 'invite reports a future expiry')

  const decoded = BlindPairing.decodeInvite(created.invite)
  t.ok(decoded.expires > 0, 'expiry is embedded in the invite itself')
  t.is(
    Math.floor(expiresAt / 1000),
    Math.floor(decoded.expires / 1000),
    'joiner reads back the same expiry, to the second'
  )

  const noExpiry = BlindPairing.decodeInvite(BlindPairing.createInvite(key).invite)
  t.is(noExpiry.expires, 0, 'an invite created without opts never expires')
})

test('hrpc note command encodings tolerate empty optional strings', async (t) => {
  const decoded = roundTrip('@notes/command-restore-note-response', {
    done: true,
    folderKey: ''
  })

  t.is(decoded.done, true, 'done survives')
  t.absent(decoded.folderKey, 'an empty folderKey decodes as empty rather than throwing')
})

test('synced device wire - isIndexer survives the round trip in both states', async (t) => {
  const base = {
    title: 'Amresh Mac',
    deviceType: 'desktop',
    platform: 'darwin',
    isLocal: true,
    addedAt: 1,
    updatedAt: 2,
    isOnline: true,
    presenceKnown: true,
    localKey: 'abc123'
  }

  const indexer = roundTrip('@notes/synced-device-schema', { ...base, isIndexer: true })
  t.is(indexer.isIndexer, true, 'an indexer device decodes as an indexer')

  const writer = roundTrip('@notes/synced-device-schema', { ...base, isIndexer: false })
  t.is(writer.isIndexer, false, 'a writer-only device decodes as a non-indexer')

  const undeclared = roundTrip('@notes/synced-device-schema', { ...base, swarmKey: 'dropped' })
  t.absent(undeclared.swarmKey, 'a field missing from the schema is dropped on the wire')
})

test('set device indexer wire - request and response survive the round trip', async (t) => {
  const request = roundTrip('@notes/command-set-device-indexer-request', {
    localKey: 'deadbeef',
    isIndexer: false
  })
  t.is(request.localKey, 'deadbeef', 'localKey survives')
  t.is(request.isIndexer, false, 'a demotion request stays a demotion')

  const response = roundTrip('@notes/command-set-device-indexer-response', {
    changed: false,
    error: 'INDEXER_ERROR_DEVICE_OFFLINE'
  })
  t.is(response.changed, false, 'changed survives')
  t.is(response.error, 'INDEXER_ERROR_DEVICE_OFFLINE', 'the guard reason reaches the frontend')
})
