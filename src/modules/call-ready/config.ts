/**
 * Call-Ready Auto Queue configuration.
 *
 * Loads from env; can be extended to support system_settings overrides.
 */
import { env } from '../../config/env.js';

export interface CallReadyConfig {
  enabled: boolean;
  scoreThreshold: number;
  cooldownHours: number;
  claimOwnedOnly: boolean;
}

export function getCallReadyConfig(): CallReadyConfig {
  return {
    enabled: env.CALL_READY_ENABLED,
    scoreThreshold: env.CALL_READY_SCORE_THRESHOLD,
    cooldownHours: env.CALL_READY_COOLDOWN_HOURS,
    claimOwnedOnly: env.CALL_READY_CLAIM_OWNED_ONLY,
  };
}
