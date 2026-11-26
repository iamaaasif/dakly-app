'use client';
import { useState } from 'react';
import { useFormContext } from 'react-hook-form';

import { formatMoney } from '@dakly/contracts/money';
import type { CreateConversationOrderValues, OrderCatalogueProduct } from '@dakly/contracts/orders';
import { Button } from '@dakly/ui/button';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';

import { useOrderCatalogue } from '@/lib/order-entry/order-catalogue';

const selectClass =
  'min-h-inbox-field w-full rounded-md border border-input-border bg-surface px-2 text-sm aria-invalid:border-danger';

type Variant = OrderCatalogueProduct['variants'][number];

function variantLabel(variant: Variant, tracked: boolean) {
  if (!tracked) return `${variant.title} · ${formatMoney(variant.pricePoisha)}`;
  const stock = variant.available > 0 ? `only ${variant.available} left` : 'sold out';
  return `${variant.title} · ${stock}`;
}

export function MakeOrderProduct({ onPick }: { onPick: (variant: Variant | undefined) => void }) {
  const { setValue } = useFormContext<CreateConversationOrderValues>();
  const catalogue = useOrderCatalogue();
  const [productId, setProductId] = useState('');
  const products = catalogue.data?.pages.flatMap((page) => page.items) ?? [];
  const product = products.find((item) => item.id === productId);
  return (
    <>
      <FormField name="product" label="Product">
        {(props) => (
          <select
            {...props}
            className={selectClass}
            value={productId}
            onChange={(event) => {
              const next = products.find((item) => item.id === event.target.value);
              setProductId(event.target.value);
              // A product with one size needs no choice.
              const only = next?.variants.length === 1 ? next.variants[0] : undefined;
              setValue('items.0.variantId', only?.id ?? '');
              onPick(only);
            }}
          >
            <option value="">Choose a product</option>
            {products.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        )}
      </FormField>
      {catalogue.hasNextPage ? (
        <Button
          variant="secondary"
          type="button"
          disabled={catalogue.isFetchingNextPage}
          onClick={() => void catalogue.fetchNextPage()}
        >
          Show more products
        </Button>
      ) : null}
      <SizeAndQuantity product={product} onPick={onPick} />
    </>
  );
}

function SizeAndQuantity({
  product,
  onPick,
}: {
  product: OrderCatalogueProduct | undefined;
  onPick: (variant: Variant | undefined) => void;
}) {
  const { register, setValue, watch } = useFormContext<CreateConversationOrderValues>();
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_4rem] gap-2">
      <FormField name="items.0.variantId" label="Size">
        {(props) => (
          <select
            {...props}
            className={selectClass}
            disabled={!product}
            value={watch('items.0.variantId')}
            onChange={(event) => {
              setValue('items.0.variantId', event.target.value, { shouldValidate: true });
              onPick(product?.variants.find((variant) => variant.id === event.target.value));
            }}
          >
            <option value="">Choose size</option>
            {product?.variants.map((variant) => (
              <option
                key={variant.id}
                value={variant.id}
                disabled={product.isStockTracked && variant.available <= 0}
              >
                {variantLabel(variant, product.isStockTracked)}
              </option>
            ))}
          </select>
        )}
      </FormField>
      <FormField name="items.0.quantity" label="Qty">
        {(props) => (
          <Input
            {...props}
            type="number"
            className="min-h-inbox-field text-sm"
            min={1}
            {...register('items.0.quantity', { valueAsNumber: true })}
          />
        )}
      </FormField>
    </div>
  );
}
