import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import * as schema from './schema/index.js';

const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  min: env.DATABASE_POOL_MIN,
  max: env.DATABASE_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected database pool error');
});

export const db = drizzle(pool, { schema, logger: env.NODE_ENV === 'development' });
export type Database = typeof db;

export async function closeDatabase(): Promise<void> {
  await pool.end();
  logger.info('Database pool closed');
}

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch (err) {
    logger.error({ err }, 'Database connection check failed');
    return false;
  }
}
