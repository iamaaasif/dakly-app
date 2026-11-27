import { useInfiniteQuery } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { useId } from 'react';

import type { UserStorePage, SessionContext } from '@dakly/contracts/sessions';
import { Button } from '@dakly/ui/button';

import { storeSwitcherKeys } from './store-switcher-keys';
import { apiRequest } from '@/lib/api-client';
import { initialsOf } from '@/lib/initials';

type StoreSwitcherProps = {
  session: SessionContext;
  onSwitch: (storeId: string) => Promise<void>;
};
export function StoreSwitcher({ session, onSwitch }: StoreSwitcherProps) {
  const { shops, options } = useStoreOptions(session);
  const selectId = useId();
  const current = session.currentStore;
  if (!session.hasMemberships) return <p className="px-2 text-sm text-text-muted">No shop yet</p>;
  return (
    <div className="relative w-full min-w-0">
      <div className="shadow-sm relative flex min-h-10 items-center gap-2.5 rounded-lg border border-border bg-surface px-2 hover:border-border-strong has-[select:focus-visible]:outline-2 has-[select:focus-visible]:outline-offset-2 has-[select:focus-visible]:outline-focus">
        <span
          aria-hidden="true"
          className="grid size-7 shrink-0 place-items-center rounded-md bg-inverse text-xs font-semibold text-on-primary"
        >
          {current ? initialsOf(current.name) : ''}
        </span>
        <div className="min-w-0 flex-1">
          <label htmlFor={selectId} className="block text-xs leading-4 text-text-muted">
            Current shop
          </label>
          <p aria-hidden="true" className="truncate text-sm leading-5 font-semibold">
            {current?.name ?? 'Choose a shop'}
          </p>
        </div>
        <ChevronDown aria-hidden="true" size={16} className="shrink-0 text-text-muted" />
        <select
          id={selectId}
          value={session.currentStore?.storeId ?? ''}
          onChange={(event) => void onSwitch(event.target.value)}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
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
      </div>
      <ShopListStatus shops={shops} />
    </div>
  );
}

function ShopListStatus({ shops }: { shops: ReturnType<typeof useStoreOptions>['shops'] }) {
  if (!shops.isPending && !shops.error && !shops.hasNextPage) return null;
  return (
    <div className="shadow-md absolute top-full left-0 z-40 mt-1 space-y-2 rounded-lg border border-border bg-surface p-2 text-sm">
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
    queryKey: storeSwitcherKeys.stores(session.contextTag),
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
