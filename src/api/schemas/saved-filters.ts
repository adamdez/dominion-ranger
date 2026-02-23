import { z } from 'zod';

export const createSavedFilterBody = z.object({
  name: z.string().min(1).max(128),
  description: z.string().max(512).optional(),
  filterConfig: z.record(z.unknown()),
});

export const updateSavedFilterBody = z.object({
  name: z.string().min(1).max(128).optional(),
  description: z.string().max(512).optional(),
  filterConfig: z.record(z.unknown()).optional(),
});
