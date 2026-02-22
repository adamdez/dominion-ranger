import { z } from 'zod';

export const sentinelStatusBody = z.object({
  dominion_lead_id: z.string().min(1),
  status: z.enum(['CLAIMED', 'DIALED', 'OFFER_SENT', 'CONTRACTED', 'CLOSED', 'DEAD', 'LISTED', 'SOLD']),
  user_id: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});
