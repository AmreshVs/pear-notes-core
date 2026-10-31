import { TRANSLATION_ALL_LANGUAGES, isTranslationModel } from './localAiLanguage.js'
import { TRANSLATION_REGISTRY_MODELS } from './localAiTranslationModels.js'

export const LOCAL_AI_ENABLED = true

export const LOCAL_AI_CONFIG_KEY = 'localAiConfig'
export const LOCAL_AI_CONFIG_VERSION = 1

export const LOCAL_AI_FEATURE = {
  VOICE_TYPING: 'voiceTyping',
  TRANSCRIBE_RECORDINGS: 'transcribeRecordings',
  EXTRACT_TEXT: 'extractText',
  DESCRIBE_IMAGES: 'describeImages',
  SUMMARIZE_RECORDINGS: 'summarizeRecordings',
  TRANSLATE_NOTES: 'translateNotes',
  SEARCH_BY_MEANING: 'searchByMeaning'
}

export const LOCAL_AI_FEATURE_IDS = Object.values(LOCAL_AI_FEATURE)

export const LOCAL_AI_GROUP = {
  VOICE_AND_AUDIO: 'voiceAndAudio',
  IMAGES_AND_SCANS: 'imagesAndScans',
  NOTES: 'notes'
}

export const LOCAL_AI_GROUPS = [
  {
    id: LOCAL_AI_GROUP.VOICE_AND_AUDIO,
    features: [LOCAL_AI_FEATURE.VOICE_TYPING, LOCAL_AI_FEATURE.TRANSCRIBE_RECORDINGS]
  },
  {
    id: LOCAL_AI_GROUP.IMAGES_AND_SCANS,
    features: [LOCAL_AI_FEATURE.EXTRACT_TEXT, LOCAL_AI_FEATURE.DESCRIBE_IMAGES]
  },
  {
    id: LOCAL_AI_GROUP.NOTES,
    features: [
      LOCAL_AI_FEATURE.SEARCH_BY_MEANING,
      LOCAL_AI_FEATURE.SUMMARIZE_RECORDINGS,
      LOCAL_AI_FEATURE.TRANSLATE_NOTES
    ]
  }
]

export const isOnDemandFeature = (feature) => feature === LOCAL_AI_FEATURE.TRANSLATE_NOTES

export const getOnDemandModelNames = (feature, models) =>
  isOnDemandFeature(feature) ? Object.keys(models ?? {}).filter(isTranslationModel) : []

export const isOnDemandModelFor = (feature, name) =>
  isOnDemandFeature(feature) && isTranslationModel(name)

export const LOCAL_AI_TIER = {
  LITE: 'lite',
  STANDARD: 'standard',
  BEST: 'best'
}

export const LOCAL_AI_LANGUAGE = {
  AUTO: 'auto',
  ENGLISH: 'en'
}

export const LOCAL_AI_MODEL_STATUS = {
  NONE: 'none',
  QUEUED: 'queued',
  WAITING_NETWORK: 'waiting-network',
  DOWNLOADING: 'downloading',
  PAUSED: 'paused',
  FAILED: 'failed',
  READY: 'ready'
}

export const LOCAL_AI_FEATURE_STATUS = {
  UNSUPPORTED: 'unsupported',
  OFF: 'off',
  DOWNLOADING: 'downloading',
  WAITING_NETWORK: 'waiting-network',
  PAUSED: 'paused',
  FAILED: 'failed',
  NEEDS_MEMORY: 'needs-memory',
  READY: 'ready'
}

export const LOCAL_AI_DEVICE_STATUS = {
  UNKNOWN: 'unknown',
  SUPPORTED: 'supported',
  LIMITED: 'limited',
  UNSUPPORTED: 'unsupported'
}

export const LOCAL_AI_UNSUPPORTED_REASON = {
  SIMULATOR: 'simulator',
  OS_VERSION: 'os-version',
  ARCHITECTURE: 'architecture',
  GPU: 'gpu',
  STORE_BUILD: 'store-build'
}

export const LOCAL_AI_NETWORK = {
  WIFI: 'wifi',
  CELLULAR: 'cellular',
  METERED: 'metered',
  OFFLINE: 'offline',
  OTHER: 'other',
  UNKNOWN: 'unknown'
}

export const LOCAL_AI_NOTICE = {
  INSUFFICIENT_SPACE: 'insufficient-space'
}

