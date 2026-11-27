import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from './cn';

export type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-6 py-16 text-center', className)}>
      <span
        aria-hidden="true"
        className="grid size-12 place-items-center rounded-full bg-primary-soft text-action"
      >
        <Icon size={22} strokeWidth={1.75} />
      </span>
      <h2 className="text-md font-semibold text-text">{title}</h2>
      {description ? <p className="max-w-md text-sm text-text-muted">{description}</p> : null}
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
