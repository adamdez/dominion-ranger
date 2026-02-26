/**
 * Tracerfy /queues/ response normalization.
 *
 * The Tracerfy API sometimes returns a non-array response, causing
 * "queues.find is not a function". This module safely parses the response
 * and supports multiple shapes.
 */

import { logger } from '../config/logger.js';

/** Minimal queue item shape expected from Tracerfy /queues/ */
export interface TracerfyQueueItem {
  id: number;
  pending?: boolean;
  [key: string]: unknown;
}

const MAX_RAW_LOG_LENGTH = 500;
const MASK_PATTERN = /Bearer\s+[a-zA-Z0-9_-]+/gi;

/**
 * Mask sensitive values in a string for safe logging.
 */
function maskSensitive(str: string): string {
  return str.replace(MASK_PATTERN, 'Bearer ***');
}

/**
 * Safely truncate and mask a string for error logging.
 */
function safeLogPreview(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  let str: string;
  try {
    str = typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    str = String(value);
  }
  const masked = maskSensitive(str);
  if (masked.length > MAX_RAW_LOG_LENGTH) {
    return masked.slice(0, MAX_RAW_LOG_LENGTH) + '...';
  }
  return masked;
}

/**
 * Normalize Tracerfy /queues/ API response to an array of queue items.
 *
 * Supports:
 *   1) Direct array: [{ id: 1, pending: true }, ...]
 *   2) Wrapped: { data: [{ id: 1, pending: true }, ...] }
 *
 * For unexpected shapes, throws a descriptive error with the raw response
 * logged (masked for safety).
 *
 * @param raw - Raw response from fetch().json() or equivalent
 * @returns Array of queue items
 * @throws Error with descriptive message if response shape is invalid
 */
export function normalizeTracerfyQueuesResponse(raw: unknown): TracerfyQueueItem[] {
  if (raw === null || raw === undefined) {
    const msg = 'Tracerfy /queues/ returned null or undefined';
    logger.warn({ rawPreview: 'null' }, msg);
    throw new Error(`${msg}. Expected array or { data: array }.`);
  }

  // Case 1: Direct array
  if (Array.isArray(raw)) {
    const valid = raw.filter((item): item is TracerfyQueueItem => {
      return item != null && typeof item === 'object' && typeof (item as TracerfyQueueItem).id === 'number';
    });
    if (valid.length !== raw.length) {
      logger.debug(
        { rawLength: raw.length, validLength: valid.length },
        'Tracerfy /queues/: some array items were invalid (missing id), filtered',
      );
    }
    return valid;
  }

  // Case 2: { data: [...] }
  if (typeof raw === 'object' && raw !== null && 'data' in raw) {
    const data = (raw as { data: unknown }).data;
    if (Array.isArray(data)) {
      const valid = data.filter((item): item is TracerfyQueueItem => {
        return item != null && typeof item === 'object' && typeof (item as TracerfyQueueItem).id === 'number';
      });
      if (valid.length !== data.length) {
        logger.debug(
          { dataLength: data.length, validLength: valid.length },
          'Tracerfy /queues/: some data items were invalid (missing id), filtered',
        );
      }
      return valid;
    }
  }

  // Unexpected shape
  const preview = safeLogPreview(raw);
  const msg =
    'Tracerfy /queues/ returned unexpected shape. Expected array or { data: array }.';
  logger.error(
    {
      rawPreview: preview,
      rawType: typeof raw,
      isArray: Array.isArray(raw),
      keys: typeof raw === 'object' && raw !== null ? Object.keys(raw).slice(0, 20) : undefined,
    },
    msg,
  );
  throw new Error(msg);
}
