import test from 'brittle'
import { decode, encode } from '../spec/hyperschema/index.js'
import { LOCK_REFUSAL } from '../constant.js'

const roundTrip = (name, value) => decode(name, encode(name, value))

test('sealed files wire - the waiting list survives the storage push', async (t) => {
  const waiting = { noteKey: 'n1', link: 'pear://media/x', fileName: 'scan.pdf', size: 123456 }
  const decoded = roundTrip('@notes/command-subscribe-storage-info-response', {
    data: [],
    totalBlobBytes: 1,
    totalOnDiskBytes: 2,
    reclaimableBytes: 0,
    downloads: [],
    uploads: [],
    sealWaiting: [waiting]
  })
  t.alike(decoded.sealWaiting, [waiting], 'every field of a waiting file survives')
})

test('sealed files wire - refusal reasons reach the frontend', async (t) => {
  for (const reason of [LOCK_REFUSAL.FILES_MISSING, LOCK_REFUSAL.FILES_SEALED]) {
    const update = roundTrip('@notes/command-update-note-response', { done: false, reason })
    t.is(update.reason, reason, `updateNote carries ${reason}`)
  }
  const insert = roundTrip('@notes/command-insert-file-response', {
    done: false,
    link: '',
    reason: LOCK_REFUSAL.SESSION_CLOSED
  })
  t.is(insert.reason, LOCK_REFUSAL.SESSION_CLOSED, 'insertFile carries the closed session')
  const progress = roundTrip('@notes/command-insert-file-progress-response', {
    transferred: 0,
    total: 0,
    done: false,
    link: '',
    reason: LOCK_REFUSAL.SESSION_CLOSED
  })
  t.is(progress.reason, LOCK_REFUSAL.SESSION_CLOSED, 'and so does the streamed insert')
})
