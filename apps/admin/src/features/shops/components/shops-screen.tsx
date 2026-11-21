'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import { Button } from '@dakly/ui/button';
import { Card } from '@dakly/ui/card';

import { useShops } from '../api/shops';
import { ShopFilters } from './shop-filters';
import { ShopCards, ShopsTable } from './shops-table';

export function ShopsScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const shops = useShops(params.toString());
  const nextCursor = shops.data?.cursor;
  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4">
      <Link href="/" className="text-action underline">
        Staff home
      </Link>
      <h1 className="text-xl font-semibold">Shops</h1>
      <Card>
        <ShopFilters />
      </Card>
      {shops.isPending ? <p role="status">Loading shops…</p> : null}
      {shops.error ? <p role="alert">{shops.error.message}</p> : null}
      {shops.data?.rows.length === 0 ? <p>No shops match.</p> : null}
      {shops.data?.rows.length ? (
        <>
          <div className="hidden md:block">
            <ShopsTable rows={shops.data.rows} />
          </div>
          <div className="md:hidden">
            <ShopCards rows={shops.data.rows} />
          </div>
        </>
      ) : null}
      {nextCursor ? (
        <Button
          onClick={() => {
            const query = new URLSearchParams(params);
            query.set('cursor', nextCursor);
            router.push(`/shops?${query}`);
          }}
        >
          Next page
        </Button>
      ) : null}
    </main>
  );
}
