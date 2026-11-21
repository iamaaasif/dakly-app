import type { DueSummaryResponse } from '@dakly/contracts/due-book';
import { formatMoney } from '@dakly/contracts/money';
import { Card } from '@dakly/ui/card';

type DueSummaryCardsProps = { summary: DueSummaryResponse };

export function DueSummaryCards({ summary }: DueSummaryCardsProps) {
  const { customersOwing, overdueCustomers } = summary;
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <SummaryCard
        label="Customers owe you"
        amount={formatMoney(summary.totalOwedPoisha)}
        tone="text-danger"
        detail={`${customersOwing} ${customersOwing === 1 ? 'customer' : 'customers'}`}
      />
      <SummaryCard
        label="Older than 30 days"
        amount={formatMoney(summary.overdueOwedPoisha)}
        tone="text-text"
        detail={`${overdueCustomers} ${overdueCustomers === 1 ? 'owes' : 'owe'} for over 30 days`}
      />
      <SummaryCard
        label="Collected this week"
        amount={formatMoney(summary.collectedLast7DaysPoisha)}
        tone="text-success"
      />
    </div>
  );
}

type SummaryCardProps = { label: string; amount: string; tone: string; detail?: string };

function SummaryCard({ label, amount, tone, detail }: SummaryCardProps) {
  return (
    <Card className="space-y-1 p-4">
      <p className="text-text-muted">{label}</p>
      <p className={`text-3xl font-bold ${tone}`}>{amount}</p>
      {detail && <p className="text-text-muted">{detail}</p>}
    </Card>
  );
}
