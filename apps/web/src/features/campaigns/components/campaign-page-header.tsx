import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Button } from '@dakly/ui/button';
import { cn } from '@dakly/ui/cn';

export function CampaignPageHeader({
  title,
  subtitle,
  onBack,
  backDisabled,
  action,
}: {
  title: string;
  subtitle: string;
  onBack?: () => void;
  backDisabled?: boolean;
  action?: ReactNode;
}) {
  const backIcon = <ArrowLeft aria-hidden="true" size={20} strokeWidth={1.75} />;
  return (
    <header
      className={cn(
        'grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3',
        action && 'sm:grid-cols-[auto_minmax(0,1fr)_auto]',
      )}
    >
      {onBack ? (
        <Button
          aria-label="Back to channels"
          variant="secondary"
          className="row-span-2 px-2"
          onClick={onBack}
          disabled={backDisabled}
        >
          {backIcon}
        </Button>
      ) : (
        <Link
          href="/campaigns"
          aria-label="Back to campaigns"
          className="row-span-2 inline-flex size-10 items-center justify-center rounded-md text-action hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {backIcon}
        </Link>
      )}
      <h1 className="text-xl font-bold break-words">{title}</h1>
      <p className="col-start-2 mt-1 text-text-muted">{subtitle}</p>
      {action && (
        <div className="col-start-2 mt-3 sm:col-start-3 sm:row-start-1 sm:mt-0">{action}</div>
      )}
    </header>
  );
}
