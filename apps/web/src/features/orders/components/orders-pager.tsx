import { formatCount } from '@dakly/contracts/money';
import { TableFooter } from '@dakly/ui/table';

import type { usePageTrail } from '../use-page-trail';

type OrdersPagerProps = {
  shown: number;
  // The total, when nothing narrows the list.
  total?: number;
  trail: ReturnType<typeof usePageTrail>;
  nextCursor: number | null;
};

// A short list has no page controls, so a quiet shop sees only its rows.
export function OrdersPager({ shown, total, trail, nextCursor }: OrdersPagerProps) {
  if (trail.page === 1 && !nextCursor) return null;
  const summary =
    total === undefined
      ? `Showing ${formatCount(shown)}`
      : `Showing ${formatCount(shown)} of ${formatCount(total)}`;
  return (
    <TableFooter
      summary={summary}
      page={trail.page}
      pageCount={nextCursor ? trail.page + 1 : trail.page}
      onPrevious={trail.previous}
      onNext={() => nextCursor && trail.next(nextCursor)}
    />
  );
}
