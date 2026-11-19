import { z } from 'zod';

import type { lifecycleStages } from './contacts';

const periodDays = { '7': 7, '30': 30, '90': 90 } as const;
export const dashboardQuerySchema = z.strictObject({
  period: z
    .enum(['7', '30', '90'])
    .default('30')
    .transform((value) => periodDays[value]),
});

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

type CountCard = { total: string; previous: string; points: string[] };
type SalesCard = { totalPoisha: string; previousPoisha: string; pointsPoisha: string[] };

export type DashboardResponse = {
  asOf: string;
  timeZone: string;
  cards: {
    orders?: CountCard;
    sales?: SalesCard;
    newCustomers?: CountCard;
    customersWhoCameBack?: CountCard;
  };
  lifecycle?: Record<Exclude<(typeof lifecycleStages)[number], 'none'>, number>;
};
