import { useState } from 'react';
import type { FieldArrayWithId, UseFormRegister } from 'react-hook-form';

import type { OrderEditorValues, OrderCatalogueProduct } from '@dakly/contracts/orders';
import { Button } from '@dakly/ui/button';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';

import { useOrderCatalogue } from '../api/order-catalogue';
import { formatMoney } from '@/lib/format-money';

export type VariantChoice = {
  productId: string;
  label: string;
  price: number;
  stock: number | null;
};

type ProductFieldsProps = {
  fields: FieldArrayWithId<OrderEditorValues, 'items'>[];
  variants: Record<string, VariantChoice>;
  ids: string[];
  register: UseFormRegister<OrderEditorValues>;
  onChoose: (index: number, id: string, variant?: VariantChoice) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
};

export function OrderProductFields({
  fields,
  variants,
  ids,
  register,
  onChoose,
  onAdd,
  onRemove,
}: ProductFieldsProps) {
  const [search, setSearch] = useState('');
  const term = search.trim();
  const products = useOrderCatalogue(term.length >= 3 ? term : undefined);
  const choices = orderVariantChoices(products.data?.pages.flatMap((page) => page.items) ?? []);
  return (
    <fieldset className="space-y-2">
      <legend className="font-semibold">Products</legend>
      <label className="block">
        Search products
        <Input maxLength={200} value={search} onChange={(event) => setSearch(event.target.value)} />
      </label>
      {products.error ? (
        <p role="alert" className="text-danger">
          {products.error.message}
        </p>
      ) : null}
      {fields.map((field, index) => (
        <OrderProductLine
          key={field.id}
          {...{ choices, ids, index, variants, register, onChoose }}
          onRemove={fields.length > 1 ? onRemove : undefined}
        />
      ))}
      {products.hasNextPage && (
        <Button
          variant="secondary"
          loading={products.isFetchingNextPage}
          onClick={() => void products.fetchNextPage()}
        >
          Load more products
        </Button>
      )}
      <Button variant="secondary" disabled={fields.length >= 100} onClick={onAdd}>
        Add product
      </Button>
    </fieldset>
  );
}

export function orderVariantChoices(products: OrderCatalogueProduct[]) {
  return Object.fromEntries(
    products.flatMap((product) =>
      product.variants
        .filter((variant) => variant.pricePoisha > 0)
        .map(
          (variant) =>
            [
              variant.id,
              {
                productId: product.id,
                label: variant.isDefault ? product.name : `${product.name} · ${variant.title}`,
                price: variant.pricePoisha,
                stock: product.isStockTracked ? variant.available : null,
              },
            ] as const,
        ),
    ),
  );
}

function OrderProductLine({
  choices,
  ids,
  index,
  variants,
  register,
  onChoose,
  onRemove,
}: Pick<ProductFieldsProps, 'ids' | 'variants' | 'register' | 'onChoose'> & {
  choices: Record<string, VariantChoice>;
  index: number;
  onRemove?: ProductFieldsProps['onRemove'];
}) {
  const id = ids[index] ?? '';
  const variant = variants[id];
  const options = variant ? { ...choices, [id]: variant } : choices;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_5rem_auto] items-start gap-2 rounded-md border border-border p-2">
      <div>
        <FormField name={`items.${index}.variantId`} label={`Product and variant ${index + 1}`}>
          {(props) => (
            <select
              {...props}
              className="min-h-10 w-full rounded-md border border-input-border bg-surface px-2 aria-invalid:border-danger"
              value={id}
              onChange={(event) => onChoose(index, event.target.value, choices[event.target.value])}
            >
              <option value="">Choose a product</option>
              {Object.entries(options).map(([optionId, option]) => (
                <option
                  key={optionId}
                  value={optionId}
                  disabled={optionId !== id && ids.includes(optionId)}
                >
                  {option.label}
                </option>
              ))}
            </select>
          )}
        </FormField>
        {variant && <OrderVariantPrice variant={variant} />}
      </div>
      <FormField name={`items.${index}.quantity`} label={`Quantity ${index + 1}`}>
        {(props) => (
          <Input
            {...props}
            type="number"
            {...register(`items.${index}.quantity`, { valueAsNumber: true })}
          />
        )}
      </FormField>
      {onRemove ? (
        <Button className="mt-6" variant="secondary" onClick={() => onRemove(index)}>
          Remove
        </Button>
      ) : null}
    </div>
  );
}

function OrderVariantPrice({ variant }: { variant: VariantChoice }) {
  return (
    <p className="text-text-muted">
      {formatMoney(variant.price)}
      {variant.stock !== null ? ` · ${variant.stock} in stock` : ''}
    </p>
  );
}
