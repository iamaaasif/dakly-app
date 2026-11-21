import { z } from 'zod';

import { supportReasonSchema } from './support';

// Taka per US dollar in poisha (৳122 is 12200). The range stops a typo from hiding or doubling the AI cost.
export const changeAiRateSchema = z.strictObject({
  poishaPerUsd: z.number().int().min(5000).max(50000),
  reason: supportReasonSchema,
});
export type ChangeAiRateInput = z.infer<typeof changeAiRateSchema>;

export type AiRateResponse = {
  poishaPerUsd: number;
  // False while no one has set it and the platform default is used.
  isSet: boolean;
  updatedAt: string | null;
};
