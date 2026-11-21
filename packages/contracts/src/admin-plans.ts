import { z } from 'zod';

import { planLimitsSchema, type planKinds } from './billing';
import { supportReasonSchema } from './support';

export const updatePlanSchema = z.strictObject({
  name: z.string().trim().min(1).max(60),
  trialDays: z.number().int().min(0).max(90),
  monthlyPricePoisha: z.number().int().min(0),
  yearlyPricePoisha: z.number().int().min(0),
  limits: planLimitsSchema,
  isPublic: z.boolean(),
  reason: supportReasonSchema,
  confirmed: z.literal(true, { error: 'Confirm the effect before saving' }),
});
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;

export type AdminPlan = {
  code: string;
  kind: (typeof planKinds)[number];
  name: string;
  trialDays: number;
  monthlyPricePoisha: number;
  yearlyPricePoisha: number;
  limits: z.infer<typeof planLimitsSchema>;
  isPublic: boolean;
  updatedAt: string;
};
export type AdminPlansResponse = { plans: AdminPlan[] };
