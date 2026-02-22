import {
  pgTable,
  uuid,
  integer,
  numeric,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { properties } from './properties';

export const signalAccumulation = pgTable(
  'signal_accumulation',
  {
    dominionLeadId: uuid('dominion_lead_id')
      .primaryKey()
      .references(() => properties.dominionLeadId),

    firstSignalDetectedAt: timestamp('first_signal_detected_at', { withTimezone: true }).notNull(),

    // Rolling counts
    signalCount7d: integer('signal_count_7d').default(0).notNull(),
    signalCount30d: integer('signal_count_30d').default(0).notNull(),
    totalSignalCount: integer('total_signal_count').default(0).notNull(),

    // Trajectory metrics
    signalAccelerationRate: numeric('signal_acceleration_rate', { precision: 7, scale: 4 }).default('0'),
    signalDensityScore: numeric('signal_density_score', { precision: 7, scale: 4 }).default('0'),

    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_signal_accumulation_density').on(table.signalDensityScore),
    index('idx_signal_accumulation_total').on(table.totalSignalCount),
  ],
);

export type SignalAccumulation = typeof signalAccumulation.$inferSelect;
export type NewSignalAccumulation = typeof signalAccumulation.$inferInsert;
