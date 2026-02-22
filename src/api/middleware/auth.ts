import type { FastifyRequest, FastifyReply } from 'fastify';
import { hasPermission, getUserById } from '../../modules/rbac/service.js';
import type { Role } from '../../modules/rbac/service.js';
import { env } from '../../config/env.js';

/**
 * Attach user context to request.
 *
 * Phase 1: Simple token-based auth via X-API-Key header.
 * Phase 2: JWT with proper session management.
 */
export async function authMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  // In development, allow bootstrap token for admin access
  const apiKey = request.headers['x-api-key'] as string | undefined;

  if (!apiKey) {
    reply.code(401).send({ error: 'Missing X-API-Key header' });
    return;
  }

  // Bootstrap admin token check
  if (env.ADMIN_BOOTSTRAP_TOKEN && apiKey === env.ADMIN_BOOTSTRAP_TOKEN) {
    (request as any).user = {
      userId: 'admin-bootstrap',
      role: 'ADMIN' as Role,
    };
    return;
  }

  // Look up user by API key (userId = apiKey for Phase 1 simplicity)
  const user = await getUserById(apiKey);
  if (!user || !user.active) {
    reply.code(401).send({ error: 'Invalid or inactive API key' });
    return;
  }

  (request as any).user = {
    userId: user.userId,
    role: user.role as Role,
  };
}

/**
 * Create a permission guard for a specific permission.
 */
export function requireRole(permission: string) {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = (request as any).user as { userId: string; role: Role } | undefined;

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
