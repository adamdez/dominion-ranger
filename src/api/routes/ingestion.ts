import type { FastifyInstance } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import { env } from '../../config/env.js';
import { getIngestionQueue } from '../../jobs/queues.js';
import { db } from '../../db/connection.js';
import { marketConfigs, adapterRunHistory } from '../../db/schema/index.js';
import { getAllIngestionAdapters, getAllEnrichmentAdapters } from '../../ingestion/adapters/index.js';
import { requireRole } from '../middleware/auth.js';
import { ingestionRunBody } from '../schemas/ingestion.js';

export async function ingestionRoutes(app: FastifyInstance): Promise<void> {

  // POST /api/ingestion/run — Trigger ingestion pipeline
  app.post<{
    Body: {
      adapter?: string; // Specific adapter, or omit for all
      options?: Record<string, unknown>;
    };
  }>(
    '/api/ingestion/run',
    { preHandler: [requireRole('pipeline.run')] },
    async (request, reply) => {
      if (!env.AUTO_PIPELINE_ENABLED) {
        return reply.code(503).send({
          error: 'PIPELINE_DISABLED',
          message: 'Auto-pipeline is disabled. Set AUTO_PIPELINE_ENABLED=true to use queue-based ingestion.',
        });
      }
      const body = ingestionRunBody.parse(request.body);
      const { adapter, options } = body ?? {};
      const adapterName = adapter ?? '__all__';

      const job = await getIngestionQueue().add('ingestion-run', {
        adapterName,
        options,
      });

      return {
        jobId: job.id,
        adapter: adapterName,
        status: 'queued',
      };
    },
  );

  // GET /api/ingestion/dashboard — Adapter status, markets, recent runs
  app.get(
    '/api/ingestion/dashboard',
    { preHandler: [requireRole('pipeline.run')] },
    async () => {
      const adapters = getAllIngestionAdapters();

      const adapterStatuses = await Promise.all(
        adapters.map(async (a) => {
          const [lastRun] = await db
            .select()
            .from(adapterRunHistory)
            .where(eq(adapterRunHistory.adapterName, a.name))
            .orderBy(desc(adapterRunHistory.startedAt))
            .limit(1);

          return {
            name: a.name,
            description: a.description,
            healthy: await a.healthCheck(),
            lastRun: lastRun ?? null,
          };
        }),
      );

      const markets = await db.select().from(marketConfigs);

      const recentRuns = await db
        .select()
        .from(adapterRunHistory)
        .orderBy(desc(adapterRunHistory.startedAt))
        .limit(20);

      return { adapters: adapterStatuses, markets, recentRuns };
    },
  );

  // GET /api/ingestion/adapters — List available adapters and their status
  app.get(
    '/api/ingestion/adapters',
    { preHandler: [requireRole('pipeline.run')] },
    async () => {
      const ingestion = getAllIngestionAdapters();
      const enrichment = getAllEnrichmentAdapters();

      const statuses = await Promise.all([
        ...ingestion.map(async (a) => ({
          name: a.name,
          description: a.description,
          type: 'ingestion' as const,
          sourceType: a.sourceType,
          healthy: await a.healthCheck(),
        })),
        ...enrichment.map(async (a) => ({
          name: a.name,
          description: a.description,
          type: 'enrichment' as const,
          sourceType: 'api' as const,
          healthy: await a.healthCheck(),
        })),
      ]);

      return { adapters: statuses };
    },
  );
}