export const LOCAL_AI_ERROR = {
  DOWNLOAD_FAILED: 'DOWNLOAD_FAILED',
  INSUFFICIENT_SPACE: 'INSUFFICIENT_SPACE',
  INTERRUPTED: 'INTERRUPTED',
  MODEL_MISSING: 'MODEL_MISSING',
  NOT_ENOUGH_MEMORY: 'NOT_ENOUGH_MEMORY',
  MODEL_UNSTABLE: 'MODEL_UNSTABLE',
  INPUT_TOO_LONG: 'INPUT_TOO_LONG',
  TASK_FAILED: 'TASK_FAILED'
}

export const LOCAL_AI_LICENSE = {
  MIT: 'MIT',
  APACHE_2: 'Apache-2.0',
  MPL_2: 'MPL-2.0',
  CC_BY_4: 'CC-BY-4.0',
  PENDING: 'pending'
}

export const LOCAL_AI_MIN_FREE_BYTES = 1024 * 1024 * 1024
export const LOCAL_AI_MAX_FREE_FLOOR_BYTES = 5 * 1024 * 1024 * 1024
export const LOCAL_AI_FREE_RATIO = 0.1
export const LOCAL_AI_OCR_LANGUAGES = [
  'en',
  'fr',
  'de',
  'es',
  'it',
  'pt',
  'nl',
  'pl',
  'cs',
  'sk',
  'sl',
  'hr',
  'hu',
  'ro',
  'sq',
  'sv',
  'da',
  'no',
  'is',
  'et',
  'lv',
  'lt',
  'tr',
  'az',
  'id',
  'ms',
  'vi'
]

export const LOCAL_AI_LIMITED_MEMORY_BYTES = 6 * 1024 * 1024 * 1024

/** Model cache files an SDK upgrade replaced: `<sha256(registryPath) first 16 hex>_<file name>`. */
export const LOCAL_AI_RETIRED_MODEL_FILES = [
  {
    registryPath: 'qvac_models_compiled/ggml/parakeet/2026-05-27/parakeet-tdt-0.6b-v3.q4_0.gguf',
    file: 'd8b8f6be051b5cae_parakeet-tdt-0.6b-v3.q4_0.gguf'
  }
]

/** Files loadModel needs on disk (Apple: the Core ML set, else `flatFile`); a missing one is downloaded silently. */
const LOCAL_AI_COREML_SETS = {
  PARAKEET_TDT_0_6B_V3_Q4_0: {
    setKey: '0bcebed4ac97cba8',
    flatFile: '3f3c0d03bd4952f7_parakeet-tdt-0.6b-v3.q4_0.gguf',
    files: [
      { path: 'parakeet-tdt-0.6b-v3.q4_0.gguf', bytes: 398734976 },
      { path: 'parakeet-tdt-0.6b-v3-encoder.mlmodelc/analytics/coremldata.bin', bytes: 243 },
      { path: 'parakeet-tdt-0.6b-v3-encoder.mlmodelc/coremldata.bin', bytes: 375 },
      { path: 'parakeet-tdt-0.6b-v3-encoder.mlmodelc/metadata.json', bytes: 2151 },
      { path: 'parakeet-tdt-0.6b-v3-encoder.mlmodelc/model.mil', bytes: 578180 },
      { path: 'parakeet-tdt-0.6b-v3-encoder.mlmodelc/weights/weight.bin', bytes: 460225408 }
    ]
  }
}

const COREML_PLATFORMS = ['darwin', 'ios']

/** @typedef {{ setKey: string, flatFile: string, files: { path: string, bytes: number }[] }} CoremlSet */

/**
 * @param {string} name
 * @param {string} platform
 * @returns {CoremlSet | null}
 */
export const getCoremlSet = (name, platform) =>
  COREML_PLATFORMS.includes(platform) ? (LOCAL_AI_COREML_SETS[name] ?? null) : null

/**
 * @param {string} name
 * @returns {string | null}
 */
export const getFlatModelFile = (name) => LOCAL_AI_COREML_SETS[name]?.flatFile ?? null

/**
 * @param {CoremlSet} set
 * @returns {number}
 */
export const getCoremlSetBytes = (set) => set.files.reduce((sum, file) => sum + file.bytes, 0)

