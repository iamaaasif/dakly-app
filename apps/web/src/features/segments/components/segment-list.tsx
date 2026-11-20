'use client';
import { Plus, Sparkles } from 'lucide-react';
import Link from 'next/link';

import type { SegmentListResponse } from '@dakly/contracts/segments';
import { Button } from '@dakly/ui/button';

import { SegmentRow } from './segment-row';

type SegmentListProps = {
  page: SegmentListResponse;
  cursor?: string;
  canEdit: boolean;
};

const linkClass = 'inline-flex min-h-10 items-center gap-2 text-action underline';

export function SegmentList({ page, cursor, canEdit }: SegmentListProps) {
  const editPrefix = cursor
    ? `/segments?cursor=${encodeURIComponent(cursor)}&edit=`
    : '/segments?edit=';
  return (
    <main className="space-y-6 p-4 md:p-8">
      <SegmentListHeader canEdit={canEdit} />
      <SegmentAiBanner />

      {page.items.length ? (
        <div className="space-y-3">
          {page.items.map((segment) => (
            <SegmentRow
              key={segment.id}
              segment={segment}
              editHref={`${editPrefix}${segment.id}`}
              canEdit={canEdit}
            />
          ))}
        </div>
      ) : (
        <p>No segments yet. Create one to group customers for a campaign.</p>
      )}
      <nav aria-label="Segment pages" className="flex gap-4">
        {cursor ? (
          <Link href="/segments" className={linkClass}>
            First page
          </Link>
        ) : null}
        {page.nextCursor ? (
          <Link
            href={`/segments?cursor=${encodeURIComponent(page.nextCursor)}`}
            className={linkClass}
          >
            Next page
          </Link>
        ) : null}
      </nav>
    </main>
  );
}

function SegmentListHeader({ canEdit }: { canEdit: boolean }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-bold">Segments</h1>
        <p className="text-sm text-text-muted">
          Groups of customers that update every day. Send each group the message that fits them.
        </p>
      </div>
      {canEdit ? (
        <Link
          href="/segments?edit=new"
          className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover"
        >
          <Plus aria-hidden="true" size={16} strokeWidth={2} />
          Create segment
        </Link>
      ) : null}
    </div>
  );
}

function SegmentAiBanner() {
  return (
    <div className="rounded-xl space-y-3 bg-inverse p-5 text-surface">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Sparkles aria-hidden="true" size={16} className="text-primary" />
        <span>Describe the customers you want to target</span>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          disabled
          aria-label="Describe customers for AI rule generation"
          placeholder="e.g. Customers who bought more than twice but haven't ordered in the last 45 days"
          className="flex-1 rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted"
        />
        <Button variant="primary" disabled className="shrink-0">
          Generate rules
        </Button>
      </div>
      <p className="text-xs text-text-subtle">
        Dakly turns your words into rules you can see and edit before saving.
      </p>
    </div>
  );
}
