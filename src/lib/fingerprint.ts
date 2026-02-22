import { createHash } from 'node:crypto';

/**
 * Generate a deterministic SHA-256 fingerprint for event dedup.
 *
 * Charter mandate: Event fingerprint hash for dedup.
 * Same inputs always produce the same fingerprint.
 * Used as the unique constraint target for ON CONFLICT DO NOTHING.
 */
export function generateEventFingerprint(input: {
  dominionLeadId: string;
  eventType: string;
  eventLayer: string;
  sourceName: string;
  triggerEventDate?: Date | null;
  filingDate?: Date | null;
  recordedDate?: Date | null;
}): string {
  const referenceDate = input.triggerEventDate ?? input.filingDate ?? input.recordedDate;
  const parts = [
    input.dominionLeadId,
    input.eventType,
    input.eventLayer,
    input.sourceName,
    referenceDate ? referenceDate.toISOString().split('T')[0] : 'no-date',
  ];
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 64);
}
