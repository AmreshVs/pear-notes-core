/**
 * Whether this device can run a text tier, and at which context size.
 * `assessment` is an optional `assessModelFit` verdict for the tier's model:
 * 'likely-too-large' vetoes, 'unknown' and 'likely-fits' defer to the gate.
 *
 * @param {string} tier
 * @param {{ totalMemoryBytes?: number, platform?: string, assessment?: string }} [device]
 */
export function getTextTierFit(tier: string, { totalMemoryBytes, platform, assessment }?: {
    totalMemoryBytes?: number;
    platform?: string;
    assessment?: string;
}): {
    fits: boolean;
    reason: string;
    tier: string;
    model: string;
    downloadBytes: number;
} | {
    fits: boolean;
    reason: any;
    contextTokens: number;
    memoryBytes: number;
    tier: string;
    model: string;
    downloadBytes: number;
};
/**
 * The default text tier: desktop takes the largest that fits, mobile stays at
 * `standard` or below, because a bigger model costs battery on every request.
 */
export function pickDefaultTextTier(device?: {}): string;
/** Whether the embedding model and an LLM tier can be loaded at the same time. */
export function canColoadEmbedding(tier: any, { totalMemoryBytes }?: {
    totalMemoryBytes?: number;
}): boolean;
export namespace LOCAL_AI_TEXT_TIER {
    let SMALL: string;
    let STANDARD: string;
    let LARGE: string;
    let XL: string;
}
export const LOCAL_AI_TEXT_TIERS: string[];
export namespace LOCAL_AI_TIER_UNFIT_REASON {
    let DESKTOP_ONLY: string;
    let MEMORY: string;
    let ASSESSED_TOO_LARGE: string;
}
/**
 * Text model tiers. `small` and `standard` use their M0 memory figures.
 * `large` and `xl` were measured in M3 (2026-10-10) as the worker's RSS on a
 * 16 GB Mac after a 1,500-token prompt, mapped weights included; contexts are
 * largest first. Download sizes are the registry's `expectedSize`.
 */
export const LOCAL_AI_TEXT_TIER_MODELS: {
    [LOCAL_AI_TEXT_TIER.SMALL]: {
        model: string;
        downloadBytes: number;
        contexts: {
            tokens: number;
            memoryBytes: number;
        }[];
    };
    [LOCAL_AI_TEXT_TIER.STANDARD]: {
        model: string;
        downloadBytes: number;
        contexts: {
            tokens: number;
            memoryBytes: number;
        }[];
    };
    [LOCAL_AI_TEXT_TIER.LARGE]: {
        model: string;
        downloadBytes: number;
        contexts: {
            tokens: number;
            memoryBytes: number;
        }[];
    };
    [LOCAL_AI_TEXT_TIER.XL]: {
        model: string;
        downloadBytes: number;
        contexts: {
            tokens: number;
            memoryBytes: number;
        }[];
        desktopOnly: boolean;
    };
};
export namespace LOCAL_AI_EMBEDDING_MODEL {
    let model: string;
    let downloadBytes: number;
    let memoryBytes: number;
    namespace modelConfig {
        let batchSize: number;
    }
    let dims: number;
    let textsPerCall: number;
}
export function getTextTierContexts(tier: any): {
    tokens: number;
    memoryBytes: number;
}[];
export function getTextTierFits(device: any): ({
    fits: boolean;
    reason: string;
    tier: string;
    model: string;
    downloadBytes: number;
} | {
    fits: boolean;
    reason: any;
    contextTokens: number;
    memoryBytes: number;
    tier: string;
    model: string;
    downloadBytes: number;
})[];
//# sourceMappingURL=localAiTiers.d.ts.map