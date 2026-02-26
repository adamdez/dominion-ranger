import { eq, desc, and, gte } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import {
  promotedLeads,
  scoringModelConfigs,
  properties,
} from '../../db/schema/index.js';
import type { PromotedLead, Property } from '../../db/schema/index.js';
import { generateId } from '../../lib/index.js';
import { domainEvents } from '../../events/bus.js';
import { logger } from '../../config/logger.js';
import { BUSINESS_RULES } from '../../config/business-rules.js';
import { resolveContacts } from '../enrichment/contact-resolver.js';
import { EventLayer, UrgencyLevel, MarketingTier } from '../../db/schema/constants.js';
import type { ScoringResult } from '../scoring/index.js';

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
  options?: { asOf?: Date },
): Promise<PromotedLead | null> {
  // Idempotency guard: skip if already promoted for this model version within 24h
  const now = options?.asOf ?? new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [existing] = await db
    .select({ promotionId: promotedLeads.promotionId })
    .from(promotedLeads)
    .where(
      and(
        eq(promotedLeads.dominionLeadId, dominionLeadId),
        eq(promotedLeads.scoreModelVersion, scoringResult.modelVersion),
        gte(promotedLeads.promotedAt, oneDayAgo),
      ),
    )
    .limit(1);

  if (existing) {
    logger.debug(
      { dominionLeadId, modelVersion: scoringResult.modelVersion },
      'Duplicate promotion blocked — already promoted within 24h for this model version',
    );
    return null;
  }

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

  if (scoringResult.suppressed) {
    logger.debug(
      { dominionLeadId, reason: scoringResult.suppressionReason },
      'Suppressed property — promotion blocked',
    );
    return null;
  }

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

  // Auto skip trace — fire and forget, don't block promotion
  resolveContacts(dominionLeadId, 'basic').catch((err) => {
    logger.warn({ err, dominionLeadId }, 'Auto skip trace failed (non-blocking)');
  });

  return promotion;
}

function assignTier(score: number, thresholds: TierThresholds): 'A' | 'B' | 'C' {
  if (score >= thresholds.A) return 'A';
  if (score >= thresholds.B) return 'B';
  return 'C';
}

function determineUrgency(result: ScoringResult): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
  const hasConfirmed = result.signalContributions.some((c) => c.eventLayer === EventLayer.CONFIRMED);
  const isRecent = result.daysSinceTrigger <= BUSINESS_RULES.urgency.recentDays;
  const isHighScore = result.compositeScore >= BUSINESS_RULES.urgency.highScoreThreshold;

  if (hasConfirmed && isRecent && isHighScore) return UrgencyLevel.CRITICAL;
  if (hasConfirmed && isHighScore) return UrgencyLevel.HIGH;
  if (result.compositeScore >= BUSINESS_RULES.urgency.mediumScoreThreshold) return UrgencyLevel.MEDIUM;
  return UrgencyLevel.LOW;
}

function recommendAction(
  tier: string,
  urgency: string,
  _result: ScoringResult,
): string {
  if (urgency === UrgencyLevel.CRITICAL) {
    return 'Immediate outreach. Confirmed distress with high score and recent activity. Priority dial.';
  }
  if (tier === MarketingTier.A) {
    return 'High-priority contact. Multiple strong signals detected. Schedule same-day outreach.';
  }
  if (tier === MarketingTier.B) {
    return 'Standard outreach. Moderate distress signals. Include in next campaign batch.';
  }
  return 'Monitor and nurture. Early signals detected. Add to drip campaign.';
}

function buildSignalSummary(result: ScoringResult): Record<string, unknown> {
  const topContributions = result.signalContributions
    .sort((a, b) => b.finalContribution - a.finalContribution)
    .slice(0, BUSINESS_RULES.promotionSliceLimit);

  return {
    totalSignals: result.signalContributions.length,
    motivationScore: result.motivationScore,
    dealScore: result.dealScore,
    equityMultiplier: result.equityMultiplier,
    topSignals: topContributions.map((c) => ({
      type: c.eventType,
      layer: c.eventLayer,
      contribution: c.finalContribution.toFixed(4),
    })),
    hasConfirmedDistress: result.signalContributions.some((c) => c.eventLayer === EventLayer.CONFIRMED),
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
  const { tier, limit = BUSINESS_RULES.pagination.defaultPageSize, offset = 0 } = options;

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
 * Mark a promotion as exported to Sentinel.
 * Owned by the Promotion domain — external modules call this instead of writing directly.
 */
export async function markExportedToSentinel(promotionId: string): Promise<void> {
  await db
    .update(promotedLeads)
    .set({ exportedToSentinelAt: new Date() })
    .where(eq(promotedLeads.promotionId, promotionId));
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
