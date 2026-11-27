import { z } from 'zod';

import { orderFiltersSchema } from './orders';

export const orderExportQuerySchema = orderFiltersSchema.safeExtend({
  format: z.enum(['csv', 'xlsx']),
});

export type OrderExportQuery = z.infer<typeof orderExportQuerySchema>;
