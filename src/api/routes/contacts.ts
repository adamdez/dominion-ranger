/**
 * Contact resolution API routes.
 *
 * POST /api/properties/:dominionLeadId/resolve-contacts  — single property
 * POST /api/contacts/bulk-resolve                        — bulk skip trace
 * POST /api/properties/:dominionLeadId/contacts          — add manual contact
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../middleware/auth.js';
import { resolveContacts, addManualContact } from '../../modules/enrichment/contact-resolver.js';
import { logger } from '../../config/logger.js';

const resolveBody = z.object({
  tier: z.enum(['free', 'basic', 'deep']).default('basic'),
});

const bulkResolveBody = z.object({
  dominionLeadIds: z.array(z.string().uuid()).min(1).max(100),
  tier: z.enum(['free', 'basic', 'deep']).default('basic'),
});

const manualContactBody = z.object({
  contactName: z.string().optional(),
  contactType: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  notes: z.string().optional(),
  isPrimary: z.boolean().optional(),
});

export async function contactRoutes(app: FastifyInstance): Promise<void> {

  // POST /api/properties/:dominionLeadId/resolve-contacts
  app.post<{ Params: { dominionLeadId: string } }>(
    '/api/properties/:dominionLeadId/resolve-contacts',
    { preHandler: [requireRole('pipeline.run')] },
    async (request, reply) => {
      const { dominionLeadId } = request.params;
      const { tier } = resolveBody.parse(request.body);

      logger.info({ dominionLeadId, tier }, 'API: resolve-contacts endpoint called');

      try {
        const result = await resolveContacts(dominionLeadId, tier);
        return reply.send(result);
      } catch (err: unknown) {
        logger.error({ err, dominionLeadId, tier }, 'Contact resolution failed');
        return reply.code(500).send({
          error: 'CONTACT_RESOLUTION_FAILED',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    },
  );

  // POST /api/contacts/bulk-resolve
  app.post(
    '/api/contacts/bulk-resolve',
    { preHandler: [requireRole('pipeline.run')] },
    async (request, reply) => {
      const { dominionLeadIds, tier } = bulkResolveBody.parse(request.body);

      const results: Array<{
        dominionLeadId: string;
        success: boolean;
        newContacts: number;
        primaryPhone: string | null;
        costCents: number;
        error?: string;
      }> = [];

      let totalCost = 0;

      for (const id of dominionLeadIds) {
        try {
          const result = await resolveContacts(id, tier);
          totalCost += result.costCents;
          results.push({
            dominionLeadId: id,
            success: result.contacts.length > 0,
            newContacts: result.newContactsAdded,
            primaryPhone: result.primaryPhone,
            costCents: result.costCents,
            error: result.errors.length > 0 ? result.errors.join('; ') : undefined,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          logger.warn({ dominionLeadId: id, err: msg }, 'Bulk resolve: individual failure');
          results.push({
            dominionLeadId: id,
            success: false,
            newContacts: 0,
            primaryPhone: null,
            costCents: 0,
            error: msg,
          });
        }
      }

      const succeeded = results.filter((r) => r.success).length;
      const totalNewContacts = results.reduce((sum, r) => sum + r.newContacts, 0);

      return reply.send({
        total: dominionLeadIds.length,
        succeeded,
        failed: dominionLeadIds.length - succeeded,
        totalNewContacts,
        totalCostCents: totalCost,
        results,
      });
    },
  );

  // POST /api/properties/:dominionLeadId/contacts — Add manual contact
  app.post<{ Params: { dominionLeadId: string } }>(
    '/api/properties/:dominionLeadId/contacts',
    { preHandler: [requireRole('properties.read')] },
    async (request, reply) => {
      const { dominionLeadId } = request.params;
      const data = manualContactBody.parse(request.body);

      if (!data.phone && !data.email) {
        return reply.code(400).send({
          error: 'VALIDATION_ERROR',
          message: 'At least one of phone or email is required',
        });
      }

      try {
        await addManualContact(dominionLeadId, data);
        return reply.send({ success: true });
      } catch (err: unknown) {
        logger.error({ err, dominionLeadId }, 'Failed to add manual contact');
        return reply.code(500).send({
          error: 'ADD_CONTACT_FAILED',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    },
  );
}
