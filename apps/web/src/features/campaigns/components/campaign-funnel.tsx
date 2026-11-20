import { formatCount } from '@dakly/contracts/money';

type FunnelStep = { label: string; count: number };

// The bar is decoration: the number beside it is the figure.
export function CampaignFunnel({ steps }: { steps: FunnelStep[] }) {
  const top = Math.max(steps[0]?.count ?? 0, 1);
  return (
    <ol className="space-y-3">
      {steps.map(({ label, count }) => (
        <li key={label} className="grid grid-cols-[7rem_minmax(0,1fr)_4rem] items-center gap-3">
          <span className="text-sm">{label}</span>
          <span aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-surface-muted">
            <span
              className="block h-full rounded-full bg-action"
              style={{ width: `${Math.min(100, (count / top) * 100)}%` }}
            />
          </span>
          <span className="text-right text-sm font-semibold tabular-nums">
            {formatCount(count)}
          </span>
        </li>
      ))}
    </ol>
  );
}
