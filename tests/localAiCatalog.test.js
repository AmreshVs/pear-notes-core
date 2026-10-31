import test from 'brittle'
import { createHash } from 'crypto'

import {
  LOCAL_AI_DEVICE_STATUS,
  LOCAL_AI_FEATURE,
  LOCAL_AI_FEATURE_STATUS,
  LOCAL_AI_LANGUAGE,
  LOCAL_AI_MODEL_STATUS,
  LOCAL_AI_RETIRED_MODEL_FILES,
  LOCAL_AI_TIER,
  configureLocalAiDevice,
  createDefaultLocalAiConfig,
  getCoremlSet,
  getCoremlSetBytes,
  getFeatureRegistryNames,
  getFlatModelFile,
  getModelDownloadBytes,
  getRegistryNamesBytes,
  getFreeSpaceShortfall,
  isOcrModel,
  parseLocalAiConfig
} from '../store/services/localAiCatalog.js'
import {
  computeBytesOnDisk,
  computeFeatureRow,
  computeFeatureStatus,
  computeMissingNames,
  computeModelUsers,
  computeReleasableBytes,
  computeReleasableNames
} from '../store/slices/localAiSlice.js'
import { setLocalAiAdapter, wipeLocalAi } from '../store/services/localAiAdapter.js'

const GB = 1024 * 1024 * 1024
const STANDARD_AUTO = { tier: LOCAL_AI_TIER.STANDARD, language: LOCAL_AI_LANGUAGE.AUTO }

const withFeatures = (enabled) => {
  const config = createDefaultLocalAiConfig()
  for (const feature of enabled) config.features[feature].enabled = true
  return config
}

test('local ai catalog - both voice features resolve to the same whisper and vad models', (t) => {
  const voice = getFeatureRegistryNames(LOCAL_AI_FEATURE.VOICE_TYPING, STANDARD_AUTO)
  t.alike(voice, ['WHISPER_BASE_Q8_0', 'VAD_SILERO_5_1_2'])
  t.alike(getFeatureRegistryNames(LOCAL_AI_FEATURE.TRANSCRIBE_RECORDINGS, STANDARD_AUTO), voice)
  t.alike(
    getFeatureRegistryNames(LOCAL_AI_FEATURE.VOICE_TYPING, {
      tier: LOCAL_AI_TIER.LITE,
      language: LOCAL_AI_LANGUAGE.ENGLISH
    }),
    ['WHISPER_EN_TINY_Q8_0', 'VAD_SILERO_5_1_2']
  )
})

test('local ai catalog - a tier a feature does not offer falls back to standard', (t) => {
  t.alike(getFeatureRegistryNames(LOCAL_AI_FEATURE.EXTRACT_TEXT, { tier: LOCAL_AI_TIER.LITE }), [
    'OCR_LATIN',
    'OCR_CRAFT'
  ])
  t.alike(getFeatureRegistryNames('writingTools', STANDARD_AUTO), [])
})

test('local ai catalog - extract text reads with OCR by default and Qwen3.5 on Best', (t) => {
  const standard = getFeatureRegistryNames(LOCAL_AI_FEATURE.EXTRACT_TEXT, {})
  const best = getFeatureRegistryNames(LOCAL_AI_FEATURE.EXTRACT_TEXT, { tier: LOCAL_AI_TIER.BEST })
  t.alike(standard, ['OCR_LATIN', 'OCR_CRAFT'])
  t.alike(best, ['QWEN3_5_0_8B_MULTIMODAL_Q4_K_M', 'MMPROJ_QWEN3_5_0_8B_MULTIMODAL_Q8_0'])
  t.ok(isOcrModel(standard[0]))
  t.absent(isOcrModel(best[0]))
})

test('local ai catalog - stored config drops unknown features, tiers and models', (t) => {
  const config = parseLocalAiConfig(
    JSON.stringify({
      wifiOnly: false,
      features: {
        voiceTyping: { enabled: true, tier: 'huge', language: 'en' },
        extractText: { enabled: 'yes' },
        writingTools: { enabled: true }
      },
      downloaded: {
        WHISPER_BASE_Q8_0: { bytes: 81768585, downloadedAt: 5 },
        NOT_A_MODEL: { bytes: 1 },
        OCR_LATIN: { bytes: -1 }
      }
    })
  )
  t.is(config.wifiOnly, false)
  t.alike(config.features.voiceTyping, {
    enabled: true,
    tier: LOCAL_AI_TIER.STANDARD,
    language: LOCAL_AI_LANGUAGE.ENGLISH
  })
  t.is(config.features.extractText.enabled, false)
  t.absent(config.features.writingTools)
  t.alike(Object.keys(config.downloaded), ['WHISPER_BASE_Q8_0'])
})

