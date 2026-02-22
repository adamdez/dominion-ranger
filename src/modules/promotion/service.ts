import { eq, desc, sql } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import {
  promotedLeads,
  scoringModelConfigs,
  properties,
  scoringRecords,
  distressEvents,
} from '../../db/schema/index.js';
import type { PromotedLead, Property } from '../../db/schema/index.js';
import { generateId } from '../../lib/index.js';
import { domainEvents } from '../../events/bus.js';
import { logger } from '../../config/logger.js';
import type { ScoringResult } from '../scoring/service.js';

interface TierThresholds {
  A: number;
  B: number;
  C: number;
}

/**
 * Evaluate a scoring result for promotion.
 *
 * If composite score ≥ promotion threshold:
 * - Assign marketing tier (A/B/C)
 * - Determine urgency level
 * - Generate recommended action
 * - Create promotion record
 * - Emit lead.promoted domain event
 */
export async function evaluateForPromotion(
  dominionLeadId: string,
  scoringResult: ScoringResult,
): Promise<PromotedLead | null> {
  // Load active config for thresholds
  const [config] = await db
    .select()
    .from(scoringModelConfigs)
    .where(eq(scoringModelConfigs.active, true))
    .limit(1);

  if (!config) {
    logger.error('No active scoring config for promotion evaluation');
    return null;
  }

  const promotionThreshold = parseFloat(config.promotionThreshold);
  const tierThresholds = config.tierThresholds as TierThresholds;

  if (scoringResult.compositeScore < promotionThreshold) {
    logger.debug(
      { dominionLeadId, score: scoringResult.compositeScore, threshold: promotionThreshold },
      'Below promotion threshold',
    );
    return null;
  }

  // Assign tier
  const tier = assignTier(scoringResult.compositeScore, tierThresholds);

  // Determine urgency
  const urgency = determineUrgency(scoringResult);

  // Generate action recommendation
  const action = recommendAction(tier, urgency, scoringResult);

  // Build signal summary
  const signalSummary = buildSignalSummary(scoringResult);

  const promotionId = generateId();
  const [promotion] = await db
    .insert(promotedLeads)
    .values({
      promotionId,
      dominionLeadId,
      compositeScore: scoringResult.compositeScore.toFixed(4),
      confidenceScore: scoringResult.confidenceScore.toFixed(4),
      scoreModelVersion: scoringResult.modelVersion,
      marketingTier: tier,
      urgencyLevel: urgency,
      recommendedAction: action,
      signalSummary,
    })
    .returning();

  logger.info(
    {
      promotionId,
      dominionLeadId,
      score: scoringResult.compositeScore.toFixed(2),
      tier,
      urgency,
    },
    'Lead promoted',
  );

  domainEvents.emit('lead.promoted', {
    promotionId,
    dominionLeadId,
    compositeScore: scoringResult.compositeScore,
    marketingTier: tier,
  });

  return promotion;
}

function assignTier(score: number, thresholds: TierThresholds): 'A' | 'B' | 'C' {
  if (score >= thresholds.A) return 'A';
  if (score >= thresholds.B) return 'B';
  return 'C';
}

function determineUrgency(result: ScoringResult): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
  // Confirmed events with high score and recent activity = critical
  const hasConfirmed = result.signalContributions.some((c) => c.eventLayer === 'confirmed');
  const isRecent = result.daysSinceTrigger <= 7;
  const isHighScore = result.compositeScore >= 80;

  if (hasConfirmed && isRecent && isHighScore) return 'CRITICAL';
  if (hasConfirmed && isHighScore) return 'HIGH';
  if (result.compositeScore >= 65) return 'MEDIUM';
  return 'LOW';
}

function recommendAction(
  tier: string,
  urgency: string,
  result: ScoringResult,
): string {
  if (urgency === 'CRITICAL') {
    return 'Immediate outreach. Confirmed distress with high score and recent activity. Priority dial.';
  }
  if (tier === 'A') {
    return 'High-priority contact. Multiple strong signals detected. Schedule same-day outreach.';
  }
  if (tier === 'B') {
    return 'Standard outreach. Moderate distress signals. Include in next campaign batch.';
  }
  return 'Monitor and nurture. Early signals detected. Add to drip campaign.';
}

function buildSignalSummary(result: ScoringResult): Record<string, unknown> {
  const topContributions = result.signalContributions
    .sort((a, b) => b.finalContribution - a.finalContribution)
    .slice(0, 5);

  return {
    totalSignals: result.signalContributions.length,
    topSignals: topContributions.map((c) => ({
      type: c.eventType,
      layer: c.eventLayer,
      contribution: c.finalContribution.toFixed(4),
    })),
    hasConfirmedDistress: result.signalContributions.some((c) => c.eventLayer === 'confirmed'),
    avgTimeDecay: result.timeDecayFactor.toFixed(4),
    daysSinceFirstSignal: result.daysSinceTrigger,
  };
}

// ─── Query Helpers ─────────────────────────────────

/**
 * Get ranked promoted leads — the primary output of Ranger.
 */
export async function getRankedLeads(options: {
  tier?: 'A' | 'B' | 'C';
  limit?: number;
  offset?: number;
}): Promise<(PromotedLead & { property: Property })[]> {
  const { tier, limit = 50, offset = 0 } = options;

  let query = db
    .select({
      promotion: promotedLeads,
      property: properties,
    })
    .from(promotedLeads)
    .innerJoin(properties, eq(promotedLeads.dominionLeadId, properties.dominionLeadId))
    .orderBy(desc(promotedLeads.compositeScore))
    .limit(limit)
    .offset(offset);

  if (tier) {
    query = query.where(eq(promotedLeads.marketingTier, tier)) as typeof query;
  }

  const rows = await query;
  return rows.map((r) => ({ ...r.promotion, property: r.property }));
}

/**
 * Get promotion history for a property.
 */
export async function getPromotionHistory(dominionLeadId: string): Promise<PromotedLead[]> {
  return db
    .select()
    .from(promotedLeads)
    .where(eq(promotedLeads.dominionLeadId, dominionLeadId))
    .orderBy(desc(promotedLeads.promotedAt));
}
