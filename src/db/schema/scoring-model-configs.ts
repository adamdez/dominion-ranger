import {
  pgTable,
  varchar,
  boolean,
  numeric,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core';

/**
 * Scoring model configuration.
 *
 * weights JSON structure:
 * {
 *   "NOTICE_OF_DEFAULT": { "base_weight": 0.95, "half_life_days": 60 },
 *   "TAX_DELINQUENCY": { "base_weight": 0.80, "half_life_days": 90 },
 *   "PREDICTIVE_VACANCY_SIGNAL": { "base_weight": 0.35, "half_life_days": 30 },
 *   ...
 * }
 *
 * tier_thresholds JSON:
 * { "A": 85, "B": 65, "C": 45 }
 *
 * decay_config JSON:
 * { "function": "exponential", "floor": 0.05 }
 */
export const scoringModelConfigs = pgTable('scoring_model_configs', {
  version: varchar('version', { length: 32 }).primaryKey(),

  // Separate weight maps per charter dual-layer doctrine
  confirmedWeights: jsonb('confirmed_weights').notNull(),
  predictiveWeights: jsonb('predictive_weights').notNull(),

  // Decay configuration
  decayConfig: jsonb('decay_config').notNull(),

  // Promotion thresholds
  promotionThreshold: numeric('promotion_threshold', { precision: 7, scale: 4 }).notNull(),
  tierThresholds: jsonb('tier_thresholds').notNull(),

  // Confidence model params
  confidenceConfig: jsonb('confidence_config').notNull(),

  // Equity multiplier: ranges with multipliers based on equity estimate
  equityMultiplierConfig: jsonb('equity_multiplier_config'),

  // Deal score: weights for property economics factors
  dealScoreWeights: jsonb('deal_score_weights'),

  // Negative-stack suppression: conditions that zero-out a property
  suppressionConfig: jsonb('suppression_config'),

  // Only one version active at a time
  active: boolean('active').default(false).notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type ScoringModelConfig = typeof scoringModelConfigs.$inferSelect;
export type NewScoringModelConfig = typeof scoringModelConfigs.$inferInsert;
