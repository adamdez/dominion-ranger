import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  jsonb,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const marketConfigs = pgTable(
  'market_configs',
  {
    marketId: uuid('market_id').primaryKey().defaultRandom(),
    county: varchar('county', { length: 128 }).notNull(),
    state: varchar('state', { length: 2 }).notNull(),
    fipsCode: varchar('fips_code', { length: 10 }),
    countyRecorderUrl: text('county_recorder_url'),
    active: boolean('active').default(true),
    adapterConfig: jsonb('adapter_config').default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [uniqueIndex('market_configs_county_state_idx').on(table.county, table.state)],
);

export type MarketConfig = typeof marketConfigs.$inferSelect;
export type NewMarketConfig = typeof marketConfigs.$inferInsert;
