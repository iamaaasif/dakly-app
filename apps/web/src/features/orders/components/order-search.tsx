import { Search } from 'lucide-react';
import type { FormEvent } from 'react';

import { Input } from '@dakly/ui/input';

import { ordersSearch } from '../api/orders';
import type { OrdersNavigationQuery } from '../orders-url';
import { UrlLink } from '@/components/url-link';
import { useUrlRouter } from '@/lib/use-url-query';

export function OrderSearch({ query }: { query: OrdersNavigationQuery }) {
  const router = useUrlRouter();
  const filtered = (search?: string) =>
    `/orders?${ordersSearch({ ...query, search, cursor: undefined })}`;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const search = String(new FormData(event.currentTarget).get('search') ?? '').trim();
    router.push(filtered(search || undefined));
  }

  return (
    <form
      role="search"
      onSubmit={submit}
      className="flex w-full flex-wrap items-end gap-2 sm:w-auto"
    >
      <div className="w-full max-w-full sm:w-72">
        <label htmlFor="order-search" className="mb-1 block text-sm font-medium">
          Search orders
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-muted"
            size={16}
            aria-hidden="true"
          />
          <Input
            type="search"
            name="search"
            id="order-search"
            placeholder="Name, phone or order number"
            key={query.search}
            defaultValue={query.search}
            maxLength={120}
            className="pl-9"
          />
        </div>
      </div>
      {query.search ? (
        <UrlLink
          href={filtered()}
          className="inline-flex min-h-10 min-w-10 items-center text-action underline"
        >
          Clear search
        </UrlLink>
      ) : null}
    </form>
  );
}
