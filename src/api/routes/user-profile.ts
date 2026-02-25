import type { FastifyInstance } from 'fastify';
import { db } from '../../db/connection.js';
import { users, leadInstances, dispositions, offers } from '../../db/schema/index.js';
import { eq, and, sql } from 'drizzle-orm';
import { z } from 'zod';
import { hashPassword } from '../../modules/auth/auth-service.js';
import { requireRole } from '../middleware/auth.js';

const updateProfileBody = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().max(20).optional().nullable(),
});

const changePasswordBody = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

export async function userProfileRoutes(app: FastifyInstance): Promise<void> {

  // GET /api/users/me — full user profile with stats
  app.get(
    '/api/users/me',
    { preHandler: [requireRole('properties.read')] },
    async (request) => {
      const reqUser = (request as unknown as Record<string, { userId: string }>).user;

      const [user] = await db
        .select({
          userId: users.userId,
          email: users.email,
          name: users.name,
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
          phone: users.phone,
          avatarUrl: users.avatarUrl,
          createdAt: users.createdAt,
          lastLoginAt: users.lastLoginAt,
        })
        .from(users)
        .where(eq(users.userId, reqUser.userId))
        .limit(1);

      if (!user) {
        return { error: 'User not found' };
      }

      const [leadCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(leadInstances)
        .where(eq(leadInstances.assignedTo, reqUser.userId));

      const [dialCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(dispositions)
        .where(eq(dispositions.createdBy, reqUser.userId));

      const [offerCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(offers)
        .where(eq(offers.createdBy, reqUser.userId));

      return {
        ...user,
        stats: {
          totalLeads: leadCount.count,
          totalDials: dialCount.count,
          totalOffers: offerCount.count,
        },
      };
    },
  );

  // PATCH /api/users/me — update profile
  app.patch(
    '/api/users/me',
    { preHandler: [requireRole('properties.read')] },
    async (request) => {
      const reqUser = (request as unknown as Record<string, { userId: string }>).user;
      const body = updateProfileBody.parse(request.body);

      const setData: Record<string, unknown> = { updatedAt: new Date() };
      if (body.firstName !== undefined) setData.firstName = body.firstName;
      if (body.lastName !== undefined) setData.lastName = body.lastName;
      if (body.phone !== undefined) setData.phone = body.phone;

      if (body.firstName || body.lastName) {
        const [current] = await db
          .select({ firstName: users.firstName, lastName: users.lastName })
          .from(users)
          .where(eq(users.userId, reqUser.userId))
          .limit(1);
        const fn = body.firstName ?? current?.firstName ?? '';
        const ln = body.lastName ?? current?.lastName ?? '';
        setData.name = `${fn} ${ln}`.trim();
      }

      await db.update(users).set(setData).where(eq(users.userId, reqUser.userId));

      return { success: true };
    },
  );

  // POST /api/users/me/password — change password
  app.post(
    '/api/users/me/password',
    { preHandler: [requireRole('properties.read')] },
    async (request, reply) => {
      const reqUser = (request as unknown as Record<string, { userId: string }>).user;
      const body = changePasswordBody.parse(request.body);

      const [user] = await db
        .select({ passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.userId, reqUser.userId))
        .limit(1);

      if (!user?.passwordHash) {
        return reply.code(400).send({ error: 'Cannot change password for this account' });
      }

      const bcrypt = await import('bcryptjs');
      const valid = await bcrypt.default.compare(body.currentPassword, user.passwordHash);
      if (!valid) {
        return reply.code(401).send({ error: 'Current password is incorrect' });
      }

      const newHash = await hashPassword(body.newPassword);
      await db
        .update(users)
        .set({ passwordHash: newHash, updatedAt: new Date() })
        .where(eq(users.userId, reqUser.userId));

      return { success: true };
    },
  );

  // GET /api/users/agents — list active agents (for assignment dropdowns)
  app.get(
    '/api/users/agents',
    { preHandler: [requireRole('properties.read')] },
    async () => {
      const agents = await db
        .select({
          userId: users.userId,
          name: users.name,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          role: users.role,
        })
        .from(users)
        .where(and(
          eq(users.active, true),
          sql`${users.role} IN ('AGENT', 'MANAGER', 'ADMIN')`,
        ));

      return { agents };
    },
  );
}
