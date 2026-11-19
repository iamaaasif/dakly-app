import type { OrderReturnRisk } from '@dakly/contracts/orders';
import { Badge, type BadgeProps } from '@dakly/ui/badge';

const labels: Record<
  NonNullable<OrderReturnRisk>,
  { label: string; variant: BadgeProps['variant'] }
> = {
  new_customer: { label: 'New customer', variant: 'neutral' },
  good: { label: 'Good buyer', variant: 'success' },
  some_returns: { label: 'Some returns', variant: 'warning' },
  high: { label: 'High return risk', variant: 'danger' },
};

export type OrderRiskBadgeProps = { risk: OrderReturnRisk };

export function OrderRiskBadge({ risk }: OrderRiskBadgeProps) {
  if (risk === null) return null;
  return (
    <Badge
      variant={labels[risk].variant}
      className="rounded-full px-2.5 py-0.5 text-xs font-medium"
    >
      <span className="sr-only">Delivery recipient: </span>
      {labels[risk].label}
    </Badge>
  );
}
