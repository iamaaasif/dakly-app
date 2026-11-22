'use client';
import { Search } from 'lucide-react';
import { useState } from 'react';

import { cn } from '@dakly/ui/cn';
import { Input } from '@dakly/ui/input';

import {
  contentStudioHref,
  type ContentStudioView,
  type LibraryGroup,
} from '../content-studio-view';
import { UrlLink } from '@/components/url-link';
import { useUrlRouter } from '@/lib/use-url-query';

const groups: { id: LibraryGroup; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'social', label: 'Social posts' },
  { id: 'messages', label: 'Messages' },
  { id: 'products', label: 'Products' },
];

type LibraryFiltersProps = { view: ContentStudioView; counts: Record<LibraryGroup, number> };

export function LibraryFilters({ view, counts }: LibraryFiltersProps) {
  const router = useUrlRouter();
  const [text, setText] = useState(view.q);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <nav
        aria-label="Saved writing groups"
        className="flex flex-wrap gap-1 rounded-md bg-surface-muted p-1"
      >
        {groups.map(({ id, label }) => (
          <UrlLink
            key={id}
            href={contentStudioHref({ ...view, tab: 'library', group: id })}
            aria-current={view.group === id ? 'page' : undefined}
            className={cn(
              'rounded flex min-h-8 items-center gap-1.5 px-3 text-sm focus-visible:outline-2 focus-visible:outline-focus',
              view.group === id && 'shadow-sm bg-surface font-medium',
            )}
          >
            {label} <span className="text-text-muted">{counts[id]}</span>
          </UrlLink>
        ))}
      </nav>
      <div className="relative w-full sm:w-72">
        <Search
          aria-hidden="true"
          size={16}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-muted"
        />
        <Input
          type="search"
          aria-label="Search saved writing"
          placeholder="Search saved writing"
          className="pl-9"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            router.replace(
              contentStudioHref({ ...view, tab: 'library', q: event.target.value.trim() }),
            );
          }}
        />
      </div>
    </div>
  );
}