export const LOCAL_AI_REGISTRY_MODELS = {
  WHISPER_TINY_Q8_0: { bytes: 43537433, engine: 'whisper', license: LOCAL_AI_LICENSE.MIT },
  WHISPER_EN_TINY_Q8_0: { bytes: 43550795, engine: 'whisper', license: LOCAL_AI_LICENSE.MIT },
  WHISPER_BASE_Q8_0: { bytes: 81768585, engine: 'whisper', license: LOCAL_AI_LICENSE.MIT },
  WHISPER_EN_BASE_Q8_0: { bytes: 81781811, engine: 'whisper', license: LOCAL_AI_LICENSE.MIT },
  VAD_SILERO_5_1_2: { bytes: 885098, engine: 'whisper', license: LOCAL_AI_LICENSE.MIT },
  PARAKEET_TDT_0_6B_V3_Q4_0: {
    bytes: 398734976,
    engine: 'parakeet',
    license: LOCAL_AI_LICENSE.CC_BY_4
  },
  OCR_LATIN: { bytes: 15396512, engine: 'ocr', license: LOCAL_AI_LICENSE.APACHE_2 },
  OCR_CRAFT: { bytes: 83133856, engine: 'ocr', license: LOCAL_AI_LICENSE.MIT },
  VISIONPSY_NANO_460M_MULTIMODAL_Q4_K_M: {
    bytes: 303143488,
    engine: 'llm',
    license: LOCAL_AI_LICENSE.APACHE_2
  },
  MMPROJ_VISIONPSY_NANO_460M_MULTIMODAL_Q8_0: {
    bytes: 108782144,
    engine: 'llm',
    license: LOCAL_AI_LICENSE.APACHE_2
  },
  QWEN3_5_0_8B_MULTIMODAL_Q4_K_M: {
    bytes: 532517120,
    engine: 'llm',
    license: LOCAL_AI_LICENSE.APACHE_2
  },
  MMPROJ_QWEN3_5_0_8B_MULTIMODAL_Q8_0: {
    bytes: 115923680,
    engine: 'llm',
    license: LOCAL_AI_LICENSE.APACHE_2
  },
  QWEN3_600M_INST_Q4: { bytes: 382156480, engine: 'llm', license: LOCAL_AI_LICENSE.APACHE_2 },
  QWEN3_1_7B_INST_Q4: { bytes: 1056782912, engine: 'llm', license: LOCAL_AI_LICENSE.APACHE_2 },
  QWEN3_4B_INST_Q4_K_M: { bytes: 2497280256, engine: 'llm', license: LOCAL_AI_LICENSE.APACHE_2 },
  QWEN3_8B_INST_Q4_K_M: {
    bytes: 5027783488,
    engine: 'llm',
    license: LOCAL_AI_LICENSE.APACHE_2,
    tools: true
  },
  EMBEDDINGGEMMA_300M_Q4_0: {
    bytes: 277852192,
    engine: 'embed',
    license: LOCAL_AI_LICENSE.PENDING
  },
  ...TRANSLATION_REGISTRY_MODELS
}

/** Loaded with `modelConfig.tools: true`; the SDK ignores tools on any other load. */
export const isToolCallingModel = (name) => LOCAL_AI_REGISTRY_MODELS[name]?.tools === true

const QVAC_DOCS_BASE = 'https://docs.qvac.tether.io/'

/** Linked from the "QVAC" mention in the on-device AI footer. */
export const QVAC_MODEL_LIBRARY_URL = 'https://qvac.tether.io/products/sdk'

// The QVAC docs have a page per engine, not per model, so that is the finest
// link we can offer. Pointing at the vendor's own documentation keeps this
// honest: the weights are distributed by QVAC, so QVAC is who should describe
// them. Upstream repos host the original weights, not the build we ship.
const DOCS_PATH_BY_ENGINE = {
  whisper: 'addons/transcription-whispercpp/',
  parakeet: 'addons/transcription-parakeet/',
  ocr: 'ai-capabilities/ocr/',
  llm: 'ai-capabilities/text-generation/',
  nmt: 'ai-capabilities/translation/'
}

const MULTIMODAL_DOCS_PATH = 'ai-capabilities/multimodal/'

