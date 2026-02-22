import {
  pgTable,
  uuid,
  numeric,
  varchar,
  integer,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { properties } from './properties';

export const scoringRecords = pgTable(
  'scoring_records',
  {
    scoreId: uuid('score_id').primaryKey().notNull(),

    dominionLeadId: uuid('dominion_lead_id')
      .notNull()
      .references(() => properties.dominionLeadId),

    // Charter-mandated tri-score model
    compositeScore: numeric('composite_score', { precision: 7, scale: 4 }).notNull(),
    motivationScore: numeric('motivation_score', { precision: 7, scale: 4 }),
    dealScore: numeric('deal_score', { precision: 7, scale: 4 }),
    confidenceScore: numeric('confidence_score', { precision: 5, scale: 4 }).notNull(),

    // Model versioning
    scoreModelVersion: varchar('score_model_version', { length: 32 }).notNull(),

    // Full snapshot for audit and ML training
    scoreInputsSnapshot: jsonb('score_inputs_snapshot').notNull(),
    signalContributions: jsonb('signal_contributions').notNull(),

    // Decay
    timeDecayFactor: numeric('time_decay_factor', { precision: 5, scale: 4 }),
    scoreDecayRate: numeric('score_decay_rate', { precision: 5, scale: 4 }),
    daysSinceTrigger: integer('days_since_trigger'),

    // Temporal
    firstDetectedAt: timestamp('first_detected_at', { withTimezone: true }),
    lastScoredAt: timestamp('last_scored_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_scoring_records_dominion_lead_id').on(table.dominionLeadId),
    index('idx_scoring_records_lead_created_desc').on(table.dominionLeadId, table.createdAt),
    index('idx_scoring_records_composite').on(table.compositeScore),
    index('idx_scoring_records_model_version').on(table.scoreModelVersion),
  ],
);

export type ScoringRecord = typeof scoringRecords.$inferSelect;
export type NewScoringRecord = typeof scoringRecords.$inferInsert;
