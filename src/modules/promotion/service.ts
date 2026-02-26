/**
 * Promotion Domain — Charter v2.3
 *
 * Evaluates scoring results against thresholds, enforces suppression,
 * creates promoted_leads records, and emits lead.promoted for lead_instance creation.
 */
import { eq, desc } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import {
  promotedLeads,
  properties,
  scoringModelConfigs,
} from '../../db/schema/index.js';
import type { PromotedLead, Property } from '../../db/schema/index.js';
import type { ScoringResult } from '../scoring/index.js';
import { domainEvents } from '../../events/bus.js';
import { logAudit } from '../compliance/index.js';
import { generateId } from '../../lib/index.js';
import { logger } from '../../config/logger.js';

export type PromotionResult = { promoted: number; skipped: number; errors: number };

interface TierThresholds {
  A?: number;
  B?: number;
  C?: number;
}

/**
 * Evaluate a property for promotion based on scoring result.
 * Returns the promoted_leads record if promoted, null otherwise.
 */
export async function evaluateForPromotion(
  dominionLeadId: string,
  scoringResult: ScoringResult,
): Promise<PromotedLead | null> {
  // 1. Load active scoring model config
  const [config] = await db
    .select()
    .from(scoringModelConfigs)
    .where(eq(scoringModelConfigs.active, true))
    .limit(1);

  if (!config) {
    logger.warn('No active scoring model config — skipping promotion');
    return null;
  }

  const promotionThreshold = parseFloat(String(config.promotionThreshold ?? 0));
  const tierThresholds = (config.tierThresholds as TierThresholds) ?? { A: 80, B: 60, C: 40 };
  const thresholdA = tierThresholds.A ?? 80;
  const thresholdB = tierThresholds.B ?? 60;
  const thresholdC = tierThresholds.C ?? 40;

  // 2. Check composite score >= promotion threshold
  if (scoringResult.compositeScore < promotionThreshold) {
    logger.debug(
      { dominionLeadId, compositeScore: scoringResult.compositeScore, promotionThreshold },
      'Promotion skipped: score below threshold',
    );
    return null;
  }

  // 3. Check suppression
  if (scoringResult.suppressed === true) {
    logger.debug(
      { dominionLeadId, suppressionReason: scoringResult.suppressionReason },
      'Promotion skipped: suppressed',
    );
    return null;
  }

  // 4. Check compliance flags on property
  const [property] = await db
    .select({
      dncFlag: properties.dncFlag,
      litigantFlag: properties.litigantFlag,
      optOutFlag: properties.optOutFlag,
    })
    .from(properties)
    .where(eq(properties.dominionLeadId, dominionLeadId));

  if (!property) {
    logger.warn({ dominionLeadId }, 'Promotion skipped: property not found');
    return null;
  }

  if (property.dncFlag === true) {
    logger.debug({ dominionLeadId }, 'Promotion skipped: DNC flag');
    return null;
  }
  if (property.litigantFlag === true) {
    logger.debug({ dominionLeadId }, 'Promotion skipped: litigant flag');
    return null;
  }
  if (property.optOutFlag === true) {
    logger.debug({ dominionLeadId }, 'Promotion skipped: opt-out flag');
    return null;
  }

  // 5. Determine tier: A if >= A, B if >= B, C if >= C
  let marketingTier: 'A' | 'B' | 'C' = 'C';
  if (scoringResult.compositeScore >= thresholdA) {
    marketingTier = 'A';
  } else if (scoringResult.compositeScore >= thresholdB) {
    marketingTier = 'B';
  } else if (scoringResult.compositeScore >= thresholdC) {
    marketingTier = 'C';
  }

  // 6. Determine urgency
  const urgencyLevel = marketingTier === 'A' ? 'CRITICAL' : marketingTier === 'B' ? 'HIGH' : 'MEDIUM';

  // 7. Insert promoted_leads record
  const promotionId = generateId();
  const compositeScoreStr = scoringResult.compositeScore.toFixed(4);
  const confidenceScoreStr = scoringResult.confidenceScore.toFixed(4);

  const [inserted] = await db
    .insert(promotedLeads)
    .values({
      promotionId,
      dominionLeadId,
      compositeScore: compositeScoreStr,
      confidenceScore: confidenceScoreStr,
      scoreModelVersion: scoringResult.modelVersion,
      marketingTier,
      urgencyLevel,
      signalSummary: scoringResult.signalContributions ?? null,
    })
    .returning();

  if (!inserted) {
    logger.error({ dominionLeadId }, 'Failed to insert promoted_leads');
    return null;
  }

  // 8. Emit lead.promoted — triggers createLeadInstance via wiring.ts
  domainEvents.emit('lead.promoted', {
    promotionId,
    dominionLeadId,
    compositeScore: scoringResult.compositeScore,
    marketingTier,
  });

  // 9. Log audit
  await logAudit({
    dominionLeadId,
    actionType: 'lead.promoted',
    metadata: {
      promotionId,
      compositeScore: scoringResult.compositeScore,
      marketingTier,
      urgencyLevel,
    },
  });

  logger.info(
    { dominionLeadId, promotionId, compositeScore: scoringResult.compositeScore, marketingTier },
    'Lead promoted',
  );

  return inserted;
}

/**
 * Get ranked leads from promoted_leads joined with properties.
 */
export async function getRankedLeads(options: {
  tier?: 'A' | 'B' | 'C';
  limit?: number;
  offset?: number;
}): Promise<(PromotedLead & { property: Property })[]> {
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  const rows = options.tier
    ? await db
        .select({
          promotion: promotedLeads,
          property: properties,
        })
        .from(promotedLeads)
        .innerJoin(properties, eq(promotedLeads.dominionLeadId, properties.dominionLeadId))
        .where(eq(promotedLeads.marketingTier, options.tier))
        .orderBy(desc(promotedLeads.compositeScore))
        .limit(limit)
        .offset(offset)
    : await db
        .select({
          promotion: promotedLeads,
          property: properties,
        })
        .from(promotedLeads)
        .innerJoin(properties, eq(promotedLeads.dominionLeadId, properties.dominionLeadId))
        .orderBy(desc(promotedLeads.compositeScore))
        .limit(limit)
        .offset(offset);

  return rows.map((r) => ({
    ...r.promotion,
    property: r.property,
  })) as (PromotedLead & { property: Property })[];
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

/**
 * Mark a promotion as exported to Sentinel.
 */
export async function markExportedToSentinel(promotionId: string): Promise<void> {
  await db
    .update(promotedLeads)
    .set({ exportedToSentinelAt: new Date() })
    .where(eq(promotedLeads.promotionId, promotionId));
}
