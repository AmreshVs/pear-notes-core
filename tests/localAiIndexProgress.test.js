import test from 'brittle'

import {
  getIndexProgress,
  loadIndexBytes,
  nextIndexSample
} from '../store/services/localAiIndexProgress.js'

test('index progress uses the run while running, coverage otherwise', (t) => {
  t.alike(getIndexProgress({ index: { status: 'idle' }, coverage: { indexed: 30, total: 40 } }), {
    running: false,
    done: 30,
    total: 40,
    percent: 75,
    remainingMs: null
  })
  const index = { status: 'running', done: 20, total: 100 }
  const sample = nextIndexSample(null, { ...index, done: 10 }, 0)
  t.is(nextIndexSample(sample, index, 9000), sample)
  const progress = getIndexProgress({ index, coverage: null, sample, now: 10000 })
  t.is(progress.percent, 20)
  t.is(progress.remainingMs, 80000)
  t.is(getIndexProgress({ index, sample, now: 1000 }).remainingMs, null)
  t.is(nextIndexSample(sample, { status: 'idle' }), null)
})

test('index bytes come from the derived store stats', async (t) => {
  t.is(await loadIndexBytes({ derivedStats: async () => ({ ok: true, bytes: 42 }) }), 42)
  t.is(await loadIndexBytes({ derivedStats: async () => ({ ok: false, bytes: 0 }) }), null)
})