/** The QVAC documentation page describing the engine behind a model. */
export function getModelDocsUrl(name) {
  if (isTranslationModel(name)) return QVAC_DOCS_BASE + DOCS_PATH_BY_ENGINE.nmt
  const engine = LOCAL_AI_REGISTRY_MODELS[name]?.engine
  if (!engine) return null
  // 'llm' covers both plain text generation and the image-description pair,
  // which are documented on separate pages.
  if (
    engine === 'llm' &&
    getFeatureRegistryNames(LOCAL_AI_FEATURE.DESCRIBE_IMAGES, {}).includes(name)
  ) {
    return QVAC_DOCS_BASE + MULTIMODAL_DOCS_PATH
  }
  const path = DOCS_PATH_BY_ENGINE[engine]
  return path ? QVAC_DOCS_BASE + path : null
}

const VOICE_MODELS = {
  [LOCAL_AI_TIER.LITE]: {
    [LOCAL_AI_LANGUAGE.AUTO]: ['WHISPER_TINY_Q8_0', 'VAD_SILERO_5_1_2'],
    [LOCAL_AI_LANGUAGE.ENGLISH]: ['WHISPER_EN_TINY_Q8_0', 'VAD_SILERO_5_1_2']
  },
  [LOCAL_AI_TIER.STANDARD]: {
    [LOCAL_AI_LANGUAGE.AUTO]: ['WHISPER_BASE_Q8_0', 'VAD_SILERO_5_1_2'],
    [LOCAL_AI_LANGUAGE.ENGLISH]: ['WHISPER_EN_BASE_Q8_0', 'VAD_SILERO_5_1_2']
  },
  [LOCAL_AI_TIER.BEST]: {
    [LOCAL_AI_LANGUAGE.AUTO]: ['PARAKEET_TDT_0_6B_V3_Q4_0'],
    [LOCAL_AI_LANGUAGE.ENGLISH]: ['PARAKEET_TDT_0_6B_V3_Q4_0']
  }
}

const VISION_MODELS = ['QWEN3_5_0_8B_MULTIMODAL_Q4_K_M', 'MMPROJ_QWEN3_5_0_8B_MULTIMODAL_Q8_0']

const FEATURE_MODELS = {
  [LOCAL_AI_FEATURE.VOICE_TYPING]: VOICE_MODELS,
  [LOCAL_AI_FEATURE.TRANSCRIBE_RECORDINGS]: VOICE_MODELS,
  [LOCAL_AI_FEATURE.EXTRACT_TEXT]: {
    [LOCAL_AI_TIER.STANDARD]: { [LOCAL_AI_LANGUAGE.AUTO]: ['OCR_LATIN', 'OCR_CRAFT'] },
    [LOCAL_AI_TIER.BEST]: { [LOCAL_AI_LANGUAGE.AUTO]: VISION_MODELS }
  },
  [LOCAL_AI_FEATURE.DESCRIBE_IMAGES]: {
    [LOCAL_AI_TIER.STANDARD]: { [LOCAL_AI_LANGUAGE.AUTO]: VISION_MODELS }
  },
  [LOCAL_AI_FEATURE.SUMMARIZE_RECORDINGS]: {
    [LOCAL_AI_TIER.STANDARD]: { [LOCAL_AI_LANGUAGE.AUTO]: ['QWEN3_600M_INST_Q4'] },
    [LOCAL_AI_TIER.BEST]: { [LOCAL_AI_LANGUAGE.AUTO]: ['QWEN3_1_7B_INST_Q4'] }
  },
  [LOCAL_AI_FEATURE.TRANSLATE_NOTES]: {
    [LOCAL_AI_TIER.STANDARD]: { [LOCAL_AI_LANGUAGE.AUTO]: [] }
  },
  // LOCAL_AI_EMBEDDING_MODEL.model (localAiTiers imports this file, so it can't be imported here).
  [LOCAL_AI_FEATURE.SEARCH_BY_MEANING]: {
    [LOCAL_AI_TIER.STANDARD]: { [LOCAL_AI_LANGUAGE.AUTO]: ['EMBEDDINGGEMMA_300M_Q4_0'] }
  }
}

export const isOcrModel = (name) => LOCAL_AI_REGISTRY_MODELS[name]?.engine === 'ocr'

export const getFeatureTiers = (feature) => Object.keys(FEATURE_MODELS[feature] ?? {})

export const getFeatureLanguages = (feature) => {
  const standard = FEATURE_MODELS[feature]?.[LOCAL_AI_TIER.STANDARD] ?? {}
  return Object.keys(standard)
}

