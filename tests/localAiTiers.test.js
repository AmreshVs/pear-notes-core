import test from 'brittle'

import {
  canColoadEmbedding,
  getTextTierFit,
  getTextTierFits,
  LOCAL_AI_TEXT_TIER,
  LOCAL_AI_TIER_UNFIT_REASON,
  pickDefaultTextTier
} from '../store/services/localAiTiers.js'

const GB = 1024 ** 3

test('a 6 GB phone runs small and standard, not large or xl', (t) => {
  const fits = getTextTierFits({ totalMemoryBytes: 6 * GB, platform: 'android' })
  t.alike(
    fits.map((fit) => [fit.tier, fit.fits, fit.reason]),
    [
      ['small', true, null],
      ['standard', true, null],
      ['large', false, LOCAL_AI_TIER_UNFIT_REASON.MEMORY],
      ['xl', false, LOCAL_AI_TIER_UNFIT_REASON.DESKTOP_ONLY]
    ]
  )
  t.is(pickDefaultTextTier({ totalMemoryBytes: 6 * GB, platform: 'android' }), 'standard')
  t.absent(canColoadEmbedding(LOCAL_AI_TEXT_TIER.STANDARD, { totalMemoryBytes: 6 * GB }))
})

test('a 16 GB Mac runs large at 8k and xl at 8k', (t) => {
  const device = { totalMemoryBytes: 16 * GB, platform: 'darwin' }
  const large = getTextTierFit(LOCAL_AI_TEXT_TIER.LARGE, device)
  t.ok(large.fits)
  t.is(large.contextTokens, 8192)
  t.is(getTextTierFit(LOCAL_AI_TEXT_TIER.XL, device).contextTokens, 8192)
  t.is(pickDefaultTextTier(device), 'xl')
  t.ok(canColoadEmbedding(LOCAL_AI_TEXT_TIER.LARGE, device))
})

test('an 8 GB phone cannot run large under the measured gate', (t) => {
  const fit = getTextTierFit(LOCAL_AI_TEXT_TIER.LARGE, {
    totalMemoryBytes: 8 * GB,
    platform: 'ios'
  })
  t.absent(fit.fits)
  t.is(fit.reason, LOCAL_AI_TIER_UNFIT_REASON.MEMORY)
})

test('a 12 GB phone could run large but defaults to standard', (t) => {
  const device = { totalMemoryBytes: 12 * GB, platform: 'ios' }
  const large = getTextTierFit(LOCAL_AI_TEXT_TIER.LARGE, device)
  t.ok(large.fits)
  t.is(pickDefaultTextTier(device), 'standard')
})

test('xl falls back to a smaller context before giving up', (t) => {
  t.is(getTextTierFit('xl', { totalMemoryBytes: 24 * GB, platform: 'darwin' }).contextTokens, 16384)
  t.is(getTextTierFit('xl', { totalMemoryBytes: 16 * GB, platform: 'darwin' }).contextTokens, 8192)
  t.absent(getTextTierFit('xl', { totalMemoryBytes: 14 * GB, platform: 'darwin' }).fits)
})

test('an assessModelFit veto wins over the memory gate', (t) => {
  const fit = getTextTierFit('large', {
    totalMemoryBytes: 64 * GB,
    platform: 'darwin',
    assessment: 'likely-too-large'
  })
  t.absent(fit.fits)
  t.is(fit.reason, LOCAL_AI_TIER_UNFIT_REASON.ASSESSED_TOO_LARGE)
  t.ok(
    getTextTierFit('large', {
      totalMemoryBytes: 64 * GB,
      platform: 'darwin',
      assessment: 'unknown'
    }).fits
  )
  t.is(getTextTierFit('nope'), null)
})

test('search by meaning uses the embedding model the index loads', async (t) => {
  const { LOCAL_AI_FEATURE, getFeatureRegistryNames } =
    await import('../store/services/localAiCatalog.js')
  const { LOCAL_AI_EMBEDDING_MODEL } = await import('../store/services/localAiTiers.js')
  t.alike(getFeatureRegistryNames(LOCAL_AI_FEATURE.SEARCH_BY_MEANING, {}), [
    LOCAL_AI_EMBEDDING_MODEL.model
  ])
})
