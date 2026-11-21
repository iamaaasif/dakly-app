'use client';
import type { ContentPiece } from '@dakly/contracts/content';
import { Button } from '@dakly/ui/button';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';

import { usePieces } from '../api/get-pieces';
import { groupKinds, type ContentStudioView, type LibraryGroup } from '../content-studio-view';
import { LibraryCard } from './library-card';
import { LibraryFilters } from './library-filters';
import { useSessionContext } from '@/lib/session-context';

export function LibraryTab({ view }: { view: ContentStudioView }) {
  const pieces = usePieces();
  const { data: session } = useSessionContext();
  if (pieces.error)
    return (
      <QueryError
        message={pieces.error.message}
        onRetry={() => void pieces.refetch()}
        retryLabel="Retry Library"
      />
    );
  if (!pieces.data) return <LibraryLoading />;
  const all = pieces.data.pages.flatMap(({ items }) => items);
  const search = view.q.toLowerCase();
  const shown = all.filter(
    ({ kind, body }) =>
      (view.group === 'all' || groupKinds[view.group].includes(kind)) &&
      body.toLowerCase().includes(search),
  );
  return (
    <div className="space-y-4">
      <LibraryFilters view={view} counts={countGroups(all)} />
      {shown.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-text-muted">
          {all.length === 0
            ? 'Nothing saved yet. Write something in Create and save it here.'
            : 'No saved writing matches.'}
        </p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((piece) => (
            <li key={piece.id} className="flex">
              <LibraryCard piece={piece} canEdit={Boolean(session?.currentStore?.canEditSocial)} />
            </li>
          ))}
        </ul>
      )}
      {pieces.hasNextPage && (
        <Button
          variant="secondary"
          loading={pieces.isFetchingNextPage}
          onClick={() => void pieces.fetchNextPage()}
        >
          Load more
        </Button>
      )}
    </div>
  );
}

function LibraryLoading() {
  return (
    <div role="status" className="grid gap-4 md:grid-cols-3">
      <span className="sr-only">Loading Library</span>
      <Skeleton className="h-56 w-full" />
      <Skeleton className="h-56 w-full" />
      <Skeleton className="h-56 w-full" />
    </div>
  );
}

function countGroups(items: ContentPiece[]): Record<LibraryGroup, number> {
  const count = (group: Exclude<LibraryGroup, 'all'>) =>
    items.filter(({ kind }) => groupKinds[group].includes(kind)).length;
  return {
    all: items.length,
    social: count('social'),
    messages: count('messages'),
    products: count('products'),
  };
}