test('local ai catalog - unreadable stored config falls back to defaults', (t) => {
  t.alike(parseLocalAiConfig('{not json'), createDefaultLocalAiConfig())
  t.alike(parseLocalAiConfig(null), createDefaultLocalAiConfig())
})

test('local ai catalog - downloads always leave between 1 GB and 5 GB free', (t) => {
  t.is(getFreeSpaceShortfall({ freeBytes: 40 * GB, totalBytes: 256 * GB }, 0.5 * GB), 0)
  t.is(getFreeSpaceShortfall({ freeBytes: 2 * GB, totalBytes: 64 * GB }, 0.5 * GB), 3.5 * GB)
  t.is(getFreeSpaceShortfall({ freeBytes: 1.25 * GB, totalBytes: 8 * GB }, 0.5 * GB), 0.25 * GB)
  t.is(getFreeSpaceShortfall(null, 0), 1 * GB)
})

test('local ai status - an unsupported device overrides every feature', (t) => {
  const config = withFeatures([LOCAL_AI_FEATURE.VOICE_TYPING])
  const models = {
    WHISPER_BASE_Q8_0: { status: LOCAL_AI_MODEL_STATUS.READY },
    VAD_SILERO_5_1_2: { status: LOCAL_AI_MODEL_STATUS.READY }
  }
  t.is(
    computeFeatureStatus(
      { config, models, device: { status: LOCAL_AI_DEVICE_STATUS.SUPPORTED } },
      'voiceTyping'
    ),
    LOCAL_AI_FEATURE_STATUS.READY
  )
  t.is(
    computeFeatureStatus(
      { config, models, device: { status: LOCAL_AI_DEVICE_STATUS.UNSUPPORTED } },
      'voiceTyping'
    ),
    LOCAL_AI_FEATURE_STATUS.UNSUPPORTED
  )
})

test('local ai status - a failed model outranks one still downloading', (t) => {
  const config = withFeatures([LOCAL_AI_FEATURE.DESCRIBE_IMAGES])
  const models = {
    QWEN3_5_0_8B_MULTIMODAL_Q4_K_M: { status: LOCAL_AI_MODEL_STATUS.DOWNLOADING },
    MMPROJ_QWEN3_5_0_8B_MULTIMODAL_Q8_0: { status: LOCAL_AI_MODEL_STATUS.FAILED }
  }
  t.is(computeFeatureStatus({ config, models }, 'describeImages'), LOCAL_AI_FEATURE_STATUS.FAILED)
})

test('local ai models - a shared model is only releasable by its last user', (t) => {
  const models = {
    WHISPER_BASE_Q8_0: { status: LOCAL_AI_MODEL_STATUS.READY },
    VAD_SILERO_5_1_2: { status: LOCAL_AI_MODEL_STATUS.READY }
  }
  const both = withFeatures([LOCAL_AI_FEATURE.VOICE_TYPING, LOCAL_AI_FEATURE.TRANSCRIBE_RECORDINGS])
  t.alike(computeModelUsers(both, 'WHISPER_BASE_Q8_0'), ['voiceTyping', 'transcribeRecordings'])
  t.alike(computeReleasableNames({ config: both, models }, 'voiceTyping'), [])

  const one = withFeatures([LOCAL_AI_FEATURE.TRANSCRIBE_RECORDINGS])
  t.alike(computeReleasableNames({ config: one, models }, 'transcribeRecordings'), [
    'WHISPER_BASE_Q8_0',
    'VAD_SILERO_5_1_2'
  ])
  t.alike(computeMissingNames({ config: one, models }, 'extractText'), ['OCR_LATIN', 'OCR_CRAFT'])
})

test('local ai models - bytes on disk count partial downloads', (t) => {
  t.is(
    computeBytesOnDisk({
      WHISPER_BASE_Q8_0: { status: LOCAL_AI_MODEL_STATUS.READY, totalBytes: 100 },
      OCR_LATIN: { status: LOCAL_AI_MODEL_STATUS.PAUSED, downloadedBytes: 40, totalBytes: 90 }
    }),
    140
  )
})

