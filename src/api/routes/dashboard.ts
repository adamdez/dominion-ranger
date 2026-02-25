import type { FastifyInstance } from 'fastify';
import { db } from '../../db/connection.js';
import { dispositions, leadInstances, users, offers } from '../../db/schema/index.js';
import { eq, and, sql, gte } from 'drizzle-orm';
import { requireRole } from '../middleware/auth.js';

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {

  // GET /api/dashboard/my-stats — agent's personal activity stats
  app.get(
    '/api/dashboard/my-stats',
    { preHandler: [requireRole('properties.read')] },
    async (request) => {
      const user = (request as unknown as Record<string, { userId: string }>).user;

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);

      const [dialsToday] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(dispositions)
        .where(and(
          eq(dispositions.createdBy, user.userId),
          gte(dispositions.createdAt, todayStart),
        ));

      const [dialsThisWeek] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(dispositions)
        .where(and(
          eq(dispositions.createdBy, user.userId),
          gte(dispositions.createdAt, weekStart),
        ));

      const [myLeads] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(leadInstances)
        .where(eq(leadInstances.assignedTo, user.userId));

      const [myActiveOffers] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(offers)
        .where(and(
          eq(offers.createdBy, user.userId),
          sql`${offers.status} IN ('draft', 'sent', 'viewed', 'countered')`,
        ));

      return {
        dialsToday: dialsToday.count,
        dialsThisWeek: dialsThisWeek.count,
        myLeads: myLeads.count,
        myActiveOffers: myActiveOffers.count,
      };
    },
  );

  // GET /api/dashboard/agent-performance — admin/manager view of all agents
  app.get(
    '/api/dashboard/agent-performance',
    { preHandler: [requireRole('properties.read')] },
    async (request, reply) => {
      const reqUser = (request as unknown as Record<string, { userId: string; role: string }>).user;
      if (reqUser.role !== 'ADMIN' && reqUser.role !== 'MANAGER') {
        return reply.code(403).send({ error: 'Admin or manager access required' });
      }

      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);

      const agents = await db
        .select({
          userId: users.userId,
          name: users.name,
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
        })
        .from(users)
        .where(and(
          eq(users.active, true),
          sql`${users.role} IN ('AGENT', 'MANAGER')`,
        ));

      const agentIds = agents.map(a => a.userId);
      if (agentIds.length === 0) return { agents: [] };

      const leadCounts = await db
        .select({
          assignedTo: leadInstances.assignedTo,
          count: sql<number>`count(*)::int`,
        })
        .from(leadInstances)
        .where(sql`${leadInstances.assignedTo} = ANY(${agentIds})`)
        .groupBy(leadInstances.assignedTo);

      const dialCounts = await db
        .select({
          createdBy: dispositions.createdBy,
          count: sql<number>`count(*)::int`,
        })
        .from(dispositions)
        .where(and(
          sql`${dispositions.createdBy} = ANY(${agentIds})`,
          gte(dispositions.createdAt, weekStart),
        ))
        .groupBy(dispositions.createdBy);

      const leadMap = new Map(leadCounts.map(r => [r.assignedTo, r.count]));
      const dialMap = new Map(dialCounts.map(r => [r.createdBy, r.count]));

      return {
        agents: agents.map(a => ({
          userId: a.userId,
          name: a.name ?? `${a.firstName ?? ''} ${a.lastName ?? ''}`.trim(),
          role: a.role,
          leadCount: leadMap.get(a.userId) ?? 0,
          dialsThisWeek: dialMap.get(a.userId) ?? 0,
        })),
      };
    },
  );
}
