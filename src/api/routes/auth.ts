import type { FastifyInstance } from 'fastify';
import { login, refreshAccessToken, logout, createUser, hashPassword, initiatePasswordReset, resetPasswordWithToken } from '../../modules/auth/index.js';
import { db } from '../../db/connection.js';
import { users } from '../../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Role } from '../../modules/rbac/service.js';

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const createUserBody = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(256),
  role: z.enum(['ADMIN', 'MANAGER', 'AGENT']).default('AGENT'),
  phone: z.string().max(20).optional(),
  twilioCallerId: z.string().max(20).optional(),
});

const updateUserBody = z.object({
  name: z.string().min(1).max(256).optional(),
  role: z.enum(['ADMIN', 'MANAGER', 'AGENT']).optional(),
  phone: z.string().max(20).optional().nullable(),
  twilioCallerId: z.string().max(20).optional().nullable(),
  active: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/auth/login', async (request, reply) => {
    const body = loginBody.parse(request.body);
    try {
      const result = await login(body.email, body.password, request.ip, request.headers['user-agent']);
      reply.setCookie('refresh_token', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/api/auth',
        maxAge: 30 * 24 * 60 * 60,
      });
      return { accessToken: result.accessToken, expiresIn: result.expiresIn, user: result.user };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed';
      return reply.code(401).send({ error: message });
    }
  });

  app.post('/api/auth/refresh', async (request, reply) => {
    const refreshToken = (request.cookies as Record<string, string>)?.refresh_token
      || (request.body as Record<string, string>)?.refreshToken;
    if (!refreshToken) return reply.code(401).send({ error: 'No refresh token' });
    try {
      const result = await refreshAccessToken(refreshToken);
      reply.setCookie('refresh_token', result.refreshToken, {
        httpOnly: true, secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax', path: '/api/auth', maxAge: 30 * 24 * 60 * 60,
      });
      return { accessToken: result.accessToken, expiresIn: result.expiresIn, user: result.user };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Refresh failed';
      return reply.code(401).send({ error: message });
    }
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const refreshToken = (request.cookies as Record<string, string>)?.refresh_token;
    if (refreshToken) await logout(refreshToken);
    reply.clearCookie('refresh_token', { path: '/api/auth' });
    return { success: true };
  });

  app.get('/api/auth/me', async (request) => {
    const user = (request as unknown as Record<string, { userId: string; email: string; name: string; role: string }>).user;
    if (!user) return { user: null };
    return { user };
  });

  app.post('/api/auth/users', async (request, reply) => {
    const reqUser = (request as unknown as Record<string, { role: Role }>).user;
    if (reqUser?.role !== 'ADMIN') return reply.code(403).send({ error: 'Admin access required' });
    const body = createUserBody.parse(request.body);
    const user = await createUser({ email: body.email, password: body.password, name: body.name, role: body.role, phone: body.phone, twilioCallerId: body.twilioCallerId });
    return { success: true, user: { id: user.userId, email: user.email, name: user.name, role: user.role } };
  });

  app.get('/api/auth/users', async (request, reply) => {
    const reqUser = (request as unknown as Record<string, { role: Role }>).user;
    if (reqUser?.role !== 'ADMIN' && reqUser?.role !== 'MANAGER') return reply.code(403).send({ error: 'Admin or manager access required' });
    const allUsers = await db.select({ id: users.userId, email: users.email, name: users.name, role: users.role, phone: users.phone, twilioCallerId: users.twilioCallerId, active: users.active, lastLoginAt: users.lastLoginAt, createdAt: users.createdAt }).from(users);
    return { users: allUsers };
  });

  app.patch<{ Params: { userId: string } }>('/api/auth/users/:userId', async (request, reply) => {
    const reqUser = (request as unknown as Record<string, { role: Role }>).user;
    if (reqUser?.role !== 'ADMIN') return reply.code(403).send({ error: 'Admin access required' });
    const { userId } = request.params;
    const body = updateUserBody.parse(request.body);
    const setData: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name) setData.name = body.name;
    if (body.role) setData.role = body.role;
    if (body.phone !== undefined) setData.phone = body.phone;
    if (body.twilioCallerId !== undefined) setData.twilioCallerId = body.twilioCallerId;
    if (body.active !== undefined) setData.active = body.active;
    if (body.password) setData.passwordHash = await hashPassword(body.password);
    await db.update(users).set(setData).where(eq(users.userId, userId));
    return { success: true };
  });

  app.post('/api/auth/forgot-password', async (request) => {
    const body = z.object({ email: z.string().email() }).parse(request.body);
    await initiatePasswordReset(body.email);
    return { message: 'If this email exists, a reset link has been generated. Contact your admin.' };
  });

  app.post('/api/auth/reset-password', async (request, reply) => {
    const body = z.object({ token: z.string().uuid(), newPassword: z.string().min(8) }).parse(request.body);
    const ok = await resetPasswordWithToken(body.token, body.newPassword);
    if (!ok) return reply.code(400).send({ error: 'Invalid or expired reset token' });
    return { success: true, message: 'Password reset successfully' };
  });

  app.post('/api/auth/admin/initiate-reset', async (request, reply) => {
    const reqUser = (request as unknown as Record<string, { role: Role }>).user;
    if (reqUser?.role !== 'ADMIN') return reply.code(403).send({ error: 'Admin access required' });
    const body = z.object({ email: z.string().email() }).parse(request.body);
    const result = await initiatePasswordReset(body.email);
    if (!result) return reply.code(404).send({ error: 'User not found' });
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return { token: result.token, resetLink: `${baseUrl}/reset-password/${result.token}` };
  });

  app.patch('/api/auth/me/password', async (request, reply) => {
    const reqUser = (request as unknown as Record<string, { userId: string }>).user;
    if (!reqUser) return reply.code(401).send({ error: 'Not authenticated' });
    const body = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) }).parse(request.body);
    const [user] = await db.select().from(users).where(eq(users.userId, reqUser.userId)).limit(1);
    if (!user?.passwordHash) return reply.code(400).send({ error: 'Cannot change password for this account' });
    const valid = await (await import('bcryptjs')).default.compare(body.currentPassword, user.passwordHash);
    if (!valid) return reply.code(401).send({ error: 'Current password is incorrect' });
    const newHash = await hashPassword(body.newPassword);
    await db.update(users).set({ passwordHash: newHash, updatedAt: new Date() }).where(eq(users.userId, reqUser.userId));
    return { success: true };
  });
}
