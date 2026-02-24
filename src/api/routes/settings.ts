import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { requireRole } from '../middleware/auth.js';
import { db } from '../../db/connection.js';
import { getAllFlags, setFeatureFlag } from '../../modules/feature-flags/index.js';
import { getRecentErrors } from '../../modules/error-logging/index.js';

export async function settingsRoutes(app: FastifyInstance): Promise<void> {

  // ─── Feature Flags ─────────────────────────────
  app.get(
    '/api/settings/flags',
    { preHandler: [requireRole('properties.read')] },
    async () => getAllFlags(),
  );

  app.patch<{ Params: { flagKey: string }; Body: { enabled: boolean } }>(
    '/api/settings/flags/:flagKey',
    { preHandler: [requireRole('properties.read')] },
    async (request) => {
      const { flagKey } = request.params;
      const { enabled } = z.object({ enabled: z.boolean() }).parse(request.body);
      await setFeatureFlag(flagKey, enabled);
      return { flagKey, enabled };
    },
  );

  // ─── Recent Errors ─────────────────────────────
  app.get(
    '/api/settings/errors',
    { preHandler: [requireRole('properties.read')] },
    async () => getRecentErrors(20),
  );

  // ─── Deep Health Check ─────────────────────────
  app.get('/api/health/deep', async () => {
    const result = await db.execute(sql`
      SELECT
        (SELECT count(*) FROM properties) as properties,
        (SELECT count(*) FROM distress_events) as events,
        (SELECT count(*) FROM scoring_records) as scores,
        (SELECT count(*) FROM lead_instances) as leads,
        (SELECT count(*) FROM scoring_model_configs WHERE active = true) as active_configs,
        (SELECT count(*) FROM signal_accumulation) as accumulations
    `);

    const row = (result as unknown as { rows: Record<string, string>[] }).rows?.[0]
      ?? (result as unknown as Record<string, string>[])?.[0]
      ?? {};
    const parsed = {
      properties: Number(row?.properties ?? 0),
      events: Number(row?.events ?? 0),
      scores: Number(row?.scores ?? 0),
      leads: Number(row?.leads ?? 0),
      active_configs: Number(row?.active_configs ?? 0),
      accumulations: Number(row?.accumulations ?? 0),
    };

    const issues: string[] = [];
    if (parsed.active_configs === 0) issues.push('No active scoring config');
    if (parsed.properties === 0) issues.push('Properties table empty');

    return {
      status: issues.length === 0 ? 'healthy' : 'degraded',
      counts: parsed,
      issues,
      timestamp: new Date().toISOString(),
    };
  });
}