export const getDefaultFeatureLanguage = (feature) => {
  const languages = getFeatureLanguages(feature)
  return languages.includes(LOCAL_AI_LANGUAGE.AUTO)
    ? LOCAL_AI_LANGUAGE.AUTO
    : (languages[0] ?? LOCAL_AI_LANGUAGE.AUTO)
}

export const LOCAL_AI_TEXT_TASK = {
  WRITE: 'write',
  ASK: 'ask'
}

const STANDARD_TEXT_MODEL = 'QWEN3_600M_INST_Q4'
const BEST_WRITING_MODEL = 'QWEN3_1_7B_INST_Q4'
const BEST_PHONE_ASK_MODEL = 'QWEN3_1_7B_INST_Q4'
const BEST_DESKTOP_ASK_MODEL = 'QWEN3_4B_INST_Q4_K_M'

export const LOCAL_AI_ASK_MODEL_CHOICES = [
  { name: 'QWEN3_1_7B_INST_Q4', desktopOnly: false },
  { name: 'QWEN3_4B_INST_Q4_K_M', desktopOnly: false },
  { name: 'QWEN3_8B_INST_Q4_K_M', desktopOnly: true }
]

const TEXT_MODEL_LABELS = {
  QWEN3_600M_INST_Q4: 'Qwen3 0.6B',
  QWEN3_1_7B_INST_Q4: 'Qwen3 1.7B',
  QWEN3_4B_INST_Q4_K_M: 'Qwen3 4B',
  QWEN3_8B_INST_Q4_K_M: 'Qwen3 8B'
}

export const getTextModelLabel = (name) => TEXT_MODEL_LABELS[name] ?? name

let deviceProfile = { platform: '', totalMemoryBytes: 0 }

/** Each process sets this once at startup; Best's model choice depends on it. */
export function configureLocalAiDevice({ platform = '', totalMemoryBytes = 0 } = {}) {
  deviceProfile = { platform, totalMemoryBytes: Number(totalMemoryBytes) || 0 }
}

export const getLocalAiDevice = () => deviceProfile

export const isDesktopPlatform = (platform) =>
  ['desktop', 'darwin', 'win32', 'linux'].includes(platform)

export const getAskModelChoices = (device = deviceProfile) =>
  LOCAL_AI_ASK_MODEL_CHOICES.filter(
    (choice) => !choice.desktopOnly || isDesktopPlatform(device.platform)
  ).map((choice) => choice.name)

export const getAutoBestAskModel = (device = deviceProfile) =>
  isDesktopPlatform(device.platform) &&
  canRunModels([BEST_DESKTOP_ASK_MODEL], device.totalMemoryBytes)
    ? BEST_DESKTOP_ASK_MODEL
    : BEST_PHONE_ASK_MODEL

/**
 * The text model for one task. Standard runs everything on 0.6B. Best keeps
 * writing tools and titles on the fastest model that passes the rewrite eval,
 * and gives Ask, summaries and vault Ask the chosen model, or the best this
 * device runs.
 */
export function getTextTaskModel(featureConfig, task, device = deviceProfile) {
  if (featureConfig?.tier !== LOCAL_AI_TIER.BEST) return STANDARD_TEXT_MODEL
  if (task === LOCAL_AI_TEXT_TASK.WRITE) return BEST_WRITING_MODEL
  if (getAskModelChoices(device).includes(featureConfig.model)) return featureConfig.model
  return getAutoBestAskModel(device)
}

/**
 * While Best's automatic Ask model is still downloading, Ask uses this one,
 * so choosing Best never takes Ask away. Null when there is nothing to fall back to.
 */
export function getTextAskFallback(featureConfig, device = deviceProfile) {
  if (featureConfig?.tier !== LOCAL_AI_TIER.BEST || featureConfig.model) return null
  const preferred = getTextTaskModel(featureConfig, LOCAL_AI_TEXT_TASK.ASK, device)
  return preferred === BEST_PHONE_ASK_MODEL ? null : BEST_PHONE_ASK_MODEL
}

/**
 * Without a task, a text feature lists every model its tasks use.
 *
 * @param {string} feature
 * @param {object} [featureConfig]
 * @param {string} [task]
 */
