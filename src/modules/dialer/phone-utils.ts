import { sql, type AnyColumn } from 'drizzle-orm';

/**
 * Canonical phone normalization for all comparisons (inbound SMS, dialer, etc).
 * Use normalizePhone for JS; phoneSuffixMatch for SQL WHERE clauses.
 */

/**
 * Strip all non-digit characters and return the last 10 digits (US number
 * without country code).  Returns empty string when fewer than 10 digits
 * remain — callers should treat that as "no usable phone."
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : '';
}

/**
 * SQL fragment: true when the last-10 digits of `column` match
 * `normalizedDigits`.  Uses REGEXP_REPLACE to strip non-digits in
 * Postgres — same logic as the JS `normalizePhone` above.
 */
export function phoneSuffixMatch(column: AnyColumn, normalizedDigits: string) {
  return sql`RIGHT(REGEXP_REPLACE(${column}::text, '[^0-9]', '', 'g'), 10) = ${normalizedDigits}`;
}
