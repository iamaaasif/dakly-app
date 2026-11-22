'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { ProductResponse } from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';
import { Card } from '@dakly/ui/card';
import { QueryError } from '@dakly/ui/query-error';

import { useChangeProduct } from '../api/change-product';
import { useGetProduct } from '../api/get-product';
import type { QuickAddHandoff } from '../quick-add-handoff';
import { ChangeStockDialog } from './change-stock-dialog';
import { ProductChatPreview } from './product-chat-preview';
import { ProductForm } from './product-form';
import { ProductPhotos } from './product-photos';
import { ProductReadiness } from './product-readiness';
import { ProductsLoading } from './products-loading';
import { useSessionContext } from '@/lib/session-context';

export function NewProductPage({ initial }: { initial?: QuickAddHandoff }) {
  const router = useRouter();
  return (
    <ProductForm
      initial={initial}
      onSaved={(product) => router.replace(`/products/${product.id}`)}
      page={{
        title: 'New product',
        backHref: '/products',
        photos: <p className="text-sm text-text-muted">Save the product to add photos.</p>,
        status: <StatusCard status="hidden" />,
      }}
    />
  );
}

export function EditProductPage({ productId }: { productId: string }) {
  const { data, error, isPending, refetch } = useGetProduct(productId);
  const [saves, setSaves] = useState(0);
  const { data: session } = useSessionContext();
  if (error)
    return (
      <div className="p-6">
        <QueryError message={error.message} onRetry={() => refetch()} retryLabel="Retry product" />
      </div>
    );
  if (isPending) return <ProductsLoading />;
  if (!session?.currentStore?.canEditProducts)
    return (
      <p role="status" className="p-6">
        You can view products but not edit them. <Link href="/products">Back to products</Link>.
      </p>
    );
  // After a save the form starts again from what the server holds, so new rows have their ids.
  return (
    <LoadedProductPage
      key={`${data.id}:${saves}`}
      product={data}
      onSaved={async () => {
        await refetch();
        setSaves((count) => count + 1);
      }}
    />
  );
}

type LoadedProductPageProps = { product: ProductResponse; onSaved: () => Promise<void> };

function LoadedProductPage({ product, onSaved }: LoadedProductPageProps) {
  return (
    <ProductForm
      product={product}
      onSaved={(_saved, failedStock) => {
        if (!failedStock.length) void onSaved();
      }}
      page={{
        title: product.name,
        backHref: '/products',
        photos: <ProductPhotos product={product} />,
        status: (
          <>
            <StatusCard status={product.status} product={product} />
            <ProductChatPreview product={product} />
          </>
        ),
      }}
    />
  );
}

type StatusCardProps = { status: 'active' | 'hidden'; product?: ProductResponse };

function StatusCard({ status, product }: StatusCardProps) {
  const change = useChangeProduct(product?.id ?? '');
  const [changingStock, setChangingStock] = useState(false);
  return (
    <Card className="space-y-3">
      <h2 className="text-base font-semibold text-text">Status</h2>
      <p className="text-sm text-text">{status === 'hidden' ? 'Hidden' : 'Shown'}</p>
      <p className="text-xs text-text-muted">
        Hidden products are not offered to customers in chats, the shop or the order link.
      </p>
      {product ? (
        <>
          <ProductReadiness product={product} />
          <Button
            type="button"
            variant="secondary"
            loading={change.isPending}
            onClick={() => change.mutate({ status: status === 'hidden' ? 'active' : 'hidden' })}
          >
            {status === 'hidden' ? 'Show product' : 'Hide product'}
          </Button>
          {product.isStockTracked ? (
            <Button type="button" variant="secondary" onClick={() => setChangingStock(true)}>
              Change stock
            </Button>
          ) : null}
          {changingStock ? (
            <ChangeStockDialog product={product} onClose={() => setChangingStock(false)} />
          ) : null}
          {change.error ? (
            <p role="alert" className="text-danger">
              {change.error.message}
            </p>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}
