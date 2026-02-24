import { db } from '../../db/connection.js';
import { errorLog } from '../../db/schema/index.js';
import { desc } from 'drizzle-orm';

export async function logError(params: {
  errorType: string;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(errorLog).values({
      errorType: params.errorType,
      message: params.message,
      stack: params.stack,
      context: params.context ?? {},
    });
  } catch {
    console.error('Failed to log error:', params.message);
  }
}

export async function getRecentErrors(limit = 10) {
  return db
    .select()
    .from(errorLog)
    .orderBy(desc(errorLog.createdAt))
    .limit(limit);
}
