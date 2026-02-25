import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { requireRole } from '../middleware/auth.js';

type RequestUser = {
  userId: string;
};

export async function notificationsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/notifications',
    { preHandler: [requireRole('properties.read')] },
    async (request) => {
      const user = (request as unknown as Record<string, RequestUser>).user;

      try {
        const result = await db.execute(sql`
          SELECT
            notification_id AS "notificationId",
            user_id AS "userId",
            title,
            body,
            type,
            read_at AS "readAt",
            created_at AS "createdAt"
          FROM notifications
          WHERE user_id IS NULL OR user_id = ${user?.userId ?? ''}
          ORDER BY created_at DESC
          LIMIT 20
        `);

        return ((result as unknown as { rows?: Record<string, unknown>[] }).rows ?? []) as Record<string, unknown>[];
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (message.includes('relation "notifications" does not exist')) {
          return [];
        }
        throw error;
      }
    },
  );
}
