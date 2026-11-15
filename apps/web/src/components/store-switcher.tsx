import { useInfiniteQuery } from '@tanstack/react-query';

import type { UserStorePage, SessionContext } from '@dakly/contracts/sessions';
import { Button } from '@dakly/ui/button';

import { apiRequest } from '@/lib/api-client';

type StoreSwitcherProps = { session: SessionContext; onSwitch: (storeId: string) => Promise<void> };
export function StoreSwitcher({ session, onSwitch }: StoreSwitcherProps) {
  const { shops, options } = useStoreOptions(session);
  const current = session.currentStore;
  if (!session.hasMemberships) return <p className="text-text-muted">No shop yet</p>;
  return (
    <div className="order-last w-full min-w-0 basis-full space-y-1 md:order-none md:w-auto md:max-w-sm md:flex-1 md:basis-auto">
      <label htmlFor="active-shop" className="block text-sm text-text-muted">
        Current shop
      </label>
      <select
        id="active-shop"
        value={session.currentStore?.storeId ?? ''}
        onChange={(event) => void onSwitch(event.target.value)}
        className="min-h-10 w-full min-w-0 rounded-md border border-input-border bg-surface px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <option value="" disabled>
          Choose a shop
        </option>
        {options.map((store) => (
          <option key={store.storeId} value={store.storeId}>
            {store.name}
          </option>
        ))}
      </select>
      {current ? <p className="font-semibold break-words">{current.name}</p> : null}
      {shops.isPending ? <p role="status">Loading shops…</p> : null}
      {shops.error ? (
        <p role="alert">
          Could not load shops.{' '}
          <Button variant="secondary" onClick={() => void shops.refetch()}>
            Retry shops
          </Button>
        </p>
      ) : null}
      {shops.hasNextPage ? (
        <Button
          variant="secondary"
          loading={shops.isFetchingNextPage}
          onClick={() => void shops.fetchNextPage()}
        >
          Load more shops
        </Button>
      ) : null}
    </div>
  );
}

function useStoreOptions(session: SessionContext) {
  const shops = useInfiniteQuery({
    queryKey: ['membership-picker', session.contextTag],
    initialPageParam: '',
    queryFn: ({ pageParam, signal }) =>
      apiRequest<UserStorePage>(`/me/stores?limit=50${pageParam ? `&after=${pageParam}` : ''}`, {
        signal,
        contextTag: session.contextTag,
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: session.hasMemberships,
    retry: false,
  });
  const options = shops.data?.pages.flatMap((page) => page.items) ?? [];
  const current = session.currentStore;
  if (current && !options.some((shop) => shop.storeId === current.storeId))
    options.unshift(current);
  return { shops, options };
}
