import { z } from 'zod';

export const createTagBody = z.object({
  name: z.string().min(1).max(64),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#6B7280'),
});

export const applyTagBody = z.object({
  tagId: z.string().uuid(),
});
