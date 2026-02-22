import { z } from 'zod';
import { BUSINESS_RULES } from '../../config/business-rules.js';

export const batchScoreBody = z.object({
  limit: z.number().int().positive().optional(),
  county: z.string().min(1).optional(),
  rescore: z.boolean().optional(),
}).optional();

export const scoringParamsSchema = z.object({
  dominionLeadId: z.string().min(1),
});

export const scoringHistoryQuery = z.object({
  limit: z.coerce.number().int().min(1).max(BUSINESS_RULES.pagination.maxPageSize).optional(),
});
