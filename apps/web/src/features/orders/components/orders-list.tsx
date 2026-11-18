import Link from 'next/link';

import type { OrderListQuery, OrderListResponse } from '@dakly/contracts/orders';

import { ordersSearch } from '../api/orders';
import { OrderRow } from './order-row';

type OrdersListProps = { page: OrderListResponse; query: OrderListQuery };

export function OrdersList({ page, query }: OrdersListProps) {
  const pageHref = (cursor?: number) => `/orders?${ordersSearch({ ...query, cursor })}`;

  return (
    <>
      {page.items.length === 0 && (
        <p className="rounded-lg border border-border bg-surface p-6">No orders on this page.</p>
      )}
      <ul
        hidden={page.items.length === 0}
        className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface"
      >
        {page.items.map((order) => (
          <OrderRow key={order.id} order={order} />
        ))}
      </ul>
      <nav aria-label="Order pages" className="flex gap-4">
        {query.cursor ? (
          <Link href={pageHref()} className="text-action underline">
            First page
          </Link>
        ) : null}
        {page.nextCursor ? (
          <Link href={pageHref(page.nextCursor)} className="text-action underline">
            Next page
          </Link>
        ) : null}
      </nav>
    </>
  );
}
