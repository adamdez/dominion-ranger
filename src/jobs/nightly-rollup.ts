/**
 * Nightly Rollup Aggregation Job
 *
 * Rebuilds all rollup tables from activity_log + deals.
 * Charter invariant: deterministic and idempotent — re-running produces identical results.
 *
 * Revenue truth = deals.assignment_fee_cents (never from activity_log).
 * All writes use UPSERT (INSERT ON CONFLICT UPDATE).
 */
import { sql } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { logger } from '../config/logger.js';

export interface RollupResult {
  dailyRows: number;
  funnelRows: number;
  agentRows: number;
  channelRows: number;
  scoringRows: number;
  executionMs: number;
}

/**
 * Rebuild daily_metrics for a specific date.
 * Idempotent: uses INSERT ... ON CONFLICT UPDATE.
 */
async function rollupDailyMetrics(targetDate: string): Promise<number> {
  const result = await db.execute(sql.raw(`
    INSERT INTO daily_metrics (
      date, dials, connections, conversations, appointments, offers, contracts,
      deals, revenue_cents, inbound_leads, stale_leads, new_promoted_leads,
      total_spend_cents, pipeline_value_cents, avg_composite_score, total_talk_time_seconds
    )
    SELECT
      '${targetDate}'::date as date,
      COALESCE((SELECT COUNT(*) FROM activity_log WHERE activity_type = 'CALL_PLACED' AND occurred_at::date = '${targetDate}'::date), 0) as dials,
      COALESCE((SELECT COUNT(*) FROM activity_log WHERE activity_type = 'CALL_CONNECTED' AND occurred_at::date = '${targetDate}'::date), 0) as connections,
      COALESCE((SELECT COUNT(*) FROM activity_log WHERE activity_type = 'CALL_CONNECTED' AND occurred_at::date = '${targetDate}'::date AND (meta->>'decision_maker_confirmed')::text = 'true'), 0) as conversations,
      COALESCE((SELECT COUNT(*) FROM activity_log WHERE activity_type = 'APPOINTMENT_SET' AND occurred_at::date = '${targetDate}'::date), 0) as appointments,
      COALESCE((SELECT COUNT(*) FROM activity_log WHERE activity_type = 'OFFER_SENT' AND occurred_at::date = '${targetDate}'::date), 0) as offers,
      COALESCE((SELECT COUNT(*) FROM activity_log WHERE activity_type = 'CONTRACT_SIGNED' AND occurred_at::date = '${targetDate}'::date), 0) as contracts,
      COALESCE((SELECT COUNT(*) FROM deals WHERE close_date = '${targetDate}'::date AND status = 'CLOSED'), 0) as deals,
      COALESCE((SELECT SUM(assignment_fee_cents) FROM deals WHERE close_date = '${targetDate}'::date AND status = 'CLOSED'), 0) as revenue_cents,
      COALESCE((SELECT COUNT(*) FROM activity_log WHERE activity_type IN ('INBOUND_FORM', 'INBOUND_CALL') AND occurred_at::date = '${targetDate}'::date), 0) as inbound_leads,
      COALESCE((SELECT COUNT(*) FROM lead_instances WHERE status NOT IN ('CLOSED', 'DEAD') AND NOT EXISTS (
        SELECT 1 FROM activity_log WHERE activity_log.lead_instance_id = lead_instances.lead_instance_id AND occurred_at > NOW() - INTERVAL '5 days'
      )), 0) as stale_leads,
      COALESCE((SELECT COUNT(*) FROM activity_log WHERE activity_type = 'LEAD_PROMOTED' AND occurred_at::date = '${targetDate}'::date), 0) as new_promoted_leads,
      COALESCE((SELECT SUM(amount_cents) FROM campaign_spend_entries WHERE spend_date = '${targetDate}'::date), 0) as total_spend_cents,
      0 as pipeline_value_cents,
      COALESCE((SELECT AVG(CAST(composite_score AS numeric)) FROM (
        SELECT DISTINCT ON (dominion_lead_id) composite_score FROM scoring_records ORDER BY dominion_lead_id, created_at DESC
      ) latest), 0) as avg_composite_score,
      COALESCE((SELECT SUM((meta->>'duration_seconds')::int) FROM activity_log WHERE activity_type IN ('CALL_PLACED', 'CALL_CONNECTED') AND occurred_at::date = '${targetDate}'::date AND meta->>'duration_seconds' IS NOT NULL), 0) as total_talk_time_seconds
    ON CONFLICT (date) DO UPDATE SET
      dials = EXCLUDED.dials,
      connections = EXCLUDED.connections,
      conversations = EXCLUDED.conversations,
      appointments = EXCLUDED.appointments,
      offers = EXCLUDED.offers,
      contracts = EXCLUDED.contracts,
      deals = EXCLUDED.deals,
      revenue_cents = EXCLUDED.revenue_cents,
      inbound_leads = EXCLUDED.inbound_leads,
      stale_leads = EXCLUDED.stale_leads,
      new_promoted_leads = EXCLUDED.new_promoted_leads,
      total_spend_cents = EXCLUDED.total_spend_cents,
      pipeline_value_cents = EXCLUDED.pipeline_value_cents,
      avg_composite_score = EXCLUDED.avg_composite_score,
      total_talk_time_seconds = EXCLUDED.total_talk_time_seconds
  `));
  return 1;
}

