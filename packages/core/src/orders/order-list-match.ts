import { editableOrderStages, type OrderListQuery } from '@dakly/contracts/orders';
import { bdMobileSchema } from '@dakly/contracts/phone';

import { HOUR_MS } from '../platform/time';
import { stagesForOrderTab } from './order-stage';
import type { OrderMatch } from './orders.repository';

export function orderListMatch(
  { stage, ...filters }: Omit<OrderListQuery, 'cursor' | 'limit'>,
  { seeFullPhone, now, timeZone }: { seeFullPhone: boolean; now: Date; timeZone: string | null },
): OrderMatch {
  const parsedPhone = bdMobileSchema.safeParse(filters.search);
  return {
    ...filters,
    stages: listedStages(stage, filters.paymentStatus),
    phone: seeFullPhone && parsedPhone.success ? parsedPhone.data : undefined,
    overdueBefore: new Date(now.getTime() - 12 * HOUR_MS),
    timeZone,
  };
}

// Pending lists orders still waiting for the advance, so a cancelled one drops out of it.
function listedStages(
  stage: OrderListQuery['stage'],
  paymentStatus: OrderListQuery['paymentStatus'],
) {
  if (stage !== undefined) return stagesForOrderTab(stage);
  return paymentStatus === 'advance_requested' ? [...editableOrderStages] : undefined;
}
