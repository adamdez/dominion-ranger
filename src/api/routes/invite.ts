import type { FastifyInstance } from 'fastify';
import { db } from '../../db/connection.js';
import { users } from '../../db/schema/index.js';
import { eq, and, gt, isNotNull } from 'drizzle-orm';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { hashPassword } from '../../modules/auth/auth-service.js';
import { requireRole } from '../middleware/auth.js';
import type { Role } from '../../modules/rbac/service.js';
import { logger } from '../../config/logger.js';

const inviteBody = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
  role: z.enum(['AGENT', 'MANAGER']).default('AGENT'),
  phone: z.string().max(20).optional(),
});

const acceptInviteBody = z.object({
  password: z.string().min(8),
  phone: z.string().max(20).optional(),
});

export async function inviteRoutes(app: FastifyInstance): Promise<void> {

  // POST /api/invite — Admin creates an invite for a new agent/manager
  app.post(
    '/api/invite',
    { preHandler: [requireRole('users.write')] },
    async (request, reply) => {
      const reqUser = (request as unknown as Record<string, { role: Role }>).user;
      if (reqUser?.role !== 'ADMIN') {
        return reply.code(403).send({ error: 'Admin access required' });
      }

      const body = inviteBody.parse(request.body);

      const existing = await db
        .select({ userId: users.userId })
        .from(users)
        .where(eq(users.email, body.email.toLowerCase().trim()))
        .limit(1);

      if (existing.length > 0) {
        return reply.code(409).send({ error: 'A user with this email already exists' });
      }

      const inviteToken = randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const tempPassword = await hashPassword(randomUUID());
      const userId = randomUUID();

      await db.insert(users).values({
        userId,
        email: body.email.toLowerCase().trim(),
        passwordHash: tempPassword,
        name: `${body.firstName} ${body.lastName}`,
        firstName: body.firstName,
        lastName: body.lastName,
        role: body.role,
        phone: body.phone ?? null,
        inviteToken,
        inviteTokenExpiresAt: expiresAt,
        active: false,
      });

      logger.info({ userId, email: body.email, role: body.role }, 'Agent invite created');

      return {
        success: true,
        inviteToken,
        inviteUrl: `/invite/${inviteToken}`,
        expiresAt: expiresAt.toISOString(),
        user: {
          userId,
          email: body.email,
          name: `${body.firstName} ${body.lastName}`,
          role: body.role,
        },
      };
    },
  );

  // GET /api/invite/:token — Validate invite token (public, no auth)
  app.get<{ Params: { token: string } }>(
    '/api/invite/:token',
    async (request, reply) => {
      const { token } = request.params;

      const [user] = await db
        .select({
          userId: users.userId,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          name: users.name,
          role: users.role,
          inviteAcceptedAt: users.inviteAcceptedAt,
          inviteTokenExpiresAt: users.inviteTokenExpiresAt,
        })
        .from(users)
        .where(and(
          eq(users.inviteToken, token),
          isNotNull(users.inviteToken),
        ))
        .limit(1);

      if (!user) {
        return reply.code(404).send({ error: 'Invalid invite link' });
      }

      if (user.inviteAcceptedAt) {
        return reply.code(410).send({ error: 'This invite has already been used' });
      }

      if (user.inviteTokenExpiresAt && user.inviteTokenExpiresAt < new Date()) {
        return reply.code(410).send({ error: 'This invite link has expired' });
      }

      return {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        name: user.name,
        role: user.role,
      };
    },
  );

  // POST /api/invite/:token/accept — Agent sets password and accepts invite (public)
  app.post<{ Params: { token: string } }>(
    '/api/invite/:token/accept',
    async (request, reply) => {
      const { token } = request.params;
      const body = acceptInviteBody.parse(request.body);

      const [user] = await db
        .select({
          userId: users.userId,
          inviteAcceptedAt: users.inviteAcceptedAt,
          inviteTokenExpiresAt: users.inviteTokenExpiresAt,
        })
        .from(users)
        .where(and(
          eq(users.inviteToken, token),
          isNotNull(users.inviteToken),
        ))
        .limit(1);

      if (!user) {
        return reply.code(404).send({ error: 'Invalid invite link' });
      }

      if (user.inviteAcceptedAt) {
        return reply.code(410).send({ error: 'This invite has already been used' });
      }

      if (user.inviteTokenExpiresAt && user.inviteTokenExpiresAt < new Date()) {
        return reply.code(410).send({ error: 'This invite link has expired' });
      }

      const passwordHash = await hashPassword(body.password);

      await db
        .update(users)
        .set({
          passwordHash,
          phone: body.phone || undefined,
          inviteToken: null,
          inviteTokenExpiresAt: null,
          inviteAcceptedAt: new Date(),
          active: true,
          updatedAt: new Date(),
        })
        .where(eq(users.userId, user.userId));

      logger.info({ userId: user.userId }, 'Agent accepted invite');

      return { success: true };
    },
  );
}
