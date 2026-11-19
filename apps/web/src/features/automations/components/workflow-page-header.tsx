import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

export function WorkflowPageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href="/automations"
          aria-label="Back to Automations"
          className="grid size-10 shrink-0 place-items-center rounded-md border border-input-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <ArrowLeft size={16} aria-hidden="true" />
        </Link>
        <div className="min-w-0">
          <h1 className="font-bold wrap-anywhere">{title}</h1>
          {subtitle && <p className="text-sm text-text-muted">{subtitle}</p>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </header>
  );
}
