import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { requireRole } from '../middleware/auth.js';
import {
  createOffer,
  updateOffer,
  sendOffer,
  recordOfferResponse,
  listOffers,
  getOffer,
  expireStaleOffers,
  deleteOffer,
  getOfferStats,
} from '../../modules/offers/offer-service.js';

interface RequestUser {
  userId: string;
  role: string;
}

function getUser(request: unknown): RequestUser {
  return (request as Record<string, RequestUser>).user;
}

export async function offerRoutes(app: FastifyInstance): Promise<void> {
  // ─── Create Offer ──────────────────────────────────
  app.post<{ Body: Record<string, unknown> }>(
    '/api/offers',
    { preHandler: [requireRole('workflow.write')] },
    async (request, reply) => {
      const user = getUser(request);
      const body = request.body;

      const offer = await createOffer({
        dominionLeadId: body.dominionLeadId as string,
        propertyId: body.propertyId as string,
        leadInstanceId: body.leadInstanceId as string | undefined,
        createdBy: user.userId,
        offerAmountCents: body.offerAmountCents as number,
        earnestMoneyCents: body.earnestMoneyCents as number | undefined,
        closingDays: body.closingDays as number | undefined,
        inspectionDays: body.inspectionDays as number | undefined,
        offerExpiryDays: body.offerExpiryDays as number | undefined,
        contingencies: body.contingencies as string[] | undefined,
        additionalTerms: body.additionalTerms as string | undefined,
        compReportId: body.compReportId as string | undefined,
        arvCents: body.arvCents as number | undefined,
        rehabEstimateCents: body.rehabEstimateCents as number | undefined,
        assignmentFeeCents: body.assignmentFeeCents as number | undefined,
        notes: body.notes as string | undefined,
      });

      reply.code(201);
      return offer;
    },
  );

  // ─── List Offers ───────────────────────────────────
  app.get<{ Querystring: Record<string, string> }>(
    '/api/offers',
    { preHandler: [requireRole('properties.read')] },
    async (request) => {
      const user = getUser(request);
      const query = request.query;
      const isAdminOrManager = user.role === 'ADMIN' || user.role === 'MANAGER';

      const result = await listOffers({
        propertyId: query.property_id,
        dominionLeadId: query.dominion_lead_id,
        status: query.status,
        createdBy: isAdminOrManager ? query.created_by : user.userId,
        search: query.search,
        page: query.page ? parseInt(query.page, 10) : 1,
        limit: query.limit ? parseInt(query.limit, 10) : 25,
      });

      return result;
    },
  );

  // ─── Offer Stats ───────────────────────────────────
  app.get(
    '/api/offers/stats',
    { preHandler: [requireRole('properties.read')] },
    async (request) => {
      const user = getUser(request);
      const isAdminOrManager = user.role === 'ADMIN' || user.role === 'MANAGER';
      return getOfferStats(isAdminOrManager ? undefined : user.userId);
    },
  );

  // ─── Expire Stale ──────────────────────────────────
  app.post(
    '/api/offers/expire-stale',
    { preHandler: [requireRole('admin')] },
    async () => {
      const count = await expireStaleOffers();
      return { expired: count };
    },
  );

  // ─── Get Single Offer ──────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/api/offers/:id',
    { preHandler: [requireRole('properties.read')] },
    async (request, reply) => {
      const user = getUser(request);
      const offer = await getOffer(request.params.id);
      if (!offer) return reply.code(404).send({ error: 'Offer not found' });

      const isAdminOrManager = user.role === 'ADMIN' || user.role === 'MANAGER';
      if (!isAdminOrManager && offer.createdBy !== user.userId) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      return offer;
    },
  );

  // ─── Update Offer (draft only) ─────────────────────
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>(
    '/api/offers/:id',
    { preHandler: [requireRole('workflow.write')] },
    async (request, reply) => {
      const user = getUser(request);
      const existing = await getOffer(request.params.id);
      if (!existing) return reply.code(404).send({ error: 'Offer not found' });

      const isAdminOrManager = user.role === 'ADMIN' || user.role === 'MANAGER';
      if (!isAdminOrManager && existing.createdBy !== user.userId) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      const body = request.body;
      const updated = await updateOffer(request.params.id, {
        offerAmountCents: body.offerAmountCents as number | undefined,
        earnestMoneyCents: body.earnestMoneyCents as number | undefined,
        closingDays: body.closingDays as number | undefined,
        inspectionDays: body.inspectionDays as number | undefined,
        offerExpiryDays: body.offerExpiryDays as number | undefined,
        contingencies: body.contingencies as string[] | undefined,
        additionalTerms: body.additionalTerms as string | undefined,
        compReportId: body.compReportId as string | undefined,
        arvCents: body.arvCents as number | undefined,
        rehabEstimateCents: body.rehabEstimateCents as number | undefined,
        assignmentFeeCents: body.assignmentFeeCents as number | undefined,
        notes: body.notes as string | undefined,
      });

      return updated;
    },
  );

  // ─── Send Offer ────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/api/offers/:id/send',
    { preHandler: [requireRole('workflow.write')] },
    async (request, reply) => {
      const user = getUser(request);
      const existing = await getOffer(request.params.id);
      if (!existing) return reply.code(404).send({ error: 'Offer not found' });

      const isAdminOrManager = user.role === 'ADMIN' || user.role === 'MANAGER';
      if (!isAdminOrManager && existing.createdBy !== user.userId) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      const sent = await sendOffer(request.params.id);
      return sent;
    },
  );

  // ─── Record Response ───────────────────────────────
  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>(
    '/api/offers/:id/respond',
    { preHandler: [requireRole('workflow.write')] },
    async (request, reply) => {
      const user = getUser(request);
      const existing = await getOffer(request.params.id);
      if (!existing) return reply.code(404).send({ error: 'Offer not found' });

      const isAdminOrManager = user.role === 'ADMIN' || user.role === 'MANAGER';
      if (!isAdminOrManager && existing.createdBy !== user.userId) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      const body = request.body;
      const updated = await recordOfferResponse(request.params.id, {
        status: body.status as 'accepted' | 'rejected' | 'countered' | 'withdrawn',
        counterAmountCents: body.counterAmountCents as number | undefined,
        counterNotes: body.counterNotes as string | undefined,
        notes: body.notes as string | undefined,
      });

      return updated;
    },
  );

  // ─── PDF Download ──────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/api/offers/:id/pdf',
    { preHandler: [requireRole('properties.read')] },
    async (request, reply) => {
      const user = getUser(request);
      const offer = await getOffer(request.params.id);
      if (!offer) return reply.code(404).send({ error: 'Offer not found' });

      const isAdminOrManager = user.role === 'ADMIN' || user.role === 'MANAGER';
      if (!isAdminOrManager && offer.createdBy !== user.userId) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      if (!offer.pdfUrl || !fs.existsSync(offer.pdfUrl)) {
        return reply.code(404).send({ error: 'PDF not generated yet' });
      }

      const filename = `offer-${offer.propertyAddress.replace(/[^a-zA-Z0-9]/g, '-')}.pdf`;
      const stream = fs.createReadStream(offer.pdfUrl);

      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(stream);
    },
  );

  // ─── Delete Offer (draft only) ─────────────────────
  app.delete<{ Params: { id: string } }>(
    '/api/offers/:id',
    { preHandler: [requireRole('workflow.write')] },
    async (request, reply) => {
      const user = getUser(request);
      const existing = await getOffer(request.params.id);
      if (!existing) return reply.code(404).send({ error: 'Offer not found' });

      const isAdminOrManager = user.role === 'ADMIN' || user.role === 'MANAGER';
      if (!isAdminOrManager && existing.createdBy !== user.userId) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      await deleteOffer(request.params.id);
      return { success: true };
    },
  );
}
