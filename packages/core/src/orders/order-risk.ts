import type { OrderReturnRisk } from '@dakly/contracts/orders';

export function returnRisk(outcome?: { parcels: number; returned: number }): OrderReturnRisk {
  if (!outcome) return 'new_customer';
  if (outcome.parcels < 2) return null;
  if (2 * outcome.returned >= outcome.parcels) return 'high';
  return 5 * outcome.returned <= outcome.parcels ? 'good' : 'some_returns';
}
