import { eq } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { users } from '../../db/schema/index.js';
import type { User } from '../../db/schema/index.js';
import { AuthorizationError } from '../../lib/errors.js';

export type Role = 'ADMIN' | 'FIELD' | 'READONLY';

// Permission definitions: what each role can do
const PERMISSIONS: Record<Role, Set<string>> = {
  ADMIN: new Set([
    'properties.read',
    'properties.write',
    'events.read',
    'events.write',
    'scoring.read',
    'scoring.write',
    'scoring.config',
    'promotion.read',
    'promotion.write',
    'sentinel.read',
    'sentinel.write',
    'audit.read',
    'users.read',
    'users.write',
    'system.settings',
    'pipeline.run',
  ]),
  FIELD: new Set([
    'properties.read',
    'events.read',
    'scoring.read',
    'promotion.read',
    'sentinel.read',
    'audit.read',
  ]),
  READONLY: new Set([
    'properties.read',
    'scoring.read',
    'promotion.read',
  ]),
};

export function hasPermission(role: Role, permission: string): boolean {
  return PERMISSIONS[role]?.has(permission) ?? false;
}

export function requirePermission(role: Role, permission: string): void {
  if (!hasPermission(role, permission)) {
    throw new AuthorizationError(`Role ${role} lacks permission: ${permission}`);
  }
}

export async function getUserById(userId: string): Promise<User | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.userId, userId));
  return user ?? null;
}
