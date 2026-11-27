import type { ComponentProps } from 'react';

import { cn } from './cn';

export type TableProps = ComponentProps<'table'>;

// Inside a TableCard the card draws the border, so the table passes bare.
export function Table({ className, bare = false, ...props }: TableProps & { bare?: boolean }) {
  return (
    <div
      className={cn(
        'w-full overflow-x-auto bg-surface',
        !bare && 'rounded-lg border border-border shadow-card',
      )}
    >
      <table {...props} className={cn('w-full text-sm text-text', className)} />
    </div>
  );
}

export type TableHeaderProps = ComponentProps<'thead'>;

export function TableHeader({ className, ...props }: TableHeaderProps) {
  return <thead {...props} className={cn('bg-surface-muted/60', className)} />;
}

export type TableBodyProps = ComponentProps<'tbody'>;

export function TableBody({ className, ...props }: TableBodyProps) {
  return <tbody {...props} className={cn('[&_tr:last-child]:border-0', className)} />;
}

export type TableRowProps = ComponentProps<'tr'>;

export function TableRow({ className, ...props }: TableRowProps) {
  return (
    <tr
      {...props}
      className={cn(
        'border-b border-border transition-colors hover:bg-surface-muted/60 data-[state=selected]:bg-surface-muted',
        className,
      )}
    />
  );
}

export type TableHeadProps = ComponentProps<'th'>;

export function TableHead({ className, ...props }: TableHeadProps) {
  return (
    <th
      {...props}
      className={cn(
        'h-10 px-3 text-left text-xs font-semibold tracking-wide text-text-muted uppercase',
        className,
      )}
    />
  );
}

export type TableCellProps = ComponentProps<'td'>;

export function TableCell({ className, ...props }: TableCellProps) {
  return <td {...props} className={cn('px-3 py-3 align-middle tabular-nums', className)} />;
}

export type TableCardProps = ComponentProps<'div'>;

export function TableCard({ className, ...props }: TableCardProps) {
  return (
    <div
      {...props}
      className={cn(
        'overflow-hidden rounded-lg border border-border bg-surface text-text shadow-card',
        className,
      )}
    />
  );
}

export type TableToolbarProps = ComponentProps<'div'>;

export function TableToolbar({ className, ...props }: TableToolbarProps) {
  return (
    <div
      {...props}
      className={cn('flex flex-wrap items-center gap-2 border-b border-border p-3', className)}
    />
  );
}

export type TableFooterProps = {
  summary: string;
  page: number;
  pageCount: number;
  onPrevious: () => void;
  onNext: () => void;
};

export function TableFooter({ summary, page, pageCount, onPrevious, onNext }: TableFooterProps) {
  const pagerButton =
    'min-h-8 rounded-md border border-input-border bg-surface px-3 text-sm font-medium text-text hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:text-text-subtle disabled:hover:bg-surface';
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-sm text-text-muted">
      <p className="tabular-nums">{summary}</p>
      <nav aria-label="Pages" className="flex items-center gap-2">
        <button type="button" className={pagerButton} disabled={page <= 1} onClick={onPrevious}>
          Previous
        </button>
        <span className="tabular-nums">
          Page {page} of {pageCount}
        </span>
        <button type="button" className={pagerButton} disabled={page >= pageCount} onClick={onNext}>
          Next
        </button>
      </nav>
    </div>
  );
}