test('local ai wipe - gives up when the adapter never finishes', async (t) => {
  setLocalAiAdapter({ closeAndWipe: () => new Promise(() => {}) })
  const started = Date.now()
  t.is(await wipeLocalAi(30), false)
  t.ok(Date.now() - started < 1000)
  setLocalAiAdapter(null)
  t.is(await wipeLocalAi(30), false)
})

test('local ai slice - feature row reports download progress and the active model', (t) => {
  const config = withFeatures([LOCAL_AI_FEATURE.VOICE_TYPING])
  const models = {
    WHISPER_BASE_Q8_0: {
      status: LOCAL_AI_MODEL_STATUS.DOWNLOADING,
      downloadedBytes: 40884292,
      totalBytes: 81768585
    },
    VAD_SILERO_5_1_2: { status: LOCAL_AI_MODEL_STATUS.READY, totalBytes: 885098 }
  }
  const row = computeFeatureRow({ config, models, device: {} }, LOCAL_AI_FEATURE.VOICE_TYPING)
  t.is(row.status, LOCAL_AI_FEATURE_STATUS.DOWNLOADING)
  t.is(row.enabled, true)
  t.is(row.activeModel, 'WHISPER_BASE_Q8_0')
  t.is(row.missingBytes, 81768585 - 40884292)
  t.is(row.percent, 50)
  t.is(computeReleasableBytes({ config, models }, LOCAL_AI_FEATURE.VOICE_TYPING), 40884292 + 885098)
})

test('local ai slice - an off feature row shows the full download size', (t) => {
  const row = computeFeatureRow(
    { config: createDefaultLocalAiConfig(), models: {}, device: {} },
    LOCAL_AI_FEATURE.EXTRACT_TEXT
  )
  t.is(row.status, LOCAL_AI_FEATURE_STATUS.OFF)
  t.is(row.missingBytes, 15396512 + 83133856)
  t.is(row.activeModel, 'OCR_LATIN')
})

test('Best routes writing to the fast model and Ask to the best this device runs', async (t) => {
  const catalog = await import('../store/services/localAiCatalog.js')
  const { LOCAL_AI_TEXT_TASK: TASK, getTextTaskModel, getFeatureRegistryNames } = catalog
  const GB = 1024 ** 3
  const mac = { platform: 'darwin', totalMemoryBytes: 16 * GB }
  const phone = { platform: 'ios', totalMemoryBytes: 8 * GB }
  const best = { tier: 'best', model: null }

  t.is(getTextTaskModel({ tier: 'standard' }, TASK.ASK, mac), 'QWEN3_600M_INST_Q4')
  t.is(getTextTaskModel(best, TASK.WRITE, mac), 'QWEN3_1_7B_INST_Q4')
  t.is(getTextTaskModel(best, TASK.ASK, mac), 'QWEN3_4B_INST_Q4_K_M')
  t.is(
    getTextTaskModel(best, TASK.ASK, { platform: 'darwin', totalMemoryBytes: 8 * GB }),
    'QWEN3_1_7B_INST_Q4'
  )
  t.is(getTextTaskModel(best, TASK.ASK, phone), 'QWEN3_1_7B_INST_Q4')
  t.is(
    getTextTaskModel({ ...best, model: 'QWEN3_4B_INST_Q4_K_M' }, TASK.ASK, phone),
    'QWEN3_4B_INST_Q4_K_M'
  )
  t.is(
    getTextTaskModel({ ...best, model: 'QWEN3_8B_INST_Q4_K_M' }, TASK.ASK, phone),
    'QWEN3_1_7B_INST_Q4'
  )
  t.is(
    getTextTaskModel({ ...best, model: 'QWEN3_8B_INST_Q4_K_M' }, TASK.ASK, mac),
    'QWEN3_8B_INST_Q4_K_M'
  )

  catalog.configureLocalAiDevice(mac)
  t.alike(getFeatureRegistryNames('summarizeRecordings', best), [
    'QWEN3_1_7B_INST_Q4',
    'QWEN3_4B_INST_Q4_K_M'
  ])
  t.alike(getFeatureRegistryNames('summarizeRecordings', best, TASK.WRITE), ['QWEN3_1_7B_INST_Q4'])
  catalog.configureLocalAiDevice()
})

