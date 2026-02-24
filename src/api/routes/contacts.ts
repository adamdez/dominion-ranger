import type { FastifyInstance } from 'fastify';
import { eq, sql, desc } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { propertyContacts, properties } from '../../db/schema/index.js';
import { requireRole } from '../middleware/auth.js';
import { paginate } from '../types.js';
import { NotFoundError } from '../../lib/errors.js';
import { createContactBody, updateContactBody, markDndBody, contactsListQuery } from '../schemas/contacts.js';

export async function contactRoutes(app: FastifyInstance): Promise<void> {

  // GET /api/contacts/property/:dominionLeadId — list all contacts for a property
  app.get<{ Params: { dominionLeadId: string }; Querystring: Record<string, string> }>(
    '/api/contacts/property/:dominionLeadId',
    { preHandler: [requireRole('properties.read')] },
    async (request) => {
      const { dominionLeadId } = request.params;
      const query = contactsListQuery.parse(request.query);
      const offset = (query.page - 1) * query.pageSize;

      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(propertyContacts)
        .where(eq(propertyContacts.dominionLeadId, dominionLeadId));

      const rows = await db
        .select()
        .from(propertyContacts)
        .where(eq(propertyContacts.dominionLeadId, dominionLeadId))
        .orderBy(desc(propertyContacts.isPrimary), propertyContacts.createdAt)
        .limit(query.pageSize)
        .offset(offset);

      return paginate(rows, countResult.count, query.page, query.pageSize);
    },
  );

  // POST /api/contacts/property/:dominionLeadId — add a manual contact
  app.post<{ Params: { dominionLeadId: string }; Body: Record<string, unknown> }>(
    '/api/contacts/property/:dominionLeadId',
    { preHandler: [requireRole('workflow.write')] },
    async (request, reply) => {
      const { dominionLeadId } = request.params;
      const body = createContactBody.parse(request.body);

      const [prop] = await db
        .select({ dominionLeadId: properties.dominionLeadId })
        .from(properties)
        .where(eq(properties.dominionLeadId, dominionLeadId));
      if (!prop) throw new NotFoundError('Property', dominionLeadId);

      const [contact] = await db
        .insert(propertyContacts)
        .values({ ...body, dominionLeadId })
        .returning();

      reply.code(201);
      return contact;
    },
  );

  // PATCH /api/contacts/:contactId — update a contact
  app.patch<{ Params: { contactId: string }; Body: Record<string, unknown> }>(
    '/api/contacts/:contactId',
    { preHandler: [requireRole('workflow.write')] },
    async (request) => {
      const { contactId } = request.params;
      const body = updateContactBody.parse(request.body);

      const updates: Record<string, unknown> = { updatedAt: sql`now()` };
      for (const [key, value] of Object.entries(body)) {
        if (value !== undefined) updates[key] = value;
      }

      const [updated] = await db
        .update(propertyContacts)
        .set(updates)
        .where(eq(propertyContacts.id, contactId))
        .returning();

      if (!updated) throw new NotFoundError('Contact', contactId);
      return updated;
    },
  );

  // DELETE /api/contacts/:contactId — delete a contact
  app.delete<{ Params: { contactId: string } }>(
    '/api/contacts/:contactId',
    { preHandler: [requireRole('workflow.write')] },
    async (request, reply) => {
      const { contactId } = request.params;
      const [deleted] = await db
        .delete(propertyContacts)
        .where(eq(propertyContacts.id, contactId))
        .returning();
      if (!deleted) throw new NotFoundError('Contact', contactId);
      reply.code(204);
      return null;
    },
  );

  // POST /api/contacts/:contactId/mark-dnd — mark DND on specific channel
  app.post<{ Params: { contactId: string }; Body: { channel: string } }>(
    '/api/contacts/:contactId/mark-dnd',
    { preHandler: [requireRole('workflow.write')] },
    async (request) => {
      const { contactId } = request.params;
      const { channel } = markDndBody.parse(request.body);

      const field = channel === 'calls' ? 'dndCalls' : channel === 'sms' ? 'dndSms' : 'dndEmail';

      const [updated] = await db
        .update(propertyContacts)
        .set({ [field]: true, updatedAt: sql`now()` })
        .where(eq(propertyContacts.id, contactId))
        .returning();

      if (!updated) throw new NotFoundError('Contact', contactId);
      return updated;
    },
  );

  // POST /api/contacts/:contactId/unmark-dnd — unmark DND
  app.post<{ Params: { contactId: string }; Body: { channel: string } }>(
    '/api/contacts/:contactId/unmark-dnd',
    { preHandler: [requireRole('workflow.write')] },
    async (request) => {
      const { contactId } = request.params;
      const { channel } = markDndBody.parse(request.body);

      const field = channel === 'calls' ? 'dndCalls' : channel === 'sms' ? 'dndSms' : 'dndEmail';

      const [updated] = await db
        .update(propertyContacts)
        .set({ [field]: false, updatedAt: sql`now()` })
        .where(eq(propertyContacts.id, contactId))
        .returning();

      if (!updated) throw new NotFoundError('Contact', contactId);
      return updated;
    },
  );
}
