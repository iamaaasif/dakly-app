import { formatCount } from '@dakly/contracts/money';

import { UrlLink } from '@/components/url-link';

const pagerButton =
  'inline-flex min-h-8 items-center rounded-md border border-input-border bg-surface px-3 text-sm font-medium text-text transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

type CustomerFooterProps = {
  shown: number;
  total: number;
  selected: number;
  firstHref?: string;
  nextHref?: string;
};

// Pages follow a cursor, so there is no page number; the footer says how many of the total are on screen.
export function CustomerFooter({
  shown,
  total,
  selected,
  firstHref,
  nextHref,
}: CustomerFooterProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-sm text-text-muted">
      <p className="tabular-nums">
        Showing {formatCount(shown)} of {formatCount(total)} customers
        {selected ? ` · ${formatCount(selected)} selected` : ''}
      </p>
      <nav aria-label="Customer pages" className="flex items-center gap-2">
        {firstHref ? (
          <UrlLink href={firstHref} className={pagerButton}>
            First page
          </UrlLink>
        ) : null}
        {nextHref ? (
          <UrlLink href={nextHref} className={pagerButton}>
            Next page
          </UrlLink>
        ) : null}
      </nav>
    </div>
  );
}