/**
 * Rebuild weekly funnel metrics for a specific week.
 */
async function rollupWeeklyFunnel(weekStart: string): Promise<number> {
  const weekEnd = `${weekStart}::date + INTERVAL '7 days'`;
  const stages = ['PROMOTED', 'ASSIGNED', 'COMPLIANCE_PENDING', 'DIAL_READY', 'DIALING', 'CONTACTED', 'OFFER_SENT', 'CONTRACTED', 'CLOSED', 'DEAD'];
  let rows = 0;

  for (const stage of stages) {
    await db.execute(sql.raw(`
      INSERT INTO weekly_funnel_metrics (week_start, stage, count, conversion_rate)
      SELECT
        '${weekStart}'::date,
        '${stage}',
        COUNT(*)::int,
        NULL
      FROM lead_instances
      WHERE status = '${stage}'
        AND updated_at >= '${weekStart}'::date
        AND updated_at < ${weekEnd}
      ON CONFLICT (week_start, stage) DO UPDATE SET
        count = EXCLUDED.count,
        conversion_rate = EXCLUDED.conversion_rate
    `));
    rows++;
  }

  return rows;
}

/**
 * Rebuild agent weekly metrics for a specific week.
 */
async function rollupAgentWeekly(weekStart: string): Promise<number> {
  const result = await db.execute(sql.raw(`
    INSERT INTO agent_weekly_metrics (
      week_start, user_id, dials, connections, conversations, appointments, offers, deals, revenue_cents
    )
    SELECT
      '${weekStart}'::date as week_start,
      al.user_id,
      COUNT(*) FILTER (WHERE al.activity_type = 'CALL_PLACED')::int as dials,
      COUNT(*) FILTER (WHERE al.activity_type = 'CALL_CONNECTED')::int as connections,
      COUNT(*) FILTER (WHERE al.activity_type = 'CALL_CONNECTED' AND (al.meta->>'decision_maker_confirmed')::text = 'true')::int as conversations,
      COUNT(*) FILTER (WHERE al.activity_type = 'APPOINTMENT_SET')::int as appointments,
      COUNT(*) FILTER (WHERE al.activity_type = 'OFFER_SENT')::int as offers,
      COALESCE(d.deal_count, 0)::int as deals,
      COALESCE(d.revenue, 0)::int as revenue_cents
    FROM activity_log al
    LEFT JOIN (
      SELECT agent_user_id, COUNT(*) as deal_count, SUM(assignment_fee_cents) as revenue
      FROM deals
      WHERE close_date >= '${weekStart}'::date AND close_date < '${weekStart}'::date + INTERVAL '7 days'
        AND status = 'CLOSED'
      GROUP BY agent_user_id
    ) d ON d.agent_user_id = al.user_id
    WHERE al.user_id IS NOT NULL
      AND al.occurred_at >= '${weekStart}'::date
      AND al.occurred_at < '${weekStart}'::date + INTERVAL '7 days'
    GROUP BY al.user_id, d.deal_count, d.revenue
    ON CONFLICT (week_start, user_id) DO UPDATE SET
      dials = EXCLUDED.dials,
      connections = EXCLUDED.connections,
      conversations = EXCLUDED.conversations,
      appointments = EXCLUDED.appointments,
      offers = EXCLUDED.offers,
      deals = EXCLUDED.deals,
      revenue_cents = EXCLUDED.revenue_cents
  `));
  return (result as unknown as { rowCount?: number }).rowCount ?? 0;
}

