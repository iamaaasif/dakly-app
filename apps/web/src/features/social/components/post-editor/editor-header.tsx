import { ArrowLeft, Clock } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@dakly/ui/button';

type EditorHeaderProps = {
  title: string;
  backHref: string;
  pending: boolean;
  canQueue: boolean;
  queueLabel: string;
  onSaveDraft: () => void;
  onQueue: () => void;
};

export function EditorHeader({
  title,
  backHref,
  pending,
  canQueue,
  queueLabel,
  onSaveDraft,
  onQueue,
}: EditorHeaderProps) {
  return (
    <header className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-border bg-surface px-4 py-3 md:px-6">
      <Link
        href={backHref}
        aria-label="Back to My posts"
        className="inline-flex size-10 items-center justify-center rounded-md border border-input-border hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <ArrowLeft aria-hidden="true" size={20} strokeWidth={1.75} />
      </Link>
      <h1 className="min-w-0 flex-1 text-lg font-bold">{title}</h1>
      <div className="flex gap-3 max-sm:w-full [&>button]:max-sm:flex-1">
        <Button variant="secondary" disabled={pending} onClick={onSaveDraft}>
          Save draft
        </Button>
        <Button loading={pending} disabled={!canQueue} onClick={onQueue}>
          <Clock aria-hidden="true" size={16} strokeWidth={1.75} /> {queueLabel}
        </Button>
      </div>
    </header>
  );
}
