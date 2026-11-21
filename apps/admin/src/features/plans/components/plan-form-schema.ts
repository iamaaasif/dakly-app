import { z } from 'zod';

import { updatePlanSchema } from '@dakly/contracts/admin-plans';

// Staff type taka; the API takes poisha.
export const POISHA_PER_TAKA = 100;
export const planFormSchema = updatePlanSchema.extend({
  monthlyPricePoisha: z.number().min(0),
  yearlyPricePoisha: z.number().min(0),
});
export type PlanFormValues = z.infer<typeof planFormSchema>;
