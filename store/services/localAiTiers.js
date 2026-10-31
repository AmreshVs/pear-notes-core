import {
  getLocalAiMemoryBudget,
  LOCAL_AI_MEMORY_MARGIN,
  LOCAL_AI_MODEL_MEMORY_BYTES
} from './localAiCatalog.js'

const MB = 1024 * 1024

export const LOCAL_AI_TEXT_TIER = {
  SMALL: 'small',
  STANDARD: 'standard',
  LARGE: 'large',
  XL: 'xl'
}

export const LOCAL_AI_TEXT_TIERS = Object.values(LOCAL_AI_TEXT_TIER)

export const LOCAL_AI_TIER_UNFIT_REASON = {
  DESKTOP_ONLY: 'desktop-only',
  MEMORY: 'memory',
  ASSESSED_TOO_LARGE: 'assessed-too-large'
}

/**
 * Text model tiers. `small` and `standard` use their M0 memory figures.
 * `large` and `xl` were measured in M3 (2026-10-10) as the worker's RSS on a
 * 16 GB Mac after a 1,500-token prompt, mapped weights included; contexts are
 * largest first. Download sizes are the registry's `expectedSize`.
 */
export const LOCAL_AI_TEXT_TIER_MODELS = {
  [LOCAL_AI_TEXT_TIER.SMALL]: {
    model: 'QWEN3_600M_INST_Q4',
    downloadBytes: 382156480,
    contexts: [{ tokens: 4096, memoryBytes: LOCAL_AI_MODEL_MEMORY_BYTES.QWEN3_600M_INST_Q4 }]
  },
  [LOCAL_AI_TEXT_TIER.STANDARD]: {
    model: 'QWEN3_1_7B_INST_Q4',
    downloadBytes: 1056782912,
    contexts: [{ tokens: 4096, memoryBytes: LOCAL_AI_MODEL_MEMORY_BYTES.QWEN3_1_7B_INST_Q4 }]
  },
  [LOCAL_AI_TEXT_TIER.LARGE]: {
    model: 'QWEN3_4B_INST_Q4_K_M',
    downloadBytes: 2497280256,
    contexts: [
      { tokens: 8192, memoryBytes: 3443 * MB },
      { tokens: 4096, memoryBytes: 3138 * MB }
    ]
  },
  [LOCAL_AI_TEXT_TIER.XL]: {
    model: 'QWEN3_8B_INST_Q4_K_M',
    downloadBytes: 5027783488,
    contexts: [
      { tokens: 16384, memoryBytes: 6204 * MB },
      { tokens: 8192, memoryBytes: 5824 * MB },
      { tokens: 4096, memoryBytes: 5558 * MB }
    ],
    desktopOnly: true
  }
}

export const LOCAL_AI_EMBEDDING_MODEL = {
  model: 'EMBEDDINGGEMMA_300M_Q4_0',
  downloadBytes: 277852192,
  memoryBytes: 1024 * MB,
  modelConfig: { batchSize: 512 },
  dims: 768,
  textsPerCall: 32
}

export const getTextTierContexts = (tier) => LOCAL_AI_TEXT_TIER_MODELS[tier]?.contexts ?? []

const isDesktop = (platform) =>
  platform === 'desktop' || platform === 'darwin' || platform === 'win32' || platform === 'linux'

/**
 * Whether this device can run a text tier, and at which context size.
 * `assessment` is an optional `assessModelFit` verdict for the tier's model:
 * 'likely-too-large' vetoes, 'unknown' and 'likely-fits' defer to the gate.
 *
 * @param {string} tier
 * @param {{ totalMemoryBytes?: number, platform?: string, assessment?: string }} [device]
 */
export function getTextTierFit(tier, { totalMemoryBytes = 0, platform = '', assessment } = {}) {
  const entry = LOCAL_AI_TEXT_TIER_MODELS[tier]
  if (!entry) return null
  const base = { tier, model: entry.model, downloadBytes: entry.downloadBytes }
  if (entry.desktopOnly && !isDesktop(platform)) {
    return { ...base, fits: false, reason: LOCAL_AI_TIER_UNFIT_REASON.DESKTOP_ONLY }
  }
  if (assessment === 'likely-too-large') {
    return { ...base, fits: false, reason: LOCAL_AI_TIER_UNFIT_REASON.ASSESSED_TOO_LARGE }
  }
  const budget = getLocalAiMemoryBudget(totalMemoryBytes)
  const context = getTextTierContexts(tier).find(
    (option) => option.memoryBytes * LOCAL_AI_MEMORY_MARGIN <= budget
  )
  if (!context) return { ...base, fits: false, reason: LOCAL_AI_TIER_UNFIT_REASON.MEMORY }
  return {
    ...base,
    fits: true,
    reason: null,
    contextTokens: context.tokens,
    memoryBytes: context.memoryBytes
  }
}

export const getTextTierFits = (device) =>
  LOCAL_AI_TEXT_TIERS.map((tier) =>
    getTextTierFit(tier, { ...device, assessment: device?.assessments?.[tier] })
  )

/**
 * The default text tier: desktop takes the largest that fits, mobile stays at
 * `standard` or below, because a bigger model costs battery on every request.
 */
export function pickDefaultTextTier(device = {}) {
  const fits = getTextTierFits(device).filter((fit) => fit.fits)
  const allowed = isDesktop(device.platform)
    ? fits
    : fits.filter((fit) =>
        [LOCAL_AI_TEXT_TIER.SMALL, LOCAL_AI_TEXT_TIER.STANDARD].includes(fit.tier)
      )
  return allowed.at(-1)?.tier ?? null
}

/** Whether the embedding model and an LLM tier can be loaded at the same time. */
export function canColoadEmbedding(tier, { totalMemoryBytes = 0 } = {}) {
  const contexts = getTextTierContexts(tier)
  if (contexts.length === 0) return false
  const smallest = Math.min(...contexts.map((option) => option.memoryBytes))
  return (
    (smallest + LOCAL_AI_EMBEDDING_MODEL.memoryBytes) * LOCAL_AI_MEMORY_MARGIN <=
    getLocalAiMemoryBudget(totalMemoryBytes)
  )
}
