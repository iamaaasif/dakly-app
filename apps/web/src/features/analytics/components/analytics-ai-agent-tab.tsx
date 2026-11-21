import { Bot, CircleCheck, HandHelping, ShoppingBag, Wallet, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import type { AnalyticsAiAgentResponse, AnalyticsView } from '@dakly/contracts/analytics';
import { formatCount, formatMoney } from '@dakly/contracts/money';
import { Card } from '@dakly/ui/card';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';

import { handoverReasonLabels } from '../analytics-labels';
import { useAnalyticsAiAgent } from '../api/analytics-overview';
import { AnalyticsChange } from './analytics-change';
import { formatWholeTaka } from '@/lib/format-money';

export function AnalyticsAiAgentTab({ view }: { view: AnalyticsView }) {
  const query = useAnalyticsAiAgent(view.period);
  if (query.isPending)
    return <Skeleton role="status" aria-label="Loading AI agent report" className="h-64 w-full" />;
  if (query.error)
    return (
      <QueryError
        message={query.error.message}
        onRetry={() => query.refetch()}
        retryLabel="Retry AI agent report"
      />
    );
  const data = query.data;
  if (data.chats.current === 0 && data.chats.previous === 0)
    return (
      <Card className="py-10 text-center text-text-muted">
        The AI agent has not replied in any chat in this period. Turn it on in Chats and its work
        shows here.
      </Card>
    );
  return (
    <section aria-label="AI agent" className="space-y-4">
      <p className="text-text-muted">
        What your AI agent did in chats, and what it cost. A chat counts when the AI wrote at least
        one reply in it.
      </p>
      <KeyFigures data={data} compare={view.compare} />
      <div className="grid gap-4 lg:grid-cols-2">
        <HowChatsEnded data={data} />
        <HandoverReasons data={data} />
      </div>
    </section>
  );
}

type Figure = {
  title: string;
  icon: LucideIcon;
  tone: string;
  value: string;
  change?: ReactNode;
  note: string;
};

function chatFigures(data: AnalyticsAiAgentResponse, compare: boolean): Figure[] {
  return [
    {
      title: 'Chats handled by AI',
      icon: Bot,
      tone: 'bg-ai-soft text-ai',
      value: formatCount(data.chats.current),
      change: compare && (
        <AnalyticsChange
          total={BigInt(data.chats.current)}
          previous={BigInt(data.chats.previous)}
        />
      ),
      note: 'Chats where the AI wrote a reply.',
    },
    {
      title: 'Resolved by AI',
      icon: CircleCheck,
      tone: 'bg-success-soft text-success',
      value:
        data.resolutionPercent.current === null
          ? 'Not enough yet'
          : `${data.resolutionPercent.current}%`,
      note: `${formatCount(data.resolved.current)} chats needed no person.${
        data.stillOpen > 0
          ? ` ${formatCount(data.stillOpen)} replied in the last day are left out.`
          : ''
      }`,
    },
    {
      title: 'Handed to your team',
      icon: HandHelping,
      tone: 'bg-warning-soft text-warning',
      value: formatCount(data.handedOver.current),
      change: compare && (
        <AnalyticsChange
          total={BigInt(data.handedOver.current)}
          previous={BigInt(data.handedOver.previous)}
          lowerIsBetter
        />
      ),
      note: 'Chats the AI passed to a person.',
    },
  ];
}

function moneyFigures(data: AnalyticsAiAgentResponse, compare: boolean): Figure[] {
  return [
    {
      title: 'Orders from AI chats',
      icon: ShoppingBag,
      tone: 'bg-info-soft text-info',
      value: formatCount(data.orders.current),
      change: compare && (
        <AnalyticsChange
          total={BigInt(data.orders.current)}
          previous={BigInt(data.orders.previous)}
        />
      ),
      note: `${formatWholeTaka(BigInt(data.sales.currentPoisha))} in orders the AI placed.`,
    },
    {
      title: 'AI cost',
      icon: Wallet,
      tone: 'bg-surface-muted text-text-muted',
      value: formatMoney(BigInt(data.cost.currentPoisha)),
      change: compare && (
        <AnalyticsChange
          total={BigInt(data.cost.currentPoisha)}
          previous={BigInt(data.cost.previousPoisha)}
          lowerIsBetter
        />
      ),
      note: 'What the AI’s replies cost Dakly, in taka.',
    },
  ];
}

function KeyFigures({ data, compare }: { data: AnalyticsAiAgentResponse; compare: boolean }) {
  return (
    <ul aria-label="Key figures" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {[...chatFigures(data, compare), ...moneyFigures(data, compare)].map(
        ({ title, icon: Icon, tone, value, change, note }) => (
          <li key={title}>
            <Card className="flex h-full min-w-0 flex-col gap-3 p-4">
              <div className="flex items-center gap-2">
                <span className={`flex size-8 items-center justify-center rounded-md ${tone}`}>
                  <Icon aria-hidden="true" size={16} strokeWidth={1.75} />
                </span>
                <h2 className="text-sm font-medium text-text-muted">{title}</h2>
              </div>
              <p className="text-2xl font-bold tabular-nums">{value}</p>
              {change}
              <p className="text-sm text-text-muted">{note}</p>
            </Card>
          </li>
        ),
      )}
    </ul>
  );
}

function HowChatsEnded({ data }: { data: AnalyticsAiAgentResponse }) {
  const rows = [
    { label: 'Resolved by AI', count: data.resolved.current, bar: 'bg-success' },
    { label: 'Answered by a person', count: data.answeredByPerson.current, bar: 'bg-info' },
    { label: 'Handed to your team', count: data.handedOver.current, bar: 'bg-warning' },
    { label: 'Replied in the last day', count: data.stillOpen, bar: 'bg-border-strong' },
  ];
  return (
    <Card className="space-y-4">
      <h2 className="text-lg font-semibold">How AI chats ended</h2>
      <BarList rows={rows} total={data.chats.current} />
    </Card>
  );
}

function HandoverReasons({ data }: { data: AnalyticsAiAgentResponse }) {
  const total = data.handoverReasons.reduce((sum, row) => sum + row.chats, 0);
  return (
    <Card className="space-y-4">
      <h2 className="text-lg font-semibold">Why chats were handed over</h2>
      {total === 0 ? (
        <p className="text-text-muted">No chat was handed over in this period.</p>
      ) : (
        <BarList
          total={total}
          rows={data.handoverReasons.map(({ reason, chats }) => ({
            label: handoverReasonLabels[reason] ?? 'Other',
            count: chats,
            bar: 'bg-warning',
          }))}
        />
      )}
    </Card>
  );
}

function BarList({
  rows,
  total,
}: {
  rows: { label: string; count: number; bar: string }[];
  total: number;
}) {
  return (
    <ul className="space-y-3">
      {rows.map(({ label, count, bar }) => (
        <li key={label} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3">
            <span>{label}</span>
            <span className="text-text-muted tabular-nums">{formatCount(count)}</span>
          </div>
          <div className="h-2 rounded-full bg-surface-muted">
            <div
              className={`h-2 rounded-full ${bar}`}
              style={{ width: `${total === 0 ? 0 : Math.round((count / total) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
