import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken } from '../../modules/auth/auth-service.js';
import { hasPermission } from '../../modules/rbac/service.js';
import type { Role } from '../../modules/rbac/service.js';
import { env } from '../../config/env.js';

interface RequestUser {
  userId: string;
  email: string;
  name: string;
  role: Role;
}

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const token = authHeader.slice(7);
      const payload = verifyToken(token);
      (request as unknown as Record<string, unknown>).user = {
        userId: payload.userId,
        email: payload.email,
        name: payload.name,
        role: payload.role as Role,
      } satisfies RequestUser;
      return;
    } catch {
      // JWT invalid — fall through to API key check
    }
  }

  const apiKey = request.headers['x-api-key'] as string | undefined;
  if (!apiKey) {
    reply.code(401).send({ error: 'Missing authentication' });
    return;
  }

  if (env.ADMIN_BOOTSTRAP_TOKEN && apiKey === env.ADMIN_BOOTSTRAP_TOKEN) {
    (request as unknown as Record<string, unknown>).user = {
      userId: 'admin-bootstrap',
      email: 'admin@system',
      name: 'Admin',
      role: 'ADMIN' as Role,
    } satisfies RequestUser;
    return;
  }

  reply.code(401).send({ error: 'Invalid authentication' });
}

export function requireRole(permission: string) {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = (request as unknown as Record<string, unknown>).user as RequestUser | undefined;

    if (!user) {
      reply.code(401).send({ error: 'Not authenticated' });
      return;
    }

    if (!hasPermission(user.role, permission)) {
      reply.code(403).send({ error: `Insufficient permissions: requires ${permission}` });
      return;
    }
  };
}
