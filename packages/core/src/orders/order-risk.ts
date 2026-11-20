import type { OrderParcelHistory, OrderReturnRisk } from '@dakly/contracts/orders';

function returnRisk(outcome?: { parcels: number; returned: number }): OrderReturnRisk {
  if (!outcome) return 'new_customer';
  if (outcome.parcels < 2) return null;
  if (2 * outcome.returned >= outcome.parcels) return 'high';
  return 5 * outcome.returned <= outcome.parcels ? 'good' : 'some_returns';
}

export function orderRiskFields(outcome?: OrderParcelHistory) {
  return {
    returnRisk: returnRisk(outcome),
    parcelHistory: { parcels: outcome?.parcels ?? 0, returned: outcome?.returned ?? 0 },
  };
}
