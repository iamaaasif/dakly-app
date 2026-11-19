import { Clock, PackageCheck, ShieldAlert } from 'lucide-react';
import Link from 'next/link';

import type { OrderAlerts as Alerts } from '@dakly/contracts/orders';
import { Card } from '@dakly/ui/card';
import { cn } from '@dakly/ui/cn';

import { formatMoney } from '@/lib/format-money';

type OrderAlertsProps = { alerts: Alerts };

export function OrderAlerts({ alerts }: OrderAlertsProps) {
  const cards = [
    {
      show: alerts.waiting > 0,
      icon: Clock,
      className: 'border-warning/20 bg-warning-soft text-warning',
      title: `${orderCount(alerts.waiting)} waiting over 12 hours`,
      href: '/orders?alert=waiting',
      detail: 'Unconfirmed orders are the ones most likely to be fake or forgotten.',
      actionLabel: 'Confirm now',
      accessibleAction: 'Confirm now, orders waiting over 12 hours',
    },
    {
      show: alerts.highRisk > 0,
      icon: ShieldAlert,
      className: 'border-danger/20 bg-danger-soft text-danger',
      title: `${alerts.highRisk} high-risk ${alerts.highRisk === 1 ? 'order' : 'orders'}`,
      href: '/orders?alert=risk',
      detail: 'These customers returned most past parcels. Ask for a small advance first.',
      actionLabel: 'Review',
      accessibleAction: 'Review high-risk orders',
    },
    {
      show: alerts.codAwaitingOrders > 0,
      icon: PackageCheck,
      className: 'border-info/20 bg-info-soft text-info',
      title: `${formatMoney(BigInt(alerts.codAwaitingPoisha))} COD still with couriers`,
      href: '/orders?alert=cod',
      detail: `${alerts.codAwaitingOrders} delivered ${alerts.codAwaitingOrders === 1 ? 'order hasn’t' : 'orders haven’t'} been paid to you yet.`,
      actionLabel: 'Check',
      accessibleAction: 'Check COD still with couriers',
    },
  ].filter((card) => card.show);

  if (!cards.length) return null;
  return (
    <section aria-label="Order alerts" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map(
        ({ icon: Icon, className, title, detail, actionLabel, accessibleAction, href }) => (
          <Card key={href} className={cn('flex flex-col items-start gap-1 p-4', className)}>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Icon className="shrink-0" size={16} strokeWidth={1.75} aria-hidden="true" />
              {title}
            </h2>
            <p className="flex-1 text-sm text-text">{detail}</p>
            <Link
              href={href}
              aria-label={accessibleAction}
              className="inline-flex min-h-10 min-w-10 items-center gap-1 rounded-sm text-sm font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {actionLabel} <span aria-hidden="true">›</span>
            </Link>
          </Card>
        ),
      )}
    </section>
  );
}

function orderCount(count: number): string {
  return `${count} ${count === 1 ? 'order' : 'orders'}`;
}
