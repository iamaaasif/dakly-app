import { Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';

import type { OrderListQuery } from '@dakly/contracts/orders';
import { Input } from '@dakly/ui/input';

import { ordersSearch } from '../api/orders';

export function OrderSearch({ query }: { query: OrderListQuery }) {
  const router = useRouter();
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
      className="flex min-w-0 flex-1 flex-wrap items-end gap-2 sm:flex-none"
    >
      <div className="w-72 max-w-full">
        <label htmlFor="order-search" className="sr-only">
          Search orders
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-text-muted sm:left-3"
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
            className="min-h-11 pr-1 pl-8 text-sm placeholder:text-xs sm:min-h-10 sm:pr-3 sm:pl-9 sm:text-base sm:placeholder:text-base"
          />
        </div>
      </div>
      {query.search ? (
        <Link
          href={filtered()}
          className="inline-flex min-h-10 min-w-10 items-center text-action underline"
        >
          Clear search
        </Link>
      ) : null}
    </form>
  );
}
