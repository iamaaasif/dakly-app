import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, type ReactNode } from 'react';

import type { ProductResponse } from '@dakly/contracts/products';
import { ApiError } from '@dakly/ui/api-client';
import { Card } from '@dakly/ui/card';
import { QueryError } from '@dakly/ui/query-error';

import {
  ProductDeliveryFields,
  ProductDescriptionFields,
  ProductNameFields,
  ProductPriceFields,
  ProductVisibilityFields,
} from './product-fields';
import { ProductBrandField, ProductCategoryField } from './product-list-fields';
import { ProductNegotiationFields } from './product-negotiation-fields';
import { ProductInventory, ProductVariantsCard } from './product-variants-card';

export type ProductFormPage = {
  title: string;
  backHref: string;
  photos: ReactNode;
  status: ReactNode;
  preview?: ReactNode;
  notice?: ReactNode;
  readOnly?: boolean;
};

type ProductSaveErrorProps = {
  error?: { type?: string | number; message?: string } | Error | null;
  onReload?: () => void;
};

export function ProductSaveError({ error, onReload }: ProductSaveErrorProps) {
  if (!error?.message) return null;
  const code = productSaveErrorCode(error);
  return code === 'PRODUCT_CHANGED' && onReload ? (
    <ProductVersionConflict message={error.message} onReload={onReload} />
  ) : (
    <p role="alert" className="text-danger">
      {error.message}
    </p>
  );
}

function ProductVersionConflict({ message, onReload }: { message: string; onReload: () => void }) {
  const notice = useRef<HTMLDivElement>(null);
  useEffect(() => notice.current?.focus(), []);
  return (
    <div ref={notice} tabIndex={-1} className="scroll-mt-24">
      <QueryError message={message} onRetry={onReload} retryLabel="Reload" />
    </div>
  );
}

function productSaveErrorCode(error: ProductSaveErrorProps['error']) {
  if (error instanceof ApiError) return error.code;
  return error && 'type' in error ? error.type : undefined;
}

function FieldCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="space-y-3.5">
      <h2 className="text-base font-semibold text-text">{title}</h2>
      {children}
    </Card>
  );
}

function PageSidebar({ page }: { page: ProductFormPage }) {
  return (
    <fieldset
      disabled={page.readOnly}
      className="min-w-0 space-y-4 max-lg:order-3 lg:col-start-2 lg:row-span-2 lg:row-start-1"
    >
      {page.status}
      <FieldCard title="Organisation">
        <ProductCategoryField />
        <ProductBrandField />
      </FieldCard>
      <FieldCard title="Packaging">
        <ProductDeliveryFields />
      </FieldCard>
      <FieldCard title="Where it appears">
        <ProductVisibilityFields />
      </FieldCard>
      {page.preview}
    </fieldset>
  );
}

type ProductFormPageLayoutProps = {
  page: ProductFormPage;
  product?: ProductResponse;
  actions: ReactNode;
  saveError: ProductSaveErrorProps;
  onOptionDraftChange: (editing: boolean) => void;
};

export function ProductFormPageLayout(props: ProductFormPageLayoutProps) {
  const { page, product, actions, saveError, onOptionDraftChange } = props;
  const productId = product?.id;
  const conflict = productSaveErrorCode(saveError.error) === 'PRODUCT_CHANGED';
  return (
    <>
      <ProductPageHeader {...page} actions={actions} />
      <div className="grid min-w-0 items-start gap-4 px-4 pt-6 pb-24 md:px-8 md:pb-6 lg:grid-cols-[2fr_1fr] lg:grid-rows-[auto_1fr]">
        <fieldset disabled={page.readOnly} className="min-w-0 space-y-4">
          {page.notice}
          {conflict ? <ProductSaveError {...saveError} /> : null}
          <Card className="space-y-4">
            <ProductNameFields productId={productId} onPage />
            <ProductDescriptionFields productId={productId} />
          </Card>
        </fieldset>
        <PageSidebar page={page} />
        <div className="min-w-0 space-y-4 max-lg:order-2 lg:col-start-1 lg:row-start-2">
          <fieldset disabled={page.readOnly} className="min-w-0 space-y-4">
            <Card className="space-y-3.5">{page.photos}</Card>
            <FieldCard title="Price">
              <ProductPriceFields productId={productId} onPage />
            </FieldCard>
            {page.readOnly ? null : (
              <Card role="group" aria-label="Price negotiation">
                <ProductNegotiationFields />
              </Card>
            )}
            <FieldCard title="Inventory management">
              <ProductInventory />
            </FieldCard>
          </fieldset>
          <Card>
            <ProductVariantsCard
              product={product}
              readOnly={page.readOnly}
              onOptionDraftChange={onOptionDraftChange}
            />
          </Card>
          {conflict ? null : <ProductSaveError {...saveError} />}
        </div>
      </div>
    </>
  );
}

type ProductPageHeaderProps = Pick<ProductFormPage, 'title' | 'backHref' | 'readOnly'> &
  Pick<ProductFormPageLayoutProps, 'actions'>;

function ProductPageHeader({ title, backHref, actions, readOnly }: ProductPageHeaderProps) {
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-border bg-background px-4 py-3 md:px-8">
      <Link
        href={backHref}
        aria-label="Back to products"
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <ArrowLeft aria-hidden="true" size={20} />
      </Link>
      <h1 className="min-w-0 flex-1 truncate text-lg font-semibold text-text">{title}</h1>
      {/* On a phone the save buttons sit in a bar at the bottom so the title keeps its room. */}
      {readOnly ? null : (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background px-4 py-3 md:static md:z-auto md:border-0 md:bg-transparent md:p-0">
          {actions}
        </div>
      )}
    </div>
  );
}
