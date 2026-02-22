import { z } from 'zod';

export const enrichmentRunBody = z.object({
  limit: z.number().int().positive().optional(),
  county: z.string().min(1).optional(),
  minScore: z.number().min(0).max(100).optional(),
  forceAll: z.boolean().optional(),
}).optional();

export const dncScrubBody = z.object({
  queueId: z.number().int().positive(),
});

export const dncResultsParams = z.object({
  queueId: z.coerce.number().int().positive(),
});
