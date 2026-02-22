import { z } from 'zod';
import { BUSINESS_RULES } from '../../config/business-rules.js';

export const topLeadsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(BUSINESS_RULES.pagination.maxPageSize).default(BUSINESS_RULES.pagination.defaultPageSize),
  minScore: z.coerce.number().min(0).max(100).default(0),
  absenteeOnly: z.enum(['true', 'false']).default('false'),
});