export function getFeatureRegistryNames(feature, featureConfig, task) {
  if (feature === LOCAL_AI_FEATURE.SUMMARIZE_RECORDINGS) {
    const tasks = task ? [task] : [LOCAL_AI_TEXT_TASK.WRITE, LOCAL_AI_TEXT_TASK.ASK]
    return [...new Set(tasks.map((each) => getTextTaskModel(featureConfig, each)))]
  }
  const tiers = FEATURE_MODELS[feature]
  if (!tiers) return []
  const tierModels = tiers[featureConfig?.tier] ?? tiers[LOCAL_AI_TIER.STANDARD]
  return (
    tierModels[featureConfig?.language] ??
    tierModels[LOCAL_AI_LANGUAGE.AUTO] ??
    tierModels[getDefaultFeatureLanguage(feature)] ??
    []
  )
}

const MB = 1024 * 1024

export const LOCAL_AI_MEMORY_BUDGET_RATIO = 0.5
export const LOCAL_AI_APP_MEMORY_RESERVE_BYTES = 700 * MB
export const LOCAL_AI_MEMORY_MARGIN = 1.25
const TRANSLATION_MODEL_MEMORY_BYTES = 200 * MB

export const LOCAL_AI_MODEL_MEMORY_BYTES = {
  WHISPER_TINY_Q8_0: 300 * MB,
  WHISPER_EN_TINY_Q8_0: 300 * MB,
  WHISPER_BASE_Q8_0: 450 * MB,
  WHISPER_EN_BASE_Q8_0: 450 * MB,
  VAD_SILERO_5_1_2: 0,
  PARAKEET_TDT_0_6B_V3_Q4_0: 2400 * MB,
  OCR_LATIN: 0,
  OCR_CRAFT: 600 * MB,
  VISIONPSY_NANO_460M_MULTIMODAL_Q4_K_M: 750 * MB,
  MMPROJ_VISIONPSY_NANO_460M_MULTIMODAL_Q8_0: 0,
  QWEN3_5_0_8B_MULTIMODAL_Q4_K_M: 950 * MB,
  MMPROJ_QWEN3_5_0_8B_MULTIMODAL_Q8_0: 0,
  QWEN3_600M_INST_Q4: 750 * MB,
  QWEN3_1_7B_INST_Q4: 1250 * MB,
  QWEN3_4B_INST_Q4_K_M: 3138 * MB,
  QWEN3_8B_INST_Q4_K_M: 5558 * MB,
  EMBEDDINGGEMMA_300M_Q4_0: 1024 * MB
}

export const getModelMemoryBytes = (name) =>
  LOCAL_AI_MODEL_MEMORY_BYTES[name] ??
  (isTranslationModel(name) ? TRANSLATION_MODEL_MEMORY_BYTES : 0)

export const getModelsMemoryBytes = (names) =>
  names.reduce((sum, name) => sum + getModelMemoryBytes(name), 0)

export function getLocalAiMemoryBudget(totalMemoryBytes) {
  const total = Number(totalMemoryBytes) || 0
  if (total <= 0) return Infinity
  return Math.max(0, total * LOCAL_AI_MEMORY_BUDGET_RATIO - LOCAL_AI_APP_MEMORY_RESERVE_BYTES)
}

export const canRunModels = (names, totalMemoryBytes) =>
  getModelsMemoryBytes(names) * LOCAL_AI_MEMORY_MARGIN <= getLocalAiMemoryBudget(totalMemoryBytes)

export function canRunFeature(feature, featureConfig, totalMemoryBytes) {
  if (isOnDemandFeature(feature)) {
    return (
      TRANSLATION_MODEL_MEMORY_BYTES * LOCAL_AI_MEMORY_MARGIN <=
      getLocalAiMemoryBudget(totalMemoryBytes)
    )
  }
  const names = getFeatureRegistryNames(feature, featureConfig)
  if (feature === LOCAL_AI_FEATURE.SUMMARIZE_RECORDINGS) {
    return names.every((name) => canRunModels([name], totalMemoryBytes))
  }
  return canRunModels(names, totalMemoryBytes)
}

/**
 * Whether the device can run this feature at *any* quality. A feature is only
 * out of reach when nothing fits — picking a tier the device is too small for
 * is the user's call, and must not take the whole feature away with it.
 */
