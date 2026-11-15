import type { PublicPlan } from '@dakly/contracts/billing';
import { Badge } from '@dakly/ui/badge';
import { Button } from '@dakly/ui/button';
import { Card } from '@dakly/ui/card';

import { formatMoney } from '@/lib/format-money';

export function PlanChoice({
  plan,
  cycle,
  recommended,
  pending,
  onChoose,
}: {
  plan: PublicPlan;
  cycle: 'monthly' | 'yearly';
  recommended: boolean;
  pending: boolean;
  onChoose: () => void;
}) {
  const price = cycle === 'monthly' ? plan.monthlyPricePoisha : plan.yearlyPricePoisha;
  const paymentRequired = price > 0 && plan.trialDays === 0;
  return (
    <Card>
      <h2 className="text-lg font-semibold">{plan.name}</h2>
      {recommended ? <Badge>Recommended</Badge> : null}
      <p className="my-3">
        {formatMoney(price)} / {cycle === 'monthly' ? 'month' : 'year'}
      </p>
      <ul className="mb-4 space-y-1">
        {Object.entries(plan.limits).map(([name, limit]) => (
          <li key={name}>
            {limitLabels[name] ?? name.replaceAll('_', ' ')}: {limit}
          </li>
        ))}
      </ul>
      {paymentRequired ? (
        <p>
          Payment is required for this plan. Checkout is not available yet. Choose another plan or
          return later.
        </p>
      ) : (
        <Button type="submit" loading={pending} onClick={onChoose}>
          {price > 0 ? `Start ${plan.trialDays}-day free trial` : `Start ${plan.name}`}
        </Button>
      )}
    </Card>
  );
}

// Plan limits are an open record, so a key added later falls back to its spaced name.
const limitLabels: Partial<Record<string, string>> = {
  customers: 'Customers',
  seats: 'Team seats',
  ai_conversation: 'AI conversations',
  ai_content: 'AI content',
  ai_ask: 'Ask Dakly AI',
};
