import type { ComponentProps } from 'react';

import { cn } from './cn';

export type TableProps = ComponentProps<'table'>;

export function Table({ className, ...props }: TableProps) {
  return (
    <div className="w-full overflow-x-auto rounded-lg border border-border bg-surface">
      <table {...props} className={cn('w-full text-sm text-text', className)} />
    </div>
  );
}

export type TableHeaderProps = ComponentProps<'thead'>;

export function TableHeader({ className, ...props }: TableHeaderProps) {
  return <thead {...props} className={cn('bg-surface-muted', className)} />;
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
      className={cn('border-b border-border data-[state=selected]:bg-surface-muted', className)}
    />
  );
}

export type TableHeadProps = ComponentProps<'th'>;

export function TableHead({ className, ...props }: TableHeadProps) {
  return (
    <th {...props} className={cn('h-10 px-3 text-left text-xs font-medium text-text', className)} />
  );
}

export type TableCellProps = ComponentProps<'td'>;

export function TableCell({ className, ...props }: TableCellProps) {
  return <td {...props} className={cn('px-3 py-2 align-middle', className)} />;
}
