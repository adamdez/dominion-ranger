/**
 * Zod validation schema for public inbound lead endpoint.
 *
 * Charter §VIII: Compliance gating.
 * This is a PUBLIC, UNAUTHENTICATED endpoint — strict input validation is mandatory.
 *
 * .strict() rejects unknown fields to prevent payload pollution.
 * Max lengths match DB column constraints from inbound-leads.ts.
 */
import { z } from 'zod';

export const inboundLeadBody = z.object({
  // Contact info
  name: z.string().max(256).trim().optional(),
  phone: z.string()
    .max(32)
    .regex(/^[\d\s\-\(\)\+\.]+$/, 'Invalid phone format')
    .trim()
    .optional(),
  email: z.string().max(256).email('Invalid email').trim().optional(),

  // Property info
  address: z.string().max(500).trim().optional(),
  city: z.string().max(128).trim().optional(),
  state: z.string().max(2).trim().toUpperCase().optional(),
  zip: z.string().max(10).regex(/^\d{5}(-\d{4})?$/, 'Invalid zip format').optional(),

  // Message
  message: z.string().max(5000).trim().optional(),

  // Source attribution
  source: z.string().max(64).trim().optional(),
  sourceDetail: z.string().max(128).trim().optional(),

  // UTM tracking
  utmSource: z.string().max(128).trim().optional(),
  utmMedium: z.string().max(128).trim().optional(),
  utmCampaign: z.string().max(256).trim().optional(),
  utmContent: z.string().max(256).trim().optional(),
  utmTerm: z.string().max(256).trim().optional(),

  // Honeypot (should always be empty — bots fill it in)
  website: z.string().max(500).optional(),
}).strict().refine(
  (data) => data.address || data.phone,
  { message: 'Address or phone is required' },
);

export type InboundLeadInput = z.infer<typeof inboundLeadBody>;
