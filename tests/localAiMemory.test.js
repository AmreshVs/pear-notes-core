import test from 'brittle'

import { canRunAnyTier, canRunFeature, pickRunnableTier } from '../store/services/localAiCatalog.js'

const GB = 1024 * 1024 * 1024

test('canRunFeature keeps heavy models off phones that would run out of memory', (t) => {
  t.absent(canRunFeature('summarizeRecordings', { tier: 'best' }, 3.7 * GB))
  t.ok(canRunFeature('summarizeRecordings', { tier: 'best' }, 5.6 * GB))
  t.absent(canRunFeature('voiceTyping', { tier: 'best' }, 5.6 * GB))
  t.ok(canRunFeature('voiceTyping', { tier: 'best' }, 7.5 * GB))
  t.ok(canRunFeature('voiceTyping', { tier: 'standard' }, 2.8 * GB))
  t.absent(canRunFeature('summarizeRecordings', { tier: 'standard' }, 2.8 * GB))
})

test('canRunFeature allows everything when the device memory is unknown', (t) => {
  t.ok(canRunFeature('voiceTyping', { tier: 'best' }, 0))
})

test('pickRunnableTier falls back to the largest tier that fits, or null', (t) => {
  t.is(pickRunnableTier('summarizeRecordings', { tier: 'best' }, 3.7 * GB), 'standard')
  t.is(pickRunnableTier('voiceTyping', { tier: 'best' }, 3.7 * GB), 'standard')
  t.is(pickRunnableTier('summarizeRecordings', { tier: 'standard' }, 1.9 * GB), null)
  t.is(pickRunnableTier('summarizeRecordings', { tier: 'best' }, 7.5 * GB), 'best')
})

test('canRunAnyTier only fails when no quality fits, so one heavy choice does not disable a feature', (t) => {
  // 3.7 GB cannot hold summarize at 'best', but it can at 'standard' — the
  // feature stays available and the choice stands.
  t.absent(canRunFeature('summarizeRecordings', { tier: 'best' }, 3.7 * GB))
  t.ok(canRunAnyTier('summarizeRecordings', { tier: 'best' }, 3.7 * GB))
  t.ok(canRunAnyTier('voiceTyping', { tier: 'best' }, 5.6 * GB))
  // 1.9 GB fits nothing, which is the real "this device cannot" case.
  t.absent(canRunAnyTier('summarizeRecordings', { tier: 'standard' }, 1.9 * GB))
})
