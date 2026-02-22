/**
 * Central business rules configuration.
 *
 * Every tunable threshold, limit, and default that represents a business decision
 * lives here. When a user asks to "change the tier A cutoff" or "increase the
 * batch size," only this file needs editing.
 *
 * Scoring MODEL parameters (weights per event type, decay curves, etc.) are
 * config-driven via the scoring_model_configs DB table — not here.
 * This file holds operational constants that don't belong in the DB.
 */
export const BUSINESS_RULES = {
  tiers: {
    A: { minScore: 80, label: 'Tier A' },
    B: { minScore: 60, label: 'Tier B' },
    C: { minScore: 40, label: 'Tier C' },
  },

  promotionSliceLimit: 5,

  pagination: {
    defaultPageSize: 25,
    maxPageSize: 200,
    defaultHistoryLimit: 20,
  },

  batch: {
    largeBatchThreshold: 500,
    smallBatchThreshold: 100,
    defaultScoringLimit: 50_000,
    defaultEnrichmentLimit: 5_000,
    maxLoggedErrors: 5,
    maxReturnedErrors: 10,
    progressLogInterval: 500,
  },

  scoring: {
    configCacheTtlMs: 60_000,
    defaultCompositeWeights: {
      motivation_weight: 0.65,
      deal_weight: 0.35,
    },
    normalizationDivisor: 3.0,
    accelerationRateMultiplier: 0.05,
    densityBonusMultiplier: 0.02,
    maxDensityBonus: 0.15,
    defaultSeverity: 1.0,
    confidenceWeights: {
      signalFactor: 0.4,
      maxDiversityBonus: 0.2,
      maxSourceBonus: 0.15,
    },
    equityFactors: {
      high: 1.0,
      mid: 0.7,
      low: 0.4,
      floor: 0.15,
    },
    ownershipFactors: {
      long: 1.0,
      short: 0.5,
      floor: 0.2,
    },
    signalDensityDiversityBonus: 0.15,
    defaultAccelerationFallback: 2.0,
  },

  urgency: {
    recentDays: 7,
    highScoreThreshold: 80,
    mediumScoreThreshold: 65,
  },

  sentinel: {
    webhookTimeoutMs: 10_000,
  },

  system: {
    topEventTypesLimit: 10,
  },
} as const;
