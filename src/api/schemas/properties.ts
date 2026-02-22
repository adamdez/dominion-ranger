import { z } from 'zod';
import { BUSINESS_RULES } from '../../config/business-rules.js';

export const propertyParamsSchema = z.object({
  id: z.string().min(1),
});

export const propertyScoreHistoryQuery = z.object({
  limit: z.coerce.number().int().min(1).max(BUSINESS_RULES.pagination.maxPageSize).optional(),
});
