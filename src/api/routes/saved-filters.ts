import type { FastifyInstance } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { savedFilters } from '../../db/schema/index.js';
import { requireRole } from '../middleware/auth.js';
import { NotFoundError } from '../../lib/errors.js';
import { createSavedFilterBody, updateSavedFilterBody } from '../schemas/saved-filters.js';

export async function savedFilterRoutes(app: FastifyInstance): Promise<void> {

  // GET /api/saved-filters — list all saved filters
  app.get(
    '/api/saved-filters',
    { preHandler: [requireRole('properties.read')] },
    async () => {
      return db.select().from(savedFilters).orderBy(savedFilters.name);
    },
  );

  // POST /api/saved-filters — create a new saved filter
  app.post<{ Body: Record<string, unknown> }>(
    '/api/saved-filters',
    { preHandler: [requireRole('workflow.write')] },
    async (request, reply) => {
      const body = createSavedFilterBody.parse(request.body);
      const user = (request as unknown as Record<string, { userId: string }>).user;

      const [filter] = await db
        .insert(savedFilters)
        .values({ ...body, createdBy: user.userId })
        .returning();

      reply.code(201);
      return filter;
    },
  );

  // PATCH /api/saved-filters/:id — update a saved filter
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>(
    '/api/saved-filters/:id',
    { preHandler: [requireRole('workflow.write')] },
    async (request) => {
      const { id } = request.params;
      const body = updateSavedFilterBody.parse(request.body);

      const updates: Record<string, unknown> = { updatedAt: sql`now()` };
      if (body.name !== undefined) updates.name = body.name;
      if (body.description !== undefined) updates.description = body.description;
      if (body.filterConfig !== undefined) updates.filterConfig = body.filterConfig;

      const [updated] = await db
        .update(savedFilters)
        .set(updates)
        .where(eq(savedFilters.id, id))
        .returning();

      if (!updated) throw new NotFoundError('SavedFilter', id);
      return updated;
    },
  );

  // DELETE /api/saved-filters/:id — delete a saved filter
  app.delete<{ Params: { id: string } }>(
    '/api/saved-filters/:id',
    { preHandler: [requireRole('workflow.write')] },
    async (request, reply) => {
      const { id } = request.params;
      const [deleted] = await db.delete(savedFilters).where(eq(savedFilters.id, id)).returning();
      if (!deleted) throw new NotFoundError('SavedFilter', id);
      reply.code(204);
      return null;
    },
  );
}
