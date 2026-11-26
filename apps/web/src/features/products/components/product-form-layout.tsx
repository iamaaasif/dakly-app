import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import type { ProductResponse } from '@dakly/contracts/products';
import { Card } from '@dakly/ui/card';

import {
  ProductDeliveryFields,
  ProductDescriptionFields,
  ProductNameFields,
  ProductPriceFields,
  ProductVisibilityFields,
} from './product-fields';
import { ProductBrandField, ProductCategoryField } from './product-list-fields';
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

function FieldCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="space-y-3.5">
      <h2 className="text-base font-semibold text-text">{title}</h2>
      {children}
    </Card>
  );
}

type ProductFormPageLayoutProps = {
  page: ProductFormPage;
  product?: ProductResponse;
  actions: ReactNode;
  serverError: ReactNode;
};

export function ProductFormPageLayout({
  page,
  product,
  actions,
  serverError,
}: ProductFormPageLayoutProps) {
  const productId = product?.id;
  return (
    <>
      <ProductPageHeader {...page} actions={actions} />
      <fieldset
        disabled={page.readOnly}
        className="grid min-w-0 items-start gap-4 px-4 pt-6 pb-24 md:px-8 md:pb-6 lg:grid-cols-[2fr_1fr] lg:grid-rows-[auto_1fr]"
      >
        <div className="min-w-0 space-y-4">
          {page.notice}
          <FieldCard title="Basics">
            <ProductNameFields productId={productId} onPage />
            <ProductDescriptionFields productId={productId} />
          </FieldCard>
        </div>
        <aside className="space-y-4 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          {page.status}
          <FieldCard title="Organisation">
            <ProductCategoryField />
            <ProductBrandField />
          </FieldCard>
          <FieldCard title="Delivery">
            <ProductDeliveryFields />
          </FieldCard>
          <FieldCard title="Where it appears">
            <ProductVisibilityFields />
          </FieldCard>
          {page.preview}
        </aside>
        <div className="min-w-0 space-y-4 lg:col-start-1 lg:row-start-2">
          <Card className="space-y-3.5">{page.photos}</Card>
          <FieldCard title="Price">
            <ProductPriceFields productId={productId} onPage />
          </FieldCard>
          <FieldCard title="Inventory">
            <ProductInventory />
          </FieldCard>
          <Card>
            <ProductVariantsCard product={product} readOnly={page.readOnly} />
          </Card>
          {serverError}
        </div>
      </fieldset>
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
