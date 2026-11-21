'use client';
import Link from 'next/link';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@dakly/ui/tabs';

import { useShop } from '../api/shops';
import { ShopOverview } from './shop-overview';
import { ShopStatus } from './shop-status';
import { formatDate } from '@/lib/format-date';

// One tab for now; billing, AI and the danger zone add tabs here (ADM-4, ADM-5, ADM-7).
export function ShopDetailScreen({ storeId }: { storeId: string }) {
  const { data: shop, error, isPending } = useShop(storeId);
  return (
    <main className="mx-auto max-w-4xl space-y-5 p-4">
      <Link href="/shops" className="text-action underline">
        All shops
      </Link>
      {isPending ? <p role="status">Loading shop…</p> : null}
      {error ? <p role="alert">{error.message}</p> : null}
      {shop ? (
        <>
          <header className="space-y-1">
            <h1 className="text-xl font-semibold">{shop.name}</h1>
            <p className="flex flex-wrap items-center gap-2">
              <ShopStatus status={shop.status} />
              <span className="text-muted">Signed up {formatDate(shop.createdAt)}</span>
            </p>
            {shop.suspendedReason ? <p role="status">Suspended: {shop.suspendedReason}</p> : null}
          </header>
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
            </TabsList>
            <TabsContent value="overview">
              <ShopOverview shop={shop} />
            </TabsContent>
          </Tabs>
        </>
      ) : null}
    </main>
  );
}
