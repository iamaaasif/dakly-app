import { ChartLine, Send, ShoppingBag, Tag, Target, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import type { AnalyticsOverviewResponse, AnalyticsView } from '@dakly/contracts/analytics';
import { formatCount } from '@dakly/contracts/money';
import { Card } from '@dakly/ui/card';
import { cn } from '@dakly/ui/cn';

import { AnalyticsChange } from './analytics-change';
import { formatWholeTaka } from '@/lib/format-money';

// Fewer than 20 people is too few to say a figure moved (feature doc, states and edge cases).
const TOO_FEW_PEOPLE = 20n;

type FigureProps = {
  title: string;
  icon: LucideIcon;
  tone: string;
  value: string;
  change?: ReactNode;
  note: string;
};

export function AnalyticsKeyFigures({
  data,
  view,
}: {
  data: AnalyticsOverviewResponse;
  view: AnalyticsView;
}) {
  return (
    <section aria-label="Key figures" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {figuresFor(data, view.compare).map(({ title, icon: Icon, tone, value, change, note }) => (
        <Card key={title} className="flex min-w-0 flex-col gap-3 p-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <span className={cn('shrink-0 rounded-md p-2', tone)}>
              <Icon aria-hidden="true" className="size-4" strokeWidth={1.75} />
            </span>
            {title}
          </h2>
          <p className="text-xl font-bold tabular-nums">{value}</p>
          {change}
          <p className="mt-auto text-sm text-text-muted">{note}</p>
        </Card>
      ))}
    </section>
  );
}

function figuresFor({ marketing, messages }: AnalyticsOverviewResponse, compare: boolean) {
  const delta = (
    current: number | string,
    previous: number | string,
    options: { minimum?: bigint; lowerIsBetter?: boolean } = {},
  ) =>
    compare && <AnalyticsChange total={BigInt(current)} previous={BigInt(previous)} {...options} />;
  const { revenue, orders } = marketing;
  const people = messages.tappedPeople;
  const figures: FigureProps[] = [
    {
      title: 'Money from marketing',
      icon: ShoppingBag,
      tone: 'bg-primary-soft text-action-hover',
      value: formatWholeTaka(BigInt(revenue.currentPoisha)),
      change: delta(revenue.currentPoisha, revenue.previousPoisha),
      note: 'Orders placed after a message or post, including returns up to today.',
    },
    {
      title: 'Orders',
      icon: ChartLine,
      tone: 'bg-ai-soft text-ai',
      value: formatCount(orders.current),
      change: delta(orders.current, orders.previous),
      note: 'Orders Dakly could link to your marketing.',
    },
    {
      title: 'Messages sent',
      icon: Send,
      tone: 'bg-info-soft text-info',
      value: formatCount(messages.sent.current),
      change: delta(messages.sent.current, messages.sent.previous),
      note:
        messages.deliveredPercent === null
          ? 'No messages were sent in this period.'
          : `${messages.deliveredPercent}% reached the customer's phone or inbox.`,
    },
    {
      title: 'Tapped your link',
      icon: Target,
      tone: 'bg-success-soft text-success',
      value: messages.tapPercent === null ? '0%' : `${messages.tapPercent}%`,
      change: delta(people.current, people.previous, { minimum: TOO_FEW_PEOPLE }),
      note: `${formatCount(people.current)} ${people.current === 1 ? 'person' : 'people'} opened your link or button.`,
    },
    {
      title: 'Cost of messages',
      icon: Tag,
      tone: 'bg-surface-muted text-text',
      value: formatWholeTaka(BigInt(messages.cost.currentPoisha)),
      change: delta(messages.cost.currentPoisha, messages.cost.previousPoisha, {
        lowerIsBetter: true,
      }),
      note: 'Messenger messages are free.',
    },
  ];
  return figures;
}