export function canRunAnyTier(feature, featureConfig, totalMemoryBytes) {
  const tiers = getFeatureTiers(feature)
  if (tiers.length === 0) return canRunFeature(feature, featureConfig, totalMemoryBytes)
  return tiers.some((tier) => canRunFeature(feature, { ...featureConfig, tier }, totalMemoryBytes))
}

export function pickRunnableTier(feature, featureConfig, totalMemoryBytes) {
  if (canRunFeature(feature, featureConfig, totalMemoryBytes)) {
    return featureConfig?.tier ?? LOCAL_AI_TIER.STANDARD
  }
  const fallbacks = [LOCAL_AI_TIER.STANDARD, LOCAL_AI_TIER.LITE].filter((tier) =>
    getFeatureTiers(feature).includes(tier)
  )
  return (
    fallbacks.find((tier) =>
      canRunFeature(feature, { ...featureConfig, tier }, totalMemoryBytes)
    ) ?? null
  )
}

/**
 * @param {string} name
 * @returns {number}
 */
export const getModelDownloadBytes = (name) => {
  const set = getCoremlSet(name, deviceProfile.platform)
  return set ? getCoremlSetBytes(set) : (LOCAL_AI_REGISTRY_MODELS[name]?.bytes ?? 0)
}

export const getRegistryNamesBytes = (names) =>
  names.reduce((sum, name) => sum + getModelDownloadBytes(name), 0)

export function getFreeSpaceShortfall(disk, requiredBytes) {
  const freeBytes = disk?.freeBytes ?? 0
  const totalBytes = disk?.totalBytes ?? 0
  const floor = Math.max(
    LOCAL_AI_MIN_FREE_BYTES,
    Math.min(totalBytes * LOCAL_AI_FREE_RATIO, LOCAL_AI_MAX_FREE_FLOOR_BYTES)
  )
  return Math.max(0, requiredBytes + floor - freeBytes)
}

export function createDefaultLocalAiConfig() {
  return {
    version: LOCAL_AI_CONFIG_VERSION,
    wifiOnly: true,
    features: Object.fromEntries(
      LOCAL_AI_FEATURE_IDS.map((feature) => [
        feature,
        {
          enabled: false,
          tier: LOCAL_AI_TIER.STANDARD,
          language: getDefaultFeatureLanguage(feature),
          ...(feature === LOCAL_AI_FEATURE.SUMMARIZE_RECORDINGS ? { model: null } : {})
        }
      ])
    ),
    translation: { lastTarget: null },
    offload: { useMac: false, serve: false },
    downloaded: {}
  }
}

export function parseLocalAiConfig(raw) {
  const config = createDefaultLocalAiConfig()
  if (!raw) return config
  let parsed = null
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch {
    return config
  }
  if (!parsed || typeof parsed !== 'object') return config

  if (typeof parsed.wifiOnly === 'boolean') config.wifiOnly = parsed.wifiOnly

  for (const feature of LOCAL_AI_FEATURE_IDS) {
    const stored = parsed.features?.[feature]
    if (!stored || typeof stored !== 'object') continue
    const target = config.features[feature]
    target.enabled = stored.enabled === true
    if (getFeatureTiers(feature).includes(stored.tier)) target.tier = stored.tier
    if (getFeatureLanguages(feature).includes(stored.language)) target.language = stored.language
    if (
      feature === LOCAL_AI_FEATURE.SUMMARIZE_RECORDINGS &&
      LOCAL_AI_ASK_MODEL_CHOICES.some((choice) => choice.name === stored.model)
    ) {
      target.model = stored.model
    }
  }

  config.offload.useMac = parsed.offload?.useMac === true
  config.offload.serve = parsed.offload?.serve === true

  if (TRANSLATION_ALL_LANGUAGES.includes(parsed.translation?.lastTarget)) {
    config.translation.lastTarget = parsed.translation.lastTarget
  }

  for (const [name, entry] of Object.entries(parsed.downloaded ?? {})) {
    if (!LOCAL_AI_REGISTRY_MODELS[name]) continue
    const bytes = Number(entry?.bytes)
    if (!Number.isFinite(bytes) || bytes <= 0) continue
    const downloadedAt = Number(entry?.downloadedAt)
    config.downloaded[name] = {
      bytes,
      downloadedAt: Number.isFinite(downloadedAt) ? downloadedAt : 0
    }
  }

  return config
}

export const serializeLocalAiConfig = (config) => JSON.stringify(config)
