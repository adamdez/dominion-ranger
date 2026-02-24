import { db } from '../../db/connection.js';
import { featureFlags } from '../../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { logger } from '../../config/logger.js';

const cache = new Map<string, { enabled: boolean; expires: number }>();
const CACHE_TTL = 30_000;

export async function isFeatureEnabled(flagKey: string): Promise<boolean> {
  const cached = cache.get(flagKey);
  if (cached && cached.expires > Date.now()) return cached.enabled;

  try {
    const [flag] = await db
      .select({ enabled: featureFlags.enabled })
      .from(featureFlags)
      .where(eq(featureFlags.flagKey, flagKey))
      .limit(1);

    const enabled = flag?.enabled ?? false;
    cache.set(flagKey, { enabled, expires: Date.now() + CACHE_TTL });
    return enabled;
  } catch (err) {
    logger.error({ err, flagKey }, 'Failed to check feature flag');
    return false;
  }
}

export async function setFeatureFlag(flagKey: string, enabled: boolean): Promise<void> {
  await db
    .update(featureFlags)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(featureFlags.flagKey, flagKey));
  cache.delete(flagKey);
  logger.info({ flagKey, enabled }, 'Feature flag updated');
}

export async function getAllFlags() {
  return db.select().from(featureFlags).orderBy(featureFlags.flagKey);
}

export function invalidateFlagCache(): void {
  cache.clear();
}
