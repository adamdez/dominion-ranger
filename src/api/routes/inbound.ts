/**
 * Inbound routes — PUBLIC endpoint for website lead capture.
 *
 * Charter §VIII: All inputs validated.
 * Hardened with:
 *   - Zod schema validation (no raw body casting)
 *   - Sanitized ILIKE pattern (no SQL injection via address)
 *   - Honeypot field for bot detection
 *   - Rate limiting (10/min per IP)
 */
import type { FastifyInstance } from 'fastify';
import { db } from '../../db/connection.js';
import { inboundLeads, properties } from '../../db/schema/index.js';
import { ilike } from 'drizzle-orm';
import { logger } from '../../config/logger.js';
import { inboundLeadBody } from '../schemas/inbound.js';

/**
 * Escape special LIKE/ILIKE pattern characters to prevent pattern injection.
 * PostgreSQL LIKE treats %, _, and \ as special characters.
 */
function escapeLikePattern(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&');
}

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
    // ── Zod validation (replaces raw cast) ──
    const parseResult = inboundLeadBody.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const body = parseResult.data;

    // Honeypot — if 'website' field has a value, it's a bot
    if (body.website) {
      logger.warn('Honeypot triggered on inbound form');
      // Return success to not reveal detection
      return reply.send({ success: true });
    }

    const {
      name, phone, email, address, city, state, zip, message,
      source, sourceDetail,
      utmSource, utmMedium, utmCampaign, utmContent, utmTerm,
    } = body;

    try {
      let matchedProperty = null;
      if (address) {
        // Escape ILIKE pattern characters to prevent pattern injection
        const safeAddress = escapeLikePattern(address.trim());
        const matches = await db
          .select()
          .from(properties)
          .where(ilike(properties.streetAddress, `%${safeAddress}%`))
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
