import { useState } from 'react';
import type { FieldArrayWithId, UseFormRegister } from 'react-hook-form';

import type { CreateOrderValues } from '@dakly/contracts/orders';
import type { ProductResponse } from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';
import { Input } from '@dakly/ui/input';

import { useProducts } from '@/features/products/api/products';
import { formatMoney } from '@/lib/format-money';

export type VariantChoice = { label: string; price: number; stock: number | null };

type ProductFieldsProps = {
  fields: FieldArrayWithId<CreateOrderValues, 'items'>[];
  variants: Record<string, VariantChoice>;
  ids: string[];
  register: UseFormRegister<CreateOrderValues>;
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
  const products = useProducts({ limit: 50, search: term.length >= 3 ? term : undefined });
  const choices = productChoices(products.data?.items ?? []);
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
      <Button variant="secondary" disabled={fields.length >= 100} onClick={onAdd}>
        Add product
      </Button>
    </fieldset>
  );
}

function productChoices(products: ProductResponse[]) {
  return Object.fromEntries(
    products
      .filter((product) => !product.readiness.includes('hidden'))
      .flatMap((product) =>
        product.variants
          .filter((variant) => variant.pricePoisha > 0)
          .map(
            (variant) =>
              [
                variant.id,
                {
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
  const variant = variants[id] ?? choices[id];
  const options = variant && !choices[id] ? { [id]: variant, ...choices } : choices;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_5rem_auto] items-start gap-2 rounded-md border border-border p-2">
      <label>
        Product and variant
        <select
          className="min-h-10 w-full rounded-md border border-input-border bg-surface px-2"
          aria-label={`Product and variant ${index + 1}`}
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
        {variant ? (
          <span className="block text-text-muted">
            {formatMoney(variant.price)}
            {variant.stock !== null ? ` · ${variant.stock} in stock` : ''}
          </span>
        ) : null}
      </label>
      <label>
        Qty
        <Input
          aria-label={`Quantity ${index + 1}`}
          type="number"
          {...register(`items.${index}.quantity`, { valueAsNumber: true })}
        />
      </label>
      {onRemove ? (
        <Button className="mt-6" variant="secondary" onClick={() => onRemove(index)}>
          Remove
        </Button>
      ) : null}
    </div>
  );
}
