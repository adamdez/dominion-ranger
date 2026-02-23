import { z } from 'zod';

export const transitionDealStageBody = z.object({
  stage: z.enum([
    'NEW_LEAD', 'SKIP_TRACED', 'CONTACTED', 'INTERESTED',
    'OFFER_MADE', 'UNDER_CONTRACT', 'TITLE_ESCROW',
    'CLOSED_WON', 'CLOSED_LOST', 'DEAD',
  ]),
});
