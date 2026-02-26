/**
 * Call-Ready eligibility rules (pure logic for unit testing).
 *
 * A lead is call-ready when:
 * - Scored above configurable threshold
 * - Has at least one callable phone (property or property_contacts, not DNC)
 * - Not DNC (property.dncFlag, property_contacts.dndCalls)
 * - Not contacted recently (cooldown window)
 * - Not already claimed (or optionally only claim-owned queues)
 */

export type EligibilityReason =
  | { code: 'ELIGIBLE'; message: string }
  | { code: 'SCORE_BELOW_THRESHOLD'; message: string; score: number; threshold: number }
  | { code: 'NO_CALLABLE_PHONE'; message: string }
  | { code: 'DNC'; message: string; source?: string }
  | { code: 'CONTACTED_RECENTLY'; message: string; lastContactAt: string; cooldownHours: number }
  | { code: 'ALREADY_CLAIMED'; message: string; assignedTo: string }
  | { code: 'MUST_BE_CLAIMED'; message: string }
  | { code: 'ALREADY_DIAL_READY'; message: string }
  | { code: 'NO_LEAD_INSTANCE'; message: string };

export interface EligibilityInput {
  compositeScore: number;
  hasCallablePhone: boolean;
  isDnc: boolean;
  dncSource?: string;
  lastContactAt: Date | null;
  assignedTo: string | null;
  currentStatus: string;
  hasLeadInstance: boolean;
}

export interface EligibilityResult {
  eligible: boolean;
  reasons: EligibilityReason[];
}

/**
 * Evaluate call-ready eligibility from a data snapshot.
 * Pure function — no DB or side effects. Suitable for unit tests.
 */
export function evaluateEligibility(
  input: EligibilityInput,
  config: { scoreThreshold: number; cooldownHours: number; claimOwnedOnly: boolean },
): EligibilityResult {
  const reasons: EligibilityReason[] = [];

  // 1. Must have lead instance
  if (!input.hasLeadInstance) {
    reasons.push({ code: 'NO_LEAD_INSTANCE', message: 'No active lead instance for property' });
    return { eligible: false, reasons };
  }

  // 2. Already DIAL_READY — no need to enqueue again
  if (input.currentStatus === 'DIAL_READY') {
    reasons.push({ code: 'ALREADY_DIAL_READY', message: 'Lead already in dial queue' });
    return { eligible: false, reasons };
  }

  // 3. Score threshold
  if (input.compositeScore < config.scoreThreshold) {
    reasons.push({
      code: 'SCORE_BELOW_THRESHOLD',
      message: `Score ${input.compositeScore} below threshold ${config.scoreThreshold}`,
      score: input.compositeScore,
      threshold: config.scoreThreshold,
    });
    return { eligible: false, reasons };
  }

  // 4. Callable phone
  if (!input.hasCallablePhone) {
    reasons.push({ code: 'NO_CALLABLE_PHONE', message: 'No callable phone (property or property_contacts)' });
    return { eligible: false, reasons };
  }

  // 5. DNC
  if (input.isDnc) {
    reasons.push({
      code: 'DNC',
      message: 'Property or contact is on Do Not Call',
      source: input.dncSource,
    });
    return { eligible: false, reasons };
  }

  // 6. Cooldown
  if (input.lastContactAt) {
    const hoursSinceContact =
      (Date.now() - input.lastContactAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceContact < config.cooldownHours) {
      reasons.push({
        code: 'CONTACTED_RECENTLY',
        message: `Last contact ${hoursSinceContact.toFixed(1)}h ago, cooldown ${config.cooldownHours}h`,
        lastContactAt: input.lastContactAt.toISOString(),
        cooldownHours: config.cooldownHours,
      });
      return { eligible: false, reasons };
    }
  }

  // 7. Claim status
  if (config.claimOwnedOnly) {
    if (!input.assignedTo) {
      reasons.push({
        code: 'MUST_BE_CLAIMED',
        message: 'Call-ready rule configured for claim-owned only; lead is unclaimed',
      });
      return { eligible: false, reasons };
    }
  } else {
    if (input.assignedTo) {
      reasons.push({
        code: 'ALREADY_CLAIMED',
        message: `Lead already claimed by ${input.assignedTo}`,
        assignedTo: input.assignedTo,
      });
      return { eligible: false, reasons };
    }
  }

  reasons.push({
    code: 'ELIGIBLE',
    message: 'Lead meets all call-ready criteria',
  });
  return { eligible: true, reasons };
}
