'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import type { ProductResponse } from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';
import { Card } from '@dakly/ui/card';
import { QueryError } from '@dakly/ui/query-error';

import { useChangeProduct } from '../api/change-product';
import { useGetProduct } from '../api/get-product';
import type { QuickAddHandoff } from '../quick-add-handoff';
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
  return <LoadedProductPage product={data} />;
}

function LoadedProductPage({ product }: { product: ProductResponse }) {
  const router = useRouter();
  return (
    <ProductForm
      key={product.id}
      product={product}
      onSaved={() => router.refresh()}
      page={{
        title: product.name,
        backHref: '/products',
        photos: <ProductPhotos product={product} />,
        status: <StatusCard status={product.status} product={product} />,
      }}
    />
  );
}

type StatusCardProps = { status: 'active' | 'hidden'; product?: ProductResponse };

function StatusCard({ status, product }: StatusCardProps) {
  const change = useChangeProduct(product?.id ?? '');
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
