/** The QVAC documentation page describing the engine behind a model. */
export function getModelDocsUrl(name: any): string;
/** Each process sets this once at startup; Best's model choice depends on it. */
export function configureLocalAiDevice({ platform, totalMemoryBytes }?: {
    platform?: string;
    totalMemoryBytes?: number;
}): void;
/**
 * The text model for one task. Standard runs everything on 0.6B. Best keeps
 * writing tools and titles on the fastest model that passes the rewrite eval,
 * and gives Ask, summaries and vault Ask the chosen model, or the best this
 * device runs.
 */
export function getTextTaskModel(featureConfig: any, task: any, device?: {
    platform: string;
    totalMemoryBytes: number;
}): any;
/**
 * While Best's automatic Ask model is still downloading, Ask uses this one,
 * so choosing Best never takes Ask away. Null when there is nothing to fall back to.
 */
export function getTextAskFallback(featureConfig: any, device?: {
    platform: string;
    totalMemoryBytes: number;
}): string;
/**
 * Without a task, a text feature lists every model its tasks use.
 *
 * @param {string} feature
 * @param {object} [featureConfig]
 * @param {string} [task]
 */
export function getFeatureRegistryNames(feature: string, featureConfig?: object, task?: string): any[];
export function getLocalAiMemoryBudget(totalMemoryBytes: any): number;
export function canRunFeature(feature: any, featureConfig: any, totalMemoryBytes: any): boolean;
/**
 * Whether the device can run this feature at *any* quality. A feature is only
 * out of reach when nothing fits — picking a tier the device is too small for
 * is the user's call, and must not take the whole feature away with it.
 */
