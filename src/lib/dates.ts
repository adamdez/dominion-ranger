/**
 * Calculate days between two dates.
 */
export function daysBetween(from: Date, to: Date = new Date()): number {
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

/**
 * Exponential time decay.
 *
 * decay = e^(-λt) where λ = ln(2) / halfLifeDays
 *
 * At t = halfLifeDays, decay = 0.5
 * Clamped to floor (default 0.05) to prevent zero-weight signals.
 */
export function exponentialDecay(
  daysSinceTrigger: number,
  halfLifeDays: number,
  floor: number = 0.05,
): number {
  if (daysSinceTrigger <= 0) return 1.0;
  if (halfLifeDays <= 0) return floor;

  const lambda = Math.LN2 / halfLifeDays;
  const decay = Math.exp(-lambda * daysSinceTrigger);
  return Math.max(decay, floor);
}

/**
 * Classify freshness based on days since event.
 */
export function classifyFreshness(
  daysSince: number,
): 'same_day' | '1_3_days' | '4_7_days' | 'stale' {
  if (daysSince <= 0) return 'same_day';
  if (daysSince <= 3) return '1_3_days';
  if (daysSince <= 7) return '4_7_days';
  return 'stale';
}
