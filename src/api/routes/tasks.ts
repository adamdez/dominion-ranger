import type { FastifyInstance } from 'fastify';
import { eq, and, sql, lte, gte, desc } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { tasks, TaskStatus } from '../../db/schema/index.js';
import { requireRole } from '../middleware/auth.js';
import { paginate } from '../types.js';
import { NotFoundError } from '../../lib/errors.js';
import { logActivity } from '../../modules/analytics/activity-logger.js';
import { logger } from '../../config/logger.js';
import { createTaskBody, updateTaskBody, tasksListQuery } from '../schemas/tasks.js';

export async function taskRoutes(app: FastifyInstance): Promise<void> {

  // GET /api/tasks — paginated, filterable task list
  app.get<{ Querystring: Record<string, string> }>(
    '/api/tasks',
    { preHandler: [requireRole('properties.read')] },
    async (request) => {
      const query = tasksListQuery.parse(request.query);
      const offset = (query.page - 1) * query.pageSize;

      const conditions = [];
      if (query.assignedTo) conditions.push(eq(tasks.assignedTo, query.assignedTo));
      if (query.status) conditions.push(eq(tasks.status, query.status));
      if (query.leadInstanceId) conditions.push(eq(tasks.leadInstanceId, query.leadInstanceId));
      if (query.dueBefore) conditions.push(lte(tasks.dueAt, new Date(query.dueBefore)));
      if (query.dueAfter) conditions.push(gte(tasks.dueAt, new Date(query.dueAfter)));

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(tasks)
        .where(whereClause);

      const rows = await db
        .select()
        .from(tasks)
        .where(whereClause)
        .orderBy(desc(tasks.dueAt))
        .limit(query.pageSize)
        .offset(offset);

      return paginate(rows, countResult.count, query.page, query.pageSize);
    },
  );

  // GET /api/tasks/due-today — tasks due today
  app.get(
    '/api/tasks/due-today',
    { preHandler: [requireRole('properties.read')] },
    async () => {
      const rows = await db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.status, TaskStatus.PENDING),
            gte(tasks.dueAt, sql`date_trunc('day', now())`),
            lte(tasks.dueAt, sql`date_trunc('day', now()) + interval '1 day'`),
          ),
        )
        .orderBy(tasks.dueAt);
      return rows;
    },
  );

  // GET /api/tasks/overdue — overdue tasks
  app.get(
    '/api/tasks/overdue',
    { preHandler: [requireRole('properties.read')] },
    async () => {
      const rows = await db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.status, TaskStatus.PENDING),
            lte(tasks.dueAt, sql`now()`),
          ),
        )
        .orderBy(tasks.dueAt);
      return rows;
    },
  );

  // POST /api/tasks — create a task
  app.post<{ Body: Record<string, unknown> }>(
    '/api/tasks',
    { preHandler: [requireRole('workflow.write')] },
    async (request, reply) => {
      const body = createTaskBody.parse(request.body);
      const user = (request as unknown as Record<string, { userId: string }>).user;

      const [task] = await db
        .insert(tasks)
        .values({
          ...body,
          dueAt: body.dueAt ? new Date(body.dueAt) : null,
          createdBy: user.userId,
        })
        .returning();

      reply.code(201);
      return task;
    },
  );

  // PATCH /api/tasks/:taskId — update a task
  app.patch<{ Params: { taskId: string }; Body: Record<string, unknown> }>(
    '/api/tasks/:taskId',
    { preHandler: [requireRole('workflow.write')] },
    async (request) => {
      const { taskId } = request.params;
      const body = updateTaskBody.parse(request.body);

      const updates: Record<string, unknown> = { updatedAt: sql`now()` };
      if (body.title !== undefined) updates.title = body.title;
      if (body.description !== undefined) updates.description = body.description;
      if (body.taskType !== undefined) updates.taskType = body.taskType;
      if (body.status !== undefined) updates.status = body.status;
      if (body.assignedTo !== undefined) updates.assignedTo = body.assignedTo;
      if (body.dueAt !== undefined) updates.dueAt = body.dueAt ? new Date(body.dueAt) : null;

      const [updated] = await db
        .update(tasks)
        .set(updates)
        .where(eq(tasks.id, taskId))
        .returning();

      if (!updated) throw new NotFoundError('Task', taskId);
      return updated;
    },
  );

  // PATCH /api/tasks/:taskId/complete — mark task complete
  app.patch<{ Params: { taskId: string } }>(
    '/api/tasks/:taskId/complete',
    { preHandler: [requireRole('workflow.write')] },
    async (request) => {
      const { taskId } = request.params;
      const user = (request as unknown as Record<string, { userId: string }>).user;

      const [updated] = await db
        .update(tasks)
        .set({
          status: TaskStatus.COMPLETED,
          completedAt: sql`now()`,
          updatedAt: sql`now()`,
        })
        .where(eq(tasks.id, taskId))
        .returning();

      if (!updated) throw new NotFoundError('Task', taskId);

      if (updated.dominionLeadId) {
        await logActivity({
          dominionLeadId: updated.dominionLeadId,
          leadInstanceId: updated.leadInstanceId ?? undefined,
          userId: user.userId,
          activityType: 'STATUS_CHANGED',
          channel: 'OUTBOUND_COLD',
          meta: {
            action: 'TASK_COMPLETED',
            taskId: updated.id,
            taskType: updated.taskType,
          },
        }).catch(err => logger.error({ err }, 'Failed to log task completion activity'));
      }

      return updated;
    },
  );

  // DELETE /api/tasks/:taskId — delete a task
  app.delete<{ Params: { taskId: string } }>(
    '/api/tasks/:taskId',
    { preHandler: [requireRole('workflow.write')] },
    async (request, reply) => {
      const { taskId } = request.params;
      const [deleted] = await db.delete(tasks).where(eq(tasks.id, taskId)).returning();
      if (!deleted) throw new NotFoundError('Task', taskId);
      reply.code(204);
      return null;
    },
  );
}
