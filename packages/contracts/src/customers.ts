import { z } from 'zod';

import { bdMobileSchema } from './phone';

export const createCustomerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: bdMobileSchema,
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export type CustomerResponse = {
  id: string;
  name: string;
  phone: string;
  createdAt: string;
};
