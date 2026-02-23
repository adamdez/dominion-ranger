import { z } from 'zod';
import { BUSINESS_RULES } from '../../config/business-rules.js';

export const createContactBody = z.object({
  contactName: z.string().max(256).optional(),
  contactType: z.enum(['OWNER', 'LANDLORD', 'RELATIVE', 'TENANT', 'SPOUSE', 'ATTORNEY', 'OTHER']).default('OWNER'),
  phone: z.string().max(20).optional(),
  phoneType: z.enum(['MOBILE', 'LANDLINE', 'VOIP', 'UNKNOWN']).optional(),
  email: z.string().email().max(256).optional(),
  source: z.enum(['TRACERFY', 'REISKIP', 'CSV_IMPORT', 'MANUAL']).default('MANUAL'),
});

export const updateContactBody = z.object({
  contactName: z.string().max(256).optional(),
  contactType: z.enum(['OWNER', 'LANDLORD', 'RELATIVE', 'TENANT', 'SPOUSE', 'ATTORNEY', 'OTHER']).optional(),
  phone: z.string().max(20).optional(),
  phoneType: z.enum(['MOBILE', 'LANDLINE', 'VOIP', 'UNKNOWN']).optional(),
  phoneStatus: z.enum(['CONNECTED', 'DISCONNECTED', 'WRONG_NUMBER', 'DNC', 'UNKNOWN']).optional(),
  email: z.string().email().max(256).optional(),
  dndCalls: z.boolean().optional(),
  dndSms: z.boolean().optional(),
  dndEmail: z.boolean().optional(),
  isPrimary: z.boolean().optional(),
  isOwnerMatch: z.boolean().optional(),
});

export const markDndBody = z.object({
  channel: z.enum(['calls', 'sms', 'email']),
});

export const contactsListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(BUSINESS_RULES.pagination.maxPageSize).default(BUSINESS_RULES.pagination.defaultPageSize),
});
