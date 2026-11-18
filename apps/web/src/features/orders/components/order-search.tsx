import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';

import type { OrderListQuery } from '@dakly/contracts/orders';
import { Button } from '@dakly/ui/button';
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
      className="grid w-fit max-w-full grid-cols-[minmax(0,18rem)_auto] items-center gap-2"
    >
      <label htmlFor="order-search" className="col-span-2 text-sm font-medium">
        Search orders
      </label>
      <Input
        type="search"
        name="search"
        id="order-search"
        placeholder="Name, phone or #"
        key={query.search}
        defaultValue={query.search}
        maxLength={120}
        className="min-w-0"
      />
      <Button type="submit" variant="secondary" aria-label="Search orders">
        Search
      </Button>
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
