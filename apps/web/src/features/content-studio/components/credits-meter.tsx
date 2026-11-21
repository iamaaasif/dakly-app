import { useContentCredits } from '../api/get-credits';
import { creditsLeftLabel } from './credits-left-label';
import { formatShortDate } from '@/lib/format-date';

export function CreditsMeter() {
  const { data } = useContentCredits();
  if (!data) return null;
  const percent = data.allowance ? Math.round((data.remaining / data.allowance) * 100) : 0;
  return (
    <div className="w-full space-y-1.5 md:w-60 md:shrink-0">
      <p className="text-sm font-semibold">{creditsLeftLabel(data.remaining)}</p>
      <div
        role="progressbar"
        aria-label="AI credits left"
        aria-valuemin={0}
        aria-valuemax={data.allowance}
        aria-valuenow={data.remaining}
        className="h-1.5 overflow-hidden rounded-full bg-surface-muted"
      >
        <div className="h-full rounded-full bg-action" style={{ width: `${percent}%` }} />
      </div>
      <p className="text-xs text-text-muted">Resets {formatShortDate(data.resetsAt)}</p>
    </div>
  );
}
