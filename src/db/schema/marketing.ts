import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  date,
  text,
  boolean,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { leadInstances } from './lead-instances';

export const channelTypeEnum = pgEnum('channel_type', [
  'INBOUND', 'OUTBOUND', 'PREDICTIVE', 'REFERRAL',
]);

export const campaignStatusEnum = pgEnum('campaign_status', [
  'ACTIVE', 'PAUSED', 'COMPLETE',
]);

export const marketingChannels = pgTable(
  'marketing_channels',
  {
    channelId: uuid('channel_id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    channelType: channelTypeEnum('channel_type').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_marketing_channels_channel_type').on(table.channelType),
    index('idx_marketing_channels_active').on(table.active),
  ],
);

export const campaigns = pgTable(
  'campaigns',
  {
    campaignId: uuid('campaign_id').primaryKey().defaultRandom(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => marketingChannels.channelId),
    name: text('name').notNull(),
    startDate: date('start_date'),
    endDate: date('end_date'),
    budgetCents: integer('budget_cents'),
    status: campaignStatusEnum('campaign_status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_campaigns_channel_id').on(table.channelId),
    index('idx_campaigns_status').on(table.status),
  ],
);

export const campaignSpendEntries = pgTable(
  'campaign_spend_entries',
  {
    spendId: uuid('spend_id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.campaignId),
    spendDate: date('spend_date').notNull(),
    amountCents: integer('amount_cents').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_campaign_spend_campaign_id').on(table.campaignId),
    index('idx_campaign_spend_date').on(table.spendDate),
  ],
);

export const leadSourceAttribution = pgTable(
  'lead_source_attribution',
  {
    attributionId: uuid('attribution_id').primaryKey().defaultRandom(),
    leadInstanceId: uuid('lead_instance_id')
      .notNull()
      .references(() => leadInstances.leadInstanceId),
    channelId: uuid('channel_id')
      .references(() => marketingChannels.channelId),
    campaignId: uuid('campaign_id')
      .references(() => campaigns.campaignId),
    attributionType: varchar('attribution_type', { length: 16 }).notNull().default('LAST_TOUCH'),
    utmSource: varchar('utm_source', { length: 128 }),
    utmMedium: varchar('utm_medium', { length: 128 }),
    utmCampaign: varchar('utm_campaign', { length: 256 }),
    utmContent: varchar('utm_content', { length: 256 }),
    utmTerm: varchar('utm_term', { length: 256 }),
    mailVariantId: uuid('mail_variant_id'),
    trackingPhone: varchar('tracking_phone', { length: 32 }),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_attribution_lead_instance_id').on(table.leadInstanceId),
    index('idx_attribution_channel_id').on(table.channelId),
    index('idx_attribution_campaign_id').on(table.campaignId),
    index('idx_attribution_captured_at').on(table.capturedAt),
  ],
);

export type MarketingChannel = typeof marketingChannels.$inferSelect;
export type NewMarketingChannel = typeof marketingChannels.$inferInsert;

export type Campaign = typeof campaigns.$inferSelect;
export type NewCampaign = typeof campaigns.$inferInsert;

export type CampaignSpendEntry = typeof campaignSpendEntries.$inferSelect;
export type NewCampaignSpendEntry = typeof campaignSpendEntries.$inferInsert;

export type LeadSourceAttribution = typeof leadSourceAttribution.$inferSelect;
export type NewLeadSourceAttribution = typeof leadSourceAttribution.$inferInsert;
