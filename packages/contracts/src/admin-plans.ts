import { z } from 'zod';

import { type planLimitsSchema, type planKinds } from './billing';
import { supportReasonSchema } from './support';

const confirmed = z.literal(true, { error: 'Confirm the effect before saving' });

// New allowance names are lower snake case so code can read them as keys.
export const planLimitNameSchema = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/);
const editableLimitsSchema = z.record(planLimitNameSchema, z.number().int().nonnegative());

const planValuesShape = {
  name: z.string().trim().min(1).max(60),
  trialDays: z.number().int().min(0).max(90),
  monthlyPricePoisha: z.number().int().min(0),
  yearlyPricePoisha: z.number().int().min(0),
  limits: editableLimitsSchema,
  isPublic: z.boolean(),
  reason: supportReasonSchema,
  confirmed,
};

// The limits in the request replace the stored ones, so a name left out is removed.
export const updatePlanSchema = z.strictObject(planValuesShape);
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;

export const createPlanSchema = z.strictObject({
  code: z.string().regex(/^[a-z][a-z0-9_]{1,31}$/),
  ...planValuesShape,
});
export type CreatePlanInput = z.infer<typeof createPlanSchema>;

export const retirePlanSchema = z.strictObject({ reason: supportReasonSchema, confirmed });
export type RetirePlanInput = z.infer<typeof retirePlanSchema>;

export type AdminPlan = {
  code: string;
  kind: (typeof planKinds)[number];
  name: string;
  trialDays: number;
  monthlyPricePoisha: number;
  yearlyPricePoisha: number;
  limits: z.infer<typeof planLimitsSchema>;
  isPublic: boolean;
  retiredAt: string | null;
  updatedAt: string;
};
export type AdminPlansResponse = { plans: AdminPlan[] };