test('the Advanced model choice survives a reload and rejects unknown names', async (t) => {
  const { parseLocalAiConfig } = await import('../store/services/localAiCatalog.js')
  const stored = (model) => ({ features: { summarizeRecordings: { tier: 'best', model } } })
  t.is(
    parseLocalAiConfig(stored('QWEN3_8B_INST_Q4_K_M')).features.summarizeRecordings.model,
    'QWEN3_8B_INST_Q4_K_M'
  )
  t.is(parseLocalAiConfig(stored('GPT_5')).features.summarizeRecordings.model, null)
})

test('Best stays ready on the fast model while its bigger Ask model downloads', async (t) => {
  const catalog = await import('../store/services/localAiCatalog.js')
  const { computeFeatureStatus } = await import('../store/slices/localAiSlice.js')
  catalog.configureLocalAiDevice({ platform: 'darwin', totalMemoryBytes: 16 * 1024 ** 3 })
  t.teardown(() => catalog.configureLocalAiDevice())
  const config = {
    features: { summarizeRecordings: { enabled: true, tier: 'best', model: null } }
  }
  const state = (models) => ({
    config,
    models,
    device: { status: 'supported', totalMemoryBytes: 16 * 1024 ** 3 }
  })
  t.is(
    computeFeatureStatus(
      state({
        QWEN3_1_7B_INST_Q4: { status: 'ready' },
        QWEN3_4B_INST_Q4_K_M: { status: 'downloading' }
      }),
      'summarizeRecordings'
    ),
    'ready'
  )
  t.is(
    computeFeatureStatus(
      state({ QWEN3_4B_INST_Q4_K_M: { status: 'downloading' } }),
      'summarizeRecordings'
    ),
    'downloading'
  )
  t.is(
    catalog.getTextAskFallback({ tier: 'best', model: 'QWEN3_4B_INST_Q4_K_M' }),
    null,
    'a chosen model has no fallback'
  )
})

test('retired model files are named the way the SDK caches them', (t) => {
  for (const { registryPath, file } of LOCAL_AI_RETIRED_MODEL_FILES) {
    const hash = createHash('sha256').update(registryPath).digest('hex').slice(0, 16)
    t.is(file, `${hash}_${registryPath.split('/').pop()}`)
  }
})

test('the parakeet core ml set is keyed the way the SDK caches it, on apple only', (t) => {
  const registryPath = 'qvac_models_compiled/ggml/parakeet/2026-09-30/parakeet-tdt-0.6b-v3.q4_0.gguf'
  const sidecarRoot = 'qvac_models_compiled/ggml/parakeet/2026-09-28/'
  const hash = (value) => createHash('sha256').update(value).digest('hex').slice(0, 16)
  const set = getCoremlSet('PARAKEET_TDT_0_6B_V3_Q4_0', 'darwin')
  t.is(set.setKey, hash(`s3:${registryPath}:coreml:${sidecarRoot}`))
  t.is(set.flatFile, `${hash(registryPath)}_parakeet-tdt-0.6b-v3.q4_0.gguf`)
  t.is(getCoremlSetBytes(set), 859541333)
  t.is(getCoremlSet('PARAKEET_TDT_0_6B_V3_Q4_0', 'ios'), set)
  t.is(getCoremlSet('PARAKEET_TDT_0_6B_V3_Q4_0', 'android'), null)
  t.is(getCoremlSet('WHISPER_BASE_Q8_0', 'darwin'), null)
  t.is(getFlatModelFile('PARAKEET_TDT_0_6B_V3_Q4_0'), set.flatFile)
  t.is(getFlatModelFile('WHISPER_BASE_Q8_0'), null)
})

test('parakeet sizes include the core ml set on apple only', (t) => {
  const gguf = 398734976
  const withSet = 859541333
  try {
    configureLocalAiDevice({ platform: 'darwin' })
    t.is(getModelDownloadBytes('PARAKEET_TDT_0_6B_V3_Q4_0'), withSet)
    configureLocalAiDevice({ platform: 'ios' })
    t.is(getRegistryNamesBytes(['PARAKEET_TDT_0_6B_V3_Q4_0']), withSet)
    configureLocalAiDevice({ platform: 'android' })
    t.is(getModelDownloadBytes('PARAKEET_TDT_0_6B_V3_Q4_0'), gguf)
    configureLocalAiDevice({ platform: 'win32' })
    t.is(getRegistryNamesBytes(['PARAKEET_TDT_0_6B_V3_Q4_0']), gguf)
  } finally {
    configureLocalAiDevice()
  }
})
