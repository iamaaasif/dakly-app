import type { AdminShopStatus } from '@dakly/contracts/admin-shops';
import { Badge, type BadgeProps } from '@dakly/ui/badge';

const statusVariants: Record<AdminShopStatus, NonNullable<BadgeProps['variant']>> = {
  trialing: 'info',
  active: 'success',
  past_due: 'warning',
  read_only: 'warning',
  cancelled: 'neutral',
  suspended: 'danger',
  closing: 'danger',
};

export function statusLabel(status: AdminShopStatus): string {
  return status === 'trialing' ? 'Trial' : status.replaceAll('_', ' ');
}

export function ShopStatus({ status }: { status: AdminShopStatus }) {
  return <Badge variant={statusVariants[status]}>{statusLabel(status)}</Badge>;
}
