import type { FastifyInstance } from 'fastify';
import { db } from '../../db/connection.js';
import { notifications } from '../../db/schema/index.js';
import { eq, and, isNull, desc, sql } from 'drizzle-orm';
import { requireRole } from '../middleware/auth.js';

export async function notificationRoutes(app: FastifyInstance): Promise<void> {

  // GET /api/notifications — list notifications for current user
  app.get<{ Querystring: Record<string, string> }>(
    '/api/notifications',
    { preHandler: [requireRole('properties.read')] },
    async (request) => {
      const user = (request as unknown as Record<string, { userId: string }>).user;
      const unreadOnly = (request.query as Record<string, string>).unread === 'true';

      const conditions = [eq(notifications.userId, user.userId)];
      if (unreadOnly) {
        conditions.push(isNull(notifications.readAt));
      }

      const rows = await db
        .select()
        .from(notifications)
        .where(and(...conditions))
        .orderBy(desc(notifications.createdAt))
        .limit(50);

      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(notifications)
        .where(and(
          eq(notifications.userId, user.userId),
          isNull(notifications.readAt),
        ));

      return {
        notifications: rows,
        unreadCount: countResult.count,
      };
    },
  );

  // POST /api/notifications/:id/read — mark one notification as read
  app.post<{ Params: { id: string } }>(
    '/api/notifications/:id/read',
    { preHandler: [requireRole('properties.read')] },
    async (request, reply) => {
      const user = (request as unknown as Record<string, { userId: string }>).user;
      const { id } = request.params;

      const [updated] = await db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(and(
          eq(notifications.id, id),
          eq(notifications.userId, user.userId),
        ))
        .returning();

      if (!updated) {
        return reply.code(404).send({ error: 'Notification not found' });
      }

      return { success: true };
    },
  );

  // POST /api/notifications/read-all — mark all as read
  app.post(
    '/api/notifications/read-all',
    { preHandler: [requireRole('properties.read')] },
    async (request) => {
      const user = (request as unknown as Record<string, { userId: string }>).user;

      await db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(and(
          eq(notifications.userId, user.userId),
          isNull(notifications.readAt),
        ));

      return { success: true };
    },
  );
}

export async function createNotification(data: {
  userId: string;
  type: string;
  title: string;
  message?: string;
  link?: string;
}): Promise<void> {
  await db.insert(notifications).values({
    userId: data.userId,
    type: data.type,
    title: data.title,
    message: data.message ?? null,
    link: data.link ?? null,
  });
}
