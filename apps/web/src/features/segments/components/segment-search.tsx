'use client';
import { Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Input } from '@dakly/ui/input';
import { Label } from '@dakly/ui/label';

import { segmentsHref, type SegmentsView } from '../segments-view';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useUrlRouter } from '@/lib/use-url-query';

type SegmentSearchProps = { view: SegmentsView };

// Typing searches after a short pause and replaces the address, so Back does not step through
// every letter.
export function SegmentSearch({ view }: SegmentSearchProps) {
  const router = useUrlRouter();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(view.search ?? '');
  const settled = useDebouncedValue(text.trim() || undefined, 300);
  const latest = useRef(view);
  latest.current = view;

  useEffect(() => {
    if (settled !== latest.current.search)
      router.replace(segmentsHref({ ...latest.current, search: settled, cursor: undefined }));
  }, [settled, router]);

  // Back, Forward or "Clear search" changed the address: show it, unless the person is typing.
  useEffect(() => {
    if (document.activeElement !== input.current) setText(view.search ?? '');
  }, [view.search]);

  return (
    <div className="relative w-full sm:max-w-72">
      <Label htmlFor="segment-search" className="sr-only">
        Search segments
      </Label>
      <Search
        aria-hidden="true"
        size={16}
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-muted"
      />
      <Input
        ref={input}
        id="segment-search"
        type="search"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Search segments..."
        className="pl-9"
      />
    </div>
  );
}
