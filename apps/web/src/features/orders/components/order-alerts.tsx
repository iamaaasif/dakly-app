import { Clock, PackageCheck, ShieldAlert } from 'lucide-react';
import Link from 'next/link';

import type { OrderAlerts as Alerts } from '@dakly/contracts/orders';

import { formatMoney } from '@/lib/format-money';

export function OrderAlerts({ alerts }: { alerts: Alerts }) {
  const cards = [
    {
      show: alerts.waiting > 0,
      icon: Clock,
      className: 'bg-warning-soft text-warning',
      title: `${orderCount(alerts.waiting)} waiting over 12 hours`,
      href: '/orders?alert=waiting',
      detail: 'These orders still need confirmation.',
    },
    {
      show: alerts.highRisk > 0,
      icon: ShieldAlert,
      className: 'bg-danger-soft text-danger',
      title: `${alerts.highRisk} high-risk ${alerts.highRisk === 1 ? 'order' : 'orders'}`,
      href: '/orders?alert=risk',
      detail: 'These orders have no advance recorded.',
    },
    {
      show: alerts.codAwaitingOrders > 0,
      icon: PackageCheck,
      className: 'bg-info-soft text-info',
      title: `${formatMoney(BigInt(alerts.codAwaitingPoisha))} COD still with couriers`,
      href: '/orders?alert=cod',
      detail: `${orderCount(alerts.codAwaitingOrders)} awaiting COD collection.`,
    },
  ].filter((card) => card.show);

  if (!cards.length) return null;
  return (
    <section aria-label="Order alerts" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map(({ icon: Icon, className, title, detail, href }) => (
        <Link
          key={href}
          href={href}
          className={`flex min-h-10 items-start gap-3 rounded-lg p-4 ${className}`}
        >
          <Icon className="mt-0.5 shrink-0" size={16} strokeWidth={1.75} aria-hidden="true" />
          <div>
            <p className="font-semibold underline">{title}</p>
            <p className="mt-1 text-text">{detail}</p>
          </div>
        </Link>
      ))}
    </section>
  );
}

function orderCount(count: number): string {
  return `${count} ${count === 1 ? 'order' : 'orders'}`;
}
