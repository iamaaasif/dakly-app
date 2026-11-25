'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useFormContext } from 'react-hook-form';

import type { AssistantProductDraft } from '@dakly/contracts/assistant';
import type { ProductResponse } from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';
import { Card } from '@dakly/ui/card';
import { FormField } from '@dakly/ui/form-field';
import { QueryError } from '@dakly/ui/query-error';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dakly/ui/select';

import { useChangeProduct } from '../api/change-product';
import { useGetProduct } from '../api/get-product';
import { assistantFilledFields } from '../product-assistant-draft';
import type { QuickAddHandoff } from '../quick-add-handoff';
import { ChangeStockDialog } from './change-stock-dialog';
import { ProductChatPreview } from './product-chat-preview';
import { ProductForm } from './product-form';
import { ProductPhotos } from './product-photos';
import { ProductReadiness } from './product-readiness';
import { ProductsLoading } from './products-loading';
import { useSessionContext } from '@/lib/session-context';

type NewProductPageProps = { initial?: QuickAddHandoff; assistantDraft?: AssistantProductDraft };

export function NewProductPage({ initial, assistantDraft }: NewProductPageProps) {
  const router = useRouter();
  return (
    <ProductForm
      initial={initial}
      assistantDraft={assistantDraft}
      onSaved={(product) => router.replace(`/products/${product.id}`)}
      page={{
        title: 'New product',
        backHref: '/products',
        notice: assistantDraft ? <AssistantNotice draft={assistantDraft} /> : undefined,
        photos: <p className="text-sm text-text-muted">Save the product to add photos.</p>,
        status: <StatusCard />,
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
      key={`${data.id}:${saves}:${data.variants.map((variant) => variant.onHand).join(',')}`}
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
            <StatusCard product={product} />
            <ProductChatPreview product={product} />
          </>
        ),
      }}
    />
  );
}

function AssistantNotice({ draft }: { draft: AssistantProductDraft }) {
  return (
    <p role="status" className="rounded-lg border border-ai-soft bg-ai-soft p-3 text-sm text-text">
      <span className="font-semibold">Filled in by Dakly AI:</span>{' '}
      {assistantFilledFields(draft).join(', ')}. Check each one. Nothing is saved until you press
      Save.
    </p>
  );
}

type StatusCardProps = { product?: ProductResponse };

function StatusCard({ product }: StatusCardProps) {
  const change = useChangeProduct(product?.id ?? '');
  const form = useFormContext<{ status: 'active' | 'hidden' }>();
  const [changingStock, setChangingStock] = useState(false);
  const status = product ? product.status : form.watch('status');
  // A saved product changes at once; a new one waits for Save.
  const choose = (next: string) => {
    const value = next === 'active' ? 'active' : 'hidden';
    if (product) change.mutate({ status: value });
    else form.setValue('status', value, { shouldDirty: true });
  };
  return (
    <Card className="space-y-3">
      <FormField name="status" label="Status">
        {(control) => (
          <Select value={status} onValueChange={choose} disabled={change.isPending}>
            <SelectTrigger {...control}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="hidden">Hidden</SelectItem>
            </SelectContent>
          </Select>
        )}
      </FormField>
      <p className="text-xs text-text-muted">
        Hidden products are not offered to customers in chats, the shop or the order link.
      </p>
      {product ? (
        <>
          <ProductReadiness product={product} />
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
