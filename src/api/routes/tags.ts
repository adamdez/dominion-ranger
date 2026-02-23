import type { FastifyInstance } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { tags, leadInstanceTags, leadInstances } from '../../db/schema/index.js';
import { requireRole } from '../middleware/auth.js';
import { NotFoundError } from '../../lib/errors.js';
import { createTagBody, applyTagBody } from '../schemas/tags.js';

export async function tagRoutes(app: FastifyInstance): Promise<void> {

  // GET /api/tags — list all available tags
  app.get(
    '/api/tags',
    { preHandler: [requireRole('properties.read')] },
    async () => {
      return db.select().from(tags).orderBy(tags.name);
    },
  );

  // POST /api/tags — create a new tag
  app.post<{ Body: { name: string; color?: string } }>(
    '/api/tags',
    { preHandler: [requireRole('workflow.write')] },
    async (request, reply) => {
      const body = createTagBody.parse(request.body);
      const [tag] = await db.insert(tags).values(body).returning();
      reply.code(201);
      return tag;
    },
  );

  // DELETE /api/tags/:tagId — delete a tag (cascades to lead_instance_tags)
  app.delete<{ Params: { tagId: string } }>(
    '/api/tags/:tagId',
    { preHandler: [requireRole('workflow.write')] },
    async (request, reply) => {
      const { tagId } = request.params;
      const [deleted] = await db.delete(tags).where(eq(tags.id, tagId)).returning();
      if (!deleted) throw new NotFoundError('Tag', tagId);
      reply.code(204);
      return null;
    },
  );

  // POST /api/leads/:leadInstanceId/tags — apply a tag to a lead
  app.post<{ Params: { leadInstanceId: string }; Body: { tagId: string } }>(
    '/api/leads/:leadInstanceId/tags',
    { preHandler: [requireRole('workflow.write')] },
    async (request, reply) => {
      const { leadInstanceId } = request.params;
      const { tagId } = applyTagBody.parse(request.body);
      const user = (request as unknown as Record<string, { userId: string }>).user;

      const [li] = await db
        .select({ leadInstanceId: leadInstances.leadInstanceId })
        .from(leadInstances)
        .where(eq(leadInstances.leadInstanceId, leadInstanceId));
      if (!li) throw new NotFoundError('LeadInstance', leadInstanceId);

      const [tag] = await db
        .select({ id: tags.id })
        .from(tags)
        .where(eq(tags.id, tagId));
      if (!tag) throw new NotFoundError('Tag', tagId);

      const [result] = await db
        .insert(leadInstanceTags)
        .values({
          leadInstanceId,
          tagId,
          appliedBy: user.userId,
        })
        .onConflictDoNothing({ target: [leadInstanceTags.leadInstanceId, leadInstanceTags.tagId] })
        .returning();

      reply.code(201);
      return result ?? { leadInstanceId, tagId, status: 'already_applied' };
    },
  );

  // DELETE /api/leads/:leadInstanceId/tags/:tagId — remove a tag from a lead
  app.delete<{ Params: { leadInstanceId: string; tagId: string } }>(
    '/api/leads/:leadInstanceId/tags/:tagId',
    { preHandler: [requireRole('workflow.write')] },
    async (request, reply) => {
      const { leadInstanceId, tagId } = request.params;
      const [deleted] = await db
        .delete(leadInstanceTags)
        .where(
          sql`${leadInstanceTags.leadInstanceId} = ${leadInstanceId} AND ${leadInstanceTags.tagId} = ${tagId}`,
        )
        .returning();
      if (!deleted) throw new NotFoundError('LeadInstanceTag', `${leadInstanceId}/${tagId}`);
      reply.code(204);
      return null;
    },
  );

  // GET /api/leads/:leadInstanceId/tags — list tags on a lead
  app.get<{ Params: { leadInstanceId: string } }>(
    '/api/leads/:leadInstanceId/tags',
    { preHandler: [requireRole('properties.read')] },
    async (request) => {
      const { leadInstanceId } = request.params;
      return db
        .select({
          id: tags.id,
          name: tags.name,
          color: tags.color,
          appliedAt: leadInstanceTags.appliedAt,
          appliedBy: leadInstanceTags.appliedBy,
        })
        .from(leadInstanceTags)
        .innerJoin(tags, eq(leadInstanceTags.tagId, tags.id))
        .where(eq(leadInstanceTags.leadInstanceId, leadInstanceId));
    },
  );
}
