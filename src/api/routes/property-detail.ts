import type { FastifyInstance } from 'fastify';
import { eq, desc, sql, and } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import {
  properties,
  leadInstances,
  scoringRecords,
  distressEvents,
  propertyContacts,
  tags,
  leadInstanceTags,
  tasks,
  activityLog,
  deals,
} from '../../db/schema/index.js';
import { requireRole } from '../middleware/auth.js';
import { NotFoundError } from '../../lib/errors.js';

export async function propertyDetailRoutes(app: FastifyInstance): Promise<void> {

  app.get<{ Params: { dominionLeadId: string } }>(
    '/api/properties/:dominionLeadId/detail',
    { preHandler: [requireRole('properties.read')] },
    async (request) => {
      const { dominionLeadId } = request.params;

      const [property] = await db
        .select()
        .from(properties)
        .where(eq(properties.dominionLeadId, dominionLeadId));

      if (!property) throw new NotFoundError('Property', dominionLeadId);

      const [contacts, scoring, events, leadInstance, deal, recentActivity] = await Promise.all([
        db
          .select({
            id: propertyContacts.id,
            contactName: propertyContacts.contactName,
            contactType: propertyContacts.contactType,
            phone: propertyContacts.phone,
            phoneType: propertyContacts.phoneType,
            phoneStatus: propertyContacts.phoneStatus,
            email: propertyContacts.email,
            dndCalls: propertyContacts.dndCalls,
            dndSms: propertyContacts.dndSms,
            dndEmail: propertyContacts.dndEmail,
            source: propertyContacts.source,
            isPrimary: propertyContacts.isPrimary,
            isOwnerMatch: propertyContacts.isOwnerMatch,
          })
          .from(propertyContacts)
          .where(eq(propertyContacts.dominionLeadId, dominionLeadId))
          .orderBy(desc(propertyContacts.isPrimary)),

        db
          .select({
            compositeScore: scoringRecords.compositeScore,
            motivationScore: scoringRecords.motivationScore,
            dealScore: scoringRecords.dealScore,
            confidenceScore: scoringRecords.confidenceScore,
            scoreModelVersion: scoringRecords.scoreModelVersion,
            timeDecayFactor: scoringRecords.timeDecayFactor,
            scoredAt: scoringRecords.lastScoredAt,
          })
          .from(scoringRecords)
          .where(eq(scoringRecords.dominionLeadId, dominionLeadId))
          .orderBy(desc(scoringRecords.createdAt))
          .limit(1),

        db
          .select({
            eventId: distressEvents.eventId,
            eventType: distressEvents.eventType,
            eventLayer: distressEvents.eventLayer,
            sourceName: distressEvents.sourceName,
            reliabilityScore: distressEvents.reliabilityScore,
            rawEventPayload: distressEvents.rawEventPayload,
            triggerEventDate: distressEvents.triggerEventDate,
            createdAt: distressEvents.createdAt,
          })
          .from(distressEvents)
          .where(eq(distressEvents.dominionLeadId, dominionLeadId))
          .orderBy(desc(distressEvents.createdAt))
          .limit(50),

        db
          .select()
          .from(leadInstances)
          .where(eq(leadInstances.dominionLeadId, dominionLeadId))
          .orderBy(desc(leadInstances.createdAt))
          .limit(1),

        db
          .select()
          .from(deals)
          .where(eq(deals.dominionLeadId, dominionLeadId))
          .orderBy(desc(deals.createdAt))
          .limit(1),

        db
          .select({
            activityType: activityLog.activityType,
            channel: activityLog.channel,
            outcome: activityLog.outcome,
            userId: activityLog.userId,
            occurredAt: activityLog.occurredAt,
            meta: activityLog.meta,
          })
          .from(activityLog)
          .where(eq(activityLog.dominionLeadId, dominionLeadId))
          .orderBy(desc(activityLog.occurredAt))
          .limit(20),
      ]);

      // Fetch tags if a lead instance exists
      let leadTags: Array<{ id: string; name: string; color: string | null }> = [];
      let leadTasks: Array<Record<string, unknown>> = [];
      const li = leadInstance[0] ?? null;

      if (li) {
        const [tagRows, taskRows] = await Promise.all([
          db
            .select({
              id: tags.id,
              name: tags.name,
              color: tags.color,
            })
            .from(leadInstanceTags)
            .innerJoin(tags, eq(leadInstanceTags.tagId, tags.id))
            .where(eq(leadInstanceTags.leadInstanceId, li.leadInstanceId)),

          db
            .select({
              id: tasks.id,
              title: tasks.title,
              taskType: tasks.taskType,
              status: tasks.status,
              dueAt: tasks.dueAt,
              assignedTo: tasks.assignedTo,
            })
            .from(tasks)
            .where(eq(tasks.leadInstanceId, li.leadInstanceId))
            .orderBy(desc(tasks.createdAt))
            .limit(20),
        ]);
        leadTags = tagRows;
        leadTasks = taskRows;
      }

      return {
        property,
        contacts,
        scoring: scoring[0] ?? null,
        events,
        leadInstance: li ? {
          leadInstanceId: li.leadInstanceId,
          status: li.status,
          dealStage: li.dealStage,
          assignedTo: li.assignedTo,
          complianceCleared: li.complianceCleared,
          claimedAt: li.claimedAt,
          createdAt: li.createdAt,
          updatedAt: li.updatedAt,
        } : null,
        tags: leadTags,
        tasks: leadTasks,
        recentActivity,
        deal: deal[0] ?? null,
        skipTrace: property.skipTraceTier ? {
          tier: property.skipTraceTier,
          source: property.skipTraceSource,
          tracedAt: property.skipTracedAt,
          phonesFound: [property.phone, property.phone2, property.phone3].filter(Boolean).length,
          emailsFound: [property.email, property.email2].filter(Boolean).length,
        } : null,
      };
    },
  );
}
