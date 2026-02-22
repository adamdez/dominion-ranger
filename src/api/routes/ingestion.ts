import type { FastifyInstance } from 'fastify';
import { ingestionQueue } from '../../jobs/queues.js';
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
    async (request) => {
      const body = ingestionRunBody.parse(request.body);
      const { adapter, options } = body ?? {};
      const adapterName = adapter ?? '__all__';

      const job = await ingestionQueue.add('ingestion-run', {
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
