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
    A: { minScore: 65, label: 'Tier A' },
    B: { minScore: 45, label: 'Tier B' },
    C: { minScore: 25, label: 'Tier C' },
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