/**
 * Rebuild channel performance metrics for a specific month.
 */
async function rollupChannelPerformance(periodStart: string): Promise<number> {
  const result = await db.execute(sql.raw(`
    INSERT INTO channel_performance_metrics (
      period_start, channel_id, spend_cents, leads, conversations, deals, revenue_cents, roas, cost_per_deal, cost_per_lead
    )
    SELECT
      '${periodStart}'::date as period_start,
      mc.channel_id,
      COALESCE(spend.total_spend, 0)::int as spend_cents,
      COALESCE(attr.lead_count, 0)::int as leads,
      0 as conversations,
      COALESCE(deal_data.deal_count, 0)::int as deals,
      COALESCE(deal_data.revenue, 0)::int as revenue_cents,
      CASE WHEN COALESCE(spend.total_spend, 0) > 0
        THEN COALESCE(deal_data.revenue, 0)::real / spend.total_spend
        ELSE NULL END as roas,
      CASE WHEN COALESCE(deal_data.deal_count, 0) > 0
        THEN COALESCE(spend.total_spend, 0)::real / deal_data.deal_count
        ELSE NULL END as cost_per_deal,
      CASE WHEN COALESCE(attr.lead_count, 0) > 0
        THEN COALESCE(spend.total_spend, 0)::real / attr.lead_count
        ELSE NULL END as cost_per_lead
    FROM marketing_channels mc
    LEFT JOIN (
      SELECT c.channel_id, SUM(cse.amount_cents) as total_spend
      FROM campaign_spend_entries cse
      JOIN campaigns c ON c.campaign_id = cse.campaign_id
      WHERE cse.spend_date >= '${periodStart}'::date AND cse.spend_date < '${periodStart}'::date + INTERVAL '1 month'
      GROUP BY c.channel_id
    ) spend ON spend.channel_id = mc.channel_id
    LEFT JOIN (
      SELECT lsa.channel_id, COUNT(*) as lead_count
      FROM lead_source_attribution lsa
      WHERE lsa.captured_at >= '${periodStart}'::date AND lsa.captured_at < '${periodStart}'::date + INTERVAL '1 month'
      GROUP BY lsa.channel_id
    ) attr ON attr.channel_id = mc.channel_id
    LEFT JOIN (
      SELECT lsa.channel_id, COUNT(*) as deal_count, SUM(d.assignment_fee_cents) as revenue
      FROM deals d
      JOIN lead_source_attribution lsa ON lsa.lead_instance_id = d.lead_instance_id
      WHERE d.close_date >= '${periodStart}'::date AND d.close_date < '${periodStart}'::date + INTERVAL '1 month'
        AND d.status = 'CLOSED'
      GROUP BY lsa.channel_id
    ) deal_data ON deal_data.channel_id = mc.channel_id
    WHERE mc.active = true
    ON CONFLICT (period_start, channel_id) DO UPDATE SET
      spend_cents = EXCLUDED.spend_cents,
      leads = EXCLUDED.leads,
      conversations = EXCLUDED.conversations,
      deals = EXCLUDED.deals,
      revenue_cents = EXCLUDED.revenue_cents,
      roas = EXCLUDED.roas,
      cost_per_deal = EXCLUDED.cost_per_deal,
      cost_per_lead = EXCLUDED.cost_per_lead
  `));
  return (result as unknown as { rowCount?: number }).rowCount ?? 0;
}

/**
 * Rebuild scoring performance metrics for a specific month.
 */
