import { pgTable, uuid, date, integer, real, varchar, primaryKey } from 'drizzle-orm/pg-core';

export const dailyMetrics = pgTable('daily_metrics', {
  date: date('date').primaryKey().notNull(),
  dials: integer('dials').default(0),
  connections: integer('connections').default(0),
  conversations: integer('conversations').default(0),
  appointments: integer('appointments').default(0),
  offers: integer('offers').default(0),
  contracts: integer('contracts').default(0),
  deals: integer('deals').default(0),
  revenueCents: integer('revenue_cents').default(0),
  inboundLeads: integer('inbound_leads').default(0),
  staleLeads: integer('stale_leads').default(0),
  totalSpendCents: integer('total_spend_cents').default(0),
  newPromotedLeads: integer('new_promoted_leads').default(0),
  pipelineValueCents: integer('pipeline_value_cents').default(0),
  avgCompositeScore: real('avg_composite_score'),
  speedToContactMedianMin: real('speed_to_contact_median_min'),
  totalTalkTimeSeconds: integer('total_talk_time_seconds').default(0),
  costPerDealCents: integer('cost_per_deal_cents'),
});

export const weeklyFunnelMetrics = pgTable('weekly_funnel_metrics', {
  weekStart: date('week_start').notNull(),
  stage: varchar('stage', { length: 32 }).notNull(),
  count: integer('count').default(0),
  conversionRate: real('conversion_rate'),
}, (table) => [
  primaryKey({ columns: [table.weekStart, table.stage] }),
]);

export const agentWeeklyMetrics = pgTable('agent_weekly_metrics', {
  weekStart: date('week_start').notNull(),
  userId: varchar('user_id', { length: 128 }).notNull(),
  dials: integer('dials').default(0),
  connections: integer('connections').default(0),
  conversations: integer('conversations').default(0),
  appointments: integer('appointments').default(0),
  offers: integer('offers').default(0),
  deals: integer('deals').default(0),
  revenueCents: integer('revenue_cents').default(0),
  avgCallDurationSeconds: integer('avg_call_duration_seconds'),
  callbackCompliancePct: real('callback_compliance_pct'),
  offerFollowthroughPct: real('offer_followthrough_pct'),
}, (table) => [
  primaryKey({ columns: [table.weekStart, table.userId] }),
]);

export const channelPerformanceMetrics = pgTable('channel_performance_metrics', {
  periodStart: date('period_start').notNull(),
  channelId: uuid('channel_id').notNull(),
  spendCents: integer('spend_cents').default(0),
  leads: integer('leads').default(0),
  conversations: integer('conversations').default(0),
  deals: integer('deals').default(0),
  revenueCents: integer('revenue_cents').default(0),
  roas: real('roas'),
  costPerDeal: real('cost_per_deal'),
  costPerLead: real('cost_per_lead'),
  costPerConversation: real('cost_per_conversation'),
}, (table) => [
  primaryKey({ columns: [table.periodStart, table.channelId] }),
]);

export const scoringPerformanceMetrics = pgTable('scoring_performance_metrics', {
  periodStart: date('period_start').notNull(),
  tier: varchar('tier', { length: 2 }).notNull(),
  promoted: integer('promoted').default(0),
  contacted: integer('contacted').default(0),
  closed: integer('closed').default(0),
  conversionRate: real('conversion_rate'),
  avgFeeCents: integer('avg_fee_cents'),
}, (table) => [
  primaryKey({ columns: [table.periodStart, table.tier] }),
]);

export type DailyMetrics = typeof dailyMetrics.$inferSelect;
export type AgentWeeklyMetrics = typeof agentWeeklyMetrics.$inferSelect;
export type ChannelPerformanceMetrics = typeof channelPerformanceMetrics.$inferSelect;
export type ScoringPerformanceMetrics = typeof scoringPerformanceMetrics.$inferSelect;
