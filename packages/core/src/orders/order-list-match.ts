import type { OrderListQuery, OrderStage } from '@dakly/contracts/orders';
import { bdMobileSchema } from '@dakly/contracts/phone';

import { HOUR_MS } from '../platform/time';
import { stagesForOrderTab } from './order-stage';

export type OrderMatch = Omit<OrderListQuery, 'stage' | 'cursor' | 'limit'> & {
  stages?: OrderStage[];
  timeZone: string | null;
  phone?: string;
  overdueBefore: Date;
};

export function orderListMatch(
  { stage, ...filters }: Omit<OrderListQuery, 'cursor' | 'limit'>,
  { seeFullPhone, now, timeZone }: { seeFullPhone: boolean; now: Date; timeZone: string | null },
): OrderMatch {
  const parsedPhone = bdMobileSchema.safeParse(filters.search);
  return {
    ...filters,
    stages: stage === undefined ? undefined : stagesForOrderTab(stage),
    phone: seeFullPhone && parsedPhone.success ? parsedPhone.data : undefined,
    overdueBefore: new Date(now.getTime() - 12 * HOUR_MS),
    timeZone,
  };
}