async function rollupScoringPerformance(periodStart: string): Promise<number> {
  const tiers = [
    { tier: 'A', min: 80, max: 101 },
    { tier: 'B', min: 60, max: 80 },
    { tier: 'C', min: 40, max: 60 },
    { tier: 'D', min: 0, max: 40 },
  ];
  let rows = 0;

  for (const { tier, min, max } of tiers) {
    await db.execute(sql.raw(`
      INSERT INTO scoring_performance_metrics (period_start, tier, promoted, contacted, closed, conversion_rate, avg_fee_cents)
      SELECT
        '${periodStart}'::date,
        '${tier}',
        COUNT(DISTINCT pl.dominion_lead_id)::int as promoted,
        COUNT(DISTINCT CASE WHEN li.contacted_at IS NOT NULL THEN li.dominion_lead_id END)::int as contacted,
        COUNT(DISTINCT d.dominion_lead_id)::int as closed,
        CASE WHEN COUNT(DISTINCT pl.dominion_lead_id) > 0
          THEN COUNT(DISTINCT d.dominion_lead_id)::real / COUNT(DISTINCT pl.dominion_lead_id)
          ELSE 0 END as conversion_rate,
        COALESCE(AVG(d.assignment_fee_cents), 0)::int as avg_fee_cents
      FROM promoted_leads pl
      LEFT JOIN lead_instances li ON li.promotion_id = pl.promotion_id
      LEFT JOIN deals d ON d.lead_instance_id = li.lead_instance_id AND d.status = 'CLOSED'
        AND d.close_date >= '${periodStart}'::date AND d.close_date < '${periodStart}'::date + INTERVAL '1 month'
      WHERE CAST(pl.composite_score AS numeric) >= ${min}
        AND CAST(pl.composite_score AS numeric) < ${max}
        AND pl.promoted_at >= '${periodStart}'::date
        AND pl.promoted_at < '${periodStart}'::date + INTERVAL '1 month'
      ON CONFLICT (period_start, tier) DO UPDATE SET
        promoted = EXCLUDED.promoted,
        contacted = EXCLUDED.contacted,
        closed = EXCLUDED.closed,
        conversion_rate = EXCLUDED.conversion_rate,
        avg_fee_cents = EXCLUDED.avg_fee_cents
    `));
    rows++;
  }

  return rows;
}

/**
 * Run nightly rollup for a target date.
 * Computes yesterday's daily metrics, and weekly/monthly if applicable.
 */
export async function runNightlyRollup(targetDate?: string): Promise<RollupResult> {
  const start = Date.now();
  const date = targetDate ?? new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const dayOfWeek = new Date(date).getDay();
  const dayOfMonth = new Date(date).getDate();

  logger.info({ date, dayOfWeek, dayOfMonth }, 'Starting nightly rollup');

  const dailyRows = await rollupDailyMetrics(date);
  let funnelRows = 0;
  let agentRows = 0;
  let channelRows = 0;
  let scoringRows = 0;

  // Monday → compute last week's metrics
  if (dayOfWeek === 1 || !targetDate) {
    const weekStart = new Date(date);
    weekStart.setDate(weekStart.getDate() - 7);
    const ws = weekStart.toISOString().slice(0, 10);
    funnelRows = await rollupWeeklyFunnel(ws);
    agentRows = await rollupAgentWeekly(ws);
  }

  // 1st of month → compute last month's metrics
  if (dayOfMonth === 1 || !targetDate) {
    const monthStart = new Date(date);
    monthStart.setMonth(monthStart.getMonth() - 1);
    monthStart.setDate(1);
    const ms = monthStart.toISOString().slice(0, 10);
    channelRows = await rollupChannelPerformance(ms);
    scoringRows = await rollupScoringPerformance(ms);
  }

  const executionMs = Date.now() - start;

  if (executionMs > 300_000) {
    logger.warn({ executionMs }, 'Nightly rollup exceeded 5-minute threshold');
  }

  logger.info(
    { date, dailyRows, funnelRows, agentRows, channelRows, scoringRows, executionMs },
    'Nightly rollup COMPLETE',
  );

  return { dailyRows, funnelRows, agentRows, channelRows, scoringRows, executionMs };
}
