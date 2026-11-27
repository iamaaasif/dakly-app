'use client';
import { useWatch } from 'react-hook-form';

import { buildProductCardElement } from '@dakly/contracts/product-card';
import { takaInput, type ProductFormValues } from '@dakly/contracts/products';

import { ProductCardPreview } from './product-chat-preview';

// Not a real product id: the card only needs one to build its button payloads.
const PREVIEW_PRODUCT_ID = '00000000-0000-4000-8000-000000000000';

// The chat card of a product that is not saved yet, built from what is typed so far.
export function ProductLivePreview({ photoUrl }: { photoUrl: string | undefined }) {
  const [name, regular, sell, variants, tracked] = useWatch<
    ProductFormValues,
    ['name', 'pricePoisha', 'compareAtPricePoisha', 'variants', 'isStockTracked']
  >({ name: ['name', 'pricePoisha', 'compareAtPricePoisha', 'variants', 'isStockTracked'] });
  const paid = takaInput.safeParse(sell || regular);
  const price = paid.success ? paid.data : 0;
  const rows = variants?.length ? variants : [{ optionValues: {}, initialStock: 0 }];
  const card = buildProductCardElement({
    productId: PREVIEW_PRODUCT_ID,
    name: name?.trim() || 'Your product name',
    variants: rows.map((variant, index) => ({
      id: `preview-${index}`,
      title: Object.values(variant.optionValues ?? {}).join(' / ') || 'Default',
      pricePoisha: price,
      inStock: !tracked || Number(variant.initialStock) > 0,
    })),
  });
  return (
    <ProductCardPreview
      name={name || 'Product'}
      card={card}
      photoUrl={photoUrl}
      note="Updates as you type. Nothing is sent until the product is shown."
    />
  );
}
