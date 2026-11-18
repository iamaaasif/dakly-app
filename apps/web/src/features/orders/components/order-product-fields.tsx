import { useState } from 'react';
import type { FieldArrayWithId, UseFormRegister } from 'react-hook-form';

import type { OrderEditorValues } from '@dakly/contracts/orders';
import type { ProductResponse } from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';

import { formatMoney } from '@/lib/format-money';
import { useProductPages } from '@/lib/product-queries';

export type VariantChoice = {
  productId: string;
  label: string;
  price: number;
  stock: number | null;
};

type ProductFieldsProps = {
  fields: FieldArrayWithId<OrderEditorValues, 'items'>[];
  canBrowse: boolean;
  variants: Record<string, VariantChoice>;
  ids: string[];
  register: UseFormRegister<OrderEditorValues>;
  onChoose: (index: number, id: string, variant?: VariantChoice) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
};

export function OrderProductFields({
  fields,
  canBrowse,
  variants,
  ids,
  register,
  onChoose,
  onAdd,
  onRemove,
}: ProductFieldsProps) {
  const [search, setSearch] = useState('');
  const term = search.trim();
  const products = useProductPages(term.length >= 3 ? term : undefined);
  const choices = orderVariantChoices(products.data?.pages.flatMap((page) => page.items) ?? []);
  return (
    <fieldset className="space-y-2">
      <legend className="font-semibold">Products</legend>
      {canBrowse && (
        <label className="block">
          Search products
          <Input
            maxLength={200}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      )}
      {products.error ? (
        <p role="alert" className="text-danger">
          {products.error.message}
        </p>
      ) : null}
      {fields.map((field, index) => (
        <OrderProductLine
          key={field.id}
          {...{ choices, ids, index, variants, register, onChoose, canBrowse }}
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
      {canBrowse && (
        <Button variant="secondary" disabled={fields.length >= 100} onClick={onAdd}>
          Add product
        </Button>
      )}
    </fieldset>
  );
}

export function orderVariantChoices(products: ProductResponse[]) {
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

type OrderProductLineProps = Pick<
  ProductFieldsProps,
  'ids' | 'variants' | 'register' | 'onChoose' | 'canBrowse'
> & {
  choices: Record<string, VariantChoice>;
  index: number;
  onRemove?: ProductFieldsProps['onRemove'];
};

function OrderProductLine(props: OrderProductLineProps) {
  const { choices, canBrowse, ids, index, variants, register, onChoose, onRemove } = props;
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
              disabled={!canBrowse}
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
