import { z } from 'zod';
import { BUSINESS_RULES } from '../../config/business-rules.js';

export const rankedLeadsQuery = z.object({
  tier: z.enum(['A', 'B', 'C']).optional(),
  limit: z.coerce.number().int().min(1).max(BUSINESS_RULES.pagination.maxPageSize).default(BUSINESS_RULES.pagination.defaultPageSize),
  offset: z.coerce.number().int().min(0).default(0),
});
