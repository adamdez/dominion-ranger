import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../../db/connection.js';
import { users, sessions } from '../../db/schema/index.js';
import { eq, and, gt } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { logger } from '../../config/logger.js';
import { env } from '../../config/env.js';

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = 30;

function getJwtSecret(): string {
  return env.JWT_SECRET;
}

export interface JWTPayload {
  userId: string;
  email: string;
  name: string;
  role: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export async function login(
  email: string,
  password: string,
  ipAddress?: string,
  userAgent?: string,
): Promise<TokenPair & { user: JWTPayload }> {
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email.toLowerCase().trim()), eq(users.active, true)))
    .limit(1);

  if (!user || !user.passwordHash) {
    throw new Error('Invalid email or password');
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new Error('Invalid email or password');
  }

  await db.update(users)
    .set({ lastLoginAt: new Date(), updatedAt: new Date() })
    .where(eq(users.userId, user.userId));

  const payload: JWTPayload = {
    userId: user.userId,
    email: user.email,
    name: user.name ?? '',
    role: user.role,
  };

  const tokens = await generateTokens(payload, ipAddress, userAgent);
  logger.info({ userId: user.userId, email: user.email, role: user.role }, 'User logged in');

  return { ...tokens, user: payload };
}

export async function generateTokens(
  payload: JWTPayload,
  ipAddress?: string,
  userAgent?: string,
): Promise<TokenPair> {
  const accessToken = jwt.sign(payload, getJwtSecret(), {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });

  const refreshToken = randomUUID();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

  await db.insert(sessions).values({
    userId: payload.userId,
    refreshToken,
    expiresAt,
    ipAddress: ipAddress ?? null,
    userAgent: userAgent ?? null,
  });

  return { accessToken, refreshToken, expiresIn: 900 };
}

export async function refreshAccessToken(
  refreshToken: string,
): Promise<TokenPair & { user: JWTPayload }> {
  const [session] = await db
    .select()
    .from(sessions)
    .where(and(
      eq(sessions.refreshToken, refreshToken),
      gt(sessions.expiresAt, new Date()),
    ))
    .limit(1);

  if (!session) {
    throw new Error('Invalid or expired refresh token');
  }

  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.userId, session.userId), eq(users.active, true)))
    .limit(1);

  if (!user) {
    throw new Error('User not found or inactive');
  }

  await db.delete(sessions).where(eq(sessions.id, session.id));

  const payload: JWTPayload = {
    userId: user.userId,
    email: user.email,
    name: user.name ?? '',
    role: user.role,
  };

  const tokens = await generateTokens(payload);
  return { ...tokens, user: payload };
}

export async function logout(refreshToken: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.refreshToken, refreshToken));
}

export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, getJwtSecret()) as JWTPayload;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function createUser(data: {
  email: string;
  password: string;
  name: string;
  role?: string;
  phone?: string;
  twilioCallerId?: string;
}): Promise<typeof users.$inferSelect> {
  const passwordHash = await hashPassword(data.password);
  const userId = randomUUID();

  const [user] = await db.insert(users).values({
    userId,
    email: data.email.toLowerCase().trim(),
    passwordHash,
    name: data.name,
    role: (data.role as 'ADMIN' | 'MANAGER' | 'AGENT') || 'AGENT',
    phone: data.phone ?? null,
    twilioCallerId: data.twilioCallerId ?? null,
  }).returning();

  logger.info({ userId: user.userId, email: user.email, role: user.role }, 'User created');
  return user;
}
