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
