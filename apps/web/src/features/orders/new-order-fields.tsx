import type { ReactNode } from 'react';

import { Card } from '@dakly/ui/card';
import { cn } from '@dakly/ui/cn';

export function OrderCard({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('space-y-4 p-5', className)}>
      <div className="flex min-h-6 items-center justify-between gap-2">
        <h2 className="text-md font-semibold text-text">{title}</h2>
        {action}
      </div>
      {children}
    </Card>
  );
}

// A value the system filled in stays tinted until staff change it, so they can check it.
export const filledClass = 'border-primary bg-primary-soft';

export function BdtPrefix({ children }: { children: ReactNode }) {
  return (
    <span className="flex min-h-10 min-w-0 items-center gap-2 rounded-md border border-input-border bg-surface px-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus">
      <span aria-hidden="true" className="text-text-muted">
        BDT
      </span>
      {children}
    </span>
  );
}
