import { z } from 'zod';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');
const monthString = z.string().regex(/^\d{4}-\d{2}$/, 'Must be YYYY-MM');

export const dailyMetricsQuery = z.object({
  date: dateString.optional(),
  from: dateString.optional(),
  to: dateString.optional(),
}).refine(
  (d) => d.date || (d.from && d.to),
  { message: 'Provide either date or from+to range' },
);

export const agentMetricsQuery = z.object({
  week: dateString,
});

export const channelMetricsQuery = z.object({
  month: monthString,
});

export const scoringPerformanceQuery = z.object({
  month: monthString,
});

export const dealsQuery = z.object({
  from: dateString.optional(),
  to: dateString.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

export const rollupTriggerBody = z.object({
  date: dateString.optional(),
});