export function canRunAnyTier(feature: any, featureConfig: any, totalMemoryBytes: any): boolean;
export function pickRunnableTier(feature: any, featureConfig: any, totalMemoryBytes: any): any;
export function getFreeSpaceShortfall(disk: any, requiredBytes: any): number;
export function createDefaultLocalAiConfig(): {
    version: number;
    wifiOnly: boolean;
    features: {
        [k: string]: {
            model?: any;
            enabled: boolean;
            tier: string;
            language: string;
        };
    };
    translation: {
        lastTarget: any;
    };
    offload: {
        useMac: boolean;
        serve: boolean;
    };
    downloaded: {};
};
export function parseLocalAiConfig(raw: any): {
    version: number;
    wifiOnly: boolean;
    features: {
        [k: string]: {
            model?: any;
            enabled: boolean;
            tier: string;
            language: string;
        };
    };
    translation: {
        lastTarget: any;
    };
    offload: {
        useMac: boolean;
        serve: boolean;
    };
    downloaded: {};
};
export const LOCAL_AI_ENABLED: true;
export const LOCAL_AI_CONFIG_KEY: "localAiConfig";
export const LOCAL_AI_CONFIG_VERSION: 1;
export namespace LOCAL_AI_FEATURE {
    let VOICE_TYPING: string;
    let TRANSCRIBE_RECORDINGS: string;
    let EXTRACT_TEXT: string;
    let DESCRIBE_IMAGES: string;
    let SUMMARIZE_RECORDINGS: string;
    let TRANSLATE_NOTES: string;
    let SEARCH_BY_MEANING: string;
}
export const LOCAL_AI_FEATURE_IDS: string[];
export namespace LOCAL_AI_GROUP {
    let VOICE_AND_AUDIO: string;
    let IMAGES_AND_SCANS: string;
    let NOTES: string;
}
export const LOCAL_AI_GROUPS: {
    id: string;
    features: string[];
}[];
export function isOnDemandFeature(feature: any): boolean;
export function getOnDemandModelNames(feature: any, models: any): string[];
export function isOnDemandModelFor(feature: any, name: any): boolean;
export namespace LOCAL_AI_TIER {
    let LITE: string;
    let STANDARD: string;
    let BEST: string;
}
export namespace LOCAL_AI_LANGUAGE {
    let AUTO: string;
    let ENGLISH: string;
}
export namespace LOCAL_AI_MODEL_STATUS {
    let NONE: string;
    let QUEUED: string;
    let WAITING_NETWORK: string;
    let DOWNLOADING: string;
    let PAUSED: string;
    let FAILED: string;
    let READY: string;
}
export namespace LOCAL_AI_FEATURE_STATUS {
    export let UNSUPPORTED: string;
    export let OFF: string;
    let DOWNLOADING_1: string;
    export { DOWNLOADING_1 as DOWNLOADING };
    let WAITING_NETWORK_1: string;
    export { WAITING_NETWORK_1 as WAITING_NETWORK };
    let PAUSED_1: string;
    export { PAUSED_1 as PAUSED };
    let FAILED_1: string;
    export { FAILED_1 as FAILED };
    export let NEEDS_MEMORY: string;
    let READY_1: string;
    export { READY_1 as READY };
}
export namespace LOCAL_AI_DEVICE_STATUS {
    export let UNKNOWN: string;
    export let SUPPORTED: string;
    export let LIMITED: string;
    let UNSUPPORTED_1: string;
    export { UNSUPPORTED_1 as UNSUPPORTED };
}
export namespace LOCAL_AI_UNSUPPORTED_REASON {
    let SIMULATOR: string;
    let OS_VERSION: string;
    let ARCHITECTURE: string;
    let GPU: string;
    let STORE_BUILD: string;
}
export namespace LOCAL_AI_NETWORK {
    export let WIFI: string;
    export let CELLULAR: string;
    export let METERED: string;
    export let OFFLINE: string;
    export let OTHER: string;
    let UNKNOWN_1: string;
    export { UNKNOWN_1 as UNKNOWN };
}
export namespace LOCAL_AI_NOTICE {
    let INSUFFICIENT_SPACE: string;
}
export namespace LOCAL_AI_ERROR {
    export let DOWNLOAD_FAILED: string;
    let INSUFFICIENT_SPACE_1: string;
    export { INSUFFICIENT_SPACE_1 as INSUFFICIENT_SPACE };
    export let INTERRUPTED: string;
    export let MODEL_MISSING: string;
    export let NOT_ENOUGH_MEMORY: string;
    export let MODEL_UNSTABLE: string;
    export let INPUT_TOO_LONG: string;
    export let TASK_FAILED: string;
}
export namespace LOCAL_AI_LICENSE {
    let MIT: string;
    let APACHE_2: string;
    let MPL_2: string;
    let CC_BY_4: string;
    let PENDING: string;
}
export const LOCAL_AI_MIN_FREE_BYTES: number;
export const LOCAL_AI_MAX_FREE_FLOOR_BYTES: number;
export const LOCAL_AI_FREE_RATIO: 0.1;
export const LOCAL_AI_OCR_LANGUAGES: string[];
export const LOCAL_AI_LIMITED_MEMORY_BYTES: number;
/** Model cache files an SDK upgrade replaced: `<sha256(registryPath) first 16 hex>_<file name>`. */
export const LOCAL_AI_RETIRED_MODEL_FILES: {
    registryPath: string;
    file: string;
}[];
export function getCoremlSet(name: string, platform: string): CoremlSet | null;
export function getFlatModelFile(name: string): string | null;
export function getCoremlSetBytes(set: CoremlSet): number;
export const LOCAL_AI_REGISTRY_MODELS: {
    BERGAMOT_EN_SQ: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_SQ_EN: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_EN_AR: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_AR_EN: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_EN_AZ: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_AZ_EN: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_EN_BN: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_BN_EN: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_EN_BS: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_BS_EN: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_EN_BG: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_BG_EN: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_EN_CA: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_CA_EN: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_EN_ZH: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_ZH_EN: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_EN_HR: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_HR_EN: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_EN_CS: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_CS_EN: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_EN_DA: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_DA_EN: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_EN_NL: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_NL_EN: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_EN_ET: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_ET_EN: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_EN_FI: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_FI_EN: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_EN_FR: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_FR_EN: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_EN_DE: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_DE_EN: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_EN_EL: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_EL_EN: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_EN_GU: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_GU_EN: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_EN_HE: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_HE_EN: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_EN_HI: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_HI_EN: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_EN_HU: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_HU_EN: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_EN_IS: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_IS_EN: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_EN_ID: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_ID_EN: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_EN_IT: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_IT_EN: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_EN_JA: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_JA_EN: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_EN_KN: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_KN_EN: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_EN_KO: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_KO_EN: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_EN_LV: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_LV_EN: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_EN_LT: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_LT_EN: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_EN_MS: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_MS_EN: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_EN_ML: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_ML_EN: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_EN_NB: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_NB_EN: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_EN_FA: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_FA_EN: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_EN_PL: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_PL_EN: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_EN_PT: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_PT_EN: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_EN_RO: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_RO_EN: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_EN_RU: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_RU_EN: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_EN_SR: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_SR_EN: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_EN_SK: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_SK_EN: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_EN_SL: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_SL_EN: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_EN_ES: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_ES_EN: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_EN_SV: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_SV_EN: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_EN_TA: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_TA_EN: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_EN_TE: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_TE_EN: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_EN_TH: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_TH_EN: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_EN_TR: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_TR_EN: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_EN_UK: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_UK_EN: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_EN_VI: {
        bytes: any;
        engine: string;
        license: string;
    };
    BERGAMOT_VI_EN: {
        bytes: any;
        engine: string;
        license: string;
    };
    WHISPER_TINY_Q8_0: {
        bytes: number;
        engine: string;
        license: string;
    };
    WHISPER_EN_TINY_Q8_0: {
        bytes: number;
        engine: string;
        license: string;
    };
    WHISPER_BASE_Q8_0: {
        bytes: number;
        engine: string;
        license: string;
    };
    WHISPER_EN_BASE_Q8_0: {
        bytes: number;
        engine: string;
        license: string;
    };
    VAD_SILERO_5_1_2: {
        bytes: number;
        engine: string;
        license: string;
    };
    PARAKEET_TDT_0_6B_V3_Q4_0: {
        bytes: number;
        engine: string;
        license: string;
    };
    OCR_LATIN: {
        bytes: number;
        engine: string;
        license: string;
    };
    OCR_CRAFT: {
        bytes: number;
        engine: string;
        license: string;
    };
    VISIONPSY_NANO_460M_MULTIMODAL_Q4_K_M: {
        bytes: number;
        engine: string;
        license: string;
    };
    MMPROJ_VISIONPSY_NANO_460M_MULTIMODAL_Q8_0: {
        bytes: number;
        engine: string;
        license: string;
    };
    QWEN3_5_0_8B_MULTIMODAL_Q4_K_M: {
        bytes: number;
        engine: string;
        license: string;
    };
    MMPROJ_QWEN3_5_0_8B_MULTIMODAL_Q8_0: {
        bytes: number;
        engine: string;
        license: string;
    };
    QWEN3_600M_INST_Q4: {
        bytes: number;
        engine: string;
        license: string;
    };
    QWEN3_1_7B_INST_Q4: {
        bytes: number;
        engine: string;
        license: string;
    };
    QWEN3_4B_INST_Q4_K_M: {
        bytes: number;
        engine: string;
        license: string;
    };
    QWEN3_8B_INST_Q4_K_M: {
        bytes: number;
        engine: string;
        license: string;
        tools: boolean;
    };
    EMBEDDINGGEMMA_300M_Q4_0: {
        bytes: number;
        engine: string;
        license: string;
    };
};
export function isToolCallingModel(name: any): boolean;
/** Linked from the "QVAC" mention in the on-device AI footer. */
export const QVAC_MODEL_LIBRARY_URL: "https://qvac.tether.io/products/sdk";
export function isOcrModel(name: any): boolean;
export function getFeatureTiers(feature: any): string[];
export function getFeatureLanguages(feature: any): string[];
export function getDefaultFeatureLanguage(feature: any): string;
export namespace LOCAL_AI_TEXT_TASK {
    let WRITE: string;
    let ASK: string;
}
export const LOCAL_AI_ASK_MODEL_CHOICES: {
    name: string;
    desktopOnly: boolean;
}[];
export function getTextModelLabel(name: any): any;
export function getLocalAiDevice(): {
    platform: string;
    totalMemoryBytes: number;
};
export function isDesktopPlatform(platform: any): boolean;
export function getAskModelChoices(device?: {
    platform: string;
    totalMemoryBytes: number;
}): string[];
export function getAutoBestAskModel(device?: {
    platform: string;
    totalMemoryBytes: number;
}): "QWEN3_1_7B_INST_Q4" | "QWEN3_4B_INST_Q4_K_M";
export const LOCAL_AI_MEMORY_BUDGET_RATIO: 0.5;
export const LOCAL_AI_APP_MEMORY_RESERVE_BYTES: number;
export const LOCAL_AI_MEMORY_MARGIN: 1.25;
export namespace LOCAL_AI_MODEL_MEMORY_BYTES {
    let WHISPER_TINY_Q8_0: number;
    let WHISPER_EN_TINY_Q8_0: number;
    let WHISPER_BASE_Q8_0: number;
    let WHISPER_EN_BASE_Q8_0: number;
    let VAD_SILERO_5_1_2: number;
    let PARAKEET_TDT_0_6B_V3_Q4_0: number;
    let OCR_LATIN: number;
    let OCR_CRAFT: number;
    let VISIONPSY_NANO_460M_MULTIMODAL_Q4_K_M: number;
    let MMPROJ_VISIONPSY_NANO_460M_MULTIMODAL_Q8_0: number;
    let QWEN3_5_0_8B_MULTIMODAL_Q4_K_M: number;
    let MMPROJ_QWEN3_5_0_8B_MULTIMODAL_Q8_0: number;
    let QWEN3_600M_INST_Q4: number;
    let QWEN3_1_7B_INST_Q4: number;
    let QWEN3_4B_INST_Q4_K_M: number;
    let QWEN3_8B_INST_Q4_K_M: number;
    let EMBEDDINGGEMMA_300M_Q4_0: number;
}
export function getModelMemoryBytes(name: any): any;
export function getModelsMemoryBytes(names: any): any;
export function canRunModels(names: any, totalMemoryBytes: any): boolean;
export function getModelDownloadBytes(name: string): number;
export function getRegistryNamesBytes(names: any): any;
export function serializeLocalAiConfig(config: any): string;
export type CoremlSet = {
    setKey: string;
    flatFile: string;
    files: {
        path: string;
        bytes: number;
    }[];
};
//# sourceMappingURL=localAiCatalog.d.ts.map