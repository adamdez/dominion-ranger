import type { FastifyInstance } from 'fastify';
import { db } from '../../db/connection.js';
import { inboundLeads, properties } from '../../db/schema/index.js';
import { ilike } from 'drizzle-orm';
import { logger } from '../../config/logger.js';
import { logActivity } from '../../modules/analytics/activity-logger.js';

export async function inboundRoutes(app: FastifyInstance): Promise<void> {

  // POST /api/inbound/website-lead — PUBLIC endpoint (no auth)
  // Stricter rate limit: 10 requests/minute per IP
  app.post('/api/inbound/website-lead', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute',
      },
    },
  }, async (request, reply) => {
    const body = request.body as Record<string, string>;

    // Honeypot — if 'website' field has a value, it's a bot
    if (body.website) {
      logger.warn('Honeypot triggered on inbound form');
      return reply.send({ success: true });
    }

    const {
      name, phone, email, address, city, state, zip, message,
      source, sourceDetail,
      utmSource, utmMedium, utmCampaign, utmContent, utmTerm,
    } = body;

    if (!address && !phone) {
      return reply.code(400).send({ error: 'Address or phone required' });
    }

    try {
      let matchedProperty = null;
      if (address) {
        const matches = await db
          .select()
          .from(properties)
          .where(ilike(properties.streetAddress, `%${address.trim()}%`))
          .limit(1);
        if (matches.length > 0) {
          matchedProperty = matches[0];
        }
      }

      const [lead] = await db.insert(inboundLeads).values({
        dominionLeadId: matchedProperty?.dominionLeadId ?? null,
        submittedName: name ?? null,
        submittedPhone: phone ?? null,
        submittedEmail: email ?? null,
        submittedAddress: address ?? null,
        submittedCity: city ?? null,
        submittedState: state ?? null,
        submittedZip: zip ?? null,
        submittedMessage: message ?? null,
        source: source || 'dominionhomedeals.com',
        sourceDetail: sourceDetail ?? null,
        utmSource: utmSource ?? null,
        utmMedium: utmMedium ?? null,
        utmCampaign: utmCampaign ?? null,
        utmContent: utmContent ?? null,
        utmTerm: utmTerm ?? null,
        matchedExisting: matchedProperty !== null,
        matchConfidence: matchedProperty ? '0.80' : null,
      }).returning();

      logger.info({
        inboundLeadId: lead.id,
        matched: matchedProperty !== null,
        source: source || 'dominionhomedeals.com',
      }, 'Inbound website lead captured');

      await logActivity({
        dominionLeadId: matchedProperty?.dominionLeadId ?? lead.id,
        activityType: 'INBOUND_FORM',
        channel: 'INBOUND_WEBSITE',
        meta: { utmSource, utmMedium, utmCampaign, source, inboundLeadId: lead.id },
      }).catch(err => logger.error({ err }, 'Failed to log INBOUND_FORM activity'));

      return reply.send({
        success: true,
        message: 'Thank you! Someone from our team will contact you shortly.',
        leadId: lead.id,
      });
    } catch (err: unknown) {
      logger.error({ err }, 'Failed to process inbound lead');
      return reply.code(500).send({ error: 'Failed to process submission' });
    }
  });
}
