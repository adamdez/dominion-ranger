import { v7 as uuidv7 } from 'uuid';

/**
 * Generate a UUID v7.
 * Time-sortable, charter-mandated for dominion_lead_id and all primary keys.
 */
export function generateId(): string {
  return uuidv7();
}

/**
 * Validate UUID format (any version).
 */
export function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
