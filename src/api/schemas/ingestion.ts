import { z } from 'zod';

export const ingestionRunBody = z.object({
  adapter: z.string().min(1).optional(),
  options: z.record(z.unknown()).optional(),
}).optional();
