import { Clock, PackageCheck, ShieldAlert, type LucideIcon } from 'lucide-react';

import { formatMoney } from '@dakly/contracts/money';
import type { OrderAlerts } from '@dakly/contracts/orders';
import { cn } from '@dakly/ui/cn';
import { Skeleton } from '@dakly/ui/skeleton';

import { ordersSearch } from '../api/orders';
import type { OrdersNavigationQuery } from '../orders-url';
import { UrlLink } from '@/components/url-link';

type AlertKind = NonNullable<OrdersNavigationQuery['alert']>;
type Chip = { kind: AlertKind; icon: LucideIcon; tone: string; label: string; action: string };

type OrderAlertStripProps = {
  alerts: OrderAlerts | undefined;
  query: OrdersNavigationQuery;
};

// One slim row above the tabs. A chip opens that view; pressing it again goes back to the tabs.
export function OrderAlertStrip({ alerts, query }: OrderAlertStripProps) {
  if (!alerts)
    return (
      <div aria-hidden="true" className="flex gap-2">
        <Skeleton className="h-10 w-56 rounded-full" />
        <Skeleton className="hidden h-10 w-44 rounded-full sm:block" />
      </div>
    );
  const chips = alertChips(alerts);
  if (!chips.length) return null;
  return (
    <section
      aria-label="Order alerts"
      className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0"
    >
      {chips.map((chip) => (
        <AlertChip key={chip.kind} chip={chip} query={query} />
      ))}
    </section>
  );
}

function alertChips(alerts: OrderAlerts): Chip[] {
  const chips: (Chip | false)[] = [
    alerts.waiting > 0 && {
      kind: 'waiting',
      icon: Clock,
      tone: 'bg-warning-soft text-warning',
      label: `${orderCount(alerts.waiting)} waiting over 12 hours`,
      action: 'Confirm now',
    },
    alerts.highRisk > 0 && {
      kind: 'risk',
      icon: ShieldAlert,
      tone: 'bg-danger-soft text-danger',
      label: `${alerts.highRisk} high-risk ${alerts.highRisk === 1 ? 'order' : 'orders'}`,
      action: 'Review',
    },
    alerts.codAwaitingOrders > 0 && {
      kind: 'cod',
      icon: PackageCheck,
      tone: 'bg-info-soft text-info',
      label: `${formatMoney(BigInt(alerts.codAwaitingPoisha))} COD still with couriers`,
      action: 'Check',
    },
  ];
  return chips.filter((chip) => chip !== false);
}

function AlertChip({ chip, query }: { chip: Chip; query: OrdersNavigationQuery }) {
  const { kind, icon: Icon, tone, label, action } = chip;
  const open = query.alert === kind;
  const next = { alert: open ? undefined : kind, labelOrderIds: query.labelOrderIds };
  return (
    <UrlLink
      href={`/orders?${ordersSearch(next)}`}
      aria-current={open ? 'page' : undefined}
      aria-label={open ? `${label}, show all orders` : `${action}, ${label}`}
      className={cn(
        'group inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full px-3.5 text-sm font-medium whitespace-nowrap ring-1 ring-transparent ring-inset hover:ring-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-[current=page]:ring-current',
        tone,
      )}
    >
      <Icon className="shrink-0" size={15} strokeWidth={2} aria-hidden="true" />
      {label}
      <span
        aria-hidden="true"
        className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
      >
        ›
      </span>
    </UrlLink>
  );
}

function orderCount(count: number): string {
  return `${count} ${count === 1 ? 'order' : 'orders'}`;
}
