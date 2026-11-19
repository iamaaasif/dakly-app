import { Clock, PackageCheck, ShieldAlert } from 'lucide-react';
import Link from 'next/link';

import type { OrderAlerts as Alerts } from '@dakly/contracts/orders';
import { cn } from '@dakly/ui/cn';

import { formatMoney } from '@/lib/format-money';

export type OrderAlertsProps = { alerts: Alerts };

export function OrderAlerts({ alerts }: OrderAlertsProps) {
  const cards = [
    {
      show: alerts.waiting > 0,
      icon: Clock,
      className: 'border-warning/20 bg-warning-soft text-warning',
      title: `${orderCount(alerts.waiting)} waiting over 12 hours`,
      href: '/orders?alert=waiting',
      detail: 'Unconfirmed orders are the ones most likely to be fake or forgotten.',
      actionLabel: 'Confirm now ›',
    },
    {
      show: alerts.highRisk > 0,
      icon: ShieldAlert,
      className: 'border-danger/20 bg-danger-soft text-danger',
      title: `${alerts.highRisk} high-risk ${alerts.highRisk === 1 ? 'order' : 'orders'}`,
      href: '/orders?alert=risk',
      detail: 'These customers returned most past parcels. Ask for a small advance first.',
      actionLabel: 'Review ›',
    },
    {
      show: alerts.codAwaitingOrders > 0,
      icon: PackageCheck,
      className: 'border-info/20 bg-info-soft text-info',
      title: `${formatMoney(BigInt(alerts.codAwaitingPoisha))} COD still with couriers`,
      href: '/orders?alert=cod',
      detail: `${alerts.codAwaitingOrders} delivered ${alerts.codAwaitingOrders === 1 ? 'order hasn’t' : 'orders haven’t'} been paid to you yet.`,
      actionLabel: 'Check ›',
    },
  ].filter((card) => card.show);

  if (!cards.length) return null;
  return (
    <section aria-label="Order alerts" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map(({ icon: Icon, className, title, detail, actionLabel, href }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            'rounded-xl hover:shadow-xs flex min-h-11 flex-col justify-between border p-4 transition-colors',
            className,
          )}
        >
          <div>
            <div className="flex items-center gap-2">
              <Icon className="shrink-0" size={16} strokeWidth={2} aria-hidden="true" />
              <span className="text-sm font-semibold underline decoration-transparent hover:decoration-current">
                {title}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-text">{detail}</p>
          </div>
          <span className="mt-3 text-xs font-semibold">{actionLabel}</span>
        </Link>
      ))}
    </section>
  );
}

function orderCount(count: number): string {
  return `${count} ${count === 1 ? 'order' : 'orders'}`;
}
